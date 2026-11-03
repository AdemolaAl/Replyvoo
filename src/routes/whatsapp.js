'use strict';
// WhatsApp (Meta Cloud API): the webhook Meta calls, and the dashboard endpoints to connect numbers, manage templates
// and send templates or files from Pulse Inbox. The engine (src/services/engine.js) does the AI replies.
const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const auth = require('../lib/auth');
const wa = require('../services/whatsapp');
const engine = require('../services/engine');
const settings = require('../services/settings');
const ws = require('../services/workspace');
const { encrypt, decrypt, safeEqual } = require('../lib/security');
const { HttpError, rateLimit } = require('../lib/http');

const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const first = n => String(n || '').split(' ')[0] || 'there';
const tokenOf = ch => { try { return decrypt(ch.token_enc); } catch { return ''; } };

// X-Hub-Signature-256: "sha256=" + hex HMAC-SHA256 of the exact raw body with the Meta App Secret.
function signatureOk(raw, header, secret = wa.resolve().appSecret) {
  const h = String(header || '');
  if (!secret || !h.startsWith('sha256=')) return false;
  const want = crypto.createHmac('sha256', secret).update(raw || Buffer.from('')).digest('hex');
  return safeEqual(h.slice(7).toLowerCase(), want);
}

const STOP = /^\s*(stop|stop all|unsubscribe|opt[ -]?out|stop promotions|stop messages)\s*[.!]*\s*$/i;
const START = /^\s*(start|unstop|subscribe|resume promotions)\s*[.!]*\s*$/i;

// Friendly words for Meta's delivery error codes (shown under the message in Pulse Inbox).
const ERRORS = {
  131047: 'More than 24 hours since the customer’s last message. Send an approved template instead.',
  131026: 'This number can’t get the message right now (it may not use WhatsApp or has an old app).',
  131050: 'The customer stopped marketing messages from your business.',
  131049: 'Meta held this marketing message back to protect the customer’s experience. Try again later.',
  131056: 'Too many messages to this person too quickly. Wait a little and try again.',
  131042: 'Meta could not charge your WhatsApp account. Add or fix the payment method in WhatsApp Manager.',
  132000: 'The template variables did not match the template.',
  132001: 'The template does not exist or is not approved in this language.',
  132015: 'The template is paused because of low quality.',
  131031: 'Your WhatsApp Business Account is restricted. Check WhatsApp Manager.',
  368: 'Your WhatsApp Business Account is restricted. Check WhatsApp Manager.',
  130429: 'Meta’s sending limit was reached. The rest will be retried later.'
};
const friendly = err => (err && (ERRORS[err.code] || [err.title, err.error_data && err.error_data.details].filter(Boolean).join(': ') || err.message)) || 'WhatsApp could not deliver this message';

async function imageOf(token, media) {
  try {
    const f = await wa.downloadMedia(token, media.id, 4.5 * 1024 * 1024);
    const mt = ['image/png', 'image/webp', 'image/gif'].includes(f.mime) ? f.mime : 'image/jpeg';
    return [{ media_type: mt, data: f.buffer.toString('base64') }];
  } catch (e) { console.warn('[whatsapp] image', e.message); return []; }
}

