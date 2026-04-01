import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI

_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH)

_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Voice Agent Webhook",
    description="Bridge between the bot service and the web frontend.",
    version="0.1.0",
)


@app.get("/health")
async def health() -> dict[str, str]:
    logger.debug("health check")
    return {"status": "ok"}
