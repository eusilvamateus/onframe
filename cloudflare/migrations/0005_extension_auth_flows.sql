CREATE TABLE extension_auth_flows (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  claimed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_extension_auth_flows_expiry ON extension_auth_flows(expires_at);
