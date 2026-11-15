CREATE TABLE product_bulk_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('selected', 'queued', 'running', 'completed', 'partial', 'failed')),
  action TEXT CHECK (action IN ('update', 'delete', 'restore', 'permanent')),
  changes_json TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX idx_product_bulk_jobs_actor ON product_bulk_jobs(workspace_id, user_id, created_at DESC);

CREATE TABLE product_bulk_job_items (
  job_id TEXT NOT NULL REFERENCES product_bulk_jobs(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  error_code TEXT,
  PRIMARY KEY (job_id, product_id)
);

CREATE INDEX idx_product_bulk_job_items_status ON product_bulk_job_items(job_id, status, product_id);
