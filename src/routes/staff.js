'use strict';
// Admin staff: who am I, the emailed 2-step code, staff list, invites, roles, support boxes, and joining from an invite.
const config = require('../config');
const db = require('../db');
const auth = require('../lib/auth');
const staff = require('../services/staff');
const mailer = require('../services/mailer');
const voo = require('../services/voosquare');
const { hashPassword, verifyPassword, token, sha256 } = require('../lib/security');
const { HttpError, rateLimit } = require('../lib/http');
const { cleanMoji } = require('../lib/moji');

const str = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')) && String(e).length <= 200;
const first = n => String(n || '').trim().split(' ')[0] || 'there';
const audit = (req, action, data = {}) => db.insert('audit', { user_id: req.user.id, action, data: JSON.stringify(data), created_at: db.now() });

function staffRow(u) {
  const st = staff.get(u.id);
  const raw = db.one('SELECT * FROM staff WHERE user_id = ?', u.id) || {};
  return { user_id: u.id, name: u.name, email: u.email, voo: !!u.voo_id, role: raw.role, role_name: (staff.ROLES[raw.role] || {}).name, title: raw.title || '', status: raw.status, source: raw.source,
    perms: st ? st.perms : staff.ROLES[raw.role] ? staff.ROLES[raw.role].perms : {}, custom: db.json(raw.perms, {}), all_boxes: !!raw.all_boxes, boxes: db.json(raw.boxes, []), last_seen: raw.last_seen, created_at: raw.created_at,
    open_tickets: db.one("SELECT COUNT(*) n FROM support_tickets WHERE assignee_id = ? AND status != 'solved'", u.id).n };
}

