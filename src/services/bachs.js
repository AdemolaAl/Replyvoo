'use strict';
/*
 * Bachs (bachs.io): a hosted checkout for African cards, bank transfer, mobile money and USDT/USDC. Same rules as Castvoo's
 * Bachs provider (castvoo-app server/services/bachs.js), on Replyvoo's own orders.
 *
 * WHO SEES IT. Customers in the African countries Bachs serves (the list below, editable in Admin → Connections → Bachs),
 * and customers whose country we don't know yet. Nigeria pays in naira (NGN) at the admin's rate (Billing rules →
 * Currencies, "NGN", unless a Bachs-only rate is set); everyone else pays in US dollars (Bachs offers its own local options
 * on its page). Plans, credits and power-ups are always worth the USD price. Bachs carries the customer fee set in
 * Billing rules → Payment method fees (4% by default, any currency: it covers Bachs's fees and FX risk). The fee is built into
 * the price the customer sees; the order keeps it apart (fee_usd) and amount_local is base + fee at the same naira rate.
 *
 * KEYS. Admin → Connections → Bachs (owners only) saves the secret key and the webhook signing secret encrypted (AES-256-GCM)
 * in the settings table ("bachs_keys"). BACHS_SECRET_KEY and BACHS_WEBHOOK_SECRET are the fallback. No API ever returns
 * them: only their last 4 characters and where they come from.
 *
 * SHOWN ONLY when both keys are set, "Show Bachs to customers" is on and the key is a live key (a sandbox key only with
 * BACHS_ALLOW_SANDBOX=true, since test payments would give real plans and credits).
 *
 * API. sk_live_ → https://api.bachs.io/v1, sk_sandbox_ → https://sandbox-api.bachs.io/v1 (BACHS_API_BASE: tests only).
 *   POST /checkout-sessions        start a checkout (payments.checkout)
 *   GET  /checkout-sessions/:id    read it back with our own key before giving anything (verify below)
 * WEBHOOK  POST /webhooks/bachs. X-Bachs-Signature = hex HMAC-SHA256(webhook secret, "<X-Bachs-Timestamp>.<raw body>"),
 * at most 5 minutes old ("Bachs-Signature" / "Bachs-Timestamp" and the "t=…,v1=…" form are accepted too). A webhook only
 * makes us ASK Bachs; the order is fulfilled from Bachs's own answer, once (payments.fulfill is idempotent).
 */
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');
const settings = require('./settings');
const { encrypt, decrypt, safeEqual } = require('../lib/security');
const { HttpError } = require('../lib/http');

const ROW = 'bachs_keys';
const KEY_RE = /^sk_(live|sandbox)_[\w-]{8,}$/;
const WEBHOOK_RE = /^whsec_[\w-]{8,}$/;
const LIVE = 'https://api.bachs.io';
const SANDBOX = 'https://sandbox-api.bachs.io';
// The African countries Bachs serves (same list as Castvoo). Nigeria is priced in naira, the rest in US dollars.
const COUNTRIES = ['NG', 'KE', 'GH', 'ZA', 'CM', 'UG', 'TZ', 'RW', 'ZM', 'ET', 'EG', 'MA', 'CI', 'SN', 'BJ', 'TG', 'SL', 'LR', 'ZW', 'BW'];
const NAIRA = ['NG'];
const PAID = ['COMPLETED', 'SUCCEEDED', 'PAID'];
const DEAD = ['FAILED', 'EXPIRED', 'CANCELLED', 'CANCELED'];

const isSandbox = key => /^sk_sandbox_/.test(String(key || ''));
const baseFor = key => String(config.bachs.apiBase || (isSandbox(key) ? SANDBOX : LIVE)).replace(/\/+$/, '') + '/v1';
const open = b => { if (!b) return ''; try { return decrypt(b); } catch { return ''; } };
const hint = v => (v ? '…' + String(v).slice(-4) : '');
function saved() { const r = db.one('SELECT value FROM settings WHERE key = ?', ROW); return { enabled: false, key_enc: '', webhook_secret_enc: '', countries: COUNTRIES, ngn_rate: 0, ...(r ? db.json(r.value, {}) : {}) }; }

