# Replyvoo API reference

Generated from `src/routes/*.js`. All JSON endpoints live under `/api/`. The dashboard and admin panel use exactly these endpoints, so anything the UI can do, you can do with the API.

## Conventions

- **Base URL**: your `APP_URL`, e.g. `https://replyvoo.com`.
- **Auth**: a session cookie `rv_s` (HttpOnly) set by sign-up, login, password reset or invite accept. Send it back with every request (`credentials: 'same-origin'` in the browser, `-b cookies.txt` with curl).
- **CSRF header**: every `POST`, `PUT`, `PATCH` and `DELETE` to `/api/*` must send `x-rv: 1`. Without it: `403 {"error":"Missing request header"}`.
- **Body**: send `content-type: application/json`. Max body 6 MB.
- **Errors**: non-2xx status with `{ "error": "Human readable message", "code"?: "..." }`. In production, 5xx errors always say "Something went wrong. Please try again."
- **Common statuses**: `400` bad input, `401` not logged in / wrong password, `402` limit reached or not enough credits (with `code`), `403` not allowed / feature switched off / workspace suspended, `404` not found, `409` already exists, `413` body too large, `429` rate limited, `502` provider (Telegram, Paystack, Flutterwave) refused, `503` maintenance mode.
- **Auth levels** used below:
  - **Public** – no login.
  - **User** – logged in.
  - **Member** – logged in and a member of an *active* workspace (the current workspace from the session).
  - **Manager** – Member with workspace role `owner` or `admin` (not `agent`).
  - **Admin** – user with `role = admin`.
- **Rate limits** are per IP and listed where they apply ("RL 10/h").

Example (log in, then call the API):

```bash
curl -c jar.txt -H 'x-rv: 1' -H 'content-type: application/json' \
  -d '{"email":"demo@replyvoo.com","password":"demo12345"}' https://your-domain/api/auth/login
curl -b jar.txt https://your-domain/api/app/bootstrap
```

---

## 1. Auth – `src/routes/auth.js`

### POST /api/auth/signup
Public · RL 10/h · blocked with 403 when the `signup` feature is off.
Body: `{ email, password (8+), name?, business?, niche?, team?, ref?, moji? }`. `ref` (or the `rv_ref` cookie) links the new workspace to a referrer.
Creates the user, a workspace on the free plan (with sign-up/referee bonus credits if configured), logs in, sends **verify-email** and **welcome** emails.
Response: `{ ok: true, user }` where `user = { id, email, name, role, email_verified, moji }`.
Errors: 400 invalid email / short password, 409 email exists.

### POST /api/auth/login
Public · RL 20/15 min. Body: `{ email, password }`. Response: `{ ok: true, user }`.
Errors: 401 wrong email/password, 403 suspended.

### POST /api/auth/logout
Public. Deletes the session and clears the cookie. Response: `{ ok: true }`.

### GET /api/auth/me
Public. Response: `{ user: user|null, workspace_id: number|null }`.

### POST /api/auth/forgot
Public · RL 6/h. Body: `{ email }`. Sends a **password-reset** email (link valid 1 hour) if the account exists. Always returns `{ ok: true }`.

### POST /api/auth/reset
Public · RL 20/15 min. Body: `{ token, password (8+) }`. Sets the password, logs out all sessions, logs in. Response `{ ok: true }`.
Errors: 400 short password, 400 invalid/expired token.

### POST /api/auth/verify
Public. Body: `{ token }`. Marks the email verified. Response `{ ok: true }`. Error: 400 invalid/expired.

### POST /api/auth/resend-verify
User · RL 6/h. Sends a new verify-email if not verified yet. Response `{ ok: true }`.

### GET /api/auth/invite?token=…
Public. Response: `{ email, workspace, has_account }`. Error: 400 invalid/expired/used.

### POST /api/auth/invite/accept
Public · RL 20/15 min. Body: `{ token, password?, name?, moji? }`.
- Logged in as the invited email → joins directly.
- Account exists → `password` must be that account's password.
- No account → creates one (password 8+, email marked verified).
Adds membership with the invited role, logs in into that workspace. Response `{ ok: true }`.
Errors: 400 invalid invite / short password, 401 wrong password.

---

## 2. Dashboard – `src/routes/app.js`

### GET /api/app/bootstrap
Member. Everything the dashboard needs at start:
```
{ user, role, workspaces: [{id, name, role}],
  workspace: { id, name, ref_code, auto_topup, settings: { niche, alerts, timezone, auto_topup_pack }, created_at },
  usage: { plan, period_start, period_end, interval, conversations: {used, included, left}, credits,
           closers_limit, closers_used, seats_limit, seats_used, pro: {used, included} },
  plans: [...active plans], packs: [...], addons: [...], flags: { maintenance, channels, features },
  templates: [...Closer templates], skills: [[key, name, description]...], channels_catalog: [...],
  billing: { conversation_reply_limit, extra_closer_credits, blast_people_per_credit, credit_value_usd, yearly_months_free },
  joinvoo: {...}, providers: [{id, name, note}], ai_live: bool, company: {...}, waitlist: ["whatsapp", ...] }
```