module.exports = function (app) {
  const codeLimit = rateLimit('mfa-send', 6, 900e3);
  const verifyLimit = rateLimit('mfa-verify', 20, 900e3);

  // Who is signed in to the admin, what they can open, and whether they still need the emailed code.
  app.get('/api/admin/me', req => {
    auth.needUser(req);
    const st = staff.get(req.user.id);
    if (!st) throw new HttpError(403, 'Admins only');
    return { user: auth.publicUser(req.user), staff: staff.publicInfo(st), sections: staff.SECTIONS, mfa_required: staff.mfaOn() && !(req.session && req.session.mfa_at), voo: voo.publicInfo() };
  });

  app.post('/api/admin/mfa/send', codeLimit, req => {
    auth.needUser(req);
    if (!staff.get(req.user.id)) throw new HttpError(403, 'Admins only');
    staff.sendCode(req);
    const [a, b] = req.user.email.split('@');
    return { ok: true, sent_to: a.slice(0, 2) + '•••@' + b };
  });
  app.post('/api/admin/mfa/verify', verifyLimit, req => {
    auth.needUser(req);
    if (!staff.get(req.user.id)) throw new HttpError(403, 'Admins only');
    staff.verifyCode(req, (req.body || {}).code);
    return { ok: true };
  });

  // ---------- staff list ----------
  app.get('/api/admin/staff', req => {
    const rows = db.all('SELECT u.* FROM staff s JOIN users u ON u.id = s.user_id ORDER BY CASE s.role WHEN \'owner\' THEN 0 WHEN \'admin\' THEN 1 ELSE 2 END, s.created_at');
    return {
      staff: rows.map(staffRow), me: req.user.id, my_role: req.staff.role,
      invites: db.all('SELECT id, email, role, title, all_boxes, boxes, perms, expires_at, created_at FROM staff_invites WHERE accepted_at IS NULL AND expires_at > ? ORDER BY id DESC', db.now()).map(i => ({ ...i, boxes: db.json(i.boxes, []), perms: db.json(i.perms, {}), all_boxes: !!i.all_boxes })),
      roles: Object.entries(staff.ROLES).map(([id, r]) => ({ id, name: r.name, desc: r.desc, perms: r.perms })), sections: staff.SECTIONS,
      boxes: db.all('SELECT * FROM support_boxes ORDER BY sort, id').map(b => ({ ...b, open: db.one("SELECT COUNT(*) n FROM support_tickets WHERE box_id = ? AND status != 'solved'", b.id).n })),
      voo: voo.publicInfo(), mfa: staff.mfaOn()
    };
  });

  function checkRole(req, role) {
    if (!staff.ROLES[role]) throw new HttpError(400, 'Pick a role.');
    if (role === 'owner' && req.staff.role !== 'owner') throw new HttpError(403, 'Only owners can add another owner.');
    if (role === 'admin' && !['owner', 'admin'].includes(req.staff.role)) throw new HttpError(403, 'Only owners and admins can add an admin.');
  }
  // People who manage staff without being an owner or admin can't hand out more access than they have themselves.
  function capGrant(req, role, perms) {
    if (['owner', 'admin'].includes(req.staff.role)) return;
    const eff = { ...staff.ROLES[role].perms, ...staff.cleanPerms(perms) };
    for (const [k, v] of Object.entries(eff)) if (staff.LEVEL[v] > staff.LEVEL[req.staff.perms[k] || 'none']) throw new HttpError(403, 'You can’t give someone more access than you have (' + staff.SECTIONS[k] + ').');
  }

  app.post('/api/admin/staff/invite', rateLimit('staff-invite', 40, 3600e3), req => {
    const b = req.body || {};
    const email = str(b.email).toLowerCase();
    if (!emailOk(email)) throw new HttpError(400, 'Enter a valid email address.');
    checkRole(req, b.role);
    capGrant(req, b.role, b.perms);
    const existing = db.one('SELECT u.id FROM users u JOIN staff s ON s.user_id = u.id WHERE u.email = ? AND s.status = \'active\'', email);
    if (existing) throw new HttpError(409, 'This person is already on your staff.');
    db.run('DELETE FROM staff_invites WHERE email = ? AND accepted_at IS NULL', email);
    const raw = token(32);
    db.insert('staff_invites', { email, role: b.role, perms: JSON.stringify(staff.cleanPerms(b.perms)), all_boxes: b.all_boxes === false ? 0 : 1, boxes: JSON.stringify(staff.cleanBoxes(b.boxes)), title: str(b.title, 60), token_hash: sha256(raw), invited_by: req.user.id, expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), created_at: db.now() });
    mailer.send(email, 'staff-invite', { inviter_name: req.user.name || 'The Replyvoo team', role_name: staff.ROLES[b.role].name, join_url: config.appUrl + '/admin/join?token=' + raw });
    audit(req, 'staff.invite', { email, role: b.role });
    return { ok: true, ...(config.isProd ? {} : { join_url: '/admin/join?token=' + raw }) };
  });
  app.post('/api/admin/staff/invites/:id/resend', req => {
    const inv = db.one('SELECT * FROM staff_invites WHERE id = ? AND accepted_at IS NULL', Number(req.params.id));
    if (!inv) throw new HttpError(404, 'Invite not found');
    const raw = token(32);
    db.update('staff_invites', inv.id, { token_hash: sha256(raw), expires_at: new Date(Date.now() + 7 * 864e5).toISOString() });
    mailer.send(inv.email, 'staff-invite', { inviter_name: req.user.name || 'The Replyvoo team', role_name: (staff.ROLES[inv.role] || {}).name || 'Staff', join_url: config.appUrl + '/admin/join?token=' + raw });
    return { ok: true };
  });
  app.del('/api/admin/staff/invites/:id', req => { db.run('DELETE FROM staff_invites WHERE id = ? AND accepted_at IS NULL', Number(req.params.id)); audit(req, 'staff.invite_cancel', { id: req.params.id }); return { ok: true }; });

  app.put('/api/admin/staff/:userId', req => {
    const uid = Number(req.params.userId);
    const row = db.one('SELECT * FROM staff WHERE user_id = ?', uid);
    if (!row) throw new HttpError(404, 'Staff member not found');
    const target = { role: row.role };
    if (!staff.canManage(req.staff, target)) throw new HttpError(403, 'Only owners can change another owner.');
    const b = req.body || {};
    const role = b.role || row.role;
    if (role !== row.role) checkRole(req, role);
    if (uid === req.user.id && (role !== row.role || b.status === 'disabled' || b.perms != null || b.boxes != null || b.all_boxes != null)) throw new HttpError(400, 'You can’t change your own role or access. Ask another owner or admin.');
    capGrant(req, role, b.perms);
    if (row.role === 'owner' && (role !== 'owner' || b.status === 'disabled') && staff.activeOwners() <= 1) throw new HttpError(400, 'Keep at least one owner.');
    const st = staff.upsert(uid, { role, perms: b.perms != null ? b.perms : db.json(row.perms, {}), all_boxes: b.all_boxes != null ? !!b.all_boxes : !!row.all_boxes, boxes: b.boxes != null ? b.boxes : db.json(row.boxes, []), title: b.title != null ? b.title : row.title, status: b.status === 'disabled' ? 'disabled' : b.status === 'active' ? 'active' : row.status, source: row.source });
    if (b.status === 'disabled') db.run('DELETE FROM sessions WHERE user_id = ?', uid);
    audit(req, 'staff.update', { user_id: uid, role, status: b.status });
    return { ok: true, staff: staff.publicInfo(st) };
  });
  app.del('/api/admin/staff/:userId', req => {
    const uid = Number(req.params.userId);
    const row = db.one('SELECT * FROM staff WHERE user_id = ?', uid);
    if (!row) throw new HttpError(404, 'Staff member not found');
    if (uid === req.user.id) throw new HttpError(400, 'You can’t remove yourself.');
    if (!staff.canManage(req.staff, { role: row.role })) throw new HttpError(403, 'Only owners can remove another owner.');
    if (row.role === 'owner' && staff.activeOwners() <= 1) throw new HttpError(400, 'Keep at least one owner.');
    db.run('DELETE FROM staff WHERE user_id = ?', uid);
    staff.syncRole(uid);
    db.run('UPDATE support_tickets SET assignee_id = NULL WHERE assignee_id = ? AND status != \'solved\'', uid);
    db.run('DELETE FROM sessions WHERE user_id = ?', uid);
    audit(req, 'staff.remove', { user_id: uid });
    return { ok: true };
  });

  // ---------- support boxes ----------
  const boxBody = b => ({ name: str(b.name, 40) || 'New box', color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#FFC21A', description: str(b.description, 140), sort: Number(b.sort) || 0, active: b.active === false ? 0 : 1 });
  app.post('/api/admin/staff/boxes', req => { const id = db.insert('support_boxes', { ...boxBody(req.body || {}), created_at: db.now() }); audit(req, 'box.create', { id }); return { ok: true, id }; });
  app.put('/api/admin/staff/boxes/:id', req => { const b = db.one('SELECT * FROM support_boxes WHERE id = ?', Number(req.params.id)); if (!b) throw new HttpError(404, 'Box not found'); db.update('support_boxes', b.id, boxBody({ ...b, ...(req.body || {}), active: (req.body || {}).active === undefined ? !!b.active : (req.body || {}).active })); return { ok: true }; });
  app.del('/api/admin/staff/boxes/:id', req => {
    const id = Number(req.params.id);
    if (db.one('SELECT COUNT(*) n FROM support_boxes').n <= 1) throw new HttpError(400, 'Keep at least one box.');
    const to = db.one('SELECT id FROM support_boxes WHERE id != ? ORDER BY sort, id LIMIT 1', id);
    db.run('UPDATE support_tickets SET box_id = ? WHERE box_id = ?', to.id, id);
    db.run('DELETE FROM support_boxes WHERE id = ?', id);
    // Forget the old box everywhere, so a future box that reuses the number isn't opened up by accident.
    for (const r of db.all('SELECT user_id, boxes FROM staff')) { const bx = db.json(r.boxes, []); if (bx.includes(id)) db.run('UPDATE staff SET boxes = ? WHERE user_id = ?', JSON.stringify(bx.filter(x => x !== id)), r.user_id); }
    for (const r of db.all('SELECT id, boxes FROM staff_invites WHERE accepted_at IS NULL')) { const bx = db.json(r.boxes, []); if (bx.includes(id)) db.run('UPDATE staff_invites SET boxes = ? WHERE id = ?', JSON.stringify(bx.filter(x => x !== id)), r.id); }
    const sup = require('../services/settings').get('support');
    const routing = { ...(sup.routing || {}) }; let changed = false;
    for (const k of Object.keys(routing)) if (Number(routing[k]) === id) { routing[k] = 0; changed = true; }
    if (changed) require('../services/settings').set('support', { ...sup, routing });
    audit(req, 'box.delete', { id });
    return { ok: true, moved_to: to.id };
  });

  // ---------- joining from an invite ----------
  const findInvite = raw => {
    const inv = db.one('SELECT * FROM staff_invites WHERE token_hash = ?', sha256(String(raw || '')));
    if (!inv || inv.accepted_at || new Date(inv.expires_at) < new Date()) throw new HttpError(400, 'This invite is invalid or has expired. Ask for a new one.');
    return inv;
  };
  app.get('/api/admin/join', req => {
    const inv = findInvite(req.query.token);
    const by = inv.invited_by ? db.one('SELECT name FROM users WHERE id = ?', inv.invited_by) : null;
    return { email: inv.email, role: inv.role, role_name: (staff.ROLES[inv.role] || {}).name, title: inv.title, invited_by: by ? by.name : 'The Replyvoo team', has_account: !!db.one('SELECT id FROM users WHERE email = ?', inv.email), voo: false, voo_login: voo.enabled(), signed_in_as: req.user ? req.user.email : null };
  });
  app.post('/api/admin/join', rateLimit('staff-join', 20, 900e3), (req, res) => {
    const b = req.body || {};
    const inv = findInvite(b.token);
    let u = null;
    {
      // Replyvoo keeps its own staff login (a Voo ID login with the same email works too: the person is then logged in here).
      u = req.user && req.user.email.toLowerCase() === inv.email.toLowerCase() ? req.user : db.one('SELECT * FROM users WHERE email = ?', inv.email);
      if (u && !(req.user && req.user.id === u.id) && !verifyPassword(b.password || '', u.password_hash)) throw new HttpError(401, 'Enter the password for ' + inv.email + ' to join.');
      if (!u) {
        if (String(b.password || '').length < 10) throw new HttpError(400, 'Choose a password with at least 10 characters.');
        const id = db.insert('users', { email: inv.email, name: str(b.name, 80) || inv.email.split('@')[0], password_hash: hashPassword(b.password), email_verified: 1, moji: JSON.stringify(cleanMoji(b.moji)), created_at: db.now() });
        u = db.one('SELECT * FROM users WHERE id = ?', id);
      }
    }
    db.tx(() => {
      // Already active staff keep their current access (an old invite never demotes anyone).
      if (!staff.get(u.id)) staff.upsert(u.id, { role: inv.role, perms: db.json(inv.perms, {}), all_boxes: !!inv.all_boxes, boxes: db.json(inv.boxes, []), title: inv.title, invitedBy: inv.invited_by });
      db.update('staff_invites', inv.id, { accepted_at: db.now() });
    });
    if (!req.user || req.user.id !== u.id) auth.startSession(req, res, u);
    db.insert('audit', { user_id: u.id, action: 'staff.join', data: JSON.stringify({ role: inv.role }), created_at: db.now() });
    return { ok: true };
  });
};
