import { createRemoteJWKSet, jwtVerify } from 'jose';
import { base64Url, decryptValue as decryptTokenValue, encryptValue as encryptTokenValue, type EncryptedValue } from './token-cipher';
import { handleRemoteApiRequest, remoteApiErrorPayload } from './remote-api';

const PAIRING_TTL_MS = 10 * 60 * 1000;
const PAIRING_COOKIE_NAME = 'onframe_pairing';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const MELI_OAUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const MELI_AUTHORIZATION_URL = 'https://auth.mercadolivre.com.br/authorization';
const MELI_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
const MELI_ME_URL = 'https://api.mercadolibre.com/users/me';
const MELI_TOKEN_KEY_VERSION = 1;

type RuntimeEnv = Env & {
  MELI_CLIENT_ID?: string;
  MELI_CLIENT_SECRET?: string;
  MELI_REDIRECT_URI?: string;
  MELI_TOKEN_CIPHER_KEY?: CryptoKey;
};

type AccessIdentity = {
  email: string;
  name: string;
  subject: string;
};

type Actor = AccessIdentity & {
  userId: string;
  workspaceId: string;
};

type HealthResponse = {
  ok: boolean;
  service: 'onframe-api';
  timestamp: string;
};

type Pairing = {
  code: string;
  expiresAt: number;
};

type ExtensionSessionActor = {
  sessionId: string;
  userId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  workspaceName: string;
  label: string | null;
  expiresAt: number;
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
  responseHeaders.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function randomSecret(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get('cookie');
  if (!cookies) return null;

  for (const entry of cookies.split(';')) {
    const [key, ...value] = entry.trim().split('=');
    if (key !== name) continue;

    try {
      return decodeURIComponent(value.join('='));
    } catch {
      return null;
    }
  }

  return null;
}

function pairingCookie(pairing: Pairing): string {
  const maxAge = Math.max(1, Math.floor((pairing.expiresAt - now()) / 1000));
  return `${PAIRING_COOKIE_NAME}=${encodeURIComponent(pairing.code)}; Max-Age=${maxAge}; Path=/connect; HttpOnly; Secure; SameSite=Strict`;
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
  MELI_TOKEN_CIPHER_KEY: CryptoKey;
} {
  if (
    !String(env.MELI_CLIENT_ID || '').trim()
    || !String(env.MELI_CLIENT_SECRET || '').trim()
    || !meliRedirectUri(env)
    || !env.MELI_TOKEN_CIPHER_KEY
  ) {
    throw new RequestError('remote_oauth_unconfigured', 503);
  }
}

async function encryptValue(env: RuntimeEnv, value: string): Promise<EncryptedValue> {
  assertMeliConfigured(env);
  return encryptTokenValue(env.MELI_TOKEN_CIPHER_KEY, value);
}

async function decryptValue(env: RuntimeEnv, encrypted: EncryptedValue): Promise<string> {
  assertMeliConfigured(env);
  return decryptTokenValue(env.MELI_TOKEN_CIPHER_KEY, encrypted);
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

async function authenticateAccess(request: Request, env: Env): Promise<AccessIdentity> {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) throw new RequestError('access_unauthorized', 401);

  const issuer = env.ACCESS_TEAM_DOMAIN;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  try {
    const { payload } = await jwtVerify(token, jwks, {
      audience: env.ACCESS_AUD,
      issuer
    });

    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new RequestError('access_identity_incomplete', 401);
    }

    const email = payload.email.trim().toLowerCase();
    if (!email) throw new RequestError('access_identity_incomplete', 401);

    return {
      email,
      name: typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : email.split('@')[0],
      subject: payload.sub
    };
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('access_unauthorized', 401);
  }
}

async function provisionActor(env: Env, identity: AccessIdentity): Promise<Actor> {
  const [userId, workspaceId] = await Promise.all([
    stableId('usr', identity.subject),
    stableId('wsp', identity.subject)
  ]);
  const timestamp = now();

  await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare(`
      INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(identity_subject) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        updated_at = excluded.updated_at
    `).bind(userId, identity.subject, identity.email, identity.name, timestamp, timestamp),
    env.ONFRAME_DB.prepare(`
      INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(workspaceId, `OnFrame - ${identity.name}`, userId, timestamp, timestamp),
    env.ONFRAME_DB.prepare(`
      INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at)
      VALUES (?, ?, 'owner', ?, ?)
      ON CONFLICT(workspace_id, user_id) DO NOTHING
    `).bind(workspaceId, userId, timestamp, timestamp)
  ]);

  return { ...identity, userId, workspaceId };
}

async function createPairing(env: Env, actor: Actor): Promise<Pairing> {
  const code = `OF-${randomSecret(18)}`;
  const timestamp = now();
  const expiresAt = timestamp + PAIRING_TTL_MS;

  await env.ONFRAME_DB.prepare(`
    INSERT INTO extension_pairings (id, code_hash, user_id, workspace_id, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    await sha256(code),
    actor.userId,
    actor.workspaceId,
    expiresAt,
    timestamp
  ).run();

  return { code, expiresAt };
}

