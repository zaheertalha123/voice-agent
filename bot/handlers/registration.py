"""
Function handler registration for Pipecat voice agent.

Registers all available function handlers with the LLM service.
"""

from loguru import logger
from pipecat.services.openai.llm import OpenAILLMService
from services.call_tracker import CallTracker

from .call_handlers import (
    handle_submit_call_analysis,
    handle_send_email,
    handle_transfer_to_human,
    handle_end_call,
)


def register_function_handlers(
    llm: OpenAILLMService, call_tracker: CallTracker | None = None
):
    """Register all function handlers with the LLM service.

    Args:
        llm: The OpenAI LLM service to register handlers with
        call_tracker: Optional call tracker for logging tool usage
    """
    handlers = [
        ("submit_call_analysis", handle_submit_call_analysis),
        ("send_email", handle_send_email),
        ("transfer_to_human", handle_transfer_to_human),
        ("end_call", handle_end_call),
    ]

    def wrap_handler(name: str, handler):
        """Wrap handler to track tool calls."""

        async def tracked_handler(params):
            if call_tracker:
                call_tracker.track_tool(name)
            return await handler(params)

        return tracked_handler

    for name, handler in handlers:
        wrapped = wrap_handler(name, handler) if call_tracker else handler
        llm.register_function(name, wrapped, cancel_on_interruption=False)
    logger.info(f"🔧 Registered {len(handlers)} function handlers")
