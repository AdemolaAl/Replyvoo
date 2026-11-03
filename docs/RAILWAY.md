# Deploy Replyvoo on Railway

Replyvoo is ready for Railway: it has a `Dockerfile`, a `railway.json` (health check, restart policy, 1 replica) and it seeds itself on first boot. Total time: about 15 minutes. For the timed, step-by-step handover version with a smoke test, see [`HANDOVER.md`](../HANDOVER.md).

## 1. Create the service
1. Push this folder to a **private** GitHub repo.
2. In Railway: **New Project → Deploy from GitHub repo →** pick the repo. Railway reads `railway.json` and builds the `Dockerfile`.
3. Do **not** add a database plugin. Replyvoo uses a built-in SQLite file.

## 2. Add a volume (required, or you lose all data on every deploy)
1. Open the service → **Settings → Volumes → Add volume**.
2. Mount path: **`/app/data`** (1 GB is plenty to start).
3. Keep **Replicas = 1**. SQLite, the scheduler and rate limits need a single instance.

## 3. Variables (service → Variables)
| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_SECRET` | output of `openssl rand -hex 32`. **Never change it later**: it encrypts stored bot tokens. |
| `APP_URL` | `https://replyvoo.com` (or the `*.up.railway.app` URL until the domain is ready). No trailing slash. |
| `DATABASE_PATH` | `/app/data/replyvoo.db` (already the default in the Dockerfile) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the owner's admin login (created on first boot) |
| `ANTHROPIC_API_KEY` | from console.anthropic.com |
| `MAIL_PROVIDER` / `MAIL_API_KEY` / `MAIL_FROM` | e.g. `resend`, key, `Replyvoo <hello@replyvoo.com>` |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` | live keys |
| `FLUTTERWAVE_SECRET_KEY` / `FLUTTERWAVE_WEBHOOK_HASH` | optional |
| `PAYMENTS_DEMO` | `false` |
| `DEMO_SIMULATOR` | `false` |
| `TRUST_PROXY` | `true` (Railway sits behind a proxy) |
| `VOO_BASE` / `VOO_CLIENT_ID` / `VOO_CLIENT_SECRET` / `VOO_API_KEY` / `VOO_SIGNAL_SECRET` | VooSquare (see `docs/VOOSQUARE.md`; can also be saved in Admin → Connections). Leave empty to keep Replyvoo passwords. |
| `VOO_REDIRECT_URI` | `https://replyvoo.com/auth/voosquare/callback` |
| `VOO_SERVICE_KEY` | optional: inbound key VooSquare uses to sync staff |
| `BACHS_SECRET_KEY` / `BACHS_WEBHOOK_SECRET` | Bachs checkout (or Admin → Connections; see `docs/BACHS.md`) |
| `STAFF_2FA` | leave unset: on in production. Staff get a 6-digit email code once per session. |
| `SUPPORT_TG_BOT_TOKEN` | optional: Replyvoo's own support bot from @BotFather (Admin → Support desk → settings → Connect) |
| `SUPPORT_INBOUND_KEY` / `SUPPORT_EMAIL_REPLY_TO` | optional: turns support emails into tickets (see `docs/STAFF_AND_SUPPORT.md`) |
| `OPENAI_API_KEY` | optional backup AI if Claude is down |

Do not set `PORT`: Railway sets it and the app reads it.

## 4. Deploy and check
1. Click **Deploy**. The logs should show `Fresh database: seeding…` once, then `Replyvoo running on https://…`.
2. Railway calls `/healthz`; the deploy turns green when it answers.
3. Open the service **Shell** and run `npm run check` — fix anything marked FAIL.
4. Visit `/admin`, log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## 5. Domain
Service → **Settings → Networking → Custom domain** → add `replyvoo.com` and `www`, create the DNS records Railway shows. HTTPS is automatic. Then set `APP_URL` to the final https domain and redeploy (Telegram webhooks and email links use it).

## 6. Payment webhooks
- Paystack dashboard → Settings → API Keys & Webhooks → Webhook URL: `https://replyvoo.com/webhooks/paystack`
- Flutterwave → Settings → Webhooks → URL `https://replyvoo.com/webhooks/flutterwave`, secret hash = `FLUTTERWAVE_WEBHOOK_HASH`

## 7. Backups
Railway volumes can be backed up from the volume's **Backups** tab (enable scheduled backups). You can also run `npm run backup` in the Shell; copy files off the server regularly.

## Updating
Push to the GitHub branch → Railway rebuilds and redeploys. Migrations run automatically on boot. Because there is one replica, expect a few seconds of downtime per deploy.
