'use strict';
/*
 * Joinvoo bridge (server-to-server; see src/services/joinvoo.js for how it works and how calls are signed).
 *   POST /hooks/joinvoo/link     Joinvoo gives this Voo ID its own link secret (signed with the shared bridge secret)
 *   POST /hooks/joinvoo/status   plan, free chats left, out of credits (for the line under the bot in Joinvoo)
 *   POST /hooks/joinvoo/bot      switch one bot on (Replyvoo answers) or off (back to Joinvoo's Team inbox)
 *   POST /hooks/joinvoo/basics       Update 68: the AI basics (what you sell, link, tone, language, on) of the Closer for one bot/account
 *   POST /hooks/joinvoo/basics/save  Update 68: save them from Joinvoo's "Set up your AI" wizard (Replyvoo stays the only place they live)
 *   POST /hooks/joinvoo/account      Update 68: one "Connect" tap in Joinvoo makes the free Replyvoo account for this Voo ID
 *   POST /hooks/joinvoo/update   one private-chat update for a switched bot: message, photo, voice, file, sticker,
 *                                button press, Start, blocked, or new context (a deposit). Answered in milliseconds;
 *                                the Closer replies right after, through Joinvoo.
 * Answers say "out_of_credits", "no_closer", "not_switched" or "paused" in `reason`, so Joinvoo's Team inbox takes the chat.
 */
const db = require('../db');
const ws = require('../services/workspace');
const engine = require('../services/engine');
const notify = require('../services/notify');
const jv = require('../services/joinvoo');
const { HttpError } = require('../lib/http');

// Per-link limits (a busy bot sends a lot; a runaway or stolen link can't flood us).
const hits = new Map();
function limit(link, name, max, windowMs) {
  const k = name + ':' + link.link_id, t = Date.now();
  let b = hits.get(k); if (!b || b.reset < t) { b = { n: 0, reset: t + windowMs }; hits.set(k, b); }
  if (++b.n > max) throw new HttpError(429, 'Too many requests for this link. Slow down.', { reason: 'rate_limited' });
}
setInterval(() => { const t = Date.now(); for (const [k, b] of hits) if (b.reset < t) hits.delete(k); }, 60e3).unref();
// Refunds of orders paid with Joinvoo credits that couldn't reach Joinvoo yet are retried.
setInterval(() => { jv.retryRefunds().catch(e => console.warn('[joinvoo] refund retry', e.message)); }, Number(process.env.JOINVOO_REFUND_RETRY_MS) || 5 * 60e3).unref();

const FALLBACK = new Set(['no_closer', 'locked', 'no_credits', 'send_failed', 'error', 'paused']);
const str = (v, n) => String(v == null ? '' : v).slice(0, n);

