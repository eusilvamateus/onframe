const {
  test,
  assert,
  fs,
  os,
  path,
  vm,
  buildCommitPayload,
  collectItemIdCandidates,
  extractItemId,
  normalizeItemId,
  pickMode,
  decrypt,
  encrypt,
  createApp,
  sanitizeError,
  userFriendlyError,
  parseValue,
  buildPictureQualityReport,
  calculateOptimizedDimensions,
  calculateResolutionScore,
  extractImageDimensions,
  extractOfficialDimensions,
  buildPriceSummary,
  updateStandardPrice,
  buildPromotionSummary,
  createCampaign,
  createOffer,
  deleteOffer,
  detection,
  photosModel,
  commerceModel,
  moduleRegistry,
  icons,
  fakePng,
  fakeWebpVp8x,
  fakeDocument,
  fakeElement,
  listen
} = require('./helpers');

test('extractItemId normaliza URLs e HTML do Mercado Livre Brasil', () => {
  assert.strictEqual(
    extractItemId('https://produto.mercadolivre.com.br/MLB-1828680414-controle-xbox-_JM'),
    'MLB1828680414'
  );
  assert.strictEqual(extractItemId('{"item_id":"MLB123456789"}'), 'MLB123456789');
  assert.strictEqual(normalizeItemId('mlb-123456789'), 'MLB123456789');
  assert.strictEqual(normalizeItemId('MLB123456'), null);
  assert.strictEqual(normalizeItemId('MLA123456789'), null);
});

test('collectItemIdCandidates ignora ids de foto, categoria e catalogo', () => {
  const html = `
    {"category_id":"MLB123456789","picture_id":"687462-MLB110560215373_042026"}
    <link rel="canonical" href="https://produto.mercadolivre.com.br/MLB-4615439233-cadeira-_JM">
    {"item_id":"MLB4615439233"}
    {"catalog_product_id":"MLB9988776655"}
  `;

  assert.deepStrictEqual(collectItemIdCandidates(html), ['MLB4615439233']);
});

test('pickMode diferencia anuncio sem variacoes, variacoes antigas e user product', () => {
  assert.strictEqual(pickMode({ id: 'MLB1', variations: [] }), 'classic');
  assert.strictEqual(pickMode({ id: 'MLB1', variations: [{ id: 1 }] }), 'legacy_variations');
  assert.strictEqual(pickMode({ id: 'MLB1', user_product_id: 'MLBU1', family_name: 'Familia' }), 'user_product');
});

test('detector encontra user_product fora da URL /up', () => {
  const doc = fakeDocument({
    'link[rel="canonical"], meta[property="og:url"], meta[name="twitter:url"]': [
      fakeElement('', { href: 'https://produto.mercadolivre.com.br/MLB-4199823557-produto-_JM' })
    ],
    'link[rel="canonical"],meta[property="og:url"],meta[name="twitter:url"],a[href*="MLBU"],[data-testid*="selected"],[aria-checked="true"],[aria-pressed="true"]': [
      fakeElement('Cor: Azul', { href: 'https://www.mercadolivre.com.br/p/up/MLBU123456789' })
    ],
    script: [
      fakeElement('{"user_product_id":"MLBU987654321"}')
    ]
  });

  assert.deepStrictEqual(
    detection.collectUserProductCandidatesFromPage(doc, 'https://produto.mercadolivre.com.br/MLB-4199823557-produto-_JM'),
    ['MLBU123456789', 'MLBU987654321']
  );
});

test('detector separa identidade forte de candidatos fracos da variacao', () => {
  const doc = fakeDocument({
    '[aria-checked="true"]': [
      fakeElement('Azul', { href: 'https://produto.mercadolivre.com.br/MLB-2222222222-produto-_JM' })
    ],
    'link[rel="canonical"], meta[property="og:url"], meta[name="twitter:url"]': [
      fakeElement('', { href: 'https://produto.mercadolivre.com.br/MLB-1111111111-produto-_JM' })
    ]
  });

  assert.deepStrictEqual(
    detection.collectItemIdCandidatesFromPage(doc, 'https://produto.mercadolivre.com.br/MLB-1111111111-produto-_JM'),
    ['MLB1111111111', 'MLB2222222222']
  );
  assert.deepStrictEqual(
    detection.collectPageIdentity(doc, 'https://produto.mercadolivre.com.br/MLB-1111111111-produto-_JM', { includeScripts: false }),
    {
      urlItemId: 'MLB1111111111',
      canonicalItemId: 'MLB1111111111',
      denounceItemId: null,
      urlUserProductId: null,
      pdpFilterItemId: null,
      productTriggerItemId: null,
      catalogProductId: null,
      weakItemCandidates: ['MLB2222222222'],
      weakUserProductCandidates: []
    }
  );
});

