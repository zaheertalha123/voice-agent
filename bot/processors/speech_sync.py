"""
Speech Synchronization Processor for Pipecat

Provides synchronization between TTS speech and handler actions.
Allows handlers to:
1. Wait for speech to complete before executing API calls
2. Schedule callbacks to run after speech (for transfer/end call)
"""

import asyncio
from typing import Callable, Optional, Awaitable
from loguru import logger

from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.frames.frames import BotStartedSpeakingFrame, BotStoppedSpeakingFrame, Frame


class SpeechSyncProcessor(FrameProcessor):
    """Processor for synchronizing actions with TTS speech completion.

    Place this processor after TTS in the pipeline to track speaking state.

    Features:
    - wait_for_speech_complete(): Await this to pause until bot stops speaking
    - schedule_after_speech(): Schedule a callback after speech (for transfers)

    Usage:
        # In pipeline
        speech_sync = SpeechSyncProcessor()
        pipeline = Pipeline([..., tts, speech_sync, transport.output(), ...])

        # In handler - wait for holding phrase before API call
        await speech_sync.wait_for_speech_complete()
        result = await make_api_call()

        # For transfer/end call - schedule callback after speech
        await speech_sync.schedule_after_speech(execute_transfer)
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._speech_complete = asyncio.Event()
        self._speech_complete.set()  # Initially not speaking
        self._pending_callback: Optional[Callable[[], Awaitable[None]]] = None

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, BotStartedSpeakingFrame):
            # Bot started speaking - clear the event
            self._speech_complete.clear()

        elif isinstance(frame, BotStoppedSpeakingFrame):
            # Bot stopped speaking - set the event
            self._speech_complete.set()

            # Execute pending callback if any (for transfer/end call)
            if self._pending_callback:
                logger.info("Speech completed, executing scheduled callback")
                callback = self._pending_callback
                self._pending_callback = None
                try:
                    await callback()
                except Exception as e:
                    logger.error(f"Error in scheduled callback: {e}")

        # Always push frame through pipeline
        await self.push_frame(frame, direction)

    async def wait_for_speech_complete(self):
        """Wait until the bot finishes speaking.

        Call this before making API requests to ensure the holding phrase
        ("Let me check that") is fully spoken first.
        """
        await self._speech_complete.wait()

    async def schedule_after_speech(self, callback: Callable[[], Awaitable[None]]):
        """Schedule a callback to execute after the bot stops speaking.

        Use this for actions that should happen after speech, like
        call transfers or ending the call.

        Args:
            callback: Async function to execute after TTS completes
        """
        logger.info("Callback scheduled to execute after speech completes")
        self._pending_callback = callback
