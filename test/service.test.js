const {
  test,
  assert,
  fs,
  os,
  path,
  vm,
  buildCommitPayload,
  pickMode,
  MercadoLivreClient,
  TokenStore,
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
  descriptions,
  characteristics,
  updateManager,
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
const crypto = require('crypto');

test('descricoes usam upsert com texto simples', async () => {
  const calls = [];
  const client = {
    getMe: async () => ({ id: 123 }),
    getItem: async (itemId) => ({ id: itemId, seller_id: 123 }),
    getItemDescription: async (itemId) => {
      calls.push(['getItemDescription', itemId]);
      return { plain_text: 'Atual', last_updated: '2026-07-25T10:00:00.000Z' };
    },
    updateItemDescription: async (itemId, plainText) => {
      calls.push(['updateItemDescription', itemId, plainText]);
      return { plain_text: plainText, last_updated: '2026-07-25T11:00:00.000Z' };
    },
    createItemDescription: async () => {
      throw new Error('create should not be called');
    }
  };

  const result = await descriptions.upsertDescription(client, 'MLB1234567890', {
    plainText: '  Nova descrição\r\ncom linha  '
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.created, false);
  assert.strictEqual(result.description.plainText, 'Nova descrição\ncom linha');
  assert.deepStrictEqual(calls, [
    ['getItemDescription', 'MLB1234567890'],
    ['updateItemDescription', 'MLB1234567890', 'Nova descrição\ncom linha']
  ]);
  assert.throws(() => descriptions.normalizePlainText('   '), /description_empty/);
});

test('descricoes criam quando item ainda nao tem descricao', async () => {
  const calls = [];
  const client = {
    getMe: async () => ({ id: 123 }),
    getItem: async (itemId) => ({ id: itemId, seller_id: 123 }),
    getItemDescription: async () => {
      const err = new Error('not_found');
      err.statusCode = 404;
      throw err;
    },
    updateItemDescription: async () => {
      throw new Error('update should not be called');
    },
    createItemDescription: async (itemId, plainText) => {
      calls.push(['createItemDescription', itemId, plainText]);
      return { plain_text: plainText };
    }
  };

  const result = await descriptions.upsertDescription(client, 'MLB1234567890', { plainText: 'Primeira descrição' });

  assert.strictEqual(result.created, true);
  assert.strictEqual(result.description.plainText, 'Primeira descrição');
  assert.deepStrictEqual(calls, [['createItemDescription', 'MLB1234567890', 'Primeira descrição']]);
});

test('descricoes em massa aplicam nas variacoes ativas e reportam falhas parciais', async () => {
  const updated = [];
  const items = {
    MLB1000000001: {
      id: 'MLB1000000001',
      title: 'Azul',
      seller_id: 123,
      site_id: 'MLB',
      family_name: 'Cadeira',
      family_id: 'FAMILY1',
      user_product_id: 'MLBU100000001',
      status: 'active',
      tags: []
    },
    MLB1000000002: {
      id: 'MLB1000000002',
      title: 'Verde',
      seller_id: 123,
      site_id: 'MLB',
      family_name: 'Cadeira',
      family_id: 'FAMILY1',
      user_product_id: 'MLBU100000002',
      status: 'active',
      tags: []
    }
  };
  const client = {
    getMe: async () => ({ id: 123 }),
    getItem: async (itemId) => items[itemId],
    getUserProduct: async (userProductId) => ({ id: userProductId, family_id: 'FAMILY1' }),
    getUserProductFamily: async () => ({
      user_products: [
        { id: 'MLBU100000001' },
        { id: 'MLBU100000002' }
      ]
    }),
    searchItemsByUserProduct: async () => ({ results: Object.keys(items) }),
    getItemDescription: async () => ({ plain_text: 'Atual' }),
    updateItemDescription: async (itemId, plainText) => {
      if (itemId === 'MLB1000000002') {
        const err = new Error('Validation error');
        err.statusCode = 400;
        throw err;
      }
      updated.push({ itemId, plainText });
      return { plain_text: plainText };
    }
  };

  const result = await descriptions.updateDescriptionFamily(client, 'MLB1000000001', {
    scope: 'user_product_family',
    plainText: 'Descrição nova'
  });

  assert.strictEqual(result.action, 'description.update');
  assert.deepStrictEqual(result.counts, {
    total: 2,
    eligible: 1,
    blocked: 0,
    applied: 1,
    skipped: 0,
    failed: 1
  });
  assert.deepStrictEqual(updated, [{ itemId: 'MLB1000000001', plainText: 'Descrição nova' }]);
  assert.strictEqual(result.targets[1].status, 'failed');
});

test('descricoes em massa nao oferecem familia sem variacao editavel adicional', async () => {
  let updateCalled = false;
  const items = {
    MLB1000000001: {
      id: 'MLB1000000001',
      title: 'Principal',
      seller_id: 123,
      site_id: 'MLB',
      family_name: 'Kit',
      family_id: 'FAMILY1',
      user_product_id: 'MLBU100000001',
      status: 'active',
      tags: []
    },
    MLB1000000002: {
      id: 'MLB1000000002',
      title: 'Catálogo vinculado',
      seller_id: 123,
      site_id: 'MLB',
      family_name: 'Kit',
      family_id: 'FAMILY1',
      user_product_id: 'MLBU100000001',
      status: 'active',
      catalog_listing: true,
      tags: []
    }
  };
  const client = {
    getMe: async () => ({ id: 123 }),
    getItem: async (itemId) => items[itemId],
    getUserProduct: async (userProductId) => ({ id: userProductId, family_id: 'FAMILY1' }),
    getUserProductFamily: async () => ({
      user_products: [{ id: 'MLBU100000001' }]
    }),
    searchItemsByUserProduct: async () => ({ results: Object.keys(items) }),
    getItemDescription: async () => ({ plain_text: 'Atual' }),
    updateItemDescription: async () => {
      updateCalled = true;
      throw new Error('update should not be called');
    }
  };

  await assert.rejects(
    descriptions.updateDescriptionFamily(client, 'MLB1000000001', {
      scope: 'user_product_family',
      plainText: 'Descrição nova'
    }),
    /bulk_description_no_editable_variations/
  );
  assert.strictEqual(updateCalled, false);
});

test('descricoes em massa bloqueiam catalogo antes de salvar e seguem nas variacoes editaveis', async () => {
  const updated = [];
  const items = {
    MLB1000000001: {
      id: 'MLB1000000001',
      title: 'Azul',
      seller_id: 123,
      site_id: 'MLB',
      family_name: 'Cadeira',
      family_id: 'FAMILY1',
      user_product_id: 'MLBU100000001',
      status: 'active',
      tags: []
    },
    MLB1000000002: {
      id: 'MLB1000000002',
      title: 'Verde',
      seller_id: 123,
      site_id: 'MLB',
      family_name: 'Cadeira',
      family_id: 'FAMILY1',
      user_product_id: 'MLBU100000002',
      status: 'active',
      tags: []
    },
    MLB1000000003: {
      id: 'MLB1000000003',
      title: 'Catálogo',
      seller_id: 123,
      site_id: 'MLB',
      family_name: 'Cadeira',
      family_id: 'FAMILY1',
      user_product_id: 'MLBU100000003',
      status: 'active',
      catalog_listing: true,
      tags: []
    }
  };
  const client = {
    getMe: async () => ({ id: 123 }),
    getItem: async (itemId) => items[itemId],
    getUserProduct: async (userProductId) => ({ id: userProductId, family_id: 'FAMILY1' }),
    getUserProductFamily: async () => ({
      user_products: [
        { id: 'MLBU100000001' },
        { id: 'MLBU100000002' },
        { id: 'MLBU100000003' }
      ]
    }),
    searchItemsByUserProduct: async (sellerId, userProductIds) => ({
      results: Object.values(items)
        .filter((item) => String(userProductIds).split(',').includes(item.user_product_id))
        .map((item) => item.id)
    }),
    getItemDescription: async () => ({ plain_text: 'Atual' }),
    updateItemDescription: async (itemId, plainText) => {
      updated.push({ itemId, plainText });
      return { plain_text: plainText };
    }
  };

  const result = await descriptions.updateDescriptionFamily(client, 'MLB1000000001', {
    scope: 'user_product_family',
    plainText: 'Descrição nova'
  });

  assert.deepStrictEqual(result.counts, {
    total: 3,
    eligible: 2,
    blocked: 1,
    applied: 2,
    skipped: 0,
    failed: 0
  });
  assert.deepStrictEqual(updated, [
    { itemId: 'MLB1000000001', plainText: 'Descrição nova' },
    { itemId: 'MLB1000000002', plainText: 'Descrição nova' }
  ]);
  assert.strictEqual(result.targets[2].status, 'blocked');
  assert.strictEqual(result.targets[2].reasonCode, 'catalog_listing_description_read_only');
});

test('caracteristicas montam ficha com technical specs e respeitam bloqueios do schema', async () => {
  const client = {
    getMe: async () => ({ id: 123 }),
    getItem: async (itemId) => ({
      id: itemId,
      seller_id: 123,
      category_id: 'MLB123',
      domain_id: 'MLB-TEST',
      attributes: [
        { id: 'BRAND', name: 'Marca', value_name: 'Bogu Store' },
        { id: 'WIDTH', name: 'Largura', value_name: '2,7 m', value_struct: { number: 2.7, unit: 'm' } },
        { id: 'COLOR', name: 'Cor', value_id: '52049', value_name: 'Preto' }
      ]
    }),
    getCategoryAttributes: async () => [
      { id: 'BRAND', name: 'Marca', value_type: 'string', tags: { hierarchy: 'PARENT_PK' } },
      { id: 'WIDTH', name: 'Largura', value_type: 'number_unit', allowed_units: [{ id: 'm' }, { id: 'cm' }], default_unit: 'm' },
      { id: 'COLOR', name: 'Cor', value_type: 'list', tags: { variation_attribute: true }, values: [{ id: '52049', name: 'Preto' }] }
    ],
    getDomainTechnicalSpecs: async () => ({
      output: {
        groups: [{
          id: 'MAIN',
          label: 'Características principais',
          components: [{
            label: 'Campos',
            attributes: [
              { id: 'BRAND', hierarchy: 'PARENT_PK' },
              { id: 'WIDTH' },
              { id: 'COLOR' }
            ]
          }]
        }]
      }
    })
  };

  const result = await characteristics.getCharacteristics(client, 'MLB1000000001');
  const byId = new Map(result.fields.map((field) => [field.id, field]));

  assert.strictEqual(result.meta.editableCount, 1);
  assert.strictEqual(byId.get('WIDTH').editable, true);
  assert.strictEqual(byId.get('WIDTH').componentLabel, 'Campos');
  assert.deepStrictEqual(byId.get('WIDTH').allowedUnits, ['m', 'cm']);
  assert.strictEqual(byId.get('BRAND').editable, false);
  assert.strictEqual(byId.get('BRAND').reason, 'product_key');
  assert.strictEqual(byId.get('COLOR').editable, false);
  assert.strictEqual(byId.get('COLOR').reason, 'variation_attribute');
});

test('caracteristicas expõem atributos pendentes seguros do schema da categoria', async () => {
  const payloads = [];
  const item = {
    id: 'MLB1000000001',
    seller_id: 123,
    category_id: 'MLB123',
    domain_id: 'MLB-TEST',
    catalog_listing: false,
    attributes: [
      { id: 'HAT_AND_CAP_TYPE', name: 'Tipo de chapéu', value_name: 'Chapéu fedora' }
    ]
  };
  const client = {
    getMe: async () => ({ id: 123 }),
    getItem: async () => item,
    getCategoryAttributes: async () => [
      { id: 'HAT_AND_CAP_TYPE', name: 'Tipo de chapéu', value_type: 'string', attribute_group_id: 'OTHERS', attribute_group_name: 'Outros' },
      { id: 'COMPOSITION', name: 'Composição', value_type: 'string', tags: { hidden: true, multivalued: true }, hierarchy: 'FAMILY', attribute_group_id: 'OTHERS', attribute_group_name: 'Outros' },
      { id: 'IS_REVERSIBLE', name: 'É reversível', value_type: 'boolean', tags: { hidden: true }, hierarchy: 'FAMILY', values: [{ id: '242084', name: 'Não' }, { id: '242085', name: 'Sim' }], attribute_group_id: 'OTHERS', attribute_group_name: 'Outros' },
      { id: 'IS_KIT', name: 'É kit', value_type: 'boolean', tags: { hidden: true }, hierarchy: 'ITEM', values: [{ id: '242084', name: 'Não' }, { id: '242085', name: 'Sim' }], attribute_group_id: 'OTHERS', attribute_group_name: 'Outros' },
      { id: 'PRODUCT_DATA_SOURCE', name: 'Fonte do produto', value_type: 'string', tags: { hidden: true }, hierarchy: 'ITEM', attribute_group_id: 'OTHERS', attribute_group_name: 'Outros' },
      { id: 'PRODUCT_FEATURES', name: 'Características do produto', value_type: 'string', tags: { hidden: true }, hierarchy: 'ITEM', attribute_group_id: 'OTHERS', attribute_group_name: 'Outros' },
      { id: 'PACKAGE_HEIGHT', name: 'Altura da embalagem', value_type: 'number_unit', tags: { hidden: true }, allowed_units: [{ id: 'cm' }], attribute_group_id: 'OTHERS', attribute_group_name: 'Outros' },
      { id: 'GTIN', name: 'Código universal de produto', value_type: 'string', hierarchy: 'PRODUCT_IDENTIFIER', attribute_group_id: 'OTHERS', attribute_group_name: 'Outros' },
      { id: 'MAIN_COLOR', name: 'Cor principal', value_type: 'list', tags: { variation_attribute: true }, values: [{ id: '52049', name: 'Preto' }], attribute_group_id: 'OTHERS', attribute_group_name: 'Outros' }
    ],
    getDomainTechnicalSpecs: async () => ({
      output: {
        groups: [{
          id: 'OTHERS',
          label: 'Outros',
          components: [{ attributes: [{ id: 'HAT_AND_CAP_TYPE' }] }]
        }]
      }
    }),
    updateItem: async (itemId, payload) => {
      payloads.push({ itemId, payload });
      return { id: itemId };
    }
  };

  const snapshot = await characteristics.getCharacteristics(client, 'MLB1000000001');
  const byId = new Map(snapshot.fields.map((field) => [field.id, field]));
  const pendingIds = snapshot.fields.filter((field) => field.pending).map((field) => field.id).sort();

  assert.deepStrictEqual(pendingIds, ['COMPOSITION', 'IS_KIT', 'IS_REVERSIBLE', 'PRODUCT_DATA_SOURCE']);
  assert.strictEqual(snapshot.meta.pendingCount, 4);
  assert.strictEqual(byId.get('COMPOSITION').editable, true);
  assert.strictEqual(byId.get('COMPOSITION').multivalued, true);
  assert.strictEqual(byId.get('COMPOSITION').reason, null);
  assert.strictEqual(byId.get('IS_REVERSIBLE').editable, true);
  assert.strictEqual(byId.has('PRODUCT_FEATURES'), false);
  assert.strictEqual(byId.has('PACKAGE_HEIGHT'), false);
  assert.strictEqual(byId.has('GTIN'), false);
  assert.strictEqual(byId.has('MAIN_COLOR'), false);

  await characteristics.updateCharacteristics(client, 'MLB1000000001', {
    attributes: [
      { id: 'COMPOSITION', valueName: 'Poliéster, Algodão' },
      { id: 'IS_REVERSIBLE', valueId: '242085' }
    ]
  });

  assert.deepStrictEqual(payloads[0].payload.attributes, [
    { id: 'HAT_AND_CAP_TYPE', value_name: 'Chapéu fedora' },
    { id: 'COMPOSITION', values: [{ name: 'Poliéster' }, { name: 'Algodão' }] },
    { id: 'IS_REVERSIBLE', value_id: '242085' }
  ]);
});

test('caracteristicas permitem hidden publico e multivalor publico com contrato seguro', async () => {
  const payloads = [];
  const item = {
    id: 'MLB1000000001',
    seller_id: 123,
    category_id: 'MLB123',
    domain_id: 'MLB-TEST',
    catalog_listing: false,
    attributes: [
      { id: 'IS_KIT', name: 'É kit', value_id: '242084', value_name: 'Não' },
      {
        id: 'RECOMMENDED_USES',
        name: 'Usos recomendados',
        value_name: 'Casa,Jardim',
        values: [{ name: 'Casa' }, { name: 'Jardim' }]
      },
      { id: 'SELLER_SKU', name: 'SKU', value_name: 'ABC-1' }
    ]
  };
  const client = {
    getMe: async () => ({ id: 123 }),
    getItem: async () => item,
    getCategoryAttributes: async () => [
      { id: 'IS_KIT', name: 'É kit', value_type: 'boolean', tags: { hidden: true }, values: [{ id: '242084', name: 'Não' }, { id: '242085', name: 'Sim' }] },
      { id: 'RECOMMENDED_USES', name: 'Usos recomendados', value_type: 'string', tags: { multivalued: true } },
      { id: 'SELLER_SKU', name: 'SKU', value_type: 'string', tags: { hidden: true } }
    ],
    getDomainTechnicalSpecs: async () => ({
      output: {
        groups: [{
          id: 'OTHERS',
          label: 'Outros',
          components: [{ attributes: [{ id: 'IS_KIT' }, { id: 'RECOMMENDED_USES' }] }]
        }]
      }
    }),
    updateItem: async (itemId, payload) => {
      payloads.push({ itemId, payload });
      return { id: itemId };
    }
  };

  const snapshot = await characteristics.getCharacteristics(client, 'MLB1000000001');
  const byId = new Map(snapshot.fields.map((field) => [field.id, field]));

  assert.strictEqual(byId.get('IS_KIT').editable, true);
  assert.strictEqual(byId.get('IS_KIT').reason, null);
  assert.strictEqual(byId.get('RECOMMENDED_USES').editable, true);
  assert.strictEqual(byId.get('RECOMMENDED_USES').multivalued, true);
  assert.strictEqual(byId.get('SELLER_SKU').editable, false);
  assert.strictEqual(byId.get('SELLER_SKU').reason, 'hidden');

  await characteristics.updateCharacteristics(client, 'MLB1000000001', {
    attributes: [{ id: 'RECOMMENDED_USES', valueName: 'Casa, Jardim, Piscina' }]
  });

  const payloadAttribute = payloads[0].payload.attributes.find((attribute) => attribute.id === 'RECOMMENDED_USES');
  assert.deepStrictEqual(payloadAttribute, {
    id: 'RECOMMENDED_USES',
    values: [{ name: 'Casa' }, { name: 'Jardim' }, { name: 'Piscina' }]
  });
});

test('caracteristicas permitem dimensoes de embalagem ocultas quando o contrato permite', async () => {
  const payloads = [];
  const item = {
    id: 'MLB1000000001',
    seller_id: 123,
    category_id: 'MLB123',
    domain_id: 'MLB-TEST',
    catalog_listing: false,
    attributes: [
      { id: 'SELLER_PACKAGE_HEIGHT', name: 'Altura da embalagem do vendedor', value_name: '141 cm', value_struct: { number: 141, unit: 'cm' } },
      { id: 'SELLER_PACKAGE_LENGTH', name: 'Comprimento da embalagem do vendedor', value_name: '14 cm', value_struct: { number: 14, unit: 'cm' } },
      { id: 'SELLER_PACKAGE_WEIGHT', name: 'Peso da embalagem do vendedor', value_name: '4026 g', value_struct: { number: 4026, unit: 'g' } },
      { id: 'SELLER_PACKAGE_WIDTH', name: 'Largura da embalagem do vendedor', value_name: '16 cm', value_struct: { number: 16, unit: 'cm' } },
      { id: 'PACKAGE_HEIGHT', name: 'Altura da embalagem', value_name: '14.3 cm', value_struct: { number: 14.3, unit: 'cm' } },
      { id: 'PACKAGE_LENGTH', name: 'Comprimento da embalagem', value_name: '24.8 cm', value_struct: { number: 24.8, unit: 'cm' } },
      { id: 'PACKAGE_WEIGHT', name: 'Peso da embalagem', value_name: '4420 g', value_struct: { number: 4420, unit: 'g' } },
      { id: 'PACKAGE_WIDTH', name: 'Largura da embalagem', value_name: '26.5 cm', value_struct: { number: 26.5, unit: 'cm' } },
      { id: 'SHIPPING_PACKAGE', name: 'Embalagem do envio', value_name: 'Flyer' },
      { id: 'SELLER_SKU', name: 'SKU', value_name: 'ABC-1' }
    ]
  };
  const client = {
    getMe: async () => ({ id: 123 }),
    getItem: async () => item,
    getCategoryAttributes: async () => [
      { id: 'SELLER_PACKAGE_HEIGHT', name: 'Altura da embalagem do vendedor', value_type: 'number_unit', tags: { hidden: true }, allowed_units: [{ id: 'cm' }] },
      { id: 'SELLER_PACKAGE_LENGTH', name: 'Comprimento da embalagem do vendedor', value_type: 'number_unit', tags: { hidden: true }, allowed_units: [{ id: 'cm' }] },
      { id: 'SELLER_PACKAGE_WEIGHT', name: 'Peso da embalagem do vendedor', value_type: 'number_unit', tags: { hidden: true }, allowed_units: [{ id: 'g' }] },
      { id: 'SELLER_PACKAGE_WIDTH', name: 'Largura da embalagem do vendedor', value_type: 'number_unit', tags: { hidden: true }, allowed_units: [{ id: 'cm' }] },
      { id: 'PACKAGE_HEIGHT', name: 'Altura da embalagem', value_type: 'number_unit', tags: { hidden: true, read_only: true }, allowed_units: [{ id: 'cm' }] },
      { id: 'PACKAGE_LENGTH', name: 'Comprimento da embalagem', value_type: 'number_unit', tags: { hidden: true, read_only: true }, allowed_units: [{ id: 'cm' }] },
      { id: 'PACKAGE_WEIGHT', name: 'Peso da embalagem', value_type: 'number_unit', tags: { hidden: true, read_only: true }, allowed_units: [{ id: 'g' }] },
      { id: 'PACKAGE_WIDTH', name: 'Largura da embalagem', value_type: 'number_unit', tags: { hidden: true, read_only: true }, allowed_units: [{ id: 'cm' }] },
      { id: 'SHIPPING_PACKAGE', name: 'Embalagem do envio', value_type: 'string', tags: { hidden: true, read_only: true } },
      { id: 'SELLER_SKU', name: 'SKU', value_type: 'string', tags: { hidden: true } }
    ],
    getDomainTechnicalSpecs: async () => ({ output: { groups: [] } }),
    updateItem: async (itemId, payload) => {
      payloads.push({ itemId, payload });
      return { id: itemId };
    }
  };

  const snapshot = await characteristics.getCharacteristics(client, 'MLB1000000001');
  const byId = new Map(snapshot.fields.map((field) => [field.id, field]));
  const groupedIds = snapshot.groups.flatMap((group) => group.attributes.map((field) => field.id));
  const packageIds = snapshot.packageDimensions.fields.map((field) => field.id);

  assert.strictEqual(byId.get('SELLER_PACKAGE_HEIGHT').editable, true);
  assert.strictEqual(byId.get('SELLER_PACKAGE_LENGTH').editable, true);
  assert.strictEqual(byId.get('SELLER_PACKAGE_WEIGHT').editable, true);
  assert.strictEqual(byId.get('SELLER_PACKAGE_WIDTH').editable, true);
  assert.strictEqual(byId.get('SELLER_SKU').editable, false);
  assert.strictEqual(byId.get('SELLER_SKU').reason, 'hidden');
  assert.strictEqual(snapshot.packageDimensions.available, true);
  assert.deepStrictEqual(packageIds, [
    'SELLER_PACKAGE_HEIGHT',
    'SELLER_PACKAGE_WIDTH',
    'SELLER_PACKAGE_LENGTH',
    'SELLER_PACKAGE_WEIGHT'
  ]);
  assert.strictEqual(groupedIds.includes('SELLER_PACKAGE_HEIGHT'), false);
  assert.strictEqual(groupedIds.includes('SELLER_PACKAGE_LENGTH'), false);
  assert.strictEqual(groupedIds.includes('SELLER_PACKAGE_WEIGHT'), false);
  assert.strictEqual(groupedIds.includes('SELLER_PACKAGE_WIDTH'), false);
  assert.strictEqual(groupedIds.includes('PACKAGE_HEIGHT'), false);
  assert.strictEqual(groupedIds.includes('PACKAGE_LENGTH'), false);
  assert.strictEqual(groupedIds.includes('PACKAGE_WEIGHT'), false);
  assert.strictEqual(groupedIds.includes('PACKAGE_WIDTH'), false);
  assert.strictEqual(groupedIds.includes('SHIPPING_PACKAGE'), false);
  assert.strictEqual(byId.has('PACKAGE_HEIGHT'), false);
  assert.strictEqual(byId.has('SHIPPING_PACKAGE'), false);
  assert.strictEqual(groupedIds.includes('SELLER_SKU'), true);

  await characteristics.updateCharacteristics(client, 'MLB1000000001', {
    attributes: [
      { id: 'SELLER_PACKAGE_WEIGHT', number: '4030', unit: 'g' }
    ]
  });

  const payloadAttribute = payloads[0].payload.attributes.find((attribute) => attribute.id === 'SELLER_PACKAGE_WEIGHT');
  assert.deepStrictEqual(payloadAttribute, {
    id: 'SELLER_PACKAGE_WEIGHT',
    value_name: '4030 g'
  });
});

test('caracteristicas atualizam atributos preservando payload existente', async () => {
  const payloads = [];
  const item = {
    id: 'MLB1000000001',
    seller_id: 123,
    category_id: 'MLB123',
    domain_id: 'MLB-TEST',
    catalog_listing: false,
    attributes: [
      { id: 'BRAND', name: 'Marca', value_name: 'Bogu Store' },
      { id: 'WIDTH', name: 'Largura', value_name: '2,7 m', value_struct: { number: 2.7, unit: 'm' } },
      { id: 'SELLER_SKU', name: 'SKU', value_name: 'ABC-1' }
    ]
  };
  const client = {
    getMe: async () => ({ id: 123 }),
    getItem: async () => item,
    getCategoryAttributes: async () => [
      { id: 'BRAND', name: 'Marca', value_type: 'string', tags: { hierarchy: 'PARENT_PK' } },
      { id: 'WIDTH', name: 'Largura', value_type: 'number_unit', allowed_units: [{ id: 'm' }, { id: 'cm' }], default_unit: 'm' },
      { id: 'SELLER_SKU', name: 'SKU', value_type: 'string', tags: { hidden: true } }
    ],
    getDomainTechnicalSpecs: async () => ({
      output: {
        groups: [{
          id: 'DIMENSIONS',
          label: 'Dimensões',
          components: [{ attributes: [{ id: 'WIDTH' }] }]
        }]
      }
    }),
    updateItem: async (itemId, payload) => {
      payloads.push({ itemId, payload });
      return { id: itemId };
    }
  };

  const result = await characteristics.updateCharacteristics(client, 'MLB1000000001', {
    attributes: [{ id: 'WIDTH', number: '3,5', unit: 'm' }]
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(payloads[0].itemId, 'MLB1000000001');
  assert.deepStrictEqual(payloads[0].payload.attributes, [
    { id: 'BRAND', value_name: 'Bogu Store' },
    { id: 'WIDTH', value_name: '3.5 m' },
    { id: 'SELLER_SKU', value_name: 'ABC-1' }
  ]);
});

test('caracteristicas em massa reportam falhas parciais por variacao', async () => {
  const updated = [];
  const items = {
    MLB1000000001: {
      id: 'MLB1000000001',
      title: 'Azul',
      seller_id: 123,
      site_id: 'MLB',
      family_name: 'Guarda-sol',
      family_id: 'FAMILY1',
      user_product_id: 'MLBU100000001',
      status: 'active',
      category_id: 'MLB123',
      domain_id: 'MLB-TEST',
      attributes: [{ id: 'WIDTH', name: 'Largura', value_name: '2 m', value_struct: { number: 2, unit: 'm' } }]
    },
    MLB1000000002: {
      id: 'MLB1000000002',
      title: 'Verde',
      seller_id: 123,
      site_id: 'MLB',
      family_name: 'Guarda-sol',
      family_id: 'FAMILY1',
      user_product_id: 'MLBU100000002',
      status: 'active',
      category_id: 'MLB123',
      domain_id: 'MLB-TEST',
      attributes: [{ id: 'WIDTH', name: 'Largura', value_name: '2 m', value_struct: { number: 2, unit: 'm' } }]
    }
  };
  const client = {
    getMe: async () => ({ id: 123 }),
    getItem: async (itemId) => items[itemId],
    getUserProduct: async (userProductId) => ({ id: userProductId, family_id: 'FAMILY1' }),
    getUserProductFamily: async () => ({
      user_products: [
        { id: 'MLBU100000001' },
        { id: 'MLBU100000002' }
      ]
    }),
    searchItemsByUserProduct: async () => ({ results: Object.keys(items) }),
    getCategoryAttributes: async () => [
      { id: 'WIDTH', name: 'Largura', value_type: 'number_unit', allowed_units: [{ id: 'm' }], default_unit: 'm' }
    ],
    getDomainTechnicalSpecs: async () => ({
      output: { groups: [{ id: 'DIMENSIONS', label: 'Dimensões', components: [{ attributes: [{ id: 'WIDTH' }] }] }] }
    }),
    updateItem: async (itemId, payload) => {
      if (itemId === 'MLB1000000002') {
        const err = new Error('Validation error');
        err.statusCode = 400;
        throw err;
      }
      updated.push({ itemId, payload });
      return { id: itemId };
    }
  };

  const result = await characteristics.updateCharacteristicsFamily(client, 'MLB1000000001', {
    scope: 'user_product_family',
    attributes: [{ id: 'WIDTH', number: '3', unit: 'm' }]
  });

  assert.strictEqual(result.action, 'characteristics.update');
  assert.deepStrictEqual(result.counts, {
    total: 2,
    eligible: 1,
    blocked: 0,
    applied: 1,
    skipped: 0,
    failed: 1
  });
  assert.strictEqual(updated.length, 1);
  assert.strictEqual(result.targets[1].status, 'failed');
});

test('shared toUserError nao registra log tecnico sem debug explicito', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'shared.js'), 'utf8');
  const warnings = [];
  const sandbox = {
    console: {
      warn(...args) {
        warnings.push(args);
      }
    },
    localStorage: {
      getItem() {
        return '0';
      }
    }
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(source, sandbox);
  const err = new Error('Mensagem simples.');
  err.technicalError = 'Detalhe tecnico.';

  assert.strictEqual(sandbox.OnFrameShared.toUserError(err, { logPrefix: '[OnFrame]' }), 'Mensagem simples.');
  assert.deepStrictEqual(warnings, []);

  sandbox.localStorage.getItem = () => '1';
  sandbox.OnFrameShared.toUserError(err, { logPrefix: '[OnFrame]' });
  assert.strictEqual(warnings.length, 1);
});

test('token crypto roundtrip e sanitizacao nao vazam tokens', () => {
  const key = Buffer.alloc(32, 7);
  const encrypted = encrypt(JSON.stringify({ access_token: 'APP_USR-abc', refresh_token: 'TG-def' }), key);
  assert.deepStrictEqual(JSON.parse(decrypt(encrypted, key)), {
    access_token: 'APP_USR-abc',
    refresh_token: 'TG-def'
  });
  assert.strictEqual(
    sanitizeError(new Error('falhou APP_USR-abc-123 e TG-def-456')),
    'falhou [REDACTED] e [REDACTED]'
  );
});

test('token store salva multiplas contas e escolhe conta ativa', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onframe-tokens-'));
  const store = new TokenStore({
    env: {
      ML_TOKEN_STORE_PATH: path.join(dir, 'tokens.json'),
      ONBLIDE_TOKEN_SECRET: 'secret-test'
    }
  });

  await store.write({
    access_token: 'APP_USR-1',
    refresh_token: 'TG-1',
    user_id: 101,
    expires_at: 1000
  }, {
    nickname: 'LOJA 1',
    site_id: 'MLB'
  });
  await store.write({
    access_token: 'APP_USR-2',
    refresh_token: 'TG-2',
    user_id: 202,
    expires_at: 2000
  }, {
    nickname: 'LOJA 2',
    site_id: 'MLB'
  });

  assert.strictEqual((await store.read()).user_id, 202);
  assert.deepStrictEqual((await store.listAccounts()).map((account) => [account.user_id, account.nickname, account.active, account.enabled]), [
    [101, 'LOJA 1', false, true],
    [202, 'LOJA 2', true, true]
  ]);
  assert.deepStrictEqual((await store.listAccountTokens()).map((account) => [account.user_id, account.refresh_token, account.active, account.enabled]), [
    [101, 'TG-1', false, true],
    [202, 'TG-2', true, true]
  ]);
  assert.strictEqual((await store.readAccount(101)).nickname, 'LOJA 1');

  await store.setAccountEnabled(202, false);
  assert.strictEqual((await store.readAccount(202)).enabled, false);
  assert.strictEqual((await store.listAccounts()).find((account) => account.user_id === 202).enabled, false);

  await store.setActive(101);
  assert.strictEqual((await store.read()).refresh_token, 'TG-1');
  await store.clear();
  assert.strictEqual((await store.read()).user_id, 202);
});

test('token store trata token legado como desconectado', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onframe-legacy-token-'));
  const filePath = path.join(dir, 'tokens.json');
  const key = cryptoKeyForTest('secret-test');
  const legacy = encrypt(JSON.stringify({ access_token: 'APP_USR-old', refresh_token: 'TG-old', user_id: 1 }), key);
  fs.writeFileSync(filePath, JSON.stringify(legacy));

  const store = new TokenStore({
    env: {
      ML_TOKEN_STORE_PATH: filePath,
      ONBLIDE_TOKEN_SECRET: 'secret-test'
    }
  });
  assert.strictEqual(await store.read(), null);
  assert.deepStrictEqual(await store.listAccounts(), []);
});

