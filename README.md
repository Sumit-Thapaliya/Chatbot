# ChatBot ✦ — Groq chat (FastAPI)

A premium single-page chat UI with a small FastAPI backend. Streams answers
token-by-token from Groq Cloud's free OpenAI-compatible API.

---

## 1. Add your keys in `.env`

No `export ...` commands. `app.py` reads the `.env` file in this folder
automatically when it starts (built-in reader — `python-dotenv` is not needed).

```dotenv
GROQ_API_KEY=gsk_your_real_key_here
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_SYSTEM=You are a warm, precise assistant.
HOST=0.0.0.0
PORT=8000
```

- `.env` ships with `GROQ_API_KEY=` empty → **demo mode**, zero API calls.
- Save the file and **restart the server** for changes to take effect.
- Real shell variables still override `.env` if you ever inject secrets that way.
- `.env` is in `.gitignore`, so the key never gets committed.
- `.env.example` lists every variable and alternative free model IDs.
- Quick test without restarting: paste a key into the **connection pill** in the
  header (stored in your browser's localStorage). For production use `.env`.

---

## 2. Run it (you create the venv)

```bash
cd groq-chat

python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python app.py
```

Open **<http://127.0.0.1:8000/>** (or <http://localhost:8000/>).

> `0.0.0.0` is a *bind* address meaning "listen on every interface" — it is **not**
> a URL you can open in a browser. Keep `HOST=0.0.0.0` for Docker / LAN / cloud
> previews. Set `HOST=127.0.0.1` in `.env` if you want the app reachable only from
> your own machine; either way the browser URL stays `http://127.0.0.1:8000/`.
> The startup banner now prints the correct browsable URL.

Equivalent: `uvicorn app:app --host 0.0.0.0 --port 8000`.

---

## Files

| File | Purpose |
| --- | --- |
| `app.py` | FastAPI: `.env` loader, static files, `/api/config`, `/api/validate`, `/api/chat` SSE proxy |
| `.env` | **Your config — put all keys here** |
| `.env.example` | Reference copy with all variables |
| `requirements.txt` | `fastapi`, `uvicorn`, `httpx` |
| `.gitignore` | Keeps `.env`, `.venv`, `__pycache__` out of git |
| `static/index.html` | App shell |
| `static/styles.css` | Day + night themes, water-drop transition, all motion |
| `static/app.js` | SSE parser, Markdown renderer, theme toggle, connection panel |
| `static/assets/` | Generated backdrops + robot mascot (day/night JPEGs) |

### Endpoints

- `POST /api/chat` — `{ messages, model, apiKey?, temperature?, maxTokens?, system? }` → `text/event-stream`
- `GET /api/config` — `{ demo, model, baseUrl, hasServerKey }`
- `POST /api/validate` — `{ apiKey }` → checks the key against `/models`
- `GET /api/docs` — auto-generated API docs

---

## Design notes

- **Day**: warm white glass card on iridescent silk, orange accents.
- **Night**: deep indigo aurora, amber horizon, gradient-lit glass edge.
- **Theme switch**: a water-droplet ripple — glowing discs plus three rings expand
  from the toggle while both designs melt through 600–800ms colour transitions.
  Reduced-motion users get an instant switch.
- Generated robot artwork for the hero portrait and every bot avatar.
- No file-attach button, no sidebar, no conversation list.
- `prefers-reduced-motion` disables loops and transitions.

Shortcuts: `Enter` send · `Shift+Enter` newline · `⌘/Ctrl+K` clear · `⌘/Ctrl+/` focus input

---

## Free-tier notes

Groq's free tier needs no credit card; rate limits are per model (typically about
30 RPM and 1,000 requests/day). Check current IDs and limits at
<https://console.groq.com/docs/models>. The configured model is `openai/gpt-oss-120b`.

## Deploying

Keep the key server-side (`.env` or an injected `GROQ_API_KEY`). Run behind any ASGI
host (`uvicorn app:app --workers 2`). No database, no session state — history lives
in the browser tab only.
