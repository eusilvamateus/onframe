import { handleSupabaseSendEmailHook, type AuthEmailRuntimeEnv } from './auth-email';
import {
  authenticateSupabaseRequest,
  SupabaseAuthError,
  type SupabaseIdentity
} from './browser-auth';
import { captchaPage, captchaPageCsp, connectionPage, interactivePageCsp, invitationPage, resultPage } from './connect-page';
import { storageObjectUrl, storagePublicObjectPath, storageUploadFailureCode } from './avatar-storage';
import { base64Url, decryptValue as decryptTokenValue, encryptValue as encryptTokenValue, importAesGcmKeyBase64, type EncryptedValue } from './token-cipher';
import { handleRemoteApiRequest, remoteApiErrorPayload } from './remote-api';
import { IdentitySecurityError, requireIdentitySession } from './identity-security';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_FLOW_TTL_MS = 30 * 60 * 1000;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const MELI_OAUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const MELI_AUTHORIZATION_URL = 'https://auth.mercadolivre.com.br/authorization';
const MELI_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
const MELI_ME_URL = 'https://api.mercadolibre.com/users/me';
const MELI_TOKEN_KEY_VERSION = 2;
const EXTENSION_ID = 'lcmagfimconmglpokmlkcjieohohnigj';

type RuntimeEnv = Env & AuthEmailRuntimeEnv & {
  MELI_CLIENT_ID?: string;
  MELI_CLIENT_SECRET?: string;
  MELI_REDIRECT_URI?: string;
  MELI_TOKEN_CIPHER_KEY_BASE64?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TURNSTILE_SITEKEY?: string;
};

type Actor = SupabaseIdentity & {
  userId: string;
  workspaceId: string;
};

type HealthResponse = {
  ok: boolean;
  service: 'onframe-api';
  timestamp: string;
};

type ExtensionAuthFlow = {
  expiresAt: number;
  token: string;
};

type ExtensionSessionActor = {
  sessionId: string;
  userId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  workspaceName: string;
  workspaceRole: 'admin' | 'collaborator';
  label: string | null;
  expiresAt: number;
  subject: string;
  authSessionId: string;
  identityVersion: number;
};

type MeliToken = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope?: string;
  token_type?: string;
  user_id?: number | string;
};

type MeliProfile = {
  id: number | string;
  nickname?: string;
  permalink?: string;
  site_id?: string;
  logo?: string;
  thumbnail?: {
    picture_url?: string;
    secure_url?: string;
  } | string;
  profile_picture?: string;
  picture_url?: string;
};

type OAuthTransaction = {
  id: string;
  user_id: string;
  workspace_id: string;
  code_verifier_ciphertext: string;
  code_verifier_iv: string;
  code_verifier_auth_tag: string;
  redirect_uri: string;
};

class RequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number
  ) {
    super(code);
  }
}

function json(payload: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('cache-control', 'no-store');
  return Response.json(payload, { status, headers: responseHeaders });
}

function html(content: string, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('cache-control', 'no-store');
  if (!responseHeaders.has('content-security-policy')) {
    responseHeaders.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  }
  responseHeaders.set('content-type', 'text/html; charset=utf-8');
  responseHeaders.set('x-content-type-options', 'nosniff');

  return new Response(content, {
    status,
    headers: responseHeaders
  });
}

function now(): number {
  return Date.now();
}

function randomSecret(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Base64Url(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return base64Url(digest);
}

function meliRedirectUri(env: RuntimeEnv): string {
  return String(env.MELI_REDIRECT_URI || '').trim();
}

function assertMeliConfigured(env: RuntimeEnv): asserts env is RuntimeEnv & {
  MELI_CLIENT_ID: string;
  MELI_CLIENT_SECRET: string;
  MELI_REDIRECT_URI: string;
  MELI_TOKEN_CIPHER_KEY_BASE64: string;
} {
  if (
    !String(env.MELI_CLIENT_ID || '').trim()
    || !String(env.MELI_CLIENT_SECRET || '').trim()
    || !meliRedirectUri(env)
    || !String(env.MELI_TOKEN_CIPHER_KEY_BASE64 || '').trim()
  ) {
    throw new RequestError('remote_oauth_unconfigured', 503);
  }
}

async function encryptValue(env: RuntimeEnv, value: string): Promise<EncryptedValue> {
  assertMeliConfigured(env);
  return encryptTokenValue(await importMeliTokenCipherKey(env), value);
}

async function decryptValue(env: RuntimeEnv, encrypted: EncryptedValue): Promise<string> {
  assertMeliConfigured(env);
  return decryptTokenValue(await importMeliTokenCipherKey(env), encrypted);
}

async function importMeliTokenCipherKey(env: RuntimeEnv): Promise<CryptoKey> {
  try {
    return await importAesGcmKeyBase64(env.MELI_TOKEN_CIPHER_KEY_BASE64);
  } catch {
    throw new RequestError('remote_oauth_unconfigured', 503);
  }
}

function meliAuthorizationUrl(env: RuntimeEnv, state: string, codeChallenge: string): string {
  assertMeliConfigured(env);
  const url = new URL(MELI_AUTHORIZATION_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.MELI_CLIENT_ID);
  url.searchParams.set('redirect_uri', meliRedirectUri(env));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

async function readMeliResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseMeliToken(value: unknown): MeliToken {
  if (!value || typeof value !== 'object') throw new RequestError('meli_token_exchange_failed', 502);
  const token = value as Record<string, unknown>;
  const accessToken = typeof token.access_token === 'string' ? token.access_token.trim() : '';
  const refreshToken = typeof token.refresh_token === 'string' ? token.refresh_token.trim() : '';
  const expiresIn = Number(token.expires_in);

  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new RequestError('meli_token_exchange_failed', 502);
  }

  return {
    access_token: accessToken,
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: typeof token.scope === 'string' ? token.scope : undefined,
    token_type: typeof token.token_type === 'string' ? token.token_type : undefined,
    user_id: typeof token.user_id === 'number' || typeof token.user_id === 'string' ? token.user_id : undefined
  };
}

async function exchangeMeliAuthorizationCode(env: RuntimeEnv, code: string, transaction: OAuthTransaction): Promise<MeliToken> {
  assertMeliConfigured(env);
  const codeVerifier = await decryptValue(env, {
    ciphertext: transaction.code_verifier_ciphertext,
    iv: transaction.code_verifier_iv,
    authTag: transaction.code_verifier_auth_tag
  });
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.MELI_CLIENT_ID,
    client_secret: env.MELI_CLIENT_SECRET,
    code,
    redirect_uri: transaction.redirect_uri,
    code_verifier: codeVerifier
  });
  const response = await fetch(MELI_TOKEN_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });
  const payload = await readMeliResponse(response);
  if (!response.ok) throw new RequestError('meli_token_exchange_failed', 502);
  return parseMeliToken(payload);
}

function parseMeliProfile(value: unknown): MeliProfile {
  if (!value || typeof value !== 'object') throw new RequestError('meli_profile_lookup_failed', 502);
  const profile = value as Record<string, unknown>;
  if (typeof profile.id !== 'string' && typeof profile.id !== 'number') {
    throw new RequestError('meli_profile_lookup_failed', 502);
  }

  return profile as MeliProfile;
}

