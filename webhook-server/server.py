"""FastAPI webhook server: Supabase-backed phone pools and Daily room pool."""

import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

import aiohttp
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger

from services.room_pool_service import get_room_pool
from schemas import AgentRequest, DailyRoomConfig
from server_utils import (
    DialoutRequest,
    create_daily_room,
    dialout_request_from_request,
    return_room_to_pool,
    start_bot,
)
from services.phone_pool import PhonePool, get_pool_statistics, refresh_phone_pools
from services.secret_validator import validate_setup_secret
from services.supabase_client import get_supabase_client, verify_auth_token

_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH)

logger.remove()
logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "INFO"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: Supabase, aiohttp session, phone pools, Daily room pool."""
    logger.info("Checking Supabase connectivity...")
    supabase_client = get_supabase_client()

    if not supabase_client:
        logger.error(
            "Failed to connect to Supabase. Cannot initialize phone pools. Shutting down server."
        )
        raise RuntimeError(
            "Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        )

    app.state.http_session = aiohttp.ClientSession()
    logger.info("Created shared HTTP session")

    logger.info("Initializing phone pools from Supabase...")
    phone_pool = PhonePool()
    pool_init_success = await phone_pool.initialize()

    if not pool_init_success:
        logger.error("Failed to initialize phone pools. Shutting down server.")
        await app.state.http_session.close()
        raise RuntimeError("Failed to initialize phone pools from Supabase")

    app.state.phone_pool = phone_pool

    pool_size = int(os.getenv("ROOM_POOL_SIZE", "3"))
    room_pool = get_room_pool(pool_size=pool_size)

    try:
        await room_pool.initialize(app.state.http_session, for_dialout=True)
        logger.info(
            f"Room pool initialized with {pool_size} pre-created rooms for outbound calls"
        )
    except Exception as e:
        logger.error(f"Failed to initialize room pool: {e}")
        await app.state.http_session.close()
        raise RuntimeError(f"Failed to initialize room pool: {e}") from e

    logger.info("Webhook server ready for incoming calls")

    yield

    if hasattr(app.state, "http_session"):
        await app.state.http_session.close()
        logger.info("Closed shared HTTP session")


app = FastAPI(
    title="Voice Agent Webhook",
    description="Bridge between the bot service and the web frontend.",
    version="0.1.0",
    lifespan=lifespan,
)

_static_dir = Path(__file__).resolve().parent / "static"
if _static_dir.is_dir():
    app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Outbound call server is running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/refresh-phone-pool")
async def refresh_phone_pool(request: Request) -> JSONResponse:
    logger.info("Received phone pool refresh request")

    auth_header = request.headers.get("Authorization")
    auth_info = await verify_auth_token(auth_header)
    logger.info(f"Phone pool refresh requested by user: {auth_info.get('user_id')}")

    try:
        result = await refresh_phone_pools(request.app.state.phone_pool)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Error refreshing phone pools: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to refresh phone pools: {e}") from e


@app.get("/pool/stats")
async def get_pool_stats(request: Request) -> JSONResponse:
    auth_header = request.headers.get("Authorization")
    await verify_auth_token(auth_header)

    try:
        result = await get_pool_statistics(request.app.state.phone_pool, get_room_pool())
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Error getting pool stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get pool statistics") from e


@app.post("/validate-secret")
async def validate_secret(request: Request) -> JSONResponse:
    """Validate admin setup secret.

    Expects JSON body: ``{"secret": "the-secret-to-validate"}``.

    Returns:
        JSONResponse: ``{"valid": true|false}`` (and optional ``error``).
    """
    try:
        data = await request.json()
        if not isinstance(data, dict):
            logger.warning("validate_secret: JSON body must be an object, got %s", type(data).__name__)
            return JSONResponse(
                {"valid": False, "error": "Invalid JSON body"},
                status_code=400,
            )

        raw_secret = data.get("secret", "")
        # JSON null yields None; missing key uses ""
        if raw_secret is None:
            logger.info("validate_secret: secret is null")
            return JSONResponse(
                {"valid": False, "error": "No secret provided"},
                status_code=400,
            )
        if isinstance(raw_secret, str) and not raw_secret.strip():
            logger.info("validate_secret: empty secret string")
            return JSONResponse(
                {"valid": False, "error": "No secret provided"},
                status_code=400,
            )

        secret = raw_secret

        is_valid = validate_setup_secret(secret)
        return JSONResponse({"valid": is_valid})

    except Exception as e:
        logger.exception("validate_secret: unexpected error: {}", e)
        return JSONResponse(
            {"valid": False, "error": "Validation failed"},
            status_code=500,
        )


@app.post("/return-room")
async def return_room(request: Request):
    data = await request.json()
    room = DailyRoomConfig(room_url=data["room_url"], token=data["token"])
    await return_room_to_pool(room)
    logger.info(f"Room returned to pool: {data['room_url']}")
    return {"status": "success"}


@app.post("/outbound-call")
async def handle_dial_out_request(request: Request) -> JSONResponse:
    logger.debug("Received outbound call request")

    auth_header = request.headers.get("Authorization")
    auth_info = await verify_auth_token(auth_header)
    user_id = auth_info.get("user_id")
    org_id = auth_info.get("org_id")
    logger.info(f"Call request from user: {user_id}, org: {org_id}")

    data = await request.json()
    caller_phone = data.get("caller_phone")
    phone_number = data.get("phone_number")

    if "phone_number" in data and "dialout_settings" not in data:
        from server_utils import DialoutSettings

        phone_number = data.get("phone_number")
        if not phone_number:
            raise HTTPException(status_code=400, detail="phone_number is required")
        if not phone_number.startswith("+"):
            phone_number = f"+{phone_number}"
        dialout_request = DialoutRequest(
            dialout_settings=DialoutSettings(phone_number=phone_number),
            caller_phone=caller_phone,
        )
    else:
        dialout_request = await dialout_request_from_request(request)
        if caller_phone:
            dialout_request.caller_phone = caller_phone

    phone_number = dialout_request.dialout_settings.phone_number
    if not phone_number.startswith("+"):
        phone_number = f"+{phone_number}"
        dialout_request.dialout_settings.phone_number = phone_number

    logger.info(f"Initiating outbound call to {phone_number}")

    room_pool = get_room_pool()

    daily_room_config: DailyRoomConfig | None = None
    room_source = "pool"

    try:
        daily_room_config = await room_pool.get_room(
            request.app.state.http_session, for_dialout=True
        )
        logger.info(f"Using room from pool: {daily_room_config.room_url}")
    except Exception as e:
        logger.warning(f"No room available in pool, creating new room: {e}")
        room_source = "new"
        try:
            daily_room_config = await create_daily_room(
                dialout_request, request.app.state.http_session
            )
            logger.info(f"Created new room for org {org_id}: {daily_room_config.room_url}")
        except HTTPException:
            raise
        except Exception as create_error:
            logger.error(f"Failed to create room: {create_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to get or create room: {create_error}",
            ) from create_error

    if not daily_room_config:
        raise HTTPException(status_code=500, detail="Failed to obtain a room")

    agent_request = AgentRequest(
        room_url=daily_room_config.room_url,
        token=daily_room_config.token,
        dialout_settings=dialout_request.dialout_settings,
        caller_phone=dialout_request.caller_phone,
        call_id=f"call_{org_id}_{int(time.time())}",
        org_id=org_id,
    )

    try:
        await start_bot(agent_request, request.app.state.http_session)
        logger.info(f"Bot started successfully for call to {phone_number}")
    except Exception as e:
        logger.error(f"Error starting bot: {e}")
        if room_source == "pool":
            await room_pool.return_room(daily_room_config)
        raise HTTPException(status_code=500, detail=f"Failed to start bot: {e}") from e

    return JSONResponse(
        {
            "status": "success",
            "room_url": daily_room_config.room_url,
            "token": daily_room_config.token,
            "phone_number": phone_number,
            "call_id": agent_request.call_id,
            "org_id": org_id,
            "room_source": room_source,
        }
    )


if __name__ == "__main__":
    port = int(os.getenv("WEBHOOK_TELEPHONY_PORT", "8080"))
    logger.info(f"Starting webhook server on port {port}")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
