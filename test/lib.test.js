'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
require('./helpers');

const security = require('../src/lib/security');
const md = require('../src/lib/md');
const tpl = require('../src/lib/tpl');
const { cleanMoji } = require('../src/lib/moji');
const { createApp, HttpError } = require('../src/lib/http');

describe('security', () => {
  test('hashPassword / verifyPassword', () => {
    const h = security.hashPassword('correct horse');
    assert.match(h, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    assert.notEqual(security.hashPassword('correct horse'), h, 'salted: two hashes differ');
    assert.equal(security.verifyPassword('correct horse', h), true);
    assert.equal(security.verifyPassword('wrong horse', h), false);
    assert.equal(security.verifyPassword('', h), false);
    assert.equal(security.verifyPassword('x', ''), false);
    assert.equal(security.verifyPassword('x', null), false);
    assert.equal(security.verifyPassword('x', 'bcrypt$abc'), false);
  });

  test('encrypt / decrypt round-trip', () => {
    const secret = '123456789:AAH-bot-token_with_symbols ✓';
    const blob = security.encrypt(secret);
    assert.match(blob, /^v1:/);
    assert.ok(!blob.includes('AAH'), 'ciphertext does not leak plaintext');
    assert.notEqual(security.encrypt(secret), blob, 'random IV');
    assert.equal(security.decrypt(blob), secret);
    assert.equal(security.encrypt(''), '');
    assert.equal(security.decrypt(''), '');
    assert.equal(security.decrypt('v0:abc'), '');
  });

  test('decrypt rejects tampered ciphertext', () => {
    const blob = security.encrypt('hello world');
    const parts = blob.split(':');
    const data = Buffer.from(parts[3], 'base64'); data[0] ^= 1;
    parts[3] = data.toString('base64');
    assert.throws(() => security.decrypt(parts.join(':')));
  });

  test('safeEqual', () => {
    assert.equal(security.safeEqual('abc', 'abc'), true);
    assert.equal(security.safeEqual('abc', 'abd'), false);
    assert.equal(security.safeEqual('abc', 'abcd'), false);
    assert.equal(security.safeEqual('', ''), true);
    assert.equal(security.safeEqual(123, '123'), true);
  });

  test('tokens, refCode, orderRef, sha256, hmac', () => {
    assert.match(security.token(16), /^[A-Za-z0-9_-]{22}$/);
    assert.match(security.refCode(), /^[a-z2-9]{8}$/);
    assert.match(security.orderRef(), /^RV-[0-9A-Z]+-[0-9A-F]{6}$/);
    assert.equal(security.sha256('a'), 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
    assert.equal(security.hmac('x', 'k'), security.hmac('x', 'k'));
    assert.notEqual(security.hmac('x', 'k'), security.hmac('x', 'k2'));
  });
});

describe('md', () => {
  test('escapes raw HTML and script tags', () => {
    const { html } = md.render('Hello <script>alert(1)</script> & <b>bold</b>');
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('&amp;'));
    assert.ok(!html.includes('<b>'));
  });

  test('links: safe schemes kept, javascript: rejected', () => {
    const ok = md.render('[site](https://example.com/a?b=1&c=2)').html;
    assert.ok(ok.includes('href="https://example.com/a?b=1&amp;c=2"'), ok);
    assert.ok(ok.includes('target="_blank" rel="noopener"'));
    const rel = md.render('[home](/pricing)').html;
    assert.ok(rel.includes('href="/pricing"') && !rel.includes('target='));
    const bad = md.render('[click](javascript:alert(1))').html;
    assert.ok(!/href="javascript:/i.test(bad), bad);
    assert.ok(bad.includes('href="#"'));
    const bad2 = md.render('[x](JaVaScRiPt:alert(1))').html;
    assert.ok(!/javascript:/i.test(bad2.replace(/>[^<]*</g, '><')), bad2);
    const img = md.render('![a](javascript:alert(1))').html;
    assert.ok(!/src="javascript:/i.test(img));
    const dataUrl = md.render('[x](data:text/html,hi)').html;
    assert.ok(dataUrl.includes('href="#"'));
  });

  test('attribute injection through link text/href is escaped', () => {
    const h = md.render('[x](https://a.com/"onmouseover="alert(1))').html;
    assert.ok(!h.includes('"onmouseover="'), h);
  });

  test('headings build a TOC (h2 level only) with slug ids', () => {
    // "#" and "##" both render as <h2> (the page owns the <h1>); "###" is <h3> and stays out of the TOC.
    const r = md.render('# Getting Started\n\nText\n\n## Sub *part*\n\n### Deeper\n\n# Second One!');
    assert.deepEqual(r.toc.map(t => t.id), ['getting-started', 'sub-part', 'second-one']);
    assert.equal(r.toc[0].text, 'Getting Started');
    assert.equal(r.toc[1].text, 'Sub part');
    assert.ok(r.html.includes('<h2 id="getting-started">Getting Started</h2>'));
    assert.ok(r.html.includes('<h2 id="sub-part">Sub <em>part</em></h2>'), r.html);
    assert.ok(r.html.includes('<h3 id="deeper">Deeper</h3>'), r.html);
    assert.ok(!r.html.includes('<h1'));
    const shifted = md.render('## A', { shiftHeadings: true });
    assert.ok(shifted.html.includes('<h3 id="a">'));
    assert.equal(shifted.toc.length, 0);
  });

  test('lists, code blocks, quotes, emphasis', () => {
    const r = md.render('- a\n- **b**\n\n1. one\n2. two\n\n> quoted\n\n```\n<x>\n```\n\nuse `<tag>` *now*').html;
    assert.ok(r.includes('<ul><li>a</li><li><strong>b</strong></li></ul>'));
    assert.ok(r.includes('<ol><li>one</li><li>two</li></ol>'));
    assert.ok(r.includes('<blockquote><p>quoted</p></blockquote>'));
    assert.ok(r.includes('<pre><code>&lt;x&gt;</code></pre>'));
    assert.ok(r.includes('<code>&lt;tag&gt;</code>'));
    assert.ok(r.includes('<em>now</em>'));
  });

  test('frontMatter, slugify, plain, esc', () => {
    const fm = md.frontMatter('---\ntitle: "Hello: World"\ndate: 2026-01-01\n---\nBody here');
    assert.equal(fm.data.title, 'Hello: World');
    assert.equal(fm.data.date, '2026-01-01');
    assert.equal(fm.body, 'Body here');
    assert.deepEqual(md.frontMatter('no fm').data, {});
    assert.equal(md.slugify('Hello, World! <b>x</b>'), 'hello-world-x');
    assert.equal(md.plain('# Title\n[link](http://x) **b**'), 'Title link b');
    assert.equal(md.esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });
});

describe('tpl', () => {
  test('{{x}} is escaped, {{{x}}} is raw, dotted paths work', () => {
    const d = { x: '<b>"hi"</b>', site: { hero: { title: 'T&C' } } };
    assert.equal(tpl.render('{{x}}', d), '&lt;b&gt;&quot;hi&quot;&lt;/b&gt;');
    assert.equal(tpl.render('{{{x}}}', d), '<b>"hi"</b>');
    assert.equal(tpl.render('{{ site.hero.title }}', d), 'T&amp;C');
    assert.equal(tpl.render('[{{missing}}][{{{missing}}}][{{site.nope.deep}}]', d), '[][][]');
    assert.equal(tpl.render('{{n}}', { n: 0 }), '0');
  });

  test('#if / #unless', () => {
    const t = '{{#if a}}A{{/if}}{{#unless a}}notA{{/unless}}';
    assert.equal(tpl.render(t, { a: true }), 'A');
    assert.equal(tpl.render(t, { a: 'yes' }), 'A');
    for (const falsy of [false, '', 0, null, undefined, []]) assert.equal(tpl.render(t, { a: falsy }), 'notA');
    assert.equal(tpl.render('{{#if u.x}}{{u.x}}{{/if}}', { u: { x: '<i>' } }), '&lt;i&gt;');
  });

  test('values are not re-interpreted as template syntax', () => {
    assert.equal(tpl.render('{{a}}', { a: '{{b}}', b: 'SECRET' }).includes('SECRET'), false);
  });
});

describe('moji', () => {
  test('cleanMoji clamps and whitelists', () => {
    assert.deepEqual(cleanMoji(null), { gender: 'other', skin: 0, hair: 0, glasses: false, beard: false, earrings: false });
    assert.deepEqual(cleanMoji({ gender: 'female', skin: 9, hair: -3, glasses: 1, beard: 'yes', earrings: 0, evil: '<script>' }),
      { gender: 'female', skin: 4, hair: 0, glasses: true, beard: true, earrings: false });
    assert.equal(cleanMoji({ gender: 'robot' }).gender, 'other');
    assert.equal(cleanMoji({ skin: '3' }).skin, 3);
    assert.equal(cleanMoji({ hair: 2.9 }).hair, 2);
  });
});

describe('http router', () => {
  let server, base;
  before(async () => {
    const app = createApp();
    app.get('/api/items/:id', req => ({ id: req.params.id, q: req.query }));
    app.get('/api/a/:x/b/:y', req => req.params);
    app.post('/api/echo', req => ({ body: req.body }));
    app.get('/api/boom', () => { throw new HttpError(418, 'teapot', { code: 'tea' }); });
    app.get('/api/crash', () => { throw new Error('kaboom'); });
    app.get('/wild/*', req => ({ path: req.path }));
    server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    base = 'http://127.0.0.1:' + server.address().port;
  });
  after(() => new Promise(r => { server.close(() => r()); server.closeAllConnections(); }));

  test('route params are decoded, query parsed, trailing slash allowed', async () => {
    let r = await fetch(base + '/api/items/hello%20world?x=1&y=two');
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { id: 'hello world', q: { x: '1', y: 'two' } });
    r = await fetch(base + '/api/a/1/b/2/');
    assert.deepEqual(await r.json(), { x: '1', y: '2' });
    r = await fetch(base + '/wild/a/b/c');
    assert.deepEqual(await r.json(), { path: '/wild/a/b/c' });
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  });

  test('404 for unknown path, 405 for wrong method', async () => {
    let r = await fetch(base + '/api/nope');
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { error: 'Not found' });
    r = await fetch(base + '/api/items/1', { method: 'DELETE' });
    assert.equal(r.status, 405);
    assert.equal((await r.json()).error, 'Method not allowed');
    r = await fetch(base + '/api/items/1', { method: 'HEAD' });
    assert.equal(r.status, 200, 'HEAD is served by GET routes');
  });

  test('HttpError status + extra fields; unexpected errors are 500', async () => {
    let r = await fetch(base + '/api/boom');
    assert.equal(r.status, 418);
    assert.deepEqual(await r.json(), { error: 'teapot', code: 'tea' });
    r = await fetch(base + '/api/crash');
    assert.equal(r.status, 500);
  });

  test('JSON and form bodies are parsed; invalid JSON is 400', async () => {
    let r = await fetch(base + '/api/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":[1,2]}' });
    assert.deepEqual(await r.json(), { body: { a: [1, 2] } });
    r = await fetch(base + '/api/echo', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1&b=x+y' });
    assert.deepEqual(await r.json(), { body: { a: '1', b: 'x y' } });
    r = await fetch(base + '/api/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":' });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'Invalid JSON');
    r = await fetch(base + '/api/echo', { method: 'POST' });
    assert.deepEqual(await r.json(), { body: {} });
  });

  test('gzip is used for large responses when accepted', async () => {
    const r = await new Promise((resolve, reject) => {
      http.get(base + '/api/items/' + 'x'.repeat(1500), { headers: { 'accept-encoding': 'gzip' } }, res => { res.resume(); resolve(res); }).on('error', reject);
    });
    assert.equal(r.headers['content-encoding'], 'gzip');
  });

  // A body over the 6 MB limit must be answered with 413, not a dropped connection.
  test('body too large -> 413', async () => {
    const status = await new Promise(resolve => {
      const req = http.request(base + '/api/echo', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': 7 * 1024 * 1024 } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', e => resolve('error:' + e.code));
      const chunk = Buffer.alloc(256 * 1024, 32);
      let sent = 0;
      (function write() {
        while (sent < 7 * 1024 * 1024) { sent += chunk.length; if (!req.write(chunk)) { req.once('drain', write); return; } }
        req.end();
      })();
    });
    assert.equal(status, 413);
  });
});
