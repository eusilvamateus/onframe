import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import {
  buildConfirmedEditDrafts,
  itemThumbnail,
  listItemEditHistory,
  recordConfirmedItemEdits
} from '../src/item-edit-history.ts';

const itemBefore = {
  id: 'MLB1234567890',
  title: 'Produto de teste',
  price: 100,
  currency_id: 'BRL',
  permalink: 'https://produto.mercadolivre.com.br/MLB-1234567890',
  pictures: [{ secure_url: 'https://http2.mlstatic.com/test.jpg' }],
  attributes: [{ id: 'COLOR', name: 'Cor', value_name: 'Azul' }]
};

function drafts(operation: string, payload: Record<string, unknown>, result: unknown, options: {
  snapshots?: () => { first: Record<string, unknown> | null; latest: Record<string, unknown> | null };
  promotionSnapshots?: () => { first: unknown; latest: unknown };
} = {}) {
  return buildConfirmedEditDrafts({
    itemId: itemBefore.id,
    operation,
    payload,
    result,
    snapshots: options.snapshots || (() => ({ first: itemBefore, latest: itemBefore })),
    promotionSnapshots: options.promotionSnapshots
  });
}

test('historico estrutura apenas dados relevantes por tipo de edicao', () => {
  const price = drafts('pricing.standard.update', { amount: 120 }, {
    ok: true,
    standardPrice: { amount: 120, currency_id: 'BRL' }
  });
  assert.deepEqual(price[0].details, {
    before: { amount: 100, currency: 'BRL' },
    after: { amount: 120, currency: 'BRL' }
  });
  assert.equal(price[0].detailsVersion, 1);
  assert.equal(price[0].operation, 'pricing.standard.update');

  const priceWithoutPreviousValue = drafts('pricing.standard.update', { amount: 120 }, {
    ok: true,
    standardPrice: { amount: 120, currency_id: 'BRL' }
  }, {
    snapshots: () => ({ first: { ...itemBefore, price: null }, latest: itemBefore })
  });
  assert.equal(priceWithoutPreviousValue[0].details.before, null);

  const descriptionText = 'conteudo que nao deve ser persistido';
  const description = drafts('description.update', { plainText: descriptionText }, {
    ok: true,
    created: false,
    history: {
      before: { exists: true, length: 20 },
      after: { exists: true, length: descriptionText.length }
    }
  });
  assert.deepEqual(description[0].details, {
    before: { exists: true, length: 20 },
    after: { exists: true, length: descriptionText.length }
  });
  assert.equal(JSON.stringify(description).includes(descriptionText), false);

  const characteristics = drafts('characteristics.update', {
    attributes: [{ id: 'COLOR', valueName: 'Verde' }]
  }, {
    ok: true,
    characteristics: {
      item: { id: itemBefore.id, title: itemBefore.title, thumbnailUrl: 'https://http2.mlstatic.com/summary.jpg' },
      fields: [{ id: 'COLOR', label: 'Cor', displayValue: 'Verde' }]
    }
  });
  assert.deepEqual(characteristics[0].details, {
    changes: [{ id: 'COLOR', label: 'Cor', before: 'Azul', after: 'Verde' }]
  });
  assert.equal(characteristics[0].itemSnapshot?.thumbnailUrl, 'https://http2.mlstatic.com/summary.jpg');
});

test('historico de fotos registra inclusoes remocoes e reordenacao sem perder as contagens', () => {
  const before = {
    ...itemBefore,
    pictures: [
      { id: 'A', secure_url: 'https://http2.mlstatic.com/a.jpg' },
      { id: 'B', secure_url: 'https://http2.mlstatic.com/b.jpg' }
    ]
  };
  const after = {
    ...itemBefore,
    pictures: [
      { id: 'B', secure_url: 'https://http2.mlstatic.com/b.jpg' },
      { id: 'C', secure_url: 'https://http2.mlstatic.com/c.jpg' }
    ]
  };
  const pictures = drafts('pictures.update', { pictures: after.pictures }, { ok: true, item: after }, {
    snapshots: () => ({ first: before, latest: after })
  });

  assert.deepEqual(pictures[0].details, {
    beforeCount: 2,
    afterCount: 2,
    added: [{ id: 'C', thumbnailUrl: 'https://http2.mlstatic.com/c.jpg' }],
    removed: [{ id: 'A', thumbnailUrl: 'https://http2.mlstatic.com/a.jpg' }],
    reordered: false
  });
});

