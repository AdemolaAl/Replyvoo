'use strict';
// Replyvoo's own support desk: tickets from the website chat, the Telegram support bot, the dashboard help button,
// the contact form and inbound email. Tickets live in boxes; staff work only the boxes they were given.
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');
const settings = require('./settings');
const staffSvc = require('./staff');
const { HttpError } = require('../lib/http');

const SOURCES = { web_chat: 'Website chat', telegram: 'Telegram', dashboard: 'Dashboard help', contact: 'Contact form', sales: 'Sales form', email: 'Email', voosquare: 'VooSquare' };
const STATUSES = ['open', 'pending', 'solved'];
const PRIORITIES = ['normal', 'high', 'urgent'];
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const first = n => String(n || '').trim().split(' ')[0] || 'there';
const newRef = () => 'T-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);

const cfg = () => settings.get('support');
const boxes = (all = false) => db.all('SELECT * FROM support_boxes' + (all ? '' : ' WHERE active = 1') + ' ORDER BY sort, id');
function boxFor(source) {
  const id = Number((cfg().routing || {})[source]);
  const b = id ? db.one('SELECT id FROM support_boxes WHERE id = ? AND active = 1', id) : null;
  return b ? b.id : ((boxes()[0] || {}).id || null);
}

// Least busy active staff member who works this box and can reply on the desk.
function pickAssignee(boxId) {
  const rows = db.all("SELECT s.* FROM staff s JOIN users u ON u.id = s.user_id WHERE s.status = 'active' AND u.suspended = 0");
  const ok = rows.map(r => ({ r, st: staffSvc.get(r.user_id) })).filter(x => x.st && staffSvc.can(x.st, 'support', 'edit') && staffSvc.canBox(x.st, boxId) && x.st.role !== 'owner');
  if (!ok.length) return null;
  const load = id => db.one("SELECT COUNT(*) n FROM support_tickets WHERE assignee_id = ? AND status != 'solved'", id).n;
  // Support agents first, then admins; within that the least busy, then whoever was online most recently.
  const rank = x => (x.st.role === 'support' ? 0 : 1);
  ok.sort((a, b) => rank(a) - rank(b) || load(a.r.user_id) - load(b.r.user_id) || String(b.r.last_seen || '').localeCompare(String(a.r.last_seen || '')));
  return ok[0].r.user_id;
}

function addMessage(ticket, { dir, text, authorId = null, authorName = '', via = '', failed = false }) {
  const now = db.now();
  const id = db.insert('support_messages', { ticket_id: ticket.id, dir, author_id: authorId, author_name: clip(authorName, 80), text: clip(text, 8000), via, failed: failed ? 1 : 0, created_at: now });
  if (dir === 'in') db.run("UPDATE support_tickets SET last_text = ?, last_message_at = ?, unread = unread + 1, status = CASE WHEN status = 'solved' THEN 'open' ELSE status END, solved_at = CASE WHEN status = 'solved' THEN NULL ELSE solved_at END WHERE id = ?", clip(text, 200), now, ticket.id);
  else if (dir === 'out') db.run('UPDATE support_tickets SET last_text = ?, last_message_at = ?, customer_unread = customer_unread + 1 WHERE id = ?', clip(text, 200), now, ticket.id);
  return id;
}