test('token store migra criptografia do segredo local antigo para segredo forte', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onframe-token-migration-'));
  const filePath = path.join(dir, 'tokens.json');
  const fallbackStore = new TokenStore({
    env: {
      ML_TOKEN_STORE_PATH: filePath
    }
  });
  await fallbackStore.write({
    access_token: 'APP_USR-old',
    refresh_token: 'TG-old',
    user_id: 123,
    expires_at: 1000
  }, {
    nickname: 'BOGU STORE'
  });

  const secureStore = new TokenStore({
    env: {
      ML_TOKEN_STORE_PATH: filePath,
      ONBLIDE_TOKEN_SECRET: 'strong-local-secret'
    }
  });
  const token = await secureStore.read();
  assert.strictEqual(token.refresh_token, 'TG-old');
  assert.strictEqual(secureStore.getSecurityState().mode, 'configured');

  const encrypted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const decrypted = JSON.parse(decrypt(encrypted, cryptoKeyForTest('strong-local-secret')));
  assert.strictEqual(decrypted.accounts['123'].refresh_token, 'TG-old');
});

test('mercado livre client usa Onblide Connect para token e refresh', async () => {
  const writes = [];
  const requests = [];
  const store = {
    write: async (token, account) => writes.push({ token, account })
  };
  const client = new MercadoLivreClient({
    env: { ONBLIDE_CONNECT_BASE_URL: 'https://connect.test' },
    store,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          access_token: url.endsWith('/refresh') ? 'APP_USR-refresh' : 'APP_USR-code',
          refresh_token: url.endsWith('/refresh') ? 'TG-refresh' : 'TG-code',
          user_id: 123,
          expires_in: 21600
        })
      };
    }
  });

  const token = await client.exchangeAuthorizationCode({
    code: 'code',
    redirectUri: 'https://connect.onblide.com/api/mercadolivre/callback',
    codeVerifier: 'verifier',
    brokerState: 'state'
  });
  const refreshed = await client.refreshToken(token);

  assert.strictEqual(requests[0].url, 'https://connect.test/api/mercadolivre/token');
  assert.deepStrictEqual(JSON.parse(requests[0].options.body), {
    code: 'code',
    redirectUri: 'https://connect.onblide.com/api/mercadolivre/callback',
    codeVerifier: 'verifier',
    brokerState: 'state'
  });
  assert.strictEqual(requests[1].url, 'https://connect.test/api/mercadolivre/refresh');
  assert.deepStrictEqual(JSON.parse(requests[1].options.body), { refreshToken: 'TG-code' });
  assert.strictEqual(refreshed.access_token, 'APP_USR-refresh');
  assert.strictEqual(writes.length, 2);
  assert.strictEqual(writes[1].token.refresh_token, 'TG-refresh');
  assert.strictEqual(writes[1].account.user_id, 123);
});

