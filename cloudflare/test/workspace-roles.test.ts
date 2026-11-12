import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { deleteWorkspaceRole, listWorkspaceRoles, saveWorkspaceRole, updateWorkspaceMember } from '../src/index.ts';
import { hasPermission, validPermissions } from '../src/permissions.ts';
import { handleRemoteApiRequest, remotePermission } from '../src/remote-api.ts';

const admin = {
  userId: 'admin-1',
  workspaceId: 'workspace-1',
  roleId: 'admin',
  label: 'Extensão OnFrame'
} as Parameters<typeof saveWorkspaceRole>[2];

function roleRequest(name: string, permissions: string[]) {
  return new Request('https://onframe.test/v1/roles', {
    method: 'POST',
    body: JSON.stringify({ name, permissions })
  });
}

test('permissoes exigem leitura e rejeitam acoes desconhecidas', () => {
  assert.equal(validPermissions(['products.write']), null);
  assert.equal(validPermissions(['promotions.read']), null);
  assert.equal(validPermissions(['products.read', 'products.export']), null);
  assert.deepEqual(validPermissions(['products.read', 'products.write', 'products.read']), [
    'products.read',
    'products.write'
  ]);
  assert.equal(
    hasPermission({ roleId: 'collaborator:workspace-1', permissions: ['products.read'] }, 'products.write'),
    false
  );
  assert.deepEqual(remotePermission('POST', '/items/MLB123456/bulk/commit', 'pricing.standard.update'), [
    'listings.write'
  ]);
  assert.deepEqual(remotePermission('POST', '/items/MLB123456/bulk/commit', 'promotion.offer.delete'), [
    'promotions.delete'
  ]);
  assert.deepEqual(remotePermission('POST', '/items/MLB123456/promotions/estimate'), ['promotions.read']);
});

test('rotas comerciais recusam leitura e escrita sem permissao', async () => {
  const base = {
    env: {} as Parameters<typeof handleRemoteApiRequest>[0]['env'],
    requestId: 'request-1',
    actor: {
      roleId: 'collaborator:workspace-1',
      workspaceId: 'workspace-1',
      userId: 'member-1',
      permissions: ['accounts.read', 'promotions.read']
    }
  };
  const request = new Request('https://onframe.test/v1/api/items/MLB123456/promotions/offers', { method: 'PUT' });
  await assert.rejects(handleRemoteApiRequest({ ...base, request, url: new URL(request.url) }), {
    code: 'workspace_permission_denied'
  });
  const readOnly = new Request('https://onframe.test/v1/api/items/MLB123456/pricing/summary');
  await assert.rejects(handleRemoteApiRequest({ ...base, request: readOnly, url: new URL(readOnly.url) }), {
    code: 'workspace_permission_denied'
  });
});

test('perfis personalizados respeitam workspace, atribuicao e exclusao', async () => {
  const simulator = new Miniflare({
    workers: [
      {
        config: {
          name: 'workspace-roles-tests',
          compatibilityDate: '2026-09-24',
          manifest: {
            mainModule: 'index.js',
            modules: {
              'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" }
            }
          },
          env: { ONFRAME_DB: { type: 'd1', id: 'workspace-roles-test-db' } }
        }
      }
    ]
  });
  try {
    const db = await simulator.getD1Database('ONFRAME_DB');
    const files = (await readdir(new URL('../migrations/', import.meta.url)))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
    }
    await db.batch([
      db.prepare(
        "INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('admin-1', 'subject-admin', 'admin@example.com', 'Admin', 1, 1, 1), ('member-1', 'subject-member', 'member@example.com', 'Pessoa', 1, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Principal', 'admin-1', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspace_roles (id, workspace_id, name, system_key, created_at, updated_at, is_default) VALUES ('collaborator:workspace-1', 'workspace-1', 'Colaborador', NULL, 1, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspace_members (workspace_id, user_id, role_id, created_at, updated_at) VALUES ('workspace-1', 'admin-1', 'admin', 1, 1), ('workspace-1', 'member-1', 'collaborator:workspace-1', 1, 1)"
      )
    ]);
    const env = { ONFRAME_DB: db } as Parameters<typeof saveWorkspaceRole>[1];
    const created = await saveWorkspaceRole(roleRequest('Analista', ['accounts.read', 'products.read']), env, admin);
    const custom = created.roles.find((role) => role.name === 'Analista');
    assert.ok(custom);
    assert.equal(custom.system, false);
    assert.deepEqual(custom.permissions.sort(), ['accounts.read', 'products.read']);
    assert.equal((await listWorkspaceRoles(env, admin)).length, 3);
    const defaultRole = await saveWorkspaceRole(
      roleRequest('Colaborador', ['accounts.read', 'products.read']),
      env,
      admin,
      'collaborator:workspace-1'
    );
    assert.deepEqual(defaultRole.roles.find((role) => role.isDefault)?.permissions.sort(), [
      'accounts.read',
      'products.read'
    ]);
    await assert.rejects(
      saveWorkspaceRole(roleRequest('Outro nome', ['accounts.read']), env, admin, 'collaborator:workspace-1'),
      { code: 'workspace_role_not_editable' }
    );
    await assert.rejects(deleteWorkspaceRole(env, admin, 'collaborator:workspace-1'), {
      code: 'workspace_role_not_editable'
    });

    await assert.rejects(saveWorkspaceRole(roleRequest('analista', []), env, admin), {
      code: 'workspace_role_name_taken'
    });
    await assert.rejects(saveWorkspaceRole(roleRequest('Administrador', []), env, admin), {
      code: 'workspace_role_name_taken'
    });
    await assert.rejects(saveWorkspaceRole(roleRequest('Administrador editado', []), env, admin, 'admin'), {
      code: 'workspace_role_not_editable'
    });

    await updateWorkspaceMember(
      new Request('https://onframe.test/v1/members/member-1', {
        method: 'PATCH',
        body: JSON.stringify({ roleId: custom.id, accountIds: [] })
      }),
      env,
      admin,
      'member-1'
    );
    const membership = await db
      .prepare('SELECT role_id FROM workspace_members WHERE user_id = ?')
      .bind('member-1')
      .first<{ role_id: string }>();
    assert.deepEqual(membership, { role_id: custom.id });
    await assert.rejects(deleteWorkspaceRole(env, admin, custom.id), { code: 'workspace_role_in_use' });

    const updated = await saveWorkspaceRole(
      roleRequest('Operador', ['accounts.read', 'products.read', 'products.write']),
      env,
      admin,
      custom.id
    );
    assert.deepEqual(updated.roles.find((role) => role.id === custom.id)?.permissions.sort(), [
      'accounts.read',
      'products.read',
      'products.write'
    ]);
    await updateWorkspaceMember(
      new Request('https://onframe.test/v1/members/member-1', {
        method: 'PATCH',
        body: JSON.stringify({ roleId: 'collaborator:workspace-1', accountIds: [] })
      }),
      env,
      admin,
      'member-1'
    );
    const deleted = await deleteWorkspaceRole(env, admin, custom.id);
    assert.equal(
      deleted.roles.some((role) => role.id === custom.id),
      false
    );
  } finally {
    await simulator.dispose();
  }
});

