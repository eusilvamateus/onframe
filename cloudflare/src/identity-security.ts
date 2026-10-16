export type IdentityRuntimeEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ONFRAME_DB: D1Database;
};

export type IdentityState = {
  subject: string;
  email: string;
  version: number;
  reason: string | null;
  sessionActive: boolean;
};

export class IdentitySecurityError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const REASONS = new Set(['email_changed', 'password_changed', 'identity_access_changed', 'mfa_factor_removed', 'mfa_factor_added']);

export function validIdentityId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export async function loadIdentityState(env: IdentityRuntimeEnv, subject: string, authSessionId: string): Promise<IdentityState | null> {
  if (!validIdentityId(subject) || !validIdentityId(authSessionId)) {
    throw new IdentitySecurityError('identity_session_invalid', 401);
  }
  const origin = String(env.SUPABASE_URL || '').trim();
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/u.test(origin) || !serviceKey) {
    throw new IdentitySecurityError('identity_security_unconfigured', 503);
  }
  let payload: unknown;
  try {
    const response = await fetch(`${origin}/rest/v1/rpc/onframe_identity_state`, {
      method: 'POST',
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_user_id: subject, p_session_id: authSessionId }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error('identity_lookup_failed');
    payload = await response.json();
  } catch {
    throw new IdentitySecurityError('identity_security_unavailable', 503);
  }
  if (payload === null) return null;
  if (!payload || typeof payload !== 'object') throw new IdentitySecurityError('identity_security_unavailable', 503);
  const state = payload as Partial<IdentityState>;
  if (state.subject !== subject || typeof state.email !== 'string'
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(state.email) || state.email.length > 320
    || !Number.isSafeInteger(state.version) || Number(state.version) < 1
    || typeof state.sessionActive !== 'boolean'
    || (state.reason !== null && (typeof state.reason !== 'string' || !REASONS.has(state.reason)))) {
    throw new IdentitySecurityError('identity_security_unavailable', 503);
  }
  return { subject, email: state.email.toLowerCase(), version: Number(state.version), reason: state.reason ?? null, sessionActive: state.sessionActive };
}

export async function synchronizeIdentity(env: IdentityRuntimeEnv, state: IdentityState): Promise<void> {
  const timestamp = Date.now();
  // Condicoes de versao impedem uma resposta antiga de restaurar email ou acesso.
  await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare(`
      INSERT OR IGNORE INTO audit_events (id, workspace_id, user_id, request_id, operation, target_type, target_id, outcome, status_code, metadata_json, created_at)
      SELECT ?, NULL, id, ?, 'identity_security_changed', 'user', id, 'success', 200, ?, ?
      FROM users WHERE identity_subject = ? AND identity_version > 0 AND identity_version < ?
    `).bind(`identity:${state.subject}:${state.version}`, crypto.randomUUID(), JSON.stringify({ version: state.version, reason: state.reason }), timestamp, state.subject, state.version),
    env.ONFRAME_DB.prepare(`
      UPDATE users SET email = ?, identity_version = ?, updated_at = ?
      WHERE identity_subject = ? AND identity_version <= ?
    `).bind(state.email, state.version, timestamp, state.subject, state.version),
    env.ONFRAME_DB.prepare(`
      UPDATE extension_sessions SET revoked_at = ?
      WHERE user_id IN (SELECT id FROM users WHERE identity_subject = ?)
        AND revoked_at IS NULL AND (identity_version IS NULL OR identity_version < ?)
    `).bind(timestamp, state.subject, state.version),
    env.ONFRAME_DB.prepare(`
      UPDATE extension_auth_flows SET expires_at = 0
      WHERE user_id IN (SELECT id FROM users WHERE identity_subject = ?)
        AND claimed_at IS NULL AND (identity_version IS NULL OR identity_version < ?)
    `).bind(state.subject, state.version)
  ]);
}

export async function requireIdentitySession(env: IdentityRuntimeEnv, subject: string, authSessionId: string, version: number): Promise<IdentityState> {
  const state = await loadIdentityState(env, subject, authSessionId);
  if (!state) {
    await env.ONFRAME_DB.prepare(`
      UPDATE extension_sessions SET revoked_at = ?
      WHERE user_id IN (SELECT id FROM users WHERE identity_subject = ?) AND revoked_at IS NULL
    `).bind(Date.now(), subject).run();
    throw new IdentitySecurityError('identity_session_invalid', 401);
  }
  if (state.version !== version) await synchronizeIdentity(env, state);
  if (!state.sessionActive || state.version !== version) {
    await env.ONFRAME_DB.prepare(`
      UPDATE extension_sessions SET revoked_at = ?
      WHERE auth_session_id = ? AND revoked_at IS NULL
    `).bind(Date.now(), authSessionId).run();
    throw new IdentitySecurityError('identity_session_invalid', 401);
  }
  return state;
}
