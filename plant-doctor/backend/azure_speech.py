"""Azure AI Speech text-to-speech for reading diagnosis results aloud."""

import hashlib
import os
import xml.sax.saxutils as saxutils

import requests

TTS_URL_TEMPLATE = "https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"
USER_AGENT = "plant-doctor-tts/1.0"
MAX_CHARS = 2000

VOICES = {
    "mm": {"name": "my-MM-NilarNeural", "lang": "my-MM", "gender": "Female"},
    "en": {"name": "en-US-JennyNeural", "lang": "en-US", "gender": "Female"},
}

# Azure bills per character synthesized. Identical text (e.g. replaying the
# same diagnosis) is served from this in-memory cache instead of re-billing.
_CACHE: dict[str, bytes] = {}


def _voice_for(lang: str) -> dict:
    return VOICES.get(lang, VOICES["mm"])


def _build_ssml(text: str, lang: str) -> str:
    voice = _voice_for(lang)
    escaped = saxutils.escape(text)
    return (
        f"<speak version='1.0' xml:lang='{voice['lang']}'>"
        f"<voice xml:lang='{voice['lang']}' xml:gender='{voice['gender']}' name='{voice['name']}'>"
        f"<prosody rate='-5%'>{escaped}</prosody>"
        "</voice></speak>"
    )


def synthesize(text: str, lang: str) -> bytes:
    """Return MP3 bytes for `text` spoken in the given language ('mm' or 'en')."""
    text = text.strip()[:MAX_CHARS]
    if not text:
        raise ValueError("No text to speak")

    voice = _voice_for(lang)
    cache_key = hashlib.sha256(f"{voice['name']}:{text}".encode()).hexdigest()
    cached = _CACHE.get(cache_key)
    if cached is not None:
        return cached

    region = os.environ["AZURE_SPEECH_REGION"]
    key = os.environ["AZURE_SPEECH_KEY"]
    resp = requests.post(
        TTS_URL_TEMPLATE.format(region=region),
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
            "User-Agent": USER_AGENT,
        },
        data=_build_ssml(text, lang).encode("utf-8"),
        timeout=30,
    )
    resp.raise_for_status()
    audio = resp.content
    _CACHE[cache_key] = audio
    return audio
