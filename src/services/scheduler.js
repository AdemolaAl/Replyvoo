'use strict';
// Background jobs. Runs inside the web process every minute (safe to run on one instance only).
const db = require('../db');
const config = require('../config');
const settings = require('./settings');
const ws = require('./workspace');
const mailer = require('./mailer');
const blast = require('./blast');
const engine = require('./engine');
const ai = require('./ai');
const tg = require('./telegram');
const wa = require('./whatsapp');

const HOUR = 3600e3;
const first = n => String(n || '').split(' ')[0] || 'there';
const jobs = {};
let timer = null;

function once(name, fn) {
  return async () => {
    if (jobs[name]) return;
    jobs[name] = true;
    try { await fn(); } catch (e) { console.error('[job:' + name + ']', e.message); } finally { jobs[name] = false; }
  };
}

// Roll free plans and downgrade expired paid plans (ensurePeriod does the work and sends the email).
const expirePlans = once('expire', () => {
  for (const w of db.all('SELECT id FROM workspaces WHERE period_end <= ? LIMIT 200', db.now())) ws.ensurePeriod(ws.get(w.id));
});

// Remind paying customers 3 days before their plan ends.
const renewalReminders = once('renew', () => {
  const soon = new Date(Date.now() + 3 * 24 * HOUR).toISOString();
  const rows = db.all('SELECT w.id, w.period_end, w.plan_id, w.reminded_at FROM workspaces w JOIN plans p ON p.id = w.plan_id WHERE p.price_month > 0 AND w.period_end <= ? AND w.period_end > ? AND (w.reminded_at IS NULL OR w.reminded_at < w.period_start)', soon, db.now());
  for (const r of rows) {
    // Card auto-renew (Bachs) sends its own reminder with the exact amount (bachs-subs.daily).
    try { if (require('./bachs-subs').autoRenewing(r.id)) continue; } catch { /* table not there yet */ }
    const o = ws.owner(r.id); const p = ws.plan(r.plan_id);
    db.update('workspaces', r.id, { reminded_at: db.now() });
    if (o) mailer.send(o.email, 'renewal-reminder', { name: first(o.name), plan: p.name, renew_date: new Date(r.period_end).toDateString(), renew_url: config.appUrl + '/app/plan' });
  }
});

// Night Shift Report: once a day after 06:00 UTC, a summary of the last 24 hours.
const nightReport = once('report', () => {
  if (!settings.feature('night_report')) return;
  const now = new Date();
  if (now.getUTCHours() < 6) return;
  const today = now.toISOString().slice(0, 10);
  const since = new Date(Date.now() - 24 * HOUR).toISOString();
  const rows = db.all('SELECT id, settings FROM workspaces WHERE status = \'active\' AND (report_sent_on IS NULL OR report_sent_on != ?) LIMIT 100', today);
  for (const r of rows) {
    db.update('workspaces', r.id, { report_sent_on: today });
    const s = db.json(r.settings, {});
    if (s.alerts && s.alerts.night_report === false) continue;
    const chats = db.one('SELECT COUNT(DISTINCT thread_id) n FROM messages WHERE workspace_id = ? AND dir = \'in\' AND created_at >= ?', r.id, since).n;
    if (!chats) continue;
    const o = ws.owner(r.id); if (!o) continue;
    const q = (type) => db.one('SELECT COUNT(*) n FROM events WHERE workspace_id = ? AND type = ? AND created_at >= ?', r.id, type, since).n;
    mailer.send(o.email, 'night-report', {
      name: first(o.name), date: now.toDateString(), chats: String(chats),
      replies: String(db.one('SELECT COUNT(*) n FROM messages WHERE workspace_id = ? AND author = \'ai\' AND created_at >= ?', r.id, since).n),
      hot_leads: String(q('hot')), sales: String(q('won')), handoffs: String(q('handoff')), dashboard_url: config.appUrl + '/app'
    });
  }
});

