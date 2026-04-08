#!/usr/bin/env python3
"""
Pipecat Voice Bot for Outbound Calls

Supports outbound PSTN/telephony calls via Daily.
The bot initiates calls and handles conversations when the call is answered.
"""

import os
import aiohttp
import uvicorn
from dotenv import load_dotenv
from loguru import logger
# Log to file only in local/dev
if os.getenv("ENV", "").lower() in ("local", "dev"):
    import pathlib
    pathlib.Path("logs").mkdir(exist_ok=True)
    logger.add(
        "logs/bot_{time:YYYY-MM-DD}.log",
        rotation="1 day",
        retention="7 days",
        level="DEBUG",
    )
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.extensions.voicemail.voicemail_detector import VoicemailDetector
from pipecat.audio.mixers.soundfile_mixer import SoundfileMixer
from pipecat.frames.frames import (
    EndFrame,
    EndTaskFrame,
    TTSSpeakFrame,
    LLMMessagesAppendFrame,  # Keep for user idle handler
    LLMRunFrame,
)
from pipecat.processors.frame_processor import FrameDirection
from pipecat.processors.user_idle_processor import UserIdleProcessor
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.openai.base_llm import BaseOpenAILLMService
from pipecat.services.deepgram.stt import (
    DeepgramSTTService,
    LiveOptions,
)
from pipecat.services.cartesia.tts import CartesiaTTSService, GenerationConfig
from pipecat.transports.daily.transport import (
    DailyParams,
    DailyTransport,
)
from pipecat.processors.aggregators.llm_response_universal import (
    UserTurnStoppedMessage,
    AssistantTurnStoppedMessage,
    LLMUserAggregatorParams,
)
from pipecat.observers.user_bot_latency_observer import UserBotLatencyObserver
from pipecat.runner.types import RunnerArguments
import argparse
from pipecat.runner.run import _create_server_app
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.processors.audio.audio_buffer_processor import AudioBufferProcessor
from function_schemas import TOOLS, FUNCTION_SCHEMAS
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from system_prompt import SYSTEM_INSTRUCTION
from services.supabase_client import fetch_active_prompt, fetch_enabled_tools, fetch_tool_configs
from tool_prompts import build_tool_guidance, ALL_TOOLS
from services import CallTracker, AudioUploader, DialoutManager
from handlers import (
    set_call_context,
    set_speech_sync,
    register_function_handlers,
)
from processors import SpeechSyncProcessor, VADSpeechDetector
from server_utils import AgentRequest, DialoutSettings, return_room_to_server
from analytics import AnalyticsObserver
from typing import Optional
from pipecat.transports.base_transport import BaseTransport
from pathlib import Path

load_dotenv(override=True)

# Sound mixer configuration for ambient background noise
AMBIENT_SOUND_FILE = Path(__file__).parent / "static" / "music" / "office-ambience-8000-mono.wav"
AMBIENT_VOLUME = 1.0
LOOP_AMBIENT = True


