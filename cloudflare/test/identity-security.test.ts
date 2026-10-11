import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import worker from '../src/index.ts';
import { loadIdentityState, requireIdentitySession, synchronizeIdentity } from '../src/identity-security.ts';

const subject = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const otherSubject = '33333333-3333-4333-8333-333333333333';
const otherSessionId = '44444444-4444-4444-8444-444444444444';
const rpc = 'https://project.supabase.co/rest/v1/rpc/onframe_identity_state';
const schema = `
  create role anon; create role authenticated; create role service_role;
  create role supabase_auth_admin;
  create schema auth; create schema extensions;
  create function extensions.gen_random_uuid() returns uuid language sql as 'select gen_random_uuid()';
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create table auth.users (
    id uuid primary key, email text, encrypted_password text,
    raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz,
    banned_until timestamptz, deleted_at timestamptz, new_email text
  );
  create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, created_at timestamptz default now(), not_after timestamptz);
  create table auth.mfa_factors (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, status text);
`;

async function postgres() {
  const pg = new PGlite();
  await pg.exec(schema);
  for (const file of ['20260928184128_init_onframe_identity_model.sql', '20260928184506_secure_identity_access.sql']) {
    await pg.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
  await pg.query('insert into auth.users (id, email, encrypted_password, email_confirmed_at) values ($1, $2, $3, now())', [subject, 'pessoa@example.com', 'hash-inicial']);
  await pg.exec(await readFile(new URL('../../supabase/migrations/20261011120000_identity_authority.sql', import.meta.url), 'utf8'));
  await pg.query('insert into auth.sessions (id, user_id) values ($1, $2)', [sessionId, subject]);
  return pg;
}

async function identity(pg: PGlite, userId = subject, authSessionId = sessionId) {
  const result = await pg.query<{ state: object | null }>('select public.onframe_identity_state($1, $2) as state', [userId, authSessionId]);
  return result.rows[0].state;
}

test('Supabase preserva o legado, retira seu acesso e limita a RPC ao servidor', async () => {
  const pg = await postgres();
  try {
    const rows = await pg.query<{ allowed: boolean }>("select has_table_privilege('authenticated', 'public.profiles', 'select') as allowed");
    assert.equal(rows.rows[0].allowed, false);
    const grants = await pg.query<{ allowed: boolean }>("select has_function_privilege('authenticated', 'public.onframe_identity_state(uuid,uuid)', 'execute') as allowed");
    assert.equal(grants.rows[0].allowed, false);
    await pg.exec('set role service_role');
    assert.deepEqual(await identity(pg), { subject, email: 'pessoa@example.com', version: 1, reason: null, sessionActive: true });
    await pg.exec('reset role');
    assert.equal((await pg.query('select * from public.profiles')).rows.length, 1);
    await pg.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'outra@example.com', now())", [otherSubject]);
    assert.equal((await pg.query('select * from public.profiles')).rows.length, 1);
    assert.equal((await pg.query('select * from onframe_private.identity_security')).rows.length, 2);
  } finally { await pg.close(); }
});

test('somente alteracoes confirmadas revogam acesso; novo login recebe a nova versao', async () => {
  const pg = await postgres();
  try {
    await pg.query("update auth.users set new_email = 'novo@example.com', raw_user_meta_data = '{\"display_name\":\"Nome\"}' where id = $1", [subject]);
    assert.equal((await identity(pg) as { version: number }).version, 1);
    await pg.query("update auth.users set email = 'novo@example.com' where id = $1", [subject]);
    assert.deepEqual(await identity(pg), { subject, email: 'novo@example.com', version: 2, reason: 'email_changed', sessionActive: false });
    await pg.query('insert into auth.sessions (id, user_id, created_at) values ($1, $2, clock_timestamp())', [otherSessionId, subject]);
    assert.equal((await identity(pg, subject, otherSessionId) as { sessionActive: boolean }).sessionActive, true);
    await pg.query("update auth.users set encrypted_password = 'hash-novo' where id = $1", [subject]);
    assert.equal((await identity(pg, subject, otherSessionId) as { sessionActive: boolean }).sessionActive, false);
    assert.equal((await identity(pg) as { version: number }).version, 3);
  } finally { await pg.close(); }
});

