import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { getProductSettings, updateProductSettings } from '../src/product-settings.ts';

async function testDatabase() {
  const simulator = new Miniflare({
    workers: [
      {
        config: {
          name: 'product-settings-tests',
          compatibilityDate: '2026-09-24',
          manifest: {
            mainModule: 'index.js',
            modules: {
              'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" }
            }
          },
          env: { ONFRAME_DB: { type: 'd1', id: 'product-settings-test-db' } }
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
  return { simulator, db };
}

test('configura a precisão visual dos custos no escopo de produtos', async () => {
  const { simulator, db } = await testDatabase();
  try {
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
    const env = { ONFRAME_DB: db };
    const admin = { userId: 'user-1', workspaceId: 'workspace-1', workspaceRole: 'admin' } as const;
    const collaborator = { userId: 'user-2', workspaceId: 'workspace-1', workspaceRole: 'collaborator' } as const;

    assert.equal((await getProductSettings(env, admin)).costDecimalPlaces, 2);
    await assert.rejects(getProductSettings(env, collaborator), { code: 'product_settings_forbidden' });

    const configuration = await updateProductSettings(
      new Request('https://onframe.onblide.com/v1/app/products/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ costDecimalPlaces: 5 })
      }),
      env,
      admin,
      'request-products'
    );
    assert.equal(configuration.costDecimalPlaces, 5);
    assert.equal(
      (
        await db
          .prepare("SELECT operation FROM audit_events WHERE request_id = 'request-products'")
          .first<{ operation: string }>()
      )?.operation,
      'product_settings_updated'
    );

    await assert.rejects(
      updateProductSettings(
        new Request('https://onframe.onblide.com/v1/app/products/settings', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ costDecimalPlaces: 9 })
        }),
        env,
        admin,
        'request-invalid-precision'
      ),
      { code: 'product_settings_invalid_payload' }
    );
  } finally {
    await simulator.dispose();
  }
});
