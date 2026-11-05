'use strict';
// Update 68: "Set up your AI" from inside Joinvoo. Joinvoo's wizard reads and writes the basics of the Closer for one bot (what the
// business sells, the link, tone, language, on/off) over the signed bridge, and one "Connect" tap there makes the free Replyvoo
// account. Replyvoo stays the only place these settings live: what the owner changes in the Studio shows in Joinvoo next time.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const h = require('./helpers');

const APP_SECRET = 'setup-app-secret-for-tests-0123456789';
let env, db, jv;
const LINKS = {};

async function jvCall(path, body, o = {}) {
  const raw = JSON.stringify(body || {});
  const linkId = o.linkId || 'app', key = o.key || (linkId === 'app' ? APP_SECRET : LINKS[linkId]);
  const ts = String(Date.now()), nonce = crypto.randomBytes(16).toString('hex');
  const sig = jv.signature(key, o.dir || 'jv>rv', ts, nonce, 'POST', path, raw);
  const r = await h.realFetch(env.base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-voo-link': linkId, 'x-voo-ts': ts, 'x-voo-nonce': nonce, 'x-voo-sig': sig }, body: raw });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function link(vooId) {
  const linkId = 'jvl_' + crypto.randomBytes(9).toString('base64url'), secret = crypto.randomBytes(32).toString('hex');
  const r = await jvCall('/hooks/joinvoo/link', { link_id: linkId, secret, voo_id: vooId, account: 'jv:test' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  LINKS[linkId] = secret;
  return linkId;
}
const basics = (lk, extra = {}) => jvCall('/hooks/joinvoo/basics', { bot_id: '8101', ...extra }, { linkId: lk });
const save = (lk, b, extra = {}) => jvCall('/hooks/joinvoo/basics/save', { bot_id: '8101', basics: b, ...extra }, { linkId: lk });

before(async () => {
  process.env.JOINVOO_BRIDGE_SECRET = APP_SECRET;
  process.env.JOINVOO_URL = 'http://127.0.0.1:9'; // never called in these tests
  env = await h.boot();
  db = env.db;
  jv = require('../src/services/joinvoo');
});
after(async () => { await env.close(); delete process.env.JOINVOO_URL; delete process.env.JOINVOO_BRIDGE_SECRET; });

describe('joinvoo: set up your AI', () => {
  let L;

  test('unsigned or wrongly signed calls are refused', async () => {
    L = await link('voo-setup-1');
    let r = await jvCall('/hooks/joinvoo/basics', { bot_id: '8101' }, { linkId: L, key: 'not-the-link-secret-not-the-link-secret' });
    assert.equal(r.status, 401);
    r = await jvCall('/hooks/joinvoo/basics/save', { bot_id: '8101', basics: { sells: 'x' } }, { linkId: L, dir: 'rv>jv' });
    assert.equal(r.status, 401, 'a signature for the other direction is never accepted');
    r = await jvCall('/hooks/joinvoo/account', { consent: true, email: 'a@b.co', email_verified: true }, { linkId: 'app' });
    assert.equal(r.status, 401, 'the shared app secret only makes links');
  });

  test('no Replyvoo account yet: basics say so', async () => {
    const r = await basics(L);
    assert.equal(r.status, 404); assert.equal(r.body.reason, 'no_account'); assert.equal(r.body.status.account, false);
    const s = await save(L, { sells: 'Fitness plans' });
    assert.equal(s.status, 404); assert.equal(s.body.reason, 'no_account');
  });

  test('one Connect tap makes the free account, only with consent and a confirmed email, never over another account', async () => {
    let r = await jvCall('/hooks/joinvoo/account', { email: 'coach@example.com', email_verified: true }, { linkId: L });
    assert.equal(r.status, 400); assert.equal(r.body.reason, 'consent');
    r = await jvCall('/hooks/joinvoo/account', { consent: true, email: 'coach@example.com', email_verified: false }, { linkId: L });
    assert.equal(r.status, 409); assert.equal(r.body.reason, 'need_login', 'an unconfirmed email goes the usual Voo-login way');
    h.makeWorkspace({ email: 'taken@example.com' });
    r = await jvCall('/hooks/joinvoo/account', { consent: true, email: 'Taken@Example.com', email_verified: true }, { linkId: L });
    assert.equal(r.status, 409); assert.equal(r.body.reason, 'email_exists', 'an existing Replyvoo account is never taken over');
    assert.equal(db.one("SELECT voo_id FROM users WHERE email = 'taken@example.com'").voo_id, null);
    r = await jvCall('/hooks/joinvoo/account', { consent: true, consent_at: Date.now(), terms: '2026-11', email: 'coach@example.com', email_verified: true, name: 'Coach <b>Kim</b>', country: 'ke' }, { linkId: L });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.created, true);
    assert.equal(r.body.status.account, true); assert.equal(r.body.status.workspace, true); assert.equal(r.body.status.state, 'free'); assert.equal(r.body.status.chats_left, 30);
    const u = db.one("SELECT * FROM users WHERE voo_id = 'voo-setup-1'");
    assert.equal(u.email, 'coach@example.com'); assert.equal(u.password_hash, ''); assert.equal(u.country, 'KE'); assert.ok(!/[<>]/.test(u.name));
    assert.ok(db.one("SELECT 1 FROM audit WHERE user_id = ? AND action = 'joinvoo.account'", u.id), 'the consent is recorded');
    assert.ok(db.one("SELECT 1 FROM workspaces WHERE owner_id = ? AND status = 'active'", u.id), 'with its own workspace on the free plan');
    r = await jvCall('/hooks/joinvoo/account', { consent: true, email: 'coach@example.com', email_verified: true }, { linkId: L });
    assert.equal(r.status, 200); assert.equal(r.body.created, false, 'a second tap changes nothing');
    assert.equal(db.one("SELECT COUNT(*) n FROM users WHERE voo_id = 'voo-setup-1'").n, 1);
  });

  test('a fresh account has no AI yet; saving the wizard makes it, and reads back the same', async () => {
    let r = await basics(L);
    assert.equal(r.status, 200); assert.equal(r.body.configured, false); assert.equal(r.body.basics, null);
    r = await save(L, { sells: 'A 30-day home workout plan', link: 'https://shop.example.com/plan', tone: 'professional', lang: 'es' }, { on: true });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.created, true);
    assert.deepEqual(r.body.basics, { sells: 'A 30-day home workout plan', link: 'https://shop.example.com/plan', tone: 'professional', lang: 'es', on: true });
    const c = db.one('SELECT * FROM closers WHERE id = ?', r.body.closer.id);
    assert.equal(c.pay_link, 'https://shop.example.com/plan'); assert.match(c.knowledge, /^What we sell: A 30-day home workout plan$/m);
    assert.equal(JSON.parse(c.persona).lang, 'es'); assert.equal(JSON.parse(c.skills).paylink, true); assert.equal(c.active, 1);
    assert.match(r.body.advanced_url, /\/auth\/voosquare\?return_to=%2Fapp%2Fstudio%3Fid%3D\d+$/, 'Advanced settings opens this Closer in the Studio, logged in');
    const again = await basics(L);
    assert.deepEqual(again.body.basics, r.body.basics, 'read back the same');
    // The AI really uses it: Spanish first, the payment link, the formal tone.
    const ai = require('../src/services/ai');
    const sp = ai.systemPrompt(require('../src/services/engine').loadCloser(c.id), 'Coach', 'telegram', null);
    assert.match(sp, /Reply in Spanish\./); assert.match(sp, /polished and formal/); assert.match(sp, /shop\.example\.com\/plan/);
  });

  test('the wizard fills only what it owns: other knowledge, the name and Studio tuning stay', async () => {
    const r0 = await basics(L), id = r0.body.closer.id;
    db.update('closers', id, { name: 'Rosie', knowledge: 'What we sell: old line\n\nOpening hours: 9 to 5.\nRefunds within 14 days.', persona: JSON.stringify({ tone: 50, length: 50, emoji: 30, human: true, lang: 'es', style: 'hey hey' }) });
    let r = await basics(L);
    assert.equal(r.body.basics.sells, 'old line'); assert.equal(r.body.basics.tone, 'custom', 'a tone tuned in the Studio shows as custom');
    r = await save(L, { sells: 'New plan', link: 'https://shop.example.com/plan', tone: 'custom', lang: 'es' });
    assert.equal(r.status, 200);
    const c = db.one('SELECT * FROM closers WHERE id = ?', id);
    assert.equal(c.name, 'Rosie'); assert.match(c.knowledge, /^What we sell: New plan$/m); assert.match(c.knowledge, /Opening hours: 9 to 5\./); assert.match(c.knowledge, /Refunds within 14 days/);
    assert.equal((c.knowledge.match(/What we sell:/g) || []).length, 1);
    const p = JSON.parse(c.persona); assert.equal(p.tone, 50); assert.equal(p.length, 50); assert.equal(p.style, 'hey hey', '“custom” keeps the Studio tone');
    r = await save(L, { sells: 'New plan', link: '', tone: 'short', lang: 'auto' });
    const c2 = db.one('SELECT * FROM closers WHERE id = ?', id), p2 = JSON.parse(c2.persona);
    assert.equal(r.body.basics.tone, 'short'); assert.equal(r.body.basics.lang, 'auto'); assert.equal(p2.lang, undefined); assert.equal(c2.pay_link, '');
    assert.equal(p2.style, 'hey hey');
  });

  test('edits made in Replyvoo show the next time Joinvoo loads the wizard', async () => {
    const owner = db.one("SELECT * FROM users WHERE voo_id = 'voo-setup-1'");
    db.update('users', owner.id, { password_hash: require('../src/lib/security').hashPassword('password123') });
    const app = await h.login('coach@example.com', 'password123');
    const id = (await basics(L)).body.closer.id;
    await save(L, { sells: 'New plan', link: 'https://shop.example.com/plan', tone: 'friendly', lang: 'fr' });
    const cur = (await app.get('/api/app/closers')).body.find(c => c.id === id);
    const put = await app.put('/api/app/closers/' + id, { ...cur, persona: { tone: 85, length: 60, emoji: 0 }, pay_link: 'https://new.example.com/checkout', knowledge: 'What we sell: Edited in the Studio\n\nFAQ: yes.' });
    assert.equal(put.status, 200, put.text);
    const r = await basics(L);
    assert.deepEqual(r.body.basics, { sells: 'Edited in the Studio', link: 'https://new.example.com/checkout', tone: 'professional', lang: 'fr', on: true }, 'the language set in Joinvoo survives a Studio save');
  });

  test('length limits, bad links and an empty answer are refused with a field name', async () => {
    let r = await save(L, { sells: 'x'.repeat(501) });
    assert.equal(r.status, 400); assert.equal(r.body.field, 'sells');
    r = await save(L, { sells: '  ' });
    assert.equal(r.status, 400); assert.equal(r.body.reason, 'required');
    for (const bad of ['javascript:alert(1)', 'ftp://x.example.com', 'shop.example.com', 'https://a b.com', 'https://x.example.com/' + 'a'.repeat(500)]) {
      r = await save(L, { sells: 'ok', link: bad });
      assert.equal(r.status, 400, bad); assert.equal(r.body.field, 'link');
    }
    r = await save(L, { sells: 'line one\nline two\u0007', link: 'https://ok.example.com' });
    assert.equal(r.status, 200); assert.equal(r.body.basics.sells, 'line one line two', 'one tidy line');
  });

  test('the bot switched to Replyvoo gets this Closer; another account’s link only ever sees its own', async () => {
    const sw = await jvCall('/hooks/joinvoo/bot', { bot_id: '8101', username: 'fit_bot', name: 'Fit', on: true }, { linkId: L });
    assert.equal(sw.status, 200, JSON.stringify(sw.body));
    const mine = (await basics(L)).body;
    assert.equal(mine.channel.on, true); assert.equal(mine.channel.closer_id, mine.closer.id);
    const L2 = await link('voo-setup-2');
    const other = h.makeWorkspace({ email: 'other-setup@example.com' });
    db.update('users', other.user.id, { voo_id: 'voo-setup-2' });
    const r = await basics(L2);
    assert.equal(r.status, 200); assert.equal(r.body.configured, false, 'nothing of the first account leaks'); assert.equal(r.body.channel, null);
    const s = await save(L2, { sells: 'Shoes' });
    assert.equal(s.status, 200);
    assert.equal(db.one('SELECT workspace_id FROM closers WHERE id = ?', s.body.closer.id).workspace_id, other.ws.id);
    assert.notEqual(s.body.closer.id, mine.closer.id);
  });

  test('rate limited per link', async () => {
    let last;
    for (let i = 0; i < 6; i++) last = await jvCall('/hooks/joinvoo/account', { consent: true, email: 'coach@example.com', email_verified: true }, { linkId: L });
    assert.equal(last.status, 429);
  });
});
