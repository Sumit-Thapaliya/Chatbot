"""
ChatBot — FastAPI backend for Groq Cloud (free tier).

Run:
    uvicorn app:app --host 0.0.0.0 --port 8000
or:
    python app.py

Config via a .env file in this folder (loaded automatically at startup),
or via real environment variables which take precedence:
    GROQ_API_KEY     your key from https://console.groq.com/keys  (starts with gsk_)
    GROQ_MODEL       default: llama-3.3-70b-versatile
    GROQ_BASE_URL    default: https://api.groq.com/openai/v1
    GROQ_SYSTEM      optional system prompt
    HOST             default: 0.0.0.0 (use 127.0.0.1 for local-only)
    PORT             default: 8000

If no key is set the app runs in DEMO MODE: replies are simulated locally so
the whole UI, streaming and transitions can be tested before you add a key.
"""

from __future__ import annotations

import asyncio
import json
import os
import random
from pathlib import Path
from typing import AsyncIterator

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"


def load_env_file(path: Path) -> None:
    """Load a plain .env file into os.environ without any third-party package.

    Real environment variables always win, so `export GROQ_API_KEY=...` still
    works if you prefer it. Supports comments, blank lines, `export KEY=...`
    and single/double-quoted values.
    """
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(BASE_DIR / ".env")

GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_SYSTEM = os.getenv("GROQ_SYSTEM", "")
ENV_KEY = os.getenv("GROQ_API_KEY", "").strip()

# Placeholder values from the template must not count as a real key.
if not ENV_KEY or "your_key" in ENV_KEY or "..." in ENV_KEY:
    ENV_KEY = ""

CHAT_ENDPOINT = f"{GROQ_BASE_URL}/chat/completions"
MODELS_ENDPOINT = f"{GROQ_BASE_URL}/models"

app = FastAPI(title="ChatBot", docs_url="/api/docs", redoc_url=None)

SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def sse(data: dict | str) -> bytes:
    if isinstance(data, str):
        return f"data: {data}\n\n".encode("utf-8")
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


def friendly_error(status: int, text: str) -> str:
    detail = text
    try:
        detail = json.loads(text).get("error", {}).get("message", text)
    except Exception:
        pass
    if status == 401:
        return "Invalid API key. Check GROQ_API_KEY (or paste a valid key in the connection panel)."
    if status == 429:
        return "Free-tier rate limit reached. Wait a few seconds or try a lighter model such as openai/gpt-oss-20b."
    if status == 400 and "model" in str(detail).lower():
        return "That model ID isn't available on your account. Check GROQ_MODEL in .env."
    return f"Groq API error {status}: {str(detail)[:300]}"


# --------------------------------------------------------------------------
# Demo mode — no key needed, still streams token by token
# --------------------------------------------------------------------------

DEMO_REPLIES = [
    """### Hey there! 👋

This is **ChatBot**, running in *demo preview* — the interface, streaming and theme transition all work, but no API call is made yet.

Here's what happens once you add your free Groq key:

1. Your message goes to `POST /api/chat` on this FastAPI server.
2. The server forwards it to Groq's OpenAI-compatible endpoint with `stream: true`.
3. Tokens are piped straight back as **Server-Sent Events** and painted as they arrive.

```python
from openai import OpenAI

client = OpenAI(
    api_key="gsk_...",
    base_url="https://api.groq.com/openai/v1",
)
stream = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

> Add `GROQ_API_KEY` in `.env` (or use the connection panel) and this bubble becomes a real answer — typically in under a second on Groq's LPU.""",

    """Good question — here's the short version.

**Groq's LPU** is a deterministic, software-scheduled chip. Unlike a GPU, it knows where every byte will be *before* it moves, so there are no cache misses or batching stalls. That's why free-tier models still stream at **280–1000 tokens/sec**.

| You notice | Reason |
| --- | --- |
| First token almost instantly | No batching queue |
| Perfectly even streaming | Deterministic scheduling |
| No credit card needed | Generous free tier |

Three small things make a chat UI feel this fast:

- Append tokens, never re-render the whole thread
- Yield auto-scroll when the reader scrolls up
- Expose a real **Stop** button with `AbortController`

*Demo preview — connect your Groq key for live answers.*""",

    """Absolutely. Here's a compact FastAPI proxy pattern you can reuse:

```python
@app.post("/api/chat")
async def chat(req: Request):
    body = await req.json()
    async with httpx.AsyncClient(timeout=60) as client:
        upstream = await client.send(
            client.build_request(
                "POST", CHAT_ENDPOINT,
                json={"model": MODEL, "stream": True,
                      "messages": body["messages"]},
                headers={"Authorization": f"Bearer {API_KEY}"},
            ),
            stream=True,
        )
    return StreamingResponse(
        upstream.aiter_raw(), media_type="text/event-stream"
    )
```

**Why it's shaped this way**
- The key never reaches the browser.
- Raw byte pass-through keeps latency minimal.
- `httpx` handles backpressure and disconnect cleanup.

*This is a scripted demo reply. Add your key to generate real code.*""",
]