test('mercado livre client bloqueia download de imagem fora do mlstatic', async () => {
  const client = new MercadoLivreClient({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => Buffer.from('jpg')
    })
  });

  const image = await client.downloadImage('https://http2.mlstatic.com/D_NQ_NP_2X_TEST-F.webp');
  assert.strictEqual(image.mimeType, 'image/jpeg');
  assert.strictEqual(image.base64, Buffer.from('jpg').toString('base64'));
  await assert.rejects(
    () => client.downloadImage('https://example.com/picture.jpg'),
    /Host de imagem nao permitido/
  );
});

test('userFriendlyError traduz erros comuns para linguagem natural', () => {
  const unauthorized = new Error('Mercado Livre nao autenticado.');
  unauthorized.statusCode = 401;
  assert.match(userFriendlyError(unauthorized), /Conta desconectada/i);

  const forbidden = new Error('Este anuncio nao pertence ao seller autenticado.');
  forbidden.statusCode = 403;
  assert.match(userFriendlyError(forbidden), /Conta errada/i);

  const localService = new Error('connect ECONNREFUSED 127.0.0.1:4765');
  assert.match(userFriendlyError(localService), /Serviço local desligado/i);

  const catalog = new Error('catalog_listing_pictures_read_only');
  catalog.statusCode = 409;
  assert.match(userFriendlyError(catalog), /Catálogo/i);

  const catalogDescription = new Error('catalog_listing_description_read_only');
  catalogDescription.statusCode = 409;
  assert.match(userFriendlyError(catalogDescription), /descrição bloqueada/i);

  const catalogCharacteristics = new Error('catalog_listing_characteristics_read_only');
  catalogCharacteristics.statusCode = 409;
  assert.match(userFriendlyError(catalogCharacteristics), /características bloqueadas/i);

  const noBulkDescriptionTargets = new Error('bulk_description_no_editable_variations');
  noBulkDescriptionTargets.statusCode = 409;
  assert.match(userFriendlyError(noBulkDescriptionTargets), /Não há variações editáveis/i);

  const closedWithBids = new Error('Cannot update item MLB5770062148 [status:closed, has_bids:true]');
  closedWithBids.statusCode = 400;
  assert.match(userFriendlyError(closedWithBids), /Anúncio encerrado/i);

  const closedWithoutBids = new Error('Cannot update item MLB5770062148 [status:closed, has_bids:false]');
  closedWithoutBids.statusCode = 400;
  assert.match(userFriendlyError(closedWithoutBids), /Reative antes de editar/i);

  const automation = new Error('pricing_automation_active');
  automation.statusCode = 409;
  assert.match(userFriendlyError(automation), /Preço automático ativo/i);

  const missingStock = new Error('promotion_missing_stock');
  missingStock.statusCode = 400;
  assert.match(userFriendlyError(missingStock), /estoque reservado/i);

  const discountRule = new Error('error_credibility discounted_price');
  discountRule.body = {
    cause: [{
      min_discounted_price: 80,
      max_discounted_price: 120,
      suggested_discounted_price: 99
    }]
  };
  assert.match(userFriendlyError(discountRule), /Permitido: R\$ 80,00 a R\$ 120,00/i);
  assert.match(userFriendlyError(discountRule), /Sugerido: R\$ 99,00/i);

  const discountRuleWithoutRange = new Error('error_credibility discounted_price');
  assert.match(userFriendlyError(discountRuleWithoutRange), /Atualize as promoções/i);
  assert.doesNotMatch(userFriendlyError(discountRuleWithoutRange), /faixa exibida/i);
});

