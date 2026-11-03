'use strict';
// Telegram and payment webhooks.
const db = require('../db');
const config = require('../config');
const engine = require('../services/engine');
const payments = require('../services/payments');
const settings = require('../services/settings');
const ws = require('../services/workspace');
const tg = require('../services/telegram');
const { safeEqual, decrypt, encrypt } = require('../lib/security');
const { HttpError } = require('../lib/http');

const LINK = /(https?:\/\/|t\.me\/|www\.)\S+/i;

function person(u) {
  return { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Telegram user', username: u.username || '', lang: u.language_code || '' };
}

async function largestPhoto(token, photos) {
  const p = photos[photos.length - 1];
  try {
    const f = await tg.download(token, p.file_id, 4.5 * 1024 * 1024);
    const ext = (f.path.split('.').pop() || 'jpg').toLowerCase();
    return [{ media_type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', data: f.buffer.toString('base64') }];
  } catch (e) { console.warn('[photo]', e.message); return []; }
}

async function handleUpdate(channel, u) {
  const token = decrypt(channel.token_enc);
  // A Telegram Business account connected (or disconnected) this bot.
  if (u.business_connection) {
    const bc = u.business_connection;
    const flag = settings.channel('telegram_business');
    let row = db.one('SELECT * FROM channels WHERE workspace_id = ? AND type = \'telegram_business\' AND external_id = ?', channel.workspace_id, bc.id);
    const data = JSON.stringify({ bot_channel_id: channel.id, user_id: bc.user && bc.user.id, can_reply: bc.can_reply !== false && !(bc.rights && bc.rights.can_reply === false) });
    const status = bc.is_enabled === false || flag !== 'live' ? 'disabled' : 'active';
    if (!row) {
      db.insert('channels', { workspace_id: channel.workspace_id, type: 'telegram_business', name: bc.user ? person(bc.user).name : 'Telegram account', username: bc.user && bc.user.username || '', external_id: bc.id, token_enc: encrypt(token), closer_id: channel.closer_id, status, data, created_at: db.now() });
      ws.event(channel.workspace_id, 'channel', 'Your Telegram account is connected through Telegram Business', {});
    } else db.update('channels', row.id, { status, data, token_enc: encrypt(token) });
    return;
  }
  const isBusiness = !!u.business_message;
  const m = u.message || u.business_message;
  if (!m || !m.chat || !m.from) return;
  let target = channel;
  let bcId = '';
  if (isBusiness) {
    bcId = m.business_connection_id || '';
    target = db.one('SELECT * FROM channels WHERE workspace_id = ? AND type = \'telegram_business\' AND external_id = ? AND status = \'active\'', channel.workspace_id, bcId);
    if (!target) return;
    const d = db.json(target.data, {});
    if (d.user_id && m.from.id === d.user_id) {
      // The account owner typed this themselves: record it as a human reply.
      const contact = engine.upsertContact(target.workspace_id, target.id, person(m.chat));
      const thread = engine.upsertThread(target.workspace_id, target, contact, m.chat.id, bcId);
      engine.addMessage(thread, 'out', 'human', m.text || m.caption || '[media]', 'text', { owner: true });
      return;
    }
  }
  const isGroup = m.chat.type === 'group' || m.chat.type === 'supergroup';
  const text = m.text || m.caption || '';
  if (isGroup) {
    if (settings.channel('telegram_group') !== 'live') return;
    const closer = channel.closer_id ? engine.loadCloser(channel.closer_id) : null;
    if (m.new_chat_members && closer && closer.active) {
      const names = m.new_chat_members.filter(x => !x.is_bot).map(x => x.first_name).join(', ');
      if (names && closer.template === 'guard') await tg.sendText(token, m.chat.id, 'Welcome, ' + names + '! Please read the pinned message. Ask me anything by mentioning me.').catch(() => {});
      return;
    }
    if (closer && closer.template === 'guard' && LINK.test(text)) {
      try {
        const member = await tg.call(token, 'getChatMember', { chat_id: m.chat.id, user_id: m.from.id });
        if (!['creator', 'administrator'].includes(member.status)) {
          await tg.call(token, 'deleteMessage', { chat_id: m.chat.id, message_id: m.message_id });
          ws.event(channel.workspace_id, 'shield', 'Shield removed a link posted by ' + person(m.from).name, {});
          return;
        }
      } catch (e) { /* bot may not be admin */ }
    }
    const me = db.json(channel.data, {});
    const mentioned = (channel.username && text.toLowerCase().includes('@' + channel.username.toLowerCase())) || (m.reply_to_message && m.reply_to_message.from && String(m.reply_to_message.from.id) === channel.external_id);
    void me;
    if (!mentioned) return;
    await engine.handleInbound({ channel, chatId: m.chat.id, from: { ...person(m.from), id: m.chat.id + ':' + m.from.id }, text: (channel.username ? text.replace(new RegExp('@' + channel.username.replace(/[^A-Za-z0-9_]/g, ''), 'ig'), '') : text).trim(), messageId: m.message_id, group: true, mentioned: true });
    return;
  }
  if (m.chat.type !== 'private') return;
  if (/^\/start(@\w+)?(\s|$)/.test(text)) {
    const closer = target.closer_id ? engine.loadCloser(target.closer_id) : null;
    const hello = closer ? 'Hi ' + (m.from.first_name || 'there') + '! I’m ' + closer.name + '. How can I help you today?' : 'Hi! How can we help you today?';
    const contact = engine.upsertContact(target.workspace_id, target.id, person(m.from));
    const thread = engine.upsertThread(target.workspace_id, target, contact, m.chat.id, bcId);
    engine.addMessage(thread, 'in', 'customer', text.slice(0, 200));
    await tg.sendText(token, m.chat.id, hello, { business_connection_id: bcId || undefined }).catch(() => {});
    engine.addMessage(thread, 'out', 'ai', hello, 'text', { closer_id: closer && closer.id });
    return;
  }
  let kind = 'text', images = [], voiceFile = null;
  if (m.photo && m.photo.length) { kind = 'image'; images = settings.feature('voice') ? await largestPhoto(token, m.photo) : []; }
  else if (m.voice || m.audio) { kind = 'voice'; voiceFile = (m.voice || m.audio).file_id; }
  else if (!text) kind = 'other';
  await engine.handleInbound({ channel: target, chatId: m.chat.id, bc: bcId, from: person(m.from), text, kind, images, voiceFile, messageId: m.message_id });
}

module.exports = function (app) {
  app.post('/webhooks/telegram/:id', (req, res) => {
    const channel = db.one('SELECT * FROM channels WHERE id = ? AND type = \'telegram_bot\' AND status = \'active\'', Number(req.params.id));
    if (!channel || !safeEqual(req.headers['x-telegram-bot-api-secret-token'] || '', channel.webhook_secret)) throw new HttpError(403, 'Forbidden');
    const u = req.body || {};
    res.json({ ok: true });
    if (!u.update_id || u.update_id <= channel.last_update_id) return;
    db.update('channels', channel.id, { last_update_id: u.update_id });
    handleUpdate(channel, u).catch(e => console.error('[telegram]', e.message));
  });

  app.post('/webhooks/paystack', (req, res) => {
    if (!payments.paystackSignatureOk(req.rawBody || Buffer.from(''), req.headers['x-paystack-signature'])) throw new HttpError(401, 'Bad signature');
    const ev = req.body || {};
    res.json({ ok: true });
    if (ev.event === 'charge.success' && ev.data && ev.data.reference) payments.verify(ev.data.reference).catch(e => console.error('[paystack]', e.message));
  });

  app.post('/webhooks/flutterwave', (req, res) => {
    if (!payments.flutterwaveSignatureOk(req.headers['verif-hash'])) throw new HttpError(401, 'Bad signature');
    const ev = req.body || {};
    res.json({ ok: true });
    const ref = ev.data && (ev.data.tx_ref || ev.data.txRef);
    if (ref) payments.verify(ref).catch(e => console.error('[flutterwave]', e.message));
  });

  // Gatevoo: signed invoice events (see services/gatevoo.js for the signature). "invoice.test" (the dashboard's test
  // button) is answered 200 and changes nothing. Only "invoice.paid" with data.status "paid" can credit, and only after
  // the invoice is read back from Gatevoo (never the body alone) with an amount at least the order's. Retries are safe:
  // a paid order is never applied twice.
  app.post('/webhooks/gatevoo', (req, res) => {
    const gatevoo = require('../services/gatevoo');
    if (!gatevoo.signatureOk(req.rawBody || Buffer.from(''), req.headers['x-gatevoo-signature'], req.headers['x-gatevoo-timestamp'])) throw new HttpError(401, 'Bad signature');
    const ev = req.body || {};
    const type = String(ev.type || req.headers['x-gatevoo-event'] || '');
    if (type === 'invoice.test') return { ok: true, test: true };
    const inv = ev.data && typeof ev.data === 'object' ? ev.data : {};
    if (type !== 'invoice.paid' || String(inv.status || '').toLowerCase() !== 'paid') return { ok: true, ignored: true };
    const o = (inv.order_id && db.one("SELECT * FROM orders WHERE ref = ? AND provider = 'gatevoo'", String(inv.order_id))) || (inv.id && db.one("SELECT * FROM orders WHERE provider_ref = ? AND provider = 'gatevoo'", String(inv.id)));
    if (!o) return { ok: true, ignored: true };
    if (o.status === 'paid') return { ok: true, duplicate: true };
    if (o.status === 'refunded' || o.status === 'charged_back') return { ok: true, ignored: true }; // refunded or charged back: a replayed webhook never re-credits it
    if (!(Number(inv.amount_usd) >= gatevoo.dueUsd(o) - 0.01)) return { ok: true, ignored: true };
    res.json({ ok: true });
    gatevoo.verify(o).catch(e => console.error('[gatevoo]', e.message));
  });

  // Bachs: a signed webhook only makes us ASK Bachs (bachs.verify); the order is fulfilled from Bachs's own answer.
  // A wrong, missing or old signature is refused before anything is looked up. Unknown checkouts are acknowledged.
  app.post('/webhooks/bachs', async (req, res) => {
    const bachs = require('../services/bachs');
    const b = bachs.resolve();
    if (!b.webhookSecret) throw new HttpError(404, 'Bachs is not connected');
    if (!bachs.sigOk(req.headers, req.rawBody || Buffer.from(''), b.webhookSecret)) throw new HttpError(401, 'Bad signature');
    const ev = req.body || {};
    // Card auto-renew: subscription and invoice events (services/bachs-subs.js), each handled once, credit only after
    // Bachs's own answer. Bachs could not be asked → 502 so it retries.
    const subs = require('../services/bachs-subs');
    if (subs.isSubEvent(ev)) { try { await subs.handle(ev); } catch (e) { console.error('[bachs] subscription webhook', e.message); return res.json({ error: 'try again' }, 502); } return { ok: true }; }
    const d = (ev.data && typeof ev.data === 'object' ? (ev.data.object || ev.data) : null) || {};
    const ref = String(d.reference || (d.metadata && d.metadata.reference) || '').slice(0, 60);
    const cid = String(d.checkout_id || d.checkout_session_id || (/^c(s|hk)_/.test(String(d.id || '')) ? d.id : '')).slice(0, 120);
    const o = (ref && db.one("SELECT * FROM orders WHERE ref = ? AND provider = 'bachs'", ref)) || (cid && db.one("SELECT * FROM orders WHERE provider = 'bachs' AND provider_ref = ?", cid));
    if (o && (o.status === 'pending' || o.status === 'failed' || o.status === 'cancelled')) { // never a paid, refunded or charged-back order
      // Bachs retries a webhook that fails: answer 502 when Bachs could not be asked, so the payment is checked again.
      try { await bachs.verify(o); } catch (e) { console.error('[bachs] webhook verify', e.message); return res.json({ error: 'try again' }, 502); }
    }
    return { ok: true };
  });

  void config;
};

module.exports.handleUpdate = handleUpdate;
