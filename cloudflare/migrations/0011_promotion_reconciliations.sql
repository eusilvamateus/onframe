CREATE TABLE promotion_reconciliations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  seller_account_id TEXT NOT NULL REFERENCES seller_accounts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  accepted_result_json TEXT NOT NULL DEFAULT '{}',
  actor_name TEXT,
  actor_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'unconfirmed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  workflow_started_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_promotion_reconciliations_workspace_user
  ON promotion_reconciliations(workspace_id, user_id, created_at DESC);
CREATE INDEX idx_promotion_reconciliations_pending
  ON promotion_reconciliations(status, updated_at)
  WHERE status = 'pending';

CREATE UNIQUE INDEX idx_item_edit_events_idempotent
  ON item_edit_events(request_id, item_id, change_type, action);
