ALTER TABLE users ADD COLUMN identity_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE extension_sessions ADD COLUMN identity_version INTEGER;
ALTER TABLE extension_sessions ADD COLUMN auth_session_id TEXT;
ALTER TABLE extension_auth_flows ADD COLUMN identity_version INTEGER;
ALTER TABLE extension_auth_flows ADD COLUMN auth_session_id TEXT;

-- Sessoes antigas nao comprovam vinculo com uma sessao do provedor.
UPDATE extension_sessions
SET revoked_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE revoked_at IS NULL;
UPDATE extension_auth_flows
SET expires_at = 0
WHERE claimed_at IS NULL;
