ALTER TABLE products ADD COLUMN minimum_contribution_margin_bps INTEGER
  CHECK (minimum_contribution_margin_bps IS NULL OR minimum_contribution_margin_bps BETWEEN 0 AND 10000);

CREATE TABLE workspace_margin_settings (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  minimum_contribution_margin_bps INTEGER NOT NULL
    CHECK (minimum_contribution_margin_bps BETWEEN 0 AND 10000),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