// Opens a ticket, or adds to the customer's open one from the same place.
function intake({ source, text, subject = '', name = '', email = '', userId = null, workspaceId = null, tgChatId = '', tgUsername = '', boxId = null, priority = 'normal', meta = {} }) {
  if (!SOURCES[source]) throw new HttpError(400, 'Unknown source');
  const body = clip(text, 8000);
  if (!body) throw new HttpError(400, 'Write a message first.');
  email = clip(email, 200).toLowerCase();
  let t = null;
  const recent = new Date(Date.now() - 14 * 864e5).toISOString();
  if (tgChatId) t = db.one('SELECT * FROM support_tickets WHERE tg_chat_id = ? AND source = ? AND last_message_at > ? ORDER BY id DESC LIMIT 1', String(tgChatId), source, recent);
  // Email replies thread into a ticket only when they come from that ticket's own requester.
  else if (source === 'email' && meta.ref && email) t = db.one('SELECT * FROM support_tickets WHERE ref = ? AND requester_email = ?', meta.ref, email);
  if (t) { addMessage(t, { dir: 'in', text: body, authorName: name || t.requester_name, via: source }); require('./voosquare').supportForward(t, { text: body, name, email }); return { ticket: db.one('SELECT * FROM support_tickets WHERE id = ?', t.id), created: false }; }
  const box = boxId && db.one('SELECT id FROM support_boxes WHERE id = ? AND active = 1', Number(boxId)) ? Number(boxId) : boxFor(source);
  const assignee = cfg().auto_assign !== false ? pickAssignee(box) : null;
  let ref; do { ref = newRef(); } while (db.one('SELECT id FROM support_tickets WHERE ref = ?', ref));
  const now = db.now();
  const id = db.insert('support_tickets', {
    ref, box_id: box, source, subject: clip(subject, 140) || clip(body.split('\n')[0], 80), status: 'open', priority: PRIORITIES.includes(priority) ? priority : 'normal', assignee_id: assignee,
    requester_name: clip(name, 80), requester_email: email, requester_user_id: userId, workspace_id: workspaceId, tg_chat_id: String(tgChatId || ''), tg_username: clip(tgUsername, 64),
    last_text: clip(body, 200), last_message_at: now, created_at: now, meta: JSON.stringify(meta)
  });
  t = db.one('SELECT * FROM support_tickets WHERE id = ?', id);
  addMessage(t, { dir: 'in', text: body, authorName: name, via: source });
  db.run('UPDATE support_tickets SET unread = 1 WHERE id = ?', id);
  if (assignee) notifyAssignee(t, assignee);
  // A copy goes to VooSquare HQ (the Zedapex team's one inbox); replies written there come back on /hooks/voosquare/support.
  require('./voosquare').supportForward(t, { text: body, name, email });
  return { ticket: db.one('SELECT * FROM support_tickets WHERE id = ?', id), created: true };
}

function notifyAssignee(t, userId) {
  if (cfg().email_staff === false) return;
  const u = db.one('SELECT email, name FROM users WHERE id = ?', userId);
  if (u) require('./mailer').send(u.email, 'support-assigned', { name: first(u.name), ref: t.ref, subject: t.subject || 'New ticket', from_name: t.requester_name || t.requester_email || 'A customer', source: SOURCES[t.source], snippet: clip(t.last_text, 160), ticket_url: config.appUrl + '/admin/support/' + t.ref });
}

// A staff reply goes back the way the customer came in.
async function reply(ticket, actor, text, { note = false } = {}) {
  const body = clip(text, 6000);
  if (!body) throw new HttpError(400, 'Write a reply first.');
  const nm = actor.name || 'Replyvoo team';
  if (note) { addMessage(ticket, { dir: 'note', text: body, authorId: actor.id, authorName: nm, via: 'note' }); return { ok: true, delivered: true }; }
  let via = ticket.source; let failed = false; let error = '';
  if (ticket.source === 'telegram' && ticket.tg_chat_id) {
    const token = config.support.tgToken;
    if (!token) { failed = true; error = 'The support Telegram bot is not connected (SUPPORT_TG_BOT_TOKEN).'; }
    else { try { await require('./telegram').sendText(token, ticket.tg_chat_id, body); } catch (e) { failed = true; error = 'Telegram: ' + e.message; } }
  } else if (ticket.requester_email) {
    // Dashboard tickets show the reply in the Help panel and also get an email, so customers don't miss it.
    via = ticket.source === 'dashboard' ? 'dashboard' : 'email';
    const ok = await require('./mailer').send(ticket.requester_email, 'support-reply', { name: first(ticket.requester_name), agent_name: first(nm), ref: ticket.ref, subject: ticket.subject || 'Your question', reply_html: htmlText(body), dashboard_url: config.appUrl + '/app?help=1' }, { replyTo: config.support.replyTo || undefined });
    if (!ok && via === 'email') { failed = true; error = 'The email could not be sent. Check the email provider settings.'; }
  } else via = 'dashboard';
  addMessage(ticket, { dir: 'out', text: body, authorId: actor.id, authorName: nm, via, failed });
  if (ticket.status === 'open') db.run("UPDATE support_tickets SET status = 'pending' WHERE id = ?", ticket.id);
  if (!ticket.assignee_id && actor.id) db.run('UPDATE support_tickets SET assignee_id = ? WHERE id = ?', actor.id, ticket.id);
  return { ok: !failed, delivered: !failed, via, error };
}
const htmlText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

