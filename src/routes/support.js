'use strict';
// Support desk routes: the admin desk, the customer's help panel in the dashboard, the Telegram support bot
// webhook and the inbound email webhook. Contact form and website chat tickets come in through /api/public/contact.
const config = require('../config');
const db = require('../db');
const auth = require('../lib/auth');
const support = require('../services/support');
const staffSvc = require('../services/staff');
const settings = require('../services/settings');
const tg = require('../services/telegram');
const { HttpError, rateLimit } = require('../lib/http');
const { hmac, safeEqual } = require('../lib/security');

const str = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const tgSecret = () => hmac('support-telegram').slice(0, 48);

async function aiDraft(t) {
  const ai = require('../services/ai');
  const msgs = db.all("SELECT dir, text FROM support_messages WHERE ticket_id = ? AND dir IN ('in','out') ORDER BY id DESC LIMIT 10", t.id).reverse();
  let li = -1; msgs.forEach((m, i) => { if (m.dir === 'in') li = i; });
  if (li < 0) return '';
  const last = msgs[li];
  // History up to (not including) the customer's latest message, so the draft answers that message.
  const history = msgs.slice(0, li).map(m => ({ role: m.dir === 'in' ? 'user' : 'assistant', text: m.text }));
  const prompt = 'You are drafting a reply for a human support agent at Replyvoo to send to a customer. Write as the agent, warm and clear, 2 to 5 short sentences, plain text, no sign-off. Only use the FACTS; if you are not sure, say the team will check and get back. The customer’s name is ' + (t.requester_name || 'unknown') + '.';
  let text = null;
  try { text = await ai.supportBot(last.text, history, require('./public').supportFacts(), prompt); } catch (e) { console.warn('[support draft]', e.message); }
  return text || ('Hi ' + (String(t.requester_name || '').split(' ')[0] || 'there') + ', thanks for reaching out! I’m looking into this now and will get back to you shortly.');
}

