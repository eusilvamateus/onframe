const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createDemoBridge } = require('../demo/mock-runtime');

const root = path.resolve(__dirname, '..');

test('demonstração usa identidade e catálogo fictícios', () => {
  const bridge = createDemoBridge();
  const status = bridge.request({ action: 'status' });
  const catalog = bridge.request({ action: 'products', query: {} });
  assert.equal(status.connected, true);
  assert.equal(status.user.email, 'marina@exemplo.invalid');
  assert.equal(status.workspace.id, 'workspace-demo');
  assert.equal(catalog.pagination.total, 10);
  assert.equal(catalog.products[0].sku, 'ATL-LUM-01');
  assert.equal(catalog.products[0].cost, 39.52);
});

test('busca e edição de demonstração ficam em memória', () => {
  const bridge = createDemoBridge();
  const query = { q: 'atlas', status: 'active' };
  assert.equal(bridge.request({ action: 'products', query }).pagination.total, 2);
  const updated = bridge.request({
    action: 'product-update',
    productId: 'product-demo-1',
    payload: { name: 'Luminária revisada', cost: 42 }
  });
  assert.equal(updated.cost, 42);
  assert.equal(bridge.request({ action: 'products', query: { q: 'revisada' } }).pagination.total, 1);
  assert.equal(createDemoBridge().request({ action: 'products', query: { q: 'revisada' } }).pagination.total, 0);
  assert.throws(() => bridge.request({ action: 'oauth-start' }), /não está disponível na demonstração/);
});

test('a demo reaproveita as views e não entra no pacote da extensão', () => {
  const options = fs.readFileSync(path.join(root, 'demo', 'options.html'), 'utf8');
  const marketplace = fs.readFileSync(path.join(root, 'demo', 'marketplace.jsx'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'demo', 'server.js'), 'utf8');
  assert.match(options, /src="app\.js"/);
  assert.match(options, /src="\/demo\/mock-runtime\.js"/);
  assert.match(marketplace, /extension\/ui\/content\/photos-view\.jsx/);
  assert.match(marketplace, /extension\/ui\/content\/commerce-promotion-manager-view\.jsx/);
  assert.match(server, /connect-src 'none'/);
  assert.equal(fs.existsSync(path.join(root, 'extension', 'demo')), false);
  for (const file of ['luminaria-frente.png', 'luminaria-lateral.png']) {
    const image = fs.readFileSync(path.join(root, 'demo', 'assets', file));
    assert.equal(image.subarray(1, 4).toString(), 'PNG');
    assert.equal(image.readUInt32BE(16), 1254);
    assert.equal(image.readUInt32BE(20), 1254);
  }
});
