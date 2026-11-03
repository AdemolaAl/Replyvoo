'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let env, db, admin, user, adminId, mailer;

before(async () => {
  env = await h.boot();
  db = env.db;
  mailer = require('../src/services/mailer');
  admin = await h.login(h.ADMIN.email, h.ADMIN.password);
  adminId = db.one('SELECT id FROM users WHERE email = ?', h.ADMIN.email).id;
  user = await h.login(h.DEMO.email, h.DEMO.password);
});
after(() => env.close());

const lastAudit = () => db.one('SELECT * FROM audit ORDER BY id DESC LIMIT 1');

describe('access', () => {
  test('admin API is admin-only', async () => {
    const paths = ['/api/admin/overview', '/api/admin/users', '/api/admin/plans', '/api/admin/settings', '/api/admin/orders', '/api/admin/emails', '/api/admin/activity'];
    for (const p of paths) {
      assert.equal((await h.client().get(p)).status, 401, 'anon ' + p);
      assert.equal((await user.get(p)).status, 403, 'user ' + p);
      assert.equal((await admin.get(p)).status, 200, 'admin ' + p);
    }
    const w = db.one('SELECT id FROM workspaces WHERE name = \'Glow Labs\'');
    let r = await user.put('/api/admin/workspaces/' + w.id, { credits_delta: 100000 });
    assert.equal(r.status, 403);
    r = await user.post('/api/admin/plans', { name: 'Hacker' });
    assert.equal(r.status, 403);
    r = await user.put('/api/admin/settings/flags', { value: { maintenance: true } });
    assert.equal(r.status, 403);
    assert.equal(db.one('SELECT id FROM plans WHERE id = \'hacker\''), null);
    assert.equal(db.one('SELECT key FROM settings WHERE key = \'flags\''), null);
  });

  test('overview numbers', async () => {
    const r = await admin.get('/api/admin/overview');
    assert.equal(r.body.users, db.one('SELECT COUNT(*) n FROM users').n);
    assert.equal(r.body.paying, 1, 'Glow Labs is on Pro');
    assert.equal(r.body.mrr, 149);
    assert.equal(r.body.series.length, 14);
    assert.equal(r.body.config.demo_payments, true);
  });
});

