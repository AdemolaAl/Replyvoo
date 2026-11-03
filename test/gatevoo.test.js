'use strict';
// Gatevoo crypto checkout: invoice creation, signed webhooks, re-checking with Gatevoo, sandbox flow, admin tools.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const h = require('./helpers');

let ctx, db, config, gatevoo, settings, srv, base;
const KEY = 'gv_live_' + 'k'.repeat(32);
const SECRET = 'gvwh_' + 's'.repeat(32);
const invoices = new Map(); // id -> invoice
const calls = [];
let failCreate = 0;

before(async () => {
  ctx = await h.boot();
  db = ctx.db;
  config = require('../src/config');
  gatevoo = require('../src/services/gatevoo');
  settings = require('../src/services/settings');
  srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, idem: req.headers['idempotency-key'], body: body ? JSON.parse(body) : null });
      if (req.headers.authorization !== 'Bearer ' + KEY) return json({ error: { message: 'Bad key' } }, 401);
      if (req.method === 'GET' && req.url === '/v1/me') return json({ data: { name: 'Zedapex' } });
      if (req.method === 'POST' && req.url === '/v1/invoices') {
        if (failCreate) { failCreate--; return json({ error: { message: 'coins not enabled' } }, 422); }
        const b = JSON.parse(body);
        const id = 'inv_' + (invoices.size + 1);
        // Gatevoo's apiView: amount_usd + order_id, status "open" until the coins land.
        const inv = { id, order_id: b.order_id, status: 'open', amount_usd: b.amount_usd, checkout_url: (localUrl ? 'http://127.0.0.1:4999/pay/' : 'https://pay.gatevoo.com/i/') + id };
        invoices.set(id, inv);
        return json({ data: inv }, 201);
      }
      const m = req.url.match(/^\/v1\/invoices\/(.+)$/);
      if (req.method === 'GET' && m && invoices.has(m[1])) return json({ data: invoices.get(m[1]) });
      json({ error: 'not found' }, 404);
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + srv.address().port + '/v1';
});
after(async () => { await new Promise(r => srv.close(r)); await ctx.close(); });

let localUrl = false;
function live() { Object.assign(config.gatevoo, { apiUrl: base, apiKey: KEY, webhookSecret: SECRET }); }
function off() { Object.assign(config.gatevoo, { apiKey: '', webhookSecret: '' }); }
beforeEach(() => { live(); settings.set('billing', { ...settings.get('billing'), gatevoo_enabled: true, gatevoo_usdt: true, gatevoo_btc: true }); });

async function owner() { return h.signup(); }
const order = ref => db.one('SELECT * FROM orders WHERE ref = ?', ref);
// Signs exactly like Gatevoo (gatevoo-main src/webhooks.js): hex HMAC-SHA256(secret, `${unixSeconds}.${rawBody}`), no prefix.
const crypto = require('node:crypto');
function gvSign(raw, ts = Math.floor(Date.now() / 1000), secret = SECRET) { return crypto.createHmac('sha256', secret).update(ts + '.' + raw).digest('hex'); }
let evSeq = 0;
function hook(c, ev, opts = {}) {
  const body = { id: 'evt_' + (++evSeq), created: new Date().toISOString(), ...ev };
  const raw = JSON.stringify(body);
  const ts = opts.ts != null ? opts.ts : Math.floor(Date.now() / 1000);
  const headers = { 'content-type': 'application/json', 'x-gatevoo-event': body.type, 'x-gatevoo-delivery': 'wh_' + evSeq };
  if (opts.sig !== null) { headers['x-gatevoo-signature'] = opts.sig || gvSign(raw, ts); headers['x-gatevoo-timestamp'] = String(ts); }
  return c.req('POST', '/webhooks/gatevoo', raw, { raw: true, csrf: false, headers });
}

test('checkout offers Gatevoo crypto with both coins and hides the manual USDT option', async () => {
  settings.set('billing', { ...settings.get('billing'), crypto_enabled: true, crypto_wallet: 'TManual' });
  const s = await owner();
  const r = await s.client.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'starter', interval: 'month' });
  assert.equal(r.status, 200);
  const gv = r.body.providers.find(p => p.id === 'gatevoo');
  assert.ok(gv, 'gatevoo offered');
  assert.deepEqual(gv.coins.map(c => c.id), ['USDT_TRC20', 'BTC']);
  assert.ok(!r.body.providers.some(p => p.id === 'crypto'), 'manual USDT hidden while Gatevoo is on');
  settings.set('billing', { ...settings.get('billing'), gatevoo_btc: false });
  const r2 = await s.client.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'starter', interval: 'month' });
  assert.deepEqual(r2.body.providers.find(p => p.id === 'gatevoo').coins.map(c => c.id), ['USDT_TRC20']);
  settings.set('billing', { ...settings.get('billing'), gatevoo_enabled: false });
  const r3 = await s.client.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'starter', interval: 'month' });
  assert.ok(!r3.body.providers.some(p => p.id === 'gatevoo'));
  assert.ok(r3.body.providers.some(p => p.id === 'crypto'), 'manual USDT is the backup when Gatevoo is off');
  settings.set('billing', { ...settings.get('billing'), crypto_enabled: false });
});

