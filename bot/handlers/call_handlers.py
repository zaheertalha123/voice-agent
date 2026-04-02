"""
Call control handlers for Pipecat voice agent
Handles transfer to human, end call, email, and validation functionality
"""

import os
import asyncio
import aiohttp
from loguru import logger
from pipecat.services.llm_service import FunctionCallParams

from services.email_service import send_email
from services.supabase_client import update_call_analysis

# Global references for call control
_current_task = None
_room_config = None
_speech_sync = None
_call_metadata = None
_call_tracker = None
_tool_configs = {}  # Tool settings (transfer_number, email recipients, etc.)


def set_call_context(task, room_config=None, speech_sync=None, call_metadata=None, call_tracker=None, tool_configs=None):
    """Set the global call context for handlers"""
    global _current_task, _room_config, _speech_sync, _call_metadata, _call_tracker, _tool_configs
    _current_task = task
    _room_config = room_config
    _speech_sync = speech_sync
    _call_metadata = call_metadata or {}
    _call_tracker = call_tracker
    _tool_configs = tool_configs or {}


def set_speech_sync(speech_sync):
    """Set the speech sync processor for handlers to wait on."""
    global _speech_sync
    _speech_sync = speech_sync


async def handle_submit_call_analysis(params: FunctionCallParams):
    """Handler for submitting call analysis.

    Stores structured analysis of the call for later review by sales team.
    Filters fields based on organization's configured selected_fields setting.
    """
    # Extract ALL analysis data from arguments
    full_analysis = {
        "interest_level": params.arguments.get("interest_level"),
        "want_demo": params.arguments.get("want_demo"),
        "transferred_to_human": params.arguments.get("transferred_to_human"),
        "demo_booked": params.arguments.get("demo_booked"),
        "qualified_lead": params.arguments.get("qualified_lead"),
        "objections": params.arguments.get("objections", []),
        "pain_points_mentioned": params.arguments.get("pain_points_mentioned", []),
        "company_size_category": params.arguments.get("company_size_category"),
        "call_sentiment": params.arguments.get("call_sentiment"),
        "customer_satisfaction_estimate": params.arguments.get("customer_satisfaction_estimate"),
        "pitch_delivery_score": params.arguments.get("pitch_delivery_score"),
        "extracted_info": params.arguments.get("extracted_info", {}),
    }

    # Get database call ID from call tracker (not request-level call_id)
    call_id = _call_tracker.db_call_id if _call_tracker else None

    if not call_id:
        logger.warning("⚠️ No db_call_id in call tracker, cannot save call analysis")
        await params.result_callback(
            {"status": "error", "message": "Call ID not available"}
        )
        return

    # Filter analysis based on selected_fields config
    analysis_config = _tool_configs.get("submit_call_analysis", {})
    selected_fields = analysis_config.get("selected_fields", [])

    if selected_fields:
        # Only include configured fields
        analysis = {k: v for k, v in full_analysis.items() if k in selected_fields}
        logger.info(f"🔍 Filtering analysis to selected fields: {selected_fields}")
    else:
        # If no config, save all fields (backward compatibility)
        analysis = full_analysis
        logger.info("🔍 No selected_fields config, saving all analysis data")

    # Always include required fields (from function schema requirements)
    # These are minimum viable metrics
    required_fields = ["interest_level", "qualified_lead", "call_sentiment", "pitch_delivery_score"]
    for field in required_fields:
        if field not in analysis and field in full_analysis:
            analysis[field] = full_analysis[field]
            logger.debug(f"  ↪ Added required field: {field}")

    # Save filtered analysis to database
    success = await update_call_analysis(call_id, analysis)

    if success:
        saved_fields = list(analysis.keys())
        logger.info(f"📊 Call analysis saved with {len(saved_fields)} fields: {saved_fields}")
        await params.result_callback(
            {"status": "success", "message": "Call analysis saved"}
        )
    else:
        logger.error(f"Failed to save call analysis for {call_id}")
        await params.result_callback(
            {"status": "error", "message": "Failed to save analysis"}
        )


