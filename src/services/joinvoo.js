'use strict';
/*
 * Joinvoo bridge: "Who answers chats in this bot?" → Replyvoo.
 *
 * Joinvoo stays the only app connected to the Telegram bot (it holds the webhook and the token). When a Joinvoo customer
 * switches a bot to Replyvoo, Joinvoo forwards each private-chat update for that bot to POST /hooks/joinvoo/update straight
 * away, with the ad the person came from, their deposits and any earlier Team inbox messages. Replyvoo's Closer (or a
 * teammate who took over) answers through Joinvoo's relay (POST <JOINVOO>/bridge/replyvoo/send): Replyvoo never sees the
 * bot token and never calls Telegram for these bots, so nothing can set a second webhook.
 *
 * Security. Every call in both directions is signed: HMAC-SHA256 over direction, time, a one-time nonce, method, path and
 * the body's hash. The link call (/hooks/joinvoo/link) is signed with the shared bridge secret (JOINVOO_BRIDGE_SECRET here,
 * REPLYVOO_BRIDGE_SECRET in Joinvoo, never in code); it gives this Voo ID its own link secret, and every other call is
 * signed with that per-link secret. Calls older than 5 minutes, or with a nonce already seen, are refused. A link only
 * reaches the channels it created itself, so one account can never receive or send for another account's bot.
 *
 * Billing. Nothing changes: chats that come through Joinvoo are normal Replyvoo conversations on the workspace's own plan
 * and credits (the 30 free chats a month on Spark apply). Paying in Joinvoo gives no Replyvoo plan.
 */
const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const ws = require('./workspace');
const settings = require('./settings');
const { encrypt, decrypt, safeEqual, sha256 } = require('../lib/security');
const { HttpError } = require('../lib/http');
const { orderRef } = require('../lib/security');

// Two kinds of Telegram chats come through Joinvoo: a bot ('joinvoo_bot', external_id = bot id) and a manager's own Telegram account
// connected to Joinvoo through Telegram Business ('joinvoo_account', external_id = the manager's Telegram user id).
const JV_TYPES = ['joinvoo_bot', 'joinvoo_account'];
const isJvType = t => JV_TYPES.includes(t);
const kindOf = b => (b && (b.kind === 'account' || b.account_id) ? 'account' : 'bot');
const typeOf = kind => (kind === 'account' ? 'joinvoo_account' : 'joinvoo_bot');
/** What the chat list and chat view say: "via Joinvoo · @shop_bot" or "via Joinvoo · Sara's Telegram". */
function viaLabel(ch) {
  if (!ch || !isJvType(ch.type)) return '';
  if (ch.type === 'joinvoo_account') return 'via Joinvoo · ' + (String(ch.name || 'Manager').replace(/\s*\(.*\)\s*$/, '') || 'Manager') + '’s Telegram';
  return 'via Joinvoo · ' + (ch.username ? '@' + ch.username : ch.name || 'Telegram bot');
}

const MAX_SKEW_MS = 5 * 60e3;
const NONCE_KEEP_MS = 15 * 60e3;
const env = (k, d = '') => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);

// JOINVOO_URL is the address Replyvoo's server calls (it can be a private address); JOINVOO_PUBLIC_URL is only for links.
function cfg() {
  const url = env('JOINVOO_URL').replace(/\/+$/, '');
  return { url, publicUrl: (env('JOINVOO_PUBLIC_URL') || url || settings.get('joinvoo').url || 'https://joinvoo.com').replace(/\/+$/, ''), secret: env('JOINVOO_BRIDGE_SECRET'), timeoutMs: Number(env('JOINVOO_TIMEOUT_MS', '10000')) };
}
const enabled = () => { const c = cfg(); return !!(c.url && c.secret && c.secret.length >= 24); };