describe('plans', () => {
  test('create, duplicate, update, delete', async () => {
    let r = await admin.post('/api/admin/plans', { name: 'Test Plan', price_month: 9.5, price_year: 95, closers: 2, conversations: 300, features: ['One', '', 'Two'], offer: { percent: 150 } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.id, 'test-plan');
    let p = db.one('SELECT * FROM plans WHERE id = \'test-plan\'');
    assert.equal(p.price_month, 9.5);
    assert.equal(p.closers, 2);
    assert.deepEqual(JSON.parse(p.features), ['One', 'Two']);
    assert.equal(JSON.parse(p.offer).percent, 90, 'offer clamped to 90%');
    assert.equal(p.sort, db.one('SELECT MAX(sort) m FROM plans').m, 'appended at the end');
    assert.equal(lastAudit().action, 'plan.create');
    r = await admin.post('/api/admin/plans', { name: 'Test Plan' });
    assert.equal(r.status, 409);
    r = await admin.post('/api/admin/plans', { name: '!!!' });
    assert.equal(r.status, 400);
    r = await admin.put('/api/admin/plans/test-plan', { price_month: 12, price_year: -5, closers: 0 });
    assert.equal(r.status, 200);
    p = db.one('SELECT * FROM plans WHERE id = \'test-plan\'');
    assert.equal(p.price_month, 12);
    assert.equal(p.price_year, 0, 'negative clamped');
    assert.equal(p.closers, 1, 'min 1 closer');
    assert.equal(p.conversations, 300, 'unspecified fields kept');
    assert.deepEqual(JSON.parse(p.features), ['One', 'Two']);
    assert.equal((await admin.put('/api/admin/plans/nope', { price_month: 1 })).status, 404);
    r = await admin.del('/api/admin/plans/test-plan');
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT id FROM plans WHERE id = \'test-plan\''), null);
  });

  test('cannot delete a plan in use or the free plan; cannot pause the free plan', async () => {
    let r = await admin.del('/api/admin/plans/pro');
    assert.equal(r.status, 400);
    assert.match(r.body.error, /workspace\(s\) are on this plan/);
    r = await admin.del('/api/admin/plans/spark');
    assert.equal(r.status, 400);
    assert.ok(db.one('SELECT id FROM plans WHERE id = \'spark\''));
    r = await admin.put('/api/admin/plans/spark', { active: false });
    assert.equal(r.status, 400);
    assert.equal(db.one('SELECT active FROM plans WHERE id = \'spark\'').active, 1);
    // Free plan with no workspaces still can't be deleted.
    db.run('UPDATE workspaces SET plan_id = \'hustle\' WHERE plan_id = \'spark\'');
    try {
      r = await admin.del('/api/admin/plans/spark');
      assert.equal(r.status, 400);
      assert.match(r.body.error, /free plan/);
    } finally { db.run('UPDATE workspaces SET plan_id = \'spark\' WHERE plan_id = \'hustle\''); }
    // Pausing a paid plan hides it from the public site.
    r = await admin.put('/api/admin/plans/titan', { active: false });
    assert.equal(r.status, 200);
    let site = await h.client().get('/api/public/site');
    assert.ok(!site.body.plans.some(x => x.id === 'titan'));
    await admin.put('/api/admin/plans/titan', { active: true });
    site = await h.client().get('/api/public/site');
    assert.ok(site.body.plans.some(x => x.id === 'titan'));
  });

  test('an offer shows on /api/public/site and in checkout', async () => {
    const r = await admin.put('/api/admin/plans/starter', { offer: { percent: 25, label: 'Launch week' } });
    assert.equal(r.status, 200);
    const site = await h.client().get('/api/public/site');
    const hustle = site.body.plans.find(p => p.id === 'starter');
    assert.equal(hustle.offer.percent, 25);
    assert.equal(hustle.offer.label, 'Launch week');
    const pv = await user.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'starter', interval: 'month' });
    assert.equal(pv.body.amount, 21.75);
    await admin.put('/api/admin/plans/starter', { offer: { percent: 0 } });
    assert.equal((await h.client().get('/api/public/site')).body.plans.find(p => p.id === 'starter').offer, null);
  });
});

