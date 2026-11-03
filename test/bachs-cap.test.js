'use strict';
// The Bachs payment cap ($5,000 per payment by default, the Bachs fee inside, naira counted back at the checkout rate),
// against a fake Bachs: under and exactly at the cap go through as before; over the cap Bachs is disabled in the
// preview and the server refuses it before anything reaches Bachs, while the other methods still work; naira near the
// boundary; the admin setting and the BACHS_MAX_USD fallback; and a card auto-renew whose renewal price would go over the
// cap is never moved to it: flagged for admin, auto-renew ends, one-off reminder sent.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const h = require('./helpers');

const KEY = 'sk_live_replyvoocap123';
const WHS = 'whsec_replyvoocap123';
const MSG = 'Bachs takes up to $5,000 per payment. Pay in parts, or choose another method.';
let ctx, fake, config, bachs, subs, admin;
const log = [], subsMap = new Map();

before(async () => {
  ctx = await h.boot();
  config = require('../src/config');
  bachs = require('../src/services/bachs');
  subs = require('../src/services/bachs-subs');
  delete process.env.BACHS_MAX_USD;
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== 'Bearer ' + KEY) return json({ message: 'Invalid API key' }, 401);
      const p = body ? JSON.parse(body) : {};
      log.push({ method: req.method, url: req.url, body: p });
      if (req.method === 'POST' && req.url === '/v1/products') return json({ data: { id: 'prod_' + crypto.randomBytes(4).toString('hex'), ...p } }, 201);
      if (req.method === 'POST' && req.url === '/v1/checkout-sessions') { const id = 'chk_' + crypto.randomBytes(5).toString('hex'); return json({ checkout_id: id, checkout_url: 'https://checkout.bachs.test/' + id, reference: p.reference, status: 'OPEN' }, 201); }
      const m = /^\/v1\/subscriptions\/([\w-]+)$/.exec(req.url);
      if (m && subsMap.has(m[1])) {
        const s = subsMap.get(m[1]);
        if (req.method === 'DELETE') s.cancel_at_period_end = !!p.cancel_at_period_end;
        if (req.method === 'PATCH') s.product_id = p.product_id;
        return json({ data: s });
      }
      json({ message: 'nope' }, 404);
    });
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  config.bachs.apiBase = 'http://127.0.0.1:' + fake.address().port;
  admin = await h.login(h.ADMIN.email, h.ADMIN.password);
  const r = await admin.put('/api/admin/connections/bachs', { secret_key: KEY, webhook_secret: WHS, enabled: true, ngn_rate: 1500, recurring: false });
  assert.equal(r.status, 200, r.text);
  // Plans whose Bachs total (base + 4% fee) is under, exactly at and one cent over $5,000.
  const starter = ctx.db.one("SELECT * FROM plans WHERE id = 'starter'");
  for (const [id, price] of [['capunder', 4000], ['capat', 4807.69], ['capover', 4807.70]]) ctx.db.insert('plans', { ...starter, id, name: 'Cap ' + id, price_month: price, price_year: price * 10, offer: '{}' });
});
after(async () => { delete process.env.BACHS_MAX_USD; config.bachs.apiBase = ''; await new Promise(r => fake.close(r)); await ctx.close(); });

async function payer(country) {
  const s = await h.signup({}, h.client());
  assert.equal((await s.client.put('/api/app/profile', { country })).status, 200);
  return s;
}
const checkouts = () => log.filter(x => x.url === '/v1/checkout-sessions');
const ordersOf = wsId => ctx.db.one('SELECT COUNT(*) n FROM orders WHERE workspace_id = ?', wsId).n;
const buy = (p, plan, extra = {}) => p.client.post('/api/app/checkout', { kind: 'plan', item_id: plan, interval: 'month', provider: 'bachs', auto_renew: false, ...extra });

test('the cap defaults to $5,000 (admin setting, then BACHS_MAX_USD); the admin sees and edits it', async () => {
  assert.equal(bachs.maxUsd(), 5000); assert.equal(bachs.capMessage(), MSG);
  process.env.BACHS_MAX_USD = '4500'; assert.equal(bachs.maxUsd(), 4500, 'env fallback'); delete process.env.BACHS_MAX_USD;
  const c = (await admin.get('/api/admin/connections')).body.bachs;
  assert.equal(c.max_usd, null); assert.equal(c.max_usd_used, 5000); assert.equal(c.max_usd_source, 'default');
  assert.equal((await admin.put('/api/admin/connections/bachs', { max_usd: -5 })).status, 400);
  assert.equal((await admin.put('/api/admin/connections/bachs', { max_usd: 7000 })).body.bachs.max_usd_used, 7000);
  assert.equal(bachs.maxUsd(), 7000, 'admin setting wins');
  assert.equal((await admin.put('/api/admin/connections/bachs', { max_usd: null })).body.bachs.max_usd_used, 5000);
});

