"""Plant Doctor API — photo in, bilingual diagnosis out."""

import logging
import os

from dotenv import load_dotenv

load_dotenv()

import secrets

from fastapi import Depends, FastAPI, File, Form, HTTPException, Response, Security, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from azure_speech import synthesize as synthesize_speech
from crop_calendar import LOOK_AHEAD_DAYS, crop_catalog_entry, preview_planting
from elevenlabs_stt import transcribe as transcribe_speech
from groq_client import CROPS, chat_reply, diagnose_image

API_KEY = os.environ.get("PLANT_DOCTOR_API_KEY", "")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(key: str = Security(api_key_header)):
    """All AI endpoints require the project API key (web app sends it via the
    dev-server proxy; external clients like n8n send it directly)."""
    if not API_KEY:
        return  # auth disabled when no key is configured
    if not key or not secrets.compare_digest(key, API_KEY):
        raise HTTPException(401, "Missing or invalid API key (X-API-Key header)")


app = FastAPI(title="Plant Doctor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}
CONFIDENCE_FLOOR = 0.6
MAX_AUDIO_BYTES = 10 * 1024 * 1024


@app.get("/crops")
def list_crops():
    return {"crops": [crop_catalog_entry(c) for c in CROPS.values()]}


class CalendarPreviewRequest(BaseModel):
    crop: str
    planted_on: str
    today: str | None = None
    # How far ahead the "what will it look like then" forecast should reach.
    ahead_days: int = LOOK_AHEAD_DAYS


@app.post("/calendar/preview")
def calendar_preview(req: CalendarPreviewRequest):
    if req.crop not in CROPS:
        raise HTTPException(400, f"Unknown crop '{req.crop}'")
    try:
        return preview_planting(req.crop, req.planted_on, req.today, req.ahead_days)
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD")


@app.post("/diagnose", dependencies=[Depends(require_api_key)])
async def diagnose(file: UploadFile = File(...), crop: str = Form(...)):
    if crop not in CROPS:
        raise HTTPException(400, f"Unknown crop '{crop}'")
    mime = file.content_type or "image/jpeg"
    if mime not in ALLOWED_MIMES:
        raise HTTPException(400, "Please upload a JPEG, PNG, or WebP photo")
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "Photo is too large (max 8 MB)")
    if len(data) < 1000:
        raise HTTPException(400, "Photo file looks empty or broken")

    try:
        result = diagnose_image(data, mime, crop)
    except Exception:
        logging.exception("diagnose failed for crop=%s", crop)
        raise HTTPException(502, "The AI service is not responding. Please try again.")

    confidence = float(result.get("confidence", 0))
    if not result.get("is_plant", False):
        return {"status": "not_plant"}
    if confidence < CONFIDENCE_FLOOR and not result.get("is_healthy", False):
        return {"status": "low_confidence", "confidence": confidence}

    result["status"] = "ok"
    return result


class ChatRequest(BaseModel):
    crop: str
    diagnosis: dict
    lang: str = "mm"
    messages: list


@app.post("/chat", dependencies=[Depends(require_api_key)])
def chat(req: ChatRequest):
    if req.crop not in CROPS:
        raise HTTPException(400, f"Unknown crop '{req.crop}'")
    if not req.messages:
        raise HTTPException(400, "No message")
    try:
        reply = chat_reply(req.crop, req.diagnosis, req.lang, req.messages)
    except Exception:
        logging.exception("chat failed for crop=%s", req.crop)
        raise HTTPException(502, "The AI service is not responding. Please try again.")
    return {"reply": reply}


class SpeakRequest(BaseModel):
    text: str
    lang: str = "mm"


@app.post("/speak", dependencies=[Depends(require_api_key)])
def speak(req: SpeakRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(400, "No text to speak")
    try:
        audio = synthesize_speech(req.text, req.lang)
    except Exception:
        logging.exception("speech synthesis failed for lang=%s", req.lang)
        raise HTTPException(502, "The speech service is not responding. Please try again.")
    return Response(content=audio, media_type="audio/mpeg")


@app.post("/transcribe", dependencies=[Depends(require_api_key)])
async def transcribe_audio(file: UploadFile = File(...), lang: str = Form("mm")):
    data = await file.read()
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(400, "Recording is too long")
    if len(data) < 500:
        raise HTTPException(400, "Recording is too short")
    try:
        result = transcribe_speech(data, file.filename, file.content_type, lang)
    except Exception:
        logging.exception("speech-to-text failed for lang=%s", lang)
        raise HTTPException(502, "The voice service is not responding. Please try again.")
    if not result["text"]:
        raise HTTPException(422, "Could not understand the recording. Please try again.")
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
