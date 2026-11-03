# Channels roadmap: WhatsApp, Instagram, Messenger, TikTok

**Telegram** (bots, groups, Telegram Business), **Website chat** and **WhatsApp** are built. WhatsApp turns Live once the Meta app is set up and switched on in Admin → Connections → WhatsApp; until then it shows "Coming soon". Setup: [WHATSAPP.md](WHATSAPP.md). Instagram, TikTok and Messenger are shown as "Coming soon" with a waitlist. Waitlist numbers are in **Admin → Activity → Waitlist** and on each channel card in **Admin → Channels & features**; use them to decide which channel to build first.

> **Verify current rules before building — platform policies change often.** Everything below about Meta and TikTok is a summary of their public rules as we understand them at the time of writing (late 2026). Read each platform's current developer documentation and policies before you start, and again before you submit for review.

> Setting a channel to **Live** in the admin panel does **not** build it. It only changes what customers see. Keep these channels on **Coming soon** until the integration is built, approved and tested.

## How a new channel plugs into this codebase

Telegram shows the pattern. A new channel needs the same five pieces:

| Piece | Telegram today | New channel |
|---|---|---|
| Channel record | `channels.type = 'telegram_bot'` / `'telegram_business'` with `token_enc` (AES-encrypted), `webhook_secret`, `external_id`, `data` JSON | New `type`, e.g. `whatsapp`, `instagram`, `messenger`, `tiktok`. Store access tokens in `token_enc` with `encrypt()`, the platform's account/page/phone id in `external_id`. No migration needed for the type itself (it's free text). |
| Connect flow | `POST /api/app/channels/telegram` (paste token, `getMe`, `setWebhook`) | Usually OAuth / Meta "Embedded Signup" / TikTok authorization: a start endpoint that redirects to the platform and a callback that stores the token, e.g. `GET /api/app/channels/whatsapp/connect` + `GET /oauth/whatsapp/callback` in `src/routes/app.js` / `src/routes/links.js`. |
| Webhook route | `POST /webhooks/telegram/:id` in `src/routes/webhooks.js` | e.g. `GET /webhooks/meta` (verification handshake: echo `hub.challenge` when `hub.verify_token` matches) and `POST /webhooks/meta` (check the `X-Hub-Signature-256` HMAC of the raw body with the app secret; `req.rawBody` is already available). Answer 200 fast, process in the background, de-duplicate by message id. |
| Sender | `src/services/telegram.js` (`sendText`, `typing`, `download`) | A new `src/services/whatsapp.js` / `meta.js` / `tiktok.js` with the same shape. |
| Engine | `engine.handleInbound({ channel, chatId, from, text, kind, images, ... })` | Call the same function. Then make `engine.send()`, `engine.humanReply()`, `blast.js` and the Nudge job in `scheduler.js` pick the sender by `channel.type` instead of always calling Telegram. Respect each platform's reply window (see below) before sending Nudges, Blasts or human replies. |
| Switch | `flags.channels.telegram_bot` etc. | `flags.channels.whatsapp` etc. already exist (`live`/`soon`/`off`). Enforce them server-side in the connect endpoint and webhook, like `telegram_bot`. |

Also update: the Channels page in the dashboard (`public/js/app/pages-build.js`) to show a real connect button when the flag is `live`, `catalog.CHANNELS` copy, the AI system prompt line "chatting with customers on Telegram" in `src/services/ai.js`, the legal pages (new sub-processor), and add the new platform's credentials to `.env.example` and `src/config.js`.

Billing works unchanged: a conversation is still one thread for 24 hours / 10 AI replies. Platform fees (e.g. WhatsApp template messages) are an extra cost; see the notes per channel.

---

## WhatsApp (WhatsApp Business Platform / Cloud API, by Meta)

> **Built.** See [WHATSAPP.md](WHATSAPP.md) for setup, approvals and testing. The notes below are kept as background.

**What it is.** Meta's official API for businesses, hosted by Meta ("Cloud API"). Unofficial WhatsApp libraries that log in as a phone violate WhatsApp's terms and get numbers banned; do not use them.

**Requirements and approvals**
- A Meta Business portfolio (Business Manager) for Zedapex, and a **Meta developer app** with the WhatsApp product.
- To serve other businesses, Replyvoo would act as a **Tech Provider** (or work with a Solution Partner / BSP). Customers connect their own WhatsApp Business Account through **Embedded Signup**.
- **Business verification** of Zedapex in Meta Business Manager, and **App Review** for the permissions needed (e.g. `whatsapp_business_management`, `whatsapp_business_messaging`).
- Each customer needs a phone number not already used on the WhatsApp app (or migrated), a display name approved by Meta, and acceptance of WhatsApp's Business and Commerce policies.