test('service separa rotas de item e fotos do servidor HTTP', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'service', 'src', 'app.js'), 'utf8');
  const itemsRoute = require('../service/src/routes/items');
  const picturesRoute = require('../service/src/routes/pictures');
  const pricingRoute = require('../service/src/routes/pricing');
  const promotionsRoute = require('../service/src/routes/promotions');
  const bulkRoute = require('../service/src/routes/bulk');
  const descriptionsRoute = require('../service/src/routes/descriptions');
  const characteristicsRoute = require('../service/src/routes/characteristics');
  const itemContext = require('../service/src/item-context');

  assert.strictEqual(typeof itemsRoute.handleResolve, 'function');
  assert.strictEqual(typeof picturesRoute.handlePictureCommit, 'function');
  assert.strictEqual(typeof picturesRoute.handlePictureQuality, 'function');
  assert.strictEqual(typeof pricingRoute.handlePriceSummary, 'function');
  assert.strictEqual(typeof pricingRoute.handleStandardPriceUpdate, 'function');
  assert.strictEqual(typeof promotionsRoute.handlePromotionSummary, 'function');
  assert.strictEqual(typeof promotionsRoute.handleCreateOffer, 'function');
  assert.strictEqual(typeof bulkRoute.handleBulkPreview, 'function');
  assert.strictEqual(typeof bulkRoute.handleBulkCommit, 'function');
  assert.strictEqual(typeof descriptionsRoute.handleDescriptionGet, 'function');
  assert.strictEqual(typeof descriptionsRoute.handleDescriptionUpdate, 'function');
  assert.strictEqual(typeof descriptionsRoute.handleDescriptionBulkUpdate, 'function');
  assert.strictEqual(typeof characteristicsRoute.handleCharacteristicsGet, 'function');
  assert.strictEqual(typeof characteristicsRoute.handleCharacteristicsUpdate, 'function');
  assert.strictEqual(typeof characteristicsRoute.handleCharacteristicsBulkUpdate, 'function');
  assert.strictEqual(typeof itemContext.resolveItemContext, 'function');
  assert.strictEqual(appSource.includes('async function handlePictureCommit'), false);
  assert.strictEqual(appSource.includes('async function resolveItemContext'), false);
});