// One inbound customer message → the conversation engine (same path as Telegram and the website chat).
async function handleMessage(channel, m, names) {
  if (!m || !m.id || !m.from) return;
  if (!wa.firstSeen(m.id, channel.id)) return; // Meta retries webhooks: each message is handled once
  const from = String(m.from).replace(/\D/g, '');
  const person = { id: from, name: names[from] || '+' + from, username: '', lang: '' };
  const token = tokenOf(channel);
  const contact = engine.upsertContact(channel.workspace_id, channel.id, person);
  if (!contact.phone) db.update('contacts', contact.id, { phone: '+' + from });
  let kind = 'text'; let text = ''; let images = []; let voiceFile = null; let voiceMime = 'audio/ogg'; let noReply = false;
  const meta = { wa_type: m.type };
  const caption = o => (o && o.caption ? String(o.caption).slice(0, 2000) : '');
  switch (m.type) {
    case 'text': text = String((m.text && m.text.body) || ''); break;
    case 'image': kind = 'image'; text = caption(m.image); meta.media_id = m.image.id; meta.mime = m.image.mime_type; if (settings.feature('voice')) images = await imageOf(token, m.image); break;
    case 'sticker': kind = 'sticker'; text = '[Sticker]'; meta.media_id = m.sticker && m.sticker.id; noReply = true; break;
    case 'audio': kind = 'voice'; voiceFile = m.audio.id; voiceMime = m.audio.mime_type || voiceMime; meta.media_id = m.audio.id; meta.mime = m.audio.mime_type; meta.voice = !!m.audio.voice; break;
    case 'video': kind = 'video'; text = '[Video]' + (caption(m.video) ? ' ' + caption(m.video) : ''); meta.media_id = m.video.id; meta.mime = m.video.mime_type; break;
    case 'document': kind = 'document'; meta.media_id = m.document.id; meta.mime = m.document.mime_type; meta.filename = str(m.document.filename, 200); text = '[Document: ' + (meta.filename || 'file') + ']' + (caption(m.document) ? ' ' + caption(m.document) : ''); break;
    case 'location': {
      const l = m.location || {};
      kind = 'location'; Object.assign(meta, { lat: Number(l.latitude), lng: Number(l.longitude), place: str(l.name, 120), address: str(l.address, 200) });
      text = '[Location] ' + [meta.place, meta.address].filter(Boolean).join(', ') + ' (' + meta.lat + ', ' + meta.lng + ')';
      break;
    }
    case 'contacts': {
      const list = (m.contacts || []).slice(0, 5).map(c => [(c.name && (c.name.formatted_name || c.name.first_name)) || '', ...((c.phones || []).slice(0, 2).map(p => p.phone || p.wa_id || ''))].filter(Boolean).join(' '));
      kind = 'contacts'; meta.cards = list; text = '[Contact card] ' + list.join('; ');
      break;
    }
    case 'interactive': {
      const i = m.interactive || {}; const r = i.button_reply || i.list_reply || {};
      text = String(r.title || '') + (r.description ? ' (' + r.description + ')' : ''); meta.reply_id = r.id || ''; meta.tapped = true;
      if (i.nfm_reply) text = '[Form reply] ' + str(i.nfm_reply.body || i.nfm_reply.response_json, 500);
      break;
    }
    case 'button': text = String((m.button && m.button.text) || ''); meta.payload = str(m.button && m.button.payload, 200); meta.tapped = true; break;
    case 'reaction': {
      const r = m.reaction || {};
      kind = 'reaction'; meta.reacted_to = r.message_id; meta.emoji = r.emoji || '';
      text = r.emoji ? 'Reacted ' + r.emoji : 'Removed a reaction'; noReply = true;
      break;
    }
    case 'order': kind = 'order'; text = '[Order] ' + ((m.order && m.order.product_items) || []).map(p => (p.quantity || 1) + ' × ' + p.product_retailer_id).join(', '); break;
    default: kind = 'other'; text = '[A message type Replyvoo can’t show yet]'; noReply = true;
  }
  if (m.context && m.context.id) meta.reply_to = m.context.id;
  if (m.referral) meta.referral = { source: str(m.referral.source_type, 30), headline: str(m.referral.headline, 120), url: str(m.referral.source_url, 300) };

  // STOP / START: opt out of (or back into) Blasts and template follow-ups. Answered here, not by the AI.
  if ((kind === 'text') && (STOP.test(text) || START.test(text))) {
    const stop = STOP.test(text);
    const thread = engine.upsertThread(channel.workspace_id, channel, contact, from);
    engine.addMessage(thread, 'in', 'customer', text, 'text', { message_id: m.id, ...meta });
    db.update('contacts', contact.id, { opt_out_at: stop ? db.now() : null });
    const reply = stop ? 'Done. You won’t get broadcast messages from us any more. You can still message us here anytime. Reply START to get them again.' : 'You’re back on our list. Reply STOP anytime to stop broadcast messages.';
    const fresh = db.one('SELECT * FROM threads WHERE id = ?', thread.id);
    await engine.send(channel, token, fresh, reply, '', null);
    ws.event(channel.workspace_id, 'optout', (contact.name || 'A customer') + (stop ? ' opted out of WhatsApp broadcasts' : ' opted back in to WhatsApp broadcasts'), { thread_id: thread.id });
    return;
  }
  await engine.handleInbound({ channel, chatId: from, from: person, text, kind, images, voiceFile, voiceMime, messageId: m.id, meta, noReply });
}

