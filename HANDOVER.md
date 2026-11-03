# Replyvoo: live on Railway in 30 minutes

This is the handover checklist for the developer. Follow it top to bottom. Every step has a time budget, and the whole run fits in 30 minutes.
The app has **no npm dependencies** and **no external database**: one Node 22 process and a SQLite file on a Railway volume.

| # | Step | Time |
| --- | --- | --- |
| 1 | Put the code on GitHub | 3 min |
| 2 | Create the Railway service and volume | 4 min |
| 3 | Paste the variables | 6 min |
| 4 | Deploy and run the checks | 5 min |
| 5 | Domain and HTTPS | 5 min |
| 6 | Payment and email webhooks | 4 min |
| 7 | Smoke test | 3 min |

## Before you start (have these ready)

- A GitHub account and a Railway account (Hobby plan or higher, so volumes are available)
- The domain (for example `replyvoo.com`) and access to its DNS
- Keys: Anthropic (`ANTHROPIC_API_KEY`, from platform.claude.com), an email provider (Resend, Brevo or Postmark), and Paystack and/or Flutterwave (Gatevoo crypto later)
- Optional: VooSquare client details (see `docs/VOOSQUARE.md`), an OpenAI key for the backup AI, and a Telegram bot token for the support bot

## 1. Code on GitHub (3 min)

```bash
unzip Replyvoo-Source-Code-*.zip && cd replyvoo
git init && git add . && git commit -m "Replyvoo"
git branch -M main
git remote add origin git@github.com:<you>/replyvoo.git
git push -u origin main
```

Keep the repository **private**. `.env` and `data/` are already in `.gitignore`.

## 2. Railway service and volume (4 min)

1. Railway → **New Project → Deploy from GitHub repo** → pick `replyvoo`. It builds the `Dockerfile` and reads `railway.json` (health check `/healthz`, 1 replica).
2. Service → **Settings → Volumes → Add volume**, mount path **`/app/data`**. Without this, every deploy wipes the database.
3. Leave **Replicas = 1**. Don't add a Postgres or Redis plugin; they aren't needed.

## 3. Variables (6 min)

Service → **Variables → Raw editor**, paste and fill in:

```
NODE_ENV=production
APP_URL=https://replyvoo.com
APP_SECRET=<run: openssl rand -hex 32>
TRUST_PROXY=true
PAYMENTS_DEMO=false
DEMO_SIMULATOR=false
ADMIN_EMAIL=owner@yourcompany.com
ADMIN_PASSWORD=<a long password>
ANTHROPIC_API_KEY=sk-ant-...
MAIL_PROVIDER=resend
MAIL_API_KEY=re_...
MAIL_FROM=Replyvoo <hello@replyvoo.com>
MAIL_REPLY_TO=support@replyvoo.com
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...
```

Optional, add when ready (everything works without them):

| Variable | What it turns on |
| --- | --- |
| `GATEVOO_API_KEY`, `GATEVOO_WEBHOOK_SECRET` | Crypto checkout (USDT TRC20 + Bitcoin) through Gatevoo. Webhook: `/webhooks/gatevoo`. See `docs/GATEVOO.md` |
| `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` | Flutterwave checkout |
| `OPENAI_API_KEY` | Backup AI if Claude has an outage |
| `TRANSCRIBE_API_KEY` | Closers understand voice notes |
| `SUPPORT_TG_BOT_TOKEN` | Replyvoo's own Telegram support bot → Support desk |
| `SUPPORT_INBOUND_KEY`, `SUPPORT_EMAIL_REPLY_TO` | Support emails → Support desk |
| `VOO_BASE`, `VOO_CLIENT_ID`, `VOO_CLIENT_SECRET`, `VOO_API_KEY`, `VOO_SIGNAL_SECRET` (or Admin → Connections) | “Continue with VooSquare”, dashboard summary, money events, Support HQ. `VOO_SERVICE_KEY` (optional) lets VooSquare sync staff. See `docs/VOOSQUARE.md` |
| `BACHS_SECRET_KEY`, `BACHS_WEBHOOK_SECRET` (or Admin → Connections) | Bachs checkout: naira in Nigeria, USD in other African countries. Webhook `/webhooks/bachs`. See `docs/BACHS.md` |

