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
# put your key in backend/.env:  GROQ_API_KEY=gsk_...
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

## Follow-up chat

After a diagnosis, a floating "Ask a question" button opens a chat about that
disease. `POST /chat` receives the diagnosis context plus the message history
and answers in the app's current language (Burmese or English), staying on
farming topics only. Quick-question chips let farmers ask without typing.
