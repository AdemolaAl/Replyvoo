'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { encrypt } = require('../src/lib/security');

let env, db, A, B, agent, aWs, aThread, aContact, aCloser, aChannel, aOrder;

before(async () => {
  env = await h.boot();
  db = env.db;
  A = await h.login(h.DEMO.email, h.DEMO.password);
  aWs = db.one('SELECT * FROM workspaces WHERE name = ?', 'Glow Labs');
  aThread = db.one('SELECT * FROM threads WHERE workspace_id = ? ORDER BY id LIMIT 1', aWs.id);
  aContact = db.one('SELECT * FROM contacts WHERE id = ?', aThread.contact_id);
  aCloser = db.one('SELECT * FROM closers WHERE workspace_id = ? ORDER BY id LIMIT 1', aWs.id);
  aChannel = db.one('SELECT * FROM channels WHERE workspace_id = ?', aWs.id);
  aOrder = 'RV-A-ORDER-1';
  db.insert('orders', { ref: aOrder, workspace_id: aWs.id, kind: 'pack', item_id: '1', item_name: 'Starter', amount_usd: 15, provider: 'demo', status: 'pending', created_at: db.now() });
  B = (await h.signup({ email: 'b.owner@example.com' })).client;
  // An agent (non-manager) member of workspace A.
  const s = await h.signup({ email: 'agent.smith@example.com' });
  db.insert('members', { workspace_id: aWs.id, user_id: s.user.id, role: 'agent', created_at: db.now() });
  agent = s.client;
  const sw = await agent.post('/api/app/workspaces/switch', { id: aWs.id });
  assert.equal(sw.status, 200);
});
after(() => env.close());

describe('workspace isolation', () => {
  test('user B gets 404 on A\'s thread, contact, closer, channel and order ids', async () => {
    const checks = [
      ['GET', '/api/app/threads/' + aThread.id],
      ['PUT', '/api/app/threads/' + aThread.id, { ai_on: false }],
      ['POST', '/api/app/threads/' + aThread.id + '/messages', { text: 'hijack' }],
      ['PUT', '/api/app/contacts/' + aContact.id, { stage: 'lost', notes: 'pwned' }],
      ['PUT', '/api/app/closers/' + aCloser.id, { name: 'Pwned' }],
      ['DELETE', '/api/app/closers/' + aCloser.id],
      ['PUT', '/api/app/channels/' + aChannel.id, { closer_id: null }],
      ['DELETE', '/api/app/channels/' + aChannel.id],
      ['GET', '/api/app/orders/' + aOrder]
    ];
    for (const [m, p, body] of checks) {
      const r = await B.req(m, p, body);
      assert.equal(r.status, 404, m + ' ' + p + ' -> ' + r.status + ' ' + r.text);
    }
    assert.equal(db.one('SELECT ai_on FROM threads WHERE id = ?', aThread.id).ai_on, 1);
    assert.equal(db.one('SELECT notes FROM contacts WHERE id = ?', aContact.id).notes, '');
    assert.equal(db.one('SELECT name FROM closers WHERE id = ?', aCloser.id).name, 'Ace');
    assert.equal(db.one('SELECT status, closer_id FROM channels WHERE id = ?', aChannel.id).status, 'active');
    assert.equal(db.one('SELECT closer_id FROM channels WHERE id = ?', aChannel.id).closer_id, aCloser.id);
    assert.equal(db.one('SELECT COUNT(*) n FROM messages WHERE text = ?', 'hijack').n, 0);
  });

  test('B\'s lists never contain A\'s data', async () => {
    for (const p of ['/api/app/threads', '/api/app/contacts', '/api/app/closers', '/api/app/channels']) {
      const r = await B.get(p);
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, [], p);
    }
    const live = await B.get('/api/app/live');
    assert.equal(live.body.messages.length, 0);
    assert.equal((await B.get('/api/app/wallet')).body.orders.length, 0);
  });

  test('B cannot attach A\'s closer to its own channel or thread, or switch into A', async () => {
    const r = await B.post('/api/app/workspaces/switch', { id: aWs.id });
    assert.equal(r.status, 403);
    const own = await B.post('/api/app/closers', { name: 'Mine', channel_id: aChannel.id });
    assert.equal(own.status, 200);
    assert.equal(db.one('SELECT closer_id FROM channels WHERE id = ?', aChannel.id).closer_id, aCloser.id, 'cannot hijack A\'s channel');
    await B.del('/api/app/closers/' + own.body.id);
  });

  test('logged-out requests are 401', async () => {
    const anon = h.client();
    for (const p of ['/api/app/bootstrap', '/api/app/threads', '/api/app/closers', '/api/app/stats']) assert.equal((await anon.get(p)).status, 401, p);
  });
});

