"""
Simple call tracker for database persistence.

Tracks call_id and tools_called during a call session.
All other data (transcript, analytics) is obtained from existing objects at call end.
"""

from services.calls_repository import CallsRepository


# Map internal end_reason strings to DB enum values.
# Direct values ("voicemail", "completed") are valid as-is and don't need mapping.
_END_REASON_MAP = {
    "voicemail_detected": "voicemail",
    "error":              "abrupt",
    "idle_timeout":       "abrupt",
    "container_not_found": "abrupt",
}


class CallTracker:
    """Minimal call state tracker."""

    def __init__(self):
        self.db_call_id: str | None = None
        self.tools_called: list[str] = []
        self.transcript: list[str] = []
        self.end_reason: str = "abrupt"  # Default; updated by events
        self.recording_url: str | None = None
        self._repo = CallsRepository()

    async def start(self, caller_phone: str, agent_phone: str = None, call_direction: str = "outbound") -> None:
        """Create call record in database."""
        self.db_call_id = await self._repo.create_call(caller_phone, agent_phone, call_direction=call_direction)

    def track_tool(self, tool_name: str) -> None:
        """Track a tool call."""
        self.tools_called.append(tool_name)

    def add_message(self, role: str, content: str) -> None:
        """Add a message to the transcript."""
        self.transcript.append(f"{role}: {content}")

    def get_transcript(self) -> str | None:
        """Get full transcript as string."""
        return "\n".join(self.transcript) if self.transcript else None

    async def set_recording_url(self, url: str) -> None:
        """Save recording URL to database."""
        self.recording_url = url
        if self.db_call_id:
            await self._repo.update_recording(self.db_call_id, recording_url=url)

    def get_end_reason(self) -> str:
        """Return a valid DB enum value for end_reason."""
        # Map internal strings to DB enum
        reason = _END_REASON_MAP.get(self.end_reason, self.end_reason)
        # If end_call tool was used, it's a completed call
        if reason == "abrupt" and "end_call" in self.tools_called:
            return "completed"
        return reason

    async def end(self, analytics: dict | None = None) -> None:
        """Update call record with final data. Call once at bot exit."""
        if not self.db_call_id:
            return

        await self._repo.update_call_end(
            self.db_call_id,
            end_reason=self.get_end_reason(),
            transcription=self.get_transcript(),
            analytics=analytics,
            tools_called=self.tools_called or None,
            call_transferred="transfer_to_human" in self.tools_called,
        )
