-- Voo Connect (VooSquare kit) and Bachs naira payments. Never edits older migrations.

-- The kit's event outbox, kept in our own database (one row) so queued events survive restarts and deploys.
CREATE TABLE voo_queue (
  id INTEGER PRIMARY KEY,
  queue TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
-- Events VooSquare refused for good (shown in Admin → Billing rules → VooSquare).
CREATE TABLE voo_failed (
  id INTEGER PRIMARY KEY,
  event_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
-- "chat_answered" is sent once per customer workspace per hour, with the count in the label.
CREATE TABLE voo_activity (
  workspace_id INTEGER NOT NULL,
  hour TEXT NOT NULL,
  chats INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, hour)
);
-- When the account was linked to a Voo ID.
ALTER TABLE users ADD COLUMN voo_linked_at TEXT;
-- Bachs webhooks may name only the checkout id.
CREATE INDEX IF NOT EXISTS idx_orders_provider_ref ON orders(provider, provider_ref);
