# Developer handover guide

Welcome. This guide is for the programmer who will deploy and maintain Replyvoo. Read it first, then [ARCHITECTURE.md](ARCHITECTURE.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## 1. What's in the pack

| Part | Status |
|---|---|
| Marketing website (home, pricing, blog, legal, contact, sitemap, 6-language hero) | Done |
| Customer dashboard `/app` (sign-up, Closers, Agent Studio, channels, inbox, leads, Live Room, Blast, Juno, wallet, plans, Voo Squad, Joinvoo, team, settings) | Done |
| Admin panel `/admin` (pricing, homepage, flags, users, orders, billing rules, blog, legal, emails, activity) | Done |
| Telegram bots, groups (Shield), Telegram Business | Done – needs public HTTPS |
| AI replies, Juno, website chat bubble | Done – demo replies until an Anthropic key is added |
| Emails (16 templates) | Done – printed to the log until an email provider is set |
| Payments: Paystack, Flutterwave, USDT (manual), demo | Done – needs live keys and webhook URLs |
| Voice-note transcription | Done – optional key |
| Background jobs (Blasts, Nudges, renewals, reports, cleanup) | Done |
| WhatsApp / Instagram / TikTok / Messenger | **Not built.** Shown as "coming soon" with a waitlist. Roadmap in [CHANNELS.md](CHANNELS.md). |
| Legal pages | **Drafts with placeholders.** Must be completed and reviewed by a lawyer. |
| Brand logos of Telegram/WhatsApp/etc. | **Generic placeholder icons.** Swap for official assets (see [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)). |

## 2. What needs real keys / accounts

| Thing | Variable(s) | Without it |
|---|---|---|
| Domain + HTTPS | `APP_URL` | Telegram webhooks can't reach you; cookies/HSTS assume HTTPS |
| Secret | `APP_SECRET` | Server refuses to start in production |
| Anthropic API key | `ANTHROPIC_API_KEY` (+ `AI_MODEL`, `AI_PRO_MODEL`) | Canned demo replies |
| Email provider (Resend, Brevo or Postmark) + verified domain | `MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO` | Emails only printed to the log (no verify, reset, invite, receipt emails reach anyone) |
| Paystack | `PAYSTACK_SECRET_KEY` (+ webhook `https://<domain>/webhooks/paystack`, callback `https://<domain>/pay/callback`) | Not offered at checkout |
| Flutterwave | `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` (+ webhook `https://<domain>/webhooks/flutterwave`) | Not offered at checkout |
| Transcription (optional) | `TRANSCRIBE_API_KEY` | Voice notes get "please type your question" |

If neither Paystack, Flutterwave nor USDT is set up and demo payments are off, checkout says "Payments are not set up yet."

## 3. First-day checklist

1. Install Node.js 22.13+ on your laptop. Unzip the pack.
2. Local run (5 minutes): see the Quick start in [README.md](../README.md). Log in as the demo user and as admin. Click through everything.
3. Run `npm test`. All tests should pass.
4. Read [ARCHITECTURE.md](ARCHITECTURE.md) sections 2 (request flow), 5 (billing) and 6 (AI engine).
5. Get a server and a domain; follow [DEPLOYMENT.md](DEPLOYMENT.md) Path A.
6. Generate `APP_SECRET` with `openssl rand -hex 32` and store it in the owner's password manager.
7. `npm run seed`, then `npm run check` on the server. Fix every `FAIL`.
8. Connect a real Telegram bot to a test account; chat with it from your phone.
9. Add the Anthropic key, email provider and payment keys; run the smoke test in [TESTING.md](TESTING.md).
10. Install the backup cron and an off-server copy. Test a restore.
11. Walk the owner through [ADMIN_GUIDE.md](ADMIN_GUIDE.md) and [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

## 4. Coding conventions

- **Zero dependencies, on purpose.** No `node_modules`, no build step, no supply-chain risk, nothing to update every week, and the app starts in milliseconds on any server with Node 22. Please keep it that way. If you really need a library, discuss it with the owner first and prefer copying a small, audited function over adding a package.
- Node built-ins only: `node:http`, `node:sqlite`, `node:crypto`, `node:zlib`, global `fetch`, `node:test`.
- CommonJS (`require`), `'use strict'` at the top of each file.
- Frontend: vanilla ES2020, no frameworks, no CDNs except Google Fonts. All icons and art are inline SVG.
- Keep functions small and readable. Comments explain *why*, not *what*.
- Errors: `throw new HttpError(status, 'A sentence a customer can read.')`. Messages are shown to users as-is, so write plain English.
- Database: use the helpers in `src/db.js` (`db.one`, `db.all`, `db.run`, `db.insert`, `db.update`, `db.tx`). Always use `?` placeholders. Never build SQL from user input.
- Every dashboard query must filter by `req.ws.id` (tenant isolation).
- Money is stored in USD (`REAL`). Local currency is computed at checkout.
- Times are ISO strings from `db.now()` (UTC).
- Copy voice: short sentences, plain English. Product words: Closer, Agent Studio, Pulse Inbox, Live Room, HeatScore, Nudge, Blast, PayLink, Shield, Juno, Voo Wallet / Voo Credits, Voo Squad, Night Shift Report, Pro Brain.

## 5. Where each feature lives

| Feature | Server | Frontend |
|---|---|---|
| Sign-up, login, reset, verify, invites | `src/routes/auth.js` | `public/js/app/auth.js` |
| Dashboard shell, navigation | – | `public/js/app.js`, `public/js/app/shell.js`, `public/js/app/core.js` |
| Home stats, Live Room, Pulse Inbox, Leads | `src/routes/app.js` (stats, live, threads, contacts) | `public/js/app/pages-main.js` |
| Closers, Channels, Blast, Juno | `src/routes/app.js`, `src/services/ai.js`, `src/services/blast.js` | `public/js/app/pages-build.js` |
| Agent Studio (Training Coach, Pro view, test chat, Fix this answer, gaps, score, versions) | `src/routes/studio.js`, `src/services/training.js`, `src/services/ai.js` (prompt + demo replies), `migrations/005_training.sql` | `public/js/app/pages-studio.js`, `public/js/train-scene.js` (coach explainers + 30-second demo, also on the homepage), `.st-*`/`.co-*` styles in `public/css/app.css`. See [AGENT_STUDIO.md](AGENT_STUDIO.md) |
| Wallet, Plans, Squad, Joinvoo, Team, Settings | `src/routes/app.js`, `src/services/payments.js` | `public/js/app/pages-money.js` |
| Illustrations, avatars, brand icons (dashboard) | – | `public/js/app/art.js` |
| Conversation engine, HeatScore, handoff | `src/services/engine.js` | – |
| Telegram updates, groups, Shield, Business | `src/routes/webhooks.js`, `src/services/telegram.js` | – |
| Conversation billing, credits, periods | `src/services/workspace.js` | – |
| Checkout, coupons, referrals, auto top-up | `src/services/payments.js`, `src/routes/links.js` (`/pay/*`, `/r/:code`) | `public/js/app/pages-money.js` |
| Background jobs | `src/services/scheduler.js` | – |
| Emails | `src/services/mailer.js`, `src/services/notify.js`, `emails/*.html` | – |
| Website pages | `src/routes/pages.js`, `views/site/*.js` | `public/js/site.js`, `public/css/site.css` |
| Replyvoo's own site chat (Juno), contact, waitlist | `src/routes/public.js`, `views/site/layout.js` (`houseWidget`) | `public/widget.js` (house mode), `public/js/site.js` |
| Website chat channel (customer widget) | `src/services/website.js`, `src/routes/widget.js` (`/w/*`), `src/routes/app.js` (`/api/app/channels/website`, upload) | `public/widget.js` (the embeddable script, Shadow DOM), `public/js/app/pages-web.js` (Widget Studio), `public/js/scene.js` (animated how-it-works scene, also used on the site) |
| Admin panel | `src/routes/admin.js` | `public/js/admin.js`, `public/js/admin/{core,catalog,site,ops}.js` |
| Settings + flags defaults | `src/services/settings.js` | – |
| Templates, skills, channel list | `src/services/catalog.js` | – |
| Default plans, packs, power-ups, coupons | `scripts/seed.js` | – |

## 6. How to change things safely

General routine:

1. Make the change locally. Run the app with `npm run dev`.
2. `npm test`.
3. Click through the affected pages on a phone-sized window too.
4. Back up production (`npm run backup`), deploy, restart, watch the logs for a few minutes.

Most business changes (prices, plans, texts, flags, coupons, blog, legal) **do not need code**: the owner does them in `/admin`.

### Add a database migration

1. Create a new file in `migrations/` with the next number: e.g. `migrations/003_add_contact_tags.sql`.
2. Write plain SQLite SQL. Only add things; don't edit old migration files (they have already run on production).
   ```sql
   -- Tags on leads, comma separated.
   ALTER TABLE contacts ADD COLUMN tags TEXT NOT NULL DEFAULT '';
   CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts(workspace_id, tags);
   ```
3. Restart the app. `src/db.js` runs every file not yet listed in `_migrations`, in name order, each inside a transaction. If it fails, it rolls back and the app refuses to start with "Migration X failed: …".
4. SQLite limits: `ALTER TABLE` can add columns but not drop/change them easily. For bigger changes, create a new table, copy data, drop the old one, rename.

### Add an email template

1. Copy an existing file in `emails/`, e.g. `emails/credits-added.html` → `emails/order-shipped.html`. File names: lowercase letters, numbers and `-`.
2. Keep the two comments at the top: `<!-- subject: … -->` and `<!-- preheader: … -->`. Both can use variables.
3. Write only the inner content; `emails/base.html` wraps it (logo, footer, unsubscribe link for broadcasts).
4. Variables: `{{name}}` (escaped), `{{{html}}}` (raw, only for trusted HTML), `{{#if x}}…{{/if}}`, `{{#unless x}}…{{/unless}}` (not nested). Always available: `app_url`, `logo_url`, `company_name`, `company_address`, `support_email`, `year`.
5. Send it from code: `require('./services/mailer').send(user.email, 'order-shipped', { name: 'Ada', ... })`. It returns a promise and never throws; failures are logged in `email_log`.
6. Add sample values for your new variables to `SAMPLE` in `src/services/mailer.js` so the admin preview looks right.
7. Check it in **Admin → Emails** (preview + send test). Details in [EMAILS.md](EMAILS.md).

### Add a website page

1. Add a template function to `views/site/misc.js` (or a new file in `views/site/`, loaded with `T('name')`). Look at `contact()` for an example. Escape every value with `esc()`.
2. Add a route in `src/routes/pages.js`:
   ```js
   app.get('/about', (req, res) => {
     const ctx = ctxFor(req);
     html(res, T('layout').page(ctx, { title: 'About | ' + ctx.s.company.product, description: '…', path: '/about', header: { solid: true }, data: { page: 'about' } }, T('misc').about(ctx)));
   });
   ```
3. Add it to the sitemap in the same file and to the footer in `views/site/layout.js` if needed.
4. Styles go in `public/css/site.css`, behaviour in `public/js/site.js` (keyed on `data.page`).

### Add a dashboard page

1. In one of `public/js/app/pages-*.js`, register `route('mypage', { … })` following the existing pages.
2. Add it to the navigation in `public/js/app/shell.js`.
3. Add the API endpoints it needs in `src/routes/app.js` with the right guard (`W` member, `M` manager).

### Add an admin setting

Settings are JSON objects stored per key and merged over defaults.

1. Add the default in `DEFAULTS` in `src/services/settings.js`, inside an existing key (e.g. `billing.max_blast_per_day: 3`). To add a new top-level key, add it to `DEFAULTS` too; `PUT /api/admin/settings/:key` accepts any key in `DEFAULTS`.
2. Read it in code: `settings.get('billing').max_blast_per_day`. Feature switch: add it to `flags.features` and check `settings.feature('name')`.
3. Add a form field in the admin panel: `public/js/admin/site.js` (homepage, channels & features, billing rules, company/SEO) using the `F.num / F.text / F.tog / F.sel` helpers bound to the same key path. Saving sends the whole object.
4. If the dashboard or website needs it, expose it in `/api/app/bootstrap` or `/api/public/site` (never send secrets).

### Change default plans

Plans live in the database and the owner edits them in **Admin → Plans**. The defaults in `scripts/seed.js` are only used on first seed (or with `--force-pricing`).

## 7. Running tests

```bash
npm test
```

This runs `node --test --test-concurrency=1 test/` with Node's built-in test runner. Tests build the app with `require('../src/server').build({ dbFile: ':memory:' or a temp file, scheduler: false })`. See [TESTING.md](TESTING.md) for the manual QA list.

## 8. Restarting and logs

| Setup | Restart | Logs |
|---|---|---|
| systemd | `sudo systemctl restart replyvoo` | `sudo journalctl -u replyvoo -f` |
| pm2 | `sudo -u replyvoo -H pm2 restart replyvoo` | `sudo -u replyvoo -H pm2 logs replyvoo` |
| Docker | `docker compose restart app` | `docker compose logs -f app` |

Restart after every `.env` change or code update. A restart takes about a second; Telegram retries webhooks, so nothing is lost.

Useful one-liners on the server:

```bash
npm run check                                   # what's configured
sqlite3 data/replyvoo.db "SELECT status, COUNT(*) FROM orders GROUP BY status;"
sqlite3 data/replyvoo.db "SELECT created_at, template, status, error FROM email_log ORDER BY id DESC LIMIT 20;"
sqlite3 data/replyvoo.db "SELECT created_at, text FROM events WHERE type='error' ORDER BY id DESC LIMIT 20;"
```

Read-only queries are safe while the app runs. Don't write to the database by hand while it runs unless you know exactly what you are doing; use the admin panel.

## 9. Known limits to be aware of

- **Website widget**: rate limits and the "seen at" throttle are in memory (single instance). `public/widget.js` is ~45 KB unminified (~12 KB gzipped); it is served as a static file with a 1-hour cache in production, so customers get updates within the hour. The widget polls for human replies (4 s while open) rather than using WebSockets. Custom fonts load from Google Fonts on the customer's site.
- Single instance only (see ARCHITECTURE §11).
- Plans are prepaid periods, not recurring card subscriptions. Customers renew manually after the reminder email.
- Admin broadcasts are sent from memory; a restart mid-broadcast stops it.
- Feature flags `studio`, `live_room`, `juno`, `wallet`, `squad` hide UI only.
- **Agent Studio**: retrieval is keyword-based (stemming + synonyms), not semantic: very different wording may miss a Q&A, which is why Q&As have "other ways people ask it". URL import needs outbound internet and only reads the HTML the server receives (pages built entirely by JavaScript import little text). Demo-mode replies are rule-based previews; real replies need `ANTHROPIC_API_KEY`. Scenario checks are simple heuristics. Gaps are recomputed on request from the last 90 days of messages (fine for normal volumes).
- The Night Shift Report is sent by email only, after 06:00 UTC (the workspace time-zone setting isn't used for it yet).
