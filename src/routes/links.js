'use strict';
// Short links and payment return pages: /r/:code, /go/joinvoo, /pay/callback, /pay/demo/:ref,
// plus the single-page app shells for /app and /admin.
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const config = require('../config');
const settings = require('../services/settings');
const payments = require('../services/payments');
const ws = require('../services/workspace');
const { sha256 } = require('../lib/security');
const { esc } = require('../lib/md');

const VIEWS = path.join(config.root, 'views');
const shellCache = new Map();
function shell(name) {
  if (config.isProd && shellCache.has(name)) return shellCache.get(name);
  const html = fs.readFileSync(path.join(VIEWS, name), 'utf8');
  shellCache.set(name, html);
  return html;
}
function click(req, target, source, wsId) {
  db.insert('clicks', { target, source: String(source || '').slice(0, 40), workspace_id: wsId || null, user_id: req.user ? req.user.id : null, ip_hash: sha256(req.ip + config.secret).slice(0, 16), created_at: db.now() });
}
function page(title, body) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(title) + ' | Replyvoo</title>' +
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FAF9F5;color:#121110;font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;padding:20px}' +
    '.card{width:100%;max-width:440px;background:#fff;border:1px solid #EEEBE2;border-radius:26px;padding:30px;box-shadow:0 30px 60px -40px rgba(18,17,16,.35)}' +
    'h1{margin:0 0 6px;font-size:26px;letter-spacing:-0.04em}p{color:#5E5A50;margin:0 0 18px;line-height:1.55}.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #EEEBE2;font-size:15px}' +
    '.btn{display:flex;align-items:center;justify-content:center;width:100%;margin-top:20px;border:0;border-radius:999px;background:#121110;color:#fff;font:700 16px/1 inherit;padding:16px;cursor:pointer;text-decoration:none}.btn.y{background:#FFC21A;color:#121110}' +
    '.tag{display:inline-block;background:#FFF7DD;color:#7A5800;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:800;letter-spacing:.06em;margin-bottom:14px}.logo{width:44px;height:44px;border-radius:14px;background:#FFC21A;margin-bottom:18px}</style></head><body><div class="card"><div class="logo"></div>' + body + '</div></body></html>';
}

// ---------- Paying for Replyvoo from inside Joinvoo (popup) ----------
// Joinvoo opens /pay/joinvoo in a small window. The customer pays with Replyvoo's own methods (card, bank, Bachs, crypto). The return
// page tells the Joinvoo window (postMessage, only to the configured Joinvoo address) and closes. The payment provider's webhook stays
// the source of truth: if the window is closed early, Replyvoo still fulfils the order and Joinvoo sees "Plan active" on its next check.
const jvOrigin = () => { try { return new URL(require('../services/joinvoo').cfg().publicUrl).origin; } catch { return ''; } };
function jvReturn(ref) {
  const o = ref ? db.one('SELECT meta FROM orders WHERE ref = ?', String(ref)) : null;
  return o && db.json(o.meta, {}).jv_return ? '/pay/joinvoo/done?ref=' + encodeURIComponent(ref) : null;
}
function jvItem(q) {
  const kind = q.kind === 'pack' ? 'pack' : 'plan';
  return { kind, item_id: String(q.item || q.item_id || '').slice(0, 40), interval: q.interval === 'year' ? 'year' : 'month' };
}
function jvWs(req) {
  if (req.ws && ws.memberRole(req.ws.id, req.user.id)) return req.ws;
  const w = db.one("SELECT id FROM workspaces WHERE owner_id = ? AND status = 'active' ORDER BY id LIMIT 1", req.user.id);
  return w ? ws.get(w.id) : null;
}

