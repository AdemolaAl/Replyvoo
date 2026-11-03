'use strict';
// The one place Replyvoo creates the Voo Connect kit (../../voo-connect, copied UNCHANGED from VooSquare's
// sdk/voo-connect: never edit it, copy a new version over it instead).
//
// Settings come from the environment (VOO_BASE, VOO_CLIENT_ID, VOO_CLIENT_SECRET, VOO_API_KEY, VOO_SIGNAL_SECRET) and can
// be overridden in Admin → Billing rules → VooSquare (saved encrypted in the settings table under "voo_keys"; never sent
// back to the browser). Values saved in the admin win over the variables.
const path = require('node:path');
const config = require('../config');
const db = require('../db');
const { encrypt, decrypt } = require('./security');

const KIT = require(path.join(config.root, 'voo-connect'));
const ROW = 'voo_keys';
let inst = null; let instKey = ''; let started = false;

// Outbox on our own database (one row), so queued events survive restarts and deploys.
const dbStore = {
  load() { try { const r = db.one('SELECT queue FROM voo_queue WHERE id = 1'); return r ? JSON.parse(r.queue) : []; } catch { return []; } },
  save(list) { db.run('INSERT INTO voo_queue (id, queue, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET queue = excluded.queue, updated_at = excluded.updated_at', JSON.stringify(list), db.now()); }
};

const open = b => { if (!b) return ''; try { return decrypt(b); } catch { return ''; } };
function saved() { try { const r = db.one('SELECT value FROM settings WHERE key = ?', ROW); return r ? db.json(r.value, {}) : {}; } catch { return {}; } }

// Effective settings: admin-saved values first, then the environment.
function cfg() {
  const e = config.voo; const s = saved();
  const pick = (enc, envV) => open(s[enc]) || envV || '';
  return {
    on: s.enabled === false ? false : e.on,
    base: String(s.base || e.base || '').replace(/\/+$/, ''),
    serverBase: e.serverBase,
    clientId: s.client_id || e.clientId || '',
    clientSecret: pick('client_secret_enc', e.clientSecret),
    apiKey: pick('api_key_enc', e.apiKey),
    signalSecret: pick('signal_secret_enc', e.signalSecret),
    serviceKey: e.serviceKey,
    redirectUri: e.redirectUri,
    widget: e.widget,
    flushMs: e.flushMs,
    sources: { base: s.base ? 'admin' : e.base ? 'env' : '', client_id: s.client_id ? 'admin' : e.clientId ? 'env' : '', client_secret: s.client_secret_enc ? 'admin' : e.clientSecret ? 'env' : '', api_key: s.api_key_enc ? 'admin' : e.apiKey ? 'env' : '', signal_secret: s.signal_secret_enc ? 'admin' : e.signalSecret ? 'env' : '' }
  };
}
const loginOn = (c = cfg()) => !!(c.on && c.base && c.clientId && c.clientSecret);
const eventsOn = (c = cfg()) => !!(c.on && c.base && c.apiKey);
const anyOn = (c = cfg()) => loginOn(c) || eventsOn(c);

function get() {
  const c = cfg();
  if (!anyOn(c)) return null;
  const key = [c.base, c.serverBase, c.clientId, c.clientSecret, c.apiKey, c.signalSecret, c.redirectUri].join('|');
  if (inst && instKey === key) return inst;
  if (inst) inst.events.stop();
  inst = KIT.createVooConnect({
    base: c.base, serverBase: c.serverBase || undefined, clientId: c.clientId, clientSecret: c.clientSecret, apiKey: c.apiKey,
    signalSecret: c.signalSecret || undefined, redirectUri: c.redirectUri, eventPrefix: 'rv', toolName: 'replyvoo',
    defaultReturnTo: '/app', secureCookies: config.appUrl.startsWith('https://') ? true : undefined, store: dbStore, timeoutMs: 10000,
    backoffMs: Number(process.env.VOO_BACKOFF_MS) || undefined,
    onRejected(ev, error) {
      console.warn('[voosquare] event refused: ' + ev.event_id + ' (' + error + ')');
      try { db.insert('voo_failed', { event_id: ev.event_id, type: ev.type || '', error: String(error).slice(0, 300), body: JSON.stringify(ev), created_at: db.now() }); } catch { /* ignore */ }
    },
    onError(err) { console.warn('[voosquare] ' + err.message); }
  });
  instKey = key;
  if (started) { started = false; start(); }
  return inst;
}