async def run_bot(
    transport_type: str = "daily",
    room_url: str = None,
    token: str = None,
    call_id: str = None,
    caller_phone: str = None,
    agent_phone: str = None,
    room_config: dict = None,
    dialout_settings: DialoutSettings = None,
    websocket=None,
    handle_sigint: bool = False,
    org_id: str = None,
):
    """Run the voice bot for outbound calls.
    
    Args:
        transport_type: Transport type (currently only "daily" for outbound calls)
        room_url: Daily room URL for the bot to join
        token: Authentication token for the Daily room
        call_id: Unique identifier for the call
        caller_phone: Phone number making the call (our number)
        agent_phone: Phone number being called (target number)
        room_config: Daily room config for returning to server
        dialout_settings: Settings for the outbound call (required)
        websocket: WebSocket connection (for websocket transport, not used for outbound)
        handle_sigint: Whether to handle SIGINT signals
    """
    if not dialout_settings:
        raise ValueError("dialout_settings is required for outbound calls")
    # API keys
    openai_api_key = os.getenv("OPENAI_API_KEY")
    deepgram_api_key = os.getenv("DEEPGRAM_API_KEY")
    cartesia_api_key = os.getenv("CARTESIA_API_KEY")
    daily_api_key = os.getenv("DAILY_API_KEY")

    logger.info(f"🔧 Initializing bot with {transport_type} transport...")

    # Load system prompt: prefer org-specific active prompt, fall back to built-in default
    system_prompt = SYSTEM_INSTRUCTION
    if org_id:
        org_prompt = await fetch_active_prompt(org_id)
        if org_prompt:
            system_prompt = org_prompt
            logger.info(f"📝 Using org prompt for org {org_id}")
        else:
            logger.info(f"📝 No active prompt for org {org_id}, using built-in default")
    else:
        logger.info("📝 No org_id provided, using built-in default prompt")

    # Load enabled tools + their settings for this org; fall back to all tools if DB unavailable
    enabled_names = ALL_TOOLS  # default: treat all as enabled for guidance
    tools = TOOLS
    tool_configs = {}  # maps tool_name → settings dict
    if org_id:
        db_enabled = await fetch_enabled_tools(org_id)
        if db_enabled:
            enabled_names = db_enabled
            filtered = [s for s in FUNCTION_SCHEMAS if s.name in enabled_names]
            tools = ToolsSchema(standard_tools=filtered)
            logger.info(f"🔧 Using {len(filtered)}/{len(FUNCTION_SCHEMAS)} tools for org {org_id}")
        else:
            logger.warning(f"⚠️ No enabled tools found for org {org_id}, falling back to all tools")

        # Fetch tool settings (transfer_number, email recipients, etc.)
        tool_configs = await fetch_tool_configs(org_id)
        if tool_configs:
            logger.info(f"🔧 Loaded settings for {len(tool_configs)} tools")
    else:
        logger.info("🔧 No org_id provided, using all tools")

    # Append dynamic tool guidance so the bot knows how to handle each tool
    # Pass tool_configs so guidance can be customized (e.g., submit_call_analysis shows selected fields)
    system_prompt = system_prompt + build_tool_guidance(enabled_names, tool_configs)
    logger.info(f"📋 Tool guidance appended for enabled tools: {enabled_names}")

    stt = DeepgramSTTService(
        api_key=deepgram_api_key,
        live_options=LiveOptions(
            model="nova-3",
            language="en-US",
            smart_format=True,
            interim_results=True,
            encoding="linear16",
            sample_rate=8000,
            endpointing=300,
        ),
    )
    tts = CartesiaTTSService(
        api_key=cartesia_api_key,
        voice_id="e07c00bc-4134-4eae-9ea4-1a55fb45746b",
        model="sonic-3",
        language="en",
        params=CartesiaTTSService.InputParams(
            generation_config=GenerationConfig(
                speed=1.0,
            ),
        ),
    )

    llm = OpenAILLMService(
        api_key=openai_api_key,
        model="gpt-4.1-mini",
        params=BaseOpenAILLMService.InputParams(
            frequency_penalty=1.3, presence_penalty=0.4
        ),
    )
    
    # Classifier LLM for voicemail detection (use faster model for lower latency)
    classifier_llm = OpenAILLMService(
        api_key=openai_api_key,
        model="gpt-4.1-mini",
    )

    # Call tracking for database persistence
    call_tracker = CallTracker() if transport_type == "daily" else None
    register_function_handlers(llm, call_tracker)

    # Audio recording (only for daily/telephony calls)
    audio_buffer = None
    audio_uploader = None
    sound_mixer = None
    if transport_type == "daily":
        audio_buffer = AudioBufferProcessor(num_channels=1)  # Mono: user + bot mixed
        audio_uploader = AudioUploader()

        # Audio mixer setup for realistic voice (adds ambient background noise)
        try:
            if AMBIENT_SOUND_FILE.exists():
                sound_mixer = SoundfileMixer(
                    sound_files={"office": str(AMBIENT_SOUND_FILE)},
                    default_sound="office",
                    volume=AMBIENT_VOLUME,
                    loop=LOOP_AMBIENT,
                )
                logger.info(f"✅ SoundfileMixer initialized")
        except Exception as e:
            logger.warning(f"⚠️ Failed to initialize SoundfileMixer: {e}")
            sound_mixer = None

    # NOTE: Holding phrases are now generated by the LLM in the same response
    # as the function call. This is the official Pipecat pattern per PR #1250.
    # The system prompt instructs the LLM to say a brief phrase AND call the
    # function in the same response, avoiding the race condition that occurred
    # when using LLMMessagesAppendFrame with run_llm=True.

    # Transport setup for outbound calls
    # Following official Pipecat dial-out pattern:
    # https://github.com/pipecat-ai/pipecat-examples/tree/main/phone-chatbot/daily-pstn-dial-out
    transport = DailyTransport(
        room_url,
        token,
        "Pacifica Bot",
        params=DailyParams(
            api_key=daily_api_key,
            audio_in_enabled=True,
            audio_in_passthrough=True,
            audio_out_enabled=True,
            audio_out_mixer=sound_mixer,  # Add background sound via SoundfileMixer
        ),
    )

    # Context - using universal LLMContext
    messages = [{"role": "system", "content": system_prompt}]
    context = LLMContext(messages, tools=tools)
    
    # Store custom call metadata separately (LLMContext doesn't support custom attributes)
    call_metadata = {}
    if transport_type == "daily":
        call_metadata = {
            "call_id": call_id,
            "caller_phone": caller_phone,
            "room_name": room_url.split("/")[-1] if room_url else None,
            "session_id": None,
        }

    # Create VAD analyzer for LLMUserAggregator (moved from DailyParams to fix deprecation)
    vad_analyzer = None
    if transport_type == "daily":
        vad_analyzer = SileroVADAnalyzer(
            params=VADParams(
                stop_secs=0.2,
                confidence=0.8,
                min_volume=0.7,
            )
        )

    # Create context aggregator pair with VAD analyzer (moved from DailyParams)
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=vad_analyzer) if vad_analyzer else None,
    )

    # User idle callback
    async def handle_user_idle(user_idle: UserIdleProcessor, retry_count: int) -> bool:
        if retry_count == 1:
            logger.info("⏰ User idle (attempt 1)")
            message = {
                "role": "system",
                "content": "The user has been quiet. Politely ask if they're still there.",
            }
            await user_idle.push_frame(LLMMessagesAppendFrame([message], run_llm=True))
            return True
        if retry_count == 2:
            logger.info("⏰ User idle (attempt 2)")
            message = {
                "role": "system",
                "content": "The user is still inactive. Ask if they'd like to continue.",
            }
            await user_idle.push_frame(LLMMessagesAppendFrame([message], run_llm=True))
            return True
        logger.info("⏰ User idle (attempt 3), ending call")
        await user_idle.push_frame(
            TTSSpeakFrame(
                "I haven't heard from you, so I'll end the call now. Goodbye!"
            )
        )
        if call_tracker:
            call_tracker.end_reason = "idle_timeout"
        if transport_type == "daily" and room_config:
            await return_room_to_server(room_config)
        await task.queue_frame(EndFrame())
        return False

    user_idle = UserIdleProcessor(callback=handle_user_idle, timeout=30.0)

    # Initial prompt - prompts user if silent after greeting (4 seconds, once only)
    # For outbound calls, we'll disable this initially and only enable after call is answered
    call_answered_flag = {"answered": False}  # Use dict to allow modification in nested functions
    answered_event = None  # Will be set for outbound calls
    
    async def handle_initial_prompt(processor: UserIdleProcessor, _: int) -> bool:
        # For outbound calls, wait until call is answered
        if dialout_settings:
            # Check both the flag and the event to ensure call is truly answered
            if not call_answered_flag["answered"]:
                return False  # Don't trigger until call is answered
            # Also check if answered_event exists and is set (extra safety)
            if answered_event is not None and not answered_event.is_set():
                return False  # Don't trigger until event is set
        
        # Skip if user has already spoken
        messages = context.messages
        if any(m.get("role") == "user" for m in messages):
            return False
        logger.info("⏱️ User silent after greeting, sending initial prompt")
        await processor.push_frame(
            TTSSpeakFrame(
                "I handle container inquiries, shipment tracking, delivery schedules, demurrage charges, and document requests—24/7, so your support team doesn't have to. Does your company get a lot of customer calls about shipment status?"
            )
        )
        return False  # Don't retry, only trigger once

    initial_prompt = UserIdleProcessor(callback=handle_initial_prompt, timeout=4.0)

    # Speech sync - waits for TTS completion before API calls and actions
    speech_sync = SpeechSyncProcessor()
    
    # Initialize VAD detector and voicemail detector placeholders (will be created for outbound calls)
    vad_detector = None
    voicemail_detector = None
    voicemail_detector_detector = None  # The detector processor
    voicemail_detector_gate = None  # The gate processor
    recording_started = False  # Track if recording has started to avoid duplicate starts
    
    # Create voicemail detector for outbound calls BEFORE pipeline creation
    if transport_type == "daily" and dialout_settings:
        # Create voicemail detector with classifier LLM
        voicemail_detector = VoicemailDetector(
            llm=classifier_llm,
            voicemail_response_delay=0.1
        )
        # Get the detector and gate processors
        voicemail_detector_detector = voicemail_detector.detector()
        voicemail_detector_gate = voicemail_detector.gate()

    # Pipeline - AudioBufferProcessor must be AFTER transport.output() to capture both user + bot audio
    pipeline_processors = [
        transport.input(),
        vad_detector,  # VAD detector for outbound calls (created below if needed)
        stt,
        voicemail_detector_detector,  # Voicemail detector (after STT, before context aggregator)
        initial_prompt,
        user_idle,
        user_aggregator,  # User context aggregator
        llm,
        tts,
        voicemail_detector_gate,  # Voicemail gate (after TTS)
        speech_sync,  # After TTS to catch BotStoppedSpeakingFrame
        transport.output(),
        audio_buffer,  # After transport.output() to capture mixed audio
        assistant_aggregator,  # Assistant context aggregator
    ]
    pipeline = Pipeline([p for p in pipeline_processors if p is not None])

    # Task
    # Create session ID from call_id or timestamp
    session_id = call_id or f"session_{int(__import__('time').time())}"
    analytics = AnalyticsObserver(session_id=session_id)

    # Create latency observer with event handler (replaces deprecated UserBotLatencyLogObserver)
    latency_observer = UserBotLatencyObserver()
    
    @latency_observer.event_handler("on_latency_measured")
    async def on_latency_measured(observer, latency_seconds):
        logger.info(f"⏱️ User-to-bot latency: {latency_seconds:.3f}s")

    observers = [latency_observer, analytics]

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
            allow_interruptions=True,
            audio_in_sample_rate=8000,  # Native G.711 telephony rate
            audio_out_sample_rate=8000,  # Native G.711 telephony rate
            turn_analyzer=LocalSmartTurnAnalyzerV3(),
        ),
        observers=observers,  # Moved from PipelineParams to PipelineTask parameter
    )
    set_call_context(
        task,
        room_config if transport_type == "daily" else None,
        speech_sync,
        call_metadata if transport_type == "daily" else None,
        call_tracker,
        tool_configs,
    )
    set_speech_sync(speech_sync)

    # Event handlers
    processed_messages = set()

    # Register turn event handlers for transcript logging (replaces deprecated TranscriptProcessor)
    @user_aggregator.event_handler("on_user_turn_stopped")
    async def on_user_turn_stopped(aggregator, strategy, message: UserTurnStoppedMessage):
        """Handle user turn stopped event - log transcript and track message."""
        message_id = f"user:{message.content}"
        if message_id in processed_messages:
            return
        processed_messages.add(message_id)
        role = "👤 Caller"
        logger.info(f"{role}: {message.content}")
        if call_tracker:
            call_tracker.add_message(role, message.content)

    @assistant_aggregator.event_handler("on_assistant_turn_stopped")
    async def on_assistant_turn_stopped(aggregator, message: AssistantTurnStoppedMessage):
        """Handle assistant turn stopped event - log transcript and track message."""
        message_id = f"assistant:{message.content}"
        if message_id in processed_messages:
            return
        processed_messages.add(message_id)
        role = "🤖 Bot"
        # Log complete LLM response in one line (replaces token-by-token logging)
        # logger.info(f"🧠 LLM Response: {message.content}")
        logger.info(f"{role}: {message.content}")
        if call_tracker:
            call_tracker.add_message(role, message.content)

    # Audio recording handler - processes audio when recording stops
    if audio_buffer and audio_uploader:

        @audio_buffer.event_handler("on_audio_data")
        async def on_audio_data(
            buffer, audio: bytes, sample_rate: int, num_channels: int
        ):
            """Handle recorded audio data - save to file and upload."""
            logger.info(
                f"🎙️ Recording received: {len(audio)} bytes, {sample_rate}Hz, {num_channels}ch"
            )

            if not audio or len(audio) == 0:
                logger.warning("No audio data received")
                return

            if not call_tracker or not call_tracker.db_call_id:
                logger.warning("No call_id available for recording")
                return

            try:
                # Save to temp file
                audio_path = audio_uploader.save_audio_to_file(
                    audio, sample_rate, num_channels
                )

                # Upload to Supabase Storage
                url = await audio_uploader.upload_recording(
                    audio_path, call_tracker.db_call_id
                )

                if url:
                    # Save URL to database
                    await call_tracker.set_recording_url(url)
                    logger.info(f"✅ Recording uploaded: {url}")
            except Exception as e:
                logger.exception(f"Failed to process/upload recording: {e}")

    if transport_type == "daily" and dialout_settings:
        # --- Outbound call handlers using VAD for speech detection ---
        import asyncio
        
        # Initialize answered_event for outbound calls
        answered_event = asyncio.Event()
        
        # Store participant_id for stopping dialout
        dialout_participant_id = None
        
        # Initialize dialout manager
        dialout_manager = DialoutManager(transport, dialout_settings)

        # Flag to track if response has been triggered (prevent duplicate LLM calls)
        response_triggered = {"triggered": False}

        # Pre-prepare voicemail end-call sequence for instant execution
        async def execute_voicemail_endcall():
            """Execute end-call sequence immediately when voicemail is detected."""
            try:
                if dialout_participant_id:
                    await transport.stop_dialout(dialout_participant_id)
                    logger.info(f"✅ Dialout stopped immediately (participant_id: {dialout_participant_id})")
                # End the task
                await processor.push_frame(EndTaskFrame(), FrameDirection.UPSTREAM)
                await task.cancel()
            except Exception as e:
                logger.error(f"Error in voicemail endcall: {e}")
        
        # Voicemail detector is already created above, now set up event handlers
        # Conversation detected handler (for logging)
        @voicemail_detector.event_handler("on_conversation_detected")
        async def on_conversation_detected(processor):
            """Handle when a real conversation is detected (not voicemail)."""
            logger.info("✅ Conversation detected - real human on the line")
            
            # Start audio recording when conversation is confirmed (more reliable than VAD)
            nonlocal recording_started
            if audio_buffer and not recording_started:
                try:
                    await audio_buffer.start_recording()
                    recording_started = True
                    logger.info("🎙️ Audio recording started (conversation confirmed)")
                except Exception as e:
                    logger.error(f"Failed to start recording: {e}")
        
        # Voicemail detection handler
        @voicemail_detector.event_handler("on_voicemail_detected")
        async def handle_voicemail(processor):
            """Handle voicemail or auto-answer detection."""
            logger.warning("📞 Voicemail detected! Stopping dialout...")
            
            # Mark call as ended immediately
            if call_tracker:
                call_tracker.end_reason = "voicemail"

            # Stop the dialout to avoid leaving a message (instant execution)
            try:
                if dialout_participant_id:
                    await transport.stop_dialout(dialout_participant_id)
                    logger.info(f"✅ Dialout stopped due to voicemail detection (participant_id: {dialout_participant_id})")
                else:
                    logger.warning("⚠️ Could not find participant_id, ending call without stopping dialout")
            except Exception as e:
                logger.error(f"Failed to stop dialout: {e}")

            # End the task
            await processor.push_frame(EndTaskFrame(), FrameDirection.UPSTREAM)
            
            # Cleanup
            await task.cancel()
            if room_config:
                await return_room_to_server(room_config)
        
        # VAD-based speech detection - detects when person actually speaks (not ringing)
        async def on_human_speech_detected():
            """Called when VAD detects actual human speech (person picked up)."""
            logger.info("🎤 VAD confirmed human speech - person has picked up!")
            
            # Mark call as answered
            call_answered_flag["answered"] = True
            answered_event.set()
            
            # Start audio recording now that we confirmed it's a human (not voicemail)
            # Note: This is a backup - recording should also start via on_conversation_detected
            nonlocal recording_started
            if audio_buffer and not recording_started:
                try:
                    await audio_buffer.start_recording()
                    recording_started = True
                    logger.info("🎙️ Audio recording started (VAD confirmed human speech)")
                except Exception as e:
                    logger.error(f"Failed to start recording: {e}")

            # Trigger initial LLM response only once (prevent duplicate calls)
            if response_triggered["triggered"]:
                logger.info("✅ Response already triggered, skipping...")
                return

            response_triggered["triggered"] = True

            # Check if user already spoke (via STT)
            messages = context.messages
            user_has_spoken = any(m.get("role") == "user" for m in messages)
            
            if not user_has_spoken:
                logger.info("⚡ Human detected - greeting immediately")
                await task.queue_frames([TTSSpeakFrame("Hi, this is Alice from Voice Bot. How are you today?")])
            else:
                logger.info("✅ User already spoke - conversation flowing naturally")
        
        # Create VAD speech detector and add it to the pipeline
        vad_detector = VADSpeechDetector(on_speech_detected_callback=on_human_speech_detected)
        
        # Insert VAD detector into existing pipeline after transport.input()
        input_idx = None
        for i, proc in enumerate(pipeline._processors):
            if proc == transport.input():
                input_idx = i
                break
        if input_idx is not None:
            pipeline._processors.insert(input_idx + 1, vad_detector)

        @transport.event_handler("on_joined")
        async def on_joined(transport, data):
            """Bot joined the room — initiate the outbound call."""
            logger.info("🤖 Bot joined room → starting dial-out")
            await dialout_manager.attempt_dialout()

        @transport.event_handler("on_dialout_answered")
        async def on_dialout_answered(transport, data):
            """Dialout answered — start tracking and enable VAD detection."""
            logger.info(f"📞 Dialout answered: {data}")
            dialout_manager.mark_successful()
            
            # Note: participant_id will be extracted from on_first_participant_joined event
            
            # Set session ID if available
            session_id = data.get("sessionId") if isinstance(data, dict) else None
            if session_id:
                call_metadata["session_id"] = session_id
            
            # Start call tracking immediately when dialout is answered
            # Note: Recording will start later when VAD confirms it's a human (not voicemail)
            async def _setup_tracking():
                try:
                    if call_tracker:
                        await call_tracker.start(
                            caller_phone or "unknown", 
                            agent_phone,
                            call_direction="outbound"
                        )
                        logger.info("📊 Call tracking started")
                except Exception as e:
                    logger.error(f"Failed to setup call tracking: {e}")
            
            # Start tracking in background
            asyncio.create_task(_setup_tracking())
            
            # Enable VAD detector to start monitoring for human speech
            # Voicemail detector will handle voicemail detection automatically via its event handler
            logger.info("🎯 Enabling VAD for human speech detection...")
            vad_detector.set_dialout_answered()

            logger.info("⏳ Waiting for VAD to detect human speech...")

        @transport.event_handler("on_first_participant_joined")
        async def on_first_participant_joined(transport, participant):
            """First participant (person) joined the room — extract and store participant_id."""
            logger.info(f"👤 First participant joined: {participant}")
            
            # Extract participant_id from the participant data
            nonlocal dialout_participant_id
            if isinstance(participant, dict) and 'id' in participant:
                dialout_participant_id = participant['id']
                logger.info(f"First Participant ID: {dialout_participant_id}")
            else:
                logger.warning(f"⚠️ Could not extract participant_id from: {participant}")

        @transport.event_handler("on_dialout_error")
        async def on_dialout_error(transport, data):
            """Dialout failed — retry or give up."""
            logger.error(f"❌ Dialout error: {data}")
            if dialout_manager.should_retry():
                await dialout_manager.attempt_dialout()
            else:
                logger.error("❌ Max dialout retries reached, stopping bot")
                await task.cancel()

        @transport.event_handler("on_client_disconnected")
        async def on_client_disconnected(transport, client):
            """Client disconnected — cleanup."""
            logger.info(f"👋 Client disconnected: {client}")
            if audio_buffer:
                try:
                    await audio_buffer.stop_recording()
                except Exception as e:
                    logger.exception(f"Failed to stop recording: {e}")
            await task.cancel()
            if room_config:
                await return_room_to_server(room_config)

    # Run
    runner = PipelineRunner(handle_sigint=handle_sigint)
    logger.info(f"🚀 Starting {transport_type} bot...")
    await runner.run(task)

    # Finalize call tracking (guaranteed to run on any exit)
    if call_tracker:
        summary = analytics.get_summary()
        analytics.print_summary()
        await call_tracker.end(analytics=summary)


