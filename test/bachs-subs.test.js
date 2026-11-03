'use strict';
// Bachs card auto-renew against a fake Bachs, with signed (mocked) webhooks: subscription checkout, first charge,
// renewal, duplicate events, failed payment and grace, cancel at period end, price change with the naira rate (moved
// to the new price, reminder shows it), a renewal under the margin floor when Bachs refuses, and the quiet fallback.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const h = require('./helpers');

const KEY = 'sk_live_replyvoosubs123';
const WHS = 'whsec_replyvoosubs123';
let ctx, fake, config, subs;
const products = new Map(), sessions = new Map(), subsMap = new Map(), log = [];
let refuseProducts = false, refusePatch = false;

before(async () => {
  ctx = await h.boot();
  config = require('../src/config');
  subs = require('../src/services/bachs-subs');
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== 'Bearer ' + KEY) return json({ message: 'Invalid API key' }, 401);
      const p = body ? JSON.parse(body) : {};
      log.push({ method: req.method, url: req.url, body: p });
      if (req.method === 'POST' && req.url === '/v1/products') {
        if (refuseProducts) return json({ message: 'no subscription access' }, 403);
        const id = 'prod_' + crypto.randomBytes(4).toString('hex'); products.set(id, p); return json({ data: { id, ...p } }, 201);
      }
      if (req.method === 'POST' && req.url === '/v1/checkout-sessions') {
        const id = 'chk_' + crypto.randomBytes(5).toString('hex');
        const s = { checkout_id: id, checkout_url: 'https://checkout.bachs.test/' + id, reference: p.reference, status: 'OPEN', ...(p.pricing ? { pricing: p.pricing } : { mode: 'subscription' }) };
        sessions.set(id, s); return json(s, 201);
      }
      let m = /^\/v1\/checkout-sessions\/([\w-]+)$/.exec(req.url);
      if (req.method === 'GET' && m) return sessions.has(m[1]) ? json(sessions.get(m[1])) : json({ message: 'not found' }, 404);
      m = /^\/v1\/subscriptions\/([\w-]+)$/.exec(req.url);
      if (m) {
        const s = subsMap.get(m[1]); if (!s) return json({ message: 'not found' }, 404);
        if (req.method === 'GET') return json({ data: s });
        if (req.method === 'PATCH') { if (refusePatch) return json({ message: 'price change not allowed' }, 422); s.product_id = p.product_id; return json({ data: s }); }
        if (req.method === 'DELETE') { s.cancel_at_period_end = !!p.cancel_at_period_end; return json({ data: s }); }
      }
      m = /^\/v1\/customers\/([\w-]+)\/portal-sessions$/.exec(req.url);
      if (req.method === 'POST' && m) return json({ data: { url: 'https://billing.bachs.test/p/' + m[1] } }, 201);
      json({ message: 'nope' }, 404);
    });
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  config.bachs.apiBase = 'http://127.0.0.1:' + fake.address().port;
  const o = await h.login(h.ADMIN.email, h.ADMIN.password);
  const r = await o.put('/api/admin/connections/bachs', { secret_key: KEY, webhook_secret: WHS, enabled: true, ngn_rate: 1500 });
  assert.equal(r.status, 200, r.text);
});
after(async () => { config.bachs.apiBase = ''; await new Promise(r => fake.close(r)); await ctx.close(); });

// Signed with the V2 header Bachs prefers.
function hook(ev) {
  const raw = JSON.stringify(ev); const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', WHS).update(ts + '.' + raw).digest('hex');
  return h.client().req('POST', '/webhooks/bachs', raw, { raw: true, csrf: false, headers: { 'content-type': 'application/json', 'x-bachs-signature-v2': 't=' + ts + ',v1=' + sig } });
}
async function payer(country) {
  const s = await h.signup({}, h.client());
  assert.equal((await s.client.put('/api/app/profile', { country })).status, 200);
  return s;
}
const wsRow = id => ctx.db.one('SELECT * FROM workspaces WHERE id = ?', id);
const sub = id => ctx.db.one('SELECT * FROM bachs_subscriptions WHERE sub_id = ?', id);
const paidPlans = wsId => ctx.db.all("SELECT * FROM orders WHERE workspace_id = ? AND kind = 'plan' AND status = 'paid'", wsId);
const iso = t => new Date(t).toISOString();
const D = 864e5;