// sent → delivered → read (never backwards); failed shows the reason in Pulse Inbox.
function handleStatus(channel, st) {
  if (!st || !st.id || !(st.status in wa.RANK)) return;
  const row = db.one('SELECT * FROM wa_messages WHERE wamid = ? AND channel_id = ?', String(st.id), channel.id);
  if (!row) return;
  if (st.status !== 'failed' && wa.RANK[st.status] <= wa.RANK[row.status]) return;
  const err = st.status === 'failed' ? (st.errors || [])[0] || {} : null;
  const why = err ? friendly(err).slice(0, 240) : '';
  db.run('UPDATE wa_messages SET status = ?, error = ?, category = ?, updated_at = ? WHERE wamid = ?', st.status, why, str(st.pricing && st.pricing.category, 30), db.now(), row.wamid);
  if (!row.message_id) return;
  const msg = db.one('SELECT id, thread_id, meta FROM messages WHERE id = ?', row.message_id);
  if (!msg) return;
  const meta = db.json(msg.meta, {});
  meta.wa_status = st.status;
  if (st.pricing && st.pricing.category) meta.wa_category = str(st.pricing.category, 30);
  if (err) { meta.failed = true; meta.error = why; }
  db.update('messages', msg.id, { meta: JSON.stringify(meta) });
  if (err && Number(err.code) === 131050) db.run('UPDATE contacts SET opt_out_at = COALESCE(opt_out_at, ?) WHERE id = (SELECT contact_id FROM threads WHERE id = ?)', db.now(), msg.thread_id);
  if (err && meta.blast_id) db.run('UPDATE blasts SET failed = failed + 1, sent = MAX(0, sent - 1) WHERE id = ?', meta.blast_id);
  // 131042: Meta could not charge the customer's WhatsApp account. Tell the owner (at most once a day per number).
  if (err && Number(err.code) === 131042) require('../services/notify').whatsappPayment(channel.workspace_id, channel, db.json(channel.data, {}).display_phone);
}

