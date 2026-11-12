ALTER TABLE workspace_roles ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1));

INSERT INTO workspace_roles (id, workspace_id, name, system_key, created_at, updated_at, is_default)
SELECT 'collaborator:' || id, id, 'Colaborador', NULL, unixepoch() * 1000, unixepoch() * 1000, 1
FROM workspaces;

INSERT INTO workspace_role_permissions (role_id, permission)
SELECT 'collaborator:' || workspaces.id, permissions.permission
FROM workspaces CROSS JOIN workspace_role_permissions AS permissions
WHERE permissions.role_id = 'collaborator';

UPDATE workspace_members SET role_id = 'collaborator:' || workspace_id WHERE role_id = 'collaborator';
UPDATE workspace_invitations SET role_id = 'collaborator:' || workspace_id WHERE role_id = 'collaborator';
DELETE FROM workspace_roles WHERE id = 'collaborator';

ALTER TABLE workspace_members DROP COLUMN role;
ALTER TABLE workspace_invitations DROP COLUMN role;

CREATE UNIQUE INDEX idx_workspace_roles_default ON workspace_roles(workspace_id) WHERE is_default = 1;

CREATE TRIGGER workspace_members_require_role_insert
BEFORE INSERT ON workspace_members WHEN NEW.role_id IS NULL
BEGIN SELECT RAISE(ABORT, 'workspace_role_required'); END;

CREATE TRIGGER workspace_members_require_role_update
BEFORE UPDATE OF role_id ON workspace_members WHEN NEW.role_id IS NULL
BEGIN SELECT RAISE(ABORT, 'workspace_role_required'); END;