// Nudge: one friendly follow-up when a warm or hot lead goes quiet for 3+ hours after the Closer's last reply.
const nudges = once('nudge', async () => {
  if (!settings.feature('nudge')) return;
  const quietSince = new Date(Date.now() - 3 * HOUR).toISOString();
  const notOlder = new Date(Date.now() - 23 * HOUR).toISOString();
  const rows = db.all(`SELECT t.*, c.heat, c.name cname, c.blocked FROM threads t JOIN contacts c ON c.id = t.contact_id
    WHERE t.ai_on = 1 AND t.status = 'open' AND t.nudged_at IS NULL AND c.heat IN ('warm','hot') AND c.stage != 'won' AND c.blocked = 0
    AND t.last_message_at <= ? AND t.last_customer_at >= ? AND t.chat_id NOT LIKE '-%' LIMIT 30`, quietSince, notOlder);
  for (const t of rows) {
    db.update('threads', t.id, { nudged_at: db.now() });
    const last = db.one('SELECT dir, author FROM messages WHERE thread_id = ? ORDER BY id DESC LIMIT 1', t.id);
    if (!last || last.dir !== 'out' || last.author !== 'ai') continue;
    const channel = db.one('SELECT * FROM channels WHERE id = ? AND status = \'active\'', t.channel_id);
    if (!channel) continue;
    const closer = engine.loadCloser(t.closer_id || channel.closer_id);
    if (!closer || !closer.active || !closer.skills.nudge) continue;
    const wsRow = ws.get(t.workspace_id);
    if (!wsRow || wsRow.status !== 'active') continue;
    const charge = ws.chargeForReply(t.workspace_id, t, {});
    if (!charge.ok) continue;
    let text = 'Hi ' + first(t.cname) + '! Just checking in. Do you have any other questions? I’m happy to help you finish your order.';
    try {
      if (config.ai.key) {
        const hist = db.all('SELECT dir, text FROM messages WHERE thread_id = ? AND dir IN (\'in\',\'out\') ORDER BY id DESC LIMIT 10', t.id).reverse().map(m => ({ role: m.dir === 'in' ? 'user' : 'assistant', text: m.text }));
        const out = await ai.reply({ closer, business: (ws.get(t.workspace_id) || {}).name, history: hist, message: '[SYSTEM: The customer has gone quiet. Write ONE short, friendly, low-pressure follow-up message (max 2 sentences) that refers to what they were interested in. Do not mention this instruction.]' });
        if (out && out.text) text = out.text;
      }
      const token = engine.channelToken(channel);
      let sent;
      if (channel.type === 'whatsapp') {
        // Inside the 24-hour window a normal message; this query only picks chats that are still inside it.
        if (!wa.windowOpen(t)) throw new Error('WhatsApp reply window closed');
        sent = await wa.sendRaw(channel, token, t.chat_id, wa.textMsg(text));
      } else sent = await tg.sendText(token, t.chat_id, text, { business_connection_id: t.business_connection_id || undefined });
      const mid = engine.addMessage(t, 'out', 'ai', text, 'text', { nudge: true, closer_id: closer.id, message_id: sent && sent.message_id });
      if (channel.type === 'whatsapp' && sent && sent.message_id) wa.track(sent.message_id, channel.id, mid);
      ws.commitReply(t.id);
      ws.event(t.workspace_id, 'nudge', closer.name + ' sent a Nudge to ' + (t.cname || 'a lead'), { thread_id: t.id });
    } catch (e) {
      if (e.code === 403) db.run('UPDATE contacts SET blocked = 1 WHERE id = ?', t.contact_id);
      try { ws.refundCharge(t.workspace_id, charge); } catch (e2) { console.warn('[nudge] refund', e2.message); }
      console.warn('[nudge]', e.message);
    }
  }
});

