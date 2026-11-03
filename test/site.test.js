'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let env, db, settings, anon;
const APP = 'http://localhost:3000';

before(async () => {
  env = await h.boot();
  db = env.db;
  settings = require('../src/services/settings');
  anon = h.client();
});
after(() => env.close());

const titleOf = html => (html.match(/<title>([^<]*)<\/title>/) || [])[1];
const canonicalOf = html => (html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1];
function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
}

describe('public pages', () => {
  test('home', async () => {
    const r = await anon.get('/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(titleOf(r.text), 'Replyvoo | AI Sales Agent for Telegram, WhatsApp &amp; Instagram');
    assert.equal(canonicalOf(r.text), APP + '/');
    const ld = jsonLd(r.text);
    const types = ld.map(x => x['@type']);
    assert.ok(types.includes('Organization'));
    assert.ok(types.includes('SoftwareApplication'));
    assert.ok(types.includes('FAQPage'));
    const app = ld.find(x => x['@type'] === 'SoftwareApplication');
    assert.ok(app.offers.some(o => o.name === 'Starter' && o.price === 29));
    assert.ok(r.text.includes('Sky-rocket your sales.'));
    assert.match(r.text, /<meta name="robots" content="index,follow/);
  });

  test('pricing', async () => {
    const r = await anon.get('/pricing');
    assert.equal(r.status, 200);
    assert.equal(titleOf(r.text), 'Pricing | Replyvoo AI Sales Agents for Telegram &amp; WhatsApp');
    assert.equal(canonicalOf(r.text), APP + '/pricing');
    const types = jsonLd(r.text).map(x => x['@type']);
    assert.ok(types.includes('BreadcrumbList'));
    for (const name of ['Spark', 'Starter', 'Growth', 'Pro', 'Business']) assert.ok(r.text.includes(name), name);
    assert.ok(r.text.includes('$29'));
  });

  test('blog index and a post', async () => {
    const posts = db.all('SELECT * FROM posts WHERE status = \'published\'');
    assert.ok(posts.length >= 10);
    let r = await anon.get('/blog');
    assert.equal(r.status, 200);
    assert.equal(titleOf(r.text), 'Blog | Replyvoo playbooks for faster sales in chat');
    assert.equal(canonicalOf(r.text), APP + '/blog');
    const blog = jsonLd(r.text).find(x => x['@type'] === 'Blog');
    assert.ok(blog.blogPost.length > 0);
    const post = posts[0];
    assert.ok(r.text.includes('/blog/' + post.slug));
    r = await anon.get('/blog/' + post.slug);
    assert.equal(r.status, 200);
    assert.equal(canonicalOf(r.text), APP + '/blog/' + post.slug);
    assert.ok(titleOf(r.text).startsWith(require('../src/lib/md').esc(post.title)));
    assert.match(titleOf(r.text), / \| Replyvoo Blog$/);
    const bp = jsonLd(r.text).find(x => x['@type'] === 'BlogPosting');
    assert.equal(bp.headline, post.title);
    assert.equal(bp.url, APP + '/blog/' + post.slug);
    assert.match(r.text, /<meta property="og:type" content="article">/);
    assert.equal((await anon.get('/blog/no-such-post')).status, 404);
  });

  test('future-dated posts are hidden', async () => {
    const id = db.insert('posts', { slug: 'from-the-future', title: 'Future', body_md: 'x', published_at: new Date(Date.now() + 864e5).toISOString(), updated_at: db.now() });
    try {
      assert.equal((await anon.get('/blog/from-the-future')).status, 404);
      assert.ok(!(await anon.get('/blog')).text.includes('from-the-future'));
      assert.ok(!(await anon.get('/sitemap.xml')).text.includes('from-the-future'));
    } finally { db.run('DELETE FROM posts WHERE id = ?', id); }
  });

  test('legal index and terms', async () => {
    let r = await anon.get('/legal');
    assert.equal(r.status, 200);
    assert.equal(titleOf(r.text), 'Legal | Replyvoo');
    assert.equal(canonicalOf(r.text), APP + '/legal');
    assert.ok(r.text.includes('/legal/terms'));
    r = await anon.get('/legal/terms');
    assert.equal(r.status, 200);
    const page = db.one('SELECT * FROM pages WHERE slug = \'terms\'');
    assert.equal(titleOf(r.text), require('../src/lib/md').esc(page.title) + ' | Replyvoo');
    assert.equal(canonicalOf(r.text), APP + '/legal/terms');
    const crumb = jsonLd(r.text).find(x => x['@type'] === 'BreadcrumbList');
    assert.equal(crumb.itemListElement[2].item, APP + '/legal/terms');
    assert.equal((await anon.get('/legal/nope')).status, 404);
  });

  test('contact (and sales topic)', async () => {
    let r = await anon.get('/contact');
    assert.equal(r.status, 200);
    assert.equal(titleOf(r.text), 'Contact us | Replyvoo');
    assert.equal(canonicalOf(r.text), APP + '/contact');
    r = await anon.get('/contact?plan=black');
    assert.equal(titleOf(r.text), 'Talk to sales | Replyvoo');
  });

  test('sitemap.xml lists pages and every published post', async () => {
    const r = await anon.get('/sitemap.xml');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /application\/xml/);
    assert.ok(r.text.startsWith('<?xml'));
    for (const loc of ['/', '/pricing', '/blog', '/contact', '/legal', '/legal/terms', '/legal/privacy']) assert.ok(r.text.includes('<loc>' + APP + loc + '</loc>'), loc);
    for (const p of db.all('SELECT slug FROM posts WHERE status = \'published\'')) assert.ok(r.text.includes('<loc>' + APP + '/blog/' + p.slug + '</loc>'), p.slug);
    assert.ok(!r.text.includes('/app'));
  });

  test('channel landing pages and the /channels hub', async () => {
    const pages = { '/telegram-ai-chatbot': 'Live now', '/website-ai-chatbot': 'Live now', '/whatsapp-ai-chatbot': 'Coming soon', '/instagram-dm-automation': 'Coming soon', '/tiktok-dm-automation': 'Coming soon', '/messenger-ai-chatbot': 'Coming soon' };
    const sitemap = (await anon.get('/sitemap.xml')).text;
    for (const [p, badge] of Object.entries(pages)) {
      const r = await anon.get(p);
      assert.equal(r.status, 200, p);
      assert.equal(canonicalOf(r.text), APP + p);
      assert.ok(titleOf(r.text).replace(/&amp;/g, '&').length <= 60, p + ' title length');
      assert.equal((r.text.match(/<h1[ >]/g) || []).length, 1, p + ' has one h1');
      assert.ok(r.text.includes(badge), p + ' badge');
      const types = jsonLd(r.text).map(x => x['@type']);
      for (const t of ['FAQPage', 'BreadcrumbList', 'Service']) assert.ok(types.includes(t), p + ' ' + t);
      assert.ok(sitemap.includes('<loc>' + APP + p + '</loc>'), p + ' in sitemap');
    }
    assert.ok((await anon.get('/whatsapp-ai-chatbot')).text.includes('data-wl-item="whatsapp"'), 'soon page has a waitlist form');
    const hub = await anon.get('/channels');
    assert.equal(hub.status, 200);
    const list = jsonLd(hub.text).find(x => x['@type'] === 'ItemList');
    assert.equal(list.itemListElement.length, 6);
    assert.ok(sitemap.includes('<loc>' + APP + '/channels</loc>'));
    const home = await anon.get('/');
    assert.ok(home.text.includes('href="/whatsapp-ai-chatbot"'), 'home links to channel pages');
    const org = jsonLd(home.text).find(x => x['@type'] === 'Organization');
    assert.equal(org.parentOrganization.name, 'Zedapex Limited');
    assert.ok(org.contactPoint[0].email);
  });

  test('blog RSS feed', async () => {
    const r = await anon.get('/blog/rss.xml');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /application\/rss\+xml/);
    assert.ok(r.text.includes('<rss version="2.0"'));
    assert.ok((r.text.match(/<item>/g) || []).length <= 20);
    assert.ok((await anon.get('/blog')).text.includes('type="application/rss+xml"'));
  });

  test('robots.txt', async () => {
    const r = await anon.get('/robots.txt');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/plain/);
    assert.ok(r.text.includes('Disallow: /app'));
    assert.ok(r.text.includes('Disallow: /admin'));
    assert.ok(r.text.includes('Disallow: /api'));
    assert.ok(r.text.includes('Sitemap: ' + APP + '/sitemap.xml'));
  });

  test('static assets are served', async () => {
    const r = await anon.get('/favicon.svg');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /image\/svg\+xml/);
    assert.ok(r.headers.get('etag'));
    const again = await anon.get('/favicon.svg', { headers: { 'if-none-match': r.headers.get('etag') } });
    assert.equal(again.status, 304);
    assert.equal((await anon.get('/..%2f..%2fpackage.json')).status, 404, 'no path traversal');
    assert.equal((await anon.get('/%2e%2e/.env.example')).status, 404, 'no path traversal (encoded dots)');
  });
});