### PUT /api/app/profile
Member. Body: `{ name?, moji? }`. Response `{ ok: true }`.

### PUT /api/app/password
Member. Body: `{ current, password (8+) }`. Logs out your other sessions. Errors: 400 wrong current / short new password.

### PUT /api/app/workspace
Manager. Body (all optional): `{ name, auto_topup: bool, alerts: {handoff, night_report, hot, low_credits}, niche, timezone, auto_topup_pack: packId }`. Response `{ ok: true }`.

### POST /api/app/workspaces/switch
Member. Body: `{ id }`. Switches the session's current workspace. Error: 403 not a member.

### GET /api/app/stats
Member. Dashboard home numbers:
`{ today: {chats, replies, handoffs, hot, won}, series: [{d, chats, replies}] (14 days), stages: {new: n, ...}, rpm: [20 numbers, AI replies per minute], closers: [{id, name, template, active, replies, today}], hot_leads: [...], usage, total_contacts }`.

### GET /api/app/live?after=&after_msg=
Member. Polling feed for Live Room and badges. `after` = last event id seen, `after_msg` = last message id seen.
Response: `{ events: [{id, type, text, data, created_at}] (newest first, max 30), messages: [{id, thread_id, dir, author, kind, text, meta, created_at, contact, closer_id}] (max 40), unread, credits, conv_used }`.

### Closers

| Method & path | Auth | Body / notes | Response |
|---|---|---|---|
| `GET /api/app/closers` | Member | Each item also has `score` (0–100), `gaps` (open gap count) and `knowledge_items`. | `[closer]` |
| `POST /api/app/closers` | Manager | `{ name, template, persona: {tone, length, emoji (0–100), color?: '#RRGGBB'}, skills: {paylink, vision, upsell, nudge, handoff, receipt}, instructions (≤4000), knowledge (free-text notes, ≤60000), pay_link (https://…), pro_brain, rules?, active? (false = created paused, used by the Training Coach), channel_id? }`. First Closer sends the **closer-launched** email. Saves version 1. | `closer` · 402 `code: closer_limit` · 400 bad pay link |
| `PUT /api/app/closers/:id` | Manager | Any of the fields above. `{ active: bool }` alone just pauses/resumes. `channel_id` assigns a channel to it. Every save stores a version (last 10 kept). | `closer` · 404 |
| `DELETE /api/app/closers/:id` | Manager | Unassigns it from channels and threads, then deletes (knowledge and versions cascade). | `{ ok }` |
| `POST /api/app/closers/preview` | Member · RL 40/h | Closer fields (the unsaved draft, incl. `rules`) + `message`, `history: [{role, text}]`. With `closer_id` the Closer's saved structured knowledge is used (404 if it isn't yours). With `scenario: {key, expect}` the reply is checked (`expect` = `answer, price, handoff, no_handoff, honest, graceful, discount`) and the run is recorded for the training score. Nothing is billed. | `{ text, handoff, demo, sources: [{id, kind, label, score}], used: {id, kind} \| null, check?: {pass, note} }` |
| `POST /api/app/closers/slot` | Manager | Buys an extra Closer slot for 30 days with credits (`billing.extra_closer_credits`). | `{ ok }` · 402 `code: no_credits` |

`closer = { id, name, template, persona, skills, instructions, knowledge, rules, pay_link, pro_brain, active, replies, created_at, updated_at, channels: [{id, type, name, username}] }`

`rules = { do: [str], dont: [str], avoid: [str], required: [str], discount: { mode: 'knowledge'|'never'|'max', max: 1–90 }, handoff: { angry, refund, human, legal: bool, order_over: number (0 = off), keywords: [str] }, hours: str, language: { mode: 'auto'|'force', lang }, set: bool }` (lists ≤15 items; cleaned by `training.cleanRules`).

### Agent Studio training (`src/routes/studio.js`)

All paths start with `/api/app/closers/:id`. Every route checks the Closer belongs to your workspace (404 otherwise). Member = read/test, Manager = change.

