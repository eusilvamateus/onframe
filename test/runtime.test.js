const { test } = require('node:test');
const assert = require('assert');
const ContextStore = require('../extension/core/context-store');
const PageRuntime = require('../extension/core/page-runtime');

test('context store publica snapshots imutaveis e permite cancelar assinatura', () => {
  const store = ContextStore.createStore();
  const phases = [];
  const unsubscribe = store.subscribe((state) => phases.push(state.phase));
  const next = store.publish({ phase: 'ready', revision: 1 });
  unsubscribe();
  store.publish({ phase: 'error', revision: 2 });

  assert.deepStrictEqual(phases, ['idle', 'ready']);
  assert.strictEqual(Object.isFrozen(next), true);
  assert.strictEqual(store.getState().phase, 'error');
});

test('context repository deduplica chamadas e aplica ttl de sessenta segundos', async () => {
  let now = 1000;
  let calls = 0;
  let release;
  const api = () => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  };
  const repository = ContextStore.createRepository({ api, now: () => now, ttlMs: 60_000 });
  const first = repository.resolveQuick('item', { pageIdentity: {} });
  const second = repository.resolveQuick('item', { pageIdentity: {} });
  assert.strictEqual(first, second);
  assert.strictEqual(calls, 1);
  release({ item: { id: 'MLB1' } });
  await first;

  const entry = repository.setFull('item', { item: { id: 'MLB1' } });
  assert.strictEqual(repository.isFresh(entry), true);
  now += 60_001;
  assert.strictEqual(repository.isFresh(entry), false);
});

test('page runtime resolve uma vez, reutiliza contexto fresco e revalida contexto vencido', async () => {
  let now = 10_000;
  const calls = [];
  const api = async (path) => {
    calls.push(path);
    return {
      quick: path.endsWith('/quick'),
      item: { id: 'MLB1234567890' },
      ownerAccount: { user_id: 10 },
      variations: []
    };
  };
  const store = ContextStore.createStore();
  const repository = ContextStore.createRepository({ api, now: () => now, ttlMs: 60_000 });
  const page = {
    surface: 'pdp',
    url: 'https://produto.mercadolivre.com.br/MLB-1234567890',
    routeKey: 'pdp',
    itemKey: 'MLB1234567890',
    selectionKey: '{}',
    targetKey: 'MLB1234567890::{}',
    signature: 'pdp:MLB1234567890',
    pageIdentity: { urlItemId: 'MLB1234567890' },
    itemCandidates: ['MLB1234567890'],
    userProductCandidates: []
  };
  const runtime = createRuntime({ store, repository, page });

  await runtime.sync('start');
  assert.deepStrictEqual(calls, ['/api/resolve/quick', '/api/resolve']);
  assert.strictEqual(store.getState().phase, 'ready');

  await runtime.sync('mutation');
  assert.strictEqual(calls.length, 2);

  now += 60_001;
  await runtime.sync('visible');
  assert.deepStrictEqual(calls, ['/api/resolve/quick', '/api/resolve', '/api/resolve']);
  assert.strictEqual(store.getState().stale, false);
});

test('page runtime ignora resposta antiga depois de trocar o alvo', async () => {
  const store = ContextStore.createStore();
  const pending = new Map();
  const api = (path, options) => {
    const body = JSON.parse(options.body);
    const itemId = body.pageIdentity.urlItemId;
    return new Promise((resolve) => pending.set(`${path}:${itemId}`, resolve));
  };
  const repository = ContextStore.createRepository({ api });
  let page = pageFor('MLB1111111111');
  const runtime = createRuntime({ store, repository, getPage: () => page });

  const first = runtime.sync('start');
  pending.get('/api/resolve/quick:MLB1111111111')({ item: { id: 'MLB1111111111' }, variations: [] });
  await new Promise((resolve) => setImmediate(resolve));
  page = pageFor('MLB2222222222');
  const second = runtime.sync('navigation');
  pending.get('/api/resolve/quick:MLB2222222222')({ item: { id: 'MLB2222222222' }, variations: [] });
  await new Promise((resolve) => setImmediate(resolve));
  pending.get('/api/resolve:MLB2222222222')({ item: { id: 'MLB2222222222' }, variations: [] });
  await second;
  pending.get('/api/resolve:MLB1111111111')({ item: { id: 'MLB1111111111' }, variations: [] });
  await first;

  assert.strictEqual(store.getState().context.item.id, 'MLB2222222222');
  assert.strictEqual(store.getState().targetKey, 'MLB2222222222::{}');
});

function createRuntime(options) {
  const windowRef = {
    location: { href: 'https://produto.mercadolivre.com.br/MLB-1234567890' },
    addEventListener() {},
    removeEventListener() {}
  };
  const documentRef = {
    body: null,
    visibilityState: 'visible',
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; }
  };
  const Detection = {
    createPageSnapshot: () => options.getPage ? options.getPage() : options.page,
    inferSelectedVariationId: () => null
  };
  return PageRuntime.createRuntime({
    Detection,
    store: options.store,
    repository: options.repository,
    hosts: { ensureRoot() {}, stop() {} },
    modules: [],
    toUserError: (err) => err.message,
    window: windowRef,
    document: documentRef
  });
}

function pageFor(itemId) {
  return {
    surface: 'pdp',
    url: `https://produto.mercadolivre.com.br/${itemId}`,
    routeKey: itemId,
    itemKey: itemId,
    selectionKey: '{}',
    targetKey: `${itemId}::{}`,
    signature: itemId,
    pageIdentity: { urlItemId: itemId },
    itemCandidates: [itemId],
    userProductCandidates: []
  };
}
