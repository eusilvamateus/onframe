import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { listWorkspaceAccounts, updateWorkspaceAccount } from '../src/index.ts';

const admin = {
  userId: 'user-1', workspaceId: 'workspace-1', workspaceRole: 'admin',
  subject: 'subject-1', authSessionId: 'session-1', identityVersion: 1, label: 'Extensão OnFrame'
} as any;

test('nome de exibicao e estado da conta sao independentes do nome do Mercado Livre', async () => {
  const simulator = new Miniflare({ workers: [{ config: {
    name: 'workspace-accounts-tests', compatibilityDate: '2026-09-24',
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" } } },
    env: { ONFRAME_DB: { type: 'd1', id: 'workspace-accounts-test-db' } }
  } }] });
  try {
    const db = await simulator.getD1Database('ONFRAME_DB');
    const files = (await readdir(new URL('../migrations/', import.meta.url))).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
    }
    await db.batch([
      db.prepare("INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('user-1', 'subject-1', 'pessoa@example.com', 'Pessoa', 1, 1, 1)"),
      db.prepare("INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Principal', 'user-1', 1, 1)"),
      db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at) VALUES ('workspace-1', 'user-1', 'admin', 1, 1)"),
      db.prepare("INSERT INTO seller_accounts (id, workspace_id, meli_user_id, nickname, enabled, created_at, updated_at) VALUES ('account-1', 'workspace-1', '123', 'Nome original', 1, 1, 1)")
    ]);
    const env = { ONFRAME_DB: db } as any;
    const update = (payload: object, actor = admin) => updateWorkspaceAccount(
      new Request('https://onframe.onblide.com/v1/accounts/123', { method: 'PATCH', body: JSON.stringify(payload) }),
      env, actor, '123', 'request-1'
    );

    await assert.rejects(update({ displayName: '   ' }), { code: 'invalid_account_name' });
    await assert.rejects(update({ displayName: 'x'.repeat(81) }), { code: 'invalid_account_name' });
    await assert.rejects(update({ enabled: true, displayName: 'Outro' }), { code: 'invalid_account_update' });
    await assert.rejects(update({ displayName: 'Outro' }, { ...admin, userId: 'user-2', workspaceRole: 'collaborator' }), { code: 'workspace_account_access_forbidden' });

    const renamed = await update({ displayName: '  Loja principal  ' });
    assert.equal(renamed[0].displayName, 'Loja principal');
    assert.equal(renamed[0].nickname, 'Nome original');
    const disabled = await update({ enabled: false });
    assert.equal(disabled[0].enabled, false);
    assert.equal(disabled[0].displayName, 'Loja principal');
    assert.equal((await listWorkspaceAccounts(env, admin))[0].displayName, 'Loja principal');
  } finally {
    await simulator.dispose();
  }
});
