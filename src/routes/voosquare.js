'use strict';
// VooSquare routes (Voo Connect kit): "Continue with VooSquare" login next to Replyvoo's own login, "Connect VooSquare"
// for a logged-in account, logout everywhere, the landing-page snippet, the summary card, support replies from VooSquare
// HQ, tool links, the Castvoo inbound bridge and the support-HQ API.
//   GET  /auth/voosquare?return_to=/app&signup=1   start (VooSquare's launcher uses return_to=<Launch path>)
//   POST /api/auth/voosquare/link                  "Connect VooSquare" (Settings) for the account logged in now
//   GET  /auth/voosquare/callback                  VooSquare comes back here (register this exact address)
//   GET  /auth/voosquare/logout, GET /logout       end our session, then VooSquare's, then back to our home page
//   GET  /api/voosquare/summary                    VooSquare's dashboard card (Bearer VOO_API_KEY)
//   POST /hooks/voosquare/support                  a reply written in VooSquare HQ (Bearer VOO_API_KEY)
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const db = require('../db');
const auth = require('../lib/auth');
const voo = require('../services/voosquare');
const vooLib = require('../lib/voo');
const mailer = require('../services/mailer');
const { HttpError, rateLimit } = require('../lib/http');
const { esc } = require('../lib/md');
const { hmac, safeEqual, sha256 } = require('../lib/security');

const first = n => String(n || '').trim().split(' ')[0] || 'there';
const SNIPPET = path.join(config.root, 'voo-connect', 'voo-connect-browser.js');

