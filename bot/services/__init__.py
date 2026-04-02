"""Services module for Pacifica voice agent"""

from .email_service import send_email
from .calls_repository import CallsRepository
from .call_tracker import CallTracker
from .audio_uploader import AudioUploader
from .dialout_manager import DialoutManager
from .supabase_client import (
    get_supabase_client,
    verify_user_token,
    verify_auth_token,
    get_user_organization,
    fetch_all_phone_numbers,
    get_organization_id_for_phone,
    create_call_record,
    update_call_record,
    update_call_recording,
    upload_recording_file,
)

__all__ = [
    "AudioUploader",
    "CallTracker",
    "CallsRepository",
    "create_call_record",
    "DialoutManager",
    "fetch_all_phone_numbers",
    "get_organization_id_for_phone",
    "get_supabase_client",
    "get_user_organization",
    "send_email",
    "update_call_record",
    "update_call_recording",
    "upload_recording_file",
    "verify_auth_token",
    "verify_user_token",
]
