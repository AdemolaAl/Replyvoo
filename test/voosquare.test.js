'use strict';
// VooSquare through the Voo Connect kit, against a fake VooSquare: "Continue with VooSquare" next to Replyvoo's own login,
// account linking rules, launcher return_to, logout everywhere, summary card, money and activity events, refunds and
// chargebacks, "you already have a Voo account", tool links and the Castvoo bridge.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const h = require('./helpers');

let ctx, voo, vs, base;
const CLIENT = 'vsc_replyvoo_test';
const SECRET = 'vss_' + 'q'.repeat(40);
const API_KEY = 'vsk_' + 'k'.repeat(40);
const codes = new Map(); // code -> user
const events = [];
const lookups = [];
const supportMsgs = [];
const vooEmails = new Set();
let eventsStatus = 200;

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(claims, secret = SECRET) {
  const head = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(claims);
  return head + '.' + crypto.createHmac('sha256', secret).update(head).digest('base64url');
}

before(async () => {
  ctx = await h.boot();
  vs = http.createServer((req, res) => {
    const u = new URL(req.url, base);
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      const keyOk = req.headers.authorization === 'Bearer ' + API_KEY;
      if (u.pathname === '/oauth/token') {
        const f = new URLSearchParams(body);
        if (f.get('client_id') !== CLIENT || f.get('client_secret') !== SECRET) return json({ error: 'invalid_client' }, 401);
        const p = codes.get(f.get('code'));
        if (!p) return json({ error: 'invalid_grant' }, 400);
        codes.delete(f.get('code'));
        const now = Math.floor(Date.now() / 1000);
        const user = { sub: p.voo_id, voo_id: p.voo_id, email: p.email, email_verified: p.email_verified !== false, name: p.name || 'Grace Lee', country: p.country || 'KE', voo_ref: p.voo_ref || '' };
        return json({ access_token: 'vsat.x', token_type: 'Bearer', expires_in: 3600, id_token: p.badToken ? idToken({ ...user, iss: base, aud: CLIENT, iat: now, exp: now + 300 }, 'wrong-secret') : idToken({ ...user, iss: base, aud: p.aud || CLIENT, iat: now, exp: now + 300 }), user });
      }
      if (u.pathname === '/api/v1/events') {
        if (!keyOk) return json({ error: 'bad key' }, 401);
        if (eventsStatus !== 200) return json({ error: 'down' }, eventsStatus);
        const list = JSON.parse(body).events || [];
        events.push(...list);
        return json({ stored: list.length, rejected: [] });
      }
      if (u.pathname === '/api/v1/users/lookup') {
        if (!keyOk) return json({ error: 'bad key' }, 401);
        const e = JSON.parse(body).email; lookups.push(e);
        return json({ voo_id_exists: vooEmails.has(e) });
      }
      if (u.pathname === '/api/v1/support/messages') {
        if (!keyOk) return json({ error: 'bad key' }, 401);
        supportMsgs.push(JSON.parse(body));
        return json({ ok: true, ticket_id: supportMsgs.length });
      }
      if (u.pathname.startsWith('/api/v1/users/')) return keyOk ? json({ error: 'not found' }, 404) : json({ error: 'bad key' }, 401);
      res.writeHead(404); res.end();
    });
  });
  await new Promise(r => vs.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + vs.address().port;
  voo = require('../src/services/voosquare');
});
after(async () => { await new Promise(r => vs.close(r)); await ctx.close(); });

function enable(extra = {}) { voo.setConfig({ on: true, base, clientId: CLIENT, clientSecret: SECRET, apiKey: API_KEY, signalSecret: 's'.repeat(32), redirectUri: 'http://localhost:3000/auth/voosquare/callback', ...extra }); }
function disable() { voo.setConfig({ base: '', clientId: '', clientSecret: '', apiKey: '' }); }