function resolve() {
  const s = saved();
  const savedKey = open(s.key_enc); const savedHook = open(s.webhook_secret_enc);
  const secretKey = savedKey || config.bachs.secretKey || '';
  const webhookSecret = savedHook || config.bachs.webhookSecret || '';
  const configured = !!(secretKey && webhookSecret);
  const sandbox = isSandbox(secretKey);
  const enabled = s.enabled === true;
  return {
    secretKey, webhookSecret, configured, sandbox, enabled, base: baseFor(secretKey),
    countries: Array.isArray(s.countries) ? s.countries : COUNTRIES, ngnRate: Number(s.ngn_rate) > 0 ? Number(s.ngn_rate) : 0,
    keySource: savedKey ? 'admin' : secretKey ? 'env' : '', webhookSource: savedHook ? 'admin' : webhookSecret ? 'env' : '',
    on: configured && enabled && (!sandbox || config.bachs.allowSandbox),
    recurring: s.recurring !== false, // card auto-renew (bachs-subs.js), on by default
    maxUsd: Number(s.max_usd) > 0 ? Number(s.max_usd) : 0
  };
}
const on = () => resolve().on;

// The naira rate: a Bachs-only rate if the admin set one, else Billing rules → Currencies → NGN.
function ngnRate(r = resolve()) { return r.ngnRate || Number((settings.get('billing').rates || {}).NGN) || 0; }
// Shown to this customer? Unknown country: yes (priced in USD). Countries outside the list: no.
function servesCountry(country, r = resolve()) { const cc = String(country || '').toUpperCase(); return !cc || r.countries.includes(cc); }
function currencyFor(country) { return NAIRA.includes(String(country || '').toUpperCase()) && ngnRate() > 0 ? 'NGN' : 'USD'; }
function localAmount(usd, currency) { return currency === 'NGN' ? Math.round(usd * ngnRate() * 100) / 100 : Math.round(usd * 100) / 100; }

/*
 * Payment cap. Bachs takes at most this many US dollars per payment (Admin → Connections → Bachs → "Bachs max per payment
 * (USD)"; empty = env BACHS_MAX_USD, else 5000). Checked on the final total the customer pays (the Bachs fee inside); a
 * naira amount is turned back into dollars at the same naira rate the checkout used. Over the cap nothing is sent to
 * Bachs: one-off orders, plans and auto-renew products alike. Customers pay in parts or pick another method.
 */
const DEFAULT_MAX_USD = 5000;
function maxUsd(r = resolve()) { if (r.maxUsd > 0) return r.maxUsd; const e = Number(process.env.BACHS_MAX_USD); return e > 0 ? e : DEFAULT_MAX_USD; }
function maxSource(r = resolve()) { return r.maxUsd > 0 ? 'admin' : Number(process.env.BACHS_MAX_USD) > 0 ? 'env' : 'default'; }
function capMessage(r = resolve()) { return 'Bachs takes up to $' + maxUsd(r).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' per payment. Pay in parts, or choose another method.'; }
// The amount in US dollars, to the cent: naira ÷ the naira rate used for the checkout.
function usdValue(amount, currency) {
  const n = Number(amount);
  if (currency !== 'NGN') return Math.round(n * 100) / 100;
  const rate = ngnRate();
  return rate > 0 ? Math.round(n / rate * 100) / 100 : Infinity;
}
const overCap = (amount, currency) => usdValue(amount, currency) > maxUsd() + 1e-9;
function capError() { const e = new HttpError(400, capMessage()); e.overCap = true; return e; }

function publicInfo() {
  const r = resolve();
  return {
    configured: r.configured, enabled: r.enabled, on: r.on, sandbox: r.sandbox, mode: r.secretKey ? (r.sandbox ? 'sandbox' : 'live') : '',
    has_key: !!r.secretKey, key_source: r.keySource, key_hint: hint(r.secretKey),
    has_webhook_secret: !!r.webhookSecret, webhook_source: r.webhookSource, webhook_hint: hint(r.webhookSecret),
    allow_sandbox: config.bachs.allowSandbox, sandbox_blocked: r.configured && r.enabled && r.sandbox && !config.bachs.allowSandbox,
    countries: r.countries, all_countries: COUNTRIES, ngn_rate: r.ngnRate, ngn_rate_used: ngnRate(r), webhook_url: config.appUrl + '/webhooks/bachs',
    max_usd: r.maxUsd || null, max_usd_used: maxUsd(r), max_usd_source: maxSource(r),
    recurring: r.recurring, recurring_unavailable: (() => { try { return require('./bachs-subs').state().unavailable || null; } catch { return null; } })()
  };
}

