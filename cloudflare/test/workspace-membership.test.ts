import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { acceptWorkspaceInvitation, leaveWorkspace, provisionActor, removeWorkspaceMember, updateWorkspaceMember } from '../src/index.ts';

const actor = {
  userId: 'user-1', workspaceId: 'workspace-1', workspaceRole: 'admin',
  subject: 'subject-1', authSessionId: 'auth-session-1', identityVersion: 1,
  label: 'Extensão OnFrame'
} as any;

function database(first: (sql: string, values: unknown[]) => unknown, run: (sql: string, values: unknown[]) => number = () => 1) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const prepare = (sql: string) => ({
    bind: (...values: unknown[]) => {
      queries.push({ sql, values });
      return {
        first: async () => first(sql, values),
        run: async () => ({ meta: { changes: run(sql, values) } }),
        all: async () => ({ results: [] })
      };
    }
  });
  return { queries, env: { ONFRAME_DB: { prepare, batch: async (statements: unknown[]) => statements } } as any };
}

test('autenticacao preserva outro workspace e nao recria participacao abandonada', async () => {
  const identity = { subject: 'subject-1', email: 'pessoa@example.com', name: 'Pessoa', authSessionId: 'auth-session-1', identityVersion: 1 };
  const existing = database(() => null);
  existing.env.ONFRAME_DB.prepare = (sql: string) => ({
    bind: (...values: unknown[]) => {
      existing.queries.push({ sql, values });
      return {
        all: async () => ({ results: sql.includes('identity_subject = ?') ? [{ id: 'user-1' }] : [] }),
        first: async () => sql.includes('FROM workspace_members WHERE user_id') ? { workspace_id: 'workspace-2' } : null,
        run: async () => ({ meta: { changes: 1 } })
      };
    }
  });
  const result = await provisionActor(existing.env, identity);
  assert.equal(result.workspaceId, 'workspace-2');
  assert.equal(existing.queries.some((query) => query.sql.includes('INSERT INTO workspace_members')), false);
});

test('novo acesso apos sair nao recoloca a pessoa no workspace anterior', async () => {
  const { env, queries } = database((sql) => {
    if (sql.includes('FROM workspace_members WHERE user_id')) return null;
    if (sql.includes('FROM workspaces') && sql.includes('created_by_user_id')) return { id: 'workspace-1' };
    return null;
  });
  const originalPrepare = env.ONFRAME_DB.prepare;
  env.ONFRAME_DB.prepare = (sql: string) => {
    const prepared = originalPrepare(sql);
    if (!sql.includes('identity_subject = ?')) return prepared;
    return { bind: (...values: unknown[]) => {
      const bound = prepared.bind(...values);
      return { ...bound, all: async () => ({ results: [{ id: 'user-1' }] }) };
    } };
  };
  const result = await provisionActor(env, { subject: 'subject-1', email: 'pessoa@example.com', name: 'Pessoa', authSessionId: 'auth-session-1', identityVersion: 1 });
  assert.notEqual(result.workspaceId, 'workspace-1');
  assert.ok(queries.some((query) => query.sql.includes('INSERT INTO workspace_members') && query.values.includes(result.workspaceId)));
});

test('administrador nao pode gerenciar ou remover a si mesmo pela rota de membros', async () => {
  const { env, queries } = database(() => null);
  await assert.rejects(removeWorkspaceMember(env, actor, actor.userId), { code: 'workspace_self_management_forbidden' });
  await assert.rejects(updateWorkspaceMember(new Request('https://example.com', { method: 'PATCH', body: '{}' }), env, actor, actor.userId), { code: 'workspace_self_management_forbidden' });
  assert.equal(queries.length, 0);
});

test('saida do ultimo administrador e bloqueada sem revogar sessoes', async () => {
  const { env, queries } = database(() => null, (sql) => sql.includes('DELETE FROM workspace_members') ? 0 : 1);
  await assert.rejects(leaveWorkspace(env, actor), { code: 'workspace_last_admin_required' });
  assert.equal(queries.some((query) => query.sql.includes('UPDATE extension_sessions')), false);
});

test('saida com outro workspace encerra sessoes antigas e entrega nova sessao', async () => {
  const { env, queries } = database((sql) => sql.includes('SELECT workspace_id FROM workspace_members') ? { workspace_id: 'workspace-2' } : null);
  const response = await leaveWorkspace(env, actor);
  const body = await response.json() as { left: boolean; token: string; sessionId: string };
  assert.equal(body.left, true);
  assert.ok(body.token);
  assert.ok(body.sessionId);
  assert.ok(queries.some((query) => query.sql.includes('UPDATE extension_sessions') && query.values.includes('workspace-1')));
  assert.ok(queries.some((query) => query.sql.includes('DELETE FROM account_members') && query.values.includes('workspace-1')));
  assert.ok(queries.some((query) => query.sql.includes('INSERT INTO extension_sessions') && query.values.includes('workspace-2')));
});