describe('packs, add-ons, coupons', () => {
  test('packs CRUD with clamping', async () => {
    let r = await admin.post('/api/admin/packs', { credits: -5, bonus: -1, price: 0.01, label: 'Tiny' });
    assert.equal(r.status, 200);
    const p = db.one('SELECT * FROM packs WHERE id = ?', r.body.id);
    assert.equal(p.credits, 1);
    assert.equal(p.bonus, 0);
    assert.equal(p.price, 0.5);
    r = await admin.put('/api/admin/packs/' + p.id, { credits: 100, bonus: 10, price: 3, label: 'Small', active: false });
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT active FROM packs WHERE id = ?', p.id).active, 0);
    assert.ok(!(await h.client().get('/api/public/site')).body.packs.some(x => x.id === p.id), 'inactive packs hidden');
    r = await admin.del('/api/admin/packs/' + p.id);
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT id FROM packs WHERE id = ?', p.id), null);
  });

  test('add-ons CRUD and validation', async () => {
    let r = await admin.post('/api/admin/addons', { name: 'Priority Lane', price: 20, status: 'weird' });
    assert.equal(r.status, 200);
    const a = db.one('SELECT * FROM addons WHERE slug = \'priority-lane\'');
    assert.equal(a.status, 'live');
    r = await admin.post('/api/admin/addons', { name: 'Priority Lane' });
    assert.equal(r.status, 409);
    r = await admin.post('/api/admin/addons', { name: '' });
    assert.equal(r.status, 400);
    r = await admin.put('/api/admin/addons/' + a.id, { name: 'Priority Lane', status: 'off', price: 25 });
    assert.equal(db.one('SELECT status FROM addons WHERE id = ?', a.id).status, 'off');
    assert.ok(!(await h.client().get('/api/public/site')).body.addons.some(x => x.slug === 'priority-lane'), 'off add-ons hidden');
    assert.equal((await admin.del('/api/admin/addons/' + a.id)).status, 200);
    assert.equal(db.one('SELECT id FROM addons WHERE id = ?', a.id), null);
  });

  test('coupons CRUD and validation', async () => {
    let r = await admin.post('/api/admin/coupons', { code: 'half', kind: 'percent', value: 150 });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /more than 100/);
    r = await admin.post('/api/admin/coupons', { code: 'ab', value: 10 });
    assert.equal(r.status, 400, 'code too short');
    r = await admin.post('/api/admin/coupons', { code: 'ZERO', value: 0 });
    assert.equal(r.status, 400, 'no value');
    r = await admin.post('/api/admin/coupons', { code: 'sum mer-26!', kind: 'fixed', value: 5, applies_to: 'plan', plan_ids: ['pro', 7], max_uses: 3, first_purchase_only: true, expires_at: '2099-01-01' });
    assert.equal(r.status, 200, r.text);
    const c = db.one('SELECT * FROM coupons WHERE id = ?', r.body.id);
    assert.equal(c.code, 'SUMMER-26');
    assert.equal(c.kind, 'fixed');
    assert.deepEqual(JSON.parse(c.plan_ids), ['pro', '7']);
    assert.equal(c.max_uses, 3);
    assert.equal(c.first_purchase_only, 1);
    assert.equal(c.expires_at, '2099-01-01T00:00:00.000Z');
    r = await admin.post('/api/admin/coupons', { code: 'summer-26', value: 10 });
    assert.equal(r.status, 409, 'duplicate code (case-insensitive)');
    r = await admin.put('/api/admin/coupons/' + c.id, { code: 'WELCOME20', value: 10 });
    assert.equal(r.status, 409, 'cannot rename onto another coupon');
    r = await admin.put('/api/admin/coupons/' + c.id, { code: 'SUMMER-26', kind: 'percent', value: 15 });
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT value FROM coupons WHERE id = ?', c.id).value, 15);
    const list = await admin.get('/api/admin/coupons');
    assert.ok(Array.isArray(list.body.find(x => x.id === c.id).plan_ids));
    assert.equal((await admin.del('/api/admin/coupons/' + c.id)).status, 200);
    assert.equal(db.one('SELECT id FROM coupons WHERE id = ?', c.id), null);
  });
});