test('starting a payment creates a Gatevoo invoice and redirects to its page', async () => {
  const s = await owner();
  calls.length = 0;
  const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo', coin: 'BTC' });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.redirect, /^https:\/\/pay\.gatevoo\.com\/i\/inv_/);
  const c = calls.find(x => x.method === 'POST');
  assert.equal(c.idem, 'replyvoo-' + r.body.ref, 'idempotency key');
  assert.equal(c.body.order_id, r.body.ref);
  assert.equal(c.body.amount_usd, order(r.body.ref).amount_usd);
  assert.match(c.body.customer_email, /@/);
  assert.match(c.body.redirect_url, /\/pay\/callback\?ref=/);
  assert.equal(c.body.metadata.preferred_coin, 'BTC');
  const o = order(r.body.ref);
  assert.equal(o.provider, 'gatevoo');
  assert.equal(o.status, 'pending');
  assert.match(o.provider_ref, /^inv_/);
});

test('signed webhook + paid invoice activates the order once; amount is re-checked with Gatevoo', async () => {
  const s = await owner();
  const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' });
  const o = order(r.body.ref);
  const inv = invoices.get(o.provider_ref);
  const paidBody = () => ({ type: 'invoice.paid', data: { id: inv.id, order_id: o.ref, status: 'paid', amount_usd: o.amount_usd, method: 'usdt_trc20', txid: 'abc123' } });
  // The webhook body claims "paid" but Gatevoo still says open: nothing happens.
  const w1 = await hook(h.client(), paidBody());
  assert.equal(w1.status, 200);
  await h.sleep(150);
  assert.equal(order(o.ref).status, 'pending', 'body alone is never trusted');
  // The dashboard's test button: verified, answered 200, nothing credited.
  Object.assign(inv, { status: 'paid', amount_usd: o.amount_usd, method: 'usdt_trc20', txid: 'abc123', pay_amount: o.amount_usd.toFixed(2) });
  const t = await hook(h.client(), { type: 'invoice.test', data: { id: inv.id, order_id: o.ref, status: 'paid', amount_usd: o.amount_usd } });
  assert.equal(t.status, 200);
  assert.equal(t.body.test, true);
  await h.sleep(120);
  assert.equal(order(o.ref).status, 'pending', 'invoice.test never credits');
  // A paid event for less than the order is ignored.
  await hook(h.client(), { type: 'invoice.paid', data: { ...paidBody().data, amount_usd: o.amount_usd - 5 } });
  await h.sleep(120);
  assert.equal(order(o.ref).status, 'pending', 'short amount never credits');
  await hook(h.client(), paidBody());
  await h.waitFor(() => order(o.ref).status === 'paid');
  assert.equal(db.one('SELECT plan_id FROM workspaces WHERE id = ?', s.ws.id).plan_id, 'starter');
  const meta = JSON.parse(order(o.ref).meta);
  assert.equal(meta.tx_hash, 'abc123');
  assert.equal(meta.coin, 'USDT_TRC20');
  // Replays don't double-apply.
  const again = await hook(h.client(), paidBody());
  assert.equal(again.status, 200);
  await h.sleep(100);
  assert.equal(db.one('SELECT COUNT(*) n FROM orders WHERE ref = ? AND status = \'paid\'', o.ref).n, 1);
  // Customer sees the coin and a transaction link.
  const w = await s.client.get('/api/app/wallet');
  const row = w.body.orders.find(x => x.ref === o.ref);
  assert.equal(row.coin, 'USDT');
  assert.equal(row.tx_url, 'https://tronscan.org/#/transaction/abc123');
  assert.equal(row.meta, undefined, 'raw meta stays private');
});