test('detector identifica user_product, product_trigger e catalogo sem misturar ids', () => {
  const userProductIdentity = detection.collectPageIdentity(
    fakeDocument({}),
    'https://www.mercadolivre.com.br/cadeira/up/MLBU3465525569?product_trigger_id=MLB75204914&picker=true',
    { includeScripts: false }
  );
  assert.strictEqual(userProductIdentity.urlUserProductId, 'MLBU3465525569');
  assert.strictEqual(userProductIdentity.productTriggerItemId, 'MLB75204914');
  assert.strictEqual(userProductIdentity.catalogProductId, null);

  const catalogIdentity = detection.collectPageIdentity(
    fakeDocument({}),
    'https://www.mercadolivre.com.br/cadeira/p/MLB1234567890',
    { includeScripts: false }
  );
  assert.strictEqual(catalogIdentity.urlItemId, null);
  assert.strictEqual(catalogIdentity.catalogProductId, 'MLB1234567890');
});

test('detector usa item_id publico do bloco de denuncia como identidade forte', () => {
  const doc = fakeDocument({
    'a[href*="/noindex/denounce"][href*="item_id=MLB"]': [
      fakeElement('Denunciar', { href: 'https://www.mercadolivre.com.br/noindex/denounce?item_id=MLB6312193712&element_type=ITM' })
    ],
    '#denounce': [
      fakeElement('Anúncio #6312193712')
    ]
  });

  const identity = detection.collectPageIdentity(
    doc,
    'https://www.mercadolivre.com.br/mesa/p/MLB66053189?product_trigger_id=MLB66053018&pdp_filters=item_id%3AMLB6312193712',
    { includeScripts: false }
  );

  assert.strictEqual(identity.denounceItemId, 'MLB6312193712');
  assert.strictEqual(identity.pdpFilterItemId, 'MLB6312193712');
  assert.strictEqual(identity.productTriggerItemId, 'MLB66053018');
  assert.strictEqual(identity.catalogProductId, 'MLB66053189');
});

test('detector infere a variacao ativa por texto selecionado', () => {
  const doc = fakeDocument({
    '.ui-pdp-container': [fakeElement('Cor Da Estrutura: Azul-celeste\nVoltagem: 127/220V')]
  });

  assert.strictEqual(
    detection.inferSelectedVariationId([
      { id: 10, attribute_combinations: [{ name: 'Cor Da Estrutura', value_name: 'Cinza' }] },
      { id: 20, attribute_combinations: [{ name: 'Cor Da Estrutura', value_name: 'Azul-celeste' }] }
    ], doc, 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM'),
    '20'
  );
});

test('assinatura da pagina muda quando a selecao visual muda', () => {
  const href = 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM';
  const first = fakeDocument({ '.ui-pdp-container': [fakeElement('Cor: Azul')] });
  const second = fakeDocument({ '.ui-pdp-container': [fakeElement('Cor: Cinza')] });

  assert.notStrictEqual(
    detection.createPageSignature(first, href),
    detection.createPageSignature(second, href)
  );
});

test('assinatura da pagina ignora parametros que nao identificam anuncio ou variacao', () => {
  const doc = fakeDocument({
    'a[href*="/noindex/denounce"][href*="item_id=MLB"]': [
      fakeElement('Denunciar', { href: 'https://www.mercadolivre.com.br/noindex/denounce?item_id=MLB6312193712&element_type=ITM' })
    ],
    '.ui-pdp-container': [fakeElement('Cor: Preto')]
  });

  assert.strictEqual(
    detection.createPageSignature(doc, 'https://www.mercadolivre.com.br/produto/p/MLB66053189?quantity=1&picker=true'),
    detection.createPageSignature(doc, 'https://www.mercadolivre.com.br/produto/p/MLB66053189?quantity=2&picker=false')
  );
});

test('api resolve prioriza user_product quando solicitado', async (t) => {
  const calls = [];
  const items = {
    MLB1111111111: {
      id: 'MLB1111111111',
      title: 'Item antigo',
      seller_id: 123,
      site_id: 'MLB',
      pictures: [{ id: 'OLD' }]
    },
    MLB2222222222: {
      id: 'MLB2222222222',
      title: 'Item novo',
      seller_id: 123,
      site_id: 'MLB',
      family_name: 'Familia',
      user_product_id: 'MLBU222222222',
      pictures: [{ id: 'NEW' }]
    }
  };
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123 }),
      getItem: async (itemId) => {
        calls.push(['getItem', itemId]);
        return items[itemId];
      },
      getUserProduct: async () => ({ id: 'MLBU222222222' }),
      searchItemsByUserProduct: async (userId, userProductId) => {
        calls.push(['searchItemsByUserProduct', userId, userProductId]);
        return { results: ['MLB2222222222'] };
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pageIdentity: {
        urlUserProductId: 'MLBU222222222',
        weakItemCandidates: ['MLB1111111111']
      }
    })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.item.id, 'MLB2222222222');
  assert.deepStrictEqual(body.pictures, [{ id: 'NEW' }]);
  assert.deepStrictEqual(calls[0], ['searchItemsByUserProduct', 123, 'MLBU222222222']);
});