test('service mantem exports publicos enxutos', () => {
  const meliClient = require('../service/src/meli-client');
  const pricing = require('../service/src/pricing');
  const promotions = require('../service/src/promotions');
  const descriptions = require('../service/src/descriptions');
  const characteristics = require('../service/src/characteristics');
  const pictureQuality = require('../service/src/picture-quality');
  const updateManagerModule = require('../service/src/update-manager');
  const itemContextSource = fs.readFileSync(path.join(__dirname, '..', 'service', 'src', 'item-context.js'), 'utf8');

  assert.deepStrictEqual(Object.keys(meliClient).sort(), ['MercadoLivreClient']);
  assert.deepStrictEqual(Object.keys(pricing).sort(), ['buildCostProjection', 'buildPriceSummary', 'previewStandardPriceUpdate', 'updateStandardPrice']);
  assert.deepStrictEqual(Object.keys(promotions).sort(), [
    'buildPromotionSummary',
    'createCampaign',
    'createOffer',
    'deleteCampaign',
    'deleteOffer',
    'estimatePromotionImpact',
    'listCampaigns',
    'previewOfferAction',
    'updateCampaign',
    'updateOffer'
  ]);
  assert.deepStrictEqual(Object.keys(descriptions).sort(), [
    'getDescription',
    'normalizePlainText',
    'updateDescriptionFamily',
    'upsertDescription'
  ]);
  assert.deepStrictEqual(Object.keys(characteristics).sort(), [
    'buildCharacteristicsSnapshot',
    'getCharacteristics',
    'mergeAttributes',
    'normalizeAttributeUpdates',
    'updateCharacteristics',
    'updateCharacteristicsFamily'
  ]);
  assert.deepStrictEqual(Object.keys(pictureQuality).sort(), [
    'OFFICIAL_TARGET_SIZE',
    'buildPictureQualityReport',
    'buildResolutionSummary',
    'calculateOptimizedDimensions',
    'calculateResolutionScore',
    'downloadBestPictureImage',
    'extractImageDimensions',
    'extractImageDimensionsFromBase64',
    'extractOfficialDimensions'
  ]);
  assert.deepStrictEqual(Object.keys(updateManagerModule).sort(), [
    'buildBootstrapCommand',
    'compareVersions',
    'createUpdateManager',
    'tagToVersion'
  ]);
  assert.strictEqual(itemContextSource.includes('legacyWeakItems'), false);
  assert.strictEqual(itemContextSource.includes('legacyWeakUserProducts'), false);
});