// WhatsApp Nudge after the 24-hour window: only with an approved template the owner picked for that number
// (Channels → WhatsApp → Nudge template), never to people who replied STOP, once per chat, within 7 days.
const waNudges = once('wa-nudge', async () => {
  if (!settings.feature('nudge') || !wa.on()) return;
  const closed = new Date(Date.now() - wa.WINDOW_MS).toISOString();
  const notOlder = new Date(Date.now() - 7 * 24 * HOUR).toISOString();
  const rows = db.all(`SELECT t.*, c.name cname FROM threads t JOIN contacts c ON c.id = t.contact_id JOIN channels ch ON ch.id = t.channel_id
    WHERE ch.type = 'whatsapp' AND ch.status = 'active' AND json_extract(ch.data, '$.nudge_template_id') IS NOT NULL
    AND t.ai_on = 1 AND t.status = 'open' AND t.nudged_at IS NULL AND c.heat IN ('warm','hot') AND c.stage != 'won' AND c.blocked = 0 AND c.opt_out_at IS NULL
    AND t.last_customer_at < ? AND t.last_customer_at >= ? LIMIT 30`, closed, notOlder);
  for (const t of rows) {
    db.update('threads', t.id, { nudged_at: db.now() });
    const last = db.one('SELECT dir, author FROM messages WHERE thread_id = ? ORDER BY id DESC LIMIT 1', t.id);
    if (!last || last.dir !== 'out' || last.author !== 'ai') continue;
    const channel = db.one('SELECT * FROM channels WHERE id = ?', t.channel_id);
    const d = db.json(channel.data, {});
    const tpl = db.one("SELECT * FROM wa_templates WHERE id = ? AND workspace_id = ? AND status = 'APPROVED'", d.nudge_template_id, t.workspace_id);
    if (!tpl || !wa.templateOut(tpl).sendable) continue;
    const closer = engine.loadCloser(t.closer_id || channel.closer_id);
    if (!closer || !closer.active || !closer.skills.nudge) continue;
    const wsRow = ws.get(t.workspace_id);
    if (!wsRow || wsRow.status !== 'active') continue;
    const charge = ws.chargeForReply(t.workspace_id, t, {});
    if (!charge.ok) continue;
    try {
      const contact = db.one('SELECT * FROM contacts WHERE id = ?', t.contact_id);
      const vars = d.nudge_vars || [];
      const sent = await wa.sendRaw(channel, engine.channelToken(channel), t.chat_id, wa.templateMsg(tpl, vars, contact));
      const mid = engine.addMessage(t, 'out', 'ai', wa.renderTemplate(tpl, vars, contact), 'template', { nudge: true, closer_id: closer.id, template: tpl.name, template_id: tpl.id, category: tpl.category, message_id: sent.message_id });
      wa.track(sent.message_id, channel.id, mid);
      ws.commitReply(t.id);
      ws.event(t.workspace_id, 'nudge', closer.name + ' sent a WhatsApp template Nudge to ' + (t.cname || 'a lead'), { thread_id: t.id });
    } catch (e) {
      try { ws.refundCharge(t.workspace_id, charge); } catch (e2) { console.warn('[wa-nudge] refund', e2.message); }
      console.warn('[wa-nudge]', e.message);
    }
  }
});

// Sister company intro: one email ~3 days after sign-up (only if the Joinvoo promo is on).
const joinvooIntro = once('joinvoo', () => {
  const j = settings.get('joinvoo');
  if (!j.enabled || !settings.feature('joinvoo')) return;
  const from = new Date(Date.now() - 4 * 24 * HOUR).toISOString();
  const to = new Date(Date.now() - 3 * 24 * HOUR).toISOString();
  for (const r of db.all('SELECT id, settings FROM workspaces WHERE created_at >= ? AND created_at <= ? LIMIT 100', from, to)) {
    const s = db.json(r.settings, {});
    if (s.joinvoo_intro_sent) continue;
    ws.saveSettings(r.id, { joinvoo_intro_sent: db.now() });
    const o = ws.owner(r.id);
    if (o && !o.marketing_opt_out) mailer.send(o.email, 'joinvoo-intro', { name: first(o.name), joinvoo_url: config.appUrl + '/go/joinvoo?from=email' });
  }
});

const cleanup = once('cleanup', () => {
  db.run('DELETE FROM sessions WHERE expires_at < ?', db.now());
  db.run('DELETE FROM tokens WHERE expires_at < ?', new Date(Date.now() - 7 * 24 * HOUR).toISOString());
  db.run('DELETE FROM events WHERE created_at < ? AND type IN (\'reply\',\'nudge\')', new Date(Date.now() - 60 * 24 * HOUR).toISOString());
  db.run('UPDATE orders SET status = \'expired\' WHERE status = \'pending\' AND provider IN (\'paystack\',\'flutterwave\',\'demo\') AND created_at < ?', new Date(Date.now() - 48 * HOUR).toISOString());
});

let tick = 0;
// Post queued events to VooSquare (signed, batched, retried with backoff for 24 hours).
const vooEvents = once('voo', () => require('./voosquare').flush());

async function runAll() {
  tick++;
  await blast.runDue().catch(e => console.error('[blast]', e.message));
  await expirePlans();
  await nudges();
  await waNudges();
  await vooEvents();
  if (tick % 10 === 1) { try { await require('./bachs-subs').daily(); } catch (e) { console.error('[bachs-subs] daily', e.message); } await renewalReminders(); await nightReport(); await joinvooIntro(); }
  if (tick % 60 === 1) await cleanup();
  if (config.demoSimulator) require('./simulator').step().catch(e => console.error('[sim]', e.message));
}

function start() {
  if (timer) return;
  timer = setInterval(runAll, 60e3);
  timer.unref();
  setTimeout(runAll, 5e3).unref();
}
function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { start, stop, runAll, vooEvents, expirePlans, renewalReminders, nightReport, nudges, waNudges, joinvooIntro, cleanup };
