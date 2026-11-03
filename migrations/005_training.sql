-- Agent Studio training: structured knowledge, rules, training state and saved versions.

-- Structured knowledge a Closer uses to answer (Q&A, products, policies, imported docs, corrections).
CREATE TABLE closer_knowledge (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  closer_id INTEGER NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'qa',            -- qa | product | policy | doc | correction
  title TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',            -- JSON: alt phrasings, price, currency, stock, link, sku, policy topic, gap key...
  source TEXT NOT NULL DEFAULT 'manual',      -- manual | import_url | import_file | correction | gap
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_ck_closer ON closer_knowledge(closer_id, kind);
CREATE INDEX idx_ck_ws ON closer_knowledge(workspace_id);

-- Owner rules (do/don't lists, discounts, handoff triggers, language...) and training state
-- (custom scenarios, scenario runs, dismissed gaps, coach progress).
ALTER TABLE closers ADD COLUMN rules TEXT NOT NULL DEFAULT '{}';
ALTER TABLE closers ADD COLUMN training TEXT NOT NULL DEFAULT '{}';

-- The last saved versions of a Closer's personality, instructions and rules (kept: 10 per Closer).
CREATE TABLE closer_versions (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  closer_id INTEGER NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
  user_id INTEGER,
  label TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_cv_closer ON closer_versions(closer_id, id);
