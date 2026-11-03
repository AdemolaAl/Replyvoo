'use strict';
// Joinvoo bridge: a Joinvoo customer hands a bot's private chats to Replyvoo. A fake Joinvoo (relay, file and fallback
// endpoints, checking Replyvoo's signatures) runs on a local port; Telegram is never called by Replyvoo for these bots.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const h = require('./helpers');

const APP_SECRET = 'bridge-app-secret-for-tests-0123456789';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
let env, db, jv, fake, fakeUrl;
const J = { sends: [], files: [], fallbacks: [], disconnects: [], refunds: [], badSig: 0, failSend: false, failRefund: false };
const LINKS = {}; // link id -> secret (what Joinvoo would keep)

function sign(key, dir, method, path, raw, o = {}) {
  const ts = String(o.ts || Date.now()), nonce = o.nonce || crypto.randomBytes(16).toString('hex');
  return { ts, nonce, sig: jv.signature(key, dir, ts, nonce, method, path, raw) };
}
async function jvCall(path, body, o = {}) {
  const raw = JSON.stringify(body || {});
  const linkId = o.linkId || 'app', key = o.key || (linkId === 'app' ? APP_SECRET : LINKS[linkId]);
  const s = sign(key, 'jv>rv', 'POST', path, raw, o);
  const headers = { 'content-type': 'application/json', 'x-voo-link': linkId, 'x-voo-ts': s.ts, 'x-voo-nonce': s.nonce, 'x-voo-sig': o.sig || s.sig };
  const r = await h.realFetch(env.base + path, { method: 'POST', headers, body: o.rawOverride || raw });
  return { status: r.status, body: await r.json().catch(() => null), nonce: s.nonce, ts: s.ts, sig: s.sig, raw };
}
async function link(vooId) {
  const linkId = 'jvl_' + crypto.randomBytes(9).toString('base64url'), secret = crypto.randomBytes(32).toString('hex');
  const r = await jvCall('/hooks/joinvoo/link', { link_id: linkId, secret, voo_id: vooId, account: 'jv:test' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  LINKS[linkId] = secret;
  return { linkId, r };
}
function userWithVoo(vooId, email) {
  const x = h.makeWorkspace({ email });
  db.update('users', x.user.id, { voo_id: vooId, email_verified: 1 });
  const t = db.now();
  const cid = db.insert('closers', { workspace_id: x.ws.id, name: 'Ava', template: 'sales', persona: JSON.stringify({ human: false }), skills: JSON.stringify({ vision: true, handoff: true, paylink: true }), instructions: '', knowledge: 'We sell running shoes for $49. Free delivery.', pay_link: 'https://pay.example.com/shoes', active: 1, created_at: t, updated_at: t });
  return { ...x, closerId: cid };
}
const upd = (lk, body) => jvCall('/hooks/joinvoo/update', body, { linkId: lk });
let jvId = 0;
const msg = (chat, kind, extra = {}) => ({ event: 'message', bot_id: '7001', chat_id: String(chat), from: { name: 'Lucas Martin', username: 'lucas_m', lang: 'en' }, context: { tracked: true, platform: 'Meta', campaign: 'Spring_Sale', ad: 'Hook_A_Video', deposits: 0, deposits_usd_cents: 0 }, message: { jv_id: ++jvId, tg_msg_id: 500 + jvId, kind, ...extra } });
const threadOf = chat => db.one("SELECT t.* FROM threads t JOIN channels c ON c.id = t.channel_id WHERE c.type = 'joinvoo_bot' AND t.chat_id = ?", String(chat));
const msgs = tid => db.all('SELECT * FROM messages WHERE thread_id = ? ORDER BY id', tid);

before(async () => {
  process.env.JOINVOO_BRIDGE_SECRET = APP_SECRET;
  fake = http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const key = LINKS[req.headers['x-voo-link']];
      const want = key ? jv.signature(key, 'rv>jv', req.headers['x-voo-ts'], req.headers['x-voo-nonce'], req.method, req.url, raw) : '';
      if (!key || want !== req.headers['x-voo-sig']) { J.badSig++; res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"ok":false,"error":"bad signature"}'); }
      const b = JSON.parse(raw || '{}');
      if (req.url === '/bridge/replyvoo/send') {
        if (b.kind === 'typing') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
        J.sends.push({ link: req.headers['x-voo-link'], ...b });
        if (J.failSend) { res.writeHead(502, { 'content-type': 'application/json' }); return res.end('{"ok":false,"error":"Telegram is down"}'); }
        res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, message_id: 9000 + J.sends.length, file_id: b.file ? 'SENT-FILE-' + J.sends.length : undefined }));
      }
      if (req.url === '/bridge/replyvoo/file') { J.files.push(b); res.writeHead(200, { 'content-type': 'image/png' }); return res.end(PNG); }
      if (req.url === '/bridge/replyvoo/fallback') { J.fallbacks.push(b); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
      if (req.url === '/bridge/replyvoo/disconnect') { J.disconnects.push({ link: req.headers['x-voo-link'], ...b }); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"disconnected":1}'); }
      if (req.url === '/bridge/replyvoo/refund') { if (J.failRefund) { res.writeHead(502, { 'content-type': 'application/json' }); return res.end('{"ok":false,"error":"down"}'); } J.refunds.push({ link: req.headers['x-voo-link'], ...b }); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, credits: Math.round(b.amount_usd * 100) })); }
      res.writeHead(404); res.end('{}');
    });
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  fakeUrl = 'http://127.0.0.1:' + fake.address().port;
  process.env.JOINVOO_URL = fakeUrl;
  env = await h.boot();
  db = env.db;
  jv = require('../src/services/joinvoo');
});
after(async () => { await env.close(); fake.close(); delete process.env.JOINVOO_URL; delete process.env.JOINVOO_BRIDGE_SECRET; });

