-- Customer fee per payment method (Admin → Billing rules → Payment method fees). Never edits older migrations.
--  * The fee is built into the price the customer sees for that method (no separate fee line). Plans, credits and
--    power-ups are always worth the base price; the fee is kept apart on the order.
--  * orders.amount_usd stays the base price (after any coupon), so revenue, coupons, Voo Squad rewards and VooSquare
--    events keep using the base. orders.fee_usd is the fee on top, fee_pct the rate used. The customer paid
--    amount_usd + fee_usd (amount_local is that total in the order's currency).
ALTER TABLE orders ADD COLUMN fee_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN fee_pct REAL NOT NULL DEFAULT 0;

-- Fill the fee for each method once, only where it is empty. A value the owner already set is never changed.
-- Bachs is a third-party platform: 4% by default, in any currency. Gatevoo is always 0%. Every other method: 0%.
INSERT INTO settings (key, value, updated_at) VALUES ('billing', '{}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(key) DO NOTHING;
UPDATE settings SET value = json_set(value, '$.method_fees.bachs', 4) WHERE key = 'billing' AND json_valid(value) AND (json_type(value, '$.method_fees.bachs') IS NULL OR json_type(value, '$.method_fees.bachs') = 'null' OR json_extract(value, '$.method_fees.bachs') = '');
UPDATE settings SET value = json_set(value, '$.method_fees.gatevoo', 0) WHERE key = 'billing' AND json_valid(value) AND (json_type(value, '$.method_fees.gatevoo') IS NULL OR json_type(value, '$.method_fees.gatevoo') = 'null' OR json_extract(value, '$.method_fees.gatevoo') = '');
UPDATE settings SET value = json_set(value, '$.method_fees.paystack', 0) WHERE key = 'billing' AND json_valid(value) AND (json_type(value, '$.method_fees.paystack') IS NULL OR json_type(value, '$.method_fees.paystack') = 'null' OR json_extract(value, '$.method_fees.paystack') = '');
UPDATE settings SET value = json_set(value, '$.method_fees.flutterwave', 0) WHERE key = 'billing' AND json_valid(value) AND (json_type(value, '$.method_fees.flutterwave') IS NULL OR json_type(value, '$.method_fees.flutterwave') = 'null' OR json_extract(value, '$.method_fees.flutterwave') = '');
UPDATE settings SET value = json_set(value, '$.method_fees.crypto', 0) WHERE key = 'billing' AND json_valid(value) AND (json_type(value, '$.method_fees.crypto') IS NULL OR json_type(value, '$.method_fees.crypto') = 'null' OR json_extract(value, '$.method_fees.crypto') = '');
UPDATE settings SET value = json_set(value, '$.method_fees.demo', 0) WHERE key = 'billing' AND json_valid(value) AND (json_type(value, '$.method_fees.demo') IS NULL OR json_type(value, '$.method_fees.demo') = 'null' OR json_extract(value, '$.method_fees.demo') = '');