// ---------- signing ----------
// Direction is part of what is signed, so a call Joinvoo made can never be replayed back at Joinvoo (and the other way round).
function signature(key, dir, ts, nonce, method, path, raw) {
  return crypto.createHmac('sha256', key).update([dir, ts, nonce, method.toUpperCase(), path, sha256(raw || '')].join('\n')).digest('hex');
}
function signHeaders(key, linkId, method, path, raw) {
  const ts = String(Date.now()), nonce = crypto.randomBytes(16).toString('hex');
  return { 'x-voo-link': linkId, 'x-voo-ts': ts, 'x-voo-nonce': nonce, 'x-voo-sig': signature(key, 'rv>jv', ts, nonce, method, path, raw) };
}
function seenNonce(nonce) {
  const t = Date.now();
  db.run('DELETE FROM jv_nonces WHERE seen_at < ?', t - NONCE_KEEP_MS);
  try { db.run('INSERT INTO jv_nonces (nonce, seen_at) VALUES (?, ?)', nonce, t); return false; } catch { return true; }
}
/** Checks a call from Joinvoo. Returns the link row (or { app: true } for the link call). Throws 401 on anything wrong. */
function verify(req, { app = false } = {}) {
  if (!enabled()) throw new HttpError(404, 'The Joinvoo bridge is not set up on this server.');
  const h = req.headers, linkId = String(h['x-voo-link'] || ''), ts = String(h['x-voo-ts'] || ''), nonce = String(h['x-voo-nonce'] || ''), sig = String(h['x-voo-sig'] || '');
  if (!/^\d{12,14}$/.test(ts) || !/^[a-f0-9]{32,64}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(sig)) throw new HttpError(401, 'Unsigned request');
  if (Math.abs(Date.now() - Number(ts)) > MAX_SKEW_MS) throw new HttpError(401, 'Request expired');
  let key; let link = null;
  if (app) { if (linkId !== 'app') throw new HttpError(401, 'Bad signature'); key = cfg().secret; }
  else {
    link = /^jvl_[A-Za-z0-9_-]{8,64}$/.test(linkId) ? db.one('SELECT * FROM jv_links WHERE link_id = ?', linkId) : null;
    if (!link) throw new HttpError(401, 'Unknown link');
    try { key = decrypt(link.secret_enc); } catch { key = ''; }
    if (!key) throw new HttpError(401, 'Unknown link');
  }
  const path = req.url.split('?')[0];
  if (!safeEqual(sig, signature(key, 'jv>rv', ts, nonce, req.method, path, req.rawBody || Buffer.from('')))) throw new HttpError(401, 'Bad signature');
  if (seenNonce(nonce)) throw new HttpError(401, 'Replayed request');
  return app ? { app: true } : link;
}

// ---------- who is behind a link ----------
const userOf = link => (link ? db.one('SELECT * FROM users WHERE voo_id = ? AND suspended = 0', link.voo_id) : null);
function workspaceOf(user) {
  if (!user) return null;
  const w = db.one("SELECT id FROM workspaces WHERE owner_id = ? AND status = 'active' ORDER BY id LIMIT 1", user.id);
  return w ? ws.get(w.id) : null;
}
const openUrl = (signup) => config.appUrl + '/auth/voosquare?return_to=' + encodeURIComponent('/app/inbox') + (signup ? '&signup=1' : '');

/** What Joinvoo shows next to the bot: "Plan active", "Free chats: N left", "Out of credits". Real numbers only. */
function status(link) {
  const u = userOf(link);
  if (!u) return { account: false, open_url: openUrl(true), free_chats: freeChats() };
  const w = workspaceOf(u);
  if (!w) return { account: true, workspace: false, open_url: openUrl(false) };
  const use = ws.usage(w);
  const paid = !!(use.plan && use.plan.price_month > 0);
  const left = use.conversations.left, credits = w.credits || 0;
  const state = left > 0 ? (paid ? 'plan' : 'free') : credits > 0 ? 'credits' : 'out';
  return { account: true, workspace: true, state, plan: { id: use.plan ? use.plan.id : '', name: use.plan ? use.plan.name : '', paid }, chats_left: left, chats_included: use.conversations.included, credits, out_of_credits: state === 'out', open_url: openUrl(false), plans_url: config.appUrl + '/app/wallet' };
}
function freeChats() { const p = ws.plan(settings.get('billing').free_plan_id); return p ? p.conversations : 30; }

