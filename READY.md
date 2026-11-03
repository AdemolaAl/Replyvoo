# Replyvoo: ready-for-customers report (for the developer)

Code: `/root/r25/replyvoo/replyvoo-main` (zero-dependency Node 22, `node:sqlite`). Date: 3 November 2026.

## Verdict

**Ready to launch once the owner hands over the live keys listed below.** The code is complete and tested: sign-up,
onboarding, Telegram connection screens, Agent Studio, checkout, admin, VooSquare login and Bachs naira payments all work.
Results: `npm test` **292/292 pass**; `npm run check` has **no blocking problems** (in development and with production
variables); a real-browser run against a local copy of the patched VooSquare passed **16/16**; VooSquare's own
`voo-connect/check.js` passed **12/12**.

It is **not live-proven** in three places, because those need real accounts:
1. A real Telegram bot, which needs the deployed https address.
2. A real Bachs payment. The Bachs request and answer formats copy Castvoo's Bachs code and have never been tried against Bachs's live API.
3. The live VooSquare product credentials.

## What changed

### 1. Bugs and blockers fixed (found in the audit)
- **Made-up live counter.** The homepage said "2,418 replies sent by Closers in the last hour" and added random numbers every second. It now shows the **real** count of Closer replies in the last hour, and only once it reaches the minimum set in Admin → Homepage → Live counter (default 50). Below that, it is hidden.
- **Pulsing and blinking dots.** Every pulsing ring and ripple (live dots, help dot, staff online dot, urgent tickets, the "now" step on the Gatevoo page, the training scene) is now static. Nothing was redesigned.
- **Dashboard "Last 14 days" chart.** On a server that is not on UTC, the chart dropped today, so it showed "0 chats" next to "Chats today: 10". It now counts by UTC day.
- **Gatevoo address.** The default API address was `api.gatevoo.com`, which does not exist, so every crypto checkout failed. It is now `https://gatevoo.com/api/v1` (Spyvoo had already fixed the same bug).
- **Empty `.env.example`.** It was 0 bytes, although the README says to copy it. It now lists every variable. The `.env` reader also accepts `KEY=value  # comment` lines now.
- **`/pay/callback`.** It now only asks the payment provider about pending orders less than a day old, and it is rate-limited.
- **Refunds and chargebacks did not exist.** They are new in Admin → Orders: what was bought is taken back, a chargeback also reverses the Voo Squad reward, and VooSquare is told.
- **No customer country.** Password sign-ups never stored a country, so payment methods could not follow it. The country now comes from the hosting edge's country header at sign-up, from VooSquare, or from a new **Settings → Country** field.
- **Voo-ID accounts had no password and could not set one.** They can now set one in Settings.
- **`npm run check`** used to exit with failure on every developer machine. The APP_SECRET and APP_URL checks are now warnings outside production and still blocking in production. Settings saved in the admin are also checked now.
- Maintenance mode no longer blocks VooSquare's server calls, the support webhook or the login callback.

