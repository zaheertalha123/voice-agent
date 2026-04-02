"""Supabase client and database operations."""

import os
from datetime import datetime, timezone
from typing import Optional

from loguru import logger
from supabase import Client, create_client

_client_cache: Optional[Client] = None
_initialized = False


def _normalize_env_value(raw: str | None) -> str:
    """Strip whitespace; remove one pair of surrounding quotes (Docker ``--env-file`` often keeps them)."""
    if not raw:
        return ""
    s = raw.strip().replace("\r", "").replace("\n", "")
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ('"', "'"):
        s = s[1:-1]
    return s.strip()


def get_supabase_client() -> Optional[Client]:
    """Get or create a cached Supabase client from environment variables."""
    global _client_cache, _initialized

    if _initialized:
        return _client_cache

    _initialized = True

    url = _normalize_env_value(os.getenv("SUPABASE_URL"))
    key = _normalize_env_value(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

    if not url or not key:
        logger.warning(
            "Supabase env vars missing (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY); "
            "Supabase operations will be disabled."
        )
        return None

    logger.info("Supabase client initialized (cached)")
    _client_cache = create_client(url, key)
    return _client_cache


# --- Authentication ---


async def verify_user_token(token: str) -> Optional[str]:
    """Verify a JWT and return the user id, or None."""
    client = get_supabase_client()
    if not client:
        return None

    try:
        response = client.auth.get_user(jwt=token)
        if response and getattr(response, "user", None):
            return str(response.user.id)
        return None
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        return None


async def get_user_organization(user_id: str) -> Optional[str]:
    """Resolve organization id for a user from ``public.users``."""
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
        logger.error(f"Failed to get user org: {e}")
        return None


async def verify_auth_token(auth_header: str | None) -> dict:
    """Verify Bearer JWT and return user_id and org_id."""
    from fastapi import HTTPException

    if not auth_header or not auth_header.startswith("Bearer "):
        logger.warning("No Bearer token in Authorization header")
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.replace("Bearer ", "", 1).strip()

    try:
        user_id = await verify_user_token(token)
        if not user_id:
            logger.warning("Invalid token: could not resolve user_id")
            raise HTTPException(status_code=401, detail="Invalid authentication token")

        org_id = await get_user_organization(user_id)
        if not org_id:
            logger.warning(f"User {user_id} has no associated organization")
            raise HTTPException(status_code=403, detail="User has no associated organization")

        return {"user_id": user_id, "org_id": str(org_id), "authenticated": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth token validation failed: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


# --- Organizations & phone numbers ---


async def fetch_all_organization_ids() -> list[str]:
    """Return every ``org_id`` from ``organizations`` (one row per org)."""
    client = get_supabase_client()
    if not client:
        return []

    try:
        response = client.table("organizations").select("org_id").execute()
        rows = response.data or []
        return [str(row["org_id"]) for row in rows]
    except Exception as e:
        logger.error(f"Failed to fetch organizations: {e}")
        return []


async def fetch_phone_numbers_for_org(org_id: str) -> list[dict]:
    """Fetch all ``phone_numbers`` rows for a single organization."""
    client = get_supabase_client()
    if not client:
        return []

    try:
        response = (
            client.table("phone_numbers").select("*").eq("org_id", org_id).execute()
        )
        return response.data if response.data else []
    except Exception as e:
        logger.error(f"Failed to fetch phone numbers for org {org_id}: {e}")
        return []


async def fetch_all_phone_numbers() -> list:
    """Fetch all rows from ``phone_numbers`` (single query)."""
    client = get_supabase_client()
    if not client:
        return []

    try:
        response = client.table("phone_numbers").select("*").execute()
        return response.data if response.data else []
    except Exception as e:
        logger.error(f"Failed to fetch phone numbers: {e}")
        return []


async def get_organization_id_for_phone(phone_number: str) -> Optional[str]:
    """Lookup org_id for a phone number."""
    client = get_supabase_client()
    if not client or not phone_number:
        return None

    try:
        result = (
            client.table("phone_numbers")
            .select("org_id")
            .eq("phone_number", phone_number)
            .single()
            .execute()
        )
        return result.data.get("org_id") if result.data else None
    except Exception:
        logger.debug(f"Phone {phone_number} not found in phone_numbers")
        return None


# --- Calls ---


async def create_call_record(
    caller_number: str,
    agent_phone_number: Optional[str] = None,
    call_direction: str = "outbound",
) -> Optional[str]:
    """Insert a call row; returns id if successful."""
    client = get_supabase_client()
    if not client:
        logger.debug("Skipping call creation; Supabase client not configured.")
        return None

    try:
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
            logger.info(f"Call created: {call_id} (org: {org_id}, direction: {call_direction})")
            return str(call_id) if call_id is not None else None

        logger.warning("Call creation returned no data")
        return None
    except Exception as e:
        logger.error(f"Failed to create call record for {caller_number}: {e}")
        return None


async def update_call_record(
    call_id: str,
    end_reason: str,
    transcription: Optional[str] = None,
    analytics: Optional[dict] = None,
    tools_called: Optional[list] = None,
    call_transferred: bool = False,
) -> bool:
    """Update a call when it ends."""
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
        logger.info(f"Call record updated: {call_id} (reason: {end_reason})")
        return True
    except Exception as e:
        logger.error(f"Failed to update call record {call_id}: {e}")
        return False


async def update_call_recording(call_id: str, recording_url: str) -> bool:
    """Set recording URL on a call."""
    client = get_supabase_client()
    if not client:
        logger.debug("Skipping recording update; Supabase client not configured.")
        return False

    try:
        client.table("calls").update({"recording_url": recording_url}).eq("id", call_id).execute()
        logger.info(f"Recording URL saved for call: {call_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to update recording for call {call_id}: {e}")
        return False


async def update_call_analysis(call_id: str, analysis: dict) -> bool:
    """Set call_analysis JSON on a call."""
    client = get_supabase_client()
    if not client:
        logger.debug("Skipping analysis update; Supabase client not configured.")
        return False

    try:
        client.table("calls").update({"call_analysis": analysis}).eq("id", call_id).execute()
        logger.info(f"Call analysis saved: {call_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to update call analysis {call_id}: {e}")
        return False


# --- Bot prompts / tools ---


async def fetch_enabled_tools(org_id: str) -> list[str]:
    """Return enabled tool names for an org."""
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
        logger.info(f"Enabled tools for org {org_id}: {names}")
        return names
    except Exception as e:
        logger.error(f"Failed to fetch enabled tools for org {org_id}: {e}")
        return []


async def fetch_tool_configs(org_id: str) -> dict:
    """Return enabled tool name -> settings for an org."""
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
        configs: dict = {}
        for row in result.data or []:
            tool_name = row.get("tool_name")
            if row.get("enabled") and tool_name:
                configs[tool_name] = row.get("settings") or {}
        logger.info(f"Tool configs for org {org_id}: {list(configs.keys())}")
        return configs
    except Exception as e:
        logger.error(f"Failed to fetch tool configs for org {org_id}: {e}")
        return {}


async def fetch_active_prompt(org_id: str) -> Optional[str]:
    """Return active system prompt text for an org, if any."""
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
            logger.info(f"Loaded active prompt '{name}' for org {org_id}")
            return prompt
        return None
    except Exception as e:
        logger.debug(f"No active prompt found for org {org_id}: {e}")
        return None


# --- Storage ---


async def upload_recording_file(
    bucket_name: str,
    file_path: str,
    file_data: bytes,
    content_type: str = "audio/wav",
) -> Optional[str]:
    """Upload bytes to Supabase Storage and return a signed URL."""
    client = get_supabase_client()
    if not client:
        logger.debug("Skipping file upload; Supabase client not configured.")
        return None

    try:
        client.storage.from_(bucket_name).upload(
            path=file_path,
            file=file_data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        result = client.storage.from_(bucket_name).create_signed_url(
            file_path, expires_in=31536000
        )
        url = result.get("signedURL")
        logger.info(f"File uploaded: {file_path}")
        return url
    except Exception as e:
        logger.error(f"Failed to upload file {file_path}: {e}")
        return None
