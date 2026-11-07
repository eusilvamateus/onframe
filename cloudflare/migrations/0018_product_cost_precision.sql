ALTER TABLE products ADD COLUMN current_cost_decimal TEXT NOT NULL DEFAULT '0';

UPDATE products
SET current_cost_decimal = CASE
  WHEN current_cost_cents % 100 = 0 THEN CAST(current_cost_cents / 100 AS TEXT)
  ELSE RTRIM(RTRIM(printf('%.2f', current_cost_cents / 100.0), '0'), '.')
END;

ALTER TABLE products DROP COLUMN current_cost_cents;

ALTER TABLE product_cost_history ADD COLUMN cost_decimal TEXT NOT NULL DEFAULT '0';

UPDATE product_cost_history
SET cost_decimal = CASE
  WHEN cost_cents % 100 = 0 THEN CAST(cost_cents / 100 AS TEXT)
  ELSE RTRIM(RTRIM(printf('%.2f', cost_cents / 100.0), '0'), '.')
END;

ALTER TABLE product_cost_history DROP COLUMN cost_cents;
