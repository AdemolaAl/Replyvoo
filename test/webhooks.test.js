'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { encrypt } = require('../src/lib/security');

const SECRET = 'test-webhook-secret-123';
let env, db, ch, wsId, ace, updateId = 1000;

before(async () => {
  env = await h.boot();
  db = env.db;
  ch = db.one('SELECT * FROM channels WHERE username = ?', 'glowlabs_shop_bot');
  wsId = ch.workspace_id;
  ace = ch.closer_id;
  // Known secret; empty token so replies are stored without calling Telegram.
  db.update('channels', ch.id, { webhook_secret: SECRET, token_enc: encrypt('') });
});
after(() => env.close());

const W = () => db.one('SELECT * FROM workspaces WHERE id = ?', wsId);
function hook(update, secret = SECRET, id = ch.id) {
  return h.client().post('/webhooks/telegram/' + id, update, { headers: secret == null ? {} : { 'x-telegram-bot-api-secret-token': secret } });
}
function privateMsg(fromId, text, extra = {}) {
  return { update_id: ++updateId, message: { message_id: updateId, date: Math.floor(Date.now() / 1000), from: { id: fromId, first_name: 'Tom', last_name: 'Okafor', username: 'tomo', language_code: 'en' }, chat: { id: fromId, type: 'private' }, text, ...extra } };
}
const contactOf = (ext, channelId = ch.id) => db.one('SELECT * FROM contacts WHERE workspace_id = ? AND channel_id = ? AND external_id = ?', wsId, channelId, String(ext));
const threadOf = (chatId, bc = '', channelId = ch.id) => db.one('SELECT * FROM threads WHERE channel_id = ? AND chat_id = ? AND business_connection_id = ?', channelId, String(chatId), bc);
const msgs = threadId => db.all('SELECT * FROM messages WHERE thread_id = ? ORDER BY id', threadId);

