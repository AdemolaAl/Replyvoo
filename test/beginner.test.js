'use strict';
// Beginner path: the free chat link, first-run setup, plain error codes, checkout reuse and the WhatsApp emails.
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let ctx, db;
before(async () => { ctx = await h.boot(); db = ctx.db; });
after(async () => { await ctx.close(); });

describe('first-run setup', () => {
  test('sign-up starts the 4-step setup; “What do you sell?” makes the helper and only filled-in answers', async () => {
    const s = await h.signup({ business: 'Petal & Stem' });
    let b = (await s.client.get('/api/app/bootstrap')).body;
    assert.deepEqual(b.setup, { step: 2 });
    assert.equal(b.workspace.settings.timezone, '', 'no Lagos default: the browser picks the time zone');
    assert.ok(b.billing.pro_brain_extra_credits >= 1, 'Smarter answers cost comes from settings');
    const r = await s.client.post('/api/app/setup/helper', { sells: 'Flowers and bouquets', answers: [{ question: 'How much is it?', answer: 'From $25.' }, { question: 'Do you deliver?', answer: 'Yes, we deliver to ___.' }, { question: 'How do I pay?', answer: '' }] });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.template, 'sales');
    assert.ok(r.body.name.length > 1);
    const qa = db.all("SELECT question FROM closer_knowledge WHERE closer_id = ? AND kind = 'qa'", r.body.id).map(x => x.question);
    assert.deepEqual(qa, ['How much is it?'], 'blanks (“___”) and empty answers are skipped');
    // Calling it again updates the same helper instead of making a second one.
    const again = await s.client.post('/api/app/setup/helper', { sells: 'Flowers', answers: [{ question: 'How much is it?', answer: 'From $25.' }] });
    assert.equal(again.body.id, r.body.id);
    assert.equal(db.one('SELECT COUNT(*) n FROM closers WHERE workspace_id = ?', s.ws.id).n, 1);
    assert.equal(db.one("SELECT COUNT(*) n FROM closer_knowledge WHERE closer_id = ? AND kind = 'qa'", r.body.id).n, 1);
    const done = await s.client.post('/api/app/setup', { done: true });
    assert.equal(done.body.setup.done, true);
    b = (await s.client.get('/api/app/bootstrap')).body;
    assert.equal(b.setup.done, true);
  });

  test('older workspaces have no setup step', async () => {
    const d = await h.login(h.DEMO.email, h.DEMO.password);
    assert.equal((await d.get('/api/app/bootstrap')).body.setup, null);
  });

  test('login error says how to fix it', async () => {
    const r = await h.client().post('/api/auth/login', { email: h.DEMO.email, password: 'nope-nope' });
    assert.equal(r.status, 401);
    assert.match(r.body.error, /Forgot password/);
  });
});

describe('chat link', () => {
  let s, link;
  test('is free, one per shop, and never uses a website chat slot', async () => {
    s = await h.signup({ business: 'Candle Nook' });
    await s.client.post('/api/app/setup/helper', { sells: 'Candles' });
    const r = await s.client.post('/api/app/channels/link', {});
    assert.equal(r.status, 200, r.text);
    link = r.body;
    assert.equal(link.link, true);
    assert.equal(link.slug, 'candle-nook');
    assert.match(link.link_url, /\/c\/candle-nook$/);
    assert.ok(link.closer_id, 'the AI helper answers it');
    assert.equal(link.widget.show_online, false, 'no "online" dot by default');
    assert.equal((await s.client.post('/api/app/channels/link', {})).body.id, link.id, 'asking again returns the same link');
    const b = (await s.client.get('/api/app/bootstrap')).body;
    assert.equal(b.usage.website.used, 0, 'not counted as a website');
  });

  test('the hosted page and its chat work from Replyvoo’s own address only', async () => {
    const page = await h.client().get('/c/candle-nook');
    assert.equal(page.status, 200);
    assert.match(page.text, /data-page="rvPage"/);
    assert.match(page.text, new RegExp('data-key="' + link.key + '"'));
    assert.match(page.text, /Chat with Candle Nook/);
    assert.equal((await h.client().get('/c/no-such-shop')).status, 404);
    const own = { headers: { origin: ctx.base } };
    const cfg = await h.client().get('/w/' + link.key + '/config', own);
    assert.equal(cfg.status, 200, cfg.text);
    assert.equal(cfg.body.online, true);
    const vid = 'v_' + 'a'.repeat(24);
    const m = await h.client().post('/w/' + link.key + '/messages', { visitor_id: vid, text: 'Do you deliver?' }, { csrf: false, headers: { origin: ctx.base } });
    assert.equal(m.status, 200, m.text);
    assert.ok(m.body.reply && m.body.reply.text, 'the AI answered');
    const evil = await h.client().get('/w/' + link.key + '/config', { headers: { origin: 'https://evil.example' } });
    assert.equal(evil.status, 403);
    const threads = (await s.client.get('/api/app/threads')).body;
    assert.equal(threads[0].channel_link, 1, 'Chats can label it “Chat link”');
  });

  test('the "AI helper is live" email only goes out once it answers somewhere', async () => {
    await h.waitFor(() => h.emails(s.email, 'closer-launched').length, { label: 'launch email' });
    const row = h.emails(s.email, 'closer-launched')[0];
    assert.match(row.subject, /your chat link/);
  });
});

