"""Groq vision call for plant disease diagnosis with bilingual structured output."""

import base64
import json
import os
import time

import requests

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
# Groq's Cloudflare edge rejects default Python user agents (error 1010),
# so every request must carry a custom one.
HEADERS_UA = "plant-doctor/1.0"

SYSTEM_PROMPT = """You are an expert plant pathologist helping farmers in Myanmar.
You will receive a photo of a {crop_en} ({crop_mm}) plant.

Diseases commonly seen on this crop:
{disease_list}

Analyze the photo and respond with ONLY a JSON object in exactly this shape:
{{
  "is_plant": true or false (false if the photo does not show a plant),
  "is_healthy": true or false,
  "disease": {{"en": "...", "mm": "..."}},
  "cause": {{"en": "...", "mm": "..."}},
  "treatment_steps": [{{"en": "...", "mm": "..."}}, ...],
  "prevention": {{"en": "...", "mm": "..."}},
  "severity": "low" | "medium" | "high",
  "confidence": 0.0 to 1.0
}}

Rules:
- Prefer a disease from the list above if it matches; you may name a different
  disease only if the symptoms clearly do not match any listed one.
- "mm" values must be natural Burmese (Myanmar language) that a farmer can read.
- treatment_steps: 2 to 4 short, practical steps a smallholder farmer can do.
- Never invent exact pesticide dosages; name the type of treatment and tell the
  farmer to follow the product label or ask the township agriculture office.
- If the photo is not a plant, set is_plant false and confidence 0.
- If the plant looks healthy, set is_healthy true, disease en "Healthy plant" /
  mm "ကျန်းမာသောအပင်", severity "low", and give care tips in treatment_steps.
- confidence reflects how sure you are of the diagnosis from this single photo.
"""


CHAT_SYSTEM_PROMPT = """You are a friendly plant doctor assistant chatting with a
smallholder farmer in Myanmar about their diagnosed plant.

Diagnosis context:
- Crop: {crop_en} ({crop_mm})
- Disease: {disease_en} ({disease_mm})
- Severity: {severity}
- Cause: {cause}
- Treatment already recommended: {treatment}

Rules:
- Answer ONLY in {lang_name}. Keep it short: 2 to 5 simple sentences a farmer
  can act on. No markdown, no bullet lists, plain sentences only.
- Stay on topic: this plant, this disease, farming care. If asked something
  unrelated to farming, politely steer back.
- Never invent exact pesticide dosages or brand prices; name the treatment type
  and tell the farmer to follow the product label or ask the township
  agriculture office (မြို့နယ်စိုက်ပျိုးရေးရုံး).
- Be encouraging and respectful, like talking to an elder.
"""

LANG_NAMES = {"mm": "Burmese (Myanmar language)", "en": "English"}


def _load_kb() -> dict:
    path = os.path.join(os.path.dirname(__file__), "data", "diseases.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


KB = _load_kb()
CROPS = {c["id"]: c for c in KB["crops"]}


def diagnose_image(image_bytes: bytes, mime: str, crop_id: str) -> dict:
    crop = CROPS[crop_id]
    disease_list = "\n".join(
        f"- {d['en']} ({d['mm']})" for d in crop["diseases"]
    )
    system = SYSTEM_PROMPT.format(
        crop_en=crop["name"]["en"], crop_mm=crop["name"]["mm"], disease_list=disease_list
    )
    b64 = base64.b64encode(image_bytes).decode()

    payload = {
        "model": os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b"),
        "temperature": 0.2,
        "max_tokens": 1500,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Diagnose this plant photo."},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    },
                ],
            },
        ],
    }

    content = _call_groq(payload)
    return json.loads(content)


def chat_reply(crop_id: str, diagnosis: dict, lang: str, messages: list) -> str:
    """Answer a follow-up question about an existing diagnosis."""
    crop = CROPS[crop_id]
    disease = diagnosis.get("disease", {})
    treatment = "; ".join(
        s.get("en", "") for s in diagnosis.get("treatment_steps", [])
    )
    system = CHAT_SYSTEM_PROMPT.format(
        crop_en=crop["name"]["en"],
        crop_mm=crop["name"]["mm"],
        disease_en=disease.get("en", "unknown"),
        disease_mm=disease.get("mm", ""),
        severity=diagnosis.get("severity", "unknown"),
        cause=diagnosis.get("cause", {}).get("en", "unknown"),
        treatment=treatment or "none",
        lang_name=LANG_NAMES.get(lang, "Burmese (Myanmar language)"),
    )
    history = [
        {"role": m["role"], "content": str(m["content"])[:2000]}
        for m in messages[-10:]
        if m.get("role") in ("user", "assistant")
    ]
    payload = {
        "model": os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b"),
        "temperature": 0.4,
        "max_tokens": 600,
        "messages": [{"role": "system", "content": system}, *history],
    }
    return _call_groq(payload).strip()


def _call_groq(payload: dict) -> str:
    headers = {
        "Authorization": f"Bearer {os.environ['GROQ_API_KEY']}",
        "User-Agent": HEADERS_UA,
    }
    # Free-tier Groq rate-limits bursts; retry a couple of times before failing.
    for attempt in range(3):
        resp = requests.post(GROQ_URL, json=payload, headers=headers, timeout=90)
        if resp.status_code == 429 and attempt < 2:
            wait = float(resp.headers.get("retry-after", 2 * (attempt + 1)))
            time.sleep(min(wait, 15))
            continue
        resp.raise_for_status()
        break
    return resp.json()["choices"][0]["message"]["content"]
