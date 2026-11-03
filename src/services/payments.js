'use strict';
// Checkout, payment providers (Paystack, Flutterwave, Gatevoo crypto, manual USDT, demo), order fulfilment, coupons, referrals.
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');
const ws = require('./workspace');
const settings = require('./settings');
const mailer = require('./mailer');
const { orderRef } = require('../lib/security');
const { HttpError } = require('../lib/http');
const gatevoo = require('./gatevoo');
const bachs = require('./bachs');

const DAY = 864e5;
const round2 = n => Math.round(n * 100) / 100;
// Add calendar months without rolling over (Jan 31 + 1 month = Feb 28/29, not Mar 3).
function addMonths(d, n) { const day = d.getDate(); const r = new Date(d); r.setDate(1); r.setMonth(r.getMonth() + n); const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate(); r.setDate(Math.min(day, last)); return r; }

// Countries Paystack can charge locally. Everyone else sees global methods first.
const PAYSTACK_LOCAL = ['NG', 'GH', 'KE', 'ZA', 'CI'];
const AFRICA = ['NG', 'GH', 'KE', 'ZA', 'CI', 'CM', 'UG', 'TZ', 'RW', 'SN', 'ZM', 'MW', 'EG', 'MA', 'ET', 'BJ', 'TG', 'BF', 'SL', 'LR', 'GA', 'CD', 'MZ', 'AO', 'BW', 'NA', 'ZW'];

// Payment methods for a buyer. country (ISO code from VooSquare sign-up) decides which ones show and in what order:
// Paystack only where it charges locally, Flutterwave first in the rest of Africa, USDT first everywhere else.
function providers(country) {
  const b = settings.get('billing');
  const cc = String(country || '').toUpperCase();
  const list = [];
  if (config.pay.paystackSecret && (!cc || PAYSTACK_LOCAL.includes(cc))) list.push({ id: 'paystack', name: 'Paystack', note: 'Card, bank transfer, USSD' });
  if (config.pay.flwSecret) list.push({ id: 'flutterwave', name: 'Flutterwave', note: cc && !AFRICA.includes(cc) ? 'Card, Apple Pay, Google Pay' : 'Card, mobile money, bank' });
  // Gatevoo (USDT or Bitcoin, confirmed automatically). The manual USDT option is only a backup while Gatevoo is off.
  // Bachs: African cards, bank transfer, mobile money, USDT/USDC. Nigeria pays in naira, the rest of its countries in USD.
  if (bachs.on() && bachs.servesCountry(cc)) list.push({ id: 'bachs', name: 'Bachs', note: 'Card, bank transfer, mobile money, USDT', currency: bachs.currencyFor(cc), card_auto_renew: (() => { try { return require('./bachs-subs').enabled(); } catch { return false; } })() });
  if (gatevoo.available()) list.push({ id: 'gatevoo', name: 'Crypto', note: gatevoo.coins().map(c => gatevoo.COINS[c].label).join(' or ') + ' · confirmed automatically', coins: gatevoo.coins().map(c => ({ id: c, label: gatevoo.COINS[c].label, network: gatevoo.COINS[c].network })), sandbox: gatevoo.mode() === 'sandbox' });
  else if (b.crypto_enabled && b.crypto_wallet) list.push({ id: 'crypto', name: 'USDT', note: b.crypto_network });
  const isCrypto = p => p.id === 'crypto' || p.id === 'gatevoo';
  if (cc && !AFRICA.includes(cc)) list.sort((x, y) => (isCrypto(x) ? -1 : 0) - (isCrypto(y) ? -1 : 0));
  if (config.pay.demo) list.push({ id: 'demo', name: 'Demo checkout', note: 'Test mode, no real money' });
  return list;
}

/*
 * Customer fee per payment method (Admin → Billing rules → Payment method fees). The fee is built into the price the
 * customer sees for that method: there is never a separate fee line on a customer page, receipt or email. Gatevoo is
 * always 0%; Joinvoo credits and free orders never carry a fee. The order keeps the base (amount_usd) and the fee
 * (fee_usd, fee_pct) apart: what is bought is worth the base, the customer pays base + fee.
 */
const MAX_FEE_PCT = 50;
const NO_FEE = ['gatevoo', 'joinvoo_credits', 'free'];
function feePct(provider) {
  if (!provider || NO_FEE.includes(provider)) return 0;
  const n = Number((settings.get('billing').method_fees || {})[provider]);
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_FEE_PCT, n) : 0;
}
// { pct, fee, total } for a base price in USD paid with this method. total = base × (1 + pct/100), to the cent.
function withFee(base, provider) {
  const pct = base > 0 ? feePct(provider) : 0;
  const total = round2(base * (1 + pct / 100));
  return { pct, fee: round2(total - base), total };
}
// What the customer paid in USD for an order (base + fee).
const paidUsd = o => round2(Number(o.amount_usd || 0) + Number(o.fee_usd || 0));

