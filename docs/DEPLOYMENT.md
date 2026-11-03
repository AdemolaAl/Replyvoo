# Deploying Replyvoo to production

Pick **one** path:

- **Path A – Ubuntu VPS** with Node 22 + systemd (or pm2) + Nginx + Let's Encrypt. Recommended. Cheapest and simplest to debug.
- **Path B – Docker / docker-compose** on any Linux server, optional Caddy for automatic HTTPS.
- **Path C – A PaaS** (Render, Railway, Fly.io) with a persistent disk.

Whatever you pick, these rules never change:

1. **One instance only.** SQLite is a single file, the rate limiter is in memory and the background jobs run in-process. Two instances = locked database and every email, Nudge and Blast sent twice.
2. **Persistent disk** for `data/` (the database). If the disk is wiped, every customer is gone.
3. **Public HTTPS** at `APP_URL`. Telegram only delivers webhooks to HTTPS URLs.
4. **Never change `APP_SECRET` after launch.** Stored bot tokens are AES-encrypted with it.

Read the whole page once before starting. Budget: about 1–2 hours for Path A including DNS and keys.

---

## 0. Before you start

You need:

- A domain (e.g. `replyvoo.com`) where you can edit DNS.
- A server: Ubuntu 22.04 or 24.04, 1 vCPU / 1 GB RAM is enough to start (2 GB recommended), 20 GB disk. Any provider (Hetzner, DigitalOcean, Vultr, AWS Lightsail…).
- Accounts and keys (you can add them later; the app runs without them in "demo" modes):
  - Anthropic API key – https://console.anthropic.com
  - Email: Resend, Brevo or Postmark API key + a verified sending domain
  - Paystack and/or Flutterwave live keys
  - Optional: OpenAI (or compatible) key for voice-note transcription

Point DNS at the server first (it takes time to spread):

| Type | Name | Value |
|---|---|---|
| A | `@` | your server's IPv4 |
| A | `www` | your server's IPv4 |
| AAAA | `@`, `www` | IPv6 (only if your server has one) |

---

## 1. Environment variables

The app reads `.env` in the project folder, then real environment variables (real environment variables win). Every variable from `.env.example`:

| Variable | Required? | Example / default | What it does |
|---|---|---|---|
| `NODE_ENV` | **Yes** | `production` | Turns on secure cookies, HSTS, production error messages, template caching. Default `development`. |
| `PORT` | No | `3000` | Port Node listens on (behind your proxy). |
| `APP_URL` | **Yes** | `https://replyvoo.com` | Public address, https, no trailing slash. Used for Telegram webhooks, payment callbacks, email links, sitemap. |
| `APP_SECRET` | **Yes** | output of `openssl rand -hex 32` | Encrypts bot tokens, signs unsubscribe links, salts IP hashes. The server refuses to start in production without it. **Never change after launch.** |
| `DATABASE_PATH` | No | `./data/replyvoo.db` | SQLite file. Relative paths are relative to the project folder. Must be on a persistent disk. |
| `ADMIN_EMAIL` | Recommended | `you@yourcompany.com` | First admin, created by `npm run seed`. |
| `ADMIN_PASSWORD` | Recommended | a strong password | Password for that admin. You can remove it from `.env` after seeding. |
| `ANTHROPIC_API_KEY` | For real AI | `sk-ant-...` | Without it, Closers give canned demo replies. |
| `AI_MODEL` | No | `claude-haiku-4-5-20251001` | Model for replies, Juno and the website chat bot. |
| `AI_PRO_MODEL` | No | `claude-sonnet-5-5` | Model for Pro Brain Closers. Check the model id exists in your Anthropic console. |
| `AI_MAX_TOKENS` | No | `400` | Max length of one AI reply. |
| `TRANSCRIBE_API_URL` | No | `https://api.openai.com/v1/audio/transcriptions` | Any OpenAI-compatible transcription endpoint. |
| `TRANSCRIBE_API_KEY` | Optional | `sk-...` | Without it, voice notes get "please type your question". |
| `TRANSCRIBE_MODEL` | No | `whisper-1` | Transcription model. |
| `MAIL_PROVIDER` | **Yes** for real email | `resend` / `brevo` / `postmark` / `log` | `log` only prints emails to the server log. |
| `MAIL_API_KEY` | With a provider | `re_...` | Provider API key (Postmark: the Server token). |
| `MAIL_FROM` | Yes | `Replyvoo <hello@replyvoo.com>` | Sender. Domain must be verified with the provider. |
| `MAIL_REPLY_TO` | No | `support@replyvoo.com` | Where replies go. |
| `PAYSTACK_SECRET_KEY` | For Paystack | `sk_live_...` | Enables Paystack at checkout and verifies webhooks. |
| `PAYSTACK_PUBLIC_KEY` | No | `pk_live_...` | Stored for future use; checkout is server-side. |
| `FLUTTERWAVE_SECRET_KEY` | For Flutterwave | `FLWSECK-...` | Enables Flutterwave at checkout. |
| `FLUTTERWAVE_WEBHOOK_HASH` | With Flutterwave | a random string you invent | Must match the "Secret hash" in the Flutterwave dashboard. |
| `PAYMENTS_DEMO` | **Must be `false`** | `false` | `true` adds a fake "Demo checkout" that gives plans and credits for free. If empty, it defaults to `true` when `NODE_ENV` is not `production`. |
| `DEMO_SIMULATOR` | **Must be `false`** | `false` | `true` injects fake chats into the demo workspace. |
| `TRUST_PROXY` | No | `true` | Read the client IP from `X-Forwarded-For`. Keep `true` behind Nginx/Caddy/a PaaS. Set `false` only if Node faces the internet directly. |

