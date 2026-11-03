# Emails

Replyvoo sends branded HTML emails (with a plain-text version generated automatically) from the templates in `emails/`. Sending code: `src/services/mailer.js`. Throttled alerts: `src/services/notify.js`.

## 1. Every template

All templates also get these variables automatically: `app_url`, `logo_url`, `company_name`, `company_address`, `support_email`, `year` (from `APP_URL` and **Admin → Company & SEO**).

| Template | Subject | When it is sent | Variables |
|---|---|---|---|
| `welcome` | Welcome to Replyvoo, {{name}}. Your first Closer is waiting | Right after sign-up | `name`, `dashboard_url` |
| `verify-email` | Confirm your email for Replyvoo | After sign-up, and when the user taps "resend" (link valid 24 h) | `name`, `verify_url` |
| `password-reset` | Reset your Replyvoo password | `/app/forgot` (link valid 1 h) | `name`, `reset_url` |
| `team-invite` | {{inviter_name}} invited you to {{workspace_name}} on Replyvoo | A manager invites a teammate (link valid 7 days) | `inviter_name`, `workspace_name`, `invite_url` |
| `closer-launched` | {{closer_name}} is live on {{channel}} | When a workspace creates its **first** Closer | `name`, `closer_name`, `channel`, `studio_url` |
| `payment-receipt` | Your Replyvoo receipt: {{currency}} {{amount}} ({{reference}}) | After any paid order (not $0 orders) | `name`, `item`, `amount`, `currency`, `reference`, `date`, `credits_added` (packs only), `dashboard_url` |
| `credits-added` | {{credits}} credits added to your Replyvoo wallet | An admin adds credits to a workspace (unless "notify" is off) | `name`, `credits`, `balance`, `wallet_url` |
| `low-credits` | Your Closers are about to go quiet | Balance falls to the low-credit threshold after paying for a conversation (max once per 24 h), **and** when a reply is skipped for lack of credits (balance 0, max once per 12 h) | `name`, `balance`, `topup_url` |
| `handoff-alert` | {{customer}} needs a human | A Closer hands a chat to the team (max once per chat per 6 h; owner can switch off in Settings → alerts) | `name`, `customer`, `closer_name`, `snippet`, `inbox_url` |
| `renewal-reminder` | Your {{plan}} plan renews on {{renew_date}} | 3 days before a paid period ends (once per period) | `name`, `plan`, `renew_date`, `renew_url` |
| `card-renews-soon` | Your {{plan}} plan renews on {{renew_date}} for {{amount}} | Card auto-renew (Bachs): 3 days before each charge, and 7 days before a yearly one | `name`, `plan`, `amount`, `renew_date`, `days`, `price_note`, `manage_url` |
| `payment-failed` | Your Replyvoo card payment did not go through | A Bachs card renewal failed (once per failure run) | `name`, `plan`, `amount`, `grace_date`, `card_url` |
| `plan-expired` | Your Closers are paused: {{plan}} plan has expired | A paid plan's period ended and the workspace moved to the free plan | `name`, `plan`, `renew_url` |
| `night-report` | Night Shift Report for {{date}}: {{sales}} sales, {{hot_leads}} hot leads | Daily after 06:00 UTC, if the workspace had chats in the last 24 h, the feature is on and the owner didn't switch it off | `name`, `date`, `chats`, `replies`, `hot_leads`, `sales` (count of payment screenshots), `handoffs`, `dashboard_url` |
| `referral-reward` | You earned {{reward}} from the Voo Squad | A referred workspace pays an order | `name`, `friend`, `reward`, `squad_url` |
| `joinvoo-intro` | Running ads to Telegram? Stop optimising on fake traffic | Once, 3–4 days after sign-up, if the Joinvoo promo is on and the owner hasn't unsubscribed from marketing | `name`, `joinvoo_url` |
| `blank` | {{subject}} | Admin broadcasts (**Admin → Emails → Broadcast**) | `subject`, `body_html`, `name`, `unsubscribe_url` |
| `base` | – | Wrapper around every email (logo, footer, address, unsubscribe link when `unsubscribe_url` is set) | `content`, `preheader` + the automatic ones |

All emails go to the workspace **owner** except `welcome`, `verify-email`, `password-reset` (the user), `team-invite` (the invitee) and `closer-launched` (the person who created the Closer).

Only broadcasts and the Joinvoo intro respect the marketing opt-out. Account emails (receipts, resets, alerts) are always sent.

## 2. Preview and test

- **Admin → Emails → Templates**: tap a template to preview it at phone and desktop width with sample data (`SAMPLE` in `mailer.js`), and **Send test** to any address.
- **Admin → Emails → Email log**: the last 100 emails with status `sent` / `failed` and the provider's error message.
- Raw preview URL (as an admin): `/api/admin/emails/<template>/preview`.
- With `MAIL_PROVIDER=log`, nothing is sent; the server log shows `[mail:log] to=… subject="…"`.

## 3. Provider setup

Choose one provider. All three work over HTTPS APIs (no SMTP).

| Provider | `MAIL_PROVIDER` | `MAIL_API_KEY` | Notes |
|---|---|---|---|
| Resend | `resend` | API key (`re_…`) | Simple; good free tier. |
| Brevo | `brevo` | API v3 key (`xkeysib-…`) | Generous free tier; also does marketing. |
| Postmark | `postmark` | Server API token | Best deliverability for transactional email; uses the `outbound` stream. |

Steps:
1. Create the account. Add and **verify your sending domain** (e.g. `replyvoo.com` or `mail.replyvoo.com`). The provider gives you DNS records:
   - **SPF** – a TXT record (include the provider; if you already have SPF, merge into one record).
   - **DKIM** – TXT or CNAME records with the provider's public key.
   - Return-path / bounce CNAME (Postmark, Resend).
2. Add **DMARC**: TXT `_dmarc.replyvoo.com` → `v=DMARC1; p=none; rua=mailto:dmarc@replyvoo.com`. Move to `p=quarantine` once everything passes.
3. Set `.env`:
   ```
   MAIL_PROVIDER=resend
   MAIL_API_KEY=re_xxxxxxxx
   MAIL_FROM=Replyvoo <hello@replyvoo.com>
   MAIL_REPLY_TO=support@replyvoo.com
   ```
   `MAIL_FROM` must use the verified domain.
4. Restart the app. Send a test from **Admin → Emails**. Check it arrives in Gmail and Outlook inboxes (not spam) and that the provider dashboard shows it delivered.
5. Set **Admin → Company & SEO → Logo URL** to an absolute `https://` image so emails show your logo, and fill in the company address (shown in the footer; many anti-spam laws require it for marketing email).

## 4. Editing templates

- Text changes: edit the HTML file in `emails/`, restart (templates are cached in production).
- Keep the `<!-- subject: … -->` and `<!-- preheader: … -->` comments at the top.
- Syntax: `{{var}}` escaped, `{{{var}}}` raw HTML, `{{#if var}}…{{/if}}`, `{{#unless var}}…{{/unless}}` (no nesting).
- Use tables and inline styles; email clients ignore modern CSS. Copy patterns from existing templates.
- Adding a new template: see [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md#add-an-email-template).
