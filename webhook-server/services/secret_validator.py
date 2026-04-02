"""Validate admin/setup secrets from environment."""

import os

from loguru import logger


def validate_setup_secret(secret: str) -> bool:
    """Return True if ``secret`` matches ``SETUP_SECRET`` from the environment."""
    expected = (os.getenv("SETUP_SECRET") or "").strip()
    if not expected:
        logger.warning("SETUP_SECRET is not set; rejecting setup validation")
        return False
    return secret == expected