async function subscribe(country, interval = 'month') {
  const p = await payer(country);
  const co = await p.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval, provider: 'bachs' });
  assert.equal(co.status, 200, co.text);
  const subId = 'sub_' + crypto.randomBytes(4).toString('hex');
  const end = iso(Date.now() + 30 * D);
  subsMap.set(subId, { id: subId, status: 'active', customer_id: 'cust_' + subId, current_period_end: end, metadata: { app: 'replyvoo', reference: co.body.ref } });
  return { p, co, subId, end };
}

let A;
test('plan checkout with Bachs makes a monthly recurring product and a card subscription checkout (auto-renew on by default)', async () => {
  const p = await payer('NG');
  const pv = await p.client.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'starter', interval: 'month' });
  const bm = pv.body.providers.find(x => x.id === 'bachs');
  assert.equal(bm.card_auto_renew, true);
  A = await subscribe('NG');
  assert.equal(A.co.body.auto_renew, true);
  const prod = log.find(x => x.url === '/v1/products');
  assert.deepEqual(prod.body.billing_cycle, { interval: 'month', frequency: 1 });
  assert.equal(prod.body.price.currency, 'NGN');
  assert.equal(prod.body.price.amount, (Math.round(30.16 * 1500 * 100) / 100).toFixed(2), 'naira price with the 4% fee built in');
  const cs = log.filter(x => x.url === '/v1/checkout-sessions').pop();
  assert.ok(cs.body.product_cart && !cs.body.pricing);
  // Off → normal one-off Bachs payment (bank, mobile money, crypto).
  const one = await p.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs', auto_renew: false });
  assert.equal(one.body.auto_renew, false);
  assert.ok(log.filter(x => x.url === '/v1/checkout-sessions').pop().body.pricing);
  await p.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'year', provider: 'bachs' });
  assert.equal(log.filter(x => x.url === '/v1/products').pop().body.billing_cycle.interval, 'year');
});

test('create webhook links the subscription; the first invoice.paid gives the plan once; nothing before Bachs confirms', async () => {
  assert.equal((await hook({ id: 'evt_c1', type: 'customer.subscription.created', data: { object: { id: A.subId, metadata: { reference: A.co.body.ref } } } })).status, 200);
  assert.ok(sub(A.subId));
  assert.equal(paidPlans(A.p.ws.id).length, 0);
  const amt = sub(A.subId).amount_local.toFixed(2);
  assert.equal((await hook({ id: 'evt_i1', type: 'invoice.paid', data: { object: { id: 'inv_1', subscription_id: A.subId, billing_reason: 'subscription_create', amount_paid: amt, currency: 'NGN', period_end: A.end } } })).status, 200);
  assert.equal(paidPlans(A.p.ws.id).length, 1);
  assert.equal(wsRow(A.p.ws.id).plan_id, 'starter');
  const w = (await A.p.client.get('/api/app/wallet')).body;
  assert.equal(w.subscription.next_charge_at.slice(0, 10), A.end.slice(0, 10));
  assert.match(w.subscription.next_amount_label, /^₦/);
});

