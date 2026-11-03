CREATE TABLE product_tax_rates_migration_0017 AS
  SELECT id AS product_id, tax_rate_bps FROM products;

ALTER TABLE products DROP COLUMN tax_rate_bps;
ALTER TABLE products ADD COLUMN tax_rate_bps INTEGER CHECK (tax_rate_bps >= 0 AND tax_rate_bps <= 10000);

UPDATE products
SET tax_rate_bps = (
  SELECT migration.tax_rate_bps
  FROM product_tax_rates_migration_0017 migration
  WHERE migration.product_id = products.id
);

DROP TABLE product_tax_rates_migration_0017;

CREATE TABLE workspace_tax_rates (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  tax_rate_bps INTEGER NOT NULL CHECK (tax_rate_bps >= 0 AND tax_rate_bps <= 10000),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_seller_accounts_id_workspace
  ON seller_accounts(id, workspace_id);
CREATE UNIQUE INDEX idx_products_id_workspace
  ON products(id, workspace_id);

CREATE TABLE seller_account_tax_rates (
  workspace_id TEXT NOT NULL,
  seller_account_id TEXT PRIMARY KEY,
  tax_rate_bps INTEGER NOT NULL CHECK (tax_rate_bps >= 0 AND tax_rate_bps <= 10000),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (seller_account_id, workspace_id) REFERENCES seller_accounts(id, workspace_id) ON DELETE CASCADE
);

CREATE TABLE product_account_tax_rates (
  workspace_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  seller_account_id TEXT NOT NULL,
  tax_rate_bps INTEGER NOT NULL CHECK (tax_rate_bps >= 0 AND tax_rate_bps <= 10000),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (product_id, seller_account_id),
  FOREIGN KEY (product_id, workspace_id) REFERENCES products(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (seller_account_id, workspace_id) REFERENCES seller_accounts(id, workspace_id) ON DELETE CASCADE
);

CREATE INDEX idx_product_account_tax_rates_account
  ON product_account_tax_rates(seller_account_id, product_id);
