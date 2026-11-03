'use strict';
// Admin panel API. Everything here needs an admin account.
const db = require('../db');
const config = require('../config');
const auth = require('../lib/auth');
const ws = require('../services/workspace');
const settings = require('../services/settings');
const mailer = require('../services/mailer');
const payments = require('../services/payments');
const md = require('../lib/md');
const { hashPassword } = require('../lib/security');
const { HttpError } = require('../lib/http');

const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const isOff = v => v === false || v === 0 || v === '0' || v === 'false';
// Dates from the admin UI: invalid input is a 400, not a crash.
const isoDate = (v, label = 'date') => { const d = new Date(v); if (isNaN(d)) throw new HttpError(400, 'That ' + label + ' is not a valid date.'); return d.toISOString(); };
const slug = v => str(v, 60).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');

function audit(req, action, data = {}) { db.insert('audit', { user_id: req.user.id, action, data: JSON.stringify(data), created_at: db.now() }); }

function planFromBody(b, existing = {}) {
  const features = Array.isArray(b.features) ? b.features.map(f => str(f, 120)).filter(Boolean).slice(0, 20) : db.json(existing.features, []);
  const offer = b.offer || {};
  return {
    name: str(b.name, 40) || existing.name || 'New plan', description: str(b.description, 160),
    price_month: Math.max(0, num(b.price_month)), price_year: Math.max(0, num(b.price_year)),
    closers: Math.max(1, int(b.closers, 1)), conversations: Math.max(0, int(b.conversations, 50)), seats: Math.max(1, int(b.seats, 1)),
    channels_text: str(b.channels_text, 80), extra_chat_price: Math.max(0, num(b.extra_chat_price)), pro_brain_chats: Math.max(0, int(b.pro_brain_chats)),
    website_sites: Math.min(9999, Math.max(0, int(b.website_sites))), remove_branding: b.remove_branding ? 1 : 0, custom_css: b.custom_css ? 1 : 0,
    features: JSON.stringify(features), badge: str(b.badge, 30), cta: str(b.cta, 30) || 'Get started',
    popular: b.popular ? 1 : 0, elite: b.elite ? 1 : 0, contact_sales: b.contact_sales ? 1 : 0, sort: int(b.sort), active: isOff(b.active) ? 0 : 1,
    offer: JSON.stringify({ label: str(offer.label, 60), percent: Math.min(90, Math.max(0, num(offer.percent))), ends_at: offer.ends_at ? isoDate(offer.ends_at, 'offer end date') : '' })
  };
}

