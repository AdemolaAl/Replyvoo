'use strict';
// Agent Studio training: structured knowledge (Q&A, products, policies, docs, corrections),
// keyword retrieval with simple stemming and commerce synonyms, owner rules, scenario checks,
// knowledge gaps from real chats, the training score, saved versions, and safe URL import.
// Everything here is dependency-free. Pure helpers are exported for tests.
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const dns = require('node:dns');
const db = require('../db');

const KINDS = ['qa', 'product', 'policy', 'doc', 'correction'];
const SOURCES = ['manual', 'import_url', 'import_file', 'correction', 'gap'];
const TOPICS = { delivery: 'Delivery', returns: 'Returns & refunds', payment: 'Payment methods', hours: 'Opening hours', contact: 'Contact', other: 'Other policy' };
const MAX_ITEMS = 1000;

/* ======================= text matching ======================= */
const STOP = new Set(('a an and or of to in is it its for on with you your yours i me my we our us do does did can could would should will shall how what when where why which who whom is are was were be been am this that these those have has had at as by from there here they them their then than so if not no yes please hi hello hey thanks thank just any some about into also too very get got want need like ' +
  'tell know let give make one ok okay im i\'m u ur pls plz hey there offer provide').split(/\s+/));
// Common commerce words that mean the same thing. The first word of each group is the canonical form.
const SYNONYMS = [
  ['price', 'cost', 'much', 'pricing', 'priced', 'fee', 'charge', 'expensive', 'cheap', 'rate', 'amount', 'quote'],
  ['deliver', 'delivery', 'ship', 'shipping', 'shipped', 'dispatch', 'arrive', 'courier', 'postage', 'deliveries'],
  ['pay', 'payment', 'transfer', 'checkout', 'bank', 'paypal', 'cash', 'installment', 'instalment'],
  ['return', 'refund', 'exchange', 'money-back', 'moneyback', 'cancel', 'cancellation'],
  ['open', 'hour', 'opening', 'close', 'closing', 'closed'],
  ['stock', 'available', 'availability', 'sold', 'restock', 'left'],
  ['discount', 'coupon', 'promo', 'sale', 'deal', 'voucher', 'cheaper'],
  ['contact', 'phone', 'email', 'call', 'reach'],
  ['size', 'fit', 'measurement', 'measure'],
  ['location', 'address', 'located', 'shop', 'store', 'office', 'visit', 'pickup', 'collect'],
  ['weekend', 'saturday', 'sunday'],
  ['buy', 'order', 'purchase', 'ordering'],
  ['track', 'tracking', 'status'],
  ['vegan', 'cruelty-free', 'animal'],
  ['bot', 'robot', 'ai', 'chatbot']
];
function stem(w) {
  w = w.replace(/'s$/, '').replace(/’s$/, '');
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 4 && /(sses|shes|ches|xes|zes|oes)$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('ed') && !w.endsWith('eed')) w = w.slice(0, -2);
  return w;
}
const SYN = new Map();
const CANON = new Set(SYNONYMS.map(g => g[0]));
for (const g of SYNONYMS) for (const w of g) { SYN.set(w, g[0]); SYN.set(stem(w), g[0]); }
function tokens(s) {
  const out = [];
  for (let w of String(s || '').toLowerCase().replace(/[’']/g, '\'').replace(/[^\p{L}\p{N}'\-\s]/gu, ' ').split(/\s+/)) {
    w = w.replace(/^['-]+|['-]+$/g, '');
    if (!w || STOP.has(w)) continue;
    if (w.length < 2 && !/\d/.test(w)) continue;
    const s1 = SYN.get(w) || SYN.get(stem(w)) || stem(w);
    if (!STOP.has(s1)) out.push(s1);
  }
  return out;
}
const tokenSet = s => new Set(tokens(s));
// Set overlap score in 0..1 (cosine on sets), so short exact questions match strongly.
function overlap(q, t) {
  if (!q.size || !t.size) return 0;
  let m = 0; for (const w of q) if (t.has(w)) m++;
  return m ? m / Math.sqrt(q.size * t.size) : 0;
}
const keyOf = s => [...tokenSet(s)].sort().join(' ');

/* ======================= items ======================= */
function asList(v, max = 10, len = 200) {
  const arr = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,\n]/);
  return arr.map(x => String(x == null ? '' : x).trim().slice(0, len)).filter(Boolean).slice(0, max);
}
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
function parsePrice(v) {
  if (v === '' || v == null) return { price: null, currency: '' };
  if (typeof v === 'number') return { price: Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null, currency: '' };
  const s = String(v).trim();
  const cur = /€/.test(s) ? 'EUR' : /£/.test(s) ? 'GBP' : /₦/.test(s) ? 'NGN' : /\$/.test(s) ? 'USD' : (s.match(/\b([A-Za-z]{3})\b/) || [])[1] || '';
  const n = Number(s.replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  return { price: Number.isFinite(n) && n >= 0 && /\d/.test(s) ? Math.round(n * 100) / 100 : null, currency: cur.toUpperCase() };
}
function money(price, currency) {
  if (price == null || price === '') return '';
  const n = Number(price); const c = String(currency || 'USD').toUpperCase();
  const v = n % 1 ? n.toFixed(2) : String(n);
  const sym = { USD: '$', EUR: '€', GBP: '£', NGN: '₦' }[c];
  return sym ? sym + v : v + ' ' + c;
}
function safeLink(v) { const s = str(v, 500); return /^https?:\/\/[^\s]+$/i.test(s) ? s : ''; }

// Validate one knowledge item. Throws { status, message } style errors via the passed factory.
function cleanItem(b, existing, fail) {
  b = b || {}; existing = existing || {};
  const prev = existing.data ? (typeof existing.data === 'string' ? db.json(existing.data, {}) : existing.data) : {};
  const kind = KINDS.includes(b.kind) ? b.kind : (existing.kind || 'qa');
  const pick = (k, max) => (b[k] !== undefined ? str(b[k], max) : str(existing[k], max));
  const out = { kind, title: pick('title', 160), question: pick('question', 400), answer: pick('answer', kind === 'doc' ? 6000 : 4000), source: SOURCES.includes(b.source) ? b.source : (existing.source || (kind === 'correction' ? 'correction' : 'manual')), enabled: b.enabled !== undefined ? (b.enabled ? 1 : 0) : (existing.enabled === 0 ? 0 : 1) };
  const d = Object.assign({}, prev, b.data && typeof b.data === 'object' ? b.data : {});
  const data = {};
  if (kind === 'qa' || kind === 'correction') {
    const alt = asList(d.alt, 12, 200); if (alt.length) data.alt = alt;
    if (!out.question || !out.answer) fail('Add both the question and the answer.');
    if (d.ai_answer) data.ai_answer = str(d.ai_answer, 2000);
  } else if (kind === 'product') {
    if (!out.title) fail('Give the product a name.');
    const p = parsePrice(d.price);
    data.price = p.price;
    data.currency = (str(d.currency, 3).toUpperCase().replace(/[^A-Z]/g, '') || p.currency || 'USD');
    data.stock = d.stock === undefined ? true : !!d.stock && d.stock !== 'false' && d.stock !== '0';
    const link = safeLink(d.link); if (link) data.link = link;
    const sku = str(d.sku, 60); if (sku) data.sku = sku;
    out.answer = str(out.answer, 600);
  } else if (kind === 'policy') {
    data.topic = TOPICS[d.topic] ? d.topic : 'other';
    if (!out.title) out.title = TOPICS[data.topic];
    if (!out.answer) fail('Write the policy in a sentence or two.');
  } else if (kind === 'doc') {
    if (!out.answer) fail('This document is empty.');
    const url = safeLink(d.url); if (url) data.url = url;
    if (!out.title) out.title = out.answer.split('\n')[0].slice(0, 80);
  }
  const gk = str(d.gap_key, 200); if (gk) data.gap_key = gk;
  out.data = JSON.stringify(data);
  return out;
}
function itemOut(r) { return { id: r.id, kind: r.kind, title: r.title, question: r.question, answer: r.answer, data: db.json(r.data, {}), source: r.source, enabled: !!r.enabled, created_at: r.created_at, updated_at: r.updated_at }; }
function loadItems(closerId, enabledOnly) {
  return db.all('SELECT * FROM closer_knowledge WHERE closer_id = ?' + (enabledOnly ? ' AND enabled = 1' : '') + ' ORDER BY CASE kind WHEN \'correction\' THEN 0 WHEN \'qa\' THEN 1 WHEN \'product\' THEN 2 WHEN \'policy\' THEN 3 ELSE 4 END, id', closerId).map(itemOut);
}

/* ======================= retrieval ======================= */
function itemText(it) {
  const d = it.data || {};
  if (it.kind === 'qa') return 'Q: ' + it.question + (d.alt && d.alt.length ? ' (also asked as: ' + d.alt.join('; ') + ')' : '') + '\nA: ' + it.answer;
  if (it.kind === 'correction') return 'Q: ' + it.question + '\nA (checked by the owner, use this exact answer): ' + it.answer;
  if (it.kind === 'product') return '- ' + it.title + ': ' + (d.price != null ? money(d.price, d.currency) : 'price on request') + (d.stock === false ? ' (OUT OF STOCK)' : '') + (it.answer ? '. ' + it.answer : '') + (d.link ? ' Link: ' + d.link : '') + (d.sku ? ' (SKU ' + d.sku + ')' : '');
  if (it.kind === 'policy') return '- ' + (it.title || TOPICS[d.topic] || 'Policy') + ': ' + it.answer;
  return (it.title ? it.title + ': ' : '') + it.answer;
}
const TOPIC_WORDS = { delivery: 'deliver delivery shipping ship arrive', returns: 'return refund exchange', payment: 'pay payment transfer', hours: 'open hours opening close weekend', contact: 'contact phone email call reach', other: '' };
function targetTokens(it) {
  const d = it.data || {};
  if (it.kind === 'qa' || it.kind === 'correction') return tokenSet([it.question].concat(d.alt || []).join(' '));
  if (it.kind === 'product') return tokenSet(it.title + ' ' + (d.sku || ''));
  if (it.kind === 'policy') return tokenSet((it.title || '') + ' ' + (TOPIC_WORDS[d.topic] || ''));
  return tokenSet(it.title + ' ' + it.answer);
}
function scoreItem(it, q) {
  const t = targetTokens(it);
  let s = overlap(q, t);
  if (it.kind === 'qa' || it.kind === 'correction') {
    s = s * 0.85 + overlap(q, tokenSet(it.answer)) * 0.15;
    // Corrections win ties and close calls, but never beat a clearly better match.
    if (it.kind === 'correction') s = s >= 0.5 ? s * 1.25 + 0.05 : s * 1.08;
  } else if (it.kind === 'product') {
    let m = 0; for (const w of t) if (q.has(w)) m++;
    s = m ? 0.35 + 0.5 * (m / t.size) : 0;
    if (s && (q.has('price') || q.has('stock') || q.has('buy'))) s += 0.1;
    if (!s) s = overlap(q, tokenSet(it.answer)) * 0.4;
  } else if (it.kind === 'policy') {
    let m = 0; for (const w of t) if (q.has(w)) m++;
    s = m ? 0.45 + 0.1 * m : overlap(q, tokenSet(it.answer)) * 0.5;
  } else {
    let m = 0; for (const w of q) if (t.has(w)) m++;
    s = m ? Math.min(0.7, 0.12 * m + 0.1) : 0;
  }
  return s;
}
function chunks(text) { return String(text || '').split(/\n\s*\n|\n(?=[-*#\d])/).map(s => s.trim()).filter(s => s.length > 3); }

// Build the KNOWLEDGE section for the system prompt. Structured items first (corrections and
// matching Q&A highest), products and policies compactly, then the free-text notes.
function buildKnowledge(items, notes, question, maxChars = 6000) {
  const q = tokenSet(question);
  const live = (items || []).filter(i => i.enabled !== false && i.enabled !== 0);
  const scored = live.map(it => ({ it, s: scoreItem(it, q) }));
  const parts = []; let len = 0; const used = new Set(); const sources = [];
  const add = (label, list) => {
    const lines = [];
    for (const x of list) {
      if (used.has(x.it)) continue;
      const t = itemText(x.it);
      if (len + t.length + 2 > maxChars) continue;
      lines.push(t); len += t.length + 1; used.add(x.it);
      if (x.s > 0.3 && sources.length < 4) sources.push({ id: x.it.id, kind: x.it.kind, label: x.it.kind === 'product' || x.it.kind === 'policy' || x.it.kind === 'doc' ? x.it.title : x.it.question, score: Math.round(x.s * 100) / 100 });
    }
    if (lines.length) { parts.push(label + '\n' + lines.join('\n')); len += label.length + 2; }
  };
  const by = k => scored.filter(x => x.it.kind === k).sort((a, b) => b.s - a.s);
  const corr = by('correction'), qa = by('qa'), prod = by('product'), pol = by('policy'), doc = by('doc');
  add('VERIFIED ANSWERS (from the owner, use these first):', corr.filter(x => x.s >= 0.25).slice(0, 6));
  add('MATCHING Q&A:', qa.filter(x => x.s >= 0.25).slice(0, 8));
  const compact = l => l.reduce((n, x) => n + itemText(x.it).length, 0) <= 2500;
  add('PRODUCTS AND PRICES:', compact(prod) ? prod : prod.filter(x => x.s > 0).slice(0, 12));
  add('POLICIES:', compact(pol) ? pol : pol.filter(x => x.s > 0).slice(0, 6));
  add('MORE Q&A:', corr.concat(qa).filter(x => !used.has(x.it)).slice(0, 40));
  // Free-text notes: in full when they fit, else the best-matching paragraphs (as before).
  const room = maxChars - len;
  const all = chunks(notes);
  if (all.length && room > 200) {
    let text = all.join('\n\n');
    if (text.length > room) {
      const sc = all.map((c, i) => ({ c, i, s: [...tokenSet(c)].filter(w => q.has(w)).length })).sort((a, b) => b.s - a.s || a.i - b.i);
      const out = []; let l = 0;
      for (const x of sc) { if (l + x.c.length > room - 40) continue; out.push(x); l += x.c.length + 2; if (out.length >= 6) break; }
      text = out.sort((a, b) => a.i - b.i).map(x => x.c).join('\n\n');
    }
    if (text) { parts.push('NOTES:\n' + text); len += text.length + 8; }
  }
  add('FROM YOUR DOCUMENTS:', doc.filter(x => x.s > 0).slice(0, 6));
  return { text: parts.join('\n\n'), sources };
}

// The single best thing to say in demo mode (no AI key): a taught answer, a product line or a policy.
function bestAnswer(items, notes, question) {
  const q = tokenSet(question);
  if (!q.size) return null;
  const live = (items || []).filter(i => i.enabled !== false && i.enabled !== 0);
  let best = null;
  for (const it of live) {
    const s = scoreItem(it, q);
    const min = it.kind === 'qa' || it.kind === 'correction' ? 0.4 : it.kind === 'product' ? 0.35 : it.kind === 'policy' ? 0.45 : 0.22;
    if (s >= min && (!best || s > best.s)) best = { it, s };
  }
  const prods = live.filter(i => i.kind === 'product');
  // Specific words (places, product names...) beat generic ones: if the notes mention one and the best item doesn't, use the notes.
  const specific = [...q].filter(w => !CANON.has(w));
  if (best && specific.length && !specific.some(w => tokenSet(itemText(best.it)).has(w))) {
    const hitNote = chunks(notes).find(c => specific.some(w => tokenSet(c).has(w)) && [...tokenSet(c)].filter(w => q.has(w)).length >= 2);
    if (hitNote) return { item: null, text: hitNote.split('\n')[0].replace(/^[-*#\d.\s]+/, '') };
  }
  if (best && best.it.kind === 'product') {
    const d = best.it.data || {};
    return { item: best.it, text: best.it.title + (d.price != null ? ' is ' + money(d.price, d.currency) : '') + (d.stock === false ? ', but it’s out of stock right now' : '') + '.' + (best.it.answer ? ' ' + best.it.answer.replace(/\.?$/, '.') : '') + (d.link ? ' Here’s the link: ' + d.link : '') };
  }
  if (best && best.it.kind !== 'doc') return { item: best.it, text: best.it.answer };
  if (!best && q.has('price') && prods.length) {
    const l = prods.slice(0, 3).map(p => p.title + ' is ' + money(p.data.price, p.data.currency));
    return { item: prods[0], text: (l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l[0]) + '. Which one would you like?' };
  }
  // Free-text notes / documents: the paragraph sharing the most words with the question.
  let top = 0, line = '';
  for (const c of chunks(notes)) { const n = [...tokenSet(c)].filter(w => q.has(w)).length; if (n > top) { top = n; line = c.split('\n')[0]; } }
  if (best && best.it.kind === 'doc' && best.s * 5 >= top) return { item: best.it, text: best.it.answer.split('\n').find(l => [...tokenSet(l)].some(w => q.has(w))) || best.it.answer.split('\n')[0] };
  if (top) return { item: null, text: line.replace(/^[-*#\d.\s]+/, '') };
  return null;
}

/* ======================= bulk parsers ======================= */
// "Q: … A: …" blocks (also "Question:/Answer:"), or a line ending in "?" followed by its answer.
function parseQA(text) {
  const lines = String(text || '').replace(/\r/g, '').slice(0, 200000).split('\n');
  const out = []; let cur = null; let mode = null;
  const push = () => { if (cur && cur.question.trim() && cur.answer.trim()) out.push({ question: cur.question.trim().slice(0, 400), answer: cur.answer.trim().slice(0, 4000) }); cur = null; mode = null; };
  const hasMarkers = lines.some(l => /^\s*(q|question)\s*[:.)\-]\s*\S/i.test(l));
  for (const raw of lines) {
    const l = raw.trim();
    if (hasMarkers) {
      const mq = l.match(/^(?:q|question)\s*[:.)\-]\s*(.*)$/i), ma = l.match(/^(?:a|answer)\s*[:.)\-]\s*(.*)$/i);
      if (mq) { push(); cur = { question: mq[1], answer: '' }; mode = 'q'; continue; }
      if (ma && cur) { cur.answer = ma[1]; mode = 'a'; continue; }
      if (!cur) continue;
      if (!l) { if (mode === 'a' && cur.answer) cur.answer += '\n'; continue; }
      if (mode === 'q') cur.question += ' ' + l; else cur.answer += (cur.answer && !cur.answer.endsWith('\n') ? ' ' : '') + l;
    } else {
      if (!l) { if (cur && cur.answer) push(); continue; }
      if (/\?$/.test(l) && (!cur || cur.answer)) { push(); cur = { question: l, answer: '' }; continue; }
      if (cur) cur.answer += (cur.answer ? ' ' : '') + l;
    }
    if (out.length >= 200) break;
  }
  push();
  return out.slice(0, 200).map(x => ({ ...x, answer: x.answer.replace(/\n{2,}/g, '\n').trim() }));
}

function csvRows(text) {
  const rows = []; let row = []; let f = ''; let q = false; const s = String(text || '').replace(/^\uFEFF/, '').slice(0, 200000);
  const sep = (s.split('\n')[0].match(/;/g) || []).length > (s.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(Boolean));
}
// Products from CSV: name,price,description,link (header row optional; extra columns: currency, stock, sku).
function parseProducts(text) {
  const rows = csvRows(text);
  const items = []; const errors = [];
  if (!rows.length) return { items, errors };
  const H = { name: /^(name|product|title|item)$/i, price: /^(price|cost|amount)$/i, description: /^(description|desc|details|about)$/i, link: /^(link|url|buy link|payment link)$/i, currency: /^(currency|cur)$/i, stock: /^(stock|in stock|in_stock|available)$/i, sku: /^(sku|code|id)$/i };
  let map = { name: 0, price: 1, description: 2, link: 3 }; let start = 0;
  if (rows[0].some(c => H.name.test(c) || H.price.test(c))) {
    map = {}; rows[0].forEach((c, i) => { for (const k in H) if (H[k].test(c) && map[k] === undefined) map[k] = i; });
    if (map.name === undefined) map.name = 0;
    start = 1;
  }
  for (let r = start; r < rows.length && items.length < 500; r++) {
    const row = rows[r]; const g = k => (map[k] !== undefined ? row[map[k]] || '' : '');
    const name = g('name').slice(0, 160);
    if (!name) { errors.push({ line: r + 1, reason: 'No product name' }); continue; }
    const p = parsePrice(g('price'));
    if (g('price') && p.price == null) errors.push({ line: r + 1, reason: 'Price “' + g('price').slice(0, 20) + '” is not a number, left empty' });
    const stockRaw = g('stock').toLowerCase();
    items.push({ kind: 'product', title: name, answer: g('description').slice(0, 600), data: { price: p.price, currency: (g('currency') || p.currency || 'USD').toUpperCase().slice(0, 3), stock: stockRaw ? !/^(no|false|0|out|sold out|n)$/.test(stockRaw) : true, link: safeLink(g('link')) || undefined, sku: g('sku').slice(0, 60) || undefined } });
  }
  return { items, errors };
}

/* ======================= HTML import ======================= */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euro: '€', pound: '£', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' '; } catch { return ' '; } }
    return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
  });
}
function htmlToText(html) {
  let s = String(html || '').slice(0, 2 * 1024 * 1024);
  const title = decode(((s.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim()).slice(0, 160);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|nav|footer|svg|template|iframe|head|form|button|select)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote|ul|ol|table|dd|dt|main|aside|header)\s*>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  const seen = new Set();
  const lines = decode(s).split('\n').map(l => l.replace(/[ \t\u00a0]+/g, ' ').trim()).filter(l => {
    if (!l || l === '-' || l.length < 2) return false;
    const k = l.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true;
  });
  return { title, text: lines.join('\n') };
}
// Split readable text into chunks of about `size` characters, on line boundaries.
function chunkText(text, size = 700, max = 40) {
  const out = []; let cur = '';
  for (const line of String(text || '').split('\n')) {
    const l = line.trim(); if (!l) continue;
    if (cur && cur.length + l.length + 1 > size) { out.push(cur); cur = ''; if (out.length >= max) break; }
    cur += (cur ? '\n' : '') + l.slice(0, size * 2);
  }
  if (cur && out.length < max) out.push(cur);
  return out.map(c => ({ title: c.split('\n')[0].replace(/^[-•*\s]+/, '').slice(0, 80), text: c }));
}

/* ---------- SSRF guard ---------- */
function isPrivateIp(ip) {
  ip = String(ip || '').replace(/^\[|\]$/g, '');
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1' || /^0*:(0*:)*0*1?$/.test(x)) return true;
    const v4 = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) || x.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) return isPrivateIp(v4[1]);
    if (/^::ffff:/.test(x) || /^64:ff9b:/.test(x)) return true;
    return /^(fe[89ab]|fc|fd|ff)/.test(x);
  }
  return true;
}
class ImportError extends Error { constructor(msg, status) { super(msg); this.status = status || 400; } }
const UNREACHABLE = 'We couldn’t reach that page. Check the address, make sure the page is public, or paste the text instead.';
async function checkUrl(raw, lookup) {
  let u;
  const s = String(raw || '').trim();
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s); } catch { throw new ImportError('That doesn’t look like a web address. Try something like https://yourshop.com/faq'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new ImportError('Only http:// and https:// pages can be imported.');
  if (u.username || u.password) throw new ImportError('Links with a username or password can’t be imported.');
  if (u.port && !['80', '443'].includes(u.port)) throw new ImportError('Only pages on the standard web ports can be imported.');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || /(^|\.)localhost$|\.local$|\.internal$|\.lan$|\.home$/.test(host) || !/[.:]/.test(host)) throw new ImportError('That address points to a private network. Use a public page.');
  if (net.isIP(host)) { if (isPrivateIp(host)) throw new ImportError('That address points to a private network. Use a public page.'); }
  else {
    let addrs;
    try { addrs = await new Promise((res, rej) => (lookup || dns.lookup)(host, { all: true }, (e, a) => (e ? rej(e) : res(a)))); }
    catch { throw new ImportError(UNREACHABLE, 502); }
    if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new ImportError('That address points to a private network. Use a public page.');
  }
  return u;
}
// A DNS lookup that refuses private addresses, so a host can't switch to an internal IP after the check.
function safeLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) return cb(Object.assign(new Error('Blocked private address'), { code: 'EBLOCKED' }));
    if (options && options.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}
