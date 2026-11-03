-- VooSquare: Voo ID login, shared referrals, events outbox and tool-to-tool links.
ALTER TABLE users ADD COLUMN voo_id TEXT;
ALTER TABLE users ADD COLUMN referred_by TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN country TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX idx_users_voo_id ON users(voo_id) WHERE voo_id IS NOT NULL;

-- Events waiting to be posted to VooSquare (sent by a background job, retried for 24 hours).
CREATE TABLE voo_outbox (
  id INTEGER PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at TEXT NOT NULL,
  sent_at TEXT,
  failed_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_voo_outbox_due ON voo_outbox(sent_at, failed_at, next_at);

-- Links between Zedapex tools that the user switched on in VooSquare (one scoped key per link).
CREATE TABLE voo_links (
  id INTEGER PRIMARY KEY,
  voo_id TEXT NOT NULL,
  link TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_enc TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  UNIQUE (voo_id, link)
);
