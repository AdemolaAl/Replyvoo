'use strict';
// Replyvoo server entry point.
const path = require('node:path');
const config = require('./config');
const db = require('./db');
const { createApp } = require('./lib/http');

function build({ dbFile, scheduler = true } = {}) {
  db.open(dbFile);
  // First boot on a fresh database (e.g. a new Railway volume): load plans, blog posts, legal pages
  // and the admin from ADMIN_EMAIL / ADMIN_PASSWORD. Safe on every boot: it only adds what is missing.
  if (process.env.AUTO_SEED !== 'false' && !db.one('SELECT id FROM plans LIMIT 1')) {
    console.log('Fresh database: seeding plans, content and admin…');
    require('../scripts/seed').seed({});
  }
  // Legal pages: new pages are added and pages nobody edited in the admin get the shipped text (never an edited page).
  try { const r = require('./services/legal').syncPages(); if (r.added.length || r.updated.length) console.log('Legal pages: added ' + (r.added.join(', ') || 'none') + '; updated ' + (r.updated.join(', ') || 'none') + (r.kept.length ? '; kept admin edits: ' + r.kept.join(', ') : '')); } catch (e) { console.error('[legal] sync', e.message); }
  const auth = require('./lib/auth');
  const settings = require('./services/settings');
  settings.reset();
  const app = createApp();

  app.use(req => { auth.load(req); });
  app.use(req => { auth.csrf(req); });
  // Admin API: staff only, and each page checks the person's access level (view or edit).
  app.use(req => { require('./services/staff').guard(req); });
  // Maintenance mode: the public site and app show a notice, admins and webhooks keep working.
  app.use((req, res) => {
    if (!settings.get('flags').maintenance) return;
    if (req.user && req.user.role === 'admin') return;
    const p = req.path;
    if (p.startsWith('/admin') || p.startsWith('/api/admin') || p.startsWith('/api/auth/login') || p.startsWith('/api/auth/me') || p.startsWith('/webhooks/') || p.startsWith('/hooks/') || p.startsWith('/api/voosquare/') || p.startsWith('/auth/voosquare') || p.startsWith('/w/') || p === '/healthz' || /\.(css|js|svg|png|jpg|webp|ico|woff2)$/.test(p)) return;
    if (p.startsWith('/api/')) { res.json({ error: 'Replyvoo is getting an upgrade. We’ll be back in a few minutes.' }, 503); return; }
    res.send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back soon | Replyvoo</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#FFFFFF;color:#121110;font-family:system-ui,sans-serif;text-align:center;padding:24px"><div><div style="width:72px;height:72px;margin:0 auto 18px;border-radius:22px;background:#FFC21A"></div><h1 style="margin:0 0 8px;letter-spacing:-0.04em">We’ll be right back.</h1><p style="color:#5E5A50;margin:0">Replyvoo is getting an upgrade. Your Closers keep replying in the background.</p></div></body>', 503, 'text/html; charset=utf-8', { 'Retry-After': '600' });
  });

  // Voo Connect: an affiliate click (?ref= &vclick= &coupon=) on any page is kept in the first-party cookie voo_attr,
  // and replayed to VooSquare when the visitor continues with VooSquare. Never breaks a page.
  app.use((req, res) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || !/[?&](ref|vclick|coupon)=/.test(req.url)) return;
    try { const k = require('./lib/voo').get(); if (k) k.captureAttribution()(req, res); } catch { /* ignore */ }
  });

  app.static('/', path.join(config.root, 'public'), { maxAge: config.isProd ? 3600 : 0 });

  require('./routes/voosquare')(app);
  require('./routes/auth')(app);
  require('./routes/app')(app);
  require('./routes/staff')(app);
  require('./routes/support')(app);
  require('./routes/admin')(app);
  require('./routes/public')(app);
  require('./routes/webhooks')(app);
  require('./routes/whatsapp')(app);
  require('./routes/joinvoo')(app); // Joinvoo bridge: bots and managers' accounts that stay in Joinvoo, answered here
  require('./routes/links')(app);
  require('./routes/widget')(app);
  require('./routes/pages')(app);

  app.get('/healthz', () => ({ ok: true, time: db.now() }));

  if (scheduler) { require('./services/scheduler').start(); require('./lib/voo').start(); }
  return app;
}

if (require.main === module) {
  const app = build();
  const server = app.listen(config.port, () => {
    console.log('Replyvoo running on ' + config.appUrl + ' (port ' + config.port + ', ' + config.env + ')');
    if (!config.ai.key) console.log('  AI: demo replies (set ANTHROPIC_API_KEY for real answers)');
    if (config.mail.provider === 'log') console.log('  Email: printed to console (set MAIL_PROVIDER + MAIL_API_KEY to send)');
    if (config.pay.demo) console.log('  Payments: DEMO checkout is ON');
  });
  server.headersTimeout = 30000;
  server.requestTimeout = 60000;
  const shutdown = () => {
    console.log('Shutting down…');
    // Send the VooSquare events still queued (they are kept in the database anyway), then close.
    require('./lib/voo').stop({ timeoutMs: 5000 }).finally(() => server.close(() => { try { db.raw.close(); } catch { /* ignore */ } process.exit(0); }));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('unhandledRejection', e => console.error('[unhandled]', e));
}

module.exports = { build };
