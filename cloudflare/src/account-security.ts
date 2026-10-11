import Bowser from 'bowser';
import { IdentitySecurityError, validIdentityId, type IdentityRuntimeEnv } from './identity-security';

export async function securityRpc(env: IdentityRuntimeEnv, name: string, payload: Record<string, unknown>): Promise<unknown> {
  const origin = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/u.test(origin) || !key) throw new IdentitySecurityError('identity_security_unconfigured', 503);
  try {
    const response = await fetch(`${origin}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error('security_rpc_failed');
    return await response.json();
  } catch {
    throw new IdentitySecurityError('identity_security_unavailable', 503);
  }
}

export function deviceDescription(userAgent: unknown) {
  const ua = typeof userAgent === 'string' ? userAgent.slice(0, 512) : '';
  const parsed = ua ? Bowser.parse(ua) : { browser: { name: undefined }, os: { name: undefined }, platform: { type: undefined } };
  return {
    browser: parsed.browser.name || 'Navegador não identificado',
    operatingSystem: parsed.os.name || 'Sistema não identificado',
    deviceType: parsed.platform.type === 'mobile' ? 'mobile' : parsed.platform.type === 'tablet' ? 'tablet' : 'computer'
  };
}

export async function accountSecurity(env: IdentityRuntimeEnv, subject: string, currentSessionId: string) {
  const result = await securityRpc(env, 'onframe_security_overview', { p_user_id: subject });
  if (!result || typeof result !== 'object') throw new IdentitySecurityError('identity_security_unavailable', 503);
  const value = result as { sessions?: Array<Record<string, unknown>>; factors?: unknown[]; passkeys?: unknown[] };
  if (!Array.isArray(value.sessions) || !Array.isArray(value.factors) || !Array.isArray(value.passkeys)) throw new IdentitySecurityError('identity_security_unavailable', 503);
  const activity = await env.ONFRAME_DB.prepare(`SELECT auth_session_id, max(last_seen_at) AS last_seen_at
    FROM extension_sessions WHERE user_id IN (SELECT id FROM users WHERE identity_subject = ?)
      AND revoked_at IS NULL AND expires_at > ? GROUP BY auth_session_id`)
    .bind(subject, Date.now()).all<{ auth_session_id: string; last_seen_at: number | null }>();
  const lastSeen = new Map(activity.results.map((session) => [session.auth_session_id, session.last_seen_at || 0]));
  return {
    factors: value.factors, passkeys: value.passkeys,
    sessions: value.sessions.map((session) => {
      if (!validIdentityId(session.id)) throw new IdentitySecurityError('identity_security_unavailable', 503);
      const providerTime = Date.parse(String(session.lastSeenAt || session.createdAt));
      const timestamp = Math.max(Number.isFinite(providerTime) ? providerTime : 0, lastSeen.get(session.id) || 0);
      return { id: session.id, current: session.id === currentSessionId, createdAt: session.createdAt,
        lastSeenAt: timestamp ? new Date(timestamp).toISOString() : null, ...deviceDescription(session.userAgent) };
    })
  };
}

export async function revokeProviderSessions(env: IdentityRuntimeEnv, subject: string, sessionId: string | null) {
  if (!validIdentityId(subject) || (sessionId !== null && !validIdentityId(sessionId))) throw new IdentitySecurityError('invalid_session_revoke', 400);
  const result = await securityRpc(env, 'onframe_revoke_sessions', { p_user_id: subject, p_session_id: sessionId });
  if (!Number.isSafeInteger(result) || Number(result) < 0) throw new IdentitySecurityError('identity_security_unavailable', 503);
  // O provedor e revogado primeiro: uma falha no D1 nunca restaura o acesso.
  await env.ONFRAME_DB.prepare(`UPDATE extension_sessions SET revoked_at = ?
    WHERE user_id IN (SELECT id FROM users WHERE identity_subject = ?)
      AND revoked_at IS NULL AND (? IS NULL OR auth_session_id = ?)`)
    .bind(Date.now(), subject, sessionId, sessionId).run();
  return Number(result);
}
