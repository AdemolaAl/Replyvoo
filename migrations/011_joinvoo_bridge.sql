-- Joinvoo bridge: a Joinvoo customer hands a Telegram bot's private chats to Replyvoo (and back).
-- Joinvoo keeps the bot (its webhook and token). Replyvoo gets each update from Joinvoo and answers through Joinvoo.

-- One link per Voo ID (made by Joinvoo's server with the shared bridge secret). Every later call is signed with the
-- link's own secret, so a link can only ever act for its own Voo ID and the bots its Joinvoo account switched over.
CREATE TABLE jv_links (
  id INTEGER PRIMARY KEY,
  link_id TEXT NOT NULL UNIQUE,
  voo_id TEXT NOT NULL UNIQUE,
  secret_enc TEXT NOT NULL,
  jv_account TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Signed calls already seen (replay protection). Kept 15 minutes; a call older than 5 minutes is refused anyway.
CREATE TABLE jv_nonces (
  nonce TEXT PRIMARY KEY,
  seen_at INTEGER NOT NULL
);
CREATE INDEX idx_jv_nonces_seen ON jv_nonces(seen_at);

-- Messages that came over from Joinvoo carry Joinvoo's message id, so the same message is never stored twice.
ALTER TABLE messages ADD COLUMN ext_id TEXT;
CREATE UNIQUE INDEX idx_messages_ext ON messages(thread_id, ext_id) WHERE ext_id IS NOT NULL;

-- What Joinvoo knows about the person: the ad that brought them and their deposits (shown in the chat, given to the Closer).
ALTER TABLE contacts ADD COLUMN ext_context TEXT NOT NULL DEFAULT '';