| Method & path | Auth | Body / notes | Response |
|---|---|---|---|
| `GET …/training` | Member | Everything the Studio needs in one call. | `{ closer, items, rules, scenarios (built-in), custom, runs, coach, score, checklist, counts, gaps, versions }` |
| `GET …/score` | Member | Training score, computed on the server. | `{ score, checklist: [{id, label, hint, done, points, go}], counts }` |
| `GET …/gaps` | Member | Questions from real chats (last 90 days) where the Closer handed off, said it would check, or a human stepped in. Grouped by normalised wording; taught (`data.gap_key` or a Q&A matching ≥ 0.6) and dismissed ones are hidden. | `[{ key, question, count, last_seen, threads, reasons: ['handoff'\|'unsure'\|'human'] }]` |
| `POST …/gaps/dismiss` | Manager | `{ key }` | `{ ok }` |
| `GET …/knowledge` | Member | All items (enabled and disabled). | `[item]` |
| `POST …/knowledge` | Manager | One item, or `{ items: [item…] }` (≤ 500 at a time, ≤ 1000 per Closer). | `item` · `{ ok, added, items }` · 400 |
| `PUT …/knowledge/:kid` | Manager | Any item fields (`enabled` to switch on/off). | `item` · 404 |
| `DELETE …/knowledge/:kid` | Manager | | `{ ok }` |
| `POST …/knowledge/parse` | Manager | `{ format: 'qa'\|'csv'\|'doc', text (≤ 200 KB), name? }` → preview only, nothing saved. `qa` parses "Q:/A:" blocks; `csv` parses `name,price,description,link` (+ optional `currency, stock, sku`); `doc` splits into ~700-char parts and also returns `qa` if it found Q&A blocks. | `{ format, items, errors?, qa? }` · 400 |
| `POST …/import-url` | Manager · RL 30/h | `{ url }`. Fetches a public page (http/https on ports 80/443, private/loopback/link-local/IPv6-local addresses refused at check time and at connect time, ≤ 3 redirects re-checked, 10 s, 2 MB, HTML or plain text), strips it to text and returns a preview. | `{ url, title, items }` · 400/502/504 `code: import_failed` with a friendly message · 422 `import_empty` |
| `PUT …/scenarios` | Manager | `{ scenarios: [{ id?, text, expect }] }` (≤ 20 custom scenarios). | `{ scenarios }` |
| `PUT …/coach` | Manager | `{ step 1–5, done: [n], finished, personality_ok? }` | `{ ok, coach }` |
| `GET …/versions` | Member | Last 10 saved versions with their data. | `[{ id, label, data, created_at, user }]` |
| `POST …/versions/:vid/restore` | Manager | Restores name, persona, skills, instructions, rules and pay link (not knowledge items) and saves a new "Restored from …" version. | `closer` |

`item = { id, kind: 'qa'|'product'|'policy'|'doc'|'correction', title, question, answer, data, source: 'manual'|'import_url'|'import_file'|'correction'|'gap', enabled, created_at, updated_at }`. `data`: Q&A/correction `{ alt: [str], ai_answer? }`; product `{ price, currency, stock, link?, sku? }`; policy `{ topic: 'delivery'|'returns'|'payment'|'hours'|'contact'|'other' }`; doc `{ url? }`; any `{ gap_key? }`.

### Channels

| Method & path | Auth | Body / notes | Response |
|---|---|---|---|
| `GET /api/app/channels` | Member | Not deleted. | `[{ id, type, name, username, closer_id, status, created_at, business, chats }]` |
| `POST /api/app/channels/telegram` | Manager · RL 20/h | `{ token, closer_id? }`. Validates with Telegram `getMe`, stores the token encrypted, sets the webhook to `APP_URL/webhooks/telegram/:id`. | channel · 403 `telegram_bot` flag not live · 400 bad token / Telegram rejected / (production) webhook unreachable · 409 bot used by another workspace |
| `GET /api/app/channels/:id` | Member | Website channels also return `key`, `widget` (full config), `domains`, `assets` (image URLs), `install` (`{host, origin, seen_at}` or null), `unlocked`, `snippet`, `leads`. | channel · 404 |
| `PUT /api/app/channels/:id` | Manager | `{ closer_id }` (null to unassign). Website channels also accept `name`, `domains: [..]` (max 20; `shop.example.com`, `*.example.com`, URLs are reduced to the host) and `widget: {...}` (partial; every field validated: colours `#RRGGBB`, numbers clamped, strings length-limited; see docs/WEBSITE_WIDGET.md). | channel · 400 invalid domain / lead capture without fields / bad time zone · 402 `custom_css_locked` / `branding_locked` (plan) · 404 |
| `POST /api/app/channels/website` | Manager · RL 30/h | `{ name?, domains?: [..] or "a.com, b.com", closer_id? }`. Creates a website widget with key `wk_` + 20 random characters. | channel · 402 `website_limit` (plan sites + power-ups used up) · 403 `website` flag not live |
| `POST /api/app/channels/:id/upload` | Manager · RL 60/h | `{ kind: 'logo'|'avatar'|'launcher', data_url }` – PNG, JPEG or WebP data URL, ≤ 300 KB, checked by magic bytes (no SVG). `data_url: null` removes it. | channel · 400 wrong type/kind · 413 too big |
| `DELETE /api/app/channels/:id` | Manager | Deletes the Telegram webhook, wipes the token, marks it and its Business connections deleted. Website widgets go offline at once. | `{ ok }` · 404 |
| `POST /api/app/waitlist` | Member | `{ item }` (lowercase letters, digits, `_`, `-`; e.g. `whatsapp`) | `{ ok }` |

