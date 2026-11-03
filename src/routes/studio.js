'use strict';
// Agent Studio training API: structured knowledge, bulk parsing, imports, gaps, score,
// scenarios, coach state and saved versions. Registered from routes/app.js.
const db = require('../db');
const auth = require('../lib/auth');
const training = require('../services/training');
const { HttpError, rateLimit } = require('../lib/http');

const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const bad = msg => { throw new HttpError(400, msg); };

module.exports = function (app, { getCloser, closerOut }) {
  const W = req => auth.needWs(req);
  const M = req => auth.needManager(req);
  const importLimit = rateLimit('kb-import', 30, 3600e3);

  const trainingOf = c => db.json(c.training, {});
  const saveTraining = (c, tr) => db.update('closers', c.id, { training: JSON.stringify(tr) });
  const getItem = (c, id) => { const k = db.one('SELECT * FROM closer_knowledge WHERE id = ? AND closer_id = ? AND workspace_id = ?', int(id), c.id, c.workspace_id); if (!k) throw new HttpError(404, 'That item was not found'); return k; };
  function summary(c) {
    const items = training.loadItems(c.id, true);
    const gaps = training.gaps(c.id, c.workspace_id, trainingOf(c), items);
    return { gaps, ...training.score(c, items, gaps.length) };
  }
  function insertItems(req, c, list) {
    const count = db.one('SELECT COUNT(*) n FROM closer_knowledge WHERE closer_id = ?', c.id).n;
    if (count + list.length > training.MAX_ITEMS) throw new HttpError(400, 'A Closer can hold up to ' + training.MAX_ITEMS + ' knowledge items. Remove a few first.');
    const now = db.now(); const ids = [];
    db.tx(() => { for (const it of list) ids.push(db.insert('closer_knowledge', { ...it, workspace_id: req.ws.id, closer_id: c.id, created_at: now, updated_at: now })); });
    db.update('closers', c.id, { updated_at: now });
    return ids;
  }

  // "Talk to train": transcribe a short voice recording from the browser (used when the browser has no built-in speech typing).
  app.post('/api/app/transcribe', W, rateLimit('dictate', 60, 3600e3), async req => {
    const m = String((req.body || {}).audio || '').match(/^data:audio\/(webm|ogg|mp4|mpeg|wav|x-m4a)(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) bad('Record a short voice note first.');
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) bad('That recording was empty.');
    if (buf.length > 5 * 1024 * 1024) bad('That recording is too long. Keep it under a minute.');
    const ext = { webm: 'webm', ogg: 'ogg', mp4: 'm4a', 'x-m4a': 'm4a', mpeg: 'mp3', wav: 'wav' }[m[1]];
    let text;
    try { text = await require('../services/ai').transcribe(buf, 'voice.' + ext, 'audio/' + m[1]); }
    catch (e) { throw new HttpError(502, 'We couldn’t turn that recording into text. Please try again or type it.'); }
    if (text === null) throw new HttpError(503, 'Voice typing needs a transcription key on this server (TRANSCRIBE_API_KEY). Chrome and Edge can type by voice without it.');
    return { text: str(text, 4000) };
  });

  // Everything the Studio needs for one Closer in one call.
  app.get('/api/app/closers/:id/training', W, req => {
    const c = getCloser(req, req.params.id);
    const tr = trainingOf(c);
    const s = summary(c);
    return {
      closer: closerOut(c), items: training.loadItems(c.id), rules: training.rulesOf(c.rules), scenarios: training.SCENARIOS, custom: tr.scenarios || [], runs: tr.runs || {},
      coach: tr.coach || {}, score: s.score, checklist: s.checklist, counts: s.counts, gaps: s.gaps,
      versions: db.all('SELECT v.id, v.label, v.created_at, u.name user FROM closer_versions v LEFT JOIN users u ON u.id = v.user_id WHERE v.closer_id = ? ORDER BY v.id DESC LIMIT 10', c.id)
    };
  });
  app.get('/api/app/closers/:id/score', W, req => { const s = summary(getCloser(req, req.params.id)); return { score: s.score, checklist: s.checklist, counts: s.counts }; });
  app.get('/api/app/closers/:id/gaps', W, req => summary(getCloser(req, req.params.id)).gaps);
  app.post('/api/app/closers/:id/gaps/dismiss', M, req => {
    const c = getCloser(req, req.params.id);
    const key = str((req.body || {}).key, 200);
    if (!key) bad('Missing gap');
    const tr = trainingOf(c);
    tr.dismissed = [...new Set([key].concat(tr.dismissed || []))].slice(0, 500);
    saveTraining(c, tr);
    return { ok: true };
  });

  // ---------- knowledge ----------
  app.get('/api/app/closers/:id/knowledge', W, req => training.loadItems(getCloser(req, req.params.id).id));
  app.post('/api/app/closers/:id/knowledge', M, req => {
    const c = getCloser(req, req.params.id);
    const b = req.body || {};
    if (Array.isArray(b.items)) {
      if (!b.items.length) bad('Nothing to add.');
      if (b.items.length > 500) bad('Add up to 500 items at a time.');
      const list = b.items.map((x, i) => training.cleanItem(x, null, m => bad('Item ' + (i + 1) + ': ' + m)));
      const ids = insertItems(req, c, list);
      return { ok: true, added: ids.length, items: training.loadItems(c.id) };
    }
    const it = training.cleanItem(b, null, bad);
    const [id] = insertItems(req, c, [it]);
    return training.itemOut(db.one('SELECT * FROM closer_knowledge WHERE id = ?', id));
  });
  app.put('/api/app/closers/:id/knowledge/:kid', M, req => {
    const c = getCloser(req, req.params.id);
    const k = getItem(c, req.params.kid);
    const it = training.cleanItem(req.body || {}, k, bad);
    db.update('closer_knowledge', k.id, { ...it, updated_at: db.now() });
    db.update('closers', c.id, { updated_at: db.now() });
    return training.itemOut(db.one('SELECT * FROM closer_knowledge WHERE id = ?', k.id));
  });
  app.del('/api/app/closers/:id/knowledge/:kid', M, req => {
    const c = getCloser(req, req.params.id);
    const k = getItem(c, req.params.kid);
    db.run('DELETE FROM closer_knowledge WHERE id = ?', k.id);
    return { ok: true };
  });
  // Turn pasted text into a preview of items (nothing is saved): Q&A blocks, product CSV or document chunks.
  app.post('/api/app/closers/:id/knowledge/parse', M, req => {
    getCloser(req, req.params.id);
    const b = req.body || {};
    const text = String(b.text == null ? '' : b.text);
    if (text.length > 200 * 1024) bad('That file is too big. Keep it under 200 KB.');
    if (!text.trim()) bad('Paste or choose some text first.');
    const format = ['qa', 'csv', 'doc'].includes(b.format) ? b.format : 'doc';
    if (format === 'qa') {
      const qa = training.parseQA(text);
      if (!qa.length) bad('We couldn’t find any questions. Write them like “Q: Do you deliver? A: Yes, in 2 days.”');
      return { format, items: qa.map(x => ({ kind: 'qa', question: x.question, answer: x.answer })) };
    }
    if (format === 'csv') {
      const r = training.parseProducts(text);
      if (!r.items.length) bad('We couldn’t find any products. Use columns: name, price, description, link.');
      return { format, items: r.items, errors: r.errors.slice(0, 20) };
    }
    const qa = training.parseQA(text);
    const chunks = training.chunkText(text.replace(/\r/g, ''));
    return { format, items: chunks.map(ch => ({ kind: 'doc', title: str(b.name, 60) ? str(b.name, 60) + ' · ' + ch.title : ch.title, answer: ch.text, source: 'import_file' })), qa: qa.length >= 2 ? qa.map(x => ({ kind: 'qa', question: x.question, answer: x.answer })) : [] };
  });
  app.post('/api/app/closers/:id/import-url', M, importLimit, async req => {
    getCloser(req, req.params.id);
    const url = str((req.body || {}).url, 1000);
    if (!url) bad('Paste the address of the page to import.');
    let page;
    try { page = await training.fetchPage(url); }
    catch (e) { if (e instanceof training.ImportError) throw new HttpError(e.status, e.message, { code: 'import_failed' }); throw new HttpError(502, 'We couldn’t reach that page. Check the address, make sure the page is public, or paste the text instead.', { code: 'import_failed' }); }
    const chunks = training.chunkText(page.text);
    if (!chunks.length) throw new HttpError(422, 'We reached the page but found no readable text on it. Try your FAQ or pricing page.', { code: 'import_empty' });
    return { url: page.url, title: page.title, items: chunks.map(ch => ({ kind: 'doc', title: ch.title, answer: ch.text, source: 'import_url', data: { url: page.url } })) };
  });

  // ---------- scenarios, coach ----------
  app.put('/api/app/closers/:id/scenarios', M, req => {
    const c = getCloser(req, req.params.id);
    const list = Array.isArray((req.body || {}).scenarios) ? req.body.scenarios : [];
    const tr = trainingOf(c);
    tr.scenarios = list.slice(0, 20).map((x, i) => ({ id: str(x && x.id, 20).replace(/[^\w-]/g, '') || 'c' + Date.now().toString(36) + i, text: str(x && x.text, 300), expect: ['answer', 'price', 'handoff', 'no_handoff', 'honest', 'graceful', 'discount'].includes(x && x.expect) ? x.expect : 'answer' })).filter(x => x.text);
    saveTraining(c, tr);
    return { scenarios: tr.scenarios };
  });
  app.put('/api/app/closers/:id/coach', M, req => {
    const c = getCloser(req, req.params.id);
    const b = req.body || {};
    const tr = trainingOf(c);
    tr.coach = { step: Math.min(5, Math.max(1, int(b.step, 1))), done: (Array.isArray(b.done) ? b.done : []).map(n => int(n)).filter(n => n >= 1 && n <= 5).slice(0, 5), finished: !!b.finished };
    if (b.personality_ok) tr.personality_ok = true;
    saveTraining(c, tr);
    return { ok: true, coach: tr.coach };
  });

  // ---------- versions ----------
  app.get('/api/app/closers/:id/versions', W, req => {
    const c = getCloser(req, req.params.id);
    return db.all('SELECT v.id, v.label, v.data, v.created_at, u.name user FROM closer_versions v LEFT JOIN users u ON u.id = v.user_id WHERE v.closer_id = ? ORDER BY v.id DESC LIMIT 10', c.id).map(v => ({ ...v, data: db.json(v.data, {}) }));
  });
  app.post('/api/app/closers/:id/versions/:vid/restore', M, req => {
    const c = getCloser(req, req.params.id);
    const v = db.one('SELECT * FROM closer_versions WHERE id = ? AND closer_id = ?', int(req.params.vid), c.id);
    if (!v) throw new HttpError(404, 'That version was not found');
    const d = db.json(v.data, {});
    const patch = { updated_at: db.now() };
    if (d.name) patch.name = str(d.name, 40);
    if (d.persona) patch.persona = JSON.stringify(d.persona);
    if (d.skills) patch.skills = JSON.stringify(d.skills);
    if (d.instructions !== undefined) patch.instructions = str(d.instructions, 4000);
    if (d.rules) patch.rules = JSON.stringify(training.cleanRules(d.rules));
    if (d.pay_link !== undefined) patch.pay_link = str(d.pay_link, 500);
    db.update('closers', c.id, patch);
    const fresh = db.one('SELECT * FROM closers WHERE id = ?', c.id);
    training.saveVersion(fresh, req.user.id, 'Restored from ' + new Date(v.created_at).toISOString().slice(0, 16).replace('T', ' '));
    return closerOut(fresh);
  });
};
