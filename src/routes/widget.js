'use strict';
// Public API for the embeddable website chat widget (/widget.js). Lives under /w/, not /api/, because it is
// called cross-origin from customers' websites: there is no session cookie and no x-rv header. Instead every
// request is checked against the widget's allowed domains (Origin / Referer), rate-limited per IP and per
// visitor, and only ever sees its own visitor's conversation. CORS is answered here, never with "*".
const db = require('../db');
const ws = require('../services/workspace');
const settings = require('../services/settings');
const engine = require('../services/engine');
const web = require('../services/website');
const { HttpError } = require('../lib/http');
const { sha256 } = require('../lib/security');

const VISITOR = /^v_[A-Za-z0-9]{16,40}$/;
const KEY = /^wk_[A-Za-z0-9]{16,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9][0-9 ()./-]{4,22}[0-9]$/;
const MAX_TEXT = 1000;

// In-memory limiter keyed by anything (IP, visitor). One process only, like the rest of Replyvoo.
const buckets = new Map();
function hit(key, max, windowMs) {
  const t = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < t) { b = { n: 0, reset: t + windowMs }; buckets.set(key, b); }
  b.n++;
  if (b.n > max) throw new HttpError(429, 'You’re sending messages too fast. Please wait a moment and try again.', { retry_after: Math.ceil((b.reset - t) / 1000) });
}
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 60000).unref();

