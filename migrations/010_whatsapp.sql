-- WhatsApp (Meta's WhatsApp Business Platform, Cloud API) as a channel. Never edits older migrations.
-- A WhatsApp number is a row in channels: type 'whatsapp', external_id = the phone number id, token_enc = the business
-- token (AES-256-GCM), data = { waba_id, display_phone, verified_name, quality, nudge_template_id, pin_enc, ... }.

-- Every WhatsApp message id we have seen (inbound: de-duplication of Meta's retries) or sent (outbound: the
-- sent / delivered / read / failed status updates land on the right inbox message).
CREATE TABLE wa_messages (
  wamid TEXT PRIMARY KEY,
  channel_id INTEGER NOT NULL,
  message_id INTEGER,
  dir TEXT NOT NULL DEFAULT 'in',
  status TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_wa_messages_msg ON wa_messages(message_id);

-- Message templates of each connected WhatsApp Business Account (synced from Meta, or made in the template builder).
CREATE TABLE wa_templates (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL,
  waba_id TEXT NOT NULL,
  meta_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'MARKETING',
  status TEXT NOT NULL DEFAULT 'PENDING',
  components TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (waba_id, name, language)
);
CREATE INDEX idx_wa_templates_ws ON wa_templates(workspace_id, status);

-- WhatsApp opt-out ("STOP"): no Blasts or template Nudges any more. Replies to their own messages still work.
ALTER TABLE contacts ADD COLUMN opt_out_at TEXT;

-- Blasts can go to Telegram (as before) or to WhatsApp, where they must use an approved template.
ALTER TABLE blasts ADD COLUMN channel TEXT NOT NULL DEFAULT 'telegram';
ALTER TABLE blasts ADD COLUMN template_id INTEGER;
ALTER TABLE blasts ADD COLUMN template_vars TEXT NOT NULL DEFAULT '[]';
ALTER TABLE blasts ADD COLUMN opted_out INTEGER NOT NULL DEFAULT 0;
