# Webhook server

FastAPI app that sits between the **bot** service and the **web** frontend: it receives or forwards events so the two sides stay decoupled.

## Prerequisites

- Python 3.11+ recommended

## Setup

```bash
cd webhook-server
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in this directory (see variables below). It is gitignored.

## Environment

| Variable    | Description        | Default |
|------------|--------------------|---------|
| `LOG_LEVEL` | Logging level name | `INFO`  |

Add other variables here as you wire Supabase, secrets, and URLs.

## Run

From `webhook-server` with the virtualenv active:

```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

Then open `http://127.0.0.1:8000/health` — you should see `{"status":"ok"}`.

API docs: `http://127.0.0.1:8000/docs`.
