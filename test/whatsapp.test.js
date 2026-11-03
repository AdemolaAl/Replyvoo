'use strict';
// WhatsApp (Meta Cloud API) end to end, against a fake Graph API on 127.0.0.1: coming-soon mode, admin keys, webhook
// verification and signatures, Embedded Signup, every inbound type, de-duplication, the AI reply path, delivery
// statuses, the 24-hour window and templates, template sync and the builder, Blasts with STOP opt-outs, Meta's rates.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const h = require('./helpers');

const APP_ID = '1111111111';
const APP_SECRET = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6';
const VERIFY = 'verify-token-123456';
const CONFIG_ID = '2222222222';
const WABA = '300000000001';
const PHONE = '100000000001';
const PHONE2 = '100000000002';
const BIZ_TOKEN = 'EAAGbiz' + 'Q'.repeat(80);
const MANUAL_TOKEN = 'EAAGman' + 'R'.repeat(80);

let env, db, wa, config, settings, admin, owner, wsId, fake, calls = [], outSeq = 0;
const logs = [];

// ---------------- the fake Graph API ----------------
const TEMPLATES = [
  { id: 'tpl1', name: 'back_in_stock', language: 'en', category: 'MARKETING', status: 'APPROVED', components: [{ type: 'HEADER', format: 'TEXT', text: 'Good news' }, { type: 'BODY', text: 'Hi {{1}}, your {{2}} is back in stock.' }, { type: 'FOOTER', text: 'Reply STOP to stop these messages' }, { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Stop promotions' }] }] },
  { id: 'tpl2', name: 'order_update', language: 'en', category: 'UTILITY', status: 'PENDING', components: [{ type: 'BODY', text: 'Your order {{1}} is on its way.' }] },
  { id: 'tpl3', name: 'photo_offer', language: 'en', category: 'MARKETING', status: 'APPROVED', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'New arrivals this week.' }] },
  { id: 'tpl4', name: 'checking_in', language: 'en', category: 'UTILITY', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hi {{1}}, are you still interested in your order?' }] }
];
function startFake() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const u = new URL(req.url, 'http://x');
        const raw = Buffer.concat(chunks);
        let body = null;
        if ((req.headers['content-type'] || '').includes('json')) { try { body = JSON.parse(raw.toString()); } catch { body = null; } }
        const call = { method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), auth: req.headers.authorization || '', body, raw: raw.toString('latin1') };
        calls.push(call);
        const send = (o, status = 200, type = 'application/json') => { res.writeHead(status, { 'content-type': type }); res.end(type === 'application/json' ? JSON.stringify(o) : o); };
        const err = (code, message, status = 400) => send({ error: { message, code, type: 'OAuthException' } }, status);
        const p = u.pathname.replace(/^\/v\d+\.\d/, '');
        if (u.pathname === '/transcribe') return send({ text: 'I want two bottles please' });
        if (u.pathname.startsWith('/files/')) return call.auth === 'Bearer ' + BIZ_TOKEN || call.auth === 'Bearer ' + MANUAL_TOKEN ? send(Buffer.from('FAKEBYTES' + p), 200, p.includes('UPLOADED') ? 'application/pdf' : 'image/jpeg') : send('no', 401, 'text/plain');
        if (p === '/oauth/access_token') return call.query.code === 'good-code' && call.query.client_secret === APP_SECRET && call.query.client_id === APP_ID ? send({ access_token: BIZ_TOKEN, token_type: 'bearer' }) : err(100, 'Invalid verification code format.');
        if (p === '/debug_token') return send({ data: { granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: [WABA] }, { scope: 'whatsapp_business_messaging', target_ids: [WABA] }] } });
        if (p === '/' + APP_ID) return call.query.access_token === APP_ID + '|' + APP_SECRET ? send({ id: APP_ID, name: 'Replyvoo' }) : err(190, 'Invalid OAuth access token');
        if (p === '/' + WABA + '/phone_numbers') return send({ data: [{ id: PHONE, display_phone_number: '+1 555-0100', verified_name: 'Glow Labs' }, { id: PHONE2, display_phone_number: '+1 555-0101', verified_name: 'Glow Labs Two' }] });
        if (p === '/' + WABA + '/subscribed_apps') return send({ success: true });
        if (p === '/' + WABA + '/message_templates') {
          if (req.method === 'GET') return send({ data: TEMPLATES, paging: { cursors: { before: 'a', after: 'b' } } });
          if (req.method === 'POST') return send({ id: 'tplnew' + (++outSeq), status: 'PENDING', category: body.category });
          return send({ success: true });
        }
        if (p === '/' + PHONE || p === '/' + PHONE2) {
          if (call.auth !== 'Bearer ' + BIZ_TOKEN && call.auth !== 'Bearer ' + MANUAL_TOKEN) return err(190, 'Invalid OAuth access token', 401);
          return send({ id: p.slice(1), display_phone_number: p === '/' + PHONE ? '+1 555-0100' : '+1 555-0101', verified_name: 'Glow Labs', quality_rating: 'GREEN', name_status: 'APPROVED' });
        }
        if (p === '/' + PHONE + '/register' || p === '/' + PHONE2 + '/register') return send({ success: true });
        if (p === '/' + PHONE + '/media' || p === '/' + PHONE2 + '/media') return send({ id: 'UPLOADED' + (++outSeq) });
        if (p === '/' + PHONE + '/messages' || p === '/' + PHONE2 + '/messages') {
          if (body && body.status === 'read') return send({ success: true });
          if (body && body.to === '19990000000') return err(131026, 'Message undeliverable');
          if (body && body.to === '19990000001') return err(131050, 'User opted out of marketing messages');
          return send({ messaging_product: 'whatsapp', contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: 'wamid.OUT' + (++outSeq) }] });
        }
        if (/^\/MEDIA\w+$/.test(p) || /^\/UPLOADED\d+$/.test(p)) return send({ url: fake + '/files' + p, mime_type: p.includes('VOICE') ? 'audio/ogg' : p.includes('UPLOADED') ? 'application/pdf' : 'image/jpeg', file_size: 20 });
        return err(803, 'Unknown path ' + p, 404);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