### Inbox (threads)

| Method & path | Auth | Body / notes | Response |
|---|---|---|---|
| `GET /api/app/threads?filter=&q=` | Member | `filter`: `hot`, `handoff` (handoff or AI off), `unread`. `q` searches name, username, last text. Max 200, newest first. | `[{ id, ai_on, status, unread, last_text, last_message_at, closer_id, channel_id, contact_id, name, username, heat, stage, channel_type, channel_username, closer_name, closer_template }]` |
| `GET /api/app/threads/:id` | Member | Marks it read. | `{ thread, contact, channel, messages: [last 200] }` · 404 |
| `POST /api/app/threads/:id/messages` | Member | `{ text }`. Human reply; sends through Telegram and switches AI off for this chat. | `{ ok }` · 400 empty · 502 Telegram refused |
| `PUT /api/app/threads/:id` | Member | `{ ai_on?, status? ('open'|'handoff'|'closed'), closer_id? }`. Turning AI on also sets status open and adds a note. | `{ ok }` |

### Leads

| Method & path | Auth | Body / notes | Response |
|---|---|---|---|
| `GET /api/app/contacts` | Member | Max 400, most recent first. | `[contact + thread_id + last_text]` |
| `PUT /api/app/contacts/:id` | Member | `{ stage? (new/qualified/checkout/won/lost), heat? (cold/warm/hot/won), notes?, value?, blocked? }` | `{ ok }` · 404 |

### Blast

| Method & path | Auth | Body / notes | Response |
|---|---|---|---|
| `GET /api/app/blasts` | Member | | `{ blasts: [last 50], segments: [{id, count}] }` for `all`, `hot`, `no_buy`, `quiet`, `won` |
| `POST /api/app/blasts` | Manager | `{ message (2–3500 chars), segment, scheduled_at? (ISO, future) }`. Charges credits now: `ceil(recipients / blast_people_per_credit)`. | `{ ok, id, total, credits }` · 403 feature off · 400 empty audience · 402 `code: no_credits` |
| `POST /api/app/blasts/draft` | Member · RL 40/h | `{ goal }`. AI-written suggestion. | `{ text, demo? }` |

### Juno
`POST /api/app/juno` · Member · RL 60/h. Body `{ question }`. Response `{ answer }`. Error 400 empty.

### Wallet and billing

| Method & path | Auth | Body / notes | Response |
|---|---|---|---|
| `GET /api/app/wallet` | Member | | `{ credits, auto_topup, auto_topup_pack, has_saved_card, tx: [last 60 ledger rows], spend: [{reason, n}] (30 days), orders: [last 30] }` |
| `POST /api/app/checkout/preview` | Member | `{ kind: 'plan'|'pack'|'addon', item_id, interval?: 'month'|'year', coupon? }` | `{ kind, item_id, item_name, interval, amount, offer?, discount, total, coupon, providers }` · 400 not available / bad coupon |
| `POST /api/app/checkout` | Manager · RL 30/h | Same as preview + `provider` (`paystack`, `flutterwave`, `crypto`, `demo`). | One of: `{ redirect, ref }` (go to the provider or demo page), `{ ref, instructions: {network, wallet, amount, currency, note} }` (USDT), `{ done: true, ref }` (free) · 400 payments not set up · 502 provider error |
| `GET /api/app/orders/:ref` | Member | Re-verifies with Paystack/Flutterwave if still pending. | `{ ref, kind, item_name, amount_usd, currency, amount_local, provider, status, created_at, paid_at }` · 404 |

### Voo Squad
`GET /api/app/squad` · Member. Response: `{ link (APP_URL/r/CODE), code, clicks, signups, paying, earned_credits, earned_usd, rate, tiers, leaderboard: [{rank, name, usd, you}] }`.

### Team

| Method & path | Auth | Body / notes | Response |
|---|---|---|---|
| `GET /api/app/team` | Member | | `{ members: [{id, name, email, moji, role, created_at}], invites: [pending], seats }` |
| `POST /api/app/team/invite` | Manager · RL 30/h | `{ email, role: 'admin'|'agent' }`. Sends **team-invite** (valid 7 days). | `{ ok }` · 400 bad email · 402 `code: seat_limit` |
| `DELETE /api/app/team/:userId` | Manager | Cannot remove the owner. | `{ ok }` · 404 · 400 |
| `DELETE /api/app/invites/:id` | Manager | Cancels a pending invite. | `{ ok }` |

