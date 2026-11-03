/* Replyvoo dashboard: core helpers (API, router, toasts, modals, formatting). */
(function () {
  'use strict';
  const RV = window.RV = window.RV || {};
  const $ = id => document.getElementById(id);
  const qs = (sel, el) => (el || document).querySelector(sel);
  const qsa = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(Number(n) || 0).toLocaleString('en-US');
  const usd = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: (Number(n) % 1) ? 2 : 0, maximumFractionDigits: 2 });
  const first = n => String(n || '').trim().split(/\s+/)[0] || '';
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x.charAt(0).toUpperCase()).join('') || '?';
  const AV_COLORS = ['#FFF3CC', '#E3ECFF', '#E8F6EC', '#FFE3D6', '#F1E8FF', '#FFE9F2', '#E6F7F6'];
  const colorFor = s => { let h = 0; String(s || '').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return AV_COLORS[h % AV_COLORS.length]; };
  const avatar = (name, size) => { size = size || 40; return '<span class="av" style="width:' + size + 'px;height:' + size + 'px;flex-basis:' + size + 'px;font-size:' + Math.max(10, Math.round(size / 3.1)) + 'px;background:' + colorFor(name) + '">' + esc(initials(name)) + '</span>'; };
  function ago(iso) {
    if (!iso) return '';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    if (s < 86400 * 7) return Math.round(s / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  const date = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const time = iso => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  const debounce = (fn, ms) => { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem('rv_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('rv_' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };

  /* ---------- API ---------- */
  async function api(method, url, body) {
    const opt = { method, credentials: 'same-origin', headers: { accept: 'application/json' } };
    if (method !== 'GET') { opt.headers['x-rv'] = '1'; opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body || {}); }
    let res;
    try { res = await fetch(url, opt); } catch (e) { const er = new Error('You seem to be offline. Check your connection and try again.'); er.status = 0; throw er; }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const er = new Error((data && data.error) || 'Something went wrong (' + res.status + '). Please try again.');
      er.status = res.status; er.code = data && data.code; er.data = data;
      if (res.status === 401 && RV.onUnauthorized && !/\/api\/auth\//.test(url)) RV.onUnauthorized();
      throw er;
    }
    return data;
  }
  const GET = url => api('GET', url);
  const POST = (url, b) => api('POST', url, b);
  const PUT = (url, b) => api('PUT', url, b);
  const DEL = (url, b) => api('DELETE', url, b);

  /* ---------- toasts ---------- */
  const ICONS_T = { ok: '✓', err: '!', hot: '🔥', handoff: '→', won: '$', info: 'i', credits: 'V' };
  function toast(msg, kind, action) {
    kind = kind || 'ok';
    const root = $('toastRoot'); if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'err' ? ' err' : '');
    el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    el.innerHTML = '<span class="t-ic">' + (ICONS_T[kind] || '✓') + '</span><span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action.label) + '</button>' : '');
    if (action) el.querySelector('button').addEventListener('click', () => { el.remove(); action.fn(); });
    root.appendChild(el);
    while (root.children.length > 3) root.removeChild(root.firstChild);
    setTimeout(() => { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 320); }, kind === 'err' ? 5200 : 3400);
  }
  const fail = e => toast(e && e.message ? e.message : 'Something went wrong.', 'err');

  /* ---------- modal ---------- */
  let lastFocus = null, onCloseFn = null;
  function modal(html, opts) {
    opts = opts || {};
    lastFocus = document.activeElement;
    onCloseFn = opts.onClose || null;
    $('modalRoot').innerHTML = '<div class="modal-ovl" id="mOvl"><div class="modal a-pop' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.label || 'Dialog') + '">' +
      (opts.noX ? '' : '<button class="modal-x" data-close aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#121110" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>') + html + '</div></div>';
    const m = qs('#modalRoot .modal');
    setTimeout(() => { const f = m && m.querySelector('input:not([type=hidden]),select,textarea,button:not(.modal-x)'); if (f && !opts.noFocus) f.focus(); }, 40);
    return m;
  }
  function closeModal() {
    if (window.RVVoice) window.RVVoice.stop();
    if (!$('modalRoot').innerHTML) return;
    $('modalRoot').innerHTML = '';
    const fn = onCloseFn; onCloseFn = null; if (fn) fn();
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
  }
  document.addEventListener('click', e => {
    if (e.target.id === 'mOvl') closeModal();
    else if (e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('modalRoot').innerHTML) closeModal(); else if (RV.closePops) RV.closePops(); } });
  function confirmBox(title, text, okLabel, danger) {
    return new Promise(resolve => {
      let done = false;
      modal('<div class="col" style="gap:14px"><strong class="h3">' + esc(title) + '</strong><p class="muted" style="margin:0">' + esc(text) + '</p><div class="row" style="justify-content:flex-end;flex-wrap:wrap"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-ink') + '" id="cfOk">' + esc(okLabel || 'Confirm') + '</button></div></div>', { onClose: () => { if (!done) resolve(false); }, label: title });
      $('cfOk').addEventListener('click', () => { done = true; closeModal(); resolve(true); });
    });
  }

  /* ---------- motion helpers ---------- */
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countTo(el, to, opts) {
    if (!el) return; opts = opts || {};
    const from = +(el.getAttribute('data-v') || 0); const start = performance.now(); const dur = opts.dur || 900; const pre = opts.pre || ''; const suf = opts.suf || '';
    el.setAttribute('data-v', to);
    if (reduced() || from === to) { el.textContent = pre + fmt(to) + suf; return; }
    function step(t) { const k = Math.min(1, (t - start) / dur); const e = 1 - Math.pow(1 - k, 3); el.textContent = pre + fmt(from + (to - from) * e) + suf; if (k < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  function confetti(n, coins) {
    const cols = ['#FFC21A', '#121110', '#8FB8FF', '#FF9FC3', '#7EE0B0', '#FFB199'];
    const layer = document.createElement('div'); layer.className = 'conf-layer'; layer.setAttribute('aria-hidden', 'true');
    let h = ''; n = n || 46;
    for (let i = 0; i < n; i++) {
      h += coins && i % 2 ? '<span class="conf" style="left:' + ((i * 37) % 100) + '%;width:22px;height:22px;border-radius:50%;background:#FFC21A;border:3px solid #121110;animation-duration:' + (1.8 + (i % 4) * 0.35) + 's;animation-delay:' + ((i % 8) * 0.09) + 's"></span>'
        : '<span class="conf" style="left:' + ((i * 37) % 100) + '%;background:' + cols[i % 6] + ';animation-duration:' + (2.2 + (i % 5) * 0.45) + 's;animation-delay:' + ((i % 10) * 0.12) + 's;width:' + (8 + (i % 3) * 3) + 'px"></span>';
    }
    layer.innerHTML = h; document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 4800);
  }
  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copied'); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (er) { ok = false; }
      ta.remove(); toast(ok ? (okMsg || 'Copied') : 'Press and hold to copy: ' + text, ok ? 'ok' : 'info'); return ok;
    }
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + (label ? esc(label) : ''); }
    else { btn.disabled = false; if (btn.dataset.html != null) btn.innerHTML = btn.dataset.html; }
  }

  /* ---------- router ---------- */
  const routes = {};
  function route(name, def) { routes[name] = def; }
  function parse(loc) {
    const path = (loc || location).pathname.replace(/\/+$/, '') || '/app';
    const seg = path.replace(/^\/app\/?/, '').split('/')[0] || 'home';
    return { name: seg, path, query: Object.fromEntries(new URLSearchParams((loc || location).search)) };
  }
  function go(url, opts) {
    opts = opts || {};
    if (!/^\/app/.test(url)) { location.href = url; return; }
    if (opts.replace) history.replaceState({}, '', url); else history.pushState({}, '', url);
    if (!opts.silent) RV.render && RV.render();
    if (!opts.keepScroll) window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', () => { RV.render && RV.render(); });
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (a && !a.target && !a.hasAttribute('download')) {
      const href = a.getAttribute('href');
      if (/^\/app(\/|\?|$)/.test(href)) { e.preventDefault(); if (RV.closePops) RV.closePops(); go(href); return; }
    }
    const n = e.target.closest('[data-nav]');
    if (n) { e.preventDefault(); if (RV.closePops) RV.closePops(); go(n.getAttribute('data-nav')); }
  });

  Object.assign(RV, { $, qs, qsa, esc, fmt, usd, first, initials, colorFor, avatar, ago, date, time, debounce, store, api, GET, POST, PUT, DEL, toast, fail, modal, closeModal, confirmBox, countTo, confetti, copy, download, busy, route, routes, parse, go, reduced, S: {} });
})();