async function loadMeliProfile(accessToken: string): Promise<MeliProfile> {
  const response = await fetch(MELI_ME_URL, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`
    }
  });
  const payload = await readMeliResponse(response);
  if (!response.ok) throw new RequestError('meli_profile_lookup_failed', 502);
  return parseMeliProfile(payload);
}

function profileLogoUrl(profile: MeliProfile): string | null {
  const thumbnail = profile.thumbnail;
  const candidates = [
    profile.logo,
    thumbnail && typeof thumbnail === 'object' ? thumbnail.picture_url : null,
    thumbnail && typeof thumbnail === 'object' ? thumbnail.secure_url : null,
    typeof thumbnail === 'string' ? thumbnail : null,
    profile.profile_picture,
    profile.picture_url
  ];

  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate.trim() : '';
    if (/^https:\/\/(?:[a-z0-9-]+\.)*mlstatic\.com\//iu.test(value)) return value;
  }

  return null;
}

async function stableId(prefix: string, subject: string): Promise<string> {
  return `${prefix}_${(await sha256(subject)).slice(0, 32)}`;
}

function logFailure(requestId: string, request: Request, error: unknown): void {
  console.error(JSON.stringify({
    event: 'request_failed',
    requestId,
    method: request.method,
    path: new URL(request.url).pathname,
    error: error instanceof Error ? error.message : 'unknown_error'
  }));
}

async function provisionActor(env: Env, identity: SupabaseIdentity): Promise<Actor> {
  const existingUsers = await env.ONFRAME_DB.prepare(`
    SELECT id
    FROM users
    WHERE identity_subject = ?
    ORDER BY created_at
    LIMIT 2
  `).bind(identity.subject).all<{ id: string }>();
  const knownIds = Array.from(new Set(existingUsers.results.map((user) => user.id)));
  if (knownIds.length > 1) throw new RequestError('identity_conflict', 409);
  const emailConflict = await env.ONFRAME_DB.prepare(`
    SELECT id FROM users WHERE email = ? AND (identity_subject IS NULL OR identity_subject <> ?)
  `).bind(identity.email, identity.subject).first<{ id: string }>();
  if (emailConflict) throw new RequestError('identity_conflict', 409);

  const userId = knownIds[0] || await stableId('usr', identity.subject);
  const existingWorkspace = await env.ONFRAME_DB.prepare(`
    SELECT id
    FROM workspaces
    WHERE created_by_user_id = ?
    ORDER BY created_at
    LIMIT 1
  `).bind(userId).first<{ id: string }>();
  const workspaceId = existingWorkspace?.id || await stableId('wsp', identity.subject);
  const timestamp = now();

  await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare(`
      INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        identity_subject = excluded.identity_subject,
        email = excluded.email,
        display_name = COALESCE(users.display_name, excluded.display_name),
        updated_at = excluded.updated_at,
        identity_version = excluded.identity_version
      WHERE users.identity_version <= excluded.identity_version
    `).bind(userId, identity.subject, identity.email, identity.name, timestamp, timestamp, identity.identityVersion),
    env.ONFRAME_DB.prepare(`
      INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(workspaceId, `OnFrame - ${identity.name}`, userId, timestamp, timestamp),
    env.ONFRAME_DB.prepare(`
      INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at)
      VALUES (?, ?, 'admin', ?, ?)
      ON CONFLICT(workspace_id, user_id) DO NOTHING
    `).bind(workspaceId, userId, timestamp, timestamp)
  ]);

  return { ...identity, userId, workspaceId };
}

function configuredRuntimeText(value: string | undefined, code: string): string {
  const text = String(value || '').trim();
  if (!text) throw new RequestError(code, 503);
  return text;
}

function newExtensionSession(): { createdAt: number; expiresAt: number; sessionId: string; token: string } {
  const timestamp = now();
  return {
    createdAt: timestamp,
    expiresAt: timestamp + SESSION_TTL_MS,
    sessionId: crypto.randomUUID(),
    token: randomSecret(32)
  };
}

async function createExtensionSession(
  env: Env,
  actor: Pick<Actor, 'userId' | 'workspaceId' | 'identityVersion' | 'authSessionId'>,
  label: string | null = 'Extensão OnFrame'
): Promise<{ expiresAt: number; sessionId: string; token: string }> {
  const session = newExtensionSession();

  const inserted = await env.ONFRAME_DB.prepare(`
    INSERT INTO extension_sessions (id, token_hash, user_id, workspace_id, label, expires_at, created_at, identity_version, auth_session_id)
    SELECT ?, ?, id, ?, ?, ?, ?, ?, ? FROM users WHERE id = ? AND identity_version = ?
  `).bind(
    session.sessionId,
    await sha256(session.token),
    actor.workspaceId,
    label,
    session.expiresAt,
    session.createdAt,
    actor.identityVersion,
    actor.authSessionId,
    actor.userId,
    actor.identityVersion
  ).run();
  if (inserted.meta.changes !== 1) throw new RequestError('identity_session_invalid', 401);

  return session;
}

function createdExtensionSessionPayload(session: { expiresAt: number; sessionId: string; token: string }) {
  return {
    expiresAt: new Date(session.expiresAt).toISOString(),
    sessionId: session.sessionId,
    token: session.token
  };
}

async function createSessionFromSupabaseAuth(request: Request, env: RuntimeEnv, requestId: string): Promise<Response> {
  const actor = await provisionActor(env, await authenticateSupabaseRequest(request, env));
  const session = await createExtensionSession(env, actor);
  console.log(JSON.stringify({
    event: 'extension_session_created_from_auth',
    requestId,
    sessionId: session.sessionId,
    userId: actor.userId,
    workspaceId: actor.workspaceId,
    expiresAt: session.expiresAt
  }));
  return json(createdExtensionSessionPayload(session), 201);
}

function parseExtensionAuthFlowToken(value: string): string {
  if (!SESSION_TOKEN_PATTERN.test(value)) throw new RequestError('auth_flow_invalid', 400);
  return value;
}

async function createExtensionAuthFlow(env: Env): Promise<ExtensionAuthFlow> {
  const token = randomSecret(32);
  const timestamp = now();
  const expiresAt = timestamp + AUTH_FLOW_TTL_MS;
  await env.ONFRAME_DB.prepare(`
    INSERT INTO extension_auth_flows (id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(crypto.randomUUID(), await sha256(token), expiresAt, timestamp).run();
  return { token, expiresAt };
}

async function completeExtensionAuthFlow(
  request: Request,
  env: RuntimeEnv,
  flowToken: string,
  requestId: string
): Promise<Response> {
  const actor = await provisionActor(env, await authenticateSupabaseRequest(request, env));
  const timestamp = now();
  const result = await env.ONFRAME_DB.prepare(`
    UPDATE extension_auth_flows
    SET user_id = ?, workspace_id = ?, completed_at = ?, identity_version = ?, auth_session_id = ?
    WHERE token_hash = ?
      AND user_id IS NULL
      AND expires_at > ?
  `).bind(actor.userId, actor.workspaceId, timestamp, actor.identityVersion, actor.authSessionId, await sha256(flowToken), timestamp).run();
  if (result.meta.changes !== 1) throw new RequestError('auth_flow_unavailable', 409);

  console.log(JSON.stringify({
    event: 'extension_auth_flow_completed',
    requestId,
    userId: actor.userId,
    workspaceId: actor.workspaceId
  }));
  return json({ completed: true });
}

async function consumeExtensionAuthFlow(env: RuntimeEnv, flowToken: string, requestId: string): Promise<Response> {
  const timestamp = now();
  const flow = await env.ONFRAME_DB.prepare(`
    SELECT extension_auth_flows.id, user_id, workspace_id, expires_at, claimed_at,
      extension_auth_flows.identity_version, auth_session_id, users.identity_subject
    FROM extension_auth_flows LEFT JOIN users ON users.id = extension_auth_flows.user_id
    WHERE extension_auth_flows.token_hash = ?
  `).bind(await sha256(flowToken)).first<{
    id: string;
    user_id: string | null;
    workspace_id: string | null;
    expires_at: number;
    claimed_at: number | null;
    identity_version: number | null;
    auth_session_id: string | null;
    identity_subject: string | null;
  }>();

  if (!flow || flow.claimed_at || flow.expires_at <= timestamp) {
    throw new RequestError('auth_flow_unavailable', 404);
  }
  if (!flow.user_id || !flow.workspace_id) {
    return json({ status: 'pending', expiresAt: new Date(flow.expires_at).toISOString() });
  }
  if (!flow.identity_subject || !flow.auth_session_id || !flow.identity_version) throw new RequestError('auth_flow_unavailable', 401);
  await requireIdentitySession(env, flow.identity_subject, flow.auth_session_id, flow.identity_version);

  const claimed = await env.ONFRAME_DB.prepare(`
    UPDATE extension_auth_flows SET claimed_at = ?
    WHERE id = ? AND claimed_at IS NULL AND expires_at > ?
  `).bind(timestamp, flow.id, timestamp).run();
  if (claimed.meta.changes !== 1) throw new RequestError('auth_flow_unavailable', 409);
  const session = await createExtensionSession(env, {
    userId: flow.user_id, workspaceId: flow.workspace_id,
    identityVersion: flow.identity_version, authSessionId: flow.auth_session_id
  });
  console.log(JSON.stringify({
    event: 'extension_auth_flow_consumed',
    requestId,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt
  }));
  return json({ status: 'authenticated', ...createdExtensionSessionPayload(session) });
}

function sessionToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]+)$/u.exec(authorization);
  if (!match || !SESSION_TOKEN_PATTERN.test(match[1])) {
    throw new RequestError('extension_session_unauthorized', 401);
  }
  return match[1];
}

async function authenticateExtensionSession(request: Request, env: RuntimeEnv): Promise<ExtensionSessionActor> {
  const timestamp = now();
  const record = await env.ONFRAME_DB.prepare(`
    SELECT
      extension_sessions.id AS session_id,
      extension_sessions.user_id,
      extension_sessions.workspace_id,
      extension_sessions.label,
      extension_sessions.expires_at,
      extension_sessions.identity_version,
      extension_sessions.auth_session_id,
      users.identity_subject,
      users.email,
      users.display_name,
      users.avatar_url,
      workspaces.name AS workspace_name,
      workspace_members.role AS workspace_role
    FROM extension_sessions
    INNER JOIN users ON users.id = extension_sessions.user_id
    INNER JOIN workspaces ON workspaces.id = extension_sessions.workspace_id
    INNER JOIN workspace_members ON workspace_members.workspace_id = extension_sessions.workspace_id
      AND workspace_members.user_id = extension_sessions.user_id
    WHERE extension_sessions.token_hash = ?
      AND extension_sessions.revoked_at IS NULL
      AND extension_sessions.expires_at > ?
  `).bind(await sha256(sessionToken(request)), timestamp).first<{
    session_id: string;
    user_id: string;
    workspace_id: string;
    label: string | null;
    expires_at: number;
    identity_version: number | null;
    auth_session_id: string | null;
    identity_subject: string | null;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    workspace_name: string;
    workspace_role: 'admin' | 'collaborator';
  }>();

  if (!record) throw new RequestError('extension_session_unauthorized', 401);
  if (!record.identity_subject || !record.auth_session_id || !record.identity_version) throw new RequestError('identity_session_invalid', 401);
  const identity = await requireIdentitySession(env, record.identity_subject, record.auth_session_id, record.identity_version);

  const seen = await env.ONFRAME_DB.prepare(`
    UPDATE extension_sessions
    SET last_seen_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).bind(timestamp, record.session_id).run();
  if (seen.meta.changes !== 1) throw new RequestError('identity_session_invalid', 401);

  return {
    sessionId: record.session_id,
    userId: record.user_id,
    workspaceId: record.workspace_id,
    email: identity.email,
    displayName: record.display_name || record.email,
    avatarUrl: record.avatar_url,
    workspaceName: record.workspace_name,
    workspaceRole: record.workspace_role,
    label: record.label,
    expiresAt: record.expires_at,
    subject: identity.subject,
    authSessionId: record.auth_session_id,
    identityVersion: record.identity_version
  };
}