/** Would a reply on this thread be paid for? (Same rules as ws.chargeForReply, without charging.) */
function canAnswer(w, thread) {
  w = ws.ensurePeriod(w);
  const b = settings.get('billing');
  if (thread && thread.window_start && Date.now() - new Date(thread.window_start).getTime() <= (b.conversation_window_hours || 24) * 3600e3 && thread.unit_replies < (b.conversation_reply_limit || 10)) return true;
  return w.conv_used < ws.limits(w).conversations || w.credits >= 1;
}

// ---------- link + bots (called by Joinvoo) ----------
function saveLink(b) {
  const linkId = String(b.link_id || ''), secret = String(b.secret || ''), vooId = String(b.voo_id || '').slice(0, 200);
  if (!/^jvl_[A-Za-z0-9_-]{8,64}$/.test(linkId) || secret.length < 32 || secret.length > 200 || !vooId) throw new HttpError(400, 'link_id, secret and voo_id are required.');
  const t = db.now();
  const old = db.one('SELECT * FROM jv_links WHERE voo_id = ?', vooId);
  const taken = db.one('SELECT voo_id FROM jv_links WHERE link_id = ?', linkId);
  if (taken && taken.voo_id !== vooId) throw new HttpError(409, 'That link id belongs to another account.');
  if (old) {
    db.run('UPDATE jv_links SET link_id = ?, secret_enc = ?, jv_account = ?, updated_at = ? WHERE id = ?', linkId, encrypt(secret), String(b.account || '').slice(0, 60), t, old.id);
    // Same Voo ID, new secret (Joinvoo made the link again): its bots stay with it.
    if (old.link_id !== linkId) db.run("UPDATE channels SET data = json_set(data, '$.link_id', ?) WHERE type IN ('joinvoo_bot', 'joinvoo_account') AND json_extract(data, '$.link_id') = ?", linkId, old.link_id);
  } else db.insert('jv_links', { link_id: linkId, voo_id: vooId, secret_enc: encrypt(secret), jv_account: String(b.account || '').slice(0, 60), created_at: t, updated_at: t });
  return db.one('SELECT * FROM jv_links WHERE link_id = ?', linkId);
}
const channelFor = (link, id, kind = 'bot') => db.all("SELECT * FROM channels WHERE type = ? AND external_id = ? AND status != 'deleted'", typeOf(kind), String(id))
  .find(c => db.json(c.data, {}).link_id === link.link_id) || null;
/** The channel an update or call from Joinvoo is about: { bot_id } or { account_id }. */
const channelOf = (link, b) => (b && b.account_id ? channelFor(link, String(b.account_id).replace(/\D/g, ''), 'account') : channelFor(link, String((b && b.bot_id) || '').replace(/\D/g, ''), 'bot'));

