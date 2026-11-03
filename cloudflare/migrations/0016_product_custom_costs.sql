ALTER TABLE products DROP COLUMN variable_cost_cents;
ALTER TABLE products ADD COLUMN custom_costs_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(custom_costs_json));
