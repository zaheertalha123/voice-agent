"""Dial-out request payloads."""

from pydantic import BaseModel, Field


class DialoutSettings(BaseModel):
    """Settings for an outbound PSTN call."""

    phone_number: str = Field(..., description="E.164 number to dial")


class DialoutRequest(BaseModel):
    """Request payload for initiating a dial-out call."""

    dialout_settings: DialoutSettings
    caller_phone: str | None = None
