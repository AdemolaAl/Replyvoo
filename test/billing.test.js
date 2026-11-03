'use strict';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_replyvoo';
process.env.FLUTTERWAVE_WEBHOOK_HASH = 'flw-hash-secret';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const h = require('./helpers');

let env, db, ws, payments;
const HOUR = 3600e3;
const DAY = 24 * HOUR;

before(async () => {
  env = await h.boot();
  db = env.db;
  ws = require('../src/services/workspace');
  payments = require('../src/services/payments');
});
after(() => env.close());

const W = id => db.one('SELECT * FROM workspaces WHERE id = ?', id);

describe('chargeForReply', () => {
  test('first reply starts a conversation and uses the plan allowance', () => {
    const { ws: w } = h.makeWorkspace({ plan: 'spark', credits: 5 });
    const t = h.makeThread(w.id);
    const r = ws.chargeForReply(w.id, t.thread());
    assert.equal(r.ok, true);
    assert.equal(r.newUnit, true);
    assert.equal(r.credits, 0);
    assert.equal(W(w.id).conv_used, 1);
    assert.equal(W(w.id).credits, 5, 'no credits spent while allowance remains');
    const th = t.thread();
    assert.equal(th.units, 1);
    assert.equal(th.unit_replies, 0);
    assert.ok(Math.abs(new Date(th.window_start) - Date.now()) < 5000);
    assert.equal(db.one('SELECT COUNT(*) n FROM credit_tx WHERE workspace_id = ?', w.id).n, 0);
  });

  test('10 replies fit in one conversation, the 11th starts a new unit', () => {
    const { ws: w } = h.makeWorkspace({ plan: 'spark' });
    const t = h.makeThread(w.id);
    for (let i = 1; i <= 10; i++) {
      const r = ws.chargeForReply(w.id, t.thread());
      assert.equal(r.ok, true);
      assert.equal(r.newUnit, i === 1, 'reply ' + i);
      ws.commitReply(t.threadId);
    }
    assert.equal(W(w.id).conv_used, 1);
    assert.equal(t.thread().unit_replies, 10);
    const windowStart = t.thread().window_start;
    const r = ws.chargeForReply(w.id, t.thread());
    assert.equal(r.newUnit, true);
    assert.equal(W(w.id).conv_used, 2);
    assert.equal(t.thread().units, 2);
    assert.equal(t.thread().unit_replies, 0);
    assert.ok(t.thread().window_start >= windowStart, 'a new conversation starts a fresh 24h window (no second charge an hour later)');
  });

  test('a reply after the 24h window starts a new conversation and a new window', () => {
    const { ws: w } = h.makeWorkspace({ plan: 'spark' });
    const t = h.makeThread(w.id);
    ws.chargeForReply(w.id, t.thread()); ws.commitReply(t.threadId);
    db.run('UPDATE threads SET window_start = ? WHERE id = ?', new Date(Date.now() - 23 * HOUR).toISOString(), t.threadId);
    assert.equal(ws.chargeForReply(w.id, t.thread()).newUnit, false, '23h: same conversation');
    db.run('UPDATE threads SET window_start = ? WHERE id = ?', new Date(Date.now() - 25 * HOUR).toISOString(), t.threadId);
    const r = ws.chargeForReply(w.id, t.thread());
    assert.equal(r.newUnit, true);
    assert.equal(W(w.id).conv_used, 2);
    assert.ok(Date.now() - new Date(t.thread().window_start) < 5000, 'window restarted');
  });

  test('window length and reply limit follow billing settings', () => {
    const settings = require('../src/services/settings');
    settings.set('billing', { conversation_reply_limit: 2, conversation_window_hours: 1 });
    try {
      const { ws: w } = h.makeWorkspace({ plan: 'spark' });
      const t = h.makeThread(w.id);
      ws.chargeForReply(w.id, t.thread()); ws.commitReply(t.threadId);
      assert.equal(ws.chargeForReply(w.id, t.thread()).newUnit, false); ws.commitReply(t.threadId);
      assert.equal(ws.chargeForReply(w.id, t.thread()).newUnit, true, 'limit of 2 replies');
      db.run('UPDATE threads SET window_start = ? WHERE id = ?', new Date(Date.now() - 2 * HOUR).toISOString(), t.threadId);
      assert.equal(ws.chargeForReply(w.id, t.thread()).newUnit, true, '1h window');
    } finally { settings.set('billing', {}); }
  });

  test('when the allowance is used up, each new conversation costs 1 credit', () => {
    const { ws: w } = h.makeWorkspace({ plan: 'spark', credits: 3 });
    db.update('workspaces', w.id, { conv_used: 30 });
    const t = h.makeThread(w.id);
    const r = ws.chargeForReply(w.id, t.thread());
    assert.equal(r.ok, true);
    assert.equal(r.credits, 1);
    const row = W(w.id);
    assert.equal(row.conv_used, 30, 'allowance counter does not go past the plan');
    assert.equal(row.credits, 2);
    const tx = db.one('SELECT * FROM credit_tx WHERE workspace_id = ? ORDER BY id DESC', w.id);
    assert.equal(tx.amount, -1);
    assert.equal(tx.balance, 2);
    assert.equal(tx.reason, 'Extra conversation');
    assert.equal(tx.ref, 'thread:' + t.threadId);
  });

  test('no allowance and no credits -> ok:false, nothing changes', () => {
    const { ws: w } = h.makeWorkspace({ plan: 'spark', credits: 0 });
    db.update('workspaces', w.id, { conv_used: 30 });
    const t = h.makeThread(w.id);
    const r = ws.chargeForReply(w.id, t.thread());
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no_credits');
    assert.equal(W(w.id).conv_used, 30);
    assert.equal(W(w.id).credits, 0);
    assert.equal(t.thread().units, 0);
    assert.equal(t.thread().window_start, null);
  });

  test('Pro Brain uses its own allowance, then extra credits', () => {
    const { ws: w } = h.makeWorkspace({ plan: 'pro', credits: 10 });
    const t1 = h.makeThread(w.id);
    let r = ws.chargeForReply(w.id, t1.thread(), { pro: true });
    assert.equal(r.credits, 0);
    assert.equal(W(w.id).pro_used, 1);
    assert.equal(W(w.id).conv_used, 1);
    // Pro allowance (300 on Pro) used up: 3 extra credits per conversation.
    db.update('workspaces', w.id, { pro_used: 300 });
    const t2 = h.makeThread(w.id);
    r = ws.chargeForReply(w.id, t2.thread(), { pro: true });
    assert.equal(r.credits, 3);
    assert.equal(W(w.id).credits, 7);
    assert.equal(W(w.id).pro_used, 300);
    assert.equal(db.one('SELECT reason FROM credit_tx WHERE workspace_id = ? ORDER BY id DESC', w.id).reason, 'Extra conversation (Pro Brain)');
    // Both allowances used up: 1 + 3 = 4 credits.
    db.update('workspaces', w.id, { conv_used: 3500 });
    const t3 = h.makeThread(w.id);
    r = ws.chargeForReply(w.id, t3.thread(), { pro: true });
    assert.equal(r.credits, 4);
    assert.equal(W(w.id).credits, 3);
    // Not enough for both: refused.
    db.update('workspaces', w.id, { credits: 1 });
    const t4 = h.makeThread(w.id);
    assert.equal(ws.chargeForReply(w.id, t4.thread(), { pro: true }).ok, false);
    assert.equal(W(w.id).credits, 1);
    // Free plan has no Pro allowance.
    const { ws: f } = h.makeWorkspace({ plan: 'spark', credits: 3 });
    r = ws.chargeForReply(f.id, h.makeThread(f.id).thread(), { pro: true });
    assert.equal(r.credits, 3);
    assert.equal(W(f.id).conv_used, 1);
  });

  test('an ended free period rolls over and resets usage', () => {
    const { ws: w } = h.makeWorkspace({ plan: 'spark' });
    db.update('workspaces', w.id, { conv_used: 50, pro_used: 3, period_start: new Date(Date.now() - 31 * DAY).toISOString(), period_end: new Date(Date.now() - 1000).toISOString() });
    const r = ws.chargeForReply(w.id, h.makeThread(w.id).thread());
    assert.equal(r.ok, true);
    assert.equal(r.credits, 0, 'new period: allowance available again');
    const row = W(w.id);
    assert.equal(row.plan_id, 'spark');
    assert.equal(row.conv_used, 1);
    assert.equal(row.pro_used, 0);
    const len = new Date(row.period_end) - new Date(row.period_start);
    assert.ok(Math.abs(len - 30 * DAY) < 5000);
    assert.ok(new Date(row.period_end) > Date.now() + 29 * DAY);
  });

  test('an expired paid plan downgrades to the free plan with event + email', async () => {
    const { ws: w, user } = h.makeWorkspace({ plan: 'starter' });
    db.update('workspaces', w.id, { conv_used: 400, plan_interval: 'year', period_end: new Date(Date.now() - 60e3).toISOString() });
    ws.chargeForReply(w.id, h.makeThread(w.id).thread());
    const row = W(w.id);
    assert.equal(row.plan_id, 'spark');
    assert.equal(row.plan_interval, 'month');
    assert.equal(row.conv_used, 1);
    assert.match(db.one('SELECT text FROM events WHERE workspace_id = ? AND type = \'plan\'', w.id).text, /Starter plan ended/);
    await h.waitFor(() => h.emails(user.email, 'plan-expired').length, { label: 'plan-expired email' });
  });
});