test('under the cap and exactly at the cap ($5,000.00 with the fee) start a Bachs checkout as before', async () => {
  const p = await payer('KE');
  const pv = await p.client.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'capat', interval: 'month' });
  const bm = pv.body.providers.find(x => x.id === 'bachs');
  assert.equal(bm.total, 5000); assert.ok(!bm.disabled); assert.equal(pv.body.cap_note, undefined);
  const u = await buy(p, 'capunder');
  assert.equal(u.status, 200, u.text);
  assert.deepEqual(checkouts().pop().body.pricing, { currency: 'USD', amount: '4160.00', price_type: 'fixed' });
  const a = await buy(p, 'capat');
  assert.equal(a.status, 200, a.text);
  assert.deepEqual(checkouts().pop().body.pricing, { currency: 'USD', amount: '5000.00', price_type: 'fixed' });
  // Auto-renew on: the recurring product at exactly the cap is made.
  await admin.put('/api/admin/connections/bachs', { recurring: true });
  const s = await buy(await payer('KE'), 'capat', { auto_renew: true }); // a new payer: a repeat tap would reuse the open checkout
  assert.equal(s.status, 200, s.text); assert.equal(s.body.auto_renew, true);
  assert.equal(log.filter(x => x.url === '/v1/products').pop().body.price.amount, '5000.00');
  await admin.put('/api/admin/connections/bachs', { recurring: false });
});

test('one cent over: Bachs is disabled with one plain line, the server refuses it before Bachs is called, other methods still work', async () => {
  const p = await payer('KE');
  const pv = await p.client.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'capover', interval: 'month' });
  const bm = pv.body.providers.find(x => x.id === 'bachs');
  assert.equal(bm.total, 5000.01); assert.equal(bm.disabled, true); assert.equal(bm.over_cap, true); assert.equal(bm.card_auto_renew, false);
  assert.equal(pv.body.cap_note, MSG);
  assert.ok(pv.body.providers.some(x => x.id === 'demo' && !x.disabled), 'another method still offered');
  const n = checkouts().length, before = ordersOf(p.ws.id);
  for (const auto of [false, true]) {
    const r = await buy(p, 'capover', { auto_renew: auto });
    assert.equal(r.status, 400); assert.equal(r.body.error, MSG);
  }
  assert.equal(checkouts().length, n, 'nothing sent to Bachs'); assert.equal(ordersOf(p.ws.id), before, 'no order made');
  // The adapter itself refuses too (defence in depth).
  await assert.rejects(bachs.createCheckout({ ref: 'RV-X', currency: 'USD', amount_local: 5000.01, workspace_id: 1, kind: 'plan', amount_usd: 4807.70 }, { email: 'x@example.com' }), e => e.overCap && e.message === MSG);
  // Another method works for the same plan; with no method chosen, Bachs is never the default.
  const d = await p.client.post('/api/app/checkout', { kind: 'plan', item_id: 'capover', interval: 'month', provider: 'demo' });
  assert.equal(d.status, 200, d.text); assert.match(d.body.redirect, /^\/pay\/demo\//);
  const auto = await p.client.post('/api/app/checkout', { kind: 'plan', item_id: 'capover', interval: 'month' });
  assert.equal(auto.status, 200, auto.text); assert.notEqual(ctx.db.one('SELECT provider FROM orders WHERE ref = ?', auto.body.ref).provider, 'bachs');
  // A higher admin cap lets it through; BACHS_MAX_USD applies when the setting is empty.
  await admin.put('/api/admin/connections/bachs', { max_usd: 6000 });
  assert.equal((await buy(p, 'capover')).status, 200);
  await admin.put('/api/admin/connections/bachs', { max_usd: null });
  process.env.BACHS_MAX_USD = '4500';
  const e = await buy(p, 'capat');
  assert.equal(e.status, 400); assert.equal(e.body.error, 'Bachs takes up to $4,500 per payment. Pay in parts, or choose another method.');
  delete process.env.BACHS_MAX_USD;
});

