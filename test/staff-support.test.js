'use strict';
// Admin staff (roles, per-page access, boxes, invites, 2-step code) and the support desk (all intake channels,
// replies back the way the customer came, box scoping, VooSquare HQ APIs).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const h = require('./helpers');

let ctx, owner, mailer;
const sent = [];
before(async () => {
  ctx = await h.boot();
  owner = await h.login(h.ADMIN.email, h.ADMIN.password);
  // Capture email data (codes, links) while still logging them like the real mailer.
  mailer = require('../src/services/mailer');
  const real = mailer.send;
  mailer.send = (to, name, data, opts) => { sent.push({ to, name, data, opts }); return real(to, name, data, opts); };
});
after(() => ctx.close());

const lastMail = (to, name) => sent.filter(m => m.to === to && m.name === name).pop();
async function inviteAndJoin(email, body) {
  const r = await owner.post('/api/admin/staff/invite', { email, ...body });
  assert.equal(r.status, 200, r.text);
  const tok = new URL('http://x' + lastMail(email, 'staff-invite').data.join_url.replace(/^https?:\/\/[^/]+/, '')).searchParams.get('token');
  const c = h.client();
  const info = await c.get('/api/admin/join?token=' + encodeURIComponent(tok));
  assert.equal(info.status, 200);
  assert.equal(info.body.email, email);
  const j = await c.post('/api/admin/join', { token: tok, name: 'Sam ' + email.split('@')[0], password: 'longpassword1' });
  assert.equal(j.status, 200, j.text);
  return c;
}

let support1, finance1;