module.exports = function (app) {
  const A = req => auth.needAdmin(req);

  app.get('/api/admin/overview', A, () => {
    const q = (sql, ...p) => db.one(sql, ...p).n;
    const now = db.now();
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const paying = db.all('SELECT w.plan_id, w.plan_interval, p.price_month, p.price_year FROM workspaces w JOIN plans p ON p.id = w.plan_id WHERE p.price_month > 0 AND w.period_end > ? AND w.status = \'active\'', now);
    const mrr = paying.reduce((s, w) => s + (w.plan_interval === 'year' ? w.price_year / 12 : w.price_month), 0);
    const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); days.push(d.toISOString().slice(0, 10)); }
    const signups = Object.fromEntries(db.all('SELECT substr(created_at,1,10) d, COUNT(*) n FROM users WHERE created_at >= ? GROUP BY d', days[0]).map(r => [r.d, r.n]));
    const revenue = Object.fromEntries(db.all('SELECT substr(paid_at,1,10) d, SUM(amount_usd) n FROM orders WHERE status = \'paid\' AND paid_at >= ? GROUP BY d', days[0]).map(r => [r.d, r.n]));
    return {
      users: q('SELECT COUNT(*) n FROM users'), workspaces: q('SELECT COUNT(*) n FROM workspaces'), paying: paying.length, mrr: Math.round(mrr * 100) / 100,
      revenue_30d: db.one('SELECT COALESCE(SUM(amount_usd),0) n FROM orders WHERE status = \'paid\' AND paid_at >= ?', since30).n,
      orders_pending: q('SELECT COUNT(*) n FROM orders WHERE status = \'pending\' AND provider = \'crypto\''),
      ai_replies_today: q('SELECT COUNT(*) n FROM messages WHERE author = \'ai\' AND created_at >= ?', t0.toISOString()),
      chats_today: q('SELECT COUNT(DISTINCT thread_id) n FROM messages WHERE dir = \'in\' AND created_at >= ?', t0.toISOString()),
      channels: q('SELECT COUNT(*) n FROM channels WHERE status = \'active\''), closers: q('SELECT COUNT(*) n FROM closers'),
      joinvoo_clicks: q('SELECT COUNT(*) n FROM clicks WHERE target = \'joinvoo\''), joinvoo_clicks_30d: q('SELECT COUNT(*) n FROM clicks WHERE target = \'joinvoo\' AND created_at >= ?', since30),
      waitlist: db.all('SELECT item, COUNT(*) n FROM waitlist GROUP BY item ORDER BY n DESC'),
      plans: db.all('SELECT plan_id, COUNT(*) n FROM workspaces GROUP BY plan_id'),
      series: days.map(d => ({ d, signups: signups[d] || 0, revenue: Math.round((revenue[d] || 0) * 100) / 100 })),
      recent_orders: db.all('SELECT o.ref, o.item_name, o.amount_usd, o.provider, o.status, o.created_at, w.name ws FROM orders o JOIN workspaces w ON w.id = o.workspace_id ORDER BY o.id DESC LIMIT 8'),
      config: { ai: !!config.ai.key, mail: config.mail.provider !== 'log' && !!config.mail.key, paystack: !!config.pay.paystackSecret, flutterwave: !!config.pay.flwSecret, demo_payments: config.pay.demo, app_url: config.appUrl, transcribe: !!config.ai.transcribeKey }
    };
  });

  // ---------- users & workspaces ----------
  app.get('/api/admin/users', A, req => {
    const q = '%' + str(req.query.q, 80) + '%';
    const page = Math.max(0, int(req.query.page));
    const rows = db.all('SELECT u.id, u.email, u.name, u.role, u.email_verified, u.suspended, u.created_at, u.last_login, w.id ws_id, w.name ws_name, w.plan_id, w.credits, w.period_end FROM users u LEFT JOIN workspaces w ON w.owner_id = u.id WHERE u.email LIKE ? OR u.name LIKE ? OR w.name LIKE ? ORDER BY u.id DESC LIMIT 50 OFFSET ?', q, q, q, page * 50);
    return { rows, total: db.one('SELECT COUNT(*) n FROM users').n };
  });
  app.put('/api/admin/users/:id', A, req => {
    const u = db.one('SELECT * FROM users WHERE id = ?', int(req.params.id));
    if (!u) throw new HttpError(404, 'User not found');
    const b = req.body || {}; const patch = {};
    // Staff accounts (including owners) can only be suspended or have their password set by someone who manages staff
    // and is allowed to manage that person; the last active owner can never be suspended.
    const staffSvc = require('../services/staff');
    const srow = db.one('SELECT role FROM staff WHERE user_id = ?', u.id);
    const target = srow ? { role: srow.role } : null;
    if (target && (b.suspended != null || b.password)) {
      if (!staffSvc.can(req.staff, 'staff', 'edit') || !staffSvc.canManage(req.staff, target)) throw new HttpError(403, 'Only someone who manages staff can change another staff member’s login. Owners can only be changed by owners.');
      if (b.suspended && target.role === 'owner' && staffSvc.activeOwners() <= 1) throw new HttpError(400, 'Keep at least one owner.');
    }
    if (b.suspended != null) { if (u.id === req.user.id) throw new HttpError(400, 'You can’t suspend yourself.'); patch.suspended = b.suspended ? 1 : 0; if (b.suspended) db.run('DELETE FROM sessions WHERE user_id = ?', u.id); }
    if (b.role && ['user', 'admin'].includes(b.role)) {
      // Kept for the quick "Admin" switch on a user: it adds or removes staff access (Staff page has the full controls).
      const staff = require('../services/staff');
      if (u.id === req.user.id && b.role !== 'admin') throw new HttpError(400, 'You can’t remove your own admin access.');
      if (!staff.can(req.staff, 'staff', 'edit')) throw new HttpError(403, 'Only people who manage staff can change admin access.');
      const cur = staff.get(u.id);
      if (!staff.canManage(req.staff, cur)) throw new HttpError(403, 'Only owners can change another owner.');
      if (b.role === 'admin' && !cur) {
        const paused = db.one('SELECT role FROM staff WHERE user_id = ?', u.id);
        if (paused && paused.role === 'owner' && req.staff.role !== 'owner') throw new HttpError(403, 'Only owners can bring back another owner.');
        staff.upsert(u.id, { role: paused ? paused.role : 'admin', invitedBy: req.user.id });
      }
      if (b.role === 'user' && cur) { if (cur.role === 'owner' && staff.activeOwners() <= 1) throw new HttpError(400, 'Keep at least one owner.'); db.run("UPDATE staff SET status = 'disabled' WHERE user_id = ?", u.id); staff.syncRole(u.id); }
    }
    if (b.email_verified != null) patch.email_verified = b.email_verified ? 1 : 0;
    if (b.password) { if (String(b.password).length < 8) throw new HttpError(400, 'Password needs 8+ characters'); patch.password_hash = hashPassword(b.password); }
    db.update('users', u.id, patch);
    audit(req, 'user.update', { id: u.id, ...b, password: b.password ? '***' : undefined });
    return { ok: true };
  });
  app.get('/api/admin/workspaces/:id', A, req => {
    const w = ws.get(int(req.params.id));
    if (!w) throw new HttpError(404, 'Workspace not found');
    return {
      workspace: { ...w, settings: { ...w.settings, paystack_auth: w.settings.paystack_auth ? 'saved' : null } }, usage: ws.usage(w),
      members: db.all('SELECT u.id, u.email, u.name, m.role FROM members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ?', w.id),
      orders: db.all('SELECT * FROM orders WHERE workspace_id = ? ORDER BY id DESC LIMIT 30', w.id),
      tx: db.all('SELECT * FROM credit_tx WHERE workspace_id = ? ORDER BY id DESC LIMIT 30', w.id),
      channels: db.all('SELECT id, type, name, username, status FROM channels WHERE workspace_id = ?', w.id),
      closers: db.all('SELECT id, name, template, active, replies FROM closers WHERE workspace_id = ?', w.id),
      referred: db.one('SELECT COUNT(*) n FROM workspaces WHERE referred_by = ?', w.id).n
    };
  });
  app.put('/api/admin/workspaces/:id', A, req => {
    const w = ws.get(int(req.params.id));
    if (!w) throw new HttpError(404, 'Workspace not found');
    const b = req.body || {}; const patch = {};
    if (b.plan_id) { if (!db.one('SELECT id FROM plans WHERE id = ?', b.plan_id)) throw new HttpError(400, 'Unknown plan'); patch.plan_id = b.plan_id; }
    if (b.plan_interval && ['month', 'year'].includes(b.plan_interval)) patch.plan_interval = b.plan_interval;
    if (b.period_end) patch.period_end = isoDate(b.period_end, 'period end');
    if (b.status && ['active', 'suspended'].includes(b.status)) patch.status = b.status;
    if (b.extra_closer_slots != null) patch.extra_closer_slots = Math.max(0, int(b.extra_closer_slots));
    if (b.extra_seats != null) patch.extra_seats = Math.max(0, int(b.extra_seats));
    if (b.reset_usage) { patch.conv_used = 0; patch.pro_used = 0; }
    db.update('workspaces', w.id, patch);
    if (int(b.credits_delta)) {
      const bal = ws.addCredits(w.id, int(b.credits_delta), str(b.credits_reason, 120) || 'Adjusted by Replyvoo team', 'admin:' + req.user.id);
      const o = ws.owner(w.id);
      if (int(b.credits_delta) > 0 && o && b.notify !== false) mailer.send(o.email, 'credits-added', { name: String(o.name || '').split(' ')[0] || 'there', credits: int(b.credits_delta).toLocaleString('en-US'), balance: bal.toLocaleString('en-US'), wallet_url: config.appUrl + '/app/wallet' });
    }
    audit(req, 'workspace.update', { id: w.id, ...b });
    return { ok: true };
  });

  // ---------- plans, packs, add-ons, coupons ----------
  app.get('/api/admin/plans', A, () => db.all('SELECT * FROM plans ORDER BY sort, price_month').map(p => ({ ...p, features: db.json(p.features, []), offer: db.json(p.offer, {}), subscribers: db.one('SELECT COUNT(*) n FROM workspaces WHERE plan_id = ?', p.id).n })));
  app.post('/api/admin/plans', A, req => {
    const id = slug((req.body || {}).id || (req.body || {}).name);
    if (!id) throw new HttpError(400, 'Give the plan a name.');
    if (db.one('SELECT id FROM plans WHERE id = ?', id)) throw new HttpError(409, 'A plan with this id already exists.');
    const data = planFromBody(req.body || {});
    if ((req.body || {}).sort == null) data.sort = (db.one('SELECT MAX(sort) m FROM plans').m || 0) + 1;
    db.insert('plans', { id, ...data, created_at: db.now() });
    audit(req, 'plan.create', { id });
    return { ok: true, id };
  });
  app.put('/api/admin/plans/:id', A, req => {
    const p = db.one('SELECT * FROM plans WHERE id = ?', req.params.id);
    if (!p) throw new HttpError(404, 'Plan not found');
    const data = planFromBody({ ...p, features: db.json(p.features, []), offer: db.json(p.offer, {}), ...(req.body || {}) }, p);
    if (!data.active && p.id === settings.get('billing').free_plan_id) throw new HttpError(400, 'The free plan can’t be paused. Choose another free plan in Billing settings first.');
    db.update('plans', p.id, data);
    audit(req, 'plan.update', { id: p.id });
    return { ok: true };
  });
  app.del('/api/admin/plans/:id', A, req => {
    const n = db.one('SELECT COUNT(*) n FROM workspaces WHERE plan_id = ?', req.params.id).n;
    if (n) throw new HttpError(400, n + ' workspace(s) are on this plan. Pause it instead of deleting.');
    if (req.params.id === settings.get('billing').free_plan_id) throw new HttpError(400, 'You can’t delete the free plan.');
    db.run('DELETE FROM plans WHERE id = ?', req.params.id);
    audit(req, 'plan.delete', { id: req.params.id });
    return { ok: true };
  });

  app.get('/api/admin/packs', A, () => db.all('SELECT * FROM packs ORDER BY sort, price'));
  app.post('/api/admin/packs', A, req => { const b = req.body || {}; const id = db.insert('packs', { credits: Math.max(1, int(b.credits)), bonus: Math.max(0, int(b.bonus)), price: Math.max(0.5, num(b.price)), label: str(b.label, 40), sort: int(b.sort), active: isOff(b.active) ? 0 : 1 }); audit(req, 'pack.create', { id }); return { ok: true, id }; });
  app.put('/api/admin/packs/:id', A, req => { const b = req.body || {}; db.update('packs', int(req.params.id), { credits: Math.max(1, int(b.credits)), bonus: Math.max(0, int(b.bonus)), price: Math.max(0.5, num(b.price)), label: str(b.label, 40), sort: int(b.sort), active: isOff(b.active) ? 0 : 1 }); audit(req, 'pack.update', { id: req.params.id }); return { ok: true }; });
  app.del('/api/admin/packs/:id', A, req => { db.run('DELETE FROM packs WHERE id = ?', int(req.params.id)); audit(req, 'pack.delete', { id: req.params.id }); return { ok: true }; });

  app.get('/api/admin/addons', A, () => db.all('SELECT * FROM addons ORDER BY sort'));
  app.post('/api/admin/addons', A, req => { const b = req.body || {}; const s = slug(b.slug || b.name); if (!s) throw new HttpError(400, 'Name required'); if (db.one('SELECT id FROM addons WHERE slug = ?', s)) throw new HttpError(409, 'That add-on already exists'); db.insert('addons', { slug: s, name: str(b.name, 60), description: str(b.description, 200), price_text: str(b.price_text, 60), price: Math.max(0, num(b.price)), credits: Math.max(0, int(b.credits)), status: ['live', 'soon', 'off'].includes(b.status) ? b.status : 'live', sort: int(b.sort), active: isOff(b.active) ? 0 : 1 }); audit(req, 'addon.create', { s }); return { ok: true }; });
  app.put('/api/admin/addons/:id', A, req => { const b = req.body || {}; db.update('addons', int(req.params.id), { name: str(b.name, 60), description: str(b.description, 200), price_text: str(b.price_text, 60), price: Math.max(0, num(b.price)), credits: Math.max(0, int(b.credits)), status: ['live', 'soon', 'off'].includes(b.status) ? b.status : 'live', sort: int(b.sort), active: isOff(b.active) ? 0 : 1 }); audit(req, 'addon.update', { id: req.params.id }); return { ok: true }; });
  app.del('/api/admin/addons/:id', A, req => { db.run('DELETE FROM addons WHERE id = ?', int(req.params.id)); return { ok: true }; });

  app.get('/api/admin/coupons', A, () => db.all('SELECT * FROM coupons ORDER BY id DESC').map(c => ({ ...c, plan_ids: db.json(c.plan_ids, []) })));
  function couponBody(b) {
    const code = str(b.code, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (code.length < 3) throw new HttpError(400, 'Coupon codes need at least 3 letters or numbers.');
    const kind = b.kind === 'fixed' ? 'fixed' : 'percent';
    const value = Math.max(0, num(b.value));
    if (!value) throw new HttpError(400, 'Enter a discount value.');
    if (kind === 'percent' && value > 100) throw new HttpError(400, 'A percent discount can’t be more than 100.');
    return { code, description: str(b.description, 120), kind, value, applies_to: ['all', 'plan', 'pack'].includes(b.applies_to) ? b.applies_to : 'all', plan_ids: JSON.stringify(Array.isArray(b.plan_ids) ? b.plan_ids.map(String) : []), max_uses: Math.max(0, int(b.max_uses)), first_purchase_only: b.first_purchase_only ? 1 : 0, expires_at: b.expires_at ? isoDate(b.expires_at, 'expiry date') : null, active: isOff(b.active) ? 0 : 1 };
  }
  app.post('/api/admin/coupons', A, req => { const c = couponBody(req.body || {}); if (db.one('SELECT id FROM coupons WHERE code = ? COLLATE NOCASE', c.code)) throw new HttpError(409, 'That code already exists.'); const id = db.insert('coupons', { ...c, created_at: db.now() }); audit(req, 'coupon.create', { code: c.code }); return { ok: true, id }; });
  app.put('/api/admin/coupons/:id', A, req => { const c = couponBody(req.body || {}); const dup = db.one('SELECT id FROM coupons WHERE code = ? COLLATE NOCASE AND id != ?', c.code, int(req.params.id)); if (dup) throw new HttpError(409, 'That code already exists.'); db.update('coupons', int(req.params.id), c); audit(req, 'coupon.update', { id: req.params.id }); return { ok: true }; });
  app.del('/api/admin/coupons/:id', A, req => { db.run('DELETE FROM coupons WHERE id = ?', int(req.params.id)); audit(req, 'coupon.delete', { id: req.params.id }); return { ok: true }; });

  // ---------- settings (homepage, flags, billing, company, seo, joinvoo) ----------
  app.get('/api/admin/settings', A, req => require('../services/staff').filterSettings(req.staff, { ...settings.all(), flags: settings.raw('flags') }));
  app.put('/api/admin/settings/:key', A, req => {
    const key = req.params.key;
    if (!settings.KEYS.includes(key)) throw new HttpError(404, 'Unknown setting');
    const value = (req.body || {}).value;
    if (!value || typeof value !== 'object') throw new HttpError(400, 'Send { value: {...} }');
    if (key === 'billing' && value.free_plan_id && !db.one('SELECT id FROM plans WHERE id = ? AND price_month = 0', value.free_plan_id)) throw new HttpError(400, 'The free plan must be an existing plan with a $0 price.');
    if (JSON.stringify(value).length > 200000) throw new HttpError(400, 'That setting is too large.');
    if (key === 'billing' && value.method_fees !== undefined) {
      // Customer fee per payment method, in percent (0 to 50). Gatevoo is always 0.
      if (!value.method_fees || typeof value.method_fees !== 'object' || Array.isArray(value.method_fees)) throw new HttpError(400, 'Payment method fees must be a list of percentages.');
      const fees = {};
      for (const [m, v] of Object.entries(value.method_fees)) {
        if (!/^[a-z_]{2,30}$/.test(m)) throw new HttpError(400, 'Unknown payment method.');
        const n = v === null || v === '' ? 0 : Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 50) throw new HttpError(400, 'A payment method fee must be between 0% and 50%.');
        fees[m] = Math.round(n * 100) / 100;
      }
      fees.gatevoo = 0;
      value.method_fees = fees;
    }
    // The public Telegram support link is set by connecting the bot (owners and admins), not typed in by agents.
    if (key === 'support' && !['owner', 'admin'].includes(req.staff.role)) value.tg_username = settings.get('support').tg_username;
    const saved = settings.set(key, value);
    audit(req, 'settings.' + key, {});
    return key === 'flags' ? settings.raw('flags') : saved;
  });

  // ---------- blog posts & pages ----------
  app.get('/api/admin/posts', A, () => db.all('SELECT id, slug, title, category, status, featured, published_at, updated_at FROM posts ORDER BY published_at DESC'));
  app.get('/api/admin/posts/:id', A, req => { const p = db.one('SELECT * FROM posts WHERE id = ?', int(req.params.id)); if (!p) throw new HttpError(404, 'Post not found'); return p; });
  function postBody(b) {
    const s = slug(b.slug || b.title);
    if (!s) throw new HttpError(400, 'Add a title.');
    return { slug: s, title: str(b.title, 140), description: str(b.description, 300), category: str(b.category, 30) || 'Product', cover: str(b.cover, 30) || 'rocket', keywords: str(b.keywords, 300), read_time: str(b.read_time, 20) || Math.max(2, Math.round(md.plain(b.body_md || '').split(' ').length / 220)) + ' min', body_md: String(b.body_md || '').slice(0, 200000), featured: b.featured ? 1 : 0, status: b.status === 'draft' ? 'draft' : 'published', published_at: b.published_at ? isoDate(b.published_at, 'publish date') : db.now(), updated_at: db.now() };
  }
  app.post('/api/admin/posts', A, req => { const p = postBody(req.body || {}); if (db.one('SELECT id FROM posts WHERE slug = ?', p.slug)) throw new HttpError(409, 'A post with this link already exists.'); if (p.featured) db.run('UPDATE posts SET featured = 0'); const id = db.insert('posts', p); audit(req, 'post.create', { slug: p.slug }); return { ok: true, id }; });
  app.put('/api/admin/posts/:id', A, req => { const p = postBody(req.body || {}); if (db.one('SELECT id FROM posts WHERE slug = ? AND id != ?', p.slug, int(req.params.id))) throw new HttpError(409, 'Another post uses this link.'); if (p.featured) db.run('UPDATE posts SET featured = 0'); db.update('posts', int(req.params.id), p); audit(req, 'post.update', { id: req.params.id }); return { ok: true }; });
  app.del('/api/admin/posts/:id', A, req => { db.run('DELETE FROM posts WHERE id = ?', int(req.params.id)); audit(req, 'post.delete', { id: req.params.id }); return { ok: true }; });
  app.post('/api/admin/preview-md', A, req => ({ html: md.render(String((req.body || {}).md || '')).html }));

  app.get('/api/admin/pages', A, () => db.all('SELECT slug, title, description, updated_at FROM pages ORDER BY slug'));
  app.get('/api/admin/pages/:slug', A, req => db.one('SELECT * FROM pages WHERE slug = ?', req.params.slug) || (() => { throw new HttpError(404, 'Page not found'); })());
  app.put('/api/admin/pages/:slug', A, req => { const b = req.body || {}; const s = slug(req.params.slug); db.run('INSERT INTO pages (slug, title, description, body_md, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET title = excluded.title, description = excluded.description, body_md = excluded.body_md, updated_at = excluded.updated_at', s, str(b.title, 140), str(b.description, 300), String(b.body_md || '').slice(0, 200000), db.now()); audit(req, 'page.update', { slug: s }); return { ok: true }; });

  // ---------- orders ----------
  // Joinvoo bridge: plans and packs paid with Joinvoo credits, per month (settlement between the two apps).
  app.get('/api/admin/joinvoo/settlement', A, () => ({ months: require('../services/joinvoo').settlement() }));
  app.get('/api/admin/orders', A, req => {
    const st = str(req.query.status, 20);
    const gatevoo = require('../services/gatevoo');
    return db.all('SELECT o.*, w.name ws_name, u.email FROM orders o JOIN workspaces w ON w.id = o.workspace_id LEFT JOIN users u ON u.id = o.user_id ' + (st ? 'WHERE o.status = ? ' : '') + 'ORDER BY o.id DESC LIMIT 200', ...(st ? [st] : []))
      .map(o => { const m = db.json(o.meta, {}); if (o.provider === 'gatevoo') o.gatevoo = { coin: m.coin && gatevoo.COINS[m.coin] ? gatevoo.COINS[m.coin].label : null, network: m.coin && gatevoo.COINS[m.coin] ? gatevoo.COINS[m.coin].network : null, tx_hash: m.tx_hash || null, tx_url: m.tx_url || gatevoo.txUrl(m.coin, m.tx_hash), paid_amount: m.paid_amount || null, paid_usd: m.paid_usd != null ? m.paid_usd : null, underpaid: !!m.underpaid, sandbox: /^sandbox_/.test(m.tx_hash || '') || /^gv_sbx_/.test(o.provider_ref || '') }; return o; });
  });
  app.post('/api/admin/orders/:ref/mark-paid', A, req => { const ok = payments.fulfill(req.params.ref, { via: 'admin:' + req.user.id, provider_ref: str((req.body || {}).note, 120) }); audit(req, 'order.mark_paid', { ref: req.params.ref }); return { ok }; });
  // Gatevoo orders: ask Gatevoo for the latest state (the webhook normally does this on its own).
  app.post('/api/admin/orders/:ref/check', A, async req => {
    const o = db.one('SELECT * FROM orders WHERE ref = ?', str(req.params.ref, 60));
    if (!o) throw new HttpError(404, 'Order not found');
    const r = await payments.verify(o.ref);
    audit(req, 'order.check', { ref: o.ref });
    return { ok: !!r.ok, reason: r.reason || '', status: db.one('SELECT status FROM orders WHERE id = ?', o.id).status };
  });
  // Refunds and chargebacks (finance): what was bought is taken back; VooSquare is told.
  app.post('/api/admin/orders/:ref/refund', A, req => { const b = req.body || {}; const r = payments.reverse(req.params.ref, 'refund', { by: req.user.id, amountUsd: b.amount_usd, note: str(b.note, 200) }); audit(req, 'order.refund', { ref: req.params.ref }); return r; });
  app.post('/api/admin/orders/:ref/chargeback', A, req => { const b = req.body || {}; const r = payments.reverse(req.params.ref, 'chargeback', { by: req.user.id, amountUsd: b.amount_usd, note: str(b.note, 200) }); audit(req, 'order.chargeback', { ref: req.params.ref }); return r; });

  // Connections (owners only: not in the staff ROUTES map): VooSquare and Bachs keys. Secrets are never sent back.
  app.get('/api/admin/connections', A, () => ({ voosquare: require('../services/voosquare').status(), bachs: require('../services/bachs').publicInfo(), whatsapp: require('../services/whatsapp').publicInfo(), whatsapp_rates: require('../services/whatsapp').rates() }));
  app.put('/api/admin/connections/voosquare', A, req => {
    let out; try { out = require('../lib/voo').saveSettings(req.body || {}); } catch (e) { throw new HttpError(e.status || 400, e.message); }
    audit(req, 'connections.voosquare', { enabled: out.enabled, login: out.login, events: out.events });
    return { ok: true, voosquare: require('../services/voosquare').status() };
  });
  app.post('/api/admin/connections/voosquare/test', A, () => require('../services/voosquare').ping());
  app.put('/api/admin/connections/bachs', A, req => { const r = require('../services/bachs').save(req.body || {}); audit(req, 'connections.bachs', r.audit); return { ok: true, bachs: r.info }; });
  app.get('/api/admin/bachs/subscriptions', A, () => ({ enabled: require('../services/bachs-subs').enabled(), unavailable: require('../services/bachs-subs').state().unavailable || null, subscriptions: require('../services/bachs-subs').adminList(),
    flagged: db.all("SELECT ref, workspace_id, amount_local, currency, meta, paid_at FROM orders WHERE provider = 'bachs' AND json_valid(meta) AND json_extract(meta, '$.review_flag') IS NOT NULL ORDER BY id DESC LIMIT 50").map(o => ({ ref: o.ref, workspace_id: o.workspace_id, amount_local: o.amount_local, currency: o.currency, paid_at: o.paid_at, flag: db.json(o.meta, {}).review_flag })) }));
  app.post('/api/admin/connections/bachs/test', A, () => require('../services/bachs').testKey());
  // WhatsApp (Meta Cloud API): app keys, the on/off switch and Meta's rate table for Blast estimates. Owners only.
  app.get('/api/admin/connections/whatsapp', A, () => ({ whatsapp: require('../services/whatsapp').publicInfo(), rates: require('../services/whatsapp').rates() }));
  app.put('/api/admin/connections/whatsapp', A, req => { const r = require('../services/whatsapp').save(req.body || {}); audit(req, 'connections.whatsapp', r.audit); return { ok: true, whatsapp: r.info }; });
  app.post('/api/admin/connections/whatsapp/test', A, () => require('../services/whatsapp').testApp());
  app.put('/api/admin/connections/whatsapp/rates', A, req => { const r = require('../services/whatsapp').saveRates(req.body || {}); audit(req, 'connections.whatsapp_rates', { rows: r.rows.length, checked: !r.estimate }); return { ok: true, rates: r }; });
  app.get('/api/admin/gatevoo', A, () => require('../services/gatevoo').status());
  app.post('/api/admin/gatevoo/test', A, () => require('../services/gatevoo').ping());
  app.post('/api/admin/orders/:ref/cancel', A, req => { db.run('UPDATE orders SET status = \'cancelled\' WHERE ref = ? AND status = \'pending\'', req.params.ref); audit(req, 'order.cancel', { ref: req.params.ref }); return { ok: true }; });

  // ---------- emails ----------
  app.get('/api/admin/emails', A, () => ({ templates: mailer.list(), log: db.all('SELECT * FROM email_log ORDER BY id DESC LIMIT 100'), provider: config.mail.provider }));
  const tplOk = name => { if (!mailer.list().some(t => t.name === name)) throw new HttpError(404, 'Email template not found'); };
  app.get('/api/admin/emails/:name/preview', A, (req, res) => { tplOk(req.params.name); const m = mailer.build(req.params.name, mailer.SAMPLE); res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:"); res.send(m.html); });
  app.post('/api/admin/emails/:name/test', A, async req => { tplOk(req.params.name); const to = str((req.body || {}).to, 200) || req.user.email; const ok = await mailer.send(to, req.params.name, mailer.SAMPLE); return { ok, to, note: config.mail.provider === 'log' ? 'MAIL_PROVIDER is "log", so the email was printed to the server console instead of sent.' : '' }; });
  app.post('/api/admin/broadcast', A, req => {
    const b = req.body || {};
    const subject = str(b.subject, 140); const body = String(b.body_md || '');
    if (!subject || body.length < 5) throw new HttpError(400, 'Add a subject and a message.');
    const aud = b.audience;
    const sql = aud === 'paying' ? 'SELECT DISTINCT u.email, u.name FROM users u JOIN workspaces w ON w.owner_id = u.id JOIN plans p ON p.id = w.plan_id WHERE p.price_month > 0 AND u.suspended = 0 AND u.marketing_opt_out = 0' :
      aud === 'free' ? 'SELECT DISTINCT u.email, u.name FROM users u JOIN workspaces w ON w.owner_id = u.id JOIN plans p ON p.id = w.plan_id WHERE p.price_month = 0 AND u.suspended = 0 AND u.marketing_opt_out = 0' :
      aud === 'test' ? 'SELECT email, name FROM users WHERE id = ' + Number(req.user.id) : 'SELECT email, name FROM users WHERE suspended = 0 AND marketing_opt_out = 0';
    const list = db.all(sql);
    const html = md.render(body).html;
    const { hmac } = require('../lib/security');
    (async () => { for (const u of list) { await mailer.send(u.email, 'blank', { subject, body_html: html, name: u.name, unsubscribe_url: config.appUrl + '/unsubscribe?e=' + encodeURIComponent(u.email) + '&t=' + hmac('unsub:' + u.email.toLowerCase()).slice(0, 32) }); await new Promise(r => setTimeout(r, 150)); } })();
    audit(req, 'broadcast', { subject, audience: aud, count: list.length });
    return { ok: true, count: list.length };
  });

  // ---------- misc lists ----------
  app.get('/api/admin/activity', A, () => ({
    clicks: db.all('SELECT target, source, COUNT(*) n FROM clicks GROUP BY target, source ORDER BY n DESC'),
    waitlist: db.all('SELECT wl.item, wl.email, wl.created_at, w.name ws FROM waitlist wl LEFT JOIN workspaces w ON w.id = wl.workspace_id ORDER BY wl.id DESC LIMIT 200'),
    contact: db.all('SELECT * FROM contact_messages ORDER BY id DESC LIMIT 100'),
    audit: db.all('SELECT a.*, u.email FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 100')
  }));
};
