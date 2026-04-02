"""Daily.co room and token models."""

from typing import Any

from pydantic import BaseModel, Field


class DailyRoomSipParams(BaseModel):
    """Subset of Daily ``sip`` room config for PSTN/SIP."""

    display_name: str = "Pool Room"
    video: bool = False
    sip_mode: str | None = Field(
        default=None,
        description="Hint for our app only; not sent to Daily API.",
    )
    num_endpoints: int = 1


class DailyRoomProperties(BaseModel):
    """Daily room ``properties`` object for POST /rooms."""

    exp: float | int
    eject_at_room_exp: bool = True
    enable_dialout: bool = False
    start_video_off: bool = True
    enable_chat: bool = False
    enable_emoji_reactions: bool = False
    enable_prejoin_ui: bool = False
    sip: DailyRoomSipParams | None = None
    dialout_config: dict[str, Any] | None = None


class DailyRoomConfig(BaseModel):
    """Daily room URL and meeting token for the bot."""

    room_url: str
    token: str