/** Switch one bot on (Replyvoo answers) or off (back to Joinvoo's Team inbox). Chats and their history are kept. */
function switchBot(link, b) {
  const kind = kindOf(b), type = typeOf(kind);
  const botId = String((kind === 'account' ? b.account_id : b.bot_id) || '').replace(/\D/g, '').slice(0, 20);
  if (!botId) throw new HttpError(400, kind === 'account' ? 'account_id is required.' : 'bot_id is required.');
  const on = b.on !== false;
  let ch = channelFor(link, botId, kind);
  if (!on) { if (ch) { db.update('channels', ch.id, { status: 'paused' }); ws.event(ch.workspace_id, 'channel', '@' + (ch.username || ch.name) + ' went back to Joinvoo’s Team inbox', { channel_id: ch.id }); } return { ok: true, on: false, status: status(link) }; }
  const u = userOf(link);
  if (!u) throw new HttpError(404, 'This Voo account has no Replyvoo account yet.', { reason: 'no_account', status: status(link) });
  const w = workspaceOf(u);
  if (!w) throw new HttpError(404, 'Open Replyvoo once to finish setting up your account.', { reason: 'no_workspace', status: status(link) });
  // Never two apps on one bot: a bot connected to Replyvoo with its own token, or answered for another account, is refused.
  if (kind === 'bot' && db.one("SELECT 1 FROM channels WHERE type = 'telegram_bot' AND external_id = ? AND status = 'active'", botId)) throw new HttpError(409, 'This bot is also connected to Replyvoo directly. Remove it from Replyvoo → Channels first, so only Joinvoo holds it.', { reason: 'direct_bot' });
  const other = db.all("SELECT * FROM channels WHERE type = ? AND external_id = ? AND status = 'active'", type, botId).find(c => db.json(c.data, {}).link_id !== link.link_id);
  if (other) throw new HttpError(409, 'Another Replyvoo account answers this bot.', { reason: 'taken' });
  const name = String(b.name || '').slice(0, 60), username = String(b.username || '').replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64);
  if (!ch || ch.status !== 'active') {
    // Same limit as connecting a bot directly: one Telegram bot or account per Closer on the plan.
    const used = db.one("SELECT COUNT(*) n FROM channels WHERE workspace_id = ? AND type IN ('telegram_bot', 'telegram_business', 'joinvoo_bot', 'joinvoo_account') AND status = 'active'", ch ? ch.workspace_id : w.id).n;
    const max = Math.max(1, ws.limits(ch ? ws.get(ch.workspace_id) : w).closers);
    if (used >= max) throw new HttpError(402, 'Your Replyvoo plan answers ' + max + ' Telegram bot' + (max === 1 ? '' : 's') + '. Pick a bigger plan in Replyvoo to add this one.', { reason: 'channel_limit', status: status(link) });
  }
  const closerId = (db.one('SELECT id FROM closers WHERE workspace_id = ? AND active = 1 ORDER BY id LIMIT 1', ch ? ch.workspace_id : w.id) || {}).id || null;
  if (ch) db.update('channels', ch.id, { status: 'active', name: name || ch.name, username: username || ch.username, closer_id: ch.closer_id || closerId });
  else {
    const id = db.insert('channels', { workspace_id: w.id, type, name: name || username || (kind === 'account' ? 'Telegram account' : 'Telegram bot'), username, external_id: botId, token_enc: '', webhook_secret: '', closer_id: closerId, data: JSON.stringify({ link_id: link.link_id, via: 'joinvoo', kind }), created_at: db.now() });
    ch = db.one('SELECT * FROM channels WHERE id = ?', id);
  }
  ws.event(ch.workspace_id, 'channel', (kind === 'account' ? (ch.name || 'A manager') + '’s Telegram' : '@' + (username || ch.username || ch.name)) + ' is answered by Replyvoo (via Joinvoo)', { channel_id: ch.id });
  return { ok: true, on: true, channel_id: ch.id, closer: !!(ch.closer_id || closerId), status: status(link) };
}

// ---------- calls to Joinvoo ----------
async function call(link, path, body, { raw = false } = {}) {
  const c = cfg();
  if (!enabled()) throw Object.assign(new Error('The Joinvoo bridge is not set up.'), { code: 'off' });
  const key = decrypt(link.secret_enc);
  const payload = JSON.stringify(body || {});
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), c.timeoutMs);
  try {
    const res = await fetch(c.url + path, { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', ...signHeaders(key, link.link_id, 'POST', path, payload) }, body: payload });
    if (raw) { if (!res.ok) throw Object.assign(new Error('Joinvoo answered ' + res.status), { code: res.status }); return { type: res.headers.get('content-type') || 'application/octet-stream', buffer: Buffer.from(await res.arrayBuffer()) }; }
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.ok === false) throw Object.assign(new Error(j.error || 'Joinvoo answered ' + res.status), { code: j.reason || res.status });
    return j;
  } finally { clearTimeout(t); }
}
const linkOfChannel = ch => { const id = db.json(ch && ch.data, {}).link_id; return id ? db.one('SELECT * FROM jv_links WHERE link_id = ?', id) : null; };

