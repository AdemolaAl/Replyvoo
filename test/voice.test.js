'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let ctx;
before(async () => { ctx = await h.boot(); });
after(() => ctx.close());

test('voice lines file is served and lists every narration id', async () => {
  const r = await h.client().get('/audio/narration/lines.json');
  assert.equal(r.status, 200);
  for (const id of ['s1', 's2', 's3', 's4', 's5', 'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6']) assert.ok(r.body.lines[id], id);
});

test('demo video is served with byte ranges', async () => {
  const res = await fetch(ctx.base + '/video/replyvoo-studio-demo.mp4', { headers: { range: 'bytes=0-99' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-type'), 'video/mp4');
  assert.match(res.headers.get('content-range'), /^bytes 0-99\/\d+$/);
  assert.equal((await res.arrayBuffer()).byteLength, 100);
  const full = await fetch(ctx.base + '/video/replyvoo-studio-demo.mp4', { method: 'HEAD' });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
});

test('transcribe validates input and explains a missing key', async () => {
  const u = await h.login(h.DEMO.email, h.DEMO.password);
  let r = await u.post('/api/app/transcribe', { audio: 'nope' });
  assert.equal(r.status, 400);
  r = await u.post('/api/app/transcribe', { audio: 'data:audio/webm;base64,' + Buffer.from('fake').toString('base64') });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /TRANSCRIBE_API_KEY/);
  assert.equal((await h.client().post('/api/app/transcribe', { audio: 'x' })).status, 401);
});