### Notifications and export
- `GET /api/app/notifications` · Member → last 40 events of types handoff, hot, won, credits, plan, paused, squad, channel, error.
- `GET /api/app/export` · Manager → `{ exported_at, workspace, contacts: [...], closers: [...] }`.

---

## 3. Admin – `src/routes/admin.js` (all Admin)

Most changes are written to the `audit` table.

### Overview
`GET /api/admin/overview` → `{ users, workspaces, paying, mrr, revenue_30d, orders_pending (USDT), ai_replies_today, chats_today, channels, closers, joinvoo_clicks, joinvoo_clicks_30d, waitlist: [{item, n}], plans: [{plan_id, n}], series: [{d, signups, revenue}] (14 days), recent_orders, config: {ai, mail, paystack, flutterwave, demo_payments, app_url, transcribe} }`.

### Users and workspaces

| Method & path | Body / notes | Response |
|---|---|---|
| `GET /api/admin/users?q=&page=` | Search email, name, workspace name. 50 per page. | `{ rows: [{id, email, name, role, email_verified, suspended, created_at, last_login, ws_id, ws_name, plan_id, credits, period_end}], total }` |
| `PUT /api/admin/users/:id` | `{ suspended?, role? ('user'|'admin'), email_verified?, password? (8+) }`. Suspending logs them out. You can't suspend or demote yourself. | `{ ok }` |
| `GET /api/admin/workspaces/:id` | | `{ workspace, usage, members, orders, tx, channels, closers, referred }` |
| `PUT /api/admin/workspaces/:id` | `{ plan_id?, plan_interval?, period_end?, status? ('active'|'suspended'), extra_closer_slots?, extra_seats?, reset_usage?, credits_delta?, credits_reason?, notify? }`. Positive `credits_delta` emails the owner (**credits-added**) unless `notify: false`. | `{ ok }` · 400 unknown plan |

### Pricing

| Method & path | Body / notes | Response |
|---|---|---|
| `GET /api/admin/plans` | Includes inactive plans and `subscribers`. | `[plan]` |
| `POST /api/admin/plans` | `{ id? or name, description, price_month, price_year, closers, conversations, seats, channels_text, extra_chat_price, pro_brain_chats, website_sites (0–9999), remove_branding, custom_css, features: [], badge, cta, popular, elite, contact_sales, sort?, active, offer: {label, percent (0–90), ends_at} }` | `{ ok, id }` · 409 id exists |
| `PUT /api/admin/plans/:id` | Same fields (merged over the current plan). | `{ ok }` · 400 can't pause the free plan |
| `DELETE /api/admin/plans/:id` | Only if no workspace is on it and it isn't the free plan. | `{ ok }` · 400 |
| `GET/POST /api/admin/packs`, `PUT/DELETE /api/admin/packs/:id` | `{ credits, bonus, price (≥0.5), label, sort, active }` | list / `{ ok, id }` / `{ ok }` |
| `GET/POST /api/admin/addons`, `PUT/DELETE /api/admin/addons/:id` | `{ slug? (create only), name, description, price_text, price, credits, status ('live'|'soon'|'off'), sort, active }`. Buyable online only if `live` and `price > 0`. Built-in behaviour exists for slugs `extra-closer` and `extra-seat`; other slugs are recorded only. | list / `{ ok }` · 409 |
| `GET/POST /api/admin/coupons`, `PUT/DELETE /api/admin/coupons/:id` | `{ code (3+ of A-Z 0-9 _ -), description, kind ('percent'|'fixed'), value, applies_to ('all'|'plan'|'pack'), plan_ids: [], max_uses (0 = unlimited), first_purchase_only, expires_at, active }` | list / `{ ok, id }` / `{ ok }` · 400 · 409 |

### Settings
- `GET /api/admin/settings` → `{ company, seo, site, flags, billing, joinvoo, ai }` (defaults merged with saved values).
- `PUT /api/admin/settings/:key` with body `{ value: {...} }` → the saved, merged value. Keys: `company`, `seo`, `site`, `flags`, `billing`, `joinvoo`, `ai`. Errors: 404 unknown key, 400 not an object, 400 `billing.free_plan_id` must be an existing $0 plan, 400 larger than 200 KB.

### Blog and legal pages

| Method & path | Body / notes | Response |
|---|---|---|
| `GET /api/admin/posts` | | `[{id, slug, title, category, status, featured, published_at, updated_at}]` |
| `GET /api/admin/posts/:id` | | full post |
| `POST /api/admin/posts`, `PUT /api/admin/posts/:id` | `{ title, slug?, description, category, cover, keywords, read_time?, body_md, featured, status ('published'|'draft'), published_at? }`. Featuring one un-features the others. A future `published_at` schedules it. | `{ ok, id? }` · 409 slug used |
| `DELETE /api/admin/posts/:id` | | `{ ok }` |
| `POST /api/admin/preview-md` | `{ md }` | `{ html }` |
| `GET /api/admin/pages` | | `[{slug, title, description, updated_at}]` |
| `GET /api/admin/pages/:slug` | | page · 404 |
| `PUT /api/admin/pages/:slug` | `{ title, description, body_md }`. Creates the page if new. | `{ ok }` |

