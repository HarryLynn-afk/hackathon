# Telegram bot workflow (n8n)

`plant-doctor-telegram.json` — farmer sends a leaf photo, bot replies with the
diagnosis in Burmese text **and** a Burmese voice message.

## Flow

```
Telegram Trigger ─ Normalize ─ Route ┬ photo ─ POST /diagnose ─ Format Burmese ─ send text ─ POST /speak ─ send voice
                                     ├ crop  ─ ack button ─ "now send a photo"
                                     └ else  ─ crop menu (8 inline buttons)
```

`Normalize` remembers each chat's chosen crop in workflow static data, because
`POST /diagnose` needs a `crop` id alongside the photo. A photo sent before a
crop is chosen falls through to the crop menu.

## Setup

1. **Telegram credential** — talk to [@BotFather](https://t.me/BotFather),
   `/newbot`, copy the token. In n8n: Credentials → New → *Telegram API* →
   paste the token → name it `Plant Doctor Bot`.
2. **Import** — Workflows → Import from File → `plant-doctor-telegram.json`.
   Open each Telegram node once and re-select the credential (credential ids
   are not portable between n8n instances).
3. **API key** — replace `PASTE_YOUR_PLANT_DOCTOR_API_KEY` in the `Diagnose`
   and `Speak Burmese` nodes with the value of `PLANT_DOCTOR_API_KEY` from
   `backend/.env`.
4. **Backend URL** — both HTTP nodes point at `http://host.docker.internal:8000`
   (n8n in Docker reaching the backend on your Mac). Change it to:
   - `http://localhost:8000` — n8n installed with npm on this same machine
   - `https://<your>.ngrok-free.app` — n8n Cloud, see below
5. **Activate** the workflow. The trigger registers the Telegram webhook only
   when active; the manual "Test workflow" button works for one update.

## Exposing the backend to n8n Cloud

Tunnel the **backend** (8000), not the Vite frontend:

```bash
ngrok http 8000
```

Then set both HTTP node URLs to `https://<id>.ngrok-free.app/diagnose` and
`/speak`. The `X-API-Key` header is what protects it while it is public.

## Notes

- Voice is sent with Telegram `sendAudio` (MP3). `sendVoice` would need OGG/Opus,
  which Azure's MP3 output is not.
- `Diagnose` and `Speak Burmese` are set to *continue on error* so a backend
  failure still sends the farmer a Burmese apology instead of silently dying.
- The spoken text is the emoji-free version, capped at 1500 characters — Azure
  bills per character, and identical text is cached server-side.
- Static data (chat → crop) lives in the workflow and persists while it is
  active; it resets if the workflow is deleted or re-imported.
