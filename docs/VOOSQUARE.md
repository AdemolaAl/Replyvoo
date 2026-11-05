# VooSquare integration (Voo Connect)

VooSquare is the one account (Voo ID) for every Zedapex tool. Replyvoo connects to it with VooSquare's **Voo Connect kit**,
copied unchanged into `voo-connect/` (version in `voo-connect/package.json`). Never edit the kit: when VooSquare publishes a new
version, copy `sdk/voo-connect/` over it. The contract is VooSquare's `docs/VOO_CONNECT.md`, "Replyvoo" sheet.

**Owner rule: Replyvoo keeps its own login.** Email + password sign-up and login, password reset, team invites and the staff
admin login all keep working. "Continue with VooSquare" is added next to them.

| Part | Code |
| --- | --- |
| Kit instance, settings (env + Admin → Connections), event outbox in our database | `src/lib/voo.js` |
| Linking rules, summary card, money/activity events, support bridge, "already have a Voo account" lookup | `src/services/voosquare.js` |
| Routes (login, callback, connect, logout, snippet, summary, support webhook, staff/ticket APIs, tool links) | `src/routes/voosquare.js` |
| Admin → Connections (keys, test, status) | `src/routes/admin.js`, `public/js/admin/site.js` |
| Tests (fake VooSquare) | `test/voosquare.test.js` |

## 1. Switching it on

