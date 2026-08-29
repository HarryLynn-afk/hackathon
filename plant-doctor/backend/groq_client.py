"""Groq vision call for plant disease diagnosis with bilingual structured output."""

import base64
import json
import logging
import os
import time

import requests

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
# Groq's Cloudflare edge rejects default Python user agents (error 1010),
# so every request must carry a custom one.
HEADERS_UA = "plant-doctor/1.0"
# Status codes that mean "this key is the problem" (revoked, or its quota is
# spent) rather than "this request is the problem" — worth retrying on the
# spare key. A 400 is a bad payload and would fail identically on any key.
KEY_FAILURE_CODES = {401, 403, 429}

SYSTEM_PROMPT = """You are an expert plant pathologist helping farmers in Myanmar.
You will receive a photo of a {crop_en} ({crop_mm}) plant.

Diseases commonly seen on this crop:
{disease_list}

Product catalog from real Myanmar agri-input companies — မြန်မာ့ဩဘာ
(Myanma Awba) and မာဃမင်း (Marga Min). Recommend medicines ONLY from this
catalog:

FUNGICIDES (for fungus diseases):
{fungicide_catalog}

INSECTICIDES (for insect/pest damage):
{insecticide_catalog}

FERTILIZERS (for nutrient deficiency or recovery support):
{fertilizer_catalog}

Analyze the photo and respond with ONLY a JSON object in exactly this shape:
{{
  "is_plant": true or false (false if the photo does not show a plant),
  "is_healthy": true or false,
  "disease": {{"en": "...", "mm": "..."}},
  "cause": {{"en": "...", "mm": "..."}},
  "treatment_steps": [{{"en": "...", "mm": "..."}}, ...],
  "medicines": [
    {{"name_mm": "...", "name_en": "...", "company_mm": "...", "company_en": "...", "ingredient": "...", "note": {{"en": "...", "mm": "..."}}}},
    ...
  ],
  "prevention": {{"en": "...", "mm": "..."}},
  "severity": "low" | "medium" | "high",
  "confidence": 0.0 to 1.0
}}

Rules:
- Prefer a disease from the list above if it matches; you may name a different
  disease only if the symptoms clearly do not match any listed one.
- "mm" values must be natural SPOKEN Burmese, the way a friendly local
  agriculture officer talks to a farmer face to face. Use colloquial spoken
  endings like "တယ်", "မယ်", "ပါ", "နော်" instead of formal literary endings
  like "သည်", "မည်", "၍", "သော". Example of the right tone:
  "ရေကို ၃-၄ ရက်လောက် ဖောက်ထုတ်ထားပေးပါနော်" not
  "ရေကို ၃-၄ ရက် ဖောက်ထုတ်ရမည်ဖြစ်သည်"။
  Disease names in "disease.mm" can stay as standard disease names.
- treatment_steps: 2 to 4 short, practical steps a smallholder farmer can do.
- Never invent exact pesticide dosages; name the type of treatment and tell the
  farmer to follow the product label or ask the township agriculture office.
- "medicines": pick 1 to 3 products from the catalog above whose active
  ingredient fits this diagnosis: fungicide for fungus diseases, insecticide
  for insect/pest damage, fertilizer for nutrient deficiency. Copy "name_mm",
  "name_en", "ingredient", "company_mm" and "company_en" EXACTLY as written
  in the catalog line — do not invent or modify product or company names.
  When two products fit equally, prefer ones from different companies so the
  farmer has a choice. "note" is one short spoken-Burmese sentence on what
  the product is for and when to use it.
  Virus diseases have no cure: recommend an insecticide only if it controls
  the insect that spreads the virus, and say so in the note.
  For a healthy plant, an empty list is fine.
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
- Medicines already recommended: {medicines}

Rules:
- Answer ONLY in {lang_name}. Keep it short: 2 to 5 simple sentences a farmer
  can act on. No markdown, no bullet lists, plain sentences only.
- If answering in Burmese, use natural SPOKEN Burmese like a friendly neighbor
  chatting — endings like "တယ်", "မယ်", "ပါ", "နော်" — never formal literary
  endings like "သည်", "မည်", "၍". Warm and simple, not textbook language.
- Stay on topic: this plant, this disease, farming care. If asked something
  unrelated to farming, politely steer back.
- Never invent exact pesticide dosages or brand prices; name the treatment type
  and tell the farmer to follow the product label or ask the township
  agriculture office (မြို့နယ်စိုက်ပျိုးရေးရုံး).
- Be encouraging and respectful, like talking to an elder.
"""

LANG_NAMES = {"mm": "Burmese (Myanmar language)", "en": "English"}


def _load_json(name: str) -> dict:
    path = os.path.join(os.path.dirname(__file__), "data", name)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


KB = _load_json("diseases.json")
CROPS = {c["id"]: c for c in KB["crops"]}
MEDICINES = _load_json("medicines.json")


