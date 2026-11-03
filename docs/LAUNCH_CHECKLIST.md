# Launch checklist

Tick every box before you invite real customers. **(P)** = programmer, **(O)** = owner, **(L)** = lawyer.

## 1. Domain and server
- [ ] (O) Domain bought (e.g. replyvoo.com). Registrar account has 2-factor login.
- [ ] (P) DNS `A` (and `AAAA`) records for `@` and `www` point to the server.
- [ ] (P) Server set up following `docs/DEPLOYMENT.md` (one instance, persistent disk).
- [ ] (P) HTTPS works; `http://` → `https://` and `www` → bare domain redirects work.
- [ ] (P) `.env`: `NODE_ENV=production`, `APP_URL=https://<domain>`, `APP_SECRET` from `openssl rand -hex 32`, `PAYMENTS_DEMO=false`, `DEMO_SIMULATOR=false`, `TRUST_PROXY=true` (behind Nginx/Caddy/PaaS).
- [ ] (O) `APP_SECRET` and the full `.env` saved in the owner's password manager. Everyone understands it must **never change**.
- [ ] (P) `npm run seed` done **without** `--demo`. Admin created with a strong password. At least two admin accounts exist.
- [ ] (P) `npm run check` shows no `FAIL`.

- [ ] (P) VooSquare login set up (`VOO_BASE`, `VOO_CLIENT_ID`, `VOO_CLIENT_SECRET`, `VOO_API_KEY`, `VOO_SIGNAL_SECRET`, or Admin → Connections). Run the launch checklist in `docs/VOOSQUARE.md`.

## 2. Legal (do not skip)
The pages in `content/legal/` (Terms, Privacy, Acceptable Use, Refunds, Cookies, DPA, Referral terms, Disclaimer) are **DRAFTS** written as a starting point. They are not legal advice.
- [ ] (O) Legal pages are filled (Zedapex Limited, Lagos, Nigeria; support@, legal@, privacy@replyvoo.com; $300 Voo Squad minimum). Create those mailboxes on replyvoo.com and have a lawyer read the pages in **Admin → Legal pages**.
- [ ] (L) A lawyer reviews and approves all eight pages.
- [ ] (L) **Nigeria – NDPA 2023 / NDPR**: lawful basis for processing, privacy notice, data subject rights process, breach notification process, data protection compliance obligations with the NDPC (registration / annual audit filing if you qualify as a data controller of major importance), cross-border transfer basis (data goes to Anthropic, email and payment providers, possibly outside Nigeria).
- [ ] (L) **EU/UK – GDPR / UK GDPR** if you accept customers there: Replyvoo is a *processor* for your customers' end-customer chats (hence the DPA) and a *controller* for account data. List sub-processors (hosting, Anthropic, email provider, Paystack/Flutterwave, transcription provider). Standard Contractual Clauses for transfers.
- [ ] (L) Refund policy matches what Paystack/Flutterwave require and what you actually do.
- [ ] (L) Acceptable use bans what Telegram, Anthropic and payment providers ban (spam, scams, financial-return promises, etc.). Check the Anthropic usage policy for any regulated verticals customers may use Closers for.
- [ ] (O) **Admin → Company & SEO**: legal name, address, support/legal/privacy emails filled in.
- [ ] (P) Cookie notice behaviour matches the Cookies page (the app sets only first-party cookies: `rv_s` session, `rv_ref` referral; Google Fonts is loaded from Google).

## 3. Brand assets
The site uses **generic placeholder icons** for other companies' brands. Before launch:
- [ ] (O/P) Download official logos from each company's brand/press resources and follow their guidelines:
  - Telegram – telegram.org (press / brand assets)
  - WhatsApp – WhatsApp brand resources (Meta)
  - Instagram – Instagram brand resources (Meta)
  - Messenger / Facebook / Meta – Meta brand resources
  - TikTok – TikTok brand / newsroom resources
- [ ] (P) Swap them into the **three** `brandIcon()` functions (each marked `// Replace with the official logo from the brand's press kit before launch.`):
  - `views/site/art.js` – website (server-rendered)
  - `public/js/app/art.js` – customer dashboard
  - `public/js/admin/core.js` – admin panel (`RV.brandIcon`)
  Keep the same function signature `(id, size)` and ids `telegram`, `whatsapp`, `instagram`, `tiktok`, `messenger`. Inline SVG is preferred (no external requests).
- [ ] (P) Keep the non-affiliation line ("… are trademarks of their owners. Replyvoo is not affiliated with or endorsed by them.") in the footer (`views/site/layout.js`) and channel section (`views/site/home.js`), and the Disclaimer page.
- [ ] (O) Own logo: set `company.logo_url` in **Admin → Company & SEO** (used in emails; must be an absolute https URL). Check `public/favicon.svg` and `public/img/og.png` (share image, 1200×630).
- [ ] (P) **Re-take the blog screenshots** in `public/img/screens/*.png` (agent-studio, blast, channels, closers, dashboard-home, inbox, joinvoo, juno, leads, live-room, plans, signup, squad, wallet). They were captured in a sandbox without web fonts. Take new ones from production (demo workspace on a staging copy) at the same file names.