In **VooSquare → Admin → Products → Replyvoo**: URL `https://replyvoo.com`, Launch path `/app`, SSO on, Redirect URIs
`https://replyvoo.com/auth/voosquare/callback` and `https://replyvoo.com/`, Summary URL `https://replyvoo.com/api/voosquare/summary`,
Support webhook `https://replyvoo.com/hooks/voosquare/support`. Save, open **Credentials**, copy Client ID, Client secret, API key.
(Replyvoo's **Admin → Connections** page shows these exact addresses with Copy buttons.)

Then either paste them in **Replyvoo → Admin → Connections → VooSquare** (owners only; saved encrypted, never shown again,
take effect without a restart), or set variables:

```
VOO_BASE=https://voosquare.com
VOO_CLIENT_ID=vsc_…
VOO_CLIENT_SECRET=vss_…
VOO_API_KEY=vsk_…
VOO_SIGNAL_SECRET=<openssl rand -hex 32, make once, never change>
# optional
VOO_SERVICE_KEY=<inbound-only key for VooSquare's staff sync>
VOO_SERVER_BASE=<private address for server-to-server calls>
VOO_REDIRECT_URI=<only if it is not APP_URL/auth/voosquare/callback>
VOO_WIDGET=1          # VooSquare's chat widget on Replyvoo's public pages (off: Replyvoo has its own Juno chat)
VOO_CONNECT=off       # switch every VooSquare feature off
```

Values saved in the admin win over variables. Login turns on with base + client ID + secret; events, summary and support need
the API key. Check with `node voo-connect/check.js --base … --client-id … --client-secret … --api-key … --redirect-uri
https://replyvoo.com/auth/voosquare/callback --logout-uri https://replyvoo.com/ --summary-url https://replyvoo.com/api/voosquare/summary`
(no FAIL line) and `npm run check`.

## 2. Login and linking

| Route | What it does |
| --- | --- |
| `GET /auth/voosquare?return_to=/app&signup=1` | Start (the kit sets a signed state cookie, replays the affiliate click). `signup=1` opens VooSquare's sign-up. VooSquare's launcher opens `/auth/voosquare?return_to=/app`; `/dashboard` is mapped to `/app`. |
| `POST /api/auth/voosquare/link` | "Connect VooSquare" (Settings, and after email verification). Sets a 10-minute cookie bound to this session. |
| `GET /auth/voosquare/callback` | State, code exchange, id_token check (HS256, audience, issuer, expiry), then linking, then our own session. |
| `GET /auth/voosquare/logout`, `GET /logout` | End our session; Voo ID accounts are then sent to VooSquare's `/oauth/logout`, which comes back to `/`. A cross-site GET only shows a "Log out?" button (`POST /logout`). |

Linking (`voosquare.linkOrCreate`):

1. Found by `users.voo_id` first, always.
2. "Connect VooSquare" started by this same session: the Voo ID is saved on **that** account (a Voo ID already used elsewhere, or an account that already has another Voo ID, is refused with 409).
3. Same email, **verified on both sides** (VooSquare's `email_verified` and Replyvoo's own verify link), account has no Voo ID, not a staff account: linked automatically.
4. Same email but not verified here, not verified in VooSquare, a staff account, or already linked to another Voo ID: refused with a clear message (log in with your password and press Connect). Never a second account with the same email.
5. Otherwise a new account and workspace (`/app/welcome` onboarding), with `country` and `voo_ref` (saved once).

**"You already have a Voo account."** After someone verifies their email in Replyvoo (and only then), Replyvoo asks
VooSquare's `POST /api/v1/users/lookup`. If that email has a Voo ID, the verify page offers "Connect my Voo account".

## 3. Summary card

`GET /api/voosquare/summary?voo_id=&period=1d|7d|30d` with `Authorization: Bearer <VOO_API_KEY>` (checked by the kit).
Metrics over every workspace the person owns: `chats_answered`, `leads_qualified`, `sales_closed`, `sales_usd`, with change
against the previous period. `status`: `active` (paid plan running), `trial` (Spark), `paused`, `none`. Unknown → `{"linked":false}`.

## 4. Events

Queued through the kit (outbox row `voo_queue` in our database, so nothing is lost on restart), sent every 5 seconds by the
kit's sender and every minute by the scheduler. Ids come from order references (`RV-…`), never row numbers.

| When | Events |
| --- | --- |
| Plan payment | `spend` (`rv_pay_<ref>`, amount paid) + `plan_started` (`rv_plan_<ref>`) or `plan_renewed` (`rv_renew_<ref>`) with the list price |
| Power-up | `spend` |
| Credit pack | `wallet_topup` (no commission) |
| Refund / chargeback (Admin → Orders) | `refund` / `chargeback` pointing at the `spend` |
| Paid plan ended | `plan_cancelled` |
| Closer activity | `chat_answered` (one per workspace per hour, count in the label), `lead_qualified`, `payment_link_sent`, `sale_closed` (with value) |

No end customer's name, contact, Telegram ID or message text is ever sent. Refused events are listed in Admin → Connections.

## 5. Support and staff

- A customer's support ticket message (dashboard Help, website chat, contact form, Telegram support bot, email) is copied to
  VooSquare HQ (`external_ref = replyvoo-<ticket ref>`). A reply written in VooSquare HQ comes back on
  `POST /hooks/voosquare/support` (API key) and is shown on the ticket.
- VooSquare can read and work the desk: `/api/voosquare/support/boxes|tickets|tickets/:ref|…/reply|…/update` (API key or service key).
- Staff sync `GET/POST /api/voosquare/staff` accepts **only** `VOO_SERVICE_KEY` (never the API key).

## 6. Referrals

Replyvoo's own Voo Squad keeps running and paying its own credit rewards (VOO_CONNECT.md section 3e: both programmes run).
Its links are `/r/<code>` → `/?invite=<code>`; `?ref=`, `vclick` and `coupon` belong to VooSquare affiliates and are kept by the kit.

## 7. Tool links (Castvoo → Replyvoo)

Unchanged: `POST /api/voosquare/links` (VooSquare switches a link on with a scoped key, or off) and
`POST /api/voosquare/inbound/castvoo` (a Castvoo broadcast reply answered by the Closer on the same bot).

## 8. Joinvoo bridge ("Who answers chats in this bot?")

A Joinvoo customer can hand a Telegram bot's private chats to Replyvoo and switch back at any time. Joinvoo keeps the bot (its
webhook and token) and keeps tracking every Start, join, block and deposit. Code: `src/services/joinvoo.js`, `src/routes/joinvoo.js`,
migrations `011_joinvoo_bridge.sql` and `012_joinvoo_accounts_pay.sql`, tests `test/joinvoo-bridge.test.js`.