async function getPairing(request: Request, env: Env, actor: Actor): Promise<{ isNew: boolean; pairing: Pairing }> {
  const code = cookieValue(request, PAIRING_COOKIE_NAME);
  if (code && /^OF-[A-Za-z0-9_-]{24}$/u.test(code)) {
    const timestamp = now();
    const existing = await env.ONFRAME_DB.prepare(`
      SELECT expires_at
      FROM extension_pairings
      WHERE code_hash = ?
        AND user_id = ?
        AND workspace_id = ?
        AND claimed_at IS NULL
        AND expires_at > ?
    `).bind(await sha256(code), actor.userId, actor.workspaceId, timestamp).first<{ expires_at: number }>();

    if (existing) {
      return {
        isNew: false,
        pairing: { code, expiresAt: existing.expires_at }
      };
    }
  }

  return {
    isNew: true,
    pairing: await createPairing(env, actor)
  };
}

function sessionToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]+)$/u.exec(authorization);
  if (!match || !SESSION_TOKEN_PATTERN.test(match[1])) {
    throw new RequestError('extension_session_unauthorized', 401);
  }
  return match[1];
}

async function authenticateExtensionSession(request: Request, env: Env): Promise<ExtensionSessionActor> {
  const timestamp = now();
  const record = await env.ONFRAME_DB.prepare(`
    SELECT
      extension_sessions.id AS session_id,
      extension_sessions.user_id,
      extension_sessions.workspace_id,
      extension_sessions.label,
      extension_sessions.expires_at,
      users.email,
      users.display_name,
      workspaces.name AS workspace_name
    FROM extension_sessions
    INNER JOIN users ON users.id = extension_sessions.user_id
    INNER JOIN workspaces ON workspaces.id = extension_sessions.workspace_id
    WHERE extension_sessions.token_hash = ?
      AND extension_sessions.revoked_at IS NULL
      AND extension_sessions.expires_at > ?
  `).bind(await sha256(sessionToken(request)), timestamp).first<{
    session_id: string;
    user_id: string;
    workspace_id: string;
    label: string | null;
    expires_at: number;
    email: string;
    display_name: string | null;
    workspace_name: string;
  }>();

  if (!record) throw new RequestError('extension_session_unauthorized', 401);

  await env.ONFRAME_DB.prepare(`
    UPDATE extension_sessions
    SET last_seen_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).bind(timestamp, record.session_id).run();

  return {
    sessionId: record.session_id,
    userId: record.user_id,
    workspaceId: record.workspace_id,
    email: record.email,
    displayName: record.display_name || record.email,
    workspaceName: record.workspace_name,
    label: record.label,
    expiresAt: record.expires_at
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
      name: actor.displayName
    },
    workspace: {
      id: actor.workspaceId,
      name: actor.workspaceName
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

  if (!membership || membership.role !== 'owner') {
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
      INSERT INTO account_members (seller_account_id, user_id, role, created_at, updated_at)
      VALUES (?, ?, 'owner', ?, ?)
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
    ORDER BY nickname COLLATE NOCASE, meli_user_id
  `).bind(actor.workspaceId).all<{
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

async function parseSessionClaim(request: Request): Promise<{ pairingCode: string; label: string | null }> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) throw new RequestError('invalid_content_type', 415);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new RequestError('invalid_json', 400);
  }

  if (!body || typeof body !== 'object') throw new RequestError('invalid_request', 400);
  const { pairingCode, label } = body as Record<string, unknown>;
  if (typeof pairingCode !== 'string' || !/^OF-[A-Za-z0-9_-]{24}$/u.test(pairingCode)) {
    throw new RequestError('invalid_pairing_code', 400);
  }
  if (label !== undefined && (typeof label !== 'string' || label.length > 80)) {
    throw new RequestError('invalid_session_label', 400);
  }

  return {
    pairingCode,
    label: typeof label === 'string' ? label.trim() || null : null
  };
}

async function claimExtensionSession(
  request: Request,
  env: Env
): Promise<{ expiresAt: number; sessionId: string; token: string }> {
  const { pairingCode, label } = await parseSessionClaim(request);
  const timestamp = now();
  const sessionId = crypto.randomUUID();
  const token = randomSecret(32);
  const expiresAt = timestamp + SESSION_TTL_MS;
  const pairingHash = await sha256(pairingCode);
  const tokenHash = await sha256(token);

  const results = await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare(`
      UPDATE extension_pairings
      SET claimed_at = ?, claimed_session_id = ?
      WHERE code_hash = ? AND claimed_at IS NULL AND expires_at > ?
    `).bind(timestamp, sessionId, pairingHash, timestamp),
    env.ONFRAME_DB.prepare(`
      INSERT INTO extension_sessions (id, token_hash, user_id, workspace_id, label, expires_at, created_at)
      SELECT ?, ?, user_id, workspace_id, ?, ?, ?
      FROM extension_pairings
      WHERE code_hash = ? AND claimed_session_id = ?
    `).bind(sessionId, tokenHash, label, expiresAt, timestamp, pairingHash, sessionId)
  ]);

  if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
    throw new RequestError('pairing_unavailable', 409);
  }

  return { expiresAt, sessionId, token };
}

