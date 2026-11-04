import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import {
  archiveProduct,
  commitProductImport,
  createProduct,
  listProducts,
  matchProductForPromotionItem,
  previewProductImport,
  updateProduct
} from '../src/products.ts';

const admin = { userId: 'user-1', workspaceId: 'workspace-1', workspaceRole: 'admin' } as const;
const collaborator = { userId: 'user-2', workspaceId: 'workspace-1', workspaceRole: 'collaborator' } as const;

function productRequest(payload: object, method = 'POST') {
  return new Request('https://onframe.onblide.com/v1/app/products', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

test('catalogo de produtos preserva os invariantes financeiros e de acesso', async () => {
  const simulator = new Miniflare({ workers: [{ config: {
    name: 'products-tests', compatibilityDate: '2026-09-24',
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" } } },
    env: { ONFRAME_DB: { type: 'd1', id: 'products-test-db' } }
  } }] });

  try {
    const db = await simulator.getD1Database('ONFRAME_DB');
    const files = (await readdir(new URL('../migrations/', import.meta.url))).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
    }
    await db.batch([
      db.prepare("INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('user-1', 'subject-1', 'admin@example.com', 'Admin', 1, 1, 1)"),
      db.prepare("INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('user-2', 'subject-2', 'colaborador@example.com', 'Colaborador', 1, 1, 1)"),
      db.prepare("INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Principal', 'user-1', 1, 1)"),
      db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at) VALUES ('workspace-1', 'user-1', 'admin', 1, 1)"),
      db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at) VALUES ('workspace-1', 'user-2', 'collaborator', 1, 1)"),
      db.prepare("INSERT INTO seller_accounts (id, workspace_id, meli_user_id, nickname, enabled, created_at, updated_at) VALUES ('account-1', 'workspace-1', '310458346', 'LOJA', 1, 1, 1)")
    ]);
    const env = { ONFRAME_DB: db };
    const payload = {
      sku: ' Mesa-180 ', name: 'Mesa dobrável 1,80 m',
      cost: 152.35, taxRate: 7.25,
      accountTaxRates: [{ sellerAccountId: 'account-1', taxRate: 9.5 }],
      customCosts: [{ description: 'Embalagem', type: 'fixed', value: 4.5 }], status: 'active'
    };

    await assert.rejects(createProduct(productRequest(payload), env, collaborator, 'request-forbidden'), { code: 'product_access_forbidden' });
    const created = await createProduct(productRequest(payload), env, admin, 'request-create');
    assert.equal(created.sku, 'Mesa-180');
    assert.equal(created.cost, 152.35);
    assert.equal(created.taxRate, 7.25);
    assert.deepEqual(created.accountTaxRates, [{ sellerAccountId: 'account-1', accountUserId: '310458346', taxRate: 9.5 }]);
    assert.deepEqual(created.customCosts, [{ description: 'Embalagem', type: 'fixed', value: 4.5 }]);
    assert.equal('variableCost' in created, false);
    assert.equal('description' in created, false);

    await assert.rejects(
      createProduct(productRequest({ ...payload, sku: 'LEGADO-01', variableCost: 10 }), env, admin, 'request-legacy'),
      { code: 'product_invalid_payload' }
    );

    await assert.rejects(createProduct(productRequest({ ...payload, sku: 'MESA-180' }), env, admin, 'request-duplicate'), { code: 'product_sku_conflict' });
    assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM product_cost_history WHERE product_id = ?').bind(created.id).first<{ total: number }>())?.total, 1);

    const updated = await updateProduct(productRequest({ ...payload, sku: 'MESA-180', cost: 160 }, 'PATCH'), env, admin, created.id, 'request-update');
    assert.equal(updated.cost, 160);
    assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM product_cost_history WHERE product_id = ?').bind(created.id).first<{ total: number }>())?.total, 2);
    await updateProduct(productRequest({ ...payload, sku: 'MESA-180', cost: 160, name: 'Mesa atualizada' }, 'PATCH'), env, admin, created.id, 'request-update-name');
    assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM product_cost_history WHERE product_id = ?').bind(created.id).first<{ total: number }>())?.total, 2);

    const adminList = await listProducts(env, admin, new URL('https://onframe.onblide.com/v1/app/products?q=mesa&status=active'));
    assert.equal(adminList.pagination.total, 1);
    assert.equal('links' in adminList.products[0], false);
    const collaboratorList = await listProducts(env, collaborator, new URL('https://onframe.onblide.com/v1/app/products'));
    assert.equal(collaboratorList.products.length, 1);

    const chair = await createProduct(productRequest({
      sku: 'CADEIRA-01', name: 'Cadeira dobrável', cost: 80,
      taxRate: 4, customCosts: [{ description: 'Separação', type: 'percentage', value: 2 }], status: 'inactive'
    }), env, admin, 'request-chair');
    await db.batch([
      db.prepare("UPDATE products SET name = 'A Mesa', created_at = 100, updated_at = 400 WHERE id = ?").bind(created.id),
      db.prepare("UPDATE products SET name = 'Z Cadeira', created_at = 200, updated_at = 300 WHERE id = ?").bind(chair.id)
    ]);
    const skuOrder = await listProducts(env, admin, new URL('https://onframe.onblide.com/v1/app/products?sort=sku'));
    assert.deepEqual(skuOrder.products.map((entry) => entry.id), [chair.id, created.id]);
    const nameOrder = await listProducts(env, admin, new URL('https://onframe.onblide.com/v1/app/products?sort=name'));
    assert.deepEqual(nameOrder.products.map((entry) => entry.id), [created.id, chair.id]);
    const recentOrder = await listProducts(env, admin, new URL('https://onframe.onblide.com/v1/app/products?sort=recent'));
    assert.deepEqual(recentOrder.products.map((entry) => entry.id), [chair.id, created.id]);
    const updatedOrder = await listProducts(env, admin, new URL('https://onframe.onblide.com/v1/app/products?sort=updated'));
    assert.deepEqual(updatedOrder.products.map((entry) => entry.id), [created.id, chair.id]);
    const fallbackOrder = await listProducts(env, admin, new URL('https://onframe.onblide.com/v1/app/products?sort=unknown'));
    assert.deepEqual(fallbackOrder.products.map((entry) => entry.id), [created.id, chair.id]);
    await db.batch([
      db.prepare("UPDATE products SET name = 'Mesa atualizada' WHERE id = ?").bind(created.id),
      db.prepare("UPDATE products SET name = 'Cadeira dobrável' WHERE id = ?").bind(chair.id)
    ]);
    const importRows = [
      { rowNumber: 2, ...payload, sku: 'MESA-180', cost: 170 },
      { rowNumber: 3, sku: 'BANCO-01', name: 'Banco portátil', cost: 55.9, taxRate: 3.5, accountTaxRates: [{ accountUserId: '310458346', taxRate: 6 }], customCosts: [{ description: 'Embalagem', type: 'fixed', value: 1 }], status: 'active' },
      { rowNumber: 4, sku: chair.sku, name: chair.name, cost: chair.cost, taxRate: chair.taxRate, customCosts: chair.customCosts, status: chair.status },
      { rowNumber: 5, sku: 'DUP-01', name: 'Duplicado A', cost: 10, taxRate: 1, customCosts: [], status: 'active' },
      { rowNumber: 6, sku: 'dup-01', name: 'Duplicado B', cost: 11, taxRate: 1, customCosts: [], status: 'active' },
      { rowNumber: 7, sku: 'SEM-CUSTO', name: 'Inválido', cost: '', taxRate: 1, customCosts: [], status: 'active' }
    ];
    const importRequest = () => productRequest({ rows: importRows });
    await assert.rejects(previewProductImport(importRequest(), env, collaborator), { code: 'product_access_forbidden' });
    const preview = await previewProductImport(importRequest(), env, admin);
    assert.deepEqual(preview.summary, { total: 6, create: 1, update: 1, unchanged: 1, error: 3 });
    assert.equal(preview.rows[0].action, 'update');
    assert.equal(preview.rows[1].action, 'create');
    assert.equal(preview.rows[2].action, 'unchanged');
    assert.equal(preview.rows[3].errors[0], 'SKU repetido na planilha.');
    assert.equal(preview.rows[5].errors[0], 'Custo obrigatório.');

    const imported = await commitProductImport(importRequest(), env, admin, 'request-import');
    assert.deepEqual(imported.summary, { total: 6, created: 1, updated: 1, unchanged: 1, rejected: 3 });
    const importedProducts = await listProducts(env, admin, new URL('https://onframe.onblide.com/v1/app/products?limit=100'));
    assert.equal(importedProducts.products.find((entry) => entry.sku === 'MESA-180')?.cost, 170);
    assert.equal(importedProducts.products.some((entry) => entry.sku === 'BANCO-01'), true);
    assert.deepEqual(importedProducts.products.find((entry) => entry.sku === 'BANCO-01')?.accountTaxRates, [{ sellerAccountId: 'account-1', accountUserId: '310458346', taxRate: 6 }]);
    assert.equal(importedProducts.products.some((entry) => entry.sku === 'DUP-01'), false);
    assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM product_cost_history WHERE product_id = ?').bind(created.id).first<{ total: number }>())?.total, 3);

    const itemMatch = await matchProductForPromotionItem(env, admin, {
      seller_custom_field: ' mesa-180 '
    });
    assert.equal(itemMatch.status, 'matched');
    assert.equal(itemMatch.source, 'item');
    assert.equal(itemMatch.product?.id, created.id);
    assert.equal(itemMatch.product?.cost, 170);

    const variationMatch = await matchProductForPromotionItem(env, admin, {
      variations: [{ id: 123, attributes: [{ id: 'SELLER_SKU', value_name: 'banco-01' }] }]
    }, '123');
    assert.equal(variationMatch.status, 'matched');
    assert.equal(variationMatch.source, 'variation');
    assert.equal(variationMatch.product?.sku, 'BANCO-01');

    const ambiguousMatch = await matchProductForPromotionItem(env, admin, {
      variations: [
        { id: 123, seller_custom_field: 'MESA-180' },
        { id: 456, seller_custom_field: 'BANCO-01' }
      ]
    });
    assert.equal(ambiguousMatch.status, 'unmatched');
    assert.equal(ambiguousMatch.reason, 'variation_required');

    const inactiveMatch = await matchProductForPromotionItem(env, admin, {
      seller_custom_field: 'CADEIRA-01'
    });
    assert.equal(inactiveMatch.status, 'unmatched');
    assert.equal(inactiveMatch.reason, 'product_not_found');

    await archiveProduct(env, admin, created.id, 'request-archive');
    const afterArchive = await listProducts(env, admin, new URL('https://onframe.onblide.com/v1/app/products?limit=100'));
    assert.equal(afterArchive.products.some((entry) => entry.id === created.id), false);
    const reused = await createProduct(productRequest({ ...payload, sku: 'mesa-180' }), env, admin, 'request-reuse');
    assert.equal(reused.sku, 'mesa-180');

    const inheritedTax = await createProduct(productRequest({
      sku: 'HERDA-IMPOSTO', name: 'Produto com imposto herdado', cost: 10, customCosts: [], status: 'active'
    }), env, admin, 'request-inherited-tax');
    assert.equal(inheritedTax.taxRate, null);
    const inheritedPreview = await previewProductImport(productRequest({ rows: [{
      rowNumber: 2, sku: 'HERDA-PLANILHA', name: 'Produto da planilha', cost: 20, taxRate: '', customCosts: [], status: 'active'
    }] }), env, admin);
    assert.equal(inheritedPreview.rows[0].action, 'create');
    assert.equal(inheritedPreview.rows[0].values?.taxRate, null);
  } finally {
    await simulator.dispose();
  }
});
