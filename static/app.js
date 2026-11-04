/* =====================================================================
   ChatBot · front-end — streaming Groq chat, theme ripple, minimal state
   ===================================================================== */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  const app = $('.app');
  const thread = $('#thread');
  const messages = $('#messages');
  const typing = $('#typing');
  const input = $('#msgInput');
  const composer = $('#composer');
  const sendBtn = $('#sendBtn');
  const toggle = $('#themeToggle');
  const connPill = $('#connPill');
  const connLabel = $('#connLabel');
  const popover = $('#connPopover');
  const ripples = $('#ripples');
  const toastEl = $('#toast');
  const EMBED = !!(window.CBW && window.CBW.embed);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const store = {
    get theme() { try { return localStorage.getItem('chatbot.theme') || localStorage.getItem('astra.theme'); } catch { return null; } },
    set theme(v) { try { localStorage.setItem('chatbot.theme', v); } catch {} },
    get key() { try { return localStorage.getItem('chatbot.key') || localStorage.getItem('astra.key') || ''; } catch { return ''; } },
    set key(v) { try { localStorage.setItem('chatbot.key', v); } catch {} },
    get model() { try { return localStorage.getItem('chatbot.model') || localStorage.getItem('astra.model') || ''; } catch { return ''; } },
    set model(v) { try { localStorage.setItem('chatbot.model', v); } catch {} },
  };

  const state = {
    theme: (window.CBW && (window.CBW.theme === 'dark' || window.CBW.theme === 'light'))
      ? window.CBW.theme
      : (store.theme === 'dark' || store.theme === 'light' ? store.theme : 'light'),
    apiKey: EMBED ? '' : store.key,
    model: store.model || 'openai/gpt-oss-120b',
    serverKey: false,
    history: [],
    busy: false,
    controller: null,
    seeded: false,
  };

  /* ---------------------- theme + water-drop transition ---------------------- */
  function applyTheme(next) {
    root.dataset.theme = next;
    app.dataset.theme = next;
    state.theme = next;
    if (!EMBED) store.theme = next;   // widget iframe must not overwrite saved theme
  }
  applyTheme(state.theme);

  function makeRipple(x, y) {
    ripples.innerHTML = '';
    ['', 'd2'].forEach((cls) => {
      const disc = document.createElement('span');
      disc.className = 'wave-disc ' + cls;
      disc.style.left = x + 'px'; disc.style.top = y + 'px';
      ripples.appendChild(disc);
    });
    const drop = document.createElement('span');
    drop.className = 'drop';
    drop.style.left = x + 'px'; drop.style.top = y + 'px';
    ripples.appendChild(drop);
    ['', 'r2', 'r3'].forEach((cls) => {
      const ring = document.createElement('span');
      ring.className = 'ring ' + cls;
      ring.style.left = x + 'px'; ring.style.top = y + 'px';
      ripples.appendChild(ring);
    });
    setTimeout(() => { ripples.innerHTML = ''; }, 1600);
  }

  function setTheme(next) {
    if (next === state.theme) return;
    const r = toggle.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (reduce) { applyTheme(next); return; }
    // A droplet lands, concentric rings spread, and the two designs melt into
    // one another underneath the wave (CSS colour transitions, 600–800ms).
    makeRipple(x, y);
    setTimeout(() => applyTheme(next), 240);
  }
  toggle.addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));

  /* ---------------------- toast ---------------------- */
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  /* ---------------------- markdown ---------------------- */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const codeStore = [];
  let codeSeq = 0;

  function highlight(raw) {
    const re = /(\/\/[^\n]*|#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(\d+(?:\.\d+)?)\b|\b(const|let|var|def|from|import|await|async|for|in|of|return|print|class|if|else|with|as|yield|True|False|None|null|true|false)\b/g;
    let out = '', last = 0, m;
    while ((m = re.exec(raw))) {
      out += esc(raw.slice(last, m.index));
      const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : 'k';
      out += `<span class="${cls}">${esc(m[0])}</span>`;
      last = re.lastIndex;
    }
    return out + esc(raw.slice(last));
  }

  function inline(text) {
    const holders = [];
    let s = String(text).replace(/`([^`\n]+)`/g, (_, c) => {
      holders.push(`<code class="inline">${esc(c)}</code>`);
      return `\u0001${holders.length - 1}\u0001`;
    });
    s = esc(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
         .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
         .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => holders[+i]);
    return s;
  }

  function markdown(src) {
    const text = String(src || '');
    let body = text.replace(/```([\w+-]*)\n([\s\S]*?)(?:```|$)/g, (_, lang, code) => {
      const id = codeSeq++;
      codeStore[id] = code.replace(/\n$/, '');
      return `\u0000B${id}\u0000`;
    });

    const lines = body.split('\n');
    const out = [];
    let para = [], list = null, quote = [], table = [];

    const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join('<br>'))}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
    const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${inline(quote.join('<br>'))}</blockquote>`); quote = []; } };
    const flushTable = () => {
      if (!table.length) return;
      const rows = table.map(r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      const head = rows[0] || [];
      const rest = rows.slice(1).filter(r => !r.every(c => /^:?-{2,}:?$/.test(c)));
      out.push(`<table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rest.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      table = [];
    };
    const flushAll = () => { flushPara(); flushList(); flushQuote(); flushTable(); };

    for (const line of lines) {
      const holder = line.match(/^\u0000B(\d+)\u0000$/);
      if (holder) {
        flushAll();
        const id = +holder[1];
        out.push(`<div class="code-block"><div class="code-head"><span>code</span><button type="button" data-copy="${id}">⧉ Copy</button></div><pre>${highlight(codeStore[id] || '')}</pre></div>`);
        continue;
      }
      if (/^\s*$/.test(line)) { flushAll(); continue; }
      if (/^\|.*\|/.test(line)) { flushPara(); flushList(); flushQuote(); table.push(line); continue; }
      if (/^#{3,4}\s/.test(line)) { flushAll(); out.push(`<h${line.match(/^#+/)[0].length === 3 ? 3 : 4}>${inline(line.replace(/^#+\s*/, ''))}</h${line.match(/^#+/)[0].length === 3 ? 3 : 4}>`); continue; }
      if (/^>\s?/.test(line)) { flushPara(); flushList(); flushTable(); quote.push(line.replace(/^>\s?/, '')); continue; }
      if (/^---+$/.test(line)) { flushAll(); out.push('<hr style="border:0;border-top:1px solid var(--border-2);margin:12px 0">'); continue; }
      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        flushPara(); flushQuote(); flushTable();
        const tag = ul ? 'ul' : 'ol';
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push((ul || ol)[1]);
        continue;
      }
      flushList(); flushQuote(); flushTable();
      para.push(line);
    }
    flushAll();
    return out.join('') || '<p></p>';
  }

  /* ---------------------- messages ---------------------- */
  const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const avatar = () => '<span class="bot-av"><span class="art art-dark"></span><span class="art art-light"></span></span>';

  function scrollDown(smooth = true) {
    requestAnimationFrame(() => thread.scrollTo({ top: thread.scrollHeight, behavior: smooth && !reduce ? 'smooth' : 'auto' }));
  }

  function addMessage(role, text, opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    wrap.dataset.raw = text;
    if (role === 'user') {
      wrap.innerHTML = `<span class="av-me">YOU</span><div class="msg-body"><div class="bubble"></div><div class="meta">${now()} <span class="tick">✓✓</span></div></div>`;
      wrap.querySelector('.bubble').textContent = text;
    } else {
      wrap.innerHTML = `${avatar()}<div class="msg-body"><div class="name"><b>ChatBot</b><span class="badge">${esc(shortModel(state.model))}</span></div><div class="bubble md"></div><div class="meta">${now()}</div><div class="msg-actions"><button data-act="copy" type="button">⧉ Copy</button><button data-act="regen" type="button">↻ Regenerate</button></div></div>`;
    }
    if (opts.error) wrap.querySelector('.bubble').classList.add('error');
    if (opts.streaming) wrap.querySelector('.bubble').innerHTML = '<span class="caret"></span>';
    messages.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function renderBot(wrap, raw, streaming) {
    wrap.dataset.raw = raw;
    wrap.querySelector('.bubble').innerHTML = markdown(raw) + (streaming ? '<span class="caret"></span>' : '');
    scrollDown(false);
  }

  function shortModel(id) {
    if (!id) return 'GROQ';
    const n = id.split('/').pop();
    if (n.includes('llama-3.3')) return 'LLAMA 3.3 70B';
    if (n.includes('llama-3.1')) return 'LLAMA 3.1 8B';
    if (n.includes('gpt-oss-120')) return 'GPT-OSS 120B';
    if (n.includes('gpt-oss-20')) return 'GPT-OSS 20B';
    return n.toUpperCase().slice(0, 22);
  }

  /* ---------------------- streaming chat ---------------------- */
  async function streamChat(text, regen = false) {
    if (state.busy) return;
    state.busy = true;
    sendBtn.classList.add('stopping');
    sendBtn.setAttribute('aria-label', 'Stop generating');

    if (!regen) {
      state.history.push({ role: 'user', content: text });
      addMessage('user', text);
    }
    showTyping(true);
    state.controller = new AbortController();
    const botWrap = addMessage('bot', '', { streaming: false });
    botWrap.style.display = 'none';

    let full = '', shown = '', raf = 0;
    const paint = () => {
      raf = 0;
      if (full === shown) return;
      shown = full;
      botWrap.style.display = '';
      renderBot(botWrap, shown, true);
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: state.history,
          model: state.model,
          apiKey: state.apiKey,
          temperature: 0.7,
          widget: EMBED,
        }),
        signal: state.controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop();
        for (const rawLine of parts) {
          const line = rawLine.trim();
          if (!line || line.startsWith(':')) continue;
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') { done = true; break; }
          let obj;
          try { obj = JSON.parse(data); } catch { continue; }
          if (obj.error) throw new Error(obj.error);
          const delta = obj.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            if (!raf) raf = requestAnimationFrame(paint);
          }
        }
      }
      if (raf) cancelAnimationFrame(raf);
      showTyping(false);
      botWrap.style.display = '';
      renderBot(botWrap, full || '(empty response)', false);
      state.history.push({ role: 'assistant', content: full });
      const meta = botWrap.querySelector('.meta');
      if (meta) meta.textContent = `${now()} · streamed`;
    } catch (err) {
      if (raf) cancelAnimationFrame(raf);
      showTyping(false);
      const stopped = err.name === 'AbortError';
      botWrap.style.display = '';
      if (full) {
        renderBot(botWrap, full, false);
        state.history.push({ role: 'assistant', content: full });
        botWrap.querySelector('.meta').textContent = now() + ' · stopped';
      } else {
        botWrap.querySelector('.bubble').classList.add('error');
        botWrap.querySelector('.bubble').textContent = stopped ? 'Generation stopped.' : `⚠ ${err.message}`;
        botWrap.querySelector('.msg-actions').remove();
      }
      if (!stopped) toast(err.message);
    } finally {
      state.busy = false;
      state.controller = null;
      sendBtn.classList.remove('stopping');
      sendBtn.setAttribute('aria-label', 'Send message');
      scrollDown();
    }
  }

  function showTyping(on) { typing.classList.toggle('hidden', !on); if (on) scrollDown(); }

  /* ---------------------- composer events ---------------------- */
  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }
  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composer.requestSubmit(); }
  });
  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.busy) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = ''; resizeInput();
    streamChat(text);
  });
  sendBtn.addEventListener('click', (e) => {
    if (state.busy) { e.preventDefault(); state.controller?.abort(); }
  });
  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    if (state.busy) return;
    input.value = c.dataset.fill; resizeInput(); input.focus();
    composer.requestSubmit();
  }));

  messages.addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const code = codeStore[+copy.dataset.copy] || '';
      try { await navigator.clipboard.writeText(code); } catch {
        const t = document.createElement('textarea'); t.value = code; document.body.appendChild(t);
        t.select(); try { document.execCommand('copy'); } catch {} t.remove();
      }
      copy.textContent = '✓ Copied'; setTimeout(() => { copy.textContent = '⧉ Copy'; }, 1600);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const wrap = act.closest('.msg');
    if (act.dataset.act === 'copy') {
      const raw = wrap.dataset.raw || '';
      try { await navigator.clipboard.writeText(raw); } catch {}
      toast('Message copied');
    } else if (act.dataset.act === 'regen' && !state.busy) {
      const lastUser = [...state.history].reverse().find((m) => m.role === 'user');
      if (!lastUser) return;
      const idx = state.history.lastIndexOf(lastUser);
      state.history = state.history.slice(0, idx + 1);
      wrap.remove();
      streamChat(lastUser.content, true);
    }
  });

  /* ---------------------- connection panel ---------------------- */
  function updateConn() {
    const live = Boolean(state.apiKey || state.serverKey);
    connPill.classList.toggle('live', live);
    connLabel.textContent = live ? 'Live · ' + shortModel(state.model) : 'No key set';
  }

  function openPop() {
    popover.hidden = false;
    connPill.setAttribute('aria-expanded', 'true');
    $('#keyInput').value = state.apiKey;
    $('#modelInput').value = state.model;
    $('#popResult').hidden = true;
  }
  function closePop() {
    popover.hidden = true;
    connPill.setAttribute('aria-expanded', 'false');
  }
  connPill.addEventListener('click', () => popover.hidden ? openPop() : closePop());
  $('#popClose').addEventListener('click', closePop);
  document.addEventListener('click', (e) => {
    if (!popover.hidden && !popover.contains(e.target) && !connPill.contains(e.target)) closePop();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });

  $('#eyeBtn').addEventListener('click', () => {
    const k = $('#keyInput');
    k.type = k.type === 'password' ? 'text' : 'password';
  });

  $('#saveBtn').addEventListener('click', () => {
    state.apiKey = $('#keyInput').value.trim();
    state.model = $('#modelInput').value.trim() || 'openai/gpt-oss-120b';
    store.key = state.apiKey; store.model = state.model;
    updateConn();
    $('#popResult').hidden = false;
    $('#popResult').className = 'pop-result ok';
    $('#popResult').textContent = state.apiKey ? 'Saved. New messages will use your Groq key.' : 'Using server configuration.';
    toast('Connection saved');
  });

  $('#testBtn').addEventListener('click', async () => {
    const key = $('#keyInput').value.trim();
    const result = $('#popResult');
    result.hidden = false;
    result.className = 'pop-result';
    result.textContent = 'Testing…';
    try {
      const res = await fetch('/api/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      result.className = 'pop-result ' + (data.ok ? 'ok' : 'bad');
      result.textContent = data.ok ? `✓ Connected — ${data.count} models available.` : `✕ ${data.error}`;
    } catch (e) {
      result.className = 'pop-result bad';
      result.textContent = '✕ ' + e.message;
    }
  });

  /* ---------------------- init ---------------------- */
  fetch('/api/config').then((r) => r.json()).then((cfg) => {
    state.serverKey = Boolean(cfg.hasServerKey);
    if ((EMBED || !store.model) && cfg.model) { state.model = cfg.model; $('#modelInput').value = cfg.model; }
    updateConn();
  }).catch(() => updateConn());

  // A friendly greeting so the first screen matches the reference.
  // It is display-only — real API history starts with the user's first turn.
  const greet = addMessage('bot', 'Hi! How can I help you with School ERP today?');
  greet.querySelector('.meta').textContent = '10:24 AM';
  greet.dataset.raw = 'Hi! How can I help you with School ERP today?';
  greet.querySelector('.bubble').textContent = 'Hi! How can I help you with School ERP today?';
  greet.querySelector('.msg-actions').remove();

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); state.history = []; messages.innerHTML = ''; toast('New conversation'); input.focus(); }
    if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); input.focus(); }
  });

  resizeInput();
  updateConn();
})();