// Admin change. An empty key field keeps the saved key. Returns the audit note (never a key or its ciphertext).
function save(b = {}) {
  const cur = saved(); const next = { ...cur };
  const note = { key: 'unchanged', webhook_secret: 'unchanged' };
  if (b.enabled !== undefined) next.enabled = b.enabled === true || ['1', 'true', 'on', 'yes'].includes(String(b.enabled).toLowerCase());
  const key = String(b.secret_key || '').trim(); const hook = String(b.webhook_secret || '').trim();
  if (key) { if (key.length > 200 || !KEY_RE.test(key)) throw new HttpError(400, 'A Bachs secret key starts with sk_live_ (or sk_sandbox_ for testing).'); next.key_enc = encrypt(key); note.key = 'saved'; }
  else if (b.clear_key) { next.key_enc = ''; note.key = cur.key_enc ? 'removed' : 'unchanged'; }
  if (hook) { if (hook.length > 200 || !WEBHOOK_RE.test(hook)) throw new HttpError(400, 'The Bachs webhook signing secret starts with whsec_.'); next.webhook_secret_enc = encrypt(hook); note.webhook_secret = 'saved'; }
  else if (b.clear_webhook_secret) { next.webhook_secret_enc = ''; note.webhook_secret = cur.webhook_secret_enc ? 'removed' : 'unchanged'; }
  if (b.countries !== undefined) {
    const list = [...new Set((Array.isArray(b.countries) ? b.countries : String(b.countries).split(/[\s,]+/)).map(c => String(c).trim().toUpperCase()).filter(Boolean))];
    if (list.some(c => !/^[A-Z]{2}$/.test(c))) throw new HttpError(400, 'Countries are 2-letter codes, like NG, KE, GH.');
    next.countries = list;
  }
  if (b.recurring !== undefined) next.recurring = !(b.recurring === false || ['0', 'false', 'off', 'no'].includes(String(b.recurring).toLowerCase()));
  if (b.max_usd !== undefined) {
    if (b.max_usd === null || b.max_usd === '' || Number(b.max_usd) === 0) delete next.max_usd; // empty = BACHS_MAX_USD, else 5000
    else { const n = Number(b.max_usd); if (!(n > 0) || n > 1e7) throw new HttpError(400, 'Bachs max per payment must be a US-dollar amount above 0 (default 5000).'); next.max_usd = Math.round(n * 100) / 100; }
  }
  if (b.ngn_rate !== undefined) { const n = Number(b.ngn_rate); if (!(n >= 0) || n > 1e7) throw new HttpError(400, 'The naira rate must be a number (0 = use Billing rules → Currencies).'); next.ngn_rate = n; }
  db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', ROW, JSON.stringify(next), db.now());
  const r = resolve();
  if (next.enabled && !r.configured) { next.enabled = false; db.run('UPDATE settings SET value = ? WHERE key = ?', JSON.stringify(next), ROW); throw new HttpError(400, 'Add the Bachs secret key and the webhook signing secret first, then switch Bachs on.'); }
  if (next.enabled && r.sandbox && !config.bachs.allowSandbox) { next.enabled = false; db.run('UPDATE settings SET value = ? WHERE key = ?', JSON.stringify(next), ROW); throw new HttpError(400, 'This is a Bachs sandbox (test) key: test payments would give real plans and credits. Use your sk_live_ key to show Bachs to customers, or keep it switched off while testing.'); }
  return { info: publicInfo(), audit: { enabled: next.enabled, key: note.key, webhook_secret: note.webhook_secret, mode: r.secretKey ? (r.sandbox ? 'sandbox' : 'live') : 'none' } };
}