test('a renewal extends the plan through the normal order path and resets usage; duplicate events never give twice', async () => {
  ctx.db.run('UPDATE workspaces SET conv_used = 77 WHERE id = ?', A.p.ws.id);
  const next = iso(Date.parse(A.end) + 30 * D); subsMap.get(A.subId).current_period_end = next;
  const amt = sub(A.subId).amount_local.toFixed(2);
  const ev = { id: 'evt_i2', type: 'invoice.paid', data: { object: { id: 'inv_2', subscription_id: A.subId, amount_paid: amt, currency: 'NGN', period_end: next } } };
  assert.equal((await hook(ev)).status, 200);
  assert.equal(paidPlans(A.p.ws.id).length, 2);
  const w = wsRow(A.p.ws.id);
  assert.equal(w.conv_used, 0, 'new period allowance');
  assert.equal(w.period_end.slice(0, 10), iso(Date.parse(next) + D).slice(0, 10), 'period from Bachs');
  await hook(ev); await hook({ ...ev, id: 'evt_i2b' });
  await hook({ id: 'evt_i1', type: 'invoice.paid', data: { object: { id: 'inv_1', subscription_id: A.subId, amount_paid: amt, currency: 'NGN', period_end: A.end } } });
  assert.equal(paidPlans(A.p.ws.id).length, 2, 'same event or invoice: nothing more');
  assert.equal(wsRow(A.p.ws.id).period_end, w.period_end);
  A.end = next;
});