test('the seeded admin is an owner with full access', async () => {
  const me = await owner.get('/api/admin/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.staff.role, 'owner');
  assert.equal(me.body.staff.perms.staff, 'edit');
  assert.equal(me.body.mfa_required, false);
  const list = await owner.get('/api/admin/staff');
  assert.ok(list.body.roles.find(r => r.id === 'support'));
  assert.equal(list.body.boxes.length, 4);
});

test('customers are not staff', async () => {
  const demo = await h.login(h.DEMO.email, h.DEMO.password);
  assert.equal((await demo.get('/api/admin/me')).status, 403);
  assert.equal((await demo.get('/api/admin/overview')).status, 403);
  assert.equal((await h.client().get('/api/admin/overview')).status, 401);
});

test('invite → join → support role only sees what it may', async () => {
  const boxes = (await owner.get('/api/admin/staff')).body.boxes;
  const billing = boxes.find(b => b.name === 'Billing');
  support1 = await inviteAndJoin('sam.support@example.com', { role: 'support', all_boxes: false, boxes: [billing.id], title: 'Billing desk' });
  const me = (await support1.get('/api/admin/me')).body;
  assert.equal(me.staff.role, 'support');
  assert.deepEqual(me.staff.boxes, [billing.id]);
  assert.equal(me.staff.all_boxes, false);
  assert.equal((await support1.get('/api/admin/overview')).status, 200);
  assert.equal((await support1.get('/api/admin/users')).status, 200);           // view
  assert.equal((await support1.get('/api/admin/plans')).status, 403);           // none
  assert.equal((await support1.put('/api/admin/users/1', { suspended: true })).status, 403); // view, not edit
  assert.equal((await support1.post('/api/admin/orders/RV-NOPE/mark-paid')).status, 403);
  assert.equal((await support1.get('/api/admin/staff')).status, 403);
  const s = (await support1.get('/api/admin/settings')).body;
  assert.ok(s.company && s.support);
  assert.equal(s.billing, undefined);
  assert.equal((await support1.put('/api/admin/settings/billing', { value: {} })).status, 403);
  // Invite can't be used twice.
  assert.equal(ctx.db.one("SELECT role FROM users WHERE email = 'sam.support@example.com'").role, 'admin');
});

test('custom page access overrides the role', async () => {
  finance1 = await inviteAndJoin('fin@example.com', { role: 'finance', perms: { website: 'edit', support: 'none' } });
  assert.equal((await finance1.get('/api/admin/plans')).status, 200);
  assert.equal((await finance1.get('/api/admin/support/desk')).status, 403);
  const site = (await owner.get('/api/admin/settings')).body.site;
  assert.equal((await finance1.put('/api/admin/settings/site', { value: site })).status, 200);
});

test('owners are protected; admins manage everyone else', async () => {
  const adminC = await inviteAndJoin('ada.admin@example.com', { role: 'admin' });
  const ownerId = ctx.db.one('SELECT id FROM users WHERE email = ?', h.ADMIN.email).id;
  assert.equal((await adminC.put('/api/admin/staff/' + ownerId, { role: 'viewer' })).status, 403);
  assert.equal((await adminC.del('/api/admin/staff/' + ownerId)).status, 403);
  assert.equal((await adminC.post('/api/admin/staff/invite', { email: 'x@example.com', role: 'owner' })).status, 403);
  assert.equal((await owner.put('/api/admin/staff/' + ownerId, { role: 'admin' })).status, 400); // own role
  const finId = ctx.db.one("SELECT id FROM users WHERE email = 'fin@example.com'").id;
  assert.equal((await adminC.put('/api/admin/staff/' + finId, { role: 'viewer' })).status, 200);
  assert.equal((await finance1.get('/api/admin/plans')).status, 200); // viewer can view pricing
  assert.equal((await finance1.post('/api/admin/coupons', { code: 'NOPE10' })).status, 403);
  // Pausing access logs them out.
  assert.equal((await adminC.put('/api/admin/staff/' + finId, { status: 'disabled' })).status, 200);
  assert.equal((await finance1.get('/api/admin/me')).status, 401);
  assert.equal(ctx.db.one("SELECT role FROM users WHERE email = 'fin@example.com'").role, 'user');
});

test('2-step code: staff must enter the emailed code once per session', async () => {
  const staff = require('../src/services/staff');
  staff.setMfa(true);
  try {
    const c = await h.login(h.ADMIN.email, h.ADMIN.password);
    const me = await c.get('/api/admin/me');
    assert.equal(me.body.mfa_required, true);
    const blocked = await c.get('/api/admin/overview');
    assert.equal(blocked.status, 401);
    assert.equal(blocked.body.code, 'mfa_required');
    assert.equal((await c.post('/api/admin/mfa/send')).status, 200);
    const code = lastMail(h.ADMIN.email, 'staff-code').data.code;
    assert.match(code, /^\d{6}$/);
    assert.equal((await c.post('/api/admin/mfa/verify', { code: code === '000000' ? '111111' : '000000' })).status, 400);
    assert.equal((await c.post('/api/admin/mfa/verify', { code })).status, 200);
    assert.equal((await c.get('/api/admin/overview')).status, 200);
    // The same code can't be reused on another session.
    const c2 = await h.login(h.ADMIN.email, h.ADMIN.password);
    assert.equal((await c2.post('/api/admin/mfa/verify', { code })).status, 400);
  } finally { staff.setMfa(false); }
});

/* ---------------- support desk ---------------- */
let contactRef;
test('contact form and website chat open tickets in the right box and auto-assign', async () => {
  const boxes = (await owner.get('/api/admin/staff')).body.boxes;
  const billing = boxes.find(b => b.name === 'Billing');
  const sup = (await owner.get('/api/admin/settings')).body.support;
  assert.equal((await owner.put('/api/admin/settings/support', { value: { ...sup, routing: { ...sup.routing, contact: billing.id } } })).status, 200);
  const anon = h.client();
  const r = await anon.post('/api/public/contact', { email: 'buyer@example.com', name: 'Mia Buyer', message: 'I paid but my plan is not active.', source: 'contact' });
  assert.equal(r.status, 200);
  contactRef = r.body.ref;
  const t = ctx.db.one('SELECT * FROM support_tickets WHERE ref = ?', contactRef);
  assert.equal(t.box_id, billing.id);
  assert.equal(t.source, 'contact');
  const samId = ctx.db.one("SELECT id FROM users WHERE email = 'sam.support@example.com'").id;
  assert.equal(t.assignee_id, samId); // the only support person on Billing
  assert.ok(lastMail('sam.support@example.com', 'support-assigned'));
  const chat = await anon.post('/api/public/contact', { email: 'visitor@example.com', source: 'chat', message: 'Asked to talk to a human from the website chat.' });
  assert.equal(ctx.db.one('SELECT source FROM support_tickets WHERE ref = ?', chat.body.ref).source, 'web_chat');
});

test('staff only see tickets in their boxes', async () => {
  const list = (await support1.get('/api/admin/support/tickets')).body.tickets;
  assert.ok(list.find(t => t.ref === contactRef));
  const general = ctx.db.one("SELECT ref FROM support_tickets WHERE source = 'web_chat'").ref;
  assert.ok(!list.find(t => t.ref === general));
  assert.equal((await support1.get('/api/admin/support/tickets/' + general)).status, 403);
  assert.ok((await owner.get('/api/admin/support/tickets')).body.tickets.find(t => t.ref === general));
  const desk = (await support1.get('/api/admin/support/desk')).body;
  assert.equal(desk.boxes.length, 1);
  assert.equal(desk.me.can_edit, true);
});

test('a reply to a contact ticket is emailed; notes are not; customer reply reopens', async () => {
  const before = sent.length;
  const note = await support1.post('/api/admin/support/tickets/' + contactRef + '/reply', { text: 'Checked Paystack, payment is there.', note: true });
  assert.equal(note.status, 200);
  assert.equal(sent.length, before);
  const r = await support1.post('/api/admin/support/tickets/' + contactRef + '/reply', { text: 'Hi {{name}}, your plan is active now.', status: 'solved' });
  assert.equal(r.status, 200, r.text);
  const mail = lastMail('buyer@example.com', 'support-reply');
  assert.ok(mail);
  assert.match(mail.data.reply_html, /Hi Mia, your plan is active now/);
  assert.equal(r.body.ticket.status, 'solved');
  // Customer replies by email with the ticket number in the subject: same ticket, open again.
  const config = require('../src/config');
  config.support.inboundKey = 'inbound-key-123';
  assert.equal((await h.client().post('/webhooks/support-email?key=wrong', { from: 'buyer@example.com', subject: 'x', text: 'y' })).status, 403);
  const inb = await h.client().post('/webhooks/support-email?key=inbound-key-123', { From: 'Mia Buyer <buyer@example.com>', Subject: 'Re: I paid [' + contactRef + ']', TextBody: 'Thanks! One more question.' });
  assert.equal(inb.status, 200, inb.text);
  assert.equal(inb.body.ref, contactRef);
  assert.equal(inb.body.created, false);
  assert.equal(ctx.db.one('SELECT status FROM support_tickets WHERE ref = ?', contactRef).status, 'open');
  const fresh = await h.client().post('/webhooks/support-email?key=inbound-key-123', { from: 'new.person@example.com', subject: 'Partnership', text: 'Can we talk?' });
  assert.equal(fresh.body.created, true);
});

test('dashboard help: customer asks, staff replies, customer sees it', async () => {
  const demo = await h.login(h.DEMO.email, h.DEMO.password);
  const r = await demo.post('/api/app/support', { topic: 'setup', subject: 'Bot not replying', text: 'My Telegram bot stopped answering.' });
  assert.equal(r.status, 200, r.text);
  const ref = r.body.ticket.ref;
  const t = ctx.db.one('SELECT * FROM support_tickets WHERE ref = ?', ref);
  assert.equal(t.source, 'dashboard');
  assert.equal(ctx.db.one('SELECT name FROM support_boxes WHERE id = ?', t.box_id).name, 'Setup help');
  const rep = await owner.post('/api/admin/support/tickets/' + ref + '/reply', { text: 'Reconnect the bot under Channels and it will work.' });
  assert.equal(rep.body.via, 'dashboard');
  const mine = (await demo.get('/api/app/support')).body.tickets.find(x => x.ref === ref);
  assert.equal(mine.unread, 1, JSON.stringify(mine.messages));
  assert.equal(mine.messages.length, 2);
  assert.equal(mine.messages[1].dir, 'out');
  assert.ok(!mine.messages.find(m => m.dir === 'note'));
  await demo.post('/api/app/support/' + ref + '/seen');
  assert.equal((await demo.get('/api/app/support')).body.tickets.find(x => x.ref === ref).unread, 0);
  assert.equal((await demo.post('/api/app/support/' + ref + '/reply', { text: 'Done, thanks!' })).status, 200);
  assert.equal(ctx.db.one('SELECT unread FROM support_tickets WHERE ref = ?', ref).unread, 2); // first message + this reply, nobody opened it yet
  const other = await h.signup();
  assert.equal((await other.client.post('/api/app/support/' + ref + '/reply', { text: 'hijack' })).status, 404);
  // Opening the ticket clears unread; the agent sees the customer's account.
  const open = await owner.get('/api/admin/support/tickets/' + ref);
  assert.equal(open.body.account.workspace.name, 'Glow Labs');
  assert.equal(ctx.db.one('SELECT unread FROM support_tickets WHERE ref = ?', ref).unread, 0);
});

test('assign, move, prioritise and AI draft', async () => {
  const samId = ctx.db.one("SELECT id FROM users WHERE email = 'sam.support@example.com'").id;
  const ref = ctx.db.one("SELECT ref FROM support_tickets WHERE source = 'web_chat'").ref;
  const r = await owner.put('/api/admin/support/tickets/' + ref, { assignee_id: samId, priority: 'urgent' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ticket.assignee.id, samId);
  assert.ok(r.body.ticket.messages.find(m => m.dir === 'system' && /assigned/.test(m.text)));
  // Assigned to Sam even though it is outside his boxes: he can now open it.
  assert.equal((await support1.get('/api/admin/support/tickets/' + ref)).status, 200);
  const customerId = ctx.db.one('SELECT id FROM users WHERE email = ?', h.DEMO.email).id;
  assert.equal((await owner.put('/api/admin/support/tickets/' + ref, { assignee_id: customerId })).status, 400);
  const d = await owner.post('/api/admin/support/tickets/' + ref + '/draft');
  assert.equal(d.status, 200);
  assert.ok(d.body.text.length > 10);
});

test('Telegram support bot: secret checked, chats become tickets', async () => {
  const config = require('../src/config');
  const { hmac } = require('../src/lib/security');
  config.support.tgToken = '123:TEST';
  const secret = hmac('support-telegram').slice(0, 48);
  const c = h.client();
  assert.equal((await c.post('/webhooks/support-telegram', { message: {} }, { headers: { 'x-telegram-bot-api-secret-token': 'nope' } })).status, 403);
  const msg = { message: { message_id: 1, chat: { id: 555001, type: 'private' }, from: { id: 555001, first_name: 'Theo', username: 'theo_k' }, text: 'Hello, how do I upgrade?' } };
  assert.equal((await c.post('/webhooks/support-telegram', msg, { headers: { 'x-telegram-bot-api-secret-token': secret } })).status, 200);
  const t = await h.waitFor(() => ctx.db.one("SELECT * FROM support_tickets WHERE tg_chat_id = '555001'"));
  assert.equal(t.source, 'telegram');
  assert.equal(t.tg_username, '@theo_k');
  await c.post('/webhooks/support-telegram', { message: { ...msg.message, message_id: 2, text: 'Still there?' } }, { headers: { 'x-telegram-bot-api-secret-token': secret } });
  await h.waitFor(() => ctx.db.one('SELECT COUNT(*) n FROM support_messages WHERE ticket_id = ?', t.id).n === 2);
  // Telegram is unreachable in tests: the reply is kept and marked as not delivered.
  const r = await owner.post('/api/admin/support/tickets/' + t.ref + '/reply', { text: 'Go to Plan and pick Pro.' });
  assert.equal(r.body.delivered, false);
  assert.match(r.body.error, /Telegram/);
  assert.equal(r.body.ticket.messages.pop().failed, 1);
  config.support.tgToken = '';
});

test('boxes: create, rename, delete moves tickets', async () => {
  const c = await owner.post('/api/admin/staff/boxes', { name: 'VIP', color: '#C9A7FF' });
  assert.equal(c.status, 200);
  const ref = ctx.db.one("SELECT ref FROM support_tickets WHERE source = 'web_chat'").ref;
  await owner.put('/api/admin/support/tickets/' + ref, { box_id: c.body.id });
  const del = await owner.del('/api/admin/staff/boxes/' + c.body.id);
  assert.equal(del.status, 200);
  assert.equal(ctx.db.one('SELECT box_id FROM support_tickets WHERE ref = ?', ref).box_id, del.body.moved_to);
  assert.equal((await support1.post('/api/admin/staff/boxes', { name: 'Nope' })).status, 403);
});

test('VooSquare HQ: staff sync and ticket APIs by Voo ID', async () => {
  const voo = require('../src/services/voosquare');
  voo.setConfig({ serviceKey: 'svc_test_key_123' });
  const auth = { headers: { authorization: 'Bearer svc_test_key_123' } };
  const c = h.client();
  assert.equal((await c.post('/api/voosquare/staff', { voo_id: 'v1' })).status, 401);
  assert.equal((await c.post('/api/voosquare/staff', { voo_id: 'voo_staff_9', email: 'nina@zedapex.com', name: 'Nina', role: 'owner' }, auth)).status, 400);
  const add = await c.post('/api/voosquare/staff', { voo_id: 'voo_staff_9', email: 'nina@zedapex.com', name: 'Nina', role: 'support', all_boxes: true }, auth);
  assert.equal(add.status, 200, add.text);
  const nina = ctx.db.one("SELECT * FROM users WHERE voo_id = 'voo_staff_9'");
  assert.equal(ctx.db.one('SELECT source FROM staff WHERE user_id = ?', nina.id).source, 'voosquare');
  assert.equal(ctx.db.one('SELECT COUNT(*) n FROM members WHERE user_id = ?', nina.id).n, 0); // no customer workspace
  const list = await c.get('/api/voosquare/support/tickets', auth);
  assert.ok(list.body.tickets.length >= 3);
  assert.match(list.body.tickets[0].url, /\/admin\/support\/T-/);
  const ref = list.body.tickets[0].ref;
  const one = await c.get('/api/voosquare/support/tickets/' + ref, auth);
  assert.ok(Array.isArray(one.body.messages));
  assert.equal((await c.post('/api/voosquare/support/tickets/' + ref + '/reply', { voo_id: 'nobody', text: 'x' }, auth)).status, 403);
  const rep = await c.post('/api/voosquare/support/tickets/' + ref + '/reply', { voo_id: 'voo_staff_9', text: 'On it!', note: true }, auth);
  assert.equal(rep.status, 200, rep.text);
  const up = await c.post('/api/voosquare/support/tickets/' + ref + '/update', { voo_id: 'voo_staff_9', status: 'solved', assignee_voo_id: 'voo_staff_9' }, auth);
  assert.equal(up.status, 200, up.text);
  assert.equal(up.body.ticket.assignee.voo_id, 'voo_staff_9');
  // Support bridge: with VooSquare connected (address + API key), a customer's ticket is copied into VooSquare HQ and a
  // reply written there comes back on the ticket. The API key may call the support APIs; staff sync needs the service key.
  voo.setConfig({ base: 'http://127.0.0.1:9', apiKey: 'vsk_test_api_key_123456' });
  const api = { headers: { authorization: 'Bearer vsk_test_api_key_123456' } };
  assert.equal((await c.get('/api/voosquare/support/boxes', api)).status, 200);
  assert.equal((await c.post('/api/voosquare/staff', { voo_id: 'voo_x', email: 'x@zedapex.com', role: 'support' }, api)).status, 401, 'the outgoing API key cannot change staff');
  const { ticket } = require('../src/services/support').intake({ source: 'contact', text: 'Can I pay in naira?', name: 'Lena', email: 'buyer@example.com' });
  const fwd = ctx.db.all("SELECT body FROM voo_outbox WHERE url = 'support'").map(r => JSON.parse(r.body)).find(p => p.externalRef === 'replyvoo-' + ticket.ref);
  assert.ok(fwd, 'copied to VooSquare HQ');
  assert.equal(fwd.body, 'Can I pay in naira?');
  assert.equal((await c.post('/hooks/voosquare/support', { type: 'support.reply', external_ref: 'replyvoo-' + ticket.ref, body: 'Yes, through Bachs.', agent: 'Sam' })).status, 401, 'no key');
  const hook = await c.post('/hooks/voosquare/support', { type: 'support.reply', ticket_id: 7, external_ref: 'replyvoo-' + ticket.ref, body: 'Yes, through Bachs.', agent: 'Sam' }, api);
  assert.equal(hook.status, 200, hook.text);
  const back = ctx.db.one("SELECT * FROM support_messages WHERE ticket_id = ? AND via = 'voosquare'", ticket.id);
  assert.equal(back.text, 'Yes, through Bachs.');
  assert.equal(back.author_name, 'Sam');
  voo.setConfig({ base: '', apiKey: '' });
  // Switched off in VooSquare: access ends.
  assert.equal((await c.post('/api/voosquare/staff', { voo_id: 'voo_staff_9', active: false }, auth)).status, 200);
  assert.equal(ctx.db.one('SELECT status FROM staff WHERE user_id = ?', nina.id).status, 'disabled');
  voo.setConfig({ serviceKey: '' });
  void crypto;
});

test('customer team: no duplicate invites, resend, change role', async () => {
  const s = await h.signup({}, h.client());
  ctx.db.update('workspaces', s.ws.id, { plan_id: 'pro' });
  const a = await s.client.post('/api/app/team/invite', { email: 'mate1@example.com', role: 'agent' });
  assert.equal(a.status, 200, a.text);
  // Inviting the same email again replaces the pending invite instead of using another seat.
  assert.equal((await s.client.post('/api/app/team/invite', { email: 'mate1@example.com', role: 'admin' })).status, 200);
  const team = (await s.client.get('/api/app/team')).body;
  assert.equal(team.invites.filter(i => i.email === 'mate1@example.com').length, 1);
  assert.equal(team.invites[0].role, 'admin');
  assert.equal(team.voo, false);
  assert.equal((await s.client.post('/api/app/invites/' + team.invites[0].id + '/resend')).status, 200);
  assert.equal(h.emails('mate1@example.com', 'team-invite').length, 3);
  assert.equal((await s.client.post('/api/app/team/invite', { email: s.email })).status, 409);
  // Add a member directly, then switch roles.
  const { user } = h.makeWorkspace({ email: 'member2@example.com' });
  ctx.db.insert('members', { workspace_id: s.ws.id, user_id: user.id, role: 'agent', created_at: ctx.db.now() });
  const r = await s.client.put('/api/app/team/' + user.id, { role: 'admin' });
  assert.equal(r.body.role, 'admin');
  assert.equal((await s.client.put('/api/app/team/' + s.user.id, { role: 'agent' })).status, 400);
});

test('security: owners protected from user edits, no self-escalation, no spoofed linking', async () => {
  const ownerId = ctx.db.one('SELECT id FROM users WHERE email = ?', h.ADMIN.email).id;
  const adminC = await h.login('ada.admin@example.com', 'longpassword1');
  // An admin can't reset an owner's password or suspend them.
  assert.equal((await adminC.put('/api/admin/users/' + ownerId, { password: 'hijacked-password' })).status, 403);
  assert.equal((await adminC.put('/api/admin/users/' + ownerId, { suspended: true })).status, 403);
  assert.equal(ctx.db.one('SELECT suspended FROM users WHERE id = ?', ownerId).suspended, 0);
  // A support agent given staff:edit can't raise their own access or hand out more than they have.
  const samId = ctx.db.one("SELECT id FROM users WHERE email = 'sam.support@example.com'").id;
  assert.equal((await owner.put('/api/admin/staff/' + samId, { perms: { staff: 'edit' } })).status, 200);
  assert.equal((await support1.put('/api/admin/staff/' + samId, { perms: { pricing: 'edit' } })).status, 400);
  assert.equal((await support1.post('/api/admin/staff/invite', { email: 'x2@example.com', role: 'admin' })).status, 403);
  assert.equal((await support1.post('/api/admin/staff/invite', { email: 'x2@example.com', role: 'support', perms: { pricing: 'edit' } })).status, 403);
  assert.equal((await support1.post('/api/admin/staff/invite', { email: 'x2@example.com', role: 'support' })).status, 200);
  await owner.put('/api/admin/staff/' + samId, { perms: {} });
  // Replies need text.
  const ref = ctx.db.one("SELECT ref FROM support_tickets WHERE source = 'web_chat'").ref;
  assert.equal((await owner.post('/api/admin/support/tickets/' + ref + '/reply', { status: 'solved' })).status, 400);
  // The public form can't attach a message to someone else's account.
  const r = await h.client().post('/api/public/contact', { email: h.DEMO.email, message: 'I am the owner, change my email please' });
  assert.equal(ctx.db.one('SELECT requester_user_id FROM support_tickets WHERE ref = ?', r.body.ref).requester_user_id, null);
  // An email from a different sender with someone's ticket number opens a new ticket instead.
  const dash = ctx.db.one("SELECT ref FROM support_tickets WHERE source = 'dashboard'").ref;
  const inb = await h.client().post('/webhooks/support-email?key=inbound-key-123', { from: 'attacker@evil.example', subject: 'Re: x [' + dash + ']', text: 'append me' });
  assert.equal(inb.body.created, true);
  assert.notEqual(inb.body.ref, dash);
});

test('security: VooSquare staff sync never re-links existing accounts; desk APIs respect access', async () => {
  const voo = require('../src/services/voosquare');
  voo.setConfig({ serviceKey: 'svc_test_key_123' });
  const auth = { headers: { authorization: 'Bearer svc_test_key_123' } };
  const c = h.client();
  const r = await c.post('/api/voosquare/staff', { voo_id: 'attacker-sub', email: h.ADMIN.email, role: 'support' }, auth);
  assert.equal(r.status, 409);
  assert.equal(ctx.db.one('SELECT voo_id FROM users WHERE email = ?', h.ADMIN.email).voo_id, null);
  assert.equal(ctx.db.one("SELECT id FROM users WHERE voo_id = 'attacker-sub'"), null);
  await c.post('/api/voosquare/staff', { voo_id: 'voo_content_1', email: 'writer@zedapex.com', role: 'content' }, auth);
  assert.equal((await c.get('/api/voosquare/support/tickets?voo_id=voo_content_1', auth)).status, 403);
  const ref = ctx.db.one('SELECT ref FROM support_tickets LIMIT 1').ref;
  assert.equal((await c.get('/api/voosquare/support/tickets/' + ref + '?voo_id=voo_content_1', auth)).status, 403);
  voo.setConfig({ serviceKey: '' });
});