test('bad, missing or stale signatures are rejected', async () => {
  const c = h.client();
  const ev = { type: 'invoice.paid', data: { order_id: 'X', status: 'paid' } };
  assert.equal((await hook(c, ev, { sig: 'deadbeef' })).status, 401, 'garbage signature');
  assert.equal((await hook(c, ev, { sig: 'sha256=' + 'a'.repeat(64) })).status, 401, 'prefixed signature');
  assert.equal((await hook(c, ev, { ts: Math.floor(Date.now() / 1000) - 3600 })).status, 401, 'old timestamp');
  assert.equal((await hook(c, ev, { ts: Math.floor(Date.now() / 1000) + 3600 })).status, 401, 'future timestamp');
  assert.equal((await hook(c, ev, { ts: Date.now() })).status, 401, 'milliseconds are not seconds');
  assert.equal((await hook(c, ev, { sig: null })).status, 401, 'no signature');
  // Signed over a different secret.
  const raw = JSON.stringify(ev); const ts = Math.floor(Date.now() / 1000);
  assert.equal((await c.req('POST', '/webhooks/gatevoo', raw, { raw: true, csrf: false, headers: { 'content-type': 'application/json', 'x-gatevoo-timestamp': String(ts), 'x-gatevoo-signature': gvSign(raw, ts, 'wrong') } })).status, 401);
  // The helper used by Admin tools signs the same way Gatevoo does.
  const own = gatevoo.sign(raw, ts);
  assert.equal(own.signature, gvSign(raw, ts));
  assert.equal(own.timestamp, String(ts));
  assert.equal((await c.req('POST', '/webhooks/gatevoo', raw, { raw: true, csrf: false, headers: { 'content-type': 'application/json', 'x-gatevoo-timestamp': own.timestamp, 'x-gatevoo-signature': own.signature } })).status, 200);
});

test('underpaid invoices stay pending and are flagged; expired ones fail', async () => {
  const s = await owner();
  const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' });
  const o = order(r.body.ref);
  Object.assign(invoices.get(o.provider_ref), { status: 'paid', amount_usd: o.amount_usd - 5, method: 'btc', txid: 'f00', pay_amount: '0.0001' });
  const v = await (require('../src/services/payments')).verify(o.ref);
  assert.equal(v.ok, false);
  assert.match(v.reason, /Underpaid/);
  assert.equal(order(o.ref).status, 'pending');
  assert.equal(JSON.parse(order(o.ref).meta).underpaid, true);
  const r2 = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' });
  const o2 = order(r2.body.ref);
  invoices.get(o2.provider_ref).status = 'expired';
  const poll = await s.client.get('/api/app/orders/' + o2.ref);
  assert.equal(poll.body.status, 'failed');
});