def pick_demo(messages: list[dict]) -> str:
    last = next((m.get("content", "") for m in reversed(messages) if m.get("role") == "user"), "")
    q = last.lower()
    if any(w in q for w in ("code", "python", "fastapi", "api", "function", "build", "implement")):
        return DEMO_REPLIES[2]
    if any(w in q for w in ("how", "explain", "why", "architecture", "work", "lpu", "groq")):
        return DEMO_REPLIES[1]
    return DEMO_REPLIES[0]


async def demo_stream(messages: list[dict]) -> AsyncIterator[bytes]:
    text = pick_demo(messages)
    yield sse({"choices": [{"delta": {"content": ""}}], "demo": True})
    i = 0
    while i < len(text):
        n = random.randint(3, 9)
        yield sse({"choices": [{"delta": {"content": text[i : i + n]}}]})
        i += n
        await asyncio.sleep(0.012)
    yield sse({"choices": [{"delta": {}, "finish_reason": "stop"}], "usage": {"demo": True}})
    yield sse("[DONE]")


# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------


@app.get("/api/config")
async def config():
    return {
        "demo": not ENV_KEY,
        "model": GROQ_MODEL,
        "baseUrl": GROQ_BASE_URL,
        "hasServerKey": bool(ENV_KEY),
    }


@app.post("/api/validate")
async def validate(req: Request):
    body = await req.json()
    key = str(body.get("apiKey") or ENV_KEY or "").strip()
    if not key:
        return {"ok": False, "error": "No API key provided."}
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(MODELS_ENDPOINT, headers={"Authorization": f"Bearer {key}"})
        if r.status_code != 200:
            return {"ok": False, "error": friendly_error(r.status_code, r.text)}
        ids = [m.get("id") for m in r.json().get("data", []) if m.get("id")]
        return {"ok": True, "count": len(ids), "models": ids[:40]}
    except Exception as e:
        return {"ok": False, "error": f"Network error: {e}"}


@app.post("/api/chat")
async def chat(req: Request):
    try:
        body = await req.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)

    messages = body.get("messages") or []
    if not isinstance(messages, list) or not messages:
        return JSONResponse({"error": "No messages supplied"}, status_code=400)

    api_key = str(body.get("apiKey") or ENV_KEY or "").strip()
    model = str(body.get("model") or GROQ_MODEL)[:120]
    # Groq API reference: temperature is 0..2 (default 1), and the current field
    # is `max_completion_tokens` — `max_tokens` is deprecated. Clamp + guard so
    # a bad client value can never produce a 500 or an upstream 400.
    try:
        temperature = min(max(float(body.get("temperature", 0.7)), 0.0), 2.0)
    except (TypeError, ValueError):
        temperature = 0.7
    try:
        max_tokens = min(max(int(body.get("maxTokens", 2048)), 128), 32768)
    except (TypeError, ValueError):
        max_tokens = 2048
    system = str(body.get("system") or GROQ_SYSTEM)[:8000]

    clean = [
        {"role": "assistant" if m.get("role") == "assistant" else "user",
         "content": str(m.get("content") or "")[:100000]}
        for m in messages[-40:]
    ]
    if system:
        clean.insert(0, {"role": "system", "content": system})

    if not api_key:
        return StreamingResponse(demo_stream(clean), media_type="text/event-stream", headers=SSE_HEADERS)

    payload = {
        "model": model,
        "messages": clean,
        "stream": True,
        "temperature": temperature,
        "max_completion_tokens": max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    client = httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0))
    try:
        request = client.build_request("POST", CHAT_ENDPOINT, json=payload, headers=headers)
        upstream = await client.send(request, stream=True)
    except Exception as e:
        await client.aclose()
        async def fail():
            yield sse({"error": f"Could not reach Groq: {e}"})
            yield sse("[DONE]")
        return StreamingResponse(fail(), media_type="text/event-stream", headers=SSE_HEADERS)

    if upstream.status_code != 200:
        text = (await upstream.aread()).decode("utf-8", "replace")
        await upstream.aclose()
        await client.aclose()
        msg = friendly_error(upstream.status_code, text)
        async def fail_msg():
            yield sse({"error": msg})
            yield sse("[DONE]")
        return StreamingResponse(fail_msg(), media_type="text/event-stream", headers=SSE_HEADERS)

    async def passthrough() -> AsyncIterator[bytes]:
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(passthrough(), media_type="text/event-stream", headers=SSE_HEADERS)


# Static files last, so /api/* routes win.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "127.0.0.1").strip() or "127.0.0.1"
    try:
        port = int(os.getenv("PORT", "8000"))
    except ValueError:
        port = 8000
    # 0.0.0.0 / :: are wildcard binds — browsers need a concrete loopback address.
    browse = "127.0.0.1" if host in ("0.0.0.0", "::", "") else host
    print(f"\n  ✦ ChatBot  →  http://{browse}:{port}/   (or http://localhost:{port}/)")
    print(f"  ✦ Bind        →  {host}:{port}")
    print(f"  ✦ Groq key    →  {'loaded' if ENV_KEY else 'NOT SET (demo preview)'}")
    print(f"  ✦ Model       →  {GROQ_MODEL}\n")
    uvicorn.run(app, host=host, port=port, log_level="info")