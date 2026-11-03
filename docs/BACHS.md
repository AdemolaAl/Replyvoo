# Bachs (naira and African payments)

Bachs (bachs.io) is a hosted checkout for African cards, bank transfer, mobile money and USDT/USDC. It works like Castvoo's
Bachs provider, on Replyvoo's own orders. Code: `src/services/bachs.js`, `src/services/payments.js`, `POST /webhooks/bachs`
(`src/routes/webhooks.js`), Admin → Connections → Bachs, tests in `test/bachs.test.js`.

## Who sees it

- Customers whose country is one of the Bachs countries (default `NG KE GH ZA CM UG TZ RW ZM ET EG MA CI SN BJ TG SL LR ZW BW`,
  editable in the admin), and customers whose country is not known yet.
- **Nigeria pays in naira**: the US-dollar price × the naira rate (Admin → Connections → Bachs → "Naira rate", or Billing
  rules → Currencies → NGN when that field is empty). The checkout shows the naira amount before paying. Other countries pay
  in US dollars. Plans, credits and power-ups are always worth the US-dollar price.
- The customer's country comes from VooSquare (Voo ID sign-up), the hosting edge's country header at sign-up when present,
  or Settings → Country.

## Going live

1. Bachs → Developer Portal: create a live secret key (`sk_live_…`) and a webhook signing secret (`whsec_…`), and add the
   webhook URL `https://replyvoo.com/webhooks/bachs`.
2. Replyvoo → Admin → Connections → Bachs (owners only): paste both, press **Test key** ("Connected"), switch on
   **Show Bachs to customers**, save. Or set `BACHS_SECRET_KEY` / `BACHS_WEBHOOK_SECRET` (the admin values win).
3. A sandbox key (`sk_sandbox_…`) can be saved and tested but is never shown to customers (test payments would give real plans),
   unless `BACHS_ALLOW_SANDBOX=true`.

## How a payment flows

1. Checkout creates a pending order (`provider = bachs`, `currency = NGN|USD`, `amount_local`) and calls
   `POST /v1/checkout-sessions` with `Idempotency-Key: <order ref>`, our reference, the amount, the customer's email and
   `success_url = /pay/callback?ref=…`. The customer goes to Bachs's `checkout_url`. If Bachs cannot start, the order is marked
   failed and the customer sees "Bachs could not start the payment".
2. Bachs calls `POST /webhooks/bachs`. The signature is checked first: `X-Bachs-Signature` = hex HMAC-SHA256(webhook secret,
   `<X-Bachs-Timestamp>.<raw body>`), at most 5 minutes old (the `t=…,v1=…` form is accepted). Wrong or missing → 401.
3. The webhook only makes us **ask Bachs** (`GET /v1/checkout-sessions/:id`). The order is fulfilled only if Bachs says
   COMPLETED/succeeded, the reference and checkout id are ours, and the amount and currency are at least what we asked.
   FAILED/EXPIRED/CANCELLED mark a pending order failed (a later "completed" still fulfils it). Fulfilment is idempotent:
   repeat webhooks, the return page and Admin → Orders → Check payment never give twice.
4. If Bachs cannot be asked, the webhook answers 502 so Bachs retries.

## Refunds and chargebacks

Refund the money in Bachs, then record it in **Admin → Orders → Refund** (or **Chargeback**). What was bought is taken back
(plan time, pack credits, power-up), a chargeback also reverses the Voo Squad reward, and VooSquare gets a `refund` /
`chargeback` event.

## Unverified assumption

The request and answer shapes follow Castvoo's Bachs provider (`/v1/checkout-sessions`, `checkout_url`, `checkout_id`,
`status`, `pricing`). They have not been tried against Bachs's live API from here: make one real ₦ payment in production
before announcing it.

## Auto-renew (card subscriptions)

Code: `src/services/bachs-subs.js`, migration `014_bachs_subscriptions.sql`. Tests: `test/bachs-subs.test.js`.

- **Checkout.** A monthly or yearly plan paid with Bachs shows **Renew automatically** (on by default, not with a coupon).
  Replyvoo makes a Bachs recurring product (`POST /v1/products` with `billing_cycle {interval, frequency: 1}`), then
  `POST /v1/checkout-sessions` with `product_cart`. Off: the normal one-off payment (bank transfer, mobile money, crypto)
  with the renewal reminder as before.
- **Price.** Base price + the Bachs fee from Billing rules → Payment method fees (4%), built in; naira at the Bachs or
  Billing rules NGN rate.
- **Webhooks** on `/webhooks/bachs` (V2 signature accepted). Each event id is handled once. `invoice.paid` → one order
  (`provider_ref = inv_<invoice id>`) fulfilled by `payments.fulfill`, only after `GET /v1/subscriptions/:id` says it is
  ours and active. The renewal sets the period end from Bachs and starts the new period's allowance.
  `invoice.payment_failed` → past due, one `payment-failed` email, a wallet notice with **Update card** (Bachs portal);
  the plan keeps working for 7 days while Bachs retries, then goes back to the free plan (`workspace.ensurePeriod`).
- **Cancel.** Wallet → **Cancel auto-renew** → `DELETE /v1/subscriptions/:id` with `cancel_at_period_end: true`.
- **Reminders.** `card-renews-soon` 3 days before each charge (and 7 days before a yearly one) with the exact amount. The
  plain `renewal-reminder` skips auto-renewing workspaces.
- **Price follows the naira rate.** Moved to a new product for the next cycle (`PATCH /v1/subscriptions/:id`). If Bachs
  refuses, a renewal under the base price is still given, flagged (order `meta.review_flag`, Admin API
  `GET /api/admin/bachs/subscriptions`), and the move is retried.
- **Flag.** `PUT /api/admin/connections/bachs { recurring: false }` or `BACHS_RECURRING=off`. If Bachs refuses recurring
  products, checkout quietly uses one-off payments for 24 hours.

Not verified against a live Bachs account: the cancel verb and body, the price-move body (`{product_id, prorate: false}`),
the invoice field names (`subscription_id`, `amount_paid`, `currency`, `period_end`, `billing_reason`), and whether a recurring
checkout offers only cards. Test one real subscription and one renewal before announcing it.

Bachs dashboard: a live key with subscription access; webhook `https://<replyvoo domain>/webhooks/bachs` subscribed to
`checkout.completed`, `collection.succeeded`, `collection.failed`, `checkout.expired`, `invoice.paid`,
`invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`;
cards only for recurring products; Bachs's retry schedule and customer portal turned on.
