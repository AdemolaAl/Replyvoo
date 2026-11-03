'use strict';
// The conversation engine: stores messages, scores leads, bills, asks the AI and replies.
const db = require('../db');
const ws = require('./workspace');
const ai = require('./ai');
const tg = require('./telegram');
const wa = require('./whatsapp');
const notify = require('./notify');
const settings = require('./settings');
const { decrypt } = require('../lib/security');

const busy = new Set();
// A customer who writes again while the Closer is still typing gets an answer to their latest message right after.
const again = new Map();

function loadCloser(id) {
  const c = db.one('SELECT * FROM closers WHERE id = ?', id);
  return c ? { ...c, persona: db.json(c.persona, {}), skills: db.json(c.skills, {}), rules: db.json(c.rules, {}), items: require('./training').loadItems(c.id, true) } : null;
}
// Website channels have no token: replies are only stored, and the widget fetches them.
function channelToken(channel) { return channel && channel.type !== 'website' ? decrypt(channel.token_enc) : ''; }
const isWeb = channel => channel && channel.type === 'website';
const isWa = channel => channel && channel.type === 'whatsapp';
// Joinvoo bridge: bots and managers' own Telegram accounts that stay connected to Joinvoo. Replies go out through Joinvoo's relay;
// Replyvoo never holds their token.
const isJv = channel => !!channel && (channel.type === 'joinvoo_bot' || channel.type === 'joinvoo_account');
const jv = () => require('./joinvoo');
const CH_NAME = { whatsapp: 'WhatsApp', website: 'the website chat', joinvoo_bot: 'Telegram (via Joinvoo)', joinvoo_account: 'Telegram (via Joinvoo)' };
const chName = channel => CH_NAME[channel && channel.type] || 'Telegram';
// "typing…" for the customer: Telegram's chat action, or WhatsApp's read receipt with a typing indicator.
function typing(channel, token, chatId, bc, wamid) {
  if (isJv(channel)) { jv().typing(channel, chatId); return; }
  if (!token) return;
  if (isWa(channel)) { if (wamid) wa.markRead(channel, token, wamid, true); return; }
  tg.typing(token, chatId, bc);
}

function upsertContact(wsId, channelId, ext) {
  const now = db.now();
  let c = db.one('SELECT * FROM contacts WHERE workspace_id = ? AND channel_id = ? AND external_id = ?', wsId, channelId, String(ext.id));
  if (!c) {
    const id = db.insert('contacts', { workspace_id: wsId, channel_id: channelId, external_id: String(ext.id), name: ext.name || '', username: ext.username || '', lang: ext.lang || '', last_seen: now, created_at: now });
    c = db.one('SELECT * FROM contacts WHERE id = ?', id);
  } else {
    db.update('contacts', c.id, { name: ext.name || c.name, username: ext.username || c.username, lang: ext.lang || c.lang, last_seen: now });
  }
  return c;
}

function upsertThread(wsId, channel, contact, chatId, bc = '') {
  let t = db.one('SELECT * FROM threads WHERE channel_id = ? AND chat_id = ? AND business_connection_id = ?', channel.id, String(chatId), bc);
  if (!t) {
    const id = db.insert('threads', { workspace_id: wsId, channel_id: channel.id, contact_id: contact.id, chat_id: String(chatId), business_connection_id: bc, closer_id: channel.closer_id, last_message_at: db.now(), created_at: db.now() });
    t = db.one('SELECT * FROM threads WHERE id = ?', id);
  }
  return t;
}

function addMessage(thread, dir, author, text, kind = 'text', meta = {}) {
  const now = db.now();
  // ext_id: the id of a message that came over from Joinvoo, so the same message is never stored twice.
  const { ext_id: extId, ...rest } = meta || {};
  const row = { workspace_id: thread.workspace_id, thread_id: thread.id, dir, author, kind, text: String(text || '').slice(0, 8000), meta: JSON.stringify(rest), created_at: now };
  if (extId) row.ext_id = String(extId).slice(0, 60);
  const id = db.insert('messages', row);
  const patch = { last_message_at: now, last_text: String(text || (kind === 'image' ? '[image]' : kind === 'voice' ? '[voice note]' : '')).slice(0, 200) };
  if (dir === 'in') { patch.last_customer_at = now; db.run('UPDATE threads SET unread = unread + 1 WHERE id = ?', thread.id); }
  db.update('threads', thread.id, patch);
  return id;
}