function extensionSessionPayload(actor: ExtensionSessionActor): Record<string, unknown> {
  return {
    session: {
      id: actor.sessionId,
      label: actor.label,
      expiresAt: new Date(actor.expiresAt).toISOString()
    },
    user: {
      id: actor.userId,
      email: actor.email,
      name: actor.displayName,
      avatarUrl: actor.avatarUrl
    },
    workspace: {
      id: actor.workspaceId,
      name: actor.workspaceName,
      role: actor.workspaceRole
    }
  };
}

async function revokeExtensionSession(actor: ExtensionSessionActor, env: Env): Promise<void> {
  const result = await env.ONFRAME_DB.prepare(`
    UPDATE extension_sessions
    SET revoked_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).bind(now(), actor.sessionId).run();

  if (result.meta.changes !== 1) throw new RequestError('extension_session_unauthorized', 401);
}

async function assertWorkspaceCanManageAccounts(actor: ExtensionSessionActor, env: RuntimeEnv): Promise<void> {
  const membership = await env.ONFRAME_DB.prepare(`
    SELECT role
    FROM workspace_members
    WHERE workspace_id = ? AND user_id = ?
  `).bind(actor.workspaceId, actor.userId).first<{ role: string }>();

  if (!membership || membership.role !== 'admin') {
    throw new RequestError('workspace_account_access_forbidden', 403);
  }
}

async function createMeliOAuthTransaction(env: RuntimeEnv, actor: ExtensionSessionActor): Promise<{ authorizationUrl: string }> {
  assertMeliConfigured(env);
  await assertWorkspaceCanManageAccounts(actor, env);

  const timestamp = now();
  const state = randomSecret(32);
  const codeVerifier = randomSecret(48);
  const encrypted = await encryptValue(env, codeVerifier);
  const redirectUri = meliRedirectUri(env);

  await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare('DELETE FROM oauth_transactions WHERE expires_at <= ?').bind(timestamp),
    env.ONFRAME_DB.prepare(`
      INSERT INTO oauth_transactions (
        id,
        state_hash,
        user_id,
        workspace_id,
        code_verifier_ciphertext,
        code_verifier_iv,
        code_verifier_auth_tag,
        redirect_uri,
        expires_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      await sha256(state),
      actor.userId,
      actor.workspaceId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      redirectUri,
      timestamp + MELI_OAUTH_TRANSACTION_TTL_MS,
      timestamp
    )
  ]);

  return {
    authorizationUrl: meliAuthorizationUrl(env, state, await sha256Base64Url(codeVerifier))
  };
}

async function consumeMeliOAuthTransaction(env: RuntimeEnv, state: string): Promise<OAuthTransaction> {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(state)) throw new RequestError('meli_oauth_state_invalid', 400);
  const timestamp = now();
  const stateHash = await sha256(state);
  const transaction = await env.ONFRAME_DB.prepare(`
    SELECT
      id,
      user_id,
      workspace_id,
      code_verifier_ciphertext,
      code_verifier_iv,
      code_verifier_auth_tag,
      redirect_uri
    FROM oauth_transactions
    WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?
  `).bind(stateHash, timestamp).first<OAuthTransaction>();

  if (!transaction || !transaction.user_id || !transaction.workspace_id) {
    throw new RequestError('meli_oauth_state_invalid', 400);
  }

  const result = await env.ONFRAME_DB.prepare(`
    UPDATE oauth_transactions
    SET consumed_at = ?
    WHERE id = ? AND state_hash = ? AND consumed_at IS NULL AND expires_at > ?
  `).bind(timestamp, transaction.id, stateHash, timestamp).run();

  if (result.meta.changes !== 1) throw new RequestError('meli_oauth_state_invalid', 400);
  return transaction;
}

async function persistMeliAccount(
  env: RuntimeEnv,
  transaction: OAuthTransaction,
  token: MeliToken,
  profile: MeliProfile,
  requestId: string
): Promise<{ accountId: string; nickname: string | null }> {
  const timestamp = now();
  const meliUserId = String(profile.id);
  const existing = await env.ONFRAME_DB.prepare(`
    SELECT id, workspace_id
    FROM seller_accounts
    WHERE meli_user_id = ?
  `).bind(meliUserId).first<{ id: string; workspace_id: string }>();

  if (existing && existing.workspace_id !== transaction.workspace_id) {
    throw new RequestError('seller_account_workspace_conflict', 409);
  }

  const accountId = existing ? existing.id : await stableId('acc', meliUserId);
  const encryptedToken = await encryptValue(env, JSON.stringify(token));
  const expiresAt = timestamp + Math.floor(token.expires_in * 1000);
  const nickname = typeof profile.nickname === 'string' && profile.nickname.trim() ? profile.nickname.trim() : null;
  const siteId = typeof profile.site_id === 'string' && profile.site_id.trim() ? profile.site_id.trim() : null;
  const profileUrl = typeof profile.permalink === 'string' && profile.permalink.trim() ? profile.permalink.trim() : null;
  const logoUrl = profileLogoUrl(profile);

  await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare(`
      INSERT INTO seller_accounts (
        id, workspace_id, meli_user_id, nickname, site_id, profile_url, logo_url, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(meli_user_id) DO UPDATE SET
        nickname = excluded.nickname,
        site_id = excluded.site_id,
        profile_url = excluded.profile_url,
        logo_url = excluded.logo_url,
        enabled = 1,
        updated_at = excluded.updated_at
    `).bind(accountId, transaction.workspace_id, meliUserId, nickname, siteId, profileUrl, logoUrl, timestamp, timestamp),
    env.ONFRAME_DB.prepare(`
      INSERT INTO account_members (seller_account_id, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(seller_account_id, user_id) DO NOTHING
    `).bind(accountId, transaction.user_id, timestamp, timestamp),
    env.ONFRAME_DB.prepare(`
      INSERT INTO seller_credentials (
        seller_account_id, token_ciphertext, token_iv, token_auth_tag, key_version, expires_at, refreshed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(seller_account_id) DO UPDATE SET
        token_ciphertext = excluded.token_ciphertext,
        token_iv = excluded.token_iv,
        token_auth_tag = excluded.token_auth_tag,
        key_version = excluded.key_version,
        expires_at = excluded.expires_at,
        refreshed_at = excluded.refreshed_at,
        updated_at = excluded.updated_at
    `).bind(
      accountId,
      encryptedToken.ciphertext,
      encryptedToken.iv,
      encryptedToken.authTag,
      MELI_TOKEN_KEY_VERSION,
      expiresAt,
      timestamp,
      timestamp,
      timestamp
    ),
    env.ONFRAME_DB.prepare(`
      INSERT INTO audit_events (
        id, workspace_id, user_id, seller_account_id, request_id, operation, target_type, target_id, outcome, status_code, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, 'mercadolivre_oauth_connected', 'seller_account', ?, 'success', 201, ?, ?)
    `).bind(
      crypto.randomUUID(),
      transaction.workspace_id,
      transaction.user_id,
      accountId,
      requestId,
      accountId,
      JSON.stringify({ meliUserId }),
      timestamp
    )
  ]);

  return { accountId, nickname };
}