function getOnce(u, timeoutMs, maxBytes) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, { lookup: safeLookup, timeout: timeoutMs, headers: { 'user-agent': 'ReplyvooBot/1.0 (+knowledge import)', accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve({ redirect: res.headers.location }); }
      if (res.statusCode !== 200) { res.resume(); return reject(new ImportError(UNREACHABLE + ' (The site answered ' + res.statusCode + '.)', 502)); }
      const type = String(res.headers['content-type'] || '');
      if (type && !/text\/html|text\/plain|application\/xhtml/i.test(type)) { res.resume(); return reject(new ImportError('That link isn’t a web page we can read. Try the page that shows your FAQ or prices.', 400)); }
      const bufs = []; let n = 0;
      res.on('data', c => { n += c.length; if (n > maxBytes) { req.destroy(); reject(new ImportError('That page is too big to import (over 2 MB). Try a smaller page.', 400)); } else bufs.push(c); });
      res.on('end', () => resolve({ body: Buffer.concat(bufs).toString('utf8'), type }));
      res.on('error', () => reject(new ImportError(UNREACHABLE, 502)));
    });
    req.on('timeout', () => { req.destroy(); reject(new ImportError('That page took too long to answer. Try again, or paste the text instead.', 504)); });
    req.on('error', e => reject(e instanceof ImportError ? e : new ImportError(e.code === 'EBLOCKED' ? 'That address points to a private network. Use a public page.' : UNREACHABLE, e.code === 'EBLOCKED' ? 400 : 502)));
  });
}
async function fetchPage(raw, { timeoutMs = 10000, maxBytes = 2 * 1024 * 1024 } = {}) {
  let u = await checkUrl(raw);
  const started = Date.now();
  for (let hop = 0; hop <= 3; hop++) {
    const r = await getOnce(u, Math.max(1000, timeoutMs - (Date.now() - started)), maxBytes);
    if (r.redirect) {
      if (hop === 3) throw new ImportError('That page redirects too many times.', 400);
      u = await checkUrl(new URL(r.redirect, u).toString());
      continue;
    }
    const parsed = /text\/plain/i.test(r.type) ? { title: '', text: r.body.replace(/\r/g, '') } : htmlToText(r.body);
    return { url: u.toString(), ...parsed };
  }
  throw new ImportError(UNREACHABLE, 502);
}

