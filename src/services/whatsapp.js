'use strict';
/*
 * WhatsApp through Meta's official WhatsApp Business Platform (Cloud API). See docs/WHATSAPP.md.
 *
 * KEYS. Admin → Connections → WhatsApp (owners only) saves the Meta App ID, App Secret, Embedded Signup configuration id,
 * webhook verify token, Graph API version and the on/off switch in the settings table ("whatsapp_keys"). The secret and
 * the verify token are encrypted (AES-256-GCM). META_APP_ID, META_APP_SECRET, WHATSAPP_CONFIG_ID, WHATSAPP_VERIFY_TOKEN,
 * META_GRAPH_VERSION and WHATSAPP_ENABLED are the fallback. Nothing here ever logs or returns a token or a secret.
 *
 * LIVE OR COMING SOON. The channel is Live for customers only when the app is configured AND switched on. Otherwise the
 * website and the dashboard keep showing WhatsApp as "Coming soon" (settings.get('flags') applies effectiveChannel()).
 * The admin "Off" in Channels & features still hides it everywhere.
 *
 * BILLING. Customers connect their own WhatsApp Business Account (WABA) with Embedded Signup and add their own payment
 * method in WhatsApp Manager, so Meta bills THEIR account for template messages. Replyvoo never shares a credit line and
 * never pays Meta. A WhatsApp chat is a normal Replyvoo conversation. The rate table below is only for the estimate shown
 * before a Blast; it is admin-editable and seeded with clearly-labelled estimates.
 */
const config = require('../config');
const db = require('../db');
const { encrypt, decrypt, token: randomToken } = require('../lib/security');
const { HttpError } = require('../lib/http');

const ROW = 'whatsapp_keys';
const RATES_ROW = 'whatsapp_rates';
const DEFAULT_VERSION = 'v26.0';
const WINDOW_MS = 24 * 3600e3;
const WEBHOOK_FIELDS = ['messages', 'message_template_status_update', 'message_template_quality_update', 'template_category_update', 'phone_number_quality_update', 'account_update'];
const PERMISSIONS = ['whatsapp_business_management', 'whatsapp_business_messaging', 'business_management'];

const open = b => { if (!b) return ''; try { return decrypt(b); } catch { return ''; } };
const hint = v => (v ? '…' + String(v).slice(-4) : '');
const truthy = v => /^(1|true|yes|on)$/i.test(String(v));

function saved() {
  const r = db.one('SELECT value FROM settings WHERE key = ?', ROW);
  return { enabled: false, app_id: '', app_secret_enc: '', config_id: '', verify_token_enc: '', graph_version: '', ...(r ? db.json(r.value, {}) : {}) };
}
let cache = null;
function resolve() {
  if (cache) return cache;
  const s = saved(); const e = config.whatsapp;
  const appSecretSaved = open(s.app_secret_enc); const verifySaved = open(s.verify_token_enc);
  const appId = s.app_id || e.appId || '';
  const appSecret = appSecretSaved || e.appSecret || '';
  const configId = s.config_id || e.configId || '';
  const verifyToken = verifySaved || e.verifyToken || '';
  const version = s.graph_version || e.graphVersion || DEFAULT_VERSION;
  const forced = e.enabled !== '';
  const enabled = forced ? truthy(e.enabled) : s.enabled === true;
  const configured = !!(appId && appSecret && verifyToken);
  cache = {
    appId, appSecret, configId, verifyToken, version, enabled, forced, configured,
    on: configured && enabled, signup: configured && enabled && !!configId,
    sources: { app_id: s.app_id ? 'admin' : e.appId ? 'env' : '', app_secret: appSecretSaved ? 'admin' : e.appSecret ? 'env' : '', config_id: s.config_id ? 'admin' : e.configId ? 'env' : '', verify_token: verifySaved ? 'admin' : e.verifyToken ? 'env' : '', graph_version: s.graph_version ? 'admin' : e.graphVersion ? 'env' : 'default' }
  };
  return cache;
}
function reset() { cache = null; }
const on = () => resolve().on;
// The status customers see. Admin "off" always wins; otherwise Live only when configured and switched on.
function effectiveChannel(raw) { return raw === 'off' ? 'off' : on() ? 'live' : 'soon'; }