function appPage(actor: Actor): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>OnFrame</title>
    <style>
      :root { color: #202124; font-family: Arial, sans-serif; }
      body { margin: 0; background: #f7f8fa; }
      main { box-sizing: border-box; max-width: 640px; margin: 10vh auto; padding: 32px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
      p { margin: 0 0 12px; color: #5f6368; } h1 { margin: 0 0 8px; font-size: 24px; } a { color: #1a73e8; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <p>ONFRAME</p>
      <h1>${escapeHtml(actor.name)}</h1>
      <p>${escapeHtml(actor.email)}</p>
      <a href="/connect">Conectar extensão</a>
    </main>
  </body>
</html>`;
}

function connectPage(actor: Actor, pairing: Pairing): string {
  const expiresAt = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Sao_Paulo'
  }).format(new Date(pairing.expiresAt));

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Parear extensão - OnFrame</title>
    <style>
      :root { color: #202124; font-family: Arial, sans-serif; }
      body { margin: 0; background: #f7f8fa; }
      main { box-sizing: border-box; max-width: 640px; margin: 10vh auto; padding: 32px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
      p { margin: 0 0 12px; color: #5f6368; } h1 { margin: 0 0 20px; font-size: 24px; } code { display: block; padding: 16px; border: 1px solid #dfe3eb; border-radius: 6px; color: #202124; font-size: 18px; font-weight: 700; letter-spacing: 0.04em; }
    </style>
  </head>
  <body>
    <main>
      <p>ONFRAME</p>
      <h1>Código de pareamento</h1>
      <code>${pairing.code}</code>
      <p>Expira às ${expiresAt}.</p>
      <p>${escapeHtml(actor.email)}</p>
    </main>
  </body>
</html>`;
}

function meliCallbackPage(options: { connected: boolean; nickname?: string | null }): string {
  const title = options.connected ? 'Conta conectada' : 'Não foi possível conectar';
  const message = options.connected
    ? `${options.nickname ? `${escapeHtml(options.nickname)} foi vinculada ao workspace.` : 'A conta foi vinculada ao workspace.'} Volte para as opções da extensão.`
    : 'A autorização não foi concluída. Feche esta aba e inicie uma nova conexão pela extensão.';

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} - OnFrame</title>
    <style>
      :root { color: #202124; font-family: Arial, sans-serif; }
      body { margin: 0; background: #f7f8fa; }
      main { box-sizing: border-box; max-width: 640px; margin: 10vh auto; padding: 32px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
      p { margin: 0 0 12px; color: #5f6368; } h1 { margin: 0 0 8px; font-size: 24px; }
    </style>
  </head>
  <body>
    <main>
      <p>ONFRAME</p>
      <h1>${title}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`;
}

async function handleMeliCallback(request: Request, env: RuntimeEnv, requestId: string): Promise<Response> {
  const url = new URL(request.url);

  try {
    const state = url.searchParams.get('state') || '';
    const transaction = await consumeMeliOAuthTransaction(env, state);
    const authorizationError = url.searchParams.get('error');
    const code = url.searchParams.get('code') || '';

    if (authorizationError || !code) {
      return html(meliCallbackPage({ connected: false }), 400);
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
    return html(meliCallbackPage({ connected: true, nickname: account.nickname }));
  } catch (error) {
    logFailure(requestId, request, error);
    return html(meliCallbackPage({ connected: false }), error instanceof RequestError ? error.status : 503);
  }
}

export default {
  async fetch(request, env: RuntimeEnv): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();

    try {
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

      if (request.method === 'GET' && url.pathname === '/app') {
        const actor = await provisionActor(env, await authenticateAccess(request, env));
        return html(appPage(actor));
      }

      if (request.method === 'GET' && url.pathname === '/connect') {
        const actor = await provisionActor(env, await authenticateAccess(request, env));
        const { isNew, pairing } = await getPairing(request, env, actor);
        if (isNew) {
          console.log(JSON.stringify({
            event: 'extension_pairing_issued',
            requestId,
            userId: actor.userId,
            workspaceId: actor.workspaceId,
            expiresAt: pairing.expiresAt
          }));
        }
        return html(connectPage(actor, pairing), 200, {
          'set-cookie': pairingCookie(pairing)
        });
      }

      if (request.method === 'GET' && url.pathname === '/oauth/mercadolivre/callback') {
        return handleMeliCallback(request, env, requestId);
      }

      if (request.method === 'POST' && url.pathname === '/v1/extension-sessions') {
        const session = await claimExtensionSession(request, env);
        console.log(JSON.stringify({
          event: 'extension_session_claimed',
          requestId,
          sessionId: session.sessionId,
          expiresAt: session.expiresAt
        }));
        return json({
          expiresAt: new Date(session.expiresAt).toISOString(),
          sessionId: session.sessionId,
          token: session.token
        }, 201);
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
      if (error instanceof RequestError) {
        return json({ error: error.code, requestId }, error.status);
      }

      logFailure(requestId, request, error);
      return json({ error: 'service_unavailable', requestId }, 503);
    }
  }
} satisfies ExportedHandler<RuntimeEnv>;