### 2. VooSquare (Voo ID) on the Voo Connect kit
The old code was a generic OpenID integration (RS256 signing keys, discovery). It did not match VooSquare, and it **switched off Replyvoo's own login**. It has been replaced with VooSquare's kit, copied unchanged into `voo-connect/` (version 1.1.0), the same way Spyvoo and Castvoo do it.
- **Login.** "Continue with VooSquare" now sits next to the email login and sign-up, and in the admin login. Password login, reset, invites and the staff login all stay.
- **Account linking.** Accounts are found by `voo_id` first. "Connect VooSquare" in Settings links the account that pressed it (protected by a cookie bound to that session). Automatic linking only happens when the email is verified on both sides and the account has no Voo ID. Staff accounts are never linked automatically. There is never a second account with the same email.
- **Launcher.** VooSquare's launcher opens `/auth/voosquare?return_to=/app`, and `/dashboard` maps to `/app`. Logout ends the Replyvoo session and then VooSquare's (logout everywhere). A logout request from another website only shows a confirm button.
- **"You already have a Voo account."** This step appears after email verification. It uses VooSquare's `/api/v1/users/lookup` and only calls it after the email is proved.
- **Summary card.** It shows real numbers: chats answered, leads qualified, sales closed, sales value.
- **Money events.** The ids come from the order reference: `spend` plus `plan_started` or `plan_renewed`, `wallet_topup` for credit packs, `refund`, `chargeback` and `plan_cancelled`. Activity events: `chat_answered` once per hour with a count, `lead_qualified`, `payment_link_sent` and `sale_closed`. No customer personal data is sent. The event queue is kept in the database (`voo_queue`).
- **Support bridge.** Tickets are copied into VooSquare HQ. Replies written there come back through `POST /hooks/voosquare/support`. Staff sync accepts only `VOO_SERVICE_KEY`.
- **Affiliate clicks.** The kit keeps `?ref=`, `vclick` and `coupon` clicks. Replyvoo's own Voo Squad keeps running and paying (VOO_CONNECT.md 3e). Its links moved from `?ref=` to `?invite=`.
- **Keys.** They go in **Admin → Connections → VooSquare** (owners only, stored encrypted, only the last 4 characters are ever shown, no restart needed) or in env variables. They are never hardcoded.
- Docs: `docs/VOOSQUARE.md`.

### 3. Bachs naira payments (same rules as Castvoo's Bachs provider)
- **Keys.** Admin → Connections → Bachs (owners only): secret key and webhook secret (stored encrypted), an on/off switch, the countries list, and an optional naira rate. Without the naira rate, Billing rules → Currencies → NGN is used. The `BACHS_*` env variables are the fallback. A sandbox key is never shown to customers.
- **Who sees it.** The 20 countries that Castvoo assumes (NG KE GH ZA CM UG TZ RW ZM ET EG MA CI SN BJ TG SL LR ZW BW), plus customers whose country is not known. **Nigeria pays in naira** (US-dollar price × rate, shown at checkout). Everyone else pays in US dollars.
- **Webhook.** `/webhooks/bachs` checks the HMAC signature and refuses it if it is more than 5 minutes old. The webhook only makes Replyvoo ask Bachs; nothing is credited from the webhook body. Orders are fulfilled once and only once. FAILED and EXPIRED mark the order failed. If the checkout cannot start, the order is marked failed. Refunds go through Admin → Orders.
- Docs: `docs/BACHS.md`. Tests: `test/bachs.test.js` (14).

### 4. Content rules
- **Blog posts.** References to Lagos, Abuja and Port Harcourt, naira prices and pidgin examples are replaced with neutral ones.
- **Sample names.** No Nigerian personal names remain. The two in tests were renamed. No funnel or bot names appear anywhere.
- **Coordinator's legal spec.** A later instruction from the coordinator overrides part of the original "no Lagos or Nigeria" rule for legal pages:
  - The legal pages use "Zedapex Limited, Lagos".
  - The default company address is "Lagos", so the site footer reads "Zedapex Limited, Lagos."
  - Nigeria appears only for governing law and, in the Privacy Policy, for the NDPA and NDPC.

### 5. Legal pages (coordinator's request)
- **Removed:** the "draft for a lawyer" line on all 8 pages and every placeholder note. All dates are now 2 November 2026. Acceptable Use now says "financial regulators".
- **New pages:** Messaging and Anti-Spam (Blasts), AI Use, Security and Vulnerability Reporting, Service Availability, and IP and Takedowns. The Disclaimer is extended with a trading and betting risk warning and an earnings disclaimer.
- **Linked from:** the footer, the legal index and the "More legal" switcher (13 pages, in a set order), the sitemap, and the Terms.
- **Terms and Refund Policy now match the code:**
  - Payment methods: Paystack, Flutterwave, Bachs, Gatevoo, manual USDT.
  - Plans are **prepaid**. There is no automatic plan charge: a reminder goes out 3 days before the end, and the workspace drops to Spark if not renewed. Auto Top-up is the only automatic charge.
  - Changing plan converts unused time into extra days.
  - Refunds: a 7-day window, and what a refund takes back.
  - Chargebacks, notices, and talk first → mediation → courts of Nigeria.
  - Deletion within 30 days of an email request, with backups overwritten within 14 days. The old "credits expire after 12 months" claim was removed because the code never expires credits.