/** Send one message to the person through Joinvoo. msg: { text, kind, file: { data (base64), mime, name }, buttons, by, by_name }. */
const tgtOf = ch => (ch.type === 'joinvoo_account' ? { account_id: ch.external_id } : { bot_id: ch.external_id });
async function relay(channel, chatId, msg) {
  const link = linkOfChannel(channel);
  if (!link) throw Object.assign(new Error('This bot is not linked to Joinvoo any more.'), { code: 'not_linked' });
  return call(link, '/bridge/replyvoo/send', { ...tgtOf(channel), chat_id: String(chatId), ...msg });
}
function typing(channel, chatId) { relay(channel, chatId, { kind: 'typing' }).catch(() => {}); }
/** A Telegram file the person sent (photo, voice note, document), fetched through Joinvoo. */
async function file(channel, chatId, fileId, maxBytes = 10 * 1024 * 1024) {
  const link = linkOfChannel(channel);
  if (!link) throw new Error('not linked');
  const f = await call(link, '/bridge/replyvoo/file', { ...tgtOf(channel), chat_id: String(chatId), file_id: String(fileId) }, { raw: true });
  if (f.buffer.length > maxBytes) throw new Error('File too large');
  return f;
}
/** Replyvoo could not answer after all (AI error, out of credits mid-chat, no Closer): Joinvoo's Team inbox takes the chat. */
function fallback(channel, chatId, reason) {
  const link = linkOfChannel(channel); if (!link) return Promise.resolve();
  return call(link, '/bridge/replyvoo/fallback', { ...tgtOf(channel), chat_id: String(chatId), reason, status: status(link) }).catch(e => console.warn('[joinvoo] fallback', e.message));
}

// ---------- what came from Joinvoo ----------
const KIND = { photo: 'image', voice: 'voice', audio: 'voice', video: 'other', video_note: 'other', document: 'other', sticker: 'other', button: 'text', text: 'text', start: 'text' };
function describe(m) {
  const cap = String(m.text || '').slice(0, 4000);
  if (m.kind === 'button') return 'Pressed “' + String(m.label || m.data || 'a button').slice(0, 120) + '”';
  if (cap) return cap;
  if (m.kind === 'video' || m.kind === 'video_note') return '[video]';
  if (m.kind === 'document') return '[file: ' + String(m.name || 'file').slice(0, 80) + ']';
  if (m.kind === 'sticker') return String(m.emoji || '') || '[sticker]';
  if (m.kind === 'photo') return '[image]';
  if (m.kind === 'voice' || m.kind === 'audio') return '';
  return '';
}
function mediaMeta(m) {
  if (!m || !m.kind || ['text', 'button', 'start'].includes(m.kind)) return null;
  const o = { kind: m.kind };
  if (m.file_id) o.jv_file = String(m.file_id).slice(0, 300);
  if (m.name) o.name = String(m.name).slice(0, 120);
  if (m.mime) o.mime = String(m.mime).slice(0, 80);
  if (m.duration) o.sec = Math.max(0, Math.round(+m.duration || 0));
  if (m.emoji) o.emoji = String(m.emoji).slice(0, 8);
  return o;
}
function cleanContext(c) {
  if (!c || typeof c !== 'object') return null;
  const s = (v, n = 80) => (v == null || v === '' ? null : String(v).slice(0, n));
  return { tracked: !!c.tracked, platform: s(c.platform, 20), campaign: s(c.campaign), adset: s(c.adset), ad: s(c.ad), country: s(c.country, 4), joined_at: Number(c.joined_at) || null, signed_up_at: Number(c.signed_up_at) || null,
    deposits: Math.max(0, Math.round(+c.deposits || 0)), deposits_usd: Math.max(0, Math.round(+c.deposits_usd_cents || 0)) / 100, first_deposit_at: Number(c.ftd_at) || null };
}
/** Earlier messages Joinvoo had (Team inbox history): stored once each, in time order, before the new message. */
function addHistory(thread, list) {
  let n = 0;
  for (const h of (Array.isArray(list) ? list : []).slice(-200)) {
    const ext = 'jv:' + String(h.jv_id || '').replace(/[^\w:-]/g, '').slice(0, 40);
    if (ext === 'jv:' || db.one('SELECT 1 FROM messages WHERE thread_id = ? AND ext_id = ?', thread.id, ext)) continue;
    const dir = h.dir === 'in' ? 'in' : h.dir === 'note' ? 'note' : 'out';
    const media = mediaMeta(h);
    const at = Number(h.at) > 0 ? new Date(Number(h.at)).toISOString() : db.now();
    db.insert('messages', { workspace_id: thread.workspace_id, thread_id: thread.id, dir, author: dir === 'in' ? 'customer' : dir === 'note' ? 'system' : 'human', kind: KIND[h.kind] || 'text',
      text: (dir === 'note' ? 'Joinvoo: ' : '') + (describe(h) || (h.kind === 'voice' ? '[voice note]' : '')), meta: JSON.stringify({ via: 'joinvoo', history: true, user_name: dir === 'out' ? String(h.by_name || 'Joinvoo Team inbox').slice(0, 80) : undefined, media: media || undefined }), ext_id: ext, created_at: at });
    n++;
  }
  return n;
}


