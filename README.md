# ChatBot ✦ — Groq chat (FastAPI)

A premium single-page chat UI with a small FastAPI backend. Streams answers
token-by-token from Groq Cloud's free OpenAI-compatible API.

---

## 1. Add your keys in `.env`

No `export ...` commands. `app.py` reads the `.env` file in this folder
automatically when it starts (built-in reader — `python-dotenv` is not needed).

```dotenv
GROQ_API_KEY=gsk_your_real_key_here
GROQ_MODEL=openai/gpt-oss-120b
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_SYSTEM=                      # empty = use system_prompt.txt
HOST=127.0.0.1
PORT=8000
```

- `.env` ships with `GROQ_API_KEY=` empty → `/api/chat` returns a clear error until you add your Groq key. There is **no demo mode**.
- Save the file and **restart the server** for changes to take effect.
- Real shell variables still override `.env` if you ever inject secrets that way.
- `.env` is in `.gitignore`, so the key never gets committed.
- `.env.example` lists every variable and alternative free model IDs.
- Quick test without restarting: paste a key into the **connection pill** in the
  header (stored in your browser's localStorage). For production use `.env`.

---

## 1b. This is a **School ERP** assistant (not a general chatbot)

Behaviour is defined by two plain-text files next to `app.py`:

| File | Purpose |
| --- | --- |
| `system_prompt.txt` | Default system prompt: School ERP Assistant identity, KB-only answers, scope refusal, 12 role types, privacy/security, financial & academic restrictions, troubleshooting, human escalation, injection defence |
| `knowledge_base.txt` | **Chatbot KB only** — sections 4–7 of the PDF (product knowledge, 30 how-tos, 46 FAQs, 12 troubleshooting rows). ~33 KB |

- `system_prompt.txt` is loaded at startup as the `system` message. `GROQ_SYSTEM` in
  `.env` is left **empty** so the file is used; set a one-line value there to override it.
- `app.py` splits the KB into ~1,100-character passages and injects the **4 most
  relevant** ones per message (dependency-free keyword scoring). This keeps each
  request small while still grounding answers in your docs. Remove/rename
  `knowledge_base.txt` to disable retrieval.
- The PDF is a **bot-builder document**, so the KB file contains **only answerable
  ERP facts** (sections 4–7). Builder material is kept out: how-to-use-this-document,
  review findings, chunk conventions, guardrails (→ `system_prompt.txt`), sample
  conversations, the 25-question evaluation test set, scoring guide and maintenance
  notes. This prevents test prompts and QA criteria from ever being retrieved as
  "knowledge" and shown to the model.
- **Edit either file → restart the server.**

⚠️ **KB v1.0 describes a PLANNED product.** All menu/button labels are proposed and
every item is `PLANNED` until verified against the live UI. The prompt therefore
forbids claiming a feature is live, and refuses to invent school policies, fine
rates, grading scales, pass marks, payment/messaging providers, support contacts or
currency/calendar defaults. Before go-live, fill in the KB's open items and replace
proposed labels with final ones — then re-run its 25-question evaluation test set.

> A `GROQ_API_KEY` is required. Add it to `.env` and restart to test real ERP
> answers; without it the chat bubble shows a "no key configured" error.

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

> `HOST` defaults to `127.0.0.1`, so uvicorn logs `http://127.0.0.1:8000` and the
> app is reachable only from your machine. Use `0.0.0.0` only for Docker / LAN /
> cloud previews — that is a *bind* address, not a browser URL. Either way open
> `http://127.0.0.1:8000/`. The startup banner prints the correct browsable URL.

Equivalent: `uvicorn app:app --host 0.0.0.0 --port 8000`.

---

## Files

| File | Purpose |
| --- | --- |
| `app.py` | FastAPI: `.env` loader, static files, `/api/config`, `/api/validate`, `/api/chat` SSE proxy |
| `.env` | **Your config — put all keys here** |
| `.env.example` | Reference copy with all variables |
| `system_prompt.txt` | **Default School ERP assistant system prompt** |
| `knowledge_base.txt` | Extracted School ERP KB v1.0 used for grounded answers |
| `requirements.txt` | `fastapi`, `uvicorn`, `httpx` |
| `.gitignore` | Keeps `.env`, `.venv`, `__pycache__` out of git |
| `static/index.html` | App shell |
| `static/styles.css` | Day + night themes, water-drop transition, all motion |
| `static/app.js` | SSE parser, Markdown renderer, theme toggle, connection panel, embed mode |
| `static/widget.js` | **Embeddable widget loader** — draggable launcher + iframe popup |
| `static/chat.html` | **Compact chat page** loaded inside the widget popup |
| `static/widget-demo.html` | Mock promotional page showing the widget in action |
| `render.yaml` | Render Blueprint (key is `sync: false`, set in dashboard) |
| `static/assets/` | Generated backdrops + robot mascot (day/night JPEGs) |

### Endpoints

- `POST /api/chat` — `{ messages, model, apiKey?, temperature?, maxTokens?, system?, widget? }` → `text/event-stream`. With `widget: true` the server ignores `apiKey`, `model` and `system` from the client and uses `.env` values only.
- `GET /api/config` — `{ model, baseUrl, hasServerKey, prompt, kbChunks }`
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

Groq's free tier needs no credit card; rate limits are per model and change over
time. Check current IDs and limits at
<https://console.groq.com/docs/models>. The configured model is `openai/gpt-oss-120b`.

## Deploying

Keep the key server-side (`.env` or an injected `GROQ_API_KEY`). Run behind any ASGI
host (`uvicorn app:app --workers 2`). No database, no session state — history lives
in the browser tab only.


---

## Embeddable widget (promotional website)

`static/widget.js` puts a **draggable** floating chat button in the bottom-right
corner of any page (position is remembered in `localStorage`). Clicking it opens
the compact `static/chat.html` inside an iframe panel that follows the button.
`ChatBotWidget.resetPosition()` puts the button back in the corner.

**Paste one line into your site:**

```html
<script src="https://YOUR_HOST/widget.js" async
        data-title="School ERP Assistant"
        data-subtitle="Admissions, fees, attendance & more"
        data-accent="#f2532a"
        data-theme="auto"></script>
```

Replace `YOUR_HOST` with the public **HTTPS** origin where this app is deployed.
The script derives its server from its own `src`, so nothing else is needed.
Open `https://YOUR_HOST/widget-demo.html` for a mock promotional page that
already has the widget installed.

**Optional script attributes** (all have defaults):

| Attribute | Default | Meaning |
| --- | --- | --- |
| `data-server` | script's own origin | Override the chat server origin |
| `data-title` | `School ERP Assistant` | Panel heading |
| `data-subtitle` | `Admissions, fees, attendance & more` | Panel subheading |
| `data-accent` | `#f2532a` | Hex colour for button + header |
| `data-theme` | `auto` | `light`, `dark` or `auto` (visitor OS preference) |
| `data-position` | `right` | `right` or `left` |
| `data-side` / `data-bottom` | `20` / `20` | Offsets in px |
| `data-width` / `data-height` | `380` / `560` | Panel size in px (full screen under 480px) |
| `data-auto-open` | `false` | `true` opens the panel on load |
| `data-draggable` | `true` | `false` pins the launcher to the corner |
| `data-remember-position` | `true` | `false` never saves the dragged position |

Instead of attributes you may set `window.ChatBotWidgetConfig = { title: '...' }`
before the script tag. At runtime use `ChatBotWidget.open()`, `.close()`,
`.toggle()` and `.resetPosition()`.

**How keys stay on the server:** the iframe loads `/chat.html` from this server and
posts to **this server's** `/api/chat` (`widget: true`). `chat.html` has no header,
hero, connection panel or key input — only messages and the composer; the hidden
stubs that `app.js` binds are all inside a `hidden` container.

No API key, CORS header or cross-origin fetch is needed — a plain `<script>` +
iframe is enough. `app.py` ignores **every** client-controlled setting on widget
requests:

| Field | Widget request uses |
| --- | --- |
| `apiKey` | `GROQ_API_KEY` from the server only |
| `model` | `GROQ_MODEL` from the server only |
| `system` | `system_prompt.txt` from the server only |
| `temperature` | fixed `0.7` |
| `maxTokens` | fixed `WIDGET_MAX_TOKENS` (1024) |
| `messages` | last 12 turns, max 12,000 characters total |

**Required configuration** in `.env`:

```dotenv
GROQ_API_KEY=gsk_your_real_key_here     # required; the only place the key lives
GROQ_MODEL=openai/gpt-oss-120b          # forced for widget requests
GROQ_BASE_URL=https://api.groq.com/openai/v1
HOST=0.0.0.0                           # for a public host / container
PORT=8000
CHAT_RPM=60                            # all /api/chat requests per IP / minute
WIDGET_RPM=30                          # stricter cap for widget requests
WIDGET_MAX_TOKENS=1024                 # hard output cap for widget replies
```

`CHAT_RPM` applies to **all** chat requests and `WIDGET_RPM` is an additional,
stricter cap for widget traffic. Both are in-memory per-IP buckets that reset on
restart and use `X-Forwarded-For` when present (so they work behind Render's proxy).
Together with the locked settings above, a public widget cannot inflate Groq usage.

**Hosting checklist**

1. Deploy the app to a public host with HTTPS (Render / Railway / Fly.io / VPS /
   any ASGI host): `uvicorn app:app --host 0.0.0.0 --port $PORT`.
2. Put the key in `.env` or inject `GROQ_API_KEY` as a secret environment variable.
3. Make sure the host does **not** send `X-Frame-Options: DENY/SAMEORIGIN` or a
   `Content-Security-Policy: frame-ancestors 'self'` header — those block the iframe.
4. Serve the site over HTTPS too: an `http://` iframe/script on an `https://` page
   is blocked as mixed content.
5. Add the single `<script>` line above to your promotional site's HTML.

### Deploying to Render (included `render.yaml`)

1. Push this folder to a Git repo. `.env` is gitignored — **the key is not in Git**.
2. Render → **New → Blueprint**, connect the repo; it reads `render.yaml`
   (`runtime: python`, `buildCommand: pip install -r requirements.txt`,
   `startCommand: python app.py`, health check `/api/config`).
3. Render prompts for `GROQ_API_KEY` because it is marked `sync: false`.
   Paste your `gsk_…` key there (or set it later under **Environment**).
   Render supplies `PORT` automatically; `HOST=0.0.0.0` comes from the Blueprint.
4. Note the public URL, e.g. `https://school-erp-chatbot.onrender.com`, then
   embed `https://school-erp-chatbot.onrender.com/widget.js` on your site.
5. Real environment variables override `.env`, so Render's values always win.

Anyone who can load `widget.js` can open the chat; the rate limits protect your
quota. If you need a strict domain allowlist or a signed embed token, add it in
`rate_ok()` / a new middleware in `app.py`.