// The webhook signature (see the top of this file). raw = the exact request body.
function sigOk(headers, raw, secret) {
  // X-Bachs-Signature-V2 (preferred by Bachs): "t=<ts>,v1=<hex>[,v1=<hex>]", several v1 while the secret rotates.
  const v2 = String(headers['x-bachs-signature-v2'] || '');
  if (v2) {
    const parts = v2.split(',').map(x => x.trim().split('=')).filter(x => x.length === 2);
    const t2 = (parts.find(x => x[0] === 't') || [])[1] || '';
    const sigs = parts.filter(x => x[0] === 'v1').map(x => x[1].toLowerCase());
    if (!secret || !sigs.length || !/^\d+$/.test(t2) || Math.abs(Date.now() / 1000 - Number(t2)) > 300) return false; // a malformed V2 never falls back
    const want = crypto.createHmac('sha256', secret).update(t2 + '.').update(raw).digest('hex');
    return sigs.some(x => safeEqual(x, want));
  }
  const hs = String(headers['x-bachs-signature'] || headers['bachs-signature'] || '');
  const kv = Object.fromEntries(hs.split(',').map(x => x.trim().split('=')).filter(x => x.length === 2));
  const t = String(headers['x-bachs-timestamp'] || headers['bachs-timestamp'] || kv.t || '');
  const sig = String(kv.v1 || kv.sha256 || (hs.includes(',') ? '' : hs)).replace(/^(sha256=|v\d=)/, '').trim();
  if (!secret || !sig || !/^\d+$/.test(t) || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  return safeEqual(sig.toLowerCase(), crypto.createHmac('sha256', secret).update(t + '.').update(raw).digest('hex'));
}
function sign(raw, secret, t = Math.floor(Date.now() / 1000)) { return { 'x-bachs-timestamp': String(t), 'x-bachs-signature': crypto.createHmac('sha256', secret).update(t + '.').update(raw).digest('hex') }; }

// Starts a hosted checkout for a pending order. Returns { id, url }.
async function createCheckout(order, user) {
  const r = resolve();
  if (!r.on) throw new HttpError(400, 'That payment method is not available.');
  if (overCap(order.amount_local, order.currency)) throw capError(); // never send Bachs a payment over the cap
  let j = {}; let status = 0;
  try {
    const res = await fetch(r.base + '/checkout-sessions', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Bearer ' + r.secretKey, 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': order.ref },
      body: JSON.stringify({
        pricing: { currency: order.currency, amount: Number(order.amount_local).toFixed(2), price_type: 'fixed' }, reference: order.ref,
        success_url: config.appUrl + '/pay/callback?ref=' + encodeURIComponent(order.ref), cancel_url: config.appUrl + '/app/wallet?cancelled=' + encodeURIComponent(order.ref),
        customer: { email: user.email, ...(user.name ? { name: String(user.name).slice(0, 80) } : {}) },
        metadata: { app: 'replyvoo', reference: order.ref, workspace_id: String(order.workspace_id), kind: order.kind, amount_usd: (Number(order.amount_usd) + Number(order.fee_usd || 0)).toFixed(2) }, expires_in_minutes: 60
      })
    });
    status = res.status; j = await res.json().catch(() => ({}));
  } catch (e) { j = { message: e.message }; }
  const url = j && (j.checkout_url || (j.data && j.data.checkout_url)); const id = j && (j.checkout_id || j.id || (j.data && (j.data.checkout_id || j.data.id)));
  if (!url || !id || !/^https:\/\//.test(String(url))) {
    const why = (j && (j.message || (j.error && (j.error.message || j.error)))) || (status ? 'HTTP ' + status : 'no checkout');
    const e = new Error('Bachs: ' + String(why).slice(0, 160)); e.status = status; throw e;
  }
  return { id: String(id).slice(0, 120), url: String(url) };
}

/*
 * Reads the checkout back from Bachs with our own key (never trusting a webhook or the return link alone) and fulfils
 * the order only when Bachs says it is completed, it is OUR checkout with OUR reference, and it is for at least the amount
 * and in the currency we asked for. FAILED / EXPIRED / CANCELLED mark a pending order failed (a later "completed"
 * answer still fulfils it, like Castvoo). Idempotent.
 */
