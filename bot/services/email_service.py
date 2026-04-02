"""
Email service for sending notifications via Gmail API
Uses Service Account with Domain-Wide Delegation
"""

import base64
import json
import os
from email.mime.text import MIMEText
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from loguru import logger

load_dotenv(override=True)

# Email configuration
EMAIL_RECIPIENTS = os.getenv("EMAIL_RECIPIENTS", "")
GMAIL_SENDER_EMAIL = os.getenv("GMAIL_SENDER_EMAIL", "")
GMAIL_CREDENTIALS_JSON = os.getenv("GMAIL_CREDENTIALS_JSON", "")

# Gmail API scopes
SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


def _get_gmail_service():
    """Create Gmail API service using service account credentials."""
    if not GMAIL_SENDER_EMAIL:
        raise ValueError("GMAIL_SENDER_EMAIL not configured")

    if not GMAIL_CREDENTIALS_JSON:
        raise ValueError("GMAIL_CREDENTIALS_JSON not configured")

    credentials_info = json.loads(GMAIL_CREDENTIALS_JSON)
    credentials = service_account.Credentials.from_service_account_info(
        credentials_info, scopes=SCOPES
    )
    # Impersonate the sender email (requires domain-wide delegation)
    delegated_credentials = credentials.with_subject(GMAIL_SENDER_EMAIL)

    return build("gmail", "v1", credentials=delegated_credentials)


def _create_message(to: str, subject: str, body: str) -> dict:
    """Create a message for the Gmail API."""
    message = MIMEText(body)
    message["to"] = to
    message["from"] = GMAIL_SENDER_EMAIL
    message["subject"] = subject

    # Encode as base64url
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    return {"raw": raw}


async def send_email(to: str, subject: str, body: str) -> dict:
    """
    Send a generic email to a recipient.

    Args:
        to: The recipient email address
        subject: The email subject line
        body: The email body/content

    Returns:
        dict with success status and message
    """
    if not GMAIL_SENDER_EMAIL:
        logger.error("GMAIL_SENDER_EMAIL not configured")
        return {"success": False, "error": "Email service not configured"}

    try:
        service = _get_gmail_service()
        message = _create_message(to, subject, body)
        result = service.users().messages().send(userId="me", body=message).execute()

        logger.info(f"✅ Email sent to {to}: {result.get('id')}")
        return {"success": True, "email_id": result.get("id")}

    except Exception as e:
        logger.error(f"❌ Failed to send email: {e}")
        return {"success": False, "error": str(e)}