# Entry point for Pipecat runner (outbound calls)
async def bot(runner_args: RunnerArguments):
    """Main bot entry point for outbound calls.
    
    Parses the runner arguments and starts the bot for an outbound call.
    """
    request = AgentRequest.model_validate(runner_args.body)
    if not request.dialout_settings:
        raise ValueError("dialout_settings is required for outbound calls")
    
    # Extract legacy fields if present, otherwise use defaults
    call_id = request.call_id or f"outbound-{int(__import__('time').time())}"
    caller_phone = request.caller_phone or os.getenv("WEBHOOK_NUMBER", "unknown")
    agent_phone = request.dialout_settings.phone_number
    room_config = request.room_config or {
        "room_url": request.room_url,
        "token": request.token,
    }
    
    await run_bot(
        transport_type="daily",
        room_url=request.room_url,
        token=request.token,
        call_id=call_id,
        caller_phone=caller_phone,
        agent_phone=agent_phone,
        room_config=room_config,
        dialout_settings=request.dialout_settings,
        handle_sigint=runner_args.handle_sigint,
        org_id=request.org_id,
    )


def _build_runner_app():
    """Create the Pipecat runner FastAPI app using current API."""
    port = int(os.getenv("PIPECAT_PORT", "7860"))

    # Create fake args object (what newer Pipecat expects)
    args = argparse.Namespace(
        transport="daily",
        host="0.0.0.0",
        port=port,
        proxy=None,
        dialin=False,  # We're using dial-out, not dial-in
        direct=False,
        esp32=False,
        whatsapp=False,
        verbose=0,
        folder=None,
    )

    app = _create_server_app(args)

    @app.get("/health")
    async def health_check():
        return {"status": "ok", "service": "pipecat-bot"}

    return app


app = _build_runner_app()

if __name__ == "__main__":
    from pipecat.runner.run import main
    main()