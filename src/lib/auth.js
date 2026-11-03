'use strict';
// Sessions, login state and access checks.
const db = require('../db');
const ws = require('../services/workspace');
const { token, sha256 } = require('./security');
const { HttpError } = require('./http');

const COOKIE = 'rv_s';
const TTL = 30 * 864e5;

function startSession(req, res, user, workspaceId) {
  const raw = token(32);
  db.insert('sessions', { id: sha256(raw), user_id: user.id, workspace_id: workspaceId || null, ip: String(req.ip).slice(0, 64), ua: String(req.headers['user-agent'] || '').slice(0, 200), created_at: db.now(), expires_at: new Date(Date.now() + TTL).toISOString() });
  db.update('users', user.id, { last_login: db.now() });
  res.cookie(COOKIE, raw, { maxAge: TTL / 1000 });
}

function endSession(req, res) {
  const raw = req.cookies[COOKIE];
  if (raw) db.run('DELETE FROM sessions WHERE id = ?', sha256(raw));
  res.cookie(COOKIE, '', { maxAge: 0 });
}

// Middleware: loads req.user / req.ws when a valid session cookie exists.
function load(req) {
  req.user = null; req.ws = null;
  const raw = req.cookies[COOKIE];
  if (!raw) return;
  const s = db.one('SELECT * FROM sessions WHERE id = ?', sha256(raw));
  if (!s || new Date(s.expires_at) < new Date()) return;
  const u = db.one('SELECT * FROM users WHERE id = ?', s.user_id);
  if (!u || u.suspended) return;
  req.session = s;
  req.user = { ...u, moji: db.json(u.moji, {}) };
  let wsId = s.workspace_id;
  if (!wsId || !ws.memberRole(wsId, u.id)) {
    const m = db.one('SELECT workspace_id FROM members WHERE user_id = ? ORDER BY created_at LIMIT 1', u.id);
    wsId = m ? m.workspace_id : null;
    if (wsId) db.update('sessions', s.id, { workspace_id: wsId });
  }
  if (wsId) { req.ws = ws.ensurePeriod(ws.get(wsId)); req.role = ws.memberRole(wsId, u.id); }
}

// Cross-site request protection: browsers can't add custom headers to cross-site requests without CORS.
// /api/voosquare/* is server-to-server and authenticated by a bearer key instead of a cookie.
function csrf(req) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.path.startsWith('/api/') && !req.path.startsWith('/api/voosquare/') && req.headers['x-rv'] !== '1') {
    throw new HttpError(403, 'Missing request header');
  }
}

const needUser = req => { if (!req.user) throw new HttpError(401, 'Please log in.'); };
const needWs = req => { needUser(req); if (!req.ws) throw new HttpError(403, 'No workspace'); if (req.ws.status !== 'active') throw new HttpError(403, 'This workspace is suspended. Contact support.'); };
const needManager = req => { needWs(req); if (!['owner', 'admin'].includes(req.role)) throw new HttpError(403, 'Only owners and admins can do that.'); };
const needAdmin = req => { require('../services/staff').needStaff(req); };

function publicUser(u) { return u && { id: u.id, email: u.email, name: u.name, role: u.role, email_verified: !!u.email_verified, voo: !!u.voo_id, has_password: !!u.password_hash, country: u.country || '', moji: typeof u.moji === 'string' ? db.json(u.moji, {}) : u.moji }; }

module.exports = { startSession, endSession, load, csrf, needUser, needWs, needManager, needAdmin, publicUser, COOKIE };