describe('joinvoo bridge', () => {
  let A, LA, B, LB;

  test('signature, expiry and replay protection on the link call', async () => {
    let r = await jvCall('/hooks/joinvoo/link', { link_id: 'jvl_aaaaaaaaaaaa', secret: 'x'.repeat(40), voo_id: 'v-nobody' }, { key: 'wrong-secret-wrong-secret-wrong' });
    assert.equal(r.status, 401, 'wrong shared secret');
    r = await jvCall('/hooks/joinvoo/link', { link_id: 'jvl_aaaaaaaaaaaa', secret: 'x'.repeat(40), voo_id: 'v-nobody' }, { ts: Date.now() - 6 * 60e3 });
    assert.equal(r.status, 401, 'older than 5 minutes');
    // Body changed after signing
    const ok = await jvCall('/hooks/joinvoo/link', { link_id: 'jvl_bbbbbbbbbbbb', secret: 'y'.repeat(40), voo_id: 'v-nobody' });
    assert.equal(ok.status, 200);
    const replay = await h.realFetch(env.base + '/hooks/joinvoo/link', { method: 'POST', headers: { 'content-type': 'application/json', 'x-voo-link': 'app', 'x-voo-ts': ok.ts, 'x-voo-nonce': ok.nonce, 'x-voo-sig': ok.sig }, body: ok.raw });
    assert.equal(replay.status, 401, 'the same signed call twice is refused');
    assert.match((await replay.json()).error, /Replayed/);
    const tampered = await jvCall('/hooks/joinvoo/link', { link_id: 'jvl_bbbbbbbbbbbb', secret: 'y'.repeat(40), voo_id: 'v-nobody' }, { rawOverride: JSON.stringify({ link_id: 'jvl_bbbbbbbbbbbb', secret: 'z'.repeat(40), voo_id: 'v-other' }) });
    assert.equal(tampered.status, 401, 'a changed body fails the signature');
    // A signature made for the other direction (Replyvoo → Joinvoo) is never accepted here
    const raw = JSON.stringify({ x: 1 }), s = sign(APP_SECRET, 'rv>jv', 'POST', '/hooks/joinvoo/link', raw);
    const back = await h.realFetch(env.base + '/hooks/joinvoo/link', { method: 'POST', headers: { 'content-type': 'application/json', 'x-voo-link': 'app', 'x-voo-ts': s.ts, 'x-voo-nonce': s.nonce, 'x-voo-sig': s.sig }, body: raw });
    assert.equal(back.status, 401, 'reflected signature refused');
  });

  test('not a Replyvoo user yet: the link says so, with a Voo login sign-up link', async () => {
    const { linkId, r } = await link('voo-alice');
    assert.equal(r.body.status.account, false);
    assert.match(r.body.status.open_url, /\/auth\/voosquare\?return_to=%2Fapp%2Finbox&signup=1$/);
    assert.equal(r.body.status.free_chats, 30, '30 free chats a month');
    const sw = await jvCall('/hooks/joinvoo/bot', { bot_id: '7001', username: 'shoe_shop_bot', name: 'Shoe Shop', on: true }, { linkId });
    assert.equal(sw.status, 404); assert.equal(sw.body.reason, 'no_account');
    LA = linkId;
  });

  test('after Voo login the same link sees the account: free chats left, bot switched on', async () => {
    A = userWithVoo('voo-alice', 'alice-bridge@example.com');
    let st = await jvCall('/hooks/joinvoo/status', { bot_ids: ['7001'] }, { linkId: LA });
    assert.equal(st.status, 200);
    assert.equal(st.body.status.account, true); assert.equal(st.body.status.state, 'free'); assert.equal(st.body.status.chats_left, 30);
    assert.equal(st.body.bots[0].on, false);
    const sw = await jvCall('/hooks/joinvoo/bot', { bot_id: '7001', username: 'shoe_shop_bot', name: 'Shoe Shop', on: true }, { linkId: LA });
    assert.equal(sw.status, 200, JSON.stringify(sw.body)); assert.equal(sw.body.on, true); assert.equal(sw.body.closer, true);
    const ch = db.one("SELECT * FROM channels WHERE type = 'joinvoo_bot' AND external_id = '7001'");
    assert.ok(ch && ch.status === 'active' && ch.workspace_id === A.ws.id && ch.token_enc === '' && ch.closer_id === A.closerId, 'a token-less channel in Alice’s workspace');
    st = await jvCall('/hooks/joinvoo/status', { bot_ids: ['7001'] }, { linkId: LA });
    assert.equal(st.body.bots[0].on, true);
  });

  test('text in, with earlier Team inbox history; the Closer answers through Joinvoo; no doubles', async () => {
    const body = msg(3001, 'text', { text: 'Hi, how much are the shoes?' });
    body.history = [{ jv_id: 'h1', dir: 'in', kind: 'text', text: 'Hello, are you open?', at: Date.now() - 3600e3 }, { jv_id: 'h2', dir: 'out', kind: 'text', text: 'Yes, ask me anything!', by_name: 'Sam (team)', at: Date.now() - 3500e3 }];
    const n0 = J.sends.length;
    const r = await upd(LA, body);
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.accepted, true);
    await h.waitFor(() => J.sends.length > n0, { label: 'relay send' });
    const s = J.sends[n0];
    assert.equal(s.bot_id, '7001'); assert.equal(s.chat_id, '3001'); assert.equal(s.kind, 'text'); assert.equal(s.by, 'ai'); assert.ok(s.text.length > 0);
    const t = threadOf(3001), ms = msgs(t.id);
    assert.deepEqual(ms.slice(0, 3).map(m => [m.dir, m.author, m.ext_id]), [['in', 'customer', 'jv:h1'], ['out', 'human', 'jv:h2'], ['in', 'customer', 'jv:' + body.message.jv_id]], 'history first, then the new message');
    assert.ok(ms.some(m => m.dir === 'out' && m.author === 'ai'), 'Closer reply stored');
    assert.equal(db.one('SELECT conv_used FROM workspaces WHERE id = ?', A.ws.id).conv_used, 1, 'one normal Replyvoo conversation used (Spark plan)');
    // Same update again (retry) and the same history again: nothing doubled
    const again = await upd(LA, body);
    assert.equal(again.body.duplicate, true);
    const b2 = msg(3001, 'text', { text: 'And delivery?' }); b2.history = body.history;
    await upd(LA, b2);
    await h.waitFor(() => msgs(t.id).filter(m => m.author === 'ai').length >= 2, { label: 'second reply' });
    assert.equal(msgs(t.id).filter(m => m.ext_id === 'jv:h1' || m.ext_id === 'jv:h2').length, 2, 'history stored once');
    const c = db.one('SELECT * FROM contacts WHERE id = ?', t.contact_id);
    assert.equal(JSON.parse(c.ext_context).ad, 'Hook_A_Video', 'ad source kept for the chat view and the Closer');
  });

  test('photo, voice note, document, sticker and button press come in; files load through Joinvoo', async () => {
    const f0 = J.files.length;
    await upd(LA, msg(3002, 'photo', { file_id: 'PHOTO-1', text: 'is this the right size?' }));
    await h.waitFor(() => J.files.length > f0, { label: 'photo fetched for the Closer' });
    assert.equal(J.files[f0].file_id, 'PHOTO-1'); assert.equal(J.files[f0].chat_id, '3002');
    // One at a time, like a person sends them (each is stored once the Closer picks it up; a voice note waits for its file first).
    const ins0 = () => { const tt = threadOf(3002); return tt ? msgs(tt.id).filter(m => m.dir === 'in').length : 0; };
    await h.waitFor(() => ins0() >= 1, { label: 'photo stored' });
    await upd(LA, msg(3002, 'voice', { file_id: 'VOICE-1', duration: 4 })); await h.waitFor(() => ins0() >= 2, { label: 'voice stored' });
    await upd(LA, msg(3002, 'document', { file_id: 'DOC-1', name: 'order.pdf', mime: 'application/pdf' })); await h.waitFor(() => ins0() >= 3, { label: 'document stored' });
    await upd(LA, msg(3002, 'sticker', { emoji: '👍' })); await h.waitFor(() => ins0() >= 4, { label: 'sticker stored' });
    await upd(LA, msg(3002, 'button', { data: 'size_42', label: 'Size 42' }));
    const t = threadOf(3002);
    await h.waitFor(() => msgs(t.id).filter(m => m.dir === 'in').length >= 5, { label: 'all stored' });
    const ins = msgs(t.id).filter(m => m.dir === 'in');
    assert.deepEqual(ins.map(m => m.kind), ['image', 'voice', 'other', 'other', 'text']);
    assert.equal(JSON.parse(ins[0].meta).media.jv_file, 'PHOTO-1');
    assert.equal(ins[2].text, '[file: order.pdf]'); assert.equal(ins[3].text, '👍'); assert.equal(ins[4].text, 'Pressed “Size 42”');
    // The dashboard shows the real photo (through Joinvoo), never the Telegram file id
    const c = await h.login('alice-bridge@example.com', 'password123');
    const d = await c.get('/api/app/threads/' + t.id);
    const ph = d.body.messages.find(m => m.kind === 'image');
    assert.ok(ph.meta.media.url && !ph.meta.media.jv_file, 'media url instead of the file id');
    assert.equal(d.body.channel.via, 'joinvoo');
    assert.equal(d.body.joinvoo.ad, 'Hook_A_Video');
    const img = await c.get(ph.meta.media.url);
    assert.equal(img.status, 200); assert.match(img.headers.get('content-type'), /image\/png/);
    // Someone from another workspace can't load it
    const other = h.makeWorkspace({ email: 'nosy-bridge@example.com' }); void other;
    const nosy = await h.login('nosy-bridge@example.com', 'password123');
    assert.equal((await nosy.get(ph.meta.media.url)).status, 404);
  });

  test('the team takes over in Replyvoo and sends a photo, a document and a link button through Joinvoo', async () => {
    const t = threadOf(3002);
    const c = await h.login('alice-bridge@example.com', 'password123');
    const n0 = J.sends.length;
    let r = await c.post('/api/app/threads/' + t.id + '/messages', { text: 'Here is the size chart', file: { data_url: 'data:image/png;base64,' + PNG.toString('base64'), name: 'chart.png' }, button: { text: 'Order now', url: 'https://shop.example.com/order' } });
    assert.equal(r.status, 200, r.text);
    const s = J.sends[n0];
    assert.equal(s.kind, 'photo'); assert.equal(s.by, 'human'); assert.equal(s.file.mime, 'image/png'); assert.equal(Buffer.from(s.file.data, 'base64').length, PNG.length);
    assert.deepEqual(s.buttons, [[{ text: 'Order now', url: 'https://shop.example.com/order' }]]);
    r = await c.post('/api/app/threads/' + t.id + '/messages', { text: '', file: { data_url: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 test').toString('base64'), name: 'invoice.pdf' } });
    assert.equal(r.status, 200); assert.equal(J.sends[n0 + 1].kind, 'document');
    r = await c.post('/api/app/threads/' + t.id + '/messages', { text: '', file: { data_url: 'data:audio/ogg;base64,' + Buffer.from('OggS').toString('base64'), name: 'note.ogg' } });
    assert.equal(J.sends[n0 + 2].kind, 'voice');
    r = await c.post('/api/app/threads/' + t.id + '/messages', { text: 'How to wear them', file: { data_url: 'data:video/mp4;base64,' + Buffer.from('mp4-test').toString('base64'), name: 'how.mp4' } });
    assert.equal(r.status, 200); assert.equal(J.sends[n0 + 3].kind, 'video'); assert.equal(J.sends[n0 + 3].text, 'How to wear them');
    const vid = msgs(t.id).filter(m => m.dir === 'out').pop();
    assert.equal(JSON.parse(vid.meta).media.jv_file, 'SENT-FILE-' + (n0 + 4), 'the file Joinvoo sent is kept for the chat view');
    assert.equal(db.one('SELECT ai_on FROM threads WHERE id = ?', t.id).ai_on, 0, 'a teammate replying takes the chat over');
    // While the team handles it, new messages are kept and the Closer stays quiet (no fallback: the team is on it in Replyvoo)
    const n1 = J.sends.length;
    r = await upd(LA, msg(3002, 'text', { text: 'thanks!' }));
    assert.equal(r.body.team, true);
    await h.sleep(150); assert.equal(J.sends.length, n1);
    // A button link must be https
    r = await c.post('/api/app/threads/' + t.id + '/messages', { text: 'x', button: { text: 'Go', url: 'javascript:alert(1)' } });
    assert.equal(r.status, 400);
  });

  test('Start: Joinvoo welcomed them → the Closer waits; no welcome → the Closer says hello', async () => {
    const n0 = J.sends.length;
    let r = await upd(LA, { event: 'start', bot_id: '7001', chat_id: '3003', from: { name: 'Mia Kim' }, welcomed: true, message: { jv_id: ++jvId, kind: 'start', text: '/start' } });
    assert.equal(r.status, 200); await h.sleep(100); assert.equal(J.sends.length, n0, 'no second welcome');
    r = await upd(LA, { event: 'start', bot_id: '7001', chat_id: '3004', from: { name: 'Noah Silva' }, welcomed: false, message: { jv_id: ++jvId, kind: 'start', text: '/start' } });
    await h.waitFor(() => J.sends.length > n0, { label: 'hello' });
    assert.match(J.sends[n0].text, /^Hi Noah! I’m Ava\./);
  });

  test('deposit context and block events', async () => {
    await upd(LA, { event: 'context', bot_id: '7001', chat_id: '3001', from: { name: 'Lucas Martin' }, context: { tracked: true, platform: 'Meta', ad: 'Hook_A_Video', deposits: 1, deposits_usd_cents: 5000, ftd_at: Date.now() } });
    const t = threadOf(3001);
    const ctx = JSON.parse(db.one('SELECT ext_context FROM contacts WHERE id = ?', t.contact_id).ext_context);
    assert.equal(ctx.deposits, 1); assert.equal(ctx.deposits_usd, 50);
    assert.match(require('../src/services/engine').memory(t.contact_id).source, /deposited \$50\.00/, 'the Closer knows about the deposit');
    await upd(LA, { event: 'blocked', bot_id: '7001', chat_id: '3004', from: { name: 'Noah Silva' } });
    assert.equal(db.one('SELECT blocked FROM contacts WHERE id = ?', threadOf(3004).contact_id).blocked, 1);
  });

  test('Joinvoo or Telegram could not deliver the Closer’s reply → Replyvoo tells Joinvoo to fall back', async () => {
    J.failSend = true; const f0 = J.fallbacks.length;
    const r = await upd(LA, msg(3005, 'text', { text: 'hello?' }));
    assert.equal(r.body.accepted, true);
    await h.waitFor(() => J.fallbacks.length > f0, { label: 'fallback signal' });
    assert.equal(J.fallbacks[f0].reason, 'send_failed'); assert.equal(J.fallbacks[f0].chat_id, '3005');
    J.failSend = false;
    assert.equal(db.one('SELECT conv_used FROM workspaces WHERE id = ?', A.ws.id).conv_used >= 1, true);
  });

  test('out of chats and credits: refused with reason out_of_credits, message kept', async () => {
    db.update('workspaces', A.ws.id, { conv_used: 30, credits: 0 });
    let st = await jvCall('/hooks/joinvoo/status', {}, { linkId: LA });
    assert.equal(st.body.status.state, 'out'); assert.equal(st.body.status.out_of_credits, true);
    const r = await upd(LA, msg(3006, 'text', { text: 'anyone there?' }));
    assert.equal(r.status, 402); assert.equal(r.body.reason, 'out_of_credits');
    assert.equal(msgs(threadOf(3006).id).filter(m => m.dir === 'in').length, 1, 'the message is still in Replyvoo’s history');
    db.update('workspaces', A.ws.id, { credits: 5 });
    st = await jvCall('/hooks/joinvoo/status', {}, { linkId: LA });
    assert.equal(st.body.status.state, 'credits');
    db.update('workspaces', A.ws.id, { conv_used: 3, credits: 0 });
  });

  test('no active Closer → reason no_closer (Joinvoo falls back)', async () => {
    db.update('closers', A.closerId, { active: 0 });
    const r = await upd(LA, msg(3007, 'text', { text: 'hi' }));
    assert.equal(r.status, 409); assert.equal(r.body.reason, 'no_closer');
    db.update('closers', A.closerId, { active: 1 });
  });

  test('another account can never receive or send for this bot', async () => {
    const lb = await link('voo-bob');
    LB = lb.linkId;
    B = userWithVoo('voo-bob', 'bob-bridge@example.com');
    let r = await upd(LB, msg(3010, 'text', { text: 'let me in' }));
    assert.equal(r.status, 409); assert.equal(r.body.reason, 'not_switched', 'Bob’s link sees no such bot');
    r = await jvCall('/hooks/joinvoo/bot', { bot_id: '7001', username: 'shoe_shop_bot', on: true }, { linkId: LB });
    assert.equal(r.status, 409); assert.equal(r.body.reason, 'taken', 'Bob can’t take Alice’s bot');
    r = await jvCall('/hooks/joinvoo/update', msg(3001, 'text', { text: 'x' }), { linkId: LA, key: LINKS[LB] });
    assert.equal(r.status, 401, 'Alice’s link id with Bob’s secret');
    r = await jvCall('/hooks/joinvoo/update', msg(3001, 'text', { text: 'x' }), { linkId: 'jvl_doesnotexist01', key: LINKS[LA] });
    assert.equal(r.status, 401, 'unknown link');
    assert.equal(db.one("SELECT COUNT(*) n FROM threads t JOIN channels c ON c.id = t.channel_id WHERE c.workspace_id = ?", B.ws.id).n, 0, 'nothing reached Bob’s workspace');
    assert.equal(J.badSig, 0, 'every call Replyvoo made to Joinvoo was signed correctly');
    assert.ok(J.sends.every(s => s.link === LA), 'Replyvoo only ever sent with Alice’s link');
  });

  test('switch off: chats stay; updates are refused so Joinvoo’s Team inbox answers; switch on again keeps history', async () => {
    let r = await jvCall('/hooks/joinvoo/bot', { bot_id: '7001', on: false }, { linkId: LA });
    assert.equal(r.status, 200); assert.equal(r.body.on, false);
    assert.equal(db.one("SELECT status FROM channels WHERE type = 'joinvoo_bot' AND external_id = '7001'").status, 'paused');
    r = await upd(LA, msg(3001, 'text', { text: 'still there?' }));
    assert.equal(r.status, 409); assert.equal(r.body.reason, 'not_switched');
    const t = threadOf(3001), before = msgs(t.id).length;
    r = await jvCall('/hooks/joinvoo/bot', { bot_id: '7001', on: true }, { linkId: LA });
    assert.equal(r.status, 200);
    // Back on: the Team inbox replies written meanwhile come over as history, once
    const b = msg(3001, 'text', { text: 'back again' }); b.history = [{ jv_id: 'h9', dir: 'out', kind: 'text', text: 'We answered from Joinvoo meanwhile', by_name: 'Sam (team)', at: Date.now() - 1000 }];
    await upd(LA, b);
    const after = msgs(t.id);
    assert.ok(after.length > before && after.some(m => m.ext_id === 'jv:h9' && m.author === 'human'), 'team reply from the Joinvoo period is in Replyvoo');
  });

  test('a bot held by Joinvoo can’t also be connected to Replyvoo directly (one webhook only)', async () => {
    // The direct-connect route asks Telegram first (no network in tests), so check the refusal the other way round:
    db.insert('channels', { workspace_id: B.ws.id, type: 'telegram_bot', name: 'Direct', username: 'direct_bot', external_id: '7002', token_enc: '', created_at: db.now() });
    const r = await jvCall('/hooks/joinvoo/bot', { bot_id: '7002', on: true }, { linkId: LB });
    assert.equal(r.status, 409); assert.equal(r.body.reason, 'direct_bot');
  });

  test('rate limit per link', async () => {
    const lk = await link('voo-flood');
    let last;
    for (let i = 0; i < 125; i++) last = await jvCall('/hooks/joinvoo/status', {}, { linkId: lk.linkId });
    assert.equal(last.status, 429);
  });

  // ---------- Paying for Replyvoo with Joinvoo credits ----------
  let paidRef = '';
  test('Joinvoo credits: real catalog, purchase checked against Replyvoo’s own price, once per purchase id', async () => {
    const cat = await jvCall('/hooks/joinvoo/catalog', {}, { linkId: LA });
    assert.equal(cat.status, 200);
    const st = cat.body.plans.find(p => p.id === 'starter');
    assert.ok(st && st.month_usd > 0 && cat.body.packs.length > 0, 'paid plans and packs, from the database (never hardcoded)');
    assert.ok(!cat.body.plans.some(p => p.id === 'spark'), 'free plans aren’t sold');
    let r = await jvCall('/hooks/joinvoo/purchase', { purchase_id: 'jvp_101', kind: 'plan', item_id: 'starter', interval: 'month', amount_usd: st.month_usd + 1 }, { linkId: LA });
    assert.equal(r.status, 409); assert.equal(r.body.reason, 'price_changed', 'a price that doesn’t match Replyvoo’s own is refused');
    const n0 = db.one("SELECT COUNT(*) n FROM orders WHERE provider = 'joinvoo_credits'").n;
    r = await jvCall('/hooks/joinvoo/purchase', { purchase_id: 'jvp_101', kind: 'plan', item_id: 'starter', interval: 'month', amount_usd: st.month_usd }, { linkId: LA });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.ok, true); assert.match(r.body.receipt, /^RV-/);
    paidRef = r.body.receipt;
    const o = db.one('SELECT * FROM orders WHERE ref = ?', paidRef);
    assert.equal(o.provider, 'joinvoo_credits'); assert.equal(o.status, 'paid'); assert.equal(o.provider_ref, 'jvp_101'); assert.equal(JSON.parse(o.meta).method, 'Joinvoo credits');
    assert.equal(db.one('SELECT plan_id FROM workspaces WHERE id = ?', A.ws.id).plan_id, 'starter', 'the plan is on, like any paid order');
    const again = await jvCall('/hooks/joinvoo/purchase', { purchase_id: 'jvp_101', kind: 'plan', item_id: 'starter', interval: 'month', amount_usd: st.month_usd }, { linkId: LA });
    assert.equal(again.body.duplicate, true); assert.equal(again.body.receipt, paidRef);
    assert.equal(db.one("SELECT COUNT(*) n FROM orders WHERE provider = 'joinvoo_credits'").n, n0 + 1, 'one purchase id, one order (no double plan, no double commission)');
    const ps = await jvCall('/hooks/joinvoo/purchase-status', { purchase_id: 'jvp_101' }, { linkId: LA });
    assert.equal(ps.body.found, true); assert.equal(ps.body.status, 'paid');
    const other = await jvCall('/hooks/joinvoo/purchase-status', { purchase_id: 'jvp_101' }, { linkId: LB });
    assert.equal(other.body.found, false, 'another account’s link can’t see it');
    const forged = await jvCall('/hooks/joinvoo/purchase', { purchase_id: 'jvp_102', kind: 'pack', item_id: '1', amount_usd: 1 }, { linkId: LA, key: LINKS[LB] });
    assert.equal(forged.status, 401, 'signed with another link’s secret: refused');
    const nb = db.one("SELECT COUNT(*) n FROM orders WHERE provider = 'joinvoo_credits' AND provider_ref = 'jvp_101'").n;
    assert.equal(nb, 1);
  });

  test('refund of a purchase paid with Joinvoo credits goes back as Joinvoo credits (retried until it lands)', async () => {
    const payments = require('../src/services/payments');
    const r = payments.reverse(paidRef, 'refund', { note: 'test' });
    assert.equal(r.back_to, 'joinvoo_credits');
    await h.waitFor(() => J.refunds.length > 0, { label: 'refund call to Joinvoo' });
    assert.equal(J.refunds[0].purchase_id, 'jvp_101'); assert.equal(J.refunds[0].receipt, paidRef); assert.equal(J.refunds[0].link, LA);
    assert.equal(JSON.parse(db.one('SELECT meta FROM orders WHERE ref = ?', paidRef).meta).jv_refund.state, 'done');
    // Joinvoo down: the refund waits and is retried
    const st = db.one("SELECT * FROM plans WHERE id = 'starter'");
    const p2 = await jvCall('/hooks/joinvoo/purchase', { purchase_id: 'jvp_103', kind: 'plan', item_id: 'starter', interval: 'month', amount_usd: require('../src/services/payments').quote('plan', 'starter', 'month').amount }, { linkId: LA });
    J.failRefund = true; payments.reverse(p2.body.receipt, 'refund', {});
    await h.waitFor(() => (JSON.parse(db.one('SELECT meta FROM orders WHERE ref = ?', p2.body.receipt).meta).jv_refund || {}).state === 'pending', { label: 'refund pending' });
    J.failRefund = false; await jv.retryRefunds();
    assert.equal(JSON.parse(db.one('SELECT meta FROM orders WHERE ref = ?', p2.body.receipt).meta).jv_refund.state, 'done', 'retried and delivered');
    void st;
    const months = jv.settlement();
    assert.ok(months.length >= 1 && months[0].orders >= 2 && months[0].refunded_usd > 0, 'monthly settlement for the admin: moved and refunded');
    // the plan Alice bought is still needed below: put her on Starter again
    await jvCall('/hooks/joinvoo/purchase', { purchase_id: 'jvp_104', kind: 'plan', item_id: 'starter', interval: 'month', amount_usd: require('../src/services/payments').quote('plan', 'starter', 'month').amount }, { linkId: LA });
  });

  // ---------- Managers' own Telegram accounts through Joinvoo ----------
  test('a manager’s account (Telegram Business, held by Joinvoo) is answered like a bot: via Joinvoo · Sara’s Telegram', async () => {
    let sw = await jvCall('/hooks/joinvoo/bot', { kind: 'account', account_id: '5570001', name: 'Sara (Sales)', username: 'sara_sales', on: true }, { linkId: LA });
    assert.equal(sw.status, 200, JSON.stringify(sw.body));
    const ch = db.one("SELECT * FROM channels WHERE type = 'joinvoo_account' AND external_id = '5570001'");
    assert.ok(ch && ch.status === 'active' && ch.workspace_id === A.ws.id && ch.token_enc === '');
    const st = await jvCall('/hooks/joinvoo/status', { account_ids: ['5570001'] }, { linkId: LA });
    assert.equal(st.body.accounts[0].on, true);
    const n0 = J.sends.length;
    const body = { event: 'message', account_id: '5570001', account_name: 'Sara (Sales)', chat_id: '4001', from: { name: 'Lia Costa', username: 'lia_c' }, context: { tracked: true, platform: 'Meta', ad: 'Story 2' }, message: { jv_id: ++jvId, kind: 'text', text: 'How much are the running shoes?' } };
    let r = await upd(LA, body);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await h.waitFor(() => J.sends.length > n0, { label: 'reply through Joinvoo' });
    assert.equal(J.sends[n0].account_id, '5570001', 'the reply goes back through Joinvoo, from Sara’s account'); assert.ok(!J.sends[n0].bot_id);
    const t = db.one("SELECT t.* FROM threads t JOIN channels c ON c.id = t.channel_id WHERE c.type = 'joinvoo_account' AND t.chat_id = '4001'");
    const f0 = J.files.length;
    const rp = await upd(LA, { ...body, message: { jv_id: ++jvId, kind: 'photo', file_id: 'AP-9', text: 'here' } }); 
    await h.waitFor(() => J.files.length > f0, { label: 'photo through Joinvoo (' + rp.status + ')' });
    assert.equal(J.files[f0].account_id, '5570001');
    await upd(LA, { ...body, message: { jv_id: ++jvId, kind: 'voice', file_id: 'AV-9', duration: 2 } });
    await upd(LA, { ...body, message: { jv_id: ++jvId, kind: 'document', file_id: 'AD-9', name: 'id.pdf' } });
    await upd(LA, { ...body, message: { jv_id: ++jvId, kind: 'button', label: 'Tell me more', data: 'more' } });
    await h.waitFor(() => msgs(t.id).filter(m => m.dir === 'in').length >= 5, { label: 'all stored' });
    const c = await h.login('alice-bridge@example.com', 'password123');
    const d = await c.get('/api/app/threads/' + t.id);
    assert.equal(d.body.channel.via_label, 'via Joinvoo · Sara’s Telegram', 'the chat says where it comes from');
    const list = await c.get('/api/app/threads');
    const row = (list.body.threads || list.body).find(x => x.id === t.id);
    assert.equal(row.channel_type, 'joinvoo_account'); assert.equal(row.channel_name, 'Sara (Sales)');
    // Sara answered from her phone: the Closer steps back
    r = await upd(LA, { event: 'context', manager_replied: true, account_id: '5570001', chat_id: '4001', from: { name: 'Lia Costa' }, history: [{ jv_id: 'm1', dir: 'out', kind: 'text', text: 'Sara here, I will take it', by_name: 'Sara (Sales)', at: Date.now() }] });
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT ai_on FROM threads WHERE id = ?', t.id).ai_on, 0, 'the Closer stepped back');
    assert.ok(msgs(t.id).some(m => m.ext_id === 'jv:m1' && m.author === 'human') && msgs(t.id).some(m => m.dir === 'note' && /stepped back/.test(m.text)));
    // another account can't reach Sara's account
    r = await upd(LB, { ...body, message: { jv_id: ++jvId, kind: 'text', text: 'let me in' } });
    assert.equal(r.status, 409); assert.equal(r.body.reason, 'not_switched');
    sw = await jvCall('/hooks/joinvoo/bot', { kind: 'account', account_id: '5570001', on: true }, { linkId: LB });
    assert.equal(sw.status, 409); assert.equal(sw.body.reason, 'taken', 'Bob can’t take Sara’s account');
  });

  test('Settings → Connected apps → Joinvoo: lists what is linked, and Disconnect tells Joinvoo', async () => {
    const c = await h.login('alice-bridge@example.com', 'password123');
    let r = await c.get('/api/app/joinvoo/connections');
    assert.equal(r.status, 200);
    const acct = r.body.connections.find(x => x.kind === 'account'), bot = r.body.connections.find(x => x.kind === 'bot');
    assert.ok(acct && acct.via === 'via Joinvoo · Sara’s Telegram' && bot && /via Joinvoo · @shoe_shop_bot/.test(bot.via), JSON.stringify(r.body));
    r = await c.post('/api/app/joinvoo/disconnect', { channel_id: acct.id });
    assert.equal(r.status, 200); assert.equal(r.body.joinvoo_told, true);
    assert.deepEqual([J.disconnects[0].account_id, J.disconnects[0].link], ['5570001', LA], 'Joinvoo is told which account to answer again');
    assert.equal(db.one('SELECT status FROM channels WHERE id = ?', acct.id).status, 'deleted');
    const nosy = await h.login('nosy-bridge@example.com', 'password123');
    r = await nosy.post('/api/app/joinvoo/disconnect', { channel_id: bot.id });
    assert.equal(r.status, 404, 'another workspace can’t disconnect it');
  });

  test('moving from Joinvoo AI: its notes become the Closer’s knowledge (once)', async () => {
    let r = await jvCall('/hooks/joinvoo/import', { notes: { about: 'Running shoes for city runners', offer: 'Free delivery this week', tone: 'Warm and short', never: 'Never promise discounts' } }, { linkId: LA });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const cl = db.one('SELECT * FROM closers WHERE id = ?', r.body.closer_id);
    assert.match(cl.knowledge, /Imported from Joinvoo AI/); assert.match(cl.knowledge, /Free delivery this week/); assert.match(cl.instructions, /Never say: Never promise discounts/);
    const again = await jvCall('/hooks/joinvoo/import', { notes: { about: 'Running shoes for city runners', offer: 'Free delivery this week', tone: 'Warm and short', never: 'Never promise discounts' } }, { linkId: LA });
    assert.equal(again.body.already, true, 'the same notes twice are imported once');
    r = await jvCall('/hooks/joinvoo/import', { notes: {} }, { linkId: LA });
    assert.equal(r.status, 400);
    const nobody = await link('voo-nobody-import');
    r = await jvCall('/hooks/joinvoo/import', { notes: { about: 'x' } }, { linkId: nobody.linkId });
    assert.equal(r.status, 404); assert.equal(r.body.reason, 'no_account');
  });

  test('pay by card, bank or crypto from inside Joinvoo: a Replyvoo window that reports back only to Joinvoo; the webhook confirms', async () => {
    const c = await h.login('alice-bridge@example.com', 'password123');
    let r = await c.get('/pay/joinvoo?kind=plan&item=growth&interval=month');
    assert.equal(r.status, 200); assert.match(r.text, /REPLYVOO CHECKOUT · FROM JOINVOO/); assert.match(r.text, /Demo checkout/);
    const anon = h.client();
    r = await anon.get('/pay/joinvoo?kind=plan&item=growth&interval=month');
    assert.equal(r.status, 302); assert.match(r.location, /^\/auth\/voosquare\?return_to=/, 'not logged in: Voo login first, then back');
    r = await c.post('/pay/joinvoo', { kind: 'plan', item_id: 'growth', interval: 'month', provider: 'demo' }, { form: true });
    assert.equal(r.status, 302); assert.match(r.location, /^\/pay\/demo\/RV-/);
    const ref = r.location.split('/').pop();
    assert.equal(JSON.parse(db.one('SELECT meta FROM orders WHERE ref = ?', ref).meta).jv_return, true);
    // closed early: the return page says "pending" and posts only to Joinvoo's origin
    r = await c.get('/pay/joinvoo/done?ref=' + encodeURIComponent(ref));
    const origin = new URL(fakeUrl).origin;
    // The page carries data only (strict CSP: no inline script); /js/pay-done.js posts it to exactly that origin.
    const pd = JSON.parse(r.text.match(/<script type="application\/json" id="payDone">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(pd.msg, { type: 'replyvoo:checkout', ref, status: 'pending' });
    assert.equal(pd.origin, origin); assert.equal(pd.close, false);
    assert.match(r.text, /<script src="\/js\/pay-done\.js" defer><\/script>/);
    assert.match(r.headers.get('content-security-policy') || '', /script-src 'self'/);
    const pjs = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/pay-done.js'), 'utf8');
    assert.match(pjs, /postMessage\(d\.msg, d\.origin\)/); assert.ok(!/"\*"|'\*'/.test(pjs), 'never posted to every origin');
    // the payment confirms later (webhook): the plan is on and Joinvoo's status check shows it
    require('../src/services/payments').fulfill(ref, { via: 'demo' });
    const st = await jvCall('/hooks/joinvoo/status', {}, { linkId: LA });
    assert.equal(st.body.status.plan.id, 'growth'); assert.equal(st.body.status.state, 'plan', 'Joinvoo’s status shows “Plan active” by itself');
    r = await c.get('/pay/joinvoo/done?ref=' + encodeURIComponent(ref));
    assert.match(r.text, /"status":"paid"/); assert.match(r.text, /"close":true/);
    // the demo pay page sends people back to the Joinvoo return page
    r = await c.post('/pay/joinvoo', { kind: 'pack', item_id: String(db.one('SELECT id FROM packs WHERE active = 1 ORDER BY price LIMIT 1').id), provider: 'demo' }, { form: true });
    const ref2 = r.location.split('/').pop();
    r = await c.post('/pay/demo/' + ref2, {}, { form: true, headers: { origin: env.base } });
    assert.equal(r.location, '/pay/joinvoo/done?ref=' + encodeURIComponent(ref2));
    // someone else's order: not shown
    const nosy = await h.login('nosy-bridge@example.com', 'password123');
    r = await nosy.get('/pay/joinvoo/done?ref=' + encodeURIComponent(ref));
    assert.equal(r.status, 404);
  });
});
