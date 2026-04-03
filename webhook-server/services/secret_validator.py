"""Validate admin/setup secrets from environment."""

import hashlib
import os
import secrets

from loguru import logger


def _is_hex_digest_64(value: str) -> bool:
    """True if ``value`` is 64 hex characters (e.g. SHA-256 hex digest)."""
    if len(value) != 64:
        return False
    try:
        bytes.fromhex(value)
        return True
    except ValueError:
        return False


def validate_setup_secret(secret: object) -> bool:
    """Return True if ``secret`` matches ``SETUP_SECRET`` from the environment.

    If ``SETUP_SECRET`` is a 64-character hexadecimal string, it is treated as a
    **SHA-256 digest** (typical for storing only a hash of the real passphrase).
    The submitted secret is hashed with SHA-256 and compared in constant time.

    Otherwise the submitted value is compared to ``SETUP_SECRET`` as plain text
    (same length, constant-time compare).
    """
    if secret is None:
        logger.info("validate_setup_secret: secret is None")
        return False

    received = str(secret).strip()
    raw_expected = os.getenv("SETUP_SECRET")
    expected = (raw_expected or "").strip()

    if not expected:
        logger.warning(
            "validate_setup_secret: SETUP_SECRET is missing or empty "
            "(check webhook-server .env and restart)"
        )
        return False

    if not received:
        logger.info("validate_setup_secret: empty submitted secret")
        return False

    expected_lower = expected.lower()

    if _is_hex_digest_64(expected_lower):
        digest = hashlib.sha256(received.encode("utf-8")).hexdigest()
        match = secrets.compare_digest(digest, expected_lower)
        if match:
            logger.info("validate_setup_secret: success (SHA-256 digest match)")
        else:
            logger.info("validate_setup_secret: mismatch (SHA-256 digest does not match SETUP_SECRET)")
        return match

    if len(received) != len(expected):
        logger.info(
            "validate_setup_secret: mismatch — length differs "
            "(received_len={} expected_len={})",
            len(received),
            len(expected),
        )
        return False

    match = secrets.compare_digest(received, expected)
    if match:
        logger.info("validate_setup_secret: success (plaintext match)")
    else:
        logger.info("validate_setup_secret: mismatch (plaintext same length, different value)")
    return match