test('api resolve ignora item encerrado de migracao quando user_product tem item ativo', async (t) => {
  const items = {
    MLB1111111111: {
      id: 'MLB1111111111',
      title: 'Item migrado encerrado',
      seller_id: 123,
      site_id: 'MLB',
      status: 'closed',
      user_product_id: null,
      tags: ['variations_migration_source'],
      pictures: [{ id: 'CLOSED' }]
    },
    MLB2222222222: {
      id: 'MLB2222222222',
      title: 'Item ativo user product',
      seller_id: 123,
      site_id: 'MLB',
      status: 'active',
      user_product_id: 'MLBU333333333',
      tags: ['user_product_listing'],
      pictures: [{ id: 'ACTIVE' }]
    },
    MLB3333333333: {
      id: 'MLB3333333333',
      title: 'Item ativo catalog boost',
      seller_id: 123,
      site_id: 'MLB',
      status: 'active',
      user_product_id: 'MLBU333333333',
      tags: ['catalog_boost'],
      pictures: [{ id: 'BOOST' }]
    }
  };
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123 }),
      getItem: async (itemId) => items[itemId],
      getUserProduct: async () => ({ id: 'MLBU333333333' }),
      searchItemsByUserProduct: async () => ({
        results: ['MLB1111111111', 'MLB3333333333', 'MLB2222222222']
      })
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pageIdentity: {
        urlUserProductId: 'MLBU333333333'
      }
    })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.item.id, 'MLB2222222222');
  assert.deepStrictEqual(body.pictures, [{ id: 'ACTIVE' }]);
});

test('api resolve usa product_trigger como item exato da pagina user_product', async (t) => {
  const calls = [];
  const items = {
    MLB75204914: {
      id: 'MLB75204914',
      title: 'Variacao aberta',
      seller_id: 123,
      site_id: 'MLB',
      status: 'active',
      user_product_id: 'MLBU75204914',
      pictures: [{ id: 'OPEN' }]
    },
    MLB9999999999: {
      id: 'MLB9999999999',
      title: 'Outro produto da conta',
      seller_id: 123,
      site_id: 'MLB',
      status: 'active',
      pictures: [{ id: 'WRONG' }]
    }
  };
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123 }),
      getItem: async (itemId) => {
        calls.push(itemId);
        return items[itemId];
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pageIdentity: {
        urlUserProductId: 'MLBU3465525569',
        productTriggerItemId: 'MLB75204914',
        weakItemCandidates: ['MLB9999999999']
      }
    })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.item.id, 'MLB75204914');
  assert.strictEqual(body.resolvedFrom, 'product_trigger');
  assert.deepStrictEqual(calls, ['MLB75204914']);
});