Also recommended: set the server time zone to UTC (`TZ=UTC`, already set in the provided systemd unit, pm2 file and Dockerfile). "Today" numbers on the dashboard use the server's time zone.

**Generate `APP_SECRET`:**

```bash
openssl rand -hex 32
```

> **Warning:** `APP_SECRET` encrypts every customer's Telegram bot token. If it changes, the server can no longer decrypt them: every bot stops answering and customers must reconnect their bots. Store it in a password manager. Back it up together with the database.

---

## Path A – Ubuntu VPS (Node 22 + systemd + Nginx + Let's Encrypt)

All commands run as a sudo user on the server.

### A1. System packages and Node.js 22

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install curl ca-certificates gnupg nginx certbot python3-certbot-nginx sqlite3 unzip ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
node --version     # must print v22.13.0 or newer
```

### A2. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

Port 3000 stays closed to the internet. Only Nginx talks to Node.

### A3. App user and code

```bash
sudo adduser --system --group --home /opt/replyvoo replyvoo
```

Upload the code (pick one):

```bash
# from a git repository
sudo -u replyvoo git clone <your-repo-url> /opt/replyvoo
# or from the zip the owner sent you (run on your laptop, then on the server)
scp replyvoo.zip you@SERVER_IP:/tmp/
sudo unzip /tmp/replyvoo.zip -d /tmp/rv && ls /tmp/rv       # find the folder that contains package.json
sudo cp -a /tmp/rv/replyvoo/. /opt/replyvoo/                  # adjust "replyvoo" to that folder name
```

Then:

```bash
cd /opt/replyvoo
sudo mkdir -p data backups
sudo chown -R replyvoo:replyvoo /opt/replyvoo
ls   # you should see package.json, src, public, ...
```

There is **no `npm install`** step. The app has zero dependencies.

### A4. Configure `.env`

```bash
sudo -u replyvoo cp .env.example .env
sudo -u replyvoo nano .env
sudo chmod 600 .env
```

Set at least:

```
NODE_ENV=production
APP_URL=https://replyvoo.com
APP_SECRET=<output of openssl rand -hex 32>
ADMIN_EMAIL=you@yourcompany.com
ADMIN_PASSWORD=<strong password>
PAYMENTS_DEMO=false
DEMO_SIMULATOR=false
TRUST_PROXY=true
```

Add the AI, email and payment keys now or later (restart after every `.env` change).

### A5. Create the database, content and admin

```bash
cd /opt/replyvoo
sudo -u replyvoo npm run seed
# optional, a second admin or to reset a password:
sudo -u replyvoo npm run create-admin -- owner@yourcompany.com "A-Strong-Password" "Owner Name"
sudo -u replyvoo npm run check
```

- `npm run seed` creates the tables (migrations run automatically), plans, packs, power-ups, two coupons (`WELCOME20`, `VOO10`), blog posts, legal pages and the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`. It is safe to run again.
- Do **not** use `--demo` on production.
- `npm run check` lists what is configured. `FAIL` lines must be fixed. `WARN` lines are features that stay in demo mode until you add the key. Before HTTPS works, `APP_URL` passes the check as long as it starts with `https://`.

