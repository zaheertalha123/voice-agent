"""
Function call handlers for Pipecat voice agent
"""

from .call_handlers import (
    handle_submit_call_analysis,
    handle_send_email,
    handle_transfer_to_human,
    handle_end_call,
    set_call_context,
    set_speech_sync,
)
from .registration import register_function_handlers

__all__ = [
    "handle_submit_call_analysis",
    "handle_send_email",
    "handle_transfer_to_human",
    "handle_end_call",
    "set_call_context",
    "set_speech_sync",
    "register_function_handlers",
]