test('api resolve encontra automaticamente a conta dona do anuncio', async (t) => {
  const accounts = [
    { user_id: 101, nickname: 'LOJA 1', refresh_token: 'TG-1', active: true },
    { user_id: 202, nickname: 'LOJA 2', refresh_token: 'TG-2', active: false }
  ];
  let activeUserId = 101;
  const store = {
    listAccountTokens: async () => accounts.map((account) => Object.assign({}, account, {
      active: String(account.user_id) === String(activeUserId)
    }))
  };
  const attempts = [];
  const server = await listen(createApp({
    store,
    client: {},
    clientFactory: (account) => ({
      getMe: async () => ({ id: account.user_id }),
      getItem: async (itemId) => {
        attempts.push([account.user_id, itemId]);
        return {
          id: itemId,
          title: 'Item da loja 2',
          seller_id: 202,
          site_id: 'MLB',
          pictures: [{ id: 'P1' }]
        };
      }
    })
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pageIdentity: { urlItemId: 'MLB1234567890' } })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.item.id, 'MLB1234567890');
  assert.deepStrictEqual(body.ownerAccount, {
    user_id: 202,
    nickname: 'LOJA 2',
    site_id: null,
    permalink: null,
    connected: true
  });
  assert.strictEqual(activeUserId, 101);
  assert.deepStrictEqual(attempts, [
    [101, 'MLB1234567890'],
    [202, 'MLB1234567890']
  ]);
});

test('api resolve bloqueia anuncio que nao pertence a contas conectadas', async (t) => {
  const accounts = [
    { user_id: 101, nickname: 'LOJA 1', refresh_token: 'TG-1', active: true },
    { user_id: 202, nickname: 'LOJA 2', refresh_token: 'TG-2', active: false }
  ];
  const server = await listen(createApp({
    store: {
      listAccountTokens: async () => accounts,
      setActive: async () => {
        throw new Error('Não deveria ativar conta.');
      }
    },
    client: {},
    clientFactory: (account) => ({
      getMe: async () => ({ id: account.user_id }),
      getItem: async (itemId) => ({
        id: itemId,
        title: 'Item de outro vendedor',
        seller_id: 303,
        site_id: 'MLB',
        pictures: []
      })
    })
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pageIdentity: { urlItemId: 'MLB1234567890' } })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 403);
  assert.strictEqual(body.error, 'Este anúncio não pertence às contas conectadas.');
});

test('api resolve prioriza mensagem de catalogo quando nenhum item proprio e confirmado', async (t) => {
  const accounts = [
    { user_id: 101, nickname: 'LOJA 1', refresh_token: 'TG-1', active: true },
    { user_id: 202, nickname: 'LOJA 2', refresh_token: 'TG-2', active: false }
  ];
  const attempts = [];
  const server = await listen(createApp({
    store: {
      listAccountTokens: async () => accounts
    },
    client: {},
    clientFactory: (account) => ({
      getMe: async () => ({ id: account.user_id }),
      getItem: async (itemId) => {
        attempts.push([account.user_id, itemId]);
        return {
          id: itemId,
          title: 'Item publico de catalogo',
          seller_id: 303,
          site_id: 'MLB',
          catalog_listing: true,
          pictures: []
        };
      }
    })
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pageIdentity: {
        urlItemId: 'MLB1234567890',
        catalogProductId: 'MLB9876543210'
      }
    })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 409);
  assert.strictEqual(body.error, 'Catálogo sem anúncio seu identificado.');
  assert.deepStrictEqual(attempts, [
    [101, 'MLB1234567890'],
    [202, 'MLB1234567890']
  ]);
});

test('api resolve ignora conta desativada e informa quando ela e dona do anuncio', async (t) => {
  const accounts = [
    { user_id: 101, nickname: 'LOJA 1', refresh_token: 'TG-1', active: true, enabled: true },
    { user_id: 202, nickname: 'LOJA 2', refresh_token: 'TG-2', active: false, enabled: false }
  ];
  const attempts = [];
  const server = await listen(createApp({
    store: {
      listAccountTokens: async () => accounts
    },
    client: {},
    clientFactory: (account) => ({
      getMe: async () => ({ id: account.user_id }),
      getItem: async (itemId) => {
        attempts.push([account.user_id, itemId]);
        return {
          id: itemId,
          title: 'Item loja 2',
          seller_id: 202,
          site_id: 'MLB',
          pictures: []
        };
      }
    })
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pageIdentity: { urlItemId: 'MLB1234567890' } })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 403);
  assert.strictEqual(body.error, 'Conta desativada no OnFrame. Ative para editar este anúncio.');
  assert.deepStrictEqual(attempts, [
    [101, 'MLB1234567890'],
    [202, 'MLB1234567890']
  ]);
});