test('service expoe status de atualizacao auditavel', async (t) => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'service', 'src', 'app.js'), 'utf8');
  const fakeUpdateManager = {
    getOpenPageData: () => ({
      protocolUrl: 'onframe-updater://update',
      canOpenUpdater: true,
      updateCommand: 'update-command',
      checkCommand: 'check-command'
    }),
    getStatus: async () => ({ ok: true, updateAvailable: false })
  };
  const server = await listen(createApp({ updateManager: fakeUpdateManager }));
  t.after(() => server.close());

  assert.strictEqual(appSource.includes('/updates/status'), true);
  assert.strictEqual(appSource.includes('/updates/open'), true);
  assert.strictEqual(appSource.includes('/updates/start'), false);
  assert.strictEqual(fs.existsSync(path.join(__dirname, '..', 'service', 'src', 'update-manager.js')), true);

  const status = await fetch(`${server.url}/updates/status`);
  assert.strictEqual(status.status, 200);
  assert.deepStrictEqual(await status.json(), { ok: true, updateAvailable: false });

  const page = await fetch(`${server.url}/updates/open`);
  const html = await page.text();
  assert.strictEqual(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(html, /onframe-updater:\/\/update/);
  assert.match(html, /update-command/);
  assert.match(html, /check-command/);
  assert.doesNotMatch(html, /\/updates\/start/);
});

test('service restringe origem web e aceita origem da extensao', async (t) => {
  const origin = 'chrome-extension://lcmagfimconmglpokmlkcjieohohnigj';
  const server = await listen(createApp({
    store: { read: async () => null }
  }));
  t.after(() => server.close());

  const blocked = await fetch(`${server.url}/auth/status`, {
    headers: { origin: 'https://evil.example' }
  });
  const blockedBody = await blocked.json();
  assert.strictEqual(blocked.status, 403);
  assert.strictEqual(blockedBody.code, 'origin_not_allowed');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(blockedBody, 'technicalError'), false);

  const allowed = await fetch(`${server.url}/auth/status`, {
    headers: { origin }
  });
  assert.strictEqual(allowed.status, 200);
  assert.strictEqual(allowed.headers.get('access-control-allow-origin'), origin);
  assert.deepStrictEqual(await allowed.json(), {
    authenticated: false,
    userId: null,
    expiresAt: null
  });
});

