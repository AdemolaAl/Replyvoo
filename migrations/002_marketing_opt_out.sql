-- Lets people opt out of broadcast (marketing) emails. Account emails are always sent.
ALTER TABLE users ADD COLUMN marketing_opt_out INTEGER NOT NULL DEFAULT 0;
