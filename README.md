# Replyvoo

**AI Closers that answer your Telegram customers in seconds.** Made by Zedapex.

Replyvoo lets a business put AI agents ("Closers") on Telegram. A Closer answers customers in a Telegram bot, in Telegram groups, or on the owner's personal account (through Telegram Business). It qualifies leads, shares payment links, follows up, and hands the chat to a human when needed. WhatsApp is built on Meta's official WhatsApp Business Platform and goes Live once the Meta app is set up (see [docs/WHATSAPP.md](docs/WHATSAPP.md)). Instagram, TikTok and Messenger are shown as "coming soon" (see [docs/CHANNELS.md](docs/CHANNELS.md)).

This one repository is the whole product: marketing website, customer dashboard, admin panel, API, Telegram and payment webhooks, background jobs and emails.

## Features

- **Closers + Agent Studio** – six templates (Sales, Support, VIP, Group Guardian, Booking, Win-back). A 5-step **Training Coach** with animated explainers and a 30-second live training demo for beginners, and a **Pro view** for power users. Structured knowledge (Q&A with alternative phrasings, products with prices, policies, website/file import, notes), rules and guardrails (do/don't, discount limit, handoff triggers, language), docked test chat, **Fix this answer** (also in Pulse Inbox), **Gaps** from real chats, one-tap scenario tests, a 0–100 **Training Score**, drafts and version history. See [docs/AGENT_STUDIO.md](docs/AGENT_STUDIO.md).
- **Website chat** – put the Closer on any website with one line of code: Widget Studio (6 looks, colours, logo, live preview), human-like reply timing, lead capture, domain lock, Shadow DOM widget, plan-gated (Pro and up or a $29 power-up). See [docs/WEBSITE_WIDGET.md](docs/WEBSITE_WIDGET.md).
- **Staff & support desk** – invite staff with ready roles (Owner, Admin, Support, Finance, Content, Viewer), fine-tune any page, emailed 2-step login codes. A support desk with boxes, auto-assign, saved replies, AI drafts and internal notes, fed by the website chat, contact forms, a dashboard Help button, a Telegram support bot and email. See [docs/STAFF_AND_SUPPORT.md](docs/STAFF_AND_SUPPORT.md).
- **Human-like AI** – Closers remember returning customers, copy the owner's style examples, pause like someone typing, split long answers into two short messages, think carefully before refunds or angry messages, and fall back to a backup AI if Claude is down.
- **VooSquare** – "Continue with VooSquare" (Voo ID, through VooSquare's Voo Connect kit in `voo-connect/`) next to Replyvoo's own email login, account linking by verified email, the VooSquare launcher, logout everywhere, the dashboard summary card, money and activity events, and the support bridge to VooSquare HQ. Keys in Admin → Connections or env. See [docs/VOOSQUARE.md](docs/VOOSQUARE.md).
- **Telegram** – bots from @BotFather, groups (with **Shield** anti-link protection), personal accounts via **Telegram Business**.
- **WhatsApp** – Meta's Cloud API: one-tap Embedded Signup (or token under Advanced), every message type, voice transcription, reply buttons and Pay now buttons, the 24-hour window with template mode, template sync and builder, template Blasts with STOP opt-outs, delivery ticks. Meta bills template messages to the customer's own WhatsApp account. See [docs/WHATSAPP.md](docs/WHATSAPP.md).
- **Pulse Inbox** – every chat in one place, human takeover, AI on/off per chat.
- **Live Room** – watch replies happen in real time.
- **HeatScore** – leads scored cold / warm / hot / won automatically; stages new → qualified → checkout → won.
- **Nudge** – one automatic follow-up when a warm/hot lead goes quiet.
- **Blast** – broadcasts to segments (all, hot, chatted-but-never-bought, quiet, won).
- **PayLink + receipt check** – Closers share your payment link and read payment screenshots.
- **Voice & Vision** – voice notes (with a transcription key) and images.
- **Juno** – an AI assistant that answers questions about your own sales data; also Replyvoo's own website chat bubble (the same `/widget.js` customers install).
- **Pro Brain** – a smarter model per Closer.
- **Voo Wallet / Voo Credits** – prepaid credits for extra conversations, extra Closers and Blasts.
- **Plans, packs, power-ups, coupons** – all editable in the admin panel.
- **Payments** – Paystack, Flutterwave, **Bachs** (naira for Nigeria, USD for other African countries; [docs/BACHS.md](docs/BACHS.md)), Gatevoo crypto, manual USDT, a demo checkout for testing, and admin refunds/chargebacks.
- **Voo Squad** – referral programme paid in credits.
- **Night Shift Report** – daily summary email.
- **Teams** – invite teammates with owner / admin / agent roles.
- **Admin panel** – pricing, homepage text (6 languages), feature and channel switches, maintenance mode, users, orders, blog, legal pages, emails, broadcasts, activity.
- **Joinvoo** – tracked links to the sister product.
- **SEO** – server-rendered site, sitemap, robots.txt, JSON-LD, blog.

## Tech stack

- **Node.js 22.13 or newer.** No npm packages at all. Nothing to `npm install`.
- **Database:** SQLite through Node's built-in `node:sqlite` (one file, WAL mode).
- **Web server:** Node's built-in `http` module with a tiny router (`src/lib/http.js`).
- **Frontend:** hand-written HTML, CSS and vanilla JavaScript. No build step.
- **AI:** Anthropic Messages API (Claude) over `fetch`.
- **Email:** Resend, Brevo or Postmark over their HTTP APIs (or "log" mode for development).

## 5-minute local quick start

You need Node.js 22.13+ (`node --version`).

```bash
cd replyvoo
cp .env.example .env
# Open .env and change three lines:
#   NODE_ENV=development
#   APP_URL=http://localhost:3000
#   PAYMENTS_DEMO=true
npm run seed -- --demo
npm start
```

Open http://localhost:3000

| Where | Login |
|---|---|
| Customer dashboard – http://localhost:3000/app | `demo@replyvoo.com` / `demo12345` (workspace "Glow Labs", Pro plan, sample chats) |
| Admin panel – http://localhost:3000/admin | the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env` |

Tips:
- If you remove `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env` in development, the seed creates `admin@replyvoo.local` / `admin12345` instead.
- Locally: payments use the demo checkout (no real money, because `PAYMENTS_DEMO=true`), AI uses canned demo replies until you set `ANTHROPIC_API_KEY`, emails are printed to the console.
- Use `npm run dev` to auto-restart when you change server code.
- Telegram can only reach your bot over public HTTPS, so connecting a real bot needs a deployed server or a tunnel (see [docs/TESTING.md](docs/TESTING.md)).

## Folder map

```
src/
  server.js          Entry point: middleware order, routes, scheduler start
  config.js          Reads .env and environment variables
  db.js              SQLite connection, migrations runner, query helpers
  lib/               http (router, cookies, gzip, static, rate limit), auth (sessions,
                     CSRF, roles), security (passwords, AES, HMAC), md (Markdown),
                     tpl (email templates), moji (avatar settings)
  routes/            auth, app (dashboard API), admin, public, webhooks, links, pages (website)
  services/          engine (conversations), ai (Claude), telegram, payments, workspace
                     (plans/usage/credits), settings, scheduler, blast, mailer, notify,
                     catalog (templates/skills/channels), simulator (demo chats)
migrations/          SQL files, applied automatically on start, in name order
scripts/             seed, create-admin, check, backup
views/               app.html + admin.html shells, site/*.js website templates
public/              static files served at /  (css, js, img, favicon)
emails/              HTML email templates (base.html wraps every email)
content/blog/        Starter blog posts (Markdown), loaded by the seed
content/legal/       DRAFT legal pages (Markdown), loaded by the seed
deploy/              nginx.conf, Caddyfile, replyvoo.service, ecosystem.config.js, backup.cron
docs/                All documentation
test/                Automated tests (node --test)
```

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the server (production style). |
| `npm run dev` | Start with auto-restart on file changes. |
| `npm run seed` | Create plans, credit packs, power-ups, coupons, blog posts, legal pages and the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Safe to run again; keeps existing rows. |
| `npm run seed -- --demo` | Also create the demo workspace `demo@replyvoo.com` / `demo12345`. |
| `npm run seed -- --force-content` | Overwrite blog posts and legal pages with the files in `content/`. |
| `npm run seed -- --force-pricing` | Reset plans, packs and power-ups to the defaults in `scripts/seed.js`. |
| `npm run create-admin -- email "password" "Name"` | Create an admin, or make an existing user admin and reset their password. |
| `npm run check` | Pre-launch check: prints what is configured and what is missing. Exit code 1 if something blocks launch. |
| `npm run backup` | Hot backup of the database to `backups/` (keeps the newest 14). |
| `npm test` | Run the automated tests in `test/`. |

## Documentation

| Doc | For | What's inside |
|---|---|---|
| [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) | Programmer | Handover: what's done, what needs keys, first-day checklist, how to change things |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Programmer | Request flow, modules, data model, billing, AI engine, security |
| [docs/API.md](docs/API.md) | Programmer | Every endpoint |
| [docs/AGENT_STUDIO.md](docs/AGENT_STUDIO.md) | Owner + support | How training works, best practices, how to get a customer to a high Training Score |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Programmer | VPS, Docker and PaaS deployment, env vars, webhooks, backups, updates |
| [docs/RAILWAY.md](docs/RAILWAY.md) | Programmer | Step-by-step Railway deployment (recommended) |
| [docs/TESTING.md](docs/TESTING.md) | Programmer | Automated tests, manual QA, smoke test |
| [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) | Owner + programmer | Tick-box list from domain to first customer |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | Owner | How to use /admin |
| [docs/PRICING_MODEL.md](docs/PRICING_MODEL.md) | Owner | Plans, costs, margins |
| [docs/EMAILS.md](docs/EMAILS.md) | Both | Every email, when it's sent, provider setup |
| [docs/CHANNELS.md](docs/CHANNELS.md) | Both | Instagram, Messenger, TikTok roadmap |
| [docs/WHATSAPP.md](docs/WHATSAPP.md) | Both | WhatsApp: Meta app, Embedded Signup, verification, App Review, webhook, keys, testing |
| [docs/WEBSITE_WIDGET.md](docs/WEBSITE_WIDGET.md) | Both | Website chat: install on every platform, settings, security, troubleshooting |
| [HANDOVER.md](HANDOVER.md) | Programmer | **Start here:** live on Railway in 30 minutes, with a smoke test |
| [docs/STAFF_AND_SUPPORT.md](docs/STAFF_AND_SUPPORT.md) | Both | Staff roles and access, invites and 2-step login, the support desk and its channels |
| [docs/VOOSQUARE.md](docs/VOOSQUARE.md) | Programmer | VooSquare login, summary API, events, referrals, tool links, launch checklist |

## License

Private and proprietary. © Zedapex. All rights reserved.