// The browser round trip: /auth/voosquare → (VooSquare login) → /auth/voosquare/callback.
async function vooLogin(c, user, { returnTo, signup, tamper, extraQuery = '' } = {}) {
  const start = await c.get('/auth/voosquare?' + (returnTo ? 'return_to=' + encodeURIComponent(returnTo) + '&' : '') + (signup ? 'signup=1&' : '') + extraQuery);
  assert.equal(start.status, 302, start.text);
  const auth = new URL(start.location);
  assert.equal(auth.origin + auth.pathname, base + '/oauth/authorize');
  assert.equal(auth.searchParams.get('client_id'), CLIENT);
  assert.equal(auth.searchParams.get('redirect_uri'), 'http://localhost:3000/auth/voosquare/callback');
  const code = 'code_' + crypto.randomBytes(6).toString('hex');
  codes.set(code, { ...user, badToken: tamper === 'signature', aud: tamper === 'audience' ? 'vsc_other' : undefined });
  const r = await c.get('/auth/voosquare/callback?code=' + code + '&state=' + encodeURIComponent(tamper === 'state' ? 'wrong' : auth.searchParams.get('state')));
  r.authorize = auth;
  return r;
}

test('switched off: no VooSquare button, /auth/voosquare falls back to the email login', async () => {
  disable();
  const c = h.client();
  const r = await c.get('/auth/voosquare');
  assert.equal(r.status, 302);
  assert.equal(r.location, '/app/login');
  assert.equal((await c.get('/api/public/site')).body.voo.enabled, false);
  assert.equal((await c.get('/voo-connect-browser.js')).text.includes('Voo Connect is off'), true);
});

test('switched on: Replyvoo keeps its own sign-up and login; VooSquare is offered next to them', async () => {
  enable();
  const c = h.client();
  assert.equal((await c.get('/api/public/site')).body.voo.enabled, true);
  // The login pages are NOT redirected any more.
  const page = await c.get('/app/login');
  assert.equal(page.status, 200);
  const s = await h.signup({ email: 'own-login@example.com' }, h.client());
  assert.ok(s.ws.id, 'password sign-up still works');
  const l = await h.client().post('/api/auth/login', { email: 'own-login@example.com', password: 'password123' });
  assert.equal(l.status, 200, l.text);
  // Public pages load the kit's snippet.
  assert.match((await c.get('/')).text, /\/voo-connect-browser\.js/);
});

test('a new Voo ID creates one account and workspace, keyed by voo_id; "Start free" asks VooSquare to sign up', async () => {
  enable();
  const c = h.client();
  const r = await vooLogin(c, { voo_id: 'voo_new_1', email: 'New.Person@Example.com', name: 'Mia Chen', country: 'ng', voo_ref: 'REF77' }, { signup: true, returnTo: '/app' });
  assert.equal(r.authorize.searchParams.get('prompt'), 'signup');
  assert.equal(r.status, 302, r.text);
  assert.equal(r.location, '/app/welcome');
  const u = ctx.db.one('SELECT * FROM users WHERE voo_id = ?', 'voo_new_1');
  assert.equal(u.email, 'new.person@example.com');
  assert.equal(u.country, 'NG');
  assert.equal(u.referred_by, 'REF77');
  assert.equal(u.email_verified, 1);
  assert.equal(ctx.db.one("SELECT COUNT(*) n FROM members WHERE user_id = ? AND role = 'owner'", u.id).n, 1);
  assert.equal((await c.get('/api/auth/me')).body.user.email, 'new.person@example.com');
  // Second login: same account, no second workspace, referral code never changes.
  const again = await vooLogin(h.client(), { voo_id: 'voo_new_1', email: 'new.person@example.com', voo_ref: 'OTHER' }, { returnTo: '/app/inbox' });
  assert.equal(again.location, '/app/inbox');
  assert.equal(ctx.db.one('SELECT COUNT(*) n FROM users WHERE voo_id = ?', 'voo_new_1').n, 1);
  assert.equal(ctx.db.one('SELECT COUNT(*) n FROM members WHERE user_id = ?', u.id).n, 1);
  assert.equal(ctx.db.one('SELECT referred_by FROM users WHERE id = ?', u.id).referred_by, 'REF77');
});