describe('checkout preview', () => {
  let c, wsId;
  before(async () => { const s = await h.signup(); c = s.client; wsId = s.ws.id; });
  const pv = body => c.post('/api/app/checkout/preview', body);

  test('monthly and yearly plan prices', async () => {
    let r = await pv({ kind: 'plan', item_id: 'starter', interval: 'month' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.amount, 29);
    assert.equal(r.body.total, 29);
    assert.equal(r.body.discount, 0);
    assert.equal(r.body.interval, 'month');
    assert.ok(r.body.providers.some(p => p.id === 'demo'));
    r = await pv({ kind: 'plan', item_id: 'starter', interval: 'year' });
    assert.equal(r.body.amount, 290);
    assert.equal(r.body.interval, 'year');
    assert.match(r.body.item_name, /yearly/);
  });

  test('free, contact-sales, paused and unknown plans cannot be bought', async () => {
    assert.equal((await pv({ kind: 'plan', item_id: 'spark' })).status, 400);
    assert.equal((await pv({ kind: 'plan', item_id: 'black' })).status, 400);
    assert.equal((await pv({ kind: 'plan', item_id: 'nope' })).status, 400, 'unknown plan must not fall back to the free plan');
    db.run('UPDATE plans SET active = 0 WHERE id = \'business\'');
    try { assert.equal((await pv({ kind: 'plan', item_id: 'business' })).status, 400); }
    finally { db.run('UPDATE plans SET active = 1 WHERE id = \'business\''); }
    assert.equal((await pv({ kind: 'thing', item_id: 'x' })).status, 400);
    assert.equal((await pv({ kind: 'pack', item_id: 9999 })).status, 400);
    assert.equal((await pv({ kind: 'addon', item_id: 'custom-voice' })).status, 400, 'coming-soon add-on');
  });

  test('plan offer percent is applied before coupons', async () => {
    db.run('UPDATE plans SET offer = ? WHERE id = \'pro\'', JSON.stringify({ percent: 10, label: 'Launch week' }));
    try {
      let r = await pv({ kind: 'plan', item_id: 'pro', interval: 'month' });
      assert.equal(r.body.amount, 134.1);
      assert.equal(r.body.offer, 'Launch week');
      r = await pv({ kind: 'plan', item_id: 'pro', interval: 'month', coupon: 'welcome20' });
      assert.equal(r.body.discount, 26.82);
      assert.equal(r.body.total, 107.28);
      assert.equal(r.body.coupon, 'WELCOME20');
      // Expired offers are ignored.
      db.run('UPDATE plans SET offer = ? WHERE id = \'pro\'', JSON.stringify({ percent: 10, ends_at: new Date(Date.now() - 1000).toISOString() }));
      r = await pv({ kind: 'plan', item_id: 'pro', interval: 'month' });
      assert.equal(r.body.amount, 149);
    } finally { db.run('UPDATE plans SET offer = \'{}\' WHERE id = \'pro\''); }
  });

  test('percent and fixed coupons, applies_to', async () => {
    let r = await pv({ kind: 'plan', item_id: 'starter', interval: 'month', coupon: 'WELCOME20' });
    assert.equal(r.body.discount, 5.8);
    assert.equal(r.body.total, 23.2);
    const pack = db.one('SELECT * FROM packs WHERE credits = 500');
    r = await pv({ kind: 'pack', item_id: pack.id, coupon: 'WELCOME20' });
    assert.equal(r.status, 400, 'plan-only coupon on a pack');
    assert.match(r.body.error, /does not apply/);
    r = await pv({ kind: 'pack', item_id: pack.id, coupon: 'voo10' });
    assert.equal(r.status, 200);
    assert.equal(r.body.amount, 20);
    assert.equal(r.body.discount, 10);
    assert.equal(r.body.total, 10);
    r = await pv({ kind: 'plan', item_id: 'starter', coupon: 'VOO10' });
    assert.equal(r.status, 400, 'pack-only coupon on a plan');
    r = await pv({ kind: 'plan', item_id: 'starter', coupon: 'NOSUCHCODE' });
    assert.equal(r.status, 400);
    // Fixed discount larger than the price is capped at the price.
    db.insert('coupons', { code: 'BIGFIX', kind: 'fixed', value: 500, applies_to: 'all', created_at: db.now() });
    r = await pv({ kind: 'plan', item_id: 'starter', coupon: 'BIGFIX' });
    assert.equal(r.body.discount, 29);
    assert.equal(r.body.total, 0);
  });

  test('plan_ids, max_uses, expiry and inactive coupons', async () => {
    db.insert('coupons', { code: 'SCALEONLY', kind: 'percent', value: 50, applies_to: 'plan', plan_ids: '["pro"]', created_at: db.now() });
    let r = await pv({ kind: 'plan', item_id: 'starter', coupon: 'SCALEONLY' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /this plan/);
    r = await pv({ kind: 'plan', item_id: 'pro', coupon: 'SCALEONLY' });
    assert.equal(r.body.total, 74.5);
    db.insert('coupons', { code: 'USEDUP', kind: 'percent', value: 10, max_uses: 2, used: 2, created_at: db.now() });
    r = await pv({ kind: 'plan', item_id: 'starter', coupon: 'USEDUP' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /fully used/);
    db.insert('coupons', { code: 'OLDIE', kind: 'percent', value: 10, expires_at: new Date(Date.now() - 1000).toISOString(), created_at: db.now() });
    r = await pv({ kind: 'plan', item_id: 'starter', coupon: 'OLDIE' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /expired/);
    db.insert('coupons', { code: 'FUTURE', kind: 'percent', value: 10, expires_at: new Date(Date.now() + DAY).toISOString(), created_at: db.now() });
    assert.equal((await pv({ kind: 'plan', item_id: 'starter', coupon: 'FUTURE' })).body.total, 26.1);
    db.insert('coupons', { code: 'OFFNOW', kind: 'percent', value: 10, active: 0, created_at: db.now() });
    assert.equal((await pv({ kind: 'plan', item_id: 'starter', coupon: 'OFFNOW' })).status, 400);
  });

  test('first_purchase_only coupons stop working after a paid order', async () => {
    assert.equal((await pv({ kind: 'plan', item_id: 'starter', coupon: 'WELCOME20' })).status, 200);
    // WELCOME20 is "first paid plan": a paid credit pack does not use it up...
    db.insert('orders', { ref: 'RV-PACK-' + wsId, workspace_id: wsId, kind: 'pack', item_id: '1', item_name: 'x', amount_usd: 15, provider: 'demo', status: 'paid', created_at: db.now() });
    assert.equal((await pv({ kind: 'plan', item_id: 'starter', coupon: 'WELCOME20' })).status, 200);
    // ...a pending plan order does not either...
    db.insert('orders', { ref: 'RV-PEND-' + wsId, workspace_id: wsId, kind: 'plan', item_id: 'starter', item_name: 'x', amount_usd: 19, provider: 'demo', status: 'pending', created_at: db.now() });
    assert.equal((await pv({ kind: 'plan', item_id: 'starter', coupon: 'WELCOME20' })).status, 200);
    // ...but a paid plan does.
    db.insert('orders', { ref: 'RV-PAID-' + wsId, workspace_id: wsId, kind: 'plan', item_id: 'starter', item_name: 'x', amount_usd: 19, provider: 'demo', status: 'paid', created_at: db.now() });
    const r = await pv({ kind: 'plan', item_id: 'starter', coupon: 'WELCOME20' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /first purchases/);
  });
});

describe('demo checkout and fulfilment', () => {
  let s;
  beforeEach(async () => { s = await h.signup(); });

  async function buy(c, body) {
    const r = await c.post('/api/app/checkout', { provider: 'demo', ...body });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.redirect, '/pay/demo/' + r.body.ref);
    const order = db.one('SELECT * FROM orders WHERE ref = ?', r.body.ref);
    assert.equal(order.status, 'pending');
    assert.equal(order.provider, 'demo');
    const page = await c.get(r.body.redirect);
    assert.equal(page.status, 200);
    assert.ok(page.text.includes(r.body.ref));
    const pay = await c.req('POST', r.body.redirect, {}, { form: true, csrf: false });
    assert.equal(pay.status, 302);
    assert.equal(pay.location, '/app/wallet?order=' + r.body.ref);
    return db.one('SELECT * FROM orders WHERE ref = ?', r.body.ref);
  }

  test('monthly plan: plan switches, period +1 month, usage reset, receipt', async () => {
    db.update('workspaces', s.ws.id, { conv_used: 30 });
    const o = await buy(s.client, { kind: 'plan', item_id: 'starter', interval: 'month' });
    assert.equal(o.status, 'paid');
    assert.ok(o.paid_at);
    const w = W(s.ws.id);
    assert.equal(w.plan_id, 'starter');
    assert.equal(w.plan_interval, 'month');
    assert.equal(w.conv_used, 0);
    const days = (new Date(w.period_end) - new Date(w.period_start)) / DAY;
    assert.ok(days >= 28 && days <= 31.1, 'about one month, got ' + days);
    await h.waitFor(() => h.emails(s.email, 'payment-receipt').length, { label: 'receipt' });
    const u = await s.client.get('/api/app/bootstrap');
    assert.equal(u.body.usage.plan.id, 'starter');
    // A paid order page redirects instead of offering to pay again.
    const again = await s.client.get('/pay/demo/' + o.ref);
    assert.equal(again.status, 302);
  });

  test('yearly plan: +12 months; renewing the same plan extends from the current end', async () => {
    await buy(s.client, { kind: 'plan', item_id: 'pro', interval: 'year' });
    let w = W(s.ws.id);
    assert.equal(w.plan_id, 'pro');
    assert.equal(w.plan_interval, 'year');
    const days = (new Date(w.period_end) - new Date(w.period_start)) / DAY;
    assert.ok(days >= 365 && days <= 366.1, 'about one year, got ' + days);
    const end1 = new Date(w.period_end);
    db.update('workspaces', s.ws.id, { conv_used: 7 });
    await buy(s.client, { kind: 'plan', item_id: 'pro', interval: 'month' });
    w = W(s.ws.id);
    const ext = (new Date(w.period_end) - end1) / DAY;
    assert.ok(ext >= 28 && ext <= 31.1, 'extended by a month, got ' + ext);
    assert.equal(w.conv_used, 7, 'renewal keeps current usage');
  });

  test('credit pack adds credits + bonus with a ledger row', async () => {
    const pack = db.one('SELECT * FROM packs WHERE credits = 2000');
    const o = await buy(s.client, { kind: 'pack', item_id: pack.id });
    assert.equal(o.amount_usd, 70);
    assert.equal(W(s.ws.id).credits, 2200);
    const tx = db.one('SELECT * FROM credit_tx WHERE workspace_id = ? AND ref = ?', s.ws.id, o.ref);
    assert.equal(tx.amount, 2200);
    assert.match(tx.reason, /^Top-up: 2,000 \+ 200 bonus Voo Credits/);
    const wallet = await s.client.get('/api/app/wallet');
    assert.equal(wallet.body.credits, 2200);
    assert.equal(wallet.body.orders[0].status, 'paid');
  });

  test('add-on purchases: extra seat and extra closer slot', async () => {
    await buy(s.client, { kind: 'addon', item_id: 'extra-seat' });
    assert.equal(JSON.parse(W(s.ws.id).settings).seat_slots.length, 1, 'extra seat lasts 30 days');
    await buy(s.client, { kind: 'addon', item_id: 'extra-closer' });
    const lim = ws.limits(ws.get(s.ws.id));
    assert.equal(lim.closers, 2);
    assert.equal(lim.seats, 2);
  });

  test('fulfil is idempotent and coupon use is counted once', async () => {
    const pack = db.one('SELECT * FROM packs WHERE credits = 500');
    const coupon = db.one('SELECT * FROM coupons WHERE code = \'VOO10\'');
    const r = await s.client.post('/api/app/checkout', { kind: 'pack', item_id: pack.id, coupon: 'VOO10', provider: 'demo' });
    assert.equal(r.status, 200);
    const o = db.one('SELECT * FROM orders WHERE ref = ?', r.body.ref);
    assert.equal(o.amount_usd, 10);
    assert.equal(o.discount_usd, 10);
    assert.equal(o.coupon_id, coupon.id);
    assert.equal(payments.fulfill(o.ref, { via: 'test' }), true);
    assert.equal(payments.fulfill(o.ref, { via: 'test' }), false);
    const pay = await s.client.req('POST', '/pay/demo/' + o.ref, {}, { form: true, csrf: false });
    assert.equal(pay.status, 302);
    assert.equal(W(s.ws.id).credits, 500);
    assert.equal(db.one('SELECT COUNT(*) n FROM credit_tx WHERE workspace_id = ?', s.ws.id).n, 1);
    assert.equal(db.one('SELECT used FROM coupons WHERE id = ?', coupon.id).used, coupon.used + 1);
    assert.equal(payments.fulfill('RV-DOES-NOT-EXIST'), false);
  });

  test('a 100% discount completes without payment', async () => {
    db.run('INSERT OR IGNORE INTO coupons (code, kind, value, applies_to, created_at) VALUES (\'FREEPLAN\', \'percent\', 100, \'plan\', ?)', db.now());
    const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', coupon: 'FREEPLAN' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.done, true);
    const o = db.one('SELECT * FROM orders WHERE ref = ?', r.body.ref);
    assert.equal(o.provider, 'free');
    assert.equal(o.status, 'paid');
    assert.equal(W(s.ws.id).plan_id, 'starter');
  });

  test('someone else cannot open or pay my demo checkout', async () => {
    const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', provider: 'demo' });
    const other = await h.signup();
    assert.equal((await other.client.get('/pay/demo/' + r.body.ref)).status, 404);
    assert.equal((await other.client.req('POST', '/pay/demo/' + r.body.ref, {}, { form: true, csrf: false })).status, 404);
    assert.equal((await h.client().req('POST', '/pay/demo/' + r.body.ref, {}, { form: true, csrf: false })).status, 404);
    assert.equal(db.one('SELECT status FROM orders WHERE ref = ?', r.body.ref).status, 'pending');
    // Cross-site form posts are blocked.
    const x = await s.client.req('POST', '/pay/demo/' + r.body.ref, {}, { form: true, csrf: false, headers: { origin: 'https://evil.example' } });
    assert.equal(x.status, 403);
    assert.equal(db.one('SELECT status FROM orders WHERE ref = ?', r.body.ref).status, 'pending');
    assert.equal(W(s.ws.id).plan_id, 'spark');
  });

  test('checkout needs the x-rv header and an owner/admin', async () => {
    const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', provider: 'demo' }, { csrf: false });
    assert.equal(r.status, 403);
  });

  test('Paystack outage gives a friendly 502, not a 500', async () => {
    const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', provider: 'paystack' });
    assert.equal(r.status, 502);
  });
});

describe('referral payouts', () => {
  test('referrer earns floor(usd * rate / credit_value) credits once per order', async () => {
    const ref = h.makeWorkspace({ plan: 'spark' });
    const s = await h.signup({ ref: ref.ws.ref_code });
    assert.equal(s.ws.referred_by, ref.ws.id);
    const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'demo' });
    payments.fulfill(r.body.ref, { via: 'test' });
    const order = db.one('SELECT * FROM orders WHERE ref = ?', r.body.ref);
    const earn = db.one('SELECT * FROM referral_earnings WHERE order_id = ?', order.id);
    assert.ok(earn);
    assert.equal(earn.rate, 0.2);
    assert.equal(earn.amount_usd, 5.8);
    assert.equal(earn.credits, Math.floor(5.8 / 0.03));
    assert.equal(earn.credits, 193);
    assert.equal(W(ref.ws.id).credits, 193);
    assert.equal(db.one('SELECT reason FROM credit_tx WHERE workspace_id = ? ORDER BY id DESC', ref.ws.id).reason, 'Voo Squad reward');
    payments.fulfill(r.body.ref);
    assert.equal(W(ref.ws.id).credits, 193, 'paid once');
    await h.waitFor(() => h.emails(ref.user.email, 'referral-reward').length, { label: 'referral email' });
  });

  test('rate tiers by number of paying referees', () => {
    const { ws: w } = h.makeWorkspace();
    assert.equal(payments.referralRate(w.id), 0.2);
    for (let i = 0; i < 10; i++) db.insert('referral_earnings', { referrer_ws: w.id, referee_ws: 100000 + i, order_id: 500000 + w.id * 100 + i, rate: 0.2, amount_usd: 1, credits: 1, created_at: db.now() });
    assert.equal(payments.referralRate(w.id), 0.25);
    for (let i = 10; i < 50; i++) db.insert('referral_earnings', { referrer_ws: w.id, referee_ws: 100000 + i, order_id: 500000 + w.id * 100 + i, rate: 0.2, amount_usd: 1, credits: 1, created_at: db.now() });
    assert.equal(payments.referralRate(w.id), 0.3);
  });

  test('free (zero-amount) orders and self-referrals pay nothing', async () => {
    const ref = h.makeWorkspace();
    const s = await h.signup({ ref: ref.ws.ref_code });
    db.run('INSERT OR IGNORE INTO coupons (code, kind, value, applies_to, created_at) VALUES (\'FREEPLAN\', \'percent\', 100, \'plan\', ?)', db.now());
    await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', coupon: 'FREEPLAN' });
    assert.equal(db.one('SELECT COUNT(*) n FROM referral_earnings WHERE referrer_ws = ?', ref.ws.id).n, 0);
    assert.equal(W(ref.ws.id).credits, 0);
  });
});

describe('payment webhooks', () => {
  test('Paystack rejects a bad or missing signature', async () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'RV-X' } });
    let r = await h.client().req('POST', '/webhooks/paystack', body, { raw: true, headers: { 'content-type': 'application/json', 'x-paystack-signature': 'deadbeef' } });
    assert.equal(r.status, 401);
    r = await h.client().req('POST', '/webhooks/paystack', body, { raw: true, headers: { 'content-type': 'application/json' } });
    assert.equal(r.status, 401);
    const sig = crypto.createHmac('sha512', 'sk_test_replyvoo').update(body).digest('hex');
    r = await h.client().req('POST', '/webhooks/paystack', body, { raw: true, headers: { 'content-type': 'application/json', 'x-paystack-signature': sig } });
    assert.equal(r.status, 200, 'valid signature accepted');
  });

  test('a signed Paystack webhook never fulfils by itself (verification with Paystack is required)', async () => {
    const s = await h.signup();
    const ref = 'RV-PS-' + s.ws.id;
    db.insert('orders', { ref, workspace_id: s.ws.id, kind: 'plan', item_id: 'starter', item_name: 'Hustle', interval: 'month', amount_usd: 19, currency: 'NGN', amount_local: 30400, provider: 'paystack', status: 'pending', created_at: db.now() });
    const body = JSON.stringify({ event: 'charge.success', data: { reference: ref, status: 'success' } });
    const sig = crypto.createHmac('sha512', 'sk_test_replyvoo').update(body).digest('hex');
    const r = await h.client().req('POST', '/webhooks/paystack', body, { raw: true, headers: { 'content-type': 'application/json', 'x-paystack-signature': sig } });
    assert.equal(r.status, 200);
    await h.sleep(50);
    assert.equal(db.one('SELECT status FROM orders WHERE ref = ?', ref).status, 'pending', 'verify() could not reach Paystack');
    assert.ok(h.outbound.some(o => o.url.includes('api.paystack.co/transaction/verify/' + ref)));
  });

  test('Flutterwave rejects a bad or missing verif-hash', async () => {
    const body = { event: 'charge.completed', data: { tx_ref: 'RV-X' } };
    let r = await h.client().post('/webhooks/flutterwave', body, { headers: { 'verif-hash': 'wrong' } });
    assert.equal(r.status, 401);
    r = await h.client().post('/webhooks/flutterwave', body);
    assert.equal(r.status, 401);
    r = await h.client().post('/webhooks/flutterwave', body, { headers: { 'verif-hash': 'flw-hash-secret' } });
    assert.equal(r.status, 200);
  });
});

describe('extra Closer slot for credits', () => {
  test('costs extra_closer_credits, 402 when short', async () => {
    const s = await h.signup();
    let r = await s.client.post('/api/app/closers/slot');
    assert.equal(r.status, 402);
    assert.equal(r.body.code, 'no_credits');
    db.update('workspaces', s.ws.id, { credits: 200 });
    r = await s.client.post('/api/app/closers/slot');
    assert.equal(r.status, 200);
    assert.equal(W(s.ws.id).credits, 50);
    const tx = db.one('SELECT * FROM credit_tx WHERE workspace_id = ? ORDER BY id DESC', s.ws.id);
    assert.equal(tx.amount, -150);
    assert.match(tx.reason, /Extra Closer slot/);
    const usage = (await s.client.get('/api/app/bootstrap')).body.usage;
    assert.equal(usage.closers_limit, 2);
    // Now two Closers fit on the free plan.
    assert.equal((await s.client.post('/api/app/closers', { name: 'One' })).status, 200);
    assert.equal((await s.client.post('/api/app/closers', { name: 'Two' })).status, 200);
    assert.equal((await s.client.post('/api/app/closers', { name: 'Three' })).status, 402);
  });
});
