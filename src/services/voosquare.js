'use strict';
// VooSquare: the one account (Voo ID) for every Zedapex tool, through the Voo Connect kit (src/lib/voo.js, docs/VOOSQUARE.md).
// 1. Login: "Continue with VooSquare" NEXT TO Replyvoo's own email + password login (owner rule: never instead of it).
//    A Voo ID is found by users.voo_id first. It is linked to an existing Replyvoo account only when (a) that account is
//    logged in and pressed "Connect VooSquare" (Settings), or (b) the email is verified on BOTH sides (VooSquare says so AND
//    Replyvoo verified it with its own link), the emails are equal and the account has no Voo ID yet. Never by an
//    unverified email, never replacing a Voo ID, never a staff account automatically. Otherwise a new account.
// 2. Affiliate hand-off: ref / vclick / coupon on any landing URL are kept by the kit (voo_attr cookie) and sent to VooSquare.
// 3. Events (stable ids from order references): plan payments (spend + plan_started / plan_renewed), power-ups (spend),
//    credit packs (wallet_topup), refunds, chargebacks, plan_cancelled, and the Closer's activity (chat_answered per
//    workspace per hour, lead_qualified, payment_link_sent, sale_closed). Never an end customer's name, contact or text.
// 4. Summary card for VooSquare's dashboard (chats_answered, leads_qualified, sales_closed, sales_usd).
// 5. Support: customer tickets are copied into VooSquare HQ; replies written there come back on /hooks/voosquare/support.
// VooSquare never takes or moves money: payments, credits and the Voo Wallet stay in Replyvoo.
const config = require('../config');
const db = require('../db');
const voo = require('../lib/voo');
const { sha256, encrypt, safeEqual } = require('../lib/security');
const { HttpError } = require('../lib/http');

const TOOL = 'replyvoo';
const enabled = () => voo.loginOn();
const eventsOn = () => voo.eventsOn();
const kit = () => voo.get();
const base = () => voo.cfg().base || 'https://voosquare.com';

// Tests point this at another VooSquare without a restart.
function setConfig(patch) { Object.assign(config.voo, patch); voo.reset(); }

function widget() { const c = voo.cfg(); return c.on && c.widget && c.base ? { src: c.base + '/widget.js', product: TOOL } : null; }
function publicInfo() {
  const b = base();
  return {
    enabled: enabled(), home_url: b, dashboard_url: b + '/app', app_url: b + '/app', referrals_url: b + '/app#referrals', connected_url: b + '/app',
    login_url: '/auth/voosquare', signup_url: '/auth/voosquare?signup=1&return_to=%2Fapp', widget: widget()
  };
}

/* ---------------- login ---------------- */
// Where a login may send people back to: the dashboard, the admin or an invite. VooSquare's launcher asks for /dashboard.
function safeReturn(r) {
  const s = String(r || '');
  if (s === '/dashboard' || s.startsWith('/dashboard?')) return '/app';
  return (/^\/app(\/|\?|$)/.test(s) || /^\/admin(\/|\?|$)/.test(s)) && !/^\/app\/(login|signup|forgot|reset)/.test(s) && !s.startsWith('//') && !/[\\\u0000-\u001F]/.test(s) ? s.slice(0, 500) : '/app';
}
function startLogin(req, res, { returnTo, signup } = {}) {
  return kit().startLogin(req, res, { returnTo: safeReturn(returnTo), signup: !!signup });
}
const LOGIN_ERRORS = {
  access_denied: 'You cancelled the VooSquare login.',
  state_missing: 'This login took too long or was opened in another browser. Please try again.',
  state_mismatch: 'This login link was opened in another browser. Please try again.',
  state_expired: 'This login took too long. Please try again.',
  invalid_grant: 'This login link was already used or has expired. Please try again.',
  invalid_client: 'Replyvoo’s VooSquare settings are wrong. Please log in with your email and password for now.',
  invalid_id_token: 'VooSquare login could not be verified. Please try again.',
  network: 'VooSquare could not be reached. Please try again in a moment.',
  timeout: 'VooSquare could not be reached. Please try again in a moment.'
};
// Checks state, exchanges the code, verifies the id_token. Throws HttpError with a plain message.
async function finishLogin(req, res) {
  try {
    const { user, returnTo } = await kit().handleCallback(req, res);
    return { vu: user, returnTo: safeReturn(returnTo) };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const code = e && e.code;
    if (!LOGIN_ERRORS[code]) console.error('[voosquare] login', code || '', e && e.message);
    throw new HttpError(code === 'network' || code === 'timeout' ? 502 : 400, LOGIN_ERRORS[code] || 'VooSquare login did not finish. Please try again.');
  }
}
function logoutUrl() { return enabled() ? kit().logoutUrl(config.appUrl + '/') : '/'; }

