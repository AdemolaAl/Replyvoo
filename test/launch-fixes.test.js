'use strict';
// Pre-launch money fixes: plan switching keeps paid time, suspension sticks, rates, coupons, limits, add-ons.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let ctx, db, ws, payments, settings;
const DAY = 864e5;
before(async () => {
  ctx = await h.boot();
  db = ctx.db; ws = require('../src/services/workspace'); payments = require('../src/services/payments'); settings = require('../src/services/settings');
  // Fake Telegram for the connect route.
  const prev = globalThis.fetch; let bot = 7000;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (/api\.telegram\.org\/bot[^/]+\/getMe/.test(url)) { bot++; return new Response(JSON.stringify({ ok: true, result: { id: bot, is_bot: true, first_name: 'Shop Bot ' + bot, username: 'shop' + bot + '_bot' } }), { headers: { 'content-type': 'application/json' } }); }
    if (/api\.telegram\.org/.test(url)) return new Response(JSON.stringify({ ok: true, result: true }), { headers: { 'content-type': 'application/json' } });
    return prev(input, init);
  };
});
after(() => ctx.close());

const W = id => ws.get(id);
async function buy(c, body) {
  const r = await c.post('/api/app/checkout', { provider: 'demo', ...body });
  assert.equal(r.status, 200, r.text);
  assert.equal((await c.post('/pay/demo/' + r.body.ref, {}, { form: true })).status, 302);
  return db.one('SELECT * FROM orders WHERE ref = ?', r.body.ref);
}

test('switching plans keeps the value of unused paid time', async () => {
  const s = await h.signup();
  await buy(s.client, { kind: 'plan', item_id: 'business', interval: 'year' });
  const before = W(s.ws.id);
  // ~1 month used of the yearly plan.
  db.update('workspaces', s.ws.id, { period_start: new Date(Date.now() - 30 * DAY).toISOString(), period_end: new Date(Date.now() + 335 * DAY).toISOString() });
  assert.equal(before.plan_id, 'business');
  await buy(s.client, { kind: 'plan', item_id: 'titan', interval: 'month' });
  const w = W(s.ws.id);
  assert.equal(w.plan_id, 'titan');
  const days = (new Date(w.period_end) - Date.now()) / DAY;
  // 335 days of Business yearly ($2990/365 a day) is worth about 2743 USD = about 137 days of Titan monthly ($599/30).
  assert.ok(days > 150 && days < 175, 'kept the unused Business time as Titan days, got ' + days.toFixed(1));
});

test('renewing the same plan extends it; a month never rolls over (Jan 31 + 1 month)', async () => {
  const s = await h.signup();
  await buy(s.client, { kind: 'plan', item_id: 'starter', interval: 'month' });
  const end1 = new Date(W(s.ws.id).period_end);
  await buy(s.client, { kind: 'plan', item_id: 'starter', interval: 'month' });
  const ext = (new Date(W(s.ws.id).period_end) - end1) / DAY;
  assert.ok(ext >= 28 && ext <= 31.1, 'extended by one month, got ' + ext);
  db.update('workspaces', s.ws.id, { plan_id: 'spark', period_end: new Date(Date.now() - DAY).toISOString() });
});

test('a late payment does not lift a suspension', async () => {
  const s = await h.signup();
  const r = await s.client.post('/api/app/checkout', { provider: 'demo', kind: 'plan', item_id: 'starter', interval: 'month' });
  db.update('workspaces', s.ws.id, { status: 'suspended' });
  payments.fulfill(r.body.ref, { via: 'test' });
  assert.equal(W(s.ws.id).status, 'suspended');
  assert.equal(W(s.ws.id).plan_id, 'starter', 'they still get what they paid for');
});

test('checkout refuses a local currency with no exchange rate', async () => {
  const b = settings.get('billing');
  const prevCfg = require('../src/config').pay.paystackSecret;
  require('../src/config').pay.paystackSecret = 'sk_test_x';
  settings.set('billing', { ...b, paystack_currency: 'XOF', rates: { ...b.rates, XOF: 0 } });
  try {
    const s = await h.signup({ country: 'NG' });
    const r = await s.client.post('/api/app/checkout', { provider: 'paystack', kind: 'plan', item_id: 'starter', interval: 'month' });
    assert.equal(r.status, 500);
    assert.match(r.body.error, /not set up for XOF/);
  } finally { settings.set('billing', b); require('../src/config').pay.paystackSecret = prevCfg; }
});

test('a first-purchase coupon cannot be used on two open checkouts', async () => {
  const s = await h.signup();
  const one = await s.client.post('/api/app/checkout', { provider: 'demo', kind: 'plan', item_id: 'starter', interval: 'month', coupon: 'WELCOME20' });
  assert.equal(one.status, 200);
  const two = await s.client.post('/api/app/checkout', { provider: 'demo', kind: 'plan', item_id: 'growth', interval: 'month', coupon: 'WELCOME20' });
  assert.equal(two.status, 400);
  assert.match(two.body.error, /already have a checkout open/);
});

test('Closers over the plan limit stay saved but stop replying', async () => {
  const s = await h.signup();
  const ids = db.all('SELECT id FROM closers WHERE workspace_id = ? ORDER BY id', s.ws.id).map(r => r.id);
  // Simulate two extra Closers left over from a bigger plan.
  for (let i = 0; i < 2; i++) ids.push(db.insert('closers', { workspace_id: s.ws.id, name: 'Old ' + i, active: 1, created_at: db.now(), updated_at: db.now() }));
  const lim = ws.limits(W(s.ws.id)).closers;
  ids.forEach((id, i) => assert.equal(ws.closerUnlocked(db.one('SELECT * FROM closers WHERE id = ?', id)), i < lim, 'closer #' + (i + 1)));
});

test('Telegram connections follow the plan (Spark: 1)', async () => {
  const s = await h.signup();
  const tok = n => n + '00000:' + 'A'.repeat(35);
  const a = await s.client.post('/api/app/channels/telegram', { token: tok(1) });
  assert.equal(a.status, 200, a.text);
  const b = await s.client.post('/api/app/channels/telegram', { token: tok(2) });
  assert.equal(b.status, 402);
  assert.equal(b.body.code, 'channel_limit');
});

test('add-ons: extra seat lasts 30 days, credits add-ons pay out, done-for-you opens a setup ticket', async () => {
  const s = await h.signup();
  await buy(s.client, { kind: 'addon', item_id: 'extra-seat' });
  const slots = W(s.ws.id).settings.seat_slots;
  assert.equal(slots.length, 1);
  assert.ok(Math.abs(new Date(slots[0].exp) - Date.now() - 30 * DAY) < 60e3);
  db.run("UPDATE addons SET credits = 250 WHERE slug = 'extra-seat'");
  const c0 = W(s.ws.id).credits;
  await buy(s.client, { kind: 'addon', item_id: 'extra-seat' });
  assert.equal(W(s.ws.id).credits, c0 + 250);
  db.run("UPDATE addons SET credits = 0 WHERE slug = 'extra-seat'");
  const o = await buy(s.client, { kind: 'addon', item_id: 'done-for-you' });
  await h.waitFor(() => db.one('SELECT id FROM support_tickets WHERE subject LIKE ?', '%' + o.ref + '%'));
  const t = db.one('SELECT t.*, b.name box FROM support_tickets t JOIN support_boxes b ON b.id = t.box_id WHERE t.subject LIKE ?', '%' + o.ref + '%');
  assert.equal(t.box, 'Setup help');
  assert.equal(t.priority, 'high');
});