// What the Closer may remember about a customer: name, how often they've chatted, stage, value and team notes.
function memory(contactId) {
  const c = db.one('SELECT * FROM contacts WHERE id = ?', contactId);
  if (!c) return null;
  const chats = db.one('SELECT COALESCE(SUM(units), 0) n FROM threads WHERE contact_id = ?', c.id).n;
  const out = { name: c.name, chats, first_seen: c.created_at, stage: c.stage, heat: c.heat, value: c.value, notes: c.notes, lang: c.lang };
  // Came through Joinvoo: the ad that brought them and what they deposited (never their Telegram id or anything private).
  const x = db.json(c.ext_context, null);
  if (x) out.source = [x.ad || x.campaign ? 'came from the ad “' + (x.ad || x.campaign) + '”' + (x.platform ? ' on ' + x.platform : '') : '', x.deposits ? 'has deposited $' + x.deposits_usd.toFixed(2) + ' (' + x.deposits + ' deposit' + (x.deposits === 1 ? '' : 's') + ')' : x.signed_up_at ? 'signed up, no deposit yet' : ''].filter(Boolean).join('; ');
  return out;
}
// Typing time grows with the reply's length (about 30 characters a second), capped so customers never wait long.
const config = require('../config');
function typingMs(text, i) { if (config.env === 'test') return 0; return Math.min(i ? 2600 : 3200, 500 + String(text).length * 32); }
const pause = ms => new Promise(r => setTimeout(r, ms));

// Simple, transparent lead scoring.
const HOT = /\b(pay|paid|payment|buy|order|checkout|link|account number|transfer|deposit|send (me )?the link|i want (it|this|one)|how do i (pay|order|buy))\b/i;
const WARM = /\b(price|cost|how much|available|in stock|deliver|delivery|size|discount|offer|plan|details|interested)\b|\?/i;
function score(contact, text, kind, receipt) {
  const order = ['cold', 'warm', 'hot', 'won'];
  let heat = contact.heat; let stage = contact.stage;
  if (receipt) { heat = 'won'; stage = 'won'; }
  else if (HOT.test(text) || kind === 'image') { if (order.indexOf(heat) < 2) heat = 'hot'; if (['new', 'qualified'].includes(stage)) stage = 'checkout'; }
  else if (WARM.test(text)) { if (order.indexOf(heat) < 1) heat = 'warm'; if (stage === 'new') stage = 'qualified'; }
  if (heat !== contact.heat || stage !== contact.stage) {
    db.update('contacts', contact.id, { heat, stage });
    const voo = require('./voosquare');
    const chType = (db.one('SELECT type FROM channels WHERE id = ?', contact.channel_id) || {}).type;
    if (heat === 'hot' && contact.heat !== 'hot') { ws.event(contact.workspace_id, 'hot', (contact.name || 'A lead') + ' is now Hot', { contact_id: contact.id }); voo.safeEmit(contact.workspace_id, 'lead_qualified', { channel: chType, key: contact.id }); }
    if (stage === 'won' && contact.stage !== 'won') { ws.event(contact.workspace_id, 'won', (contact.name || 'A customer') + ' sent a payment screenshot', { contact_id: contact.id }); voo.safeEmit(contact.workspace_id, 'sale_closed', { channel: chType, valueUsd: contact.value, key: contact.id }); }
  }
  return { heat, stage };
}

function history(threadId) {
  return db.all('SELECT dir, author, text FROM messages WHERE thread_id = ? AND dir IN (\'in\',\'out\') ORDER BY id DESC LIMIT 14', threadId).reverse()
    .map(m => ({ role: m.dir === 'in' ? 'user' : 'assistant', text: m.text || '(attachment)' }));
}

