# Replyvoo architecture

This document explains how the system works. It describes behaviour and structure, not line numbers. When in doubt, the code in `src/` is the source of truth.

## 1. The big picture

Replyvoo is **one Node.js process** that does everything:

```
                    ┌──────────────────────────── one Node.js process ────────────────────────────┐
 Browser ──HTTPS──► │ Nginx/Caddy ─► src/lib/http.js (router, cookies, gzip, static files)         │
 Telegram ─────────►│     middleware: auth.load → auth.csrf → maintenance                          │
 Paystack/FLW ─────►│     static files (public/)                                                   │
                    │     routes: auth · app · admin · public · webhooks · links · pages           │
                    │     services: engine · ai · telegram · payments · workspace · mailer · ...   │
                    │     scheduler (setInterval every 60 s): blasts, nudges, expiry, emails        │
                    │     SQLite file (data/replyvoo.db, WAL)                                      │
                    └──────────────────────────────────────────────────────────────────────────────┘
                         │ fetch()                     │ fetch()               │ fetch()
                         ▼                             ▼                       ▼
                 api.anthropic.com           api.telegram.org       Resend/Brevo/Postmark,
                 (Claude)                                           Paystack, Flutterwave
```

- No npm dependencies. Everything uses Node built-ins: `node:http`, `node:sqlite`, `node:crypto`, `node:zlib`, global `fetch`.
- The website is rendered on the server (good for SEO). The dashboard (`/app`) and admin (`/admin`) are single-page apps written in vanilla JS that call the JSON API.
- Background jobs run inside the same process. That is why **only one instance may run** (see section 11).

## 2. Request flow and middleware order

Defined in `src/server.js`. For every request:

