-- Website AI chat: a new channel type ('website') with an embeddable widget.
-- Plan gating: how many website widgets a plan includes, and whether it may hide the
-- "Powered by Replyvoo" link or add custom CSS.
ALTER TABLE plans ADD COLUMN website_sites INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN remove_branding INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN custom_css INTEGER NOT NULL DEFAULT 0;

UPDATE plans SET website_sites = 0, remove_branding = 0, custom_css = 0 WHERE id IN ('spark', 'starter', 'growth');
UPDATE plans SET website_sites = 1, remove_branding = 0, custom_css = 0 WHERE id = 'pro';
UPDATE plans SET website_sites = 3, remove_branding = 1, custom_css = 1 WHERE id = 'business';
UPDATE plans SET website_sites = 10, remove_branding = 1, custom_css = 1 WHERE id = 'titan';
UPDATE plans SET website_sites = 999, remove_branding = 1, custom_css = 1 WHERE id = 'black';

-- Feature lines on the plan cards (only added once, only for the known plans).
UPDATE plans SET features = json_insert(features, '$[#]', 'Website AI chat (1 site)') WHERE id = 'pro' AND json_valid(features) AND features NOT LIKE '%Website AI chat%';
UPDATE plans SET features = json_insert(features, '$[#]', 'Website AI chat on 3 sites, your branding only') WHERE id = 'business' AND json_valid(features) AND features NOT LIKE '%Website AI chat%';
UPDATE plans SET features = json_insert(features, '$[#]', 'Website AI chat on 10 sites, your branding only') WHERE id = 'titan' AND json_valid(features) AND features NOT LIKE '%Website AI chat%';
UPDATE plans SET features = json_insert(features, '$[#]', 'Website AI chat on every site, your branding only') WHERE id = 'black' AND json_valid(features) AND features NOT LIKE '%Website AI chat%';

-- The Website chat power-up (only when the pricing catalogue was already seeded).
INSERT OR IGNORE INTO addons (slug, name, description, price_text, price, credits, status, sort, active)
  SELECT 'website-chat', 'Website chat', 'Website AI chat for 1 site on any plan, 30 days.', '$29 / mo', 29, 0, 'live', 3, 1
  WHERE EXISTS (SELECT 1 FROM plans);

-- Leads captured by the website widget.
ALTER TABLE contacts ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN phone TEXT NOT NULL DEFAULT '';

-- Logo, avatar and launcher images uploaded in Widget Studio (kept out of channels.data so it stays small).
CREATE TABLE widget_assets (
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, kind)
);

CREATE INDEX idx_channels_ext ON channels(type, external_id);
