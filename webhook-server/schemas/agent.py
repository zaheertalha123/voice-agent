"""Bot / agent request payloads."""

from pydantic import BaseModel

from .dialout import DialoutSettings


class AgentRequest(BaseModel):
    """Payload to send to the bot start endpoint (when implemented)."""

    room_url: str
    token: str
    dialout_settings: DialoutSettings
    call_id: str | None = None
    call_domain: str | None = None
    caller_phone: str | None = None
    agent_phone: str | None = None
    room_config: dict | None = None
    org_id: str | None = None