describe('errors and shells', () => {
  test('unknown page is a 404 HTML page, unknown /api is 404 JSON', async () => {
    let r = await anon.get('/definitely-not-here');
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(titleOf(r.text), 'Page not found | Replyvoo');
    assert.match(r.text, /<meta name="robots" content="noindex">/);
    r = await anon.get('/api/x');
    assert.equal(r.status, 404);
    assert.deepEqual(r.body, { error: 'Not found' });
    r = await anon.post('/api/x', {});
    assert.equal(r.status, 404);
    assert.deepEqual(r.body, { error: 'Not found' });
  });

  test('/app and /admin/* serve the SPA shells', async () => {
    for (const p of ['/app', '/app/inbox', '/app/signup', '/app/studio/12']) {
      const r = await anon.get(p);
      assert.equal(r.status, 200, p);
      assert.equal(titleOf(r.text), 'Replyvoo dashboard', p);
      assert.equal(r.headers.get('x-robots-tag'), 'noindex');
    }
    for (const p of ['/admin', '/admin/anything', '/admin/plans/edit']) {
      const r = await anon.get(p);
      assert.equal(r.status, 200, p);
      assert.equal(titleOf(r.text), 'Admin | Replyvoo', p);
    }
  });

  test('/healthz', async () => {
    const r = await anon.get('/healthz');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.ok(!Number.isNaN(Date.parse(r.body.time)));
  });
});