// Work out what is being bought and its price in USD (before coupon).
function quote(kind, itemId, interval) {
  if (kind === 'plan') {
    const p = ws.plan(itemId);
    if (!p || !p.active || p.id !== itemId) throw new HttpError(400, 'That plan is not available.');
    if (p.contact_sales) throw new HttpError(400, 'This plan is set up with our sales team. Please contact us.');
    const yearly = interval === 'year';
    let price = yearly ? p.price_year : p.price_month;
    if (price <= 0) throw new HttpError(400, 'This plan is free. No payment needed.');
    let offerOff = 0;
    if (p.offer && p.offer.percent > 0) { offerOff = round2(price * p.offer.percent / 100); price = round2(price - offerOff); }
    return { kind, item_id: p.id, item_name: p.name + ' plan (' + (yearly ? 'yearly' : 'monthly') + ')', interval: yearly ? 'year' : 'month', amount: price, offer: p.offer ? p.offer.label || p.offer.percent + '% off' : '' };
  }
  if (kind === 'pack') {
    const pk = db.one('SELECT * FROM packs WHERE id = ? AND active = 1', Number(itemId));
    if (!pk) throw new HttpError(400, 'That credit pack is not available.');
    return { kind, item_id: String(pk.id), item_name: pk.credits.toLocaleString('en-US') + (pk.bonus ? ' + ' + pk.bonus.toLocaleString('en-US') + ' bonus' : '') + ' Voo Credits', interval: '', amount: pk.price };
  }
  if (kind === 'addon') {
    const a = db.one('SELECT * FROM addons WHERE slug = ? AND active = 1', String(itemId));
    if (!a || a.status !== 'live' || a.price <= 0) throw new HttpError(400, 'That power-up is not available to buy online yet.');
    return { kind, item_id: a.slug, item_name: a.name, interval: '', amount: a.price };
  }
  throw new HttpError(400, 'Unknown item');
}

function checkCoupon(code, q, wsId) {
  if (!code) return null;
  const c = db.one('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE', String(code).trim());
  const bad = msg => { throw new HttpError(400, msg); };
  if (!c || !c.active) bad('That coupon code is not valid.');
  if (c.expires_at && new Date(c.expires_at) < new Date()) bad('That coupon has expired.');
  // Pending checkouts (last 2 days) count too, so several open checkouts can't beat the limit.
  const pendingUses = db.one("SELECT COUNT(*) n FROM orders WHERE coupon_id = ? AND status = 'pending' AND created_at > ?", c.id, new Date(Date.now() - 2 * DAY).toISOString()).n;
  if (c.max_uses > 0 && c.used + pendingUses >= c.max_uses) bad('That coupon has been fully used.');
  if (c.applies_to !== 'all' && c.applies_to !== q.kind) bad('That coupon does not apply to this purchase.');
  const ids = db.json(c.plan_ids, []);
  if (q.kind === 'plan' && ids.length && !ids.includes(q.item_id)) bad('That coupon does not apply to this plan.');
  // "First purchase" is per kind when the coupon is limited to plans or packs (e.g. "20% off your first paid plan").
  if (c.first_purchase_only) {
    const prior = c.applies_to === 'all'
      ? db.one("SELECT id FROM orders WHERE workspace_id = ? AND status = 'paid' AND (amount_usd > 0 OR coupon_id = ?)", wsId, c.id)
      : db.one("SELECT id FROM orders WHERE workspace_id = ? AND status = 'paid' AND kind = ? AND (amount_usd > 0 OR coupon_id = ?)", wsId, c.applies_to, c.id);
    if (prior) bad('That coupon is for first purchases only.');
    if (db.one("SELECT id FROM orders WHERE workspace_id = ? AND coupon_id = ? AND status = 'pending' AND created_at > ?", wsId, c.id, new Date(Date.now() - 2 * DAY).toISOString())) bad('You already have a checkout open with this coupon. Finish it, or wait a moment and try again.');
  }
  const off = c.kind === 'percent' ? round2(q.amount * Math.min(100, c.value) / 100) : Math.min(q.amount, round2(c.value));
  return { coupon: c, discount: off };
}

