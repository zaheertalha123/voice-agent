"""Supabase client and database operations.

Provides centralized access to Supabase with all database operations
needed across the application. This is the single source of truth for
all Supabase interactions.
"""

import os
from typing import Optional
from datetime import datetime, timezone

from loguru import logger
from supabase import create_client, Client


# Global cache for Supabase client (singleton pattern)
_client_cache: Optional[Client] = None
_initialized = False


def get_supabase_client() -> Optional[Client]:
    """Get or create a Supabase client from environment variables (cached).

    This is the main database and storage client used throughout the application.
    The client is created once and reused for all subsequent calls to avoid
    unnecessary re-initialization and logging.

    Returns:
        Optional[Client]: Supabase client instance, or None if env vars are missing
    """
    global _client_cache, _initialized

    # Return cached client if available
    if _initialized:
        return _client_cache

    # Mark as initialized to prevent repeated initialization attempts
    _initialized = True

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        logger.warning(
            "⚠️ Supabase env vars missing (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY); "
            "Supabase operations will be disabled."
        )
        return None

    logger.info("📦 Supabase client initialized (cached)")
    _client_cache = create_client(url, key)
    return _client_cache


# ============================================================================
# AUTHENTICATION OPERATIONS
# ============================================================================

async def verify_user_token(token: str) -> Optional[str]:
    """Verify a JWT token and extract user ID.

    Args:
        token: JWT token to verify

    Returns:
        User ID if valid, None otherwise
    """
    client = get_supabase_client()
    if not client:
        return None

    try:
        user = client.auth.get_user(token)
        return user.user.id if user.user else None
    except Exception as e:
        logger.error(f"❌ Token verification failed: {str(e)}")
        return None


