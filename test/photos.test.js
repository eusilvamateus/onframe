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

test('buildCommitPayload preserva variacoes nao editadas', () => {
  const payload = buildCommitPayload(
    {
      id: 'MLB123',
      variations: [
        { id: 10, picture_ids: ['A', 'B'] },
        { id: 20, picture_ids: ['C'] }
      ]
    },
    {
      pictures: [{ id: 'A' }, { id: 'D' }],
      variations: [{ id: 10, picture_ids: ['D'] }]
    }
  );

  assert.deepStrictEqual(payload, {
    pictures: [{ id: 'A' }, { id: 'D' }],
    variations: [
      { id: 10, picture_ids: ['D'] },
      { id: 20, picture_ids: ['C'] }
    ]
  });
});

test('buildCommitPayload permite remover foto da variacao editada', () => {
  const payload = buildCommitPayload(
    {
      id: 'MLB123',
      variations: [
        { id: 10, picture_ids: ['A', 'B'] },
        { id: 20, picture_ids: ['C'] }
      ]
    },
    {
      pictures: [{ id: 'A' }, { id: 'C' }],
      variations: [{ id: 10, picture_ids: ['A'] }]
    }
  );

  assert.deepStrictEqual(payload, {
    pictures: [{ id: 'A' }, { id: 'C' }],
    variations: [
      { id: 10, picture_ids: ['A'] },
      { id: 20, picture_ids: ['C'] }
    ]
  });
});

test('buildCommitPayload exige ao menos uma foto', () => {
  assert.throws(
    () => buildCommitPayload({ id: 'MLB123' }, { pictures: [] }),
    /pelo menos 1 foto/
  );
});

test('buildCommitPayload respeita limite de fotos por variacao', () => {
  assert.throws(
    () => buildCommitPayload(
      {
        id: 'MLB123',
        variations: [{ id: 10, picture_ids: ['A'] }]
      },
      {
        pictures: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
        variations: [{ id: 10, picture_ids: ['A', 'B', 'C'] }]
      },
      {
        pictureLimits: {
          maxPicturesPerItem: 6,
          maxPicturesPerVariation: 2
        }
      }
    ),
    /Limite da variação: 2 fotos/
  );
});

test('buildCommitPayload nao aplica limite total em variacoes antigas', () => {
  const pictures = Array.from({ length: 40 }, (_, index) => ({ id: `P${index + 1}` }));
  const payload = buildCommitPayload(
    {
      id: 'MLB123',
      variations: [
        { id: 10, picture_ids: pictures.slice(0, 7).map((picture) => picture.id) },
        { id: 20, picture_ids: pictures.slice(7, 17).map((picture) => picture.id) },
        { id: 30, picture_ids: pictures.slice(17, 27).map((picture) => picture.id) },
        { id: 40, picture_ids: pictures.slice(27, 37).map((picture) => picture.id) }
      ]
    },
    {
      pictures,
      variations: [
        { id: 10, picture_ids: pictures.slice(0, 7).map((picture) => picture.id) }
      ]
    },
    {
      pictureLimits: {
        maxPicturesPerItem: 12,
        maxPicturesPerVariation: 10
      }
    }
  );

  assert.strictEqual(payload.pictures.length, 40);
  assert.strictEqual(payload.variations[0].picture_ids.length, 7);
  assert.strictEqual(payload.variations[1].picture_ids.length, 10);
});

test('buildCommitPayload respeita limite total de fotos do anuncio', () => {
  assert.throws(
    () => buildCommitPayload(
      { id: 'MLB123', variations: [] },
      { pictures: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] },
      {
        pictureLimits: {
          maxPicturesPerItem: 2,
          maxPicturesPerVariation: null
        }
      }
    ),
    /Limite do anúncio: 2 fotos/
  );
});

test('buildCommitPayload mantem comportamento atual sem limites conhecidos', () => {
  const payload = buildCommitPayload(
    { id: 'MLB123', variations: [] },
    { pictures: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] },
    {
      pictureLimits: {
        maxPicturesPerItem: null,
        maxPicturesPerVariation: null
      }
    }
  );

  assert.deepStrictEqual(payload, {
    pictures: [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
  });
});