describe('roles', () => {
  test('agent can read but cannot manage closers, checkout, team, channels, export', async () => {
    const boot = await agent.get('/api/app/bootstrap');
    assert.equal(boot.body.role, 'agent');
    assert.equal(boot.body.workspace.id, aWs.id);
    assert.equal((await agent.get('/api/app/closers')).status, 200);
    assert.equal((await agent.get('/api/app/threads')).status, 200);
    const denied = [
      ['POST', '/api/app/closers', { name: 'X' }],
      ['PUT', '/api/app/closers/' + aCloser.id, { name: 'X' }],
      ['DELETE', '/api/app/closers/' + aCloser.id],
      ['POST', '/api/app/closers/slot'],
      ['POST', '/api/app/checkout', { kind: 'plan', item_id: 'starter', provider: 'demo' }],
      ['POST', '/api/app/team/invite', { email: 'x@example.com' }],
      ['DELETE', '/api/app/team/' + aWs.owner_id],
      ['PUT', '/api/app/workspace', { name: 'Renamed' }],
      ['PUT', '/api/app/channels/' + aChannel.id, { closer_id: null }],
      ['DELETE', '/api/app/channels/' + aChannel.id],
      ['POST', '/api/app/blasts', { message: 'Hello all', segment: 'all' }],
      ['GET', '/api/app/export']
    ];
    for (const [m, p, body] of denied) {
      const r = await agent.req(m, p, body);
      assert.equal(r.status, 403, m + ' ' + p + ' -> ' + r.status);
    }
    assert.equal(db.one('SELECT name FROM workspaces WHERE id = ?', aWs.id).name, 'Glow Labs');
    assert.equal(db.one('SELECT COUNT(*) n FROM orders WHERE workspace_id = ? AND item_id = \'hustle\'', aWs.id).n, 0);
    // Agents can still work the inbox.
    const r = await agent.put('/api/app/contacts/' + aContact.id, { notes: 'agent note' });
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT notes FROM contacts WHERE id = ?', aContact.id).notes, 'agent note');
  });

  test('owner can remove the agent but not themselves (the owner)', async () => {
    const team = await A.get('/api/app/team');
    const ag = team.body.members.find(m => m.role === 'agent' && m.email === 'agent.smith@example.com');
    assert.ok(ag);
    assert.equal((await A.del('/api/app/team/' + aWs.owner_id)).status, 400);
    assert.equal((await A.del('/api/app/team/999999')).status, 404);
    const r = await A.del('/api/app/team/' + ag.id);
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT role FROM members WHERE workspace_id = ? AND user_id = ?', aWs.id, ag.id), null);
    // The removed agent falls back to their own workspace.
    const b = await agent.get('/api/app/bootstrap');
    assert.notEqual(b.body.workspace.id, aWs.id);
    assert.equal((await agent.get('/api/app/threads/' + aThread.id)).status, 404);
  });
});