async function verify(o) {
  if (!o || o.provider !== 'bachs' || !o.provider_ref) return { ok: false, reason: 'Waiting for payment' };
  if (o.status === 'paid') return { ok: true };
  if (o.status === 'refunded' || o.status === 'charged_back') return { ok: false, reason: 'This order was ' + (o.status === 'refunded' ? 'refunded' : 'charged back') + '.' }; // final: never paid again
  const r = resolve();
  if (!r.secretKey) return { ok: false, reason: 'Bachs is not connected' };
  let res;
  try { res = await fetch(r.base + '/checkout-sessions/' + encodeURIComponent(o.provider_ref), { headers: { Authorization: 'Bearer ' + r.secretKey, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }); }
  catch { const e = new Error('Bachs could not be reached'); e.unreachable = true; throw e; }
  if (!res.ok) { const e = new Error('Bachs answered HTTP ' + res.status); e.unreachable = res.status >= 500 || res.status === 429; throw e; }
  const raw = await res.json().catch(() => ({}));
  const s = raw && raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const st = String(s.status || '').toUpperCase(); const ps = String(s.payment_status || '').toUpperCase();
  const meta = db.json(o.meta, {});
  const remember = patch => db.update('orders', o.id, { meta: JSON.stringify({ ...meta, ...patch }) });
  if (s.reference && String(s.reference) !== o.ref) { console.warn('[bachs] reference mismatch', o.ref, s.reference); return { ok: false, reason: 'This Bachs checkout is not for this order' }; }
  if (s.checkout_id && String(s.checkout_id) !== o.provider_ref) { console.warn('[bachs] checkout mismatch', o.ref); return { ok: false, reason: 'This Bachs checkout is not for this order' }; }
  if (PAID.includes(st) || ps === 'SUCCEEDED') {
    const pr = s.pricing || {};
    const cur = String(s.currency || pr.currency || '').toUpperCase();
    const paid = Number(String(s.amount ?? pr.amount ?? '').replace(',', '.'));
    if (!Number.isFinite(paid) || paid <= 0 || cur !== o.currency || paid + 0.001 < Number(o.amount_local)) {
      remember({ bachs_status: st, mismatch: 'Amount or currency did not match. Check in Bachs.' });
      console.warn('[bachs] amount mismatch', o.ref, s.amount, cur);
      return { ok: false, reason: 'Amount or currency did not match' };
    }
    const txid = (s.charge && (s.charge.id || s.charge.payment_id || s.charge.charge_id)) || s.checkout_id || o.provider_ref;
    remember({ bachs_status: st || ps, bachs_payment: String(txid).slice(0, 120), payer: s.charge && (s.charge.fingerprint || s.charge.account) ? String(s.charge.fingerprint || s.charge.account).slice(0, 120) : undefined });
    require('./payments').fulfill(o.ref, { via: 'bachs', provider_ref: o.provider_ref });
    return { ok: true };
  }
  if (DEAD.includes(st) || ps === 'FAILED') {
    db.run("UPDATE orders SET status = 'failed', meta = ? WHERE id = ? AND status = 'pending'", JSON.stringify({ ...meta, bachs_status: st || ps }), o.id);
    return { ok: false, reason: 'Payment ' + (st || ps).toLowerCase() };
  }
  return { ok: false, reason: 'Waiting for payment' };
}

// Admin "Test": ask Bachs for a made-up checkout. "Not found" means Bachs accepted the key; 401/403 means it did not.
async function testKey() {
  const r = resolve();
  if (!r.secretKey) return { ok: false, message: 'Add the Bachs secret key first.' };
  let res;
  try { res = await fetch(r.base + '/checkout-sessions/cs_replyvoo_key_check', { headers: { Authorization: 'Bearer ' + r.secretKey, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }); }
  catch { return { ok: false, message: 'Could not reach Bachs. Try again in a minute.' }; }
  if (res.status === 401 || res.status === 403) return { ok: false, message: 'Bachs refused the secret key. Copy it again from Bachs → Developer Portal → API keys.' };
  if (res.ok || [400, 404, 422].includes(res.status)) return { ok: true, message: 'Connected. Bachs accepted the key (' + (r.sandbox ? 'sandbox' : 'live') + ').' + (r.webhookSecret ? '' : ' Add the webhook signing secret too.') + (r.on ? '' : ' Customers don’t see Bachs until “Show Bachs to customers” is on.') };
  return { ok: false, message: 'Bachs answered HTTP ' + res.status + '. Try again in a minute.' };
}

module.exports = { resolve, on, ngnRate, maxUsd, capMessage, usdValue, overCap, capError, DEFAULT_MAX_USD, servesCountry, currencyFor, localAmount, publicInfo, save, sigOk, sign, createCheckout, verify, testKey, isSandbox, baseFor, COUNTRIES, KEY_RE, WEBHOOK_RE };