test('historico de promocao compara o estado confirmado antes e depois da operacao', () => {
  const promotion = drafts('promotion.offer.create', {
    promotionType: 'SELLER_CAMPAIGN',
    promotionId: 'C-MLB123',
    dealPrice: 80
  }, { ok: true, price: 80, original_price: 100 }, {
    promotionSnapshots: () => ({
      first: [{ id: 'C-MLB123', type: 'SELLER_CAMPAIGN', name: 'Campanha de outubro', status: 'candidate', price: 100, original_price: 100 }],
      latest: [{ id: 'C-MLB123', type: 'SELLER_CAMPAIGN', name: 'Campanha de outubro', status: 'started', price: 80, original_price: 100 }]
    })
  });

  assert.deepEqual(promotion[0].details, {
    promotion: {
      type: 'SELLER_CAMPAIGN',
      id: 'C-MLB123',
      offerId: null,
      name: 'Campanha de outubro'
    },
    before: {
      status: 'inactive',
      price: { amount: 100, currency: 'BRL' },
      discountPercentage: null,
      stock: null,
      startDate: null,
      endDate: null
    },
    after: {
      status: 'active',
      price: { amount: 80, currency: 'BRL' },
      discountPercentage: 20,
      stock: null,
      startDate: null,
      endDate: null
    },
    changedFields: ['status', 'price', 'discountPercentage'],
    origin: { mode: 'single', scope: 'item' }
  });
});

test('historico em lote ignora alvos que nao foram aplicados', () => {
  const result = drafts('bulk.commit', { payload: { amount: 130 } }, {
    ok: true,
    phase: 'commit',
    action: 'pricing.standard.update',
    targets: [
      { itemId: 'MLB1234567890', status: 'applied', result: { ok: true, standardPrice: { amount: 130, currency_id: 'BRL' } } },
      { itemId: 'MLB1234567891', status: 'failed' },
      { itemId: 'MLB1234567892', status: 'skipped' }
    ]
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].itemId, 'MLB1234567890');
  assert.equal(result[0].changeType, 'price');
});

test('historico de promocao em lote registra a origem da familia', () => {
  const result = drafts('bulk.commit', {
    payload: {
      promotionType: 'SELLER_CAMPAIGN',
      promotionId: 'C-MLB123',
      dealPrice: 80
    }
  }, {
    ok: true,
    phase: 'commit',
    scope: 'user_product_family',
    action: 'promotion.offer.create',
    targets: [
      { itemId: itemBefore.id, status: 'applied', result: { ok: true, price: 80, original_price: 100 } }
    ]
  }, {
    promotionSnapshots: () => ({
      first: [{ id: 'C-MLB123', type: 'SELLER_CAMPAIGN', status: 'candidate', price: 100, original_price: 100 }],
      latest: [{ id: 'C-MLB123', type: 'SELLER_CAMPAIGN', status: 'started', price: 80, original_price: 100 }]
    })
  });

  assert.deepEqual(result[0].details.origin, { mode: 'bulk', scope: 'user_product_family' });
  assert.equal(result[0].operation, 'promotion.offer.create');
});

test('resposta rejeitada nao produz evento de historico', () => {
  assert.deepEqual(drafts('pricing.standard.update', { amount: 120 }, { ok: false }), []);
});

test('historico reconhece a miniatura principal em todas as formas do item', () => {
  assert.equal(itemThumbnail({ secure_thumbnail: 'https://http2.mlstatic.com/secure.jpg' }), 'https://http2.mlstatic.com/secure.jpg');
  assert.equal(itemThumbnail({ thumbnail: 'https://http2.mlstatic.com/thumbnail.jpg' }), 'https://http2.mlstatic.com/thumbnail.jpg');
  assert.equal(itemThumbnail({ thumbnailUrl: 'https://http2.mlstatic.com/summary.jpg' }), 'https://http2.mlstatic.com/summary.jpg');
});