test('photos model seleciona fotos da variacao ativa', () => {
  const context = {
    pictures: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
    variations: [{ id: 10, picture_ids: ['B', 'A'] }]
  };

  assert.deepStrictEqual(
    photosModel.selectPicturesForActiveVariation(context, 10).map((picture) => picture.id),
    ['B', 'A']
  );
});

test('photos model usa todas as fotos em anuncio sem variacoes', () => {
  const context = {
    pictures: [{ id: 'A' }, { id: 'B' }],
    variations: []
  };

  assert.deepStrictEqual(
    photosModel.selectPicturesForActiveVariation(context, null).map((picture) => picture.id),
    ['A', 'B']
  );
});

test('photos model preserva fotos usadas por outra variacao no payload do item', () => {
  const payload = photosModel.buildItemPicturesPayload({
    contextPictures: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
    originalPictures: [{ id: 'A' }, { id: 'B' }],
    finalSelectedPictures: [{ id: 'A' }],
    variations: [
      { id: 1, picture_ids: ['A'] },
      { id: 2, picture_ids: ['B', 'C'] }
    ]
  });

  assert.deepStrictEqual(payload, [{ id: 'A' }, { id: 'B' }, { id: 'C' }]);
});

test('photos model aplica limite por variacao sem bloquear pelo total do anuncio', () => {
  const state = photosModel.getPictureLimitState({
    limits: { maxPicturesPerItem: 12, maxPicturesPerVariation: 10 },
    selectedVariationId: 10,
    draftPictures: Array.from({ length: 7 }, (_, index) => ({ id: `P${index}` })),
    contextPictures: Array.from({ length: 40 }, (_, index) => ({ id: `P${index}` })),
    originalPictures: Array.from({ length: 7 }, (_, index) => ({ id: `P${index}` }))
  });

  assert.strictEqual(state.message, '');
  assert.strictEqual(state.counterText, '7/10 fotos');
});

test('modulo de fotos consome contexto resolvido pelo shell', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'photos', 'module.js'), 'utf8');

  assert.strictEqual(source.includes('collectItemIdCandidatesFromPage'), false);
  assert.strictEqual(source.includes('collectUserProductCandidatesFromPage'), false);
  assert.strictEqual(source.includes('inferSelectedVariationId'), false);
  assert.match(source, /context\.selectedVariationId/);
});

test('botao do editor completo fica integrado na bandeja', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'photos', 'styles.css'), 'utf8');

  assert.match(styles, /\.onblide-ml-tray-modal-row \{/);
  assert.match(styles, /margin: 0 0 8px;/);
  assert.match(styles, /\.onblide-ml-expand \{/);
  assert.match(styles, /box-shadow: none;/);
  assert.doesNotMatch(styles, /margin: -4px 0 6px;/);
  assert.doesNotMatch(styles, /0 8px 18px rgba\(20, 20, 20, 0\.12\)/);
});

test('picture quality extrai dimensoes oficiais do Mercado Livre', () => {
  assert.deepStrictEqual(
    extractOfficialDimensions({
      id: 'P1',
      variations: [
        { size: '90x90' },
        { size: '1200x1200' },
        { size: '500x500' }
      ]
    }),
    { width: 1200, height: 1200, source: 'official' }
  );
});

test('picture quality mede dimensoes reais de PNG e calcula score', () => {
  assert.deepStrictEqual(
    extractImageDimensions(fakePng(1080, 1080)),
    { width: 1080, height: 1080, source: 'measured' }
  );
  assert.strictEqual(calculateResolutionScore(1080, 1080), 90);
  assert.strictEqual(calculateResolutionScore(1185, 1013), 99);
  assert.strictEqual(calculateResolutionScore(1600, 1200), 100);
  assert.deepStrictEqual(calculateOptimizedDimensions(1080, 900), { width: 1200, height: 1000 });
});

test('picture quality mede dimensoes reais de WebP', () => {
  assert.deepStrictEqual(
    extractImageDimensions(fakeWebpVp8x(1200, 1200)),
    { width: 1200, height: 1200, source: 'measured' }
  );
});

