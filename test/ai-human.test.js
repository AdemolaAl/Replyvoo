'use strict';
// Human-like replies: style examples, customer memory, message splitting, careful mode and the backup AI.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const h = require('./helpers');

let ctx, backup, seen = [];
before(async () => {
  ctx = await h.boot();
  backup = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      seen.push({ auth: req.headers.authorization, body: JSON.parse(b) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'Yes Mia, it’s in stock!\n||\nWant me to hold one for you?' } }], usage: { total_tokens: 42 } }));
    });
  });
  await new Promise(r => backup.listen(0, '127.0.0.1', r));
});
after(async () => { await new Promise(r => backup.close(r)); await ctx.close(); });

test('the prompt carries the owner’s style and what the Closer remembers', () => {
  const ai = require('../src/services/ai');
  const p = ai.systemPrompt({ name: 'Ace', template: 'sales', persona: { tone: 20, style: 'Heyy! we got you 😊' }, skills: {} }, 'Glow Labs', 'telegram', { name: 'Mia Klein', chats: 3, stage: 'won', value: 38, notes: 'Prefers express delivery' });
  assert.match(p, /STYLE EXAMPLES[\s\S]*Heyy! we got you/);
  assert.match(p, /never copy facts/);
  assert.match(p, /Name: Mia Klein/);
  assert.match(p, /chatted with you 3 times/);
  assert.match(p, /bought before/);
  assert.match(p, /Prefers express delivery/);
  assert.match(p, /\|\| between them/);
  const off = ai.systemPrompt({ name: 'Ace', template: 'sales', persona: { human: false }, skills: {} }, 'Glow Labs', 'telegram');
  assert.doesNotMatch(off, /\|\| between them/);
  const web = ai.systemPrompt({ name: 'Ace', template: 'sales', persona: {}, skills: {} }, 'Glow Labs', 'website');
  assert.doesNotMatch(web, /\|\| between them/); // the website widget shows one bubble per reply
});

test('|| splits a reply into at most three chat messages', () => {
  const { strip } = require('../src/services/ai');
  assert.deepEqual(strip('Yes!\n||\nWant the link?').parts, ['Yes!', 'Want the link?']);
  assert.equal(strip('Yes!\n||\nWant the link?').text, 'Yes!\n\nWant the link?');
  assert.equal(strip('One message only.').parts, null);
  assert.equal(strip('Use a||b').parts, null); // only a line with just || splits
  const four = strip('A\n||\nB\n||\nC\n||\nD, pay here: https://x');
  assert.equal(four.parts.length, 3);
  assert.match(four.parts[2], /pay here: https:\/\/x/); // nothing is dropped
  assert.equal(strip('Sorry about that [HANDOFF]').handoff, true);
});

test('risky messages get careful mode', () => {
  const { RISKY } = require('../src/services/ai');
  for (const m of ['I want a refund', 'this is the worst service', 'can you give me a discount?', 'my order arrived damaged']) assert.ok(RISKY.test(m), m);
  for (const m of ['how much is the serum?', 'do you ship to Spain?']) assert.ok(!RISKY.test(m), m);
});

test('if Claude is down, the backup AI answers in the same voice', async () => {
  const config = require('../src/config');
  const ai = require('../src/services/ai');
  const prev = { ...config.ai };
  Object.assign(config.ai, { key: 'sk-ant-test', openaiKey: 'sk-backup', openaiUrl: 'http://127.0.0.1:' + backup.address().port + '/v1/chat/completions', openaiModel: 'backup-model' });
  try {
    const out = await ai.reply({ closer: { name: 'Ace', template: 'sales', persona: {}, skills: {}, knowledge: 'Vitamin C Serum costs $24.' }, business: 'Glow Labs', message: 'Is the serum in stock?', customer: { name: 'Mia Klein', chats: 2 } });
    assert.equal(out.provider, 'openai');
    assert.deepEqual(out.parts, ['Yes Mia, it’s in stock!', 'Want me to hold one for you?']);
    const sent = seen.pop();
    assert.equal(sent.auth, 'Bearer sk-backup');
    assert.equal(sent.body.model, 'backup-model');
    assert.equal(sent.body.messages[0].role, 'system');
    assert.match(sent.body.messages[0].content, /KNOWLEDGE[\s\S]*\$24/);
    assert.match(sent.body.messages[0].content, /Name: Mia Klein/);
    assert.equal(sent.body.messages.at(-1).content, 'Is the serum in stock?');
    // The Claude request (unreachable in tests) asked for careful thinking on a refund message.
    const before = h.outbound.length;
    await ai.reply({ closer: { name: 'Ace', template: 'sales', persona: {}, skills: {}, knowledge: '' }, business: 'Glow Labs', message: 'I want a refund now' });
    const claudeCall = h.outbound.slice(before).find(o => /anthropic/.test(o.url));
    assert.ok(claudeCall);
    assert.equal(JSON.parse(claudeCall.body).thinking.type, 'enabled');
  } finally { Object.assign(config.ai, prev); }
});

test('the Closer remembers returning customers', () => {
  const engine = require('../src/services/engine');
  const { ws } = h.makeWorkspace();
  const { contactId } = h.makeThread(ws.id);
  ctx.db.update('contacts', contactId, { notes: 'VIP, buys every month', stage: 'won', value: 120 });
  const m = engine.memory(contactId);
  assert.equal(m.notes, 'VIP, buys every month');
  assert.equal(m.stage, 'won');
  assert.equal(m.value, 120);
  assert.equal(engine.typingMs('hello', 0), 0); // no artificial waits in tests
});

test('style examples and the human-like switch are saved on the Closer', async () => {
  const s = await h.signup();
  const r = await s.client.post('/api/app/closers', { name: 'Zed', template: 'sales', persona: { tone: 20, style: 'Heyy! yes o 😊', human: false } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.persona.style, 'Heyy! yes o 😊');
  assert.equal(r.body.persona.human, false);
});