describe('settings', () => {
  test('unknown key 404, bad body 400', async () => {
    assert.equal((await admin.put('/api/admin/settings/nope', { value: {} })).status, 404);
    assert.equal((await admin.put('/api/admin/settings/site', { value: 'x' })).status, 400);
    assert.equal((await admin.put('/api/admin/settings/site', {})).status, 400);
  });

  test('flags are reflected in /api/public/site and /api/app/bootstrap', async () => {
    let r = await admin.put('/api/admin/settings/flags', { value: { features: { blog: false, blast: false }, channels: { whatsapp: 'live' } } });
    assert.equal(r.status, 200);
    // WhatsApp is only Live for customers once the Meta app is configured and switched on (Admin → Connections).
    assert.equal((await h.client().get('/api/public/site')).body.channels.find(c => c.id === 'whatsapp').status, 'soon');
    assert.equal((await admin.put('/api/admin/connections/whatsapp', { app_id: '1234567890', app_secret: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', verify_token: 'verify-token-123', enabled: true })).status, 200);
    assert.equal(r.body.features.blog, false);
    assert.equal(r.body.features.signup, true, 'merged over defaults');
    try {
      const site = await h.client().get('/api/public/site');
      assert.equal(site.body.features.blog, false);
      assert.equal(site.body.channels.find(c => c.id === 'whatsapp').status, 'live');
      const boot = await user.get('/api/app/bootstrap');
      assert.equal(boot.body.flags.features.blast, false);
      assert.equal(boot.body.flags.channels.whatsapp, 'live');
      assert.equal((await user.post('/api/app/blasts', { message: 'hello all', segment: 'all' })).status, 403, 'blast feature off');
      assert.equal((await h.client().get('/blog')).status, 404, 'blog off');
      assert.equal(lastAudit().action, 'connections.whatsapp');
      assert.ok(!lastAudit().data.includes('a1b2c3d4'), 'the audit never holds a secret');
    } finally { await admin.put('/api/admin/settings/flags', { value: {} }); await admin.put('/api/admin/connections/whatsapp', { enabled: false }); }
    assert.equal((await h.client().get('/api/public/site')).body.features.blog, true);
  });

  test('site settings show on the public site', async () => {
    const r = await admin.put('/api/admin/settings/site', { value: { hero: { en: { h1a: 'Sell more on Telegram today.' } }, live_counter_start: 99 } });
    assert.equal(r.status, 200);
    try {
      const site = await h.client().get('/api/public/site');
      assert.equal(site.body.site.hero.en.h1a, 'Sell more on Telegram today.');
      assert.equal(site.body.site.hero.en.h1b, 'On autopilot.', 'other hero fields keep defaults');
      assert.equal(site.body.site.hero.fr.h1a, 'Faites exploser vos ventes.');
      assert.equal(site.body.site.live_counter_start, 99);
      assert.ok((await h.client().get('/')).text.includes('Sell more on Telegram today.'));
    } finally { await admin.put('/api/admin/settings/site', { value: {} }); }
  });

  test('billing: the free plan must exist and cost $0', async () => {
    let r = await admin.put('/api/admin/settings/billing', { value: { free_plan_id: 'starter' } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /\$0/);
    r = await admin.put('/api/admin/settings/billing', { value: { free_plan_id: 'ghost' } });
    assert.equal(r.status, 400);
    r = await admin.put('/api/admin/settings/billing', { value: { referee_bonus_credits: 250, free_plan_id: 'spark' } });
    assert.equal(r.status, 200);
    try {
      assert.equal(r.body.referee_bonus_credits, 250);
      assert.equal(r.body.conversation_reply_limit, 10);
      assert.equal((await h.client().get('/api/public/site')).body.billing.referee_bonus, 250);
    } finally { await admin.put('/api/admin/settings/billing', { value: {} }); }
  });
});

describe('workspaces, users, orders', () => {
  test('credits delta adds a ledger row, audit row and email', async () => {
    const w = db.one('SELECT * FROM workspaces WHERE name = \'Glow Labs\'');
    let r = await admin.put('/api/admin/workspaces/' + w.id, { credits_delta: 500, credits_reason: 'Launch promo' });
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT credits FROM workspaces WHERE id = ?', w.id).credits, w.credits + 500);
    const tx = db.one('SELECT * FROM credit_tx WHERE workspace_id = ? ORDER BY id DESC', w.id);
    assert.equal(tx.amount, 500);
    assert.equal(tx.reason, 'Launch promo');
    assert.equal(tx.ref, 'admin:' + adminId);
    const a = lastAudit();
    assert.equal(a.action, 'workspace.update');
    assert.equal(a.user_id, adminId);
    assert.equal(JSON.parse(a.data).credits_delta, 500);
    await h.waitFor(() => h.emails(h.DEMO.email, 'credits-added').length, { label: 'credits-added email' });
    // Negative deltas never push the balance below zero.
    r = await admin.put('/api/admin/workspaces/' + w.id, { credits_delta: -999999 });
    assert.equal(db.one('SELECT credits FROM workspaces WHERE id = ?', w.id).credits, 0);
    await admin.put('/api/admin/workspaces/' + w.id, { credits_delta: w.credits });
  });

  test('plan/status changes validate', async () => {
    const w = db.one('SELECT * FROM workspaces WHERE name = \'Glow Labs\'');
    assert.equal((await admin.put('/api/admin/workspaces/' + w.id, { plan_id: 'ghost' })).status, 400);
    assert.equal((await admin.put('/api/admin/workspaces/999999', { plan_id: 'spark' })).status, 404);
    await admin.put('/api/admin/workspaces/' + w.id, { status: 'suspended' });
    try {
      assert.equal((await user.get('/api/app/closers')).status, 403, 'suspended workspace');
    } finally { await admin.put('/api/admin/workspaces/' + w.id, { status: 'active' }); }
    assert.equal((await user.get('/api/app/closers')).status, 200);
    const d = await admin.get('/api/admin/workspaces/' + w.id);
    assert.equal(d.body.workspace.id, w.id);
    assert.ok(!JSON.stringify(d.body).includes('token_enc'));
  });

  test('mark a crypto order paid (once)', async () => {
    const w = db.one('SELECT * FROM workspaces WHERE name = \'Glow Labs\'');
    const pack = db.one('SELECT * FROM packs WHERE credits = 500');
    const ref = 'RV-CRYPTO-TEST';
    db.insert('orders', { ref, workspace_id: w.id, user_id: w.owner_id, kind: 'pack', item_id: String(pack.id), item_name: '500 Voo Credits', amount_usd: 15, provider: 'crypto', status: 'pending', created_at: db.now() });
    const pending = await admin.get('/api/admin/orders?status=pending');
    assert.ok(pending.body.some(o => o.ref === ref));
    const before = db.one('SELECT credits FROM workspaces WHERE id = ?', w.id).credits;
    let r = await admin.post('/api/admin/orders/' + ref + '/mark-paid', { note: 'TX abc123' });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    const o = db.one('SELECT * FROM orders WHERE ref = ?', ref);
    assert.equal(o.status, 'paid');
    assert.equal(o.provider_ref, 'TX abc123');
    assert.equal(JSON.parse(o.meta).via, 'admin:' + adminId);
    assert.equal(db.one('SELECT credits FROM workspaces WHERE id = ?', w.id).credits, before + 500);
    r = await admin.post('/api/admin/orders/' + ref + '/mark-paid');
    assert.equal(r.body.ok, false);
    assert.equal(db.one('SELECT credits FROM workspaces WHERE id = ?', w.id).credits, before + 500);
    assert.equal(lastAudit().action, 'order.mark_paid');
    // Cancel only affects pending orders.
    await admin.post('/api/admin/orders/' + ref + '/cancel');
    assert.equal(db.one('SELECT status FROM orders WHERE ref = ?', ref).status, 'paid');
  });

  test('users list, role change, cannot demote self', async () => {
    const r = await admin.get('/api/admin/users?q=demo');
    assert.ok(r.body.rows.some(u => u.email === h.DEMO.email));
    assert.ok(!JSON.stringify(r.body).includes('password_hash'));
    assert.equal((await admin.put('/api/admin/users/' + adminId, { role: 'user' })).status, 400);
    const demoId = db.one('SELECT id FROM users WHERE email = ?', h.DEMO.email).id;
    assert.equal((await admin.put('/api/admin/users/' + demoId, { password: 'short' })).status, 400);
    assert.equal((await admin.put('/api/admin/users/999999', { role: 'admin' })).status, 404);
    const aud = lastAudit();
    assert.ok(!aud.data.includes('short'));
  });
});

describe('emails', () => {
  test('every template previews without leftover {{ }} placeholders', async () => {
    const list = mailer.list();
    assert.ok(list.length >= 14, 'templates found: ' + list.length);
    for (const t of list) {
      const r = await admin.get('/api/admin/emails/' + t.name + '/preview');
      assert.equal(r.status, 200, t.name);
      assert.ok(!r.text.includes('{{'), t.name + ' has leftover {{');
      assert.ok(!r.text.includes('}}'), t.name + ' has leftover }}');
      assert.ok(r.text.includes('<html') || r.text.includes('<table'), t.name);
      assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
      const built = mailer.build(t.name, mailer.SAMPLE);
      assert.ok(built.subject && !built.subject.includes('{{'), t.name + ' subject: ' + built.subject);
      assert.ok(!built.text.includes('{{'), t.name + ' text');
    }
    assert.equal((await admin.get('/api/admin/emails/nope/preview')).status, 404);
    assert.equal((await admin.get('/api/admin/emails/..%2F..%2Fpackage/preview')).status, 404);
  });

  test('test email is logged', async () => {
    const r = await admin.post('/api/admin/emails/welcome/test', { to: 'qa@example.com' });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(h.emails('qa@example.com', 'welcome').length, 1);
  });

  test('broadcast to the test audience only reaches the admin', async () => {
    let r = await admin.post('/api/admin/broadcast', { subject: '', body_md: 'Hello world' });
    assert.equal(r.status, 400);
    r = await admin.post('/api/admin/broadcast', { subject: 'Big news', body_md: 'Hi' });
    assert.equal(r.status, 400, 'body too short');
    const before = db.one('SELECT COUNT(*) n FROM email_log WHERE template = \'blank\'').n;
    r = await admin.post('/api/admin/broadcast', { subject: 'Big news', body_md: '# Hello\n\nWe launched **Agent Studio**.', audience: 'test' });
    assert.equal(r.status, 200);
    assert.equal(r.body.count, 1);
    await h.waitFor(() => h.emails(h.ADMIN.email, 'blank').length === 1, { label: 'broadcast email' });
    await h.sleep(200);
    assert.equal(db.one('SELECT COUNT(*) n FROM email_log WHERE template = \'blank\'').n, before + 1);
    assert.equal(h.emails(h.ADMIN.email, 'blank')[0].subject, 'Big news');
    assert.equal(JSON.parse(lastAudit().data).audience, 'test');
  });

  test('broadcast unsubscribe link works and opted-out users are skipped', async () => {
    const { hmac } = require('../src/lib/security');
    const email = h.DEMO.email;
    const bad = await h.client().get('/unsubscribe?e=' + encodeURIComponent(email) + '&t=nope');
    assert.equal(bad.status, 400);
    const t = hmac('unsub:' + email).slice(0, 32);
    const ok = await h.client().get('/unsubscribe?e=' + encodeURIComponent(email) + '&t=' + t);
    assert.equal(ok.status, 200);
    assert.equal(db.one('SELECT marketing_opt_out FROM users WHERE email = ?', email).marketing_opt_out, 1);
    const all = await admin.post('/api/admin/broadcast', { subject: 'Count check', body_md: 'Counting people', audience: 'paying' });
    assert.equal(all.body.count, 0, 'the only paying owner opted out');
    db.run('UPDATE users SET marketing_opt_out = 0 WHERE email = ?', email);
  });
});

describe('posts', () => {
  test('CRUD with slug conflicts', async () => {
    let r = await admin.post('/api/admin/posts', { title: 'Hello Test Post', description: 'desc', body_md: '# Hi\n\nSome words here.' });
    assert.equal(r.status, 200, r.text);
    const id = r.body.id;
    let p = db.one('SELECT * FROM posts WHERE id = ?', id);
    assert.equal(p.slug, 'hello-test-post');
    assert.equal(p.status, 'published');
    assert.equal((await h.client().get('/blog/hello-test-post')).status, 200);
    r = await admin.post('/api/admin/posts', { title: 'Hello Test Post' });
    assert.equal(r.status, 409);
    r = await admin.post('/api/admin/posts', { title: '' });
    assert.equal(r.status, 400);
    const other = db.one('SELECT * FROM posts WHERE id != ? ORDER BY id LIMIT 1', id);
    r = await admin.put('/api/admin/posts/' + id, { title: 'Renamed', slug: other.slug });
    assert.equal(r.status, 409);
    r = await admin.put('/api/admin/posts/' + id, { title: 'Renamed', slug: 'renamed-post', status: 'draft', featured: true });
    assert.equal(r.status, 200);
    p = db.one('SELECT * FROM posts WHERE id = ?', id);
    assert.equal(p.slug, 'renamed-post');
    assert.equal(p.status, 'draft');
    assert.equal(db.one('SELECT COUNT(*) n FROM posts WHERE featured = 1').n, 1, 'only one featured post');
    assert.equal((await h.client().get('/blog/renamed-post')).status, 404, 'drafts are hidden');
    assert.equal((await admin.get('/api/admin/posts/' + id)).body.slug, 'renamed-post');
    r = await admin.del('/api/admin/posts/' + id);
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT id FROM posts WHERE id = ?', id), null);
    assert.equal((await admin.get('/api/admin/posts/' + id)).status, 404);
  });

  test('markdown preview is sanitized', async () => {
    const r = await admin.post('/api/admin/preview-md', { md: '<img src=x onerror=alert(1)> [x](javascript:alert(1))' });
    assert.ok(!r.body.html.includes('<img src=x'));
    assert.ok(!r.body.html.includes('javascript:'));
  });

  test('legal pages can be edited', async () => {
    const r = await admin.put('/api/admin/pages/terms', { title: 'Terms of Service', description: 'The rules', body_md: '## Use\n\nBe nice.' });
    assert.equal(r.status, 200);
    const page = await h.client().get('/legal/terms');
    assert.ok(page.text.includes('Be nice.'));
  });
});