### A6. Run it with systemd

```bash
sudo cp /opt/replyvoo/deploy/replyvoo.service /etc/systemd/system/replyvoo.service
sudo systemctl daemon-reload
sudo systemctl enable --now replyvoo
sudo systemctl status replyvoo      # should say "active (running)"
curl -s http://127.0.0.1:3000/healthz   # {"ok":true,...}
```

If you put the code somewhere other than `/opt/replyvoo`, edit `WorkingDirectory` and `ReadWritePaths` in the unit. The `data/` and `backups/` folders must exist before starting (the unit's sandbox needs them).

**Alternative: pm2** (use either systemd or pm2, not both):

```bash
sudo npm install -g pm2
sudo -u replyvoo -H pm2 start /opt/replyvoo/deploy/ecosystem.config.js
sudo -u replyvoo -H pm2 save
sudo env PATH=$PATH pm2 startup systemd -u replyvoo --hp /opt/replyvoo
sudo -u replyvoo -H pm2 install pm2-logrotate
```

pm2 must run **one instance in fork mode** (the provided file does this). Never use cluster mode.

### A7. Nginx + HTTPS

First get a certificate with a minimal HTTP-only site:

```bash
sudo tee /etc/nginx/sites-available/replyvoo >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name replyvoo.com www.replyvoo.com;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }
}
EOF
sudo ln -sf /etc/nginx/sites-available/replyvoo /etc/nginx/sites-enabled/replyvoo
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/html -d replyvoo.com -d www.replyvoo.com --agree-tos -m you@yourcompany.com --no-eff-email
```

Make sure the two files certbot's Nginx plugin normally provides exist (the full config includes them):

```bash
ls /etc/letsencrypt/options-ssl-nginx.conf /etc/letsencrypt/ssl-dhparams.pem || sudo certbot install --nginx --cert-name replyvoo.com
# if they are still missing:
# sudo curl -o /etc/letsencrypt/options-ssl-nginx.conf https://raw.githubusercontent.com/certbot/certbot/main/certbot-nginx/src/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf
# sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
```

Now install the full config (replace the domain if it is not `replyvoo.com`):

```bash
sudo cp /opt/replyvoo/deploy/nginx.conf /etc/nginx/sites-available/replyvoo
sudo sed -i 's/replyvoo\.com/YOURDOMAIN.com/g' /etc/nginx/sites-available/replyvoo   # only if your domain differs
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run      # auto-renewal is installed by the certbot package
```

The provided config: redirects HTTP → HTTPS and www → bare domain, proxies to `127.0.0.1:3000`, sets `client_max_body_size 8m`, turns Nginx gzip **off** (the app already gzips), and **overwrites** `X-Forwarded-For` with the real client IP so visitors cannot fake their IP to dodge rate limits.

> If you put Cloudflare in front of Nginx, `$remote_addr` becomes a Cloudflare IP. Configure Nginx's `real_ip` module with Cloudflare's IP ranges, or all visitors will share one rate-limit bucket.

Open `https://replyvoo.com/healthz` in a browser. Then continue with **Section 2 (connect the services)**.

---

## Path B – Docker / docker-compose

Files: `Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile`, `.dockerignore`.

- Image: `node:22-alpine`, runs as the non-root `node` user, `NODE_ENV=production`, `TZ=UTC`, health check on `/healthz`.
- The database lives on the named volume `replyvoo-data` (mounted at `/app/data`). Backups go to the volume `replyvoo-backups` (`/app/backups`).
- The app port is published only on `127.0.0.1:3000`, so put Caddy (included) or Nginx in front.

### B1. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # log out and back in
```

### B2. Configure and start

```bash
cd /opt/replyvoo            # the project folder
cp .env.example .env && nano .env      # same values as Path A step A4
```

With automatic HTTPS through Caddy (ports 80 and 443 must be free, DNS must already point here):

```bash
echo "DOMAIN=replyvoo.com" >> .env     # read by docker compose for the Caddy service
DOMAIN=replyvoo.com docker compose --profile https up -d --build
```

Or without Caddy (you provide Nginx on the host with `deploy/nginx.conf`, which proxies to `127.0.0.1:3000`):

```bash
docker compose up -d --build
```

### B3. Seed and check

```bash
docker compose exec app npm run seed
docker compose exec app npm run create-admin -- owner@yourcompany.com "A-Strong-Password" "Owner Name"   # optional
docker compose exec app npm run check
docker compose ps          # app should be "healthy"
docker compose logs -f app
```

Notes:
- The container ignores `DATABASE_PATH` from `.env`; compose forces `/app/data/replyvoo.db` on the volume.
- `.env` is never copied into the image (see `.dockerignore`); compose passes it in with `env_file`.
- Never run `docker compose down -v` on production. `-v` deletes the volumes, which means the database.
- Copy a backup out of the container: `docker compose cp app:/app/backups ./backups-copy`.

---

## Path C – PaaS (Render, Railway, Fly.io)

Works, as long as you get a **persistent disk/volume** and run **exactly one instance**. Platforms without persistent disks (e.g. Heroku, Vercel, Netlify, serverless) will **lose the database** on every deploy. Do not use them.

General settings for any platform:

| Setting | Value |
|---|---|
| Runtime | Docker (use the repo's `Dockerfile`) or Node 22 |
| Build command (Node runtime) | none (or `node --version`) |
| Start command (Node runtime) | `npm start` |
| Instances / scaling | **1**, autoscaling **off** |
| Persistent disk mount path | `/app/data` (Docker) or `/opt/render/project/src/data` style path; set `DATABASE_PATH` to a file inside it |
| Health check path | `/healthz` |
| Environment variables | everything from Section 1. `APP_URL` = your custom domain with https. |
| Zero-downtime / rolling deploys | **off** if the platform would run two copies at once against the same disk |

Platform notes (check current docs, they change):

- **Render** – create a *Web Service* from the repo, choose Docker, add a *Disk* mounted at `/app/data` (1 GB is plenty to start). Services with a disk run a single instance. Add your custom domain; Render handles HTTPS.
- **Railway** – recommended and fully prepared. Follow the step-by-step guide in `docs/RAILWAY.md`.
- **Fly.io** – `fly launch` (uses the Dockerfile, say no to databases), `fly volumes create replyvoo_data --size 1`, then in `fly.toml` add `[mounts] source = "replyvoo_data"` / `destination = "/app/data"` and `internal_port = 3000`. Keep one machine: `fly scale count 1`.

On first boot the app seeds itself (plans, packs, blog, legal pages and the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`) when the database is empty. You can still run `npm run check` from the platform's shell.