async function processPayload(body) {
  if (!body || body.object !== 'whatsapp_business_account') return;
  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const v = change.value || {};
      try {
        if (change.field === 'messages') {
          const phoneId = v.metadata && String(v.metadata.phone_number_id || '');
          const channel = phoneId && db.one("SELECT * FROM channels WHERE type = 'whatsapp' AND external_id = ? AND status = 'active'", phoneId);
          if (!channel) continue;
          const names = Object.fromEntries((v.contacts || []).map(c => [String(c.wa_id || '').replace(/\D/g, ''), c.profile && c.profile.name ? str(c.profile.name, 80) : '']));
          for (const st of v.statuses || []) handleStatus(channel, st);
          for (const m of v.messages || []) await handleMessage(channel, m, names);
        } else if (change.field === 'message_template_status_update' || change.field === 'template_category_update' || change.field === 'message_template_quality_update') {
          const t = (v.message_template_id && db.one('SELECT * FROM wa_templates WHERE meta_id = ?', String(v.message_template_id))) || db.one('SELECT * FROM wa_templates WHERE waba_id = ? AND name = ? AND language = ?', String(entry.id || ''), String(v.message_template_name || ''), String(v.message_template_language || ''));
          if (!t) continue;
          const patch = { updated_at: db.now() };
          if (change.field === 'message_template_status_update' && v.event) { patch.status = String(v.event).toUpperCase(); patch.reason = v.reason && v.reason !== 'NONE' ? str(v.reason, 200) : ''; }
          if (change.field === 'template_category_update' && v.new_category) patch.category = String(v.new_category).toUpperCase();
          db.update('wa_templates', t.id, patch);
          if (patch.status && patch.status !== t.status) require('../services/notify').whatsappTemplate(t.workspace_id, t, patch.status, patch.reason);
          if (patch.status) ws.event(t.workspace_id, 'channel', 'WhatsApp template “' + t.name + '” is ' + ({ APPROVED: 'approved', REJECTED: 'rejected', PAUSED: 'paused', DISABLED: 'disabled', PENDING: 'in review' }[patch.status] || patch.status.toLowerCase()) + (patch.reason ? ' (' + patch.reason + ')' : ''), { template_id: t.id });
        } else if (change.field === 'phone_number_quality_update' || change.field === 'account_update') {
          const waba = String(entry.id || '');
          for (const ch of db.all("SELECT * FROM channels WHERE type = 'whatsapp' AND status = 'active' AND json_extract(data, '$.waba_id') = ?", waba)) {
            const d = db.json(ch.data, {});
            if (change.field === 'phone_number_quality_update' && v.display_phone_number && String(v.display_phone_number).replace(/\D/g, '') !== String(d.display_phone || '').replace(/\D/g, '')) continue;
            if (change.field === 'phone_number_quality_update') { d.quality_event = str(v.event, 40); d.limit = str(v.current_limit, 40); }
            else { d.account_event = str(v.event, 60); if (v.event === 'PARTNER_REMOVED') db.update('channels', ch.id, { status: 'disabled' }); if (/PAYMENT|BILLING|CREDIT_LINE/i.test(String(v.event || '') + ' ' + JSON.stringify(v.ban_info || v.violation_info || ''))) require('../services/notify').whatsappPayment(ch.workspace_id, ch, d.display_phone); }
            db.update('channels', ch.id, { data: JSON.stringify(d) });
            ws.event(ch.workspace_id, 'channel', 'WhatsApp update for ' + (d.display_phone || ch.name) + ': ' + str(v.event, 60).toLowerCase().replace(/_/g, ' '), { channel_id: ch.id });
          }
        }
      } catch (e) { console.error('[whatsapp] webhook', e.message); }
    }
  }
}

