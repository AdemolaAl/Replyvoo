'use strict';
// Legal pages: all shipped pages are live and linked, no draft or template notes, location rules, and the boot sync
// that updates existing installs without ever overwriting a page an admin edited.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let ctx;
before(async () => { ctx = await h.boot(); });
after(async () => { await ctx.close(); });

const SLUGS = ['terms', 'privacy', 'acceptable-use', 'messaging', 'ai-use', 'refunds', 'availability', 'security', 'ip-takedowns', 'cookies', 'dpa', 'referral', 'disclaimer'];

test('every legal page is live, linked from the footer, the legal index and the sitemap', async () => {
  const c = h.client();
  const home = (await c.get('/')).text;
  const index = (await c.get('/legal')).text;
  const sitemap = (await c.get('/sitemap.xml')).text;
  for (const s of SLUGS) {
    const r = await c.get('/legal/' + s);
    assert.equal(r.status, 200, s);
    assert.ok(index.includes('/legal/' + s), 'index: ' + s);
    assert.ok(sitemap.includes('/legal/' + s), 'sitemap: ' + s);
    if (!['referral'].includes(s)) assert.ok(home.includes('/legal/' + s), 'footer: ' + s);
  }
  // The "More legal" switcher on a page lists the others.
  const terms = (await c.get('/legal/terms')).text;
  for (const s of ['messaging', 'ai-use', 'security', 'availability', 'ip-takedowns']) assert.ok(terms.includes('/legal/' + s), 'switcher: ' + s);
});

test('no draft, lawyer or template notes; Lagos only as "Zedapex Limited, Lagos"; Nigeria only for governing law and the NDPA/NDPC', () => {
  const legal = require('../src/services/legal');
  for (const p of legal.shipped()) {
    const t = p.title + '\n' + p.description + '\n' + p.body;
    assert.ok(!/lawyer|draft prepared|counsel|TODO/i.test(t) && !/\[[A-Z ]{4,}\]/.test(t), 'note left in ' + p.slug);
    assert.ok(!/Lagos, Nigeria|based in Lagos/i.test(t), 'location in ' + p.slug);
    for (const line of t.split('\n').filter(l => /Lagos/.test(l))) assert.match(line, /Zedapex Limited, Lagos/, p.slug + ': ' + line);
    for (const line of t.split('\n').filter(l => /Nigeria/.test(l))) assert.match(line, /laws of Nigeria|courts of Nigeria|Nigeria Data Protection (Act|Commission)/, p.slug + ': ' + line);
    assert.ok(!/\b(Amaka|Untouchable|Zubabot|Polycarp|Roland)\b/.test(t), 'banned name in ' + p.slug);
  }
  const terms = legal.shipped().find(p => p.slug === 'terms').body;
  for (const w of ['Paystack', 'Flutterwave', 'Bachs', 'Gatevoo', 'manual USDT', 'Mediation', 'Notices', 'Chargebacks', 'within 30 days']) assert.ok(terms.includes(w), 'terms mention ' + w);
  // Card plans auto-renew through Bachs: the terms and refund policy cover default-on, reminders, one-click cancel,
  // the failed-payment grace period and advance notice of price changes.
  const refunds = legal.shipped().find(p => p.slug === 'refunds').body;
  for (const t of [terms, refunds]) for (const w of [/auto-renew is (on|switched on)/i, /3 days before every renewal charge/, /one click/, /grace period/, /14 days before a new price/]) assert.match(t, w);
});

test('boot sync: unedited pages get the shipped text, admin-edited pages are kept, missing pages are added', async () => {
  const legal = require('../src/services/legal');
  ctx.db.run("UPDATE pages SET body_md = 'old shipped text' WHERE slug = 'cookies'");
  ctx.db.run("DELETE FROM pages WHERE slug = 'security'");
  const admin = await h.login(h.ADMIN.email, h.ADMIN.password);
  const page = ctx.db.one("SELECT * FROM pages WHERE slug = 'privacy'");
  assert.equal((await admin.put('/api/admin/pages/privacy', { title: page.title, description: page.description, body_md: 'Our own privacy text.' })).status, 200);
  const r = legal.syncPages();
  assert.ok(r.updated.includes('cookies'));
  assert.ok(r.added.includes('security'));
  assert.ok(r.kept.includes('privacy'));
  assert.notEqual(ctx.db.one("SELECT body_md FROM pages WHERE slug = 'cookies'").body_md, 'old shipped text');
  assert.equal(ctx.db.one("SELECT body_md FROM pages WHERE slug = 'privacy'").body_md, 'Our own privacy text.');
  // A forced reseed overwrites even edited pages.
  legal.syncPages({ force: true });
  assert.notEqual(ctx.db.one("SELECT body_md FROM pages WHERE slug = 'privacy'").body_md, 'Our own privacy text.');
});
