CREATE TABLE workspace_members_next (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'collaborator')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

INSERT INTO workspace_members_next (workspace_id, user_id, role, created_at, updated_at)
SELECT workspace_id,
       user_id,
       CASE WHEN role = 'owner' THEN 'admin' ELSE 'collaborator' END,
       created_at,
       updated_at
FROM workspace_members;

DROP TABLE workspace_members;
ALTER TABLE workspace_members_next RENAME TO workspace_members;

CREATE TABLE account_members_next (
  seller_account_id TEXT NOT NULL REFERENCES seller_accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (seller_account_id, user_id)
);

INSERT INTO account_members_next (seller_account_id, user_id, created_at, updated_at)
SELECT seller_account_id, user_id, created_at, updated_at
FROM account_members;

DROP TABLE account_members;
ALTER TABLE account_members_next RENAME TO account_members;

ALTER TABLE users ADD COLUMN avatar_url TEXT;

CREATE TABLE workspace_invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'link')),
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'collaborator')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  accepted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((kind = 'email' AND email IS NOT NULL) OR kind = 'link'),
  CHECK (expires_at > created_at)
);

CREATE TABLE workspace_invitation_accounts (
  invitation_id TEXT NOT NULL REFERENCES workspace_invitations(id) ON DELETE CASCADE,
  seller_account_id TEXT NOT NULL REFERENCES seller_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (invitation_id, seller_account_id)
);

CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_account_members_user ON account_members(user_id);
CREATE INDEX idx_workspace_invitations_workspace ON workspace_invitations(workspace_id, created_at DESC);
CREATE INDEX idx_workspace_invitations_email ON workspace_invitations(workspace_id, email, expires_at);
CREATE INDEX idx_workspace_invitation_accounts_account ON workspace_invitation_accounts(seller_account_id);