**Key rules (verify current rules)**
- **24-hour customer service window**: after a customer messages the business, the business can reply freely for 24 hours. Outside the window, the business can only send **pre-approved template messages**, which Meta charges for (pricing per message, by category – marketing, utility, authentication – and by country).
- So Nudges and Blasts on WhatsApp must use approved templates and opt-in; you'd need template management in the dashboard.
- **AI chatbot policy (2026)**: Meta's WhatsApp Business Solution terms prohibit general-purpose AI assistants/chatbots (where the AI itself is the product) from using the Business API, effective January 2026. Bots that do business support and sales for the business's own customers – which is what a Closer is – remain allowed. Make sure Closers stay on-topic for the business (the system prompt already restricts them to the business's knowledge) and re-read the current policy before launch.
- Quality rating and messaging limits per phone number; numbers that get blocked or reported are restricted.

**Effort estimate:** 3–5 weeks of development + Meta verification and review (can take from days to several weeks). Most work: Embedded Signup, webhook, sender, template management, 24-hour window logic, billing for template messages.

---

## Instagram (Instagram API with Instagram Login / Messenger Platform for Instagram)

**What it is.** Meta's Messaging API for **Instagram professional accounts** (Business or Creator). Handles DMs, story replies and (with extra permissions) comment-to-DM flows.

**Requirements and approvals**
- Meta developer app with the Instagram product, **business verification**, and **App Review** for messaging permissions (e.g. `instagram_business_manage_messages` / `instagram_manage_messages`) with a screencast showing the flow. Advanced Access is required to serve accounts you don't own.
- Customers connect their professional Instagram account (OAuth). Some setups require it to be linked to a Facebook Page.
- The account must allow access to messages (Instagram settings → Messages → Connected tools).

**Key rules (verify current rules)**
- **24-hour messaging window** after the user's last message for standard replies.
- The **HUMAN_AGENT** message tag allows a *human* agent to reply up to **7 days** after the user's message. It must not be used for automated/AI replies.
- No unsolicited promotional messages; Blasts would be very limited on Instagram.
- Rate limits per account.

**Effort estimate:** 2–4 weeks + App Review. Shares most code (OAuth, webhook verification, signature check) with Messenger, so build them together.

---

## Messenger (Facebook Page messaging via the Messenger Platform)

**What it is.** Replies to messages sent to a business's **Facebook Page**.

**Requirements and approvals**
- Meta developer app with the Messenger product, **business verification**, **App Review** for `pages_messaging` (and related page permissions), Advanced Access to serve other businesses' Pages.
- Customers connect a Facebook Page they admin (OAuth → Page access token, then subscribe the app to the Page's webhooks).

**Key rules (verify current rules)**
- **24-hour standard messaging window**.
- Message tags for specific cases outside the window (e.g. `HUMAN_AGENT` up to 7 days for human replies, account updates, post-purchase updates, event reminders). Promotional content outside the window is not allowed; Meta's paid "sponsored messages" / marketing messages products exist separately.
- Must clearly offer a way to reach a human when using automation.

**Effort estimate:** 1–2 weeks on top of Instagram (shared Meta plumbing), or 2–3 weeks on its own + App Review.

---

## TikTok (TikTok Business Messaging API)

**What it is.** TikTok's API for business accounts to manage direct messages, including leads coming from TikTok ads.

**Requirements and approvals**
- A TikTok for Business / developer account and **application approval** for the Business Messaging API; access is gated and granted to approved partners.
- Customers connect a TikTok Business Account (OAuth).
- **Not available in the EEA, the UK and Switzerland** (accounts registered there can't use it). Show the channel only to eligible customers or explain the limit.

**Key rules (verify current rules)**
- **48-hour reply window** after the user's last message, with a limited number of messages the business can send in that window.
- No unsolicited outreach; Blasts are not possible.
- Webhook events for new messages; sending through the API with the account's access token.

**Effort estimate:** 2–3 weeks once API access is approved (approval timing is unpredictable – apply early).

---

## Suggested order

1. **WhatsApp** – by far the biggest demand in Nigeria, Kenya, Ghana, South Africa and most of Replyvoo's markets. Start Meta business verification early; it gates WhatsApp, Instagram and Messenger.
2. **Instagram + Messenger** together (shared Meta app, OAuth and webhook code).
3. **TikTok** – apply for API access now, build when approved.

For each launch: build → test with your own accounts → pass platform review → update legal pages (sub-processors, data flows) → swap in the official logo (`brandIcon()`) → set the channel flag to **Live**.