module.exports = function (app) {
  app.post('/hooks/joinvoo/link', req => {
    jv.verify(req, { app: true });
    const link = jv.saveLink(req.body || {});
    return { ok: true, link_id: link.link_id, status: jv.status(link) };
  });

  app.post('/hooks/joinvoo/status', req => {
    const link = jv.verify(req);
    limit(link, 'status', 120, 60e3);
    const ids = (Array.isArray((req.body || {}).bot_ids) ? req.body.bot_ids : []).slice(0, 50).map(x => String(x).replace(/\D/g, '')).filter(Boolean);
    const bots = ids.map(id => { const c = jv.channelFor(link, id); return { bot_id: id, on: !!(c && c.status === 'active'), chats: c ? db.one('SELECT COUNT(*) n FROM threads WHERE channel_id = ?', c.id).n : 0, closer: !!(c && c.closer_id) }; });
    const aids = (Array.isArray((req.body || {}).account_ids) ? req.body.account_ids : []).slice(0, 50).map(x => String(x).replace(/\D/g, '')).filter(Boolean);
    const accounts = aids.map(id => { const c = jv.channelFor(link, id, 'account'); return { account_id: id, on: !!(c && c.status === 'active'), chats: c ? db.one('SELECT COUNT(*) n FROM threads WHERE channel_id = ?', c.id).n : 0, closer: !!(c && c.closer_id) }; });
    return { ok: true, status: jv.status(link), bots, accounts };
  });

  app.post('/hooks/joinvoo/bot', req => {
    const link = jv.verify(req);
    limit(link, 'bot', 60, 60e3);
    return jv.switchBot(link, req.body || {});
  });

  // Paying with Joinvoo credits: Replyvoo's real plans and packs, the purchase itself (price checked here, once per purchase id), and
  // its status (Joinvoo asks after a timeout before it refunds anything).
  app.post('/hooks/joinvoo/catalog', req => { const link = jv.verify(req); limit(link, 'catalog', 60, 60e3); return jv.catalog(link); });
  app.post('/hooks/joinvoo/purchase', req => { const link = jv.verify(req); limit(link, 'purchase', 30, 60e3); return jv.purchase(link, req.body || {}); });
  app.post('/hooks/joinvoo/purchase-status', req => { const link = jv.verify(req); limit(link, 'pstatus', 120, 60e3); return jv.purchaseStatus(link, req.body || {}); });
  // Moving from Joinvoo AI: its notes (about, offer, steps, links, tone, never say, hand-over) become the workspace's Closer knowledge.
  // Update 68: "Set up your AI" inside Joinvoo. The basics of the Closer for one bot/account (read, save), and the free account made with
  // one "Connect" tap there. Advanced settings stay here in Replyvoo; Joinvoo keeps none of these settings.
  app.post('/hooks/joinvoo/basics', req => { const link = jv.verify(req); limit(link, 'basics', 60, 60e3); return jv.getBasics(link, req.body || {}); });
  app.post('/hooks/joinvoo/basics/save', req => { const link = jv.verify(req); limit(link, 'bsave', 20, 60e3); return jv.saveBasics(link, req.body || {}); });
  app.post('/hooks/joinvoo/account', req => { const link = jv.verify(req); limit(link, 'account', 5, 60e3); return jv.createAccount(link, req.body || {}); });
  app.post('/hooks/joinvoo/import', req => { const link = jv.verify(req); limit(link, 'import', 10, 60e3); return jv.importNotes(link, req.body || {}); });

  app.post('/hooks/joinvoo/update', async req => {
    const link = jv.verify(req);
    limit(link, 'update', 1200, 60e3);
    const b = req.body || {};
    const ch = jv.channelOf(link, b);
    if (!ch || ch.status !== 'active') throw new HttpError(409, 'This bot is not switched to Replyvoo.', { reason: 'not_switched', status: jv.status(link) });
    const w = ws.get(ch.workspace_id);
    if (!w || w.status !== 'active') throw new HttpError(409, 'This Replyvoo workspace is paused.', { reason: 'paused' });
    const chatId = String(b.chat_id || '').replace(/[^\d]/g, '').slice(0, 20);
    if (!chatId) throw new HttpError(400, 'chat_id is required.');
    const f = b.from || {};
    const from = { id: chatId, name: str(f.name, 80) || 'Telegram user', username: str(f.username, 64).replace(/^@/, ''), lang: str(f.lang, 10) };
    const contact = engine.upsertContact(w.id, ch.id, from);
    const ctx = jv.cleanContext(b.context);
    if (ctx) db.update('contacts', contact.id, { ext_context: JSON.stringify(ctx) });
    const thread = engine.upsertThread(w.id, ch, contact, chatId, '');
    const synced = jv.addHistory(thread, b.history);
    const ev = String(b.event || 'message');
    if (ev === 'context') {
      // The manager answered from their own Telegram: a person is on this chat, so the Closer steps back (as when a teammate replies here).
      if (b.manager_replied && thread.ai_on) { db.update('threads', thread.id, { ai_on: 0 }); engine.addMessage(thread, 'note', 'system', (ch.name || 'The manager') + ' replied from their own Telegram, so your Closer stepped back in this chat. Hand it back to AI any time.'); }
      return { ok: true, synced };
    }
    if (ev === 'blocked') {
      db.update('contacts', contact.id, { blocked: 1 });
      engine.addMessage(thread, 'note', 'system', (contact.name || 'This person') + ' blocked the bot (seen by Joinvoo).');
      return { ok: true };
    }
    if (contact.blocked) db.update('contacts', contact.id, { blocked: 0 }); // they wrote again: not blocked any more
    const m = b.message || {};
    const ext = 'jv:' + String(m.jv_id || '').replace(/[^\w:-]/g, '').slice(0, 40);
    if (ext !== 'jv:' && db.one('SELECT 1 FROM messages WHERE thread_id = ? AND ext_id = ?', thread.id, ext)) return { ok: true, duplicate: true };
    const meta = { via: 'joinvoo', ext_id: ext !== 'jv:' ? ext : undefined, message_id: Number(m.tg_msg_id) || undefined };
    const fresh = db.one('SELECT * FROM threads WHERE id = ?', thread.id);
    const closerId = fresh.closer_id || ch.closer_id;
    const closer = closerId ? engine.loadCloser(closerId) : null;
    const closerOk = !!(closer && closer.active && ws.closerUnlocked(closer));

    if (ev === 'start') {
      engine.addMessage(fresh, 'in', 'customer', '/start', 'text', meta);
      // Joinvoo already sent its own welcome message (with the offer button): the Closer waits for the first real message.
      if (!b.welcomed && closerOk) {
        const hello = 'Hi ' + (from.name.split(' ')[0] || 'there') + '! I’m ' + closer.name + '. How can I help you today?';
        setImmediate(async () => {
          try { const r = await jv.relay(ch, chatId, { kind: 'text', text: hello, by: 'ai', by_name: closer.name }); engine.addMessage(fresh, 'out', 'ai', hello, 'text', { closer_id: closer.id, message_id: r.message_id }); }
          catch (e) { console.warn('[joinvoo] hello', e.message); }
        });
      }
      return { ok: true, accepted: true };
    }

    const kind = jv.KIND[m.kind] || 'text';
    const text = jv.describe(m);
    const media = jv.mediaMeta(m);
    if (media) meta.media = media;
    // The team took this chat over inside Replyvoo: keep the message, nobody else answers.
    if (!fresh.ai_on || fresh.status === 'handoff') { engine.addMessage(fresh, 'in', 'customer', text || (kind === 'voice' ? '[voice note]' : ''), kind, meta); return { ok: true, accepted: true, team: true }; }
    if (!closerOk) {
      engine.addMessage(fresh, 'in', 'customer', text || (kind === 'voice' ? '[voice note]' : ''), kind, meta);
      throw new HttpError(409, 'No active Closer answers this bot in Replyvoo yet.', { reason: 'no_closer', status: jv.status(link) });
    }
    if (!jv.canAnswer(w, fresh)) {
      engine.addMessage(fresh, 'in', 'customer', text || (kind === 'voice' ? '[voice note]' : ''), kind, meta);
      notify.outOfCredits(w.id);
      ws.event(w.id, 'paused', 'Out of conversations and credits: Joinvoo’s Team inbox is answering ' + (contact.name || 'a customer') + '.', { thread_id: thread.id });
      throw new HttpError(402, 'Out of Replyvoo chats and credits.', { reason: 'out_of_credits', status: jv.status(link) });
    }
    // Accepted. The Closer answers straight after this response (photos are read through Joinvoo, voice notes transcribed).
    setImmediate(async () => {
      const report = {};
      try {
        let images = [];
        if (kind === 'image' && m.file_id && closer.skills.vision !== false) {
          try { const fl = await jv.file(ch, chatId, m.file_id, 4.5 * 1024 * 1024); images = [{ media_type: /png/.test(fl.type) ? 'image/png' : /webp/.test(fl.type) ? 'image/webp' : 'image/jpeg', data: fl.buffer.toString('base64') }]; } catch (e) { console.warn('[joinvoo] photo', e.message); }
        }
        const out = await engine.handleInbound({ channel: ch, chatId, from, text, kind, images, voiceFile: kind === 'voice' ? m.file_id : null, fetchFile: id => jv.file(ch, chatId, id), messageId: meta.message_id, meta: { via: 'joinvoo', ext_id: meta.ext_id, media: meta.media }, report });
        if (!out && FALLBACK.has(report.reason)) await jv.fallback(ch, chatId, report.reason === 'no_credits' ? 'out_of_credits' : report.reason);
      } catch (e) {
        console.error('[joinvoo] update', e.message);
        await jv.fallback(ch, chatId, 'error');
      }
    });
    return { ok: true, accepted: true };
  });
};