1. **`enhance`** (in `src/lib/http.js`) – parses the URL, query string and cookies; works out `req.ip` (first `X-Forwarded-For` entry if `TRUST_PROXY=true`, else the socket address); sets security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`, and `Strict-Transport-Security` in production); adds helpers `res.json`, `res.send`, `res.redirect`, `res.cookie`.
2. **`auth.load`** – reads the `rv_s` session cookie, looks up the session (stored as a SHA-256 hash), loads `req.user`, picks the workspace (`req.ws`) and role (`req.role`). It also calls `ensurePeriod` on the workspace, so expired plans roll over the moment someone uses the app.
3. **`auth.csrf`** – every `POST/PUT/PATCH/DELETE` to `/api/*` must carry the header `x-rv: 1`. Browsers cannot add custom headers to cross-site requests without CORS, so this blocks CSRF. Missing header → `403 {"error":"Missing request header"}`. Webhooks (`/webhooks/*`) and the HTML demo-checkout form are not under `/api/` and are not affected.
4. **Maintenance mode** – if the admin switched `flags.maintenance` on, everyone except admins gets a 503 "We'll be right back" page (`/api/*` gets a 503 JSON). Still allowed: `/admin`, `/api/admin/*`, `/api/auth/login`, `/api/auth/me`, `/webhooks/*` and static assets. Closers keep replying because webhooks still work.
5. **Static files** – anything in `public/` is served at `/` for `GET`/`HEAD` with ETag, gzip and `Cache-Control` (1 hour in production, `no-cache` in development).
6. **Routes** – registered in this order: `auth`, `app`, `admin`, `public`, `webhooks`, `links`, `pages`, then `/healthz`. First matching path + method wins. A route handler can be a chain: e.g. `app.post(path, rateLimiter, guard, handler)`. If a handler returns a value, it is sent as JSON.
7. **Request body** – read only for `POST/PUT/PATCH/DELETE`, maximum 6 MB. JSON and URL-encoded forms are parsed. The raw bytes are kept in `req.rawBody` (Paystack signature checks need them).
8. **Errors** – throw `new HttpError(status, message, extra)`. For `/api/*` and `/webhooks/*` the client gets `{ "error": "message", ...extra }`. In production, 5xx messages are replaced by "Something went wrong. Please try again." and the real error is logged. Website pages get a branded error page. Unknown paths get 404 (JSON for API paths, HTML page otherwise).

## 3. Modules map

| File | Job |
|---|---|
| `src/server.js` | Builds the app: opens the DB, wires middleware and routes, starts the scheduler, handles SIGTERM/SIGINT (closes the DB cleanly). Exports `build({ dbFile, scheduler })` for tests. |
| `src/config.js` | Loads `.env` (without overriding real environment variables) and exposes typed settings. Exits if `APP_SECRET` is missing in production. Warns if `PAYMENTS_DEMO` is on in production. |
| `src/db.js` | Opens SQLite (WAL, foreign keys, 5 s busy timeout), runs migrations, helpers `one/all/run/insert/update/tx/now/json`. |
| `src/lib/http.js` | Router, body parser, cookies, gzip, static files, security headers, `HttpError`, in-memory `rateLimit(name, max, windowMs)`. |
| `src/lib/auth.js` | Sessions, CSRF header check, guards `needUser/needWs/needManager/needAdmin`, `publicUser`. |
| `src/lib/security.js` | scrypt passwords, random tokens, SHA-256, HMAC, AES-256-GCM `encrypt/decrypt`, referral codes, order refs. |
| `src/lib/md.js` | Safe Markdown renderer (blog, legal pages, broadcasts) and front-matter parser. |
| `src/lib/tpl.js` | Tiny template language for emails: `{{var}}` (escaped), `{{{var}}}` (raw), `{{#if x}}…{{/if}}`, `{{#unless x}}…{{/unless}}`. |
| `src/lib/moji.js` | Validates avatar ("Moji") settings. |
| `src/routes/auth.js` | Sign-up, login, logout, password reset, email verify, team invites. |
| `src/routes/app.js` | Dashboard API (workspace members). |
| `src/routes/studio.js` | Agent Studio training API (`/api/app/closers/:id/…`: knowledge, parse, import-url, gaps, score, scenarios, coach, versions). Registered from `app.js`. |
| `src/routes/admin.js` | Admin API (admins only). |
| `src/routes/public.js` | Website API: site data, chat bubble, contact, newsletter, waitlist, click tracking. |
| `src/routes/webhooks.js` | Telegram, Paystack and Flutterwave webhooks; Telegram update handling (`handleUpdate`). |
| `src/routes/widget.js` | Public website-chat widget API `/w/:key/*` (config, messages, polling, leads, images) with origin lock, CORS and rate limits. See section 13 and `docs/WEBSITE_WIDGET.md`. |
| `src/routes/links.js` | `/r/:code`, `/go/joinvoo`, `/pay/callback`, `/pay/demo/:ref`, `/unsubscribe`, and the `/app` + `/admin` HTML shells. |
| `src/routes/pages.js` | Server-rendered website: `/`, `/pricing`, `/channels`, the five channel landing pages (`/telegram-ai-chatbot` …), `/blog`, `/blog/rss.xml`, `/blog/:slug`, `/legal`, `/legal/:slug`, `/contact`, `/sitemap.xml`, `/robots.txt`, 404/500 pages. Templates in `views/site/*.js` (channel pages: `channels.js` + copy in `channel-content.js`). See `docs/SEO.md`. |
| `src/services/engine.js` | The conversation engine (see section 6). |
| `src/services/ai.js` | Anthropic calls: Closer replies, Juno, website support bot; prompt building; demo replies; voice transcription. |
| `src/services/training.js` | Agent Studio: structured knowledge, retrieval (stemming + synonyms), bulk Q&A and CSV parsers, HTML-to-text and SSRF-safe URL import, rules → prompt, scenario checks, gaps, training score, versions. |
| `src/services/telegram.js` | Telegram Bot API client: `call`, `sendText`, `typing`, `download`. |
| `src/services/workspace.js` | Workspaces, plans, limits, usage, period roll-over, credits ledger, conversation billing, events. |
| `src/services/payments.js` | Checkout, providers, verification, idempotent fulfilment, coupons, referrals, power-ups, auto top-up. |
| `src/services/website.js` | Website chat: widget defaults/presets/fonts, config validation, domain rules, plan gating, reply timing, public config, upload checks. |
| `src/services/settings.js` | Admin-editable settings with defaults (see section 9). |
| `src/services/scheduler.js` | Background jobs (section 8). |
| `src/services/blast.js` | Blast audiences and the sender. |
| `src/services/mailer.js` | Builds emails from `emails/*.html` and sends them through the provider. Logs every send to `email_log`. |
| `src/services/notify.js` | Throttled notification emails (low credits, out of credits, plan expired, handoff). |
| `src/services/catalog.js` | Static product data: Closer templates, skills, feature list, comparison rows, channel list. |
| `src/services/simulator.js` | Fake chats for the demo workspace when `DEMO_SIMULATOR=true`. |

## 4. Data model

All tables are created in `migrations/001_init.sql` (plus later migrations up to `005_training.sql`). Times are ISO-8601 strings in UTC. JSON is stored as TEXT.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | People who log in | `email` (unique, case-insensitive), `password_hash` (scrypt), `role` (`user`/`admin`), `email_verified`, `moji` (avatar JSON), `suspended`, `marketing_opt_out`, `last_login` |
| `sessions` | Login sessions (30 days) | `id` = SHA-256 of the cookie value, `user_id`, `workspace_id` (current workspace), `ip`, `ua`, `expires_at` |
| `tokens` | One-time links | `kind` (`verify` 24 h, `reset` 1 h), `token_hash`, `used_at`, `expires_at` |
| `plans` | Subscription plans | `id` (slug, e.g. `scale`), `price_month`, `price_year`, `closers`, `conversations`, `seats`, `pro_brain_chats`, `extra_chat_price` (display only), `features` (JSON list), `badge`, `cta`, `popular`, `elite`, `contact_sales`, `offer` (JSON `{label, percent, ends_at}`), `sort`, `active` |
| `packs` | Voo Credit packs | `credits`, `bonus`, `price` (USD), `label`, `sort`, `active` |
| `addons` | Power-ups | `slug`, `name`, `price_text` (display), `price` (USD, 0 = not buyable online), `status` (`live`/`soon`/`off`), `active` |
| `coupons` | Discount codes | `code`, `kind` (`percent`/`fixed`), `value`, `applies_to` (`all`/`plan`/`pack`), `plan_ids` (JSON), `max_uses`, `used`, `first_purchase_only`, `expires_at`, `active` |
| `workspaces` | A customer business (the billing unit) | `owner_id`, `plan_id`, `plan_interval`, `period_start`, `period_end`, `conv_used`, `pro_used`, `credits`, `extra_closer_slots`, `extra_seats`, `auto_topup`, `ref_code`, `referred_by`, `settings` (JSON: niche, alerts, timezone, slots, addons, paystack_auth, throttle stamps…), `status` (`active`/`suspended`), `reminded_at`, `report_sent_on` |
| `members` | Who belongs to which workspace | `workspace_id`, `user_id`, `role` (`owner`/`admin`/`agent`) |
| `invites` | Pending team invites (7 days) | `email`, `role`, `token_hash`, `accepted_at`, `expires_at` |
| `channels` | Connected Telegram bots, Business accounts and website widgets | `type` (`telegram_bot`/`telegram_business`/`website`), `username`, `external_id` (bot id or business connection id), `token_enc` (AES-encrypted bot token), `webhook_secret`, `closer_id`, `status` (`active`/`disabled`/`deleted`), `last_update_id` (dedupe), `data` (JSON) |
| `closers` | AI agents | `name`, `template`, `persona` (JSON tone/length/emoji 0–100, optional colour), `skills` (JSON booleans), `instructions`, `knowledge` (free-text notes, up to 60,000 chars), `rules` (JSON owner rules), `training` (JSON: coach progress, custom scenarios, scenario runs, dismissed gaps), `pay_link`, `pro_brain`, `active`, `replies` |
| `closer_knowledge` | Structured training knowledge (migration 005) | `closer_id`, `kind` (`qa`/`product`/`policy`/`doc`/`correction`), `title`, `question`, `answer`, `data` (JSON: alt phrasings, price, currency, stock, link, sku, topic, gap_key), `source`, `enabled` |
| `closer_versions` | Last 10 saved versions per Closer | `closer_id`, `user_id`, `label`, `data` (name, persona, skills, instructions, rules, pay link) |
| `contacts` | Customers / leads | unique (`workspace_id`, `channel_id`, `external_id`), `name`, `username`, `lang`, `heat` (cold/warm/hot/won), `stage` (new/qualified/checkout/won/lost), `notes`, `value`, `blocked`, `last_seen`, `email`, `phone` (website leads) |
| `widget_assets` | Website widget images | (`channel_id`, `kind` logo/avatar/launcher), `mime`, `data` (BLOB ≤ 300 KB), `updated_at` |
| `threads` | One chat | unique (`channel_id`, `chat_id`, `business_connection_id`), `contact_id`, `closer_id`, `ai_on`, `status` (open/handoff/closed), `unread`, `window_start`, `unit_replies`, `units` (billable conversations used), `nudged_at`, `last_customer_at`, `last_message_at`, `last_text` |
| `messages` | Every message | `thread_id`, `dir` (`in`/`out`/`note`), `author` (`customer`/`ai`/`human`/`system`), `kind` (text/image/voice/other), `text`, `meta` (JSON: telegram message_id, closer_id, nudge, blast_id…) |
| `credit_tx` | Credit ledger (every change to `workspaces.credits`) | `amount` (+/−), `balance` after, `reason`, `ref` (order ref, `thread:ID`, `admin:ID`) |
| `orders` | Purchases | `ref` (e.g. `RV-…`), `kind` (plan/pack/addon), `item_id`, `item_name`, `interval`, `amount_usd`, `discount_usd`, `coupon_id`, `currency`, `amount_local`, `provider` (paystack/flutterwave/crypto/demo/free), `provider_ref`, `status` (pending/paid/cancelled/expired), `paid_at` |
| `referral_earnings` | Voo Squad payouts | `referrer_ws`, `referee_ws`, `order_id` (unique → paid once per order), `rate`, `amount_usd`, `credits` |
| `blasts` | Broadcasts | `segment`, `message`, `status` (queued/sending/sent/failed), `total`, `sent`, `failed`, `credits`, `scheduled_at` |
| `events` | Activity feed per workspace (Live Room, notifications) | `type` (reply, hot, won, handoff, nudge, blast, credits, plan, paused, squad, channel, closer, addon, shield, error), `text`, `data` |
| `posts` | Blog posts | `slug`, `title`, `description`, `category`, `cover`, `keywords`, `read_time`, `body_md`, `featured`, `status` (published/draft), `published_at` |
| `pages` | Legal pages | `slug` (primary key), `title`, `description`, `body_md` |
| `settings` | Admin-edited settings | `key` (company, seo, site, flags, billing, joinvoo, ai), `value` (JSON) |
| `clicks` | Tracked clicks | `target` (`joinvoo`, `ref`, or anything sent to `/api/public/track`), `source`, `ip_hash` |
| `waitlist` | Channel waitlists + newsletter | `workspace_id` (null for website sign-ups), `email`, `item` (channel id or `newsletter`) |
| `email_log` | Every email attempt | `to_email`, `template`, `subject`, `status` (sent/failed), `error` |
| `audit` | Admin actions | `user_id`, `action`, `data` |
| `contact_messages` | Website contact form and "talk to a human" | `name`, `email`, `message`, `source` (chat/contact/sales) |
| `_migrations` | Applied migration files | `name`, `applied_at` |

## 5. Billing model

### What is a "conversation"
A **conversation** is the billing unit. It is one chat thread inside a **24-hour window**, covering **up to 10 AI replies**. Both numbers are admin settings (`billing.conversation_window_hours`, `billing.conversation_reply_limit`).

`workspace.chargeForReply()` runs before every AI reply (and before a Nudge):

1. If the thread's window has not expired and fewer than 10 AI replies were sent in it → no charge.
2. Otherwise a **new conversation** starts:
   - If the workspace still has plan conversations this period (`conv_used < plan.conversations`) → `conv_used + 1`.
   - Else it costs **1 Voo Credit**.
   - If the Closer has **Pro Brain** on: uses a Pro Brain chat from the plan (`pro_used < plan.pro_brain_chats`), else costs `billing.pro_brain_extra_credits` more credits (default 1).
   - If credits are needed but the balance is too low → the reply is **skipped**. The owner gets an "out of credits" email (max every 12 h) and a `paused` event.
3. The thread's window restarts (if it expired) and `unit_replies` resets. `units` counts conversations used by this thread.
4. When a reply was paid with credits and the balance drops to `low_credit_threshold` (default 50) or below → low-credits email (max once per 24 h) and **Auto Top-up** is attempted if the customer turned it on.

After a reply is sent, `commitReply` adds 1 to `unit_replies`. Human replies and Blasts are never counted as conversations.

### Voo Credits
- Stored as `workspaces.credits`. Every change goes through `addCredits()` / `spendCredits()`, which write a row to the `credit_tx` ledger inside a transaction. The balance never goes below 0.
- Credits buy: extra conversations (1 each), Pro Brain overage, an extra Closer slot for 30 days (`billing.extra_closer_credits`, default 150), Blasts (1 credit per `billing.blast_people_per_credit` recipients, default 10).
- Credits come from: credit packs, referral rewards, sign-up/referee bonuses, and admin adjustments.
- `billing.credit_value_usd` (default $0.03) is used to convert referral rewards to credits.

### Periods, renewals and downgrades
- Every workspace has a 30-day `period_start`/`period_end`. Plans are **prepaid**, not auto-billed subscriptions: there is no recurring card charge for plans.
- Buying a plan sets the plan and extends the period by 1 or 12 months. Buying the **same** plan while it is still active **extends** the current period and keeps usage; buying a different plan starts a fresh period with usage reset.
- When `period_end` passes, `ensurePeriod()` (called on every request and every minute by the scheduler) resets `conv_used`/`pro_used` and starts a new 30-day period. If the plan was paid, the workspace is **moved to the free plan** (`billing.free_plan_id`) and the owner gets the "plan expired" email. Free plans just roll over.
- 3 days before a paid period ends, the owner gets a renewal reminder email.
- Extra Closer slots bought as power-ups are stored with an expiry in `workspace.settings.slots`.

## 6. AI engine flow

```
Telegram ─POST /webhooks/telegram/:channelId─► check secret header ─► reply 200 at once
   │                                          ─► ignore duplicate update_id
   ▼
handleUpdate (routes/webhooks.js)
   ├─ business_connection → create/update a telegram_business channel
   ├─ business_message from the account owner → saved as a human reply, no AI
   ├─ group message → Shield / welcome / only answer when @mentioned or replied to
   ├─ /start → greeting from the Closer
   └─ text / photo / voice → engine.handleInbound()
                                  │
engine.handleInbound              ▼
  1. workspace must be active
  2. upsert contact (skip if blocked) and thread
  3. voice note → download → transcribe (if TRANSCRIBE_API_KEY and feature "voice")
  4. save the inbound message (unread +1)
  5. HeatScore: keyword rules move heat/stage up (events "hot"/"won")
  6. stop if: group without mention, AI off for this thread, thread in handoff,
     no Closer or Closer paused, or this thread is already being answered
  7. chargeForReply()  → stop if no credits
  8. "typing…" action
  9. ai.reply(): build system prompt + retrieved knowledge + last ~12 messages (+ up to 2 images)
 10. strip markers: [HANDOFF] → thread status "handoff", note, event, email alert
                    [RECEIPT] → contact becomes "won"
 11. send via Telegram, save the outbound message, commitReply, closer.replies +1
 12. event "reply" (or "handoff") for the Live Room
```

Details:
- **System prompt** (`ai.systemPrompt`): Closer name, template brief, tone/length/emoji from the persona sliders, "reply in the customer's language", "only use facts from KNOWLEDGE", no invented discounts/prices/returns, never ask for passwords or card numbers, honesty about being an AI, no markdown, then lines for enabled skills (pay link, upsell, receipt check). **Owner rules** (`closers.rules`, built by `training.rulesPrompt`) come next under "Business rules from the owner (… never override the rules above)": forced language, always/never lists, topics to avoid, discount policy (never / max %), working-hours note, required phrases and the handoff triggers (angry, human, refund, legal/medical/financial, order over X, keywords). Without saved rules the original default handoff line is used. The owner's free-text instructions are last.
- **Knowledge retrieval**: `engine.loadCloser` attaches the Closer's enabled `closer_knowledge` items. `training.buildKnowledge(items, notes, question)` builds the KNOWLEDGE block within 6,000 characters, in this order: **VERIFIED ANSWERS** (corrections matching the question), **MATCHING Q&A**, **PRODUCTS AND PRICES** and **POLICIES** (always in full when under ~2,500 characters, else the matching ones), the remaining Q&A, then the free-text **NOTES** (in full if they fit, else the best paragraphs), then matching **DOCUMENTS**. Matching is dependency-free: lowercase, stopwords, light stemming (`-s/-es/-ies/-ing/-ed`), and synonym groups for commerce words (price/cost/how much, deliver/ship/shipping, pay/payment/transfer, return/refund, open/hours, stock/available, discount/coupon/promo, …). Q&As are scored on the question plus its alternative phrasings (set-cosine), products on their name, policies on their topic words; corrections get a boost on strong matches. Closers with no items use the original `ai.retrieve` paragraph matcher. No vector database.
- **Demo mode** (no `ANTHROPIC_API_KEY`): `demoReply()` applies the rules (handoff triggers, discount policy, required phrases), answers "are you a bot?" honestly, then uses `training.bestAnswer` (correction > Q&A > product line > policy > notes/docs). An unanswerable question gets "I'll check with the team" plus a handoff, so the whole Studio (including Gaps and scenario tests) can be demonstrated.
- **Gaps** (`training.gaps`): customer messages in the Closer's threads (last 90 days) that were followed by a handoff note, an AI "I'll check with the team" style reply, or a human reply; refund/human/angry requests are skipped as intentional. Grouped by the sorted set of normalised tokens.
- **Training score** (`training.score`): personality 10, ≥5 Q&As 20 (partial), products or prices 15, delivery+returns+payment policies 15 (partial), pay link 10 (sales roles), rules 10, ≥3 scenario runs 10 (partial), no open gaps 10.
- **Anthropic call**: `POST https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`, model `AI_MODEL` (or `AI_PRO_MODEL` for Pro Brain), `max_tokens = AI_MAX_TOKENS`, 30-second timeout. The system prompt block is marked `cache_control: ephemeral` for prompt caching. Note: Anthropic only caches prompts above a minimum length (4,096 tokens on Claude Haiku 4.5 at the time of writing), so with today's short prompts the cache usually does not kick in on Haiku. This is harmless; it only matters for cost estimates.
- **Juno** (`/api/app/juno`) sends a JSON snapshot of the workspace's stats to Claude and asks for a short answer. Without a key it builds a plain summary.
- **Website chat bubble** (`/api/public/chat`) uses `settings.ai.support_bot_prompt` plus live facts (plans, packs, coming-soon channels) built from the database. Without a key it uses keyword answers.
- **Errors**: if the AI or Telegram call fails, an `error` event is recorded and no reply is sent. The charge is not refunded.

## 7. Telegram: bots, Business and groups (Shield)

- **Connecting a bot** (`POST /api/app/channels/telegram`): the customer pastes a @BotFather token. The server calls `getMe`, encrypts the token with AES-256-GCM (key derived from `APP_SECRET`), creates a random webhook secret and calls `setWebhook` with `url = APP_URL/webhooks/telegram/<channelId>`, `secret_token`, `allowed_updates = message, business_connection, business_message, my_chat_member`, and `drop_pending_updates`. In production, if Telegram can't reach the URL the request fails with a clear error. One bot can only belong to one workspace.
- **Webhook security**: Telegram sends `X-Telegram-Bot-Api-Secret-Token`; it must match the channel's secret (constant-time compare). The server answers 200 immediately and processes the update in the background. `update_id`s at or below `last_update_id` are ignored (Telegram retries).
- **Telegram Business** (personal accounts, needs Telegram Premium): the user connects the *bot* to their account in Telegram → Settings → Telegram Business → Chatbots. Telegram sends a `business_connection` update; Replyvoo creates a `telegram_business` channel linked to the bot (it is `disabled` if the connection is disabled or the `telegram_business` flag is not Live). Messages arrive as `business_message`. Messages the owner types themselves are stored as human replies and not answered. Replies are sent with `business_connection_id`.
- **Groups**: only handled when the `telegram_group` flag is Live. The bot answers only when `@mentioned` or when someone replies to the bot. With a **Group Guardian** ("guard") Closer:
  - new members get a welcome message;
  - **Shield**: any message with a link (`http(s)://`, `t.me/`, `www.`) from a non-admin is deleted and a `shield` event is logged. The bot must be a group admin with "Delete messages" rights, and must see all messages (make it admin, or turn off privacy mode in @BotFather → Bot Settings → Group Privacy).
- **Disconnecting** deletes the webhook at Telegram, wipes the stored token and marks the channel (and its Business connections) `deleted`.
- **Blasts** and **Nudges** are only sent to private chats (never groups). Blasts only go to bot chats (not Business chats). If Telegram returns 403 (user blocked the bot), the contact is marked `blocked`.

## 8. Scheduler jobs

`src/services/scheduler.js` runs inside the web process. First run 5 s after start, then every 60 s. Each job is guarded so it never runs twice at the same time.

| Job | How often | What it does |
|---|---|---|
| `blast.runDue` | every minute | Sends queued Blasts whose time has come (max 3 per tick). Pauses ~1.1 s every 20 messages and honours Telegram `retry_after`. |
| `expirePlans` | every minute | Rolls over / downgrades workspaces whose period ended (up to 200 per tick). |
| `nudges` | every minute | For open, AI-on threads with a warm/hot, not-won, not-blocked contact: if the last message is from the AI, the customer wrote within the last 23 h, and nothing happened for 3 h → send one follow-up (AI-written if a key is set). Needs the Closer's `nudge` skill and the `nudge` feature. Charged like a reply. One nudge per thread, ever. |
| `renewalReminders` | every 10 minutes | Email owners of paid plans ending within 3 days (once per period). |
| `nightReport` | every 10 minutes | After 06:00 UTC, once per day per workspace: "Night Shift Report" email for the last 24 h (skipped if no chats or the owner switched it off). |
| `joinvooIntro` | every 10 minutes | One Joinvoo intro email to workspaces created 3–4 days ago (if the promo is on and the owner didn't opt out of marketing). |
| `cleanup` | every hour | Deletes expired sessions and old tokens, deletes `reply`/`nudge` events older than 60 days, marks unpaid Paystack/Flutterwave/demo orders older than 48 h as `expired`. |
| `simulator.step` | every minute, only if `DEMO_SIMULATOR=true` | Feeds a fake customer message into the demo workspace. |

Admin broadcasts are sent by a loop started from the request (one email every 150 ms), not by the scheduler. A restart in the middle stops the rest of that broadcast.

## 9. Settings system and feature flags

`src/services/settings.js` holds `DEFAULTS` for seven keys: `company`, `seo`, `site`, `flags`, `billing`, `joinvoo`, `ai`. The admin panel saves a whole key at a time with `PUT /api/admin/settings/:key`. On read, the stored JSON is **deep-merged over the defaults** (objects merge key by key; arrays and plain values replace). So a new default added in code shows up automatically, and the admin only stores what they changed. Values are cached in memory and the cache is cleared on save, so changes go live at once.

| Key | Holds |
|---|---|
| `company` | Legal name, product name, address, support/legal/privacy emails, logo URL, social handles. Used in emails, footer, JSON-LD. |
| `seo` | Homepage title, description, keywords, share image, X handle. |
| `site` | Announcement bar, hero text in 6 languages (en, fr, pt, es, sw, ar), section on/off switches, live counter start, FAQ, final call to action. |
| `flags` | `maintenance`, `channels.{telegram_bot, telegram_business, telegram_group, whatsapp, instagram, tiktok, messenger}` = `live`/`soon`/`off`, `features.{signup, studio, live_room, blast, juno, wallet, squad, joinvoo, pro_brain, voice, blog, chat_widget, nudge, night_report}` = true/false. |
| `billing` | Conversation rules, free plan id, credit value and prices, low-credit threshold, bonuses, referral tiers, Paystack/Flutterwave currency, exchange rates, USDT wallet, yearly months-free text. |
| `joinvoo` | Promo on/off, URL, UTM string, headline, pitch. |
| `ai` | The website chat bot's instructions. |

**Feature flags.** The dashboard (`/api/app/bootstrap`) and website (`/api/public/site`, server-rendered pages) read the flags and hide what is switched off. The server also enforces these flags: `signup` (sign-up API), `blast` (creating Blasts), `blog` (blog pages and sitemap), `chat_widget` (chat API), `voice` (transcription and image download), `pro_brain` (Pro model use), `nudge` and `night_report` (scheduler jobs), `joinvoo` (intro email), channel flags `telegram_bot` (connecting bots), `telegram_business` and `telegram_group` (handling updates). The other feature flags (`studio`, `live_room`, `juno`, `wallet`, `squad`) only hide the UI; their API endpoints keep working.

**Channel flags for WhatsApp/Instagram/TikTok/Messenger** only change what is *shown* (Live, Coming soon with a waitlist, or hidden). There is no integration behind them yet. See `docs/CHANNELS.md`.

## 10. Payments

`src/services/payments.js`.

1. **Quote** – work out the item and USD price. Plans: monthly or yearly price, minus an active plan offer. `contact_sales` plans and free plans cannot be bought. Packs: `price`. Power-ups: only `status = live` with `price > 0`.
2. **Coupon** – validated (active, not expired, uses left, applies to this kind/plan, first-purchase rule). Percent or fixed USD discount.
3. **Providers** shown at checkout: Paystack (if `PAYSTACK_SECRET_KEY`), Flutterwave (if `FLUTTERWAVE_SECRET_KEY`), USDT (if `billing.crypto_enabled` and a wallet is set), Demo (if `PAYMENTS_DEMO`).
4. **Checkout** creates a `pending` order. Local amount = USD × `billing.rates[currency]` (Paystack currency default NGN, Flutterwave default USD).
   - Paystack: `transaction/initialize` → redirect to Paystack → `callback_url = APP_URL/pay/callback?ref=…`
   - Flutterwave: `/v3/payments` → redirect → `redirect_url = APP_URL/pay/callback?ref=…`
   - USDT: returns wallet + amount instructions; an admin later clicks **Mark paid**.
   - Demo: redirect to `/pay/demo/:ref`, a fake checkout page.
   - Total $0 (100% coupon): fulfilled at once.
5. **Verification** – an order is only fulfilled after the server asks the provider (`transaction/verify` or `verify_by_reference`) and the status, currency and amount match. This happens from three places: the provider webhook, the `/pay/callback` return page, and the dashboard polling `GET /api/app/orders/:ref`.
6. **Fulfil (idempotent)** – inside a transaction, the order is marked `paid` only if it was not already paid; a second call does nothing. Then: plan → set plan and period; pack → add credits + bonus; power-up → extra Closer slot (30 days), extra seat, or recorded add-on. Coupon `used + 1`. Paystack's reusable card authorization is saved for Auto Top-up. After the transaction: referral reward and receipt email.
7. **Referrals (Voo Squad)** – `/r/:code` sets an `rv_ref` cookie for 30 days. A sign-up with that code stores `referred_by` and can give the new workspace `billing.referee_bonus_credits`. On **every paid order** of a referred workspace, the referrer earns `amount_usd × rate` converted to credits at `credit_value_usd`. The rate depends on how many paying friends they already have (`billing.referral_tiers`, default 20% / 25% from 10 / 30% from 50). One payout per order.
8. **Auto Top-up** – if the customer turned it on and has a saved Paystack card, a low balance triggers `charge_authorization` for their chosen pack (default: the second pack), at most once every 6 hours.
9. **Expiry** – pending Paystack/Flutterwave/demo orders older than 48 h become `expired`. USDT orders stay pending until an admin marks them paid or cancels them.

## 11. Why a single instance

Run exactly **one** Node process:
- **SQLite** is one file on one disk. Only one server can own it.
- The **rate limiter** keeps counters in memory.
- The **scheduler** runs in-process. Two processes would send every Blast, Nudge and email twice.
- The Telegram `busy` lock (one reply at a time per thread) is in memory.

One process handles a lot: SQLite in WAL mode does thousands of writes per second, and most time is spent waiting on Claude and Telegram. When you outgrow it, see "Scaling" in `docs/DEPLOYMENT.md`.

## 12. Security model

- **Passwords**: scrypt (N=16384, r=8, p=1) with a random salt. Minimum 8 characters.
- **Sessions**: 32 random bytes in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production), valid 30 days. Only the SHA-256 of the cookie is stored. Password reset and password change log out other sessions. Suspending a user deletes their sessions.
- **CSRF**: custom header `x-rv: 1` required on all mutating `/api/*` calls. The demo checkout form checks `Origin`/`Referer` instead.
- **Roles**: `needUser` (logged in), `needWs` (member of an active workspace), `needManager` (workspace `owner` or `admin`), `needAdmin` (`users.role = admin`). Agents can use the inbox and leads but cannot change Closers, channels, billing or the team.
- **Tenant isolation**: every dashboard query filters by `req.ws.id`.
- **Secrets at rest**: Telegram bot tokens are AES-256-GCM encrypted with a key derived from `APP_SECRET`. **Changing `APP_SECRET` makes them unreadable.** One-time tokens (verify, reset, invite) are stored hashed.
- **Webhooks**: Telegram – per-channel secret header. Paystack – HMAC-SHA512 of the raw body with the secret key (`x-paystack-signature`). Flutterwave – `verif-hash` header must equal `FLUTTERWAVE_WEBHOOK_HASH`. Fulfilment always re-verifies with the provider's API, so a forged webhook cannot create a paid order.
- **Rate limits** (per IP, in memory): sign-up 10/h, login and reset 20/15 min, emails (forgot/resend) 6/h, AI test chat and Blast drafts 40/h, Juno 60/h, Telegram connect 20/h, checkout 30/h, invites 30/h, website chat 40/h, contact 8/h, newsletter 8/h, public waitlist 12/h, click tracking 120/h. The IP comes from the first `X-Forwarded-For` entry when `TRUST_PROXY=true`, so your proxy must overwrite that header (the provided Nginx and Caddy configs do).
- **Headers**: `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production. Email previews in the admin get a strict CSP.
- **Markdown** is rendered by a small safe renderer that escapes HTML and only allows `http(s):`, `mailto:`, `/` and `#` links.
- **AI safety**: the system prompt forbids invented prices, promises of financial returns, and asking for passwords, card numbers or one-time codes. Owner rules are added after these lines and are told they cannot override them.
- **URL import (SSRF)**: `training.checkUrl` allows only http/https on ports 80/443, no credentials, no `localhost`/`.local`/single-label hosts, and refuses private, loopback, link-local, CGNAT, multicast and IPv6-local addresses. The request uses a custom DNS `lookup` that re-checks the resolved IP at connect time (no DNS-rebinding window); ≤ 3 redirects, each re-checked; 10 s; 2 MB; HTML/plain text only.
- **Unsubscribe** links are HMAC-signed with `APP_SECRET`.
- **Audit log**: admin changes to users, workspaces, pricing, settings, posts, pages, orders and broadcasts are written to `audit`.

## Channel landing pages (SEO)

Each chat app has its own server-rendered landing page, defined by one entry in `views/site/channel-content.js` (slug, title, meta description, keywords, H1, chat mock, features, setup steps, platform rules, use cases, comparison rows, FAQ, related blog slugs). `src/routes/pages.js` registers one route per entry and computes the status from `flags.channels` on every request (`channelPages()`), so the badge, headings ("does" / "will do"), CTA (Start free vs waitlist), availability FAQ, JSON-LD `featureList`, nav/footer links and the sitemap all follow the admin switch. Blog links to a channel page that is switched `off` are rewritten to `/channels`. Details and the keyword map: `docs/SEO.md`.

## 13. Website chat channel (widget)

A website chat is a `channels` row with `type = 'website'`, `external_id` = the public widget key (`wk_` + 20 random characters), no token, and `data` holding `{ widget: {...config}, domains: [...], install: {host, origin, seen_at} }`. Uploaded images live in `widget_assets` (PNG/JPEG/WebP blobs, max 300 KB), not in `data`, so the channel row stays small. Code: `src/services/website.js` (defaults, presets, validation, origin rules, plan gating, public config), `src/routes/widget.js` (public `/w/*` API), `public/widget.js` (the embeddable script), `public/js/app/pages-web.js` (Widget Studio).

```
 visitor's browser (customer site)              Replyvoo
 ┌──────────────────────────────┐   GET /widget.js (static, 1 h cache)
 │ <script src=…/widget.js      │──────────────────────────────────────►  public/widget.js
 │   data-key="wk_…">           │   GET /w/:key/config  (Origin check, CORS) ─► website.publicConfig()
 │  Shadow DOM: launcher+panel  │   POST /w/:key/messages ─► engine.handleInbound({channel: website, detail:true})
 │  localStorage: visitor id,   │        ◄─ { reply, delay_ms, typing_ms, handoff, human }   (stored, billed, scored)
 │  last 60 messages            │   GET /w/:key/messages?after=  every 4 s while open  ◄─ human replies from Pulse Inbox
 └──────────────────────────────┘   POST /w/:key/lead ─► contacts.email/phone + event "lead"
```

- **Engine**: `handleInbound` and `humanReply` are channel-aware. `channelToken()` returns '' for website channels, so `send()`/`humanReply()` only store messages (no Telegram call). With `detail: true`, `handleInbound` returns `{ text, id, created_at, handoff }` so the widget route can return the stored reply. Billing (`chargeForReply`), HeatScore, events, handoff emails and Live Room work unchanged. The AI prompt says it is chatting "in the chat window on the business’s website".
- **Contacts**: `external_id` = visitor id; default name "Website visitor #1234" (stable hash of the id) until lead capture gives a name; `contacts.email` / `contacts.phone` (migration 004). The visitor's page URL/title is kept in each inbound message's `meta`; `GET /api/app/threads/:id` returns the latest as `page`.
- **CORS / origin rules**: `/w/*` is outside `/api/`, so `auth.csrf` (the `x-rv` header) doesn't apply and there are no cookies. Instead each request's `Origin` (or `Referer`) host must match the widget's `domains` (`example.com` also matches `www.`; `*.example.com` matches subdomains and the apex), or be `localhost`/`127.0.0.1` outside production. Allowed origins get `Access-Control-Allow-Origin: <origin>` + `Vary: Origin`; `OPTIONS` preflights are answered by the route. `/w/*` errors are JSON (like `/api/`), and `/w/*` stays up in maintenance mode (Closers keep answering).
- **Rate limits**: in-memory buckets in `src/routes/widget.js` (per visitor and per IP), like `lib/http.rateLimit` – one process only.
- **Gating**: `workspace.limits()` returns `website_sites` (plan + active "Website chat" power-up slots in `settings.web_slots`), `remove_branding`, `custom_css`. Only the oldest `website_sites` active widgets are "unlocked"; others report `online:false`. Flag `flags.channels.website` must be `live`.
- **House mode**: Replyvoo's own marketing site loads the same `/widget.js` with `data-house` and an inline JSON config (`views/site/layout.js → houseWidget`); it talks to `/api/public/chat` and `/api/public/contact` instead of `/w/*`. `flags.features.chat_widget` switches it on/off.

