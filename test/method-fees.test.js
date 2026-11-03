'use strict';
// Customer fee per payment method (migration 013, Admin → Billing rules → Payment method fees). The fee is built into the
// price the customer sees for that method, never shown as its own line. Bachs 4% by default, Gatevoo always 0% (with a
// "save" note), the rest admin-editable. The order keeps base and fee apart: credits and plans at the base price, refunds
// return everything paid, Voo Squad rewards and VooSquare use the base only.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const h = require('./helpers');

const KEY = 'sk_live_feetest12345';
const WHS = 'whsec_feetest12345';
let ctx, fake, config;
const sessions = new Map();

before(async () => {
  ctx = await h.boot();
  config = require('../src/config');
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== 'Bearer ' + KEY) return json({ message: 'Invalid API key' }, 401);
      if (req.method === 'POST' && req.url === '/v1/checkout-sessions') {
        const p = JSON.parse(body);
        const id = 'chk_' + crypto.randomBytes(5).toString('hex');
        const s = { checkout_id: id, checkout_url: 'https://checkout.bachs.test/' + id, reference: p.reference, pricing: p.pricing, status: 'OPEN' };
        sessions.set(id, s);
        return json(s, 201);
      }
      const m = /^\/v1\/checkout-sessions\/([\w-]+)$/.exec(req.url);
      if (req.method === 'GET' && m) { const s = sessions.get(m[1]); return s ? json(s) : json({ message: 'not found' }, 404); }
      json({ message: 'nope' }, 404);
    });
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  config.bachs.apiBase = 'http://127.0.0.1:' + fake.address().port;
  const o = await owner();
  const r = await o.put('/api/admin/connections/bachs', { secret_key: KEY, webhook_secret: WHS, enabled: true });
  assert.equal(r.status, 200, r.text);
});
after(async () => { config.bachs.apiBase = ''; await new Promise(r => fake.close(r)); await ctx.close(); });

const owner = () => h.login(h.ADMIN.email, h.ADMIN.password);
async function payer(country = 'KE') {
  const s = await h.signup({}, h.client());
  assert.equal((await s.client.put('/api/app/profile', { country })).status, 200);
  return s;
}
const order = ref => ctx.db.one('SELECT * FROM orders WHERE ref = ?', ref);
const preview = (c, body = { kind: 'plan', item_id: 'starter', interval: 'month' }) => c.post('/api/app/checkout/preview', body);
const pick = (pv, id) => pv.providers.find(p => p.id === id);
const pack = () => ctx.db.one('SELECT * FROM packs WHERE active = 1 ORDER BY price LIMIT 1');
async function setFees(o, fees) {
  const cur = (await o.get('/api/admin/settings')).body.billing;
  return o.put('/api/admin/settings/billing', { value: { ...cur, method_fees: { ...cur.method_fees, ...fees } } });
}
async function payBachs(c, body) {
  const r = await c.post('/api/app/checkout', { ...body, provider: 'bachs' });
  assert.equal(r.status, 200, r.text);
  const o = order(r.body.ref);
  sessions.get(o.provider_ref).status = 'COMPLETED';
  await c.get('/pay/callback?ref=' + o.ref);
  assert.equal(order(o.ref).status, 'paid');
  return order(o.ref);
}

test('defaults: Bachs 4%, Gatevoo 0%, every other method 0%', () => {
  const pay = require('../src/services/payments');
  assert.deepEqual(require('../src/services/settings').get('billing').method_fees, { bachs: 4, gatevoo: 0, paystack: 0, flutterwave: 0, crypto: 0, demo: 0 });
  assert.equal(pay.feePct('bachs'), 4);
  assert.equal(pay.feePct('gatevoo'), 0);
  assert.equal(pay.feePct('joinvoo_credits'), 0);
  assert.equal(pay.feePct('paystack'), 0);
  assert.deepEqual(pay.withFee(29, 'bachs'), { pct: 4, fee: 1.16, total: 30.16 });
});

test('migration 013 fills the fee once, only where it is empty, and never overwrites a value the owner set', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '013_method_fees.sql'), 'utf8');
  const run = value => {
    const d = new DatabaseSync(':memory:');
    d.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY); CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);');
    if (value != null) d.prepare("INSERT INTO settings VALUES ('billing', ?, 'x')").run(value);
    d.exec(sql);
    return JSON.parse(d.prepare("SELECT value FROM settings WHERE key = 'billing'").get().value);
  };
  assert.deepEqual(run(null).method_fees, { bachs: 4, gatevoo: 0, paystack: 0, flutterwave: 0, crypto: 0, demo: 0 }, 'no billing row yet');
  const kept = run(JSON.stringify({ rates: { NGN: 1500 }, method_fees: { bachs: 2.5, paystack: 1, flutterwave: '' } }));
  assert.equal(kept.method_fees.bachs, 2.5, 'owner value kept');
  assert.equal(kept.method_fees.paystack, 1, 'owner value kept');
  assert.equal(kept.method_fees.flutterwave, 0, 'empty value filled');
  assert.equal(kept.method_fees.crypto, 0);
  assert.equal(kept.rates.NGN, 1500, 'the rest of billing is untouched');
  assert.deepEqual(run(JSON.stringify({ method_fees: { bachs: 0 } })).method_fees.bachs, 0, 'an owner-set 0 is a value, not empty');
});