const cleanCountry = c => (/^[A-Za-z]{2}$/.test(String(c || '')) ? String(c).toUpperCase() : '');
const isStaff = u => u.role === 'admin' || !!db.one("SELECT 1 FROM staff WHERE user_id = ? AND status = 'active'", u.id);

// Finds or creates the Replyvoo user for a Voo ID. current = the account that pressed "Connect VooSquare" (see routes).
function linkOrCreate(vu, current) {
  const vooId = String(vu.voo_id || vu.sub || '').slice(0, 200);
  if (!vooId) throw new HttpError(400, 'VooSquare did not send a Voo ID.');
  const email = String(vu.email || '').trim().toLowerCase().slice(0, 200);
  const verified = vu.email_verified === true;
  const name = String(vu.name || '').trim().slice(0, 80) || (email ? email.split('@')[0] : 'there');
  const country = cleanCountry(vu.country);
  const ref = String(vu.voo_ref || '').trim().slice(0, 64);
  return db.tx(() => {
    const byVoo = db.one('SELECT * FROM users WHERE voo_id = ?', vooId);
    const link = (u, how) => {
      db.run('UPDATE users SET voo_id = ?, voo_linked_at = ? WHERE id = ? AND (voo_id IS NULL OR voo_id = ?)', vooId, db.now(), u.id, vooId);
      const out = db.one('SELECT * FROM users WHERE id = ?', u.id);
      if (out.voo_id !== vooId) throw new HttpError(409, 'This Replyvoo account is already connected to another Voo ID.');
      db.insert('audit', { user_id: u.id, action: 'voo.linked', data: JSON.stringify({ how }), created_at: db.now() });
      return out;
    };
    // (a) "Connect VooSquare" from Settings: link THIS account.
    if (current) {
      const me = db.one('SELECT * FROM users WHERE id = ?', current.id);
      if (byVoo && byVoo.id !== me.id) throw new HttpError(409, 'That Voo ID is already connected to another Replyvoo account.');
      if (me.voo_id && me.voo_id !== vooId) throw new HttpError(409, 'Your Replyvoo account is already connected to another Voo ID.');
      return { user: me.voo_id === vooId ? me : link(me, 'connect'), isNew: false, linked: me.voo_id !== vooId };
    }
    if (byVoo) {
      // Keep the profile in step with VooSquare. The email follows only when VooSquare verified it and nobody else has it,
      // and never for staff (their password login and 2-step codes use that address).
      const patch = {};
      if (email && verified && email !== byVoo.email && !isStaff(byVoo) && !db.one('SELECT id FROM users WHERE email = ? AND id != ?', email, byVoo.id)) { patch.email = email; patch.email_verified = 1; }
      if (!byVoo.name && name) patch.name = name;
      if (country && !byVoo.country) patch.country = country;
      if (ref && !byVoo.referred_by) patch.referred_by = ref; // saved once, never changed
      if (Object.keys(patch).length) db.update('users', byVoo.id, patch);
      return { user: { ...byVoo, ...patch }, isNew: false, linked: false };
    }
    // (b) Same email, verified on both sides.
    if (email) {
      const same = db.one('SELECT * FROM users WHERE email = ?', email);
      if (same) {
        if (same.voo_id) throw new HttpError(409, 'This email is already connected to another Voo ID. Contact support and we’ll sort it out.');
        if (!verified) throw new HttpError(409, 'There’s already a Replyvoo account with this email. Confirm your email in VooSquare first, or log in to Replyvoo with your password and press “Connect VooSquare” in Settings.');
        if (!same.email_verified) throw new HttpError(409, 'There’s already a Replyvoo account with this email that hasn’t been confirmed yet. Log in to Replyvoo with your password, confirm your email, then press “Connect VooSquare” in Settings.');
        if (isStaff(same)) throw new HttpError(409, 'Staff accounts are never connected automatically. Log in with your password, then press “Connect VooSquare” in Settings.');
        return { user: link(same, 'email'), isNew: false, linked: true };
      }
    }
    // (c) A new account.
    if (!email) throw new HttpError(400, 'Your Voo ID has no email address. Add one in VooSquare and try again.');
    const id = db.insert('users', { email, name, password_hash: '', email_verified: verified ? 1 : 0, voo_id: vooId, voo_linked_at: db.now(), referred_by: ref, country, moji: '{}', created_at: db.now() });
    return { user: db.one('SELECT * FROM users WHERE id = ?', id), isNew: true, linked: false };
  });
}

