CREATE TABLE promotion_bulk_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_item_id TEXT NOT NULL,
  seller_account_id TEXT REFERENCES seller_accounts(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('promotion.offer.create', 'promotion.offer.update', 'promotion.offer.delete')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'confirming', 'completed', 'partial', 'failed')),
  total INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  dismissed_at INTEGER
);

CREATE INDEX idx_promotion_bulk_jobs_actor ON promotion_bulk_jobs(workspace_id, user_id, source_item_id, created_at DESC);
CREATE UNIQUE INDEX idx_promotion_bulk_jobs_active ON promotion_bulk_jobs(workspace_id, user_id, source_item_id)
  WHERE status IN ('queued', 'running', 'confirming');

CREATE TABLE promotion_bulk_job_items (
  job_id TEXT NOT NULL REFERENCES promotion_bulk_jobs(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'applied', 'pending_confirmation', 'blocked', 'failed', 'unconfirmed')),
  message TEXT,
  result_json TEXT,
  reconciliation_id TEXT,
  PRIMARY KEY (job_id, item_id)
);

CREATE INDEX idx_promotion_bulk_job_items_status ON promotion_bulk_job_items(job_id, status, item_id);