---

## 2. Connect the services

### Telegram
Nothing to configure on the server. Requirements:
- `APP_URL` is your public **https** address and works from the internet.
- When a customer pastes a @BotFather token in **Dashboard → Channels**, the app calls Telegram's `setWebhook` with `https://<domain>/webhooks/telegram/<channel id>` and a random secret. In production the connect fails with a clear message if Telegram can't reach that URL.
- If you ever change the domain, every bot's webhook still points to the old URL. Ask customers to reconnect their bot (or loop over channels and call `setWebhook` again).

Test it yourself: create a bot with @BotFather, sign up on your site, connect the bot, create a Closer, then message the bot from your phone.

### Anthropic (AI)
1. https://console.anthropic.com → create an API key → `ANTHROPIC_API_KEY`.
2. Add credit and set a **monthly spend limit** and usage alerts in the console.
3. Confirm the model ids in `AI_MODEL` / `AI_PRO_MODEL` are available to your account.
4. Restart. The admin Overview "Setup health" shows AI as connected.

### Email (Resend, Brevo or Postmark)
1. Create an account and **add your sending domain**. The provider shows DNS records: **SPF** (TXT), **DKIM** (TXT or CNAME) and often a return-path/bounce CNAME. Add them at your DNS host and wait until the provider says "verified".
2. Add a **DMARC** record, e.g. TXT `_dmarc` → `v=DMARC1; p=none; rua=mailto:dmarc@replyvoo.com`.
3. Create an API key (Postmark: a *Server API token*; Postmark uses the `outbound` message stream).
4. `.env`: `MAIL_PROVIDER=resend|brevo|postmark`, `MAIL_API_KEY=...`, `MAIL_FROM=Replyvoo <hello@replyvoo.com>` (must be on the verified domain), `MAIL_REPLY_TO=support@replyvoo.com`.
5. Restart, then **Admin → Emails → pick a template → Send test**. Check the "Email log" for errors.

