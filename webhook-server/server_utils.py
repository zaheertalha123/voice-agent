"""Webhook helpers (dial-out parsing, Daily room, bot stub)."""

import os

import aiohttp
from fastapi import HTTPException, Request
from loguru import logger

from services.room_pool_service import create_ephemeral_daily_room, get_room_pool
from schemas import AgentRequest, DailyRoomConfig, DialoutRequest, DialoutSettings


async def dialout_request_from_request(request: Request) -> DialoutRequest:
    """Parse JSON body into ``DialoutRequest``."""
    data = await request.json()
    if not data.get("dialout_settings"):
        raise HTTPException(
            status_code=400, detail="Missing 'dialout_settings' in the request body"
        )
    try:
        return DialoutRequest.model_validate(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request data: {e}") from e


async def create_daily_room(
    dialout_request: DialoutRequest, session: aiohttp.ClientSession
) -> DailyRoomConfig:
    """Create a **new** Daily room when the pool cannot supply one.

    ``dialout_request`` is reserved for future room properties (e.g. org-specific).
    """
    _ = dialout_request
    try:
        return await create_ephemeral_daily_room(session)
    except Exception as e:
        logger.error(f"Error creating ephemeral Daily room: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create Daily room: {e!s}") from e


async def return_room_to_pool(room: dict | DailyRoomConfig) -> None:
    """Return a room configuration to the pool."""
    try:
        pool = get_room_pool()
        if isinstance(room, dict):
            room = DailyRoomConfig(
                room_url=room.get("room_url", ""),
                token=room.get("token", ""),
            )
        await pool.return_room(room)
    except Exception as e:
        logger.warning(f"Failed to return room to pool: {e}")


async def start_bot(agent_request: AgentRequest, session: aiohttp.ClientSession) -> None:
    """Start the bot via ``POST {BOT_URL}/start``.

    The room is already created by the webhook server; the bot joins with the
    payload under ``body``.

    Args:
        agent_request: Agent configuration with ``room_url``, ``token``, dial-out
            settings, and call metadata.
        session: Shared aiohttp session for outbound HTTP.

    Environment:
        ``BOT_URL`` or ``LOCAL_BOT_URL``: Base URL of the bot service (no trailing
            slash). Defaults to ``http://localhost:7860``.

    Raises:
        HTTPException: If the bot service returns a non-200 response.
    """
    bot_base = (
        os.getenv("BOT_URL")
        or os.getenv("LOCAL_BOT_URL")
        or os.getenv("VITE_BOT_URL")
        or "http://localhost:7860"
    ).rstrip("/")

    logger.debug(
        f"Starting bot via POST {bot_base}/start for call_id={agent_request.call_id!r}"
    )

    body_data = agent_request.model_dump(exclude_none=True, mode="json")

    async with session.post(
        f"{bot_base}/start",
        headers={"Content-Type": "application/json"},
        json={
            "createDailyRoom": False,
            "body": body_data,
        },
    ) as response:
        if response.status != 200:
            error_text = await response.text()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to start bot via /start endpoint: {error_text}",
            )

    logger.debug("Bot started successfully via /start endpoint")