function errorPage(res, e) {
  const { page } = require('./links');
  const msg = e instanceof HttpError ? e.message : 'Something went wrong while logging you in.';
  if (!(e instanceof HttpError)) console.error('[voosquare] login', e.message);
  res.send(page('Login did not finish', '<span class="tag">VOOSQUARE LOGIN</span><h1>Login did not finish</h1><p>' + esc(msg) + '</p><a class="btn y" href="/auth/voosquare">Try again</a><a class="btn" href="/app/login">Log in with email</a>'), e.status && e.status < 500 ? e.status : 502, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
}

// Older builds sent every login page to VooSquare. Replyvoo keeps its own login now, so nothing is redirected.
function appRedirect() { return false; }

/*
 * "Connect VooSquare" (Settings): a Voo ID is linked to the account logged in here ONLY when the login was started from
 * that button by this same session (cookie rv_voolink, HttpOnly, 10 minutes, bound to the session). Any other Voo ID
 * login while someone is logged in (VooSquare's launcher on a shared computer) switches account instead.
 */
const LINK_COOKIE = 'rv_voolink';
const linkTag = s => hmac('voolink:' + s.id);

module.exports = function (app) {
  const loginLimit = rateLimit('voo-login', 60, 900e3);

  app.get('/auth/voosquare', loginLimit, (req, res) => {
    if (!voo.enabled()) return res.redirect('/app/login');
    try { voo.startLogin(req, res, { returnTo: req.query.return_to, signup: req.query.signup === '1' || req.query.prompt === 'signup' }); }
    catch (e) { errorPage(res, e); }
  });

  app.post('/api/auth/voosquare/link', rateLimit('voo-link', 20, 600e3), (req, res) => {
    auth.needUser(req);
    if (!voo.enabled()) throw new HttpError(403, 'VooSquare login is switched off.');
    if (req.user.voo_id) throw new HttpError(409, 'Your account is already connected to VooSquare.');
    res.cookie(LINK_COOKIE, linkTag(req.session), { maxAge: 600, path: '/auth/voosquare' });
    const back = String((req.body || {}).return_to || '/app/settings');
    return { url: '/auth/voosquare?return_to=' + encodeURIComponent(voo.safeReturn(back)) };
  });

  app.get('/auth/voosquare/callback', loginLimit, async (req, res) => {
    if (!voo.enabled()) return res.redirect('/app/login');
    try {
      const { vu, returnTo } = await voo.finishLogin(req, res);
      const wantLink = !!(req.user && req.session && req.cookies[LINK_COOKIE] && safeEqual(req.cookies[LINK_COOKIE], linkTag(req.session)));
      if (req.cookies[LINK_COOKIE]) res.cookie(LINK_COOKIE, '', { maxAge: 0, path: '/auth/voosquare' });
      const { user, isNew, linked } = voo.linkOrCreate(vu, wantLink ? req.user : null);
      if (user.suspended) throw new HttpError(403, 'This account is suspended. Contact support.');
      // Invited teammates and staff joining don't get a workspace of their own.
      const joining = returnTo.startsWith('/app/invite') || returnTo.startsWith('/admin');
      const wsId = joining ? null : voo.ensureWorkspace(user);
      if (wantLink) {
        // Same person, same session: keep it.
      } else {
        // A different account was logged in here: end that session first.
        if (req.session) db.run('DELETE FROM sessions WHERE id = ?', req.session.id);
        auth.startSession(req, res, user, wsId || undefined);
      }
      if (isNew && wsId) {
        mailer.send(user.email, 'welcome', { name: first(user.name), dashboard_url: config.appUrl + '/app' });
        return res.redirect('/app/welcome' + (returnTo !== '/app' ? '?next=' + encodeURIComponent(returnTo) : ''));
      }
      if (linked && /^\/app(\/|\?|$)/.test(returnTo)) return res.redirect(returnTo + (returnTo.includes('?') ? '&' : '?') + 'voo=linked');
      res.redirect(returnTo);
    } catch (e) { errorPage(res, e); }
  });

  // Log out everywhere: our session, then VooSquare's (for Voo ID accounts), then back to our home page.
  // Another website must not log people out with a hidden link: a cross-site GET gets a small "Log out?" page instead.
  const logout = (req, res) => {
    const was = req.user;
    auth.endSession(req, res);
    res.writeHead(302, { Location: voo.enabled() && was && was.voo_id ? voo.logoutUrl() : '/', 'Cache-Control': 'no-store' });
    res.end();
  };
  const logoutGet = (req, res) => {
    const site = String(req.headers['sec-fetch-site'] || '');
    if (site && site !== 'same-origin' && site !== 'none') {
      return res.send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Log out | Replyvoo</title><body style="font-family:system-ui,sans-serif;padding:40px;text-align:center;color:#121110"><h2>Log out of Replyvoo?</h2><form method="post" action="/logout"><button type="submit" style="font:inherit;padding:12px 24px;border-radius:12px;border:0;background:#121110;color:#fff;cursor:pointer">Log out</button></form><p><a href="/app" style="color:#121110">Back to Replyvoo</a></p>', 200, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
    }
    return logout(req, res);
  };
  app.get('/auth/voosquare/logout', logoutGet);
  app.get('/logout', logoutGet);
  // The form above. A cross-site POST carries no session cookie (SameSite=Lax), so it can't log anyone out.
  app.post('/logout', logout);

  // VooSquare's launcher may open /dashboard; Replyvoo's dashboard is /app.
  app.get('/dashboard', (req, res) => res.redirect('/app'));

  // Landing pages keep the affiliate click even when served from a cache. Off: an empty script.
  app.get('/voo-connect-browser.js', (req, res) => {
    const body = vooLib.anyOn() ? fs.readFileSync(SNIPPET) : Buffer.from('/* Voo Connect is off */');
    const etag = '"' + sha256(body).slice(0, 16) + '"';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
    res.send(body, 200, 'text/javascript; charset=utf-8', { 'Cache-Control': 'public, max-age=300', ETag: etag });
  });

  // VooSquare's dashboard card. Authorization: Bearer <VOO_API_KEY>.
  app.get('/api/voosquare/summary', (req, res) => voo.summaryHandler()(req, res));

  // A reply written in VooSquare HQ. Two addresses: the Voo Connect default and ours.
  const supportHook = (req, res) => {
    if (!vooLib.eventsOn()) return res.json({ error: 'VooSquare is not connected' }, 404);
    return vooLib.get().supportWebhook(async reply => voo.supportReply(reply))(req, res);
  };
  app.post('/hooks/voosquare/support', supportHook);
  app.post('/api/voosquare/support/webhook', supportHook);

  // Server-to-server: VooSquare turns a link between tools on (with a scoped key) or off (key revoked).
  app.post('/api/voosquare/links', req => { voo.checkServiceKey(req); return { ok: true, ...voo.saveLink(req.body || {}) }; });
  app.get('/api/voosquare/links', req => { voo.checkServiceKey(req); return { links: voo.listLinks(req.query.voo_id) }; });

  // Castvoo → Replyvoo: a reply to a Castvoo broadcast, answered by the Closer on the same Telegram bot.
  const inboundLimit = rateLimit('voo-inbound', 600, 60e3);
  app.post('/api/voosquare/inbound/castvoo', inboundLimit, async req => {
    const link = voo.linkFor(req, 'castvoo-replyvoo');
    const b = req.body || {};
    const text = String(b.text || '').trim().slice(0, 4000);
    if (!text || !b.chat_id) throw new HttpError(400, 'chat_id and text are required.');
    const u = db.one('SELECT id FROM users WHERE voo_id = ?', link.voo_id);
    if (!u) throw new HttpError(404, 'This Voo ID has no Replyvoo account yet.');
    const botId = String(b.bot_id || ''); const botUser = String(b.bot_username || '').replace(/^@/, '').toLowerCase();
    const channel = db.all("SELECT c.* FROM channels c JOIN members m ON m.workspace_id = c.workspace_id AND m.user_id = ? AND m.role IN ('owner','admin') WHERE c.type = 'telegram_bot' AND c.status = 'active'", u.id)
      .find(c => (botId && c.external_id === botId) || (botUser && String(c.username).toLowerCase() === botUser));
    if (!channel) throw new HttpError(409, 'Connect this Telegram bot in Replyvoo first, so the Closer can answer on it.');
    const from = b.from || {};
    const reply = await require('../services/engine').handleInbound({ channel, chatId: String(b.chat_id), from: { id: String(from.id || b.chat_id), name: String(from.name || '').slice(0, 80), username: String(from.username || '').slice(0, 64) }, text, meta: { via: 'castvoo' } });
    return { ok: true, replied: !!reply, text: reply || null };
  });

  // Dashboard: what VooSquare shows this user (account page and "Part of VooSquare" links).
  app.get('/api/app/voosquare', req => {
    auth.needUser(req);
    return { ...voo.publicInfo(), linked: !!req.user.voo_id, has_password: !!req.user.password_hash, country: req.user.country || '', links: req.user.voo_id ? voo.listLinks(req.user.voo_id) : [] };
  });

  // ---------- VooSquare support HQ (server-to-server, service key) ----------
  // VooSquare invites staff once and sends their access here; staff act by Voo ID.
  const staffSvc = require('../services/staff');
  const support = require('../services/support');
  const staffByVoo = vooId => {
    const u = vooId ? db.one('SELECT * FROM users WHERE voo_id = ?', String(vooId)) : null;
    const st = u ? staffSvc.get(u.id) : null;
    if (!st) throw new HttpError(403, 'That Voo ID is not on Replyvoo staff.');
    return { u, st };
  };
  app.get('/api/voosquare/staff', req => {
    voo.checkServiceKey(req, { staffOnly: true });
    return { staff: db.all('SELECT u.voo_id, u.email, u.name, s.role, s.status, s.source, s.all_boxes, s.boxes, s.title, s.last_seen FROM staff s JOIN users u ON u.id = s.user_id ORDER BY s.created_at').map(r => ({ ...r, all_boxes: !!r.all_boxes, boxes: db.json(r.boxes, []) })), roles: Object.keys(staffSvc.ROLES), sections: staffSvc.SECTIONS };
  });
  app.post('/api/voosquare/staff', req => {
    voo.checkServiceKey(req, { staffOnly: true });
    const b = req.body || {};
    if (!b.voo_id) throw new HttpError(400, 'voo_id is required.');
    if (b.role === 'owner') throw new HttpError(400, 'Owners are added inside Replyvoo, not from VooSquare.');
    const vooId = String(b.voo_id).slice(0, 200);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
    // Checks first, with no side effects: never re-link an existing account by email from here.
    let user = db.one('SELECT * FROM users WHERE voo_id = ?', vooId);
    if (!user && email && db.one('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists in Replyvoo. Ask them to press “Connect VooSquare” in Replyvoo’s Settings once, then try again.');
    const cur = user ? db.one('SELECT role FROM staff WHERE user_id = ?', user.id) : null;
    if (cur && cur.role === 'owner') throw new HttpError(409, 'This person is a Replyvoo owner; change them inside Replyvoo.');
    if (b.active === false) {
      if (user && cur) { db.run("UPDATE staff SET status = 'disabled' WHERE user_id = ?", user.id); staffSvc.syncRole(user.id); db.run('DELETE FROM sessions WHERE user_id = ?', user.id); }
      return { ok: true, active: false };
    }
    if (b.role && !staffSvc.ROLES[b.role]) throw new HttpError(400, 'Unknown role');
    if (!user) {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'A valid email is required for a new staff member.');
      const id = db.insert('users', { email, name: String(b.name || '').trim().slice(0, 80) || email.split('@')[0], password_hash: '', email_verified: 1, voo_id: vooId, moji: '{}', created_at: db.now() });
      user = db.one('SELECT * FROM users WHERE id = ?', id);
    }
    const st = staffSvc.upsert(user.id, { role: b.role || 'support', perms: b.perms || {}, all_boxes: b.all_boxes !== false, boxes: b.boxes || [], title: b.title || '', source: 'voosquare' });
    return { ok: true, active: true, staff: staffSvc.publicInfo(st), admin_url: config.appUrl + '/admin' };
  });
  app.get('/api/voosquare/support/boxes', req => { voo.checkServiceKey(req); return { boxes: support.boxes(true).map(b => ({ id: b.id, name: b.name, color: b.color, active: !!b.active, open: db.one("SELECT COUNT(*) n FROM support_tickets WHERE box_id = ? AND status != 'solved'", b.id).n })) }; });
  app.get('/api/voosquare/support/tickets', req => {
    voo.checkServiceKey(req);
    const q = req.query;
    // Without voo_id VooSquare sees every box (HQ view); with it, only what that staff member may see.
    const scope = q.voo_id ? staffByVoo(q.voo_id) : { u: null, st: { all_boxes: true, boxes: [] } };
    if (q.voo_id && !staffSvc.can(scope.st, 'support', 'view')) throw new HttpError(403, 'This staff member has no access to the support desk.');
    return { tickets: support.list(scope.st, { status: q.status || 'active', box: q.box_id || '', mine: q.view === 'mine' ? true : q.view === 'unassigned' ? 'unassigned' : false, q: String(q.q || '').slice(0, 80), userId: scope.u ? scope.u.id : null, limit: q.limit, before: q.before || '' }).map(t => ({ ...t, url: config.appUrl + '/admin/support/' + t.ref })) };
  });
  app.get('/api/voosquare/support/tickets/:ref', req => {
    voo.checkServiceKey(req);
    const t = db.one('SELECT * FROM support_tickets WHERE ref = ?', String(req.params.ref));
    if (!t) throw new HttpError(404, 'Ticket not found');
    if (req.query.voo_id) {
      const { u, st } = staffByVoo(req.query.voo_id);
      if (!staffSvc.can(st, 'support', 'view')) throw new HttpError(403, 'This staff member has no access to the support desk.');
      if (!staffSvc.canBox(st, t.box_id) && t.assignee_id !== u.id) throw new HttpError(403, 'Not in this staff member’s boxes.');
    }
    return { ...support.ticketOut(t, true), url: config.appUrl + '/admin/support/' + t.ref };
  });
  app.post('/api/voosquare/support/tickets/:ref/reply', async req => {
    voo.checkServiceKey(req);
    const b = req.body || {};
    const { u, st } = staffByVoo(b.voo_id);
    if (!staffSvc.can(st, 'support', 'edit')) throw new HttpError(403, 'This staff member can only view the desk.');
    const t = support.getForStaff(st, req.params.ref);
    return await support.reply(t, u, support.fill(b.text == null ? '' : b.text, t), { note: !!b.note });
  });
  app.post('/api/voosquare/support/tickets/:ref/update', req => {
    voo.checkServiceKey(req);
    const b = req.body || {};
    const { u, st } = staffByVoo(b.voo_id);
    if (!staffSvc.can(st, 'support', 'edit')) throw new HttpError(403, 'This staff member can only view the desk.');
    const t = support.getForStaff(st, req.params.ref);
    if (b.box_id != null && !staffSvc.canBox(st, b.box_id)) throw new HttpError(403, 'This staff member can only move tickets to their own boxes.');
    const patch = { status: b.status, priority: b.priority, box_id: b.box_id };
    if (b.assignee_voo_id !== undefined) patch.assignee_id = b.assignee_voo_id ? staffByVoo(b.assignee_voo_id).u.id : null;
    return { ok: true, ticket: support.ticketOut(support.update(t, u, patch)) };
  });
};
module.exports.appRedirect = appRedirect;