describe('closers', () => {
  test('CRUD with validation and the plan limit', async () => {
    const s = await h.signup();
    let r = await s.client.post('/api/app/closers', { name: '  Zara  ', template: 'support', persona: { tone: 500, length: -5, emoji: 'x' }, skills: { paylink: false, nudge: true }, knowledge: 'We sell wigs.', pay_link: 'https://pay.example.com/x' });
    assert.equal(r.status, 200, r.text);
    const id = r.body.id;
    assert.equal(r.body.name, 'Zara');
    assert.equal(r.body.template, 'support');
    assert.deepEqual(r.body.persona, { tone: 100, length: 0, emoji: 30, human: true });
    assert.equal(r.body.skills.paylink, false);
    assert.equal(r.body.skills.nudge, true);
    assert.equal(r.body.skills.vision, true, 'default skills on');
    const row = db.one('SELECT * FROM closers WHERE id = ?', id);
    assert.equal(row.workspace_id, s.ws.id);
    assert.ok(db.one('SELECT id FROM events WHERE workspace_id = ? AND type = \'closer\'', s.ws.id));
    // "Your AI helper is live" only goes out once it answers somewhere (never "live" with no channel).
    await h.sleep(60);
    assert.equal(h.emails(s.email, 'closer-launched').length, 0, 'no live email without a channel');
    const link = await s.client.post('/api/app/channels/link', {});
    assert.equal(link.status, 200, link.text);
    assert.equal(link.body.link, true);
    assert.match(link.body.link_url, /\/c\/[a-z0-9-]+$/);
    await h.waitFor(() => h.emails(s.email, 'closer-launched').length, { label: 'closer-launched email' });
    // Spark allows 1 Closer.
    r = await s.client.post('/api/app/closers', { name: 'Second' });
    assert.equal(r.status, 402);
    assert.equal(r.body.code, 'closer_limit');
    assert.equal(db.one('SELECT COUNT(*) n FROM closers WHERE workspace_id = ?', s.ws.id).n, 1);
    // Update
    r = await s.client.put('/api/app/closers/' + id, { name: 'Zara Two', instructions: 'Be nice' });
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'Zara Two');
    assert.equal(r.body.template, 'support', 'unchanged fields kept');
    assert.equal(r.body.knowledge, 'We sell wigs.');
    assert.equal(r.body.skills.paylink, false, 'skills kept');
    r = await s.client.put('/api/app/closers/' + id, { pay_link: 'javascript:alert(1)' });
    assert.equal(r.status, 400);
    assert.equal(db.one('SELECT pay_link FROM closers WHERE id = ?', id).pay_link, 'https://pay.example.com/x');
    r = await s.client.put('/api/app/closers/' + id, { active: false });
    assert.equal(r.body.active, false);
    r = await s.client.post('/api/app/closers', { name: 'Bad', pay_link: 'ftp://x' });
    assert.equal(r.status, 402, 'limit is checked first');
    // Delete frees the slot.
    r = await s.client.del('/api/app/closers/' + id);
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT id FROM closers WHERE id = ?', id), null);
    assert.equal((await s.client.post('/api/app/closers', { name: 'Again' })).status, 200);
    assert.equal((await s.client.del('/api/app/closers/999999')).status, 404);
  });

  test('demo reply picks the knowledge snippet that matches the question', async () => {
    const knowledge = db.one('SELECT knowledge FROM closers WHERE id = ?', aCloser.id).knowledge;
    const r = await A.post('/api/app/closers/preview', { name: 'Ace', template: 'sales', knowledge, message: 'How long does shipping take to Spain?' });
    assert.equal(r.status, 200);
    assert.match(r.body.text, /Shipping|days/);
  });

  test('preview returns a demo reply without an AI key', async () => {
    let r = await A.post('/api/app/closers/preview', { name: 'Ace', template: 'sales', knowledge: 'Vitamin C Serum costs $24.\n\nShipping takes 3 days.', message: 'How much is the vitamin C serum?' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.demo, true);
    assert.ok(r.body.text.length > 0);
    assert.match(r.body.text, /\$24/);
    r = await A.post('/api/app/closers/preview', { message: 'I want a refund now' });
    assert.equal(r.body.handoff, true);
    assert.ok(!r.body.text.includes('[HANDOFF]'));
    assert.equal(h.outbound.filter(o => o.url.includes('anthropic')).length, 0, 'no AI call without a key');
  });
});