function update(ticket, actor, b) {
  const patch = {};
  if (b.status && STATUSES.includes(b.status)) { patch.status = b.status; patch.solved_at = b.status === 'solved' ? db.now() : null; }
  if (b.priority && PRIORITIES.includes(b.priority)) patch.priority = b.priority;
  if (b.box_id != null) { const bx = db.one('SELECT id FROM support_boxes WHERE id = ?', Number(b.box_id)); if (!bx) throw new HttpError(400, 'Unknown box'); patch.box_id = bx.id; }
  if (b.assignee_id !== undefined) {
    if (b.assignee_id === null || b.assignee_id === '' || b.assignee_id === 0) patch.assignee_id = null;
    else { const st = staffSvc.get(Number(b.assignee_id)); if (!st || !staffSvc.can(st, 'support', 'edit')) throw new HttpError(400, 'That person can’t work on the support desk.'); patch.assignee_id = Number(b.assignee_id); }
  }
  if (b.subject != null) patch.subject = clip(b.subject, 140);
  if (!Object.keys(patch).length) return ticket;
  db.update('support_tickets', ticket.id, patch);
  const nm = actor.name || 'Replyvoo team';
  const sys = [];
  if (patch.status && patch.status !== ticket.status) sys.push(nm + ' marked this ' + patch.status);
  if (patch.assignee_id !== undefined && patch.assignee_id !== ticket.assignee_id) { const a = patch.assignee_id ? db.one('SELECT name, email FROM users WHERE id = ?', patch.assignee_id) : null; sys.push(a ? nm + ' assigned this to ' + (a.name || a.email) : nm + ' unassigned this'); if (patch.assignee_id && patch.assignee_id !== actor.id) notifyAssignee({ ...ticket, ...patch }, patch.assignee_id); }
  if (patch.box_id && patch.box_id !== ticket.box_id) { const bx = db.one('SELECT name FROM support_boxes WHERE id = ?', patch.box_id); sys.push(nm + ' moved this to ' + bx.name); }
  if (patch.priority && patch.priority !== ticket.priority) sys.push(nm + ' set priority to ' + patch.priority);
  for (const s of sys) addMessage(ticket, { dir: 'system', text: s, authorId: actor.id, authorName: nm });
  const fresh = db.one('SELECT * FROM support_tickets WHERE id = ?', ticket.id);
  return fresh;
}

function ticketOut(t, withMsgs = false) {
  if (!t) return null;
  const a = t.assignee_id ? db.one('SELECT u.id, u.name, u.email, u.voo_id FROM users u WHERE u.id = ?', t.assignee_id) : null;
  const bx = t.box_id ? db.one('SELECT id, name, color FROM support_boxes WHERE id = ?', t.box_id) : null;
  const w = t.workspace_id ? db.one('SELECT id, name, plan_id FROM workspaces WHERE id = ?', t.workspace_id) : null;
  const out = { id: t.id, ref: t.ref, subject: t.subject, status: t.status, priority: t.priority, source: t.source, source_name: SOURCES[t.source], box: bx, assignee: a ? { id: a.id, name: a.name || a.email, email: a.email, voo_id: a.voo_id || null } : null,
    requester: { name: t.requester_name, email: t.requester_email, user_id: t.requester_user_id, telegram: t.tg_username || (t.tg_chat_id ? 'chat ' + t.tg_chat_id : '') }, workspace: w, unread: t.unread, last_text: t.last_text, last_message_at: t.last_message_at, created_at: t.created_at, solved_at: t.solved_at };
  if (withMsgs) out.messages = db.all('SELECT id, dir, author_id, author_name, text, via, failed, created_at FROM support_messages WHERE ticket_id = ? ORDER BY id', t.id);
  return out;
}

