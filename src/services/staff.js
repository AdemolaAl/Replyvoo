'use strict';
// Admin staff: roles, per-page access, support boxes they work in, and the emailed 2-step code.
// A user is staff when they have an active row in `staff`. users.role is kept in sync ('admin' for staff)
// because older code checks it (maintenance bypass, break-glass password login).
const config = require('../config');
const db = require('../db');
const { sha256 } = require('../lib/security');
const { HttpError } = require('../lib/http');

// Admin pages, grouped into sections that can be set to none / view / edit.
const SECTIONS = {
  overview: 'Overview',
  support: 'Support desk',
  users: 'Users & workspaces',
  orders: 'Orders & payments',
  pricing: 'Plans, credits, coupons & billing rules',
  website: 'Homepage, channels, blog, legal & SEO',
  emails: 'Emails & broadcasts',
  activity: 'Activity & audit log',
  staff: 'Staff & support boxes'
};
const ALL = (level) => Object.fromEntries(Object.keys(SECTIONS).map(k => [k, level]));
const ROLES = {
  owner: { name: 'Owner', desc: 'Everything, including other owners and staff.', perms: ALL('edit') },
  admin: { name: 'Admin', desc: 'Everything except managing owners.', perms: ALL('edit') },
  support: { name: 'Support', desc: 'Works the support desk. Can look up customers and their orders.', perms: { overview: 'view', support: 'edit', users: 'view', orders: 'view', pricing: 'none', website: 'none', emails: 'none', activity: 'none', staff: 'none' } },
  finance: { name: 'Finance', desc: 'Orders, payments, prices and coupons. Read-only on the desk.', perms: { overview: 'view', support: 'view', users: 'view', orders: 'edit', pricing: 'edit', website: 'none', emails: 'none', activity: 'view', staff: 'none' } },
  content: { name: 'Content', desc: 'Homepage, blog, legal pages, SEO and emails.', perms: { overview: 'view', support: 'none', users: 'none', orders: 'none', pricing: 'view', website: 'edit', emails: 'edit', activity: 'none', staff: 'none' } },
  viewer: { name: 'Viewer', desc: 'Can look at everything, change nothing.', perms: { ...ALL('view'), staff: 'none' } }
};
const LEVEL = { none: 0, view: 1, edit: 2 };

// Which admin API path belongs to which section.
const ROUTES = [
  [/^\/api\/admin\/overview/, 'overview'],
  [/^\/api\/admin\/support/, 'support'],
  [/^\/api\/admin\/(users|workspaces)/, 'users'],
  [/^\/api\/admin\/orders/, 'orders'],
  [/^\/api\/admin\/(plans|packs|addons|coupons|gatevoo)/, 'pricing'],
  [/^\/api\/admin\/(posts|pages|preview-md)/, 'website'],
  [/^\/api\/admin\/(emails|broadcast)/, 'emails'],
  [/^\/api\/admin\/activity/, 'activity'],
  [/^\/api\/admin\/staff/, 'staff']
];
// Settings keys → section (GET /api/admin/settings only returns what the person may see).
const SETTING_SECTION = { company: 'website', seo: 'website', site: 'website', flags: 'website', joinvoo: 'website', ai: 'website', billing: 'pricing', support: 'support' };

let mfaOverride = null;
const mfaOn = () => (mfaOverride != null ? mfaOverride : config.staffMfa);
function setMfa(v) { mfaOverride = v; }

function resolve(row) {
  if (!row || row.status !== 'active') return null;
  const role = ROLES[row.role] ? row.role : 'viewer';
  const custom = db.json(row.perms, {});
  const perms = { ...ROLES[role].perms };
  if (role !== 'owner') for (const k of Object.keys(SECTIONS)) if (LEVEL[custom[k]] != null) perms[k] = custom[k];
  return { user_id: row.user_id, role, role_name: ROLES[role].name, title: row.title, perms, all_boxes: !!row.all_boxes || ['owner', 'admin'].includes(role), boxes: db.json(row.boxes, []).map(Number), source: row.source };
}
function get(userId) { return resolve(db.one('SELECT * FROM staff WHERE user_id = ?', userId)); }

function can(st, section, level = 'view') { return !!st && (LEVEL[st.perms[section]] || 0) >= LEVEL[level]; }
function canBox(st, boxId) { return !!st && (st.all_boxes || st.boxes.includes(Number(boxId))); }
function boxFilter(st) { return st.all_boxes ? null : st.boxes; }

function needStaff(req) {
  if (!req.user) throw new HttpError(401, 'Please log in.');
  const st = get(req.user.id);
  if (!st) throw new HttpError(403, 'Admins only');
  req.staff = st;
  if (mfaOn() && !(req.session && req.session.mfa_at)) throw new HttpError(401, 'Enter the 6-digit code we emailed you.', { code: 'mfa_required' });
  db.run('UPDATE staff SET last_seen = ? WHERE user_id = ? AND (last_seen IS NULL OR last_seen < ?)', db.now(), req.user.id, new Date(Date.now() - 5 * 60e3).toISOString());
  return st;
}