test('api resolve bloqueia quando todas as contas estao desativadas', async (t) => {
  const accounts = [
    { user_id: 101, nickname: 'LOJA 1', refresh_token: 'TG-1', active: true, enabled: false }
  ];
  const server = await listen(createApp({
    store: {
      listAccountTokens: async () => accounts
    },
    client: {},
    clientFactory: () => {
      throw new Error('Não deveria tentar resolver sem contas habilitadas.');
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pageIdentity: { urlItemId: 'MLB1234567890' } })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 403);
  assert.strictEqual(body.error, 'Nenhuma conta habilitada para detectar anúncios.');
});

test('api item usa owner_user_id sem trocar conta ativa', async (t) => {
  const accounts = [
    { user_id: 101, nickname: 'LOJA 1', refresh_token: 'TG-1', active: true },
    { user_id: 202, nickname: 'LOJA 2', refresh_token: 'TG-2', active: false }
  ];
  let activeUserId = 101;
  const calls = [];
  const server = await listen(createApp({
    store: {
      readAccount: async (userId) => accounts.find((account) => String(account.user_id) === String(userId)) || null,
      listAccountTokens: async () => accounts.map((account) => Object.assign({}, account, {
        active: String(account.user_id) === String(activeUserId)
      }))
    },
    client: {},
    clientFactory: (account) => ({
      getMe: async () => ({ id: account.user_id, nickname: account.nickname }),
      getItem: async (itemId) => {
        calls.push([account.user_id, itemId]);
        return {
          id: itemId,
          title: 'Item loja 2',
          seller_id: 202,
          site_id: 'MLB',
          price: 100,
          currency_id: 'BRL',
          pictures: []
        };
      },
      getItemPrices: async () => ({ prices: [{ type: 'standard', amount: 100, currency_id: 'BRL' }] })
    })
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/items/MLB1234567890/pricing/summary?owner_user_id=202`);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.item.id, 'MLB1234567890');
  assert.strictEqual(activeUserId, 101);
  assert.deepStrictEqual(calls, [[202, 'MLB1234567890']]);
});

test('api item bloqueia owner_user_id de conta desativada', async (t) => {
  const accounts = [
    { user_id: 202, nickname: 'LOJA 2', refresh_token: 'TG-2', active: true, enabled: false }
  ];
  const server = await listen(createApp({
    store: {
      readAccount: async (userId) => accounts.find((account) => String(account.user_id) === String(userId)) || null
    },
    client: {},
    clientFactory: () => {
      throw new Error('Não deveria criar client para conta desativada.');
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/items/MLB1234567890/pricing/summary?owner_user_id=202`);
  const body = await response.json();

  assert.strictEqual(response.status, 403);
  assert.strictEqual(body.error, 'Conta desativada no OnFrame. Ative para editar este anúncio.');
});

test('api item encontra conta dona quando owner_user_id nao vem', async (t) => {
  const accounts = [
    { user_id: 101, nickname: 'LOJA 1', refresh_token: 'TG-1', active: true },
    { user_id: 202, nickname: 'LOJA 2', refresh_token: 'TG-2', active: false }
  ];
  let activeUserId = 101;
  const calls = [];
  const server = await listen(createApp({
    store: {
      listAccountTokens: async () => accounts.map((account) => Object.assign({}, account, {
        active: String(account.user_id) === String(activeUserId)
      }))
    },
    client: {},
    clientFactory: (account) => ({
      getMe: async () => ({ id: account.user_id, nickname: account.nickname }),
      getItem: async (itemId) => {
        calls.push([account.user_id, itemId]);
        return {
          id: itemId,
          title: 'Item loja 2',
          seller_id: 202,
          site_id: 'MLB',
          price: 100,
          currency_id: 'BRL',
          pictures: []
        };
      },
      getItemPrices: async () => ({ prices: [{ type: 'standard', amount: 100, currency_id: 'BRL' }] })
    })
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/items/MLB1234567890/pricing/summary`);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.item.id, 'MLB1234567890');
  assert.strictEqual(activeUserId, 101);
  assert.deepStrictEqual(calls, [
    [101, 'MLB1234567890'],
    [202, 'MLB1234567890'],
    [202, 'MLB1234567890']
  ]);
});

test('api item bloqueia owner_user_id que nao possui anuncio', async (t) => {
  const accounts = [
    { user_id: 101, nickname: 'LOJA 1', refresh_token: 'TG-1', active: true },
    { user_id: 202, nickname: 'LOJA 2', refresh_token: 'TG-2', active: false }
  ];
  const server = await listen(createApp({
    store: {
      readAccount: async (userId) => accounts.find((account) => String(account.user_id) === String(userId)) || null
    },
    client: {},
    clientFactory: (account) => ({
      getMe: async () => ({ id: account.user_id }),
      getItem: async (itemId) => ({
        id: itemId,
        title: 'Item loja 2',
        seller_id: 202,
        site_id: 'MLB',
        price: 100,
        currency_id: 'BRL',
        pictures: []
      })
    })
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/items/MLB1234567890/pictures/quality?owner_user_id=101`);
  const body = await response.json();

  assert.strictEqual(response.status, 403);
  assert.match(body.error, /Conta errada/i);
});

test('api resolve nao usa candidato fraco quando a identidade forte aponta outro item', async (t) => {
  const calls = [];
  const items = {
    MLB1111111111: {
      id: 'MLB1111111111',
      title: 'Item da URL',
      seller_id: 123,
      site_id: 'MLB',
      pictures: [{ id: 'URL' }]
    },
    MLB2222222222: {
      id: 'MLB2222222222',
      title: 'Item selecionado no DOM',
      seller_id: 123,
      site_id: 'MLB',
      pictures: [{ id: 'WEAK' }]
    }
  };
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123 }),
      getItem: async (itemId) => {
        calls.push(itemId);
        return items[itemId];
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pageIdentity: {
        urlItemId: 'MLB1111111111',
        weakItemCandidates: ['MLB2222222222']
      }
    })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.item.id, 'MLB1111111111');
  assert.deepStrictEqual(calls, ['MLB1111111111']);
});

test('api resolve bloqueia catalogo sem item confirmado do vendedor', async (t) => {
  let getItemCalled = false;
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123 }),
      getItem: async () => {
        getItemCalled = true;
        return null;
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pageIdentity: {
        catalogProductId: 'MLB1234567890',
        weakItemCandidates: ['MLB2222222222']
      }
    })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 409);
  assert.match(body.error, /Catálogo/);
  assert.strictEqual(getItemCalled, false);
});

