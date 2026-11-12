CREATE TABLE workspace_roles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  system_key TEXT CHECK (system_key IN ('admin', 'collaborator')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((workspace_id IS NULL) = (system_key IS NOT NULL)),
  UNIQUE (workspace_id, name)
);

CREATE TABLE workspace_role_permissions (
  role_id TEXT NOT NULL REFERENCES workspace_roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

INSERT INTO workspace_roles (id, workspace_id, name, system_key, created_at, updated_at)
VALUES ('admin', NULL, 'Administrador', 'admin', unixepoch() * 1000, unixepoch() * 1000),
       ('collaborator', NULL, 'Colaborador', 'collaborator', unixepoch() * 1000, unixepoch() * 1000);

INSERT INTO workspace_role_permissions (role_id, permission)
VALUES
  ('admin', 'accounts.read'), ('admin', 'accounts.write'), ('admin', 'accounts.delete'),
  ('admin', 'listings.read'), ('admin', 'listings.write'),
  ('admin', 'promotions.read'), ('admin', 'promotions.write'), ('admin', 'promotions.delete'),
  ('admin', 'products.read'), ('admin', 'products.write'), ('admin', 'products.delete'),
  ('admin', 'history.read'), ('admin', 'settings.read'), ('admin', 'settings.write'),
  ('collaborator', 'accounts.read'),
  ('collaborator', 'listings.read'), ('collaborator', 'listings.write'),
  ('collaborator', 'promotions.read'), ('collaborator', 'promotions.write'), ('collaborator', 'promotions.delete'),
  ('collaborator', 'products.read'), ('collaborator', 'history.read');

ALTER TABLE workspace_members ADD COLUMN role_id TEXT REFERENCES workspace_roles(id);
UPDATE workspace_members SET role_id = role;

ALTER TABLE workspace_invitations ADD COLUMN role_id TEXT REFERENCES workspace_roles(id) ON DELETE SET NULL;
UPDATE workspace_invitations SET role_id = role;

CREATE INDEX idx_workspace_roles_workspace ON workspace_roles(workspace_id, name);
CREATE UNIQUE INDEX idx_workspace_roles_name_ci ON workspace_roles(workspace_id, lower(name)) WHERE workspace_id IS NOT NULL;
CREATE INDEX idx_workspace_members_role ON workspace_members(role_id);
CREATE INDEX idx_workspace_invitations_role ON workspace_invitations(role_id);
