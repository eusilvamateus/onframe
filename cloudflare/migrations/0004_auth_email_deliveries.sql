CREATE TABLE auth_email_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  email_action_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  lease_expires_at INTEGER,
  sent_at INTEGER,
  UNIQUE (webhook_id, recipient_hash)
);

CREATE INDEX idx_auth_email_deliveries_status_lease
  ON auth_email_deliveries (status, lease_expires_at);