// Gives a Voo ID user without a workspace their own (not for invited teammates or staff joining).
function ensureWorkspace(user) {
  if (db.one('SELECT workspace_id FROM members WHERE user_id = ? LIMIT 1', user.id)) return null;
  const ws = require('./workspace');
  const first = (String(user.name || '').split(' ')[0] || 'My');
  const w = ws.createWorkspace(user, first + '’s business', { invited: !!user.referred_by, settings: { onboarding: true, alerts: { handoff: true, night_report: true, hot: true, low_credits: true } } });
  return w.id;
}

/* "You already have a Voo account": asked only AFTER the person proved their email to Replyvoo (the verify link), so
 * nobody can use Replyvoo to find out which emails have a Voo ID. Any problem means "no" (nothing changes). */
async function vooIdExists(email) {
  const c = voo.cfg();
  if (!enabled() || !c.apiKey || !email) return false;
  try {
    const r = await fetch((c.serverBase || c.base) + '/api/v1/users/lookup', { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(2500),
      headers: { authorization: 'Bearer ' + c.apiKey, 'content-type': 'application/json' }, body: JSON.stringify({ email: String(email).trim().toLowerCase() }) });
    return r.ok && (await r.json()).voo_id_exists === true;
  } catch { return false; }
}

/* ---------------- summary card ---------------- */
const PERIODS = { '1d': 1, '7d': 7, '30d': 30 };
function summary(vooId, period) {
  const ws = require('./workspace');
  const days = PERIODS[period] || 1;
  const u = vooId ? db.one('SELECT * FROM users WHERE voo_id = ?', String(vooId)) : null;
  if (!u || u.suspended) return null;
  const owned = db.all("SELECT w.id, w.plan_id, w.status, w.period_end FROM workspaces w JOIN members m ON m.workspace_id = w.id WHERE m.user_id = ? AND m.role = 'owner'", u.id);
  const open = config.appUrl + '/app';
  if (!owned.length) return { status: 'none', metrics: [], open_url: open };
  const ids = owned.map(w => w.id);
  const inWs = 'workspace_id IN (' + ids.map(() => '?').join(',') + ')';
  const now = Date.now(); const span = days * 864e5;
  const from = new Date(now - span).toISOString(); const prevFrom = new Date(now - 2 * span).toISOString(); const to = new Date(now + 1000).toISOString();
  const answered = (a, b) => db.one('SELECT COUNT(DISTINCT thread_id) n FROM messages WHERE ' + inWs + " AND author = 'ai' AND created_at >= ? AND created_at < ?", ...ids, a, b).n || 0;
  const evts = (type, a, b) => db.one('SELECT COUNT(*) n FROM events WHERE ' + inWs + ' AND type = ? AND created_at >= ? AND created_at < ?', ...ids, type, a, b).n || 0;
  const salesUsd = (a, b) => Math.round(db.all('SELECT data FROM events WHERE ' + inWs + " AND type = 'won' AND created_at >= ? AND created_at < ?", ...ids, a, b)
    .reduce((s, e) => { const c = db.json(e.data, {}).contact_id; const r = c ? db.one('SELECT value FROM contacts WHERE id = ?', c) : null; return s + (r ? Number(r.value) || 0 : 0); }, 0) * 100) / 100;
  const metric = (key, label, unit, fn) => {
    const cur = fn(from, to); const prev = fn(prevFrom, from);
    return { key, label, value: cur, unit, change_pct: prev ? Math.round((cur - prev) / prev * 1000) / 10 : (cur ? 100 : 0) };
  };
  const paid = owned.some(w => { const p = ws.plan(w.plan_id); return p && p.price_month > 0 && new Date(w.period_end) > new Date(); });
  const status = owned.every(w => w.status !== 'active') ? 'paused' : paid ? 'active' : 'trial';
  return {
    status, open_url: open,
    metrics: [
      metric('chats_answered', 'Chats answered', 'count', answered),
      metric('leads_qualified', 'Leads qualified', 'count', (a, b) => evts('hot', a, b)),
      metric('sales_closed', 'Sales closed', 'count', (a, b) => evts('won', a, b)),
      metric('sales_usd', 'Sales value', 'usd', salesUsd)
    ]
  };
}
// GET /api/voosquare/summary (Authorization: Bearer <VOO_API_KEY>; the kit checks it in constant time).
function summaryHandler() {
  if (!eventsOn()) return (req, res) => res.json({ error: 'VooSquare is not connected' }, 404);
  return kit().summaryHandler(async (vooId, period) => summary(vooId, period));
}