// Ticket list for a staff member: only boxes they work in.
function list(st, { status = 'active', box = '', mine = false, q = '', userId = null, limit = 60, before = '' } = {}) {
  const where = []; const args = [];
  if (status === 'active') where.push("status != 'solved'"); else if (STATUSES.includes(status)) { where.push('status = ?'); args.push(status); }
  const allowed = staffSvc.boxFilter(st);
  if (allowed) { where.push('(box_id IN (' + (allowed.length ? allowed.map(() => '?').join(',') : 'NULL') + ')' + (userId ? ' OR assignee_id = ?' : '') + ')'); args.push(...allowed); if (userId) args.push(userId); }
  if (box === 'none') where.push('box_id IS NULL'); else if (box) { where.push('box_id = ?'); args.push(Number(box)); }
  if (mine && userId) { where.push('assignee_id = ?'); args.push(userId); }
  if (mine === 'unassigned') where.push('assignee_id IS NULL');
  if (q) { where.push('(ref LIKE ? OR subject LIKE ? OR requester_name LIKE ? OR requester_email LIKE ? OR last_text LIKE ?)'); const l = '%' + clip(q, 80) + '%'; args.push(l, l, l, l, l); }
  if (before) { where.push('last_message_at < ?'); args.push(before); }
  const sql = 'SELECT * FROM support_tickets' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, last_message_at DESC LIMIT ?";
  return db.all(sql, ...args, Math.min(200, Number(limit) || 60)).map(t => ticketOut(t));
}

function counts(st, userId) {
  const allowed = staffSvc.boxFilter(st);
  const ids = allowed ? allowed.filter(n => Number.isInteger(n)) : null;
  const scope = ids ? ' AND (box_id IN (' + (ids.length ? ids.map(() => '?').join(',') : 'NULL') + ') OR assignee_id = ?)' : '';
  const sargs = ids ? [...ids, Number(userId)] : [];
  const n = (sql, ...a) => db.one('SELECT COUNT(*) n FROM support_tickets WHERE ' + sql + scope, ...a, ...sargs).n;
  const byBox = db.all("SELECT box_id, COUNT(*) n, SUM(unread > 0) u FROM support_tickets WHERE status != 'solved'" + scope + ' GROUP BY box_id', ...sargs);
  return { open: n("status = 'open'"), pending: n("status = 'pending'"), unread: n("status != 'solved' AND unread > 0"), mine: n("status != 'solved' AND assignee_id = ?", Number(userId)), unassigned: n("status != 'solved' AND assignee_id IS NULL"), boxes: byBox };
}

function getForStaff(st, ref) {
  const t = db.one('SELECT * FROM support_tickets WHERE ref = ? OR id = ?', String(ref), Number(ref) || -1);
  if (!t) throw new HttpError(404, 'Ticket not found');
  if (!staffSvc.canBox(st, t.box_id) && t.assignee_id !== st.user_id) throw new HttpError(403, 'This ticket is in a box you don’t have access to.');
  return t;
}

const fill = (text, t) => String(text == null ? '' : text).replace(/\{\{\s*name\s*\}\}/g, first(t.requester_name));

module.exports = { SOURCES, STATUSES, PRIORITIES, boxes, boxFor, intake, reply, update, addMessage, ticketOut, list, counts, getForStaff, pickAssignee, fill, notifyAssignee };
