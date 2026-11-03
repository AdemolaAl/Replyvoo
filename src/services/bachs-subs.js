'use strict';
/*
 * Bachs card auto-renew. Monthly and yearly plans paid by card through Bachs renew by themselves. Bank transfer, mobile
 * money and crypto stay one-off payments with the renewal reminder email (scheduler.renewalReminders).
 *
 * BACHS API (docs.bachs.io and the official SDKs; see docs/BACHS.md → "Auto-renew"):
 *   POST   /v1/products                       billing_cycle { interval: month|year, frequency: 1 } = a recurring product
 *   POST   /v1/checkout-sessions              product_cart [{ product_id }] + customer: completing it creates the subscription
 *                                             (Bachs has no create-subscription endpoint)
 *   GET    /v1/subscriptions/:id              read back before giving anything
 *   PATCH  /v1/subscriptions/:id              product_id: move the subscriber to a new price
 *   DELETE /v1/subscriptions/:id              cancel_at_period_end: true → the plan runs to the end of the period
 *   POST   /v1/customers/:id/portal-sessions  hosted page where the customer updates the card
 *   Webhooks: invoice.paid (first charge and each renewal), invoice.payment_failed, customer.subscription.created /
 *   updated / deleted. At-least-once delivery: each event id is handled once.
 *
 * SAFETY. Plan time is given only after invoice.paid AND Bachs's own GET /subscriptions/:id says it is ours and active.
 * Each renewal is one order (ref = RV-…, provider_ref = inv_<id>, checked before insert) fulfilled by payments.fulfill,
 * the same path as every plan order, so a repeated event never extends a plan twice. The Bachs customer fee stays in the
 * price; the naira price follows the current rate. When the rate raises the price, the subscription is moved to a new
 * Bachs price for its next cycle and the reminder shows the new amount; if Bachs refuses, the renewal still gives what
 * was paid for, is flagged for admin when under the base price, and the move is tried again.
 * Payment cap (bachs.maxUsd, $5,000 per payment by default, fee inside, naira at the checkout rate): a recurring product
 * over the cap is never made and a subscriber is never moved to a price over it. When the renewal price would go over,
 * the subscription ends at the end of the paid period (no more card charges), the row is flagged for admin, and the
 * owner gets the normal one-off renewal reminder to pay in the wallet instead.
 * Flag: Admin → Connections → Bachs → "Auto-renew for card payments" (on by default; BACHS_RECURRING=off turns it off).
 * When Bachs refuses recurring products (no subscription access, not set up), checkout quietly uses a one-off payment.
 */
const config = require('../config');
const db = require('../db');

const DAY = 864e5;
const GRACE_DAYS = 7;
const UNAVAILABLE_RETRY_MS = 24 * 3600e3;
const STATE = 'bachs_recurring_state';
const ACTIVE = ['active', 'trialing'];
const r2 = n => Math.round(Number(n) * 100) / 100;
const money = (cur, n) => (cur === 'NGN' ? '₦' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '$' + Number(n).toFixed(2));
const bachs = () => require('./bachs');
const payments = () => require('./payments');
const ws = () => require('./workspace');
const mailer = () => require('./mailer');