test('picture quality prefere imagem mlstatic 2x ao max_size declarado', async () => {
  const pictureId = '679212-MLB114811470619_072026';
  const downloaded = [];
  const report = await buildPictureQualityReport({
    downloadImage: async (url) => {
      downloaded.push(url);
      return {
        mimeType: 'image/webp',
        base64: fakeWebpVp8x(1200, 1200).toString('base64')
      };
    }
  }, {
    id: 'MLB1234567890',
    title: 'Produto',
    category_id: 'MLB1055',
    pictures: [{
      id: pictureId,
      max_size: '500x500',
      secure_url: `https://http2.mlstatic.com/D_${pictureId}-O.jpg`
    }],
    variations: [{ id: 10, picture_ids: [pictureId] }]
  }, {
    selectedVariationId: '10'
  });

  assert.deepStrictEqual(downloaded, [`https://http2.mlstatic.com/D_NQ_NP_2X_${pictureId}-F.webp`]);
  assert.strictEqual(report.summary.belowIdealCount, 0);
  assert.deepStrictEqual(report.pictures[0].resolution, {
    available: true,
    width: 1200,
    height: 1200,
    source: 'measured',
    score: 100,
    targetLongSide: 1200,
    belowIdeal: false,
    optimizedWidth: 1200,
    optimizedHeight: 1200
  });
});

test('picture quality usa apenas dimensoes e ignora diagnostico oficial', async () => {
  let diagnosticRequested = false;
  const report = await buildPictureQualityReport({
    diagnosePicture: async () => {
      diagnosticRequested = true;
      throw new Error('diagnostic should not be called');
    }
  }, {
    id: 'MLB1234567890',
    title: 'Produto',
    category_id: 'MLB1055',
    pictures: [{ id: 'P1', variations: [{ size: '1200x1200' }] }],
    variations: []
  });

  assert.strictEqual(diagnosticRequested, false);
  assert.strictEqual(report.pictures[0].status, 'ok');
  assert.strictEqual(report.pictures[0].message, '1200 x 1200px, 100% do ideal.');
  assert.strictEqual(report.summary.status, 'ok');
});

test('picture quality nao cai para todas as fotos quando a variacao informada nao existe', async () => {
  const report = await buildPictureQualityReport({}, {
    id: 'MLB1234567890',
    title: 'Produto',
    category_id: 'MLB1055',
    pictures: [{ id: 'P1' }],
    variations: [{ id: 10, picture_ids: ['P1'] }]
  }, {
    selectedVariationId: '999'
  });

  assert.strictEqual(report.pictures.length, 0);
});

test('picture quality mede imagem quando a API nao traz dimensoes', async () => {
  const report = await buildPictureQualityReport({
    downloadImage: async () => ({
      mimeType: 'image/png',
      base64: fakePng(1080, 1080).toString('base64')
    })
  }, {
    id: 'MLB1234567890',
    title: 'Produto',
    category_id: 'MLB1055',
    pictures: [{ id: 'P1', secure_url: 'https://img.example/P1.png' }],
    variations: []
  });

  assert.strictEqual(report.summary.belowIdealCount, 1);
  assert.strictEqual(report.summary.optimizableCount, 1);
  assert.strictEqual(report.summary.message, '1/1 abaixo do ideal');
  assert.deepStrictEqual(report.pictures[0].resolution, {
    available: true,
    width: 1080,
    height: 1080,
    source: 'measured',
    score: 90,
    targetLongSide: 1200,
    belowIdeal: true,
    optimizedWidth: 1200,
    optimizedHeight: 1200
  });
  assert.strictEqual(report.pictures[0].status, 'attention');
  assert.strictEqual(report.pictures[0].canOptimize, true);
});

