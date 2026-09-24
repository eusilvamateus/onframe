CREATE TABLE extension_pairings (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  claimed_session_id TEXT UNIQUE,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_extension_pairings_expiry ON extension_pairings(expires_at);