function publicInfo() {
  const r = resolve();
  return {
    configured: r.configured, enabled: r.enabled, on: r.on, signup_ready: r.signup, forced: r.forced,
    app_id: r.appId, config_id: r.configId, graph_version: r.version, default_version: DEFAULT_VERSION,
    has_app_secret: !!r.appSecret, app_secret_hint: hint(r.appSecret),
    has_verify_token: !!r.verifyToken, verify_token: r.verifyToken, // owners must paste it into Meta, so it is shown to them
    sources: r.sources, webhook_url: config.appUrl + '/webhooks/whatsapp', webhook_fields: WEBHOOK_FIELDS, permissions: PERMISSIONS,
    numbers: db.one("SELECT COUNT(*) n FROM channels WHERE type = 'whatsapp' AND status = 'active'").n
  };
}
// What the dashboard needs to open Meta's Embedded Signup popup. App ID and configuration id are public by design.
function clientInfo() { const r = resolve(); return { on: r.on, signup: r.signup, app_id: r.on ? r.appId : '', config_id: r.signup ? r.configId : '', graph_version: r.version }; }

// Admin change. Empty secret fields keep what is saved. Returns the audit note (never a secret).
function save(b = {}) {
  const cur = saved(); const next = { ...cur };
  const note = { app_secret: 'unchanged', verify_token: 'unchanged' };
  const s = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
  if (b.app_id !== undefined) { const v = s(b.app_id, 40); if (v && !/^\d{5,25}$/.test(v)) throw new HttpError(400, 'The Meta App ID is the number at the top of your app in developers.facebook.com.'); next.app_id = v; }
  if (b.config_id !== undefined) { const v = s(b.config_id, 40); if (v && !/^\d{5,25}$/.test(v)) throw new HttpError(400, 'The Embedded Signup configuration id is a number. Find it in your app → Facebook Login for Business → Configurations.'); next.config_id = v; }
  if (b.graph_version !== undefined) { const v = s(b.graph_version, 10); if (v && !/^v\d{2}\.\d$/.test(v)) throw new HttpError(400, 'The Graph API version looks like ' + DEFAULT_VERSION + '.'); next.graph_version = v; }
  const sec = s(b.app_secret);
  if (sec) { if (!/^[A-Za-z0-9]{16,64}$/.test(sec)) throw new HttpError(400, 'The App Secret is in your app → App settings → Basic → App secret (Show).'); next.app_secret_enc = encrypt(sec); note.app_secret = 'saved'; }
  else if (b.clear_app_secret) { next.app_secret_enc = ''; note.app_secret = cur.app_secret_enc ? 'removed' : 'unchanged'; }
  let vt = s(b.verify_token);
  if (b.generate_verify_token) vt = 'rv_' + randomToken(24).replace(/[^A-Za-z0-9]/g, '');
  if (vt) { if (!/^[\x21-\x7e]{12,200}$/.test(vt)) throw new HttpError(400, 'Use at least 12 letters, numbers or symbols (no spaces) for the verify token, or press Generate.'); next.verify_token_enc = encrypt(vt); note.verify_token = 'saved'; }
  if (b.enabled !== undefined) next.enabled = b.enabled === true || truthy(b.enabled);
  const write = v => db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', ROW, JSON.stringify(v), db.now());
  write(next); reset();
  const r = resolve();
  if (next.enabled && !r.configured) { next.enabled = false; write(next); reset(); afterChange(); throw new HttpError(400, 'Add the App ID, App Secret and webhook verify token first, then switch WhatsApp on.'); }
  afterChange();
  return { info: publicInfo(), audit: { enabled: !!next.enabled, app_id: next.app_id ? 'set' : 'empty', config_id: next.config_id ? 'set' : 'empty', app_secret: note.app_secret, verify_token: note.verify_token, graph_version: next.graph_version || 'default' } };
}
function afterChange() { try { require('./settings').reset(); } catch { /* settings not loaded yet */ } }

/* ---------------- Graph API client ---------------- */
function graphError(message, status, code, sub, data) {
  const e = new Error(String(message || 'Meta error').slice(0, 300));
  e.status = status; e.code = code; e.subcode = sub; e.details = data && data.details ? String(data.details).slice(0, 300) : '';
  return e;
}
const base = () => config.whatsapp.graphBase + '/' + resolve().version;
async function graph(method, path, { token, query, body, form, timeout = 20000 } = {}) {
  const u = new URL(base() + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') u.searchParams.set(k, String(v));
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  // The URL can hold the app secret (code exchange), so it is never part of an error message or log line.
  try { res = await fetch(u.toString(), { method, headers, body: payload, signal: AbortSignal.timeout(timeout) }); }
  catch { throw graphError('Meta could not be reached. Try again in a minute.', 0); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j && j.error)) {
    const er = (j && j.error) || {};
    throw graphError(er.error_user_msg || er.message || 'Meta answered HTTP ' + res.status, res.status, er.code, er.error_subcode, er.error_data);
  }
  return j || {};
}

