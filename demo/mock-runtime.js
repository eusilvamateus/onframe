(function (root) {
  const workspace = { id: 'workspace-demo', name: 'Estúdio Exemplo', roleId: 'admin', permissions: [] };
  const user = { id: 'user-demo', name: 'Marina Costa', email: 'marina@exemplo.invalid', avatarUrl: null };
  const accounts = [
    {
      id: 'account-demo',
      user_id: 100001,
      userId: 100001,
      nickname: 'ESTUDIOEXEMPLO',
      displayName: 'Estúdio Exemplo',
      enabled: true
    }
  ];
  const initialProducts = [
    ['Luminária de mesa articulada Atlas', 'ATL-LUM-01', 39.52, 'active', 23, 18],
    ['Luminária de mesa articulada Atlas · grafite', 'ATL-LUM-02', 39.52, 'active', 23, null],
    ['Organizador modular de escritório', 'ORG-MOD-01', 24.5, 'active', 23, null],
    ['Suporte ajustável para notebook', 'SUP-NOT-01', 48, 'active', 23, 16],
    ['Bandeja de metal para documentos', 'BAN-MET-01', 31.75, 'active', null, null],
    ['Porta-canetas de madeira clara', 'PCA-MAD-01', 12.4, 'inactive', 23, null],
    ['Base de mesa em cortiça', 'BAS-COR-01', 18.9, 'active', 23, null],
    ['Prateleira compacta de parede', 'PRA-COM-01', 56.3, 'active', 23, 20],
    ['Caderno de capa rígida A5', 'CAD-A5-01', 15.6, 'active', 23, null],
    ['Garrafa térmica de aço 500 ml', 'GAR-TER-01', 36.8, 'inactive', 23, null]
  ].map(([name, sku, cost, status, taxRate, minimumContributionMargin], index) => ({
    id: `product-demo-${index + 1}`,
    name,
    sku,
    cost,
    status,
    taxRate,
    minimumContributionMargin,
    accountTaxRates: [],
    customCosts: [],
    updatedAt: new Date(Date.UTC(2026, 10, 20 - index)).toISOString()
  }));

  function createDemoBridge() {
    let products = initialProducts.map((product) => ({ ...product }));
    let selected = [];
    let selectionId = 0;
    let nextProductId = products.length + 1;
    let latestJob = null;

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function productPage(query = {}) {
      let rows = products.filter((product) =>
        query.status === 'deleted' ? product.status === 'deleted' : product.status !== 'deleted'
      );
      if (query.status && !['all', 'deleted'].includes(query.status)) {
        rows = rows.filter((product) => product.status === query.status);
      }
      if (query.q) {
        const needle = String(query.q).toLocaleLowerCase('pt-BR');
        rows = rows.filter((product) => `${product.name} ${product.sku}`.toLocaleLowerCase('pt-BR').includes(needle));
      }
      if (query.selectionId) rows = rows.filter((product) => selected.includes(product.id));
      if (query.sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      else rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const limit = Math.max(1, Number(query.limit) || 25);
      const page = Math.max(1, Number(query.page) || 1);
      return {
        products: clone(rows.slice((page - 1) * limit, page * limit)),
        pagination: { page, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
        settings: { costDecimalPlaces: 2 }
      };
    }

    function request(message) {
      const { action, payload = {}, query = {} } = message;
      switch (action) {
        case 'status':
          return { connected: true, user: clone(user), workspace: clone(workspace) };
        case 'workspaces':
          return { workspaces: [clone(workspace)] };
        case 'profile':
          return { user: clone(user), workspace: clone(workspace) };
        case 'accounts':
          return { accounts: clone(accounts) };
        case 'members':
          return { members: [] };
        case 'invitations':
          return { invitations: [] };
        case 'roles':
          return { roles: [] };
        case 'products':
          return productPage(query);
        case 'products-bulk-latest':
          return latestJob || {};
        case 'product-create': {
          const product = { ...payload, id: `product-demo-${nextProductId++}`, updatedAt: new Date().toISOString() };
          products.unshift(product);
          return clone(product);
        }
        case 'product-update': {
          const index = products.findIndex((product) => product.id === message.productId);
          if (index < 0) throw new Error('Produto não encontrado na demonstração.');
          products[index] = { ...products[index], ...payload, updatedAt: new Date().toISOString() };
          return clone(products[index]);
        }
        case 'product-archive':
        case 'product-restore':
        case 'product-delete-permanent': {
          const index = products.findIndex((product) => product.id === message.productId);
          if (index < 0) throw new Error('Produto não encontrado na demonstração.');
          if (action === 'product-delete-permanent') products.splice(index, 1);
          else products[index] = { ...products[index], status: action === 'product-restore' ? 'active' : 'deleted' };
          return {};
        }
        case 'products-bulk-selection': {
          const filter = payload.filter;
          selected = filter
            ? productPage({ ...filter, limit: 1000 }).products.map((item) => item.id)
            : payload.ids || [];
          return { id: `selection-demo-${++selectionId}`, total: selected.length };
        }
        case 'products-bulk-start': {
          const changes = payload.changes || {};
          if (payload.action === 'delete')
            products = products.map((product) =>
              selected.includes(product.id) ? { ...product, status: 'deleted' } : product
            );
          if (payload.action === 'update')
            products = products.map((product) =>
              selected.includes(product.id) ? { ...product, ...changes } : product
            );
          latestJob = {
            id: message.jobId,
            status: 'completed',
            total: selected.length,
            succeeded: selected.length,
            failed: 0
          };
          return clone(latestJob);
        }
        case 'products-bulk-job':
          return clone(
            latestJob || { id: message.jobId, status: 'selected', total: selected.length, succeeded: 0, failed: 0 }
          );
        default:
          throw new Error('Esta ação não está disponível na demonstração.');
      }
    }

    return { request };
  }

  const api = { createDemoBridge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root || !root.document) return;

  const bridge = createDemoBridge();
  const runtime = {
    lastError: null,
    getManifest: () => ({ version: 'demo' }),
    sendMessage(message, callback) {
      Promise.resolve().then(() => {
        try {
          callback({ ok: true, body: bridge.request(message) });
        } catch (error) {
          callback({ ok: false, error: error.message });
        }
      });
    }
  };
  const chrome = root.chrome || {};
  chrome.runtime = runtime;
  chrome.storage = {
    local: {
      set(_value, callback) {
        if (callback) callback();
      }
    }
  };
  chrome.tabs = {
    create() {
      throw new Error('Links externos estão desativados na demonstração.');
    }
  };
  root.chrome = chrome;
})(typeof window === 'undefined' ? null : window);