async def handle_send_email(params: FunctionCallParams):
    """Handler for sending a generic email.

    NOTE: An LLM-generated holding phrase is spoken by on_function_calls_started
    event handler BEFORE this handler runs. We wait for it to complete, then
    send the email.
    """
    body = params.arguments.get("body", "")

    # Get email settings from tool config (database), fall back to environment variable
    email_config = _tool_configs.get("send_email", {})
    to = email_config.get("recipient_emails") or os.getenv("EMAIL_RECIPIENTS", "")
    subject = email_config.get("subject") or "Automated SDR Query"

    if not to:
        logger.error("❌ Email recipients not configured")
        await params.result_callback(
            {
                "status": "error",
                "message": "Email service is not configured. Please contact support.",
            }
        )
        return

    # Wait for LLM-generated holding phrase to finish before sending email
    if _speech_sync:
        await _speech_sync.wait_for_speech_complete()

    logger.info(f"📧 Sending email to {to} with subject: {subject}")
    result = await send_email(to, subject, body)

    if result.get("success"):
        await params.result_callback(
            {
                "status": "success",
                "message": "The email has been sent successfully.",
            }
        )
    else:
        logger.error(f"❌ Email failed: {result.get('error')}")
        await params.result_callback(
            {
                "status": "error",
                "message": "I was unable to send the email. Please try again or contact support directly.",
            }
        )


async def handle_transfer_to_human(params: FunctionCallParams):
    """Handler for transferring call to human dispatcher.

    Uses TransferTrigger to execute transfer after TTS completes speaking.
    """
    reason = params.arguments.get("reason", "customer requested transfer")
    logger.info(f"📞 Transferring call to human dispatcher. Reason: {reason}")

    daily_api_key = os.getenv("DAILY_API_KEY")
    if not daily_api_key:
        logger.error("❌ DAILY_API_KEY not found")
        await params.result_callback(
            {"error": "Transfer unavailable - missing API key"}
        )
        return

    room_name = _call_metadata.get("room_name")
    session_id = _call_metadata.get("session_id")

    if not room_name or not session_id:
        logger.error(
            f"❌ Missing call context - room_name: {room_name}, session_id: {session_id}"
        )
        await params.result_callback(
            {"error": "Transfer unavailable - missing call information"}
        )
        return

    # Get transfer number from tool config (database), fall back to environment variable
    transfer_config = _tool_configs.get("transfer_to_human", {})
    transfer_number = transfer_config.get("transfer_number") or os.getenv("REDIRECT_PHONE")

    # Return result immediately so TTS can speak the message
    await params.result_callback({"success": True, "message": "Connecting you now."})

    async def execute_transfer():
        """Execute the actual SIP transfer."""
        try:
            async with aiohttp.ClientSession() as session:
                url = f"https://api.daily.co/v1/rooms/{room_name}/sipCallTransfer"
                headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {daily_api_key}",
                }
                payload = {"sessionId": session_id, "toEndPoint": transfer_number}

                async with session.post(
                    url, json=payload, headers=headers, timeout=30
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"✅ Call transfer initiated: {data}")
                    else:
                        error_text = await response.text()
                        logger.error(
                            f"❌ Daily API error: HTTP {response.status} - {error_text}"
                        )
        except Exception as e:
            logger.error(f"❌ Exception in transfer_to_human: {e!s}")

    # Schedule transfer to execute after TTS completes
    if _speech_sync:
        await _speech_sync.schedule_after_speech(execute_transfer)
    else:
        # Fallback if speech_sync not available
        logger.warning("⚠️ SpeechSync not available, using fallback delay")
        asyncio.create_task(asyncio.sleep(5))
        asyncio.create_task(execute_transfer())


async def handle_end_call(params: FunctionCallParams):
    """Handler for ending the call gracefully when user says goodbye.

    Uses TransferTrigger to execute end call after TTS completes speaking.
    """
    global _current_task, _room_config

    # Import here to avoid circular imports
    from server_utils import return_room_to_server

    farewell_message = params.arguments.get(
        "farewell_message", "Goodbye! Have a great day."
    )
    logger.info(f"👋 End call requested with farewell: {farewell_message}")

    await params.result_callback({"success": True, "message": farewell_message})

    async def end_call():
        """Execute the actual call termination."""
        # Return room to pool before canceling
        if _room_config:
            await return_room_to_server(_room_config)
            logger.info("♻️  Room returned to webhook server pool")
        if _current_task:
            logger.info("📞 Ending call after goodbye")
            await _current_task.cancel()

    # Schedule end call to execute after TTS completes
    if _speech_sync:
        await _speech_sync.schedule_after_speech(end_call)
    else:
        # Fallback if speech_sync not available
        logger.warning("⚠️ SpeechSync not available, using fallback delay")
        await asyncio.sleep(5)
        await end_call()
