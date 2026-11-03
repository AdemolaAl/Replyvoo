'use strict';
// Bachs (naira and African payments) against a fake Bachs: owner-only keys stored encrypted, shown only in the countries it
// serves, naira at the admin's rate, signed webhooks, fulfilment only from Bachs's own answer and exactly once, failures.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const h = require('./helpers');

const KEY = 'sk_live_replyvoo12345';
const WHS = 'whsec_replyvoo12345';
let ctx, fake, fakeBase, config;
const sessions = new Map();
const calls = [];
let acceptKey = KEY;

before(async () => {
  ctx = await h.boot();
  config = require('../src/config');
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== 'Bearer ' + acceptKey) return json({ message: 'Invalid API key' }, 401);
      if (req.method === 'POST' && req.url === '/v1/checkout-sessions') {
        const p = JSON.parse(body);
        const id = 'chk_' + crypto.randomBytes(5).toString('hex');
        const s = { checkout_id: id, checkout_url: 'https://checkout.bachs.test/' + id, reference: p.reference, pricing: p.pricing, status: 'OPEN' };
        sessions.set(id, s);
        calls.push({ ...p, idempotency_key: req.headers['idempotency-key'] });
        return json(s, 201);
      }
      const m = /^\/v1\/checkout-sessions\/([\w-]+)$/.exec(req.url);
      if (req.method === 'GET' && m) { const s = sessions.get(m[1]); return s ? json(s) : json({ message: 'not found' }, 404); }
      json({ message: 'nope' }, 404);
    });
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  fakeBase = 'http://127.0.0.1:' + fake.address().port;
  config.bachs.apiBase = fakeBase;
});
after(async () => { config.bachs.apiBase = ''; await new Promise(r => fake.close(r)); await ctx.close(); });

const owner = () => h.login(h.ADMIN.email, h.ADMIN.password);
async function payer(country) {
  const s = await h.signup({}, h.client());
  if (country) assert.equal((await s.client.put('/api/app/profile', { country })).status, 200);
  return s;
}
const methods = async c => (await c.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'starter', interval: 'month' })).body.providers;
const order = ref => ctx.db.one('SELECT * FROM orders WHERE ref = ?', ref);
const session = o => sessions.get(o.provider_ref);
function hook(ev, { secret = WHS, ts = Math.floor(Date.now() / 1000), headers } = {}) {
  const raw = JSON.stringify(ev);
  const sig = crypto.createHmac('sha256', secret).update(ts + '.' + raw).digest('hex');
  return h.client().req('POST', '/webhooks/bachs', raw, { raw: true, csrf: false, headers: { 'content-type': 'application/json', ...(headers || { 'x-bachs-timestamp': String(ts), 'x-bachs-signature': sig }) } });
}
const paidEvent = o => ({ id: 'evt_' + crypto.randomBytes(3).toString('hex'), type: 'collection.succeeded', data: { checkout_id: o.provider_ref, reference: o.ref, status: 'succeeded' } });