// Handle one inbound customer message. Returns the reply text (or null).
// With detail: true it returns { text, id, created_at, handoff } instead (the website widget needs the stored reply).
// report (optional): filled with why no reply went out ('team', 'no_closer', 'no_credits', 'send_failed', 'error', …): the Joinvoo bridge
// uses it to hand the chat back to Joinvoo's Team inbox. fetchFile (optional): how to get a file when the channel has no token (Joinvoo).
async function handleInbound({ channel, chatId, bc = '', from, text = '', kind = 'text', images = [], voiceFile = null, voiceMime = 'audio/ogg', messageId = null, group = false, mentioned = true, meta = null, detail = false, replyOnly = false, noReply = false, report = null, fetchFile = null }) {
  const why = r => { if (report) report.reason = r; return null; };
  const w = ws.get(channel.workspace_id);
  if (!w || w.status !== 'active') return why('paused');
  const contact = upsertContact(w.id, channel.id, from);
  if (contact.blocked) return why('blocked');
  const thread = upsertThread(w.id, channel, contact, chatId, bc);
  const token = channelToken(channel);

  let content = text;
  if (!replyOnly && kind === 'voice' && voiceFile && settings.feature('voice')) {
    try {
      const f = fetchFile ? await fetchFile(voiceFile) : isWa(channel) ? await wa.downloadMedia(token, voiceFile, 10 * 1024 * 1024) : await tg.download(token, voiceFile, 10 * 1024 * 1024);
      const mime = isWa(channel) ? (f.mime || voiceMime) : 'audio/ogg';
      const tr = await ai.transcribe(f.buffer, /mpeg|mp3/.test(mime) ? 'voice.mp3' : /mp4|aac|m4a/.test(mime) ? 'voice.m4a' : 'voice.ogg', mime);
      if (tr) content = tr;
    } catch (e) { console.warn('[voice]', e.message); }
  }
  if (!replyOnly) addMessage(thread, 'in', 'customer', content || (kind === 'voice' ? '[voice note]' : ''), kind, { message_id: messageId, transcribed: kind === 'voice' && !!content, ...(meta || {}) });
  const scored = replyOnly ? { heat: contact.heat, stage: contact.stage } : score(contact, content, kind, false);

  if (group && !mentioned) return why('group');
  if (noReply) return why('no_reply'); // e.g. a WhatsApp reaction: stored and shown, nothing to answer
  const fresh = db.one('SELECT * FROM threads WHERE id = ?', thread.id);
  if (!fresh.ai_on || fresh.status === 'handoff') return why('team');
  const closerId = fresh.closer_id || channel.closer_id;
  const closer = closerId ? loadCloser(closerId) : null;
  if (!closer || !closer.active) return why('no_closer');
  if (!ws.closerUnlocked(closer)) return why('locked'); // over the plan's Closer limit: saved, but paused
  if (kind === 'voice' && !content) {
    const msg = 'Thanks for the voice note! Could you type your question so I can help you faster?';
    const r = await send(channel, token, fresh, msg, bc);
    if (!r.ok) { why('send_failed'); ws.event(w.id, 'error', 'A reply could not be delivered: ' + r.error.slice(0, 120), { thread_id: thread.id }); }
    return detail ? { text: msg, id: r.id, created_at: r.created_at, handoff: false } : msg;
  }
  if (busy.has(thread.id)) { if (!detail) again.set(thread.id, { channel, chatId, bc, from, text: content, kind: 'text', group, mentioned }); return why('busy'); }
  busy.add(thread.id);
  let charge = null;
  try {
    const pro = !!closer.pro_brain && settings.feature('pro_brain');
    charge = ws.chargeForReply(w.id, fresh, { pro });
    if (!charge.ok) { charge = null; notify.outOfCredits(w.id); ws.event(w.id, 'paused', 'A reply was skipped for ' + (contact.name || 'a customer') + ' because you are out of conversations and credits.', { thread_id: thread.id }); return why('no_credits'); }
    typing(channel, token, chatId, bc, messageId);
    const t0 = Date.now();
    // A follow-up written while the Closer was replying: its reply is already in the history, so answer the newer message on top of it.
    const out = await ai.reply({ closer, business: w.name, history: replyOnly ? history(thread.id) : history(thread.id).slice(0, -1), message: replyOnly ? '[The customer sent this while you were replying: "' + String(content).slice(0, 1500) + '". Answer it naturally without repeating what you just said.]' : content, images: closer.skills.vision === false ? [] : images, pro, channel: isWeb(channel) ? 'website' : isWa(channel) ? 'whatsapp' : 'telegram', customer: memory(contact.id) });
    if (out.receipt) score(db.one('SELECT * FROM contacts WHERE id = ?', contact.id), content, kind, true);
    // Like a person texting: a short typing pause, and two quick messages when the reply has two thoughts.
    const human = closer.persona.human !== false && (!!token || isJv(channel));
    const parts = human && out.parts ? out.parts : [out.text];
    let r = { ok: true }; let sent = 0; let first = null;
    // WhatsApp: suggested answers become reply buttons on the last message, and the PayLink becomes a "Pay now" button.
    const payLink = closer.pay_link && closer.skills.paylink !== false ? closer.pay_link : '';
    for (let i = 0; i < parts.length && r.ok; i++) {
      if (human) { if (i && isJv(channel)) typing(channel, token, chatId, bc); else if (i && !isWa(channel)) tg.typing(token, chatId, bc); await pause(Math.max(0, typingMs(parts[i], i) - (i ? 0 : Date.now() - t0))); }
      r = await send(channel, token, fresh, parts[i], bc, closer, { options: i === parts.length - 1 ? out.options : null, payLink });
      if (r.ok) { sent++; if (!first) first = r; }
    }
    // Part of a two-message reply got through: the customer has an answer, so it counts as delivered.
    if (!r.ok && sent) { ws.event(w.id, 'error', 'Part of a reply could not be delivered: ' + r.error.slice(0, 120), { thread_id: thread.id }); r = first; }
    if (!r.ok) {
      // Nothing reached the customer: give the conversation back and tell the team.
      ws.refundCharge(w.id, charge); charge = null;
      ws.event(w.id, 'error', 'A reply could not be delivered on ' + chName(channel) + ': ' + r.error.slice(0, 120), { thread_id: thread.id });
      return why('send_failed');
    }
    const newChat = !!charge.newUnit;
    charge = null;
    ws.commitReply(thread.id);
    const voo = require('./voosquare');
    if (newChat) voo.safeEmit(w.id, 'chat_answered', { channel: channel.type });
    if (closer.pay_link && out.text.includes(closer.pay_link)) voo.safeEmit(w.id, 'payment_link_sent', { channel: channel.type, key: thread.id });
    db.run('UPDATE closers SET replies = replies + 1 WHERE id = ?', closer.id);
    if (out.handoff && closer.skills.handoff !== false) {
      db.update('threads', thread.id, { status: 'handoff' });
      addMessage(fresh, 'note', 'system', closer.name + ' handed this chat to your team');
      ws.event(w.id, 'handoff', (contact.name || 'A customer') + ' needs a human', { thread_id: thread.id });
      notify.handoff(w.id, fresh, contact, closer.name, content);
    } else {
      ws.event(w.id, 'reply', closer.name + ' replied to ' + (contact.name || 'a customer'), { thread_id: thread.id, closer_id: closer.id, heat: scored.heat });
    }
    if (detail) return { text: out.text, id: r.id, created_at: r.created_at, handoff: !!(out.handoff && closer.skills.handoff !== false) };
    return out.text;
  } catch (e) {
    console.error('[engine]', e.message);
    if (charge) { try { ws.refundCharge(w.id, charge); } catch (e2) { console.error('[engine] refund', e2.message); } }
    ws.event(w.id, 'error', 'A reply failed: ' + String(e.message).slice(0, 120), { thread_id: thread.id });
    return why('error');
  } finally {
    busy.delete(thread.id);
    const nx = again.get(thread.id);
    if (nx) { again.delete(thread.id); setImmediate(() => handleInbound({ ...nx, replyOnly: true }).catch(e => console.error('[engine] follow-up', e.message))); }
  }
}