// ---------- Connected apps (Replyvoo → Settings → Connected apps → Joinvoo) ----------
/** The bots and manager accounts this workspace answers through Joinvoo. */
function connections(wsId) {
  return db.all("SELECT id, type, name, username, external_id, status, data, created_at FROM channels WHERE workspace_id = ? AND type IN ('joinvoo_bot', 'joinvoo_account') AND status != 'deleted' ORDER BY id", wsId)
    .map(c => ({ id: c.id, kind: c.type === 'joinvoo_account' ? 'account' : 'bot', name: c.name, username: c.username, via: viaLabel(c), on: c.status === 'active', since: c.created_at,
      chats: db.one('SELECT COUNT(*) n FROM threads WHERE channel_id = ?', c.id).n }));
}
/** Stop answering one bot/account (or all of them) through Joinvoo. Joinvoo is told, so its Team inbox answers again. Chats stay. */
async function disconnect(wsId, channelId) {
  const list = db.all("SELECT * FROM channels WHERE workspace_id = ? AND type IN ('joinvoo_bot', 'joinvoo_account') AND status != 'deleted'" + (channelId ? ' AND id = ?' : ''), ...(channelId ? [wsId, channelId] : [wsId]));
  if (channelId && !list.length) throw new HttpError(404, 'Not found');
  const told = new Set();
  for (const ch of list) {
    db.update('channels', ch.id, { status: 'deleted' });
    ws.event(wsId, 'channel', viaLabel(ch).replace(/^via /, '') + ' was disconnected. Joinvoo’s Team inbox answers it again.', { channel_id: ch.id });
    const link = linkOfChannel(ch); if (!link) continue;
    try { await call(link, '/bridge/replyvoo/disconnect', channelId ? tgtOf(ch) : { all: true }); told.add(link.link_id); } catch (e) { console.warn('[joinvoo] disconnect', e.message); }
  }
  return { ok: true, disconnected: list.length, joinvoo_told: told.size > 0 };
}