test('api resolve confirma item proprio de catalogo por denuncia antes de product_trigger', async (t) => {
  const calls = [];
  const accounts = [
    { user_id: 310458346, nickname: 'BOGU STORE', refresh_token: 'TG-1', active: true, enabled: true }
  ];
  const server = await listen(createApp({
    store: {
      listAccountTokens: async () => accounts
    },
    client: {},
    clientFactory: (account) => ({
      getMe: async () => ({ id: account.user_id }),
      getItem: async (itemId) => {
        calls.push(itemId);
        if (itemId === 'MLB6312193712') {
          return {
            id: 'MLB6312193712',
            title: 'Mesa catalogo propria',
            seller_id: 310458346,
            site_id: 'MLB',
            status: 'active',
            catalog_listing: true,
            user_product_id: 'MLBU3721686677',
            pictures: [{ id: 'CAT' }]
          };
        }
        return {
          id: itemId,
          title: 'Trigger de catalogo',
          seller_id: 999,
          site_id: 'MLB',
          status: 'active',
          pictures: []
        };
      },
      getUserProduct: async () => ({ id: 'MLBU3721686677' })
    })
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pageIdentity: {
        denounceItemId: 'MLB6312193712',
        pdpFilterItemId: 'MLB6312193712',
        productTriggerItemId: 'MLB66053018',
        catalogProductId: 'MLB66053189'
      }
    })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.item.id, 'MLB6312193712');
  assert.strictEqual(body.item.seller_id, 310458346);
  assert.strictEqual(body.item.catalog_listing, true);
  assert.strictEqual(body.item.picturesEditable, false);
  assert.strictEqual(body.item.pictureEditability.reason, 'catalog_listing');
  assert.deepStrictEqual(body.capabilities, {
    pictures: {
      editable: false,
      reason: 'catalog_listing',
      message: 'Catálogo: fotos bloqueadas pelo Mercado Livre.'
    },
    pricing: {
      editable: true,
      reason: null,
      message: null
    },
    promotions: {
      editable: true,
      reason: null,
      message: null
    }
  });
  assert.strictEqual(body.ownerAccount.user_id, 310458346);
  assert.deepStrictEqual(calls, ['MLB6312193712']);
});

