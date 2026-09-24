import { createRemoteJWKSet, jwtVerify } from 'jose';

const PAIRING_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff'
    }
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

function base64Url(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
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

async function createPairing(env: Env, actor: Actor): Promise<{ code: string; expiresAt: number }> {
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

function connectPage(actor: Actor, pairing: { code: string; expiresAt: number }): string {
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

export default {
  async fetch(request, env): Promise<Response> {
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
        const pairing = await createPairing(env, actor);
        console.log(JSON.stringify({
          event: 'extension_pairing_issued',
          requestId,
          userId: actor.userId,
          workspaceId: actor.workspaceId,
          expiresAt: pairing.expiresAt
        }));
        return html(connectPage(actor, pairing));
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

      return json({ error: 'not_found', requestId }, 404);
    } catch (error) {
      if (error instanceof RequestError) {
        return json({ error: error.code, requestId }, error.status);
      }

      logFailure(requestId, request, error);
      return json({ error: 'service_unavailable', requestId }, 503);
    }
  }
} satisfies ExportedHandler<Env>;