### Orders
- `GET /api/admin/orders?status=` → last 200 orders with `ws_name` and `email`.
- `POST /api/admin/orders/:ref/mark-paid` body `{ note? }` → fulfils the order (safe to repeat). `{ ok: true }` if it was newly paid, `{ ok: false }` if it was already paid or not found.
- `POST /api/admin/orders/:ref/cancel` → cancels a pending order. `{ ok: true }`.

### Emails
- `GET /api/admin/emails` → `{ templates: [{name, subject}], log: [last 100], provider }`.
- `GET /api/admin/emails/:name/preview` → HTML of the email with sample data.
- `POST /api/admin/emails/:name/test` body `{ to? }` (defaults to you) → `{ ok, to, note }`.
- `POST /api/admin/broadcast` body `{ subject, body_md, audience: 'all'|'paying'|'free'|'test' }` → `{ ok, count }`. `test` sends only to you. Users who unsubscribed and suspended users are skipped. Sent in the background, one every 150 ms.

### Activity
`GET /api/admin/activity` → `{ clicks: [{target, source, n}], waitlist: [last 200], contact: [last 100 contact messages], audit: [last 100] }`.

---

## 4. Public website API – `src/routes/public.js` (all Public)

| Method & path | RL | Body / notes | Response |
|---|---|---|---|
| `GET /api/public/site` | | Site settings for the frontend. | `{ company, site, seo, channels: [{id, name, status, ...}], features, plans, packs, addons, billing: {reply_limit, window_hours, credit_value_usd, referral_tiers, referee_bonus, yearly_months_free}, joinvoo }` |
| `POST /api/public/chat` | 40/h | `{ message (≤800), history?: [{role, text}] }`. The website chat bubble. | `{ reply, ai }` · 403 `chat_widget` off |
| `POST /api/public/contact` | 8/h | `{ name?, email, message, source?: 'chat'|'contact'|'sales' }` | `{ ok }` |
| `POST /api/public/newsletter` | 8/h | `{ email }` | `{ ok }` |
| `POST /api/public/waitlist` | 12/h | `{ email, item: 'telegram'|'whatsapp'|'instagram'|'tiktok'|'messenger' }` | `{ ok }` |
| `POST /api/public/track` | 120/h | `{ target, source }` – counts a click. | `{ ok }` |

Remember: these are `POST`s under `/api/`, so they also need `x-rv: 1`.

---

## 5. Webhooks – `src/routes/webhooks.js`

No session and no `x-rv` header. They always answer quickly and do the work in the background.

### POST /webhooks/telegram/:channelId
Called by Telegram. Header `X-Telegram-Bot-Api-Secret-Token` must equal the channel's secret, and the channel must be an active `telegram_bot`; otherwise `403 {"error":"Forbidden"}`. Body: a Telegram `Update`. Response `{ ok: true }`. Updates with an `update_id` not higher than the last one seen are ignored. You never set this URL by hand: the dashboard sets it when a bot is connected.

### POST /webhooks/paystack
Header `x-paystack-signature` = HMAC-SHA512 of the raw body using `PAYSTACK_SECRET_KEY`. Bad/missing → `401 {"error":"Bad signature"}`. On `charge.success` the order `data.reference` is verified with Paystack and fulfilled. Response `{ ok: true }`.

### POST /webhooks/flutterwave
Header `verif-hash` must equal `FLUTTERWAVE_WEBHOOK_HASH`. Bad/missing → 401. The order `data.tx_ref` is verified with Flutterwave and fulfilled. Response `{ ok: true }`.

### POST /webhooks/gatevoo
Header `X-Gatevoo-Signature: t=<unix>,v1=<hex HMAC-SHA256(GATEVOO_WEBHOOK_SECRET, "<t>.<raw body>")>`, at most 5 minutes old. Bad/missing → 401. The order `data.reference` is re-checked with `GET /invoices/:id` on Gatevoo before it's fulfilled. Response `{ ok: true }`. Full contract: `docs/GATEVOO.md`.

### Gatevoo admin and sandbox
- `GET /api/admin/gatevoo`: mode (`live`/`sandbox`/`off`), coins, webhook URL. `POST /api/admin/gatevoo/test` pings Gatevoo. Both need **Pricing** access.
- `POST /api/admin/orders/:ref/check`: asks the provider (Gatevoo, Paystack, Flutterwave) for the latest state. Needs **Orders** edit access.
- `GET/POST /pay/gatevoo/:ref`: sandbox payment page (only with no Gatevoo keys and `PAYMENTS_DEMO=true`; workspace members only).