module.exports = function (app) {
  app.get('/pay/joinvoo', (req, res) => {
    if (!jvOrigin() || !require('../services/joinvoo').enabled()) return res.send(page('Not available', '<h1>Not available</h1><p>Paying from Joinvoo isn’t switched on yet.</p>'), 404);
    if (!req.user) return res.redirect('/auth/voosquare?return_to=' + encodeURIComponent(req.url));
    const w = jvWs(req); if (!w) return res.redirect('/app');
    const it = jvItem(req.query);
    let pv; try { pv = payments.preview(w.id, it, req.user.country); } catch (e) { return res.send(page('Checkout', '<h1>That isn’t available</h1><p>' + esc(e.message) + '</p>'), 400); }
    const methods = (pv.providers || []).map(p => '<form method="post" action="/pay/joinvoo"><input type="hidden" name="kind" value="' + esc(it.kind) + '"><input type="hidden" name="item_id" value="' + esc(it.item_id) + '"><input type="hidden" name="interval" value="' + esc(it.interval) + '"><input type="hidden" name="provider" value="' + esc(p.id) + '">' +
      '<button class="btn" type="submit" style="justify-content:space-between;margin-top:10px"><span>' + esc(p.name) + '</span><span style="font-weight:500;font-size:13px;opacity:.8">' + esc(p.note || '') + '</span></button></form>').join('');
    res.send(page('Checkout', '<span class="tag">REPLYVOO CHECKOUT · FROM JOINVOO</span><h1>' + esc(pv.item_name) + '</h1><p>Pay with your card, bank or crypto. This window closes by itself when you’re done, and Joinvoo updates on its own.</p>' +
      '<div class="row"><span>Total</span><strong>$' + pv.total.toFixed(2) + '</strong></div>' + (methods || '<p>Payments are not set up yet. Please contact support.</p>') +
      '<p style="margin-top:16px;font-size:13px">Your payment is confirmed by the payment provider. If you close this window early, your plan still turns on as soon as the payment confirms.</p>'));
  });
  app.post('/pay/joinvoo', async (req, res) => {
    if (!req.user || !jvOrigin()) return res.send(page('Blocked', '<h1>Please start again</h1><p>Open the checkout again from Joinvoo.</p>'), 403);
    const origin = req.headers.origin || req.headers.referer || '';
    if (origin && !origin.startsWith(config.appUrl) && !origin.includes('//' + req.headers.host)) return res.send(page('Blocked', '<h1>Blocked</h1><p>Please start the checkout again from Joinvoo.</p>'), 403);
    const w = jvWs(req); if (!w) return res.redirect('/app');
    const b = req.body || {}, it = jvItem(b);
    let r; try { r = await payments.checkout(w.id, req.user, { ...it, provider: String(b.provider || ''), coin: b.coin }); }
    catch (e) { return res.send(page('Checkout', '<h1>That didn’t work</h1><p>' + esc(e.message) + '</p><a class="btn" href="/pay/joinvoo?kind=' + encodeURIComponent(it.kind) + '&item=' + encodeURIComponent(it.item_id) + '&interval=' + it.interval + '">Try again</a>'), e.status || 400); }
    const o = db.one('SELECT id, meta FROM orders WHERE ref = ?', r.ref);
    if (o) db.update('orders', o.id, { meta: JSON.stringify({ ...db.json(o.meta, {}), jv_return: true }) });
    if (r.done) return res.redirect('/pay/joinvoo/done?ref=' + encodeURIComponent(r.ref));
    if (r.redirect) return res.redirect(r.redirect);
    if (r.instructions) return res.send(page('Pay with USDT', '<h1>Send USDT</h1><p>' + esc(r.instructions.note) + '</p><div class="row"><span>Network</span><strong>' + esc(r.instructions.network) + '</strong></div><div class="row"><span>Wallet</span><strong style="word-break:break-all">' + esc(r.instructions.wallet) + '</strong></div><div class="row"><span>Amount</span><strong>' + r.instructions.amount + ' USDT</strong></div><a class="btn" href="/pay/joinvoo/done?ref=' + encodeURIComponent(r.ref) + '">I’ve sent it</a>'));
    res.redirect('/pay/joinvoo/done?ref=' + encodeURIComponent(r.ref));
  });
  app.get('/pay/joinvoo/done', (req, res) => {
    const ref = String(req.query.ref || '').slice(0, 60);
    const o = ref && req.user ? db.one('SELECT ref, status, item_name, workspace_id FROM orders WHERE ref = ?', ref) : null;
    if (!o || !ws.memberRole(o.workspace_id, req.user.id)) return res.send(page('Not found', '<h1>Checkout not found</h1><p>Close this window and check your plan in Joinvoo.</p>'), 404);
    const st = o.status === 'paid' ? 'paid' : o.status === 'pending' ? 'pending' : 'failed', origin = jvOrigin();
    const msg = st === 'paid' ? ['Payment done', 'You’re all set: ' + o.item_name + '. This window closes by itself.'] : st === 'pending' ? ['Confirming your payment', 'This can take a minute. You can close this window: Joinvoo updates by itself when it’s confirmed.'] : ['The payment didn’t go through', 'Nothing was charged. Close this window and try again in Joinvoo.'];
    // Only ever posted to the configured Joinvoo origin. JSON is escaped for a script block.
    // Data only (never run): /js/pay-done.js reads it and posts it to that origin. Keeps the page under the strict CSP.
    const data = JSON.stringify({ msg: { type: 'replyvoo:checkout', ref: o.ref, status: st }, origin: origin || '', close: st === 'paid' }).replace(/</g, '\\u003c');
    res.send(page(msg[0], '<span class="tag">REPLYVOO</span><h1>' + esc(msg[0]) + '</h1><p>' + esc(msg[1]) + '</p><button class="btn" id="pdClose" type="button">Close</button>' +
      '<script type="application/json" id="payDone">' + data + '</script><script src="/js/pay-done.js" defer></script>'));
  });


  // Voo Squad referral link: remember the code for 30 days, count the click, go to the homepage.
  app.get('/r/:code', (req, res) => {
    const code = String(req.params.code).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
    const w = code ? db.one('SELECT id FROM workspaces WHERE ref_code = ?', code) : null;
    if (w) { res.cookie('rv_ref', code, { maxAge: 30 * 86400 }); click(req, 'ref', code, w.id); }
    res.redirect('/?invite=' + encodeURIComponent(code)); // not ?ref=: that parameter belongs to VooSquare affiliates
  });

  // Sister company: Joinvoo. Tracks the click, then sends the visitor on with UTM tags.
  app.get('/go/joinvoo', (req, res) => {
    const j = settings.get('joinvoo');
    const src = String(req.query.from || 'dashboard').replace(/[^a-z0-9_-]/gi, '').slice(0, 30);
    click(req, 'joinvoo', src, req.ws ? req.ws.id : null);
    let url = /^https:\/\//.test(j.url) ? j.url : 'https://joinvoo.com';
    url += (url.includes('?') ? '&' : '?') + (j.utm || 'utm_source=replyvoo') + '&utm_content=' + encodeURIComponent(src);
    res.redirect(url);
  });

  // Return page after Paystack / Flutterwave.
  // Where checkouts send people back. Asks the provider only for an order that is still pending and less than a day old,
  // rate-limited per IP, so it can't be used to make us call the providers in a loop.
  const cbLimit = require('../lib/http').rateLimit('pay-callback', 30, 600e3);
  app.get('/pay/callback', cbLimit, async (req, res) => {
    const ref = String(req.query.ref || req.query.reference || req.query.tx_ref || '').slice(0, 60);
    const open = ref ? db.one("SELECT id FROM orders WHERE ref = ? AND status IN ('pending','failed') AND created_at > ?", ref, new Date(Date.now() - 864e5).toISOString()) : null;
    if (open) { try { await payments.verify(ref); } catch (e) { console.warn('[callback]', e.message); } }
    res.redirect(jvReturn(ref) || '/app/wallet?order=' + encodeURIComponent(ref));
  });

  // Demo checkout (only when PAYMENTS_DEMO=true). Lets you test the full purchase flow without money.
  function demoOrder(req) {
    if (!config.pay.demo || !req.user) return null;
    const o = db.one('SELECT * FROM orders WHERE ref = ? AND provider = \'demo\'', String(req.params.ref));
    if (!o || !ws.memberRole(o.workspace_id, req.user.id)) return null;
    return o;
  }
  app.get('/pay/demo/:ref', (req, res) => {
    const o = demoOrder(req);
    if (!o) return res.send(page('Not found', '<h1>Checkout not found</h1><p>This demo checkout link is invalid, or demo payments are switched off.</p><a class="btn" href="/app/wallet">Back to dashboard</a>'), 404);
    if (o.status === 'paid') return res.redirect('/app/wallet?order=' + o.ref);
    const paid = Math.round((o.amount_usd + (o.fee_usd || 0)) * 100) / 100; // the method's fee is built into the price
    res.send(page('Demo checkout', '<span class="tag">TEST MODE · NO REAL MONEY</span><h1>Demo checkout</h1><p>This is how a purchase completes. In production your customers pay with Paystack, Flutterwave or USDT here.</p>' +
      '<div class="row"><span>Item</span><strong>' + esc(o.item_name) + '</strong></div><div class="row"><span>Total</span><strong>$' + paid.toFixed(2) + '</strong></div><div class="row"><span>Reference</span><strong>' + esc(o.ref) + '</strong></div>' +
      '<form method="post" action="/pay/demo/' + encodeURIComponent(o.ref) + '"><button class="btn y" type="submit">Pay $' + paid.toFixed(2) + ' (demo)</button></form><a class="btn" href="/app/wallet">Cancel</a>'));
  });
  app.post('/pay/demo/:ref', (req, res) => {
    const o = demoOrder(req);
    if (!o) return res.send(page('Not found', '<h1>Checkout not found</h1><p>This demo checkout is not available.</p>'), 404);
    // Same-origin check instead of the API header (this is a plain HTML form).
    const origin = req.headers.origin || req.headers.referer || '';
    if (origin && !origin.startsWith(config.appUrl) && !origin.includes('//' + req.headers.host)) return res.send(page('Blocked', '<h1>Blocked</h1><p>Please start the checkout again from your dashboard.</p>'), 403);
    payments.fulfill(o.ref, { via: 'demo' });
    res.redirect(jvReturn(o.ref) || '/app/wallet?order=' + o.ref);
  });

  // Gatevoo sandbox checkout (no keys + PAYMENTS_DEMO): the same flow as Gatevoo's hosted page, without real coins.
  function gvOrder(req) {
    const gatevoo = require('../services/gatevoo');
    if (gatevoo.mode() !== 'sandbox' || !req.user) return null;
    const o = db.one('SELECT * FROM orders WHERE ref = ? AND provider = \'gatevoo\'', String(req.params.ref));
    if (!o || !ws.memberRole(o.workspace_id, req.user.id)) return null;
    return o;
  }
  app.get('/pay/gatevoo/:ref', (req, res) => {
    const o = gvOrder(req);
    if (!o) return res.send(page('Not found', '<h1>Checkout not found</h1><p>This crypto checkout link is invalid or has expired.</p><a class="btn" href="/app/wallet">Back to dashboard</a>'), 404);
    if (o.status !== 'pending') return res.redirect('/app/wallet?order=' + encodeURIComponent(o.ref));
    const gatevoo = require('../services/gatevoo');
    const coins = gatevoo.coins().map(c => gatevoo.COINS[c]);
    res.locals.frameSelf = true; // the live demo shows this sandbox page in a frame on Replyvoo itself
    res.send(require('../../views/gatevoo-checkout').render({ order: o, coins, coin: String(req.query.coin || db.json(o.meta, {}).coin || ''), action: '/pay/gatevoo/' + encodeURIComponent(o.ref), cancelUrl: '/app/wallet' }), 200, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  });
  app.post('/pay/gatevoo/:ref', (req, res) => {
    const o = gvOrder(req);
    if (!o) return res.send(page('Not found', '<h1>Checkout not found</h1><p>This crypto checkout is not available.</p>'), 404);
    const origin = req.headers.origin || req.headers.referer || '';
    if (origin && !origin.startsWith(config.appUrl) && !origin.includes('//' + req.headers.host)) return res.send(page('Blocked', '<h1>Blocked</h1><p>Please start the checkout again from your dashboard.</p>'), 403);
    require('../services/gatevoo').sandboxPay(o.ref, String((req.body || {}).coin || ''));
    res.redirect('/app/wallet?order=' + encodeURIComponent(o.ref));
  });

  // One-click unsubscribe from broadcast emails (account emails such as receipts are still sent).
  app.get('/unsubscribe', (req, res) => {
    const { hmac, safeEqual } = require('../lib/security');
    const email = String(req.query.e || '').toLowerCase().slice(0, 200);
    const ok = email && safeEqual(String(req.query.t || ''), hmac('unsub:' + email).slice(0, 32));
    if (ok) db.run('UPDATE users SET marketing_opt_out = 1 WHERE email = ?', email);
    res.send(page('Unsubscribed', ok ? '<h1>You’re unsubscribed</h1><p>You won’t get Replyvoo news and offers by email anymore. Important account emails, like receipts and security alerts, will still reach you.</p><a class="btn" href="/">Back to Replyvoo</a>' : '<h1>Link not valid</h1><p>This unsubscribe link is broken or incomplete. Email us and we’ll take you off the list.</p><a class="btn" href="/">Back to Replyvoo</a>'), ok ? 200 : 400);
  });

  // Single-page apps.
  const sendShell = file => (req, res) => res.send(shell(file), 200, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' });
  app.get('/app', sendShell('app.html'));
  const appShell = sendShell('app.html');
  app.get('/app/*', (req, res) => { if (!require('./voosquare').appRedirect(req, res)) appShell(req, res); });
  app.get('/admin', sendShell('admin.html'));
  app.get('/admin/*', sendShell('admin.html'));
};
module.exports.page = page;
