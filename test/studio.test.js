'use strict';
// Agent Studio training: knowledge CRUD + isolation, parsers, SSRF guard, retrieval, rules, gaps,
// score, scenarios, versions and roles.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const T = require('../src/services/training');
const ai = require('../src/services/ai');

let env, db, A, B, agent, aWs, ace;

before(async () => {
  env = await h.boot();
  db = env.db;
  A = await h.login(h.DEMO.email, h.DEMO.password);
  aWs = db.one('SELECT * FROM workspaces WHERE name = ?', 'Glow Labs');
  ace = db.one('SELECT * FROM closers WHERE workspace_id = ? AND name = ?', aWs.id, 'Ace');
  B = (await h.signup({ email: 'studio.b@example.com' })).client;
  const s = await h.signup({ email: 'studio.agent@example.com' });
  db.insert('members', { workspace_id: aWs.id, user_id: s.user.id, role: 'agent', created_at: db.now() });
  agent = s.client;
  assert.equal((await agent.post('/api/app/workspaces/switch', { id: aWs.id })).status, 200);
});
after(() => env.close());

describe('knowledge', () => {
  test('CRUD with validation', async () => {
    const base = '/api/app/closers/' + ace.id + '/knowledge';
    let r = await A.post(base, { kind: 'qa', question: 'Do you sell gift cards?', answer: 'Yes, from $10 to $200.', data: { alt: 'gift voucher, e-gift card' } });
    assert.equal(r.status, 200, r.text);
    const id = r.body.id;
    assert.deepEqual(r.body.data.alt, ['gift voucher', 'e-gift card']);
    assert.equal((await A.post(base, { kind: 'qa', question: 'Missing answer' })).status, 400);
    assert.equal((await A.post(base, { kind: 'product', title: '' })).status, 400);
    r = await A.post(base, { kind: 'product', title: 'Lip Balm', answer: 'Tinted', data: { price: '$7.50', link: 'javascript:alert(1)' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.price, 7.5);
    assert.equal(r.body.data.currency, 'USD');
    assert.equal(r.body.data.link, undefined, 'unsafe links are dropped');
    r = await A.put(base + '/' + id, { answer: 'Yes, from $10.', enabled: false });
    assert.equal(r.status, 200);
    assert.equal(r.body.answer, 'Yes, from $10.');
    assert.equal(r.body.enabled, false);
    assert.equal(r.body.question, 'Do you sell gift cards?', 'unchanged fields kept');
    r = await A.post(base, { items: [{ kind: 'qa', question: 'Q1?', answer: 'A1' }, { kind: 'policy', answer: 'Mon-Fri', data: { topic: 'hours' } }] });
    assert.equal(r.body.added, 2);
    assert.equal(r.body.items.find(i => i.kind === 'policy' && i.answer === 'Mon-Fri').title, 'Opening hours');
    assert.equal((await A.del(base + '/' + id)).status, 200);
    assert.equal(db.one('SELECT id FROM closer_knowledge WHERE id = ?', id), null);
  });

  test('isolation between workspaces', async () => {
    const k = db.one('SELECT id FROM closer_knowledge WHERE closer_id = ? LIMIT 1', ace.id);
    const base = '/api/app/closers/' + ace.id;
    for (const [m, p, b] of [['GET', base + '/knowledge'], ['GET', base + '/training'], ['POST', base + '/knowledge', { kind: 'qa', question: 'x', answer: 'y' }], ['PUT', base + '/knowledge/' + k.id, { answer: 'pwned' }], ['DELETE', base + '/knowledge/' + k.id], ['GET', base + '/gaps'], ['GET', base + '/score'], ['POST', base + '/versions/1/restore']]) {
      const r = await B.req(m, p, b);
      assert.equal(r.status, 404, m + ' ' + p + ' -> ' + r.status);
    }
    // B's own closer can't reach A's item id either.
    const bWs = db.one('SELECT w.* FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE u.email = ?', 'studio.b@example.com');
    const r = await B.post('/api/app/closers', { name: 'Bee' });
    assert.equal(r.status, 200);
    assert.equal((await B.put('/api/app/closers/' + r.body.id + '/knowledge/' + k.id, { answer: 'pwned' })).status, 404);
    assert.notEqual(db.one('SELECT answer FROM closer_knowledge WHERE id = ?', k.id).answer, 'pwned');
    // Preview with someone else's closer_id is refused.
    assert.equal((await B.post('/api/app/closers/preview', { closer_id: ace.id, message: 'hi' })).status, 404);
    void bWs;
  });

  test('agent role can read and test but cannot edit (403)', async () => {
    const base = '/api/app/closers/' + ace.id;
    assert.equal((await agent.get(base + '/training')).status, 200);
    assert.equal((await agent.post('/api/app/closers/preview', { closer_id: ace.id, message: 'Is it vegan?' })).status, 200);
    const k = db.one('SELECT id FROM closer_knowledge WHERE closer_id = ? LIMIT 1', ace.id);
    for (const [m, p, b] of [['POST', base + '/knowledge', { kind: 'qa', question: 'x', answer: 'y' }], ['PUT', base + '/knowledge/' + k.id, { answer: 'x' }], ['DELETE', base + '/knowledge/' + k.id], ['POST', base + '/knowledge/parse', { format: 'qa', text: 'Q: a A: b' }], ['POST', base + '/import-url', { url: 'https://example.com' }], ['POST', base + '/gaps/dismiss', { key: 'x' }], ['PUT', base + '/scenarios', { scenarios: [] }], ['PUT', base + '/coach', { step: 2 }], ['POST', base + '/versions/1/restore'], ['PUT', base, { rules: { dont: ['x'] } }]]) {
      const r = await agent.req(m, p, b);
      assert.equal(r.status, 403, m + ' ' + p + ' -> ' + r.status);
    }
  });
});

describe('parsers', () => {
  test('bulk Q&A parsing: Q:/A: blocks, multi-line answers, and question-mark fallback', () => {
    const qa = T.parseQA('Intro text\nQ: Do you deliver on Sundays?\nA: No.\nBut Saturday works.\n\nQuestion: Can I pay by card?\nAnswer: Yes, card or transfer.\nQ: Empty one\n');
    assert.equal(qa.length, 2);
    assert.equal(qa[0].question, 'Do you deliver on Sundays?');
    assert.equal(qa[0].answer, 'No. But Saturday works.');
    assert.equal(qa[1].answer, 'Yes, card or transfer.');
    const plain = T.parseQA('Where are you?\nWe are online only.\n\nHow long is delivery?\n2 to 4 days.');
    assert.deepEqual(plain.map(x => x.question), ['Where are you?', 'How long is delivery?']);
    assert.equal(plain[1].answer, '2 to 4 days.');
  });

  test('CSV product import: header, quotes, currencies, bad prices, missing names', () => {
    const r = T.parseProducts('Name,Price,Description,Link,Stock\n"Serum, 30ml",$24,"Bright ""glow""",https://shop.example.com/s,yes\nCream,€19.50,,ftp://bad,no\n,10,No name,,\nMask,abc,Clay,,');
    assert.equal(r.items.length, 3);
    assert.equal(r.items[0].title, 'Serum, 30ml');
    assert.equal(r.items[0].answer, 'Bright "glow"');
    assert.equal(r.items[0].data.price, 24);
    assert.equal(r.items[0].data.link, 'https://shop.example.com/s');
    assert.equal(r.items[1].data.currency, 'EUR');
    assert.equal(r.items[1].data.price, 19.5);
    assert.equal(r.items[1].data.stock, false);
    assert.equal(r.items[1].data.link, undefined);
    assert.equal(r.items[2].data.price, null);
    assert.equal(r.errors.length, 2);
    const noHeader = T.parseProducts('Hat,15,Warm,https://x.example.com');
    assert.equal(noHeader.items[0].title, 'Hat');
    assert.equal(noHeader.items[0].data.price, 15);
  });

  test('HTML to text drops scripts, styles, nav and footer and decodes entities', () => {
    const html = '<html><head><title>FAQ &amp; Help</title><style>.x{color:red}</style></head><body><nav><a>Home</a><a>Shop</a></nav>' +
      '<script>alert("hi")</script><main><h1>Delivery</h1><p>We ship in 2&ndash;4 days.<br>Free over &#36;50.</p><ul><li>Spain</li><li>France</li></ul><!-- secret --></main><footer>© 2026 Glow</footer></body></html>';
    const r = T.htmlToText(html);
    assert.equal(r.title, 'FAQ & Help');
    assert.ok(!/alert|color:red|Home|Shop|secret|2026/.test(r.text), r.text);
    assert.match(r.text, /We ship in 2–4 days\./);
    assert.match(r.text, /Free over \$50\./);
    assert.match(r.text, /- Spain\n- France/);
    const ch = T.chunkText('a'.repeat(400) + '\n' + 'b'.repeat(400) + '\n' + 'c'.repeat(10), 700);
    assert.equal(ch.length, 2);
  });

  test('parse endpoint returns previews without saving', async () => {
    const n = db.one('SELECT COUNT(*) n FROM closer_knowledge').n;
    let r = await A.post('/api/app/closers/' + ace.id + '/knowledge/parse', { format: 'qa', text: 'Q: Hi?\nA: Hello' });
    assert.equal(r.status, 200);
    assert.equal(r.body.items[0].question, 'Hi?');
    r = await A.post('/api/app/closers/' + ace.id + '/knowledge/parse', { format: 'csv', text: 'name,price\nCap,12' });
    assert.equal(r.body.items[0].data.price, 12);
    r = await A.post('/api/app/closers/' + ace.id + '/knowledge/parse', { format: 'qa', text: 'nothing here' });
    assert.equal(r.status, 400);
    r = await A.post('/api/app/closers/' + ace.id + '/knowledge/parse', { format: 'doc', text: 'x'.repeat(205 * 1024) });
    assert.equal(r.status, 400);
    assert.equal(db.one('SELECT COUNT(*) n FROM closer_knowledge').n, n);
  });
});

describe('SSRF guard', () => {
  test('private, loopback, link-local, IPv6 loopback and non-http targets are refused', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.3.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '224.0.0.1']) assert.equal(T.isPrivateIp(ip), true, ip);
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(T.isPrivateIp(ip), false, ip);
    const lookupTo = addr => (host, opts, cb) => cb(null, [{ address: addr, family: addr.includes(':') ? 6 : 4 }]);
    const bad = ['http://localhost/', 'http://127.0.0.1/admin', 'http://10.1.2.3/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'file:///etc/passwd', 'ftp://example.com/', 'gopher://example.com', 'javascript:alert(1)', 'http://example.com:8080/', 'http://user:pw@example.com/', 'http://intranet/', 'http://printer.local/'];
    for (const u of bad) await assert.rejects(T.checkUrl(u, lookupTo('93.184.216.34')), e => e instanceof T.ImportError, u);
    // A public-looking host that resolves to a private address is refused too.
    await assert.rejects(T.checkUrl('https://evil.example.com/', lookupTo('10.0.0.1')), /private network/);
    await assert.rejects(T.checkUrl('https://evil.example.com/', lookupTo('::1')), /private network/);
    const ok = await T.checkUrl('https://shop.example.com/faq', lookupTo('93.184.216.34'));
    assert.equal(ok.hostname, 'shop.example.com');
  });

  test('import-url endpoint gives a friendly error and never fetches private hosts', async () => {
    const r = await A.post('/api/app/closers/' + ace.id + '/import-url', { url: 'http://127.0.0.1:' + new URL(env.base).port + '/api/app/bootstrap' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /private network|standard web ports/);
    const r2 = await A.post('/api/app/closers/' + ace.id + '/import-url', { url: 'not a url at all' });
    assert.ok([400, 502].includes(r2.status));
    assert.ok(r2.body.error.length > 10);
  });
});

describe('retrieval and replies', () => {
  const items = [
    { id: 1, kind: 'qa', question: 'Do you deliver on Sundays?', answer: 'QA: No Sunday deliveries.', data: {}, enabled: true },
    { id: 2, kind: 'correction', question: 'Do you deliver on Sundays?', answer: 'FIXED: Yes, Sundays in Madrid only.', data: {}, enabled: true },
    { id: 3, kind: 'qa', question: 'Is it vegan?', answer: 'Yes, vegan.', data: {}, enabled: true },
    { id: 4, kind: 'product', title: 'Vitamin C Serum', answer: 'Best seller', data: { price: 24, currency: 'USD', stock: true }, enabled: true },
    { id: 5, kind: 'qa', question: 'Off item about Sundays deliveries', answer: 'DISABLED', data: {}, enabled: false }
  ];
  test('ranks corrections above Q&A above notes, and skips disabled items', () => {
    const k = T.buildKnowledge(items, 'NOTES: we deliver every day.', 'Do you deliver on Sundays?');
    const t = k.text;
    assert.ok(t.indexOf('FIXED') >= 0 && t.indexOf('FIXED') < t.indexOf('QA: No Sunday'), t);
    assert.ok(t.indexOf('QA: No Sunday') < t.indexOf('NOTES: we deliver'), t);
    assert.ok(!t.includes('DISABLED'));
    assert.match(t, /Vitamin C Serum: \$24/, 'products always included when small');
    assert.equal(k.sources[0].kind, 'correction');
    assert.equal(T.bestAnswer(items, '', 'do you deliver on sundays').item.id, 2);
    assert.equal(T.bestAnswer(items, '', 'how much is the vitamin c serum?').text.startsWith('Vitamin C Serum is $24'), true);
    assert.equal(T.tokens('shipping costs').join(' '), 'deliver price', 'synonyms + stemming');
  });

  test('demo reply uses a taught Q&A, and a new correction wins next time', async () => {
    const q = 'Do you have a loyalty card?';
    let r = await A.post('/api/app/closers/preview', { closer_id: ace.id, name: 'Ace', template: 'sales', message: q });
    assert.equal(r.status, 200);
    assert.equal(r.body.handoff, true, 'unknown question: graceful handoff');
    assert.match(r.body.text, /check with the team/);
    await A.post('/api/app/closers/' + ace.id + '/knowledge', { kind: 'qa', question: q, answer: 'Yes! Every 5th order gets 20% off.' });
    r = await A.post('/api/app/closers/preview', { closer_id: ace.id, name: 'Ace', template: 'sales', message: 'do you have a loyalty card' });
    assert.equal(r.body.text, 'Yes! Every 5th order gets 20% off.');
    assert.equal(r.body.used.kind, 'qa');
    await A.post('/api/app/closers/' + ace.id + '/knowledge', { kind: 'correction', question: q, answer: 'Yes, the Glow Card: every 5th order is free.', data: { ai_answer: 'Yes! Every 5th order gets 20% off.' } });
    r = await A.post('/api/app/closers/preview', { closer_id: ace.id, name: 'Ace', template: 'sales', message: q });
    assert.equal(r.body.text, 'Yes, the Glow Card: every 5th order is free.');
    assert.equal(r.body.used.kind, 'correction');
  });

  test('rules appear in the system prompt after the safety lines', () => {
    const rules = { do: ['Mention free gift wrap'], dont: ['Promise delivery dates'], avoid: ['politics'], required: ['— Team Glow'], discount: { mode: 'never' }, handoff: { angry: true, refund: true, human: true, legal: true, order_over: 500, keywords: ['wholesale'] }, hours: 'Mon-Fri 9-5', language: { mode: 'force', lang: 'Spanish' } };
    const p = ai.systemPrompt({ name: 'Ace', template: 'sales', persona: {}, skills: { handoff: true }, rules, instructions: 'Be nice' }, 'Glow Labs');
    for (const s of ['Always: Mention free gift wrap', 'Never: Promise delivery dates', 'politics', '— Team Glow', 'Never offer, promise or hint at discounts', 'Mon-Fri 9-5', 'Always reply in Spanish', 'more than 500', 'wholesale', 'legal, medical']) assert.ok(p.includes(s), 'missing: ' + s);
    assert.ok(p.indexOf('be honest that you are an AI') < p.indexOf('Business rules from the owner'), 'safety first');
    assert.ok(p.indexOf('Never invent discounts') < p.indexOf('Never: Promise'));
    const plain = ai.systemPrompt({ name: 'Ace', template: 'sales', persona: {}, skills: {} }, 'X');
    assert.ok(!plain.includes('Business rules'));
    assert.match(plain, /asks for a refund or withdrawal/, 'default handoff line kept without rules');
  });

  test('demo replies follow rules: discount cap, keyword handoff, honest AI, required phrase', async () => {
    const c = { name: 'Ace', template: 'sales', persona: {}, skills: { handoff: true }, knowledge: 'We sell serums.', items: [], rules: { discount: { mode: 'max', max: 15 }, handoff: { keywords: ['wholesale'] }, required: ['— Team Glow'] } };
    let r = await ai.reply({ closer: c, business: 'Glow Labs', message: 'Can I get a discount?' });
    assert.match(r.text, /15%/); assert.match(r.text, /— Team Glow$/);
    r = await ai.reply({ closer: c, business: 'Glow Labs', message: 'I want to buy wholesale' });
    assert.equal(r.handoff, true);
    r = await ai.reply({ closer: c, business: 'Glow Labs', message: 'Are you a bot?' });
    assert.match(r.text, /AI assistant for Glow Labs/);
    assert.equal(T.checkScenario('honest', r, c.rules).pass, true);
    assert.equal(T.checkScenario('discount', { text: 'You get 30% off!' }, c.rules).pass, false);
    assert.equal(T.checkScenario('price', { text: 'It costs $24.' }).pass, true);
  });
});

describe('gaps, score, scenarios, versions', () => {
  test('gaps group the same question, skip intentional handoffs, and close when taught or dismissed', async () => {
    let r = await A.get('/api/app/closers/' + ace.id + '/gaps');
    assert.equal(r.status, 200);
    const gift = r.body.find(g => /gift wrap/i.test(g.question));
    assert.ok(gift, JSON.stringify(r.body));
    assert.equal(gift.count, 2, 'two phrasings grouped');
    assert.ok(r.body.some(g => /Lisbon/.test(g.question) && g.reasons.includes('human')));
    assert.ok(!r.body.some(g => /refund/i.test(g.question)));
    await A.post('/api/app/closers/' + ace.id + '/knowledge', { kind: 'qa', question: gift.question, answer: 'Yes, free gift wrap.', source: 'gap', data: { gap_key: gift.key } });
    r = await A.get('/api/app/closers/' + ace.id + '/gaps');
    assert.ok(!r.body.some(g => g.key === gift.key));
    const lis = r.body.find(g => /Lisbon/.test(g.question));
    assert.equal((await A.post('/api/app/closers/' + ace.id + '/gaps/dismiss', { key: lis.key })).status, 200);
    r = await A.get('/api/app/closers/' + ace.id + '/gaps');
    assert.equal(r.body.length, 0);
    const list = await A.get('/api/app/closers');
    assert.equal(list.body.find(c => c.id === ace.id).gaps, 0);
  });

  test('score computation and scenario runs', async () => {
    const empty = T.score({ template: 'sales', persona: '{}', training: '{}', rules: '{}', pay_link: '' }, [], 2);
    assert.equal(empty.score, 0);
    assert.equal(empty.checklist.length, 8);
    const half = T.score({ template: 'support', persona: '{"tone":10}', training: '{}', rules: '{}', pay_link: '' }, [{ kind: 'qa', question: 'a', answer: 'b', enabled: true }, { kind: 'policy', answer: 'x', data: { topic: 'delivery' }, enabled: true }], 0);
    assert.equal(half.score, 10 + 4 + 5 + 10 + 10, 'personality + 1/5 Q&A + 1/3 policies + pay link not needed + no gaps');
    let r = await A.get('/api/app/closers/' + ace.id + '/score');
    const before = r.body.score;
    assert.ok(before > 50 && before < 100, String(before));
    for (const s of ['bot', 'unknown', 'refund']) {
      const sc = T.SCENARIOS.find(x => x.key === s);
      const p = await A.post('/api/app/closers/preview', { closer_id: ace.id, name: 'Ace', template: 'sales', message: sc.text, scenario: { key: sc.key, expect: sc.expect } });
      assert.equal(p.body.check.pass, true, s + ': ' + p.body.text);
    }
    r = await A.get('/api/app/closers/' + ace.id + '/score');
    assert.equal(r.body.checklist.find(c => c.id === 'tests').done, true);
    assert.ok(r.body.score > before);
    assert.equal(r.body.score, 100);
    r = await A.put('/api/app/closers/' + ace.id + '/scenarios', { scenarios: [{ text: 'Can I pay on delivery?', expect: 'answer' }, { text: '' }] });
    assert.equal(r.body.scenarios.length, 1);
  });

  test('saving keeps the last 10 versions, and restore brings old rules back', async () => {
    const base = '/api/app/closers/' + ace.id;
    let r = await A.put(base, { instructions: 'Version A', rules: { dont: ['Say A'] } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.rules.dont, ['Say A']);
    for (let i = 0; i < 11; i++) await A.put(base, { instructions: 'Version ' + i });
    const vs = (await A.get(base + '/versions')).body;
    assert.equal(vs.length, 10);
    assert.equal(db.one('SELECT COUNT(*) n FROM closer_versions WHERE closer_id = ?', ace.id).n, 10);
    await A.put(base, { instructions: 'Version A', rules: { dont: ['Say A'] } });
    await A.put(base, { instructions: 'Version B', rules: { dont: ['Say B'] } });
    const v = (await A.get(base + '/versions')).body.find(x => x.data.instructions === 'Version A');
    r = await A.post(base + '/versions/' + v.id + '/restore');
    assert.equal(r.status, 200);
    assert.equal(r.body.instructions, 'Version A');
    assert.deepEqual(r.body.rules.dont, ['Say A']);
    assert.match((await A.get(base + '/versions')).body[0].label, /^Restored from/);
  });

  test('coach state and inactive creation', async () => {
    const s = await h.signup();
    const r = await s.client.post('/api/app/closers', { name: 'Coachy', active: false });
    assert.equal(r.body.active, false);
    assert.equal((await s.client.put('/api/app/closers/' + r.body.id + '/coach', { step: 3, done: [1, 2], personality_ok: true })).status, 200);
    const t = (await s.client.get('/api/app/closers/' + r.body.id + '/training')).body;
    assert.equal(t.coach.step, 3);
    assert.equal(t.checklist.find(c => c.id === 'personality').done, true);
    assert.equal(t.versions.length, 1);
  });
});