describe('telegram webhook auth', () => {
  test('wrong, missing secret and unknown channel are 403', async () => {
    let r = await hook(privateMsg(111, 'hi'), 'wrong-secret');
    assert.equal(r.status, 403);
    r = await hook(privateMsg(111, 'hi'), null);
    assert.equal(r.status, 403);
    r = await hook(privateMsg(111, 'hi'), SECRET, 999999);
    assert.equal(r.status, 403);
    db.update('channels', ch.id, { status: 'deleted' });
    try { assert.equal((await hook(privateMsg(111, 'hi'))).status, 403, 'deleted channel'); }
    finally { db.update('channels', ch.id, { status: 'active' }); }
    await h.sleep(50);
    assert.equal(contactOf(111), null);
    // Rejected updates must not advance last_update_id.
    assert.equal(db.one('SELECT last_update_id FROM channels WHERE id = ?', ch.id).last_update_id, 0);
  });

  test('webhook does not need the x-rv header (not an /api route)', async () => {
    const r = await h.client().post('/webhooks/telegram/' + ch.id, { update_id: ++updateId }, { csrf: false, headers: { 'x-telegram-bot-api-secret-token': SECRET } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
  });
});

describe('private chats', () => {
  test('a message creates contact + thread, stores inbound + AI reply, bills one conversation', async () => {
    const before = W();
    const u = privateMsg(4242, 'How much is the vitamin C serum?');
    const r = await hook(u);
    assert.equal(r.status, 200);
    const t = await h.waitFor(() => { const t = threadOf(4242); return t && msgs(t.id).some(m => m.author === 'ai') && t; }, { label: 'AI reply' });
    const c = contactOf(4242);
    assert.equal(c.name, 'Tom Okafor');
    assert.equal(c.username, 'tomo');
    assert.equal(c.lang, 'en');
    assert.equal(c.heat, 'warm', 'price question scores warm');
    assert.equal(c.stage, 'qualified');
    assert.equal(t.workspace_id, wsId);
    assert.equal(t.contact_id, c.id);
    assert.equal(t.closer_id, ace);
    const m = msgs(t.id);
    assert.equal(m[0].dir, 'in');
    assert.equal(m[0].author, 'customer');
    assert.equal(m[0].text, 'How much is the vitamin C serum?');
    assert.equal(JSON.parse(m[0].meta).message_id, u.message.message_id);
    const ai = m.find(x => x.author === 'ai');
    assert.equal(ai.dir, 'out');
    assert.ok(ai.text.length > 0);
    assert.match(ai.text, /pay\.example\.com\/glowlabs/, 'PayLink skill adds the link to a price question');
    assert.equal(JSON.parse(ai.meta).closer_id, ace);
    const after = W();
    assert.equal(after.conv_used, before.conv_used + 1);
    assert.equal(after.credits, before.credits);
    const th = threadOf(4242);
    assert.equal(th.units, 1);
    assert.equal(th.unit_replies, 1);
    assert.equal(db.one('SELECT last_update_id FROM channels WHERE id = ?', ch.id).last_update_id, u.update_id);
    assert.ok(db.one('SELECT id FROM events WHERE workspace_id = ? AND type = \'reply\' AND json_extract(data, \'$.thread_id\') = ?', wsId, t.id));
    assert.equal(h.outbound.filter(o => o.url.includes('api.telegram.org')).length, 0, 'no token, nothing sent to Telegram');
  });

  test('a follow-up in the same conversation is not billed again', async () => {
    const before = W().conv_used;
    await hook(privateMsg(4242, 'And do you ship to Lagos?'));
    await h.waitFor(() => msgs(threadOf(4242).id).filter(m => m.author === 'ai').length === 2, { label: 'second reply' });
    assert.equal(W().conv_used, before);
    assert.equal(threadOf(4242).unit_replies, 2);
    assert.equal(threadOf(4242).units, 1);
  });

  test('duplicate and older update_ids are ignored', async () => {
    const u = privateMsg(4242, 'Duplicate check message');
    await hook(u);
    await h.waitFor(() => msgs(threadOf(4242).id).some(m => m.text === 'Duplicate check message' ) && msgs(threadOf(4242).id).filter(m => m.author === 'ai').length === 3, { label: 'third reply' });
    const n = msgs(threadOf(4242).id).length;
    const used = W().conv_used;
    let r = await hook(u);
    assert.equal(r.status, 200, 'Telegram still gets 200 so it stops retrying');
    const older = privateMsg(4242, 'Old message');
    older.update_id = 5;
    r = await hook(older);
    assert.equal(r.status, 200);
    await h.sleep(150);
    assert.equal(msgs(threadOf(4242).id).length, n);
    assert.equal(db.one('SELECT COUNT(*) n FROM messages WHERE text = \'Old message\'').n, 0);
    assert.equal(W().conv_used, used);
  });

  test('/start greets with the Closer name without AI billing', async () => {
    const before = W().conv_used;
    await hook(privateMsg(5151, '/start'));
    const t = await h.waitFor(() => { const t = threadOf(5151); return t && msgs(t.id).length === 2 && t; }, { label: '/start reply' });
    const m = msgs(t.id);
    assert.equal(m[0].text, '/start');
    assert.equal(m[1].author, 'ai');
    assert.equal(m[1].text, 'Hi Tom! I’m Ace. How can I help you today?');
    assert.equal(W().conv_used, before);
  });

  test('handoff request marks the thread for a human', async () => {
    await hook(privateMsg(6161, 'I want a refund, talk to a human'));
    const t = await h.waitFor(() => { const t = threadOf(6161); return t && t.status === 'handoff' && t; }, { label: 'handoff' });
    const m = msgs(t.id);
    assert.ok(m.some(x => x.dir === 'note' && /handed this chat/.test(x.text)));
    assert.ok(!m.some(x => x.text.includes('[HANDOFF]')));
    assert.ok(db.one('SELECT id FROM events WHERE workspace_id = ? AND type = \'handoff\'', wsId));
    await h.waitFor(() => h.emails('demo@replyvoo.com', 'handoff-alert').length, { label: 'handoff email' });
    // Next customer message is stored but the AI stays quiet.
    const n = m.length;
    await hook(privateMsg(6161, 'hello?'));
    await h.waitFor(() => msgs(t.id).length === n + 1, { label: 'inbound stored' });
    await h.sleep(100);
    assert.equal(msgs(t.id).length, n + 1);
  });

  test('AI switched off on a thread: inbound stored, no reply, no billing', async () => {
    await hook(privateMsg(7171, 'first'));
    const t = await h.waitFor(() => { const t = threadOf(7171); return t && msgs(t.id).length === 2 && t; });
    db.update('threads', t.id, { ai_on: 0 });
    const used = W().conv_used;
    db.update('threads', t.id, { window_start: null });
    await hook(privateMsg(7171, 'second'));
    await h.waitFor(() => msgs(t.id).length === 3);
    await h.sleep(100);
    assert.equal(msgs(t.id).length, 3);
    assert.equal(W().conv_used, used);
  });

  test('blocked contacts are ignored entirely', async () => {
    await hook(privateMsg(7272, 'hey'));
    await h.waitFor(() => threadOf(7272) && msgs(threadOf(7272).id).length === 2);
    db.update('contacts', contactOf(7272).id, { blocked: 1 });
    await hook(privateMsg(7272, 'spam spam'));
    await h.sleep(150);
    assert.equal(msgs(threadOf(7272).id).length, 2);
  });

  test('out of conversations and credits: reply skipped, paused event, nothing charged', async () => {
    const saved = W();
    db.update('workspaces', wsId, { conv_used: 3500, credits: 0 });
    try {
      await hook(privateMsg(8181, 'Is the cream good?'));
      await h.waitFor(() => db.one('SELECT id FROM events WHERE workspace_id = ? AND type = \'paused\'', wsId), { label: 'paused event' });
      const t = threadOf(8181);
      assert.deepEqual(msgs(t.id).map(m => m.author), ['customer']);
      assert.equal(W().credits, 0);
      assert.equal(t.units, 0);
      await h.waitFor(() => h.emails('demo@replyvoo.com', 'low-credits').length, { label: 'out-of-credits email' });
    } finally { db.update('workspaces', wsId, { conv_used: saved.conv_used, credits: saved.credits }); }
  });

  test('Telegram send failure is tolerated: failed reply kept, conversation refunded', async () => {
    db.update('channels', ch.id, { token_enc: encrypt('123456:FAKE-TOKEN-FOR-TESTS') });
    try {
      const before = W();
      const r = await hook(privateMsg(9191, 'Do you have the Glow Bundle?'));
      assert.equal(r.status, 200);
      await h.waitFor(() => db.one('SELECT id FROM events WHERE workspace_id = ? AND type = \'error\' AND json_extract(data, \'$.thread_id\') = ?', wsId, (threadOf(9191) || {}).id), { label: 'error event' });
      const t = threadOf(9191);
      const m = msgs(t.id);
      assert.equal(m[0].author, 'customer');
      const out = m.find(x => x.dir === 'out');
      assert.ok(out, 'attempted reply is kept for the team');
      assert.equal(JSON.parse(out.meta).failed, true);
      assert.equal(W().conv_used, before.conv_used, 'undelivered conversation is refunded');
      assert.equal(W().credits, before.credits);
      assert.equal(t.units, 0);
      assert.ok(h.outbound.some(o => o.url.includes('/sendMessage')));
      // Server still healthy.
      assert.equal((await h.client().get('/healthz')).status, 200);
    } finally { db.update('channels', ch.id, { token_enc: encrypt('') }); }
  });

  test('non-text updates without a message are ignored safely', async () => {
    const r = await hook({ update_id: ++updateId, my_chat_member: { chat: { id: 1 } } });
    assert.equal(r.status, 200);
    const r2 = await hook({ update_id: ++updateId, message: { message_id: 1, chat: { id: 3, type: 'channel' }, from: { id: 3 }, text: 'x' } });
    assert.equal(r2.status, 200);
    await h.sleep(50);
    assert.equal(contactOf(3), null);
  });
});

describe('Telegram Business', () => {
  let biz;
  test('business_connection creates a telegram_business channel', async () => {
    await hook({ update_id: ++updateId, business_connection: { id: 'bc-conn-1', user: { id: 777, first_name: 'Grace', last_name: 'Lee', username: 'gracelee' }, user_chat_id: 777, date: 1, can_reply: true, is_enabled: true } });
    biz = await h.waitFor(() => db.one('SELECT * FROM channels WHERE type = \'telegram_business\' AND external_id = ?', 'bc-conn-1'), { label: 'business channel' });
    assert.equal(biz.workspace_id, wsId);
    assert.equal(biz.status, 'active');
    assert.equal(biz.name, 'Grace Lee');
    assert.equal(biz.username, 'gracelee');
    assert.equal(biz.closer_id, ace);
    const d = JSON.parse(biz.data);
    assert.equal(d.bot_channel_id, ch.id);
    assert.equal(d.user_id, 777);
    assert.equal(d.can_reply, true);
    // Re-sending the same connection updates instead of duplicating.
    await hook({ update_id: ++updateId, business_connection: { id: 'bc-conn-1', user: { id: 777, first_name: 'Grace' }, is_enabled: true } });
    await h.sleep(80);
    assert.equal(db.one('SELECT COUNT(*) n FROM channels WHERE external_id = ?', 'bc-conn-1').n, 1);
  });

  test('business_message from a customer is answered on the business channel', async () => {
    await hook({ update_id: ++updateId, business_message: { business_connection_id: 'bc-conn-1', message_id: 55, from: { id: 888, first_name: 'Maya' }, chat: { id: 888, type: 'private', first_name: 'Maya' }, text: 'How much is the Hydra Cream?' } });
    const t = await h.waitFor(() => { const t = threadOf(888, 'bc-conn-1', biz.id); return t && msgs(t.id).some(m => m.author === 'ai') && t; }, { label: 'business reply' });
    assert.equal(t.workspace_id, wsId);
    assert.ok(contactOf(888, biz.id));
    assert.equal(threadOf(888, '', ch.id), null, 'not routed to the bot channel');
  });

  test('the owner typing in their own business chat is stored as a human message', async () => {
    const t0 = threadOf(888, 'bc-conn-1', biz.id);
    const before = msgs(t0.id).length;
    const used = W().conv_used;
    await hook({ update_id: ++updateId, business_message: { business_connection_id: 'bc-conn-1', message_id: 56, from: { id: 777, first_name: 'Grace' }, chat: { id: 888, type: 'private', first_name: 'Maya' }, text: 'Hi Maya, Grace here personally' } });
    await h.waitFor(() => msgs(t0.id).length === before + 1, { label: 'owner message' });
    await h.sleep(80);
    const m = msgs(t0.id);
    assert.equal(m.length, before + 1);
    const last = m[m.length - 1];
    assert.equal(last.author, 'human');
    assert.equal(last.dir, 'out');
    assert.equal(JSON.parse(last.meta).owner, true);
    assert.equal(W().conv_used, used);
  });

  test('messages for an unknown or disabled business connection are dropped', async () => {
    await hook({ update_id: ++updateId, business_message: { business_connection_id: 'bc-unknown', message_id: 1, from: { id: 999 }, chat: { id: 999, type: 'private' }, text: 'hello' } });
    await hook({ update_id: ++updateId, business_connection: { id: 'bc-conn-1', user: { id: 777, first_name: 'Grace' }, is_enabled: false } });
    await h.waitFor(() => db.one('SELECT status FROM channels WHERE id = ?', biz.id).status === 'disabled', { label: 'disabled' });
    await hook({ update_id: ++updateId, business_message: { business_connection_id: 'bc-conn-1', message_id: 2, from: { id: 1234 }, chat: { id: 1234, type: 'private' }, text: 'hello' } });
    await h.sleep(120);
    assert.equal(db.one('SELECT COUNT(*) n FROM contacts WHERE external_id IN (\'999\', \'1234\')').n, 0);
  });
});

describe('groups', () => {
  const group = (text, extra = {}) => ({ update_id: ++updateId, message: { message_id: updateId, from: { id: 3030, first_name: 'Bayo' }, chat: { id: -100777, type: 'supergroup', title: 'Glow fans' }, text, ...extra } });

  test('a group message without a mention is ignored', async () => {
    await hook(group('hello everyone, how much is the serum?'));
    await h.sleep(150);
    assert.equal(db.one('SELECT COUNT(*) n FROM threads WHERE chat_id = \'-100777\'').n, 0);
    assert.equal(db.one('SELECT COUNT(*) n FROM contacts WHERE external_id LIKE \'-100777:%\'').n, 0);
  });

  test('a mention gets an answer in the group thread', async () => {
    await hook(group('@GlowLabs_Shop_Bot how much is the serum?'));
    const t = await h.waitFor(() => { const t = threadOf(-100777); return t && msgs(t.id).some(m => m.author === 'ai') && t; }, { label: 'group reply' });
    const c = db.one('SELECT * FROM contacts WHERE id = ?', t.contact_id);
    assert.equal(c.external_id, '-100777:3030');
    const inbound = msgs(t.id).find(m => m.dir === 'in');
    assert.equal(inbound.text, 'how much is the serum?', 'mention stripped');
  });

  test('a reply to the bot counts as a mention', async () => {
    db.update('channels', ch.id, { external_id: '424242' });
    const t = threadOf(-100777);
    const n = msgs(t.id).filter(m => m.author === 'ai').length;
    await hook(group('and the cream?', { reply_to_message: { message_id: 1, from: { id: 424242, is_bot: true } } }));
    await h.waitFor(() => msgs(t.id).filter(m => m.author === 'ai').length === n + 1, { label: 'reply-to-bot answer' });
  });
});