test('remocao de fator confirmado, bloqueio, exclusao e logout encerram acesso', async () => {
  const pg = await postgres();
  try {
    await pg.query("insert into auth.mfa_factors (id, user_id, status) values ($1, $2, 'unverified')", [otherSessionId, subject]);
    await pg.query('delete from auth.mfa_factors where id = $1', [otherSessionId]);
    assert.equal((await identity(pg) as { version: number }).version, 1);
    await pg.query("insert into auth.mfa_factors (id, user_id, status) values ($1, $2, 'verified')", [otherSessionId, subject]);
    await pg.query('delete from auth.mfa_factors where id = $1', [otherSessionId]);
    assert.deepEqual(await identity(pg), { subject, email: 'pessoa@example.com', version: 2, reason: 'mfa_factor_removed', sessionActive: false });
    await pg.query("update auth.users set banned_until = now() + interval '1 day' where id = $1", [subject]);
    assert.equal(await identity(pg), null);
    await pg.query('update auth.users set banned_until = null where id = $1', [subject]);
    await pg.query('insert into auth.sessions (id, user_id, created_at) values ($1, $2, clock_timestamp())', [otherSessionId, subject]);
    await pg.query('delete from auth.sessions where id = $1', [otherSessionId]);
    assert.equal((await identity(pg, subject, otherSessionId) as { sessionActive: boolean }).sessionActive, false);
    await pg.query('delete from auth.users where id = $1', [subject]);
    assert.equal(await identity(pg), null);
  } finally { await pg.close(); }
});

async function d1(seedLegacy = false) {
  const simulator = new Miniflare({ workers: [{ config: {
    name: 'identity-tests', compatibilityDate: '2026-09-24',
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" } } },
    env: { ONFRAME_DB: { type: 'd1', id: 'identity-test-db' } }
  } }] });
  try {
    const db = await simulator.getD1Database('ONFRAME_DB');
    const files = (await readdir(new URL('../migrations/', import.meta.url))).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      if (seedLegacy && file === '0008_identity_sessions.sql') {
        await db.batch([
          db.prepare("insert into users (id, identity_subject, email, display_name, created_at, updated_at) values ('legacy-user', ?, 'legado@example.com', 'Perfil preservado', 1, 1)").bind(subject),
          db.prepare("insert into workspaces (id, name, created_by_user_id, created_at, updated_at) values ('legacy-workspace', 'Workspace preservado', 'legacy-user', 1, 1)"),
          db.prepare("insert into extension_sessions (id, token_hash, user_id, workspace_id, expires_at, created_at, revoked_at) values ('active', 'active-hash', 'legacy-user', 'legacy-workspace', 4102444800000, 1, null), ('revoked', 'revoked-hash', 'legacy-user', 'legacy-workspace', 4102444800000, 1, 123)"),
          db.prepare("insert into extension_auth_flows (id, token_hash, user_id, workspace_id, expires_at, created_at, claimed_at) values ('pending', 'pending-hash', 'legacy-user', 'legacy-workspace', 4102444800000, 1, null), ('claimed', 'claimed-hash', 'legacy-user', 'legacy-workspace', 4102444800000, 1, 123)")
        ]);
      }
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
    }
    return { simulator, db };
  } catch (error) {
    await simulator.dispose();
    throw error;
  }
}

test('migracao D1 encerra o acesso legado sem apagar perfil, workspace ou historico', async () => {
  const { simulator, db } = await d1(true);
  try {
    assert.deepEqual(await db.prepare('select display_name, identity_subject, identity_version from users').first(), {
      display_name: 'Perfil preservado', identity_subject: subject, identity_version: 0
    });
    assert.equal((await db.prepare('select name from workspaces').first<{ name: string }>())?.name, 'Workspace preservado');
    assert.ok(Number((await db.prepare("select revoked_at from extension_sessions where id = 'active'").first<{ revoked_at: number }>())?.revoked_at) > 0);
    assert.equal((await db.prepare("select revoked_at from extension_sessions where id = 'revoked'").first<{ revoked_at: number }>())?.revoked_at, 123);
    assert.equal((await db.prepare("select expires_at from extension_auth_flows where id = 'pending'").first<{ expires_at: number }>())?.expires_at, 0);
    assert.equal((await db.prepare("select expires_at from extension_auth_flows where id = 'claimed'").first<{ expires_at: number }>())?.expires_at, 4102444800000);
  } finally { await simulator.dispose(); }
});