test('the launcher: return_to=/dashboard and unsafe addresses land on /app', async () => {
  enable();
  const r = await vooLogin(h.client(), { voo_id: 'voo_new_1', email: 'new.person@example.com' }, { returnTo: '/dashboard' });
  assert.equal(r.location, '/app');
  for (const bad of ['//evil.com/x', 'https://evil.com', '/app/login', '/\\evil.com']) {
    const x = await vooLogin(h.client(), { voo_id: 'voo_new_1', email: 'new.person@example.com' }, { returnTo: bad });
    assert.equal(x.location, '/app', bad);
  }
  assert.equal((await h.client().get('/dashboard')).location, '/app');
});

test('bad state, signature or audience are refused with "Login did not finish"', async () => {
  enable();
  for (const tamper of ['state', 'signature', 'audience']) {
    const r = await vooLogin(h.client(), { voo_id: 'voo_tamper', email: 'tamper@example.com' }, { tamper });
    assert.equal(r.status, 400, tamper);
    assert.match(r.text, /Login did not finish/);
    assert.match(r.text, /Log in with email/);
  }
  assert.equal(ctx.db.one('SELECT COUNT(*) n FROM users WHERE voo_id = ?', 'voo_tamper').n, 0);
  const cancelled = await h.client().get('/auth/voosquare/callback?error=access_denied&state=x');
  assert.equal(cancelled.status, 400);
});