test('api quality analisa apenas fotos da variacao selecionada', async (t) => {
  const item = {
    id: 'MLB1234567890',
    title: 'Produto com variacoes',
    seller_id: 123,
    category_id: 'MLB1055',
    site_id: 'MLB',
    tags: ['poor_quality_thumbnail'],
    pictures: [
      { id: 'P1', variations: [{ size: '400x400' }], secure_url: 'https://img.example/P1.jpg' },
      { id: 'P2', variations: [{ size: '1200x1200' }], secure_url: 'https://img.example/P2.jpg' }
    ],
    variations: [
      { id: 10, picture_ids: ['P1'] },
      { id: 20, picture_ids: ['P2'] }
    ]
  };
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123 }),
      getItem: async () => item,
      getLastModeration: async () => {
        throw new Error('moderation should not be called');
      },
      diagnosePicture: async () => {
        throw new Error('diagnostic should not be called');
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/items/MLB1234567890/pictures/quality?variation_id=10`);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.source, 'mercadolivre_api');
  assert.strictEqual(body.pictures.length, 1);
  assert.strictEqual(body.pictures[0].pictureId, 'P1');
  assert.deepStrictEqual(body.pictures[0].dimensions, { width: 400, height: 400, source: 'official' });
  assert.strictEqual(body.pictures[0].resolution.score, 33);
  assert.strictEqual(body.pictures[0].resolution.belowIdeal, true);
  assert.strictEqual(body.pictures[0].status, 'attention');
  assert.strictEqual(body.pictures[0].canFixSize, true);
  assert.strictEqual(body.pictures[0].canOptimize, true);
  assert.strictEqual(body.pictures[0].remedy, 'Pode otimizar.');
  assert.strictEqual(body.summary.status, 'attention');
  assert.strictEqual(body.summary.belowIdealCount, 1);
  assert.strictEqual(body.summary.message, '1/1 abaixo do ideal');
});

test('api fix-size retorna imagem base64 baixada da foto oficial', async (t) => {
  const downloaded = [];
  const image = fakePng(1080, 1080);
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
        pictures: [{ id: 'P1', secure_url: 'https://img.example/P1.jpg' }]
      }),
      downloadImage: async (url) => {
        downloaded.push(url);
        return {
          mimeType: 'image/png',
          base64: image.toString('base64')
        };
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/items/MLB1234567890/pictures/fix-size`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pictureId: 'P1' })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.pictureId, 'P1');
  assert.strictEqual(body.base64, `data:image/png;base64,${image.toString('base64')}`);
  assert.deepStrictEqual(body.originalDimensions, { width: 1080, height: 1080, source: 'measured' });
  assert.deepStrictEqual(body.optimizedDimensions, { width: 1200, height: 1200 });
  assert.strictEqual(body.targetLongSide, 1200);
  assert.deepStrictEqual(downloaded, ['https://img.example/P1.jpg']);
});

test('api fix-size usa derivacao mlstatic em alta resolucao', async (t) => {
  const pictureId = '679212-MLB114811470619_072026';
  const downloaded = [];
  const image = fakeWebpVp8x(1200, 1200);
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
        pictures: [{
          id: pictureId,
          max_size: '500x500',
          secure_url: `https://http2.mlstatic.com/D_${pictureId}-O.jpg`
        }]
      }),
      downloadImage: async (url) => {
        downloaded.push(url);
        return {
          mimeType: 'image/webp',
          base64: image.toString('base64')
        };
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/items/MLB1234567890/pictures/fix-size`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pictureId })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(body.originalDimensions, { width: 1200, height: 1200, source: 'measured' });
  assert.deepStrictEqual(body.optimizedDimensions, { width: 1200, height: 1200 });
  assert.deepStrictEqual(downloaded, [`https://http2.mlstatic.com/D_NQ_NP_2X_${pictureId}-F.webp`]);
});

test('api fix-size bloqueia anuncio encerrado com venda antes de baixar imagem', async (t) => {
  let downloadCalled = false;
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
        pictures: [{ id: 'P1', secure_url: 'https://img.example/P1.jpg' }]
      }),
      downloadImage: async () => {
        downloadCalled = true;
        return {};
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/items/MLB1234567890/pictures/fix-size`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pictureId: 'P1' })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 409);
  assert.match(body.error, /Anúncio encerrado/i);
  assert.strictEqual(downloadCalled, false);
});

test('api fix-size bloqueia anuncios de Catalogo', async (t) => {
  let downloadCalled = false;
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123 }),
      getItem: async () => ({
        id: 'MLB1234567890',
        title: 'Catalogo',
        seller_id: 123,
        category_id: 'MLB1055',
        site_id: 'MLB',
        catalog_listing: true,
        pictures: [{ id: 'P1', secure_url: 'https://img.example/P1.jpg' }]
      }),
      downloadImage: async () => {
        downloadCalled = true;
        return {};
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/items/MLB1234567890/pictures/fix-size`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pictureId: 'P1' })
  });
  const body = await response.json();

  assert.strictEqual(response.status, 409);
  assert.match(body.error, /Catálogo/i);
  assert.strictEqual(downloadCalled, false);
});