let fakeSrv;

const sentMessages = () => calls.filter(c => /\/messages$/.test(c.path) && c.method === 'POST' && c.body && !c.body.status);
const sign = raw => 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex');
function hook(payload, sig) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return h.client().post('/webhooks/whatsapp', raw, { raw: true, headers: { 'content-type': 'application/json', ...(sig === null ? {} : { 'x-hub-signature-256': sig || sign(raw) }) } });
}
let wamidSeq = 0;
const nextId = () => 'wamid.IN' + (++wamidSeq) + crypto.randomBytes(3).toString('hex');
function inbound(msg, { phone = PHONE, from = '15550001111', name = 'Sam Carter' } = {}) {
  return { object: 'whatsapp_business_account', entry: [{ id: WABA, changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '15550100', phone_number_id: phone }, contacts: [{ profile: { name }, wa_id: from }], messages: [{ from, id: msg.id || nextId(), timestamp: String(Math.floor(Date.now() / 1000)), ...msg }] } }] }] };
}
function statusUpdate(id, status, extra = {}) {
  return { object: 'whatsapp_business_account', entry: [{ id: WABA, changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: PHONE }, statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '15550001111', ...extra }] } }] }] };
}
const channel = (phone = PHONE) => db.one("SELECT * FROM channels WHERE type = 'whatsapp' AND external_id = ?", phone);
const contactOf = from => db.one('SELECT * FROM contacts WHERE channel_id = ? AND external_id = ?', channel().id, from);
const threadOf = from => db.one('SELECT * FROM threads WHERE channel_id = ? AND chat_id = ?', channel().id, from);
const msgs = from => { const t = threadOf(from); return t ? db.all('SELECT * FROM messages WHERE thread_id = ? ORDER BY id', t.id).map(m => ({ ...m, meta: JSON.parse(m.meta) })) : []; };
const lastIn = from => msgs(from).filter(m => m.dir === 'in').pop();

before(async () => {
  env = await h.boot();
  db = env.db;
  wa = require('../src/services/whatsapp');
  config = require('../src/config');
  settings = require('../src/services/settings');
  fakeSrv = await startFake();
  fake = 'http://127.0.0.1:' + fakeSrv.address().port;
  config.whatsapp.graphBase = fake;
  admin = await h.login(h.ADMIN.email, h.ADMIN.password);
  owner = await h.login(h.DEMO.email, h.DEMO.password);
  wsId = db.one('SELECT id FROM workspaces WHERE name = ?', 'Glow Labs').id;
  // Every log line is kept so the tests can prove no token or secret is ever logged.
  for (const k of ['log', 'warn', 'error']) { const orig = console[k]; console[k] = (...a) => { logs.push(a.map(String).join(' ')); return orig(...a); }; }
});
after(async () => { await new Promise(r => fakeSrv.close(r)); await env.close(); });

