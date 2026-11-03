# WhatsApp in Replyvoo (Meta WhatsApp Business Platform, Cloud API)

For **Ademola** (setup and deploy) and **the owner** (Meta account, approvals, switches).

WhatsApp is fully built. It stays **"Coming soon"** for customers until the Meta app is set up in
**Admin → Connections → WhatsApp** and switched on. Then it shows as **Live** everywhere: the Channels page, pricing
(the "WhatsApp channel" power-up becomes "Included"), the channel landing page, Juno's answers and the support bot.
**Admin → Channels & features → WhatsApp → Off** still hides it completely.

> Meta changes its screens and rules often. If a menu name below has moved, search Meta's docs for the same words.
> Re-read Meta's WhatsApp Business Solution terms before launch: Closers are allowed because they do sales and support
> for the business's own customers (general-purpose AI assistants are not allowed on the Business API).

---

## How it works (short)

| Piece | Where |
|---|---|
| Keys, on/off, rate table | `src/services/whatsapp.js` (settings row `whatsapp_keys`, encrypted) + Admin → Connections |
| Webhook (Meta → us) | `GET/POST /webhooks/whatsapp` in `src/routes/whatsapp.js` |
| Connect (Embedded Signup / Advanced) | `POST /api/app/channels/whatsapp/signup`, `POST /api/app/channels/whatsapp/manual` |
| AI replies | `src/services/engine.js` (same path as Telegram; picks the WhatsApp sender by channel type) |
| Templates | `/api/app/channels/:id/templates` (list, sync, create, delete) |
| Pulse Inbox extras | `/api/app/threads/:id/template`, `/api/app/threads/:id/media`, `/api/app/threads/:id/media/:msgId` |
| Blast | `POST /api/app/blasts` with `channel: 'whatsapp'`, `POST /api/app/blasts/estimate` |
| Nudge after 24 h | `waNudges` in `src/services/scheduler.js` |
| Dashboard UI | `public/js/app/pages-whatsapp.js` |
| Tests | `test/whatsapp.test.js` (fake Graph API) |
| Database | `migrations/010_whatsapp.sql` (runs by itself on boot) |

- **Each customer connects their own WhatsApp Business Account (WABA)** with Meta's Embedded Signup popup. Replyvoo gets
  the WABA id, the phone number id and a business token (stored AES-256-GCM encrypted, never logged, never sent to the
  browser). Replyvoo then subscribes the app to that WABA's webhooks and registers the number on the Cloud API with a
  random 6-digit two-step PIN (stored encrypted).
- **Inbound:** text, image (read by Vision), voice/audio (transcribed with `TRANSCRIBE_API_KEY`, like Telegram), video,
  document, location, contact cards, sticker, reply-button and list taps, template quick replies, reactions. Each message
  id is handled once (Meta retries webhooks). Reactions and stickers are shown but not answered.
- **Outbound:** text, interactive reply buttons / lists (when the Closer suggests 2–10 options with `[OPTIONS: …]`), the
  PayLink as a "Pay now" button, photos/documents/audio from the inbox (uploaded through `/media`), templates. The
  customer's message is marked read with a typing indicator while the Closer writes.
- **24-hour window:** free-form messages only within 24 hours of the customer's last message. After that only approved
  templates (the inbox switches to template mode; Blasts and the late Nudge always use templates).
- **Statuses:** sent → delivered → read, or "Not delivered" with Meta's reason in plain words, under each message.
- **STOP / START:** "STOP" (or tapping a "Stop promotions" button) opts the customer out of Blasts and marketing
  templates; "START" opts back in. Error 131050 from Meta also opts them out.
- **Billing:** a WhatsApp chat is a normal Replyvoo conversation (same plan allowance and credits). Blasts cost Replyvoo
  credits as usual. **Meta's template charges are billed by Meta to the customer's own WABA** (the customer adds a payment
  method in WhatsApp Manager). Replyvoo never pays Meta and never shares a credit line. The Blast screen shows
  "Meta bills your WhatsApp account about $X per message for this country/category", from the admin rate table.

---

## 1. Create the Meta app (owner, with Ademola)

