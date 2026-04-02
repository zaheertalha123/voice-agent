"""Audio uploader for Supabase Storage."""

import wave
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from loguru import logger
from .supabase_client import upload_recording_file

BUCKET_NAME = "call-recordings"


class AudioUploader:
    """Uploads call recordings to Supabase Storage."""

    def save_audio_to_file(
        self, audio_data: bytes, sample_rate: int = 8000, num_channels: int = 1
    ) -> Path:
        """Save audio buffer to a temporary WAV file."""
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            audio_path = Path(tmp.name)

        with wave.open(str(audio_path), "wb") as wav:
            wav.setnchannels(num_channels)
            wav.setsampwidth(2)  # 16-bit
            wav.setframerate(sample_rate)
            wav.writeframes(audio_data)

        return audio_path

    async def upload_recording(self, file_path: Path, call_id: str) -> Optional[str]:
        """Upload recording to Supabase Storage and return signed URL."""
        if not file_path.exists():
            logger.error(f"Audio file not found: {file_path}")
            return None

        try:
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            storage_path = f"{call_id}/{timestamp}_recording.wav"

            with open(file_path, "rb") as f:
                file_data = f.read()

            url = await upload_recording_file(BUCKET_NAME, storage_path, file_data)
            logger.info(f"Uploaded recording: {storage_path}")
            return url

        except Exception as e:
            logger.error(f"Failed to upload recording: {e}")
            return None
        finally:
            file_path.unlink(missing_ok=True)