// Embedded Signup: the 30-second code from the popup → the customer's business token (business integration system user).
async function exchangeCode(code) {
  const r = resolve();
  const j = await graph('GET', '/oauth/access_token', { query: { client_id: r.appId, client_secret: r.appSecret, code } });
  if (!j.access_token) throw graphError('Meta did not return a token', 400);
  return String(j.access_token);
}
// Which WhatsApp Business Accounts this token can manage (used when the popup message did not reach us).
async function wabasOfToken(tok) {
  const r = resolve();
  const j = await graph('GET', '/debug_token', { query: { input_token: tok, access_token: r.appId + '|' + r.appSecret } });
  const scopes = (j.data && j.data.granular_scopes) || [];
  const s = scopes.find(x => x.scope === 'whatsapp_business_management') || scopes.find(x => x.scope === 'whatsapp_business_messaging');
  return (s && s.target_ids) || [];
}
const listPhones = (waba, tok) => graph('GET', '/' + enc(waba) + '/phone_numbers', { token: tok, query: { fields: 'id,display_phone_number,verified_name,quality_rating' } }).then(j => j.data || []);
const phoneInfo = (phoneId, tok) => graph('GET', '/' + enc(phoneId), { token: tok, query: { fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,messaging_limit_tier' } });
const subscribe = (waba, tok) => graph('POST', '/' + enc(waba) + '/subscribed_apps', { token: tok });
const unsubscribe = (waba, tok) => graph('DELETE', '/' + enc(waba) + '/subscribed_apps', { token: tok });
const register = (phoneId, tok, pin) => graph('POST', '/' + enc(phoneId) + '/register', { token: tok, body: { messaging_product: 'whatsapp', pin } });
const enc = v => encodeURIComponent(String(v));
async function testApp() {
  const r = resolve();
  if (!r.appId || !r.appSecret) return { ok: false, message: 'Add the App ID and App Secret first.' };
  try {
    const j = await graph('GET', '/' + enc(r.appId), { query: { fields: 'id,name', access_token: r.appId + '|' + r.appSecret }, timeout: 10000 });
    return { ok: true, message: 'Connected to the Meta app' + (j.name ? ' “' + String(j.name).slice(0, 60) + '”' : '') + '.' + (r.verifyToken ? '' : ' Add the webhook verify token too.') + (r.configId ? '' : ' Add the Embedded Signup configuration id so customers can connect in one tap.') + (r.on ? '' : ' Customers still see “Coming soon” until you switch WhatsApp on.') };
  } catch (e) {
    if (e.status === 0) return { ok: false, message: e.message };
    return { ok: false, message: 'Meta refused the App ID or App Secret (' + e.message + '). Copy them again from App settings → Basic.' };
  }
}

/* ---------------- sending ---------------- */
async function sendRaw(channel, tok, to, msg) {
  const j = await graph('POST', '/' + enc(channel.external_id) + '/messages', { token: tok, body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to), ...msg } });
  const id = j.messages && j.messages[0] && j.messages[0].id;
  return { message_id: id || null };
}
const textMsg = (body) => ({ type: 'text', text: { body: String(body).slice(0, 4096), preview_url: /https?:\/\//.test(String(body)) } });
// Reply buttons (up to 3, 20 characters) or a list (up to 10 rows, 24 characters) for the Closer's suggested answers.
function optionsMsg(body, options) {
  const opts = options.map(o => String(o).trim()).filter(Boolean).slice(0, 10);
  const text = String(body).slice(0, 1024);
  if (opts.length <= 3) return { type: 'interactive', interactive: { type: 'button', body: { text }, action: { buttons: opts.map((t, i) => ({ type: 'reply', reply: { id: 'opt_' + (i + 1), title: t.slice(0, 20) } })) } } };
  return { type: 'interactive', interactive: { type: 'list', body: { text }, action: { button: 'See options', sections: [{ title: 'Options', rows: opts.map((t, i) => ({ id: 'opt_' + (i + 1), title: t.slice(0, 24) })) }] } } };
}
// PayLink as a tap-to-pay button (the link is removed from the text, the button opens it).
function payMsg(body, url, label = 'Pay now') {
  const text = String(body).split(url).join('').replace(/[ \t]+\n/g, '\n').replace(/\s*[:-]\s*$/, '').trim() || 'Tap the button to pay.';
  return { type: 'interactive', interactive: { type: 'cta_url', body: { text: text.slice(0, 1024) }, action: { name: 'cta_url', parameters: { display_text: String(label).slice(0, 20), url } } } };
}
function mediaMsg(kind, mediaId, { caption, filename } = {}) {
  const o = { id: mediaId };
  if (caption && kind !== 'audio') o.caption = String(caption).slice(0, 1024);
  if (filename && kind === 'document') o.filename = String(filename).slice(0, 240);
  return { type: kind, [kind]: o };
}
// Marks the customer's message as read (blue ticks) and, optionally, shows "typing…" until our reply (max 25 s).
function markRead(channel, tok, wamid, typing = false) {
  if (!tok || !wamid) return Promise.resolve();
  const body = { messaging_product: 'whatsapp', status: 'read', message_id: wamid };
  if (typing) body.typing_indicator = { type: 'text' };
  return graph('POST', '/' + enc(channel.external_id) + '/messages', { token: tok, body, timeout: 8000 }).catch(() => {});
}

/* ---------------- media ---------------- */
const MEDIA_KINDS = { image: ['image/jpeg', 'image/png', 'image/webp'], document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv'], audio: ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr'], video: ['video/mp4', 'video/3gpp'] };
const MEDIA_MAX = { image: 5 * 1024 * 1024, document: 16 * 1024 * 1024, audio: 16 * 1024 * 1024, video: 16 * 1024 * 1024 };
function kindOfMime(mime) { const m = String(mime || '').split(';')[0].trim().toLowerCase(); return Object.keys(MEDIA_KINDS).find(k => MEDIA_KINDS[k].includes(m)) || null; }
async function uploadMedia(channel, tok, buf, mime, filename = 'file') {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([buf], { type: mime }), filename);
  const j = await graph('POST', '/' + enc(channel.external_id) + '/media', { token: tok, form, timeout: 60000 });
  if (!j.id) throw graphError('Meta did not accept the file', 400);
  return String(j.id);
}
async function downloadMedia(tok, mediaId, maxBytes = 16 * 1024 * 1024) {
  const info = await graph('GET', '/' + enc(mediaId), { token: tok });
  if (info.file_size && Number(info.file_size) > maxBytes) throw new Error('File too large');
  if (!info.url || !/^https?:\/\//.test(info.url)) throw new Error('No media link');
  let res;
  try { res = await fetch(info.url, { headers: { Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('Media download failed'); }
  if (!res.ok) throw new Error('Media download failed');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error('File too large');
  return { buffer, mime: String(info.mime_type || res.headers.get('content-type') || 'application/octet-stream').split(';')[0] };
}

/* ---------------- the 24-hour customer service window ---------------- */
function windowEndsAt(thread) { const t = thread && thread.last_customer_at ? new Date(thread.last_customer_at).getTime() : NaN; return Number.isFinite(t) ? t + WINDOW_MS : 0; }
function windowOpen(thread, now = Date.now()) { return windowEndsAt(thread) > now; }
function windowInfo(thread, now = Date.now()) {
  const ends = windowEndsAt(thread); const left = Math.max(0, ends - now);
  return { open: left > 0, ends_at: ends ? new Date(ends).toISOString() : null, left_ms: left, label: left > 0 ? 'Free reply window: ' + leftWords(left) + ' left' : 'Free reply window closed' };
}
function leftWords(ms) { const h = Math.floor(ms / 3600e3); if (h >= 1) return h + 'h'; const m = Math.max(1, Math.floor(ms / 60e3)); return m + ' min'; }

/* ---------------- templates ---------------- */
const VAR = /\{\{\s*(\d+)\s*\}\}/g;
const HAS_VAR = /\{\{\s*\d+\s*\}\}/;
const countVars = t => { let n = 0; for (const m of String(t || '').matchAll(VAR)) n = Math.max(n, Number(m[1])); return n; };
function parts(components) {
  const c = Array.isArray(components) ? components : [];
  const find = t => c.find(x => String(x.type).toUpperCase() === t) || null;
  const header = find('HEADER'); const body = find('BODY'); const footer = find('FOOTER'); const btns = find('BUTTONS');
  return { header, body, footer, buttons: btns && Array.isArray(btns.buttons) ? btns.buttons : [] };
}
// Can Replyvoo fill this template by itself? Text headers and body variables yes; media headers and dynamic URL buttons no.
function sendable(components) {
  const p = parts(components);
  if (p.header && String(p.header.format || 'TEXT').toUpperCase() !== 'TEXT') return false;
  if (p.buttons.some(b => String(b.type).toUpperCase() === 'URL' && HAS_VAR.test(String(b.url || '')))) return false;
  if (p.buttons.some(b => ['OTP', 'COPY_CODE', 'FLOW', 'CATALOG', 'MPM'].includes(String(b.type).toUpperCase()))) return false;
  return !!p.body;
}
function templateOut(row) {
  const comps = db.json(row.components, []);
  const p = parts(comps);
  const hv = p.header && String(p.header.format || 'TEXT').toUpperCase() === 'TEXT' ? countVars(p.header.text) : 0;
  const bv = p.body ? countVars(p.body.text) : 0;
  return {
    id: row.id, channel_id: row.channel_id, name: row.name, language: row.language, category: row.category, status: row.status, reason: row.reason,
    header: p.header ? (p.header.text || '[' + String(p.header.format || '').toLowerCase() + ']') : '', body: p.body ? p.body.text || '' : '', footer: p.footer ? p.footer.text || '' : '',
    buttons: p.buttons.map(b => ({ type: b.type, text: b.text || '', url: b.url || '' })), header_vars: hv, body_vars: bv,
    sendable: row.status === 'APPROVED' && sendable(comps), updated_at: row.updated_at
  };
}
// Fills {{1}}, {{2}} … from vars (header variables first, then body). "{first_name}" becomes the customer's first name.
function fillVars(values, contact) {
  const first = String((contact && contact.name) || '').trim().split(/\s+/)[0] || 'there';
  return values.map(v => String(v == null ? '' : v).replace(/\{first_name\}/gi, first).replace(/\{name\}/gi, String((contact && contact.name) || first)).slice(0, 1000).trim() || first);
}
function templateMsg(row, values = [], contact = null) {
  const t = templateOut(row);
  const vals = fillVars(values, contact);
  const comps = [];
  if (t.header_vars) comps.push({ type: 'header', parameters: vals.slice(0, t.header_vars).map(text => ({ type: 'text', text })) });
  if (t.body_vars) comps.push({ type: 'body', parameters: vals.slice(t.header_vars, t.header_vars + t.body_vars).map(text => ({ type: 'text', text })) });
  return { type: 'template', template: { name: row.name, language: { code: row.language }, ...(comps.length ? { components: comps } : {}) } };
}
// The words the customer will see (for the inbox and the AI's memory).
function renderTemplate(row, values = [], contact = null) {
  const t = templateOut(row); const vals = fillVars(values, contact);
  const sub = (s, off) => String(s || '').replace(VAR, (_, n) => vals[off + Number(n) - 1] || '');
  return [t.header && t.header_vars ? sub(t.header, 0) : t.header, sub(t.body, t.header_vars), t.footer].filter(Boolean).join('\n').trim();
}
function needVars(row) { const t = templateOut(row); return t.header_vars + t.body_vars; }

async function syncTemplates(channel, tok) {
  const waba = db.json(channel.data, {}).waba_id;
  if (!waba) throw new HttpError(400, 'This WhatsApp number has no Business Account id. Reconnect it.');
  const seen = []; let after = null; let pages = 0;
  do {
    const j = await graph('GET', '/' + enc(waba) + '/message_templates', { token: tok, query: { fields: 'id,name,language,category,status,components,rejected_reason', limit: 100, after } });
    for (const t of j.data || []) { upsertTemplate(channel, waba, t); seen.push(String(t.name) + '|' + String(t.language)); }
    after = j.paging && j.paging.next && j.paging.cursors && j.paging.cursors.after ? j.paging.cursors.after : null;
  } while (after && ++pages < 20);
  // Templates deleted in WhatsApp Manager disappear here too.
  for (const r of db.all('SELECT id, name, language FROM wa_templates WHERE waba_id = ? AND workspace_id = ?', waba, channel.workspace_id)) if (!seen.includes(r.name + '|' + r.language)) db.run('DELETE FROM wa_templates WHERE id = ?', r.id);
  return db.all('SELECT * FROM wa_templates WHERE waba_id = ? AND workspace_id = ? ORDER BY name', waba, channel.workspace_id).map(templateOut);
}
function upsertTemplate(channel, waba, t) {
  const now = db.now();
  const row = { meta_id: String(t.id || ''), category: String(t.category || 'MARKETING').toUpperCase(), status: String(t.status || 'PENDING').toUpperCase(), components: JSON.stringify(Array.isArray(t.components) ? t.components : []), reason: t.rejected_reason && t.rejected_reason !== 'NONE' ? String(t.rejected_reason).slice(0, 200) : '', updated_at: now };
  const ex = db.one('SELECT id FROM wa_templates WHERE waba_id = ? AND name = ? AND language = ?', waba, String(t.name), String(t.language));
  if (ex) db.update('wa_templates', ex.id, { ...row, channel_id: channel.id, workspace_id: channel.workspace_id });
  else db.insert('wa_templates', { workspace_id: channel.workspace_id, channel_id: channel.id, waba_id: waba, name: String(t.name).slice(0, 512), language: String(t.language).slice(0, 15), ...row, created_at: now });
}

// The simple template builder: validates and builds Meta's components.
const LANGS = ['en', 'en_US', 'en_GB', 'fr', 'pt_BR', 'pt_PT', 'es', 'es_MX', 'sw', 'ar', 'de', 'it', 'nl', 'tr', 'hi', 'id', 'ms', 'zu', 'af', 'am', 'ha', 'yo', 'ig'];
function cleanTemplate(b = {}) {
  const s = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max);
  const name = s(b.name, 512).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!name) throw new HttpError(400, 'Give the template a name, like order_update or new_arrivals.');
  const language = s(b.language, 15) || 'en';
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) throw new HttpError(400, 'Pick a language for the template.');
  const category = String(b.category || 'MARKETING').toUpperCase();
  if (!['MARKETING', 'UTILITY'].includes(category)) throw new HttpError(400, 'Choose Marketing or Utility. Authentication templates are made in WhatsApp Manager.');
  const body = s(b.body, 1024);
  if (!body) throw new HttpError(400, 'Write the message text.');
  const header = s(b.header, 60); const footer = s(b.footer, 60);
  if (/[\n]/.test(header)) throw new HttpError(400, 'The title must be one line.');
  if (HAS_VAR.test(footer)) throw new HttpError(400, 'The small print can’t have {{1}} variables.');
  const hv = countVars(header); const bv = countVars(body);
  if (hv > 1) throw new HttpError(400, 'The title can have one variable at most: {{1}}.');
  const nums = t => [...String(t).matchAll(VAR)].map(m => Number(m[1]));
  const seq = (t, n) => { const got = new Set(nums(t)); for (let i = 1; i <= n; i++) if (!got.has(i)) return false; return true; };
  if (!seq(body, bv)) throw new HttpError(400, 'Number the variables in order: {{1}}, {{2}}, {{3}} …');
  if (/^\s*\{\{\s*\d+\s*\}\}|\{\{\s*\d+\s*\}\}\s*$/.test(body)) throw new HttpError(400, 'Meta does not accept a variable at the very start or end of the text. Add a word before or after it.');
  const ex = Array.isArray(b.examples) ? b.examples.map(x => s(x, 200)) : [];
  if (ex.length < hv + bv || ex.slice(0, hv + bv).some(x => !x)) throw new HttpError(400, 'Add an example for every variable. Meta uses the examples to review the template.');
  const comps = [];
  if (header) comps.push({ type: 'HEADER', format: 'TEXT', text: header, ...(hv ? { example: { header_text: [ex[0]] } } : {}) });
  comps.push({ type: 'BODY', text: body, ...(bv ? { example: { body_text: [ex.slice(hv, hv + bv)] } } : {}) });
  if (footer) comps.push({ type: 'FOOTER', text: footer });
  const buttons = [];
  for (const q of (Array.isArray(b.quick_replies) ? b.quick_replies : []).map(x => s(x, 25)).filter(Boolean).slice(0, 3)) buttons.push({ type: 'QUICK_REPLY', text: q });
  if (b.url_text || b.url) {
    const url = s(b.url, 2000); const text = s(b.url_text, 25) || 'Open';
    if (!/^https:\/\/[^\s]+$/.test(url) || HAS_VAR.test(url)) throw new HttpError(400, 'The button link must start with https:// and have no variables.');
    buttons.push({ type: 'URL', text, url });
  }
  if (buttons.length) comps.push({ type: 'BUTTONS', buttons });
  return { name, language, category, components: comps };
}
async function createTemplate(channel, tok, input) {
  const waba = db.json(channel.data, {}).waba_id;
  const t = cleanTemplate(input);
  if (db.one('SELECT id FROM wa_templates WHERE waba_id = ? AND name = ? AND language = ?', waba, t.name, t.language)) throw new HttpError(409, 'A template with this name and language already exists. Pick another name.');
  const j = await graph('POST', '/' + enc(waba) + '/message_templates', { token: tok, body: t });
  upsertTemplate(channel, waba, { id: j.id, name: t.name, language: t.language, category: j.category || t.category, status: j.status || 'PENDING', components: t.components });
  return templateOut(db.one('SELECT * FROM wa_templates WHERE waba_id = ? AND name = ? AND language = ?', waba, t.name, t.language));
}
async function deleteTemplate(channel, tok, row) {
  await graph('DELETE', '/' + enc(row.waba_id) + '/message_templates', { token: tok, query: { name: row.name, hsm_id: row.meta_id || undefined } });
  db.run('DELETE FROM wa_templates WHERE id = ?', row.id);
}

/* ---------------- Meta's per-message rates (estimates for the Blast preview) ---------------- */
// Seeded from Meta's published rate card (USD per delivered template message, effective 1 October 2025, as copied by a
// WhatsApp partner). ESTIMATES ONLY: Meta changes rates and bills the customer's own account. The owner keeps this table
// up to date from https://developers.facebook.com/docs/whatsapp/pricing in Admin → Connections → WhatsApp.
const RATE_SOURCE = 'https://developers.facebook.com/docs/whatsapp/pricing';
const DEFAULT_RATES = [
  ['US', 'United States and Canada', 0.0250, 0.0040, 0.0040], ['GB', 'United Kingdom', 0.0529, 0.0220, 0.0220], ['NG', 'Nigeria', 0.0516, 0.0067, 0.0067],
  ['ZA', 'South Africa', 0.0379, 0.0076, 0.0076], ['EG', 'Egypt', 0.1073, 0.0036, 0.0036], ['XAF', 'Rest of Africa', 0.0225, 0.0040, 0.0040],
  ['IN', 'India', 0.0107, 0.0014, 0.0014], ['BR', 'Brazil', 0.0625, 0.0068, 0.0068], ['DE', 'Germany', 0.1365, 0.0550, 0.0550],
  ['FR', 'France', 0.1432, 0.0300, 0.0300], ['AE', 'United Arab Emirates', 0.0499, 0.0157, 0.0157], ['SA', 'Saudi Arabia', 0.0455, 0.0107, 0.0107],
  ['ID', 'Indonesia', 0.0411, 0.0250, 0.0250], ['MX', 'Mexico', 0.0305, 0.0085, 0.0085], ['*', 'Other countries', 0.0604, 0.0077, 0.0077]
].map(([code, name, marketing, utility, authentication]) => ({ code, name, marketing, utility, authentication }));
const RATE_NOTE = 'Seeded estimates from Meta’s rate card effective 1 October 2025. Meta changes its prices: check ' + RATE_SOURCE + ' and update this table.';
function rates() {
  const r = db.one('SELECT value FROM settings WHERE key = ?', RATES_ROW);
  const v = r ? db.json(r.value, null) : null;
  if (!v || !Array.isArray(v.rows) || !v.rows.length) return { rows: DEFAULT_RATES, estimate: true, checked_at: '', note: RATE_NOTE, source: RATE_SOURCE, seeded: true };
  return { rows: v.rows, estimate: v.estimate !== false, checked_at: v.checked_at || '', note: v.note || RATE_NOTE, source: RATE_SOURCE, seeded: false };
}
function saveRates(b = {}) {
  const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 300).map(x => {
    const code = String(x.code || '').trim().toUpperCase();
    if (!/^([A-Z]{2}|XAF|\*)$/.test(code)) throw new HttpError(400, 'Each row needs a 2-letter country code (or XAF for Rest of Africa, * for every other country).');
    const n = k => { const v = Number(x[k]); if (!(v >= 0) || v > 5) throw new HttpError(400, 'Rates are US dollars per message, between 0 and 5 (' + code + ' ' + k + ').'); return Math.round(v * 1e6) / 1e6; };
    return { code, name: String(x.name || code).trim().slice(0, 60), marketing: n('marketing'), utility: n('utility'), authentication: n('authentication') };
  });
  if (!rows.some(r => r.code === '*')) throw new HttpError(400, 'Keep a * row: it is used for every country that has no row of its own.');
  if (new Set(rows.map(r => r.code)).size !== rows.length) throw new HttpError(400, 'Each country code can only appear once.');
  const val = { rows, estimate: b.checked !== true, checked_at: b.checked === true ? db.now() : '', note: String(b.note || RATE_NOTE).slice(0, 400) };
  db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', RATES_ROW, JSON.stringify(val), db.now());
  return rates();
}
// Calling codes → country (longest prefix wins). Enough for the rate estimate; unknown numbers use the * row.
const CC = { 1: 'US', 7: 'RU', 20: 'EG', 27: 'ZA', 30: 'GR', 31: 'NL', 32: 'BE', 33: 'FR', 34: 'ES', 36: 'HU', 39: 'IT', 40: 'RO', 41: 'CH', 43: 'AT', 44: 'GB', 45: 'DK', 46: 'SE', 47: 'NO', 48: 'PL', 49: 'DE', 51: 'PE', 52: 'MX', 53: 'CU', 54: 'AR', 55: 'BR', 56: 'CL', 57: 'CO', 58: 'VE', 60: 'MY', 61: 'AU', 62: 'ID', 63: 'PH', 64: 'NZ', 65: 'SG', 66: 'TH', 81: 'JP', 82: 'KR', 84: 'VN', 86: 'CN', 90: 'TR', 91: 'IN', 92: 'PK', 93: 'AF', 94: 'LK', 95: 'MM', 98: 'IR',
  211: 'SS', 212: 'MA', 213: 'DZ', 216: 'TN', 218: 'LY', 220: 'GM', 221: 'SN', 222: 'MR', 223: 'ML', 224: 'GN', 225: 'CI', 226: 'BF', 227: 'NE', 228: 'TG', 229: 'BJ', 230: 'MU', 231: 'LR', 232: 'SL', 233: 'GH', 234: 'NG', 235: 'TD', 236: 'CF', 237: 'CM', 238: 'CV', 240: 'GQ', 241: 'GA', 242: 'CG', 243: 'CD', 244: 'AO', 245: 'GW', 248: 'SC', 249: 'SD', 250: 'RW', 251: 'ET', 252: 'SO', 253: 'DJ', 254: 'KE', 255: 'TZ', 256: 'UG', 257: 'BI', 258: 'MZ', 260: 'ZM', 261: 'MG', 263: 'ZW', 264: 'NA', 265: 'MW', 266: 'LS', 267: 'BW', 268: 'SZ', 269: 'KM',
  351: 'PT', 352: 'LU', 353: 'IE', 354: 'IS', 358: 'FI', 380: 'UA', 420: 'CZ', 852: 'HK', 880: 'BD', 886: 'TW', 961: 'LB', 962: 'JO', 963: 'SY', 964: 'IQ', 965: 'KW', 966: 'SA', 967: 'YE', 968: 'OM', 970: 'PS', 971: 'AE', 972: 'IL', 973: 'BH', 974: 'QA', 977: 'NP' };
const AFRICA = new Set(['EG', 'ZA', 'SS', 'MA', 'DZ', 'TN', 'LY', 'GM', 'SN', 'MR', 'ML', 'GN', 'CI', 'BF', 'NE', 'TG', 'BJ', 'MU', 'LR', 'SL', 'GH', 'NG', 'TD', 'CF', 'CM', 'CV', 'GQ', 'GA', 'CG', 'CD', 'AO', 'GW', 'SC', 'SD', 'RW', 'ET', 'SO', 'DJ', 'KE', 'TZ', 'UG', 'BI', 'MZ', 'ZM', 'MG', 'ZW', 'NA', 'MW', 'LS', 'BW', 'SZ', 'KM']);
function countryOf(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  for (let n = 3; n >= 1; n--) { const c = CC[Number(d.slice(0, n))]; if (d.length > n && c) return c; }
  return '';
}
function rateRow(cc, table = rates()) {
  return table.rows.find(r => r.code === cc) || (AFRICA.has(cc) ? table.rows.find(r => r.code === 'XAF') : null) || table.rows.find(r => r.code === '*') || { code: '*', name: 'Other countries', marketing: 0, utility: 0, authentication: 0 };
}
// What Meta will probably bill the customer's WhatsApp account for one template message to each of these numbers.
function estimate(phones, category = 'MARKETING') {
  const table = rates(); const key = String(category).toLowerCase();
  const by = new Map();
  for (const p of phones) {
    const row = rateRow(countryOf(p), table);
    const k = row.code;
    if (!by.has(k)) by.set(k, { code: k, name: row.name, people: 0, rate: Number(row[key] != null ? row[key] : row.marketing) || 0 });
    by.get(k).people++;
  }
  const list = [...by.values()].map(x => ({ ...x, total: Math.round(x.people * x.rate * 10000) / 10000 })).sort((a, b) => b.people - a.people);
  const total = Math.round(list.reduce((s, x) => s + x.total, 0) * 100) / 100;
  return { category: String(category).toUpperCase(), countries: list, total_usd: total, estimate: table.estimate, checked_at: table.checked_at, source: table.source };
}

/* ---------------- delivery status bookkeeping ---------------- */
const RANK = { '': 0, sent: 1, delivered: 2, read: 3, failed: 4 };
function track(wamid, channelId, messageId, dir = 'out') {
  if (!wamid) return;
  const now = db.now();
  db.run('INSERT INTO wa_messages (wamid, channel_id, message_id, dir, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(wamid) DO UPDATE SET message_id = excluded.message_id', String(wamid), channelId, messageId, dir, dir === 'out' ? 'sent' : '', now, now);
}
// Inbound de-duplication: true the first time a message id is seen, false for Meta's retries.
function firstSeen(wamid, channelId) {
  if (!wamid) return true;
  const now = db.now();
  return db.run('INSERT OR IGNORE INTO wa_messages (wamid, channel_id, dir, created_at, updated_at) VALUES (?, ?, \'in\', ?, ?)', String(wamid), channelId, now, now).changes > 0;
}
const STATUS_WORDS = { sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Not delivered' };

module.exports = {
  resolve, reset, on, effectiveChannel, publicInfo, clientInfo, save, testApp, graph, exchangeCode, wabasOfToken, listPhones, phoneInfo, subscribe, unsubscribe, register,
  sendRaw, textMsg, optionsMsg, payMsg, mediaMsg, markRead, uploadMedia, downloadMedia, kindOfMime, MEDIA_KINDS, MEDIA_MAX,
  windowEndsAt, windowOpen, windowInfo, WINDOW_MS, countVars, templateOut, templateMsg, renderTemplate, needVars, syncTemplates, upsertTemplate, cleanTemplate, createTemplate, deleteTemplate, LANGS,
  rates, saveRates, estimate, countryOf, rateRow, DEFAULT_RATES, track, firstSeen, RANK, STATUS_WORDS, WEBHOOK_FIELDS, PERMISSIONS, DEFAULT_VERSION
};
