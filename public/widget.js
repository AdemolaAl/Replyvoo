/* Replyvoo website chat widget. Vanilla JS, no dependencies, renders inside a Shadow DOM.
   Install: <script src="https://YOUR-REPLYVOO-URL/widget.js" data-key="wk_..." async></script>
   Modes: live (data-key, talks to /w/:key/*; add data-page="<element id>" for the full-page chat link at /c/<slug>), house (Replyvoo's own site, /api/public/*),
   preview (Widget Studio: ReplyvooWidget.mount(el, config, {preview:true}) — never touches the network).
   API: window.Replyvoo.open() / .close() / .toggle() / .identify({ name, email, phone }) */
(function () {
  'use strict';
  if (window.ReplyvooWidget) return;
  var me = document.currentScript || document.querySelector('script[src*="widget.js"][data-key],script[src*="widget.js"][data-house],script[src*="widget.js"][data-preview]');
  var BASE = '';
  try { BASE = me ? new URL(me.src, location.href).origin : location.origin; } catch (e) { BASE = location.origin; }
  var SVG = 'http://www.w3.org/2000/svg';
  var ICON = {
    chat: 'M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.2-4.2A7.5 7.5 0 1 1 20 11.5z',
    close: 'M6 6l12 12M18 6 6 18', send: 'M5 12h13M12 5l7 7-7 7', down: 'M6 9l6 6 6-6',
    plane: 'M21 4 3 11l6 2.5M21 4l-4 16-8-6.5M21 4 9 13.5V19l3-3.2', spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z'
  };
  var JUNO = '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><rect width="64" height="64" rx="32" fill="#FFC21A"/><path d="M17 25c0-7 5-12 12-12h7c7 0 12 5 12 12v12c0 7-5 12-12 12h-8l-7 6 1-7c-3-2-5-6-5-10z" fill="#fff" stroke="#121110" stroke-width="2.6" stroke-linejoin="round"/><circle cx="27" cy="29" r="3" fill="#121110"/><circle cx="38" cy="29" r="3" fill="#121110"/><path d="M28 37q4 4 9 0" stroke="#121110" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>';

  /* ---------- helpers ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v; else if (k === 'cls') el.className = v; else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function icon(name, size, sw) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size || 20); s.setAttribute('height', size || 20); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', sw || 2.2); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    var p = document.createElementNS(SVG, 'path'); p.setAttribute('d', ICON[name] || name); s.appendChild(p);
    return s;
  }
  // Text → DOM with safe links. Only http(s) URLs become links; nothing is ever parsed as HTML.
  function linkify(text) {
    var frag = document.createDocumentFragment(), s = String(text == null ? '' : text), re = /https?:\/\/[^\s<>"']+/gi, last = 0, m;
    while ((m = re.exec(s))) {
      var url = m[0].replace(/[.,!?:;)\]]+$/, ''), end = m.index + url.length, ok = false;
      try { var u = new URL(url); ok = u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { ok = false; }
      if (!ok) continue;
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      frag.appendChild(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer nofollow', text: url.length > 60 ? url.slice(0, 57) + '…' : url }));
      last = end; re.lastIndex = end;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    return frag;
  }
  function rid(n) { var a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', out = '', b = new Uint8Array(n); (window.crypto || window.msCrypto).getRandomValues(b); for (var i = 0; i < n; i++) out += a[b[i] % 62]; return out; }
  function store(ns) {
    return {
      get: function () { try { return JSON.parse(localStorage.getItem(ns) || 'null') || {}; } catch (e) { return {}; } },
      set: function (v) { try { localStorage.setItem(ns, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
    };
  }
  function hexRgb(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); var n = m ? parseInt(m[1], 16) : 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  var reduced = function () { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; };
  function timing(w, text) {
    var min = Math.max(0, +w.delay_min || 0), max = Math.max(min, +w.delay_max || 0), sec;
    if (w.human_typing) sec = Math.min(max, Math.max(min, min * 0.6 + String(text || '').length / Math.max(5, w.typing_cps || 22)));
    else sec = min + Math.random() * (max - min);
    return Math.round(sec * 1000);
  }
  var fontsLoaded = {};
  function loadFont(css) {
    if (!css || fontsLoaded[css]) return; fontsLoaded[css] = 1;
    // @font-face does not work inside a shadow root, so the font stylesheet goes in <head>. It only declares fonts.
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + css + '&display=swap';
    (document.head || document.documentElement).appendChild(l);
  }

  /* ---------- styles ---------- */
  var CSS = [
    ':host{all:initial}',
    '[hidden]{display:none!important}',
    '.rv{all:initial;font-family:var(--font);font-size:15px;line-height:1.45;color:var(--text);letter-spacing:normal;text-transform:none;font-style:normal;font-weight:400;-webkit-font-smoothing:antialiased;direction:ltr;text-align:left}',
    ':where(.rv *,.rv *::before,.rv *::after){box-sizing:border-box;font-family:inherit;letter-spacing:inherit;margin:0;padding:0}',
    ':where(.rv button){font:inherit;color:inherit;background:none;border:0;cursor:pointer;text-align:inherit;-webkit-tap-highlight-color:transparent}',
    '.rv :focus-visible{outline:3px solid var(--ring);outline-offset:2px}',
    '.sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '.fx{position:fixed;z-index:2147483000}.rv.contained .fx{position:absolute}',
    '.launcher{bottom:var(--oy);display:flex;align-items:center;gap:10px;height:60px;min-width:60px;padding:0;justify-content:center;border-radius:999px;background:var(--primary);color:var(--ptext);box-shadow:0 14px 34px -10px rgba(0,0,0,.45),0 2px 6px rgba(0,0,0,.12);transition:transform .25s cubic-bezier(.2,.9,.3,1.3),opacity .2s;pointer-events:auto}',
    '.launcher:hover{transform:translateY(-2px) scale(1.04)}.launcher:active{transform:scale(.96)}',
    '.rv[data-pos=right] .launcher,.rv[data-pos=right] .greet,.rv[data-pos=right] .panel{right:var(--ox)}.rv[data-pos=left] .launcher,.rv[data-pos=left] .greet,.rv[data-pos=left] .panel{left:var(--ox)}',
    '.launcher.pill{padding:0 22px 0 16px;font-weight:700;font-size:15px}.launcher.avatar{padding:0;width:62px;height:62px;border:3px solid var(--primary);background:var(--panel)}',
    '.launcher .lim{width:30px;height:30px;border-radius:50%;object-fit:cover}.launcher.avatar .av{width:56px;height:56px;font-size:20px}',
    '.launcher .ldot{position:absolute;right:2px;bottom:2px;width:14px;height:14px;border-radius:50%;background:#22C55E;border:3px solid var(--panel)}',
    '.badge{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#FF4D3A;color:#fff;font:800 12px/22px var(--font);text-align:center;box-shadow:0 0 0 3px var(--panel);animation:pop .35s}',
    '.rv.open .launcher{opacity:0;transform:scale(.6);pointer-events:none}',
    '.greet{bottom:calc(var(--oy) + 74px);max-width:min(300px,calc(100vw - 32px));display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:auto;animation:rise .45s cubic-bezier(.2,.9,.3,1.2)}',
    '.rv[data-pos=left] .greet{align-items:flex-start}',
    '.greet-b{background:var(--panel);color:var(--text);padding:13px 16px;border-radius:18px 18px 6px 18px;box-shadow:0 18px 40px -16px rgba(0,0,0,.4),0 0 0 1px var(--line);font-size:14.5px;display:flex;gap:10px;align-items:flex-start}',
    '.rv[data-pos=left] .greet-b{border-radius:18px 18px 18px 6px}',
    '.greet-x{width:26px;height:26px;border-radius:50%;background:var(--panel);box-shadow:0 0 0 1px var(--line);display:grid;place-items:center;color:var(--mut)}',
    '.panel{bottom:calc(var(--oy) + 8px);width:var(--w);height:min(var(--h),calc(100% - var(--oy) - 24px));max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:var(--panel);color:var(--text);border-radius:var(--r);overflow:hidden;box-shadow:0 30px 80px -24px rgba(0,0,0,.5),0 0 0 1px var(--line);pointer-events:auto;transform-origin:var(--origin);transition:transform .32s cubic-bezier(.2,.9,.3,1.1),opacity .22s;opacity:0;transform:translateY(16px) scale(.94);visibility:hidden}',
    '.rv:not(.contained) .panel{height:min(var(--h),calc(100vh - var(--oy) - 32px))}',
    '.rv.open .panel{opacity:1;transform:none;visibility:visible}',
    '.rv.glass .panel{background:rgba(var(--panel-rgb),.74);-webkit-backdrop-filter:blur(22px) saturate(1.5);backdrop-filter:blur(22px) saturate(1.5)}',
    '.head{display:flex;align-items:center;gap:12px;padding:16px 14px 16px 16px;background:var(--hbg);color:var(--htext);flex:0 0 auto;position:relative}',
    '.av{width:42px;height:42px;flex:0 0 auto;border-radius:50%;display:grid;place-items:center;background:var(--primary);color:var(--ptext);font-weight:800;font-size:16px;overflow:hidden;position:relative}',
    '.av img{width:100%;height:100%;object-fit:cover}.logo{height:38px;max-width:120px;object-fit:contain;flex:0 0 auto}',
    '.who{display:flex;flex-direction:column;min-width:0;flex:1}.who strong{font-weight:800;font-size:16px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.sub{font-size:12.5px;opacity:.82;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.dot{width:8px;height:8px;border-radius:50%;background:#22C55E;flex:0 0 auto}.dot.off{background:#A3A3A3}',
    '.x{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:rgba(127,127,127,.16)}.x:hover{background:rgba(127,127,127,.28)}',
    '.disc{display:flex;align-items:center;gap:6px;justify-content:center;font-size:11.5px;font-weight:700;color:var(--mut);padding:7px 12px;border-bottom:1px solid var(--line);flex:0 0 auto}',
    '.disc i{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:5px;background:var(--primary);color:var(--ptext)}',
    '.log{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:16px 14px 8px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth}',
    '.msg{max-width:84%;padding:10px 14px;border-radius:var(--br);font-size:14.5px;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;animation:rise .3s ease both}',
    '.msg a{color:inherit;text-decoration:underline;text-underline-offset:2px;font-weight:600}',
    '.msg.in{align-self:flex-start;background:var(--bin);color:var(--bintext);border-bottom-left-radius:6px}',
    '.msg.me{align-self:flex-end;background:var(--bout);color:var(--bouttext);border-bottom-right-radius:6px}',
    '.lbl{font-size:11px;font-weight:700;color:var(--mut);margin:4px 4px -4px;align-self:flex-start}',
    '.note{align-self:center;max-width:92%;text-align:center;font-size:12.5px;color:var(--mut);background:var(--soft);padding:8px 12px;border-radius:12px;animation:rise .3s both}',
    '.typing{align-self:flex-start;display:flex;gap:5px;padding:14px 16px;background:var(--bin);border-radius:var(--br);border-bottom-left-radius:6px}',
    '.typing span{width:7px;height:7px;border-radius:50%;background:var(--bintext);opacity:.45}',
    '.chips{display:flex;flex-wrap:wrap;gap:6px;padding:4px 14px 10px;flex:0 0 auto}',
    '.chip{padding:8px 13px;border-radius:999px;font-size:13.5px;font-weight:600;background:var(--panel);box-shadow:inset 0 0 0 1.5px var(--primary-a);color:var(--text);transition:background .15s}.chip:hover{background:var(--soft)}',
    '.compose{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--line);flex:0 0 auto;background:var(--panel)}.rv.glass .compose{background:transparent}',
    '.compose textarea{flex:1;resize:none;border:0;outline:0;background:var(--soft);color:var(--text);font:inherit;font-size:15px;line-height:1.4;border-radius:14px;padding:11px 14px;max-height:120px;min-height:44px}',
    '.compose textarea:focus{box-shadow:0 0 0 2px var(--primary-a)}.compose textarea:focus-visible{outline:0}.compose textarea::placeholder{color:var(--mut)}',
    '.send{width:44px;height:44px;border-radius:14px;background:var(--primary);color:var(--ptext);display:grid;place-items:center;flex:0 0 auto;transition:transform .15s}.send:disabled{opacity:.45;cursor:default}.send:not(:disabled):hover{transform:scale(1.06)}',
    '.foot{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:0 12px 10px;font-size:11.5px;color:var(--mut);flex:0 0 auto;background:var(--panel)}.rv.glass .foot{background:transparent}',
    '.foot a{color:inherit;text-decoration:none;font-weight:700}.foot a:hover{text-decoration:underline}',
    '.tg{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;background:#2AABEE;color:#fff!important;font-weight:700}',
    '.lead{align-self:stretch;background:var(--panel);box-shadow:0 0 0 1px var(--line),0 10px 24px -16px rgba(0,0,0,.3);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px;animation:rise .35s both}',
    '.lead strong{font-size:14.5px}.lead label{font-size:12px;font-weight:700;color:var(--mut)}',
    '.lead input{width:100%;border:1.5px solid var(--line);background:var(--panel);color:var(--text);border-radius:11px;padding:10px 12px;font:inherit;font-size:14.5px;outline:0}.lead input:focus{border-color:var(--primary)}',
    '.lead .row{display:flex;gap:8px}.btn{flex:1;padding:11px 14px;border-radius:12px;background:var(--primary);color:var(--ptext);font-weight:800;text-align:center}.btn.ghost{flex:0 0 auto;background:var(--soft);color:var(--text)}',
    '.err{color:#D93A1F;font-size:12.5px;font-weight:700}',
    '.rv.m .panel{inset:0!important;width:100%;height:100%!important;max-height:none;border-radius:0}',
    '.rv.m.open .greet{display:none}',
    '.rv.page .panel{inset:0!important;width:100%!important;height:100%!important;max-height:none!important;max-width:none!important;border-radius:0;box-shadow:none;opacity:1;transform:none;visibility:visible}',
    '.rv.page .launcher,.rv.page .greet,.rv.page .x{display:none!important}',
    '.rv[data-size=compact]{--w:340px;--h:500px}.rv[data-size=normal]{--w:380px;--h:600px}.rv[data-size=large]{--w:420px;--h:700px}',
    '.rv:not(.m) .panel{max-width:calc(100% - 24px)}',
    '@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@keyframes pop{0%{transform:scale(.4)}70%{transform:scale(1.15)}to{transform:scale(1)}}',
    '@keyframes blink{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:.9;transform:translateY(-3px)}}@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}',
    '@media (prefers-reduced-motion:reduce){.rv *{animation:none!important;transition:none!important}.log{scroll-behavior:auto}}'
  ].join('\n');

  function vars(cfg, dark) {
    var w = cfg.widget, c = Object.assign({}, w.colors || {});
    if (dark) Object.assign(c, { panel_bg: '#17161A', text: '#F2F0EA', bubble_in: '#2A282F', bubble_in_text: '#F2F0EA' }, c.header_bg && c.header_bg.toUpperCase() === '#FFFFFF' ? { header_bg: '#1F1D24', header_text: '#FFFFFF' } : {});
    var pr = hexRgb(c.primary), pb = hexRgb(c.panel_bg), lum = (pb[0] * 299 + pb[1] * 587 + pb[2] * 114) / 1000, darkPanel = lum < 128;
    return [
      '--font:' + (cfg.font && cfg.font.family || 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'), '--primary:' + c.primary, '--ptext:' + c.primary_text, '--panel:' + c.panel_bg, '--panel-rgb:' + pb.join(','),
      '--hbg:' + c.header_bg, '--htext:' + c.header_text, '--bin:' + c.bubble_in, '--bintext:' + c.bubble_in_text, '--bout:' + c.bubble_out, '--bouttext:' + c.bubble_out_text, '--text:' + c.text,
      '--primary-a:rgba(' + pr.join(',') + ',.55)', '--ring:rgba(' + pr.join(',') + ',.7)', '--line:' + (darkPanel ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)'), '--soft:' + (darkPanel ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.045)'),
      '--mut:' + (darkPanel ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.55)'), '--r:' + (w.radius == null ? 22 : w.radius) + 'px', '--br:' + Math.max(6, Math.min(20, w.radius == null ? 18 : w.radius)) + 'px',
      '--ox:' + (w.offset_x == null ? 20 : w.offset_x) + 'px', '--oy:' + (w.offset_y == null ? 20 : w.offset_y) + 'px', '--origin:bottom ' + (w.position === 'left' ? 'left' : 'right')
    ].join(';');
  }

  /* ---------- transports ---------- */
  function liveTransport(base, key) {
    var u = base + '/w/' + encodeURIComponent(key);
    function req(method, path, body) {
      return fetch(u + path, { method: method, mode: 'cors', credentials: 'omit', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; e.data = j; throw e; } return j; }); });
    }
    return {
      config: function () { return req('GET', '/config'); },
      send: function (s, text) { return req('POST', '/messages', { visitor_id: s.vid, text: text, page_url: location.href.slice(0, 500), page_title: document.title.slice(0, 140) }); },
      poll: function (s) { return req('GET', '/messages?visitor_id=' + encodeURIComponent(s.vid) + '&after=' + (s.last || 0)); },
      lead: function (s, d) { return req('POST', '/lead', Object.assign({ visitor_id: s.vid }, d)); }
    };
  }
  function houseTransport(base) {
    function post(path, body) {
      return fetch(base + path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-rv': '1' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; } return j; }); });
    }
    return {
      send: function (s, text, inst) {
        var hist = s.msgs.filter(function (m) { return m.who === 'me' || m.who === 'ai'; }).slice(-11, -1).map(function (m) { return { role: m.who === 'me' ? 'user' : 'assistant', text: m.text }; });
        return post('/api/public/chat', { message: text, history: hist }).then(function (r) { return { reply: { id: 'h' + Date.now(), author: 'ai', text: String(r.reply || '') }, delay_ms: timing(inst.cfg.widget, r.reply) }; });
      },
      lead: function (s, d) {
        var transcript = s.msgs.filter(function (m) { return m.who === 'me' || m.who === 'ai'; }).slice(-8).map(function (m) { return (m.who === 'me' ? 'Visitor: ' : 'Juno: ') + m.text; }).join('\n');
        return post('/api/public/contact', { email: d.email, name: d.name || '', source: 'chat', message: (d.note || 'Asked to talk to a human from the website chat.') + (transcript ? '\n\nChat so far:\n' + transcript : '') });
      }
    };
  }
  function previewTransport(opts) {
    var n = 0;
    return {
      send: function (s, text, inst) {
        var q = text.toLowerCase(), w = inst.cfg.widget, name = inst.cfg.closer.name || 'our team';
        var a = opts.reply ? opts.reply(text) : /ship|deliver/.test(q) ? 'Yes! We deliver in 2 to 4 days, and shipping is free over $50. Want me to check stock for you?'
          : /price|cost|how much|\$/.test(q) ? 'Great question! Our best seller is $24, and the bundle saves you $5. Shall I send the link?'
            : /human|person|agent|team/.test(q) ? 'Sure, I’ll bring in someone from the team. They’ll reply right here.'
              : ['Happy to help! I’m ' + name + '. Tell me a bit more and I’ll find the right option for you.', 'Got it. This is a preview, so I’m answering with sample replies. On your site I answer from your Closer’s knowledge.'][n++ % 2];
        var handoff = /human|person|agent|team/.test(q);
        return new Promise(function (res) { setTimeout(function () { res({ reply: { id: 'p' + Date.now(), author: 'ai', text: a }, delay_ms: timing(w, a), handoff: handoff, team_online: true }); }, 250); });
      },
      lead: function () { return new Promise(function (res) { setTimeout(function () { res({ ok: true }); }, 300); }); }
    };
  }

  /* ---------- widget ---------- */
  function Widget(opts) {
    this.opts = opts; this.mode = opts.mode; this.cfg = opts.config;
    this.t = opts.transport;
    this.st = opts.persist ? store(opts.persist) : null;
    var saved = this.st ? this.st.get() : {};
    this.s = { vid: saved.vid && /^v_[A-Za-z0-9]{16,40}$/.test(saved.vid) ? saved.vid : 'v_' + rid(24), msgs: Array.isArray(saved.msgs) ? saved.msgs.slice(-60) : [], last: +saved.last || 0, lead: !!saved.lead, leadAsked: !!saved.leadAsked, greeted: !!saved.greeted, unread: 0, human: !!saved.human, noted: false };
    this.open_ = false; this.waiting = false; this.paused = false; this.timers = []; this.mounted = false;
    this.mount();
  }
  var W = Widget.prototype;
  W.save = function () { if (!this.st) return; var s = this.s; this.st.set({ vid: s.vid, msgs: s.msgs.slice(-60), last: s.last, lead: s.lead, leadAsked: s.leadAsked, greeted: s.greeted, human: s.human }); };
  W.mount = function () {
    var o = this.opts;
    this.host = h('div', { 'data-replyvoo': 'chat' });
    var base = 'all:initial !important;display:block !important;';
    this.host.setAttribute('style', o.container ? base + 'position:absolute !important;inset:0 !important;pointer-events:none !important;overflow:hidden !important;z-index:5 !important' : base + 'position:static !important;width:0 !important;height:0 !important');
    (o.container || document.body).appendChild(this.host);
    this.root = this.host.attachShadow ? this.host.attachShadow({ mode: 'open' }) : this.host;
    var self = this;
    // Keys inside the panel: Esc closes, Tab stays inside (focus trap). On the host page, Esc also closes (not in preview).
    this.onKey = function (e) { if (!self.open_) return; if (e.key === 'Escape' && !self.opts.page) { e.preventDefault(); e.stopPropagation(); self.close(true); } else if (e.key === 'Tab') self.trap(e); };
    this.onDocKey = function (e) { if (self.open_ && e.key === 'Escape' && self.mode !== 'preview' && !self.host.contains(e.target)) self.close(); };
    this.onResize = function () { self.layout(); };
    window.addEventListener('resize', this.onResize);
    if (o.container && window.ResizeObserver) { this.ro = new ResizeObserver(this.onResize); this.ro.observe(o.container); }
    this.mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (this.mq && this.mq.addEventListener) this.mq.addEventListener('change', function () { self.paintTheme(); });
    this.render();
    this.mounted = true;
    this.scheduleGreet();
    this.startPoll();
  };
  W.isDark = function () { var t = this.cfg.widget.theme; return t === 'dark' || (t === 'auto' && !!(this.mq && this.mq.matches)); };
  W.paintTheme = function () { if (this.wrap) this.wrap.setAttribute('style', vars(this.cfg, this.isDark())); };
  W.layout = function () {
    if (!this.wrap) return;
    var width = this.opts.container ? this.opts.container.clientWidth : window.innerWidth;
    this.wrap.classList.toggle('m', width < 480);
    // Optional bottom offset for small screens (e.g. to sit above a sticky mobile bar on the host page).
    var w = this.cfg.widget; if (w.offset_y_m != null) this.wrap.style.setProperty('--oy', (width <= 900 ? w.offset_y_m : (w.offset_y == null ? 20 : w.offset_y)) + 'px');
  };
  W.closerAvatar = function (cls) {
    var c = this.cfg, a = c.assets || {}, av = h('span', { cls: 'av' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
    if (this.mode === 'house') av.innerHTML = JUNO; // constant markup, never user text
    else if (c.widget.avatar_mode === 'upload' && a.avatar) av.appendChild(h('img', { src: a.avatar, alt: '' }));
    else av.textContent = (c.closer && c.closer.initials) || 'AI';
    return av;
  };
  W.render = function () {
    var c = this.cfg, w = c.widget, self = this;
    if (c.font && c.font.css) loadFont(c.font.css);
    this.root.innerHTML = '';
    this.root.appendChild(h('style', { text: CSS }));
    if (c.css) this.root.appendChild(h('style', { text: String(c.css).replace(/<\/?style/gi, '') }));
    var wrap = this.wrap = h('div', { cls: 'rv' + (this.opts.container ? ' contained' : '') + (this.opts.page ? ' page open' : '') + (w.glass ? ' glass' : '') + (this.open_ ? ' open' : ''), 'data-pos': w.position === 'left' ? 'left' : 'right', 'data-size': w.size || 'normal' });
    this.paintTheme();
    // launcher
    var a = c.assets || {}, lk = w.launcher || 'bubble';
    var launcher = this.launcher = h('button', { cls: 'fx launcher ' + lk, type: 'button', 'aria-label': 'Open chat with ' + (w.title || 'us'), 'aria-expanded': String(this.open_), onclick: function () { self.toggle(); } });
    if (lk === 'avatar') { launcher.appendChild(this.closerAvatar()); if (w.show_online !== false && c.online !== false) launcher.appendChild(h('span', { cls: 'ldot', 'aria-hidden': 'true' })); }
    else {
      launcher.appendChild(a.launcher ? h('img', { cls: 'lim', src: a.launcher, alt: '' }) : icon('chat', 28, 2.2));
      if (lk === 'pill') launcher.appendChild(h('span', { text: w.launcher_text || 'Chat with us' }));
    }
    this.badge = h('span', { cls: 'badge', hidden: !this.s.unread, 'aria-label': this.s.unread + ' new messages', text: String(this.s.unread || '') });
    launcher.appendChild(this.badge);
    // greeting
    this.greetEl = h('div', { cls: 'fx greet', hidden: true, role: 'status' });
    // panel
    var title = w.title || c.business || 'Chat';
    var head = h('div', { cls: 'head' }, [
      a.logo && this.mode !== 'house' ? h('img', { cls: 'logo', src: a.logo, alt: title }) : this.closerAvatar(),
      h('div', { cls: 'who' }, [h('strong', { text: title }), h('span', { cls: 'sub' }, [w.show_online !== false ? h('i', { cls: 'dot' + (c.online === false ? ' off' : ''), 'aria-hidden': 'true' }) : null, h('span', { text: c.online === false ? 'Offline' : (w.subtitle || '') })])]),
      h('button', { cls: 'x', type: 'button', 'aria-label': 'Close chat', onclick: function () { self.close(true); } }, [icon('down', 20, 2.6)])
    ]);
    var disc = w.disclosure !== false ? h('div', { cls: 'disc' }, [h('i', { 'aria-hidden': 'true' }, [icon('spark', 11, 2.6)]), h('span', { text: (c.closer && c.closer.name ? c.closer.name + ' · ' : '') + (w.disclosure_text || 'AI assistant') + (this.mode === 'house' ? '' : ' · a person can join anytime') })]) : null;
    this.log = h('div', { cls: 'log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages' });
    this.chips = h('div', { cls: 'chips', role: 'group', 'aria-label': 'Suggested questions' });
    this.input = h('textarea', { id: 'rv-in', rows: '1', maxlength: '1000', placeholder: w.placeholder || 'Type your message…', 'aria-label': 'Message', disabled: c.online === false });
    this.sendBtn = h('button', { cls: 'send', type: 'submit', 'aria-label': 'Send message', disabled: c.online === false }, [icon('send', 20, 2.6)]);
    var form = h('form', { cls: 'compose', onsubmit: function (e) { e.preventDefault(); self.submit(); } }, [h('label', { cls: 'sr', for: 'rv-in', text: 'Message' }), this.input, this.sendBtn]);
    this.input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); self.submit(); } });
    this.input.addEventListener('input', function () { self.input.style.height = 'auto'; self.input.style.height = Math.min(120, self.input.scrollHeight) + 'px'; });
    var foot = h('div', { cls: 'foot' });
    if (c.telegram_url && w.telegram_button !== false) foot.appendChild(h('a', { cls: 'tg', href: c.telegram_url, target: '_blank', rel: 'noopener noreferrer' }, [icon('plane', 13, 2.4), 'Continue on Telegram']));
    if (this.mode === 'house') foot.appendChild(h('a', { href: '/website-ai-chatbot', text: 'Get this chat for your website →' }));
    else if (!c.branding || c.branding.show !== false) foot.appendChild(h('a', { href: (c.branding && c.branding.url) || 'https://replyvoo.com', target: '_blank', rel: 'noopener', text: '⚡ Powered by Replyvoo' }));
    this.panel = h('div', { cls: 'fx panel', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Chat with ' + title, 'aria-hidden': String(!this.open_) }, [head, disc, this.log, this.chips, form, foot.childNodes.length ? foot : null]);
    this.panel.addEventListener('keydown', this.onKey);
    wrap.appendChild(this.panel); wrap.appendChild(this.greetEl); wrap.appendChild(launcher);
    this.root.appendChild(wrap);
    this.layout();
    this.paintLog();
  };
  W.paintLog = function () {
    var self = this, w = this.cfg.widget;
    this.log.textContent = '';
    if (w.welcome) this.log.appendChild(this.bubble({ who: 'ai', text: w.welcome }, true));
    if (this.cfg.online === false) this.log.appendChild(h('div', { cls: 'note', text: this.cfg.offline_reason || 'Chat is offline right now. Please check back soon.' }));
    this.s.msgs.forEach(function (m) { self.log.appendChild(self.bubble(m, true)); });
    if (this.needLeadFirst()) this.showLead();
    this.paintChips();
    this.scroll();
  };
  W.paintChips = function () {
    var self = this, chips = this.cfg.widget.chips || [];
    this.chips.textContent = '';
    if (this.cfg.online === false || this.s.msgs.some(function (m) { return m.who === 'me'; }) || this.needLeadFirst()) { this.chips.hidden = true; return; }
    chips.forEach(function (t) { self.chips.appendChild(h('button', { cls: 'chip', type: 'button', text: t, onclick: function () { self.send(t); } })); });
    this.chips.hidden = !chips.length;
  };
  W.bubble = function (m, quiet) {
    if (m.who === 'note') return h('div', { cls: 'note', text: m.text });
    var el = h('div', { cls: 'msg ' + (m.who === 'me' ? 'me' : 'in') });
    el.appendChild(linkify(m.text));
    if (quiet) el.style.animation = 'none';
    if (m.who === 'human') { var f = document.createDocumentFragment(); f.appendChild(h('span', { cls: 'lbl', text: 'Team' })); f.appendChild(el); return f; }
    return el;
  };
  W.scroll = function () { var l = this.log; if (l) requestAnimationFrame(function () { l.scrollTop = l.scrollHeight; }); };
  W.add = function (m) {
    if (m.id && this.s.msgs.some(function (x) { return x.id === m.id; })) return;
    this.s.msgs.push(m); this.s.msgs = this.s.msgs.slice(-60); this.save();
    var t = this.log.querySelector('.typing');
    this.log.insertBefore(this.bubble(m), t || this.log.querySelector('.lead') || null);
    this.scroll();
    if (m.who !== 'me' && m.who !== 'note' && (!this.open_ || document.hidden)) { this.s.unread++; this.paintBadge(); this.beep(); }
  };
  W.paintBadge = function () { if (!this.badge) return; this.badge.hidden = !this.s.unread; this.badge.textContent = String(this.s.unread || ''); this.badge.setAttribute('aria-label', this.s.unread + ' new messages'); };
  W.typing = function (on) {
    var t = this.log.querySelector('.typing');
    if (on && !t) { this.log.appendChild(h('div', { cls: 'typing', role: 'status', 'aria-label': ((this.cfg.closer && this.cfg.closer.name) || 'Assistant') + ' is typing' }, [h('span'), h('span'), h('span')])); this.scroll(); }
    if (!on && t) t.remove();
  };
  W.beep = function () {
    if (!this.cfg.widget.sound || this.mode === 'preview') return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var ctx = this.ac || (this.ac = new AC()), o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.3);
    } catch (e) { /* audio blocked */ }
  };
  W.note = function (text) { if (text) this.add({ who: 'note', text: text }); };
  W.submit = function () { var v = this.input.value.trim(); if (!v) return; this.input.value = ''; this.input.style.height = 'auto'; this.send(v); };
  W.send = function (text) {
    var self = this, c = this.cfg, w = c.widget;
    text = String(text || '').trim().slice(0, 1000);
    if (!text || c.online === false) return;
    if (this.needLeadFirst() && ['name', 'email', 'phone'].some(function (k) { return w.lead[k] && w.lead[k].req; })) { var li = this.log.querySelector('.lead input'); if (li) li.focus(); this.input.value = text; return; }
    if (this.mode === 'house' && /^talk to a (human|person)$|\b(real|actual) (person|human)\b|\btalk to (a )?(human|person|someone)\b/i.test(text)) { this.add({ who: 'me', text: text }); this.paintChips(); this.showLead(true); return; }
    this.add({ who: 'me', text: text }); this.paintChips();
    var t0 = Date.now(); this.waiting = true; this.paused = true;
    var tt = setTimeout(function () { self.typing(true); }, reduced() ? 0 : 450);
    this.t.send(this.s, text, this).then(function (r) {
      if (r.reply && r.reply.id && typeof r.reply.id === 'number') self.s.last = Math.max(self.s.last, r.reply.id);
      if (!r.reply) {
        clearTimeout(tt); self.typing(false); self.waiting = false; self.paused = false;
        if (r.human || r.handoff) { self.s.human = true; if (!self.s.noted) { self.s.noted = true; self.note(r.team_online === false ? w.offline_text : w.handoff_text); } }
        self.save(); return;
      }
      var wait = Math.max(reduced() ? 0 : 600, (r.delay_ms || 0) - (Date.now() - t0));
      setTimeout(function () {
        clearTimeout(tt); self.typing(false);
        self.add({ id: r.reply.id, who: 'ai', text: r.reply.text });
        if (r.handoff) { self.s.human = true; self.s.noted = true; self.note(r.team_online === false ? w.offline_text : w.handoff_text); }
        self.waiting = false; self.paused = false;
        if (w.lead && w.lead.mode === 'after_first' && !self.s.lead && !self.s.leadAsked) setTimeout(function () { self.showLead(); }, reduced() ? 0 : 900);
      }, wait);
    }).catch(function (e) {
      clearTimeout(tt); self.typing(false); self.waiting = false; self.paused = false;
      self.note(e.status === 429 ? 'You’re sending messages quickly. Please wait a moment and try again.' : e.message || 'Message not sent. Please try again.');
    });
  };
  W.needLeadFirst = function () { var l = this.cfg.widget.lead; return this.mode !== 'house' && this.cfg.online !== false && !!l && l.mode === 'before' && !this.s.lead && !this.s.msgs.some(function (m) { return m.who === 'me'; }); };
  W.showLead = function (human) {
    if (this.log.querySelector('.lead')) return;
    var self = this, w = this.cfg.widget, house = this.mode === 'house';
    var l = house ? { title: 'Leave your email and our team will reply.', name: { on: false }, email: { on: true, req: true }, phone: { on: false }, note: true } : (w.lead || {});
    if (!house && (!l.mode || l.mode === 'off')) return;
    this.s.leadAsked = true; this.save();
    var required = ['name', 'email', 'phone'].some(function (k) { return l[k] && l[k].req; });
    var err = h('div', { cls: 'err', role: 'alert', hidden: true });
    var fields = [], inputs = {};
    [['name', 'Your name', 'text', 'name'], ['email', 'Email', 'email', 'email'], ['phone', 'Phone', 'tel', 'tel'], ['note', 'What do you need help with? (optional)', 'text', 'off']].forEach(function (f) {
      var on = f[0] === 'note' ? !!l.note : l[f[0]] && l[f[0]].on;
      if (!on) return;
      var id = 'rv-l-' + f[0], req = f[0] !== 'note' && l[f[0]].req;
      inputs[f[0]] = h('input', { id: id, type: f[2], autocomplete: f[3], required: req, maxlength: f[0] === 'note' ? '500' : '120', 'aria-required': req ? 'true' : null });
      fields.push(h('label', { for: id, text: f[1] + (req ? ' *' : '') }), inputs[f[0]]);
    });
    var form = h('form', { cls: 'lead', 'aria-label': 'Your contact details', novalidate: true }, [h('strong', { text: house ? (human ? 'Sure! ' : '') + l.title : l.title || 'Where can we reach you?' })].concat(fields).concat([err,
      h('div', { cls: 'row' }, [h('button', { cls: 'btn', type: 'submit', text: house ? 'Send to the team' : 'Save' }), !required && !house ? h('button', { cls: 'btn ghost', type: 'button', text: 'Skip', onclick: function () { form.remove(); self.s.lead = true; self.save(); self.paintChips(); self.input.focus(); } }) : null])]));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = {}; Object.keys(inputs).forEach(function (k) { d[k] = inputs[k].value.trim(); });
      if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) { err.textContent = 'That email doesn’t look right.'; err.hidden = false; inputs.email.focus(); return; }
      for (var k in inputs) if (inputs[k].required && !d[k]) { err.textContent = 'Please fill in the required fields.'; err.hidden = false; inputs[k].focus(); return; }
      var btn = form.querySelector('.btn'); btn.disabled = true;
      self.t.lead(self.s, d).then(function () {
        form.remove(); self.s.lead = true; self.save();
        self.note(house ? 'Got it! Our team will email you at ' + d.email + ' soon.' : 'Thanks' + (d.name ? ', ' + d.name.split(' ')[0] : '') + '! We’ll keep you posted' + (d.email ? ' at ' + d.email : '') + '.');
        self.paintChips(); self.input.focus();
      }).catch(function (x) { btn.disabled = false; err.textContent = x.message; err.hidden = false; });
    });
    this.log.appendChild(form); this.scroll();
    if (house || l.mode === 'before') setTimeout(function () { var f = form.querySelector('input'); if (f && self.open_ && self.mode !== 'preview') f.focus(); }, 60);
  };
  W.scheduleGreet = function () {
    var self = this, w = this.cfg.widget;
    this.timers.forEach(clearTimeout); this.timers = [];
    if (!w.greet_after || !w.greet_text || this.s.greeted || this.open_ || this.cfg.online === false || this.s.msgs.length) return;
    if (w.greet_url && this.mode !== 'preview' && location.href.indexOf(w.greet_url) < 0) return;
    this.timers.push(setTimeout(function () { self.showGreet(); }, this.mode === 'preview' ? 1200 : w.greet_after * 1000));
  };
  W.showGreet = function () {
    var self = this, w = this.cfg.widget;
    if (this.open_ || !this.greetEl) return;
    this.greetEl.textContent = '';
    this.greetEl.appendChild(h('button', { cls: 'greet-x', type: 'button', 'aria-label': 'Dismiss message', onclick: function () { self.greetEl.hidden = true; self.s.greeted = true; self.s.unread = 0; self.paintBadge(); self.save(); } }, [icon('close', 14, 2.6)]));
    this.greetEl.appendChild(h('button', { cls: 'greet-b', type: 'button', onclick: function () { self.open(); } }, [this.closerAvatar('sm'), h('span', { text: w.greet_text })]));
    var av = this.greetEl.querySelector('.av'); if (av) { av.style.width = '28px'; av.style.height = '28px'; av.style.fontSize = '11px'; }
    this.greetEl.hidden = false;
    if (this.mode !== 'preview') { this.s.greeted = true; this.save(); }
    this.s.unread = Math.max(1, this.s.unread); this.paintBadge(); this.beep();
  };
  W.open = function () {
    if (this.open_) return;
    this.open_ = true; this.s.unread = 0; this.paintBadge();
    this.greetEl.hidden = true; this.timers.forEach(clearTimeout);
    this.wrap.classList.add('open'); this.panel.setAttribute('aria-hidden', 'false'); this.launcher.setAttribute('aria-expanded', 'true');
    if (this.wrap.classList.contains('m') && !this.opts.container && !this.opts.page) { this.prevOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden'; }
    document.addEventListener('keydown', this.onDocKey);
    var self = this; this.scroll();
    // Move focus into the dialog. On phones focus the close button so the keyboard doesn’t jump up.
    if ((this.mode !== 'preview' || this.opts.focus) && !(this.opts.page && this.wrap.classList.contains('m'))) setTimeout(function () { var f = self.wrap.classList.contains('m') && !self.opts.page ? self.panel.querySelector('.x') : (self.panel.querySelector('.lead input') || self.input); if (f && !f.disabled) f.focus(); }, 80);
    this.poll();
  };
  W.close = function (refocus) {
    if (!this.open_ || this.opts.page) return;
    this.open_ = false; this.wrap.classList.remove('open'); this.panel.setAttribute('aria-hidden', 'true'); this.launcher.setAttribute('aria-expanded', 'false');
    if (this.prevOverflow != null) { document.documentElement.style.overflow = this.prevOverflow; this.prevOverflow = null; }
    document.removeEventListener('keydown', this.onDocKey);
    if (refocus) this.launcher.focus();
  };
  W.toggle = function () { if (this.open_) this.close(true); else this.open(); };
  W.trap = function (e) {
    var list = Array.prototype.slice.call(this.panel.querySelectorAll('button:not([disabled]),a[href],textarea:not([disabled]),input:not([disabled])')).filter(function (x) { return x.offsetParent !== null || x === document.activeElement; });
    if (!list.length) return;
    var active = this.root.activeElement, i = list.indexOf(active);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); list[list.length - 1].focus(); }
    else if (!e.shiftKey && (i === list.length - 1 || i < 0)) { e.preventDefault(); list[0].focus(); }
  };
  W.startPoll = function () {
    if (!this.t.poll) return;
    var self = this, tick = 0;
    this.pollT = setInterval(function () { tick++; if (document.hidden || self.paused) return; if (self.open_ || (self.s.msgs.length && tick % 6 === 0)) self.poll(); }, 4000);
  };
  W.poll = function () {
    var self = this;
    if (!this.t.poll || this.polling || this.paused || !this.s.msgs.length) return;
    this.polling = true;
    this.t.poll(this.s).then(function (r) {
      self.polling = false;
      if (self.paused) return;
      (r.messages || []).forEach(function (m) { if (m.id > self.s.last) { self.s.last = m.id; self.add({ id: m.id, who: m.author === 'human' ? 'human' : 'ai', text: m.text }); } });
      self.s.human = !!r.human; self.save();
    }).catch(function () { self.polling = false; });
  };
  W.update = function (cfg) { this.cfg = cfg; this.s.noted = false; this.render(); this.scheduleGreet(); };
  W.identify = function (d) {
    d = d || {};
    var data = { name: String(d.name || '').slice(0, 80), email: String(d.email || '').slice(0, 200), phone: String(d.phone || '').slice(0, 30), identify: true };
    if (!data.name && !data.email && !data.phone) return Promise.resolve(false);
    var self = this;
    if (this.mode !== 'live') return Promise.resolve(true);
    return this.t.lead(this.s, data).then(function () { if (data.email || data.phone) { self.s.lead = true; self.save(); } return true; }).catch(function () { return false; });
  };
  W.destroy = function () {
    this.close(); clearInterval(this.pollT); this.timers.forEach(clearTimeout);
    window.removeEventListener('resize', this.onResize); if (this.ro) this.ro.disconnect();
    if (this.host && this.host.parentNode) this.host.parentNode.removeChild(this.host);
  };

  /* ---------- public API ---------- */
  var main = null, queue = [];
  function api(inst) {
    main = inst;
    window.Replyvoo = {
      open: function () { inst.open(); }, close: function () { inst.close(); }, toggle: function () { inst.toggle(); },
      identify: function (d) { return inst.identify(d); }, version: '1.0'
    };
    queue.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } }); queue = [];
  }
  window.ReplyvooWidget = {
    mount: function (container, config, opts) {
      opts = opts || {};
      return new Widget({ mode: opts.preview ? 'preview' : 'live', container: container, config: config, transport: opts.preview ? previewTransport(opts) : liveTransport(opts.base || BASE, config.key), persist: opts.preview ? null : 'rvw_' + config.key, focus: opts.focus });
    },
    defaults: function () { return null; }
  };
  // Calls made before the script finished loading: window.Replyvoo = window.Replyvoo || { q: [] }; Replyvoo.q.push(['open'])
  var pre = window.Replyvoo && Array.isArray(window.Replyvoo.q) ? window.Replyvoo.q : [];
  pre.forEach(function (c) { queue.push(function () { if (main && typeof window.Replyvoo[c[0]] === 'function') window.Replyvoo[c[0]].apply(null, c.slice(1)); }); });

  function boot() {
    if (!me || me.hasAttribute('data-preview')) return; // Widget Studio loads the script only for its preview
    var key = me.getAttribute('data-key');
    if (me.hasAttribute('data-house')) {
      var cfg = {};
      try { cfg = JSON.parse((document.getElementById('rv-house-widget') || {}).textContent || '{}'); } catch (e) { cfg = {}; }
      if (!cfg.widget) return;
      api(new Widget({ mode: 'house', config: cfg, transport: houseTransport(location.origin), persist: 'rvw_house' }));
      return;
    }
    if (!key || !/^wk_[A-Za-z0-9]{16,40}$/.test(key)) { if (window.console) console.warn('[Replyvoo] Add data-key="wk_…" to the widget script tag.'); return; }
    var t = liveTransport(BASE, key);
    // Chat link page (/c/<slug>): the chat fills the page and is always open.
    var pageEl = me.getAttribute('data-page') ? document.getElementById(me.getAttribute('data-page')) : null;
    if (pageEl) {
      t.config().then(function (cfg) { var w = new Widget({ mode: 'live', config: cfg, transport: t, persist: 'rvw_' + key, container: pageEl, page: true }); api(w); w.open(); })
        .catch(function (e) { pageEl.innerHTML = ''; var p = document.createElement('p'); p.style.cssText = 'padding:32px 24px;text-align:center;font:16px/1.5 system-ui,sans-serif;color:#5E5A50'; p.textContent = 'This chat isn’t available right now. Please try again in a minute.'; pageEl.appendChild(p); if (window.console) console.warn('[Replyvoo] ' + e.message); });
      return;
    }
    t.config().then(function (cfg) { api(new Widget({ mode: 'live', config: cfg, transport: t, persist: 'rvw_' + key })); })
      .catch(function (e) { if (window.console) console.warn('[Replyvoo] Chat not loaded: ' + e.message); });
  }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
