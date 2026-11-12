import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { getTaxConfiguration, resolveProductTaxRate, updateTaxConfiguration } from '../src/tax-configuration.ts';

async function testDatabase(lastMigration: string | null = null) {
  const simulator = new Miniflare({
    workers: [
      {
        config: {
          name: 'tax-configuration-tests',
          compatibilityDate: '2026-09-24',
          manifest: {
            mainModule: 'index.js',
            modules: {
              'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" }
            }
          },
          env: { ONFRAME_DB: { type: 'd1', id: 'tax-configuration-test-db' } }
        }
      }
    ]
  });
  const db = await simulator.getD1Database('ONFRAME_DB');
  const files = (await readdir(new URL('../migrations/', import.meta.url)))
    .filter((file) => file.endsWith('.sql') && (!lastMigration || file <= lastMigration))
    .sort();
  for (const file of files) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
  }
  return { simulator, db };
}

test('migracao preserva a aliquota existente como excecao do produto', async () => {
  const { simulator, db } = await testDatabase('0016_product_custom_costs.sql');
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('user-1', 'subject-1', 'admin@example.com', 'Admin', 1, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Principal', 'user-1', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO products (id, workspace_id, sku, normalized_sku, name, current_cost_cents, tax_rate_bps, custom_costs_json, status, created_at, updated_at) VALUES ('product-1', 'workspace-1', 'SKU-1', 'SKU-1', 'Produto', 1000, 725, '[]', 'active', 1, 1)"
      )
    ]);
    const sql = await readFile(new URL('../migrations/0017_tax_rate_hierarchy.sql', import.meta.url), 'utf8');
    await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
    const product = await db
      .prepare("SELECT tax_rate_bps FROM products WHERE id = 'product-1'")
      .first<{ tax_rate_bps: number | null }>();
    assert.equal(product?.tax_rate_bps, 725);
  } finally {
    await simulator.dispose();
  }
});

test('resolve imposto pela configuracao mais especifica e preserva aliquota zero', async () => {
  const { simulator, db } = await testDatabase();
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('user-1', 'subject-1', 'admin@example.com', 'Admin', 1, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Principal', 'user-1', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO seller_accounts (id, workspace_id, meli_user_id, enabled, created_at, updated_at) VALUES ('account-1', 'workspace-1', '1001', 1, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO products (id, workspace_id, sku, normalized_sku, name, current_cost_decimal, tax_rate_bps, custom_costs_json, status, created_at, updated_at) VALUES ('product-1', 'workspace-1', 'SKU-1', 'SKU-1', 'Produto', '10', NULL, '[]', 'active', 1, 1)"
      )
    ]);
    const input = { workspaceId: 'workspace-1', sellerAccountId: 'account-1', productId: 'product-1' };

    assert.deepEqual(await resolveProductTaxRate({ ONFRAME_DB: db }, input), {
      configured: false,
      rate: null,
      rateBps: null,
      base: 'sale_price',
      source: null,
      sourceId: null
    });

    await db
      .prepare(
        "INSERT INTO workspace_tax_rates (workspace_id, tax_rate_bps, created_at, updated_at) VALUES ('workspace-1', 500, 1, 1)"
      )
      .run();
    assert.equal((await resolveProductTaxRate({ ONFRAME_DB: db }, input))?.source, 'workspace');

    await db
      .prepare(
        "INSERT INTO seller_account_tax_rates (workspace_id, seller_account_id, tax_rate_bps, created_at, updated_at) VALUES ('workspace-1', 'account-1', 700, 1, 1)"
      )
      .run();
    assert.equal((await resolveProductTaxRate({ ONFRAME_DB: db }, input))?.rate, 7);
    assert.equal((await resolveProductTaxRate({ ONFRAME_DB: db }, input))?.source, 'account');

    await db.prepare("UPDATE products SET tax_rate_bps = 800 WHERE id = 'product-1'").run();
    assert.equal((await resolveProductTaxRate({ ONFRAME_DB: db }, input))?.source, 'product');

    await db
      .prepare(
        "INSERT INTO product_account_tax_rates (workspace_id, product_id, seller_account_id, tax_rate_bps, created_at, updated_at) VALUES ('workspace-1', 'product-1', 'account-1', 0, 1, 1)"
      )
      .run();
    assert.deepEqual(await resolveProductTaxRate({ ONFRAME_DB: db }, input), {
      configured: true,
      rate: 0,
      rateBps: 0,
      base: 'sale_price',
      source: 'product_account',
      sourceId: 'product-1:account-1'
    });
  } finally {
    await simulator.dispose();
  }
});