describe('inbox', () => {
  test('take over, hand back, and reply as a human', async () => {
    let r = await A.put('/api/app/threads/' + aThread.id, { ai_on: false });
    assert.equal(r.status, 200);
    assert.equal(db.one('SELECT ai_on FROM threads WHERE id = ?', aThread.id).ai_on, 0);
    assert.match(db.one('SELECT text FROM messages WHERE thread_id = ? AND dir = \'note\' ORDER BY id DESC', aThread.id).text, /took over/);
    r = await A.put('/api/app/threads/' + aThread.id, { ai_on: true, status: 'bogus' });
    const t = db.one('SELECT * FROM threads WHERE id = ?', aThread.id);
    assert.equal(t.ai_on, 1);
    assert.equal(t.status, 'open');
    r = await A.put('/api/app/threads/' + aThread.id, { status: 'closed' });
    assert.equal(db.one('SELECT status FROM threads WHERE id = ?', aThread.id).status, 'closed');
    // Reply (demo channel has no bot token, so nothing is sent to Telegram).
    r = await A.post('/api/app/threads/' + aThread.id + '/messages', { text: '  Hi, Grace here  ' });
    assert.equal(r.status, 200, r.text);
    const m = db.one('SELECT * FROM messages WHERE thread_id = ? ORDER BY id DESC', aThread.id);
    assert.equal(m.author, 'human');
    assert.equal(m.dir, 'out');
    assert.equal(m.text, 'Hi, Grace here');
    assert.equal(JSON.parse(m.meta).user_name, 'Grace Lee');
    assert.equal(db.one('SELECT ai_on FROM threads WHERE id = ?', aThread.id).ai_on, 0, 'replying takes over');
    r = await A.post('/api/app/threads/' + aThread.id + '/messages', { text: '   ' });
    assert.equal(r.status, 400);
    const detail = await A.get('/api/app/threads/' + aThread.id);
    assert.equal(detail.body.thread.unread, 0);
    assert.equal(detail.body.contact.id, aContact.id);
    assert.ok(detail.body.messages.some(x => x.text === 'Hi, Grace here'));
  });

  test('a Telegram failure on a human reply is a friendly 502 and stores nothing', async () => {
    db.update('channels', aChannel.id, { token_enc: encrypt('123456:TEST-TOKEN-THAT-FAILS') });
    try {
      const before = db.one('SELECT COUNT(*) n FROM messages WHERE thread_id = ?', aThread.id).n;
      const r = await A.post('/api/app/threads/' + aThread.id + '/messages', { text: 'Will this send?' });
      assert.equal(r.status, 502);
      assert.match(r.body.error, /Telegram did not accept the message/);
      assert.equal(db.one('SELECT COUNT(*) n FROM messages WHERE thread_id = ?', aThread.id).n, before);
      assert.ok(h.outbound.some(o => o.url.includes('/sendMessage')));
      // The server is still fine.
      assert.equal((await A.get('/api/app/threads')).status, 200);
    } finally { db.update('channels', aChannel.id, { token_enc: encrypt('') }); }
  });

  test('thread list filters and search', async () => {
    db.update('contacts', aContact.id, { heat: 'hot' });
    let r = await A.get('/api/app/threads?filter=hot');
    assert.ok(r.body.length >= 1 && r.body.every(t => t.heat === 'hot'));
    r = await A.get('/api/app/threads?filter=handoff');
    assert.ok(r.body.some(t => t.id === aThread.id), 'ai_on=0 threads count as handoff');
    r = await A.get('/api/app/threads?q=' + encodeURIComponent(aContact.name.split(' ')[0]));
    assert.ok(r.body.some(t => t.contact_id === aContact.id));
    r = await A.get('/api/app/threads?q=' + encodeURIComponent("' OR 1=1 --"));
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 0);
  });
});

