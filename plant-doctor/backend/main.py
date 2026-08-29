"""Plant Doctor API — photo in, bilingual diagnosis out."""

import logging
import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from groq_client import CROPS, chat_reply, diagnose_image

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


@app.get("/crops")
def list_crops():
    return {
        "crops": [
            {"id": c["id"], "name": c["name"], "icon": c["icon"]}
            for c in CROPS.values()
        ]
    }


@app.post("/diagnose")
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


@app.post("/chat")
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