test('nao resolve produto e conta que pertencem a workspaces diferentes', async () => {
  const { simulator, db } = await testDatabase();
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('user-1', 'subject-1', 'admin@example.com', 'Admin', 1, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Principal', 'user-1', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-2', 'Secundario', 'user-1', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO seller_accounts (id, workspace_id, meli_user_id, enabled, created_at, updated_at) VALUES ('account-2', 'workspace-2', '2002', 1, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO products (id, workspace_id, sku, normalized_sku, name, current_cost_decimal, tax_rate_bps, custom_costs_json, status, created_at, updated_at) VALUES ('product-1', 'workspace-1', 'SKU-1', 'SKU-1', 'Produto', '10', 800, '[]', 'active', 1, 1)"
      )
    ]);
    assert.equal(
      await resolveProductTaxRate(
        { ONFRAME_DB: db },
        {
          workspaceId: 'workspace-1',
          sellerAccountId: 'account-2',
          productId: 'product-1'
        }
      ),
      null
    );
    await assert.rejects(
      db
        .prepare(
          "INSERT INTO product_account_tax_rates (workspace_id, product_id, seller_account_id, tax_rate_bps, created_at, updated_at) VALUES ('workspace-1', 'product-1', 'account-2', 500, 1, 1)"
        )
        .run(),
      /FOREIGN KEY constraint failed/u
    );
  } finally {
    await simulator.dispose();
  }
});

test('administrador mantem padroes do workspace e das contas', async () => {
  const { simulator, db } = await testDatabase();
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('user-1', 'subject-1', 'admin@example.com', 'Admin', 1, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('user-2', 'subject-2', 'colaborador@example.com', 'Colaborador', 1, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Principal', 'user-1', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspace_members (workspace_id, user_id, role_id, created_at, updated_at) VALUES ('workspace-1', 'user-1', 'admin', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspace_roles (id, workspace_id, name, system_key, created_at, updated_at, is_default) VALUES ('collaborator:workspace-1', 'workspace-1', 'Colaborador', NULL, 1, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspace_members (workspace_id, user_id, role_id, created_at, updated_at) VALUES ('workspace-1', 'user-2', 'collaborator:workspace-1', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO seller_accounts (id, workspace_id, meli_user_id, nickname, enabled, created_at, updated_at) VALUES ('account-1', 'workspace-1', '1001', 'LOJA', 1, 1, 1)"
      )
    ]);
    const env = { ONFRAME_DB: db };
    const admin = { userId: 'user-1', workspaceId: 'workspace-1', roleId: 'admin' } as const;
    const collaborator = { userId: 'user-2', workspaceId: 'workspace-1', roleId: 'collaborator:workspace-1' } as const;
    const request = new Request('https://onframe.onblide.com/v1/app/tax-configuration', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceTaxRate: 6.5,
        accounts: [{ sellerAccountId: 'account-1', taxRate: 8.25 }]
      })
    });
    await assert.rejects(getTaxConfiguration(env, collaborator), { code: 'tax_configuration_forbidden' });
    const configuration = await updateTaxConfiguration(request, env, admin, 'request-tax');
    assert.equal(configuration.workspaceTaxRate, 6.5);
    assert.equal(configuration.accounts[0].taxRate, 8.25);
    assert.equal(configuration.base, 'sale_price');
    assert.equal(
      (
        await db
          .prepare("SELECT operation FROM audit_events WHERE request_id = 'request-tax'")
          .first<{ operation: string }>()
      )?.operation,
      'tax_configuration_updated'
    );
  } finally {
    await simulator.dispose();
  }
});