async function listWorkspaceAccounts(env: RuntimeEnv, actor: ExtensionSessionActor): Promise<Array<Record<string, unknown>>> {
  const result = await env.ONFRAME_DB.prepare(`
    SELECT id, meli_user_id, nickname, site_id, profile_url, logo_url, enabled
    FROM seller_accounts
    WHERE workspace_id = ?
      AND (
        ? = 'admin'
        OR EXISTS (
          SELECT 1
          FROM account_members
          WHERE account_members.seller_account_id = seller_accounts.id
            AND account_members.user_id = ?
        )
      )
    ORDER BY nickname COLLATE NOCASE, meli_user_id
  `).bind(actor.workspaceId, actor.workspaceRole, actor.userId).all<{
    id: string;
    meli_user_id: string;
    nickname: string | null;
    site_id: string | null;
    profile_url: string | null;
    logo_url: string | null;
    enabled: number;
  }>();

  return result.results.map((account) => ({
    id: account.id,
    userId: account.meli_user_id,
    nickname: account.nickname,
    siteId: account.site_id,
    profileUrl: account.profile_url,
    logoUrl: account.logo_url,
    enabled: account.enabled === 1
  }));
}

async function updateWorkspaceAccount(
  request: Request,
  env: RuntimeEnv,
  actor: ExtensionSessionActor,
  meliUserId: string,
  requestId: string
): Promise<Array<Record<string, unknown>>> {
  await assertWorkspaceCanManageAccounts(actor, env);
  if (!/^\d+$/u.test(meliUserId)) throw new RequestError('invalid_account_id', 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new RequestError('invalid_json', 400);
  }
  const enabled = body && typeof body === 'object' ? (body as Record<string, unknown>).enabled : undefined;
  if (typeof enabled !== 'boolean') throw new RequestError('invalid_account_update', 400);

  const result = await env.ONFRAME_DB.prepare(`
    UPDATE seller_accounts
    SET enabled = ?, updated_at = ?
    WHERE workspace_id = ? AND meli_user_id = ?
  `).bind(enabled ? 1 : 0, now(), actor.workspaceId, meliUserId).run();
  if (result.meta.changes !== 1) throw new RequestError('workspace_account_not_found', 404);

  await auditWorkspaceAccountChange(env, actor, requestId, 'seller_account_updated', meliUserId);
  return listWorkspaceAccounts(env, actor);
}

async function deleteWorkspaceAccount(
  env: RuntimeEnv,
  actor: ExtensionSessionActor,
  meliUserId: string,
  requestId: string
): Promise<Array<Record<string, unknown>>> {
  await assertWorkspaceCanManageAccounts(actor, env);
  if (!/^\d+$/u.test(meliUserId)) throw new RequestError('invalid_account_id', 400);

  const result = await env.ONFRAME_DB.prepare(`
    DELETE FROM seller_accounts
    WHERE workspace_id = ? AND meli_user_id = ?
  `).bind(actor.workspaceId, meliUserId).run();
  if (result.meta.changes !== 1) throw new RequestError('workspace_account_not_found', 404);

  await auditWorkspaceAccountChange(env, actor, requestId, 'seller_account_deleted', meliUserId);
  return listWorkspaceAccounts(env, actor);
}

async function auditWorkspaceAccountChange(
  env: RuntimeEnv,
  actor: ExtensionSessionActor,
  requestId: string,
  operation: string,
  meliUserId: string
): Promise<void> {
  await env.ONFRAME_DB.prepare(`
    INSERT INTO audit_events (
      id, workspace_id, user_id, seller_account_id, request_id, operation, target_type, target_id, outcome, status_code, metadata_json, created_at
    ) VALUES (?, ?, ?, NULL, ?, ?, 'seller_account', ?, 'success', 200, ?, ?)
  `).bind(
    crypto.randomUUID(),
    actor.workspaceId,
    actor.userId,
    requestId,
    operation,
    meliUserId,
    JSON.stringify({ meliUserId }),
    now()
  ).run();
}

async function auditRemoteApiRequest(input: {
  actor: ExtensionSessionActor;
  env: RuntimeEnv;
  method: string;
  path: string;
  requestId: string;
  statusCode: number;
  outcome: 'success' | 'failure';
}): Promise<void> {
  const itemId = input.path.match(/\/(MLB\d+)/u)?.[1] ?? null;
  await input.env.ONFRAME_DB.prepare(`
    INSERT INTO audit_events (
      id, workspace_id, user_id, seller_account_id, request_id, operation, target_type, target_id, outcome, status_code, metadata_json, created_at
    ) VALUES (?, ?, ?, NULL, ?, ?, 'extension_api', ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    input.actor.workspaceId,
    input.actor.userId,
    input.requestId,
    `${input.method} ${input.path}`,
    itemId,
    input.outcome,
    input.statusCode,
    JSON.stringify({ method: input.method, path: input.path }),
    now()
  ).run();
}

function parseRequestObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError('invalid_json', 400);
  return value as Record<string, unknown>;
}

async function readRequestObject(request: Request): Promise<Record<string, unknown>> {
  try {
    return parseRequestObject(await request.json());
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('invalid_json', 400);
  }
}

function requiredDisplayName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length < 1 || name.length > 120) throw new RequestError('invalid_display_name', 400);
  return name;
}

function optionalEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 320) {
    throw new RequestError('invalid_invitation_email', 400);
  }
  return email;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function workspaceRole(value: unknown): 'admin' | 'collaborator' {
  if (value === 'admin' || value === 'collaborator') return value;
  throw new RequestError('invalid_workspace_role', 400);
}

function accountIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = Array.from(new Set(value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)));
  if (ids.length > 100) throw new RequestError('invalid_account_assignments', 400);
  return ids;
}

async function assertWorkspaceAdministrator(actor: ExtensionSessionActor): Promise<void> {
  if (actor.workspaceRole !== 'admin') throw new RequestError('workspace_admin_required', 403);
}

async function assertAccountsBelongToWorkspace(env: RuntimeEnv, workspaceId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(', ');
  const result = await env.ONFRAME_DB.prepare(`
    SELECT id
    FROM seller_accounts
    WHERE workspace_id = ? AND id IN (${placeholders})
  `).bind(workspaceId, ...ids).all<{ id: string }>();
  if (result.results.length !== ids.length) throw new RequestError('invalid_account_assignments', 400);
}

async function listWorkspaces(env: RuntimeEnv, actor: ExtensionSessionActor): Promise<Array<Record<string, unknown>>> {
  const result = await env.ONFRAME_DB.prepare(`
    SELECT
      workspaces.id,
      workspaces.name,
      workspace_members.role,
      (SELECT COUNT(*) FROM workspace_members members WHERE members.workspace_id = workspaces.id) AS member_count,
      (SELECT COUNT(*) FROM seller_accounts accounts WHERE accounts.workspace_id = workspaces.id) AS account_count
    FROM workspace_members
    INNER JOIN workspaces ON workspaces.id = workspace_members.workspace_id
    WHERE workspace_members.user_id = ?
    ORDER BY workspaces.name COLLATE NOCASE
  `).bind(actor.userId).all<{
    id: string;
    name: string;
    role: 'admin' | 'collaborator';
    member_count: number;
    account_count: number;
  }>();
  return result.results.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    role: workspace.role,
    memberCount: Number(workspace.member_count),
    accountCount: Number(workspace.account_count)
  }));
}

async function activateWorkspace(env: RuntimeEnv, actor: ExtensionSessionActor, workspaceId: string): Promise<Response> {
  const membership = await env.ONFRAME_DB.prepare(`
    SELECT role
    FROM workspace_members
    WHERE workspace_id = ? AND user_id = ?
  `).bind(workspaceId, actor.userId).first<{ role: 'admin' | 'collaborator' }>();
  if (!membership) throw new RequestError('workspace_access_forbidden', 403);

  const session = await createExtensionSession(env, { ...actor, workspaceId }, actor.label || 'Extensão OnFrame');
  await env.ONFRAME_DB.prepare(`
    UPDATE extension_sessions SET revoked_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).bind(now(), actor.sessionId).run();
  return json(createdExtensionSessionPayload(session), 201);
}