describe('off / coming soon', () => {
  test('without keys WhatsApp is “coming soon” everywhere and cannot be connected', async () => {
    assert.equal(settings.channel('whatsapp'), 'soon');
    const site = await h.client().get('/api/public/site');
    assert.equal(site.body.channels.find(c => c.id === 'whatsapp').status, 'soon');
    const boot = await owner.get('/api/app/bootstrap');
    assert.equal(boot.body.flags.channels.whatsapp, 'soon');
    assert.equal(boot.body.whatsapp.on, false);
    assert.equal(boot.body.whatsapp.app_id, '', 'no app id leaks while off');
    let r = await owner.post('/api/app/channels/whatsapp/signup', { code: 'good-code' });
    assert.equal(r.status, 403); assert.equal(r.body.code, 'coming_soon');
    r = await owner.post('/api/app/channels/whatsapp/manual', { phone_number_id: PHONE, token: MANUAL_TOKEN });
    assert.equal(r.status, 403);
    assert.equal((await h.client().get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1')).status, 404);
    const pricing = await h.client().get('/pricing');
    assert.match(pricing.text, /WhatsApp channel/);
    assert.equal(boot.body.addons.find(a => a.slug === 'whatsapp-channel').status, 'soon');
    assert.equal(calls.length, 0, 'nothing was sent to Meta');
  });

  test('switching on needs the keys first; secrets are stored encrypted and never returned', async () => {
    let r = await admin.put('/api/admin/connections/whatsapp', { enabled: true });
    assert.equal(r.status, 400);
    assert.equal(settings.channel('whatsapp'), 'soon');
    r = await admin.put('/api/admin/connections/whatsapp', { app_id: 'abc', app_secret: APP_SECRET });
    assert.equal(r.status, 400, 'app id must be a number');
    r = await admin.put('/api/admin/connections/whatsapp', { app_id: APP_ID, app_secret: APP_SECRET, verify_token: VERIFY, config_id: CONFIG_ID, enabled: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.whatsapp.on, true);
    assert.equal(r.body.whatsapp.app_secret_hint, '…' + APP_SECRET.slice(-4));
    assert.ok(!JSON.stringify(r.body).includes(APP_SECRET), 'the app secret never comes back');
    const row = db.one("SELECT value FROM settings WHERE key = 'whatsapp_keys'").value;
    assert.ok(!row.includes(APP_SECRET) && !row.includes(VERIFY), 'stored encrypted');
    assert.match(JSON.parse(row).app_secret_enc, /^v1:/);
    const audit = db.one('SELECT data FROM audit ORDER BY id DESC LIMIT 1').data;
    assert.ok(!audit.includes(APP_SECRET));
    const t = await admin.post('/api/admin/connections/whatsapp/test');
    assert.equal(t.body.ok, true, t.body.message);
    assert.match(t.body.message, /Replyvoo/);
  });

  test('once on: Live in the catalog, the channel page data and pricing', async () => {
    assert.equal(settings.channel('whatsapp'), 'live');
    const site = await h.client().get('/api/public/site');
    assert.equal(site.body.channels.find(c => c.id === 'whatsapp').status, 'live');
    assert.equal(site.body.addons.find(a => a.slug === 'whatsapp-channel').status, 'live');
    const boot = await owner.get('/api/app/bootstrap');
    assert.equal(boot.body.flags.channels.whatsapp, 'live');
    assert.deepEqual({ on: boot.body.whatsapp.on, signup: boot.body.whatsapp.signup, app_id: boot.body.whatsapp.app_id, config_id: boot.body.whatsapp.config_id }, { on: true, signup: true, app_id: APP_ID, config_id: CONFIG_ID });
    const page = await h.client().get('/whatsapp-ai-chatbot');
    assert.equal(page.status, 200);
    assert.ok(!page.text.includes('data-wl-item="whatsapp"'), 'no waitlist once live');
    // The admin editor keeps the raw flag (not the computed one).
    const raw = await admin.get('/api/admin/settings');
    assert.equal(raw.body.flags.channels.whatsapp, 'soon');
  });
});

describe('webhook security', () => {
  test('verification challenge: echoed with the right token, 403 otherwise', async () => {
    let r = await h.client().get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=' + VERIFY + '&hub.challenge=987654321');
    assert.equal(r.status, 200);
    assert.equal(r.text, '987654321');
    assert.match(r.headers.get('content-type'), /text\/plain/);
    r = await h.client().get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token-0000&hub.challenge=1');
    assert.equal(r.status, 403);
    r = await h.client().get('/webhooks/whatsapp?hub.mode=unsubscribe&hub.verify_token=' + VERIFY + '&hub.challenge=1');
    assert.equal(r.status, 403);
  });
  test('X-Hub-Signature-256: missing or wrong is 401; right is 200 (checked on the raw body)', async () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    assert.equal((await hook(body, null)).status, 401);
    assert.equal((await hook(body, 'sha256=' + 'f'.repeat(64))).status, 401);
    assert.equal((await hook(body, 'sha256=' + crypto.createHmac('sha256', 'another-secret').update(body).digest('hex'))).status, 401);
    // Same JSON, different bytes: the signature is over the exact raw body.
    assert.equal((await hook(body.replace('[]', '[ ]'), sign(body))).status, 401);
    const ok = await hook(body);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { ok: true });
  });
});

describe('connecting a number', () => {
  test('Embedded Signup: code exchange, webhook subscription, registration, templates synced', async () => {
    let r = await owner.post('/api/app/channels/whatsapp/signup', { code: 'expired-code', waba_id: WABA, phone_number_id: PHONE });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /30 seconds/);
    calls = [];
    r = await owner.post('/api/app/channels/whatsapp/signup', { code: 'good-code', waba_id: WABA, phone_number_id: PHONE });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.type, 'whatsapp');
    assert.equal(r.body.display_phone, '+1 555-0100');
    assert.equal(r.body.waba_id, WABA);
    assert.ok(!JSON.stringify(r.body).includes(BIZ_TOKEN), 'the token never goes to the browser');
    const ex = calls.find(c => c.path.endsWith('/oauth/access_token'));
    assert.deepEqual([ex.query.client_id, ex.query.code], [APP_ID, 'good-code']);
    const sub = calls.find(c => c.path.endsWith('/' + WABA + '/subscribed_apps') && c.method === 'POST');
    assert.equal(sub.auth, 'Bearer ' + BIZ_TOKEN);
    const reg = calls.find(c => c.path.endsWith('/' + PHONE + '/register'));
    assert.equal(reg.body.messaging_product, 'whatsapp');
    assert.match(reg.body.pin, /^\d{6}$/);
    assert.ok(calls.some(c => c.path.endsWith('/message_templates') && c.method === 'GET'), 'templates synced on connect');
    const ch = channel();
    assert.equal(ch.workspace_id, wsId);
    assert.ok(ch.closer_id, 'a Closer answers it');
    assert.match(ch.token_enc, /^v1:/);
    assert.ok(!ch.token_enc.includes(BIZ_TOKEN) && !ch.data.includes(reg.body.pin), 'token and PIN are encrypted at rest');
    assert.equal(require('../src/lib/security').decrypt(ch.token_enc), BIZ_TOKEN);
  });

  test('Embedded Signup without the popup ids finds the account from the token', async () => {
    calls = [];
    const r = await owner.post('/api/app/channels/whatsapp/signup', { code: 'good-code', phone_number_id: PHONE2 });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.waba_id, WABA);
    assert.ok(calls.some(c => c.path.endsWith('/debug_token') && c.query.access_token === APP_ID + '|' + APP_SECRET));
    assert.equal((await owner.del('/api/app/channels/' + r.body.id)).status, 200);
  });

  test('Advanced: manual phone number id + permanent token, and another workspace cannot take the number', async () => {
    let r = await owner.post('/api/app/channels/whatsapp/manual', { phone_number_id: PHONE2, waba_id: WABA, token: 'short' });
    assert.equal(r.status, 400);
    r = await owner.post('/api/app/channels/whatsapp/manual', { phone_number_id: PHONE2, waba_id: WABA, token: 'EAAGwrong' + 'Z'.repeat(60) });
    assert.equal(r.status, 400, 'Meta refuses an unknown token');
    r = await owner.post('/api/app/channels/whatsapp/manual', { phone_number_id: PHONE2, waba_id: WABA, token: MANUAL_TOKEN });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.via, 'manual');
    const other = await h.signup({});
    const r2 = await other.client.post('/api/app/channels/whatsapp/manual', { phone_number_id: PHONE2, waba_id: WABA, token: MANUAL_TOKEN });
    assert.equal(r2.status, 409);
    calls = [];
    assert.equal((await owner.del('/api/app/channels/' + r.body.id)).status, 200);
    assert.ok(!calls.some(c => c.method === 'DELETE' && c.path.endsWith('/subscribed_apps')), 'the account stays subscribed while another number uses it');
  });

  test('tokens and secrets never appear in logs', () => {
    const all = logs.join('\n');
    for (const s of [BIZ_TOKEN, MANUAL_TOKEN, APP_SECRET, VERIFY]) assert.ok(!all.includes(s), 'leaked in logs');
  });
});

