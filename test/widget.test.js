'use strict';
// Website AI chat: public widget API (/w/:key/*), origin lock, CORS, limits, plan gating, uploads, inbox handoff.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let env, db, settings, demo, site, key, ws;
const ORIGIN = 'http://localhost:5173';
const vid = (n = '') => 'v_' + ('test' + n + 'x'.repeat(24)).slice(0, 24);
const w = (c, method, path, body, origin = ORIGIN) => c.req(method, '/w/' + key + path, body, { headers: origin ? { origin } : {} });
const PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(64, 1)]).toString('base64');

before(async () => {
  env = await h.boot();
  db = env.db;
  settings = require('../src/services/settings');
  demo = await h.login(h.DEMO.email, h.DEMO.password);
  ws = db.one('SELECT * FROM workspaces WHERE name = ?', 'Glow Labs');
  site = db.one('SELECT * FROM channels WHERE workspace_id = ? AND type = \'website\'', ws.id);
  key = site.external_id;
});
after(() => env.close());

describe('widget basics', () => {
  test('demo workspace has a website channel with an unguessable key', () => {
    assert.match(key, /^wk_[A-Za-z0-9]{20}$/);
    assert.deepEqual(JSON.parse(site.data).domains, ['localhost', 'glowlabs.shop']);
  });

  test('/widget.js is served as JavaScript', async () => {
    const r = await h.client().get('/widget.js');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /javascript/);
    assert.ok(r.text.includes('attachShadow'));
  });

  test('GET config returns the public config only and records where it was seen', async () => {
    const r = await w(h.client(), 'GET', '/config');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(r.body.online, true);
    assert.equal(r.body.widget.title, 'Glow Labs');
    assert.equal(r.body.closer.name, 'Ace');
    assert.equal(r.body.branding.show, true, 'Pro shows Powered by Replyvoo');
    assert.match(r.body.branding.url, /\?ref=/);
    const raw = JSON.stringify(r.body);
    for (const secret of ['domains', 'token', 'webhook', 'custom_css', 'ref_code"', 'workspace_id']) assert.ok(!raw.includes(secret), 'no ' + secret);
    const inst = JSON.parse(db.one('SELECT data FROM channels WHERE id = ?', site.id).data).install;
    assert.equal(inst.host, 'localhost');
  });

  test('unknown or malformed keys are 404 JSON', async () => {
    const c = h.client();
    assert.equal((await c.get('/w/wk_doesNotExist1234567890/config', { headers: { origin: ORIGIN } })).status, 404);
    const r = await c.get('/w/nope/config', { headers: { origin: ORIGIN } });
    assert.equal(r.status, 404);
    assert.ok(r.body && r.body.error);
  });
});