### Paystack
1. Paystack dashboard → Settings → **API Keys & Webhooks**.
2. Copy the **live** secret key → `PAYSTACK_SECRET_KEY` (and public key → `PAYSTACK_PUBLIC_KEY`).
3. **Live Webhook URL**: `https://<domain>/webhooks/paystack`
4. **Live Callback URL**: `https://<domain>/pay/callback` (the app also sends a per-order callback URL, so this is a fallback).
5. In **Admin → Billing rules**, check "Paystack currency" (default NGN) and the exchange rate. Your Paystack account must support that currency.
6. Restart. Buy the cheapest credit pack with a real card, check the order turns **paid** and the credits arrive. Refund yourself in Paystack.

### Flutterwave
1. Flutterwave dashboard → Settings → **API keys** → live secret key → `FLUTTERWAVE_SECRET_KEY`.
2. Settings → **Webhooks**: URL `https://<domain>/webhooks/flutterwave`. Type a long random **Secret hash** (e.g. `openssl rand -hex 24`) and put the same value in `FLUTTERWAVE_WEBHOOK_HASH`. Enable the charge/transaction events.
3. **Admin → Billing rules** → "Flutterwave currency" (default USD).
4. Restart and test like Paystack.

### USDT (optional, manual)
**Admin → Billing rules → Crypto**: switch on, paste your wallet address and network (e.g. "USDT on TRC20"). Customers get the address and amount; you confirm each transfer in **Admin → Orders → Mark paid**.

### Voice transcription (optional)
Set `TRANSCRIBE_API_KEY` (OpenAI by default, or any OpenAI-compatible `TRANSCRIBE_API_URL`). Restart.

---

## 3. Backups

`npm run backup` makes a hot copy (`VACUUM INTO`, safe while running) to `backups/replyvoo-YYYYMMDD-HHMM.db` and keeps the newest 14.

```bash
sudo crontab -u replyvoo /opt/replyvoo/deploy/backup.cron   # replaces that user's crontab
sudo crontab -u replyvoo -l
```

Then set up an **off-server copy** (examples inside `deploy/backup.cron`: rclone to S3/Backblaze B2/Google Drive, or rsync to another server). A backup on the same disk does not survive a dead server.

Also store safely, outside the server: the `.env` file (especially `APP_SECRET`).

**Restore:**