describe('inbound messages', () => {
  const FROM = '15550002222';
  const send = async (msg, from = FROM) => { const p = inbound(msg, { from }); assert.equal((await hook(p)).status, 200); return p.entry[0].changes[0].value.messages[0].id; };
  const waitIn = (id, from = FROM) => h.waitFor(() => msgs(from).find(m => m.dir === 'in' && m.meta.message_id === id), { label: 'inbound ' + id });

  before(() => {
    // Replies off for this customer: these tests look at what is stored, not at the AI (that's the next suite).
    config.ai.transcribeKey = 'test-key'; config.ai.transcribeUrl = fake + '/transcribe';
  });

  test('text creates the contact (with phone) and thread', async () => {
    const id = await send({ type: 'text', text: { body: 'Hello there' } });
    const m = await waitIn(id);
    assert.equal(m.kind, 'text'); assert.equal(m.text, 'Hello there');
    const c = contactOf(FROM);
    assert.equal(c.name, 'Sam Carter'); assert.equal(c.phone, '+' + FROM);
    db.update('threads', threadOf(FROM).id, { ai_on: 0 });
  });
  test('image: stored with its media id, downloaded for Vision', async () => {
    calls = [];
    const id = await send({ type: 'image', image: { id: 'MEDIAIMG1', mime_type: 'image/jpeg', caption: 'Is this one available?' } });
    const m = await waitIn(id);
    assert.equal(m.kind, 'image'); assert.equal(m.text, 'Is this one available?'); assert.equal(m.meta.media_id, 'MEDIAIMG1');
    assert.ok(calls.some(c => c.path === '/files/MEDIAIMG1' && c.auth === 'Bearer ' + BIZ_TOKEN), 'downloaded with the business token');
  });
  test('voice note: downloaded and transcribed like on Telegram', async () => {
    calls = [];
    const id = await send({ type: 'audio', audio: { id: 'MEDIAVOICE1', mime_type: 'audio/ogg; codecs=opus', voice: true } });
    const m = await waitIn(id);
    assert.equal(m.kind, 'voice'); assert.equal(m.text, 'I want two bottles please'); assert.equal(m.meta.transcribed, true);
    assert.ok(calls.some(c => c.path === '/transcribe'));
  });
  test('video, document, location, contacts and sticker', async () => {
    let m = await waitIn(await send({ type: 'video', video: { id: 'MEDIAVID1', mime_type: 'video/mp4', caption: 'See this' } }));
    assert.equal(m.kind, 'video'); assert.equal(m.text, '[Video] See this');
    m = await waitIn(await send({ type: 'document', document: { id: 'MEDIADOC1', mime_type: 'application/pdf', filename: 'invoice.pdf' } }));
    assert.equal(m.kind, 'document'); assert.equal(m.meta.filename, 'invoice.pdf'); assert.equal(m.text, '[Document: invoice.pdf]');
    m = await waitIn(await send({ type: 'location', location: { latitude: 51.5072, longitude: -0.1276, name: 'Shop', address: 'High Street 1' } }));
    assert.equal(m.kind, 'location'); assert.equal(m.meta.lat, 51.5072); assert.match(m.text, /High Street 1/);
    m = await waitIn(await send({ type: 'contacts', contacts: [{ name: { formatted_name: 'Alex Morgan' }, phones: [{ phone: '+1 555 0199' }] }] }));
    assert.equal(m.kind, 'contacts'); assert.match(m.text, /Alex Morgan \+1 555 0199/);
    m = await waitIn(await send({ type: 'sticker', sticker: { id: 'MEDIASTK1', mime_type: 'image/webp' } }));
    assert.equal(m.kind, 'sticker');
  });
  test('interactive button and list replies, template quick replies', async () => {
    let m = await waitIn(await send({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'opt_2', title: 'Medium' } } }));
    assert.equal(m.text, 'Medium'); assert.equal(m.meta.reply_id, 'opt_2'); assert.equal(m.meta.tapped, true);
    m = await waitIn(await send({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'opt_5', title: 'Express delivery', description: 'Next day' } } }));
    assert.equal(m.text, 'Express delivery (Next day)');
    m = await waitIn(await send({ type: 'button', button: { text: 'Tell me more', payload: 'more' } }));
    assert.equal(m.text, 'Tell me more'); assert.equal(m.meta.payload, 'more');
  });
  test('reactions are stored and never answered', async () => {
    db.update('threads', threadOf(FROM).id, { ai_on: 1 });
    calls = [];
    const m = await waitIn(await send({ type: 'reaction', reaction: { message_id: 'wamid.X', emoji: '👍' } }));
    assert.equal(m.kind, 'reaction'); assert.equal(m.text, 'Reacted 👍');
    await h.sleep(80);
    assert.equal(sentMessages().length, 0, 'no reply to a reaction');
    db.update('threads', threadOf(FROM).id, { ai_on: 0 });
  });
  test('the same message id twice is handled once (Meta retries)', async () => {
    const p = inbound({ type: 'text', text: { body: 'Only once please' } }, { from: FROM });
    await hook(p); await hook(p); await hook(p);
    await h.waitFor(() => msgs(FROM).some(m => m.text === 'Only once please'));
    await h.sleep(60);
    assert.equal(msgs(FROM).filter(m => m.text === 'Only once please').length, 1);
  });
  test('a webhook for an unknown phone number id is ignored', async () => {
    const before = db.one('SELECT COUNT(*) n FROM messages').n;
    await hook(inbound({ type: 'text', text: { body: 'hi' } }, { phone: '199999999999' }));
    await h.sleep(60);
    assert.equal(db.one('SELECT COUNT(*) n FROM messages').n, before);
  });
});