test('Bachs: the checkout total is base × 1.04, built into every price; the order keeps base and fee apart', async () => {
  const p = await payer('KE');
  const pv = (await preview(p.client)).body;
  const bx = pick(pv, 'bachs');
  assert.equal(pv.amount, 29);
  assert.equal(bx.price, 30.16, 'the price line already includes the fee');
  assert.equal(bx.total, 30.16, '$29 × 1.04');
  assert.equal(bx.currency, 'USD');
  const r = await p.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs' });
  assert.equal(r.status, 200, r.text);
  const o = order(r.body.ref);
  assert.equal(o.amount_usd, 29, 'base');
  assert.equal(o.fee_usd, 1.16, 'fee recorded separately');
  assert.equal(o.fee_pct, 4);
  assert.equal(o.amount_local, 30.16, 'charged base + fee');
  assert.equal(sessions.get(o.provider_ref).pricing.amount, '30.16');
});

test('Bachs in naira: the same 4%, at the unchanged naira rate', async () => {
  const p = await payer('NG');
  const rate = require('../src/services/bachs').ngnRate();
  const bx = pick((await preview(p.client)).body, 'bachs');
  assert.equal(bx.currency, 'NGN');
  assert.equal(bx.amount_local, Math.round(30.16 * rate * 100) / 100);
  const r = await p.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs' });
  const o = order(r.body.ref);
  assert.equal(o.amount_usd, 29);
  assert.equal(o.fee_usd, 1.16);
  assert.equal(o.amount_local, Math.round(30.16 * rate * 100) / 100);
});

test('Gatevoo: the lower base price, no fee, and a "save" note from the actual difference', async () => {
  const p = await payer('KE');
  const pv = (await preview(p.client)).body;
  const gv = pick(pv, 'gatevoo');
  assert.ok(gv, 'Gatevoo offered (sandbox)');
  assert.equal(gv.total, 29, 'base price');
  assert.equal(gv.price, 29);
  assert.equal(gv.save_note, 'Pay with crypto and save 4%', '1.16 / 30.16 = 3.85% → 4%');
  assert.ok(!pick(pv, 'bachs').save_note, 'only Gatevoo carries the note');
  const r = await p.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo', coin: 'USDT_TRC20' });
  assert.equal(r.status, 200, r.text);
  const o = order(r.body.ref);
  assert.equal(o.amount_usd, 29);
  assert.equal(o.fee_usd, 0);
  assert.equal(o.fee_pct, 0);
  assert.equal(o.amount_local, 29);
  assert.equal(require('../src/services/gatevoo').sandboxPay(o.ref).ok, true, 'the base amount is enough');
  assert.equal(order(o.ref).status, 'paid');
});

test('no Bachs on offer: no "save" note (nothing to save against)', async () => {
  const p = await payer('GB');
  const pv = (await preview(p.client)).body;
  assert.ok(!pick(pv, 'bachs'));
  assert.ok(!pick(pv, 'gatevoo').save_note);
});

test('a fee edited in admin changes the price at checkout; Gatevoo stays 0; bad values are refused', async () => {
  const o = await owner();
  try {
    const r = await setFees(o, { bachs: 6, demo: 2, gatevoo: 3 });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.method_fees.bachs, 6);
    assert.equal(r.body.method_fees.gatevoo, 0, 'Gatevoo is always 0%');
    const p = await payer('KE');
    const pv = (await preview(p.client)).body;
    assert.equal(pick(pv, 'bachs').total, 30.74, '$29 × 1.06');
    assert.equal(pick(pv, 'demo').total, 29.58, '$29 × 1.02');
    assert.equal(pick(pv, 'gatevoo').total, 29);
    assert.equal(pick(pv, 'gatevoo').save_note, 'Pay with crypto and save 6%');
    const c = await p.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'bachs' });
    assert.equal(order(c.body.ref).fee_usd, 1.74);
    assert.equal(order(c.body.ref).fee_pct, 6);
    assert.equal((await setFees(o, { bachs: 75 })).status, 400);
    assert.equal((await setFees(o, { bachs: -1 })).status, 400);
    assert.equal(require('../src/services/settings').get('billing').method_fees.bachs, 6, 'a refused save changes nothing');
  } finally {
    assert.equal((await setFees(o, { bachs: 4, demo: 0 })).status, 200);
  }
});

test('coupons: the price, coupon and total lines all include the fee and still add up', async () => {
  const o = await owner();
  const code = 'FEE' + crypto.randomBytes(3).toString('hex').toUpperCase();
  assert.equal((await o.post('/api/admin/coupons', { code, kind: 'percent', value: 10, applies_to: 'all', active: true })).status, 200);
  const p = await payer('KE');
  const pv = (await preview(p.client, { kind: 'plan', item_id: 'starter', interval: 'month', coupon: code })).body;
  const bx = pick(pv, 'bachs');
  assert.equal(pv.total, 26.1, 'base after coupon');
  assert.equal(bx.total, 27.14, '26.10 × 1.04');
  assert.equal(Math.round((bx.price - bx.discount) * 100) / 100, bx.total);
});