---

## 6. Links and pages – `src/routes/links.js`, `src/routes/pages.js`

HTML and redirects (not JSON).

| Method & path | What it does |
|---|---|
| `GET /r/:code` | Voo Squad referral link. Sets `rv_ref` cookie (30 days), counts a `ref` click, redirects to `/?ref=CODE`. |
| `GET /go/joinvoo?from=place` | Counts a `joinvoo` click with the source, redirects to `joinvoo.url` + UTM tags + `utm_content=place`. |
| `GET /pay/callback?ref=` (also `reference`, `tx_ref`) | Return page after Paystack/Flutterwave. Verifies the order, then redirects to `/app/wallet?order=REF`. |
| `GET /pay/demo/:ref` | Demo checkout page (only when `PAYMENTS_DEMO` is on and you belong to the order's workspace). |
| `POST /pay/demo/:ref` | "Pay" button of the demo page. Same-origin check, fulfils, redirects to `/app/wallet?order=REF`. |
| `GET /unsubscribe?e=email&t=signature` | One-click unsubscribe from broadcasts (`marketing_opt_out = 1`). |
| `GET /app`, `GET /app/*` | Dashboard single-page app shell (`views/app.html`). Client routes include `/app/login`, `/app/signup`, `/app/forgot`, `/app/reset`, `/app/verify`, `/app/invite`, `/app/live`, `/app/inbox`, `/app/leads`, `/app/closers`, `/app/studio`, `/app/channels`, `/app/blast`, `/app/juno`, `/app/wallet`, `/app/plan`, `/app/squad`, `/app/joinvoo`, `/app/team`, `/app/settings`. |
| `GET /admin`, `GET /admin/*` | Admin single-page app shell (`views/admin.html`). |
| `GET /` | Homepage (`?lang=en|fr|pt|es|sw|ar`, `?ref=CODE`). |
| `GET /pricing` | Pricing page. |
| `GET /blog`, `GET /blog/:slug` | Blog (404 when the `blog` feature is off). |
| `GET /legal`, `GET /legal/:slug` | Legal pages. |
| `GET /contact?topic=sales&plan=` | Contact / talk-to-sales page. |
| `GET /channels` | Channels hub: every channel that is not `off`, with its status (ItemList JSON-LD). |
| `GET /telegram-ai-chatbot`, `/whatsapp-ai-chatbot`, `/instagram-dm-automation`, `/tiktok-dm-automation`, `/messenger-ai-chatbot` | Channel landing pages. Status comes from `flags.channels` (Telegram = live if any of its three flags is live). `off` → 404. `soon` → waitlist form (`POST /api/public/waitlist { email, item: '<channel id>' }`) plus "Start on Telegram today"; `live` → "Start free". Copy in `views/site/channel-content.js`. |
| `GET /blog/rss.xml` | RSS 2.0 feed of the latest 20 published posts (404 when the `blog` feature is off). |
| `GET /sitemap.xml`, `GET /robots.txt` | SEO files built from `APP_URL`. The sitemap includes `/channels` and every channel page that is not `off`. |
| `GET /healthz` | `{ ok: true, time }`. Use for uptime checks. Note: returns the 503 page while maintenance mode is on. |

## 5. Website widget – `src/routes/widget.js` (public, cross-origin)

Called by `public/widget.js` from customers' websites. **Not** under `/api/`, so the `x-rv` header is not needed and no cookies are used. Every route except images checks that `Origin` (or `Referer`) is one of the widget's domains (plus `localhost` outside production) and answers CORS with that exact origin. Errors are JSON `{ error, code? }`. Full behaviour: docs/WEBSITE_WIDGET.md.

| Method & path | Body / query | Response |
|---|---|---|
| `GET /widget.js` | – | The embeddable script (static file, cached 1 h in production). Install: `<script src="APP_URL/widget.js" data-key="wk_..." async></script>` |
| `OPTIONS /w/:key/:what` | CORS preflight | 204 with `Access-Control-Allow-*` for allowed origins · 403 otherwise |
| `GET /w/:key/config` | RL 300/10 min per IP | `{ key, online, offline_reason, business, closer: {name, initials, ai}, widget: {...look, texts, behaviour, lead}, font: {family, css}, assets: {logo?, avatar?, launcher?}, team_online, telegram_url, branding: {show, url}, css }` (no domains, tokens or ids). Records `install.host/seen_at` (max once a minute). · 403 `origin_not_allowed` · 404 |
| `POST /w/:key/messages` | `{ visitor_id, text, page_url?, page_title? }` – `visitor_id` matches `/^v_[A-Za-z0-9]{16,40}$/`, text 1–1,000 chars. RL 30/10 min per visitor, 200/h per IP. | `{ reply: {id, author:'ai', text, created_at} \| null, delay_ms, typing_ms, handoff, human, team_online, last_id }`. `reply` is null when a human took over, AI is off, no Closer, or no credits; the widget then polls. · 400 · 403 · 429 · 503 `{offline:true}` (flag not live, workspace suspended or plan limit) |
| `GET /w/:key/messages?visitor_id=&after=` | Polling (every 4 s while open) | `{ messages: [{id, author:'ai'\|'human', text, created_at}], human, handoff, online }` – only that visitor's thread, outgoing messages after `after`. |
| `POST /w/:key/lead` | `{ visitor_id, name?, email?, phone?, identify? }` – required fields follow the widget's lead settings (`identify: true` from `Replyvoo.identify()` skips them). RL 10/h per visitor. | `{ ok }` – updates the contact (name, email, phone, warm/qualified), adds a note to the thread and an event `lead` "New website lead". · 400 `{field}` · 503 |
| `GET /w/:key/asset/:kind` | `kind` = logo, avatar, launcher | The image with its stored type, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`, cached 1 day (URLs carry `?v=`). · 404 |

Website conversations appear in the dashboard API like any other: `GET /api/app/threads` (`channel_type: 'website'`), `GET /api/app/threads/:id` (adds `page: {url, title, created_at}` – the last page the visitor wrote from), `GET /api/app/contacts` (now with `email`, `phone`), `GET /api/app/export`. `GET /api/app/bootstrap` adds `usage.website: {sites, used, slots, remove_branding, custom_css}` and `widget_catalog: {presets, fonts, defaults}`. Notifications include type `lead`.


## VooSquare (server-to-server)

These routes are authenticated by bearer keys, not cookies, and don't need the `x-rv` header. Full details are in `docs/VOOSQUARE.md`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/auth/voosquare` | none | Start Voo ID login (`return_to`, `signup=1`) |
| GET | `/auth/voosquare/callback` | none | OIDC callback |
| GET | `/auth/voosquare/logout` | session | Log out here and in VooSquare |
| GET | `/api/voosquare/summary?voo_id=&period=1d\|7d\|30d` | `VOO_SERVICE_KEY` | Dashboard card numbers |
| POST | `/api/voosquare/links` | `VOO_SERVICE_KEY` | Switch a tool link on (scoped key) or off |
| GET | `/api/voosquare/links?voo_id=` | `VOO_SERVICE_KEY` | List a user's links |
| POST | `/api/voosquare/inbound/castvoo` | scoped link key | Castvoo broadcast reply → Closer answers |
| POST | `/api/auth/onboard` | session | Business, niche, team and Moji after the first Voo ID login |
| GET | `/api/app/voosquare` | session | VooSquare links and status for the signed-in user |

## WhatsApp (see docs/WHATSAPP.md)

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/webhooks/whatsapp` | Meta | Verification: echoes `hub.challenge` when `hub.verify_token` matches |
| POST | `/webhooks/whatsapp` | Meta | Messages, statuses, template and account updates; `X-Hub-Signature-256` required |
| POST | `/api/app/channels/whatsapp/signup` | owner/admin | `{ code, waba_id?, phone_number_id? }` from Embedded Signup |
| POST | `/api/app/channels/whatsapp/manual` | owner/admin | `{ phone_number_id, waba_id?, token, closer_id? }` |
| PUT | `/api/app/channels/:id/whatsapp` | owner/admin | `{ nudge_template_id, nudge_vars }` |
| GET | `/api/app/channels/:id/templates` | member | Templates of the number's WhatsApp Business Account |
| POST | `/api/app/channels/:id/templates/sync` | owner/admin | Re-read templates from Meta |
| POST | `/api/app/channels/:id/templates` | owner/admin | Builder: `{ name, language, category, header?, body, footer?, examples[], quick_replies[], url_text?, url? }` |
| DELETE | `/api/app/channels/:id/templates/:tid` | owner/admin | Delete in Meta too |
| POST | `/api/app/threads/:id/template` | member | `{ template_id, vars[] }` (works outside the 24-hour window) |
| POST | `/api/app/threads/:id/media` | member | `{ data_url, filename, caption? }` (inside the window) |
| GET | `/api/app/threads/:id/media/:msgId` | member | The photo, voice note or file, fetched from Meta |
| POST | `/api/app/blasts/estimate` | member | `{ template_id, segment }` → people, credits, Meta's estimated charge |
| POST | `/api/app/blasts` | owner/admin | WhatsApp: `{ channel: 'whatsapp', segment, template_id, vars[], opt_in: true }` |
| GET/PUT | `/api/admin/connections/whatsapp` | owner | Keys and switch; `POST …/test`; `PUT …/rates` |