describe('plain problems, plain fixes', () => {
  test('Telegram unreachable is not called a bad code', async () => {
    const s = await h.signup();
    const r = await s.client.post('/api/app/channels/telegram', { token: '123456789:' + 'A'.repeat(35) });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'telegram_unreachable');
    const bad = await s.client.post('/api/app/channels/telegram', { token: 'hello' });
    assert.equal(bad.status, 400);
  });

  test('tapping Pay twice reuses the open checkout', async () => {
    const s = await h.signup();
    const a = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'demo' });
    const b = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'demo' });
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.equal(b.body.ref, a.body.ref);
    assert.equal(db.one("SELECT COUNT(*) n FROM orders WHERE workspace_id = ? AND status = 'pending'", s.ws.id).n, 1);
  });

  test('taking over a chat that needed you clears "Needs you"', async () => {
    const s = await h.signup();
    const t = h.makeThread(s.ws.id);
    db.update('threads', t.threadId, { status: 'handoff' });
    const r = await s.client.put('/api/app/threads/' + t.threadId, { ai_on: false });
    assert.equal(r.status, 200);
    assert.equal(t.thread().status, 'open');
    assert.equal(t.thread().ai_on, 0);
  });

  test('demo replies that hand over cite no knowledge', async () => {
    const s = await h.signup();
    const c = (await s.client.post('/api/app/setup/helper', { sells: 'Shoes', answers: [{ question: 'How much is it?', answer: 'From $40.' }] })).body;
    const r = await s.client.post('/api/app/closers/preview', { closer_id: c.id, name: c.name, template: 'sales', message: 'Can you engrave a name on it?' });
    assert.equal(r.status, 200);
    if (r.body.handoff) assert.deepEqual(r.body.sources, []);
    assert.ok(!/AI key/.test(r.body.text), 'no "add an AI key" note in replies');
  });
});

describe('WhatsApp emails', () => {
  const notify = () => require('../src/services/notify');
  test('connected, template approved / rejected and payment problem emails go to the owner', async () => {
    const s = await h.signup();
    notify().whatsappConnected(s.ws.id, null, '+44 7700 900123', 'Ivy');
    await h.waitFor(() => h.emails(s.email, 'whatsapp-connected').length, { label: 'connected email' });
    notify().whatsappTemplate(s.ws.id, { id: 7, name: 'order_update' }, 'APPROVED', '');
    notify().whatsappTemplate(s.ws.id, { id: 8, name: 'promo' }, 'REJECTED', 'INVALID_FORMAT');
    notify().whatsappTemplate(s.ws.id, { id: 9, name: 'x' }, 'PENDING', '');
    await h.waitFor(() => h.emails(s.email, 'whatsapp-template').length === 2, { label: 'template emails' });
    const subj = h.emails(s.email, 'whatsapp-template').map(e => e.subject);
    assert.ok(subj.some(x => /is approved/.test(x)) && subj.some(x => /was not approved/.test(x)), subj.join(' | '));
    notify().whatsappPayment(s.ws.id, { id: 1 }, '+44 7700 900123');
    notify().whatsappPayment(s.ws.id, { id: 1 }, '+44 7700 900123');
    await h.waitFor(() => h.emails(s.email, 'whatsapp-payment').length, { label: 'payment email' });
    await h.sleep(50);
    assert.equal(h.emails(s.email, 'whatsapp-payment').length, 1, 'at most once a day');
    const mailer = require('../src/services/mailer');
    const built = mailer.build('whatsapp-template', { ...mailer.SAMPLE, approved: false, reason: 'Invalid format.' });
    assert.match(built.html, /not approved/);
    assert.match(built.html, /Invalid format\./);
    assert.match(built.html, /#FFC21A/, 'one yellow button');
  });

  test('the privacy policy lists Meta as a sub-processor', async () => {
    const r = await h.client().get('/legal/privacy');
    assert.equal(r.status, 200);
    assert.match(r.text, /Meta Platforms/);
  });
});