// Background sender (once at boot, on the instance that runs the scheduler).
function start() {
  const k = eventsOn() && get();
  if (!k || started) return false;
  k.events.start(cfg().flushMs || 5000);
  started = true;
  return true;
}
async function stop({ timeoutMs = 5000 } = {}) {
  if (!inst) return;
  inst.events.stop(); started = false;
  if (eventsOn()) await inst.events.drain({ timeoutMs }).catch(() => {});
}
function reset() { if (inst) inst.events.stop(); inst = null; instKey = ''; started = false; }

// Admin: what may be shown (never a secret, only where it comes from and its last 4 characters).
const hint = v => (v ? '…' + String(v).slice(-4) : '');
function publicSettings() {
  const c = cfg();
  return {
    enabled: c.on, login: loginOn(c), events: eventsOn(c), base: c.base, client_id: c.clientId, redirect_uri: c.redirectUri,
    logout_uri: config.appUrl + '/', summary_url: config.appUrl + '/api/voosquare/summary', support_webhook: config.appUrl + '/hooks/voosquare/support',
    launch_path: '/app', has_client_secret: !!c.clientSecret, client_secret_hint: hint(c.clientSecret), has_api_key: !!c.apiKey, api_key_hint: hint(c.apiKey),
    has_signal_secret: !!c.signalSecret, has_service_key: !!c.serviceKey, sources: c.sources, env_off: !config.voo.on
  };
}
// Admin save. Empty secret fields keep what is saved; clear_* removes the admin value (the variable then applies again).
function saveSettings(b = {}) {
  const cur = saved(); const next = { ...cur };
  const t = v => String(v == null ? '' : v).trim();
  if (b.enabled !== undefined) next.enabled = !(b.enabled === false || /^(0|false|off|no)$/i.test(String(b.enabled)));
  if (b.base !== undefined) {
    const base = t(b.base).replace(/\/+$/, '');
    if (base && !/^https?:\/\/[^\s/]+$/i.test(base)) throw Object.assign(new Error('VooSquare address must look like https://voosquare.com (no path).'), { status: 400 });
    next.base = base;
  }
  if (b.client_id !== undefined) { const v = t(b.client_id); if (v && !/^[\w.-]{6,120}$/.test(v)) throw Object.assign(new Error('That client ID does not look right (it starts with vsc_).'), { status: 400 }); next.client_id = v; }
  for (const [field, enc, re, msg] of [['client_secret', 'client_secret_enc', /^\S{12,300}$/, 'The client secret looks too short (it starts with vss_).'], ['api_key', 'api_key_enc', /^\S{12,300}$/, 'The API key looks too short (it starts with vsk_).'], ['signal_secret', 'signal_secret_enc', /^\S{16,300}$/, 'Make the signal secret at least 16 characters (openssl rand -hex 32).']]) {
    const v = t(b[field]);
    if (v) { if (!re.test(v)) throw Object.assign(new Error(msg), { status: 400 }); next[enc] = encrypt(v); }
    else if (b['clear_' + field]) delete next[enc];
  }
  db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', ROW, JSON.stringify(next), db.now());
  reset();
  start();
  return publicSettings();
}

module.exports = { KIT, cfg, get, start, stop, reset, loginOn, eventsOn, anyOn, dbStore, publicSettings, saveSettings };
