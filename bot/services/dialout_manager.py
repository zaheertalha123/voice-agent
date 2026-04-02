"""
Dialout Manager Service

Manages dialout attempts with retry logic.
Handles the complexity of initiating outbound calls with automatic retry
on failure, up to a configurable maximum number of attempts.
"""

from typing import Optional
from loguru import logger

from pipecat.transports.base_transport import BaseTransport
from server_utils import DialoutSettings


class DialoutManager:
    """Manages dialout attempts with retry logic.

    Handles the complexity of initiating outbound calls with automatic retry
    on failure, up to a configurable maximum number of attempts.

    Args:
        transport: The Daily transport instance for making the dialout
        dialout_settings: Settings containing phone number and optional caller ID
        max_retries: Maximum number of dialout attempts (default: 5)
    """

    def __init__(
        self,
        transport: BaseTransport,
        dialout_settings: DialoutSettings,
        max_retries: Optional[int] = 5,
    ):
        self._transport = transport
        self._phone_number = dialout_settings.phone_number
        self._caller_id = dialout_settings.caller_id
        self._max_retries = max_retries
        self._attempt_count = 0
        self._is_successful = False

    async def attempt_dialout(self) -> bool:
        """Attempt to start a dialout call.

        Initiates an outbound call if retry limit hasn't been reached and
        no successful connection has been made yet.

        Returns:
            True if dialout attempt was initiated, False if max retries reached
            or call already successful
        """
        if self._attempt_count >= self._max_retries:
            logger.error(
                f"Maximum retry attempts ({self._max_retries}) reached. Giving up on dialout."
            )
            return False

        if self._is_successful:
            logger.debug("Dialout already successful, skipping attempt")
            return False

        self._attempt_count += 1
        logger.info(
            f"Attempting dialout (attempt {self._attempt_count}/{self._max_retries}) to: {self._phone_number}"
        )

        # Build dialout settings with phone number and optional caller ID
        dialout_params = {"phoneNumber": self._phone_number}
        if self._caller_id:
            dialout_params["callerId"] = self._caller_id
            logger.info(f"Using caller ID: {self._caller_id}")

        await self._transport.start_dialout(dialout_params)
        return True

    def mark_successful(self):
        """Mark the dialout as successful to prevent further retry attempts."""
        self._is_successful = True

    def should_retry(self) -> bool:
        """Check if another dialout attempt should be made.

        Returns:
            True if retry limit not reached and call not yet successful
        """
        return self._attempt_count < self._max_retries and not self._is_successful
