-- Replyvoo initial schema
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  email_verified INTEGER NOT NULL DEFAULT 0,
  moji TEXT NOT NULL DEFAULT '{}',
  suspended INTEGER NOT NULL DEFAULT 0,
  last_login TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id INTEGER,
  ip TEXT, ua TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_month REAL NOT NULL DEFAULT 0,
  price_year REAL NOT NULL DEFAULT 0,
  closers INTEGER NOT NULL DEFAULT 1,
  conversations INTEGER NOT NULL DEFAULT 50,
  seats INTEGER NOT NULL DEFAULT 1,
  channels_text TEXT NOT NULL DEFAULT '',
  extra_chat_price REAL NOT NULL DEFAULT 0,
  pro_brain_chats INTEGER NOT NULL DEFAULT 0,
  features TEXT NOT NULL DEFAULT '[]',
  badge TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT 'Get started',
  popular INTEGER NOT NULL DEFAULT 0,
  elite INTEGER NOT NULL DEFAULT 0,
  contact_sales INTEGER NOT NULL DEFAULT 0,
  offer TEXT NOT NULL DEFAULT '{}',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE packs (
  id INTEGER PRIMARY KEY,
  credits INTEGER NOT NULL,
  bonus INTEGER NOT NULL DEFAULT 0,
  price REAL NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE addons (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_text TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'live',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE coupons (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'percent',
  value REAL NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'all',
  plan_ids TEXT NOT NULL DEFAULT '[]',
  max_uses INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  first_purchase_only INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE workspaces (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  plan_id TEXT NOT NULL DEFAULT 'spark',
  plan_interval TEXT NOT NULL DEFAULT 'month',
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  conv_used INTEGER NOT NULL DEFAULT 0,
  pro_used INTEGER NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL DEFAULT 0,
  extra_closer_slots INTEGER NOT NULL DEFAULT 0,
  extra_seats INTEGER NOT NULL DEFAULT 0,
  auto_topup INTEGER NOT NULL DEFAULT 0,
  ref_code TEXT NOT NULL UNIQUE,
  referred_by INTEGER,
  settings TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  reminded_at TEXT,
  report_sent_on TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE members (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'agent',
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE invites (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by INTEGER,
  accepted_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE channels (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  token_enc TEXT NOT NULL DEFAULT '',
  webhook_secret TEXT NOT NULL DEFAULT '',
  closer_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  last_update_id INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_channels_ws ON channels(workspace_id);

CREATE TABLE closers (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT 'sales',
  persona TEXT NOT NULL DEFAULT '{}',
  skills TEXT NOT NULL DEFAULT '{}',
  instructions TEXT NOT NULL DEFAULT '',
  knowledge TEXT NOT NULL DEFAULT '',
  pay_link TEXT NOT NULL DEFAULT '',
  pro_brain INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  replies INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_closers_ws ON closers(workspace_id);

CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id INTEGER,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT '',
  heat TEXT NOT NULL DEFAULT 'cold',
  stage TEXT NOT NULL DEFAULT 'new',
  notes TEXT NOT NULL DEFAULT '',
  value REAL NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  last_seen TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, channel_id, external_id)
);

CREATE TABLE threads (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  business_connection_id TEXT NOT NULL DEFAULT '',
  closer_id INTEGER,
  ai_on INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  unread INTEGER NOT NULL DEFAULT 0,
  window_start TEXT,
  unit_replies INTEGER NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 0,
  nudged_at TEXT,
  last_customer_at TEXT,
  last_message_at TEXT NOT NULL,
  last_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (channel_id, chat_id, business_connection_id)
);
CREATE INDEX idx_threads_ws ON threads(workspace_id, last_message_at);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  dir TEXT NOT NULL,
  author TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  text TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_thread ON messages(thread_id, id);
CREATE INDEX idx_messages_ws ON messages(workspace_id, id);

CREATE TABLE credit_tx (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_credit_ws ON credit_tx(workspace_id, id);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
  user_id INTEGER,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  interval TEXT NOT NULL DEFAULT '',
  amount_usd REAL NOT NULL,
  discount_usd REAL NOT NULL DEFAULT 0,
  coupon_id INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  amount_local REAL NOT NULL DEFAULT 0,
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  meta TEXT NOT NULL DEFAULT '{}',
  paid_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_orders_ws ON orders(workspace_id);

CREATE TABLE referral_earnings (
  id INTEGER PRIMARY KEY,
  referrer_ws INTEGER NOT NULL,
  referee_ws INTEGER NOT NULL,
  order_id INTEGER NOT NULL UNIQUE,
  rate REAL NOT NULL,
  amount_usd REAL NOT NULL,
  credits INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE blasts (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  segment TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_events_ws ON events(workspace_id, id);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Product',
  cover TEXT NOT NULL DEFAULT 'rocket',
  keywords TEXT NOT NULL DEFAULT '',
  read_time TEXT NOT NULL DEFAULT '5 min',
  body_md TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  body_md TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE clicks (
  id INTEGER PRIMARY KEY,
  target TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  workspace_id INTEGER,
  user_id INTEGER,
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE waitlist (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER,
  email TEXT NOT NULL DEFAULT '',
  item TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, email, item)
);

CREATE TABLE email_log (
  id INTEGER PRIMARY KEY,
  to_email TEXT NOT NULL,
  template TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE audit (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE contact_messages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'chat',
  created_at TEXT NOT NULL
);
