# Gatevoo crypto checkout

> **Contract (matches Gatevoo's own code, Nov 2026).** `POST /invoices` takes `{ amount_usd, order_id, customer_name, customer_email, description, redirect_url, metadata }` and returns `{ id, status, checkout_url }`. Webhooks send `X-Gatevoo-Timestamp` (unix seconds) and `X-Gatevoo-Signature` = lowercase hex HMAC-SHA256(webhook secret, `${timestamp}.${rawBody}`), no prefix; older than 5 minutes is refused. The body is `{ id, type, created, data: invoice }`. `invoice.test` is answered 200 and credits nothing. Only `invoice.paid` with `data.status = "paid"` and `data.amount_usd` ≥ the order amount credits, after Replyvoo reads the invoice back from Gatevoo; retries never credit twice; status `review` is never auto-credited. Gatevoo's checkout refuses iframes, so Replyvoo always opens `checkout_url` as a full-page redirect. Older field names further down (`reference`, `paid_usd`, `payment.*`, `t=…,v1=…`) are superseded by this note.

Replyvoo takes **USDT (TRON / TRC20)** and **Bitcoin** through **Gatevoo**, Zedapex's own non-custodial crypto
checkout. The money goes straight to the Zedapex wallet, and orders activate on their own once the coins land.

| Mode | When | What customers see |
| --- | --- | --- |
| **Live** | `GATEVOO_API_KEY` and `GATEVOO_WEBHOOK_SECRET` are set | Gatevoo's real hosted payment page |
| **Sandbox** | No keys, `PAYMENTS_DEMO=true` | A practice Gatevoo page at `/pay/gatevoo/<ref>`, with no real coins |
| **Off** | No keys, `PAYMENTS_DEMO=false` | No crypto option (the manual USDT backup shows if it's switched on) |

## 1. Go live (5 minutes)

1. In the Gatevoo dashboard, create an API key for Replyvoo and a webhook secret.
2. Add the webhook URL `https://replyvoo.com/webhooks/gatevoo` (Admin → Billing rules shows it with a Copy button).
3. On Railway, set:
   ```
   GATEVOO_API_KEY=gv_live_...
   GATEVOO_WEBHOOK_SECRET=...
   # Optional, only if Gatevoo's API lives somewhere else:
   GATEVOO_API_URL=https://gatevoo.com            (a bare host gets /api/v1 added)
   ```
4. Open **Admin → Billing rules → Gatevoo** and press **Test connection**. It should say "Connected".
5. Pick the coins (USDT, Bitcoin or both). Turning off "Offer crypto at checkout" hides it.

## 2. How a payment flows

1. The customer picks **Crypto** at checkout, chooses USDT or Bitcoin, and presses **Pay**.
2. Replyvoo creates an order (`provider = gatevoo`, status `pending`) and calls `POST /invoices` on Gatevoo.
3. The customer is redirected to the invoice's `checkout_url`, where they pay.
4. Gatevoo calls `POST /webhooks/gatevoo` (signed). Replyvoo **does not trust the body**: it fetches the invoice from
   Gatevoo again (`GET /invoices/:id`) and only then activates the order.
5. Gatevoo sends the customer to `success_url` (`/pay/callback?ref=...`). The dashboard shows "Confirming your
   payment" and then "Payment received!".

The checks Replyvoo makes:

- The invoice id must match the one stored on the order.
- The order only activates when status is `paid`/`confirmed`/`completed` **and** `paid_usd` is at least the order total
  (1 cent tolerance).
- Underpaid invoices stay pending and are flagged in Admin → Orders for a person to sort out.
- `expired` / `cancelled` / `failed` invoices mark the order failed.
- Webhooks are idempotent. A replay never gives the plan or credits twice.

Admins can press **Check payment** on any pending Gatevoo order in Admin → Orders to ask Gatevoo again. Paid orders
show the coin, the amount, and a link to the transaction on Tronscan or mempool.space.

## 3. API contract Gatevoo must provide

Base URL: `GATEVOO_API_URL` (default `https://gatevoo.com/api/v1`; `api.gatevoo.com` does not exist). Every request sends
`Authorization: Bearer <GATEVOO_API_KEY>`. Responses are JSON, either the object itself or wrapped in `{ "data": ... }`.
Errors use a non-2xx status with `{ "error": { "message": "..." } }`.

### `GET /me`
Used by "Test connection". Returns `{ "name": "Zedapex" }` (any 2xx means the key works; 401 means a bad key).

### `POST /invoices`
Header `Idempotency-Key: replyvoo-<order ref>`: the same key must return the same invoice.
```json
{
  "reference": "RV-MUSHVY5M-35E9E1",
  "amount": { "value": "70.00", "currency": "USD" },
  "coins": ["USDT_TRC20", "BTC"],
  "preferred_coin": "BTC",
  "description": "Replyvoo · 2,000 + 200 bonus Voo Credits",
  "customer": { "email": "buyer@example.com", "name": "Grace Lee" },
  "success_url": "https://replyvoo.com/pay/callback?ref=RV-...",
  "cancel_url": "https://replyvoo.com/app/wallet?cancelled=RV-...",
  "webhook_url": "https://replyvoo.com/webhooks/gatevoo",
  "expires_in": 3600,
  "metadata": { "app": "replyvoo", "workspace_id": 12, "kind": "pack" }
}
```
Response (201):
```json
{ "id": "inv_123", "reference": "RV-...", "status": "pending", "checkout_url": "https://pay.gatevoo.com/i/inv_123", "expires_at": "2026-10-03T15:00:00Z" }
```
`checkout_url` must be `https://`.

### `GET /invoices/:id`
```json
{
  "id": "inv_123",
  "reference": "RV-...",
  "status": "pending | confirming | paid | underpaid | expired | cancelled",
  "paid_usd": 70.00,
  "payment": { "coin": "USDT_TRC20", "amount": "70.00", "tx_hash": "abc...", "confirmations": 20 }
}
```
`paid_usd` is the USD value Gatevoo credits, worked out at the locked rate.

### Webhook `POST <webhook_url>`
Body: `{ "type": "invoice.paid", "data": { "id": "inv_123", "reference": "RV-...", ... } }`. Send it on every status change.

Header: `X-Gatevoo-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`. Replyvoo rejects
signatures older than 5 minutes. Retry with backoff on non-2xx for up to 24 hours.

Coins: `USDT_TRC20` (USDT on TRON) and `BTC`. More can be added later. Replyvoo shows whatever the admin switches on.

## 4. Prompt for the Gatevoo builder

Paste this into the AI that builds Gatevoo so the two sides fit:

```
Add a merchant API to Gatevoo so Zedapex apps (starting with Replyvoo) can take USDT (TRC20) and Bitcoin payments.

1. API keys: merchants create a secret API key (prefix gv_live_) and a webhook secret in the dashboard. Every API call uses
   Authorization: Bearer <key>. GET /v1/me returns {"name": "<merchant name>"}; a bad key returns 401.
2. POST /v1/invoices with body {reference, amount:{value:"70.00", currency:"USD"}, coins:["USDT_TRC20","BTC"],
   preferred_coin, description, customer:{email,name}, success_url, cancel_url, webhook_url, expires_in (seconds),
   metadata}. Honour the Idempotency-Key header (same key = same invoice). Lock the coin rate for expires_in. Return 201
   {id, reference, status:"pending", checkout_url (https, hosted payment page), expires_at}.
3. Hosted page at checkout_url: Gatevoo branding (black and white, the G mark with the green dot), merchant name, USD
   amount, coin tabs, exact coin amount, a unique deposit address per invoice in the merchant's own wallet
   (non-custodial: derive from the merchant's xpub for BTC, and a dedicated TRON address for USDT), a QR code, a countdown,
   and live steps (Waiting, Seen on chain, Confirmed). Once paid, redirect to success_url; Cancel goes to cancel_url.
4. Watch the chains. USDT TRC20: 20 confirmations. BTC: 2 confirmations. Status moves pending, then confirming, then paid.
   Partial payment is underpaid; past expires_at with nothing received is expired. Record payment {coin, amount,
   tx_hash, confirmations} and paid_usd at the locked rate.
5. GET /v1/invoices/:id returns {id, reference, status, paid_usd, payment:{coin, amount, tx_hash, confirmations}}.
6. Webhooks: on every status change POST {"type":"invoice.<status>","data":<invoice>} to webhook_url with header
   X-Gatevoo-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(webhook_secret, "<t>.<raw body>")>. Retry with backoff for up
   to 24 hours until a 2xx comes back.
7. Errors: non-2xx with {"error":{"message":"..."}}.
8. In the Gatevoo dashboard, list invoices per app with status, coin, amount, tx link (Tronscan / mempool.space) and
   the merchant reference.

Show me the changed files and a short test checklist when done.
```