// Sends a reply and stores it. Never throws on a Telegram or WhatsApp failure: the message is kept (marked failed)
// so the team can see what the Closer tried to say.
async function send(channel, token, thread, text, bc, closer, extra = {}) {
  if (!text) return { ok: true };
  let sent = null; let error = ''; let shape = ''; let buttons = null;
  if (isJv(channel)) {
    // Through Joinvoo (Telegram): the PayLink becomes a tap-to-open button, suggested answers become buttons that come back as a press.
    if (extra.payLink && text.includes(extra.payLink)) { buttons = [[{ text: 'Open payment link', url: extra.payLink }]]; shape = 'paylink'; }
    else if (Array.isArray(extra.options) && extra.options.length >= 2) { buttons = extra.options.slice(0, 6).map((o, i) => [{ text: String(o).slice(0, 60), data: 'opt_' + i }]); shape = 'buttons'; }
    try { sent = await jv().relay(channel, thread.chat_id, { kind: 'text', text: String(text).slice(0, 4000), buttons: buttons || undefined, by: closer ? 'ai' : 'system', by_name: closer ? closer.name : 'Replyvoo' }); }
    catch (e) { error = String(e.message || 'Joinvoo did not send it'); if (e.code === 'blocked') db.run('UPDATE contacts SET blocked = 1 WHERE id = ?', thread.contact_id); }
  } else if (token && isWa(channel)) {
    try {
      // Outside the 24-hour customer service window only approved templates may be sent (Meta's rule).
      if (!wa.windowOpen(thread)) throw Object.assign(new Error('The 24-hour reply window has closed. Only approved templates can be sent now.'), { code: 'window_closed' });
      let msg = wa.textMsg(text);
      if (extra.payLink && text.includes(extra.payLink) && text.length <= 1024) { msg = wa.payMsg(text, extra.payLink); shape = 'paylink'; }
      else if (Array.isArray(extra.options) && extra.options.length >= 2 && text.length <= 1024) { msg = wa.optionsMsg(text, extra.options); shape = extra.options.length <= 3 ? 'buttons' : 'list'; }
      sent = await wa.sendRaw(channel, token, thread.chat_id, msg);
    } catch (e) { error = String(e.message || 'WhatsApp error'); }
  } else if (token) {
    try { sent = await tg.sendText(token, thread.chat_id, text, { business_connection_id: bc || undefined }); }
    catch (e) {
      error = String(e.message || 'Telegram error');
      if (e.code === 403) db.run('UPDATE contacts SET blocked = 1 WHERE id = ?', thread.contact_id);
    }
  }
  const meta = { message_id: sent && sent.message_id, closer_id: closer && closer.id };
  if (shape) { meta.interactive = shape; if (shape !== 'paylink') meta.options = extra.options.slice(0, 10); }
  if (buttons) meta.buttons = buttons;
  if (error) { meta.failed = true; meta.error = error.slice(0, 200); }
  const id = addMessage(thread, 'out', closer ? 'ai' : 'system', text, 'text', meta);
  if (isWa(channel) && sent && sent.message_id) wa.track(sent.message_id, channel.id, id);
  return error ? { ok: false, error, id } : { ok: true, id, created_at: db.now() };
}