describe('AI replies, statuses and the 24-hour window', () => {
  const FROM = '15550003333';
  let replyWamid;
  test('a customer question gets an AI reply on WhatsApp, marked read, billed as one conversation', async () => {
    const before = db.one('SELECT conv_used, credits FROM workspaces WHERE id = ?', wsId);
    calls = [];
    const p = inbound({ type: 'text', text: { body: 'How much is the vitamin C serum?' } }, { from: FROM, name: 'Jordan Blake' });
    const inId = p.entry[0].changes[0].value.messages[0].id;
    await hook(p);
    const out = await h.waitFor(() => msgs(FROM).find(m => m.dir === 'out' && m.author === 'ai'), { label: 'AI reply' });
    const sent = sentMessages().find(c => c.body.to === FROM);
    assert.ok(sent, 'sent through the Cloud API');
    assert.equal(sent.auth, 'Bearer ' + BIZ_TOKEN);
    assert.equal(sent.body.messaging_product, 'whatsapp');
    const words = sent.body.type === 'text' ? sent.body.text.body : sent.body.interactive.body.text;
    assert.ok(words.length > 5);
    assert.ok(out.meta.message_id, 'the WhatsApp message id is kept');
    replyWamid = out.meta.message_id;
    const read = calls.find(c => c.body && c.body.status === 'read' && c.body.message_id === inId);
    assert.ok(read, 'the customer’s message was marked as read');
    assert.deepEqual(read.body.typing_indicator, { type: 'text' });
    const after = db.one('SELECT conv_used, credits FROM workspaces WHERE id = ?', wsId);
    assert.equal(after.conv_used, before.conv_used + 1, 'counts as one normal Replyvoo conversation');
    assert.equal(after.credits, before.credits);
    // HeatScore works on WhatsApp chats too.
    assert.equal(contactOf(FROM).heat, 'warm');
    assert.ok(db.one('SELECT wamid FROM wa_messages WHERE wamid = ? AND message_id = ?', replyWamid, out.id));
  });
  test('status updates: sent → delivered → read, never backwards; failed shows the reason', async () => {
    await hook(statusUpdate(replyWamid, 'delivered'));
    await h.waitFor(() => msgs(FROM).find(m => m.meta.message_id === replyWamid && m.meta.wa_status === 'delivered'));
    await hook(statusUpdate(replyWamid, 'read', { pricing: { billable: false, category: 'service', pricing_model: 'PMP' } }));
    await h.waitFor(() => msgs(FROM).find(m => m.meta.message_id === replyWamid && m.meta.wa_status === 'read'));
    await hook(statusUpdate(replyWamid, 'delivered'));
    await h.sleep(60);
    const m = msgs(FROM).find(x => x.meta.message_id === replyWamid);
    assert.equal(m.meta.wa_status, 'read', 'a late "delivered" does not undo "read"');
    assert.equal(m.meta.wa_category, 'service');
    // A failed one.
    const t = threadOf(FROM);
    const mid = require('../src/services/engine').addMessage(t, 'out', 'human', 'Are you there?', 'text', { message_id: 'wamid.FAILME' });
    wa.track('wamid.FAILME', channel().id, mid);
    await hook(statusUpdate('wamid.FAILME', 'failed', { errors: [{ code: 131047, title: 'Re-engagement message' }] }));
    const f = await h.waitFor(() => msgs(FROM).find(x => x.id === mid && x.meta.failed));
    assert.equal(f.meta.wa_status, 'failed');
    assert.match(f.meta.error, /24 hours/);
  });
  test('Pulse Inbox: takeover, human reply inside the window, then template-only after 24 hours', async () => {
    const t = threadOf(FROM);
    let r = await owner.get('/api/app/threads/' + t.id);
    assert.equal(r.body.whatsapp.window.open, true);
    assert.match(r.body.whatsapp.window.label, /^Free reply window: \d+h left$/);
    calls = [];
    r = await owner.post('/api/app/threads/' + t.id + '/messages', { text: 'Hi, it’s Robin from the team.' });
    assert.equal(r.status, 200, r.text);
    assert.equal(sentMessages()[0].body.text.body, 'Hi, it’s Robin from the team.');
    assert.equal(db.one('SELECT ai_on FROM threads WHERE id = ?', t.id).ai_on, 0, 'human takeover');
    // 25 hours later…
    db.update('threads', t.id, { last_customer_at: new Date(Date.now() - 25 * 3600e3).toISOString() });
    calls = [];
    r = await owner.post('/api/app/threads/' + t.id + '/messages', { text: 'Still interested?' });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'window_closed');
    assert.equal(sentMessages().length, 0, 'nothing free-form outside the window');
    r = await owner.post('/api/app/threads/' + t.id + '/media', { data_url: 'data:image/png;base64,' + Buffer.from('png').toString('base64'), filename: 'a.png' });
    assert.equal(r.status, 409);
    // The engine refuses too (AI or Nudge outside the window): stored as not delivered, no call to Meta.
    const engine = require('../src/services/engine');
    const res = await engine.send(channel(), BIZ_TOKEN, db.one('SELECT * FROM threads WHERE id = ?', t.id), 'Free-form after 24h', '', null);
    assert.equal(res.ok, false); assert.match(res.error, /24-hour/);
    assert.equal(sentMessages().length, 0);
    r = await owner.get('/api/app/threads/' + t.id);
    assert.equal(r.body.whatsapp.window.open, false);
    assert.equal(r.body.whatsapp.window.label, 'Free reply window closed');
    assert.deepEqual(r.body.whatsapp.templates.map(x => x.name).sort(), ['back_in_stock', 'checking_in'], 'only approved, sendable templates');
    const tpl = r.body.whatsapp.templates.find(x => x.name === 'back_in_stock');
    r = await owner.post('/api/app/threads/' + t.id + '/template', { template_id: tpl.id, vars: ['{first_name}', 'serum'] });
    assert.equal(r.status, 200, r.text);
    const s = sentMessages()[0].body;
    assert.equal(s.type, 'template');
    assert.deepEqual(s.template.language, { code: 'en' });
    assert.equal(s.template.name, 'back_in_stock');
    assert.deepEqual(s.template.components, [{ type: 'body', parameters: [{ type: 'text', text: 'Jordan' }, { type: 'text', text: 'serum' }] }]);
    const stored = msgs(FROM).pop();
    assert.equal(stored.kind, 'template'); assert.match(stored.text, /back in stock/);
  });
  test('when the customer writes again the window re-opens and AI replies are free-form again', async () => {
    const t = threadOf(FROM);
    db.update('threads', t.id, { ai_on: 1, status: 'open' });
    calls = [];
    await hook(inbound({ type: 'text', text: { body: 'Yes, still want it' } }, { from: FROM }));
    await h.waitFor(() => sentMessages().some(c => c.body.to === FROM && c.body.type !== 'template'), { label: 'free-form reply' });
    assert.equal((await owner.get('/api/app/threads/' + t.id)).body.whatsapp.window.open, true);
  });
  test('PayLink becomes a “Pay now” button; suggested options become reply buttons or a list', async () => {
    const engine = require('../src/services/engine');
    const t = db.one('SELECT * FROM threads WHERE id = ?', threadOf(FROM).id);
    calls = [];
    let r = await engine.send(channel(), BIZ_TOKEN, t, 'Great choice! You can pay here: https://pay.example.com/glowlabs', '', { id: 1 }, { payLink: 'https://pay.example.com/glowlabs' });
    assert.equal(r.ok, true);
    let b = sentMessages()[0].body;
    assert.equal(b.type, 'interactive'); assert.equal(b.interactive.type, 'cta_url');
    assert.equal(b.interactive.action.parameters.url, 'https://pay.example.com/glowlabs');
    assert.ok(!b.interactive.body.text.includes('https://'), 'the link moved into the button');
    calls = [];
    await engine.send(channel(), BIZ_TOKEN, t, 'Which size would you like?', '', { id: 1 }, { options: ['Small', 'Medium', 'Large'] });
    b = sentMessages()[0].body;
    assert.equal(b.interactive.type, 'button');
    assert.deepEqual(b.interactive.action.buttons.map(x => x.reply.title), ['Small', 'Medium', 'Large']);
    calls = [];
    await engine.send(channel(), BIZ_TOKEN, t, 'Pick a colour', '', { id: 1 }, { options: ['Red', 'Blue', 'Green', 'Black', 'White'] });
    b = sentMessages()[0].body;
    assert.equal(b.interactive.type, 'list');
    assert.equal(b.interactive.action.sections[0].rows.length, 5);
    const ai = require('../src/services/ai');
    const st = ai.strip('Which one?\n[OPTIONS: Small | Medium | Large]');
    assert.deepEqual(st.options, ['Small', 'Medium', 'Large']);
    assert.equal(st.text, 'Which one?');
    assert.match(ai.systemPrompt({ name: 'Ace', template: 'sales', persona: {}, skills: {} }, 'Shop', 'whatsapp'), /on WhatsApp[\s\S]*\[OPTIONS:/);
  });
  test('a human can send a photo or file: uploaded through /media, then sent', async () => {
    const t = threadOf(FROM);
    calls = [];
    const r = await owner.post('/api/app/threads/' + t.id + '/media', { data_url: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 test').toString('base64'), filename: 'price-list.pdf', caption: 'Our prices' });
    assert.equal(r.status, 200, r.text);
    const up = calls.find(c => c.path.endsWith('/' + PHONE + '/media'));
    assert.ok(up && up.raw.includes('price-list.pdf') && up.raw.includes('whatsapp'), 'multipart upload to /media');
    const b = sentMessages()[0].body;
    assert.equal(b.type, 'document'); assert.equal(b.document.filename, 'price-list.pdf'); assert.equal(b.document.caption, 'Our prices'); assert.match(b.document.id, /^UPLOADED/);
    const m = msgs(FROM).pop();
    assert.equal(m.kind, 'document');
    const file = await owner.get('/api/app/threads/' + t.id + '/media/' + m.id);
    assert.equal(file.status, 200);
    assert.match(file.headers.get('content-disposition'), /attachment/);
    const bad = await owner.post('/api/app/threads/' + t.id + '/media', { data_url: 'data:application/x-msdownload;base64,AAAA', filename: 'x.exe' });
    assert.equal(bad.status, 400);
  });
});

describe('templates', () => {
  let chId;
  before(() => { chId = channel().id; });
  test('sync lists approved, pending and not-sendable templates', async () => {
    const r = await owner.post('/api/app/channels/' + chId + '/templates/sync');
    assert.equal(r.status, 200);
    const by = Object.fromEntries(r.body.templates.map(t => [t.name, t]));
    assert.equal(by.back_in_stock.status, 'APPROVED'); assert.equal(by.back_in_stock.sendable, true);
    assert.equal(by.back_in_stock.header_vars, 0); assert.equal(by.back_in_stock.body_vars, 2);
    assert.equal(by.order_update.status, 'PENDING'); assert.equal(by.order_update.sendable, false);
    assert.equal(by.photo_offer.sendable, false, 'image header: Replyvoo can’t fill it');
  });
  test('builder: validates and submits to Meta for approval; status webhook updates it', async () => {
    let r = await owner.post('/api/app/channels/' + chId + '/templates', { name: 'New Arrivals!', category: 'MARKETING', language: 'en', body: 'Hi {{1}}, new arrivals are in.' });
    assert.equal(r.status, 400, 'an example is required for {{1}}');
    r = await owner.post('/api/app/channels/' + chId + '/templates', { name: 'x', category: 'AUTHENTICATION', body: 'code' });
    assert.equal(r.status, 400);
    r = await owner.post('/api/app/channels/' + chId + '/templates', { name: 'x', body: '{{1}} hello', examples: ['Sam'] });
    assert.equal(r.status, 400, 'no variable at the very start');
    calls = [];
    r = await owner.post('/api/app/channels/' + chId + '/templates', { name: 'New Arrivals!', category: 'MARKETING', language: 'en', header: 'Fresh stock', body: 'Hi {{1}}, new arrivals are in. Reply to reserve yours.', footer: 'Reply STOP to stop these messages', examples: ['Sam'], quick_replies: ['Reserve one', 'Stop promotions'], url_text: 'Shop now', url: 'https://shop.example.com' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.template.name, 'new_arrivals');
    assert.equal(r.body.template.status, 'PENDING');
    const sent = calls.find(c => c.method === 'POST' && c.path.endsWith('/' + WABA + '/message_templates')).body;
    assert.equal(sent.category, 'MARKETING');
    assert.deepEqual(sent.components.map(c => c.type), ['HEADER', 'BODY', 'FOOTER', 'BUTTONS']);
    assert.deepEqual(sent.components[1].example, { body_text: [['Sam']] });
    assert.deepEqual(sent.components[3].buttons.map(b => b.type), ['QUICK_REPLY', 'QUICK_REPLY', 'URL']);
    assert.equal((await owner.post('/api/app/channels/' + chId + '/templates', { name: 'new_arrivals', body: 'Again', language: 'en' })).status, 409);
    const row = db.one("SELECT * FROM wa_templates WHERE name = 'new_arrivals'");
    await hook({ object: 'whatsapp_business_account', entry: [{ id: WABA, changes: [{ field: 'message_template_status_update', value: { event: 'APPROVED', message_template_id: row.meta_id, message_template_name: 'new_arrivals', message_template_language: 'en', reason: 'NONE' } }] }] });
    await h.waitFor(() => db.one("SELECT status FROM wa_templates WHERE name = 'new_arrivals'").status === 'APPROVED');
    assert.ok(db.one("SELECT id FROM events WHERE workspace_id = ? AND text LIKE '%new_arrivals%approved%'", wsId));
  });
});

describe('Blast on WhatsApp', () => {
  const A = '447700900001', B = '447700900002', C = '447700900003';
  test('STOP opts a customer out (with a confirmation); START opts back in', async () => {
    for (const [from, name] of [[A, 'Avery Hill'], [B, 'Blake Stone'], [C, 'Casey Reed']]) {
      await hook(inbound({ type: 'text', text: { body: 'Hi, price?' } }, { from, name }));
    }
    await h.waitFor(() => [A, B, C].every(f => msgs(f).some(m => m.dir === 'out')), { label: 'replies', timeout: 5000 });
    calls = [];
    await hook(inbound({ type: 'text', text: { body: 'STOP' } }, { from: C }));
    await h.waitFor(() => contactOf(C) && contactOf(C).opt_out_at);
    await h.waitFor(() => sentMessages().some(c => c.body.to === C && /won’t get broadcast/.test(c.body.text.body)));
    await hook(inbound({ type: 'text', text: { body: 'START' } }, { from: B }));
    await h.waitFor(() => msgs(B).some(m => m.text && /back on our list/.test(m.text)));
    assert.equal(contactOf(B).opt_out_at, null);
    assert.ok(!msgs(C).some(m => m.author === 'ai' && m.created_at > contactOf(C).opt_out_at), 'the AI does not answer STOP');
  });
  test('cost preview, opt-in confirmation and template-only Blasts that skip opted-out people', async () => {
    const d = await owner.get('/api/app/blasts');
    assert.ok(d.body.whatsapp, 'WhatsApp Blast data');
    assert.equal(d.body.whatsapp.opted_out, 1);
    const all = d.body.whatsapp.segments.find(s => s.id === 'all').count;
    const tpl = d.body.whatsapp.templates.find(t => t.name === 'back_in_stock');
    assert.ok(tpl);
    const est = await owner.post('/api/app/blasts/estimate', { template_id: tpl.id, segment: 'all' });
    assert.equal(est.status, 200);
    assert.equal(est.body.people, all);
    const uk = est.body.meta.countries.find(c => c.code === 'GB');
    assert.ok(uk && uk.people >= 2, 'UK numbers priced with the UK row');
    assert.equal(uk.rate, wa.rateRow('GB').marketing);
    assert.equal(est.body.meta.estimate, true, 'seeded rates are labelled as estimates');
    assert.equal(est.body.meta.category, 'MARKETING');
    let r = await owner.post('/api/app/blasts', { channel: 'whatsapp', segment: 'all', message: 'free text is not allowed', opt_in: true });
    assert.equal(r.status, 400, 'a template is required');
    r = await owner.post('/api/app/blasts', { channel: 'whatsapp', segment: 'all', template_id: tpl.id, vars: ['{first_name}', 'serum'] });
    assert.equal(r.status, 400); assert.equal(r.body.code, 'opt_in');
    r = await owner.post('/api/app/blasts', { channel: 'whatsapp', segment: 'all', template_id: tpl.id, vars: ['{first_name}'], opt_in: true });
    assert.equal(r.status, 400, 'every variable');
    const credits = db.one('SELECT credits FROM workspaces WHERE id = ?', wsId).credits;
    r = await owner.post('/api/app/blasts', { channel: 'whatsapp', segment: 'all', template_id: tpl.id, vars: ['{first_name}', 'serum'], opt_in: true });
    assert.equal(r.status, 200, r.text);
    assert.equal(db.one('SELECT credits FROM workspaces WHERE id = ?', wsId).credits, credits - r.body.credits, 'Replyvoo credits as usual');
    calls = [];
    await require('../src/services/blast').runDue();
    const sent = sentMessages().filter(c => c.body.type === 'template');
    assert.equal(sent.length, all);
    assert.ok(!sent.some(c => c.body.to === C), 'never to someone who replied STOP');
    const toA = sent.find(c => c.body.to === A);
    assert.equal(toA.body.template.components[0].parameters[0].text, 'Avery', '{first_name} filled per person');
    const blast = db.one('SELECT * FROM blasts WHERE id = ?', r.body.id);
    assert.equal(blast.status, 'sent'); assert.equal(blast.channel, 'whatsapp'); assert.equal(blast.sent, all);
    assert.ok(msgs(A).some(m => m.kind === 'template' && m.meta.blast_id === blast.id));
  });
  test('Meta’s rate table is admin-editable and used by the estimate', async () => {
    let r = await admin.put('/api/admin/connections/whatsapp/rates', { rows: [{ code: 'GB', name: 'United Kingdom', marketing: 0.06, utility: 0.02, authentication: 0.02 }] });
    assert.equal(r.status, 400, 'the * row is required');
    r = await admin.put('/api/admin/connections/whatsapp/rates', { rows: [{ code: 'GB', name: 'United Kingdom', marketing: 9, utility: 0, authentication: 0 }, { code: '*', name: 'Other', marketing: 0.05, utility: 0.01, authentication: 0.01 }] });
    assert.equal(r.status, 400, 'out of range');
    r = await admin.put('/api/admin/connections/whatsapp/rates', { checked: true, rows: [{ code: 'GB', name: 'United Kingdom', marketing: 0.061, utility: 0.021, authentication: 0.021 }, { code: '*', name: 'Other', marketing: 0.05, utility: 0.01, authentication: 0.01 }] });
    assert.equal(r.status, 200);
    const e = wa.estimate(['447700900001', '447700900002', '15550001111'], 'UTILITY');
    assert.equal(e.estimate, false);
    assert.equal(e.countries.find(c => c.code === 'GB').rate, 0.021);
    assert.equal(e.countries.find(c => c.code === '*').rate, 0.01);
    assert.equal(e.total_usd, Math.round((0.042 + 0.01) * 100) / 100);
    assert.equal(wa.countryOf('2348031234567'), 'NG');
    assert.equal(wa.countryOf('254712345678'), 'KE');
  });
});

describe('Nudge with a template after 24 hours', () => {
  test('a quiet hot lead outside the window gets the chosen approved template, once', async () => {
    const FROM = '15550004444';
    await hook(inbound({ type: 'text', text: { body: 'How much is the serum? I want to pay' } }, { from: FROM, name: 'Riley Quinn' }));
    await h.waitFor(() => msgs(FROM).some(m => m.author === 'ai'));
    const t = threadOf(FROM);
    db.update('threads', t.id, { last_customer_at: new Date(Date.now() - 30 * 3600e3).toISOString(), last_message_at: new Date(Date.now() - 29 * 3600e3).toISOString(), nudged_at: null });
    db.update('contacts', contactOf(FROM).id, { heat: 'hot' });
    const tpl = db.one("SELECT * FROM wa_templates WHERE name = 'checking_in'");
    const r = await owner.put('/api/app/channels/' + channel().id + '/whatsapp', { nudge_template_id: tpl.id, nudge_vars: ['{first_name}'] });
    assert.equal(r.status, 200); assert.equal(r.body.nudge_template_id, tpl.id);
    calls = [];
    const sched = require('../src/services/scheduler');
    await sched.waNudges();
    const s = sentMessages().find(c => c.body.to === FROM);
    assert.ok(s, 'template nudge sent');
    assert.equal(s.body.type, 'template'); assert.equal(s.body.template.name, 'checking_in');
    assert.equal(s.body.template.components[0].parameters[0].text, 'Riley');
    calls = [];
    await sched.waNudges();
    assert.equal(sentMessages().length, 0, 'only once');
  });
});

describe('switched off again', () => {
  test('webhooks are acknowledged but ignored, and customers see “coming soon”; Off hides it', async () => {
    assert.equal((await admin.put('/api/admin/connections/whatsapp', { enabled: false })).status, 200);
    assert.equal(settings.channel('whatsapp'), 'soon');
    const before = db.one('SELECT COUNT(*) n FROM messages').n;
    const r = await hook(inbound({ type: 'text', text: { body: 'anyone there?' } }, { from: '15550005555' }));
    assert.equal(r.status, 200);
    await h.sleep(80);
    assert.equal(db.one('SELECT COUNT(*) n FROM messages').n, before);
    assert.equal((await owner.get('/api/app/bootstrap')).body.flags.channels.whatsapp, 'soon');
    assert.equal((await owner.post('/api/app/channels/whatsapp/manual', { phone_number_id: PHONE2, token: MANUAL_TOKEN })).status, 403);
    assert.equal((await admin.put('/api/admin/connections/whatsapp', { enabled: true })).status, 200);
    assert.equal(settings.channel('whatsapp'), 'live');
    await admin.put('/api/admin/settings/flags', { value: { channels: { whatsapp: 'off' } } });
    assert.equal(settings.channel('whatsapp'), 'off', 'the admin Off wins');
    assert.equal((await h.client().get('/whatsapp-ai-chatbot')).status, 404);
    await admin.put('/api/admin/settings/flags', { value: {} });
    await admin.put('/api/admin/connections/whatsapp', { enabled: false });
  });
});