ALL_PRODUCTS = [
    m for c in ("fungicides", "insecticides", "fertilizers") for m in MEDICINES[c]
]


def _canonicalize_medicines(medicines: list) -> list:
    """Replace model-written product fields with exact catalog values.

    The model sometimes decorates names (e.g. "ယူနတီ (Unity)"); match each
    recommendation back to a real catalog entry and copy its fields verbatim.
    Recommendations that match nothing in the catalog are dropped.
    """
    cleaned = []
    for med in medicines:
        name_mm = str(med.get("name_mm", "")).split("(")[0].strip()
        name_en = str(med.get("name_en", "")).strip().lower()
        match = next(
            (
                p
                for p in ALL_PRODUCTS
                if p["name_mm"] == name_mm or p["name_en"].lower() == name_en
            ),
            None,
        )
        if match:
            cleaned.append({**match, "note": med.get("note", {})})
    return cleaned


def _catalog_lines(category: str) -> str:
    return "\n".join(
        f"- {m['name_mm']} ({m['name_en']}) — {m['ingredient']} — "
        f"{m['company_mm']} ({m['company_en']})"
        for m in MEDICINES[category]
    )


def diagnose_image(image_bytes: bytes, mime: str, crop_id: str) -> dict:
    crop = CROPS[crop_id]
    disease_list = "\n".join(
        f"- {d['en']} ({d['mm']})" for d in crop["diseases"]
    )
    system = SYSTEM_PROMPT.format(
        crop_en=crop["name"]["en"],
        crop_mm=crop["name"]["mm"],
        disease_list=disease_list,
        fungicide_catalog=_catalog_lines("fungicides"),
        insecticide_catalog=_catalog_lines("insecticides"),
        fertilizer_catalog=_catalog_lines("fertilizers"),
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
    result = json.loads(content)
    if isinstance(result.get("medicines"), list):
        result["medicines"] = _canonicalize_medicines(result["medicines"])
    return result


def chat_reply(crop_id: str, diagnosis: dict, lang: str, messages: list) -> str:
    """Answer a follow-up question about an existing diagnosis."""
    crop = CROPS[crop_id]
    disease = diagnosis.get("disease", {})
    treatment = "; ".join(
        s.get("en", "") for s in diagnosis.get("treatment_steps", [])
    )
    medicines = "; ".join(
        f"{m.get('name_en', '')} ({m.get('name_mm', '')}, {m.get('ingredient', '')}, "
        f"by {m.get('company_en', 'unknown company')})"
        for m in diagnosis.get("medicines", [])
    )
    system = CHAT_SYSTEM_PROMPT.format(
        crop_en=crop["name"]["en"],
        crop_mm=crop["name"]["mm"],
        disease_en=disease.get("en", "unknown"),
        disease_mm=disease.get("mm", ""),
        severity=diagnosis.get("severity", "unknown"),
        cause=diagnosis.get("cause", {}).get("en", "unknown"),
        treatment=treatment or "none",
        medicines=medicines or "none",
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


def _api_keys() -> list[str]:
    """The primary key first, then any spares, skipping blanks and duplicates.

    Accepts both a single GROQ_API_KEY_FALLBACK and/or as many numbered spares
    (GROQ_API_KEY_2, GROQ_API_KEY_3, ...) as you add to .env.
    """
    raw = [os.environ.get("GROQ_API_KEY", ""), os.environ.get("GROQ_API_KEY_FALLBACK", "")]
    i = 2
    while True:
        key = os.environ.get(f"GROQ_API_KEY_{i}", "")
        if not key:
            break
        raw.append(key)
        i += 1

    keys = []
    for key in raw:
        key = key.strip()
        if key and key not in keys:
            keys.append(key)
    return keys


def _post_with_retries(payload: dict, headers: dict):
    # Free-tier Groq rate-limits bursts; retry a couple of times before failing.
    for attempt in range(3):
        resp = requests.post(GROQ_URL, json=payload, headers=headers, timeout=90)
        if resp.status_code == 429 and attempt < 2:
            wait = float(resp.headers.get("retry-after", 2 * (attempt + 1)))
            time.sleep(min(wait, 15))
            continue
        resp.raise_for_status()
        return resp
    resp.raise_for_status()
    return resp


def _call_groq(payload: dict) -> str:
    keys = _api_keys()
    if not keys:
        raise RuntimeError("No Groq API key configured (set GROQ_API_KEY)")

    for index, key in enumerate(keys):
        headers = {"Authorization": f"Bearer {key}", "User-Agent": HEADERS_UA}
        try:
            resp = _post_with_retries(payload, headers)
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            last_key = index == len(keys) - 1
            if status not in KEY_FAILURE_CODES or last_key:
                raise
            logging.warning(
                "Groq key %d/%d failed with HTTP %s; falling back to the next key",
                index + 1,
                len(keys),
                status,
            )
            continue
        return resp.json()["choices"][0]["message"]["content"]

    raise RuntimeError("All Groq API keys failed")