- **Existing installs pick up the new text automatically.** On every boot (`src/services/legal.js`), missing pages are added and pages that nobody edited in the admin get the shipped text. A page with an admin edit (there is a `page.update` audit row) is never touched. `npm run seed -- --force-content` overwrites all pages on purpose.

## What to fill in (env or Admin)

| What | Where |
| --- | --- |
| `NODE_ENV=production`, `APP_URL=https://replyvoo.com`, `APP_SECRET` (openssl rand -hex 32, never change), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PAYMENTS_DEMO=false` | env (required) |
| `ANTHROPIC_API_KEY` (optional: `OPENAI_API_KEY` as backup, `TRANSCRIBE_API_KEY` for voice notes) | env |
| `MAIL_PROVIDER` + `MAIL_API_KEY` (staff 2-step codes and receipts need it) | env |
| Paystack / Flutterwave keys, `GATEVOO_API_KEY` + `GATEVOO_WEBHOOK_SECRET` | env |
| **VooSquare:** in VooSquare → Admin → Products → Replyvoo, set URL `https://replyvoo.com`, Launch path `/app`, SSO on, Redirect URIs `…/auth/voosquare/callback` and `…/`, Summary URL `…/api/voosquare/summary`, Support webhook `…/hooks/voosquare/support`. Then paste the Client ID, secret and API key, and a signal secret. | Replyvoo Admin → Connections (or `VOO_BASE`, `VOO_CLIENT_ID`, `VOO_CLIENT_SECRET`, `VOO_API_KEY`, `VOO_SIGNAL_SECRET`) |
| **Bachs:** the live secret key and webhook secret. In Bachs, set the webhook URL `https://replyvoo.com/webhooks/bachs`. Then switch Bachs on and check the naira rate. | Admin → Connections (or `BACHS_SECRET_KEY`, `BACHS_WEBHOOK_SECRET`) |
| A Telegram bot for testing; optionally `SUPPORT_TG_BOT_TOKEN` | Dashboard → Channels; env |

## Deploy
1. Push the folder and deploy on Railway as described in `HANDOVER.md` (volume at `/app/data`, 1 replica). Migration `009_voo_connect_bachs.sql` runs by itself on boot.
2. Set the variables above, then run `npm run check` in the Railway shell. There must be no FAIL line.
3. Admin → Connections: save the VooSquare keys and press **Test connection** (it should say "Connected"). Then run `node voo-connect/check.js …` with every flag. The exact command is in `docs/VOOSQUARE.md`; it must show 0 FAIL.
4. Admin → Company & SEO: if an older install saved "Lagos, Nigeria" as the address, change it to "Lagos".
5. Smoke test:
   - Sign up with email, and separately with "Continue with VooSquare".
   - Connect a real bot and message it.
   - Make a ₦ payment through Bachs and check that the order goes to Paid.
   - Launch Replyvoo from the VooSquare launcher.
   - Log out and confirm you are logged out of VooSquare too.

## Still needed from the owner
- The live keys above: VooSquare product credentials, Bachs live key and webhook secret, Anthropic, email provider, and a payment provider.
- A real ₦ test payment through Bachs (the API format is unconfirmed, see the Verdict).
- **Gatevoo:** Replyvoo's webhook format (`X-Gatevoo-Signature: t=…,v1=…`, `/invoices`) differs from Castvoo's (`x-gatevoo-timestamp`, `order_id`). Confirm which one Gatevoo really sends before switching crypto on.
- A `security@replyvoo.com` mailbox. The new Security page uses it.
- There is no self-service "delete my account" button. Deletion is by email, as the Privacy Policy and Terms now say.
- The legal pages are complete. Having a lawyer read them, especially the governing-law and mediation clauses, is still the owner's call.