async function workspaceOverview(env: RuntimeEnv, actor: ExtensionSessionActor): Promise<Record<string, unknown>> {
  const [accounts, members, recent] = await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare(`
      SELECT COUNT(*) AS count
      FROM seller_accounts
      WHERE workspace_id = ?
    `).bind(actor.workspaceId),
    env.ONFRAME_DB.prepare(`
      SELECT COUNT(*) AS count
      FROM workspace_members
      WHERE workspace_id = ?
    `).bind(actor.workspaceId),
    env.ONFRAME_DB.prepare(`
      SELECT audit_events.id, audit_events.operation, audit_events.created_at, users.display_name, users.email
      FROM audit_events
      LEFT JOIN users ON users.id = audit_events.user_id
      WHERE audit_events.workspace_id = ?
      ORDER BY audit_events.created_at DESC
      LIMIT 8
    `).bind(actor.workspaceId)
  ]);
  const countAt = (result: D1Result<unknown>) => Number((result.results[0] as { count?: number } | undefined)?.count || 0);
  return {
    workspace: { id: actor.workspaceId, name: actor.workspaceName, role: actor.workspaceRole },
    accountCount: countAt(accounts),
    memberCount: countAt(members),
    recentActivity: (recent.results as Array<{ id: string; operation: string; created_at: number; display_name: string | null; email: string | null }>).map((event) => ({
      id: event.id,
      operation: event.operation,
      occurredAt: new Date(event.created_at).toISOString(),
      actorName: event.display_name || event.email || 'OnFrame'
    }))
  };
}

async function profilePayload(env: RuntimeEnv, actor: ExtensionSessionActor): Promise<Record<string, unknown>> {
  const sessions = await env.ONFRAME_DB.prepare(`
    SELECT id, label, created_at, last_seen_at
    FROM extension_sessions
    WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
    ORDER BY last_seen_at DESC, created_at DESC
  `).bind(actor.userId, now()).all<{ id: string; label: string | null; created_at: number; last_seen_at: number | null }>();
  return {
    user: {
      id: actor.userId,
      name: actor.displayName,
      email: actor.email,
      avatarUrl: actor.avatarUrl
    },
    sessions: sessions.results.map((session) => ({
      id: session.id,
      label: session.label || 'Extensão OnFrame',
      current: session.id === actor.sessionId,
      createdAt: new Date(session.created_at).toISOString(),
      lastSeenAt: session.last_seen_at ? new Date(session.last_seen_at).toISOString() : null
    }))
  };
}

async function updateProfile(request: Request, env: RuntimeEnv, actor: ExtensionSessionActor): Promise<Record<string, unknown>> {
  const body = await readRequestObject(request);
  const displayName = requiredDisplayName(body.displayName);
  const workspaceName = body.workspaceName === undefined ? null : requiredDisplayName(body.workspaceName);
  if (workspaceName && actor.workspaceRole !== 'admin') throw new RequestError('workspace_admin_required', 403);
  const timestamp = now();
  const updates = [
    env.ONFRAME_DB.prepare(`UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`).bind(displayName, timestamp, actor.userId)
  ];
  if (workspaceName) updates.push(env.ONFRAME_DB.prepare(`UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?`).bind(workspaceName, timestamp, actor.workspaceId));
  await env.ONFRAME_DB.batch(updates);
  await auditPlatformEvent(env, actor, 'profile_updated', 'user', actor.userId, 200);
  return profilePayload(env, { ...actor, displayName, workspaceName: workspaceName || actor.workspaceName });
}

async function revokeOtherExtensionSession(env: RuntimeEnv, actor: ExtensionSessionActor, sessionId: string): Promise<void> {
  if (!sessionId || sessionId === actor.sessionId) throw new RequestError('invalid_session_revoke', 400);
  const result = await env.ONFRAME_DB.prepare(`
    UPDATE extension_sessions
    SET revoked_at = ?
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL
  `).bind(now(), sessionId, actor.userId).run();
  if (result.meta.changes !== 1) throw new RequestError('extension_session_not_found', 404);
  await auditPlatformEvent(env, actor, 'extension_session_revoked', 'extension_session', sessionId, 200);
}

async function listWorkspaceMembers(env: RuntimeEnv, actor: ExtensionSessionActor): Promise<Array<Record<string, unknown>>> {
  await assertWorkspaceAdministrator(actor);
  const members = await env.ONFRAME_DB.prepare(`
    SELECT users.id, users.email, users.display_name, users.avatar_url, workspace_members.role, workspace_members.created_at
    FROM workspace_members
    INNER JOIN users ON users.id = workspace_members.user_id
    WHERE workspace_members.workspace_id = ?
    ORDER BY CASE workspace_members.role WHEN 'admin' THEN 0 ELSE 1 END, users.display_name COLLATE NOCASE, users.email
  `).bind(actor.workspaceId).all<{
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    role: 'admin' | 'collaborator';
    created_at: number;
  }>();
  const assignments = await env.ONFRAME_DB.prepare(`
    SELECT account_members.user_id, seller_accounts.id AS account_id, seller_accounts.nickname, seller_accounts.meli_user_id
    FROM account_members
    INNER JOIN seller_accounts ON seller_accounts.id = account_members.seller_account_id
    WHERE seller_accounts.workspace_id = ?
  `).bind(actor.workspaceId).all<{ user_id: string; account_id: string; nickname: string | null; meli_user_id: string }>();
  const byUser = new Map<string, Array<Record<string, string | null>>>();
  for (const assignment of assignments.results) {
    const entries = byUser.get(assignment.user_id) || [];
    entries.push({ id: assignment.account_id, nickname: assignment.nickname, meliUserId: assignment.meli_user_id });
    byUser.set(assignment.user_id, entries);
  }
  return members.results.map((member) => ({
    id: member.id,
    email: member.email,
    name: member.display_name || member.email,
    avatarUrl: member.avatar_url,
    role: member.role,
    joinedAt: new Date(member.created_at).toISOString(),
    accounts: member.role === 'admin' ? [] : byUser.get(member.id) || []
  }));
}

