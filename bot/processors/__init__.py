"""Custom Pipecat processors for the voice bot."""

from .speech_sync import SpeechSyncProcessor
from .vad_speech_detector import VADSpeechDetector

# Backwards compatibility alias
TransferTrigger = SpeechSyncProcessor

__all__ = ["SpeechSyncProcessor", "TransferTrigger", "VADSpeechDetector"]
