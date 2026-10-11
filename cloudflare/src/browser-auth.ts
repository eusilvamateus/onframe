import { createClient } from '@supabase/supabase-js';
import { loadIdentityState, synchronizeIdentity, validIdentityId, type IdentityRuntimeEnv } from './identity-security';

export type SupabaseAuthRuntimeEnv = {
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_URL?: string;
};

export type SupabaseIdentity = {
  email: string;
  name: string;
  subject: string;
  authSessionId: string;
  identityVersion: number;
};

export class SupabaseAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status: number
  ) {
    super(code);
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function configuredText(value: string | undefined, code: string): string {
  const text = String(value || '').trim();
  if (!text) throw new SupabaseAuthError(code, 503);
  return text;
}

function client(env: SupabaseAuthRuntimeEnv) {
  return createClient(
    configuredText(env.SUPABASE_URL, 'supabase_auth_unconfigured'),
    configuredText(env.SUPABASE_PUBLISHABLE_KEY, 'supabase_auth_unconfigured'),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      }
    }
  );
}

function identityFromUser(value: unknown): Pick<SupabaseIdentity, 'subject' | 'email' | 'name'> {
  if (!value || typeof value !== 'object') throw new SupabaseAuthError('supabase_identity_invalid', 401);
  const user = value as {
    email?: unknown;
    id?: unknown;
    user_metadata?: { display_name?: unknown } | null;
  };
  const subject = typeof user.id === 'string' ? user.id.trim() : '';
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!subject || !EMAIL_PATTERN.test(email)) throw new SupabaseAuthError('supabase_identity_invalid', 401);

  const candidateName = typeof user.user_metadata?.display_name === 'string'
    ? user.user_metadata.display_name.trim()
    : '';
  return {
    subject,
    email,
    name: candidateName && candidateName.length <= 120 ? candidateName : email.split('@')[0]
  };
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer ([A-Za-z0-9._-]{20,4096})$/u.exec(authorization);
  if (!match) throw new SupabaseAuthError('supabase_unauthorized', 401);
  return match[1];
}

export async function authenticateSupabaseRequest(request: Request, env: SupabaseAuthRuntimeEnv & IdentityRuntimeEnv, options: { synchronizeOnly?: boolean } = {}): Promise<SupabaseIdentity> {
  const token = bearerToken(request);
  const { data, error } = await client(env).auth.getUser(token);
  if (error || !data.user) {
    if (error && (!error.status || error.status >= 500)) throw new SupabaseAuthError('identity_security_unavailable', 503);
    throw new SupabaseAuthError('supabase_unauthorized', 401);
  }
  const identity = identityFromUser(data.user);
  let authSessionId: unknown;
  try {
    // getUser acima valida o bearer; nunca confie em um JWT apenas decodificado.
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/gu, '+').replace(/_/gu, '/')));
    if (claims.sub !== identity.subject) throw new Error('subject_mismatch');
    authSessionId = claims.session_id;
  } catch {
    throw new SupabaseAuthError('supabase_identity_invalid', 401);
  }
  if (!validIdentityId(authSessionId)) throw new SupabaseAuthError('supabase_identity_invalid', 401);
  const state = await loadIdentityState(env, identity.subject, authSessionId);
  if (state) await synchronizeIdentity(env, state);
  if (!state || (!options.synchronizeOnly && !state.sessionActive) || state.email !== identity.email) throw new SupabaseAuthError('identity_session_invalid', 401);
  return { ...identity, email: state.email, authSessionId, identityVersion: state.version };
}