// Server-to-server calls from VooSquare (links, support HQ): the API key, or the separate inbound VOO_SERVICE_KEY.
// staffOnly: only VOO_SERVICE_KEY (inbound-only) may change staff access, never the outgoing API key.
function checkServiceKey(req, { staffOnly = false } = {}) {
  const h = String(req.headers.authorization || '');
  const got = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const c = voo.cfg();
  const keys = staffOnly ? [c.serviceKey] : [c.apiKey, c.serviceKey];
  if (!got || !c.on || !keys.some(k => k && safeEqual(got, k))) throw new HttpError(401, 'Invalid service key');
}

/* ---------------- events ---------------- */
const EMAILISH = /[^\s@]+@[^\s@]+\.[a-z]{2,}/gi;
// Labels name the channel or product, never a person.
const label = s => String(s || '').replace(EMAILISH, '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
function queue(fn) {
  if (!eventsOn()) return null;
  try { return fn(kit().events); } catch (e) { console.error('[voosquare] event not queued:', e.message); return null; }
}
const eid = (...parts) => kit().events.id(...parts);
const ownerOf = wsId => db.one('SELECT u.id, u.voo_id, u.country FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = ?', wsId);
const channelName = type => (type === 'website' ? 'website' : !type || /^telegram/.test(type) ? 'Telegram' : String(type).split('_')[0].replace(/^./, c => c.toUpperCase()));
const planName = id => { const p = db.one('SELECT name FROM plans WHERE id = ?', id); return p ? p.name : String(id); };

// A paid order was fulfilled. Event ids come from the order reference (RV-…), never from a row number.
function paymentEvents(order) {
  if (!eventsOn() || !(order.amount_usd > 0)) return null;
  const o = ownerOf(order.workspace_id);
  if (!o || !o.voo_id) return null;
  const country = cleanCountry(o.country) || undefined;
  const meta = db.json(order.meta, {});
  const signals = {};
  if (meta.payer) signals.payment_fingerprint = kit().hashSignal(meta.payer);
  if (country) signals.payment_country = country;
  const at = order.paid_at || undefined;
  // paymentRef (kit 1.3.0): the processor's own reference (Gatevoo invoice id, Bachs/Paystack reference, Joinvoo purchase id),
  // or our order number, so VooSquare never pays the same payment twice when it arrives again under another event id.
  const paymentRef = String(order.provider_ref || order.ref || '').replace(/[^A-Za-z0-9_.:\/#@+=-]/g, '-').slice(0, 120) || undefined;
  const out = queue(ev => {
    const spendId = eid('pay', order.ref);
    if (order.kind === 'pack') {
      // Money into the Voo Wallet: tracked, no commission (credits are spent later inside Replyvoo).
      ev.walletTopup({ eventId: eid('topup', order.ref), vooId: o.voo_id, valueUsd: order.amount_usd, label: label('Replyvoo ' + order.item_name), occurredAt: at, country, signals });
      return { spend: null };
    }
    if (order.kind === 'plan') {
      const plan = planName(order.item_id);
      const renewal = !!db.one("SELECT id FROM orders WHERE workspace_id = ? AND kind = 'plan' AND item_id = ? AND status IN ('paid','refunded') AND id != ? AND paid_at <= ?", order.workspace_id, order.item_id, order.id, order.paid_at || db.now());
      ev.spend({ eventId: spendId, vooId: o.voo_id, valueUsd: order.amount_usd, plan, label: label('Replyvoo ' + plan + ', ' + (order.interval === 'year' ? 'yearly' : 'monthly')), occurredAt: at, country, signals, paymentRef });
      const p = db.one('SELECT price_month, price_year FROM plans WHERE id = ?', order.item_id) || {};
      const list = order.interval === 'year' ? (p.price_year || order.amount_usd) : (p.price_month || order.amount_usd);
      (renewal ? ev.planRenewed : ev.planStarted).call(ev, { eventId: eid(renewal ? 'renew' : 'plan', order.ref), vooId: o.voo_id, plan, valueUsd: list, label: label('Replyvoo ' + plan), occurredAt: at });
      return { spend: spendId };
    }
    ev.spend({ eventId: spendId, vooId: o.voo_id, valueUsd: order.amount_usd, label: label('Replyvoo power-up: ' + order.item_name), occurredAt: at, country, signals, paymentRef });
    return { spend: spendId };
  });
  // Remember which Voo ID was credited: a refund or chargeback later points at the same payment.
  if (out) {
    const cur = db.one('SELECT meta FROM orders WHERE id = ?', order.id);
    db.update('orders', order.id, { meta: JSON.stringify({ ...db.json(cur && cur.meta, {}), voo_id: o.voo_id, voo_spend: out.spend || null }) });
  }
  return out;
}
function paidVoo(order) {
  const m = typeof order.meta === 'string' ? db.json(order.meta, {}) : (order.meta || {});
  return m.voo_id ? { voo_id: String(m.voo_id), spend: m.voo_spend ? String(m.voo_spend) : null } : null;
}
// Money returned for a paid order. VooSquare logs it; commission stays.
function refundEvent(order, valueUsd) {
  const p = paidVoo(order);
  if (!p || !(valueUsd > 0)) return null;
  return queue(ev => ev.refund({ eventId: eid('rf', order.ref), vooId: p.voo_id, valueUsd, originalEventId: p.spend || undefined, label: label('Refund, Replyvoo ' + order.item_name) }).event_id);
}
// A disputed card payment: reverses the commission of that spend (only payments that sent a spend).
function chargebackEvent(order, valueUsd) {
  const p = paidVoo(order);
  if (!p || !p.spend || !(valueUsd > 0)) return null;
  return queue(ev => ev.chargeback({ eventId: eid('cb', order.ref), vooId: p.voo_id, valueUsd, originalEventId: p.spend, label: label('Chargeback, Replyvoo ' + order.item_name) }).event_id);
}
function planCancelled(wsId, planId, periodEnd) {
  const o = ownerOf(wsId);
  if (!o || !o.voo_id) return null;
  const when = new Date(periodEnd || Date.now()).toISOString().slice(0, 10);
  return queue(ev => ev.planCancelled({ eventId: eid('cancel', wsId, when), vooId: o.voo_id, plan: planName(planId), label: label('Replyvoo ' + planName(planId) + ' ended') }).event_id);
}

// The Closer's activity. chat_answered is counted per workspace per hour and sent once the hour is over (flushActivity).
const hourOf = t => new Date(t).toISOString().slice(0, 13);
function activity(wsId, type, { channel, key, valueUsd } = {}) {
  if (!eventsOn()) return null;
  const o = ownerOf(wsId);
  if (!o || !o.voo_id) return null;
  if (type === 'chat_answered') {
    db.run('INSERT INTO voo_activity (workspace_id, hour, chats) VALUES (?, ?, 1) ON CONFLICT(workspace_id, hour) DO UPDATE SET chats = chats + 1', wsId, hourOf(Date.now()));
    return { counted: true };
  }
  const LABELS = { lead_qualified: 'New hot lead on ', payment_link_sent: 'Payment link sent on ', sale_closed: 'Sale closed on ' };
  if (!LABELS[type]) return null;
  // key: the contact; with the time it is unique for ever (row numbers alone could come back after a restore).
  const id = eid(type.split('_')[0], wsId, key || 'x', Date.now().toString(36));
  return queue(ev => ev.activity(type, { eventId: id, vooId: o.voo_id, label: label(LABELS[type] + channelName(channel)), ...(type === 'sale_closed' && Number(valueUsd) >= 0.01 ? { valueUsd: Math.round(Number(valueUsd) * 100) / 100 } : {}) }).event_id);
}
// Old name used across the code: never lets an event problem break a reply or a payment.
function safeEmit(wsId, type, opts = {}) {
  try {
    if (type === 'plan_cancelled') return planCancelled(wsId, opts.planId, opts.periodEnd);
    return activity(wsId, type, opts);
  } catch (e) { console.error('[voosquare] emit', e.message); return null; }
}
function flushActivity({ now = Date.now() } = {}) {
  if (!eventsOn()) return 0;
  let n = 0;
  for (const r of db.all('SELECT a.*, u.voo_id FROM voo_activity a JOIN workspaces w ON w.id = a.workspace_id JOIN users u ON u.id = w.owner_id WHERE a.hour < ?', hourOf(now))) {
    if (r.voo_id && r.chats > 0) queue(ev => ev.activity('chat_answered', { eventId: eid('chats', r.workspace_id, r.hour), vooId: r.voo_id, label: 'Closers answered ' + r.chats + ' new chat' + (r.chats === 1 ? '' : 's'), occurredAt: r.hour + ':59:59Z' }));
    db.run('DELETE FROM voo_activity WHERE workspace_id = ? AND hour = ?', r.workspace_id, r.hour);
    n++;
  }
  return n;
}

/* ---------------- support bridge (VooSquare HQ) ---------------- */
// A customer's message on a ticket is copied into VooSquare's one inbox (same external_ref = same conversation).
function supportForward(ticket, { text, name, email } = {}) {
  try {
    if (!eventsOn() || !ticket || !text) return null;
    const u = ticket.requester_user_id ? db.one('SELECT voo_id FROM users WHERE id = ?', ticket.requester_user_id) : null;
    const payload = { email: email || ticket.requester_email || undefined, name: name || ticket.requester_name || '', subject: String(ticket.subject || '').slice(0, 120), body: String(text).slice(0, 4000), externalRef: 'replyvoo-' + ticket.ref, vooId: (u && u.voo_id) || undefined };
    db.insert('voo_outbox', { event_id: 'sup_' + ticket.ref + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), body: JSON.stringify(payload), url: 'support', next_at: db.now(), created_at: db.now() });
    return payload;
  } catch (e) { console.error('[voosquare] support', e.message); return null; }
}
// A reply written in VooSquare HQ (VooSquare already emailed the customer): shown on the ticket here.
function supportReply(reply) {
  const m = /^replyvoo-(T-[A-Z0-9]+)$/i.exec(String(reply.external_ref || ''));
  if (!m) return { ok: true, ignored: true };
  const t = db.one('SELECT * FROM support_tickets WHERE ref = ?', m[1].toUpperCase());
  if (!t) return { ok: true, ignored: true };
  require('./support').addMessage(t, { dir: 'out', text: String(reply.body || '').slice(0, 6000), authorName: String(reply.agent || 'Replyvoo team').slice(0, 80), via: 'voosquare' });
  return { ok: true };
}
async function flushSupport() {
  const rows = db.all("SELECT * FROM voo_outbox WHERE url = 'support' AND sent_at IS NULL AND failed_at IS NULL AND next_at <= ? ORDER BY id LIMIT 50", db.now());
  let sent = 0;
  for (const r of rows) {
    try { await kit().support.send(JSON.parse(r.body)); db.update('voo_outbox', r.id, { sent_at: db.now(), attempts: r.attempts + 1, last_error: '' }); sent++; }
    catch (e) {
      const attempts = r.attempts + 1;
      const giveUp = Date.now() - new Date(r.created_at).getTime() > 24 * 3600e3 || (e.status && e.status < 500 && e.status !== 429);
      db.update('voo_outbox', r.id, { attempts, last_error: String(e.message).slice(0, 200), next_at: new Date(Date.now() + Math.min(3600e3, 30e3 * 2 ** Math.min(attempts, 7))).toISOString(), failed_at: giveUp ? db.now() : null });
    }
  }
  return sent;
}

// Scheduler job (every minute): close finished hours, send queued events (the kit's own timer also sends every few
// seconds) and copy support messages.
async function flush() {
  if (!eventsOn()) return { sent: 0 };
  const hours = flushActivity();
  const r = await kit().events.flush();
  const support = await flushSupport().catch(() => 0);
  db.run('DELETE FROM voo_failed WHERE created_at < ?', new Date(Date.now() - 90 * 864e5).toISOString());
  db.run('DELETE FROM voo_outbox WHERE COALESCE(sent_at, failed_at) < ?', new Date(Date.now() - 7 * 864e5).toISOString());
  return { hours, stored: r.stored, pending: r.pending, rejected: r.rejected.length, support };
}
function status() {
  const k = eventsOn() ? kit() : null;
  return {
    ...voo.publicSettings(), widget: !!widget(), pending: k ? k.events.pending().length : 0,
    support_pending: db.one("SELECT COUNT(*) n FROM voo_outbox WHERE url = 'support' AND sent_at IS NULL AND failed_at IS NULL").n,
    failed: db.all('SELECT event_id, type, error, created_at FROM voo_failed ORDER BY id DESC LIMIT 20'),
    linked_users: db.one('SELECT COUNT(*) n FROM users WHERE voo_id IS NOT NULL').n
  };
}
// Admin "Test connection": a read that needs the API key (GET /api/v1/users/<made-up id>: 404 = key accepted).
async function ping() {
  const c = voo.cfg();
  if (!c.on) return { ok: false, message: 'VooSquare is switched off.' };
  if (!c.base) return { ok: false, message: 'Add the VooSquare address first.' };
  if (!c.apiKey) return { ok: false, message: 'Add the API key (vsk_…) to test the connection.' };
  try { await kit().users.get('voo_replyvoo_ping'); return { ok: true, message: 'Connected.' }; }
  catch (e) {
    if (e.status === 404) return { ok: true, message: 'Connected. VooSquare accepted the API key.' + (enabled() ? '' : ' Add the client ID and secret to turn on "Continue with VooSquare".') };
    if (e.status === 401 || e.status === 403) return { ok: false, message: 'VooSquare refused the API key. Copy it again from VooSquare → Admin → Products → Replyvoo → Credentials.' };
    return { ok: false, message: 'VooSquare could not be reached (' + (e.message || 'error') + ').' };
  }
}

/* ---------------- links between tools ---------------- */
const LINKS = { 'castvoo-replyvoo': 'Castvoo → Replyvoo (replies to broadcasts)' };
function saveLink({ voo_id: vooId, link, key, enabled: on }) {
  if (!vooId || !LINKS[link]) throw new HttpError(400, 'Unknown link. Replyvoo supports: ' + Object.keys(LINKS).join(', '));
  const row = db.one('SELECT * FROM voo_links WHERE voo_id = ? AND link = ?', String(vooId), link);
  if (on === false) { if (row) db.update('voo_links', row.id, { enabled: 0, key_hash: '', key_enc: '', updated_at: db.now() }); return { link, enabled: false }; }
  if (!key || String(key).length < 24) throw new HttpError(400, 'A scoped key of at least 24 characters is required.');
  const patch = { key_hash: sha256(key), key_enc: encrypt(String(key)), enabled: 1, updated_at: db.now() };
  if (row) db.update('voo_links', row.id, patch); else db.insert('voo_links', { voo_id: String(vooId), link, ...patch });
  return { link, enabled: true };
}
function linkFor(req, link) {
  const h = String(req.headers.authorization || '');
  const got = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const row = got ? db.one('SELECT * FROM voo_links WHERE key_hash = ? AND link = ? AND enabled = 1', sha256(got), link) : null;
  if (!row) throw new HttpError(401, 'This link is switched off or the key was revoked in VooSquare.');
  return row;
}
const listLinks = vooId => db.all('SELECT link, enabled, updated_at FROM voo_links WHERE voo_id = ?', String(vooId)).map(l => ({ ...l, enabled: !!l.enabled, name: LINKS[l.link] || l.link }));

module.exports = {
  TOOL, enabled, eventsOn, setConfig, publicInfo, widget, safeReturn, startLogin, finishLogin, logoutUrl, linkOrCreate, ensureWorkspace, vooIdExists,
  cleanCountry, summary, summaryHandler, checkServiceKey, label, paymentEvents, refundEvent, chargebackEvent, planCancelled, activity, safeEmit,
  flushActivity, supportForward, supportReply, flush, status, ping, saveLink, linkFor, listLinks, LINKS
};
