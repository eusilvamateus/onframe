CREATE TABLE item_edit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  seller_account_id TEXT REFERENCES seller_accounts(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_title TEXT,
  item_thumbnail_url TEXT,
  item_permalink TEXT,
  account_name TEXT,
  account_meli_user_id TEXT,
  actor_name TEXT,
  actor_email TEXT,
  change_type TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_item_edit_events_workspace_created
  ON item_edit_events(workspace_id, created_at DESC, id DESC);
CREATE INDEX idx_item_edit_events_item_created
  ON item_edit_events(workspace_id, item_id, created_at DESC);
CREATE INDEX idx_item_edit_events_account_created
  ON item_edit_events(seller_account_id, created_at DESC);
CREATE INDEX idx_item_edit_events_user_created
  ON item_edit_events(user_id, created_at DESC);