test('consulta pagina eventos e respeita as contas atribuidas ao colaborador', async () => {
  const simulator = new Miniflare({ workers: [{ config: {
    name: 'item-edit-history-tests', compatibilityDate: '2026-09-24',
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" } } },
    env: { ONFRAME_DB: { type: 'd1', id: 'item-edit-history-test-db' } }
  } }] });

  try {
    const db = await simulator.getD1Database('ONFRAME_DB');
    const files = (await readdir(new URL('../migrations/', import.meta.url))).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
    }
    await db.batch([
      db.prepare("INSERT INTO users (id, identity_subject, email, display_name, avatar_url, created_at, updated_at, identity_version) VALUES ('admin-1', 'subject-admin', 'admin@example.com', 'Admin', 'https://example.com/admin.jpg', 1, 1, 1), ('collab-1', 'subject-collab', 'collab@example.com', 'Colaborador', NULL, 1, 1, 1)"),
      db.prepare("INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Principal', 'admin-1', 1, 1)"),
      db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at) VALUES ('workspace-1', 'admin-1', 'admin', 1, 1), ('workspace-1', 'collab-1', 'collaborator', 1, 1)"),
      db.prepare("INSERT INTO seller_accounts (id, workspace_id, meli_user_id, nickname, enabled, created_at, updated_at) VALUES ('account-1', 'workspace-1', '123', 'Conta 1', 1, 1, 1), ('account-2', 'workspace-1', '456', 'Conta 2', 1, 1, 1)"),
      db.prepare("INSERT INTO account_members (seller_account_id, user_id, created_at, updated_at) VALUES ('account-1', 'collab-1', 1, 1)")
    ]);

    const base = {
      actor: { userId: 'admin-1', workspaceId: 'workspace-1', workspaceRole: 'admin' as const, displayName: 'Admin', email: 'admin@example.com' },
      env: { ONFRAME_DB: db },
      itemId: itemBefore.id,
      operation: 'pricing.standard.update',
      payload: { amount: 120 },
      requestId: 'request-1',
      result: { ok: true, standardPrice: { amount: 120, currency_id: 'BRL' } },
      snapshots: () => ({ first: itemBefore, latest: itemBefore })
    };
    await recordConfirmedItemEdits({ ...base, account: { id: 'account-1', meliUserId: '123', nickname: 'Conta 1' } });
    await recordConfirmedItemEdits({ ...base, account: { id: 'account-1', meliUserId: '123', nickname: 'Conta 1' } });
    const duplicateCount = await db.prepare("SELECT COUNT(*) AS count FROM item_edit_events WHERE request_id = 'request-1'").first<{ count: number }>();
    assert.equal(duplicateCount?.count, 1);
    await recordConfirmedItemEdits({ ...base, requestId: 'request-2', account: { id: 'account-2', meliUserId: '456', nickname: 'Conta 2' } });
    await db.prepare("UPDATE item_edit_events SET item_thumbnail_url = NULL, item_permalink = NULL WHERE request_id = 'request-2'").run();

    const enrichedPage = await listItemEditHistory({ ONFRAME_DB: db }, base.actor, new URL('https://example.com/v1/app/item-edit-history?limit=2')) as { events: Array<{ item: { thumbnailUrl: string | null; permalink: string | null } }> };
    assert.equal(enrichedPage.events.every((event) => event.item.thumbnailUrl === 'https://http2.mlstatic.com/test.jpg'), true);
    assert.equal(enrichedPage.events.every((event) => event.item.permalink === itemBefore.permalink), true);

    const adminPage = await listItemEditHistory({ ONFRAME_DB: db }, base.actor, new URL('https://example.com/v1/app/item-edit-history?limit=1')) as { events: Array<{ actor: { avatarUrl: string | null }; operation: string | null; detailsVersion: number }>; nextCursor: string; total: number; totalPages: number };
    assert.equal(adminPage.events.length, 1);
    assert.equal(adminPage.events[0].actor.avatarUrl, 'https://example.com/admin.jpg');
    assert.equal(adminPage.events[0].operation, 'pricing.standard.update');
    assert.equal(adminPage.events[0].detailsVersion, 1);
    assert.equal(adminPage.total, 2);
    assert.equal(adminPage.totalPages, 2);
    assert.ok(adminPage.nextCursor);
    const nextAdminPage = await listItemEditHistory({ ONFRAME_DB: db }, base.actor, new URL(`https://example.com/v1/app/item-edit-history?limit=1&cursor=${encodeURIComponent(adminPage.nextCursor)}`)) as { events: unknown[]; nextCursor: string | null };
    assert.equal(nextAdminPage.events.length, 1);
    assert.equal(nextAdminPage.nextCursor, null);

    const numberedPage = await listItemEditHistory({ ONFRAME_DB: db }, base.actor, new URL('https://example.com/v1/app/item-edit-history?limit=1&page=2')) as { events: unknown[]; page: number; total: number; totalPages: number };
    assert.equal(numberedPage.events.length, 1);
    assert.equal(numberedPage.page, 2);
    assert.equal(numberedPage.total, 2);
    assert.equal(numberedPage.totalPages, 2);

    await db.prepare("UPDATE item_edit_events SET created_at = CASE request_id WHEN 'request-1' THEN 1000 ELSE 2000 END").run();
    const periodPage = await listItemEditHistory({ ONFRAME_DB: db }, base.actor, new URL('https://example.com/v1/app/item-edit-history?from=1500&to=2500')) as { events: Array<{ account: { id: string } }>; total: number };
    assert.equal(periodPage.events.length, 1);
    assert.equal(periodPage.events[0].account.id, 'account-2');
    assert.equal(periodPage.total, 1);

    const collaboratorPage = await listItemEditHistory({ ONFRAME_DB: db }, {
      userId: 'collab-1', workspaceId: 'workspace-1', workspaceRole: 'collaborator'
    }, new URL('https://example.com/v1/app/item-edit-history')) as { events: Array<{ account: { id: string } }> };
    assert.equal(collaboratorPage.events.length, 1);
    assert.equal(collaboratorPage.events[0].account.id, 'account-1');

    await db.prepare(`
      INSERT INTO item_edit_events (
        id, workspace_id, seller_account_id, user_id, request_id,
        item_id, change_type, action, summary, details_json, created_at
      ) VALUES ('legacy-event', 'workspace-1', 'account-1', 'admin-1', 'legacy-request',
        'MLBLEGACY', 'price', 'updated', 'Preço alterado', '{"before":90,"after":100,"currency":"BRL"}', 3000)
    `).run();
    const legacyPage = await listItemEditHistory({ ONFRAME_DB: db }, base.actor, new URL('https://example.com/v1/app/item-edit-history?itemId=MLBLEGACY')) as { events: Array<{ operation: string | null; detailsVersion: number }> };
    assert.equal(legacyPage.events[0].operation, null);
    assert.equal(legacyPage.events[0].detailsVersion, 0);
  } finally {
    await simulator.dispose();
  }
});
