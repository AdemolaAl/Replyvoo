-- Yearly plans: conversations reset every month inside the paid year. Tracks the start of the current monthly cycle.
ALTER TABLE workspaces ADD COLUMN usage_reset_at TEXT;
