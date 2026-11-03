'use strict';
// Gatevoo: Zedapex's own crypto checkout. Replyvoo creates an invoice, the customer pays USDT (TRON) or Bitcoin
// on Gatevoo's hosted page, and Gatevoo tells us by signed webhook when the money has landed in our wallet.
// Contract (from Gatevoo's own code): POST /invoices { amount_usd, order_id, customer_*, description, redirect_url,
// metadata } → { id, status, checkout_url }. Webhooks carry X-Gatevoo-Timestamp (unix seconds) and X-Gatevoo-Signature =
// lowercase hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`), body { id, type, created, data: invoice }.
// Gatevoo's checkout page refuses iframes: always open checkout_url as a redirect (or a popup).
// Without keys (and with PAYMENTS_DEMO on) a local sandbox checkout stands in.
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');
const settings = require('./settings');

const COINS = {
  USDT_TRC20: { id: 'USDT_TRC20', label: 'USDT', network: 'TRON (TRC20)', explorer: 'https://tronscan.org/#/transaction/' },
  BTC: { id: 'BTC', label: 'Bitcoin', network: 'BTC mainnet', explorer: 'https://mempool.space/tx/' }
};
// Gatevoo invoice statuses: open, paid, expired, review. "review" (late, odd or duplicate payments) is never auto-credited.
const PAID = ['paid'];
const DEAD = ['expired', 'cancelled', 'canceled', 'failed'];
const TOLERANCE_USD = 0.01;
const SIG_WINDOW_S = 300;
// What the customer pays for an order: the base price plus the payment method's fee (Gatevoo's fee is always 0).
const dueUsd = o => Math.round((Number(o.amount_usd || 0) + Number(o.fee_usd || 0)) * 100) / 100;

const cfg = () => config.gatevoo;
const live = () => !!(cfg().apiKey && cfg().webhookSecret);
const sandbox = () => !live() && !!config.pay.demo;
function mode() { return live() ? 'live' : sandbox() ? 'sandbox' : 'off'; }

function coins() {
  const b = settings.get('billing');
  const out = [];
  if (b.gatevoo_usdt !== false) out.push('USDT_TRC20');
  if (b.gatevoo_btc !== false) out.push('BTC');
  return out;
}
function available() { return mode() !== 'off' && settings.get('billing').gatevoo_enabled !== false && coins().length > 0; }

function webhookUrl() { return config.appUrl + '/webhooks/gatevoo'; }
// The hosted checkout is always https on the live site. Off production a Gatevoo running on this machine (http://localhost or
// 127.0.0.1) is accepted too, so the real Gatevoo can be run next to Replyvoo for end-to-end tests (integration QA 2026-11-03).
function checkoutUrlOk(u) {
  const s = String(u || '');
  return /^https:\/\//.test(s) || (!config.isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(s));
}

async function api(method, path, body, idem) {
  const headers = { Authorization: 'Bearer ' + cfg().apiKey, Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (idem) headers['Idempotency-Key'] = idem;
  const ctl = AbortSignal.timeout(15000);
  let res;
  try { res = await fetch(cfg().apiUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl }); }
  catch { const e = new Error('Gatevoo could not be reached'); e.unreachable = true; throw e; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data.error && (data.error.message || data.error)) || data.message || ('Gatevoo error ' + res.status)); e.status = res.status; throw e; }
  return data.data || data;
}

