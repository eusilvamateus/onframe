CREATE TABLE products (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  normalized_sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  current_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (current_cost_cents >= 0),
  tax_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_bps >= 0 AND tax_rate_bps <= 10000),
  variable_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (variable_cost_cents >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  archived_at INTEGER,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_products_workspace_sku_active
  ON products(workspace_id, normalized_sku)
  WHERE archived_at IS NULL;
CREATE INDEX idx_products_workspace_updated
  ON products(workspace_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE product_cost_history (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
  effective_at INTEGER NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_product_cost_history_product_effective
  ON product_cost_history(product_id, effective_at DESC);

CREATE TABLE product_listing_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_account_id TEXT NOT NULL REFERENCES seller_accounts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  variation_id TEXT NOT NULL DEFAULT '',
  seller_sku TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_product_listing_links_listing
  ON product_listing_links(seller_account_id, item_id, variation_id);
CREATE INDEX idx_product_listing_links_product
  ON product_listing_links(product_id, created_at DESC);
