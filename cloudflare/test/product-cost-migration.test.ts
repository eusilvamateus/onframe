import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';

test('migracao preserva custos existentes ao ampliar a precisao', async () => {
  const simulator = new Miniflare({
    workers: [
      {
        config: {
          name: 'product-cost-migration-test',
          compatibilityDate: '2026-09-24',
          manifest: {
            mainModule: 'index.js',
            modules: {
              'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" }
            }
          },
          env: { ONFRAME_DB: { type: 'd1', id: 'product-cost-migration-test-db' } }
        }
      }
    ]
  });

  try {
    const db = await simulator.getD1Database('ONFRAME_DB');
    const files = (await readdir(new URL('../migrations/', import.meta.url)))
      .filter((file) => file.endsWith('.sql') && file < '0018_product_cost_precision.sql')
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
        "INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Principal', 'user-1', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO products (id, workspace_id, sku, normalized_sku, name, current_cost_cents, custom_costs_json, status, created_at, updated_at) VALUES ('product-1', 'workspace-1', 'SKU-1', 'SKU-1', 'Produto', 1667, '[]', 'active', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO product_cost_history (id, product_id, cost_cents, effective_at, created_at) VALUES ('history-1', 'product-1', 1667, 1, 1)"
      )
    ]);

    const migration = await readFile(new URL('../migrations/0018_product_cost_precision.sql', import.meta.url), 'utf8');
    await db.batch(unstable_splitSqlQuery(migration).map((statement) => db.prepare(statement)));

    const product = await db
      .prepare("SELECT current_cost_decimal FROM products WHERE id = 'product-1'")
      .first<{ current_cost_decimal: string }>();
    const history = await db
      .prepare("SELECT cost_decimal FROM product_cost_history WHERE id = 'history-1'")
      .first<{ cost_decimal: string }>();
    assert.equal(product?.current_cost_decimal, '16.67');
    assert.equal(history?.cost_decimal, '16.67');
  } finally {
    await simulator.dispose();
  }
});
