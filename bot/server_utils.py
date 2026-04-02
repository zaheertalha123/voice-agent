"""Shared Pydantic models and HTTP helpers for the Pipecat bot.

Room pooling and the outbound-call API live in the separate ``webhook-server`` project.
This process only needs models to parse runner payloads and ``return_room_to_server``
to POST completed rooms back to that service.
"""

import os
import aiohttp
from loguru import logger
from pydantic import BaseModel


class DialoutSettings(BaseModel):
    """Settings for an outbound call."""

    phone_number: str
    caller_id: str | None = None


class DialoutRequest(BaseModel):
    dialout_settings: DialoutSettings
    caller_phone: str | None = None


class AgentRequest(BaseModel):
    """Payload from the webhook server / Pipecat runner ``body``."""

    room_url: str
    token: str
    dialout_settings: DialoutSettings
    call_id: str | None = None
    call_domain: str | None = None
    caller_phone: str | None = None
    agent_phone: str | None = None
    room_config: dict | None = None
    org_id: str | None = None


async def return_room_to_server(room_config: dict) -> None:
    """Notify the webhook server to return a Daily room to its pool."""
    server_url = os.getenv("WEBHOOK_SERVER_URL", "http://localhost:8080").rstrip("/")
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(f"{server_url}/return-room", json=room_config)
            logger.info(f"Room returned to webhook server pool: {room_config.get('room_url')}")
    except Exception as e:
        logger.error(f"Error returning room to webhook server: {e}")