1. Go to **developers.facebook.com → My Apps → Create app**.
2. Use case: **Other** → app type **Business**. Name it "Replyvoo". Connect it to the **Zedapex Limited** business
   portfolio (Meta Business Manager). If Zedapex has no business portfolio yet, create one at business.facebook.com first.
3. In **App settings → Basic**: add the privacy policy URL `https://replyvoo.com/legal/privacy`, the terms URL
   `https://replyvoo.com/legal/terms`, an app icon, a category and the contact email. Copy the **App ID** and the
   **App Secret** (Show).

## 2. Add WhatsApp and Embedded Signup

1. In the app dashboard, **Add product → WhatsApp → Set up**. Pick the Zedapex business portfolio. Meta creates a
   **test WhatsApp Business Account with a test number** (used in step 7).
2. **Add product → Facebook Login for Business.**
   - Settings: Valid OAuth Redirect URIs: `https://replyvoo.com/` ; Allowed domains for the JavaScript SDK:
     `https://replyvoo.com` (add your staging domain too if you test there). Login with the JavaScript SDK: **Yes**.
3. **Facebook Login for Business → Configurations → Create configuration**:
   - Login variation: **WhatsApp Embedded Signup**.
   - Access token: **System-user access token**, token expiration **Never**.
   - Assets: **WhatsApp accounts**. Permissions: `whatsapp_business_management`, `whatsapp_business_messaging`
     (and `business_management` if offered).
   - Save and copy the **Configuration ID**.
