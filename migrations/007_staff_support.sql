-- Admin staff with roles and per-page access, staff invites, 2-step login, and the support desk.

-- Who can open the admin panel. Role gives the default access; perms overrides it per page.
CREATE TABLE staff (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'support',          -- owner | admin | support | finance | content | viewer
  perms TEXT NOT NULL DEFAULT '{}',              -- {"orders":"view","support":"edit",...} overrides
  all_boxes INTEGER NOT NULL DEFAULT 1,          -- 1 = every support box
  boxes TEXT NOT NULL DEFAULT '[]',              -- support box ids when all_boxes = 0
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',         -- active | disabled
  source TEXT NOT NULL DEFAULT 'replyvoo',       -- replyvoo | voosquare
  invited_by INTEGER,
  created_at TEXT NOT NULL,
  last_seen TEXT
);

CREATE TABLE staff_invites (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL,
  perms TEXT NOT NULL DEFAULT '{}',
  all_boxes INTEGER NOT NULL DEFAULT 1,
  boxes TEXT NOT NULL DEFAULT '[]',
  title TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by INTEGER,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL
);

-- When this session passed the emailed 6-digit code (staff only).
ALTER TABLE sessions ADD COLUMN mfa_at TEXT;

-- Everyone who was an admin before keeps full access as an owner.
INSERT INTO staff (user_id, role, created_at) SELECT id, 'owner', created_at FROM users WHERE role = 'admin';

CREATE TABLE support_boxes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#FFC21A',
  description TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
INSERT INTO support_boxes (name, color, description, sort, created_at) VALUES
  ('General', '#FFC21A', 'Questions from the website and new visitors', 1, datetime('now')),
  ('Billing', '#7EE0B0', 'Payments, plans, credits and refunds', 2, datetime('now')),
  ('Setup help', '#8FB8FF', 'Connecting Telegram, training Closers, website chat', 3, datetime('now')),
  ('Sales', '#FFB199', 'Big teams, custom plans and partnerships', 4, datetime('now'));

CREATE TABLE support_tickets (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  box_id INTEGER,
  source TEXT NOT NULL,                          -- web_chat | telegram | dashboard | contact | sales | email | voosquare
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',           -- open | pending | solved
  priority TEXT NOT NULL DEFAULT 'normal',       -- normal | high | urgent
  assignee_id INTEGER,
  requester_name TEXT NOT NULL DEFAULT '',
  requester_email TEXT NOT NULL DEFAULT '',
  requester_user_id INTEGER,
  workspace_id INTEGER,
  tg_chat_id TEXT NOT NULL DEFAULT '',
  tg_username TEXT NOT NULL DEFAULT '',
  unread INTEGER NOT NULL DEFAULT 0,             -- customer messages staff have not opened
  customer_unread INTEGER NOT NULL DEFAULT 0,    -- staff replies the customer has not seen (dashboard)
  last_text TEXT NOT NULL DEFAULT '',
  last_message_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  solved_at TEXT,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_tickets_box ON support_tickets(box_id, status, last_message_at);
CREATE INDEX idx_tickets_assignee ON support_tickets(assignee_id, status);
CREATE INDEX idx_tickets_tg ON support_tickets(tg_chat_id);
CREATE INDEX idx_tickets_user ON support_tickets(requester_user_id);

CREATE TABLE support_messages (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  dir TEXT NOT NULL,                             -- in | out | note | system
  author_id INTEGER,
  author_name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  via TEXT NOT NULL DEFAULT '',
  failed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_support_msgs ON support_messages(ticket_id, id);

CREATE TABLE support_saved_replies (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL
);
INSERT INTO support_saved_replies (title, text, created_at) VALUES
  ('Welcome', 'Hi {{name}}, thanks for reaching out to Replyvoo! I’m on it and will get back to you shortly.', datetime('now')),
  ('Connect a Telegram bot', 'Here’s the quickest way: open @BotFather in Telegram, send /newbot, copy the token it gives you, then paste it in Replyvoo under Channels → Connect Telegram. Your Closer starts replying straight away.', datetime('now')),
  ('Payment received', 'Thanks {{name}}! Your payment is confirmed and your plan is active. Anything else I can help with?', datetime('now')),
  ('Closing the ticket', 'Glad we could help, {{name}}! I’ll close this ticket now. Just reply here if anything else comes up.', datetime('now'));

-- Support events go to a separate VooSquare endpoint; the outbox remembers where each event goes.
ALTER TABLE voo_outbox ADD COLUMN url TEXT NOT NULL DEFAULT '';