/* ---------------- connecting a number ---------------- */
function channelLimit(req, existing) {
  if (existing) return;
  const used = db.one("SELECT COUNT(*) n FROM channels WHERE workspace_id = ? AND type = 'whatsapp' AND status = 'active'", req.ws.id).n;
  const max = Math.max(1, ws.limits(req.ws).closers);
  if (used >= max) throw new HttpError(402, 'Your plan allows ' + max + ' WhatsApp number' + (max === 1 ? '' : 's') + '. Upgrade your plan or add an Extra Closer to connect more.', { code: 'channel_limit' });
}
function needOn() {
  if (settings.channel('whatsapp') !== 'live') throw new HttpError(403, 'WhatsApp is coming soon. Join the waitlist and we’ll email you the day it opens.', { code: 'coming_soon' });
}
async function connectNumber(req, { tok, wabaId, phoneId, via }) {
  if (!/^\d{5,25}$/.test(String(phoneId))) throw new HttpError(400, 'The phone number ID is a long number. Find it in WhatsApp Manager → Phone numbers, or in your Meta app → WhatsApp → API Setup.');
  if (wabaId && !/^\d{5,25}$/.test(String(wabaId))) throw new HttpError(400, 'The WhatsApp Business Account ID is a long number (WhatsApp Manager → Account tools → Business account info).');
  let info;
  try { info = await wa.phoneInfo(phoneId, tok); }
  catch (e) { throw new HttpError(400, 'Meta did not let us open this phone number: ' + e.message + (via === 'manual' ? ' Check the phone number ID and that the token has whatsapp_business_messaging and whatsapp_business_management.' : '')); }
  if (!wabaId) {
    // The popup message did not reach us: the token tells us which account(s) it was granted.
    const ids = await wa.wabasOfToken(tok).catch(() => []);
    for (const id of ids) { const phones = await wa.listPhones(id, tok).catch(() => []); if (phones.some(p => String(p.id) === String(phoneId))) { wabaId = String(id); break; } }
    if (!wabaId) throw new HttpError(400, 'We could not find the WhatsApp Business Account for this number. Add the account ID under Advanced.');
  }
  const existing = db.one("SELECT * FROM channels WHERE type = 'whatsapp' AND external_id = ? AND status != 'deleted'", String(phoneId));
  if (existing && existing.workspace_id !== req.ws.id) throw new HttpError(409, 'This WhatsApp number is already connected to another Replyvoo workspace.');
  channelLimit(req, existing);
  try { await wa.subscribe(wabaId, tok); }
  catch (e) { throw new HttpError(400, 'Meta did not let Replyvoo receive messages for this account: ' + e.message); }
  const d = existing ? db.json(existing.data, {}) : {};
  // Embedded Signup numbers must be registered on the Cloud API with a 6-digit two-step PIN that we choose.
  let registerError = '';
  if (via === 'signup') {
    const pin = String(crypto.randomInt(100000, 1000000));
    try { await wa.register(phoneId, tok, pin); d.pin_enc = encrypt(pin); delete d.register_error; }
    catch (e) { registerError = e.message; d.register_error = String(e.message).slice(0, 200); }
  }
  Object.assign(d, { waba_id: String(wabaId), display_phone: str(info.display_phone_number, 40), verified_name: str(info.verified_name, 80), quality: str(info.quality_rating, 20), name_status: str(info.name_status, 40), limit: str(info.messaging_limit_tier, 40), via, connected_at: db.now() });
  const b = req.body || {};
  const closerId = int(b.closer_id) && db.one('SELECT id FROM closers WHERE id = ? AND workspace_id = ?', int(b.closer_id), req.ws.id) ? int(b.closer_id) : (db.one('SELECT id FROM closers WHERE workspace_id = ? AND active = 1 ORDER BY id LIMIT 1', req.ws.id) || {}).id || null;
  const name = d.verified_name || d.display_phone || 'WhatsApp';
  let id;
  if (existing) { id = existing.id; db.update('channels', id, { token_enc: encrypt(tok), name, username: '', status: 'active', closer_id: existing.closer_id || closerId, data: JSON.stringify(d) }); }
  else id = db.insert('channels', { workspace_id: req.ws.id, type: 'whatsapp', name, username: '', external_id: String(phoneId), token_enc: encrypt(tok), webhook_secret: '', closer_id: closerId, data: JSON.stringify(d), created_at: db.now() });
  ws.event(req.ws.id, 'channel', 'WhatsApp ' + (d.display_phone || name) + ' is connected', { channel_id: id });
  if (!existing || existing.status !== 'active') { const cl = closerId || (existing && existing.closer_id); const cn = cl ? (db.one('SELECT name FROM closers WHERE id = ?', cl) || {}).name : ''; require('../services/notify').whatsappConnected(req.ws.id, req.user, d.display_phone || name, cn); }
  const ch = db.one('SELECT * FROM channels WHERE id = ?', id);
  try { await wa.syncTemplates(ch, tok); } catch (e) { console.warn('[whatsapp] template sync', e.message); }
  return { channel: ch, warning: registerError ? 'Connected, but Meta did not register the number for the Cloud API yet (' + registerError + '). If messages do not arrive, open WhatsApp Manager → Phone numbers and finish the setup, then reconnect.' : '' };
}

function getWaChannel(req, id) {
  const c = db.one("SELECT * FROM channels WHERE id = ? AND workspace_id = ? AND type = 'whatsapp' AND status != 'deleted'", int(id), req.ws.id);
  if (!c) throw new HttpError(404, 'WhatsApp number not found');
  return c;
}
function getThread(req, id) { const t = db.one('SELECT * FROM threads WHERE id = ? AND workspace_id = ?', int(id), req.ws.id); if (!t) throw new HttpError(404, 'Chat not found'); return t; }
function templateRow(wsId, id) { const t = db.one('SELECT * FROM wa_templates WHERE id = ? AND workspace_id = ?', int(id), wsId); if (!t) throw new HttpError(404, 'Template not found'); return t; }
function cleanVars(v) { return (Array.isArray(v) ? v : []).slice(0, 20).map(x => str(x, 500)); }
function graphFail(e, what) { return new HttpError(e.status >= 500 || !e.status ? 502 : 400, (what || 'WhatsApp did not accept this') + ': ' + e.message, { code: e.code ? 'meta_' + e.code : undefined }); }