describe('messages, billing and the inbox', () => {
  test('a message gets an AI reply, is stored with the page and billed once per conversation', async () => {
    const c = h.client();
    const before = db.one('SELECT conv_used FROM workspaces WHERE id = ?', ws.id).conv_used;
    let r = await w(c, 'POST', '/messages', { visitor_id: vid(1), text: 'Do you ship to Spain?', page_url: 'https://glowlabs.shop/serum', page_title: 'Serum' });
    assert.equal(r.status, 200);
    assert.ok(r.body.reply && /Spain/.test(r.body.reply.text), 'demo AI answers from the knowledge base');
    assert.equal(typeof r.body.reply.id, 'number');
    assert.ok(r.body.delay_ms >= 1500 * 0.6 && r.body.delay_ms <= 4000, 'delay within configured range: ' + r.body.delay_ms);
    assert.ok(r.body.typing_ms <= r.body.delay_ms);
    r = await w(c, 'POST', '/messages', { visitor_id: vid(1), text: 'How much is the serum?' });
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT conv_used FROM workspaces WHERE id = ?', ws.id).conv_used, before + 1, 'billed once');
    const t = db.one('SELECT * FROM threads WHERE channel_id = ? AND chat_id = ?', site.id, vid(1));
    const contact = db.one('SELECT * FROM contacts WHERE id = ?', t.contact_id);
    assert.match(contact.name, /^Website visitor #\d{4}$/);
    const first = db.one('SELECT meta FROM messages WHERE thread_id = ? AND dir = \'in\' ORDER BY id LIMIT 1', t.id);
    assert.equal(JSON.parse(first.meta).page_url, 'https://glowlabs.shop/serum');
    const detail = await demo.get('/api/app/threads/' + t.id);
    assert.equal(detail.body.channel.type, 'website');
    assert.equal(detail.body.page.url, 'https://glowlabs.shop/serum');
  });

  test('a human reply from Pulse Inbox reaches the widget by polling; other visitors see nothing', async () => {
    const c = h.client();
    const v = vid(2);
    let r = await w(c, 'POST', '/messages', { visitor_id: v, text: 'Is the cream good for dry skin?' });
    const last = r.body.reply.id;
    const t = db.one('SELECT * FROM threads WHERE channel_id = ? AND chat_id = ?', site.id, v);
    assert.equal((await demo.post('/api/app/threads/' + t.id + '/messages', { text: 'Hi, Grace here! Yes, it is perfect for dry skin.' })).status, 200);
    r = await w(c, 'GET', '/messages?visitor_id=' + v + '&after=' + last);
    assert.equal(r.status, 200);
    assert.equal(r.body.messages.length, 1);
    assert.equal(r.body.messages[0].author, 'human');
    assert.match(r.body.messages[0].text, /Grace here/);
    assert.equal(r.body.human, true);
    // While a person is on the chat the AI stays quiet and the widget keeps polling.
    r = await w(c, 'POST', '/messages', { visitor_id: v, text: 'Great, thanks' });
    assert.equal(r.body.reply, null);
    assert.equal(r.body.human, true);
    // Isolation: another visitor id sees none of it.
    const other = await w(h.client(), 'GET', '/messages?visitor_id=' + vid(3) + '&after=0');
    assert.deepEqual(other.body.messages, []);
    assert.equal((await w(c, 'GET', '/messages?visitor_id=bad&after=0')).status, 400);
  });

  test('validation: visitor id, empty and too-long messages', async () => {
    const c = h.client();
    assert.equal((await w(c, 'POST', '/messages', { visitor_id: 'x', text: 'hi' })).status, 400);
    assert.equal((await w(c, 'POST', '/messages', { visitor_id: vid(4), text: '   ' })).status, 400);
    assert.equal((await w(c, 'POST', '/messages', { visitor_id: vid(4), text: 'a'.repeat(1001) })).status, 400);
  });

  test('rate limit: 30 messages per visitor per 10 minutes', async () => {
    const c = h.client();
    const v = vid(5);
    for (let i = 0; i < 30; i++) assert.equal((await w(c, 'POST', '/messages', { visitor_id: v, text: 'hello ' + i })).status, 200, 'msg ' + i);
    const r = await w(c, 'POST', '/messages', { visitor_id: v, text: 'one more' });
    assert.equal(r.status, 429);
    assert.ok(r.body.error);
  });
});

describe('origin lock and CORS', () => {
  test('wrong origin is 403, allowed domain and www are OK, missing origin is 403', async () => {
    const c = h.client();
    let r = await w(c, 'GET', '/config', undefined, 'https://evil.example');
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'origin_not_allowed');
    assert.equal(r.headers.get('access-control-allow-origin'), null);
    assert.equal((await w(c, 'POST', '/messages', { visitor_id: vid(6), text: 'hi' }, 'https://evil.example')).status, 403);
    assert.equal((await w(c, 'GET', '/config', undefined, null)).status, 403, 'no Origin or Referer');
    assert.equal((await w(c, 'GET', '/config', undefined, 'https://glowlabs.shop')).status, 200);
    assert.equal((await w(c, 'GET', '/config', undefined, 'https://www.glowlabs.shop')).status, 200, 'www of an exact domain');
    assert.equal((await w(c, 'GET', '/config', undefined, 'https://shop.glowlabs.shop')).status, 403, 'other subdomains need a wildcard');
    r = await c.get('/w/' + key + '/config', { headers: { referer: 'https://glowlabs.shop/products/serum' } });
    assert.equal(r.status, 200, 'Referer works when Origin is missing');
  });

  test('wildcard domains cover subdomains and the apex only', async () => {
    const r = await demo.put('/api/app/channels/' + site.id, { domains: ['localhost', 'glowlabs.shop', '*.brand.io', 'https://Store.Example.com/path'] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.domains, ['localhost', 'glowlabs.shop', '*.brand.io', 'store.example.com']);
    const c = h.client();
    for (const ok of ['https://eu.brand.io', 'https://a.b.brand.io', 'https://brand.io', 'https://store.example.com']) assert.equal((await w(c, 'GET', '/config', undefined, ok)).status, 200, ok);
    for (const bad of ['https://evilbrand.io', 'https://brand.io.evil.com', 'https://example.com']) assert.equal((await w(c, 'GET', '/config', undefined, bad)).status, 403, bad);
    assert.equal((await demo.put('/api/app/channels/' + site.id, { domains: ['not a domain!'] })).status, 400);
    assert.equal((await demo.put('/api/app/channels/' + site.id, { domains: ['*.com'] })).status, 400);
    await demo.put('/api/app/channels/' + site.id, { domains: ['localhost', 'glowlabs.shop'] });
  });

  test('CORS preflight answers allowed origins only', async () => {
    const c = h.client();
    let r = await c.req('OPTIONS', '/w/' + key + '/messages', undefined, { headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
    assert.match(r.headers.get('access-control-allow-methods'), /POST/);
    assert.match(r.headers.get('access-control-allow-headers'), /content-type/i);
    r = await c.req('OPTIONS', '/w/' + key + '/messages', undefined, { headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  });
});

describe('lead capture', () => {
  test('validates fields and updates the contact, event and Leads list', async () => {
    const c = h.client();
    const v = vid(7);
    assert.equal((await w(c, 'POST', '/lead', { visitor_id: v, name: 'Emma', email: 'not-an-email' })).status, 400);
    let r = await w(c, 'POST', '/lead', { visitor_id: v, name: 'Emma' });
    assert.equal(r.status, 400, 'email is required by default');
    assert.equal(r.body.field, 'email');
    assert.equal((await w(c, 'POST', '/lead', { visitor_id: v, email: 'emma@example.com', phone: 'call me maybe' })).status, 400);
    r = await w(c, 'POST', '/lead', { visitor_id: v, name: 'Emma <b>Stone</b>', email: 'Emma@Example.com', phone: '+34 612 345 678' });
    assert.equal(r.status, 200);
    const contact = db.one('SELECT * FROM contacts WHERE channel_id = ? AND external_id = ?', site.id, v);
    assert.equal(contact.name, 'Emma bStone/b');
    assert.equal(contact.email, 'emma@example.com');
    assert.equal(contact.phone, '+34 612 345 678');
    assert.equal(contact.heat, 'warm');
    assert.ok(db.one('SELECT id FROM events WHERE workspace_id = ? AND type = \'lead\' ORDER BY id DESC', ws.id));
    const leads = await demo.get('/api/app/contacts');
    assert.ok(leads.body.some(l => l.email === 'emma@example.com' && l.phone === '+34 612 345 678'));
    const exp = await demo.get('/api/app/export');
    assert.ok(exp.body.contacts.some(l => l.email === 'emma@example.com'));
  });
});

describe('plan gating, power-up and flags', () => {
  test('creating a widget is gated by plan (402 website_limit) and the power-up unlocks one site', async () => {
    // Demo is on Pro: 1 site included and already used.
    let r = await demo.post('/api/app/channels/website', { domains: ['second.example.com'] });
    assert.equal(r.status, 402);
    assert.equal(r.body.code, 'website_limit');
    const s = await h.signup({ email: 'webfree@example.com' });
    r = await s.client.post('/api/app/channels/website', { domains: ['free.example.com'] });
    assert.equal(r.status, 402);
    assert.match(r.body.error, /Pro and up/);
    const boot = await s.client.get('/api/app/bootstrap');
    assert.equal(boot.body.usage.website.sites, 0);
    const co = await s.client.post('/api/app/checkout', { kind: 'addon', item_id: 'website-chat', provider: 'demo' });
    assert.equal(co.status, 200);
    assert.equal(db.one('SELECT amount_usd FROM orders WHERE ref = ?', co.body.ref).amount_usd, 29);
    require('../src/services/payments').fulfill(co.body.ref, { via: 'test' });
    r = await s.client.post('/api/app/channels/website', { domains: ['free.example.com'], name: 'Free shop' });
    assert.equal(r.status, 200);
    assert.match(r.body.key, /^wk_/);
    assert.ok(r.body.snippet.includes('data-key="' + r.body.key + '"'));
    assert.equal(r.body.unlocked, true);
    assert.equal((await s.client.post('/api/app/channels/website', { domains: ['two.example.com'] })).status, 402);
    // When the power-up runs out, the widget goes offline instead of answering.
    const wsRow = db.one('SELECT * FROM workspaces WHERE id = ?', s.ws.id);
    const st = JSON.parse(wsRow.settings);
    st.web_slots = st.web_slots.map(x => ({ ...x, exp: '2020-01-01T00:00:00.000Z' }));
    db.update('workspaces', s.ws.id, { settings: JSON.stringify(st) });
    const c = h.client();
    const cfg = await c.get('/w/' + r.body.key + '/config', { headers: { origin: 'https://free.example.com' } });
    assert.equal(cfg.status, 200);
    assert.equal(cfg.body.online, false);
    const m = await c.post('/w/' + r.body.key + '/messages', { visitor_id: vid(8), text: 'hi' }, { headers: { origin: 'https://free.example.com' } });
    assert.equal(m.status, 503);
    assert.equal(m.body.offline, true);
  });

  test('flag off: widget shows offline, messages are refused and creation is blocked', async () => {
    settings.set('flags', { channels: { website: 'soon' } });
    try {
      const c = h.client();
      const cfg = await w(c, 'GET', '/config');
      assert.equal(cfg.status, 200);
      assert.equal(cfg.body.online, false);
      assert.match(cfg.body.offline_reason, /offline/i);
      assert.equal((await w(c, 'POST', '/messages', { visitor_id: vid(9), text: 'hi' })).status, 503);
      assert.equal((await demo.post('/api/app/channels/website', { domains: ['x.example.com'] })).status, 403);
    } finally { settings.set('flags', {}); }
  });

  test('custom CSS and hiding the branding need Business+', async () => {
    let r = await demo.put('/api/app/channels/' + site.id, { widget: { custom_css: '.panel{color:red}' } });
    assert.equal(r.status, 402);
    assert.equal(r.body.code, 'custom_css_locked');
    r = await demo.put('/api/app/channels/' + site.id, { widget: { hide_branding: true } });
    assert.equal(r.status, 402);
    db.update('workspaces', ws.id, { plan_id: 'business' });
    try {
      r = await demo.put('/api/app/channels/' + site.id, { widget: { custom_css: '@import url(https://x.test/a.css); .panel{background:url(javascript:alert(1))}</style><script>', hide_branding: true } });
      assert.equal(r.status, 200);
      assert.ok(!/@import|url\(|<\/style|javascript:/i.test(r.body.widget.custom_css), r.body.widget.custom_css);
      const cfg = await w(h.client(), 'GET', '/config');
      assert.equal(cfg.body.branding.show, false);
      assert.equal(cfg.body.css, r.body.widget.custom_css);
      assert.equal((await demo.put('/api/app/channels/' + site.id, { widget: { custom_css: 'a'.repeat(5001) } })).status, 400);
    } finally {
      db.update('workspaces', ws.id, { plan_id: 'pro' });
      await demo.put('/api/app/channels/' + site.id, { widget: { hide_branding: false } }).catch(() => {});
      const d = JSON.parse(db.one('SELECT data FROM channels WHERE id = ?', site.id).data);
      d.widget.custom_css = ''; d.widget.hide_branding = false;
      db.update('channels', site.id, { data: JSON.stringify(d) });
    }
  });

  test('widget settings are validated and clamped', async () => {
    const r = await demo.put('/api/app/channels/' + site.id, { widget: { colors: { primary: 'red', header_bg: '#00ff00' }, radius: 999, delay_min: 5, delay_max: 1, chips: ['a', 'b', 'c', 'd', 'e'], launcher: 'rocket', welcome: 'x'.repeat(900), lead: { mode: 'before', name: { on: false }, email: { on: false }, phone: { on: false } } } });
    assert.equal(r.status, 400, 'lead capture needs a field');
    const ok = await demo.put('/api/app/channels/' + site.id, { widget: { colors: { primary: 'red', header_bg: '#00ff00' }, radius: 999, delay_min: 5, delay_max: 1, chips: ['a', 'b', 'c', 'd', 'e'], launcher: 'rocket', welcome: 'x'.repeat(900) } });
    assert.equal(ok.status, 200);
    const wd = ok.body.widget;
    assert.equal(wd.colors.primary, '#FFC21A', 'invalid colour ignored');
    assert.equal(wd.colors.header_bg, '#00FF00');
    assert.equal(wd.radius, 32);
    assert.equal(wd.delay_max, 5);
    assert.equal(wd.chips.length, 4);
    assert.equal(wd.launcher, 'bubble');
    assert.equal(wd.welcome.length, 400);
    // agents (non-managers) can't change the widget
    const s = await h.signup({ email: 'web.agent@example.com' });
    db.insert('members', { workspace_id: ws.id, user_id: s.user.id, role: 'agent', created_at: db.now() });
    await s.client.post('/api/app/workspaces/switch', { id: ws.id });
    assert.equal((await s.client.put('/api/app/channels/' + site.id, { widget: { title: 'Hacked' } })).status, 403);
    await demo.put('/api/app/channels/' + site.id, { widget: { delay_min: 1.5, delay_max: 4, radius: 22, welcome: 'Hi!', colors: { header_bg: '#121110' } } });
  });
});

describe('uploads', () => {
  test('PNG/JPEG/WebP only, max 300 KB, served with the right type and nosniff', async () => {
    const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64');
    let r = await demo.post('/api/app/channels/' + site.id + '/upload', { kind: 'logo', data_url: svg });
    assert.equal(r.status, 400);
    r = await demo.post('/api/app/channels/' + site.id + '/upload', { kind: 'logo', data_url: 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64') });
    assert.equal(r.status, 400, 'bytes must really be an image');
    const big = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(310 * 1024)]).toString('base64');
    r = await demo.post('/api/app/channels/' + site.id + '/upload', { kind: 'logo', data_url: big });
    assert.equal(r.status, 413);
    assert.equal((await demo.post('/api/app/channels/' + site.id + '/upload', { kind: 'banner', data_url: PNG })).status, 400);
    r = await demo.post('/api/app/channels/' + site.id + '/upload', { kind: 'avatar', data_url: PNG });
    assert.equal(r.status, 200);
    assert.ok(r.body.assets.avatar);
    assert.equal(r.body.widget.avatar_mode, 'upload');
    const asset = await h.client().get(new URL(r.body.assets.avatar).pathname);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('content-type'), 'image/png');
    assert.equal(asset.headers.get('x-content-type-options'), 'nosniff');
    const cfg = await w(h.client(), 'GET', '/config');
    assert.ok(cfg.body.assets.avatar);
    r = await demo.post('/api/app/channels/' + site.id + '/upload', { kind: 'avatar', data_url: null });
    assert.equal(r.status, 200);
    assert.equal(r.body.assets.avatar, undefined);
    assert.equal((await h.client().get(new URL(cfg.body.assets.avatar).pathname)).status, 404);
  });
});

describe('admin', () => {
  test('plan editor saves the website fields', async () => {
    const admin = await h.login(h.ADMIN.email, h.ADMIN.password);
    const p = (await admin.get('/api/admin/plans')).body.find(x => x.id === 'growth');
    assert.equal(p.website_sites, 0);
    assert.equal((await admin.put('/api/admin/plans/growth', { website_sites: 2, remove_branding: true, custom_css: false })).status, 200);
    const row = db.one('SELECT * FROM plans WHERE id = \'growth\'');
    assert.equal(row.website_sites, 2);
    assert.equal(row.remove_branding, 1);
    assert.equal(row.custom_css, 0);
    await admin.put('/api/admin/plans/growth', { website_sites: 0, remove_branding: false });
  });

  test('seeded plans, power-up and the /website-ai-chatbot page', async () => {
    const plans = Object.fromEntries(db.all('SELECT id, website_sites, remove_branding, custom_css FROM plans').map(p => [p.id, p]));
    assert.equal(plans.pro.website_sites, 1);
    assert.equal(plans.business.website_sites, 3);
    assert.equal(plans.business.remove_branding, 1);
    assert.equal(plans.titan.website_sites, 10);
    assert.equal(plans.black.website_sites, 999);
    const addon = db.one('SELECT * FROM addons WHERE slug = \'website-chat\'');
    assert.equal(addon.price, 29);
    assert.equal(addon.status, 'live');
    const page = await h.client().get('/website-ai-chatbot');
    assert.equal(page.status, 200);
    assert.match(page.text, /Pro \(\$149\/mo\) and up/);
    assert.match(page.text, /\$29 a month/);
    assert.ok(page.text.includes('"@type":"FAQPage"'));
    const home = await h.client().get('/');
    assert.ok(home.text.includes('id="website"'), 'homepage section');
    assert.ok(home.text.includes('data-house'), 'site chat bubble is the widget');
  });
});