/* ======================= rules ======================= */
const RULE_DEFAULTS = { do: [], dont: [], avoid: [], required: [], discount: { mode: 'knowledge', max: 10 }, handoff: { angry: true, refund: true, human: true, legal: false, order_over: 0, keywords: [] }, hours: '', language: { mode: 'auto', lang: '' } };
function cleanRules(b) {
  b = b && typeof b === 'object' ? b : {};
  const d = b.discount || {}; const h = b.handoff || {}; const l = b.language || {};
  return {
    do: asList(b.do, 15, 200), dont: asList(b.dont, 15, 200), avoid: asList(b.avoid, 15, 80), required: asList(b.required, 5, 200),
    discount: { mode: ['never', 'max', 'knowledge'].includes(d.mode) ? d.mode : 'knowledge', max: Math.min(90, Math.max(1, Math.round(Number(d.max) || 10))) },
    handoff: { angry: h.angry !== false, refund: h.refund !== false, human: h.human !== false, legal: !!h.legal, order_over: Math.max(0, Math.min(1e9, Math.round(Number(h.order_over) || 0))), keywords: asList(h.keywords, 20, 60) },
    hours: str(b.hours, 300), language: { mode: l.mode === 'force' ? 'force' : 'auto', lang: str(l.lang, 40) },
    set: !!b.set || !!(asList(b.do).length || asList(b.dont).length || asList(b.avoid).length || asList(b.required).length || (d.mode && d.mode !== 'knowledge') || str(b.hours, 300) || l.mode === 'force' || asList(h.keywords).length || Number(h.order_over) > 0)
  };
}
const rulesOf = r => cleanRules(typeof r === 'string' ? db.json(r, {}) : r);
function rulesPrompt(rules, handoffSkill) {
  const r = rulesOf(rules); const out = [];
  if (r.language.mode === 'force' && r.language.lang) out.push('Always reply in ' + r.language.lang + ', even if the customer writes in another language.');
  if (r.do.length) out.push('Always: ' + r.do.join('; ') + '.');
  if (r.dont.length) out.push('Never: ' + r.dont.join('; ') + '.');
  if (r.avoid.length) out.push('Do not discuss these topics; politely steer back to how you can help: ' + r.avoid.join(', ') + '.');
  if (r.discount.mode === 'never') out.push('Never offer, promise or hint at discounts, coupons or price reductions.');
  else if (r.discount.mode === 'max') out.push('You may mention a discount of at most ' + r.discount.max + '%, only if the customer asks, and never more.');
  if (r.hours) out.push('Working hours note: ' + r.hours);
  if (r.required.length) out.push('Always include this in your reply where it fits naturally: ' + r.required.join(' / '));
  if (handoffSkill !== false) {
    const t = [];
    if (r.handoff.angry) t.push('the customer is angry or upset');
    if (r.handoff.human) t.push('asks for a human');
    if (r.handoff.refund) t.push('asks for a refund, cancellation or withdrawal');
    if (r.handoff.legal) t.push('asks a legal, medical or financial-advice question');
    if (r.handoff.order_over > 0) t.push('wants to order more than ' + r.handoff.order_over + ' in value');
    if (r.handoff.keywords.length) t.push('mentions any of: ' + r.handoff.keywords.join(', '));
    t.push('reports a serious problem');
    out.push('Add the marker [HANDOFF] at the end of your reply if ' + t.join(', or ') + '.');
  }
  return out;
}
// Decide on a handoff in demo mode from the rules (mirrors what the prompt asks the AI to do).
function demoHandoff(rules, message) {
  const r = rulesOf(rules); const q = String(message || '').toLowerCase();
  if (r.handoff.human && /\b(human|real person|agent|manager|someone real|speak to|talk to (a|someone))\b/.test(q)) return 'human';
  if (r.handoff.refund && /\b(refund|withdraw|cancel my|money back|chargeback)\b/.test(q)) return 'refund';
  if (r.handoff.angry && /\b(angry|furious|scam|terrible|worst|disgusting|ridiculous|complain|complaint|useless|unacceptable)\b|!!!/.test(q)) return 'angry';
  if (r.handoff.legal && /\b(lawyer|legal|sue|lawsuit|court|doctor|medical|diagnos|prescription|pregnan|invest|tax advice|financial advice)\b/.test(q)) return 'legal';
  if (r.handoff.keywords.some(k => k && q.includes(k.toLowerCase()))) return 'keyword';
  if (r.handoff.order_over > 0) {
    const nums = []; q.replace(/(?:[$€£₦]\s?)(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:usd|eur|gbp|dollars|euros|pounds)\b/g, (m, a, b) => { nums.push(Number(String(a || b).replace(/,/g, ''))); return m; });
    if (nums.some(n => n > r.handoff.order_over)) return 'big_order';
  }
  return null;
}