| Route (server-to-server, signed) | What it does |
| --- | --- |
| `POST /hooks/joinvoo/link` | Joinvoo gives a Voo ID its own link secret (signed with the shared `JOINVOO_BRIDGE_SECRET`) |
| `POST /hooks/joinvoo/status` | Plan, free chats left, credits, out of credits (for the line under the bot in Joinvoo) |
| `POST /hooks/joinvoo/bot` | Switch one bot on (a token-less `joinvoo_bot` channel) or off (`paused`; chats kept) |
| `POST /hooks/joinvoo/update` | One update: message, photo, voice, video, file, sticker, button press, Start, blocked, or new ad/deposit context |

Replyvoo answers through Joinvoo (`<JOINVOO_URL>/bridge/replyvoo/send`, `/file`, `/fallback`) and never holds the token, so no second
webhook is ever set. Signatures: HMAC-SHA256 over direction, time, nonce, method, path and body hash; refused after 5 minutes or when a
nonce repeats; one link reaches only its own bots. Answers carry `reason` (`out_of_credits`, `no_closer`, `not_switched`, `paused`), and
Replyvoo calls `/fallback` when a reply fails later, so Joinvoo's Team inbox takes the chat. Billing is unchanged: these chats are normal
conversations on the workspace's plan and credits (30 free on Spark). Set `JOINVOO_URL` and `JOINVOO_BRIDGE_SECRET` to switch it on.

### 8a. "Set up your AI" from inside Joinvoo (Update 68)

Joinvoo can show a 4-step wizard (what you sell, the link people get, how it talks, review → "Switch on AI") and a Replyvoo plan card,
behind its own `replyvoo_setup` feature flag. Replyvoo stays the **only** place these settings live: Joinvoo reads and writes them over
the same signed bridge and stores none of them, so anything changed in the Studio shows in Joinvoo next time. Code: the Update 68 block
in `src/services/joinvoo.js`; tests `test/joinvoo-setup.test.js`. No new migration and **no new environment variable**.

| Route (server-to-server, signed with the link's secret) | What it does |
| --- | --- |
| `POST /hooks/joinvoo/basics` | `{ bot_id \| account_id }` → the basics of the Closer for that bot: `sells` (the `What we sell:` line of its knowledge), `link` (its payment link), `tone` (`friendly`, `professional`, `short`, or `custom` when tuned in the Studio), `lang` (`auto` or a code), `on`; plus `advanced_url` (Studio, logged in with the Voo login) and the plan `status` |
| `POST /hooks/joinvoo/basics/save` | Saves them. Makes the Closer if the workspace has none (Sales job, name Ava). Only the `What we sell:` line, the payment link, the tone sliders and the language change: the name, other knowledge, rules, scripts and style examples are kept. `tone: "custom"` keeps the Studio tone. Limits: 500 characters, `https://` links only. 20 a minute per link |
| `POST /hooks/joinvoo/account` | The customer tapped "Connect" in Joinvoo (`consent: true`): a free Replyvoo account for this Voo ID with the email Joinvoo confirmed, or the missing workspace. Refused (`email_exists`, `need_login`) when another Replyvoo account has that email or the email isn't confirmed: then the customer opens Replyvoo with the Voo login as before. The consent is written to `audit` (`joinvoo.account`). 5 a minute per link |

The language picked in Joinvoo is stored as `persona.lang` and kept when the Closer is saved in the Studio. With a language the AI starts in
that language and still switches when the customer clearly writes in another one; without one it answers in the customer's language as before.
Plans and paying with Joinvoo credits use the routes that already existed (`/hooks/joinvoo/catalog`, `/purchase`, `/purchase-status`, refunds
back to Joinvoo): nothing changed there.

Deploy order for Update 68: deploy this Replyvoo branch **first**, then Joinvoo. Rollback: redeploy the previous Replyvoo build (Joinvoo's
wizard then shows "Replyvoo isn't answering right now" and nothing else changes); Closers made or edited from Joinvoo stay as normal Closers.