function preview(wsId, { kind, item_id, interval, coupon }, country) {
  const q = quote(kind, item_id, interval);
  const cp = checkCoupon(coupon, q, wsId);
  const discount = cp ? cp.discount : 0;
  const total = round2(Math.max(0, q.amount - discount));
  // Each method carries its own prices, fee already built in, so switching method updates the total the customer sees.
  // price and discount are scaled the same way, and discount = price − total, so the lines always add up.
  let list = providers(country).map(p => {
    const f = withFee(total, p.id);
    const price = round2(q.amount * (1 + f.pct / 100));
    const out = { ...p, price, discount: discount ? round2(price - f.total) : 0, total: f.total };
    // Bachs in naira: show the exact naira amount the customer will pay.
    if (p.id === 'bachs' && p.currency === 'NGN') { const ngn = bachs.localAmount(f.total, 'NGN'); out.amount_local = ngn; out.note = '₦' + ngn.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' · card, bank transfer, USSD, USDT'; }
    // Bachs payment cap: over it, Bachs is disabled for this amount (one plain line says why); the other methods stay.
    if (p.id === 'bachs' && bachs.overCap(bachs.localAmount(f.total, p.currency), p.currency)) Object.assign(out, { disabled: true, over_cap: true, cap_note: bachs.capMessage(), card_auto_renew: false });
    return out;
  });
  // Gatevoo: a small positive note when crypto really is cheaper than another method shown ("save" is measured
  // against the dearest one, as a share of that price).
  const top = Math.max(0, ...list.filter(p => p.id !== 'gatevoo').map(p => p.total));
  list = list.map(p => {
    if (p.id !== 'gatevoo' || !(top > p.total)) return p;
    const save = Math.round((top - p.total) / top * 100);
    return save >= 1 ? { ...p, save_pct: save, save_note: 'Pay with crypto and save ' + save + '%' } : p;
  });
  const capped = list.find(p => p.over_cap);
  return { ...q, discount, total, coupon: cp ? cp.coupon.code : null, providers: list, ...(capped ? { cap_note: capped.cap_note } : {}) };
}