test('migracao preserva membros e convites existentes sem campos legados', async () => {
  const simulator = new Miniflare({
    workers: [
      {
        config: {
          name: 'workspace-roles-migration-tests',
          compatibilityDate: '2026-09-24',
          manifest: {
            mainModule: 'index.js',
            modules: {
              'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" }
            }
          },
          env: { ONFRAME_DB: { type: 'd1', id: 'workspace-roles-migration-test-db' } }
        }
      }
    ]
  });
  try {
    const db = await simulator.getD1Database('ONFRAME_DB');
    const files = (await readdir(new URL('../migrations/', import.meta.url)))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of files.filter((name) => name < '0022_role_id_only.sql')) {
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
    }
    await db.batch([
      db.prepare(
        "INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('admin-1', 'subject-admin', 'admin@example.com', 'Admin', 1, 1, 1), ('member-1', 'subject-member', 'member@example.com', 'Pessoa', 1, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Principal', 'admin-1', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspace_members (workspace_id, user_id, role, role_id, created_at, updated_at) VALUES ('workspace-1', 'admin-1', 'admin', 'admin', 1, 1), ('workspace-1', 'member-1', 'collaborator', 'collaborator', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspace_invitations (id, workspace_id, token_hash, kind, email, role, role_id, created_by_user_id, expires_at, created_at, updated_at) VALUES ('invite-1', 'workspace-1', 'hash', 'email', 'new@example.com', 'collaborator', 'collaborator', 'admin-1', 9999999999999, 1, 1)"
      )
    ]);
    const sql = await readFile(new URL('../migrations/0022_role_id_only.sql', import.meta.url), 'utf8');
    await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
    const member = await db
      .prepare("SELECT role_id FROM workspace_members WHERE user_id = 'member-1'")
      .first<{ role_id: string }>();
    const invite = await db
      .prepare("SELECT role_id FROM workspace_invitations WHERE id = 'invite-1'")
      .first<{ role_id: string }>();
    const role = await db
      .prepare("SELECT is_default FROM workspace_roles WHERE id = 'collaborator:workspace-1'")
      .first<{ is_default: number }>();
    const permissions = await db
      .prepare("SELECT permission FROM workspace_role_permissions WHERE role_id = 'collaborator:workspace-1'")
      .all<{ permission: string }>();
    assert.equal(member?.role_id, 'collaborator:workspace-1');
    assert.equal(invite?.role_id, 'collaborator:workspace-1');
    assert.equal(role?.is_default, 1);
    assert.ok(permissions.results.length > 0);
    for (const table of ['workspace_members', 'workspace_invitations']) {
      const columns = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
      assert.equal(
        columns.results.some((column) => column.name === 'role'),
        false
      );
    }
    const foreignKeys = await db.prepare('PRAGMA foreign_key_check').all();
    assert.deepEqual(foreignKeys.results, []);
  } finally {
    await simulator.dispose();
  }
});