test('off: hidden from customers, webhook off, Test says what is missing', async () => {
  const p = await payer('NG');
  assert.ok(!(await methods(p.client)).some(m => m.id === 'bachs'));
  assert.equal((await p.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs' })).status, 400);
  assert.equal((await hook({ type: 'x', data: {} })).status, 404);
  const t = await (await owner()).post('/api/admin/connections/bachs/test');
  assert.equal(t.body.ok, false);
  assert.match(t.body.message, /secret key/);
});

test('only owners change the keys; wrong-looking keys are refused; cannot switch on without both keys', async () => {
  const support = await h.login('sam@replyvoo.local', 'staff12345');
  assert.equal((await support.put('/api/admin/connections/bachs', { secret_key: KEY })).status, 403);
  const o = await owner();
  assert.equal((await o.put('/api/admin/connections/bachs', { secret_key: 'pk_live_nope12345678' })).status, 400);
  assert.equal((await o.put('/api/admin/connections/bachs', { webhook_secret: 'nope_123456789' })).status, 400);
  assert.equal((await o.put('/api/admin/connections/bachs', { enabled: true })).status, 400);
  assert.equal(require('../src/services/bachs').resolve().enabled, false);
});

test('a sandbox key can be saved and tested, but never shown to customers', async () => {
  const o = await owner();
  assert.equal((await o.put('/api/admin/connections/bachs', { secret_key: 'sk_sandbox_replyvoo123', webhook_secret: WHS, enabled: true })).status, 400);
  assert.equal((await o.put('/api/admin/connections/bachs', { secret_key: 'sk_sandbox_replyvoo123', webhook_secret: WHS })).status, 200);
  assert.equal(require('../src/services/bachs').on(), false);
});

test('keys are stored encrypted and shown only as their last 4 characters; the Test button checks the key', async () => {
  const o = await owner();
  const r = await o.put('/api/admin/connections/bachs', { secret_key: KEY, webhook_secret: WHS, enabled: false });
  assert.equal(r.status, 200, r.text);
  const txt = JSON.stringify(r.body) + JSON.stringify((await o.get('/api/admin/connections')).body) + JSON.stringify(ctx.db.all("SELECT data FROM audit WHERE action = 'connections.bachs'"));
  assert.ok(!txt.includes(KEY) && !txt.includes(WHS), 'never sent back or logged');
  assert.equal(r.body.bachs.key_hint, '…' + KEY.slice(-4));
  const row = ctx.db.one("SELECT value FROM settings WHERE key = 'bachs_keys'").value;
  assert.ok(!row.includes(KEY) && !row.includes(WHS), 'stored encrypted');
  const t = await o.post('/api/admin/connections/bachs/test');
  assert.equal(t.body.ok, true, t.text);
  acceptKey = 'sk_live_other99999';
  assert.equal((await o.post('/api/admin/connections/bachs/test')).body.ok, false);
  acceptKey = KEY;
  // Configured but switched off: still hidden.
  const p = await payer('NG');
  assert.ok(!(await methods(p.client)).some(m => m.id === 'bachs'));
});

test('switched on: Nigeria pays in naira at the admin rate, other African countries in USD, the rest of the world not at all', async () => {
  const o = await owner();
  assert.equal((await o.put('/api/admin/connections/bachs', { enabled: true })).status, 200);
  const ng = await payer('NG');
  const m = (await methods(ng.client)).find(x => x.id === 'bachs');
  assert.ok(m, 'shown in Nigeria');
  assert.equal(m.currency, 'NGN');
  const rate = require('../src/services/settings').get('billing').rates.NGN;
  // The Bachs 4% customer fee is built into the price: $29 × 1.04 = $30.16, at the same naira rate.
  assert.equal(m.total, 30.16);
  assert.equal(m.amount_local, Math.round(30.16 * rate * 100) / 100);
  assert.match(m.note, /^₦/);
  // A Bachs-only naira rate wins over Billing rules.
  await o.put('/api/admin/connections/bachs', { ngn_rate: 1550 });
  assert.equal((await methods(ng.client)).find(x => x.id === 'bachs').amount_local, 46748);
  const ke = await payer('KE');
  assert.equal((await methods(ke.client)).find(x => x.id === 'bachs').currency, 'USD');
  const gb = await payer('GB');
  assert.ok(!(await methods(gb.client)).some(x => x.id === 'bachs'));
  assert.equal((await gb.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs' })).status, 400);
  const unknown = await payer('');
  assert.equal((await methods(unknown.client)).find(x => x.id === 'bachs').currency, 'USD', 'country not known yet: USD');
});

test('checkout: a Bachs session for the naira amount, with our reference, a retry-safe key and our return page', async () => {
  const ng = await payer('NG');
  const r = await ng.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs' });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.redirect, /^https:\/\/checkout\.bachs\.test\/chk_/);
  assert.equal(r.body.currency, 'NGN');
  const call = calls[calls.length - 1];
  assert.deepEqual(call.pricing, { currency: 'NGN', amount: '46748.00', price_type: 'fixed' });
  assert.equal(call.reference, r.body.ref);
  assert.equal(call.idempotency_key, r.body.ref);
  assert.equal(call.success_url, 'http://localhost:3000/pay/callback?ref=' + r.body.ref);
  assert.equal(call.customer.email, ng.email);
  const o = order(r.body.ref);
  assert.equal(o.status, 'pending');
  assert.equal(o.provider, 'bachs');
  assert.equal(o.amount_usd, 29, 'the plan is priced in US dollars');
  assert.equal(o.fee_usd, 1.16, 'the 4% fee is kept apart');
  assert.equal(o.amount_local, 46748);
  assert.match(o.provider_ref, /^chk_/);
});

test('a webhook with a bad, missing or old signature is refused and gives nothing', async () => {
  const ng = await payer('NG');
  const ref = (await ng.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs' })).body.ref;
  const o = order(ref);
  Object.assign(session(o), { status: 'COMPLETED', payment_status: 'succeeded', amount: '44950.00', currency: 'NGN' });
  const ev = paidEvent(o);
  assert.equal((await hook(ev, { secret: 'whsec_wrongsecret999' })).status, 401);
  assert.equal((await hook(ev, { headers: { 'x-bachs-timestamp': String(Math.floor(Date.now() / 1000)), 'x-bachs-signature': 'deadbeef' } })).status, 401);
  assert.equal((await hook(ev, { headers: {} })).status, 401);
  assert.equal((await hook(ev, { ts: Math.floor(Date.now() / 1000) - 301 })).status, 401);
  assert.equal(order(ref).status, 'pending');
  assert.equal(ctx.db.one('SELECT plan_id FROM workspaces WHERE id = ?', ng.ws.id).plan_id, 'spark');
});

test('a verified payment gives the plan exactly once (repeat webhooks, the return page and Check payment add nothing)', async () => {
  const ng = await payer('NG');
  const ref = (await ng.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs' })).body.ref;
  const o = order(ref);
  // Signed, but Bachs still says the checkout is open: a "paid" claim alone gives nothing.
  assert.equal((await hook(paidEvent(o))).status, 200);
  assert.equal(order(ref).status, 'pending');
  Object.assign(session(o), { status: 'COMPLETED', payment_status: 'succeeded', charge: { id: 'pay_abc123' } });
  assert.equal((await hook(paidEvent(o))).status, 200);
  const paid = order(ref);
  assert.equal(paid.status, 'paid');
  assert.equal(JSON.parse(paid.meta).bachs_payment, 'pay_abc123', 'the Bachs payment id is kept');
  const w = ctx.db.one('SELECT * FROM workspaces WHERE id = ?', ng.ws.id);
  assert.equal(w.plan_id, 'starter');
  const end = w.period_end;
  assert.equal((await hook(paidEvent(o))).status, 200);
  assert.equal((await hook({ type: 'collection.succeeded', data: { checkout_id: o.provider_ref } })).status, 200);
  assert.equal((await ng.client.get('/pay/callback?ref=' + ref)).status, 302);
  await (await owner()).post('/api/admin/orders/' + ref + '/check');
  assert.equal(ctx.db.one('SELECT period_end FROM workspaces WHERE id = ?', ng.ws.id).period_end, end, 'given once');
  assert.equal(h.emails(ng.email, 'payment-receipt').length, 1, 'one receipt');
});

test('coming back from the checkout asks Bachs and fulfils a paid order (USD in Kenya, credit pack)', async () => {
  const ke = await payer('KE');
  const pack = ctx.db.one('SELECT * FROM packs WHERE active = 1 ORDER BY price LIMIT 1');
  const r = await ke.client.post('/api/app/checkout', { kind: 'pack', item_id: pack.id, provider: 'bachs' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.currency, 'USD');
  const o = order(r.body.ref);
  assert.equal(session(o).pricing.amount, (Math.round(pack.price * 104) / 100).toFixed(2), 'base + the 4% Bachs fee');
  Object.assign(session(o), { status: 'COMPLETED' });
  const back = await ke.client.get('/pay/callback?ref=' + o.ref);
  assert.equal(back.location, '/app/wallet?order=' + o.ref);
  assert.equal(order(o.ref).status, 'paid');
  assert.equal(ctx.db.one('SELECT credits FROM workspaces WHERE id = ?', ke.ws.id).credits, pack.credits + pack.bonus);
});

test('unpaid, failed, expired, short, wrong-currency or someone else’s checkout gives nothing; failed and expired mark the order failed', async () => {
  const ng = await payer('NG');
  const start = async () => order((await ng.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs' })).body.ref);
  const cases = [
    ['unpaid', {}, 'pending'],
    ['failed', { status: 'FAILED', payment_status: 'failed' }, 'failed'],
    ['expired', { status: 'EXPIRED' }, 'failed'],
    ['paid less', { status: 'COMPLETED', amount: '1.00', currency: 'NGN' }, 'pending'],
    ['other currency', { status: 'COMPLETED', currency: 'USD' }, 'pending'],
    ['another reference', { status: 'COMPLETED', reference: 'RV-SOMEONE-ELSE' }, 'pending']
  ];
  for (const [what, patch, want] of cases) {
    const o = await start();
    Object.assign(session(o), patch);
    assert.equal((await hook(paidEvent(o))).status, 200, what);
    await ng.client.get('/pay/callback?ref=' + o.ref);
    assert.equal(order(o.ref).status, want, what);
  }
  assert.equal(ctx.db.one('SELECT plan_id FROM workspaces WHERE id = ?', ng.ws.id).plan_id, 'spark', 'nothing given');
  // A failed order that Bachs later reports completed is still fulfilled (as in Castvoo).
  const late = ctx.db.one("SELECT * FROM orders WHERE workspace_id = ? AND status = 'failed' ORDER BY id LIMIT 1", ng.ws.id);
  Object.assign(session(late), { status: 'COMPLETED', amount: undefined, currency: undefined });
  await hook(paidEvent(late));
  assert.equal(order(late.ref).status, 'paid');
});

test('a checkout that fails to start marks the order failed and says so', async () => {
  const ng = await payer('NG');
  acceptKey = 'sk_live_rotatedkey999';
  try {
    const r = await ng.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs' });
    assert.equal(r.status, 502, r.text);
    assert.match(r.body.error, /Bachs could not start the payment/);
    assert.equal(ctx.db.one("SELECT status FROM orders WHERE workspace_id = ? AND provider = 'bachs' ORDER BY id DESC LIMIT 1", ng.ws.id).status, 'failed');
  } finally { acceptKey = KEY; }
});

test('the signature also works in the "t=…,v1=…" header form', () => {
  const bachs = require('../src/services/bachs');
  const body = '{"a":1}'; const ts = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', WHS).update(ts + '.' + body).digest('hex');
  assert.equal(bachs.sigOk({ 'bachs-signature': 't=' + ts + ',v1=' + v1 }, body, WHS), true);
  assert.equal(bachs.sigOk({ 'bachs-signature': 't=' + ts + ',v1=' + v1 }, body + ' ', WHS), false);
});

test('a refund of a Bachs order takes the plan back', async () => {
  const ng = await payer('NG');
  const ref = (await ng.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs' })).body.ref;
  Object.assign(session(order(ref)), { status: 'COMPLETED' });
  await ng.client.get('/pay/callback?ref=' + ref);
  assert.equal(ctx.db.one('SELECT plan_id FROM workspaces WHERE id = ?', ng.ws.id).plan_id, 'starter');
  const r = await (await owner()).post('/api/admin/orders/' + ref + '/refund', { note: 'refunded in Bachs' });
  assert.equal(r.status, 200, r.text);
  assert.equal(order(ref).status, 'refunded');
  assert.equal(ctx.db.one('SELECT plan_id FROM workspaces WHERE id = ?', ng.ws.id).plan_id, 'spark');
});

// Security audit (HIGH): a refunded order must never be paid again. Refund it, replay the signed webhook: the credits stay taken back.
test('a refunded or charged-back order is final: replaying the signed webhook never re-credits it', async () => {
  const payments = require('../src/services/payments');
  const ke = await payer('KE');
  const credits = () => ctx.db.one('SELECT credits FROM workspaces WHERE id = ?', ke.ws.id).credits;
  const start = credits();
  const pack = ctx.db.one('SELECT * FROM packs WHERE active = 1 ORDER BY price LIMIT 1');
  const r = await ke.client.post('/api/app/checkout', { kind: 'pack', item_id: pack.id, provider: 'bachs' });
  const o = order(r.body.ref);
  Object.assign(session(o), { status: 'COMPLETED' });
  assert.equal((await hook(paidEvent(o))).status, 200);
  await h.waitFor(() => order(o.ref).status === 'paid');
  assert.equal(credits(), start + pack.credits + pack.bonus);
  payments.reverse(o.ref, 'refund', { note: 'test' });
  assert.equal(order(o.ref).status, 'refunded');
  assert.equal(credits(), start, 'the refund takes the credits back');
  // Replay the same signed webhook (Bachs still says COMPLETED), and call every path that can pay an order.
  assert.equal((await hook(paidEvent(o))).status, 200);
  await h.sleep(150);
  assert.equal((await ke.client.get('/pay/callback?ref=' + o.ref)).status < 500, true);
  assert.equal(payments.fulfill(o.ref, { via: 'replay' }), false);
  assert.equal((await require('../src/services/bachs').verify(order(o.ref))).ok, false);
  assert.equal(order(o.ref).status, 'refunded');
  assert.equal(credits(), start, 'credits stay taken back after the replay');
  // A charged-back order is just as final.
  const r2 = await ke.client.post('/api/app/checkout', { kind: 'pack', item_id: pack.id, provider: 'bachs' });
  assert.equal(r2.status, 200, r2.text);
  const o2 = order(r2.body.ref);
  Object.assign(session(o2), { status: 'COMPLETED' });
  await hook(paidEvent(o2)); await h.waitFor(() => order(o2.ref).status === 'paid');
  payments.reverse(o2.ref, 'chargeback', {});
  await hook(paidEvent(o2)); await h.sleep(150);
  assert.equal(order(o2.ref).status, 'charged_back');
  assert.equal(credits(), start);
});

test('switching it off hides it again', async () => {
  assert.equal((await (await owner()).put('/api/admin/connections/bachs', { enabled: false })).status, 200);
  const ng = await payer('NG');
  assert.ok(!(await methods(ng.client)).some(m => m.id === 'bachs'));
});