async function checkout(wsId, user, body) {
  const pv = preview(wsId, body, user && user.country);
  const methods = providers(user && user.country);
  const usable = methods.filter(p => !(pv.providers.find(x => x.id === p.id) || {}).over_cap);
  const prov = body.provider || (pv.total === 0 ? 'free' : (usable[0] || methods[0] || {}).id);
  if (pv.total > 0 && !methods.some(p => p.id === prov)) throw new HttpError(400, 'Payments are not set up yet. Please contact support.');
  const b = settings.get('billing');
  const cp = pv.coupon ? db.one('SELECT id FROM coupons WHERE code = ? COLLATE NOCASE', pv.coupon) : null;
  let currency = 'USD';
  if (prov === 'paystack') currency = b.paystack_currency || 'NGN';
  if (prov === 'flutterwave') currency = b.flutterwave_currency || 'USD';
  if (prov === 'bachs') currency = bachs.currencyFor(user && user.country);
  const rate = currency === 'USD' ? 1 : prov === 'bachs' ? bachs.ngnRate() : Number(b.rates && b.rates[currency]);
  if (!(rate > 0)) throw new HttpError(500, 'Checkout is not set up for ' + currency + ' yet. Please contact support.');
  // amount_usd is the base (what is bought is worth this); the method's fee is kept apart and paid on top.
  const fee = withFee(pv.total, pv.total === 0 ? 'free' : prov);
  // Bachs payment cap: the final total (fee inside, naira at this checkout's rate) must fit, or no order is made.
  if (prov === 'bachs' && pv.total > 0 && bachs.overCap(currency === 'USD' ? fee.total : Math.round(fee.total * rate * 100) / 100, currency)) throw bachs.capError();
  const order = {
    ref: orderRef(), workspace_id: wsId, user_id: user.id, kind: pv.kind, item_id: pv.item_id, item_name: pv.item_name, interval: pv.interval,
    amount_usd: pv.total, fee_usd: fee.fee, fee_pct: fee.pct, discount_usd: pv.discount, coupon_id: cp ? cp.id : null, currency, amount_local: currency === 'USD' ? fee.total : Math.round(fee.total * rate * 100) / 100,
    provider: pv.total === 0 ? 'free' : prov, status: 'pending', created_at: db.now()
  };
  // Tapping "Pay" again for the same thing reuses the open checkout instead of leaving a pile of "Pending" orders.
  const again = pv.total > 0 && db.one("SELECT * FROM orders WHERE workspace_id = ? AND status = 'pending' AND kind = ? AND item_id = ? AND interval = ? AND provider = ? AND amount_usd = ? AND fee_usd = ? AND COALESCE(coupon_id, 0) = ? AND created_at > ? ORDER BY id DESC LIMIT 1",
    wsId, order.kind, order.item_id, order.interval || '', order.provider, order.amount_usd, order.fee_usd, order.coupon_id || 0, new Date(Date.now() - 3600e3).toISOString());
  if (again && prov === 'demo') return { redirect: '/pay/demo/' + again.ref, ref: again.ref, reused: true };
  if (again) { const m = db.json(again.meta, {}); if (m.checkout_url && (!m.expires_at || new Date(m.expires_at) > new Date(Date.now() + 5 * 60e3))) return { redirect: m.checkout_url, ref: again.ref, reused: true }; }
  if (again) db.run("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'", again.id);
  order.id = db.insert('orders', order);
  if (pv.total === 0) { fulfill(order.ref, { via: 'free' }); return { done: true, ref: order.ref }; }
  const callback = config.appUrl + '/pay/callback?ref=' + order.ref;
  if (prov === 'demo') return { redirect: '/pay/demo/' + order.ref, ref: order.ref };
  if (prov === 'gatevoo') {
    let inv;
    try { inv = await gatevoo.createInvoice(order, user, body.coin); }
    catch (e) { db.run('UPDATE orders SET status = \'failed\' WHERE id = ?', order.id); throw new HttpError(502, e.unreachable ? 'Gatevoo could not be reached. Please try again in a moment.' : 'Gatevoo could not start the payment: ' + e.message); }
    db.update('orders', order.id, { provider_ref: inv.id, meta: JSON.stringify({ checkout_url: inv.checkout_url, expires_at: inv.expires_at, coin: body.coin || null }) });
    return { redirect: inv.checkout_url, ref: order.ref };
  }
  if (prov === 'bachs') {
    let co;
    // Card auto-renew: a monthly or yearly plan with "Renew automatically" on (the default, no coupon) starts a Bachs
    // subscription checkout (cards only). If Bachs cannot do it right now, it quietly becomes the one-off payment below.
    if (order.kind === 'plan' && order.interval && body.auto_renew !== false && !order.coupon_id) {
      const subs = require('./bachs-subs');
      if (subs.enabled()) {
        try { co = await subs.createCheckout(order, user); co.recurring = true; }
        catch (e) { if (e.overCap) { db.update('orders', order.id, { status: 'failed', meta: JSON.stringify({ error: e.message }) }); throw e; } if (!e.fallback) { db.update('orders', order.id, { status: 'failed', meta: JSON.stringify({ error: String(e.message).slice(0, 200) }) }); throw new HttpError(502, 'Bachs could not start the payment. Please try again.'); } console.warn('[bachs] auto-renew unavailable, one-off instead:', e.message); co = null; }
      }
    }
    try { if (!co) co = await bachs.createCheckout(order, user); }
    catch (e) { if (e.overCap) { db.update('orders', order.id, { status: 'failed', meta: JSON.stringify({ error: e.message }) }); throw e; } db.update('orders', order.id, { status: 'failed', meta: JSON.stringify({ error: String(e.message).slice(0, 200) }) }); throw new HttpError(502, 'Bachs could not start the payment. Please try again.'); }
    db.update('orders', order.id, { provider_ref: co.id, meta: JSON.stringify({ checkout_url: co.url, expires_at: new Date(Date.now() + 3600e3).toISOString() }) });
    return { redirect: co.url, ref: order.ref, currency, amount_local: order.amount_local, auto_renew: !!co.recurring };
  }
  if (prov === 'crypto') return { ref: order.ref, instructions: { network: b.crypto_network, wallet: b.crypto_wallet, amount: fee.total, currency: 'USDT', note: 'Send exactly this amount and put ' + order.ref + ' in your message to support. Your order is activated after we confirm the transfer.' } };
  // Provider unreachable (network error): friendly 502 and drop the pending order.
  const call = async (name, url, init) => {
    try { return await fetch(url, init); }
    catch (e) { db.run('UPDATE orders SET status = \'failed\' WHERE id = ?', order.id); throw new HttpError(502, name + ' could not be reached. Please try again in a moment.'); }
  };
  if (prov === 'paystack') {
    const res = await call('Paystack', 'https://api.paystack.co/transaction/initialize', { method: 'POST', headers: { Authorization: 'Bearer ' + config.pay.paystackSecret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, amount: Math.round(order.amount_local * 100), currency, reference: order.ref, callback_url: callback, metadata: { order_ref: order.ref, workspace_id: wsId } }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.status) { db.run('UPDATE orders SET status = \'failed\' WHERE id = ?', order.id); throw new HttpError(502, 'Paystack could not start the payment: ' + (data.message || res.status)); }
    return { redirect: data.data.authorization_url, ref: order.ref };
  }
  if (prov === 'flutterwave') {
    const res = await call('Flutterwave', 'https://api.flutterwave.com/v3/payments', { method: 'POST', headers: { Authorization: 'Bearer ' + config.pay.flwSecret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_ref: order.ref, amount: order.amount_local, currency, redirect_url: callback, customer: { email: user.email, name: user.name }, customizations: { title: 'Replyvoo', description: pv.item_name } }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'success') { db.run('UPDATE orders SET status = \'failed\' WHERE id = ?', order.id); throw new HttpError(502, 'Flutterwave could not start the payment: ' + (data.message || res.status)); }
    return { redirect: data.data.link, ref: order.ref };
  }
  throw new HttpError(400, 'Unknown payment method');
}

// Ask the provider whether an order was really paid.
async function verify(ref) {
  const o = db.one('SELECT * FROM orders WHERE ref = ?', ref);
  if (!o) return { ok: false, reason: 'Order not found' };
  if (o.status === 'paid') return { ok: true, order: o };
  if (o.status === 'refunded' || o.status === 'charged_back') return { ok: false, reason: 'This order was ' + (o.status === 'refunded' ? 'refunded' : 'charged back') + '.', order: o };
  if (o.provider === 'paystack' && config.pay.paystackSecret) {
    const res = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(ref), { headers: { Authorization: 'Bearer ' + config.pay.paystackSecret } });
    const data = await res.json().catch(() => ({}));
    const d = data.data || {};
    if (d.status === 'success' && d.currency === o.currency && d.amount >= Math.round(o.amount_local * 100) - 1) {
      const auth = d.authorization && d.authorization.reusable ? { code: d.authorization.authorization_code, email: d.customer && d.customer.email } : null;
      fulfill(ref, { via: 'paystack', provider_ref: String(d.id || ''), auth });
      return { ok: true };
    }
    return { ok: false, reason: d.gateway_response || 'Payment not completed' };
  }
  if (o.provider === 'flutterwave' && config.pay.flwSecret) {
    const res = await fetch('https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=' + encodeURIComponent(ref), { headers: { Authorization: 'Bearer ' + config.pay.flwSecret } });
    const data = await res.json().catch(() => ({}));
    const d = data.data || {};
    if (d.status === 'successful' && d.currency === o.currency && Number(d.amount) >= o.amount_local - 0.01) { fulfill(ref, { via: 'flutterwave', provider_ref: String(d.id || '') }); return { ok: true }; }
    return { ok: false, reason: 'Payment not completed' };
  }
  if (o.provider === 'gatevoo') {
    try { return await gatevoo.verify(o); } catch (e) { return { ok: false, reason: e.message }; }
  }
  if (o.provider === 'bachs') {
    try { return await bachs.verify(o); } catch (e) { return { ok: false, reason: e.message }; }
  }
  return { ok: false, reason: 'Waiting for confirmation' };
}

function paystackSignatureOk(raw, sig) {
  if (!config.pay.paystackSecret || !sig) return false;
  const h = crypto.createHmac('sha512', config.pay.paystackSecret).update(raw).digest('hex');
  return h.length === String(sig).length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(String(sig)));
}
function flutterwaveSignatureOk(sig) {
  if (!config.pay.flwHash || !sig) return false;
  const a = Buffer.from(config.pay.flwHash); const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Only these orders may still be paid. A paid, refunded or charged-back order is final.
const FULFILLABLE = ['pending', 'failed', 'cancelled'];
// Give the customer what they paid for. Safe to call more than once.
function fulfill(ref, info = {}) {
  let order;
  const changed = db.tx(() => {
    order = db.one('SELECT * FROM orders WHERE ref = ?', ref);
    if (!order || !FULFILLABLE.includes(order.status)) return false; // paid, refunded or charged back: never again (a replayed webhook must not re-credit)
    // Claim it atomically: only one call can move the order out of pending/failed/cancelled.
    const claim = db.run("UPDATE orders SET status = 'paid', paid_at = ?, provider_ref = ?, meta = ? WHERE id = ? AND status IN ('pending', 'failed', 'cancelled')", db.now(), info.provider_ref || order.provider_ref, JSON.stringify({ ...db.json(order.meta, {}), via: info.via || order.provider }), order.id);
    if (!claim.changes) return false;
    const w = ws.get(order.workspace_id);
    if (order.kind === 'plan') {
      const months = order.interval === 'year' ? 12 : 1;
      const now = Date.now();
      const active = new Date(w.period_end).getTime() > now;
      const sameActive = w.plan_id === order.item_id && active;
      const start = sameActive ? new Date(w.period_start).getTime() : now;
      const endBase = sameActive ? new Date(w.period_end).getTime() : now;
      const end = addMonths(new Date(endBase), months);
      // Switching from another paid plan: the unused time on it is kept as extra days on the new plan (by value).
      if (!sameActive && active) {
        const oldP = ws.plan(w.plan_id); const newP = ws.plan(order.item_id);
        const perDay = (p, iv) => p ? (iv === 'year' ? (p.price_year || p.price_month * 12) / 365 : p.price_month / 30) : 0;
        const oldDay = perDay(oldP, w.plan_interval); const newDay = perDay(newP, order.interval);
        const leftDays = (new Date(w.period_end).getTime() - now) / DAY;
        if (oldDay > 0 && newDay > 0 && leftDays > 0) end.setTime(end.getTime() + Math.round(leftDays * oldDay / newDay * DAY));
      }
      db.update('workspaces', w.id, { plan_id: order.item_id, plan_interval: order.interval || 'month', period_start: new Date(start).toISOString(), period_end: end.toISOString(), conv_used: sameActive ? w.conv_used : 0, pro_used: sameActive ? w.pro_used : 0, usage_reset_at: sameActive ? (w.usage_reset_at || w.period_start) : new Date(start).toISOString(), status: w.status === 'suspended' ? 'suspended' : 'active', reminded_at: null });
      ws.event(w.id, 'plan', 'You are on the ' + order.item_name + '. Enjoy!', {});
    } else if (order.kind === 'pack') {
      const pk = db.one('SELECT * FROM packs WHERE id = ?', Number(order.item_id));
      const total = pk ? pk.credits + pk.bonus : 0;
      if (total) ws.addCredits(w.id, total, 'Top-up: ' + order.item_name, order.ref);
      ws.event(w.id, 'credits', total.toLocaleString('en-US') + ' credits added to your Voo Wallet', {});
    } else if (order.kind === 'addon') {
      applyAddon(w, order.item_id, order.ref);
    }
    if (order.coupon_id) db.run('UPDATE coupons SET used = used + 1 WHERE id = ?', order.coupon_id);
    if (info.auth) ws.saveSettings(w.id, { paystack_auth: info.auth });
    return true;
  });
  if (!changed) return false;
  // Replyvoo's own referral programme (Voo Squad) keeps paying its own rewards in credits. VooSquare's affiliate
  // programme is separate and paid by VooSquare (VOO_CONNECT.md, section 3e: both run, each under its own rules).
  try { payReferral(order); } catch (e) { console.error('[referral]', e.message); }
  // VooSquare money events (spend + plan_started / plan_renewed, wallet_topup for credit packs). Never breaks a payment.
  try { require('./voosquare').paymentEvents(db.one('SELECT * FROM orders WHERE id = ?', order.id)); } catch (e) { console.error('[voosquare] payment', e.message); }
  const u = order.user_id ? db.one('SELECT * FROM users WHERE id = ?', order.user_id) : ws.owner(order.workspace_id);
  if (u && order.amount_usd > 0) {
    const pk = order.kind === 'pack' ? db.one('SELECT * FROM packs WHERE id = ?', Number(order.item_id)) : null;
    mailer.send(u.email, 'payment-receipt', { name: (u.name || '').split(' ')[0] || 'there', item: order.item_name, amount: order.amount_local.toFixed(2), currency: order.currency, reference: order.ref, date: new Date().toDateString(), credits_added: pk ? (pk.credits + pk.bonus).toLocaleString('en-US') : '', dashboard_url: config.appUrl + '/app' });
  }
  return true;
}

function applyAddon(w, slug, ref) {
  if (slug === 'extra-closer') {
    const slots = (w.settings.slots || []).filter(s => new Date(s.exp) > new Date());
    slots.push({ exp: new Date(Date.now() + 30 * DAY).toISOString(), ref });
    ws.saveSettings(w.id, { slots });
  } else if (slug === 'website-chat') {
    const webSlots = (w.settings.web_slots || []).filter(s => new Date(s.exp) > new Date());
    webSlots.push({ exp: new Date(Date.now() + 30 * DAY).toISOString(), ref });
    ws.saveSettings(w.id, { web_slots: webSlots });
  } else if (slug === 'extra-seat') {
    // 30 days, like the other monthly power-ups (admin-granted permanent seats live in workspaces.extra_seats).
    const seatSlots = (w.settings.seat_slots || []).filter(s => new Date(s.exp) > new Date());
    seatSlots.push({ exp: new Date(Date.now() + 30 * DAY).toISOString(), ref });
    ws.saveSettings(w.id, { seat_slots: seatSlots });
  } else {
    const owned = w.settings.addons || [];
    owned.push({ slug, ref, at: db.now() });
    ws.saveSettings(w.id, { addons: owned });
  }
  // Done-for-you setup is a service: open a ticket in the "Setup help" box so the team picks it up.
  if (slug === 'done-for-you') {
    setImmediate(() => {
      try {
        const o = ws.owner(w.id) || {};
        const box = db.one("SELECT id FROM support_boxes WHERE name = 'Setup help' AND active = 1");
        require('./support').intake({ source: 'dashboard', subject: 'Done-for-you setup purchased (' + ref + ')', text: (o.name || 'A customer') + ' bought Done-for-you setup for the workspace "' + w.name + '". Reach out to schedule the build, then train and test their first Closers.', name: o.name || '', email: o.email || '', userId: o.id || null, workspaceId: w.id, boxId: box ? box.id : null, priority: 'high', meta: { order: ref } });
      } catch (e) { console.error('[done-for-you]', e.message); }
    });
  }
  const a = db.one('SELECT * FROM addons WHERE slug = ?', slug);
  if (a && a.credits > 0) ws.addCredits(w.id, a.credits, 'Power-up: ' + a.name, ref);
  ws.event(w.id, 'addon', 'Power-up added: ' + slug.replace(/-/g, ' '), {});
}

function referralRate(referrerWs) {
  const b = settings.get('billing');
  const paying = db.one('SELECT COUNT(DISTINCT referee_ws) n FROM referral_earnings WHERE referrer_ws = ?', referrerWs).n;
  const tiers = (b.referral_tiers || []).slice().sort((a, c) => c.min - a.min);
  const t = tiers.find(x => paying >= x.min);
  return t ? t.rate : 0.2;
}

function payReferral(order) {
  if (!order || order.amount_usd <= 0) return;
  const w = ws.get(order.workspace_id);
  if (!w.referred_by || w.referred_by === w.id) return;
  if (db.one('SELECT id FROM referral_earnings WHERE order_id = ?', order.id)) return;
  const rate = referralRate(w.referred_by);
  const usd = round2(order.amount_usd * rate);
  const value = settings.get('billing').credit_value_usd || 0.03;
  const credits = Math.floor(usd / value);
  if (credits <= 0) return;
  db.insert('referral_earnings', { referrer_ws: w.referred_by, referee_ws: w.id, order_id: order.id, rate, amount_usd: usd, credits, created_at: db.now() });
  ws.addCredits(w.referred_by, credits, 'Voo Squad reward', order.ref);
  ws.event(w.referred_by, 'squad', 'You earned ' + credits.toLocaleString('en-US') + ' credits from a Voo Squad referral', {});
  const o = ws.owner(w.referred_by);
  if (o) mailer.send(o.email, 'referral-reward', { name: (o.name || '').split(' ')[0] || 'there', friend: w.name, reward: credits.toLocaleString('en-US') + ' credits', squad_url: config.appUrl + '/app/squad' });
}

// Auto Top-up through a saved Paystack authorization (only when the customer turned it on).
async function autoTopup(wsId) {
  const w = ws.get(wsId);
  if (!w.auto_topup || !config.pay.paystackSecret || !w.settings.paystack_auth) return false;
  const last = w.settings.auto_topup_at;
  if (last && Date.now() - new Date(last).getTime() < 6 * 3600e3) return false;
  ws.saveSettings(wsId, { auto_topup_at: db.now() });
  const packId = w.settings.auto_topup_pack || (db.one('SELECT id FROM packs WHERE active = 1 ORDER BY sort, price LIMIT 1 OFFSET 1') || {}).id;
  if (!packId) return false;
  const q = quote('pack', packId);
  const b = settings.get('billing');
  const currency = b.paystack_currency || 'NGN';
  const rate = (b.rates && b.rates[currency]) || 1;
  const ref = orderRef();
  const fee = withFee(q.amount, 'paystack');
  const amountLocal = currency === 'USD' ? fee.total : Math.round(fee.total * rate * 100) / 100;
  db.insert('orders', { ref, workspace_id: wsId, user_id: w.owner_id, kind: 'pack', item_id: q.item_id, item_name: q.item_name + ' (Auto Top-up)', interval: '', amount_usd: q.amount, fee_usd: fee.fee, fee_pct: fee.pct, currency, amount_local: amountLocal, provider: 'paystack', status: 'pending', created_at: db.now() });
  const res = await fetch('https://api.paystack.co/transaction/charge_authorization', { method: 'POST', headers: { Authorization: 'Bearer ' + config.pay.paystackSecret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorization_code: w.settings.paystack_auth.code, email: w.settings.paystack_auth.email, amount: Math.round(amountLocal * 100), currency, reference: ref }) });
  const data = await res.json().catch(() => ({}));
  if (data.data && data.data.status === 'success') { fulfill(ref, { via: 'paystack-auto', provider_ref: String(data.data.id || '') }); return true; }
  return false;
}