async function updateWorkspaceMember(request: Request, env: RuntimeEnv, actor: ExtensionSessionActor, userId: string): Promise<Array<Record<string, unknown>>> {
  await assertWorkspaceAdministrator(actor);
  const body = await readRequestObject(request);
  const role = workspaceRole(body.role);
  const assignments = role === 'collaborator' ? accountIds(body.accountIds) : [];
  await assertAccountsBelongToWorkspace(env, actor.workspaceId, assignments);
  const member = await env.ONFRAME_DB.prepare(`
    SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).bind(actor.workspaceId, userId).first<{ role: 'admin' | 'collaborator' }>();
  if (!member) throw new RequestError('workspace_member_not_found', 404);
  if (member.role === 'admin' && role !== 'admin') {
    const count = await env.ONFRAME_DB.prepare(`SELECT COUNT(*) AS count FROM workspace_members WHERE workspace_id = ? AND role = 'admin'`).bind(actor.workspaceId).first<{ count: number }>();
    if (Number(count?.count || 0) <= 1) throw new RequestError('workspace_last_admin_required', 409);
  }
  const timestamp = now();
  await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare(`UPDATE workspace_members SET role = ?, updated_at = ? WHERE workspace_id = ? AND user_id = ?`).bind(role, timestamp, actor.workspaceId, userId),
    env.ONFRAME_DB.prepare(`DELETE FROM account_members WHERE user_id = ? AND seller_account_id IN (SELECT id FROM seller_accounts WHERE workspace_id = ?)`).bind(userId, actor.workspaceId),
    ...assignments.map((accountId) => env.ONFRAME_DB.prepare(`INSERT INTO account_members (seller_account_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)`).bind(accountId, userId, timestamp, timestamp))
  ]);
  await auditPlatformEvent(env, actor, 'workspace_member_updated', 'workspace_member', userId, 200);
  return listWorkspaceMembers(env, actor);
}

async function removeWorkspaceMember(env: RuntimeEnv, actor: ExtensionSessionActor, userId: string): Promise<void> {
  await assertWorkspaceAdministrator(actor);
  const member = await env.ONFRAME_DB.prepare(`SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?`).bind(actor.workspaceId, userId).first<{ role: 'admin' | 'collaborator' }>();
  if (!member) throw new RequestError('workspace_member_not_found', 404);
  if (member.role === 'admin') {
    const count = await env.ONFRAME_DB.prepare(`SELECT COUNT(*) AS count FROM workspace_members WHERE workspace_id = ? AND role = 'admin'`).bind(actor.workspaceId).first<{ count: number }>();
    if (Number(count?.count || 0) <= 1) throw new RequestError('workspace_last_admin_required', 409);
  }
  await env.ONFRAME_DB.prepare(`DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?`).bind(actor.workspaceId, userId).run();
  await auditPlatformEvent(env, actor, 'workspace_member_removed', 'workspace_member', userId, 200);
}

async function auditPlatformEvent(env: RuntimeEnv, actor: ExtensionSessionActor, operation: string, targetType: string, targetId: string, statusCode: number): Promise<void> {
  await env.ONFRAME_DB.prepare(`
    INSERT INTO audit_events (id, workspace_id, user_id, seller_account_id, request_id, operation, target_type, target_id, outcome, status_code, metadata_json, created_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'success', ?, '{}', ?)
  `).bind(crypto.randomUUID(), actor.workspaceId, actor.userId, crypto.randomUUID(), operation, targetType, targetId, statusCode, now()).run();
}

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

function invitationUrl(token: string): string {
  return `https://onframe.onblide.com/invite?token=${encodeURIComponent(token)}`;
}

function invitationEmailHtml(workspaceName: string, url: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f2f0e8;color:#545454;font-family:Poppins,Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:48px 16px"><table role="presentation" width="480" cellspacing="0" cellpadding="0" style="width:100%;max-width:480px;background:#fff;border:1px solid #ececec;border-radius:12px"><tr><td style="padding:32px"><p style="margin:0 0 12px;color:#0a4ee4;font-family:'JetBrains Mono','Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:.06em">CONVITE PARA WORKSPACE</p><h1 style="margin:0 0 12px;color:#2a2a2a;font-size:28px;line-height:1.2">Você foi convidado para ${escapeHtml(workspaceName)}</h1><p style="margin:0;color:#545454;font-size:15px;line-height:1.6">Entre ou crie sua conta OnFrame para participar do workspace.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px"><tr><td style="border-radius:8px;background:#0a4ee4"><a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 18px;color:#fff;font-size:14px;font-weight:600;text-decoration:none">Aceitar convite</a></td></tr></table><p style="margin:24px 0 0;color:#7a7a7a;font-size:12px;line-height:1.5">Este convite expira em 7 dias e pode ser usado uma única vez.</p></td></tr><tr><td style="padding:16px 32px;border-top:1px solid #ececec;color:#a8a8a8;font-family:'JetBrains Mono','Courier New',monospace;font-size:10px;text-align:center">ONFRAME · ONBLIDE.COM</td></tr></table></td></tr></table></body></html>`;
}

async function sendWorkspaceInvitationEmail(env: RuntimeEnv, recipient: string, workspaceName: string, token: string): Promise<void> {
  const apiKey = configuredRuntimeText(env.RESEND_API_KEY, 'auth_email_sender_unconfigured');
  const from = configuredRuntimeText(env.AUTH_EMAIL_FROM, 'auth_email_sender_unconfigured');
  const response = await fetch(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': `workspace-invitation-${await sha256(token)}`
    },
    body: JSON.stringify({
      from,
      to: recipient,
      subject: `Convite para ${workspaceName} no OnFrame`,
      html: invitationEmailHtml(workspaceName, invitationUrl(token))
    }),
    signal: AbortSignal.timeout(3500)
  });
  if (!response.ok) throw new RequestError('workspace_invitation_delivery_failed', 503);
}

async function createWorkspaceInvitation(request: Request, env: RuntimeEnv, actor: ExtensionSessionActor): Promise<Record<string, unknown>> {
  await assertWorkspaceAdministrator(actor);
  const body = await readRequestObject(request);
  const kind = body.kind === 'email' || body.kind === 'link' ? body.kind : '';
  if (!kind) throw new RequestError('invalid_invitation_kind', 400);
  const role = workspaceRole(body.role);
  const email = kind === 'email' ? optionalEmail(body.email) : null;
  if (kind === 'email' && !email) throw new RequestError('invalid_invitation_email', 400);
  const assignments = role === 'collaborator' ? accountIds(body.accountIds) : [];
  await assertAccountsBelongToWorkspace(env, actor.workspaceId, assignments);
  const token = randomSecret(32);
  const timestamp = now();
  const id = crypto.randomUUID();
  const expiresAt = timestamp + INVITATION_TTL_MS;

  if (email) {
    await env.ONFRAME_DB.prepare(`
      UPDATE workspace_invitations SET revoked_at = ?, updated_at = ?
      WHERE workspace_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL
    `).bind(timestamp, timestamp, actor.workspaceId, email).run();
  }

  await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare(`
      INSERT INTO workspace_invitations (id, workspace_id, token_hash, kind, email, role, created_by_user_id, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, actor.workspaceId, await sha256(token), kind, email, role, actor.userId, expiresAt, timestamp, timestamp),
    ...assignments.map((accountId) => env.ONFRAME_DB.prepare(`
      INSERT INTO workspace_invitation_accounts (invitation_id, seller_account_id) VALUES (?, ?)
    `).bind(id, accountId))
  ]);

  if (email) await sendWorkspaceInvitationEmail(env, email, actor.workspaceName, token);
  await auditPlatformEvent(env, actor, 'workspace_invitation_created', 'workspace_invitation', id, 201);
  return {
    invitation: {
      id,
      kind,
      email,
      role,
      expiresAt: new Date(expiresAt).toISOString(),
      url: kind === 'link' ? invitationUrl(token) : undefined
    }
  };
}

async function listWorkspaceInvitations(env: RuntimeEnv, actor: ExtensionSessionActor): Promise<Array<Record<string, unknown>>> {
  await assertWorkspaceAdministrator(actor);
  const result = await env.ONFRAME_DB.prepare(`
    SELECT id, kind, email, role, expires_at, created_at
    FROM workspace_invitations
    WHERE workspace_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC
  `).bind(actor.workspaceId, now()).all<{
    id: string;
    kind: 'email' | 'link';
    email: string | null;
    role: 'admin' | 'collaborator';
    expires_at: number;
    created_at: number;
  }>();
  return result.results.map((invitation) => ({
    id: invitation.id,
    kind: invitation.kind,
    email: invitation.email,
    role: invitation.role,
    expiresAt: new Date(invitation.expires_at).toISOString(),
    createdAt: new Date(invitation.created_at).toISOString()
  }));
}

async function revokeWorkspaceInvitation(env: RuntimeEnv, actor: ExtensionSessionActor, invitationId: string): Promise<void> {
  await assertWorkspaceAdministrator(actor);
  const result = await env.ONFRAME_DB.prepare(`
    UPDATE workspace_invitations SET revoked_at = ?, updated_at = ?
    WHERE id = ? AND workspace_id = ? AND accepted_at IS NULL AND revoked_at IS NULL
  `).bind(now(), now(), invitationId, actor.workspaceId).run();
  if (result.meta.changes !== 1) throw new RequestError('workspace_invitation_not_found', 404);
  await auditPlatformEvent(env, actor, 'workspace_invitation_revoked', 'workspace_invitation', invitationId, 200);
}

async function acceptWorkspaceInvitation(env: RuntimeEnv, actor: ExtensionSessionActor, token: string): Promise<Response> {
  const invitationToken = parseExtensionAuthFlowToken(token);
  const timestamp = now();
  const invitation = await env.ONFRAME_DB.prepare(`
    SELECT id, workspace_id, kind, email, role
    FROM workspace_invitations
    WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?
  `).bind(await sha256(invitationToken), timestamp).first<{
    id: string;
    workspace_id: string;
    kind: 'email' | 'link';
    email: string | null;
    role: 'admin' | 'collaborator';
  }>();
  if (!invitation) throw new RequestError('workspace_invitation_unavailable', 404);
  if (invitation.kind === 'email' && invitation.email !== actor.email.toLowerCase()) {
    throw new RequestError('workspace_invitation_email_mismatch', 403);
  }
  const assignments = await env.ONFRAME_DB.prepare(`
    SELECT seller_account_id FROM workspace_invitation_accounts WHERE invitation_id = ?
  `).bind(invitation.id).all<{ seller_account_id: string }>();
  const claimed = await env.ONFRAME_DB.prepare(`
    UPDATE workspace_invitations SET accepted_at = ?, accepted_by_user_id = ?, updated_at = ?
    WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?
  `).bind(timestamp, actor.userId, timestamp, invitation.id, timestamp).run();
  if (claimed.meta.changes !== 1) throw new RequestError('workspace_invitation_unavailable', 409);
  await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare(`
      INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
    `).bind(invitation.workspace_id, actor.userId, invitation.role, timestamp, timestamp),
    ...assignments.results.map((assignment) => env.ONFRAME_DB.prepare(`
      INSERT INTO account_members (seller_account_id, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(seller_account_id, user_id) DO NOTHING
    `).bind(assignment.seller_account_id, actor.userId, timestamp, timestamp))
  ]);
  const nextSession = await createExtensionSession(env, { ...actor, workspaceId: invitation.workspace_id }, actor.label || 'Extensão OnFrame');
  await env.ONFRAME_DB.prepare(`UPDATE extension_sessions SET revoked_at = ? WHERE id = ?`).bind(timestamp, actor.sessionId).run();
  return json(createdExtensionSessionPayload(nextSession), 201);
}

function parseAvatarDataUrl(value: unknown): { bytes: Uint8Array; contentType: string; extension: string } {
  const source = typeof value === 'string' ? value : '';
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/u.exec(source);
  if (!match) throw new RequestError('invalid_avatar', 400);
  const binary = atob(match[2]);
  if (binary.length > AVATAR_MAX_BYTES) throw new RequestError('avatar_too_large', 413);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return {
    bytes,
    contentType: match[1],
    extension: match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg'
  };
}

async function updateProfileAvatar(request: Request, env: RuntimeEnv, actor: ExtensionSessionActor, requestId: string): Promise<Record<string, unknown>> {
  const serviceKey = configuredRuntimeText(env.SUPABASE_SERVICE_ROLE_KEY, 'avatar_storage_unconfigured');
  const body = await readRequestObject(request);
  const avatar = parseAvatarDataUrl(body.dataUrl);
  const origin = configuredRuntimeText(env.SUPABASE_URL, 'supabase_auth_unconfigured');
  const path = `${actor.userId}/${crypto.randomUUID()}.${avatar.extension}`;
  const upload = await fetch(storageObjectUrl(origin, 'onframe-avatars', path), {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': avatar.contentType,
      'x-upsert': 'false'
    },
    body: avatar.bytes
  });
  if (!upload.ok) {
    const code = storageUploadFailureCode(upload.status, await readMeliResponse(upload));
    console.error(JSON.stringify({
      event: 'avatar_storage_upload_failed',
      requestId,
      status: upload.status,
      code
    }));
    throw new RequestError(code, code === 'invalid_avatar' ? 400 : code === 'avatar_too_large' ? 413 : 503);
  }
  const avatarUrl = storageObjectUrl(origin, 'onframe-avatars', path, true);
  try {
    await env.ONFRAME_DB.prepare(`UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?`).bind(avatarUrl, now(), actor.userId).run();
  } catch {
    console.error(JSON.stringify({
      event: 'avatar_profile_update_failed',
      requestId
    }));
    throw new RequestError('avatar_profile_update_failed', 503);
  }
  await auditPlatformEvent(env, actor, 'profile_avatar_updated', 'user', actor.userId, 200);
  return profilePayload(env, { ...actor, avatarUrl });
}

async function removeProfileAvatar(env: RuntimeEnv, actor: ExtensionSessionActor, requestId: string): Promise<Record<string, unknown>> {
  const avatarUrl = actor.avatarUrl;
  try {
    await env.ONFRAME_DB.prepare(`UPDATE users SET avatar_url = NULL, updated_at = ? WHERE id = ?`).bind(now(), actor.userId).run();
  } catch {
    console.error(JSON.stringify({
      event: 'avatar_profile_remove_failed',
      requestId
    }));
    throw new RequestError('avatar_profile_remove_failed', 503);
  }

  const origin = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim() : '';
  const serviceKey = typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  const path = avatarUrl && origin ? storagePublicObjectPath(origin, 'onframe-avatars', avatarUrl) : null;
  if (path?.startsWith(`${actor.userId}/`) && serviceKey) {
    try {
      const removal = await fetch(storageObjectUrl(origin, 'onframe-avatars', path), {
        method: 'DELETE',
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`
        }
      });
      if (!removal.ok && removal.status !== 404) {
        console.error(JSON.stringify({ event: 'avatar_storage_remove_failed', requestId, status: removal.status }));
      }
    } catch {
      console.error(JSON.stringify({ event: 'avatar_storage_remove_failed', requestId, status: 'network_error' }));
    }
  }

  await auditPlatformEvent(env, actor, 'profile_avatar_removed', 'user', actor.userId, 200);
  return profilePayload(env, { ...actor, avatarUrl: null });
}

