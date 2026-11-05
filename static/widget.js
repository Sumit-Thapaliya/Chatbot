
(function () {
  'use strict';

  if (window.ChatBotWidget) return;

  var me = document.currentScript;
  if (!me) {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (/\/widget\.js(\?|$)/.test(scripts[i].src)) { me = scripts[i]; break; }
    }
  }
  if (!me || !me.src) return;

  var globals = window.ChatBotWidgetConfig || {};
  function opt(name, fallback) {
    var v = me.getAttribute('data-' + name);
    if (v === null || v === '') v = globals[name];
    return (v === undefined || v === null || v === '') ? fallback : v;
  }
  function num(name, fallback, min) {
    var n = parseInt(opt(name, fallback), 10);
    return isNaN(n) ? fallback : Math.max(min, n);
  }
  function yes(name, fallback) {
    var v = String(opt(name, fallback)).toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  var server   = String(opt('server', new URL(me.src, location.href).origin)).replace(/\/+$/, '');
  var title    = String(opt('title', 'School ERP Assistant'));
  var subtitle = String(opt('subtitle', 'Admissions, fees, attendance & more'));
  var accent0  = String(opt('accent', '#165c95'));
  var accent   = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent0) ? accent0 : '#165c95';
  var position = String(opt('position', 'right')) === 'left' ? 'left' : 'right';
  var side     = num('side', 20, 0);
  var bottom   = num('bottom', 20, 0);
  var width    = num('width', 380, 280);
  var height   = num('height', 560, 360);
  var themeSetting = String(opt('theme', 'auto'));
  function currentTheme() {
    if (themeSetting === 'dark' || themeSetting === 'light') return themeSetting;
    if (document.documentElement.classList.contains('dark')) return 'dark';
    if (document.documentElement.classList.contains('light')) return 'light';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  var autoOpen   = yes('auto-open', false);
  var draggable  = yes('draggable', true);
  var remember   = yes('remember-position', false);
  var POS_KEY    = 'chatbot.widget.pos';
  var SIZE       = 58;

  var css = document.createElement('style');
  css.textContent = `
#cbw-launch{position:fixed;bottom:${bottom}px;${position}:${side}px;z-index:2147483000;
  width:${SIZE}px;height:${SIZE}px;border:0;border-radius:50%;cursor:grab;background:var(--primary, ${accent});
  color:var(--primary-foreground, #ffffff);display:flex;align-items:center;justify-content:center;padding:0;
  touch-action:none;user-select:none;-webkit-user-select:none;
  box-shadow:0 12px 30px rgba(0,0,0,.28);transition:transform .25s ease,box-shadow .25s ease;}
#cbw-launch:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 18px 38px rgba(0,0,0,.34);}
#cbw-launch:focus-visible{outline:3px solid #fff;outline-offset:3px;}
#cbw-launch.cbw-dragging{cursor:grabbing;transform:none!important;transition:none;
  box-shadow:0 22px 44px rgba(0,0,0,.4);}
#cbw-launch svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:2;
  stroke-linecap:round;stroke-linejoin:round;pointer-events:none;}
#cbw-launch .cbw-x{display:none;}
#cbw-launch.cbw-isopen .cbw-bubble{display:none;}
#cbw-launch.cbw-isopen .cbw-x{display:block;}
#cbw-launch.cbw-isopen.cbw-cover{visibility:hidden;pointer-events:none;}
#cbw-panel{position:fixed;bottom:${bottom + 74}px;${position}:${side}px;z-index:2147483000;
  width:${width}px;height:${height}px;box-sizing:border-box;
  display:flex;flex-direction:column;overflow:hidden;border-radius:18px;
  background:var(--card, #ffffff);color:var(--card-foreground, #0f2433);border:1px solid var(--border, #dbe7ec);box-shadow:0 24px 70px rgba(15,36,51,.24);
  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  opacity:0;transform:translateY(14px) scale(.98);pointer-events:none;
  transition:opacity .26s ease,transform .26s cubic-bezier(.2,.8,.2,1);}
#cbw-panel.open{opacity:1;transform:none;pointer-events:auto;}
#cbw-head{flex:none;display:flex;align-items:center;gap:10px;padding:12px 14px;
  background:var(--primary, ${accent});color:var(--primary-foreground, #ffffff);}
#cbw-head .cbw-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
#cbw-head b{font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#cbw-head small{font-size:10.5px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#cbw-close{flex:none;width:28px;height:28px;border:0;border-radius:50%;cursor:pointer;
  background:rgba(255,255,255,.2);color:#fff;font-size:14px;line-height:1;}
#cbw-close:hover{background:rgba(255,255,255,.34);}
#cbw-frame{flex:1 1 0;min-height:0;width:100%;border:0;background:transparent;}
@media (prefers-reduced-motion:reduce){#cbw-launch,#cbw-panel{transition:none!important;}}
`;
  document.head.appendChild(css);

  var launch = document.createElement('button');
  launch.id = 'cbw-launch';
  launch.type = 'button';
  launch.setAttribute('aria-label', 'Open chat with ' + title);
  launch.setAttribute('aria-expanded', 'false');
  launch.title = title + ' (drag to move)';
  launch.innerHTML =
    '<svg class="cbw-bubble" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9 9 0 0 1-3.8-.8L3 21l1.8-5.2A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"/></svg>' +
    '<svg class="cbw-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  var panel = document.createElement('div');
  panel.id = 'cbw-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', title);

  var head = document.createElement('div');
  head.id = 'cbw-head';
  var titles = document.createElement('div');
  titles.className = 'cbw-t';
  var b = document.createElement('b'); b.textContent = title;
  var s = document.createElement('small'); s.textContent = subtitle;
  titles.appendChild(b); titles.appendChild(s);
  var closeButton = document.createElement('button');
  closeButton.id = 'cbw-close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close chat');
  closeButton.textContent = '✕';
  head.appendChild(titles); head.appendChild(closeButton);

  var frame = document.createElement('iframe');
  frame.id = 'cbw-frame';
  frame.title = title + ' chat';
  frame.setAttribute('allow', 'clipboard-write');
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.loading = 'lazy';

  panel.appendChild(head); panel.appendChild(frame);
  (document.body || document.documentElement).appendChild(panel);
  (document.body || document.documentElement).appendChild(launch);

  
  var frameUrl = server + '/chat.html?theme=' + encodeURIComponent(currentTheme());
  var frameOrigin = new URL(server, location.href).origin;
  function syncTheme() {
    if (loaded && frame.contentWindow) frame.contentWindow.postMessage({ type: 'cbw-theme', theme: currentTheme() }, frameOrigin);
  }
  frame.addEventListener('load', syncTheme);
  if (themeSetting === 'auto') {
    new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    if (window.matchMedia) {
      var media = window.matchMedia('(prefers-color-scheme: dark)');
      if (media.addEventListener) media.addEventListener('change', syncTheme);
    }
  }
  var loaded = false;

  
  function layout() {
    var visual = window.visualViewport;
    var vx = visual ? visual.offsetLeft : 0;
    var vy = visual ? visual.offsetTop : 0;
    var vw = visual ? visual.width : window.innerWidth;
    var vh = visual ? visual.height : window.innerHeight;
    var margin = 12;
    var gap = 12;
    var maxWidth = Math.max(0, vw - margin * 2);
    var maxHeight = Math.max(0, vh - margin * 2);
    var r = launch.getBoundingClientRect();
    var pw = Math.min(width, maxWidth);
    var ph = Math.min(height, maxHeight);
    var above = r.top - (vy + margin) - gap;
    var below = vy + vh - margin - r.bottom - gap;
    var leftSpace = r.left - (vx + margin) - gap;
    var rightSpace = vx + vw - margin - r.right - gap;
    var x;
    var y;
    var cover = false;

    if (vw <= 480) {
      cover = true;
      x = vx + margin;
      y = vy + margin;
      pw = maxWidth;
      ph = maxHeight;
    } else if (Math.max(above, below) >= 280) {
      var placeAbove = above >= below;
      ph = Math.min(height, placeAbove ? above : below);
      x = clamp(position === 'right' ? r.right - pw : r.left, vx + margin, vx + vw - margin - pw);
      y = placeAbove ? r.top - gap - ph : r.bottom + gap;
    } else if (Math.max(leftSpace, rightSpace) >= 280) {
      var placeLeft = leftSpace >= rightSpace;
      pw = Math.min(width, placeLeft ? leftSpace : rightSpace);
      x = placeLeft ? r.left - gap - pw : r.right + gap;
      y = clamp(r.top + r.height / 2 - ph / 2, vy + margin, vy + vh - margin - ph);
    } else {
      cover = true;
      x = vx + margin + (maxWidth - pw) / 2;
      y = vy + margin + (maxHeight - ph) / 2;
    }

    launch.classList.toggle('cbw-cover', cover);
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = pw + 'px';
    panel.style.height = ph + 'px';
  }

  function setOpen(open) {
    if (open && !loaded) { frame.src = frameUrl; loaded = true; }
    if (open) layout();
    panel.classList.toggle('open', open);
    launch.classList.toggle('cbw-isopen', open);
    launch.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function open()  { setOpen(true); }
  function close() { setOpen(false); }
  function toggle(){ setOpen(!panel.classList.contains('open')); }

  
  function savePos() {
    if (!remember) return;
    var r = launch.getBoundingClientRect();
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (e) {}
  }
  function restorePos() {
    if (!remember) return;
    try {
      var p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (p && typeof p.x === 'number' && typeof p.y === 'number') {
        launch.style.left = clamp(p.x, 8, window.innerWidth - SIZE - 8) + 'px';
        launch.style.top = clamp(p.y, 8, window.innerHeight - SIZE - 8) + 'px';
        launch.style.right = 'auto'; launch.style.bottom = 'auto';
      }
    } catch (e) {}
  }
  function resetPosition() {
    launch.style.left = ''; launch.style.top = '';
    launch.style.right = ''; launch.style.bottom = '';
    try { localStorage.removeItem(POS_KEY); } catch (e) {}
    layout();
  }

  var dragging = false, moved = false, suppressClick = false;
  var startX = 0, startY = 0, originX = 0, originY = 0;

  if (draggable) {
    launch.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var r = launch.getBoundingClientRect();
      launch.style.left = r.left + 'px'; launch.style.top = r.top + 'px';
      launch.style.right = 'auto'; launch.style.bottom = 'auto';
      startX = e.clientX; startY = e.clientY;
      originX = r.left; originY = r.top;
      moved = false; dragging = true;
      launch.classList.add('cbw-dragging');
      try { launch.setPointerCapture(e.pointerId); } catch (err) {}
    });
    launch.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      launch.style.left = clamp(originX + dx, 8, window.innerWidth - SIZE - 8) + 'px';
      launch.style.top = clamp(originY + dy, 8, window.innerHeight - SIZE - 8) + 'px';
      if (panel.classList.contains('open')) layout();
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      launch.classList.remove('cbw-dragging');
      try { launch.releasePointerCapture(e.pointerId); } catch (err) {}
      if (moved) { suppressClick = true; savePos(); layout(); }
    }
    launch.addEventListener('pointerup', endDrag);
    launch.addEventListener('pointercancel', endDrag);
  }

  launch.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
    toggle();
  });
  closeButton.addEventListener('click', function () { close(); launch.focus(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) close();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', layout);
    window.visualViewport.addEventListener('scroll', layout);
  }
  window.addEventListener('resize', function () {
    var r = launch.getBoundingClientRect();
    if (r.left > window.innerWidth - SIZE || r.top > window.innerHeight - SIZE) {
      launch.style.left = clamp(r.left, 8, window.innerWidth - SIZE - 8) + 'px';
      launch.style.top = clamp(r.top, 8, window.innerHeight - SIZE - 8) + 'px';
    }
    layout();
  });

  window.ChatBotWidget = {
    open: open, close: close, toggle: toggle,
    resetPosition: resetPosition,
  };

  restorePos();
  layout();
  if (autoOpen) open();
})();