// Start a payment. Returns { id, checkout_url, expires_at }.
async function createInvoice(order, user, coin) {
  const list = coins();
  const preferred = list.includes(coin) ? coin : undefined;
  if (mode() === 'sandbox') return { id: 'gv_sbx_' + order.ref, checkout_url: '/pay/gatevoo/' + encodeURIComponent(order.ref) + (preferred ? '?coin=' + preferred : ''), expires_at: new Date(Date.now() + 3600e3).toISOString() };
  const inv = await api('POST', '/invoices', {
    amount_usd: dueUsd(order),
    order_id: order.ref,
    customer_name: (user && user.name) || '',
    customer_email: (user && user.email) || '',
    description: 'Replyvoo · ' + order.item_name,
    redirect_url: config.appUrl + '/pay/callback?ref=' + encodeURIComponent(order.ref),
    metadata: { app: 'replyvoo', workspace_id: order.workspace_id, kind: order.kind, preferred_coin: preferred || null }
  }, 'replyvoo-' + order.ref);
  if (!inv || !inv.id || !checkoutUrlOk(inv.checkout_url)) throw new Error('Gatevoo returned an invalid invoice');
  return { id: String(inv.id), checkout_url: String(inv.checkout_url), expires_at: inv.expires_at || null };
}

async function getInvoice(id) { return api('GET', '/invoices/' + encodeURIComponent(id)); }

// X-Gatevoo-Signature: lowercase hex HMAC-SHA256(webhook secret, `${X-Gatevoo-Timestamp}.${raw body}`), no prefix.
// The timestamp is unix seconds; older than 5 minutes (or more than 5 minutes ahead) is refused.
function signatureOk(raw, signature, timestamp, now = Date.now()) {
  const secret = cfg().webhookSecret;
  const sig = String(signature || '').trim();
  const ts = String(timestamp == null ? '' : timestamp).trim();
  if (!secret || !/^[0-9a-f]{64}$/.test(sig) || !/^\d{9,11}$/.test(ts)) return false;
  if (Math.abs(now / 1000 - Number(ts)) > SIG_WINDOW_S) return false;
  const want = crypto.createHmac('sha256', secret).update(ts + '.').update(raw || Buffer.from('')).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}
// What Gatevoo sends: { timestamp, signature } for a raw body (used by tests and Admin tools).
function sign(raw, t = Math.floor(Date.now() / 1000), secret = cfg().webhookSecret) {
  return { timestamp: String(t), signature: crypto.createHmac('sha256', secret).update(String(t) + '.').update(raw).digest('hex') };
}
// Gatevoo names the paying coin "method" (e.g. "usdt_trc20", "USDT", "btc"). Map it to our coin ids.
function coinOf(method) {
  const m = String(method || '').toUpperCase();
  if (!m) return '';
  if (COINS[m]) return m;
  if (/BTC|BITCOIN/.test(m)) return 'BTC';
  if (/USDT|TRC/.test(m)) return 'USDT_TRC20';
  return m.slice(0, 20);
}

