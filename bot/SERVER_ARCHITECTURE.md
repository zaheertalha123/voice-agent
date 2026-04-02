# Voice bot architecture

## Overview

Outbound PSTN calls use **Daily.co** and **Pipecat**. The **webhook server** (sibling project `webhook-server/`) owns outbound-call HTTP APIs, Supabase-backed phone lists, and the Daily **room pool**. This **bot** process joins the room it is given and runs the media + LLM pipeline.

## Core components (this repo: `bot/`)

### Voice bot (`pipecat_bot_pstn.py`)

Pipecat pipeline: Daily transport → ASR (Deepgram) → LLM (OpenAI) → TTS (Cartesia).

- Entry: Pipecat runner receives an `AgentRequest`-shaped body (room URL, token, dial-out settings) — typically produced by the webhook server.
- On shutdown / idle / disconnect, the bot POSTs to **`WEBHOOK_SERVER_URL/return-room`** so the webhook server can put the Daily room back in its pool (`server_utils.return_room_to_server`).

Event timing (Daily PSTN dial-out) can fire “joined” before the callee answers; see inline comments and VAD/voicemail handling in code.

### Services (`bot/services/`)

- **Call tracker / repository**: DB persistence for calls
- **Dialout manager**: Dial retry behavior
- **Email, audio upload, Supabase**: recordings and metadata

## Webhook server (separate project)

Implemented under **`../webhook-server/`** (not in this folder): FastAPI app, room pool, `/outbound-call`, `/return-room`, etc.

## Call lifecycle (high level)

1. Client → webhook server `POST /outbound-call` → room from pool → bot started with room + token.
2. Bot joins Daily room, runs conversation.
3. Bot → webhook server `POST /return-room` when the session ends so the room can be reused.

## Configuration

Bot: `PIPECAT_PORT`, `WEBHOOK_SERVER_URL`, Daily/LLM/STT/TTS keys.  
Room pool size and telephony port belong to **`webhook-server`** env (see that project’s docs).

## Deployment

- **Bot**: e.g. `python pipecat_bot_pstn.py` or container built from `bot/Dockerfile`.
- **Webhook**: build/run from `webhook-server/` (see `webhook-server/DOCKER.md`).