// ---------- Paying for Replyvoo with Joinvoo credits ----------
// Joinvoo shows Replyvoo's real plans and packs (from here, never hardcoded), takes the credits itself (idempotent), then calls
// /hooks/joinvoo/purchase. The price is checked against Replyvoo's own price, one order per Joinvoo purchase id, and the normal
// fulfil runs (plan or credits, receipt, VooSquare purchase event once, as a Replyvoo purchase).
function catalog(link) {
  const pay = require('./payments');
  const plans = db.all('SELECT * FROM plans WHERE active = 1 ORDER BY sort, price_month').filter(p => !p.contact_sales && (p.price_month > 0 || p.price_year > 0)).map(p => {
    const q = iv => { try { return pay.quote('plan', p.id, iv); } catch { return null; } };
    const m = q('month'), y = q('year');
    return { id: p.id, name: p.name, conversations: p.conversations, closers: p.closers, month_usd: m ? m.amount : null, year_usd: y ? y.amount : null, offer: (m && m.offer) || '' };
  });
  const packs = db.all('SELECT * FROM packs WHERE active = 1 ORDER BY price').map(pk => ({ id: String(pk.id), credits: pk.credits, bonus: pk.bonus || 0, usd: pk.price }));
  return { ok: true, plans, packs, status: status(link) };
}
const round2 = n => Math.round(n * 100) / 100;
function purchase(link, b) {
  const pid = String(b.purchase_id || '');
  if (!/^jvp_[A-Za-z0-9_-]{1,60}$/.test(pid)) throw new HttpError(400, 'purchase_id is required.');
  const old = db.one("SELECT * FROM orders WHERE provider = 'joinvoo_credits' AND provider_ref = ?", pid);
  if (old) return { ok: old.status === 'paid', duplicate: true, receipt: old.ref, status: old.status };
  const u = userOf(link); if (!u) throw new HttpError(404, 'This Voo account has no Replyvoo account yet.', { reason: 'no_account' });
  const w = workspaceOf(u); if (!w) throw new HttpError(404, 'Open Replyvoo once to finish setting up your account.', { reason: 'no_workspace' });
  const kind = b.kind === 'pack' ? 'pack' : b.kind === 'plan' ? 'plan' : null; if (!kind) throw new HttpError(400, 'Pick a plan or a credit pack.');
  const q = require('./payments').quote(kind, String(b.item_id || ''), b.interval === 'year' ? 'year' : 'month');
  if (Math.round(q.amount * 100) !== Math.round(Number(b.amount_usd) * 100)) throw new HttpError(409, 'The price changed. Please look at it again.', { reason: 'price_changed', amount_usd: q.amount });
  const ref = orderRef();
  try {
    db.insert('orders', { ref, workspace_id: w.id, user_id: u.id, kind: q.kind, item_id: q.item_id, item_name: q.item_name, interval: q.interval, amount_usd: q.amount, discount_usd: 0, coupon_id: null, currency: 'USD', amount_local: q.amount,
      provider: 'joinvoo_credits', provider_ref: pid, status: 'pending', meta: JSON.stringify({ via: 'joinvoo_credits', method: 'Joinvoo credits', jv_link: link.link_id, credits: Math.round(q.amount * 100) }), created_at: db.now() });
  } catch (e) { const again = db.one("SELECT * FROM orders WHERE provider = 'joinvoo_credits' AND provider_ref = ?", pid); if (again) return { ok: again.status === 'paid', duplicate: true, receipt: again.ref, status: again.status }; throw e; }
  require('./payments').fulfill(ref, { via: 'joinvoo_credits', provider_ref: pid });
  return { ok: true, receipt: ref, status: 'paid', item: q.item_name, account: status(link) };
}
function purchaseStatus(link, b) {
  const o = db.one("SELECT ref, status, meta FROM orders WHERE provider = 'joinvoo_credits' AND provider_ref = ?", String(b.purchase_id || ''));
  if (!o || db.json(o.meta, {}).jv_link !== link.link_id) return { ok: true, found: false };
  return { ok: true, found: true, status: o.status, receipt: o.ref };
}
/** A refund of an order paid with Joinvoo credits goes back as Joinvoo credits (called after payments.reverse). Retried until Joinvoo has it. */
async function refundToJoinvoo(order, usd) {
  if (!order || order.provider !== 'joinvoo_credits') return null;
  const meta = db.json(order.meta, {}); const link = meta.jv_link ? db.one('SELECT * FROM jv_links WHERE link_id = ?', meta.jv_link) : null;
  const mark = st => { const o = db.one('SELECT meta FROM orders WHERE id = ?', order.id); db.update('orders', order.id, { meta: JSON.stringify({ ...db.json(o.meta, {}), jv_refund: st }) }); };
  if (!link) { mark({ state: 'failed', why: 'not linked', usd }); return { ok: false }; }
  try { const r = await call(link, '/bridge/replyvoo/refund', { purchase_id: order.provider_ref, receipt: order.ref, amount_usd: round2(usd) }); mark({ state: 'done', usd, credits: r.credits, at: db.now() }); return { ok: true, credits: r.credits }; }
  catch (e) { mark({ state: 'pending', usd, error: String(e.message).slice(0, 120), at: db.now() }); return { ok: false, pending: true }; }
}
async function retryRefunds() {
  for (const o of db.all("SELECT * FROM orders WHERE provider = 'joinvoo_credits' AND status IN ('refunded', 'charged_back') AND json_extract(meta, '$.jv_refund.state') = 'pending' LIMIT 50")) {
    await refundToJoinvoo(o, db.json(o.meta, {}).jv_refund.usd);
  }
}
/** Monthly settlement (admin): Joinvoo credits moved into Replyvoo, and refunded back. */
function settlement() {
  return db.all(`SELECT substr(COALESCE(paid_at, created_at), 1, 7) month, COUNT(*) orders, ROUND(SUM(amount_usd), 2) usd,
      ROUND(SUM(CASE WHEN status IN ('refunded', 'charged_back') THEN COALESCE(json_extract(meta, '$.refund.usd'), json_extract(meta, '$.chargeback.usd'), amount_usd) ELSE 0 END), 2) refunded_usd
    FROM orders WHERE provider = 'joinvoo_credits' AND status IN ('paid', 'refunded', 'charged_back') GROUP BY month ORDER BY month DESC`).map(r => ({ ...r, net_usd: round2(r.usd - r.refunded_usd), credits: Math.round(r.usd * 100), net_credits: Math.round((r.usd - r.refunded_usd) * 100) }));
}

