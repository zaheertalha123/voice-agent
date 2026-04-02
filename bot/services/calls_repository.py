"""
Supabase repository for call records.

Handles database operations for the calls table using the centralized Supabase client.
"""

from typing import Optional
from loguru import logger

from .supabase_client import (
    create_call_record,
    update_call_record,
    update_call_recording,
)


class CallsRepository:
    """Repository for call records in Supabase."""

    async def create_call(
        self,
        caller_number: str,
        agent_phone_number: Optional[str] = None,
        call_direction: str = "outbound",
    ) -> Optional[str]:
        """Create a new call record when call is initiated.

        Args:
            caller_number: For outbound: our number. For inbound: the caller's number.
            agent_phone_number: For outbound: the number being called. For inbound: our number.
            call_direction: 'inbound' or 'outbound'

        Returns:
            UUID of the created call record, or None if creation failed.
        """
        return await create_call_record(caller_number, agent_phone_number, call_direction)

    async def update_call_end(
        self,
        call_id: str,
        *,
        end_reason: str,
        transcription: Optional[str] = None,
        analytics: Optional[dict] = None,
        tools_called: Optional[list] = None,
        call_transferred: bool = False,
    ) -> bool:
        """Update call record when call ends.

        Args:
            call_id: UUID of the call record
            end_reason: 'completed', 'abrupt', or 'voicemail'
            transcription: Full transcript of the call
            analytics: Full analytics dict from AnalyticsObserver.get_summary()
            tools_called: List of tools/functions called during the call
            call_transferred: Whether call was transferred to human

        Returns:
            True if update succeeded, False otherwise.
        """
        return await update_call_record(
            call_id,
            end_reason,
            transcription=transcription,
            analytics=analytics,
            tools_called=tools_called,
            call_transferred=call_transferred,
        )

    async def update_recording(
        self,
        call_id: str,
        *,
        recording_url: str,
    ) -> bool:
        """Update call record with recording URL.

        Returns:
            True if update succeeded, False otherwise.
        """
        return await update_call_recording(call_id, recording_url)