test('api resolve bloqueia quando existem apenas candidatos fracos', async (t) => {
  let getItemCalled = false;
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123 }),
      getItem: async () => {
        getItemCalled = true;
        return null;
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pageIdentity: {
        weakItemCandidates: ['MLB2222222222']
      }
    })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 409);
  assert.match(body.error, /Não consegui confirmar este anúncio/);
  assert.strictEqual(getItemCalled, false);
});

test('api resolve mantem erro simples quando anuncio nao e detectado', async (t) => {
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {}
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  const body = await response.json();

  assert.strictEqual(response.status, 400);
  assert.deepStrictEqual(body, { error: 'Anúncio não detectado.' });
});

test('api resolve retorna limites de fotos da categoria', async (t) => {
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123 }),
      getItem: async () => ({
        id: 'MLB1234567890',
        title: 'Item',
        seller_id: 123,
        category_id: 'MLB1055',
        site_id: 'MLB',
        pictures: []
      }),
      getCategory: async () => ({
        id: 'MLB1055',
        settings: {
          max_pictures_per_item: 12,
          max_pictures_per_item_var: 10
        }
      })
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pageIdentity: { urlItemId: 'MLB1234567890' } })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(body.pictureLimits, {
    maxPicturesPerItem: 12,
    maxPicturesPerVariation: 10,
    source: 'category_settings'
  });
});

test('api resolve informa quando fotos nao sao editaveis em anuncio encerrado com venda', async (t) => {
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123 }),
      getItem: async () => ({
        id: 'MLB1234567890',
        title: 'Item',
        seller_id: 123,
        category_id: 'MLB1055',
        site_id: 'MLB',
        status: 'closed',
        has_bids: true,
        pictures: []
      }),
      getCategory: async () => ({ id: 'MLB1055', settings: {} })
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pageIdentity: { urlItemId: 'MLB1234567890' } })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.item.picturesEditable, false);
  assert.deepStrictEqual(body.item.pictureEditability, {
    editable: false,
    reason: 'closed_with_bids',
    message: 'Anúncio encerrado: fotos bloqueadas pelo Mercado Livre.'
  });
});

test('api commit bloqueia limite antes de atualizar item', async (t) => {
  let updateCalled = false;
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123 }),
      getItem: async () => ({
        id: 'MLB1234567890',
        title: 'Item',
        seller_id: 123,
        category_id: 'MLB1055',
        site_id: 'MLB',
        variations: [],
        pictures: [{ id: 'A' }]
      }),
      getCategory: async () => ({
        id: 'MLB1055',
        settings: {
          max_pictures_per_item: 2,
          max_pictures_per_item_var: 2
        }
      }),
      updateItem: async () => {
        updateCalled = true;
        return {};
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/items/MLB1234567890/pictures/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pictures: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      variations: []
    })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 400);
  assert.match(body.error, /Limite do anúncio: 2 fotos/);
  assert.strictEqual(updateCalled, false);
});

test('api commit bloqueia anuncio encerrado com venda antes de atualizar item', async (t) => {
  let updateCalled = false;
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123 }),
      getItem: async () => ({
        id: 'MLB1234567890',
        title: 'Item',
        seller_id: 123,
        category_id: 'MLB1055',
        site_id: 'MLB',
        status: 'closed',
        has_bids: true,
        variations: [],
        pictures: [{ id: 'A' }]
      }),
      updateItem: async () => {
        updateCalled = true;
        return {};
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/items/MLB1234567890/pictures/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pictures: [{ id: 'A' }],
      variations: []
    })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 409);
  assert.match(body.error, /Anúncio encerrado/i);
  assert.strictEqual(updateCalled, false);
});