module.exports = function (app) {
  const W = req => auth.needWs(req);
  const M = req => auth.needManager(req);

  /* ---------- webhook (Meta → Replyvoo) ---------- */
  app.get('/webhooks/whatsapp', (req, res) => {
    const r = wa.resolve();
    const q = req.query || {};
    if (!r.verifyToken) throw new HttpError(404, 'WhatsApp is not set up');
    if (q['hub.mode'] !== 'subscribe' || !safeEqual(String(q['hub.verify_token'] || ''), r.verifyToken)) throw new HttpError(403, 'Forbidden');
    res.send(String(q['hub.challenge'] || '').slice(0, 200), 200, 'text/plain; charset=utf-8');
  });
  app.post('/webhooks/whatsapp', (req, res) => {
    const r = wa.resolve();
    if (!r.appSecret) throw new HttpError(404, 'WhatsApp is not set up');
    if (!signatureOk(req.rawBody, req.headers['x-hub-signature-256'], r.appSecret)) throw new HttpError(401, 'Bad signature');
    res.json({ ok: true }); // answer Meta at once; the work happens after
    if (!r.on) return; // switched off: acknowledged and ignored
    processPayload(req.body).catch(e => console.error('[whatsapp]', e.message));
  });

  /* ---------- connect ---------- */
  // Embedded Signup: the popup gives a 30-second code plus (usually) the account and phone number ids.
  app.post('/api/app/channels/whatsapp/signup', M, rateLimit('wa-connect', 20, 3600e3), async req => {
    needOn();
    if (!wa.resolve().signup) throw new HttpError(403, 'One-tap WhatsApp signup is not ready yet. Use Advanced to connect with your own token.');
    const b = req.body || {};
    const code = str(b.code, 2000);
    if (!code) throw new HttpError(400, 'Meta did not send a sign-in code. Try Connect WhatsApp again and press Finish at the end.');
    let tok;
    try { tok = await wa.exchangeCode(code); } catch (e) { throw new HttpError(400, 'Meta did not accept the sign-in (' + e.message + '). The code only works for 30 seconds: please try again.'); }
    let phoneId = str(b.phone_number_id, 30);
    const wabaId = str(b.waba_id, 30);
    if (!phoneId && wabaId) { const phones = await wa.listPhones(wabaId, tok).catch(() => []); if (phones.length === 1) phoneId = String(phones[0].id); }
    if (!phoneId) throw new HttpError(400, 'Pick or add a phone number in the Meta window, then press Finish.');
    const out = await connectNumber(req, { tok, wabaId, phoneId, via: 'signup' });
    return { ...require('./app').channelOut(out.channel), warning: out.warning };
  });
  // Advanced: paste the phone number ID, the WhatsApp Business Account ID and a permanent (system user) token.
  app.post('/api/app/channels/whatsapp/manual', M, rateLimit('wa-connect', 20, 3600e3), async req => {
    needOn();
    const b = req.body || {};
    const tok = str(b.token, 1000).replace(/\s/g, '');
    if (!/^[A-Za-z0-9_|-]{40,1000}$/.test(tok)) throw new HttpError(400, 'Paste the permanent access token of a system user (Meta Business Settings → System users → Generate token).');
    const out = await connectNumber(req, { tok, wabaId: str(b.waba_id, 30), phoneId: str(b.phone_number_id, 30), via: 'manual' });
    return { ...require('./app').channelOut(out.channel), warning: out.warning };
  });
  // Per-number settings: the template used for Nudges once the 24-hour window has closed.
  app.put('/api/app/channels/:id/whatsapp', M, req => {
    const c = getWaChannel(req, req.params.id);
    const b = req.body || {}; const d = db.json(c.data, {});
    if (b.nudge_template_id !== undefined) {
      const tid = int(b.nudge_template_id);
      if (tid) { const t = templateRow(req.ws.id, tid); if (t.channel_id !== c.id && t.waba_id !== d.waba_id) throw new HttpError(400, 'That template belongs to another WhatsApp account.'); d.nudge_template_id = tid; }
      else delete d.nudge_template_id;
    }
    if (b.nudge_vars !== undefined) d.nudge_vars = cleanVars(b.nudge_vars);
    db.update('channels', c.id, { data: JSON.stringify(d) });
    return require('./app').channelOut(db.one('SELECT * FROM channels WHERE id = ?', c.id));
  });

  /* ---------- templates ---------- */
  const listFor = (req, c) => db.all('SELECT * FROM wa_templates WHERE workspace_id = ? AND waba_id = ? ORDER BY CASE status WHEN \'APPROVED\' THEN 0 WHEN \'PENDING\' THEN 1 ELSE 2 END, name', req.ws.id, db.json(c.data, {}).waba_id || '').map(wa.templateOut);
  app.get('/api/app/channels/:id/templates', W, req => { const c = getWaChannel(req, req.params.id); return { templates: listFor(req, c), languages: wa.LANGS }; });
  app.post('/api/app/channels/:id/templates/sync', M, rateLimit('wa-sync', 60, 3600e3), async req => {
    const c = getWaChannel(req, req.params.id);
    try { await wa.syncTemplates(c, tokenOf(c)); } catch (e) { if (e instanceof HttpError) throw e; throw graphFail(e, 'Meta did not send your templates'); }
    return { templates: listFor(req, c), languages: wa.LANGS };
  });
  app.post('/api/app/channels/:id/templates', M, rateLimit('wa-tpl', 30, 3600e3), async req => {
    const c = getWaChannel(req, req.params.id);
    try { return { template: await wa.createTemplate(c, tokenOf(c), req.body || {}) }; }
    catch (e) { if (e instanceof HttpError) throw e; throw graphFail(e, 'Meta did not accept the template'); }
  });
  app.del('/api/app/channels/:id/templates/:tid', M, async req => {
    const c = getWaChannel(req, req.params.id);
    const t = templateRow(req.ws.id, req.params.tid);
    try { await wa.deleteTemplate(c, tokenOf(c), t); } catch (e) { throw graphFail(e, 'Meta did not delete the template'); }
    return { ok: true };
  });

  /* ---------- Pulse Inbox: template, file, media ---------- */
  app.post('/api/app/threads/:id/template', W, async req => {
    const t = getThread(req, req.params.id);
    const ch = db.one("SELECT * FROM channels WHERE id = ? AND type = 'whatsapp'", t.channel_id);
    if (!ch || ch.status !== 'active') throw new HttpError(400, 'Templates are only for connected WhatsApp numbers.');
    const b = req.body || {};
    const row = templateRow(req.ws.id, b.template_id);
    const out = wa.templateOut(row);
    if (!out.sendable) throw new HttpError(400, out.status !== 'APPROVED' ? 'Meta has not approved this template yet.' : 'This template needs a picture, video or dynamic link that Replyvoo can’t fill yet. Pick another one.');
    const contact = db.one('SELECT * FROM contacts WHERE id = ?', t.contact_id);
    if (contact.opt_out_at && row.category === 'MARKETING') throw new HttpError(400, 'This customer replied STOP to broadcasts, so marketing templates can’t be sent to them. Use a utility template.', { code: 'opted_out' });
    const vars = cleanVars(b.vars);
    let sent;
    try { sent = await wa.sendRaw(ch, tokenOf(ch), t.chat_id, wa.templateMsg(row, vars, contact)); } catch (e) { throw graphFail(e); }
    const id = engine.addMessage(t, 'out', 'human', wa.renderTemplate(row, vars, contact), 'template', { template: row.name, template_id: row.id, category: row.category, user_id: req.user.id, user_name: req.user.name, message_id: sent.message_id });
    wa.track(sent.message_id, ch.id, id);
    db.update('threads', t.id, { ai_on: 0, unread: 0 });
    return { ok: true };
  });
  app.post('/api/app/threads/:id/media', W, rateLimit('wa-media', 120, 3600e3), async req => {
    const t = getThread(req, req.params.id);
    const ch = db.one("SELECT * FROM channels WHERE id = ? AND type = 'whatsapp'", t.channel_id);
    if (!ch || ch.status !== 'active') throw new HttpError(400, 'Files can be sent on WhatsApp chats only.');
    if (!wa.windowOpen(t)) throw new HttpError(409, 'The free reply window has closed. Send an approved template first.', { code: 'window_closed' });
    const b = req.body || {};
    const m = /^data:([\w.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(b.data_url || ''));
    if (!m) throw new HttpError(400, 'Choose a photo, PDF, document or audio file.');
    const mime = m[1].toLowerCase(); const kind = wa.kindOfMime(mime);
    if (!kind) throw new HttpError(400, 'WhatsApp can’t send this kind of file. Use JPG, PNG, PDF, Word, Excel, MP3, OGG or MP4.');
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length || buf.length > wa.MEDIA_MAX[kind]) throw new HttpError(400, 'That file is too big for WhatsApp (' + Math.round(wa.MEDIA_MAX[kind] / 1048576) + ' MB at most).');
    const filename = str(b.filename, 200).replace(/[^\w .()-]/g, '') || 'file';
    const caption = str(b.caption, 1000);
    const tok = tokenOf(ch);
    let sent; let mediaId;
    try { mediaId = await wa.uploadMedia(ch, tok, buf, mime, filename); sent = await wa.sendRaw(ch, tok, t.chat_id, wa.mediaMsg(kind, mediaId, { caption, filename })); }
    catch (e) { throw graphFail(e, 'WhatsApp did not accept the file'); }
    const k = kind === 'audio' ? 'voice' : kind;
    const text = kind === 'document' ? '[Document: ' + filename + ']' + (caption ? ' ' + caption : '') : kind === 'video' ? '[Video]' + (caption ? ' ' + caption : '') : caption;
    const id = engine.addMessage(t, 'out', 'human', text, k, { media_id: mediaId, mime, filename, user_id: req.user.id, user_name: req.user.name, message_id: sent.message_id });
    wa.track(sent.message_id, ch.id, id);
    db.update('threads', t.id, { ai_on: 0, unread: 0 });
    return { ok: true };
  });
  // Photos, voice notes and files in a WhatsApp chat, fetched from Meta with the number's token (never a public link).
  app.get('/api/app/threads/:id/media/:mid', W, async (req, res) => {
    const t = getThread(req, req.params.id);
    const m = db.one('SELECT meta FROM messages WHERE id = ? AND thread_id = ?', int(req.params.mid), t.id);
    const meta = m ? db.json(m.meta, {}) : {};
    const ch = db.one("SELECT * FROM channels WHERE id = ? AND type = 'whatsapp'", t.channel_id);
    if (!meta.media_id || !ch) throw new HttpError(404, 'No file here');
    let f;
    try { f = await wa.downloadMedia(tokenOf(ch), meta.media_id, 16 * 1024 * 1024); } catch (e) { throw new HttpError(404, 'This file is no longer available on WhatsApp (' + e.message + ').'); }
    const inline = /^(image\/(jpeg|png|webp)|audio\/|video\/mp4)/.test(f.mime);
    const name = String(meta.filename || 'file').replace(/[^\w .()-]/g, '_');
    res.send(f.buffer, 200, f.mime, { 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': (inline ? 'inline' : 'attachment') + '; filename="' + name + '"' });
  });

  /* ---------- Blast on WhatsApp: the Meta cost estimate ---------- */
  app.post('/api/app/blasts/estimate', W, req => {
    const b = req.body || {};
    const row = templateRow(req.ws.id, b.template_id);
    const rec = require('../services/blast').segmentRecipients(req.ws.id, b.segment || 'all', 'whatsapp');
    const per = settings.get('billing').blast_people_per_credit || 10;
    return { people: rec.length, credits: Math.ceil(rec.length / per), opted_out: require('../services/blast').optedOut(req.ws.id), meta: wa.estimate(rec.map(r => r.chat_id), row.category) };
  });

  void config; void first;
};

module.exports.processPayload = processPayload;
module.exports.signatureOk = signatureOk;
module.exports.handleStatus = handleStatus;
module.exports.friendly = friendly;