// Apply an invoice's state to its order. Safe to call many times (webhook, return page, "Check payment").
function settle(inv, via = 'gatevoo') {
  if (!inv) return { ok: false, reason: 'No invoice' };
  const ref = String(inv.order_id || '');
  const o = ref ? db.one('SELECT * FROM orders WHERE ref = ? AND provider = \'gatevoo\'', ref) : null;
  if (!o) return { ok: false, reason: 'Order not found' };
  if (o.provider_ref && inv.id && String(inv.id) !== o.provider_ref) return { ok: false, reason: 'Invoice does not match this order' };
  const paidUsd = Number(inv.amount_usd);
  const coin = coinOf(inv.method);
  const info = {
    coin: coin || null, tx_hash: inv.txid ? String(inv.txid).slice(0, 200) : null, tx_url: /^https:\/\//.test(String(inv.tx_url || '')) ? String(inv.tx_url).slice(0, 400) : null,
    paid_usd: isFinite(paidUsd) ? paidUsd : null, paid_amount: inv.pay_amount != null ? String(inv.pay_amount) : (inv.received != null ? String(inv.received) : null),
    paid_at: inv.paid_at || null, gv_status: String(inv.status || '')
  };
  const meta = { ...db.json(o.meta, {}), ...Object.fromEntries(Object.entries(info).filter(([, v]) => v != null && v !== '')) };
  if (o.status === 'paid') return { ok: true, order: o };
  if (o.status === 'refunded' || o.status === 'charged_back') return { ok: false, reason: 'This order was ' + (o.status === 'refunded' ? 'refunded' : 'charged back') + '.', order: o }; // final: never paid again
  const status = String(inv.status || '').toLowerCase();
  if (PAID.includes(status)) {
    if (!(info.paid_usd >= dueUsd(o) - TOLERANCE_USD)) {
      meta.underpaid = true;
      db.update('orders', o.id, { meta: JSON.stringify(meta) });
      return { ok: false, reason: 'Underpaid: received $' + (info.paid_usd || 0).toFixed(2) + ' of $' + dueUsd(o).toFixed(2) };
    }
    db.update('orders', o.id, { meta: JSON.stringify(meta) });
    require('./payments').fulfill(ref, { via, provider_ref: o.provider_ref || String(inv.id || '') });
    return { ok: true };
  }
  if (status === 'review') { meta.review = true; db.update('orders', o.id, { meta: JSON.stringify(meta) }); return { ok: false, reason: 'Gatevoo is reviewing this payment. Our team will check it.' }; }
  if (status === 'underpaid') { meta.underpaid = true; db.update('orders', o.id, { meta: JSON.stringify(meta) }); return { ok: false, reason: 'Underpaid' }; }
  if (DEAD.includes(status)) {
    db.run('UPDATE orders SET status = \'failed\', meta = ? WHERE id = ? AND status = \'pending\'', JSON.stringify(meta), o.id);
    return { ok: false, reason: 'Payment ' + status };
  }
  db.update('orders', o.id, { meta: JSON.stringify(meta) });
  return { ok: false, reason: 'Waiting for payment' };
}

async function verify(o) {
  if (!o.provider_ref || mode() !== 'live') return { ok: false, reason: 'Waiting for payment' };
  return settle(await getInvoice(o.provider_ref));
}

// Sandbox only: pretend Gatevoo saw the coins land.
function sandboxPay(ref, coin) {
  const o = db.one('SELECT * FROM orders WHERE ref = ? AND provider = \'gatevoo\'', ref);
  if (!o) return { ok: false };
  const c = COINS[coin] ? coin : coins()[0];
  return settle({ id: o.provider_ref, order_id: ref, status: 'paid', amount_usd: dueUsd(o), method: c, txid: 'sandbox_' + crypto.randomBytes(16).toString('hex'), pay_amount: c === 'BTC' ? (dueUsd(o) / 65000).toFixed(8) : dueUsd(o).toFixed(2) }, 'gatevoo-sandbox');
}

async function ping() {
  if (mode() === 'sandbox') return { ok: true, mode: 'sandbox', message: 'Sandbox mode: add GATEVOO_API_KEY and GATEVOO_WEBHOOK_SECRET to take real payments.' };
  if (mode() === 'off') return { ok: false, mode: 'off', message: 'GATEVOO_API_KEY and GATEVOO_WEBHOOK_SECRET are not set on the server.' };
  try { const me = await api('GET', '/me'); return { ok: true, mode: 'live', message: 'Connected' + (me && me.name ? ' as ' + me.name : '') + '.' }; }
  catch (e) { return { ok: false, mode: 'live', message: e.status === 401 ? 'Gatevoo rejected the API key.' : e.message }; }
}

function status() {
  return { mode: mode(), available: available(), coins: coins().map(c => COINS[c]), api_url: cfg().apiUrl, webhook_url: webhookUrl(), has_key: !!cfg().apiKey, has_secret: !!cfg().webhookSecret };
}

function txUrl(coin, hash) { return hash && COINS[coin] && !/^sandbox_/.test(hash) ? COINS[coin].explorer + encodeURIComponent(hash) : null; }

module.exports = { COINS, dueUsd, coinOf, mode, available, coins, createInvoice, getInvoice, settle, verify, signatureOk, sign, sandboxPay, ping, status, txUrl, webhookUrl };