test('naira near the boundary is counted back at the same naira rate the checkout uses', async () => {
  await admin.put('/api/admin/connections/bachs', { ngn_rate: 1537.5 });
  assert.equal(bachs.usdValue(7687500, 'NGN'), 5000);
  assert.equal(bachs.overCap(7687500, 'NGN'), false, 'exactly $5,000 in naira');
  assert.equal(bachs.overCap(7687507.68, 'NGN'), false, 'under half a cent over rounds to the cap');
  assert.equal(bachs.overCap(7687515.38, 'NGN'), true, 'one cent over');
  const p = await payer('NG');
  const pv = await p.client.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'capat', interval: 'month' });
  const bm = pv.body.providers.find(x => x.id === 'bachs');
  assert.equal(bm.amount_local, 7687500); assert.ok(!bm.disabled);
  const at = await buy(p, 'capat');
  assert.equal(at.status, 200, at.text);
  assert.deepEqual(checkouts().pop().body.pricing, { currency: 'NGN', amount: '7687500.00', price_type: 'fixed' });
  const pv2 = await p.client.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'capover', interval: 'month' });
  assert.equal(pv2.body.providers.find(x => x.id === 'bachs').disabled, true);
  const n = checkouts().length;
  const over = await buy(p, 'capover');
  assert.equal(over.status, 400); assert.equal(over.body.error, MSG); assert.equal(checkouts().length, n);
  await admin.put('/api/admin/connections/bachs', { ngn_rate: 1500 });
});

test('auto-renew: a renewal price over the cap is never moved to; flagged for admin, auto-renew ends, one-off reminder', async () => {
  await admin.put('/api/admin/connections/bachs', { recurring: true });
  const p = await payer('KE');
  const due = new Date(Date.now() + 3 * 864e5).toISOString(), subId = 'sub_cap' + crypto.randomBytes(3).toString('hex');
  ctx.db.update('workspaces', p.ws.id, { plan_id: 'capat', plan_interval: 'month', period_start: new Date(Date.now() - 27 * 864e5).toISOString(), period_end: new Date(Date.parse(due) + 864e5).toISOString(), reminded_at: null });
  ctx.db.insert('bachs_subscriptions', { workspace_id: p.ws.id, user_id: p.user.id, sub_id: subId, plan_id: 'capat', interval: 'month', currency: 'USD', amount_local: 5000, amount_usd: 4807.69, status: 'active', paid_through: due, created_at: ctx.db.now(), updated_at: ctx.db.now() });
  subsMap.set(subId, { id: subId, status: 'active', cancel_at_period_end: false });
  // The owner raises the plan price: the renewal would be $5,096.00 with the fee.
  ctx.db.run("UPDATE plans SET price_month = 4900 WHERE id = 'capat'");
  const n = log.length;
  await subs.daily();
  const after = log.slice(n);
  assert.ok(!after.some(x => x.url === '/v1/products'), 'no product at the over-cap price');
  assert.ok(!after.some(x => x.method === 'PATCH'), 'subscription not moved');
  const del = after.find(x => x.method === 'DELETE'); assert.ok(del, 'auto-renew turned off at Bachs'); assert.equal(del.body.cancel_at_period_end, true);
  const row = ctx.db.one('SELECT * FROM bachs_subscriptions WHERE sub_id = ?', subId);
  assert.match(row.flag, /over the Bachs limit of \$5,000/); assert.equal(row.cancel_at_period_end, 1); assert.equal(row.next_amount_local, null);
  assert.equal(subs.autoRenewing(p.ws.id), false);
  await h.waitFor(() => h.emails(p.email, 'renewal-reminder').length === 1, { label: 'one-off reminder' });
  assert.equal(h.emails(p.email, 'card-renews-soon').length, 0, 'no card charge reminder');
  await subs.daily(); await require('../src/services/scheduler').renewalReminders();
  await h.sleep(50);
  assert.equal(h.emails(p.email, 'renewal-reminder').length, 1, 'reminder sent once');
  const a = await admin.get('/api/admin/bachs/subscriptions');
  assert.ok(a.body.subscriptions.some(x => x.sub_id === subId && /limit/.test(x.flag || '')), 'flag shown to admin');
  ctx.db.run("UPDATE plans SET price_month = 4807.69 WHERE id = 'capat'");
});