test('no fee line anywhere a customer sees: checkout preview, orders list, demo page, receipt email', async () => {
  const o = await owner();
  const mailer = require('../src/services/mailer');
  const sent = [];
  const realSend = mailer.send;
  mailer.send = (to, name, data, opts) => { sent.push({ to, name, data }); return realSend(to, name, data, opts); };
  try {
    assert.equal((await setFees(o, { demo: 5 })).status, 200);
    const p = await payer('KE');
    const pv = await preview(p.client);
    assert.ok(!/fee/i.test(pv.text), 'the checkout preview never mentions a fee');
    const r = await p.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'demo' });
    assert.equal(r.status, 200, r.text);
    const page = await p.client.get('/pay/demo/' + r.body.ref);
    assert.match(page.text, /\$30\.45/, 'demo checkout shows $29 × 1.05');
    assert.ok(!/fee/i.test(page.text));
    assert.equal((await p.client.req('POST', '/pay/demo/' + r.body.ref, {}, { form: true, csrf: false })).status < 400, true);
    assert.equal(order(r.body.ref).status, 'paid');
    const w = (await p.client.get('/api/app/wallet')).body;
    const row = w.orders.find(x => x.ref === r.body.ref);
    assert.equal(row.amount_usd, 30.45, 'the orders list shows what was paid');
    assert.ok(!('fee_usd' in row) && !/fee/i.test(JSON.stringify(row)));
    const rc = sent.find(m => m.name === 'payment-receipt' && m.data.reference === r.body.ref);
    assert.ok(rc, 'receipt sent');
    assert.equal(rc.data.amount, '30.45', 'the receipt shows the full amount paid');
    const html = mailer.build('payment-receipt', rc.data);
    assert.match(html.html, /30\.45/);
    assert.ok(!/fee/i.test(html.text), 'no fee line in the receipt');
    // Admin still sees base and fee apart.
    const adm = (await o.get('/api/admin/orders')).body.find(x => x.ref === r.body.ref);
    assert.equal(adm.amount_usd, 29);
    assert.equal(adm.fee_usd, 1.45);
    assert.equal(adm.fee_pct, 5);
  } finally {
    mailer.send = realSend;
    await setFees(o, { demo: 0 });
  }
});

test('credits are granted at the base price; Voo Squad rewards use the base only', async () => {
  const ref = await payer('KE');
  const p = await payer('KE');
  ctx.db.run('UPDATE workspaces SET referred_by = ? WHERE id = ?', ref.ws.id, p.ws.id);
  const pk = pack();
  const before = ctx.db.one('SELECT credits FROM workspaces WHERE id = ?', p.ws.id).credits;
  const o = await payBachs(p.client, { kind: 'pack', item_id: pk.id });
  assert.equal(o.amount_usd, pk.price);
  assert.equal(o.fee_usd, Math.round(pk.price * 4) / 100);
  assert.equal(ctx.db.one('SELECT credits FROM workspaces WHERE id = ?', p.ws.id).credits - before, pk.credits + pk.bonus, 'exactly the pack, nothing for the fee');
  const re = ctx.db.one('SELECT * FROM referral_earnings WHERE order_id = ?', o.id);
  assert.ok(re, 'referral paid');
  const rate = require('../src/services/payments').referralRate(ref.ws.id);
  assert.ok(Math.abs(re.amount_usd - Math.round(pk.price * re.rate * 100) / 100) < 0.001, 'reward on the base, not base + fee');
  assert.ok(rate > 0);
});

test('a refund returns base + fee; VooSquare is told the base only', async () => {
  const voo = require('../src/services/voosquare');
  const seen = [];
  const realRefund = voo.refundEvent;
  voo.refundEvent = (order, usd) => { seen.push(usd); return null; };
  try {
    const p = await payer('KE');
    const o = await payBachs(p.client, { kind: 'plan', item_id: 'starter', interval: 'month' });
    const adm = await owner();
    const r = await adm.post('/api/admin/orders/' + o.ref + '/refund', {});
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.usd, 30.16, 'everything the customer paid');
    const m = JSON.parse(order(o.ref).meta).refund;
    assert.equal(m.usd, 30.16);
    assert.equal(m.base_usd, 29);
    assert.equal(m.fee_usd, 1.16);
    assert.deepEqual(seen, [29], 'VooSquare: base only');
    // A partial refund is capped at what was paid.
    const o2 = await payBachs(p.client, { kind: 'pack', item_id: pack().id });
    const r2 = await adm.post('/api/admin/orders/' + o2.ref + '/refund', { amount_usd: 9999 });
    assert.equal(r2.body.usd, Math.round((o2.amount_usd + o2.fee_usd) * 100) / 100);
  } finally { voo.refundEvent = realRefund; }
});

test('Joinvoo credits: no fee, nothing changes', () => {
  const pay = require('../src/services/payments');
  assert.deepEqual(pay.withFee(29, 'joinvoo_credits'), { pct: 0, fee: 0, total: 29 });
});
