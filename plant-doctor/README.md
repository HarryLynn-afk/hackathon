# Plant Doctor — အပင်ဆရာဝန်

Farmer-friendly plant disease detection. Choose your crop, take a photo of the
sick leaf, and get the diagnosis and treatment in Burmese and English.

- 8 crops: rice, groundnut, black gram, green gram, pigeon pea, sesame, chili, maize
- AI vision via Groq (`qwen/qwen3.8-27b`), constrained by a per-crop disease
  knowledge base in `backend/data/diseases.json`
- Big-button UI designed for farmers and elderly users, Burmese by default

## Run it

Backend (port 8000):

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# put your keys in backend/.env:
#   GROQ_API_KEY=gsk_...
#   AZURE_SPEECH_KEY=...
#   AZURE_SPEECH_REGION=eastasia
.venv/bin/python main.py
```

Frontend (port 5173, proxies /api to the backend):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 on your phone or with the browser's mobile view.

## Crop calendar

The bottom **Calendar** tab lets a farmer record what they planted and when.
The app looks up typical growth days from the crop catalog (rice 120–140,
chili 90–110, …), shows the expected harvest window, the current growth stage,
and in-app reminders for weeding, fertilizer, and harvest.

- `POST /calendar/preview` computes harvest dates and stage from a crop id and
  planting date. The phone also computes this offline if the network is down.
- Plantings are stored on the device (`localStorage`) so the calendar keeps
  working without an account.
- Mark harvested with an optional yield; past seasons group by year.
- A **Demo date** bar on the Calendar tab lets you pick a fake “today” or skip
  +7 / +30 days so you can show growth stages and reminders without waiting.

## How diagnosis works

1. The client compresses the photo to max 1024 px JPEG.
2. `POST /diagnose` sends the image plus the chosen crop id.
3. The backend prompts the Groq vision model with the known disease list for
   that crop and requires structured JSON with parallel `en`/`mm` fields.
4. Guardrails: non-plant photos are rejected, confidence below 60% asks the
   farmer to retake, and the model is told to never invent pesticide dosages.

## API key (for n8n / Telegram bot / external clients)

`POST /diagnose`, `/chat`, and `/speak` require an API key in the `X-API-Key`
header. Configure it in two places (same value):

- `backend/.env` — `PLANT_DOCTOR_API_KEY=pd_live_...` (the server checks this)
- `frontend/.env` — `PLANT_DOCTOR_API_KEY=pd_live_...` (the Vite dev proxy
  attaches it for the web app; the key never reaches browser code)

External integration example (n8n HTTP Request node):

- Method `POST`, URL `http://YOUR_HOST:8000/diagnose`
- Header `X-API-Key: pd_live_...`
- Body: multipart form with `file` (the photo binary) and `crop` (e.g. `rice`)

`GET /crops` is public, so integrations can list valid crop ids without a key.
If `PLANT_DOCTOR_API_KEY` is not set, auth is disabled (local dev mode).

## Follow-up chat

After a diagnosis, a floating "Ask a question" button opens a chat about that
disease. `POST /chat` receives the diagnosis context plus the message history
and answers in the app's current language (Burmese or English), staying on
farming topics only. Quick-question chips let farmers ask without typing.

## Listen to results (text-to-speech)

A 🔊 button on the result card and on each chat reply reads the text aloud,
for farmers who prefer listening over reading. `POST /speak {text, lang}`
calls Azure AI Speech and streams back MP3 audio:

- Burmese (`mm`) uses the `my-MM-NilarNeural` neural voice.
- English (`en`) uses `en-US-JennyNeural`.
- Audio is only synthesized when a farmer taps the button (not on every
  diagnosis), and identical text is cached in memory so replaying doesn't
  re-bill Azure.
- Requires an Azure AI Speech resource; put its key/region in `backend/.env`
  (see above). Free-tier resources work fine for a demo.
