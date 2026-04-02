# Docker: webhook server

Build and run the FastAPI webhook server as a container. Run these commands from the **`webhook-server`** directory (so the build context is this folder).

## Build

```bash
cd webhook-server
docker build -t voice-agent-webhook:latest .
```

## Run

Pass configuration with `--env-file` (recommended) or `-e` flags. The app listens on **8080** inside the container.

```bash
docker run --rm -p 8080:8080 --env-file .env voice-agent-webhook:latest
```

Then open `http://127.0.0.1:8080/health` (or `/docs` for OpenAPI).

### Run without a local `.env`

Set variables inline, for example:

```bash
docker run --rm -p 8080:8080 \
  -e SUPABASE_URL="https://your-project.supabase.co" \
  -e SUPABASE_SERVICE_ROLE_KEY="your-key" \
  -e DAILY_API_KEY="your-daily-key" \
  voice-agent-webhook:latest
```

Add any other variables your deployment needs (see `README.md`).

## Build from repository root

If you prefer to run Docker from the repo root:

```bash
docker build -f webhook-server/Dockerfile -t voice-agent-webhook:latest webhook-server
docker run --rm -p 8080:8080 --env-file webhook-server/.env voice-agent-webhook:latest
```

## `.env` syntax

Use valid `KEY=value` lines. If a value is quoted, close the quotes (broken lines break `python-dotenv` locally). The app normalizes `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` so surrounding quotes from Docker’s `--env-file` do not break the Supabase client.

## Local Supabase inside Docker

If `SUPABASE_URL` is `http://127.0.0.1:54321`, that points at the **container’s** loopback, not your host. From the container, use your machine’s address instead, for example `http://host.docker.internal:54321` (Docker Desktop on Mac/Windows) or the host gateway on Linux (often `http://172.17.0.1:54321`), and ensure Supabase binds so it is reachable.
