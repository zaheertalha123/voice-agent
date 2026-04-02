"""
Analytics observer - aggregates metrics in memory.
"""

from datetime import datetime, timezone

from loguru import logger
from pipecat.observers.base_observer import BaseObserver, FramePushed
from pipecat.frames.frames import MetricsFrame, TranscriptionFrame
from pipecat.metrics.metrics import LLMUsageMetricsData, TTSUsageMetricsData

# Pricing (per unit)
# Note: Daily.co first 10,000 participant minutes per month are FREE
PRICING = {
    "llm": {"input": 0.40 / 1_000_000, "output": 1.60 / 1_000_000, "cache_read": 0.10 / 1_000_000},
    "tts": 0.042 / 1000,
    "stt": 0.0058 / 60,
    "daily_room_per_min_per_participant": 0.00099,  # $0.00099/min/participant
    "daily_dial_handling": 0.018,  # $0.018 per dial event/call
}

# Number of participants in the call (bot + human)
DAILY_PARTICIPANTS = 2


class AnalyticsObserver(BaseObserver):
    """Aggregates metrics in memory."""

    def __init__(self, session_id: str | None = None):
        super().__init__()
        self.session_id = session_id or "unknown"
        self._seen_frames = set()
        self._start_time = datetime.now(timezone.utc)

        # Aggregated metrics
        self.llm_input_tokens = 0
        self.llm_output_tokens = 0
        self.llm_cache_read_tokens = 0
        self.llm_calls = 0
        self.tts_characters = 0
        self.stt_duration_sec = 0.0

    async def on_push_frame(self, data: FramePushed):
        frame = data.frame

        if frame.id in self._seen_frames:
            return
        self._seen_frames.add(frame.id)

        # STT duration
        if isinstance(frame, TranscriptionFrame) and frame.result:
            duration = getattr(frame.result, "duration", None)
            if duration:
                self.stt_duration_sec += duration
            return

        # LLM & TTS
        if isinstance(frame, MetricsFrame):
            for d in frame.data:
                if isinstance(d, LLMUsageMetricsData):
                    self.llm_input_tokens += d.value.prompt_tokens
                    self.llm_output_tokens += d.value.completion_tokens
                    self.llm_cache_read_tokens += d.value.cache_read_input_tokens or 0
                    self.llm_calls += 1
                elif isinstance(d, TTSUsageMetricsData):
                    self.tts_characters += d.value

    def get_summary(self) -> dict:
        """Returns summary dict. Call this from event handlers."""
        duration_sec = (datetime.now(timezone.utc) - self._start_time).total_seconds()
        duration_min = duration_sec / 60

        billable_input = self.llm_input_tokens - self.llm_cache_read_tokens
        llm_cost = (
            billable_input * PRICING["llm"]["input"]
            + self.llm_output_tokens * PRICING["llm"]["output"]
            + self.llm_cache_read_tokens * PRICING["llm"]["cache_read"]
        )
        tts_cost = self.tts_characters * PRICING["tts"]
        stt_cost = self.stt_duration_sec * PRICING["stt"]

        # Daily.co costs (note: first 10k participant-minutes/month are free)
        daily_room_cost = duration_min * PRICING["daily_room_per_min_per_participant"] * DAILY_PARTICIPANTS
        daily_dial_cost = PRICING["daily_dial_handling"]  # One dial event per call
        daily_total_cost = daily_room_cost + daily_dial_cost

        total_cost = llm_cost + tts_cost + stt_cost + daily_total_cost
        price_per_min = total_cost / duration_min if duration_min > 0 else 0

        return {
            "session_id": self.session_id,
            "duration_sec": round(duration_sec, 1),
            "duration_min": round(duration_min, 2),
            "llm": {
                "calls": self.llm_calls,
                "input_tokens": self.llm_input_tokens,
                "output_tokens": self.llm_output_tokens,
                "cache_read_tokens": self.llm_cache_read_tokens,
                "cost_usd": round(llm_cost, 6),
            },
            "tts": {
                "characters": self.tts_characters,
                "cost_usd": round(tts_cost, 6),
            },
            "stt": {
                "duration_sec": round(self.stt_duration_sec, 2),
                "cost_usd": round(stt_cost, 6),
            },
            "daily": {
                "participants": DAILY_PARTICIPANTS,
                "room_cost_usd": round(daily_room_cost, 6),
                "dial_handling_cost_usd": round(daily_dial_cost, 6),
                "total_cost_usd": round(daily_total_cost, 6),
                "note": "First 10k participant-minutes/month are FREE",
            },
            "total_cost_usd": round(total_cost, 6),
            "price_per_min_usd": round(price_per_min, 6),
        }

    def print_summary(self):
        """Print summary dict. Call this from event handlers."""
        logger.info(f"📊 Analytics: {self.get_summary()}")