describe('contacts', () => {
  test('update validates stage/heat and clamps values', async () => {
    let r = await A.put('/api/app/contacts/' + aContact.id, { stage: 'won', heat: 'won', notes: '  VIP  ', value: '38.5', blocked: false });
    assert.equal(r.status, 200);
    let c = db.one('SELECT * FROM contacts WHERE id = ?', aContact.id);
    assert.equal(c.stage, 'won');
    assert.equal(c.heat, 'won');
    assert.equal(c.notes, 'VIP');
    assert.equal(c.value, 38.5);
    r = await A.put('/api/app/contacts/' + aContact.id, { stage: 'nonsense', heat: 'boiling', value: -10 });
    assert.equal(r.status, 200);
    c = db.one('SELECT * FROM contacts WHERE id = ?', aContact.id);
    assert.equal(c.stage, 'won', 'invalid stage ignored');
    assert.equal(c.heat, 'won', 'invalid heat ignored');
    assert.equal(c.value, 0, 'negative value clamped');
    r = await A.put('/api/app/contacts/' + aContact.id, { value: 'abc', notes: 'x'.repeat(5000) });
    c = db.one('SELECT * FROM contacts WHERE id = ?', aContact.id);
    assert.equal(c.value, 0);
    assert.equal(c.notes.length, 2000);
    assert.equal((await A.put('/api/app/contacts/999999', { stage: 'won' })).status, 404);
  });
});