/* ======================= scenarios ======================= */
const SCENARIOS = [
  { key: 'price', text: 'What’s your price?', expect: 'price', label: 'Gives a price' },
  { key: 'deliver', text: 'Do you deliver to London?', expect: 'answer', label: 'Answers delivery' },
  { key: 'refund', text: 'I want a refund!', expect: 'handoff', label: 'Hands over to a human' },
  { key: 'bot', text: 'Are you a bot?', expect: 'honest', label: 'Honest that it’s an AI' },
  { key: 'discount', text: 'Can I get a discount?', expect: 'discount', label: 'Follows your discount rule' },
  { key: 'unknown', text: 'Can you engrave a name on it?', expect: 'graceful', label: 'Says it will check, doesn’t invent' }
];
const GRACEFUL = /check with (the|our) team|get back to you|let me (check|confirm|ask)|someone from (the|our) team|i('|’)?ll (check|ask|find out)|not sure|don('|’)t have (that|this)/i;
function checkScenario(expect, out, rules) {
  const t = String(out.text || '');
  const r = rulesOf(rules);
  switch (expect) {
    case 'price': return /[$€£₦]\s?\d|\d+(\.\d+)?\s?(usd|eur|gbp|ngn|dollars?)\b|\bprice/i.test(t) && /\d/.test(t) ? { pass: true, note: 'Mentions a price' } : { pass: false, note: 'No price in the reply. Add products or a price Q&A.' };
    case 'handoff': return out.handoff ? { pass: true, note: 'Handed over to your team' } : { pass: false, note: 'Didn’t hand over. Turn on Smart handoff and the refund trigger.' };
    case 'no_handoff': return !out.handoff ? { pass: true, note: 'Answered without a handoff' } : { pass: false, note: 'Handed over when it shouldn’t' };
    case 'honest': return /\b(ai|a\.i\.|assistant|bot|virtual)\b/i.test(t) && !/\bi('|’)?m (a )?(real )?(human|person)\b|\bnot a bot\b/i.test(t) ? { pass: true, note: 'Honest that it’s an AI' } : { pass: false, note: 'Should say it’s an AI assistant' };
    case 'graceful': return out.handoff || GRACEFUL.test(t) ? { pass: true, note: 'Didn’t invent an answer' } : { pass: false, note: 'Check it didn’t make something up' };
    case 'discount': {
      const pcts = (t.match(/(\d{1,2})\s?%/g) || []).map(x => parseInt(x, 10));
      if (r.discount.mode === 'never') return pcts.length ? { pass: false, note: 'Offered a discount, but your rules say never' } : { pass: true, note: 'No discount offered, as your rules say' };
      if (r.discount.mode === 'max') return pcts.some(p => p > r.discount.max) ? { pass: false, note: 'Offered more than ' + r.discount.max + '%' } : { pass: true, note: 'Stayed within ' + r.discount.max + '%' };
      return { pass: true, note: 'Only uses discounts from your knowledge' };
    }
    default: return t && !GRACEFUL.test(t) && !out.handoff ? { pass: true, note: 'Answered' } : { pass: false, note: 'Didn’t have an answer. Teach it with a Q&A.' };
  }
}

/* ======================= gaps ======================= */
const INTENTIONAL = /\b(refund|human|real person|agent|manager|complain|complaint|angry|scam|withdraw|speak to|talk to)\b/i;
function gaps(closerId, wsId, training, items) {
  training = training || {};
  const dismissed = new Set((training.dismissed || []).map(String));
  const qas = (items || loadItems(closerId, true)).filter(i => i.kind === 'qa' || i.kind === 'correction');
  const taughtKeys = new Set(qas.map(i => i.data && i.data.gap_key).filter(Boolean));
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const rows = db.all('SELECT m.thread_id, m.dir, m.author, m.text, m.created_at FROM messages m JOIN threads t ON t.id = m.thread_id WHERE t.workspace_id = ? AND t.closer_id = ? AND m.created_at >= ? ORDER BY m.thread_id, m.id LIMIT 8000', wsId, closerId, since);
  const groups = new Map();
  let last = null; let tid = null;
  const hit = (why) => {
    if (!last) return;
    const q = last.text.trim();
    const key = keyOf(q);
    if (!key || key.split(' ').length < 1 || dismissed.has(key) || taughtKeys.has(key)) { last = null; return; }
    let g = groups.get(key);
    if (!g) { g = { key, question: q.slice(0, 300), count: 0, last_seen: last.created_at, threads: [], reasons: [] }; groups.set(key, g); }
    g.count++; if (last.created_at >= g.last_seen) { g.last_seen = last.created_at; g.question = q.slice(0, 300); }
    if (!g.threads.includes(last.thread_id) && g.threads.length < 5) g.threads.push(last.thread_id);
    if (!g.reasons.includes(why)) g.reasons.push(why);
    last = null;
  };
  for (const m of rows) {
    if (m.thread_id !== tid) { tid = m.thread_id; last = null; }
    if (m.dir === 'in') { const t = String(m.text || ''); last = t.length > 6 && tokens(t).length >= 1 && !INTENTIONAL.test(t) && !/^\[(image|voice note)\]$/.test(t) ? m : null; continue; }
    if (m.dir === 'note' && /handed this chat to your team/i.test(m.text || '')) { hit('handoff'); continue; }
    if (m.author === 'ai' && GRACEFUL.test(m.text || '')) { hit('unsure'); continue; }
    if (m.author === 'human') { const g0 = last ? keyOf(last.text.trim()) : null; hit('human'); const g = g0 && groups.get(g0); if (g && !g.suggested) g.suggested = String(m.text || '').slice(0, 1000); continue; }
    if (m.author === 'ai') last = null;
  }
  const list = [...groups.values()].filter(g => {
    const q = tokenSet(g.question);
    return !qas.some(i => scoreItem(i, q) >= 0.6);
  });
  list.sort((a, b) => b.count - a.count || (a.last_seen < b.last_seen ? 1 : -1));
  return list.slice(0, 50);
}

/* ======================= score ======================= */
const SALES_TEMPLATES = ['sales', 'win', 'vip'];
function score(closer, items, gapCount) {
  const persona = typeof closer.persona === 'string' ? db.json(closer.persona, {}) : (closer.persona || {});
  const training = typeof closer.training === 'string' ? db.json(closer.training, {}) : (closer.training || {});
  const rules = rulesOf(closer.rules);
  const live = (items || []).filter(i => i.enabled !== false && i.enabled !== 0);
  const n = k => live.filter(i => i.kind === k).length;
  const qa = n('qa') + n('correction');
  const topics = new Set(live.filter(i => i.kind === 'policy').map(i => i.data && i.data.topic));
  const priceText = /[$€£₦]\s?\d|\d+(\.\d+)?\s?(usd|eur|gbp|ngn)\b/i;
  const hasPrices = n('product') > 0 || live.some(i => (i.kind === 'qa' || i.kind === 'correction') && priceText.test(i.answer)) || priceText.test(closer.knowledge || '');
  const personaSet = !!training.personality_ok || ['tone', 'length', 'emoji'].some(k => persona[k] != null && persona[k] !== { tone: 30, length: 40, emoji: 30 }[k]) || !!persona.color || String(closer.instructions || '').length >= 20;
  const runs = Object.keys(training.runs || {}).length;
  const needsPay = SALES_TEMPLATES.includes(closer.template);
  const pol = ['delivery', 'returns', 'payment'].filter(t => topics.has(t)).length;
  const list = [
    { id: 'personality', label: 'Give it a personality', hint: 'Name, look and tone', done: personaSet, points: 10, go: 'personality' },
    { id: 'qa', label: 'Add at least 5 Q&As', hint: qa + ' of 5 added', done: qa >= 5, points: 20, part: Math.min(5, qa) / 5, go: 'qa' },
    { id: 'products', label: 'Add products or prices', hint: hasPrices ? 'Prices found' : 'So it never guesses a price', done: hasPrices, points: 15, go: 'products' },
    { id: 'policies', label: 'Delivery, returns and payment policies', hint: pol + ' of 3 added', done: pol === 3, points: 15, part: pol / 3, go: 'policies' },
    { id: 'paylink', label: needsPay ? 'Add your payment link' : 'Payment link (optional for this role)', hint: needsPay ? 'So it can close the sale' : 'Not needed', done: !needsPay || !!closer.pay_link, points: 10, go: 'paylink' },
    { id: 'rules', label: 'Set your rules', hint: 'Do’s, don’ts, discounts, handoffs', done: !!rules.set, points: 10, go: 'rules' },
    { id: 'tests', label: 'Run 3 scenario tests', hint: Math.min(3, runs) + ' of 3 run', done: runs >= 3, points: 10, part: Math.min(3, runs) / 3, go: 'tests' },
    { id: 'gaps', label: 'No open gaps', hint: gapCount ? gapCount + ' question' + (gapCount === 1 ? '' : 's') + ' to teach' : 'All caught up', done: !gapCount, points: 10, go: 'gaps' }
  ];
  const total = Math.round(list.reduce((s, x) => s + (x.done ? x.points : x.points * (x.part || 0)), 0));
  return { score: Math.min(100, total), checklist: list.map(({ part, ...x }) => x), counts: { qa, products: n('product'), policies: n('policy'), docs: n('doc'), corrections: n('correction'), runs, gaps: gapCount } };
}

/* ======================= versions ======================= */
function snapshotData(c) {
  return { name: c.name, template: c.template, persona: db.json(c.persona, {}), skills: db.json(c.skills, {}), instructions: c.instructions, rules: db.json(c.rules, {}), pay_link: c.pay_link };
}
function saveVersion(c, userId, label) {
  const data = JSON.stringify(snapshotData(c));
  const lastV = db.one('SELECT data FROM closer_versions WHERE closer_id = ? ORDER BY id DESC LIMIT 1', c.id);
  if (lastV && lastV.data === data) return null;
  const id = db.insert('closer_versions', { workspace_id: c.workspace_id, closer_id: c.id, user_id: userId || null, label: str(label, 80) || 'Saved', data, created_at: db.now() });
  db.run('DELETE FROM closer_versions WHERE closer_id = ? AND id NOT IN (SELECT id FROM closer_versions WHERE closer_id = ? ORDER BY id DESC LIMIT 10)', c.id, c.id);
  return id;
}

module.exports = {
  KINDS, TOPICS, SCENARIOS, RULE_DEFAULTS, MAX_ITEMS, ImportError,
  tokens, keyOf, overlap, stem, cleanItem, itemOut, loadItems, itemText, scoreItem, buildKnowledge, bestAnswer,
  parseQA, parseProducts, csvRows, htmlToText, chunkText, isPrivateIp, checkUrl, fetchPage, money, parsePrice,
  cleanRules, rulesOf, rulesPrompt, demoHandoff, checkScenario, gaps, score, saveVersion, snapshotData
};