test('linking an existing account: only by an email verified on both sides, never duplicated, never replaced', async () => {
  enable();
  // Verified here and in VooSquare: linked automatically, no second account.
  const s = await h.signup({ email: 'verified@example.com' }, h.client());
  ctx.db.run('UPDATE users SET email_verified = 1 WHERE id = ?', s.user.id);
  const r = await vooLogin(h.client(), { voo_id: 'voo_ver', email: 'VERIFIED@example.com' });
  assert.equal(r.status, 302, r.text);
  assert.equal(ctx.db.one('SELECT voo_id FROM users WHERE id = ?', s.user.id).voo_id, 'voo_ver');
  assert.equal(ctx.db.one("SELECT COUNT(*) n FROM users WHERE email = 'verified@example.com'").n, 1);
  assert.equal(ctx.db.one('SELECT COUNT(*) n FROM workspaces WHERE owner_id = ?', s.user.id).n, 1, 'keeps its own workspace');
  // A second Voo ID with the same email is refused (the account already has a Voo ID).
  const dup = await vooLogin(h.client(), { voo_id: 'voo_ver_2', email: 'verified@example.com' });
  assert.equal(dup.status, 409);
  // Not verified in Replyvoo: never linked, never duplicated.
  const un = await h.signup({ email: 'unverified@example.com' }, h.client());
  const r2 = await vooLogin(h.client(), { voo_id: 'voo_unv', email: 'unverified@example.com' });
  assert.equal(r2.status, 409);
  assert.match(r2.text, /Connect VooSquare/);
  assert.equal(ctx.db.one('SELECT voo_id FROM users WHERE id = ?', un.user.id).voo_id, null);
  assert.equal(ctx.db.one('SELECT COUNT(*) n FROM users WHERE voo_id = ?', 'voo_unv').n, 0);
  // Not verified in VooSquare: refused too.
  ctx.db.run('UPDATE users SET email_verified = 1 WHERE id = ?', un.user.id);
  const r3 = await vooLogin(h.client(), { voo_id: 'voo_unv', email: 'unverified@example.com', email_verified: false });
  assert.equal(r3.status, 409);
  assert.equal(ctx.db.one('SELECT voo_id FROM users WHERE id = ?', un.user.id).voo_id, null);
  // Staff accounts are never linked automatically.
  const admin = ctx.db.one("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
  ctx.db.run('UPDATE users SET email_verified = 1 WHERE id = ?', admin.id);
  const r4 = await vooLogin(h.client(), { voo_id: 'voo_admin', email: admin.email });
  assert.equal(r4.status, 409);
  assert.equal(ctx.db.one('SELECT voo_id FROM users WHERE id = ?', admin.id).voo_id, null);
});

test('"Connect VooSquare" from Settings links the account that is logged in (and only from that button)', async () => {
  enable();
  const s = await h.signup({ email: 'connect-me@example.com' }, h.client());
  // A Voo ID login without the button, while logged in: switches account, links nothing.
  const other = await vooLogin(s.client, { voo_id: 'voo_someone', email: 'someone@example.com' });
  assert.equal(other.status, 302);
  assert.equal(ctx.db.one('SELECT voo_id FROM users WHERE id = ?', s.user.id).voo_id, null);
  // Log back in with the password and press the button: the Voo ID (with ANOTHER email) is linked to THIS account.
  const c = h.client();
  assert.equal((await c.post('/api/auth/login', { email: 'connect-me@example.com', password: 'password123' })).status, 200);
  const link = await c.post('/api/auth/voosquare/link', { return_to: '/app/settings' });
  assert.equal(link.status, 200, link.text);
  assert.equal(link.body.url, '/auth/voosquare?return_to=%2Fapp%2Fsettings');
  const r = await vooLogin(c, { voo_id: 'voo_connect', email: 'my-voo-email@example.com' }, { returnTo: '/app/settings' });
  assert.equal(r.location, '/app/settings?voo=linked');
  assert.equal(ctx.db.one('SELECT voo_id FROM users WHERE id = ?', s.user.id).voo_id, 'voo_connect');
  assert.equal((await c.get('/api/auth/me')).body.user.email, 'connect-me@example.com', 'same session, same account');
  assert.equal((await c.post('/api/auth/voosquare/link', {})).status, 409, 'already connected');
  // That Voo ID cannot be connected to a second account.
  const s2 = await h.signup({ email: 'second@example.com' }, h.client());
  await s2.client.post('/api/auth/voosquare/link', {});
  assert.equal((await vooLogin(s2.client, { voo_id: 'voo_connect', email: 'my-voo-email@example.com' }, { returnTo: '/app/settings' })).status, 409);
  // The password keeps working after linking.
  assert.equal((await h.client().post('/api/auth/login', { email: 'connect-me@example.com', password: 'password123' })).status, 200);
});

test('"You already have a Voo account" is asked only after the email is verified', async () => {
  enable();
  vooEmails.add('has-voo@example.com');
  lookups.length = 0;
  const s = await h.signup({ email: 'has-voo@example.com' }, h.client());
  assert.equal(lookups.length, 0, 'never before the email is proved');
  const raw = crypto.randomBytes(16).toString('hex');
  ctx.db.insert('tokens', { user_id: s.user.id, kind: 'verify', token_hash: crypto.createHash('sha256').update(raw).digest('hex'), expires_at: new Date(Date.now() + 3600e3).toISOString(), created_at: ctx.db.now() });
  const r = await s.client.post('/api/auth/verify', { token: raw });
  assert.equal(r.status, 200);
  assert.equal(r.body.voo_account, true);
  assert.equal(r.body.connect_url, '/auth/voosquare?return_to=%2Fapp%2Fsettings');
  assert.deepEqual(lookups, ['has-voo@example.com']);
  // Then a Voo ID login with that (now verified) email connects this same account.
  const l = await vooLogin(h.client(), { voo_id: 'voo_has', email: 'has-voo@example.com' }, { returnTo: '/app/settings' });
  assert.equal(l.status, 302);
  assert.equal(ctx.db.one('SELECT voo_id FROM users WHERE id = ?', s.user.id).voo_id, 'voo_has');
  // An email without a Voo ID: nothing to say.
  const s3 = await h.signup({ email: 'no-voo@example.com' }, h.client());
  const raw3 = crypto.randomBytes(16).toString('hex');
  ctx.db.insert('tokens', { user_id: s3.user.id, kind: 'verify', token_hash: crypto.createHash('sha256').update(raw3).digest('hex'), expires_at: new Date(Date.now() + 3600e3).toISOString(), created_at: ctx.db.now() });
  assert.equal((await s3.client.post('/api/auth/verify', { token: raw3 })).body.voo_account, false);
});

test('logout ends the VooSquare session too (Voo ID accounts); a cross-site GET only asks', async () => {
  enable();
  const c = h.client();
  await vooLogin(c, { voo_id: 'voo_new_1', email: 'new.person@example.com' });
  const out = await c.post('/api/auth/logout');
  assert.equal(out.body.next, '/auth/voosquare/logout');
  const cross = await c.get('/logout', { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(cross.status, 200);
  assert.match(cross.text, /Log out of Replyvoo\?/);
  assert.equal((await c.get('/api/auth/me')).body.user.email, 'new.person@example.com', 'still logged in');
  const r = await c.get('/auth/voosquare/logout');
  assert.equal(r.status, 302);
  assert.equal(r.location, base + '/oauth/logout?redirect_uri=' + encodeURIComponent('http://localhost:3000/'));
  assert.equal((await c.get('/api/auth/me')).body.user, null);
  // A password account just logs out here.
  const s = await h.signup({}, h.client());
  assert.equal((await s.client.post('/api/auth/logout')).body.next, null);
});

test('summary card: API key, unknown users and real numbers', async () => {
  enable();
  const c = h.client();
  assert.equal((await c.get('/api/voosquare/summary?voo_id=voo_new_1')).status, 401);
  const auth = { headers: { authorization: 'Bearer ' + API_KEY } };
  assert.deepEqual((await c.get('/api/voosquare/summary?voo_id=nobody', auth)).body, { linked: false });
  const u = ctx.db.one('SELECT * FROM users WHERE voo_id = ?', 'voo_new_1');
  const w = ctx.db.one('SELECT * FROM workspaces WHERE owner_id = ?', u.id);
  const ch = ctx.db.insert('channels', { workspace_id: w.id, type: 'telegram_bot', name: 'Shop', username: 'mia_shop_bot', external_id: '991', created_at: ctx.db.now() });
  const ct = ctx.db.insert('contacts', { workspace_id: w.id, channel_id: ch, external_id: 'c1', name: 'Buyer', value: 120, created_at: ctx.db.now() });
  const th = ctx.db.insert('threads', { workspace_id: w.id, channel_id: ch, contact_id: ct, chat_id: 'c1', last_message_at: ctx.db.now(), created_at: ctx.db.now() });
  ctx.db.insert('messages', { workspace_id: w.id, thread_id: th, dir: 'out', author: 'ai', text: 'Hi!', created_at: ctx.db.now() });
  ctx.db.insert('events', { workspace_id: w.id, type: 'hot', text: 'x', data: '{}', created_at: ctx.db.now() });
  ctx.db.insert('events', { workspace_id: w.id, type: 'won', text: 'x', data: JSON.stringify({ contact_id: ct }), created_at: ctx.db.now() });
  const r = await c.get('/api/voosquare/summary?voo_id=voo_new_1&period=7d', auth);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.linked, true);
  assert.equal(r.body.status, 'trial');
  const m = Object.fromEntries(r.body.metrics.map(x => [x.key, x.value]));
  assert.deepEqual(m, { chats_answered: 1, leads_qualified: 1, sales_closed: 1, sales_usd: 120 });
  assert.equal(r.body.open_url, 'http://localhost:3000/app');
});

test('money events: plan (spend + plan_started, then plan_renewed), credit pack (wallet_topup), refund and chargeback', async () => {
  enable();
  events.length = 0;
  const payments = require('../src/services/payments');
  const u = ctx.db.one('SELECT * FROM users WHERE voo_id = ?', 'voo_new_1');
  const w = ctx.db.one('SELECT * FROM workspaces WHERE owner_id = ?', u.id);
  const mk = (kind, item, usd, ref) => { ctx.db.insert('orders', { ref, workspace_id: w.id, user_id: u.id, kind, item_id: item, item_name: kind === 'plan' ? 'Starter plan (monthly)' : '1,000 Voo Credits', interval: kind === 'plan' ? 'month' : '', amount_usd: usd, currency: 'USD', amount_local: usd, provider: 'demo', status: 'pending', created_at: ctx.db.now() }); payments.fulfill(ref, { via: 'test' }); };
  mk('plan', 'starter', 29, 'RV-TEST-PLAN1');
  mk('plan', 'starter', 29, 'RV-TEST-PLAN2');
  const pack = ctx.db.one('SELECT id FROM packs WHERE active = 1 ORDER BY price LIMIT 1');
  mk('pack', String(pack.id), 10, 'RV-TEST-PACK1');
  await voo.flush();
  const byId = Object.fromEntries(events.map(e => [e.event_id, e]));
  assert.equal(byId['rv_pay_RV-TEST-PLAN1'].type, 'spend');
  assert.equal(byId['rv_pay_RV-TEST-PLAN1'].value_usd, 29);
  assert.equal(byId['rv_pay_RV-TEST-PLAN1'].plan, 'Starter');
  assert.equal(byId['rv_pay_RV-TEST-PLAN1'].payment_ref, 'RV-TEST-PLAN1', 'kit 1.3.0: the spend carries the payment reference (never paid twice)');
  assert.ok(!('payment_ref' in byId['rv_plan_RV-TEST-PLAN1']), 'payment_ref only on the spend');
  assert.equal(byId['rv_plan_RV-TEST-PLAN1'].type, 'plan_started');
  assert.equal(byId['rv_renew_RV-TEST-PLAN2'].type, 'plan_renewed');
  assert.equal(byId['rv_topup_RV-TEST-PACK1'].type, 'wallet_topup');
  assert.ok(!byId['rv_pay_RV-TEST-PACK1'], 'credit packs are not a commissionable spend');
  for (const e of events) { assert.equal(e.voo_id, 'voo_new_1'); assert.ok(!/@/.test(JSON.stringify(e)), 'no emails'); }
  // Refund (commission stays) and chargeback (commission reversed), recorded by finance in the admin.
  const admin = await h.login(h.ADMIN.email, h.ADMIN.password);
  events.length = 0;
  const rf = await admin.post('/api/admin/orders/RV-TEST-PLAN2/refund', { note: 'asked within 7 days' });
  assert.equal(rf.status, 200, rf.text);
  assert.equal((await admin.post('/api/admin/orders/RV-TEST-PLAN2/refund', {})).body.already, true, 'once');
  const before = ctx.db.one('SELECT credits FROM workspaces WHERE id = ?', w.id).credits;
  assert.equal((await admin.post('/api/admin/orders/RV-TEST-PACK1/chargeback', {})).status, 200);
  assert.ok(ctx.db.one('SELECT credits FROM workspaces WHERE id = ?', w.id).credits < before, 'credits taken back');
  assert.equal((await admin.post('/api/admin/orders/RV-TEST-PLAN1/chargeback', { amount_usd: 29 })).status, 200);
  await voo.flush();
  const ev2 = Object.fromEntries(events.map(e => [e.event_id, e]));
  assert.equal(ev2['rv_rf_RV-TEST-PLAN2'].type, 'refund');
  assert.equal(ev2['rv_rf_RV-TEST-PLAN2'].original_event_id, 'rv_pay_RV-TEST-PLAN2');
  assert.equal(ev2['rv_cb_RV-TEST-PLAN1'].type, 'chargeback');
  assert.equal(ev2['rv_cb_RV-TEST-PLAN1'].original_event_id, 'rv_pay_RV-TEST-PLAN1');
  assert.ok(!ev2['rv_cb_RV-TEST-PACK1'], 'a wallet top-up had no commission to reverse');
  assert.equal(ctx.db.one("SELECT status FROM orders WHERE ref = 'RV-TEST-PLAN2'").status, 'refunded');
  assert.equal(ctx.db.one("SELECT status FROM orders WHERE ref = 'RV-TEST-PLAN1'").status, 'charged_back');
});

test('activity events: chats per hour with a count, hot leads and sales; nothing without a Voo ID; retried when VooSquare is down', async () => {
  enable();
  events.length = 0;
  const u = ctx.db.one('SELECT * FROM users WHERE voo_id = ?', 'voo_new_1');
  const w = ctx.db.one('SELECT * FROM workspaces WHERE owner_id = ?', u.id);
  voo.safeEmit(w.id, 'chat_answered', { channel: 'telegram_bot' });
  voo.safeEmit(w.id, 'chat_answered', { channel: 'telegram_bot' });
  voo.safeEmit(w.id, 'lead_qualified', { channel: 'website', key: 5 });
  voo.safeEmit(w.id, 'sale_closed', { channel: 'telegram_bot', key: 5, valueUsd: 64 });
  voo.flushActivity({ now: Date.now() + 3600e3 });
  eventsStatus = 503;
  await voo.flush();
  assert.equal(events.length, 0);
  eventsStatus = 200;
  const k = require('../src/lib/voo').get();
  for (const x of k.events.queue) x.next = 0; // skip the backoff in the test
  await voo.flush();
  const chats = events.find(e => e.type === 'chat_answered');
  assert.equal(chats.label, 'Closers answered 2 new chats');
  assert.equal(events.find(e => e.type === 'lead_qualified').label, 'New hot lead on website');
  assert.equal(events.find(e => e.type === 'sale_closed').value_usd, 64);
  // A workspace whose owner has no Voo ID sends nothing.
  const s = await h.signup({}, h.client());
  assert.equal(voo.safeEmit(s.ws.id, 'lead_qualified', { key: 1 }), null);
});

test('tool links: switched on with a scoped key, revoked when switched off; Castvoo replies reach the Closer', async () => {
  enable();
  const c = h.client();
  const auth = { headers: { authorization: 'Bearer ' + API_KEY } };
  const scoped = 'lnk_' + crypto.randomBytes(20).toString('hex');
  assert.equal((await c.post('/api/voosquare/links', { voo_id: 'voo_new_1', link: 'castvoo-replyvoo', key: scoped })).status, 401);
  assert.equal((await c.post('/api/voosquare/links', { voo_id: 'voo_new_1', link: 'nope', key: scoped }, auth)).status, 400);
  assert.equal((await c.post('/api/voosquare/links', { voo_id: 'voo_new_1', link: 'castvoo-replyvoo', key: scoped }, auth)).status, 200);
  const call = (key, body) => c.post('/api/voosquare/inbound/castvoo', body, { headers: { authorization: 'Bearer ' + key } });
  assert.equal((await call('wrong-key', { chat_id: 1, text: 'hi' })).status, 401);
  assert.equal((await call(scoped, { chat_id: 1, text: 'Price?', bot_username: 'not_connected_bot' })).status, 409);
  const u = ctx.db.one('SELECT * FROM users WHERE voo_id = ?', 'voo_new_1');
  const w = ctx.db.one('SELECT * FROM workspaces WHERE owner_id = ?', u.id);
  ctx.db.insert('channels', { workspace_id: w.id, type: 'telegram_bot', name: 'Shop', username: 'MiaShopBot', external_id: '777', created_at: ctx.db.now() });
  const ok = await call(scoped, { chat_id: 4242, text: 'How much is the bundle?', bot_id: '777', from: { id: 4242, name: 'Buyer' } });
  assert.equal(ok.status, 200, ok.text);
  assert.ok(ctx.db.one("SELECT id FROM messages WHERE workspace_id = ? AND dir = 'in' AND text = 'How much is the bundle?'", w.id));
  await c.post('/api/voosquare/links', { voo_id: 'voo_new_1', link: 'castvoo-replyvoo', enabled: false }, auth);
  assert.equal((await call(scoped, { chat_id: 4242, text: 'again', bot_id: '777' })).status, 401);
});

test('affiliate click: ref / vclick / coupon on a landing page are kept and handed to VooSquare', async () => {
  enable();
  const c = h.client();
  const land = await c.get('/pricing?ref=aff42&vclick=vc_123&coupon=SAVE10');
  assert.equal(land.status, 200);
  assert.ok(c.jar.has('voo_attr'), 'kept in the voo_attr cookie');
  const start = await c.get('/auth/voosquare?signup=1');
  const q = new URL(start.location).searchParams;
  assert.equal(q.get('ref'), 'aff42');
  assert.equal(q.get('vclick'), 'vc_123');
  assert.equal(q.get('coupon'), 'SAVE10');
  // Replyvoo's own Voo Squad links never use ?ref=.
  const ws = ctx.db.one('SELECT ref_code FROM workspaces LIMIT 1');
  assert.equal((await h.client().get('/r/' + ws.ref_code)).location, '/?invite=' + ws.ref_code);
});

test('admin Connections: owners save VooSquare keys (never shown back) and test them', async () => {
  disable();
  const admin = await h.login(h.ADMIN.email, h.ADMIN.password);
  const r = await admin.put('/api/admin/connections/voosquare', { enabled: true, base, client_id: CLIENT, client_secret: SECRET, api_key: API_KEY, signal_secret: 'z'.repeat(32) });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.voosquare.login, true);
  assert.ok(!JSON.stringify(r.body).includes(SECRET) && !JSON.stringify(r.body).includes(API_KEY), 'secrets never sent back');
  assert.equal(r.body.voosquare.api_key_hint, '…' + API_KEY.slice(-4));
  assert.ok(!ctx.db.one("SELECT value FROM settings WHERE key = 'voo_keys'").value.includes(SECRET), 'stored encrypted');
  assert.equal(voo.enabled(), true, 'saved settings switch login on without a restart');
  assert.equal((await admin.post('/api/admin/connections/voosquare/test')).body.ok, true);
  assert.equal((await admin.put('/api/admin/connections/voosquare', { base: 'not a url' })).status, 400);
  // Switched off in the admin: Replyvoo's own login stays, the VooSquare button goes.
  await admin.put('/api/admin/connections/voosquare', { enabled: false });
  assert.equal(voo.enabled(), false);
  ctx.db.run("DELETE FROM settings WHERE key = 'voo_keys'");
  require('../src/lib/voo').reset();
});

test('payment methods follow the country', () => {
  const config = require('../src/config');
  const { providers } = require('../src/services/payments');
  const settings = require('../src/services/settings');
  const prev = { ...config.pay };
  const b = settings.get('billing');
  config.pay.paystackSecret = 'sk'; config.pay.flwSecret = 'fk';
  settings.set('billing', { ...b, crypto_enabled: true, crypto_wallet: 'T123' });
  try {
    const ids = cc => providers(cc).map(p => p.id).filter(x => x !== 'demo');
    assert.equal(ids('NG')[0], 'paystack');
    assert.ok(!ids('CM').includes('paystack'));
    assert.equal(ids('CM')[0], 'flutterwave');
    assert.ok(!ids('GB').includes('paystack'));
    assert.ok(['crypto', 'gatevoo'].includes(ids('GB')[0]), 'crypto first outside Africa');
    assert.ok(ids('').includes('paystack'));
  } finally { Object.assign(config.pay, prev); settings.set('billing', b); }
});