Rules that matter:

- **Never change `APP_SECRET` after launch.** It encrypts stored bot tokens.
- Don't set `PORT`; Railway sets it.
- `APP_URL` must be the final `https://` address with no trailing slash (Telegram webhooks and email links use it). Use the `*.up.railway.app` URL until the domain is ready, then change it in step 5.
- Staff 2-step codes are **on** in production and are sent by email. If email isn't set up yet, the code also appears in the Railway logs (`Your Replyvoo admin code: ######`).

## 4. Deploy and check (5 min)

1. Press **Deploy**. The log shows `Fresh database: seeding plans, content and admin…` once, then `Replyvoo running on https://…`.
2. The deploy turns green when `/healthz` answers.
3. Service → **Shell**: run `npm run check`. Fix anything marked **FAIL**; **WARN** lines are optional features.
4. Open `https://<url>/admin`, log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, enter the emailed 6-digit code. You're the **Owner**.

## 5. Domain and HTTPS (5 min)

1. Service → **Settings → Networking → Custom domain**: add `replyvoo.com` and `www.replyvoo.com`.
2. Create the DNS records Railway shows (CNAME, or an ALIAS/flattened record for the root). HTTPS is issued automatically.
3. Set `APP_URL=https://replyvoo.com` and redeploy.

## 6. Webhooks (4 min)

| Where | URL |
| --- | --- |
| Paystack → Settings → API Keys & Webhooks | `https://replyvoo.com/webhooks/paystack` |
| Flutterwave → Settings → Webhooks (secret hash = `FLUTTERWAVE_WEBHOOK_HASH`) | `https://replyvoo.com/webhooks/flutterwave` |
| Gatevoo merchant webhook (secret = `GATEVOO_WEBHOOK_SECRET`), once Gatevoo's API is live | `https://replyvoo.com/webhooks/gatevoo` |
| Email provider inbound route (optional) | `https://replyvoo.com/webhooks/support-email?key=<SUPPORT_INBOUND_KEY>` |
| Telegram support bot (optional) | Admin → Support desk → settings → **Connect** (sets it for you) |

Email provider: verify the sending domain (SPF and DKIM) so receipts and codes don't land in spam.

## 7. Smoke test (3 min)

- [ ] `https://replyvoo.com` loads, and the chat bubble answers
- [ ] **Start free** creates an account and lands in the dashboard (with VooSquare on: opens VooSquare login)
- [ ] Dashboard → Channels: connect a test Telegram bot, message it, and the Closer replies
- [ ] Dashboard → **Help**: send a question, and it appears in Admin → **Support desk**; reply, and it shows in the dashboard
- [ ] Admin → **Staff & access**: invite a teammate as Support; they join, enter their code, and see only the desk and customers
- [ ] Admin → Orders: a real ₦100 / $1 test payment marks the order paid
- [ ] Plan page: on the current paid plan, **Renew** moves the end date forward
- [ ] `npm run check` shows no FAIL

## After launch

- **Updates:** push to `main`; Railway rebuilds. Database migrations run automatically on boot (a few seconds of downtime, one replica).
- **Backups:** volume → **Backups** → turn on scheduled backups. Also `npm run backup` in the Shell.
- **Logs:** Railway → Deployments → View logs. Errors are prefixed (`[engine]`, `[mail]`, `[voosquare]`…).
- **Reset a lost admin password:** Shell → `npm run create-admin -- you@company.com "NewLongPassword" "Your Name"` (also makes them an Owner).

Further reading: `README.md` (overview), `docs/DEVELOPER_GUIDE.md`, `docs/STAFF_AND_SUPPORT.md`, `docs/VOOSQUARE.md`, `docs/API.md`, `docs/LAUNCH_CHECKLIST.md`.
