"""ElevenLabs Scribe speech-to-text for voice input (Burmese or English)."""

import os

import requests

STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"
MODEL_ID = "scribe_v1"
USER_AGENT = "plant-doctor-stt/1.0"

# UI language -> ISO-639-3 hint for Scribe. This only nudges accuracy on short
# farm phrases; Scribe still auto-detects, so switching languages mid-clip
# still works even though only one hint is sent.
LANGUAGE_HINTS = {"mm": "mya", "en": "eng"}


def transcribe(audio_bytes: bytes, filename: str, mime: str, lang_hint: str | None = None) -> dict:
    """Send a recorded clip to ElevenLabs Scribe and return the transcript.

    Returns {"text": str, "language_code": str | None}.
    """
    if not audio_bytes:
        raise ValueError("No audio data")

    api_key = os.environ["ELEVENLABS_SCRIBE_API_KEY"]
    data = {"model_id": MODEL_ID}
    hint = LANGUAGE_HINTS.get(lang_hint)
    if hint:
        data["language_code"] = hint

    resp = requests.post(
        STT_URL,
        headers={"xi-api-key": api_key, "User-Agent": USER_AGENT},
        data=data,
        files={"file": (filename or "voice.webm", audio_bytes, mime or "audio/webm")},
        timeout=30,
    )
    resp.raise_for_status()
    payload = resp.json()
    return {
        "text": (payload.get("text") or "").strip(),
        "language_code": payload.get("language_code"),
    }
