/* Replyvoo admin: core helpers (API, icons, toasts, dialogs, sheets, forms, router). */
(function () {
  'use strict';
  const RV = window.RV = { routes: {}, order: [], cache: {} };

  /* ---------- tiny utils ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (v == null || v === '' || !Number.isFinite(Number(v))) ? 0 : Number(v);
  const fmt = (n, d = 0) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = n => { n = Number(n || 0); return '$' + (Math.round(n) === n ? fmt(n) : fmt(n, 2)); };
  const ago = iso => {
    if (!iso) return 'never';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 0) { const f = -s; if (f < 3600) return 'in ' + Math.ceil(f / 60) + 'm'; if (f < 86400) return 'in ' + Math.round(f / 3600) + 'h'; return 'in ' + Math.round(f / 86400) + 'd'; }
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const date = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const dateTime = iso => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const clone = o => JSON.parse(JSON.stringify(o));
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const setPath = (o, p, v) => { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach(k => { if (a[k] == null || typeof a[k] !== 'object') a[k] = {}; a = a[k]; }); a[ks[ks.length - 1]] = v; };
  const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  const fromLocalInput = v => v ? new Date(v).toISOString() : '';
  Object.assign(RV, { $, $$, esc, num, fmt, money, ago, date, dateTime, clone, getPath, setPath, toLocalInput, fromLocalInput });

  /* ---------- API ---------- */
  RV.api = async function (method, url, body) {
    const opt = { method, credentials: 'same-origin', headers: { accept: 'application/json' } };
    if (method !== 'GET') { opt.headers['content-type'] = 'application/json'; opt.headers['x-rv'] = '1'; opt.body = JSON.stringify(body || {}); }
    let res;
    try { res = await fetch(url, opt); } catch (e) { throw new Error('Network problem. Check your connection and try again.'); }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
      err.status = res.status;
      if (res.status === 401 && data && data.code === 'mfa_required') { if (RV.onMfa) RV.onMfa(); }
      else if (res.status === 401 && RV.onLoggedOut) RV.onLoggedOut();
      throw err;
    }
    return data;
  };
  RV.get = url => RV.api('GET', url);
  RV.put = (url, b) => RV.api('PUT', url, b);
  RV.post = (url, b) => RV.api('POST', url, b);
  RV.del = url => RV.api('DELETE', url);

  /* ---------- icons ---------- */
  const P = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.6"/>',
    coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    ticket: '<path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M14 4v16" stroke-dasharray="2 3"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12"/>',
    toggle: '<rect x="2" y="6" width="20" height="12" rx="6"/><circle cx="16" cy="12" r="3.2"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c1.9.8 3.1 2.6 3.5 5.4"/>',
    cart: '<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20.5" r="1.3"/><circle cx="17" cy="20.5" r="1.3"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', right: '<path d="M9 6l6 6-6 6"/>', left: '<path d="M15 6l-6 6 6 6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    drag: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
    gift: '<rect x="3" y="8" width="18" height="5" rx="1.5"/><path d="M5 13v8h14v-8M12 8v13M12 8c-1.5-4-6-4-6-1.5S10 8 12 8zM12 8c1.5-4 6-4 6-1.5S14 8 12 8z"/>',
    send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
    monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.3A8.4 8.4 0 1 1 21 11.5z"/>',
    inbox: '<path d="M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    userplus: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M19 8v6M16 11h6"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    note: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8 12h8M8 16h5"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'
  };
  RV.gatevooMark = (s = 16) => '<svg class="gv-mark" width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#121110"/><path d="M41.9 21.6A15 15 0 1 0 47 32H39.5" fill="none" stroke="#fff" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="30.5" cy="32" r="3.6" fill="#3E9C76"/></svg>';
  RV.ic = (n, s = 20, w = 2) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || P.info) + '</svg>';
  RV.LOGO = '<span class="logo-mark"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFC21A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.2-4.2A7.5 7.5 0 1 1 20 11.5z"/><path d="M9 11.5l2 2 4-4"/></svg></span>';

  // Replace with the official logo from the brand's press kit before launch.
  // Generic icons in each brand's colour, never the real marks.
  RV.brandIcon = function (id, size = 44) {
    const g = {
      telegram: ['#2AABEE', '<path d="M21 4L3 11l6 2.2M21 4l-3 16-9-6.8M21 4L9 13.2V19l3-3.6"/>'],
      whatsapp: ['#25D366', '<path d="M20 11.5a8 8 0 0 1-11.6 7.2L4 20l1.3-4.2A8 8 0 1 1 20 11.5z"/><path d="M9 8.5c0 3 2.5 6 6 6.5l1-1.6-2-1-1 .8c-1-.4-2.3-1.6-2.7-2.7l.8-1-1-2z"/>'],
      instagram: ['linear-gradient(135deg,#F58529,#DD2A7B 55%,#8134AF)', '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r=".6" fill="#fff"/>'],
      tiktok: ['#121110', '<path d="M9 18.5a2.5 2.5 0 1 1 0-5h.5V4h4c0 2.2 1.8 4 4 4"/><circle cx="9" cy="16" r="2.5"/>'],
      website: ['#FFC21A', '<circle cx="12" cy="12" r="9" stroke="#121110"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" stroke="#121110"/>'],
      messenger: ['#6D5BFF', '<path d="M12 3a8.6 8.6 0 0 0-9 8.3 8.1 8.1 0 0 0 3 6.3V21l3-1.6c1 .3 2 .4 3 .4a8.6 8.6 0 0 0 9-8.5A8.6 8.6 0 0 0 12 3z"/><path d="M13 8l-4 5h3l-1 3 4-5h-3z"/>']
    };
    const key = id.startsWith('telegram') ? 'telegram' : id;
    const [bg, path] = g[key] || g.telegram;
    return '<span class="brand" style="background:' + bg + ';width:' + size + 'px;height:' + size + 'px;flex-basis:' + size + 'px"><svg width="' + Math.round(size * .52) + '" height="' + Math.round(size * .52) + '" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg></span>';
  };

  /* ---------- toasts ---------- */
  RV.toast = function (msg, kind) {
    const box = $('#toasts'); if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast' + (kind === 'err' ? ' err' : '');
    t.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    t.innerHTML = '<span class="ti">' + RV.ic(kind === 'err' ? 'x' : 'check', 14, 3) + '</span><span>' + esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, kind === 'err' ? 5200 : 2800);
  };
  RV.fail = e => RV.toast((e && e.message) || 'Something went wrong.', 'err');

  /* ---------- confirm dialog ---------- */
  RV.confirm = function ({ title, text = '', ok = 'Confirm', danger = false, cancel = 'Cancel' }) {
    return new Promise(resolve => {
      const scrim = document.createElement('div'); scrim.className = 'scrim top';
      const d = document.createElement('div'); d.className = 'dlg'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true');
      d.innerHTML = '<h3>' + esc(title) + '</h3>' + (text ? '<p>' + esc(text) + '</p>' : '') + '<div class="acts"><button class="btn btn-g" data-a="no">' + esc(cancel) + '</button><button class="btn ' + (danger ? 'btn-red' : 'btn-y') + '" data-a="yes">' + esc(ok) + '</button></div>';
      document.body.append(scrim, d);
      const prev = document.activeElement;
      requestAnimationFrame(() => { scrim.classList.add('on'); d.classList.add('on'); $('[data-a=yes]', d).focus(); });
      const done = v => { d.classList.remove('on'); scrim.classList.remove('on'); document.removeEventListener('keydown', key, true); setTimeout(() => { d.remove(); scrim.remove(); if (prev && prev.focus) prev.focus(); }, 220); resolve(v); };
      const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
      document.addEventListener('keydown', key, true);
      scrim.onclick = () => done(false);
      d.onclick = e => { const a = e.target.closest('[data-a]'); if (a) done(a.dataset.a === 'yes'); };
    });
  };

  /* ---------- sheets (bottom sheet on phone, side drawer on desktop) ---------- */
  const openSheets = [];
  RV.sheet = function ({ title, sub = '', body = '', wide = false, save = 'Save', onSave, extra = '', noFooter = false, onClose }) {
    const scrim = document.createElement('div'); scrim.className = 'scrim';
    const el = document.createElement('section'); el.className = 'sheet' + (wide ? ' wide' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', title);
    el.innerHTML = '<div class="sh-grab" aria-hidden="true"></div><header class="sh-h"><div style="min-width:0"><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><button class="ib ghost" data-x aria-label="Close">' + RV.ic('x') + '</button></header>' +
      '<div class="sh-b"></div>' + (noFooter ? '' : '<footer class="sh-f">' + extra + '<span class="sp"></span><button class="btn btn-g" data-x>Cancel</button>' + (onSave ? '<button class="btn btn-y" data-save>' + esc(save) + '</button>' : '') + '</footer>');
    const b = $('.sh-b', el);
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    document.body.append(scrim, el);
    document.body.style.overflow = 'hidden';
    const prev = document.activeElement;
    const s = { el, body: b, dirty: false, scrim };
    el.addEventListener('input', () => { s.dirty = true; });
    el.addEventListener('change', () => { s.dirty = true; });
    s.close = async (force) => {
      if (!force && s.dirty && !(await RV.confirm({ title: 'Discard changes?', text: 'You have unsaved changes in this editor.', ok: 'Discard', danger: true, cancel: 'Keep editing' }))) return false;
      el.classList.remove('on'); scrim.classList.remove('on');
      const i = openSheets.indexOf(s); if (i >= 0) openSheets.splice(i, 1);
      if (!openSheets.length) document.body.style.overflow = '';
      document.removeEventListener('keydown', key);
      setTimeout(() => { el.remove(); scrim.remove(); }, 340);
      if (prev && prev.focus && document.contains(prev)) prev.focus();
      if (onClose) onClose();
      return true;
    };
    const key = e => { if (e.key === 'Escape' && openSheets[openSheets.length - 1] === s && !$('.dlg')) s.close(); };
    document.addEventListener('keydown', key);
    scrim.onclick = () => s.close();
    el.addEventListener('click', async e => {
      if (e.target.closest('[data-x]')) { s.close(); return; }
      const sv = e.target.closest('[data-save]');
      if (sv && onSave) {
        if (!RV.validate(el)) return;
        sv.disabled = true;
        try { const r = await onSave(s); if (r !== false) { s.dirty = false; s.close(true); } }
        catch (err) { RV.fail(err); }
        finally { sv.disabled = false; }
      }
    });
    // swipe down on the grab handle / header to close (phones)
    let y0 = null;
    const head = $('.sh-h', el), grab = $('.sh-grab', el);
    [head, grab].forEach(h => {
      h.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
      h.addEventListener('touchmove', e => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) el.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
      h.addEventListener('touchend', e => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; el.style.transform = ''; y0 = null; if (dy > 90) s.close(); });
    });
    openSheets.push(s);
    requestAnimationFrame(() => { scrim.classList.add('on'); el.classList.add('on'); const f = $('input,textarea,select', b); if (f && window.innerWidth >= 980) f.focus({ preventScroll: true }); else $('[data-x]', el).focus({ preventScroll: true }); });
    return s;
  };
  RV.closeAllSheets = async () => { for (const s of openSheets.slice().reverse()) { if (!(await s.close())) return false; } return true; };
  RV.anySheetDirty = () => openSheets.some(s => s.dirty);

  /* ---------- form fields (HTML builders) ---------- */
  let uid = 0;
  const nid = () => 'f' + (++uid);
  const attrs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== false && v !== null).map(([k, v]) => v === true ? k : k + '="' + esc(v) + '"').join(' ');
  const wrap = (id, label, inner, o = {}) => '<div class="f' + (o.cls ? ' ' + o.cls : '') + '"' + (o.style ? ' style="' + o.style + '"' : '') + '>' + (label ? '<label for="' + id + '">' + esc(label) + (o.req ? ' <span aria-hidden="true" style="color:var(--bad)">*</span>' : '') + '</label>' : '') + inner + (o.hint ? '<span class="hint" id="' + id + 'h">' + o.hint + '</span>' : '') + '</div>';
  const F = RV.F = {
    text(k, label, o = {}) { const id = o.id || nid(); return wrap(id, label, '<input ' + attrs({ id, 'data-k': k, type: o.type || 'text', placeholder: o.ph, maxlength: o.max, required: o.req, dir: o.dir, autocomplete: o.ac || 'off', inputmode: o.im, 'aria-describedby': o.hint ? id + 'h' : undefined, 'data-t': o.t, readonly: o.ro }) + '>', o); },
    num(k, label, o = {}) {
      const id = o.id || nid();
      const inp = '<input ' + attrs({ id, 'data-k': k, type: 'number', inputmode: o.int ? 'numeric' : 'decimal', min: o.min == null ? 0 : o.min, max: o.max, step: o.step || (o.int ? 1 : 'any'), required: o.req, 'data-t': o.t || (o.int ? 'int' : 'num'), placeholder: o.ph, 'aria-describedby': o.hint ? id + 'h' : undefined }) + '>';
      const inner = o.pre ? '<div class="affix"><span>' + esc(o.pre) + '</span>' + inp + '</div>' : o.suf ? '<div class="affix rt">' + inp + '<span class="r">' + esc(o.suf) + '</span></div>' : inp;
      return wrap(id, label, inner, o);
    },
    pct(k, label, o = {}) { return F.num(k, label, { ...o, t: 'pct', suf: '%', max: 100, step: 'any' }); },
    area(k, label, o = {}) { const id = o.id || nid(); return wrap(id, label, '<textarea ' + attrs({ id, 'data-k': k, rows: o.rows || 4, maxlength: o.max, required: o.req, dir: o.dir, placeholder: o.ph, class: o.icls, 'aria-describedby': o.hint ? id + 'h' : undefined }) + '></textarea>', o); },
    sel(k, label, opts, o = {}) { const id = o.id || nid(); return wrap(id, label, '<select ' + attrs({ id, 'data-k': k, 'data-t': o.t, required: o.req }) + '>' + opts.map(x => Array.isArray(x) ? '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>' : '<option>' + esc(x) + '</option>').join('') + '</select>', o); },
    dt(k, label, o = {}) { const id = o.id || nid(); return wrap(id, label, '<input ' + attrs({ id, 'data-k': k, type: 'datetime-local', 'data-t': 'dt', required: o.req }) + '>', o); },
    tog(k, title, desc = '', o = {}) { return '<div class="sw" data-sw><div class="sw-t"><strong>' + esc(title) + '</strong>' + (desc ? '<span>' + desc + '</span>' : '') + '</div><button type="button" class="tg" role="switch" aria-checked="false" aria-label="' + esc(title) + '" data-k="' + esc(k) + '"' + (o.t ? ' data-t="' + o.t + '"' : '') + '><span></span></button></div>'; },
    seg(k, opts, o = {}) { return '<div class="seg' + (o.w ? ' w' : '') + '" role="group" aria-label="' + esc(o.label || k) + '" data-k="' + esc(k) + '">' + opts.map(x => '<button type="button" data-v="' + esc(x[0]) + '" aria-pressed="false"' + (x[2] ? ' class="' + x[2] + '"' : '') + '>' + x[1] + '</button>').join('') + '</div>'; },
    secT: t => '<div class="sec-t">' + esc(t) + '</div>'
  };

  /* ---------- binding: data-k inputs <-> object ---------- */
  function readVal(el) {
    const t = el.dataset.t;
    if (t === 'dt') return fromLocalInput(el.value);
    if (el.type === 'number') {
      if (el.value === '') return null;
      const n = Number(el.value);
      if (t === 'pct') return Math.round(n * 100) / 10000;
      return t === 'int' ? Math.trunc(n) : n;
    }
    if (t === 'json') { try { return JSON.parse(el.value); } catch (e) { return el.value; } }
    return el.value;
  }
  function writeVal(el, v) {
    const t = el.dataset.t;
    if (t === 'dt') el.value = toLocalInput(v);
    else if (t === 'pct') el.value = v == null || v === '' ? '' : Math.round(Number(v) * 10000) / 100;
    else el.value = v == null ? '' : v;
  }
  RV.bind = function (root, obj, onChange) {
    $$('[data-k]', root).forEach(el => {
      const k = el.dataset.k;
      const cur = getPath(obj, k);
      if (el.classList.contains('tg')) {
        const inv = el.dataset.t === 'inv';
        const on = inv ? !cur : !!cur;
        el.setAttribute('aria-checked', on);
        el.addEventListener('click', e => {
          e.stopPropagation();
          const nv = el.getAttribute('aria-checked') !== 'true';
          el.setAttribute('aria-checked', nv);
          setPath(obj, k, inv ? !nv : nv);
          el.dispatchEvent(new Event('change', { bubbles: true }));
          onChange && onChange(k, nv, el);
        });
        const row = el.closest('[data-sw]');
        if (row) row.addEventListener('click', e => { if (e.target !== el && !e.target.closest('a,button:not(.tg)')) el.click(); });
      } else if (el.classList.contains('seg')) {
        const mark = v => $$('button', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
        mark(cur);
        el.addEventListener('click', e => {
          const b = e.target.closest('button[data-v]'); if (!b) return;
          setPath(obj, k, b.dataset.v); mark(b.dataset.v);
          el.dispatchEvent(new Event('change', { bubbles: true }));
          onChange && onChange(k, b.dataset.v, el);
        });
      } else {
        writeVal(el, cur);
        const h = () => { el.classList.remove('bad'); setPath(obj, k, readVal(el)); onChange && onChange(k, getPath(obj, k), el); };
        el.addEventListener('input', h); el.addEventListener('change', h);
      }
    });
  };

  /* ---------- validation ---------- */
  RV.validate = function (root) {
    let first = null, msg = '';
    $$('input,textarea,select', root).forEach(el => {
      if (el.disabled || el.type === 'checkbox' || el.type === 'radio' || el.type === 'search' || el.offsetParent === null && !el.closest('.sheet')) return;
      el.classList.remove('bad');
      const lbl = (el.id && $('label[for="' + el.id + '"]', root)) ? $('label[for="' + el.id + '"]', root).textContent.replace('*', '').trim() : 'This field';
      let m = '';
      if (el.required && !String(el.value).trim()) m = lbl + ' is required.';
      else if (el.type === 'number' && el.value !== '') {
        const v = Number(el.value);
        if (!Number.isFinite(v)) m = lbl + ' must be a number.';
        else if (el.min !== '' && v < Number(el.min)) m = lbl + ' can’t be less than ' + el.min + '.';
        else if (el.max !== '' && v > Number(el.max)) m = lbl + ' can’t be more than ' + el.max + '.';
      } else if (el.type === 'number' && el.validity && el.validity.badInput) m = lbl + ' must be a number.';
      else if (el.type === 'email' && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value)) m = lbl + ' must be a valid email.';
      else if (el.type === 'url' && el.value && !/^(https?:\/\/|\/)/.test(el.value)) m = lbl + ' must start with https:// or /.';
      if (m) { el.classList.add('bad'); if (!first) { first = el; msg = m; } }
    });
    if (first) { RV.toast(msg, 'err'); first.focus({ preventScroll: false }); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return false; }
    return true;
  };

  /* ---------- page-level unsaved-changes guard with a floating save bar ---------- */
  let pageGuard = null;
  RV.watchPage = function (root, saveFn, resetFn) {
    pageGuard = { dirty: false, saveFn, resetFn, bar: null };
    const g = pageGuard;
    const show = () => {
      if (g.dirty || pageGuard !== g) return; g.dirty = true;
      const bar = document.createElement('div'); bar.className = 'savebar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Unsaved changes');
      bar.innerHTML = '<span class="t"><span class="pulse"></span>Unsaved changes</span><button class="btn btn-g btn-sm" data-dis>Discard</button><button class="btn btn-y btn-sm" data-sv>Save</button>';
      document.body.appendChild(bar); g.bar = bar;
      $('[data-dis]', bar).onclick = () => { RV.clearPageGuard(); resetFn && resetFn(); };
      $('[data-sv]', bar).onclick = async e => {
        if (!RV.validate(root)) return;
        e.target.disabled = true;
        try { await saveFn(); RV.clearPageGuard(); } catch (err) { RV.fail(err); } finally { if (e.target) e.target.disabled = false; }
      };
    };
    root.addEventListener('input', show); root.addEventListener('change', show);
    return g;
  };
  RV.markPageDirty = () => { if (pageGuard && !pageGuard.dirty) { const r = $('#main .page'); if (r) r.dispatchEvent(new Event('change')); } };
  RV.clearPageGuard = () => { if (pageGuard && pageGuard.bar) pageGuard.bar.remove(); if (pageGuard) pageGuard.dirty = false; };
  RV.dropPageGuard = () => { RV.clearPageGuard(); pageGuard = null; };
  RV.isDirty = () => !!(pageGuard && pageGuard.dirty) || RV.anySheetDirty();
  window.addEventListener('beforeunload', e => { if (RV.isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- editable string list (features, etc.) ---------- */
  RV.listEditor = function (el, arr, { ph = '', max = 120, addLabel = 'Add line', onChange } = {}) {
    const draw = () => {
      el.innerHTML = '<div class="el">' + arr.map((v, i) => '<div class="el-row"><input class="input" aria-label="Line ' + (i + 1) + '" value="' + esc(v) + '" maxlength="' + max + '" data-i="' + i + '" placeholder="' + esc(ph) + '"><div class="el-btns"><button type="button" class="ib" data-up="' + i + '" aria-label="Move up"' + (i ? '' : ' disabled') + '>' + RV.ic('up', 16) + '</button><button type="button" class="ib" data-rm="' + i + '" aria-label="Remove">' + RV.ic('trash', 16) + '</button></div></div>').join('') +
        '<button type="button" class="btn btn-g btn-sm" data-add style="align-self:flex-start">' + RV.ic('plus', 16) + esc(addLabel) + '</button></div>';
    };
    draw();
    el.addEventListener('input', e => { const i = e.target.dataset.i; if (i != null) { arr[i] = e.target.value; onChange && onChange(); } });
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.add != null) { arr.push(''); draw(); const ins = $$('input', el); ins[ins.length - 1].focus(); }
      else if (b.dataset.rm != null) arr.splice(+b.dataset.rm, 1), draw();
      else if (b.dataset.up != null) { const i = +b.dataset.up; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; draw(); }
      else return;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      onChange && onChange();
    });
  };

  /* ---------- chart (single series bars with hover tooltip) ---------- */
  RV.barChart = function (rows, key, { fmtV = v => fmt(v), color = 'var(--jade)', label = '' } = {}) {
    const n = rows.length;
    const max = Math.max(1, ...rows.map(r => r[key]));
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
    const day = d => new Date(d + 'T12:00:00');
    const grid = [1, .5, 0].map(f => '<div class="cg" style="bottom:' + (f * 100) + '%"><span>' + esc(fmtV(nice * f)) + '</span></div>').join('');
    const cols = rows.map((r, i) => {
      const v = r[key], h = v / nice * 100;
      const tip = day(r.d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ': ' + fmtV(v) + (label ? ' ' + label : '');
      return '<div class="cc" data-tip="' + esc(tip) + '" tabindex="0" aria-label="' + esc(tip) + '"><i class="' + (v > 0 ? 'b' : 'z') + '" style="height:' + (v > 0 ? Math.max(h, 2) : 0) + '%;background:' + color + ';animation-delay:' + (i * 30) + 'ms"></i><span class="cl">' + ((i % 2 === (n - 1) % 2) ? day(r.d).getDate() : '') + '</span></div>';
    }).join('');
    return '<div class="chart" role="img" aria-label="' + esc(rows.map(r => r.d + ' ' + fmtV(r[key])).join(', ')) + '"><div class="cp">' + grid + '<div class="cols">' + cols + '</div></div><div class="tip"></div></div>';
  };
  const showTip = h => {
    $$('.chart .tip.on').forEach(t => { if (!h || !t.parentNode.contains(h)) t.classList.remove('on'); });
    if (!h) return;
    const ch = h.closest('.chart'), tip = $('.tip', ch), cr = ch.getBoundingClientRect(), br = h.getBoundingClientRect(), bar = $('i', h).getBoundingClientRect();
    tip.textContent = h.dataset.tip; tip.style.left = Math.min(cr.width - 50, Math.max(50, br.left - cr.left + br.width / 2)) + 'px'; tip.style.top = Math.max(26, (bar.height ? bar.top : br.bottom - 20) - cr.top) + 'px'; tip.classList.add('on');
  };
  document.addEventListener('pointermove', e => showTip(e.target.closest && e.target.closest('.chart .cc')));
  document.addEventListener('focusin', e => showTip(e.target.closest && e.target.closest('.chart .cc')));

  /* ---------- misc ---------- */
  RV.copy = async (text, label = 'Copied') => {
    try { await navigator.clipboard.writeText(text); RV.toast(label); }
    catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); RV.toast(label); } catch (e2) { RV.toast('Copy failed', 'err'); } t.remove(); }
  };
  RV.csv = (name, rows) => {
    const lines = rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  RV.statusPill = (s) => {
    const m = { paid: 'p-ok', active: 'p-ok', live: 'p-ok', published: 'p-ok', sent: 'p-ok', pending: 'p-warn', soon: 'p-warn', draft: 'p-mut', cancelled: 'p-mut', off: 'p-mut', paused: 'p-mut', failed: 'p-bad', suspended: 'p-bad', expired: 'p-bad', refunded: 'p-v' };
    return '<span class="pill ' + (m[s] || 'p-mut') + '">' + esc(s) + '</span>';
  };
  RV.loadingHTML = '<div class="stack"><div class="skel" style="height:64px"></div><div class="skel" style="height:140px"></div><div class="skel" style="height:220px"></div></div>';
  RV.header = (title, sub = '', actions = '') => '<div class="ph"><div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="ph-act">' + actions + '</div>' : '') + '</div>';
  RV.errorHTML = (e, retry = true) => '<div class="card empty"><strong>Couldn’t load this section</strong>' + esc(e.message || e) + (retry ? '<div style="margin-top:14px"><button class="btn btn-g btn-sm" data-retry>' + RV.ic('refresh', 16) + 'Try again</button></div>' : '') + '</div>';

  /* ---------- settings helper (GET all, edit copy, PUT whole key) ---------- */
  RV.settings = async (fresh) => { if (fresh || !RV.cache.settings) RV.cache.settings = await RV.get('/api/admin/settings'); return RV.cache.settings; };
  RV.saveSetting = async (key, value) => {
    const saved = await RV.put('/api/admin/settings/' + key, { value });
    if (RV.cache.settings) RV.cache.settings[key] = saved;
    return saved;
  };

  /* ---------- router ---------- */
  RV.route = function (name, def) { RV.routes[name] = def; RV.order.push(name); };
  RV.path = () => { const p = location.pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean); return { name: p[0] || 'overview', arg: p.slice(1).map(decodeURIComponent).join('/') }; };
  RV.go = async function (href, replace) {
    if (href === location.pathname + location.search) return;
    if (RV.isDirty() && !(await RV.confirm({ title: 'Leave without saving?', text: 'You have unsaved changes on this page.', ok: 'Leave', danger: true, cancel: 'Stay' }))) return;
    RV.dropPageGuard();
    if (!(await RV.closeAllSheets())) return;
    history[replace ? 'replaceState' : 'pushState']({}, '', href);
    RV.render();
  };
  window.addEventListener('popstate', async () => {
    if (RV.isDirty() && !(await RV.confirm({ title: 'Leave without saving?', text: 'You have unsaved changes on this page.', ok: 'Leave', danger: true, cancel: 'Stay' }))) { history.pushState({}, '', RV.current || '/admin'); return; }
    RV.dropPageGuard(); await RV.closeAllSheets(); RV.render();
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="/admin"]');
    if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault(); RV.go(a.getAttribute('href'));
  });
})();
