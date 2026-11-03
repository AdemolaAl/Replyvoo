'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let env, db;
const { sha256, token, verifyPassword } = require('../src/lib/security');

function rawToken(userId, kind, hours = 1) {
  const raw = token(32);
  db.insert('tokens', { user_id: userId, kind, token_hash: sha256(raw), data: '{}', expires_at: new Date(Date.now() + hours * 3600e3).toISOString(), created_at: db.now() });
  return raw;
}
function rawInvite(wsId, email, role = 'agent', hours = 24) {
  const raw = token(32);
  db.insert('invites', { workspace_id: wsId, email, role, token_hash: sha256(raw), expires_at: new Date(Date.now() + hours * 3600e3).toISOString(), created_at: db.now() });
  return raw;
}

before(async () => { env = await h.boot(); db = env.db; });
after(() => env.close());

describe('signup', () => {
  test('validates email and password', async () => {
    const c = h.client();
    let r = await c.post('/api/auth/signup', { email: 'not-an-email', password: 'password123' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /valid email/);
    r = await c.post('/api/auth/signup', { email: 'short@example.com', password: 'short' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /8 characters/);
    r = await c.post('/api/auth/signup', { email: 'a@b.c', password: 'password123' });
    assert.equal(r.status, 400, 'single-letter TLD is rejected');
    assert.equal(db.one('SELECT COUNT(*) n FROM users WHERE email IN (?, ?)', 'short@example.com', 'a@b.c').n, 0);
  });

  test('creates user, workspace on free plan, owner membership, session and emails', async () => {
    const c = h.client();
    const r = await c.post('/api/auth/signup', { email: '  New.Person@Example.com ', password: 'password123', name: 'Nora Bello', business: 'Nora Wigs', moji: { gender: 'female', skin: 99 } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.user.email, 'new.person@example.com');
    assert.ok(c.jar.has('rv_s'), 'session cookie set');
    const u = db.one('SELECT * FROM users WHERE email = ?', 'new.person@example.com');
    assert.ok(u);
    assert.equal(u.role, 'user');
    assert.equal(u.email_verified, 0);
    assert.ok(verifyPassword('password123', u.password_hash));
    assert.equal(JSON.parse(u.moji).skin, 4, 'moji cleaned');
    const w = db.one('SELECT * FROM workspaces WHERE owner_id = ?', u.id);
    assert.equal(w.name, 'Nora Wigs');
    assert.equal(w.plan_id, 'spark');
    assert.equal(w.conv_used, 0);
    assert.equal(w.credits, 0, 'no signup bonus by default, no referral');
    assert.ok(new Date(w.period_end) > new Date());
    assert.equal(db.one('SELECT role FROM members WHERE workspace_id = ? AND user_id = ?', w.id, u.id).role, 'owner');
    assert.equal(db.one('SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND workspace_id = ?', u.id, w.id).n, 1);
    await h.waitFor(() => h.emails(u.email, 'verify-email').length && h.emails(u.email, 'welcome').length, { label: 'signup emails' });
    assert.equal(db.one('SELECT COUNT(*) n FROM tokens WHERE user_id = ? AND kind = \'verify\'', u.id).n, 1);
    const me = await c.get('/api/auth/me');
    assert.equal(me.body.user.email, u.email);
    assert.equal(me.body.workspace_id, w.id);
    const boot = await c.get('/api/app/bootstrap');
    assert.equal(boot.status, 200);
    assert.equal(boot.body.role, 'owner');
    assert.equal(boot.body.usage.plan.id, 'spark');
  });

  test('duplicate email (any case) is 409', async () => {
    const r = await h.client().post('/api/auth/signup', { email: 'NEW.PERSON@example.com', password: 'password123' });
    assert.equal(r.status, 409);
    assert.equal(db.one('SELECT COUNT(*) n FROM users WHERE email = ?', 'new.person@example.com').n, 1);
  });

  test('sign-ups can be paused by the signup flag', async () => {
    const settings = require('../src/services/settings');
    settings.set('flags', { features: { signup: false } });
    try {
      const r = await h.client().post('/api/auth/signup', { email: 'paused@example.com', password: 'password123' });
      assert.equal(r.status, 403);
      assert.equal(db.one('SELECT id FROM users WHERE email = ?', 'paused@example.com'), null);
    } finally { settings.set('flags', {}); }
  });
});

describe('login / logout / csrf', () => {
  test('mutating /api requests need the x-rv header', async () => {
    const c = h.client();
    let r = await c.post('/api/auth/login', { email: h.DEMO.email, password: h.DEMO.password }, { csrf: false });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /header/);
    assert.ok(!c.jar.has('rv_s'));
    r = await c.req('POST', '/api/auth/login', { email: h.DEMO.email, password: h.DEMO.password }, { headers: { 'x-rv': '0' }, csrf: false });
    assert.equal(r.status, 403);
  });

  test('wrong password / unknown email are 401', async () => {
    const c = h.client();
    let r = await c.post('/api/auth/login', { email: h.DEMO.email, password: 'nope-nope' });
    assert.equal(r.status, 401);
    r = await c.post('/api/auth/login', { email: 'ghost@example.com', password: 'whatever1' });
    assert.equal(r.status, 401);
    r = await c.post('/api/auth/login', {});
    assert.equal(r.status, 401);
    assert.ok(!c.jar.has('rv_s'));
  });

  test('login (case-insensitive email), me, logout', async () => {
    const c = h.client();
    const r = await c.post('/api/auth/login', { email: 'DEMO@replyvoo.com', password: h.DEMO.password });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.email, h.DEMO.email);
    const uid = r.body.user.id;
    assert.ok(db.one('SELECT last_login FROM users WHERE id = ?', uid).last_login);
    const before = db.one('SELECT COUNT(*) n FROM sessions WHERE user_id = ?', uid).n;
    let me = await c.get('/api/auth/me');
    assert.equal(me.body.user.id, uid);
    assert.ok(me.body.workspace_id);
    const lo = await c.post('/api/auth/logout');
    assert.equal(lo.status, 200);
    assert.equal(db.one('SELECT COUNT(*) n FROM sessions WHERE user_id = ?', uid).n, before - 1);
    me = await c.get('/api/auth/me');
    assert.equal(me.body.user, null);
    const app = await c.get('/api/app/bootstrap');
    assert.equal(app.status, 401);
  });

  test('a stolen-but-deleted session cookie no longer works', async () => {
    const c = await h.login(h.DEMO.email, h.DEMO.password);
    const raw = decodeURIComponent(c.jar.get('rv_s'));
    db.run('DELETE FROM sessions WHERE id = ?', sha256(raw));
    assert.equal((await c.get('/api/app/bootstrap')).status, 401);
  });

  test('expired sessions are ignored', async () => {
    const c = await h.login(h.DEMO.email, h.DEMO.password);
    const raw = decodeURIComponent(c.jar.get('rv_s'));
    db.run('UPDATE sessions SET expires_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), sha256(raw));
    assert.equal((await c.get('/api/auth/me')).body.user, null);
  });
});

describe('forgot / reset / verify', () => {
  let user;
  before(async () => { user = (await h.signup({ email: 'resetme@example.com' })).user; });

  test('forgot creates a 1h reset token and logs the email; unknown email still ok', async () => {
    const c = h.client();
    let r = await c.post('/api/auth/forgot', { email: 'RESETME@example.com' });
    assert.equal(r.status, 200);
    const t = db.one('SELECT * FROM tokens WHERE user_id = ? AND kind = \'reset\'', user.id);
    assert.ok(t);
    const ttl = new Date(t.expires_at) - new Date(t.created_at);
    assert.ok(ttl > 59 * 60e3 && ttl <= 3600e3 + 1000, 'expires in ~1h');
    await h.waitFor(() => h.emails(user.email, 'password-reset').length, { label: 'reset email' });
    const n = db.one('SELECT COUNT(*) n FROM tokens').n;
    r = await c.post('/api/auth/forgot', { email: 'nobody@example.com' });
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT COUNT(*) n FROM tokens').n, n, 'no token for unknown email');
  });

  test('reset token works once, logs out other sessions, starts a new one', async () => {
    const old = await h.login('resetme@example.com', 'password123');
    const raw = rawToken(user.id, 'reset');
    const c = h.client();
    let r = await c.post('/api/auth/reset', { token: raw, password: 'short' });
    assert.equal(r.status, 400, 'short password rejected before the token is consumed');
    r = await c.post('/api/auth/reset', { token: raw, password: 'brandnew123' });
    assert.equal(r.status, 200, r.text);
    assert.ok(c.jar.has('rv_s'));
    assert.equal((await c.get('/api/auth/me')).body.user.id, user.id);
    assert.equal((await old.get('/api/auth/me')).body.user, null, 'old session revoked');
    r = await h.client().post('/api/auth/reset', { token: raw, password: 'another123' });
    assert.equal(r.status, 400, 'token is single use');
    assert.ok(verifyPassword('brandnew123', db.one('SELECT password_hash FROM users WHERE id = ?', user.id).password_hash));
    assert.equal((await h.client().post('/api/auth/login', { email: 'resetme@example.com', password: 'password123' })).status, 401);
    await h.login('resetme@example.com', 'brandnew123');
  });

  test('expired, wrong-kind and garbage reset tokens are rejected', async () => {
    const expired = rawToken(user.id, 'reset', -1);
    let r = await h.client().post('/api/auth/reset', { token: expired, password: 'whatever123' });
    assert.equal(r.status, 400);
    const verifyTok = rawToken(user.id, 'verify');
    r = await h.client().post('/api/auth/reset', { token: verifyTok, password: 'whatever123' });
    assert.equal(r.status, 400, 'a verify token cannot reset a password');
    r = await h.client().post('/api/auth/reset', { token: 'garbage', password: 'whatever123' });
    assert.equal(r.status, 400);
    r = await h.client().post('/api/auth/reset', { password: 'whatever123' });
    assert.equal(r.status, 400);
  });

  test('verify email marks the user verified, once', async () => {
    const raw = rawToken(user.id, 'verify', 24);
    let r = await h.client().post('/api/auth/verify', { token: raw });
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT email_verified FROM users WHERE id = ?', user.id).email_verified, 1);
    r = await h.client().post('/api/auth/verify', { token: raw });
    assert.equal(r.status, 400);
    r = await h.client().post('/api/auth/verify', { token: rawToken(user.id, 'verify', -1) });
    assert.equal(r.status, 400, 'expired');
  });

  test('resend-verify needs login and sends only when unverified', async () => {
    assert.equal((await h.client().post('/api/auth/resend-verify')).status, 401);
    const { client: c, user: u } = await h.signup();
    await h.waitFor(() => h.emails(u.email, 'verify-email').length === 1);
    assert.equal((await c.post('/api/auth/resend-verify')).status, 200);
    await h.waitFor(() => h.emails(u.email, 'verify-email').length === 2, { label: 'resent verify' });
  });
});

describe('suspended users', () => {
  test('admin suspension revokes sessions and blocks login', async () => {
    const { client: c, user } = await h.signup({ email: 'bad.actor@example.com' });
    const admin = await h.login(h.ADMIN.email, h.ADMIN.password);
    const r = await admin.put('/api/admin/users/' + user.id, { suspended: true });
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT suspended FROM users WHERE id = ?', user.id).suspended, 1);
    assert.equal(db.one('SELECT COUNT(*) n FROM sessions WHERE user_id = ?', user.id).n, 0);
    assert.equal((await c.get('/api/auth/me')).body.user, null);
    const l = await h.client().post('/api/auth/login', { email: user.email, password: 'password123' });
    assert.equal(l.status, 403);
    assert.match(l.body.error, /suspended/);
    // A session that somehow survives is still ignored while suspended.
    db.run('UPDATE users SET suspended = 0 WHERE id = ?', user.id);
    const c2 = await h.login(user.email, 'password123');
    db.run('UPDATE users SET suspended = 1 WHERE id = ?', user.id);
    assert.equal((await c2.get('/api/auth/me')).body.user, null);
    // Forgot-password does not mail suspended users.
    await c2.post('/api/auth/forgot', { email: user.email });
    assert.equal(db.one('SELECT COUNT(*) n FROM tokens WHERE user_id = ? AND kind = \'reset\'', user.id).n, 0);
  });

  test('admins cannot suspend themselves', async () => {
    const admin = await h.login(h.ADMIN.email, h.ADMIN.password);
    const me = (await admin.get('/api/auth/me')).body.user;
    const r = await admin.put('/api/admin/users/' + me.id, { suspended: true });
    assert.equal(r.status, 400);
  });
});

describe('team invites', () => {
  let owner, wsId;
  before(async () => {
    owner = await h.login(h.DEMO.email, h.DEMO.password);
    wsId = db.one('SELECT id FROM workspaces WHERE name = ?', 'Glow Labs').id;
  });

  test('owner invites by email: invite row + email, seat limit enforced', async () => {
    let r = await owner.post('/api/app/team/invite', { email: 'Agent.One@Example.com', role: 'agent' });
    assert.equal(r.status, 200, r.text);
    const inv = db.one('SELECT * FROM invites WHERE email = ?', 'agent.one@example.com');
    assert.ok(inv);
    assert.equal(inv.workspace_id, wsId);
    assert.equal(inv.role, 'agent');
    await h.waitFor(() => h.emails('agent.one@example.com', 'team-invite').length, { label: 'invite email' });
    r = await owner.post('/api/app/team/invite', { email: 'bad' });
    assert.equal(r.status, 400);
    // Spark plan has a single seat: the owner.
    const { client: solo } = await h.signup();
    r = await solo.post('/api/app/team/invite', { email: 'friend@example.com' });
    assert.equal(r.status, 402);
    assert.equal(r.body.code, 'seat_limit');
  });

  test('accept as a brand-new user', async () => {
    const raw = rawInvite(wsId, 'newbie@example.com', 'agent');
    const c = h.client();
    let r = await c.get('/api/auth/invite?token=' + encodeURIComponent(raw));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { email: 'newbie@example.com', workspace: 'Glow Labs', has_account: false, voo: false, voo_login: false });
    r = await c.post('/api/auth/invite/accept', { token: raw, password: 'short' });
    assert.equal(r.status, 400);
    r = await c.post('/api/auth/invite/accept', { token: raw, password: 'password123', name: 'New Bie' });
    assert.equal(r.status, 200, r.text);
    const u = db.one('SELECT * FROM users WHERE email = ?', 'newbie@example.com');
    assert.equal(u.name, 'New Bie');
    assert.equal(u.email_verified, 1, 'invite link proves the email');
    assert.equal(db.one('SELECT role FROM members WHERE workspace_id = ? AND user_id = ?', wsId, u.id).role, 'agent');
    assert.ok(db.one('SELECT accepted_at FROM invites WHERE token_hash = ?', sha256(raw)).accepted_at);
    assert.equal(db.one('SELECT COUNT(*) n FROM workspaces WHERE owner_id = ?', u.id).n, 0, 'no own workspace created');
    const b = await c.get('/api/app/bootstrap');
    assert.equal(b.body.workspace.id, wsId);
    assert.equal(b.body.role, 'agent');
    r = await h.client().post('/api/auth/invite/accept', { token: raw, password: 'password123' });
    assert.equal(r.status, 400, 'invite is single use');
    assert.equal((await h.client().get('/api/auth/invite?token=' + raw)).status, 400);
  });

  test('accept as an existing user needs their password (unless logged in as them)', async () => {
    const { user, client: theirs } = await h.signup({ email: 'existing.helper@example.com' });
    const raw = rawInvite(wsId, user.email, 'admin');
    assert.equal((await h.client().get('/api/auth/invite?token=' + raw)).body.has_account, true);
    let r = await h.client().post('/api/auth/invite/accept', { token: raw });
    assert.equal(r.status, 401);
    r = await h.client().post('/api/auth/invite/accept', { token: raw, password: 'wrong-pass' });
    assert.equal(r.status, 401);
    assert.equal(db.one('SELECT role FROM members WHERE workspace_id = ? AND user_id = ?', wsId, user.id), null);
    const c = h.client();
    r = await c.post('/api/auth/invite/accept', { token: raw, password: 'password123' });
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT role FROM members WHERE workspace_id = ? AND user_id = ?', wsId, user.id).role, 'admin');
    assert.equal((await c.get('/api/app/bootstrap')).body.workspace.id, wsId, 'session opened on the invited workspace');
    assert.equal((await c.get('/api/app/bootstrap')).body.workspaces.length, 2);
    // Logged in as the invited user: no password needed.
    const raw2 = rawInvite(db.one('SELECT id FROM workspaces WHERE owner_id = (SELECT id FROM users WHERE email = ?)', 'new.person@example.com').id, user.email);
    r = await theirs.post('/api/auth/invite/accept', { token: raw2 });
    assert.equal(r.status, 200, r.text);
  });

  test('expired invite is rejected', async () => {
    const raw = rawInvite(wsId, 'late@example.com', 'agent', -1);
    assert.equal((await h.client().get('/api/auth/invite?token=' + raw)).status, 400);
    assert.equal((await h.client().post('/api/auth/invite/accept', { token: raw, password: 'password123' })).status, 400);
    assert.equal(db.one('SELECT id FROM users WHERE email = ?', 'late@example.com'), null);
  });
});

describe('referrals', () => {
  test('/r/:code sets rv_ref, counts the click, and the referee gets bonus credits', async () => {
    const ref = db.one('SELECT * FROM workspaces WHERE name = ?', 'Glow Labs');
    const c = h.client();
    const r = await c.get('/r/' + ref.ref_code);
    assert.equal(r.status, 302);
    assert.equal(r.location, '/?invite=' + ref.ref_code);
    assert.equal(c.jar.get('rv_ref'), ref.ref_code);
    assert.equal(db.one('SELECT COUNT(*) n FROM clicks WHERE target = \'ref\' AND workspace_id = ?', ref.id).n, 1);
    const { user, ws } = await h.signup({}, c);
    assert.equal(ws.referred_by, ref.id);
    assert.equal(ws.credits, 100, 'referee_bonus_credits');
    const tx = db.one('SELECT * FROM credit_tx WHERE workspace_id = ?', ws.id);
    assert.equal(tx.amount, 100);
    assert.match(tx.reason, /invited by a friend/);
    assert.ok(user);
    const squad = await (await h.login(h.DEMO.email, h.DEMO.password)).get('/api/app/squad');
    assert.equal(squad.body.signups, 1);
    assert.equal(squad.body.clicks, 1);
  });

  test('unknown referral code: no cookie, no click, no bonus', async () => {
    const c = h.client();
    const n = db.one('SELECT COUNT(*) n FROM clicks').n;
    const r = await c.get('/r/doesnotexist');
    assert.equal(r.status, 302);
    assert.ok(!c.jar.has('rv_ref'));
    assert.equal(db.one('SELECT COUNT(*) n FROM clicks').n, n);
    const { ws } = await h.signup({}, c);
    assert.equal(ws.referred_by, null);
    assert.equal(ws.credits, 0);
  });

  test('ref in the signup body also works', async () => {
    const ref = db.one('SELECT * FROM workspaces WHERE name = ?', 'Glow Labs');
    const { ws } = await h.signup({ ref: ref.ref_code });
    assert.equal(ws.referred_by, ref.id);
  });
});
