# Pacifica Voice Bot

Pipecat voice agent for outbound PSTN calls via Daily. It joins rooms and runs the conversation pipeline (STT → LLM → TTS).

## Architecture

- **This folder** — the **bot** process (`pipecat_bot_pstn.py`): Pipecat runner, Daily transport, tools, Supabase-backed call tracking.
- **`../webhook-server/`** — separate service: outbound-call API, room pool, auth. Start it when you need something to allocate Daily rooms and invoke the bot.

## Running locally

```bash
cd bot
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Optional: start webhook-server first (see ../webhook-server/README.md or DOCKER.md)
python pipecat_bot_pstn.py --transport daily
```

Default Pipecat HTTP port is **7860** (`PIPECAT_PORT`). The bot calls **`WEBHOOK_SERVER_URL`** (default `http://localhost:8080`) on **`/return-room`** when a call ends so rooms can be returned to the pool managed by the webhook server.

## Environment variables

| Variable              | Default                 | Description                                      |
| --------------------- | ----------------------- | ------------------------------------------------ |
| `PIPECAT_PORT`        | 7860                    | Port for the Pipecat runner HTTP app             |
| `WEBHOOK_SERVER_URL`  | http://localhost:8080   | Base URL of the webhook server for `/return-room` |
| `DAILY_API_KEY`       | —                       | Daily API key (transport / dialout)             |
| `OPENAI_API_KEY`      | —                       | LLM                                               |
| `DEEPGRAM_API_KEY`    | —                       | STT                                               |
| `CARTESIA_API_KEY`    | —                       | TTS                                               |

See `.env` for the full set used in development.

## Linting

Ruff: `ruff check .`