describe('links', () => {
  test('/go/joinvoo redirects with UTM tags and logs a click', async () => {
    const before = db.one('SELECT COUNT(*) n FROM clicks WHERE target = \'joinvoo\'').n;
    let r = await anon.get('/go/joinvoo?from=pricing');
    assert.equal(r.status, 302);
    const u = new URL(r.location);
    assert.equal(u.origin, 'https://joinvoo.com');
    assert.equal(u.searchParams.get('utm_source'), 'replyvoo');
    assert.equal(u.searchParams.get('utm_medium'), 'dashboard');
    assert.equal(u.searchParams.get('utm_campaign'), 'sister');
    assert.equal(u.searchParams.get('utm_content'), 'pricing');
    const c = db.one('SELECT * FROM clicks WHERE target = \'joinvoo\' ORDER BY id DESC');
    assert.equal(c.source, 'pricing');
    assert.equal(c.ip_hash.length, 16);
    assert.equal(db.one('SELECT COUNT(*) n FROM clicks WHERE target = \'joinvoo\'').n, before + 1);
    r = await anon.get('/go/joinvoo?from=%3Cscript%3E');
    assert.equal(new URL(r.location).searchParams.get('utm_content'), 'script');
    // A logged-in click records the workspace.
    const demo = await h.login(h.DEMO.email, h.DEMO.password);
    await demo.get('/go/joinvoo');
    assert.ok(db.one('SELECT workspace_id FROM clicks WHERE target = \'joinvoo\' ORDER BY id DESC').workspace_id);
  });

  test('/go/joinvoo never redirects to a non-https URL set in settings', async () => {
    settings.set('joinvoo', { url: 'javascript:alert(1)' });
    try {
      const r = await anon.get('/go/joinvoo');
      assert.ok(r.location.startsWith('https://joinvoo.com'));
    } finally { settings.set('joinvoo', {}); }
  });
});