function bearer(userId = subject, authSessionId = sessionId) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode({ sub: userId, session_id: authSessionId, exp: 4102444800 })}.signature`;
}

test('Worker valida identidade canonica, revoga todas as sessoes antigas e preserva o nome do perfil', async () => {
  const { simulator, db } = await d1();
  const originalFetch = globalThis.fetch;
  let state = { subject, email: 'pessoa@example.com', version: 1, reason: null as string | null, sessionActive: true };
  const env = { ONFRAME_DB: db, SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key', SUPABASE_PUBLISHABLE_KEY: 'public-test-key' };
  globalThis.fetch = async (input, init) => {
    if (String(input) === rpc) return Response.json(state);
    if (String(input) === 'https://project.supabase.co/auth/v1/user') return Response.json({ id: subject, email: state.email, user_metadata: { display_name: 'Nome inicial' } });
    throw new Error(`URL inesperada: ${String(input)}`);
  };
  const request = (path: string, token: string, method = 'GET') => new Request(`https://onframe.onblide.com${path}`, { method, headers: { authorization: `Bearer ${token}` } });
  try {
    const create = await worker.fetch(request('/v1/extension-sessions/from-auth', bearer(), 'POST'), env as Env);
    assert.equal(create.status, 201);
    const session = await create.json() as { token: string };
    assert.equal((await worker.fetch(request('/v1/profile', session.token), env as Env)).status, 200);
    await db.prepare("update users set display_name = 'Nome escolhido'").run();
    const login = await worker.fetch(request('/v1/extension-sessions/from-auth', bearer(), 'POST'), env as Env);
    assert.equal(login.status, 201);
    const second = await login.json() as { token: string };
    assert.equal((await db.prepare('select display_name from users').first<{ display_name: string }>())?.display_name, 'Nome escolhido');
    state = { ...state, email: 'novo@example.com', version: 2, reason: 'email_changed', sessionActive: false };
    assert.equal((await worker.fetch(request('/v1/profile', session.token), env as Env)).status, 401);
    assert.equal((await worker.fetch(request('/v1/profile', second.token), env as Env)).status, 401);
    assert.equal((await db.prepare('select email from users').first<{ email: string }>())?.email, state.email);
    assert.equal((await db.prepare("select count(*) as total from audit_events where operation = 'identity_security_changed'").first<{ total: number }>())?.total, 1);
    assert.equal((await worker.fetch(request('/v1/extension-sessions/from-auth', bearer(), 'POST'), env as Env)).status, 401);
    state.sessionActive = true;
    const fresh = await worker.fetch(request('/v1/extension-sessions/from-auth', bearer(subject, otherSessionId), 'POST'), env as Env);
    assert.equal(fresh.status, 201);
    const current = await fresh.json() as { token: string };
    // Uma resposta antiga nao restaura dados nem revoga a sessao mais recente.
    await synchronizeIdentity(env, { ...state, email: 'antigo@example.com', version: 1, reason: null });
    assert.equal((await worker.fetch(request('/v1/profile', current.token), env as Env)).status, 200);
    assert.equal((await db.prepare('select email from users').first<{ email: string }>())?.email, 'novo@example.com');
    globalThis.fetch = async () => new Response('indisponivel', { status: 503 });
    assert.equal((await worker.fetch(request('/v1/profile', current.token), env as Env)).status, 503);
    assert.equal((await db.prepare('select count(*) as total from extension_sessions where revoked_at is null').first<{ total: number }>())?.total, 1);
  } finally { globalThis.fetch = originalFetch; await simulator.dispose(); }
});