```bash
sudo systemctl stop replyvoo
sudo -u replyvoo cp /opt/replyvoo/data/replyvoo.db /opt/replyvoo/data/replyvoo.db.broken
sudo -u replyvoo rm -f /opt/replyvoo/data/replyvoo.db-wal /opt/replyvoo/data/replyvoo.db-shm
sudo -u replyvoo cp /opt/replyvoo/backups/replyvoo-YYYYMMDD-HHMM.db /opt/replyvoo/data/replyvoo.db
sudo systemctl start replyvoo
```

Test a restore once before launch.

---

## 4. Logs and log rotation

The app logs to stdout/stderr: start-up lines, `[error]` for 5xx, `[engine]`, `[telegram]`, `[mail]`, `[job:…]`, `[paystack]`, etc. With `MAIL_PROVIDER=log` every email shows as `[mail:log]`.

| Setup | See logs | Rotation |
|---|---|---|
| systemd | `sudo journalctl -u replyvoo -f` (last hour: `--since "1 hour ago"`) | journald rotates automatically. Cap it with `SystemMaxUse=500M` in `/etc/systemd/journald.conf`, then `sudo systemctl restart systemd-journald`. |
| pm2 | `pm2 logs replyvoo` | `pm2 install pm2-logrotate` |
| Docker | `docker compose logs -f app` | compose file limits logs to 5 × 20 MB |
| Nginx | `/var/log/nginx/replyvoo.*.log` | logrotate (installed with Nginx) |

---

## 5. Monitoring

- Uptime monitor (UptimeRobot, Better Stack, etc.) on `https://<domain>/healthz` every 1–5 minutes, alert by email/Telegram. `/healthz` returns `{"ok":true}` with 200. While maintenance mode is on it returns 503 (expected).
- Check **Admin → Overview** daily for "Setup health", pending USDT orders, and **Admin → Emails → Email log** for failed sends.
- Watch disk space: `df -h` (the database and backups grow slowly).
- Anthropic console: usage and spend alerts.

---

## 6. Updating to a new version

```bash
# 1. Backup first
cd /opt/replyvoo && sudo -u replyvoo npm run backup
# 2. Get the new code
sudo -u replyvoo git pull                 # or unzip the new version over the folder, KEEPING .env, data/ and backups/
# 3. Restart (new migrations run automatically on start)
sudo systemctl restart replyvoo           # pm2: sudo -u replyvoo -H pm2 restart replyvoo
# 4. Verify
sudo journalctl -u replyvoo -n 50 --no-pager
curl -s https://<domain>/healthz
sudo -u replyvoo npm run check
```

- Migrations are SQL files in `migrations/`, applied in name order once each on start (recorded in `_migrations`). A failed migration is rolled back and the server will not start; restore the backup and fix the migration.
- If the release changed the default blog posts or legal pages and you want them: `npm run seed -- --force-content` (this **overwrites** edits made in the admin).
- `--force-pricing` resets plans/packs/power-ups to the code defaults. Don't use it on production unless you mean it.

Docker: `git pull && docker compose up -d --build` (backup first with `docker compose exec app npm run backup`).

There is a few seconds of downtime during a restart. Telegram retries webhooks, so no customer message is lost.

---

## 7. Scaling notes

One process on a 2 vCPU / 4 GB server should handle thousands of active customers. Most time is spent waiting for Claude and Telegram, not CPU. Do these first:

1. Bigger server (vertical scaling).
2. Fast SSD disk for `data/`.
3. Keep the `events` table trimmed (the hourly cleanup already removes old reply/nudge events).

Move off a single SQLite instance when you need more than one app server (high availability, or CPU saturated). That requires code changes:

- **Database** → PostgreSQL (rewrite `src/db.js` helpers and the SQL that uses SQLite functions like `json_extract`, `INSERT OR IGNORE`, `ON CONFLICT`, `substr`).
- **Rate limiter** → Redis (or the proxy's own rate limiting).
- **Scheduler** → run it in exactly one worker process (`build({ scheduler: false })` in the web processes) or use a job queue with locks.
- **Per-thread busy lock** in `engine.js` → a database or Redis lock.
- **Sessions** are already in the database, so they work across instances.
