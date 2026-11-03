# Testing Replyvoo

Three levels:

1. **Automated tests** – `npm test`, every time you change code.
2. **Manual QA** – the checklist below, before each release.
3. **Production smoke test** – right after deploying, with real keys.

## 1. Automated tests

```bash
npm test
```

- Runs `node --test --test-concurrency=1 test/` (Node's built-in runner, no packages).
- Tests use their own temporary database through `build({ dbFile, scheduler: false })` from `src/server.js`, so they never touch `data/replyvoo.db`.
- Set `RV_QUIET=1` to hide the `[mail:log]` lines while testing.
- Run one file: `node --disable-warning=ExperimentalWarning --test test/<file>.js`.

When you add a feature, add a test next to the existing ones in `test/`.

## 2. Local setup for manual QA

```bash
cp .env.example .env
# in .env: NODE_ENV=development, APP_URL=http://localhost:3000, PAYMENTS_DEMO=true
npm run seed -- --demo
npm run dev
```

- Demo customer: `demo@replyvoo.com` / `demo12345` (Glow Labs, Pro plan, sample chats).
- Admin: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (or `admin@replyvoo.local` / `admin12345` if those are empty in development).
- To start fresh: stop the server, delete `data/replyvoo.db*`, seed again.
- To watch the dashboard come alive without Telegram: set `DEMO_SIMULATOR=true` (local only) and restart. Fake customers message the demo workspace every minute or so.

Test on a desktop window **and** a phone-sized window (Chrome DevTools → 390 × 844). Keep the browser console open: there should be no errors.

## 3. Manual QA checklist

### Website
- [ ] `/` loads; announcement bar, hero, live counter, all sections; no horizontal scroll on a phone.
- [ ] `/?lang=fr`, `pt`, `es`, `sw`, `ar` change the hero text (`ar` is right-to-left).
- [ ] `/pricing`: plans, monthly/yearly toggle, packs, power-ups. A plan with an active offer shows the crossed-out price.
- [ ] `/blog` and a post; `/legal` and each legal page; `/contact` form sends (check **Admin → Activity → Messages**).
- [ ] Chat bubble answers (demo answers without an AI key); "Talk to a human" saves a message.
- [ ] Channel tiles: Telegram live; WhatsApp/Instagram/TikTok/Messenger "Coming soon" and the waitlist form works.
- [ ] `/sitemap.xml`, `/robots.txt`, `/healthz`, an unknown URL shows the 404 page.
- [ ] Footer shows the trademark / non-affiliation line.

### Sign-up and account
- [ ] `/app/signup` creates an account and workspace; welcome + verify emails appear in the log (`[mail:log]`).
- [ ] Verify link marks the email verified. In `log` mode the email body (and so the link) is not printed, and tokens are stored hashed, so test this with a real email provider (a free Resend/Brevo account is fine) or on staging.
- [ ] Log out, log in, wrong password shows a clear error.
- [ ] `/app/forgot` → reset email → `/app/reset?token=…` sets a new password (needs a real email provider, same reason).
- [ ] Referral: open `/r/<code>` from another workspace's Voo Squad page, then sign up; the referrer's Squad page shows the sign-up.

### Dashboard (demo user)
- [ ] Home: stats, chart, hot leads, Closer list.
- [ ] Closers: create (template, persona sliders, skills, knowledge, pay link), pause, delete. Limit message when the plan is full.
- [ ] Agent Studio: test chat answers (demo or real AI); "[HANDOFF]" style questions ("I want a refund") trigger the handoff flag.
- [ ] Channels: Telegram connect form validates the token format; coming-soon tiles join the waitlist.
- [ ] Pulse Inbox: filters (hot, handoff, unread), search, open a chat, reply as human (AI switches off), switch AI back on, assign a different Closer.
- [ ] Leads: change stage/heat, notes, value, block.
- [ ] Live Room: events appear (use the simulator or the curl below).
- [ ] Blast: segment counts, AI draft, send now and scheduled; credits are deducted; Blast status becomes "sent" within a minute.
- [ ] Juno answers a question about today.
- [ ] Wallet: buy a credit pack with **Demo checkout** → `/pay/demo/RV-…` → Pay → back to wallet, credits added, ledger row, receipt email in the log.
- [ ] Plans: upgrade with demo checkout; coupon `WELCOME20` (first purchase, plans) and `VOO10` (packs) apply; an invalid code shows an error.
- [ ] Extra Closer slot with credits.
- [ ] Team: invite (with a real email provider), accept in a private window via the link, agent role cannot edit Closers or billing; remove member.
- [ ] Settings: profile, avatar, password change, alerts, export data.
- [ ] Joinvoo page link goes through `/go/joinvoo?from=…` (check **Admin → Activity → Clicks**).
- [ ] Workspace switcher (if the user belongs to two workspaces).

### Admin
- [ ] Overview numbers and "Setup health".
- [ ] Edit a plan price → `/pricing` changes immediately. Add an offer with an end date → countdown on the site. Pause a plan → hidden.
- [ ] Create/edit a pack, power-up and coupon.
- [ ] Homepage editor: change hero text (each language), hide a section, edit FAQ → visible on `/`.
- [ ] Channels & features: set WhatsApp to Off → tile disappears; turn `blog` off → `/blog` is 404; maintenance mode on → site shows "We'll be right back" in a private window, admin still works; turn it off again.
- [ ] Users: suspend/unsuspend, make admin; workspace editor: change plan, add credits (credits-added email), reset usage.
- [ ] Orders: a USDT order can be marked paid / cancelled.
- [ ] Blog: create a draft, publish, feature; legal page edit.
- [ ] Emails: preview every template on phone and desktop width; send a test; broadcast "Send to me first".
- [ ] Activity: clicks, waitlist (CSV export), messages, audit log.

## 4. Simulating webhooks locally

### Fake Telegram update

The seeded demo workspace has a bot channel with id `1` and a random webhook secret. Get the secret:

```bash
sqlite3 data/replyvoo.db "SELECT id, webhook_secret FROM channels WHERE type='telegram_bot';"
# no sqlite3 installed? use Node:
node --disable-warning=ExperimentalWarning -e "const{DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync('data/replyvoo.db').prepare(\"SELECT id, webhook_secret FROM channels WHERE type='telegram_bot'\").all())"
```

Send a customer message (change `update_id` to a higher number each time, otherwise it is ignored as a duplicate):

```bash
SECRET=paste-the-secret-here
curl -s -X POST http://localhost:3000/webhooks/telegram/1 \
  -H 'content-type: application/json' \
  -H "x-telegram-bot-api-secret-token: $SECRET" \
  -d '{
    "update_id": 1001,
    "message": {
      "message_id": 5, "date": 1760000000,
      "chat": { "id": 555001, "type": "private", "first_name": "Test" },
      "from": { "id": 555001, "is_bot": false, "first_name": "Test", "last_name": "Buyer", "language_code": "en" },
      "text": "How much is the vitamin C serum? Send me the payment link"
    }
  }'
# → {"ok":true}
```

Then open **Pulse Inbox**: "Test Buyer" appears with the customer message and the Closer's reply, and HeatScore shows Hot. The demo bot has no real token, so nothing is sent to Telegram; that is expected.

Checks:
- Wrong or missing secret header → `403 {"error":"Forbidden"}`.
- Same `update_id` twice → the second one is ignored.
- `"text": "/start"` → greeting from the Closer.
- `"text": "I want a refund"` → handoff: thread status "handoff", note in the chat, handoff email in the log.

Real Telegram can't reach `localhost`. To test with a real bot on your laptop, use an HTTPS tunnel (e.g. `cloudflared tunnel --url http://localhost:3000` or ngrok), set `APP_URL` to the tunnel URL, restart, then connect the bot in the dashboard.

### Payment webhooks
Paystack/Flutterwave webhooks need real signatures, so they are best tested with the providers' **test keys** and a tunnel. Quick negative checks:

```bash
curl -s -X POST http://localhost:3000/webhooks/paystack -H 'content-type: application/json' -d '{}'      # 401 Bad signature
curl -s -X POST http://localhost:3000/webhooks/flutterwave -H 'content-type: application/json' -d '{}'   # 401 Bad signature
```

Remember that fulfilment always re-checks the order with the provider's API, so a webhook alone never marks an order paid.

### API call from curl

```bash
curl -s -c jar.txt -H 'x-rv: 1' -H 'content-type: application/json' \
  -d '{"email":"demo@replyvoo.com","password":"demo12345"}' http://localhost:3000/api/auth/login
curl -s -b jar.txt http://localhost:3000/api/app/stats
```

## 5. Pre-launch smoke test on production

Do this right after deploying with real keys (takes ~20 minutes):

1. `npm run check` on the server → no `FAIL`. `PAYMENTS_DEMO off` and `DEMO_SIMULATOR off` must be OK.
2. `https://<domain>/healthz` → `{"ok":true}`. `http://` redirects to `https://`. `www.` redirects to the bare domain.
3. Open the site on a real phone. No console errors.
4. **Admin → Overview → Setup health**: AI, email, payment provider connected; demo payments **off**.
5. Sign up with a real email address you own → welcome and verify emails arrive (check spam; if they land in spam, fix SPF/DKIM/DMARC).
6. Create a bot with @BotFather, connect it in **Channels**, create a Closer with some knowledge, attach it to the bot.
7. Message the bot from your phone → a real AI answer within a few seconds; it shows in Pulse Inbox and Live Room.
8. Ask for a refund → handoff email arrives. Reply from Pulse Inbox → you receive it in Telegram.
9. Buy the cheapest credit pack with a real card (Paystack and/or Flutterwave) → order paid, credits added, receipt email. Refund it in the provider dashboard.
10. Check the provider dashboards show the webhook delivered with HTTP 200.
11. Optional: add the bot to a test group as admin with a "guard" Closer, post a link from a second account → Shield deletes it.
12. Optional: connect your personal account through Telegram Business (Premium needed) and chat from another account.
13. Delete the test bot from **Channels**. Suspend or keep the test account.
14. Run `npm run backup` once and confirm the file appears in `backups/` and in your off-server copy.
