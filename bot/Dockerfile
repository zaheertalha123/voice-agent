# syntax=docker/dockerfile:1.6
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m venv "$VIRTUAL_ENV" && \
    pip install --upgrade pip && \
    pip install -r requirements.txt

COPY . .

EXPOSE 7860
CMD ["python", "pipecat_bot_pstn.py", "--transport", "daily", "--host", "0.0.0.0"]