test('service retorna erros sanitizados com requestId e sem technicalError', async (t) => {
  const server = await listen(createApp({
    store: { read: async () => null }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/nao-existe`);
  const body = await response.json();
  assert.strictEqual(response.status, 404);
  assert.strictEqual(body.code, 'endpoint_not_found');
  assert.ok(body.requestId);
  assert.strictEqual(response.headers.get('x-onframe-request-id'), body.requestId);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(body, 'technicalError'), false);
});

test('update manager compara versoes semver e extrai tags', () => {
  assert.match(
    updateManager.buildBootstrapCommand({ root: 'C:\\OnFrame', scriptUrl: 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.ps1' }),
    /^\$env:ONFRAME_HOME='C:\\OnFrame'; iwr -useb 'https:\/\/raw\.githubusercontent\.com\/eusilvamateus\/onframe\/main\/scripts\/bootstrap\/update\.ps1' \| iex$/
  );
  assert.strictEqual(updateManager.tagToVersion('v0.3.2'), '0.3.2');
  assert.strictEqual(updateManager.tagToVersion('0.3.2-preview.1'), '0.3.2-preview.1');
  assert.strictEqual(updateManager.compareVersions('0.3.2', '0.3.1'), 1);
  assert.strictEqual(updateManager.compareVersions('0.3.2-preview.1', '0.3.2'), -1);
  assert.strictEqual(updateManager.compareVersions('0.3.2-preview.2', '0.3.2-preview.1'), 1);
});

test('update manager usa stable ou preview conforme canal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onframe-update-'));
  const fetchImpl = async () => ({
    ok: true,
    text: async () => JSON.stringify([
      release('v0.3.3-preview.1', true),
      release('v0.3.2', false)
    ])
  });

  const stable = updateManager.createUpdateManager({
    root,
    currentVersion: '0.3.1',
    env: { ONFRAME_UPDATE_CHANNEL: 'stable' },
    fetchImpl
  });
  const preview = updateManager.createUpdateManager({
    root,
    currentVersion: '0.3.1',
    env: { ONFRAME_UPDATE_CHANNEL: 'preview' },
    fetchImpl
  });

  assert.strictEqual((await stable.getStatus({ force: true })).latestVersion, '0.3.2');
  assert.strictEqual((await preview.getStatus({ force: true })).latestVersion, '0.3.3-preview.1');
});

test('update manager retorna comando quando existe versao nova', async () => {
  const root = 'C:\\Users\\Mateus\\onframe';
  const fetchImpl = async () => ({
    ok: true,
    text: async () => JSON.stringify([release('v0.3.2', false)])
  });
  const manager = updateManager.createUpdateManager({
    root,
    currentVersion: '0.3.1',
    env: {},
    fetchImpl
  });

  const status = await manager.getStatus({ force: true });
  assert.strictEqual(status.updateAvailable, true);
  assert.strictEqual(status.canUpdate, true);
  assert.strictEqual(status.reason, 'copy_command');
  assert.strictEqual(status.protocolUrl, 'onframe-updater://update');
  assert.match(status.updatePageUrl, /^http:\/\/127\.0\.0\.1:4765\/updates\/open$/);
  assert.strictEqual(typeof status.canOpenUpdater, 'boolean');
  assert.match(status.updateCommand, /ONFRAME_HOME='C:\\Users\\Mateus\\onframe'/);
  assert.match(status.updateCommand, /scripts\/bootstrap\/update\.ps1/);
  assert.match(status.checkCommand, /ONFRAME_HOME='C:\\Users\\Mateus\\onframe'/);
  assert.match(status.checkCommand, /scripts\/bootstrap\/check\.ps1/);
});

test('release package nao inclui env nem estado gerenciado', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'release', 'package-release.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));

  assert.match(source, /`onframe-v\$\{version\}`/);
  assert.match(source, /`onframe-v\$\{version\}\.zip`/);
  assert.strictEqual(source.includes('onframe-release-v${version}'), false);
  assert.strictEqual(packageLock.version, packageJson.version);
  assert.strictEqual(packageLock.packages[''].version, packageJson.version);
  assert.match(source, /'\.env\.example'/);
  assert.match(source, /'docs'/);
  assert.strictEqual(source.includes("'.env'"), false);
  assert.strictEqual(source.includes('install.json'), false);
  assert.strictEqual(source.includes('.bat'), false);
});

test('release notes usam capa publica e apenas a secao da versao', () => {
  const releaseNotes = require('../scripts/release/prepare-release-notes');
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
  const changelog = [
    '# Changelog',
    '',
    '## v0.3.2 - 2026-07-26',
    '',
    '### Corrigido',
    '',
    '- Workflow corrigido.',
    '',
    '## v0.3.1 - 2026-07-26',
    '',
    '### Corrigido',
    '',
    '- Texto antigo.'
  ].join('\n');

  const notes = releaseNotes.buildReleaseNotes({
    tag: 'v0.3.2',
    previousTag: 'v0.3.1',
    repoUrl: 'https://github.test/onframe',
    changelog
  });

  assert.match(notes, /^# OnFrame v0\.3\.2/);
  assert.match(notes, /- Version: `v0\.3\.2`/);
  assert.match(notes, /- Previous release: \[`v0\.3\.1`\]\(https:\/\/github\.test\/onframe\/releases\/tag\/v0\.3\.1\)/);
  assert.match(notes, /- Compare: \[`v0\.3\.1\.\.\.v0\.3\.2`\]\(https:\/\/github\.test\/onframe\/compare\/v0\.3\.1\.\.\.v0\.3\.2\)/);
  assert.match(notes, /Workflow corrigido/);
  assert.doesNotMatch(notes, /Texto antigo/);
  assert.doesNotMatch(notes, /^## v0\.3\.2/m);
  assert.strictEqual(workflow.includes('fetch-depth: 0'), true);
  assert.strictEqual(workflow.includes('scripts/release/prepare-release-notes.js'), true);
  assert.strictEqual(workflow.includes('--notes-file CHANGELOG.md'), false);
  assert.strictEqual(workflow.includes('--title "OnFrame'), false);
});

test('bootstrap substitui atalhos bat legados', () => {
  const root = path.join(__dirname, '..');
  const installScript = fs.readFileSync(path.join(root, 'scripts', 'bootstrap', 'install.ps1'), 'utf8');
  const startScript = fs.readFileSync(path.join(root, 'scripts', 'bootstrap', 'start.ps1'), 'utf8');
  const updateScript = fs.readFileSync(path.join(root, 'scripts', 'bootstrap', 'update.ps1'), 'utf8');
  const uninstallScript = fs.readFileSync(path.join(root, 'scripts', 'bootstrap', 'uninstall.ps1'), 'utf8');
  const protocolScript = fs.readFileSync(path.join(root, 'scripts', 'bootstrap', 'onframe-updater.ps1'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const visualBootstrapScripts = [installScript, updateScript, uninstallScript];

  assert.strictEqual(fs.existsSync(path.join(root, 'onframe-start.bat')), false);
  assert.strictEqual(fs.existsSync(path.join(root, 'onframe-stop.bat')), false);
  assert.strictEqual(fs.existsSync(path.join(root, 'onframe-doctor.bat')), false);
  assert.strictEqual(fs.existsSync(path.join(root, 'onframe-update.bat')), false);
  assert.deepStrictEqual(
    fs.existsSync(path.join(root, 'scripts', 'windows'))
      ? fs.readdirSync(path.join(root, 'scripts', 'windows')).filter((entry) => entry !== '.gitkeep')
      : [],
    []
  );
  assert.strictEqual(updateScript.includes('.bat'), false);
  assert.strictEqual(updateScript.includes('Start-OnFrameService'), true);
  assert.strictEqual(startScript.includes('RandomNumberGenerator]::Fill'), false);
  assert.strictEqual(updateScript.includes('RandomNumberGenerator]::Fill'), false);
  assert.strictEqual(startScript.includes('RandomNumberGenerator]::Create()'), true);
  assert.strictEqual(updateScript.includes('RandomNumberGenerator]::Create()'), true);
  assert.strictEqual(updateScript.includes('powershell -NoProfile -ExecutionPolicy Bypass -File $startScript'), false);
  assert.strictEqual(updateScript.includes("Join-Path $env:LOCALAPPDATA 'OnFrame'"), true);
  assert.strictEqual(updateScript.includes('(Get-Location).Path'), false);
  for (const script of visualBootstrapScripts) {
    assert.strictEqual(script.includes('function Write-OnFrameHeader'), true);
    assert.strictEqual(script.includes('function Write-OnFrameSection'), true);
    assert.strictEqual(script.includes('function Write-OnFrameStep'), true);
    assert.strictEqual(script.includes('function Write-OnFrameSubStep'), true);
    assert.strictEqual(script.includes('function Write-OnFrameSuccess'), true);
    assert.strictEqual(script.includes('function Write-OnFrameFailure'), true);
    assert.strictEqual(script.includes('Onblide local toolkit'), true);
    assert.strictEqual(script.includes('Chrome: chrome://extensions/'), true);
    assert.strictEqual(script.includes('Edge: edge://extensions/'), true);
    assert.strictEqual(script.includes('Clear-Host'), false);
    assert.strictEqual(script.includes('function Write-Step'), false);
  }
  assert.strictEqual(installScript.includes('^onframe-v?\\d+\\.\\d+\\.\\d+.*\\.zip$'), true);
  assert.strictEqual(installScript.includes('^onframe-release-v?\\d+\\.\\d+\\.\\d+.*\\.zip$'), true);
  assert.strictEqual(updateScript.includes('^onframe-v?\\d+\\.\\d+\\.\\d+.*\\.zip$'), true);
  assert.strictEqual(updateScript.includes('^onframe-release-v?\\d+\\.\\d+\\.\\d+.*\\.zip$'), true);
  assert.strictEqual(fs.existsSync(path.join(root, 'scripts', 'bootstrap', 'register-updater-protocol.ps1')), true);
  assert.strictEqual(fs.existsSync(path.join(root, 'scripts', 'bootstrap', 'unregister-updater-protocol.ps1')), true);
  assert.strictEqual(fs.existsSync(path.join(root, 'scripts', 'bootstrap', 'onframe-updater.ps1')), true);
  assert.strictEqual(installScript.includes('register-updater-protocol.ps1'), true);
  assert.strictEqual(updateScript.includes('register-updater-protocol.ps1'), true);
  assert.strictEqual(uninstallScript.includes('onframe-updater'), true);
  assert.strictEqual(protocolScript.includes('onframe-updater://update'), true);
  assert.strictEqual(protocolScript.includes('Acao de atualizacao nao suportada'), true);
  assert.strictEqual(protocolScript.includes('raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.ps1'), true);
  assert.strictEqual(packageJson.scripts.check.includes('scripts/bootstrap/check.ps1'), true);
  assert.strictEqual(JSON.stringify(packageJson.scripts).includes('doctor'), false);
});

function release(tag, prerelease) {
  return {
    tag_name: tag,
    html_url: `https://github.test/release/${tag}`,
    draft: false,
    prerelease,
    assets: [{
      name: `onframe-${tag}.zip`,
      browser_download_url: `https://github.test/download/${tag}.zip`
    }]
  };
}

function cryptoKeyForTest(secret) {
  return crypto.scryptSync(secret, 'onblide-ml-token-store-v1', 32);
}

test('dotenv parseValue remove aspas simples ou duplas', () => {
  assert.strictEqual(parseValue('"abc"'), 'abc');
  assert.strictEqual(parseValue("'abc'"), 'abc');
  assert.strictEqual(parseValue('abc'), 'abc');
});

test('auth account retorna desconectado sem token salvo', async (t) => {
  const server = await listen(createApp({
    store: { read: async () => null },
    client: { getMe: async () => { throw new Error('getMe nao deveria ser chamado'); } }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/auth/account`);
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), {
    authenticated: false,
    userId: null,
    expiresAt: null,
    account: null
  });
});

test('auth start e callback usam brokerState do Onblide Connect', async (t) => {
  const oldFetch = global.fetch;
  let startPayload = null;
  const exchanges = [];
  const writes = [];
  global.fetch = async (url, options) => {
    assert.strictEqual(url, 'https://connect.test/api/mercadolivre/start');
    startPayload = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        authUrl: 'https://auth.mercadolibre.com.br/authorization',
        redirectUri: 'https://connect.onblide.com/api/mercadolivre/callback',
        brokerState: 'broker-state',
        expiresIn: 600
      })
    };
  };
  t.after(() => { global.fetch = oldFetch; });

  const client = {
    store: {
      write: async (token, account) => writes.push({ token, account })
    },
    exchangeAuthorizationCode: async (payload) => {
      exchanges.push(payload);
      return {
        access_token: 'APP_USR-token',
        refresh_token: 'TG-token',
        user_id: 123,
        expires_at: Date.now() + 3600000
      };
    },
    getMe: async () => ({
      id: 123,
      nickname: 'BOGU STORE',
      site_id: 'MLB'
    })
  };
  const server = await listen(createApp({
    env: {
      ML_SERVICE_PORT: '4765',
      ONBLIDE_CONNECT_BASE_URL: 'https://connect.test'
    },
    store: { read: async () => null },
    client
  }));
  t.after(() => server.close());

  const start = await oldFetch(`${server.url}/auth/start`, { method: 'POST', body: '{}' });
  assert.strictEqual(start.status, 200);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(startPayload, 'clientId'), false);
  assert.strictEqual(startPayload.callbackUrl, 'http://127.0.0.1:4765/auth/mercadolivre/callback');
  assert.ok(startPayload.state);

  const callback = await oldFetch(`${server.url}/auth/mercadolivre/callback?state=${encodeURIComponent(startPayload.state)}&code=code-123`);
  assert.strictEqual(callback.status, 200);
  assert.strictEqual(exchanges[0].code, 'code-123');
  assert.strictEqual(exchanges[0].redirectUri, 'https://connect.onblide.com/api/mercadolivre/callback');
  assert.strictEqual(exchanges[0].brokerState, 'broker-state');
  assert.ok(exchanges[0].codeVerifier);
  assert.strictEqual(writes[0].account.nickname, 'BOGU STORE');
});

test('diagnostics retorna estado local sem vazar tokens', async (t) => {
  const server = await listen(createApp({
    env: {
      ML_SERVICE_PORT: '4765'
    },
    store: {
      filePath: 'C:\\tokens\\tokens.json',
      read: async () => ({
        refresh_token: 'TG-secret',
        access_token: 'APP_USR-secret',
        user_id: 123,
        expires_at: Date.now() + 3600000
      })
    },
    client: { getMe: async () => ({ id: 123 }) }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/diagnostics`);
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.service, 'onframe');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(body.config, 'clientIdConfigured'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(body.config, 'clientSecretConfigured'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(body.config, 'envFilePath'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(body.config, 'connectBaseUrl'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(body.runtime, 'pid'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(body.runtime, 'cwd'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(body, 'paths'), false);
  assert.strictEqual(body.auth.tokenPresent, true);
  assert.strictEqual(body.auth.userId, 123);
  assert.strictEqual(body.config.tokenSecretMode, 'fallback');
  assert.strictEqual(serialized.includes('TG-secret'), false);
  assert.strictEqual(serialized.includes('APP_USR-secret'), false);
  assert.strictEqual(serialized.includes('C:\\tokens'), false);
});

test('diagnostics nao alerta token expirado quando refresh esta salvo', async (t) => {
  const server = await listen(createApp({
    store: {
      read: async () => ({
        refresh_token: 'TG-secret',
        access_token: 'APP_USR-expired',
        user_id: 123,
        expires_at: Date.now() - 1000
      })
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/diagnostics`);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.auth.tokenPresent, true);
  assert.strictEqual(body.auth.expired, true);
  assert.strictEqual(body.ready, false);
  assert.deepStrictEqual(body.issues, ['token_secret_fallback']);
  assert.deepStrictEqual(body.nextActions, ['Configure o segredo local de tokens reiniciando pelo bootstrap.']);
});

test('auth accounts lista, ativa e remove contas locais', async (t) => {
  const accounts = [
    { user_id: 101, nickname: 'LOJA 1', active: true, enabled: true },
    { user_id: 202, nickname: 'LOJA 2', active: false, enabled: true }
  ];
  const store = {
    listAccounts: async () => accounts,
    setActive: async (userId) => {
      accounts.forEach((account) => { account.active = String(account.user_id) === String(userId); });
      return accounts.find((account) => account.active);
    },
    removeAccount: async (userId) => {
      const index = accounts.findIndex((account) => String(account.user_id) === String(userId));
      if (index >= 0) accounts.splice(index, 1);
      if (!accounts.some((account) => account.active) && accounts[0]) accounts[0].active = true;
    },
    setAccountEnabled: async (userId, enabled) => {
      const account = accounts.find((item) => String(item.user_id) === String(userId));
      account.enabled = enabled;
      return account;
    }
  };
  const server = await listen(createApp({ store }));
  t.after(() => server.close());

  const list = await fetch(`${server.url}/auth/accounts`);
  assert.strictEqual(list.status, 200);
  assert.strictEqual((await list.json()).activeUserId, 101);

  const active = await fetch(`${server.url}/auth/accounts/active`, {
    method: 'POST',
    body: JSON.stringify({ userId: 202 })
  });
  assert.strictEqual(active.status, 200);
  assert.strictEqual((await active.json()).activeUserId, 202);

  const enabled = await fetch(`${server.url}/auth/accounts/202`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled: false })
  });
  assert.strictEqual(enabled.status, 200);
  assert.strictEqual((await enabled.json()).accounts.find((account) => account.user_id === 202).enabled, false);

  const removed = await fetch(`${server.url}/auth/accounts/202`, { method: 'DELETE' });
  assert.strictEqual(removed.status, 200);
  const body = await removed.json();
  assert.strictEqual(body.activeUserId, 101);
  assert.deepStrictEqual(body.accounts.map((account) => account.user_id), [101]);
});

test('auth account retorna dados seguros da conta conectada', async (t) => {
  const expiresAt = Date.now() + 3600000;
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret', user_id: 123, expires_at: expiresAt }) },
    client: {
      getMe: async () => ({
        id: 123,
        nickname: 'BOGU STORE',
        site_id: 'MLB',
        permalink: 'https://perfil.mercadolivre.com.br/BOGU+STORE',
        status: { site_status: 'active' },
        email: 'privado@example.com'
      })
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/auth/account`);
  const body = await response.json();
  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.authenticated, true);
  assert.strictEqual(body.userId, 123);
  assert.strictEqual(body.expiresAt, expiresAt);
  assert.deepStrictEqual(body.account, {
    id: 123,
    nickname: 'BOGU STORE',
    site_id: 'MLB',
    permalink: 'https://perfil.mercadolivre.com.br/BOGU+STORE',
    status: { site_status: 'active' }
  });
  assert.strictEqual(JSON.stringify(body).includes('TG-secret'), false);
  assert.strictEqual(JSON.stringify(body).includes('privado@example.com'), false);
});

test('auth account traduz token invalido como conta desconectada', async (t) => {
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret', user_id: 123, expires_at: 1 }) },
    client: {
      getMe: async () => {
        const err = new Error('invalid_grant');
        err.statusCode = 401;
        throw err;
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/auth/account`);
  const body = await response.json();
  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.authenticated, false);
  assert.strictEqual(body.userId, 123);
  assert.strictEqual(body.account, null);
  assert.match(body.error, /Conta desconectada/i);
});
