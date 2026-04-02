"""Daily.co REST API: create rooms and meeting tokens."""

from __future__ import annotations

import os
import time
import uuid
from typing import Any

import aiohttp
from loguru import logger

from schemas import DailyRoomConfig, DailyRoomProperties

DAILY_API_BASE = "https://api.daily.co/v1"

ROOM_EXPIRY_HOURS = float(os.getenv("ROOM_EXPIRY_HOURS", "24"))
ROOM_EXPIRY_SECONDS = int(os.getenv("ROOM_EXPIRY_SECONDS", str(int(ROOM_EXPIRY_HOURS * 3600))))


def _daily_headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def room_properties_to_api_dict(props: DailyRoomProperties) -> dict[str, Any]:
    """Serialize room properties for POST /rooms (nested ``sip`` as dict)."""
    data = props.model_dump(mode="json", exclude_none=True)
    sip = data.pop("sip", None)
    if sip is not None:
        sip_d = {k: v for k, v in sip.items() if v is not None}
        sip_d.pop("sip_mode", None)
        if sip_d:
            data["sip"] = sip_d
    if "exp" in data and data["exp"] is not None:
        data["exp"] = int(data["exp"])
    return data


async def configure(
    session: aiohttp.ClientSession,
    *,
    sip_caller_phone: str | None = None,
    room_properties: DailyRoomProperties,
    token_exp_duration: float | None = None,
) -> DailyRoomConfig:
    """Create a Daily room with ``room_properties`` and a matching meeting token.

    ``token_exp_duration`` is accepted for API symmetry (hours); token ``exp`` matches room ``exp``.
    """
    _ = token_exp_duration

    api_key = (os.getenv("DAILY_API_KEY") or "").strip()
    if not api_key:
        logger.error("Daily configure: DAILY_API_KEY is not set")
        raise RuntimeError("DAILY_API_KEY is not set")

    props = room_properties.model_copy(deep=True)
    mode = "dial-out" if props.enable_dialout else "dial-in"
    if props.sip is not None and sip_caller_phone:
        props = props.model_copy(
            update={
                "sip": props.sip.model_copy(update={"display_name": sip_caller_phone}),
            }
        )

    name = f"va-{uuid.uuid4().hex[:26]}"[:128]
    exp_ts = int(props.exp)
    logger.debug(
        "Daily configure: creating room name={} mode={} exp_ts={} sip_caller={}",
        name,
        mode,
        exp_ts,
        sip_caller_phone or "(none)",
    )

    props_dict = room_properties_to_api_dict(props)
    headers = _daily_headers(api_key)

    async with session.post(
        f"{DAILY_API_BASE}/rooms",
        headers=headers,
        json={"name": name, "privacy": "private", "properties": props_dict},
    ) as resp:
        if resp.status != 200:
            body_text = await resp.text()
            logger.error(
                "Daily POST /rooms failed status={} name={} body={}",
                resp.status,
                name,
                body_text[:500],
            )
            raise RuntimeError(f"Daily create room failed ({resp.status}): {body_text}")
        room = await resp.json()

    room_name = room["name"]
    room_url = room["url"]
    logger.info(
        "Daily room created name={} url={} mode={}",
        room_name,
        room_url,
        mode,
    )

    token_payload = {
        "properties": {
            "room_name": room_name,
            "exp": exp_ts,
            "is_owner": True,
            "eject_at_token_exp": True,
        }
    }

    async with session.post(
        f"{DAILY_API_BASE}/meeting-tokens",
        headers=headers,
        json=token_payload,
    ) as resp:
        if resp.status != 200:
            err_body = await resp.text()
            logger.error(
                "Daily POST /meeting-tokens failed status={} room={} body={}",
                resp.status,
                room_name,
                err_body[:500],
            )
            raise RuntimeError(f"Daily meeting token failed ({resp.status}): {err_body}")
        data = await resp.json()
        token = data.get("token")
        if not token:
            logger.error("Daily meeting token missing 'token' for room={}", room_name)
            raise RuntimeError("Daily meeting token response missing 'token'")

    logger.debug(
        "Daily meeting token issued room={} exp_ts={} token_len={}",
        room_name,
        exp_ts,
        len(str(token)),
    )

    return DailyRoomConfig(room_url=room_url, token=str(token))


def default_expiration_timestamp() -> float:
    """Unix timestamp when pooled rooms should expire."""
    return time.time() + ROOM_EXPIRY_SECONDS
