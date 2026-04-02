"""
VAD Speech Detector Processor for Pipecat

Detects when user actually speaks (not ringing) using VAD.
This processor monitors UserStartedSpeakingFrame events from VAD
to determine when a human has picked up and is speaking, vs just ringing.
"""

from loguru import logger

from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.frames.frames import UserStartedSpeakingFrame, Frame


class VADSpeechDetector(FrameProcessor):
    """Detects when user actually speaks (not ringing) using VAD.
    
    This processor monitors UserStartedSpeakingFrame events from VAD
    to determine when a human has picked up and is speaking, vs just ringing.
    """
    
    def __init__(self, on_speech_detected_callback, **kwargs):
        super().__init__(**kwargs)
        self._on_speech_detected = on_speech_detected_callback
        self._speech_detected = False
        self._dialout_answered = False
        
    def set_dialout_answered(self):
        """Mark that dialout has been answered - now we can detect speech."""
        self._dialout_answered = True
        logger.info("🎯 VAD detector: Ready to detect human speech (dialout answered)")
    
    async def process_frame(self, frame: Frame, direction: FrameDirection):
        # Only detect speech after dialout is answered
        if self._dialout_answered and not self._speech_detected:
            if isinstance(frame, UserStartedSpeakingFrame):
                self._speech_detected = True
                logger.info("🎤 VAD detected human speech! Person has picked up and is speaking.")
                if self._on_speech_detected:
                    await self._on_speech_detected()
        
        # Always pass frame through
        await self.push_frame(frame, direction)