// ---------- Moving from Joinvoo AI: its notes become this workspace's Closer ----------
const IMPORT_FIELDS = [['about', 'About the business'], ['offer', 'Offer and bonus'], ['steps', 'Sign-up and deposit steps'], ['links', 'Links you may send'], ['tone', 'Tone'], ['never', 'Never say'], ['handoff', 'When to hand over']];
function importNotes(link, b) {
  const u = userOf(link); if (!u) throw new HttpError(404, 'This Voo account has no Replyvoo account yet.', { reason: 'no_account' });
  const w = workspaceOf(u); if (!w) throw new HttpError(404, 'Open Replyvoo once to finish setting up your account.', { reason: 'no_workspace' });
  const n = b.notes && typeof b.notes === 'object' ? b.notes : {};
  const parts = IMPORT_FIELDS.map(([k, l]) => (String(n[k] || '').trim() ? l + ':\n' + String(n[k]).trim().slice(0, 2000) : '')).filter(Boolean);
  if (!parts.length) throw new HttpError(400, 'There is nothing to import.');
  const block = '## Imported from Joinvoo AI\n' + parts.join('\n\n');
  const mark = 'jvimport:' + sha256(block).slice(0, 16);
  const t = db.now(); let c = db.one('SELECT * FROM closers WHERE workspace_id = ? ORDER BY active DESC, id LIMIT 1', w.id), created = false;
  if (c && String(c.knowledge || '').includes(mark)) return { ok: true, closer_id: c.id, already: true };
  const tone = String(n.tone || '').trim(), never = String(n.never || '').trim(), hand = String(n.handoff || '').trim();
  const rules = [tone ? 'Tone: ' + tone : '', never ? 'Never say: ' + never : '', hand ? 'Hand the chat to the team when: ' + hand : ''].filter(Boolean).join('\n');
  if (c) db.update('closers', c.id, { knowledge: (String(c.knowledge || '') + '\n\n' + block + '\n<!-- ' + mark + ' -->').trim().slice(0, 60000), instructions: (String(c.instructions || '') + (rules ? '\n' + rules : '')).trim().slice(0, 8000), updated_at: t });
  else {
    c = { id: db.insert('closers', { workspace_id: w.id, name: String(b.name || 'Ava').slice(0, 40) || 'Ava', template: b.closer ? 'closer' : 'sales', persona: JSON.stringify({ human: true }), skills: JSON.stringify({ vision: true, handoff: true, paylink: true }), instructions: rules, knowledge: block + '\n<!-- ' + mark + ' -->', pay_link: '', active: 1, created_at: t, updated_at: t }) };
    created = true;
  }
  // Bots and accounts that already come through Joinvoo get this Closer if they have none yet.
  db.run("UPDATE channels SET closer_id = ? WHERE workspace_id = ? AND type IN ('joinvoo_bot', 'joinvoo_account') AND closer_id IS NULL", c.id, w.id);
  ws.event(w.id, 'closer', 'Your Joinvoo AI notes were imported into your Closer.', { closer_id: c.id });
  return { ok: true, closer_id: c.id, created };
}

module.exports = { cfg, enabled, verify, signature, saveLink, switchBot, status, canAnswer, channelFor, channelOf, userOf, workspaceOf, relay, typing, file, fallback, linkOfChannel, describe, mediaMeta, cleanContext, addHistory, KIND, openUrl,
  JV_TYPES, isJvType, viaLabel, connections, disconnect, catalog, purchase, purchaseStatus, refundToJoinvoo, retryRefunds, settlement, importNotes };