test('an invoice for another order cannot settle this one', async () => {
  const s = await owner();
  const a = order((await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' })).body.ref);
  const r = gatevoo.settle({ id: 'inv_other', order_id: a.ref, status: 'paid', amount_usd: 1e6 });
  assert.equal(r.ok, false);
  assert.equal(order(a.ref).status, 'pending');
});

test('Gatevoo errors fail the order with a friendly message', async () => {
  const s = await owner();
  failCreate = 1;
  const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /Gatevoo could not start the payment/);
  config.gatevoo.apiUrl = 'http://127.0.0.1:1/v1';
  const r2 = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' });
  assert.equal(r2.status, 502);
  assert.match(r2.body.error, /could not be reached/);
});

test('sandbox: without keys the local Gatevoo page completes the purchase', async () => {
  off();
  assert.equal(gatevoo.mode(), 'sandbox');
  const s = await owner();
  const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo', coin: 'BTC' });
  assert.match(r.body.redirect, /^\/pay\/gatevoo\/.+\?coin=BTC$/);
  const page = await s.client.get(r.body.redirect);
  assert.equal(page.status, 200);
  assert.match(page.text, /Gatevoo/);
  assert.match(page.text, /bc1q/);
  assert.match(page.text, /Sandbox/);
  // A stranger can't see or pay it.
  const other = await owner();
  assert.equal((await other.client.get(r.body.redirect)).status, 404);
  assert.equal((await other.client.post('/pay/gatevoo/' + r.body.ref, { coin: 'BTC' }, { form: true })).status, 404);
  const pay = await s.client.post('/pay/gatevoo/' + r.body.ref, { coin: 'BTC' }, { form: true });
  assert.equal(pay.status, 302);
  assert.equal(order(r.body.ref).status, 'paid');
  assert.equal(JSON.parse(order(r.body.ref).meta).coin, 'BTC');
  // Off entirely when payments demo is off too.
  const prev = config.pay.demo; config.pay.demo = false;
  try { assert.equal(gatevoo.mode(), 'off'); assert.equal((await s.client.get(r.body.redirect)).status, 404); }
  finally { config.pay.demo = prev; }
});

test('admin: status, connection test, check payment, and staff access', async () => {
  const a = await h.login(h.ADMIN.email, h.ADMIN.password);
  const st = await a.get('/api/admin/gatevoo');
  assert.equal(st.status, 200);
  assert.equal(st.body.mode, 'live');
  assert.match(st.body.webhook_url, /\/webhooks\/gatevoo$/);
  const t = await a.post('/api/admin/gatevoo/test');
  assert.equal(t.body.ok, true);
  assert.match(t.body.message, /Connected as Zedapex/);
  const s = await owner();
  const o = order((await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' })).body.ref);
  const c1 = await a.post('/api/admin/orders/' + o.ref + '/check');
  assert.equal(c1.body.ok, false);
  Object.assign(invoices.get(o.provider_ref), { status: 'review', amount_usd: o.amount_usd, method: 'btc', txid: 'b7c' });
  const cr = await a.post('/api/admin/orders/' + o.ref + '/check');
  assert.equal(cr.body.ok, false, 'review is never auto-credited');
  Object.assign(invoices.get(o.provider_ref), { status: 'paid', amount_usd: o.amount_usd, method: 'btc', txid: 'b7c', pay_amount: '0.00100000' });
  const c2 = await a.post('/api/admin/orders/' + o.ref + '/check');
  assert.equal(c2.body.ok, true);
  assert.equal(c2.body.status, 'paid');
  const list = await a.get('/api/admin/orders');
  const row = list.body.find(x => x.ref === o.ref);
  assert.equal(row.gatevoo.coin, 'Bitcoin');
  assert.equal(row.gatevoo.tx_url, 'https://mempool.space/tx/b7c');
  // A support agent has no pricing access, so no Gatevoo settings.
  const sam = await h.login('sam@replyvoo.local', 'staff12345').catch(() => null);
  if (sam) { const r = await sam.get('/api/admin/gatevoo'); assert.ok([401, 403].includes(r.status)); }
  // Wrong key shows a clear message.
  config.gatevoo.apiKey = 'nope';
  const bad = await a.post('/api/admin/gatevoo/test');
  assert.equal(bad.body.ok, false);
  assert.match(bad.body.message, /rejected the API key/);
});

// Security audit (HIGH): refund an order, replay Gatevoo's signed "paid" webhook: nothing is credited again.
test('a refunded Gatevoo order is final: the replayed signed webhook never re-credits it', async () => {
  const payments = require('../src/services/payments');
  const s = await owner();
  const credits = () => db.one('SELECT credits FROM workspaces WHERE id = ?', s.ws.id).credits;
  const start = credits();
  const pack = db.one('SELECT * FROM packs WHERE active = 1 ORDER BY price LIMIT 1');
  const r = await s.client.post('/api/app/checkout', { kind: 'pack', item_id: pack.id, provider: 'gatevoo' });
  const o = order(r.body.ref);
  const inv = invoices.get(o.provider_ref);
  Object.assign(inv, { status: 'paid', amount_usd: o.amount_usd, method: 'usdt_trc20', txid: 'tx1', pay_amount: o.amount_usd.toFixed(2) });
  const paid = { type: 'invoice.paid', data: { id: inv.id, order_id: o.ref, status: 'paid', amount_usd: o.amount_usd, method: 'usdt_trc20', txid: 'tx1' } };
  await hook(h.client(), paid);
  await h.waitFor(() => order(o.ref).status === 'paid');
  assert.equal(credits(), start + pack.credits + pack.bonus);
  payments.reverse(o.ref, 'refund', {});
  assert.equal(credits(), start);
  const again = await hook(h.client(), paid);
  assert.equal(again.status, 200);
  await h.sleep(200);
  assert.equal((await gatevoo.verify(order(o.ref))).ok, false);
  assert.equal((await payments.verify(o.ref)).ok, false);
  assert.equal(order(o.ref).status, 'refunded');
  assert.equal(credits(), start, 'credits stay at the refunded balance');
});

test('a Gatevoo on this machine (http://127.0.0.1) is accepted off production only; a plain-http checkout from elsewhere never is', async () => {
  const s = await owner();
  localUrl = true;
  try {
    const ok = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo', coin: 'USDT_TRC20' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.match(ok.body.redirect, /^http:\/\/127\.0\.0\.1:4999\/pay\/inv_/);
    config.isProd = true;
    const s2 = await owner();
    const no = await s2.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo', coin: 'USDT_TRC20' });
    assert.ok(no.status >= 400 && !no.body.redirect, 'production never sends a customer to a plain-http checkout: ' + JSON.stringify(no.body));
  } finally { localUrl = false; config.isProd = false; }
});