test('saida sem outro workspace encerra a sessao sem reingressar no mesmo', async () => {
  const { env, queries } = database(() => null);
  const response = await leaveWorkspace(env, actor);
  assert.deepEqual(await response.json(), { left: true });
  assert.ok(queries.some((query) => query.sql.includes('UPDATE extension_sessions')));
  assert.equal(queries.some((query) => query.sql.includes('INSERT INTO extension_sessions')), false);
});

test('remocao de outra pessoa permite retirar um administrador quando ha outro', async () => {
  const { env, queries } = database((sql) => {
    if (sql.includes('SELECT role FROM workspace_members')) return { role: 'admin' };
    if (sql.includes('SELECT COUNT(*) AS count')) return { count: 2 };
    return null;
  });
  await removeWorkspaceMember(env, actor, 'user-2');
  assert.ok(queries.some((query) => query.sql.includes('DELETE FROM workspace_members') && query.values.includes('user-2')));
  assert.ok(queries.some((query) => query.sql.includes('DELETE FROM account_members') && query.values.includes('user-2')));
  assert.ok(queries.some((query) => query.sql.includes('UPDATE extension_sessions') && query.values.includes('user-2')));
});

test('convite nao altera papel de quem ja participa do workspace', async () => {
  const { env, queries } = database((sql) => {
    if (sql.includes('FROM workspace_invitations')) return { id: 'invite-1', workspace_id: 'workspace-1', kind: 'link', email: null, role: 'admin' };
    if (sql.includes('SELECT 1 FROM workspace_members')) return { 1: 1 };
    return null;
  });
  await assert.rejects(acceptWorkspaceInvitation(env, actor, 'a'.repeat(43)), { code: 'workspace_already_member' });
  assert.equal(queries.some((query) => query.sql.includes('UPDATE workspace_invitations')), false);
});

test('D1 encerra participacao e sessoes sem restaurar o acesso no proximo login', async () => {
  const simulator = new Miniflare({ workers: [{ config: {
    name: 'workspace-membership-tests', compatibilityDate: '2026-09-24',
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" } } },
    env: { ONFRAME_DB: { type: 'd1', id: 'workspace-membership-test-db' } }
  } }] });
  try {
    const db = await simulator.getD1Database('ONFRAME_DB');
    const files = (await readdir(new URL('../migrations/', import.meta.url))).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
    }
    await db.batch([
      db.prepare("INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('user-1', 'subject-1', 'pessoa@example.com', 'Pessoa', 1, 1, 1), ('user-2', 'subject-2', 'outra@example.com', 'Outra', 1, 1, 1)"),
      db.prepare("INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Original', 'user-1', 1, 1), ('workspace-2', 'Outro', 'user-2', 2, 2)"),
      db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at) VALUES ('workspace-1', 'user-1', 'admin', 1, 1), ('workspace-1', 'user-2', 'admin', 2, 2), ('workspace-2', 'user-1', 'collaborator', 3, 3)"),
      db.prepare("INSERT INTO extension_sessions (id, token_hash, user_id, workspace_id, label, expires_at, created_at, identity_version, auth_session_id) VALUES ('session-1', 'hash-1', 'user-1', 'workspace-1', 'Extensão OnFrame', 4102444800000, 1, 1, 'auth-session-1')")
    ]);
    const response = await leaveWorkspace({ ONFRAME_DB: db } as any, actor);
    const next = await response.json() as { token: string };
    assert.ok(next.token);
    assert.equal(await db.prepare("SELECT 1 FROM workspace_members WHERE workspace_id = 'workspace-1' AND user_id = 'user-1'").first(), null);
    assert.equal((await db.prepare("SELECT revoked_at FROM extension_sessions WHERE id = 'session-1'").first<{ revoked_at: number }>())?.revoked_at > 0, true);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM extension_sessions WHERE workspace_id = 'workspace-2' AND user_id = 'user-1'").first<{ count: number }>())?.count, 1);
    const login = await provisionActor({ ONFRAME_DB: db } as any, { subject: 'subject-1', email: 'pessoa@example.com', name: 'Pessoa', authSessionId: 'auth-session-1', identityVersion: 1 });
    assert.equal(login.workspaceId, 'workspace-2');
    assert.equal(await db.prepare("SELECT 1 FROM workspace_members WHERE workspace_id = 'workspace-1' AND user_id = 'user-1'").first(), null);
    await assert.rejects(leaveWorkspace({ ONFRAME_DB: db } as any, { ...actor, userId: 'user-2' }), { code: 'workspace_last_admin_required' });
    await assert.rejects(updateWorkspaceMember(new Request('https://example.com', { method: 'PATCH', body: JSON.stringify({ role: 'collaborator', accountIds: [] }) }), { ONFRAME_DB: db } as any, actor, 'user-2'), { code: 'workspace_last_admin_required' });
    assert.notEqual(await db.prepare("SELECT 1 FROM workspace_members WHERE workspace_id = 'workspace-1' AND user_id = 'user-2'").first(), null);
    assert.equal((await db.prepare("SELECT role FROM workspace_members WHERE workspace_id = 'workspace-1' AND user_id = 'user-2'").first<{ role: string }>())?.role, 'admin');
  } finally { await simulator.dispose(); }
});
