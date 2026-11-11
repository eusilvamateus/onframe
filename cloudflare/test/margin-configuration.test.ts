import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import {
  getMarginConfiguration,
  MarginConfigurationError,
  updateMarginConfiguration
} from '../src/margin-configuration.ts';

const admin = { userId: 'user-1', workspaceId: 'workspace-1', workspaceRole: 'admin' } as const;
const collaborator = { userId: 'user-2', workspaceId: 'workspace-1', workspaceRole: 'collaborator' } as const;

async function testDatabase() {
  const simulator = new Miniflare({
    workers: [
      {
        config: {
          name: 'margin-configuration-tests',
          compatibilityDate: '2026-09-24',
          manifest: {
            mainModule: 'index.js',
            modules: {
              'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" }
            }
          },
          env: { ONFRAME_DB: { type: 'd1', id: 'margin-configuration-test-db' } }
        }
      }
    ]
  });
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
      "INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('user-1', 'subject-1', 'admin@example.com', 'Admin', 1, 1, 1)"
    ),
    db.prepare(
      "INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('user-2', 'subject-2', 'collaborator@example.com', 'Colaborador', 1, 1, 1)"
    ),
    db.prepare(
      "INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Principal', 'user-1', 1, 1)"
    ),
    db.prepare(
      "INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at) VALUES ('workspace-1', 'user-1', 'admin', 1, 1)"
    ),
    db.prepare(
      "INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at) VALUES ('workspace-1', 'user-2', 'collaborator', 1, 1)"
    )
  ]);
  return { simulator, env: { ONFRAME_DB: db } };
}

function marginRequest(minimumContributionMargin: unknown) {
  return new Request('https://onframe.onblide.com/v1/app/margin-configuration', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ minimumContributionMargin })
  });
}

test('MC mínima do workspace pode ser configurada, lida e removida', async () => {
  const { simulator, env } = await testDatabase();
  try {
    assert.deepEqual(await getMarginConfiguration(env, admin), { workspaceMinimumContributionMargin: null });
    assert.deepEqual(await updateMarginConfiguration(marginRequest(12.35), env, admin, 'request-set-margin'), {
      workspaceMinimumContributionMargin: 12.35
    });
    assert.deepEqual(await getMarginConfiguration(env, admin), { workspaceMinimumContributionMargin: 12.35 });
    assert.deepEqual(await updateMarginConfiguration(marginRequest(null), env, admin, 'request-clear-margin'), {
      workspaceMinimumContributionMargin: null
    });
    const events = await env.ONFRAME_DB.prepare(
      "SELECT COUNT(*) AS total FROM audit_events WHERE operation = 'margin_configuration_updated'"
    ).first<{ total: number }>();
    assert.equal(events?.total, 2);
  } finally {
    await simulator.dispose();
  }
});

test('apenas administradores alteram a MC mínima e limites inválidos são rejeitados', async () => {
  const { simulator, env } = await testDatabase();
  try {
    await assert.rejects(getMarginConfiguration(env, collaborator), {
      code: 'margin_configuration_forbidden'
    } satisfies Partial<MarginConfigurationError>);
    await assert.rejects(updateMarginConfiguration(marginRequest(101), env, admin, 'request-invalid-margin'), {
      code: 'margin_configuration_invalid_payload'
    } satisfies Partial<MarginConfigurationError>);
    await assert.rejects(
      updateMarginConfiguration(
        new Request('https://onframe.onblide.com/v1/app/margin-configuration', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: '{}'
        }),
        env,
        admin,
        'request-missing-margin'
      ),
      { code: 'margin_configuration_invalid_payload' } satisfies Partial<MarginConfigurationError>
    );
  } finally {
    await simulator.dispose();
  }
});