4. To serve other businesses, the app must be a **Tech Provider**: in the app dashboard follow **WhatsApp → Quickstart →
   "Become a Tech Provider"** (Meta's onboarding checklist; it includes business verification and App Review below).

## 3. Business verification (owner)

**business.facebook.com → Settings → Business info → Security Center → Start verification.** Use Zedapex Limited's legal
name, address and registration documents, a business phone and a website on the company domain. Meta can take from a
few days to a few weeks. Embedded Signup for other businesses only works after verification and App Review.

## 4. App Review (owner + Ademola)

App dashboard → **App Review → Permissions and features**. Request **Advanced access** for:

| Permission | Why Replyvoo needs it (paste a version of this) |
|---|---|
| `whatsapp_business_management` | Read the customer's WhatsApp Business Account, phone numbers and message templates, create templates from the dashboard and subscribe our app to the account's webhooks. |
| `whatsapp_business_messaging` | Receive the customer's WhatsApp messages and send replies (AI and human), templates, files and read receipts on their behalf. |
| `business_management` | Let customers pick their business portfolio during Embedded Signup and let us find the WhatsApp account their token was granted for. |

For each one, upload a **screencast**: sign in to Replyvoo → Channels → Connect WhatsApp → Facebook popup → finish →
a message arrives in Pulse Inbox → the Closer replies → a template is created in Templates → a Blast with a template.
Use the test number from step 7 to record it.

## 5. Webhook URL and fields

1. In Replyvoo **Admin → Connections → WhatsApp**: enter the App ID and App Secret, press **Generate** for the verify
   token, and **Save** (leave "Switch WhatsApp on" off for now). The card then shows the callback URL and the verify token.
2. Meta app dashboard → **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL: `https://replyvoo.com/webhooks/whatsapp`
   - Verify token: the one shown in Replyvoo (must match exactly). Meta calls `GET /webhooks/whatsapp` and we echo the challenge.
3. **Webhook fields → Subscribe** to: `messages`, `message_template_status_update`, `message_template_quality_update`,
   `template_category_update`, `phone_number_quality_update`, `account_update`.
4. Every POST from Meta is checked with `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the App Secret).
   A wrong App Secret means every webhook is refused with 401: re-copy it.

## 6. Values (Admin or env)

Admin → Connections → WhatsApp (owners only; secrets stored encrypted, only the last 4 characters are shown) **or** env:

| Admin field | Env variable | Example / note |
|---|---|---|
| Meta App ID | `META_APP_ID` | the number at the top of the app |
| App Secret | `META_APP_SECRET` | App settings → Basic |
| Embedded Signup configuration ID | `WHATSAPP_CONFIG_ID` | from step 2.3; without it customers can only use Advanced |
| Webhook verify token | `WHATSAPP_VERIFY_TOKEN` | long random text, same value in Meta |
| Graph API version | `META_GRAPH_VERSION` | default `v26.0`; raise it when Meta deprecates a version |
| Switch WhatsApp on for customers | `WHATSAPP_ENABLED` | empty = follow the admin switch; `true`/`false` forces it |

Admin values win over env. `META_GRAPH_BASE` exists only for tests (fake Graph API).
Press **Test app keys** (it asks Meta for the app with the App ID and App Secret).

**Meta's price table** (same card): only used for the Blast cost estimate. It is seeded with **estimates from Meta's rate
card effective 1 October 2025** and labelled "estimate" to customers until you tick "I checked these against Meta's rate
card today" and save. Keep it up to date from https://developers.facebook.com/docs/whatsapp/pricing (codes: 2-letter
country, `XAF` = rest of Africa, `*` = every other country).

## 7. Test with Meta's test number before approval

You can test everything before business verification and App Review, with your own accounts:

1. Meta app → **WhatsApp → API Setup**: note the **test phone number id** and **WhatsApp Business Account ID**. Under
   "To", add your own WhatsApp number as a recipient (up to 5) and confirm the code.
2. Create a **permanent token**: business.facebook.com → Settings → Users → **System users** → Add (admin) → Assign assets:
   the app (full control) and the test WhatsApp account (full control) → **Generate token** with
   `whatsapp_business_messaging` and `whatsapp_business_management`, expiry Never.
3. Replyvoo Admin → Connections → WhatsApp: keys saved (step 5), switch **on** (you can test on staging first).
4. In the dashboard, **Channels → WhatsApp → Advanced**: paste the test phone number id, the WABA id and the token.
5. From your own WhatsApp, message the test number. Within seconds: the chat appears in Pulse Inbox with the WhatsApp
   tag and "Free reply window: 23h left", the Closer replies, and the message shows Delivered/Read.
6. Try: a voice note (needs `TRANSCRIBE_API_KEY`), a photo, a location, "STOP"/"START", Take over + a human reply,
   Templates → New template (Meta reviews it; `hello_world` already exists on test accounts) → Get latest from Meta,
   and a WhatsApp Blast to yourself.
7. One-tap Embedded Signup only works for your own business and app admins/testers until App Review passes. Add testers
   in App roles → Roles.

## 8. Go live

1. Business verification ✓, App Review ✓ (Advanced access), Tech Provider steps ✓.
2. Admin → Connections → WhatsApp: Configuration ID filled, **Switch WhatsApp on** → Save. The site flips to Live.
3. Update the homepage text that mentions WhatsApp as "coming soon" (Admin → Homepage: hero subtitle, announcement bar,
   FAQ, SEO description). Those are free text, so they don't change by themselves.
4. Legal: add Meta (WhatsApp Business Platform) as a sub-processor in the Privacy Policy.
5. Tell customers: they need a phone number not in use on the WhatsApp app (or migrate it), a display name Meta approves,
   and **a payment method on their WhatsApp Business Account** (WhatsApp Manager → Overview → Add payment method).
   Without it Meta blocks sending, and template messages fail with "Meta could not charge your WhatsApp account".

## What only works live

- The Embedded Signup popup and its message events (Meta's popup; not testable offline).
- Real code exchange, number registration (a number that is already registered with another PIN or still on the
  WhatsApp app may need finishing in WhatsApp Manager; the dashboard shows a warning when registration failed).
- Template review results and quality/limit webhooks.
- Real delivery statuses and Meta's error codes, real media URLs, typing indicators on the customer's phone.
- Meta's actual prices.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Meta says "The callback URL or verify token couldn't be validated" | Verify token differs, APP_URL not HTTPS, or the keys aren't saved. |
| Messages don't arrive | Webhook fields not subscribed (`messages`), App Secret wrong (401 in logs), WhatsApp switched off (webhooks are acknowledged but ignored), or the number was disconnected. |
| "More than 24 hours since the customer's last message" | Send an approved template. |
| Template rejected | See the reason in Templates; marketing wording in a utility template is the usual cause. |
| "Meta could not charge your WhatsApp account" | The customer must add/fix the payment method in WhatsApp Manager. |
