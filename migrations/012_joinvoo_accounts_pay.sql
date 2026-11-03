-- Joinvoo bridge, part 2:
--  * managers' own Telegram accounts (Telegram Business, held by Joinvoo) can be answered by Replyvoo too: channel type 'joinvoo_account'
--    (no schema change: channels.type is free text, external_id is the manager's Telegram user id);
--  * Replyvoo plans and Voo Credit packs can be paid with Joinvoo credits: one order per Joinvoo purchase id, never two.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_jv_purchase ON orders(provider_ref) WHERE provider = 'joinvoo_credits';