module.exports = function (app) {
  // ---------- admin desk ----------
  app.get('/api/admin/support/desk', req => {
    const st = req.staff;
    const visible = support.boxes(true).filter(b => staffSvc.canBox(st, b.id));
    const people = db.all("SELECT u.id, u.name, u.email, s.role, s.last_seen FROM staff s JOIN users u ON u.id = s.user_id WHERE s.status = 'active' ORDER BY u.name")
      .filter(p => staffSvc.can(staffSvc.get(p.id), 'support', 'edit')).map(p => ({ id: p.id, name: p.name || p.email, email: p.email, online: !!p.last_seen && Date.now() - new Date(p.last_seen).getTime() < 10 * 60e3 }));
    const c = settings.get('support');
    return { me: { id: req.user.id, name: req.user.name, can_edit: staffSvc.can(st, 'support', 'edit'), can_manage: staffSvc.can(st, 'staff', 'edit') }, counts: support.counts(st, req.user.id), boxes: visible, staff: people,
      replies: db.all('SELECT id, title, text FROM support_saved_replies ORDER BY title'), sources: support.SOURCES,
      settings: { auto_assign: c.auto_assign !== false, ai_drafts: c.ai_drafts !== false, email_staff: c.email_staff !== false, routing: c.routing || {}, tg_username: c.tg_username || '', tg_ready: !!config.support.tgToken, inbound_email: !!config.support.inboundKey, ai_live: !!config.ai.key } };
  });
  app.get('/api/admin/support/poll', req => ({ counts: support.counts(req.staff, req.user.id), latest: (db.one('SELECT MAX(last_message_at) t FROM support_tickets') || {}).t || '' }));
  app.get('/api/admin/support/tickets', req => {
    const q = req.query;
    return { tickets: support.list(req.staff, { status: q.status || 'active', box: q.box || '', mine: q.view === 'mine' ? true : q.view === 'unassigned' ? 'unassigned' : false, q: str(q.q, 80), userId: req.user.id, before: q.before || '' }) };
  });
  app.get('/api/admin/support/tickets/:ref', req => {
    const t = support.getForStaff(req.staff, req.params.ref);
    // Only people who work the desk mark tickets as read; a view-only look leaves them unread for the agents.
    const works = staffSvc.can(req.staff, 'support', 'edit');
    if (t.unread && works) db.run('UPDATE support_tickets SET unread = 0 WHERE id = ?', t.id);
    const out = support.ticketOut(works ? { ...t, unread: 0 } : t, true);
    // Customer context: their account and recent tickets, so the agent doesn't have to ask.
    let account = null;
    const uid = t.requester_user_id || (t.requester_email ? (db.one('SELECT id FROM users WHERE email = ?', t.requester_email) || {}).id : null);
    if (uid && staffSvc.can(req.staff, 'users', 'view')) {
      const u = db.one('SELECT id, email, name, created_at, last_login, country FROM users WHERE id = ?', uid);
      const w = db.one('SELECT w.id, w.name, w.plan_id, w.credits, w.period_end, w.status FROM workspaces w JOIN members m ON m.workspace_id = w.id WHERE m.user_id = ? ORDER BY m.created_at LIMIT 1', uid);
      account = { user: u, workspace: w, plan: w ? (db.one('SELECT name FROM plans WHERE id = ?', w.plan_id) || {}).name : null, channels: w ? db.one("SELECT COUNT(*) n FROM channels WHERE workspace_id = ? AND status = 'active'", w.id).n : 0, paid_usd: w ? db.one("SELECT COALESCE(SUM(amount_usd),0) n FROM orders WHERE workspace_id = ? AND status = 'paid'", w.id).n : 0 };
    }
    out.account = account;
    out.history = db.all('SELECT ref, subject, status, created_at, box_id, assignee_id FROM support_tickets WHERE id != ? AND ((requester_email != \'\' AND requester_email = ?) OR (tg_chat_id != \'\' AND tg_chat_id = ?)) ORDER BY id DESC LIMIT 10', t.id, t.requester_email, t.tg_chat_id)
      .filter(h => staffSvc.canBox(req.staff, h.box_id) || h.assignee_id === req.user.id).slice(0, 5).map(({ box_id, assignee_id, ...h }) => h);
    return out;
  });
  app.post('/api/admin/support/tickets/:ref/reply', rateLimit('support-reply', 240, 3600e3), async req => {
    const t = support.getForStaff(req.staff, req.params.ref);
    const b = req.body || {};
    const r = await support.reply(t, req.user, support.fill(b.text, t), { note: !!b.note });
    if (b.status && support.STATUSES.includes(b.status)) support.update(db.one('SELECT * FROM support_tickets WHERE id = ?', t.id), req.user, { status: b.status });
    return { ...r, ticket: support.ticketOut(db.one('SELECT * FROM support_tickets WHERE id = ?', t.id), true) };
  });
  app.put('/api/admin/support/tickets/:ref', req => {
    const t = support.getForStaff(req.staff, req.params.ref);
    const b = req.body || {};
    if (b.box_id != null && !staffSvc.canBox(req.staff, b.box_id)) throw new HttpError(403, 'You can only move tickets to boxes you work in.');
    return { ok: true, ticket: support.ticketOut(support.update(t, req.user, b), true) };
  });
  app.post('/api/admin/support/tickets/:ref/draft', rateLimit('support-draft', 120, 3600e3), async req => {
    const t = support.getForStaff(req.staff, req.params.ref);
    return { text: await aiDraft(t), ai: !!config.ai.key };
  });

  // Saved replies (everyone on the desk can use them; editing needs desk edit access).
  app.post('/api/admin/support/replies', req => { const b = req.body || {}; if (!str(b.title, 60) || !str(b.text, 4000)) throw new HttpError(400, 'Add a title and the reply text.'); const id = db.insert('support_saved_replies', { title: str(b.title, 60), text: str(b.text, 4000), created_by: req.user.id, created_at: db.now() }); return { ok: true, id }; });
  app.put('/api/admin/support/replies/:id', req => { const b = req.body || {}; db.run('UPDATE support_saved_replies SET title = ?, text = ? WHERE id = ?', str(b.title, 60), str(b.text, 4000), Number(req.params.id)); return { ok: true }; });
  app.del('/api/admin/support/replies/:id', req => { db.run('DELETE FROM support_saved_replies WHERE id = ?', Number(req.params.id)); return { ok: true }; });

  // Connects the Telegram support bot (token in SUPPORT_TG_BOT_TOKEN) to this server.
  app.post('/api/admin/support/telegram/connect', async req => {
    if (!['owner', 'admin'].includes(req.staff.role)) throw new HttpError(403, 'Only owners and admins can connect the support bot.');
    if (!config.support.tgToken) throw new HttpError(400, 'Add SUPPORT_TG_BOT_TOKEN to the server settings first (from @BotFather), then press Connect.');
    let me;
    try {
      me = await tg.call(config.support.tgToken, 'getMe');
      await tg.call(config.support.tgToken, 'setWebhook', { url: config.appUrl + '/webhooks/support-telegram', secret_token: tgSecret(), allowed_updates: ['message'] });
    } catch (e) { throw new HttpError(502, 'Telegram said: ' + e.message); }
    settings.set('support', { ...settings.get('support'), tg_username: me.username || '' });
    return { ok: true, username: me.username };
  });

  // ---------- customer help panel in the dashboard ----------
  const mine = req => db.all('SELECT * FROM support_tickets WHERE requester_user_id = ? ORDER BY last_message_at DESC LIMIT 20', req.user.id);
  const custView = t => ({ ref: t.ref, subject: t.subject, status: t.status, unread: t.customer_unread, last_text: t.last_text, last_message_at: t.last_message_at, created_at: t.created_at,
    messages: db.all("SELECT id, dir, author_name, text, created_at FROM support_messages WHERE ticket_id = ? AND dir IN ('in','out') ORDER BY id", t.id).map(m => ({ ...m, author_name: m.dir === 'out' ? String(m.author_name || 'Replyvoo team').split(' ')[0] : m.author_name })) });
  app.get('/api/app/support', req => {
    auth.needUser(req);
    const c = settings.get('support');
    return { tickets: mine(req).map(custView), on: c.help_button !== false, telegram: c.tg_username || '', email: settings.get('company').support_email };
  });
  app.post('/api/app/support', rateLimit('help-new', 12, 3600e3), req => {
    auth.needUser(req);
    const b = req.body || {};
    const topic = { billing: 'Billing', setup: 'Setup help', sales: 'Sales' }[b.topic];
    const box = topic ? db.one('SELECT id FROM support_boxes WHERE name = ? AND active = 1', topic) : null;
    const { ticket } = support.intake({ source: 'dashboard', text: b.text, subject: b.subject, name: req.user.name, email: req.user.email, userId: req.user.id, workspaceId: req.ws ? req.ws.id : null, boxId: box ? box.id : null, meta: { topic: b.topic || '', page: str(b.page, 80) } });
    return { ok: true, ticket: custView(ticket) };
  });
  app.post('/api/app/support/:ref/reply', rateLimit('help-reply', 60, 3600e3), req => {
    auth.needUser(req);
    const t = db.one('SELECT * FROM support_tickets WHERE ref = ? AND requester_user_id = ?', String(req.params.ref), req.user.id);
    if (!t) throw new HttpError(404, 'Ticket not found');
    const text = str((req.body || {}).text, 6000);
    if (!text) throw new HttpError(400, 'Write a message first.');
    support.addMessage(t, { dir: 'in', text, authorId: null, authorName: req.user.name, via: 'dashboard' });
    if (t.assignee_id && t.status === 'solved') support.notifyAssignee(t, t.assignee_id);
    return { ok: true, ticket: custView(db.one('SELECT * FROM support_tickets WHERE id = ?', t.id)) };
  });
  app.post('/api/app/support/:ref/seen', req => { auth.needUser(req); db.run('UPDATE support_tickets SET customer_unread = 0 WHERE ref = ? AND requester_user_id = ?', String(req.params.ref), req.user.id); return { ok: true }; });

  // ---------- Telegram support bot ----------
  app.post('/webhooks/support-telegram', (req, res) => {
    if (!config.support.tgToken || !safeEqual(req.headers['x-telegram-bot-api-secret-token'] || '', tgSecret())) throw new HttpError(403, 'Forbidden');
    res.json({ ok: true });
    const m = (req.body || {}).message;
    if (!m || !m.chat || m.chat.type !== 'private' || !m.from || m.from.is_bot) return;
    const text = String(m.text || m.caption || '').trim();
    const name = [m.from.first_name, m.from.last_name].filter(Boolean).join(' ');
    const send = msg => tg.sendText(config.support.tgToken, m.chat.id, msg).catch(e => console.warn('[support-tg]', e.message));
    if (/^\/start\b/.test(text)) { send('Hi ' + (m.from.first_name || 'there') + '! This is Replyvoo support. Send your question here and a real person from our team will reply in this chat.'); return; }
    if (!text) { send('Please type your question as a message (photos and voice notes can’t be read here yet).'); return; }
    try {
      const { ticket, created } = support.intake({ source: 'telegram', text, name, tgChatId: String(m.chat.id), tgUsername: m.from.username ? '@' + m.from.username : '' });
      if (created) send('Thanks! Your ticket ' + ticket.ref + ' is open. Someone from our team will reply right here.');
    } catch (e) { console.error('[support-tg]', e.message); }
  });

  // ---------- inbound email (Postmark, Resend, Mailgun, SendGrid or any JSON with from/subject/text) ----------
  app.post('/webhooks/support-email', rateLimit('support-email', 600, 3600e3), req => {
    if (!config.support.inboundKey || !safeEqual(String(req.query.key || ''), config.support.inboundKey)) throw new HttpError(403, 'Forbidden');
    const b = req.body || {};
    const fromRaw = String(b.FromFull && b.FromFull.Email ? b.FromFull.Email : b.from || b.From || b.sender || '');
    const email = (fromRaw.match(/[^\s<>"]+@[^\s<>"]+/) || [''])[0].toLowerCase();
    const name = String((b.FromFull && b.FromFull.Name) || b.FromName || (String(b.from || b.From || '').split('<')[0]) || '').replace(/"/g, '').trim();
    const subject = String(b.Subject || b.subject || '').slice(0, 200);
    const text = String(b.StrippedTextReply || b['stripped-text'] || b.TextBody || b.text || b.plain || b['body-plain'] || '').trim();
    if (!email || !text) throw new HttpError(400, 'Need a sender and a text body.');
    const ref = (subject.match(/\b(T-[0-9A-F]{6})\b/) || [])[1];
    const known = db.one('SELECT id FROM users WHERE email = ?', email);
    const { ticket, created } = support.intake({ source: 'email', text, subject: subject.replace(/^(re|fwd?):\s*/i, '').replace(/\[?T-[0-9A-F]{6}\]?/, '').trim(), name, email, userId: known ? known.id : null, meta: { ref } });
    return { ok: true, ref: ticket.ref, created };
  });
};