describe('blasts', () => {
  test('costs ceil(recipients / people_per_credit) credits; 402 when short; 400 when empty', async () => {
    const list = await A.get('/api/app/blasts');
    const all = list.body.segments.find(s => s.id === 'all').count;
    assert.ok(all >= 6);
    const expected = Math.ceil(all / 10);
    db.update('workspaces', aWs.id, { credits: 100 });
    let r = await A.post('/api/app/blasts', { message: 'Flash sale today!', segment: 'all' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.total, all);
    assert.equal(r.body.credits, expected);
    assert.equal(db.one('SELECT credits FROM workspaces WHERE id = ?', aWs.id).credits, 100 - expected);
    const b = db.one('SELECT * FROM blasts WHERE id = ?', r.body.id);
    assert.equal(b.status, 'queued');
    assert.equal(b.segment, 'all');
    assert.equal(b.workspace_id, aWs.id);
    assert.match(db.one('SELECT reason FROM credit_tx WHERE workspace_id = ? ORDER BY id DESC', aWs.id).reason, /^Blast to \d+ people$/);
    // Unknown segment falls back to "all"; message too short is 400.
    assert.equal((await A.post('/api/app/blasts', { message: 'x' })).status, 400);
    // Not enough credits.
    db.update('workspaces', aWs.id, { credits: 0 });
    const n = db.one('SELECT COUNT(*) n FROM blasts').n;
    r = await A.post('/api/app/blasts', { message: 'Another one', segment: 'all' });
    assert.equal(r.status, 402);
    assert.equal(r.body.code, 'no_credits');
    assert.equal(db.one('SELECT COUNT(*) n FROM blasts').n, n);
    // Nobody in the segment.
    db.update('workspaces', aWs.id, { credits: 100 });
    r = await B.post('/api/app/blasts', { message: 'Hello there', segment: 'all' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Nobody/);
  });

  test('blocked contacts are not counted', async () => {
    const before = (await A.get('/api/app/blasts')).body.segments.find(s => s.id === 'all').count;
    db.update('contacts', aContact.id, { blocked: 1 });
    try {
      const after = (await A.get('/api/app/blasts')).body.segments.find(s => s.id === 'all').count;
      assert.equal(after, before - 1);
    } finally { db.update('contacts', aContact.id, { blocked: 0 }); }
  });

  test('draft falls back without an AI key', async () => {
    const r = await A.post('/api/app/blasts/draft', { goal: 'win back' });
    assert.equal(r.status, 200);
    assert.equal(r.body.demo, true);
    assert.ok(r.body.text.length > 10);
  });
});

describe('misc', () => {
  test('waitlist is idempotent and validated', async () => {
    assert.equal((await A.post('/api/app/waitlist', { item: 'whatsapp' })).status, 200);
    assert.equal((await A.post('/api/app/waitlist', { item: 'whatsapp' })).status, 200);
    assert.equal(db.one('SELECT COUNT(*) n FROM waitlist WHERE workspace_id = ? AND item = \'whatsapp\'', aWs.id).n, 1);
    assert.equal((await A.post('/api/app/waitlist', { item: 'Bad Item!' })).status, 400);
    const b = await A.get('/api/app/bootstrap');
    assert.deepEqual(b.body.waitlist, ['whatsapp']);
  });

  test('squad stats', async () => {
    const r = await A.get('/api/app/squad');
    assert.equal(r.status, 200);
    assert.equal(r.body.code, aWs.ref_code);
    assert.equal(r.body.link, 'http://localhost:3000/r/' + aWs.ref_code);
    assert.equal(r.body.rate, 0.2);
    assert.equal(r.body.paying, 0);
    assert.equal(r.body.earned_credits, 0);
    assert.equal(r.body.tiers.length, 3);
    await h.signup({ ref: aWs.ref_code });
    assert.equal((await A.get('/api/app/squad')).body.signups, 1);
  });

  test('stats, live and notifications respond for the workspace', async () => {
    const s = await A.get('/api/app/stats');
    assert.equal(s.status, 200);
    assert.equal(s.body.series.length, 14);
    assert.equal(s.body.rpm.length, 20);
    assert.equal(s.body.total_contacts, db.one('SELECT COUNT(*) n FROM contacts WHERE workspace_id = ?', aWs.id).n);
    assert.equal(s.body.closers.length, 2);
    const l = await A.get('/api/app/live?after=0&after_msg=0');
    assert.ok(l.body.messages.length > 0);
    assert.equal((await A.get('/api/app/notifications')).status, 200);
    const j = await A.post('/api/app/juno', { question: 'How did we do today?' });
    assert.equal(j.status, 200);
    assert.match(j.body.answer, /chats/);
  });

  test('export contains only this workspace\'s contacts and closers', async () => {
    const r = await A.get('/api/app/export');
    assert.equal(r.status, 200);
    assert.equal(r.body.workspace.id, aWs.id);
    assert.equal(r.body.contacts.length, db.one('SELECT COUNT(*) n FROM contacts WHERE workspace_id = ?', aWs.id).n);
    assert.deepEqual(r.body.closers.map(c => c.name).sort(), ['Ace', 'Mira']);
    assert.ok(!JSON.stringify(r.body).includes('token_enc'));
    const rb = await B.get('/api/app/export');
    assert.equal(rb.body.contacts.length, 0);
  });

  test('profile, password and workspace settings', async () => {
    const s = await h.signup();
    assert.equal((await s.client.put('/api/app/profile', { name: 'Renamed Person', moji: { gender: 'male', skin: 2 } })).status, 200);
    assert.equal(db.one('SELECT name FROM users WHERE id = ?', s.user.id).name, 'Renamed Person');
    assert.equal((await s.client.put('/api/app/password', { current: 'wrong', password: 'newpassword1' })).status, 400);
    assert.equal((await s.client.put('/api/app/password', { current: 'password123', password: 'short' })).status, 400);
    const other = await h.login(s.email, 'password123');
    assert.equal((await s.client.put('/api/app/password', { current: 'password123', password: 'newpassword1' })).status, 200);
    assert.equal((await other.get('/api/auth/me')).body.user, null, 'other sessions revoked');
    assert.equal((await s.client.get('/api/auth/me')).body.user.id, s.user.id, 'current session kept');
    const r = await s.client.put('/api/app/workspace', { name: 'New Name', niche: 'Wigs', alerts: { handoff: false, hot: 1 }, timezone: 'Africa/Nairobi' });
    assert.equal(r.status, 200);
    const w = db.one('SELECT * FROM workspaces WHERE id = ?', s.ws.id);
    assert.equal(w.name, 'New Name');
    const st = JSON.parse(w.settings);
    assert.equal(st.niche, 'Wigs');
    assert.deepEqual(st.alerts, { handoff: false, night_report: false, hot: true, low_credits: false });
    assert.equal(st.timezone, 'Africa/Nairobi');
  });
});