function state() { const r = db.one('SELECT value FROM settings WHERE key = ?', STATE); return r ? db.json(r.value, {}) : {}; }
function setState(patch) { const v = { ...state(), ...patch }; for (const k of Object.keys(patch)) if (patch[k] === undefined) delete v[k]; db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', STATE, JSON.stringify(v), db.now()); }

// Feature flag: on by default; off in Admin → Connections → Bachs, with BACHS_RECURRING=off, or for a day after Bachs refused.
function enabled() {
  if (/^(0|off|false|no)$/i.test(String(process.env.BACHS_RECURRING || ''))) return false;
  const r = bachs().resolve();
  if (!r.on || r.recurring === false) return false;
  const u = state().unavailable;
  return !(u && Date.now() - Date.parse(u.at || 0) < UNAVAILABLE_RETRY_MS);
}

async function api(method, path, body, idem) {
  const r = bachs().resolve();
  let res;
  try {
    res = await fetch(r.base + path, { method, signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Bearer ' + r.secretKey, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(idem ? { 'Idempotency-Key': idem } : {}) },
      body: body ? JSON.stringify(body) : undefined });
  } catch { const e = new Error('Bachs could not be reached'); e.unreachable = true; throw e; }
  const j = await res.json().catch(() => ({}));
  const d = j && j.data && typeof j.data === 'object' && !Array.isArray(j.data) ? j.data : j;
  if (!res.ok) { const e = new Error('Bachs: ' + String((d && (d.message || (d.error && (d.error.message || d.error)))) || 'HTTP ' + res.status).slice(0, 160)); e.http = res.status; e.unreachable = res.status >= 500 || res.status === 429; throw e; }
  return d || {};
}

// Today's price with Bachs for this plan: base (offer applied) + the Bachs fee, in naira at today's rate for Nigeria.
function currentPrice(planId, interval, currency) {
  const q = payments().quote('plan', planId, interval);
  const f = payments().withFee(q.amount, 'bachs');
  return { base_usd: q.amount, total_usd: f.total, fee_usd: f.fee, fee_pct: f.pct, currency, amount: bachs().localAmount(f.total, currency) };
}

async function ensureProduct(plan, interval, currency, amount) {
  if (bachs().overCap(amount, currency)) throw bachs().capError(); // never a recurring price over the Bachs cap
  const amt = Number(amount).toFixed(2);
  const row = db.one('SELECT product_id FROM bachs_products WHERE plan_id = ? AND interval = ? AND currency = ? AND amount = ?', plan.id, interval, currency, amt);
  if (row) return row.product_id;
  let d;
  try {
    d = await api('POST', '/products', { name: 'Replyvoo ' + plan.name + ' (' + (interval === 'year' ? 'yearly' : 'monthly') + ')', price: { currency, amount: amt, price_type: 'fixed' },
      billing_cycle: { interval: interval === 'year' ? 'year' : 'month', frequency: 1 }, metadata: { app: 'replyvoo', plan_id: plan.id, interval } }, 'rv_prod_' + plan.id + '_' + interval + '_' + currency + '_' + amt);
  } catch (e) { if (!e.unreachable) setState({ unavailable: { at: db.now(), reason: e.message } }); e.fallback = true; throw e; }
  const pid = d.id || d.product_id;
  if (!pid) { const e = new Error('Bachs made no product id'); e.fallback = true; throw e; }
  db.run('INSERT OR IGNORE INTO bachs_products (plan_id, interval, currency, amount, product_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', plan.id, interval, currency, amt, String(pid), db.now());
  if (state().unavailable) setState({ unavailable: undefined });
  return String(pid);
}

// Subscription checkout for a pending plan order. Throws e.fallback when Bachs cannot do recurring right now.
async function createCheckout(order, user) {
  if (!enabled()) { const e = new Error('Auto-renew is off'); e.fallback = true; throw e; }
  const plan = ws().plan(order.item_id);
  const price = currentPrice(order.item_id, order.interval, order.currency);
  if (bachs().overCap(price.amount, order.currency)) throw bachs().capError();
  const productId = await ensureProduct(plan, order.interval, order.currency, price.amount);
  let d;
  try {
    d = await api('POST', '/checkout-sessions', {
      product_cart: [{ product_id: productId, quantity: 1 }], reference: order.ref,
      success_url: config.appUrl + '/pay/callback?ref=' + encodeURIComponent(order.ref), cancel_url: config.appUrl + '/app/wallet?cancelled=' + encodeURIComponent(order.ref),
      customer: { email: user.email, ...(user.name ? { name: String(user.name).slice(0, 80) } : {}) },
      metadata: { app: 'replyvoo', reference: order.ref, workspace_id: String(order.workspace_id), kind: 'plan', plan_id: order.item_id, interval: order.interval, amount_usd: price.base_usd.toFixed(2) }
    }, order.ref + '_sub');
  } catch (e) { if (!e.unreachable && [401, 403].includes(e.http)) setState({ unavailable: { at: db.now(), reason: e.message } }); e.fallback = !e.unreachable; throw e; }
  const url = d.checkout_url || d.url; const id = d.checkout_id || d.id;
  if (!url || !id || !/^https:\/\//.test(String(url))) { const e = new Error('Bachs could not start the subscription checkout'); e.fallback = true; throw e; }
  db.insert('bachs_subscriptions', { workspace_id: order.workspace_id, user_id: order.user_id, plan_id: order.item_id, interval: order.interval, currency: order.currency, amount_local: price.amount, amount_usd: price.base_usd, product_id: productId, first_order_ref: order.ref, status: 'pending', created_at: db.now(), updated_at: db.now() });
  return { id: String(id).slice(0, 120), url: String(url), amount_local: price.amount };
}

// ---------- Webhooks ----------
const isSubEvent = ev => !!(ev && /^(customer\.subscription\.|invoice\.)/.test(String(ev.type || '')));
const objOf = ev => { const d = ev && ev.data && typeof ev.data === 'object' ? ev.data : (ev || {}); return d.object && typeof d.object === 'object' ? d.object : d; };
const isoOf = v => { if (v == null || v === '') return null; const n = Number(v); const t = /^\d+$/.test(String(v)) ? (n < 1e12 ? n * 1000 : n) : Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const subIdOf = o => String(o.subscription_id || (o.subscription && typeof o.subscription === 'object' ? o.subscription.id : o.subscription) || '');
const periodEndOf = o => isoOf(o.current_period_end || o.period_end || (o.period && o.period.end));
const fetchSub = subId => api('GET', '/subscriptions/' + encodeURIComponent(subId));
const rowById = id => db.one('SELECT * FROM bachs_subscriptions WHERE id = ?', id);

function rowFor(subId, meta = {}) {
  let row = subId ? db.one('SELECT * FROM bachs_subscriptions WHERE sub_id = ?', subId) : null;
  if (row) return row;
  const ref = String(meta.reference || '');
  if (ref) row = db.one('SELECT * FROM bachs_subscriptions WHERE first_order_ref = ? AND sub_id IS NULL', ref);
  if (row && subId) db.update('bachs_subscriptions', row.id, { sub_id: subId, updated_at: db.now() });
  return row ? rowById(row.id) : null;
}
function claim(ev) {
  const o = objOf(ev);
  const key = String(ev.id || [ev.type, o.id, o.status, o.current_period_end || o.period_end].join(':')).slice(0, 200);
  return db.run('INSERT OR IGNORE INTO bachs_events (event_id, type, at) VALUES (?, ?, ?)', key, String(ev.type || ''), db.now()).changes > 0 ? key : null;
}

async function handle(ev) {
  const key = claim(ev);
  if (!key) return { type: 'ignore', duplicate: true };
  try {
    const type = String(ev.type); const o = objOf(ev);
    if (type.startsWith('customer.subscription.')) return await onSubscription(type, o);
    if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') return await onInvoicePaid(o);
    if (type === 'invoice.payment_failed') return onInvoiceFailed(o);
    return { type: 'ignore' };
  } catch (e) { db.run('DELETE FROM bachs_events WHERE event_id = ?', key); throw e; } // Bachs retries; nothing was given
}

function syncFrom(row, s) {
  const cust = s.customer_id || (s.customer && typeof s.customer === 'object' ? s.customer.id : s.customer) || row.customer_id;
  const patch = { status: String(s.status || row.status).toLowerCase(), current_period_end: periodEndOf(s) || row.current_period_end, customer_id: cust ? String(cust) : null, updated_at: db.now() };
  if (s.cancel_at_period_end === true || s.cancel_at_period_end === false) patch.cancel_at_period_end = s.cancel_at_period_end ? 1 : 0;
  const pid = s.product_id || (s.product && (s.product.id || s.product));
  if (pid && row.next_product_id && String(pid) === row.next_product_id) Object.assign(patch, { product_id: row.next_product_id, amount_local: row.next_amount_local, next_product_id: null, next_amount_local: null, price_move: 'moved ' + db.now().slice(0, 10) });
  db.update('bachs_subscriptions', row.id, patch);
  return rowById(row.id);
}

async function onSubscription(type, o) {
  const subId = String(o.id || o.subscription_id || '');
  const s = await fetchSub(subId);
  let row = rowFor(subId, o.metadata || {}) || rowFor(subId, s.metadata || {});
  if (!row || (s.metadata && s.metadata.app && s.metadata.app !== 'replyvoo')) return { type: 'ignore' };
  row = syncFrom(row, s);
  if (type === 'customer.subscription.deleted' || ['canceled', 'cancelled', 'ended', 'expired'].includes(row.status)) db.update('bachs_subscriptions', row.id, { status: 'canceled', updated_at: db.now() });
  return { type: 'subscription' };
}

async function onInvoicePaid(o) {
  const subId = subIdOf(o); const invId = String(o.id || o.invoice_id || '');
  if (!subId || !invId) return { type: 'ignore' };
  const pref = 'inv_' + invId.slice(0, 100);
  if (db.one("SELECT id FROM orders WHERE provider = 'bachs' AND provider_ref = ?", pref)) return { type: 'ignore', duplicate: true };
  const s = await fetchSub(subId);
  let row = rowFor(subId, o.metadata || {}) || rowFor(subId, s.metadata || {});
  if (!row || (s.metadata && s.metadata.app && s.metadata.app !== 'replyvoo') || !ACTIVE.includes(String(s.status || '').toLowerCase())) return { type: 'ignore' };
  row = syncFrom(row, s);
  const cur = String(o.currency || row.currency || '').toUpperCase();
  const paid = Number(String(o.amount_paid ?? o.total ?? o.amount ?? '').replace(',', '.'));
  if (!(paid > 0) || cur !== row.currency) { db.update('bachs_subscriptions', row.id, { flag: 'Invoice ' + invId + ': amount or currency did not match (' + paid + ' ' + cur + '). Check in Bachs.' }); return { type: 'ignore' }; }
  const periodEnd = periodEndOf(o) || periodEndOf(s);
  const months = row.interval === 'year' ? 12 : 1;
  const first = row.first_order_ref ? db.one('SELECT * FROM orders WHERE ref = ?', row.first_order_ref) : null;
  if (o.billing_reason === 'subscription_create' || (first && !row.paid_through)) {
    if (first && first.status !== 'paid' && paid + 0.001 >= Number(first.amount_local)) payments().fulfill(first.ref, { via: 'bachs', provider_ref: first.provider_ref });
    db.update('bachs_subscriptions', row.id, { paid_through: periodEnd || new Date(Date.now() + months * 30 * DAY).toISOString(), fail_count: 0, past_due_since: null, grace_until: null, updated_at: db.now() });
    return { type: 'subscription_first' };
  }
  if (row.paid_through && periodEnd && periodEnd <= row.paid_through) return { type: 'ignore', duplicate: true };
  // Renewal: one order, fulfilled through the normal plan path.
  const now = currentPrice(row.plan_id, row.interval, row.currency);
  const rate = row.currency === 'NGN' ? bachs().ngnRate() : 1;
  const usdNow = r2(paid / (rate || 1));
  const p = ws().plan(row.plan_id);
  const ref = require('../lib/security').orderRef();
  let flag = null;
  if (paid + 0.01 < now.amount) flag = usdNow < now.base_usd
    ? 'Renewal under the margin floor: charged ' + money(row.currency, paid) + ' (≈ $' + usdNow.toFixed(2) + '), plan base price $' + now.base_usd.toFixed(2) + ', today ' + money(row.currency, now.amount) + '. Plan given; subscriber moved to the new price.'
    : 'Renewal under today\'s price (' + money(row.currency, paid) + ' vs ' + money(row.currency, now.amount) + '), still above the base price. Subscriber moved to the new price.';
  db.insert('orders', { ref, workspace_id: row.workspace_id, user_id: row.user_id, kind: 'plan', item_id: row.plan_id, item_name: (p ? p.name : row.plan_id) + ' plan (' + (row.interval === 'year' ? 'yearly' : 'monthly') + ', auto-renew)', interval: row.interval,
    amount_usd: now.base_usd, fee_usd: Math.max(0, r2(usdNow - now.base_usd)), fee_pct: now.fee_pct, discount_usd: 0, coupon_id: null, currency: row.currency, amount_local: paid, provider: 'bachs', provider_ref: pref, status: 'pending',
    meta: JSON.stringify({ bachs_invoice: invId, bachs_subscription: subId, ...(flag ? { review_flag: flag } : {}) }), created_at: db.now() });
  payments().fulfill(ref, { via: 'bachs-renew', provider_ref: pref });
  // Bachs's period end is the truth: grace days never add free time on top of the paid period.
  const end = periodEnd || new Date(Date.parse(row.paid_through || db.now()) + months * 30 * DAY).toISOString();
  const w = ws().get(row.workspace_id);
  // A new paid period: the plan's monthly allowance starts again (same as a fresh plan order).
  if (w && w.plan_id === row.plan_id) db.update('workspaces', w.id, { period_end: new Date(Date.parse(end) + DAY).toISOString(), period_start: db.now(), conv_used: 0, pro_used: 0, usage_reset_at: db.now() });
  db.update('bachs_subscriptions', row.id, { paid_through: end, fail_count: 0, past_due_since: null, grace_until: null, last_failure: null, ...(flag ? { flag } : {}), updated_at: db.now() });
  if (flag) await movePrice(rowById(row.id)).catch(() => {});
  return { type: 'renewed', ref };
}

function onInvoiceFailed(o) {
  const row = rowFor(subIdOf(o), o.metadata || {});
  if (!row) return { type: 'ignore' };
  const w = ws().get(row.workspace_id);
  const end = row.paid_through || row.current_period_end || (w && w.period_end) || db.now();
  const grace = new Date(Date.parse(end) + GRACE_DAYS * DAY).toISOString();
  db.run("UPDATE bachs_subscriptions SET status = 'past_due', fail_count = fail_count + 1, past_due_since = COALESCE(past_due_since, ?), last_failure = ?, grace_until = COALESCE(grace_until, ?), updated_at = ? WHERE id = ?",
    db.now(), String(o.failure_message || o.failure_reason || 'The card was declined.').slice(0, 200), grace, db.now(), row.id);
  // The plan keeps working while Bachs retries; nothing new is given until a paid invoice.
  if (w && w.plan_id === row.plan_id && w.period_end < grace) db.update('workspaces', w.id, { period_end: grace });
  if (!row.past_due_since) {
    const owner = ws().owner(row.workspace_id); const p = ws().plan(row.plan_id);
    const amt = Number(o.amount_due ?? o.amount ?? row.amount_local);
    if (owner) mailer().send(owner.email, 'payment-failed', { name: (owner.name || '').split(' ')[0] || 'there', plan: p ? p.name : 'Replyvoo', amount: money(row.currency, amt > 0 ? amt : row.amount_local), grace_date: new Date(grace).toDateString(), card_url: config.appUrl + '/app/wallet' });
  }
  return { type: 'payment_failed' };
}

// ---------- Price follows the naira rate ----------
async function movePrice(row) {
  if (!row || !row.sub_id || row.status === 'canceled' || row.cancel_at_period_end) return null;
  const want = currentPrice(row.plan_id, row.interval, row.currency);
  // Over the Bachs cap (the new price, or the current one after the admin lowered the cap): never moved; one-off instead.
  if (bachs().overCap(want.amount, row.currency) || bachs().overCap(row.amount_local, row.currency)) return capFallback(row, want);
  const accepted = row.next_amount_local && /^Moving/.test(String(row.price_move || ''));
  if (!(want.amount > Number(accepted ? row.next_amount_local : row.amount_local) + 0.009)) return null;
  let productId;
  try { productId = await ensureProduct(ws().plan(row.plan_id), row.interval, row.currency, want.amount); }
  catch (e) { db.update('bachs_subscriptions', row.id, { price_move: ('Could not make the new price: ' + e.message).slice(0, 200) }); return null; }
  db.update('bachs_subscriptions', row.id, { next_amount_local: want.amount, next_product_id: productId, updated_at: db.now() });
  try {
    await api('PATCH', '/subscriptions/' + encodeURIComponent(row.sub_id), { product_id: productId, prorate: false }, 'rv_move_' + row.sub_id + '_' + productId);
    db.update('bachs_subscriptions', row.id, { price_move: 'Moving to ' + money(row.currency, want.amount) + ' from the next cycle' });
    return { moved: true };
  } catch (e) { db.update('bachs_subscriptions', row.id, { price_move: ('Bachs refused the price change: ' + e.message).slice(0, 200) }); return { moved: false }; }
}

// The renewal price would go over the Bachs cap: no new product, no move. The subscription ends at the end of the paid
// period, admin sees the flag, and the owner gets the plain renewal reminder (scheduler.renewalReminders' email, marked
// sent so it goes once). Bachs refusing the cancel is recorded and tried again at the next check.
async function capFallback(row, want) {
  const cap = '$' + bachs().maxUsd().toLocaleString('en-US', { maximumFractionDigits: 2 });
  try { await api('DELETE', '/subscriptions/' + encodeURIComponent(row.sub_id), { cancel_at_period_end: true }, 'rv_cancel_' + row.sub_id); }
  catch (e) {
    db.update('bachs_subscriptions', row.id, { flag: ('Renewal price ' + money(row.currency, want.amount) + ' would go over the Bachs limit of ' + cap + ' per payment. Not moved; Bachs did not accept turning auto-renew off (' + e.message + '). Tried again at the next check.').slice(0, 400), price_move: 'Over the Bachs limit: not moved', next_amount_local: null, next_product_id: null, updated_at: db.now() });
    return { moved: false, over_cap: true, cancelled: false };
  }
  db.update('bachs_subscriptions', row.id, { flag: 'Renewal price ' + money(row.currency, want.amount) + ' would go over the Bachs limit of ' + cap + ' per payment. Not moved to that price; auto-renew ends after this period and the customer pays one-off (reminder sent).', price_move: 'Over the Bachs limit: not moved', next_amount_local: null, next_product_id: null, cancel_at_period_end: 1, updated_at: db.now() });
  const w = ws().get(row.workspace_id);
  if (w && !(w.reminded_at && w.period_start && w.reminded_at >= w.period_start)) {
    const owner = ws().owner(row.workspace_id); const p = ws().plan(row.plan_id);
    db.update('workspaces', w.id, { reminded_at: db.now() });
    if (owner) mailer().send(owner.email, 'renewal-reminder', { name: (owner.name || '').split(' ')[0] || 'there', plan: p ? p.name : 'Replyvoo', renew_date: new Date(row.paid_through || w.period_end).toDateString(), renew_url: config.appUrl + '/app/plan' });
  }
  return { moved: false, over_cap: true, cancelled: true };
}

// ---------- Customer actions ----------
const forWorkspace = wsId => db.one("SELECT * FROM bachs_subscriptions WHERE workspace_id = ? AND sub_id IS NOT NULL AND status != 'canceled' ORDER BY id DESC LIMIT 1", wsId);
async function cancel(wsId) {
  const row = forWorkspace(wsId);
  if (!row) return null;
  await api('DELETE', '/subscriptions/' + encodeURIComponent(row.sub_id), { cancel_at_period_end: true }, 'rv_cancel_' + row.sub_id);
  db.update('bachs_subscriptions', row.id, { cancel_at_period_end: 1, updated_at: db.now() });
  return rowById(row.id);
}
async function cardUrl(wsId) {
  const row = forWorkspace(wsId);
  if (!row || !row.customer_id) return null;
  const d = await api('POST', '/customers/' + encodeURIComponent(row.customer_id) + '/portal-sessions', { return_url: config.appUrl + '/app/wallet' });
  return d.url || d.portal_url || null;
}
function summary(wsId) {
  const row = forWorkspace(wsId);
  if (!row) return null;
  const amount = Number(row.next_amount_local || row.amount_local);
  return { provider: 'bachs', status: row.status, interval: row.interval, cancel_at_period_end: !!row.cancel_at_period_end,
    next_charge_at: row.cancel_at_period_end ? null : (row.paid_through || row.current_period_end), next_amount: amount, currency: row.currency, next_amount_label: money(row.currency, amount), price_changed: !!row.next_amount_local,
    payment_failed: row.status === 'past_due' ? { since: row.past_due_since, grace_until: row.grace_until, message: 'Your last card payment did not go through. Bachs will try again. Update your card to keep your plan.' } : null };
}
// Workspaces whose renewals are handled here (the plain renewal reminder skips them).
const autoRenewing = wsId => !!db.one("SELECT id FROM bachs_subscriptions WHERE workspace_id = ? AND sub_id IS NOT NULL AND status IN ('active','trialing','past_due') AND cancel_at_period_end = 0", wsId);

// ---------- Scheduler ----------
// 3 days before each charge (and 7 days before a yearly one), with the amount to be charged; end of grace = plan ends
// the same way an expired plan does (workspace.ensurePeriod).
async function daily(t = Date.now()) {
  for (const row of db.all("SELECT * FROM bachs_subscriptions WHERE status IN ('active','trialing') AND cancel_at_period_end = 0 AND sub_id IS NOT NULL")) {
    const due = row.paid_through || row.current_period_end;
    if (!due) continue;
    const days = (Date.parse(due) - t) / DAY;
    const at = row.interval === 'year' ? [7, 3] : [3];
    const hit = at.find(d => days > d - 0.5 && days <= d + 0.5);
    if (hit === undefined) continue;
    const key = hit + ':' + String(due).slice(0, 10);
    if (String(row.reminded || '').split(',').includes(key)) continue;
    if (hit === at[0]) await movePrice(row).catch(e => console.warn('[bachs-subs] price', e.message));
    const fresh = rowById(row.id);
    db.update('bachs_subscriptions', row.id, { reminded: [row.reminded, key].filter(Boolean).join(',').slice(-400) });
    if (fresh.cancel_at_period_end) continue; // over the Bachs cap: one-off reminder instead of a card charge
    const owner = ws().owner(row.workspace_id); const p = ws().plan(row.plan_id);
    const amount = Number(fresh.next_amount_local || fresh.amount_local);
    const note = fresh.next_amount_local ? 'The price of your plan changed from ' + money(fresh.currency, fresh.amount_local) + ' to ' + money(fresh.currency, amount) + ' with the exchange rate, so this renewal is ' + money(fresh.currency, amount) + '.' : '';
    if (owner) mailer().send(owner.email, 'card-renews-soon', { name: (owner.name || '').split(' ')[0] || 'there', plan: p ? p.name : 'Replyvoo', amount: money(fresh.currency, amount), renew_date: new Date(due).toDateString(), days: String(hit), price_note: note, manage_url: config.appUrl + '/app/wallet' });
  }
  const nowIso = new Date(t).toISOString();
  for (const row of db.all("SELECT * FROM bachs_subscriptions WHERE status = 'past_due' AND grace_until IS NOT NULL AND grace_until <= ?", nowIso)) {
    db.update('bachs_subscriptions', row.id, { status: 'unpaid', updated_at: nowIso });
    const w = ws().get(row.workspace_id);
    if (w && w.plan_id === row.plan_id && Date.parse(w.period_end) > t) db.update('workspaces', w.id, { period_end: nowIso });
    if (w) ws().ensurePeriod(ws().get(w.id));
  }
}

function adminList(limit = 200) {
  return db.all(`SELECT s.id, s.workspace_id, w.name AS workspace, u.email, s.sub_id, s.plan_id, s.interval, s.status, s.currency, s.amount_local, s.next_amount_local,
      COALESCE(s.paid_through, s.current_period_end) AS next_charge_at, s.cancel_at_period_end, s.fail_count, s.last_failure, s.past_due_since, s.grace_until, s.price_move, s.flag, s.created_at
    FROM bachs_subscriptions s LEFT JOIN workspaces w ON w.id = s.workspace_id LEFT JOIN users u ON u.id = s.user_id WHERE s.sub_id IS NOT NULL ORDER BY s.id DESC LIMIT ?`, Math.min(500, Number(limit) || 200));
}

module.exports = { enabled, state, createCheckout, isSubEvent, handle, movePrice, cancel, cardUrl, summary, autoRenewing, daily, adminList, currentPrice, GRACE_DAYS };