// Middleware for every /api/admin/* call: staff only, then the section's level (GET = view, writes = edit).
function guard(req) {
  if (!req.path.startsWith('/api/admin/')) return;
  if (/^\/api\/admin\/(me|join)\/?$|^\/api\/admin\/mfa\/(send|verify)$/.test(req.path)) return; // handled in the routes themselves
  const st = needStaff(req);
  const write = !['GET', 'HEAD'].includes(req.method);
  if (/^\/api\/admin\/settings/.test(req.path)) {
    if (!write) return;
    const sec = SETTING_SECTION[req.path.split('/')[4]] || 'staff';
    if (!can(st, sec, 'edit')) throw new HttpError(403, 'You don’t have permission to change this.');
    return;
  }
  const hit = ROUTES.find(([re]) => re.test(req.path));
  const sec = hit ? hit[1] : null;
  if (!sec) { if (st.role !== 'owner') throw new HttpError(403, 'Only owners can do that.'); return; }
  // Preview-md is a harmless helper used by the editors.
  if (!can(st, sec, write && !/preview-md/.test(req.path) ? 'edit' : 'view')) throw new HttpError(403, write ? 'You can view this page but not change it. Ask an owner for edit access.' : 'You don’t have access to this page.');
}

function filterSettings(st, all) {
  const out = {};
  for (const [k, v] of Object.entries(all)) if (k === 'company' || can(st, SETTING_SECTION[k] || 'staff', 'view')) out[k] = v;
  return out;
}

// Keeps users.role in step with staff status.
function syncRole(userId) {
  const row = db.one('SELECT status FROM staff WHERE user_id = ?', userId);
  db.run('UPDATE users SET role = ? WHERE id = ?', row && row.status === 'active' ? 'admin' : 'user', userId);
}

function cleanPerms(perms) {
  const out = {};
  for (const k of Object.keys(SECTIONS)) if (perms && LEVEL[perms[k]] != null) out[k] = perms[k];
  return out;
}
function cleanBoxes(boxes) { return (Array.isArray(boxes) ? boxes : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 100); }

function upsert(userId, { role, perms, all_boxes: allBoxes = true, boxes = [], title = '', source = 'replyvoo', status = 'active', invitedBy = null }) {
  if (!ROLES[role]) throw new HttpError(400, 'Unknown role');
  const row = { role, perms: JSON.stringify(cleanPerms(perms)), all_boxes: allBoxes ? 1 : 0, boxes: JSON.stringify(cleanBoxes(boxes)), title: String(title || '').slice(0, 60), status, source };
  if (db.one('SELECT user_id FROM staff WHERE user_id = ?', userId)) db.run('UPDATE staff SET role = ?, perms = ?, all_boxes = ?, boxes = ?, title = ?, status = ?, source = ? WHERE user_id = ?', row.role, row.perms, row.all_boxes, row.boxes, row.title, row.status, row.source, userId);
  else db.insert('staff', { user_id: userId, ...row, invited_by: invitedBy, created_at: db.now() });
  syncRole(userId);
  return get(userId);
}
function activeOwners() { return db.one("SELECT COUNT(*) n FROM staff s JOIN users u ON u.id = s.user_id WHERE s.role = 'owner' AND s.status = 'active' AND u.suspended = 0").n; }

// Can this person change that staff member? Admins manage everyone except owners.
function canManage(actor, target) {
  if (!can(actor, 'staff', 'edit')) return false;
  if (actor.role === 'owner') return true;
  return !target || target.role !== 'owner';
}

/* ---------- 2-step code ---------- */
function sendCode(req) {
  const code = String(require('node:crypto').randomInt(0, 1e6)).padStart(6, '0');
  db.run("DELETE FROM tokens WHERE user_id = ? AND kind = 'mfa'", req.user.id);
  db.insert('tokens', { user_id: req.user.id, kind: 'mfa', token_hash: sha256('mfa:' + req.session.id + ':' + code), data: JSON.stringify({ tries: 0 }), expires_at: new Date(Date.now() + 10 * 60e3).toISOString(), created_at: db.now() });
  require('./mailer').send(req.user.email, 'staff-code', { name: String(req.user.name || '').split(' ')[0] || 'there', code, ip: String(req.ip || '').slice(0, 45) });
  return code;
}
function verifyCode(req, code) {
  const t = db.one("SELECT * FROM tokens WHERE user_id = ? AND kind = 'mfa' AND used_at IS NULL ORDER BY id DESC LIMIT 1", req.user.id);
  if (!t || new Date(t.expires_at) < new Date()) throw new HttpError(400, 'That code expired. Send a new one.');
  const d = db.json(t.data, {});
  if ((d.tries || 0) >= 5) throw new HttpError(429, 'Too many wrong codes. Send a new one.');
  if (t.token_hash !== sha256('mfa:' + req.session.id + ':' + String(code || '').replace(/\D/g, ''))) {
    db.update('tokens', t.id, { data: JSON.stringify({ tries: (d.tries || 0) + 1 }) });
    throw new HttpError(400, 'That code isn’t right. Check the latest email and try again.');
  }
  db.update('tokens', t.id, { used_at: db.now() });
  db.update('sessions', req.session.id, { mfa_at: db.now() });
  req.session.mfa_at = db.now();
  return true;
}

function publicInfo(st) { return st && { role: st.role, role_name: st.role_name, title: st.title, perms: st.perms, all_boxes: st.all_boxes, boxes: st.boxes }; }

module.exports = { SECTIONS, ROLES, LEVEL, get, can, canBox, boxFilter, needStaff, guard, filterSettings, upsert, syncRole, activeOwners, canManage, cleanPerms, cleanBoxes, sendCode, verifyCode, mfaOn, setMfa, publicInfo };