test('failed payment: calm notice and one email, nothing given, plan kept during grace, then back to the free plan', async () => {
  const before = paidPlans(A.p.ws.id).length;
  await hook({ id: 'evt_f1', type: 'invoice.payment_failed', data: { object: { id: 'inv_3', subscription_id: A.subId, amount_due: '1', currency: 'NGN' } } });
  await hook({ id: 'evt_f2', type: 'invoice.payment_failed', data: { object: { id: 'inv_3', subscription_id: A.subId, amount_due: '1', currency: 'NGN' } } });
  assert.equal(sub(A.subId).status, 'past_due'); assert.equal(sub(A.subId).fail_count, 2);
  await h.waitFor(() => h.emails(A.p.email, 'payment-failed').length === 1, { label: 'payment-failed email' });
  assert.equal(paidPlans(A.p.ws.id).length, before);
  const w = (await A.p.client.get('/api/app/wallet')).body;
  assert.match(w.subscription.payment_failed.message, /Update your card/);
  assert.match((await A.p.client.post('/api/app/billing/card', {})).body.url, /^https:\/\/billing\.bachs\.test\//);
  // Grace over without a paid retry → free plan, the same as an expired plan.
  ctx.db.run('UPDATE bachs_subscriptions SET grace_until = ? WHERE sub_id = ?', iso(Date.now() - 60e3), A.subId);
  await subs.daily();
  assert.equal(sub(A.subId).status, 'unpaid');
  assert.notEqual(wsRow(A.p.ws.id).plan_id, 'starter');
});

test('one-click cancel calls Bachs with cancel_at_period_end; the plan stays active', async () => {
  const B = await subscribe('KE');
  await hook({ id: 'evt_b1', type: 'invoice.paid', data: { object: { id: 'inv_b1', subscription_id: B.subId, billing_reason: 'subscription_create', amount_paid: '30.16', currency: 'USD', period_end: B.end, metadata: { reference: B.co.body.ref } } } });
  assert.equal(wsRow(B.p.ws.id).plan_id, 'starter');
  const c = await B.p.client.post('/api/app/billing/cancel', {});
  assert.equal(c.status, 200, c.text);
  const del = log.filter(x => x.method === 'DELETE').pop();
  assert.equal(del.url, '/v1/subscriptions/' + B.subId); assert.equal(del.body.cancel_at_period_end, true);
  assert.equal(wsRow(B.p.ws.id).plan_id, 'starter');
  assert.equal((await B.p.client.get('/api/app/wallet')).body.subscription.cancel_at_period_end, true);
});

let C;
test('naira price follows the rate: subscriber moved to the new price, the reminder shows it; yearly also gets 7 days', async () => {
  C = await subscribe('NG');
  await hook({ id: 'evt_cc', type: 'invoice.paid', data: { object: { id: 'inv_c1', subscription_id: C.subId, billing_reason: 'subscription_create', amount_paid: (Math.round(30.16 * 1500 * 100) / 100).toFixed(2), currency: 'NGN', period_end: C.end, metadata: { reference: C.co.body.ref } } } });
  const o = await h.login(h.ADMIN.email, h.ADMIN.password);
  await o.put('/api/admin/connections/bachs', { ngn_rate: 1800 });
  await subs.daily(Date.parse(C.end) - 3 * D);
  const patch = log.filter(x => x.method === 'PATCH').pop();
  assert.equal(patch.url, '/v1/subscriptions/' + C.subId);
  const newAmt = Math.round(30.16 * 1800 * 100) / 100;
  assert.equal(products.get(patch.body.product_id).price.amount, newAmt.toFixed(2));
  await h.waitFor(() => h.emails(C.p.email, 'card-renews-soon').length === 1, { label: 'reminder' });
  assert.match(h.emails(C.p.email, 'card-renews-soon')[0].subject, new RegExp(newAmt.toLocaleString('en-US').replace('.', '\\.')));
  await subs.daily(Date.parse(C.end) - 3 * D);
  assert.equal(h.emails(C.p.email, 'card-renews-soon').length, 1, 'once per charge');
  await hook({ id: 'evt_cu', type: 'customer.subscription.updated', data: { object: { id: C.subId } } });
  assert.equal(sub(C.subId).amount_local, newAmt);
  // Yearly: 7 days before as well.
  const Y = await subscribe('KE', 'year');
  await hook({ id: 'evt_y1', type: 'invoice.paid', data: { object: { id: 'inv_y1', subscription_id: Y.subId, billing_reason: 'subscription_create', amount_paid: '9999', currency: 'USD', period_end: iso(Date.now() + 7 * D), metadata: { reference: Y.co.body.ref } } } });
  await subs.daily();
  await h.waitFor(() => h.emails(Y.p.email, 'card-renews-soon').length === 1, { label: 'yearly 7-day reminder' });
});

test('Bachs refuses the price change: the renewal still gives what was paid for, is flagged under the margin floor, and the move is retried', async () => {
  refusePatch = true;
  const o = await h.login(h.ADMIN.email, h.ADMIN.password);
  await o.put('/api/admin/connections/bachs', { ngn_rate: 4000 });
  await subs.movePrice(sub(C.subId));
  assert.match(sub(C.subId).price_move, /refused/);
  const next = iso(Date.parse(C.end) + 30 * D); subsMap.get(C.subId).current_period_end = next;
  const n = paidPlans(C.p.ws.id).length;
  await hook({ id: 'evt_c2', type: 'invoice.paid', data: { object: { id: 'inv_c2', subscription_id: C.subId, amount_paid: sub(C.subId).amount_local.toFixed(2), currency: 'NGN', period_end: next } } });
  const pp = paidPlans(C.p.ws.id); assert.equal(pp.length, n + 1);
  assert.match(JSON.parse(pp[pp.length - 1].meta).review_flag, /margin floor/);
  const a = await o.get('/api/admin/bachs/subscriptions');
  assert.equal(a.status, 200);
  assert.ok(a.body.subscriptions.some(x => x.sub_id === C.subId && /margin floor/.test(x.flag)));
  assert.ok(a.body.flagged.length >= 1);
  refusePatch = false;
  await subs.movePrice(sub(C.subId));
  assert.match(sub(C.subId).price_move, /^Moving/);
  await o.put('/api/admin/connections/bachs', { ngn_rate: 1500 });
});

test('no subscription access: checkout quietly falls back to one-off; the admin switch turns auto-renew off', async () => {
  refuseProducts = true;
  ctx.db.run('DELETE FROM bachs_products');
  const p = await payer('NG');
  const co = await p.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs' });
  assert.equal(co.status, 200, co.text); assert.equal(co.body.auto_renew, false);
  assert.ok(subs.state().unavailable);
  refuseProducts = false;
  ctx.db.run("DELETE FROM settings WHERE key = 'bachs_recurring_state'");
  const o = await h.login(h.ADMIN.email, h.ADMIN.password);
  await o.put('/api/admin/connections/bachs', { recurring: false });
  assert.equal(subs.enabled(), false);
  await o.put('/api/admin/connections/bachs', { recurring: true });
  assert.equal(subs.enabled(), true);
});