describe('admin edits show on the site', () => {
  test('a plan price change appears on /pricing', async () => {
    const admin = await h.login(h.ADMIN.email, h.ADMIN.password);
    const r = await admin.put('/api/admin/plans/starter', { price_month: 23, price_year: 230 });
    assert.equal(r.status, 200);
    try {
      const page = await anon.get('/pricing');
      assert.ok(page.text.includes('$23'));
      const ld = jsonLd(page.text).find(x => x['@type'] === 'SoftwareApplication');
      assert.equal(ld.offers.find(o => o.name === 'Starter').price, 23);
      assert.ok(!ld.offers.some(o => o.name === 'Starter' && o.price === 29));
    } finally { await admin.put('/api/admin/plans/starter', { price_month: 29, price_year: 290 }); }
  });

  test('channel flags drive landing pages: off → 404 and hidden, live → Start free', async () => {
    const admin = await h.login(h.ADMIN.email, h.ADMIN.password);
    try {
      assert.equal((await admin.put('/api/admin/settings/flags', { value: { channels: { whatsapp: 'off' } } })).status, 200);
      assert.equal((await anon.get('/whatsapp-ai-chatbot')).status, 404);
      assert.ok(!(await anon.get('/sitemap.xml')).text.includes('/whatsapp-ai-chatbot<'));
      assert.ok(!(await anon.get('/channels')).text.includes('href="/whatsapp-ai-chatbot"'));
      assert.equal((await admin.put('/api/admin/settings/flags', { value: { channels: { whatsapp: 'live' } } })).status, 200);
      // Live needs the Meta app configured and switched on too; until then the page keeps the waitlist.
      assert.ok((await anon.get('/whatsapp-ai-chatbot')).text.includes('data-wl-item="whatsapp"'), 'coming soon until WhatsApp is set up');
      assert.equal((await admin.put('/api/admin/connections/whatsapp', { app_id: '1234567890', app_secret: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', verify_token: 'verify-token-123', enabled: true })).status, 200);
      const r = await anon.get('/whatsapp-ai-chatbot');
      assert.equal(r.status, 200);
      assert.ok(r.text.includes('Live now'));
      assert.ok(!r.text.includes('data-wl-item="whatsapp"'), 'no waitlist once live');
      assert.ok(r.text.includes('/app/signup'));
    } finally { settings.set('flags', {}); require('../src/services/whatsapp').save({ enabled: false }); }
  });

  test('hero text with <script> is escaped on /', async () => {
    settings.set('site', { hero: { en: { h1a: '<script>alert("x")</script>Evil', sub: '</script><img src=x onerror=alert(1)>' } } });
    try {
      const r = await anon.get('/');
      assert.equal(r.status, 200);
      assert.ok(!r.text.includes('<script>alert("x")</script>'), 'raw script tag must not appear');
      assert.ok(!r.text.includes('<img src=x onerror'), 'raw img must not appear');
      assert.ok(r.text.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;Evil'));
      // The JSON data block must not be closable either.
      const block = r.text.match(/<script type="application\/json" id="rv-data">([\s\S]*?)<\/script>/);
      assert.ok(block, 'data block present');
      assert.equal(JSON.parse(block[1]).hero.en.h1a, '<script>alert("x")</script>Evil');
    } finally { settings.set('site', {}); }
  });

  test('maintenance mode: 503 for the public, admin still works', async () => {
    const admin = await h.login(h.ADMIN.email, h.ADMIN.password);
    const demo = await h.login(h.DEMO.email, h.DEMO.password);
    const r0 = await admin.put('/api/admin/settings/flags', { value: { maintenance: true } });
    assert.equal(r0.status, 200);
    try {
      let r = await anon.get('/');
      assert.equal(r.status, 503);
      assert.equal(r.headers.get('retry-after'), '600');
      assert.equal(titleOf(r.text), 'Back soon | Replyvoo');
      r = await anon.get('/pricing');
      assert.equal(r.status, 503);
      r = await anon.get('/api/public/site');
      assert.equal(r.status, 503);
      assert.match(r.body.error, /upgrade/);
      r = await demo.get('/api/app/bootstrap');
      assert.equal(r.status, 503, 'normal users are paused too');
      // Admins and the admin panel keep working.
      assert.equal((await admin.get('/')).status, 200);
      assert.equal((await admin.get('/api/admin/overview')).status, 200);
      assert.equal((await anon.get('/admin')).status, 200, 'admin shell reachable to log in');
      assert.equal((await h.client().post('/api/auth/login', { email: h.ADMIN.email, password: h.ADMIN.password })).status, 200, 'admin can log in');
      assert.equal((await anon.get('/favicon.svg')).status, 200, 'assets still served');
      // Webhooks keep flowing.
      const ch = db.one('SELECT * FROM channels WHERE type = \'telegram_bot\'');
      const w = await h.client().post('/webhooks/telegram/' + ch.id, { update_id: 1 }, { headers: { 'x-telegram-bot-api-secret-token': ch.webhook_secret } });
      assert.equal(w.status, 200);
    } finally { await admin.put('/api/admin/settings/flags', { value: { maintenance: false } }); }
    assert.equal((await anon.get('/')).status, 200);
  });
});

describe('public API', () => {
  test('/api/public/site shape', async () => {
    const r = await anon.get('/api/public/site');
    assert.equal(r.status, 200);
    assert.equal(r.body.company.product, 'Replyvoo');
    assert.ok(r.body.plans.length >= 5);
    assert.equal(r.body.packs.length, 4);
    assert.equal(r.body.billing.reply_limit, 10);
    assert.equal(r.body.channels.find(c => c.id === 'telegram').status, 'live');
    assert.ok(!JSON.stringify(r.body).includes('crypto_wallet'), 'billing internals not exposed');
  });

  test('/api/public/chat answers from the fallback without an AI key', async () => {
    let r = await anon.post('/api/public/chat', { message: 'How much does it cost?' });
    assert.equal(r.status, 200);
    assert.equal(r.body.ai, false);
    assert.match(r.body.reply, /^Plans: Spark free, Starter \$29\/mo/);
    r = await anon.post('/api/public/chat', { message: 'Do you support WhatsApp?' });
    assert.match(r.body.reply, /Telegram is live today/);
    r = await anon.post('/api/public/chat', { message: 'blah' });
    assert.match(r.body.reply, /Talk to a human/);
    r = await anon.post('/api/public/chat', { message: '   ' });
    assert.equal(r.status, 400);
    r = await anon.post('/api/public/chat', { message: 'hi' }, { csrf: false });
    assert.equal(r.status, 403);
    settings.set('flags', { features: { chat_widget: false } });
    try { assert.equal((await anon.post('/api/public/chat', { message: 'hi' })).status, 403); }
    finally { settings.set('flags', {}); }
  });

  test('/api/public/contact validation and storage', async () => {
    const c = h.client();
    let r = await c.post('/api/public/contact', { email: 'nope', message: 'Hello there' });
    assert.equal(r.status, 400);
    r = await c.post('/api/public/contact', { email: 'buyer@example.com', message: ' ' });
    assert.equal(r.status, 400);
    r = await c.post('/api/public/contact', { name: 'Buyer', email: ' Buyer@Example.com ', message: 'I want the Black plan', source: 'sales' });
    assert.equal(r.status, 200);
    const row = db.one('SELECT * FROM contact_messages ORDER BY id DESC');
    assert.equal(row.email, 'buyer@example.com');
    assert.equal(row.source, 'sales');
    assert.equal(row.message, 'I want the Black plan');
    r = await c.post('/api/public/contact', { email: 'buyer@example.com', message: 'hi again', source: 'evil' });
    assert.equal(db.one('SELECT source FROM contact_messages ORDER BY id DESC').source, 'contact');
  });

  test('newsletter and public waitlist are idempotent', async () => {
    const c = h.client();
    assert.equal((await c.post('/api/public/newsletter', { email: 'news@example.com' })).status, 200);
    assert.equal((await c.post('/api/public/newsletter', { email: 'NEWS@example.com' })).status, 200);
    assert.equal(db.one('SELECT COUNT(*) n FROM waitlist WHERE email = \'news@example.com\' AND item = \'newsletter\'').n, 1);
    assert.equal((await c.post('/api/public/newsletter', { email: 'bad' })).status, 400);
    assert.equal((await c.post('/api/public/waitlist', { email: 'w@example.com', item: 'whatsapp' })).status, 200);
    assert.equal((await c.post('/api/public/waitlist', { email: 'w@example.com', item: 'whatsapp' })).status, 200);
    assert.equal(db.one('SELECT COUNT(*) n FROM waitlist WHERE email = \'w@example.com\'').n, 1);
    assert.equal((await c.post('/api/public/waitlist', { email: 'w@example.com', item: 'myspace' })).status, 400);
  });

  test('/api/public/track records sanitized clicks', async () => {
    const r = await anon.post('/api/public/track', { target: 'hero<cta>!', source: 'home' });
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT target FROM clicks ORDER BY id DESC').target, 'herocta');
  });
});
