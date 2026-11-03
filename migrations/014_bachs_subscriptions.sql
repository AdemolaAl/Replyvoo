-- Bachs card auto-renew (src/services/bachs-subs.js). Monthly and yearly plans paid by card through Bachs renew by
-- themselves; bank transfer, mobile money and crypto stay one-off. Never edits older migrations.
CREATE TABLE IF NOT EXISTS bachs_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL, user_id INTEGER, sub_id TEXT UNIQUE, customer_id TEXT,
  plan_id TEXT, interval TEXT, currency TEXT, amount_local REAL, amount_usd REAL, product_id TEXT, first_order_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending', current_period_end TEXT, paid_through TEXT, cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0, past_due_since TEXT, last_failure TEXT, grace_until TEXT,
  next_amount_local REAL, next_product_id TEXT, price_move TEXT, flag TEXT, reminded TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bachs_subs_ws ON bachs_subscriptions(workspace_id);
CREATE TABLE IF NOT EXISTS bachs_events (event_id TEXT PRIMARY KEY, type TEXT, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bachs_products (plan_id TEXT, interval TEXT, currency TEXT, amount TEXT, product_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (plan_id, interval, currency, amount));
