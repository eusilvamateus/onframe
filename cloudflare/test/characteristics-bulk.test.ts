import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
type ItemRecord = {
  id: string;
  title: string;
  seller_id: number;
  site_id: string;
  status: string;
  user_product_id: string;
  family_id: number;
  family_name: string;
  category_id: string;
  domain_id: string;
  attributes: Array<Record<string, unknown>>;
};
type SearchOptions = {
  status: string;
  limit: number;
  offset?: number;
  search_type?: string;
  scroll_id?: string | null;
};
type SearchResponse = {
  results: string[];
  paging?: { offset: number; limit: number; total: number };
  scroll_id?: string | null;
};
type BulkResult = {
  counts: { total: number; applied: number };
  targets: Array<{
    userProductId: string | null;
    itemId: string;
    itemIds: string[];
    propagation?: string;
  }>;
};
type MeliClient = {
  getMe: () => Promise<{ id: number }>;
  getItem: (id: string) => Promise<ItemRecord | null>;
  getUserProduct: (id: string) => Promise<{ family_id: number }>;
  getUserProductFamily: (siteId: string, familyId: number) => Promise<unknown>;
  searchItemsByUserProduct: (
    sellerId: number,
    userProductIds: string,
    options: SearchOptions
  ) => Promise<SearchResponse>;
  getCategoryAttributes: (categoryId: string) => Promise<Array<Record<string, unknown>>>;
  getDomainTechnicalSpecs: (domainId: string) => Promise<{ output: { groups: unknown[] } }>;
  updateItem: (itemId: string, payload: { attributes: Array<Record<string, unknown>> }) => Promise<unknown>;
};
const characteristics = require('../src/domain/characteristics.js') as {
  updateCharacteristicsFamily: (client: MeliClient, itemId: string, input: object) => Promise<BulkResult>;
};
const { resolveFamilyTargets } = require('../src/domain/bulk-actions.js') as {
  resolveFamilyTargets: (client: MeliClient, itemId: string) => Promise<{ items: unknown[] }>;
};

const sourceItemId = 'MLB1234567890';
const siblingItemId = 'MLB1234567891';
const otherVariationItemId = 'MLB1234567892';
const firstUserProductId = 'MLBU1234567890';
const secondUserProductId = 'MLBU1234567891';

function item(id: string, userProductId: string): ItemRecord {
  return {
    id,
    title: `Produto ${id}`,
    seller_id: 123,
    site_id: 'MLB',
    status: 'active',
    user_product_id: userProductId,
    family_id: 55,
    family_name: 'Produto de teste',
    category_id: 'MLB1234',
    domain_id: 'MLB-TEST',
    attributes: [{ id: 'BRAND', name: 'Marca', value_name: 'Antiga' }]
  };
}

function familyClient(
  items: Record<string, ItemRecord>,
  searchItemsByUserProduct: MeliClient['searchItemsByUserProduct']
) {
  const writes: Array<{ itemId: string; payload: { attributes: Array<Record<string, unknown>> } }> = [];
  const client: MeliClient = {
    getMe: async () => ({ id: 123 }),
    getItem: async (id: string) => structuredClone(items[id] || null),
    getUserProduct: async () => ({ family_id: 55 }),
    getUserProductFamily: async () => ({ user_products: [{ id: secondUserProductId }] }),
    searchItemsByUserProduct,
    getCategoryAttributes: async () => [{ id: 'BRAND', name: 'Marca', value_type: 'string' }],
    getDomainTechnicalSpecs: async () => ({ output: { groups: [] } }),
    updateItem: async (itemId, payload) => {
      writes.push({ itemId, payload });
      items[itemId].attributes = payload.attributes;
      return { id: itemId };
    }
  };
  return { client, writes };
}

function searchItems(ids: string[], offset: number, total: number) {
  return { results: ids, paging: { offset, limit: 100, total } };
}

test('características grava uma vez por user_product e mantém os anúncios relacionados no resultado', async () => {
  const items = {
    [sourceItemId]: item(sourceItemId, firstUserProductId),
    [siblingItemId]: item(siblingItemId, firstUserProductId),
    [otherVariationItemId]: item(otherVariationItemId, secondUserProductId)
  };
  const search: MeliClient['searchItemsByUserProduct'] = async (_sellerId, _userProductIds, options) =>
    options.status === 'active'
      ? searchItems([sourceItemId, siblingItemId, otherVariationItemId], 0, 3)
      : searchItems([], 0, 0);
  const { client, writes } = familyClient(items, search);

  const result = await characteristics.updateCharacteristicsFamily(client, sourceItemId, {
    scope: 'user_product_family',
    attributes: [{ id: 'BRAND', valueName: 'Nova' }]
  });

  assert.equal(writes.length, 2);
  assert.deepEqual(writes.map(({ itemId }) => itemId).sort(), [sourceItemId, otherVariationItemId].sort());
  assert.equal(result.counts.total, 2);
  assert.equal(result.counts.applied, 2);
  const firstGroup = result.targets.find((target) => target.userProductId === firstUserProductId);
  assert.deepEqual(firstGroup.itemIds, [sourceItemId, siblingItemId]);
  assert.equal(firstGroup.itemId, sourceItemId);
  assert.equal(firstGroup.propagation, 'asynchronous');
});

test('família pagina resultados acima de 100 itens', async () => {
  const items = { [sourceItemId]: item(sourceItemId, firstUserProductId) };
  const requests: Array<Record<string, unknown>> = [];
  const allIds = Array.from({ length: 102 }, (_, index) => `MLB${String(2000000000 + index).padStart(10, '0')}`);
  const search: MeliClient['searchItemsByUserProduct'] = async (_sellerId, _userProductIds, options) => {
    requests.push(options);
    if (options.status !== 'active') return searchItems([], Number(options.offset || 0), 0);
    const offset = Number(options.offset || 0);
    return searchItems(allIds.slice(offset, offset + 100), offset, allIds.length);
  };
  const { client } = familyClient(items, search);

  const result = await resolveFamilyTargets(client, sourceItemId);

  assert.equal(result.items.length, 102);
  assert.deepEqual(
    requests.filter((request) => request.status === 'active').map((request) => request.offset),
    [undefined, 100]
  );
});

test('família usa scan quando ultrapassa mil resultados', async () => {
  const items = { [sourceItemId]: item(sourceItemId, firstUserProductId) };
  const requests: Array<Record<string, unknown>> = [];
  const scanIds = Array.from({ length: 1001 }, (_, index) => `MLB${String(3000000000 + index).padStart(10, '0')}`);
  const search: MeliClient['searchItemsByUserProduct'] = async (_sellerId, _userProductIds, options) => {
    requests.push(options);
    if (options.status !== 'active') return searchItems([], Number(options.offset || 0), 0);
    if (options.search_type !== 'scan') return searchItems(scanIds.slice(0, 100), 0, scanIds.length);
    if (!options.scroll_id) return { results: scanIds.slice(0, 1000), scroll_id: 'scan-cursor' };
    return { results: scanIds.slice(1000), scroll_id: null };
  };
  const { client } = familyClient(items, search);

  const result = await resolveFamilyTargets(client, sourceItemId);

  assert.equal(result.items.length, 1001);
  assert.deepEqual(
    requests.filter((request) => request.search_type === 'scan').map((request) => request.scroll_id || null),
    [null, 'scan-cursor']
  );
});