/*
 * Money returned (refund) or taken back by the card network (chargeback) for a paid order. Recorded by finance staff in
 * Admin → Orders (or by a provider webhook). Once per order. What was bought is taken back: credits from a pack (never
 * below zero), the rest of a plan's period (the workspace goes back to the free plan), a power-up's slot. A chargeback
 * also reverses the Voo Squad reward paid for that order. VooSquare gets a refund event (commission stays) or a
 * chargeback event (commission reversed).
 */
function reverse(ref, kind, { by = null, amountUsd = null, note = '' } = {}) {
  if (!['refund', 'chargeback'].includes(kind)) throw new HttpError(400, 'Unknown action');
  let order; let value = 0; let baseValue = 0;
  const done = db.tx(() => {
    order = db.one('SELECT * FROM orders WHERE ref = ?', String(ref));
    if (!order) throw new HttpError(404, 'Order not found');
    if (order.status === 'refunded' || order.status === 'charged_back') return false;
    if (order.status !== 'paid') throw new HttpError(400, 'Only a paid order can be ' + (kind === 'refund' ? 'refunded.' : 'charged back.'));
    // The customer gets back what they paid: base + the method's fee (a partial amount is capped at that).
    const paid = paidUsd(order);
    value = amountUsd != null && Number(amountUsd) > 0 ? Math.min(paid, round2(Number(amountUsd))) : paid;
    // The part of it that was the base price (VooSquare is only ever told about the base).
    baseValue = paid > 0 ? Math.min(order.amount_usd, round2(value * order.amount_usd / paid)) : 0;
    const w = ws.get(order.workspace_id);
    const why = (kind === 'refund' ? 'Refund' : 'Chargeback') + ': ' + order.item_name;
    if (order.kind === 'pack') {
      const pk = db.one('SELECT * FROM packs WHERE id = ?', Number(order.item_id));
      const given = pk ? pk.credits + pk.bonus : 0;
      if (given) ws.addCredits(w.id, -Math.min(given, w.credits), why, order.ref);
    } else if (order.kind === 'plan') {
      // Only the plan this order paid for, and only while it is still running.
      if (w.plan_id === order.item_id && new Date(w.period_end) > new Date()) db.update('workspaces', w.id, { period_end: new Date().toISOString() });
    } else if (order.kind === 'addon') {
      const keep = l => (l || []).filter(x => x.ref !== order.ref);
      ws.saveSettings(w.id, { slots: keep(w.settings.slots), web_slots: keep(w.settings.web_slots), seat_slots: keep(w.settings.seat_slots), addons: keep(w.settings.addons) });
    }
    if (kind === 'chargeback') {
      const re = db.one('SELECT * FROM referral_earnings WHERE order_id = ?', order.id);
      if (re) { ws.addCredits(re.referrer_ws, -re.credits, 'Voo Squad reward reversed (payment charged back)', order.ref); db.run('DELETE FROM referral_earnings WHERE id = ?', re.id); }
    }
    db.update('orders', order.id, { status: kind === 'refund' ? 'refunded' : 'charged_back', meta: JSON.stringify({ ...db.json(order.meta, {}), [kind]: { usd: value, base_usd: baseValue, fee_usd: round2(value - baseValue), at: db.now(), by, note: String(note || '').slice(0, 200) } }) });
    ws.event(w.id, 'plan', (kind === 'refund' ? 'Refunded: ' : 'Charged back: ') + order.item_name, {});
    return true;
  });
  if (!done) return { ok: true, already: true };
  const voo = require('./voosquare');
  try { if (kind === 'refund') voo.refundEvent(order, baseValue); else voo.chargebackEvent(order, baseValue); } catch (e) { console.error('[voosquare] reverse', e.message); }
  require('./workspace').ensurePeriod(ws.get(order.workspace_id));
  // Paid with Joinvoo credits: the refund goes back as Joinvoo credits (signed call to Joinvoo, retried until it lands).
  if (order.provider === 'joinvoo_credits' && kind === 'refund') { const jv = require('./joinvoo'); jv.refundToJoinvoo(db.one('SELECT * FROM orders WHERE id = ?', order.id), value).catch(e => console.warn('[joinvoo] refund', e.message)); }
  return { ok: true, status: kind === 'refund' ? 'refunded' : 'charged_back', usd: value, ...(order.provider === 'joinvoo_credits' && kind === 'refund' ? { back_to: 'joinvoo_credits' } : {}) };
}

module.exports = { reverse, providers, feePct, withFee, paidUsd, quote, preview, checkout, verify, fulfill, paystackSignatureOk, flutterwaveSignatureOk, referralRate, autoTopup, applyAddon };