async function handleMeliCallback(request: Request, env: RuntimeEnv, requestId: string): Promise<Response> {
  const url = new URL(request.url);

  try {
    const state = url.searchParams.get('state') || '';
    const transaction = await consumeMeliOAuthTransaction(env, state);
    const authorizationError = url.searchParams.get('error');
    const code = url.searchParams.get('code') || '';

    if (authorizationError || !code) {
      return html(resultPage({
        title: 'Conta não conectada - OnFrame',
        eyebrow: 'MERCADO LIVRE',
        heading: 'Não foi possível conectar a conta',
        message: 'A autorização não foi concluída. Feche esta aba e inicie uma nova conexão pela extensão.',
        tone: 'danger'
      }), 400);
    }

    const token = await exchangeMeliAuthorizationCode(env, code, transaction);
    const profile = await loadMeliProfile(token.access_token);
    const account = await persistMeliAccount(env, transaction, token, profile, requestId);
    console.log(JSON.stringify({
      event: 'mercadolivre_oauth_connected',
      requestId,
      accountId: account.accountId,
      workspaceId: transaction.workspace_id
    }));
    return html(resultPage({
      title: 'Conta conectada - OnFrame',
      eyebrow: 'MERCADO LIVRE',
      heading: 'Conta conectada',
      message: `${account.nickname || 'A conta'} foi vinculada ao workspace. Volte para as opções da extensão.`,
      tone: 'success'
    }));
  } catch (error) {
    logFailure(requestId, request, error);
    return html(resultPage({
      title: 'Conta não conectada - OnFrame',
      eyebrow: 'MERCADO LIVRE',
      heading: 'Não foi possível conectar a conta',
      message: 'A autorização não foi concluída. Feche esta aba e inicie uma nova conexão pela extensão.',
      tone: 'danger'
    }), error instanceof RequestError ? error.status : 503);
  }
}