## 4. AI
- [ ] (P) `ANTHROPIC_API_KEY` set; Setup health shows AI connected.
- [ ] (O) Anthropic console: billing set up, **monthly spend limit** and usage alert emails configured.
- [ ] (P) `AI_MODEL` and `AI_PRO_MODEL` ids exist on your account (check current model names and pricing).
- [ ] (P) Real test: bot answers from the knowledge base, refuses to invent prices, hands off on "refund".
- [ ] (O) Optional: transcription key for voice notes.

## 5. Email
- [ ] (P) Provider account (Resend, Brevo or Postmark), sending domain **verified** (SPF + DKIM), DMARC record added.
- [ ] (P) `MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM` (on the verified domain), `MAIL_REPLY_TO`.
- [ ] (O) Every template previewed and test-sent from **Admin → Emails**. Receipts land in the inbox, not spam (test Gmail and Outlook).

## 6. Payments – live mode
- [ ] (O) Paystack and/or Flutterwave business account fully verified (KYC) and switched to **live**.
- [ ] (P) Live secret keys in `.env`; `PAYMENTS_DEMO=false`.
- [ ] (P) Paystack webhook `https://<domain>/webhooks/paystack`, callback `https://<domain>/pay/callback`.
- [ ] (P) Flutterwave webhook `https://<domain>/webhooks/flutterwave` + secret hash = `FLUTTERWAVE_WEBHOOK_HASH`.
- [ ] (O) **Admin → Billing rules**: currencies and **today's exchange rates** (NGN etc.).
- [ ] (O) Prices, packs, power-ups and coupons reviewed (`docs/PRICING_MODEL.md`). Delete or pause test coupons.
- [ ] (P) One real purchase per provider completed, credited, receipt received, then refunded.
- [ ] (O) If accepting USDT: wallet address double-checked (send a small test transfer first).

## 7. Telegram
- [ ] (P) Real bot connected on production; webhook set (Telegram reached `/webhooks/telegram/<id>`).
- [ ] (P) Group test with a Guardian Closer (bot is admin with delete rights) – Shield removes links.
- [ ] (P) Telegram Business test with a Premium account.

## 8. Backups and monitoring
- [ ] (P) Daily `npm run backup` cron installed (`deploy/backup.cron`).
- [ ] (P) **Off-server** backup copy running (rclone/rsync/provider snapshots).
- [ ] (P) A restore has been tested once.
- [ ] (P) Uptime monitor on `https://<domain>/healthz` alerting the owner and programmer.
- [ ] (P) Log rotation in place (journald limit / pm2-logrotate / Docker log options).
- [ ] (P) Server: automatic security updates (`sudo apt install unattended-upgrades`), SSH key login only, firewall on.

## 9. SEO and analytics
- [ ] (O) **Admin → Company & SEO**: title, description, share image.
- [ ] (O) Google Search Console: add the domain (DNS verification), submit `https://<domain>/sitemap.xml`.
- [ ] (O) Bing Webmaster Tools (optional, can import from Search Console).
- [ ] (P) Check `https://<domain>/robots.txt` allows the site and blocks `/app`, `/admin`, `/api`, `/pay`.
- [ ] (O/P) Analytics (optional): if you add a tracker (e.g. Plausible, Google Analytics), add its script to `views/site/layout.js`, update the Cookies and Privacy pages, and add a consent banner where required.

## 10. Support and operations
- [ ] (O) Support inbox (`support@…`) exists and someone reads it daily; same for legal@ and privacy@ if listed.
- [ ] (O) **Admin → Company & SEO**: support Telegram handle / X handle if used.
- [ ] (O) Website chat bot instructions reviewed (**Admin → Company & SEO → Website chat bot**).
- [ ] (O) Decide who checks **Activity → Messages** and **Orders** (USDT) every day.
- [ ] (O) Homepage text, FAQ and announcement bar reviewed in all six languages (or hide languages you don't support yet by not linking them).
- [ ] (O) Channel switches: WhatsApp/Instagram/TikTok/Messenger on **Coming soon** (not Live).

## 11. Final smoke test and first customer
- [ ] (P) Run the production smoke test in `docs/TESTING.md` section 5.
- [ ] (O) Sign up as a brand-new customer on your phone and go through: sign-up → connect bot → create Closer → chat → buy a pack.
- [ ] (O) Maintenance mode is **off**. Sign-ups are **on**.
- [ ] (O) Invite your first customer. Watch **Overview** and the logs for the first day.