async def get_user_organization(user_id: str) -> Optional[str]:
    """Get organization ID for a user.

    Args:
        user_id: User ID to lookup

    Returns:
        Organization ID if found, None otherwise
    """
    client = get_supabase_client()
    if not client:
        return None

    try:
        result = (
            client.table("users")
            .select("org_id")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        return result.data.get("org_id") if result.data else None
    except Exception as e:
        logger.error(f"❌ Failed to get user org: {str(e)}")
        return None


async def verify_auth_token(auth_header: str | None) -> dict:
    """Verify the Bearer token from Authorization header and get user's organization.

    Args:
        auth_header: Authorization header value (e.g., "Bearer <token>")

    Returns:
        dict: User information including user_id and org_id

    Raises:
        HTTPException: If token is missing, invalid, or user not found
    """
    from fastapi import HTTPException

    if not auth_header or not auth_header.startswith("Bearer "):
        logger.warning("❌ No Bearer token provided in Authorization header")
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.replace("Bearer ", "")

    try:
        # Verify token and get user ID
        user_id = await verify_user_token(token)

        if not user_id:
            logger.warning("❌ Invalid token: Unable to extract user_id")
            raise HTTPException(status_code=401, detail="Invalid authentication token")

        # Get user's organization
        org_id = await get_user_organization(user_id)

        if not org_id:
            logger.warning(f"❌ User {user_id} has no associated organization")
            raise HTTPException(status_code=403, detail="User has no associated organization")

        return {"user_id": user_id, "org_id": org_id, "authenticated": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Auth token validation failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Authentication failed")


# ============================================================================
# PHONE NUMBER OPERATIONS
# ============================================================================

async def fetch_all_phone_numbers() -> list:
    """Fetch all phone numbers from the database.

    Returns:
        List of phone number records with org_id and direction
    """
    client = get_supabase_client()
    if not client:
        return []

    try:
        response = client.table("phone_numbers").select("*").execute()
        return response.data if response.data else []
    except Exception as e:
        logger.error(f"❌ Failed to fetch phone numbers: {str(e)}")
        return []


async def get_organization_id_for_phone(phone_number: str) -> Optional[str]:
    """Lookup organization ID for a phone number.

    Args:
        phone_number: Phone number to lookup

    Returns:
        Organization ID if found, None otherwise
    """
    client = get_supabase_client()
    if not client or not phone_number:
        return None

    try:
        result = (
            client.table("phone_numbers")
            .select("org_id")
            .eq("phone_number", phone_number)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0].get("org_id") if rows else None
    except Exception:
        logger.debug(f"Phone {phone_number} not found in phone_numbers table")
        return None


# ============================================================================
# CALL OPERATIONS
# ============================================================================

async def create_call_record(
    caller_number: str,
    agent_phone_number: Optional[str] = None,
    call_direction: str = "outbound",
) -> Optional[str]:
    """Create a new call record.

    Args:
        caller_number: For outbound: our number. For inbound: the caller's number.
        agent_phone_number: For outbound: the number being called. For inbound: our number.
        call_direction: 'inbound' or 'outbound'

    Returns:
        Call ID (UUID) if successful, None otherwise
    """
    client = get_supabase_client()
    if not client:
        logger.debug("Skipping call creation; Supabase client not configured.")
        return None

    try:
        # Lookup org_id via phone number
        lookup_phone = caller_number if call_direction == "outbound" else agent_phone_number
        org_id = await get_organization_id_for_phone(lookup_phone) if lookup_phone else None

        payload = {
            "caller_number": caller_number,
            "agent_phone_number": agent_phone_number or "",
            "org_id": org_id,
            "call_direction": call_direction,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        result = client.table("calls").insert(payload).execute()

        if result.data and len(result.data) > 0:
            call_id = result.data[0].get("id")
            logger.info(
                f"📞 Call created: {call_id} (org: {org_id}, direction: {call_direction})"
            )
            return call_id

        logger.warning("Call creation returned no data")
        return None
    except Exception as e:
        logger.error(f"Failed to create call record for {caller_number}: {str(e)}")
        return None


async def update_call_record(
    call_id: str,
    end_reason: str,
    transcription: Optional[str] = None,
    analytics: Optional[dict] = None,
    tools_called: Optional[list] = None,
    call_transferred: bool = False,
) -> bool:
    """Update call record when call ends.

    Args:
        call_id: Call ID to update
        end_reason: 'completed', 'abrupt', or 'voicemail'
        transcription: Full transcript of the call
        analytics: Analytics summary
        tools_called: List of tools called
        call_transferred: Whether call was transferred

    Returns:
        True if successful, False otherwise
    """
    client = get_supabase_client()
    if not client:
        logger.debug("Skipping call update; Supabase client not configured.")
        return False

    try:
        payload = {
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "end_reason": end_reason,
            "call_transferred": call_transferred,
        }

        if transcription is not None:
            payload["transcription"] = transcription
        if analytics is not None:
            payload["analytics"] = analytics
        if tools_called is not None:
            payload["tools_called"] = tools_called

        client.table("calls").update(payload).eq("id", call_id).execute()
        logger.info(f"📞 Call record updated: {call_id} (reason: {end_reason})")
        return True
    except Exception as e:
        logger.error(f"Failed to update call record {call_id}: {str(e)}")
        return False


async def update_call_recording(call_id: str, recording_url: str) -> bool:
    """Update call record with recording URL.

    Args:
        call_id: Call ID to update
        recording_url: URL of the recording

    Returns:
        True if successful, False otherwise
    """
    client = get_supabase_client()
    if not client:
        logger.debug("Skipping recording update; Supabase client not configured.")
        return False

    try:
        client.table("calls").update({"recording_url": recording_url}).eq(
            "id", call_id
        ).execute()
        logger.info(f"🎙️ Recording URL saved for call: {call_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to update recording for call {call_id}: {str(e)}")
        return False


async def update_call_analysis(call_id: str, analysis: dict) -> bool:
    """Update call record with call analysis.

    Args:
        call_id: Call ID to update
        analysis: Analysis dict with fields like sentiment, key_topics, qualification_score, etc.

    Returns:
        True if successful, False otherwise
    """
    client = get_supabase_client()
    if not client:
        logger.debug("Skipping analysis update; Supabase client not configured.")
        return False

    try:
        client.table("calls").update({"call_analysis": analysis}).eq("id", call_id).execute()
        logger.info(f"📊 Call analysis saved: {call_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to update call analysis {call_id}: {str(e)}")
        return False


# ============================================================================
# BOT PROMPT OPERATIONS
# ============================================================================

async def fetch_enabled_tools(org_id: str) -> list[str]:
    """Fetch the names of all enabled tools for an organization.

    Args:
        org_id: Organization ID to look up

    Returns:
        List of enabled tool names (e.g. ['transfer_to_human', 'end_call']).
        Returns an empty list on error so the caller can fall back to all tools.
    """
    client = get_supabase_client()
    if not client or not org_id:
        return []

    try:
        result = (
            client.table("bot_tools")
            .select("tool_name")
            .eq("org_id", org_id)
            .eq("enabled", True)
            .execute()
        )
        names = [row["tool_name"] for row in (result.data or [])]
        logger.info(f"🔧 Enabled tools for org {org_id}: {names}")
        return names
    except Exception as e:
        logger.error(f"❌ Failed to fetch enabled tools for org {org_id}: {e}")
        return []


async def fetch_tool_configs(org_id: str) -> dict:
    """Fetch all tool configurations (enabled status + settings) for an organization.

    Args:
        org_id: Organization ID to look up

    Returns:
        Dict mapping tool names to their settings.
        Example: {
            "transfer_to_human": {"transfer_number": "+15551234567"},
            "send_email": {"recipient_emails": "email@example.com", "subject": "..."}
        }
        Returns empty dict on error so the caller can fall back to defaults.
    """
    client = get_supabase_client()
    if not client or not org_id:
        return {}

    try:
        result = (
            client.table("bot_tools")
            .select("tool_name, enabled, settings")
            .eq("org_id", org_id)
            .execute()
        )

        configs = {}
        for row in (result.data or []):
            tool_name = row.get("tool_name")
            settings = row.get("settings", {})
            # Only include enabled tools
            if row.get("enabled") and tool_name:
                configs[tool_name] = settings

        logger.info(f"🔧 Tool configs for org {org_id}: {list(configs.keys())}")
        return configs
    except Exception as e:
        logger.error(f"❌ Failed to fetch tool configs for org {org_id}: {e}")
        return {}


async def fetch_active_prompt(org_id: str) -> Optional[str]:
    """Fetch the active system prompt for an organization.

    Args:
        org_id: Organization ID to look up

    Returns:
        System prompt text if an active prompt exists, None otherwise (bot falls back to default)
    """
    client = get_supabase_client()
    if not client or not org_id:
        return None

    try:
        result = (
            client.table("bot_prompts")
            .select("system_prompt, name")
            .eq("org_id", org_id)
            .eq("is_active", True)
            .single()
            .execute()
        )
        if result.data:
            name = result.data.get("name", "unknown")
            prompt = result.data.get("system_prompt")
            logger.info(f"📝 Loaded active prompt '{name}' for org {org_id}")
            return prompt
        return None
    except Exception as e:
        # .single() raises when no row found — treat as "no active prompt"
        logger.debug(f"No active prompt found for org {org_id}: {e}")
        return None


# ============================================================================
# STORAGE OPERATIONS
# ============================================================================

async def upload_recording_file(
    bucket_name: str,
    file_path: str,
    file_data: bytes,
    content_type: str = "audio/wav",
) -> Optional[str]:
    """Upload a file to Supabase Storage and return a signed URL.

    Args:
        bucket_name: Name of the storage bucket
        file_path: Path where file should be stored
        file_data: Raw file data to upload
        content_type: MIME type of the file

    Returns:
        Signed URL if successful, None otherwise
    """
    client = get_supabase_client()
    if not client:
        logger.debug("Skipping file upload; Supabase client not configured.")
        return None

    try:
        # Upload the file
        client.storage.from_(bucket_name).upload(
            path=file_path,
            file=file_data,
            file_options={"content-type": content_type, "upsert": "true"},
        )

        # Create a signed URL (1 year expiry)
        result = client.storage.from_(bucket_name).create_signed_url(
            file_path, expires_in=31536000
        )
        url = result.get("signedURL")
        logger.info(f"✅ File uploaded: {file_path}")
        return url

    except Exception as e:
        logger.error(f"❌ Failed to upload file {file_path}: {str(e)}")
        return None