// Human reply from the inbox. Takes over the chat from the AI.
// file (chats through Joinvoo only): { data (base64), mime, name, kind: photo|voice|video|document }. buttons: [[{ text, url }]].
async function humanReply(thread, user, text, { file = null, buttons = null } = {}) {
  const channel = db.one('SELECT * FROM channels WHERE id = ?', thread.channel_id);
  const token = channel ? channelToken(channel) : '';
  let sent = null;
  if (isJv(channel)) {
    try { sent = await jv().relay(channel, thread.chat_id, { kind: file ? file.kind : 'text', text, file: file ? { data: file.data, mime: file.mime, name: file.name } : undefined, buttons: buttons || undefined, by: 'human', by_name: user.name }); }
    catch (e) { if (e.code === 'blocked') db.run('UPDATE contacts SET blocked = 1 WHERE id = ?', thread.contact_id); throw e; }
    const kind = file ? (file.kind === 'photo' ? 'image' : file.kind === 'voice' ? 'voice' : 'other') : 'text';
    const meta = { user_id: user.id, user_name: user.name, message_id: sent && sent.message_id };
    if (file) meta.media = { kind: file.kind, name: file.name || '', jv_file: sent && sent.file_id ? String(sent.file_id).slice(0, 300) : undefined };
    if (buttons) meta.buttons = buttons;
    addMessage(thread, 'out', 'human', text || (file ? (file.kind === 'photo' ? '[image]' : file.kind === 'voice' ? '[voice note]' : '[file: ' + (file.name || 'file') + ']') : ''), kind, meta);
    db.update('threads', thread.id, { ai_on: 0, unread: 0 });
    return;
  }
  if (file) throw new Error('Files can only be sent on chats that come through Joinvoo.');
  if (token && isWa(channel)) {
    const { HttpError } = require('../lib/http');
    if (!wa.windowOpen(thread)) throw new HttpError(409, 'The free reply window has closed (24 hours after the customer’s last message). Send an approved template instead.', { code: 'window_closed' });
    const last = db.one('SELECT meta FROM messages WHERE thread_id = ? AND dir = \'in\' ORDER BY id DESC LIMIT 1', thread.id);
    const lastId = last && db.json(last.meta, {}).message_id;
    if (lastId) wa.markRead(channel, token, lastId);
    sent = await wa.sendRaw(channel, token, thread.chat_id, wa.textMsg(text));
  } else if (token) sent = await tg.sendText(token, thread.chat_id, text, { business_connection_id: thread.business_connection_id || undefined });
  const id = addMessage(thread, 'out', 'human', text, 'text', { user_id: user.id, user_name: user.name, message_id: sent && sent.message_id });
  if (isWa(channel) && sent && sent.message_id) wa.track(sent.message_id, channel.id, id);
  db.update('threads', thread.id, { ai_on: 0, unread: 0 });
}

module.exports = { memory, typingMs, handleInbound, humanReply, addMessage, upsertContact, upsertThread, loadCloser, channelToken, score, history, send, chName };