export default {
  async fetch(request, env: RuntimeEnv): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();

    try {
      if (url.pathname === '/hooks/supabase/send-email') {
        return handleSupabaseSendEmailHook(request, env);
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        const result = await env.ONFRAME_DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
        if (result?.ok !== 1) throw new Error('D1 health query returned an invalid result.');

        const payload: HealthResponse = {
          ok: true,
          service: 'onframe-api',
          timestamp: new Date().toISOString()
        };
        return json(payload);
      }

      if (request.method === 'GET' && (url.pathname === '/app' || url.pathname === '/connect')) {
        const supabaseUrl = configuredRuntimeText(env.SUPABASE_URL, 'supabase_auth_unconfigured');
        const supabasePublishableKey = configuredRuntimeText(env.SUPABASE_PUBLISHABLE_KEY, 'supabase_auth_unconfigured');
        return html(connectionPage({
          title: 'Conectar extensão - OnFrame',
          eyebrow: 'ACESSO À EXTENSÃO',
          heading: 'Conclua o acesso ao <em>OnFrame</em>',
          description: 'Esta página confirma o link enviado pela extensão.',
          supabaseUrl,
          supabasePublishableKey
        }), 200, {
          'content-security-policy': interactivePageCsp(supabaseUrl)
        });
      }

      if (request.method === 'GET' && url.pathname === '/auth/challenge') {
        const siteKey = configuredRuntimeText(env.TURNSTILE_SITEKEY, 'turnstile_unconfigured');
        return html(captchaPage(siteKey), 200, {
          'content-security-policy': captchaPageCsp()
        });
      }

      if (request.method === 'GET' && url.pathname === '/v1/auth/config') {
        return json({
          supabaseUrl: configuredRuntimeText(env.SUPABASE_URL, 'supabase_auth_unconfigured'),
          supabasePublishableKey: configuredRuntimeText(env.SUPABASE_PUBLISHABLE_KEY, 'supabase_auth_unconfigured')
        });
      }

      if (request.method === 'POST' && url.pathname === '/v1/extension-sessions/from-auth') {
        return await createSessionFromSupabaseAuth(request, env, requestId);
      }

      if (request.method === 'POST' && url.pathname === '/v1/identity/synchronize') {
        const identity = await authenticateSupabaseRequest(request, env, { synchronizeOnly: true });
        const flow = url.searchParams.get('flow');
        if (flow) {
          await env.ONFRAME_DB.prepare('UPDATE extension_auth_flows SET expires_at = 0 WHERE token_hash = ? AND claimed_at IS NULL')
            .bind(await sha256(parseExtensionAuthFlowToken(flow))).run();
        }
        return json({ synchronized: true, email: identity.email });
      }

      if (request.method === 'POST' && url.pathname === '/v1/extension-auth-flows') {
        const flow = await createExtensionAuthFlow(env);
        return json({
          flow: flow.token,
          expiresAt: new Date(flow.expiresAt).toISOString()
        }, 201);
      }

      const authFlowPath = /^\/v1\/extension-auth-flows\/([A-Za-z0-9_-]{43})$/u.exec(url.pathname);
      if (authFlowPath && request.method === 'POST') {
        return await completeExtensionAuthFlow(request, env, parseExtensionAuthFlowToken(authFlowPath[1]), requestId);
      }

      if (authFlowPath && request.method === 'GET') {
        return await consumeExtensionAuthFlow(env, parseExtensionAuthFlowToken(authFlowPath[1]), requestId);
      }

      if (request.method === 'GET' && url.pathname === '/v1/app/session') {
        const actor = await provisionActor(env, await authenticateSupabaseRequest(request, env));
        return json({
          user: { id: actor.userId, email: actor.email, name: actor.name },
          workspace: { id: actor.workspaceId, name: `OnFrame - ${actor.name}` }
        });
      }

      if (request.method === 'GET' && url.pathname === '/oauth/mercadolivre/callback') {
        return handleMeliCallback(request, env, requestId);
      }

      if (url.pathname === '/v1/extension-session') {
        const actor = await authenticateExtensionSession(request, env);

        if (request.method === 'GET') {
          return json(extensionSessionPayload(actor));
        }

        if (request.method === 'DELETE') {
          await revokeExtensionSession(actor, env);
          console.log(JSON.stringify({
            event: 'extension_session_revoked',
            requestId,
            sessionId: actor.sessionId
          }));
          return json({ revokedAt: new Date(now()).toISOString() });
        }
      }

      if (request.method === 'GET' && url.pathname === '/invite') {
        const token = url.searchParams.get('token') || '';
        const safeToken = parseExtensionAuthFlowToken(token);
        const extensionUrl = `chrome-extension://${EXTENSION_ID}/ui/options/index.html?invite=${encodeURIComponent(safeToken)}`;
        return html(invitationPage(extensionUrl));
      }

      if (url.pathname === '/v1/app/workspaces' && request.method === 'GET') {
        const actor = await authenticateExtensionSession(request, env);
        return json({ workspaces: await listWorkspaces(env, actor), activeWorkspaceId: actor.workspaceId });
      }

      const workspaceActivation = /^\/v1\/app\/workspaces\/([^/]+)\/activate$/u.exec(url.pathname);
      if (workspaceActivation && request.method === 'POST') {
        const actor = await authenticateExtensionSession(request, env);
        return await activateWorkspace(env, actor, workspaceActivation[1]);
      }

      if (url.pathname === '/v1/app/overview' && request.method === 'GET') {
        const actor = await authenticateExtensionSession(request, env);
        return json(await workspaceOverview(env, actor));
      }

      if (url.pathname === '/v1/profile') {
        const actor = await authenticateExtensionSession(request, env);
        if (request.method === 'GET') return json(await profilePayload(env, actor));
        if (request.method === 'PATCH') return json(await updateProfile(request, env, actor));
      }

      if (url.pathname === '/v1/profile/avatar' && request.method === 'POST') {
        const actor = await authenticateExtensionSession(request, env);
        return json(await updateProfileAvatar(request, env, actor, requestId));
      }

      if (url.pathname === '/v1/profile/avatar' && request.method === 'DELETE') {
        const actor = await authenticateExtensionSession(request, env);
        return json(await removeProfileAvatar(env, actor, requestId));
      }

      const sessionRemoval = /^\/v1\/profile\/sessions\/([^/]+)$/u.exec(url.pathname);
      if (sessionRemoval && request.method === 'DELETE') {
        const actor = await authenticateExtensionSession(request, env);
        await revokeOtherExtensionSession(env, actor, sessionRemoval[1]);
        return json({ revoked: true });
      }

      if (url.pathname === '/v1/members') {
        const actor = await authenticateExtensionSession(request, env);
        if (request.method === 'GET') return json({ members: await listWorkspaceMembers(env, actor) });
      }

      const memberPath = /^\/v1\/members\/([^/]+)$/u.exec(url.pathname);
      if (memberPath) {
        const actor = await authenticateExtensionSession(request, env);
        if (request.method === 'PATCH') return json({ members: await updateWorkspaceMember(request, env, actor, memberPath[1]) });
        if (request.method === 'DELETE') {
          await removeWorkspaceMember(env, actor, memberPath[1]);
          return json({ removed: true });
        }
      }

      if (url.pathname === '/v1/invitations') {
        const actor = await authenticateExtensionSession(request, env);
        if (request.method === 'GET') return json({ invitations: await listWorkspaceInvitations(env, actor) });
        if (request.method === 'POST') return json(await createWorkspaceInvitation(request, env, actor), 201);
      }

      const invitationPath = /^\/v1\/invitations\/([^/]+)$/u.exec(url.pathname);
      if (invitationPath && request.method === 'DELETE') {
        const actor = await authenticateExtensionSession(request, env);
        await revokeWorkspaceInvitation(env, actor, invitationPath[1]);
        return json({ revoked: true });
      }

      const invitationAcceptance = /^\/v1\/invitations\/accept\/([A-Za-z0-9_-]{43})$/u.exec(url.pathname);
      if (invitationAcceptance && request.method === 'POST') {
        const actor = await authenticateExtensionSession(request, env);
        return await acceptWorkspaceInvitation(env, actor, invitationAcceptance[1]);
      }

      if (url.pathname.startsWith('/v1/api/')) {
        const actor = await authenticateExtensionSession(request, env);
        try {
          const payload = await handleRemoteApiRequest({ actor, env, request, url });
          await auditRemoteApiRequest({
            actor,
            env,
            method: request.method,
            path: url.pathname.slice('/v1'.length),
            requestId,
            statusCode: 200,
            outcome: 'success'
          }).catch(() => undefined);
          return json(payload);
        } catch (error) {
          const failure = remoteApiErrorPayload(error, requestId);
          await auditRemoteApiRequest({
            actor,
            env,
            method: request.method,
            path: url.pathname.slice('/v1'.length),
            requestId,
            statusCode: failure.status,
            outcome: 'failure'
          }).catch(() => undefined);
          return json(failure.payload, failure.status);
        }
      }

      const workspaceAccountMatch = url.pathname.match(/^\/v1\/accounts\/(\d+)$/u);
      if (workspaceAccountMatch) {
        const actor = await authenticateExtensionSession(request, env);
        const meliUserId = workspaceAccountMatch[1];
        if (request.method === 'PATCH') {
          return json({ accounts: await updateWorkspaceAccount(request, env, actor, meliUserId, requestId) });
        }
        if (request.method === 'DELETE') {
          return json({ accounts: await deleteWorkspaceAccount(env, actor, meliUserId, requestId) });
        }
      }

      if (url.pathname === '/v1/mercadolivre/oauth/start' || url.pathname === '/v1/accounts') {
        const actor = await authenticateExtensionSession(request, env);

        if (request.method === 'POST' && url.pathname === '/v1/mercadolivre/oauth/start') {
          const oauth = await createMeliOAuthTransaction(env, actor);
          console.log(JSON.stringify({
            event: 'mercadolivre_oauth_started',
            requestId,
            sessionId: actor.sessionId,
            workspaceId: actor.workspaceId
          }));
          return json(oauth, 201);
        }

        if (request.method === 'GET' && url.pathname === '/v1/accounts') {
          return json({ accounts: await listWorkspaceAccounts(env, actor) });
        }
      }

      return json({ error: 'not_found', requestId }, 404);
    } catch (error) {
      if (error instanceof RequestError || error instanceof SupabaseAuthError || error instanceof IdentitySecurityError) {
        return json({ error: error.code, requestId }, error.status);
      }

      logFailure(requestId, request, error);
      return json({ error: 'service_unavailable', requestId }, 503);
    }
  }
} satisfies ExportedHandler<RuntimeEnv>;