function cors(req, res, origin) {
  res.setHeader('Vary', 'Origin');
  if (!origin) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

// Loads the channel for :key and enforces the origin lock. Sets CORS headers only for allowed origins.
function load(req, res) {
  const key = String(req.params.key || '');
  if (!KEY.test(key)) throw new HttpError(404, 'Unknown widget');
  const channel = db.one('SELECT * FROM channels WHERE type = \'website\' AND external_id = ?', key);
  if (!channel || channel.status === 'deleted') throw new HttpError(404, 'This chat is not available.');
  const { widget, domains } = web.widgetOf(channel);
  const origin = web.requestOrigin(req);
  if (!web.originAllowed(origin, domains) && !(web.isLink(channel) && web.ownHost(origin, req))) {
    res.setHeader('Vary', 'Origin');
    throw new HttpError(403, origin ? 'This website is not allowed to use this chat. Add ' + (web.hostOf(origin) || 'it') + ' under Domains in Widget Studio.' : 'Open this chat from your website.', { code: 'origin_not_allowed' });
  }
  if (req.headers.origin && req.headers.origin !== 'null') cors(req, res, req.headers.origin);
  return { channel, widget, domains, origin };
}

// The text/plain fallback lets very old embeds post without a preflight.
function body(req) {
  if (req.body && Object.keys(req.body).length) return req.body;
  if (req.rawBody && req.rawBody.length && /text\/plain/.test(req.headers['content-type'] || '')) { try { const j = JSON.parse(req.rawBody.toString('utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; } }
  return req.body || {};
}

function live(channel) {
  const flag = settings.channel('website');
  if (flag !== 'live' && !(web.isLink(channel) && flag !== 'off')) return 'Chat is offline right now.';
  const w = ws.get(channel.workspace_id);
  if (!w || w.status !== 'active' || channel.status !== 'active') return 'This chat is paused.';
  if (!web.channelUnlocked(channel)) return 'This chat is paused.';
  return '';
}

function visitorName(visitor) { return 'Website visitor #' + String(parseInt(sha256(visitor).slice(0, 6), 16) % 9000 + 1000); }
const cleanUrl = u => { const s = String(u || '').slice(0, 500); return /^https?:\/\//i.test(s) ? s : ''; };

function threadFor(channel, visitor) {
  return db.one('SELECT * FROM threads WHERE channel_id = ? AND chat_id = ? AND business_connection_id = \'\'', channel.id, visitor);
}
function outMessages(thread, after) {
  if (!thread) return [];
  return db.all('SELECT id, author, text, created_at FROM messages WHERE thread_id = ? AND dir = \'out\' AND id > ? ORDER BY id LIMIT 50', thread.id, Math.max(0, Number(after) || 0))
    .map(m => ({ id: m.id, author: m.author === 'human' ? 'human' : 'ai', text: m.text, created_at: m.created_at }));
}

// Remember where the widget was last seen, for "Check installation" in Widget Studio (at most once a minute).
function recordSeen(channel, origin) {
  const host = web.hostOf(origin);
  if (!host) return;
  const d = db.json(channel.data, {});
  const inst = d.install || {};
  if (inst.host === host && inst.seen_at && Date.now() - new Date(inst.seen_at).getTime() < 60000) return;
  const fresh = db.json((db.one('SELECT data FROM channels WHERE id = ?', channel.id) || {}).data, {});
  fresh.install = { host, origin: String(origin).slice(0, 200), seen_at: db.now(), first_seen_at: inst.first_seen_at || db.now() };
  db.update('channels', channel.id, { data: JSON.stringify(fresh) });
}

module.exports = function (app) {
  // CORS preflight. Only allowed origins get the Access-Control-* headers.
  app.on('OPTIONS', '/w/:key/:what', (req, res) => {
    let origin = '';
    try {
      const channel = KEY.test(req.params.key) ? db.one('SELECT * FROM channels WHERE type = \'website\' AND external_id = ? AND status != \'deleted\'', req.params.key) : null;
      if (channel && (web.originAllowed(req.headers.origin, web.widgetOf(channel).domains) || (web.isLink(channel) && web.ownHost(req.headers.origin, req)))) origin = req.headers.origin;
    } catch { origin = ''; }
    cors(req, res, origin);
    res.writeHead(origin ? 204 : 403, { 'Content-Length': 0 });
    res.end();
  });

  app.get('/w/:key/config', (req, res) => {
    hit('wcfg:' + req.ip, 300, 600e3);
    const { channel, origin } = load(req, res);
    try { recordSeen(channel, origin); } catch (e) { console.warn('[widget] seen', e.message); }
    const cfg = web.publicConfig(channel);
    const why = live(channel);
    if (why) { cfg.online = false; cfg.offline_reason = why; }
    res.json(cfg);
  });

  app.post('/w/:key/messages', async (req, res) => {
    const { channel, widget } = load(req, res);
    const b = body(req);
    const visitor = String(b.visitor_id || '');
    if (!VISITOR.test(visitor)) throw new HttpError(400, 'Bad visitor id');
    const text = String(b.text == null ? '' : b.text).replace(/\r\n?/g, '\n').trim();
    if (!text) throw new HttpError(400, 'Type a message first.');
    if (text.length > MAX_TEXT) throw new HttpError(400, 'Messages can be at most ' + MAX_TEXT.toLocaleString('en-US') + ' characters.');
    const why = live(channel);
    if (why) throw new HttpError(503, why, { offline: true });
    hit('wip:' + req.ip, 200, 3600e3);
    hit('wv:' + channel.id + ':' + visitor, 30, 600e3);
    const existing = db.one('SELECT id, name FROM contacts WHERE workspace_id = ? AND channel_id = ? AND external_id = ?', channel.workspace_id, channel.id, visitor);
    const from = { id: visitor, name: existing ? '' : visitorName(visitor) };
    const meta = { page_url: cleanUrl(b.page_url), page_title: String(b.page_title || '').slice(0, 140) };
    const out = await engine.handleInbound({ channel, chatId: visitor, from, text, meta, detail: true });
    const thread = threadFor(channel, visitor);
    const timing = out ? web.replyTiming(widget, out.text) : { delay_ms: 0, typing_ms: 0 };
    const human = !!(thread && (!thread.ai_on || (thread.status === 'handoff' && !(out && out.handoff))));
    return {
      reply: out && out.text ? { id: out.id, author: 'ai', text: out.text, created_at: out.created_at } : null,
      delay_ms: timing.delay_ms, typing_ms: timing.typing_ms,
      handoff: !!(out && out.handoff) || !!(thread && thread.status === 'handoff'),
      human, team_online: web.teamOnline(widget.hours),
      last_id: thread ? (db.one('SELECT MAX(id) m FROM messages WHERE thread_id = ? AND dir = \'out\'', thread.id).m || 0) : 0
    };
  });

  app.get('/w/:key/messages', (req, res) => {
    hit('wpoll:' + req.ip, 2400, 3600e3);
    const { channel } = load(req, res);
    const visitor = String(req.query.visitor_id || '');
    if (!VISITOR.test(visitor)) throw new HttpError(400, 'Bad visitor id');
    const thread = threadFor(channel, visitor);
    return { messages: outMessages(thread, req.query.after), human: !!(thread && !thread.ai_on), handoff: !!(thread && thread.status === 'handoff'), online: !live(channel) };
  });

  app.post('/w/:key/lead', (req, res) => {
    const { channel, widget } = load(req, res);
    const b = body(req);
    const visitor = String(b.visitor_id || '');
    if (!VISITOR.test(visitor)) throw new HttpError(400, 'Bad visitor id');
    if (live(channel)) throw new HttpError(503, live(channel), { offline: true });
    hit('wlead:' + channel.id + ':' + visitor, 10, 3600e3);
    hit('wleadip:' + req.ip, 60, 3600e3);
    const lead = widget.lead || web.defaults().lead;
    const name = String(b.name || '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, 80);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
    const phone = String(b.phone || '').trim().slice(0, 30);
    const silent = !!b.identify;
    if (!silent) {
      if (lead.name && lead.name.req && !name) throw new HttpError(400, 'Please add your name.', { field: 'name' });
      if (lead.email && lead.email.req && !email) throw new HttpError(400, 'Please add your email.', { field: 'email' });
      if (lead.phone && lead.phone.req && !phone) throw new HttpError(400, 'Please add your phone number.', { field: 'phone' });
    }
    if (email && !EMAIL.test(email)) throw new HttpError(400, 'That email doesn’t look right.', { field: 'email' });
    if (phone && !PHONE.test(phone)) throw new HttpError(400, 'That phone number doesn’t look right.', { field: 'phone' });
    if (!name && !email && !phone) throw new HttpError(400, 'Add at least one way to reach you.');
    const contact = engine.upsertContact(channel.workspace_id, channel.id, { id: visitor, name: '' });
    if (!contact.name) db.update('contacts', contact.id, { name: visitorName(visitor) });
    const patch = {};
    if (name) patch.name = name;
    if (email) patch.email = email;
    if (phone) patch.phone = phone;
    if (contact.heat === 'cold') patch.heat = 'warm';
    if (contact.stage === 'new') patch.stage = 'qualified';
    db.update('contacts', contact.id, patch);
    const fresh = db.one('SELECT * FROM contacts WHERE id = ?', contact.id);
    const thread = engine.upsertThread(channel.workspace_id, channel, fresh, visitor);
    const isNew = !contact.email && !contact.phone;
    engine.addMessage(thread, 'note', 'system', 'Lead details: ' + [fresh.name, fresh.email, fresh.phone].filter(Boolean).join(' · '));
    if (isNew) ws.event(channel.workspace_id, 'lead', 'New website lead: ' + (fresh.name || fresh.email || 'a visitor'), { contact_id: fresh.id, thread_id: thread.id });
    return { ok: true };
  });

  // Chat link: a full-page chat at /c/<slug>, made from the website widget. No website or code needed.
  app.get('/c/:slug', (req, res) => {
    const ch = web.linkBySlug(String(req.params.slug || '').toLowerCase());
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    if (!ch) {
      return res.send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Chat not found</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F6F5F2;color:#121110;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#5E5A50;margin:0}</style></head><body><div><h1>This chat link isn’t working</h1><p>Check the link, or ask the shop for a new one.</p></div></body></html>', 404, 'text/html; charset=utf-8', { 'X-Robots-Tag': 'noindex' });
    }
    const w = ws.get(ch.workspace_id);
    const name = (w && w.name) || 'Chat';
    res.send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="#121110">' +
      '<title>Chat with ' + esc(name) + '</title><meta property="og:title" content="Chat with ' + esc(name) + '"><meta name="description" content="Ask ' + esc(name) + ' anything. We reply in seconds.">' +
      '<style>html,body{margin:0;height:100%;background:#EDEBE5}body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '#rvPage{position:relative;height:100vh;height:100dvh;max-width:520px;margin:0 auto;background:#fff;overflow:hidden}' +
      '@media (min-width:640px){#rvPage{height:min(760px,calc(100dvh - 48px));margin:24px auto;border-radius:24px;box-shadow:0 30px 70px -30px rgba(18,17,16,.45)}}' +
      'noscript p{padding:24px;text-align:center}</style></head><body><main id="rvPage" aria-label="Chat with ' + esc(name) + '"></main>' +
      '<noscript><p>Please turn on JavaScript to chat with ' + esc(name) + '.</p></noscript>' +
      '<script src="/widget.js" data-key="' + esc(ch.external_id) + '" data-page="rvPage" async></script></body></html>', 200, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' });
  });

  // Uploaded logo / avatar / launcher image. Same-origin <img> use is fine, so no origin lock here.
  app.get('/w/:key/asset/:kind', (req, res) => {
    if (!KEY.test(req.params.key) || !web.ASSET_KINDS.includes(req.params.kind)) throw new HttpError(404, 'Not found');
    const a = db.one('SELECT a.mime, a.data, a.updated_at FROM widget_assets a JOIN channels c ON c.id = a.channel_id WHERE c.type = \'website\' AND c.external_id = ? AND c.status != \'deleted\' AND a.kind = ?', req.params.key, req.params.kind);
    if (!a) throw new HttpError(404, 'Not found');
    res.send(Buffer.from(a.data), 200, a.mime, { 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'cross-origin' });
  });
};

module.exports.visitorName = visitorName;
module.exports._buckets = buckets;