test('a mesma caixa de email nao autoriza vincular outra identidade ao usuario existente', async () => {
  const { simulator, db } = await d1();
  const originalFetch = globalThis.fetch;
  const env = { ONFRAME_DB: db, SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key', SUPABASE_PUBLISHABLE_KEY: 'public-test-key' };
  await db.prepare('insert into users (id, identity_subject, email, created_at, updated_at, identity_version) values (?, ?, ?, 1, 1, 1)').bind('usr_original', subject, 'pessoa@example.com').run();
  globalThis.fetch = async (input) => String(input) === rpc
    ? Response.json({ subject: otherSubject, email: 'pessoa@example.com', version: 1, reason: null, sessionActive: true })
    : Response.json({ id: otherSubject, email: 'pessoa@example.com' });
  try {
    const response = await worker.fetch(new Request('https://onframe.onblide.com/v1/extension-sessions/from-auth', { method: 'POST', headers: { authorization: `Bearer ${bearer(otherSubject, otherSessionId)}` } }), env as Env);
    assert.notEqual(response.status, 201);
    assert.equal((await db.prepare('select identity_subject from users').first<{ identity_subject: string }>())?.identity_subject, subject);
    assert.equal((await db.prepare('select count(*) as total from extension_sessions').first<{ total: number }>())?.total, 0);
  } finally { globalThis.fetch = originalFetch; await simulator.dispose(); }
});

test('fluxo confirmado nao recria acesso apos mudanca de seguranca e so pode ser consumido uma vez', async () => {
  const { simulator, db } = await d1();
  const pg = await postgres();
  const originalFetch = globalThis.fetch;
  const env = { ONFRAME_DB: db, SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key', SUPABASE_PUBLISHABLE_KEY: 'public-test-key' };
  globalThis.fetch = async (input, init) => {
    if (String(input) === rpc) {
      const args = JSON.parse(String(init?.body));
      return Response.json(await identity(pg, args.p_user_id, args.p_session_id));
    }
    return Response.json({ id: subject, email: 'pessoa@example.com' });
  };
  const request = (path: string, method = 'GET', token = '') => new Request(`https://onframe.onblide.com${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
  try {
    const initial = await worker.fetch(request('/v1/extension-auth-flows', 'POST'), env as Env);
    const flow = await initial.json() as { flow: string };
    assert.equal((await worker.fetch(request(`/v1/extension-auth-flows/${flow.flow}`, 'POST', bearer()), env as Env)).status, 200);
    await pg.query("update auth.users set encrypted_password = 'nova-senha' where id = $1", [subject]);
    assert.equal((await worker.fetch(request(`/v1/extension-auth-flows/${flow.flow}`), env as Env)).status, 401);
    assert.equal((await db.prepare('select count(*) as total from extension_sessions').first<{ total: number }>())?.total, 0);
    await pg.query('insert into auth.sessions (id, user_id, created_at) values ($1, $2, clock_timestamp())', [otherSessionId, subject]);
    const next = await worker.fetch(request('/v1/extension-auth-flows', 'POST'), env as Env);
    const fresh = await next.json() as { flow: string };
    assert.equal((await worker.fetch(request(`/v1/extension-auth-flows/${fresh.flow}`, 'POST', bearer(subject, otherSessionId)), env as Env)).status, 200);
    const responses = await Promise.all([
      worker.fetch(request(`/v1/extension-auth-flows/${fresh.flow}`), env as Env),
      worker.fetch(request(`/v1/extension-auth-flows/${fresh.flow}`), env as Env)
    ]);
    assert.equal(responses.filter((response) => response.status === 200).length, 1);
    assert.equal((await db.prepare('select count(*) as total from extension_sessions').first<{ total: number }>())?.total, 1);
    await pg.query('delete from auth.sessions where id = $1', [otherSessionId]);
    const result = await responses.find((response) => response.status === 200)!.json() as { token: string };
    assert.equal((await worker.fetch(request('/v1/profile', 'GET', result.token), env as Env)).status, 401);
  } finally { globalThis.fetch = originalFetch; await pg.close(); await simulator.dispose(); }
});

test('RPC indisponivel ou malformada falha fechada sem receber senha', async () => {
  const originalFetch = globalThis.fetch;
  const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key', ONFRAME_DB: {} as D1Database };
  try {
    globalThis.fetch = async (_, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), { p_user_id: subject, p_session_id: sessionId });
      return Response.json({ subject, email: 'pessoa@example.com', version: '1', reason: null, sessionActive: true });
    };
    await assert.rejects(loadIdentityState(env, subject, sessionId), { code: 'identity_security_unavailable', status: 503 });
    globalThis.fetch = async () => { throw new Error('timeout'); };
    await assert.rejects(requireIdentitySession(env, subject, sessionId, 1), { code: 'identity_security_unavailable', status: 503 });
    await assert.rejects(loadIdentityState(env, subject, 'invalid'), { status: 401 });
  } finally { globalThis.fetch = originalFetch; }
});
