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
  estimatePromotionImpact,
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

test('commerce model resume estado de preco e bloqueios', () => {
  const editable = commerceModel.getPriceState({
    item: { price: 100, currency_id: 'BRL' },
    standardPrice: { amount: 100, currency_id: 'BRL' },
    restrictions: []
  });
  assert.strictEqual(editable.canEdit, true);
  assert.strictEqual(editable.label, 'Editável');
  assert.strictEqual(editable.amountText, 'R$ 100,00');

  const promoted = commerceModel.getPriceState({
    item: { price: 90, original_price: 100, currency_id: 'BRL' },
    standardPrice: { amount: 100, currency_id: 'BRL' },
    salePrice: { amount: 90, regular_amount: 100, currency_id: 'BRL' },
    restrictions: []
  });
  assert.strictEqual(promoted.label, 'Com promoção');
  assert.strictEqual(promoted.tone, 'green');

  const blocked = commerceModel.getPriceState({
    item: { price: 100, currency_id: 'BRL' },
    standardPrice: { amount: 100, currency_id: 'BRL' },
    restrictions: [{ code: 'pricing_automation_active', level: 'block' }]
  });
  assert.strictEqual(blocked.canEdit, false);
  assert.strictEqual(blocked.label, 'Automação ativa');
});

test('commerce model conta promocoes ativas apenas quando aplicadas ao anuncio', () => {
  const state = commerceModel.getPromotionState({
    offers: {
      active: [
        { id: 'O1', type: 'SELLER_CAMPAIGN', status: 'started', display_status: 'programmed' },
        { id: 'P4', type: 'DEAL', status: 'started', is_current_price: true, display_status: 'active' }
      ],
      eligible: [{ id: 'P4', type: 'DEAL', status: 'candidate' }]
    },
    campaigns: {
      active: [
        { id: 'P1', type: 'SMART', status: 'started' },
        { id: 'P2', type: 'DEAL', status: 'started' }
      ],
      eligible: [{ id: 'P3', type: 'PRICE_DISCOUNT', status: 'candidate' }]
    }
  });

  assert.strictEqual(state.activeCount, 1);
  assert.strictEqual(state.appliedCount, 2);
  assert.strictEqual(state.eligibleCount, 1);
  assert.strictEqual(state.scheduledCount, 1);
  assert.strictEqual(state.label, 'Promo ativa');
});

test('commerce model nao conta desconto pix acumulativo como promocao de preco', () => {
  const state = commerceModel.getPromotionState({
    offers: {
      active: [
        { id: 'C1', type: 'SELLER_CAMPAIGN', status: 'started', is_current_price: true, display_status: 'active' },
        { id: 'P1', type: 'BANK', status: 'started', display_status: 'active', is_stackable: true, payment_method: 'PIX' }
      ],
      eligible: [
        { id: 'P2', type: 'BANK', status: 'candidate', display_status: 'available', is_stackable: true, payment_method: 'PIX' },
        { id: 'P3', type: 'DEAL', status: 'candidate', display_status: 'available' }
      ]
    }
  });

  assert.strictEqual(state.activeCount, 1);
  assert.strictEqual(state.appliedCount, 2);
  assert.strictEqual(state.eligibleCount, 1);
  assert.strictEqual(state.scheduledCount, 0);
  assert.strictEqual(state.label, 'Promo ativa');
});

test('commerce model trata aplicada sem preco vigente como programada', () => {
  const state = commerceModel.getPromotionState({
    offers: {
      active: [{ id: 'O1', type: 'SELLER_CAMPAIGN', status: 'started', display_status: 'programmed' }]
    }
  });

  assert.strictEqual(state.activeCount, 0);
  assert.strictEqual(state.appliedCount, 1);
  assert.strictEqual(state.scheduledCount, 1);
  assert.strictEqual(state.label, 'Programada');
});

test('commerce model monta payload amigavel de oferta', () => {
  const payload = commerceModel.buildOfferPayload({
    id: 'P-MLB123',
    type: 'SELLER_CAMPAIGN',
    capabilities: { offerCreate: ['promotion_id', 'deal_price'] }
  }, {
    deal_price: '89,90'
  });

  assert.deepStrictEqual(payload, {
    promotionType: 'SELLER_CAMPAIGN',
    promotionId: 'P-MLB123',
    dealPrice: 89.9
  });
  assert.throws(
    () => commerceModel.buildOfferPayload({
      type: 'PRICE_DISCOUNT',
      capabilities: { offerCreate: ['deal_price'] }
    }, {}),
    /promotion_missing_deal_price/
  );
});

test('commerce model permite remover desconto direto sem campos extras', () => {
  const entry = {
    type: 'PRICE_DISCOUNT',
    status: 'started',
    capabilities: { offerDelete: [] }
  };

  assert.strictEqual(commerceModel.canDeleteOffer(entry), true);
  assert.deepStrictEqual(commerceModel.buildOfferDeletePayload(entry), {
    promotionType: 'PRICE_DISCOUNT'
  });
});

test('commerce model bloqueia preco promocional fora da faixa conhecida', () => {
  const payload = commerceModel.buildOfferPayload({
    type: 'DEAL',
    min_price: 59.2,
    max_price: 209.94,
    capabilities: { offerCreate: ['deal_price'] }
  }, {
    deal_price: '149,99'
  });

  assert.strictEqual(payload.dealPrice, 149.99);

  assert.throws(
    () => commerceModel.buildOfferPayload({
      type: 'PRICE_DISCOUNT',
      min_price: 80,
      max_price: 120,
      capabilities: { offerCreate: ['deal_price'] }
    }, {
      deal_price: '70'
    }),
    /Use um preço entre R\$ 80,00 e R\$ 120,00/
  );

  assert.throws(
    () => commerceModel.buildOfferPayload({
      type: 'PRICE_DISCOUNT',
      min_price: 80,
      max_price: 120,
      capabilities: { offerCreate: ['deal_price'] }
    }, {
      deal_price: '130'
    }),
    /Use um preço entre R\$ 80,00 e R\$ 120,00/
  );
});

test('commerce model envia datas de promocao em formato local', () => {
  const payload = commerceModel.buildOfferPayload({
    type: 'PRICE_DISCOUNT',
    capabilities: { offerCreate: ['deal_price', 'start_date', 'finish_date'] }
  }, {
    deal_price: '89,90',
    start_date: '2026-08-01',
    finish_date: '2026-08-10'
  });

  assert.strictEqual(payload.startDate, '2026-08-01T00:00:00');
  assert.strictEqual(payload.finishDate, '2026-08-10T23:59:59');
});

test('commerce model preserva mensagem amigavel ja traduzida', () => {
  assert.strictEqual(
    commerceModel.friendlyError('Serviço local desligado. Abra o OnFrame.'),
    'Serviço local desligado. Abra o OnFrame.'
  );
});

test('promocoes usam datepicker OnFrame em vez do calendario nativo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');

  assert.strictEqual(source.includes('type="date"'), false);
  assert.match(source, /onframe-commerce-datepicker/);
  assert.match(source, /data-date-display/);
  assert.strictEqual(icons.resolve('calendar'), 'calendar');
});

test('popover de preco mostra valor promocional e custos sem referencia externa', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'styles.css'), 'utf8');

  assert.match(source, /function renderPriceSnapshot/);
  assert.match(source, /function renderPriceCosts/);
  assert.doesNotMatch(source, /function renderPriceReference/);
  assert.match(source, /Preço com promoção/);
  assert.doesNotMatch(source, /priceMeta/);
  assert.match(source, /Você recebe/);
  assert.match(source, /Mercado Livre paga/);
  assert.match(source, /function renderPriceStackableScenarios/);
  assert.match(source, /Desconto acumulativo/);
  assert.match(source, /formatBenefitValue/);
  assert.doesNotMatch(source, /Bônus Mercado Livre/);
  assert.match(source, /metrics\.splice\(1, 0, \{ label: 'Mercado Livre paga'/);
  assert.match(source, /Custos/);
  assert.strictEqual(source.includes('onframe-commerce-price-secondary'), false);
  assert.doesNotMatch(source, /label: 'Preço base'/);
  assert.doesNotMatch(source, /OFF sobre/);
  assert.doesNotMatch(source, /Líquido aprox\./);
  assert.doesNotMatch(source, /<small>Diferença<\/small>/);
  assert.doesNotMatch(source, /Vs\. referência/);
  assert.doesNotMatch(styles, /onframe-commerce-price-reference/);
  assert.match(styles, /span:last-child:nth-child\(odd\)/);
  assert.match(source, /Editar preço base/);
});

test('modal de promocoes preserva posicao ao revisar oferta', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');

  assert.match(source, /restoreModalPosition/);
  assert.match(source, /promotionFocusKey/);
  assert.match(source, /data-entry-key/);
});

test('modal de promocoes mostra previa de custos antes de aplicar oferta', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'styles.css'), 'utf8');

  assert.match(source, /\/promotions\/estimate/);
  assert.match(source, /function schedulePromotionEstimate/);
  assert.match(source, /function renderPromotionEstimateResult/);
  assert.match(source, /Revisão antes de enviar/);
  assert.match(source, /function renderPromotionReview/);
  assert.match(source, /function schedulePromotionManagerEstimates/);
  assert.match(source, /function promotionBenefitAmount/);
  assert.doesNotMatch(source, /promotionBenefitMetrics\(entry, \{ includeAmount: true, basePrice: targetPrice \}\)/);
  assert.match(source, /benefitAmount !== null && metric\.label === 'Mercado Livre paga'/);
  assert.doesNotMatch(source, /Impacto estimado/);
  assert.doesNotMatch(source, /Prévia de custos/);
  assert.doesNotMatch(source, /function estimateDataForKey/);
  assert.doesNotMatch(source, /Bônus Mercado Livre/);
  assert.doesNotMatch(source, /Benefício ML/);
  assert.match(source, /Mercado Livre paga/);
  assert.match(source, /Você paga/);
  assert.doesNotMatch(source, /function renderCardPromotionEstimate/);
  assert.doesNotMatch(source, /Não informado/);
  assert.match(source, /Você recebe/);
  assert.match(styles, /\.onframe-commerce-estimate/);
  assert.match(styles, /\.onframe-commerce-review/);
  assert.match(styles, /\.onframe-commerce-period-legend/);
});

test('modal de promocoes separa descontos acumulativos do preco principal', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');

  assert.match(source, /Descontos acumulativos/);
  assert.match(source, /Promoção no preço/);
  assert.match(source, /function stackablePromotionEntries/);
  assert.match(source, /function isStackablePromotion/);
  assert.match(source, /Acumula no/);
});

test('campo de preco promocional valida faixa localmente', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'styles.css'), 'utf8');

  assert.match(source, /function promotionPriceFieldValidation/);
  assert.match(source, /function updatePromotionPriceFieldFeedback/);
  assert.match(source, /help\.textContent = validation\.message/);
  assert.match(source, /Preço máximo:/);
  assert.match(source, /Preço dentro da faixa permitida/);
  assert.doesNotMatch(source, /Preço mínimo:/);
  assert.doesNotMatch(source, /function promotionPriceBounds/);
  assert.doesNotMatch(source, /renderMetaChip\('Faixa'/);
  assert.match(styles, /\.onframe-commerce-field\.warn input/);
  assert.match(styles, /\.onframe-commerce-field-help/);
  assert.match(styles, /\.onframe-commerce-form-grid\s*{\s*display: grid;\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test('modal de promocoes limpa erro antigo ao editar campos', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');

  assert.match(source, /function savePromotionFieldDraft/);
  assert.match(source, /clearPromotionActionFeedback\(\)/);
  assert.match(source, /querySelectorAll\('\.onframe-commerce-notice'\)/);
});

test('modal de promocoes nao redesenha enquanto usuario digita', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');

  assert.match(source, /function syncPromotionModalMarkupCache/);
  assert.match(source, /syncPromotionModalMarkupCache\(\)/);
  assert.match(source, /function captureModalFieldFocus/);
  assert.match(source, /function restoreModalFieldFocus/);
});

test('promocoes preferem oportunidade do item com faixa de preco', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');

  assert.match(source, /function promotionOpportunityEntries/);
  assert.match(source, /campaignPromotionEntries\(groups\.eligibleOffers\)/);
  assert.doesNotMatch(source, /hasSamePromotion/);
  assert.match(source, /function isPriceDiscountPromotion/);
});

test('promocoes mostram preco principal, acumulativas, programadas e desconto direto separados', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'styles.css'), 'utf8');

  assert.match(source, /Promoção no preço/);
  assert.match(source, /Descontos acumulativos/);
  assert.match(source, /Programadas/);
  assert.match(source, /Desconto do anúncio/);
  assert.match(source, /Desconto direto/);
  assert.match(source, /function programmedPromotionEntries/);
  assert.match(source, /programmed-offer/);
  assert.match(source, /Ativa/);
  assert.match(source, /Programada/);
  assert.match(source, /function currentPromotionEntry/);
  assert.match(source, /campaignPromotionEntries\(groups\.activeOffers\)/);
  assert.match(source, /\(kind === 'active-offer' \|\| kind === 'programmed-offer'\) && CommerceModel\.canUpdateOffer/);
  assert.match(source, /kind === 'active-offer' \|\| kind === 'programmed-offer' \|\| kind === 'stackable-offer'/);
  assert.match(source, /DE \$\{start\} A \$\{end\}/);
  assert.match(source, /function formatCentralDate/);
  assert.doesNotMatch(source, /function formatShortDate/);
  assert.doesNotMatch(source, /renderMetaChip\('Tipo'/);
  assert.match(styles, /\.onframe-commerce-card\s*{\s*display: flex;/);
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(source, /paused-offer/);
  assert.doesNotMatch(source, /readonly-offer/);
});

test('remocao de promocao nao exige campos de criacao ou edicao', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');

  assert.match(source, /const method = action === 'delete' \? 'DELETE'/);
  assert.match(source, /const payload = action === 'delete'\s*\?\s*CommerceModel\.buildOfferDeletePayload\(entry\)/);
  assert.doesNotMatch(source, /let payload = CommerceModel\.buildOfferPayload\(entry, values\);/);
});

test('pricing summary normaliza preco, quantidade, automacao, referencia e catalogo', async () => {
  let listingParams = null;
  let shippingParams = null;
  const summary = await buildPriceSummary({
    getMe: async () => ({ id: 123 }),
    getItem: async () => ({
      id: 'MLB1234567890',
      title: 'Item',
      seller_id: 123,
      category_id: 'MLB1055',
      site_id: 'MLB',
      status: 'active',
      price: 100,
      base_price: 100,
      currency_id: 'BRL',
      listing_type_id: 'gold_special',
      catalog_listing: true,
      catalog_product_id: 'MLB123',
      tags: ['dynamic_standard_price'],
      shipping: { mode: 'me2', logistic_type: 'fulfillment', free_shipping: true },
      condition: 'new',
      pictures: []
    }),
    getItemPrices: async () => ({
      version: 7,
      prices: [
        { id: '1', type: 'standard', amount: 100, currency_id: 'BRL', conditions: { context_restrictions: [] } },
        { id: '2', type: 'standard', amount: 90, currency_id: 'BRL', conditions: { context_restrictions: ['channel_marketplace', 'user_type_business'], min_purchase_unit: 10 } }
      ],
      price_per_quantity: [
        { id: '3', type: 'discount_percentage', percentage: 5, conditions: { context_restrictions: ['channel_marketplace'], min_purchase_unit: 2, eligible: true } }
      ]
    }),
    getItemSalePrice: async () => ({
      price_id: '1',
      amount: 95,
      regular_amount: 100,
      currency_id: 'BRL',
      metadata: { promotion_id: 'P-MLB1', promotion_type: 'PRICE_DISCOUNT' }
    }),
    getPricingAutomation: async () => ({ status: 'ACTIVE', rule: { type: 'COMPETITIVE' }, min_price: 80, max_price: 120 }),
    getPriceReference: async () => ({ item_id: 'MLB1234567890', status: 'with_benchmark_high', suggested_price: { amount: 92 }, current_price: { amount: 100 } }),
    getListingPrices: async (siteId, params) => {
      listingParams = { siteId, params };
      return [{ listing_type_id: 'gold_special', sale_fee_amount: 12.35, sale_fee_details: { percentage_fee: 13, fixed_fee: 0 } }];
    },
    getSellerShippingCost: async (sellerId, params) => {
      shippingParams = { sellerId, params };
      return {
        coverage: {
          all_country: { list_cost: 8.5, currency_id: 'BRL', billable_weight: 1200 },
          discount: { rate: 0.2, type: 'mandatory_free_shipping', promoted_amount: 10.62 }
        }
      };
    },
    getItemPromotions: async () => ({
      results: [{
        id: 'P-MLB1',
        offer_id: 'OFFER-1',
        boosted_offer: true,
        discount_meli_boosted_percentage: 4,
        discount_meli_boost_amount: 3,
        total_price_for_boosted_offer: 95,
        seller_percentage: 7,
        meli_percentage: 3
      }, {
        id: 'P-PIX',
        type: 'BANK',
        ref_id: 'OFFER-PIX',
        status: 'started',
        name: 'Desconto no Pix',
        payment_method: 'PIX',
        seller_percentage: 1.7,
        meli_percentage: 0.3,
        total_price_for_boosted_offer: 93.1
      }]
    }),
    getCatalogCompetition: async () => ({ item_id: 'MLB1234567890', status: 'competing', current_price: 100, price_to_win: 97, currency_id: 'BRL' })
  }, 'MLB1234567890');

  assert.strictEqual(summary.standardPrice.amount, 100);
  assert.strictEqual(summary.salePrice.promotion.type, 'PRICE_DISCOUNT');
  assert.strictEqual(listingParams.siteId, 'MLB');
  assert.strictEqual(listingParams.params.price, 95);
  assert.strictEqual(listingParams.params.logistic_type, 'fulfillment');
  assert.strictEqual(listingParams.params.shipping_mode, 'me2');
  assert.strictEqual(shippingParams.sellerId, 123);
  assert.strictEqual(shippingParams.params.item_price, 95);
  assert.strictEqual(shippingParams.params.free_shipping, 'true');
  assert.strictEqual(summary.prices.version, 7);
  assert.strictEqual(summary.quantityPrices[0].min_purchase_unit, 10);
  assert.strictEqual(summary.pricePerQuantity[0].percentage, 5);
  assert.strictEqual(summary.automation.active, true);
  assert.strictEqual(summary.reference.suggested_price.amount, 92);
  assert.strictEqual(summary.costs[0].sale_fee_amount, 12.35);
  assert.strictEqual(summary.sellerShippingCost.amount, 8.5);
  assert.strictEqual(summary.sellerShippingCost.discount.promoted_amount, 10.62);
  assert.strictEqual(summary.promotionBenefit.amount, 3);
  assert.strictEqual(summary.promotionBenefits.primary.amount, 3);
  assert.strictEqual(summary.promotionBenefits.stackable.length, 1);
  assert.strictEqual(summary.promotionBenefits.stackable[0].label, 'Desconto no Pix');
  assert.strictEqual(summary.promotionBenefits.stackable[0].payment_method, 'PIX');
  assert.strictEqual(summary.promotionBenefits.stackable[0].amount, 0.28);
  assert.strictEqual(summary.costBreakdown.stackable_benefits[0].amount, 0.28);
  assert.strictEqual(summary.costBreakdown.complete, true);
  assert.strictEqual(summary.costBreakdown.you_receive, 77.15);
  assert.strictEqual(summary.catalogCompetition.price_to_win, 97);
  assert.strictEqual(summary.restrictions[0].code, 'pricing_automation_active');
});

test('pricing summary nao calcula voce recebe quando faltam custos oficiais', async () => {
  const summary = await buildPriceSummary({
    getMe: async () => ({ id: 123 }),
    getItem: async () => ({
      id: 'MLB1234567890',
      title: 'Item',
      seller_id: 123,
      category_id: 'MLB1055',
      site_id: 'MLB',
      status: 'active',
      price: 100,
      currency_id: 'BRL',
      listing_type_id: 'gold_special',
      shipping: { mode: 'me2', logistic_type: 'fulfillment', free_shipping: true },
      pictures: []
    }),
    getItemPrices: async () => ({ prices: [{ id: '1', type: 'standard', amount: 100, currency_id: 'BRL', conditions: {} }] }),
    getItemSalePrice: async () => ({ price_id: '1', amount: 90, regular_amount: 100, currency_id: 'BRL', metadata: {} }),
    getPricingAutomation: async () => null,
    getPriceReference: async () => null,
    getListingPrices: async () => [],
    getSellerShippingCost: async () => {
      const err = new Error('shipping unavailable');
      err.statusCode = 404;
      throw err;
    },
    getItemPromotions: async () => ({ results: [] }),
    getCatalogCompetition: async () => null
  }, 'MLB1234567890');

  assert.strictEqual(summary.costBreakdown.complete, false);
  assert.deepStrictEqual(summary.costBreakdown.missing, ['commission', 'shipping']);
  assert.strictEqual(summary.costBreakdown.you_receive, null);
});

test('pricing update bloqueia automacao antes de alterar o item', async () => {
  let updateCalled = false;
  await assert.rejects(
    () => updateStandardPrice({
      getMe: async () => ({ id: 123 }),
      getItem: async () => ({
        id: 'MLB1234567890',
        seller_id: 123,
        site_id: 'MLB',
        price: 100,
        currency_id: 'BRL',
        status: 'active',
        tags: ['dynamic_standard_price']
      }),
      getPricingAutomation: async () => ({ status: 'ACTIVE' }),
      getItemPromotions: async () => ({ results: [] }),
      updateItem: async () => {
        updateCalled = true;
        return {};
      }
    }, 'MLB1234567890', { amount: 110 }),
    /pricing_automation_active/
  );
  assert.strictEqual(updateCalled, false);
});

test('pricing update bloqueia anuncio encerrado antes de alterar o item', async () => {
  let updateCalled = false;
  await assert.rejects(
    () => updateStandardPrice({
      getMe: async () => ({ id: 123 }),
      getItem: async () => ({
        id: 'MLB1234567890',
        seller_id: 123,
        site_id: 'MLB',
        price: 100,
        currency_id: 'BRL',
        status: 'closed',
        has_bids: false,
        tags: []
      }),
      getPricingAutomation: async () => null,
      getItemPromotions: async () => ({ results: [] }),
      updateItem: async () => {
        updateCalled = true;
        return {};
      }
    }, 'MLB1234567890', { amount: 110 }),
    /item_closed/
  );
  assert.strictEqual(updateCalled, false);
});

test('promotion adapter exige estoque em oferta relampago e monta payload', async () => {
  await assert.rejects(
    () => createOffer({
      getMe: async () => ({ id: 123 }),
      getItem: async () => ({ id: 'MLB1234567890', seller_id: 123, site_id: 'MLB' }),
      createPromotionOffer: async () => ({})
    }, 'MLB1234567890', { promotionType: 'LIGHTNING', dealPrice: 80 }),
    /promotion_missing_stock/
  );

  let payload = null;
  const result = await createOffer({
    getMe: async () => ({ id: 123 }),
    getItem: async () => ({ id: 'MLB1234567890', seller_id: 123, site_id: 'MLB' }),
    createPromotionOffer: async (itemId, body) => {
      payload = { itemId, body };
      return { ok: true };
    }
  }, 'MLB1234567890', { promotionType: 'LIGHTNING', dealPrice: 80, stock: 5 });

  assert.deepStrictEqual(result, { ok: true });
  assert.deepStrictEqual(payload, {
    itemId: 'MLB1234567890',
    body: { promotion_type: 'LIGHTNING', deal_price: 80, stock: 5 }
  });
});

test('promotion offer normaliza datas para formato local antes da API', async () => {
  let payload = null;
  await createOffer({
    getMe: async () => ({ id: 123 }),
    getItem: async () => ({ id: 'MLB1234567890', seller_id: 123, site_id: 'MLB' }),
    createPromotionOffer: async (itemId, body) => {
      payload = { itemId, body };
      return { ok: true };
    }
  }, 'MLB1234567890', {
    promotionType: 'PRICE_DISCOUNT',
    dealPrice: 80,
    startDate: '2026-08-01T00:00:00Z',
    finishDate: '2026-08-10'
  });

  assert.strictEqual(payload.body.start_date, '2026-08-01T00:00:00');
  assert.strictEqual(payload.body.finish_date, '2026-08-10T23:59:59');
});

test('promotion offer bloqueia preco fora da faixa atual do item', async () => {
  let called = false;
  await assert.rejects(
    () => createOffer({
      getMe: async () => ({ id: 123 }),
      getItem: async () => ({ id: 'MLB7186779490', seller_id: 123, site_id: 'MLB' }),
      getItemPromotions: async () => ([
        {
          id: 'P-MLB17797034',
          type: 'DEAL',
          name: '8.8 e Dia dos Pais',
          status: 'candidate',
          original_price: 220.99,
          min_discounted_price: 59.2,
          max_discounted_price: 209.94,
          suggested_discounted_price: 196.59
        }
      ]),
      createPromotionOffer: async () => {
        called = true;
        return { ok: true };
      }
    }, 'MLB7186779490', {
      promotionType: 'DEAL',
      promotionId: 'P-MLB17797034',
      dealPrice: 220.99
    }),
    (err) => {
      assert.match(err.message, /promotion_price_out_of_range/);
      assert.strictEqual(err.body.min_discounted_price, 59.2);
      assert.strictEqual(err.body.max_discounted_price, 209.94);
      assert.strictEqual(err.body.suggested_discounted_price, 196.59);
      return true;
    }
  );
  assert.strictEqual(called, false);
});

test('promotion estimate calcula custos antes de aplicar oferta', async () => {
  let listingParams = null;
  let shippingParams = null;
  const result = await estimatePromotionImpact({
    getMe: async () => ({ id: 123 }),
    getItem: async () => ({
      id: 'MLB1234567890',
      seller_id: 123,
      site_id: 'MLB',
      category_id: 'MLB1055',
      status: 'active',
      price: 100,
      currency_id: 'BRL',
      listing_type_id: 'gold_special',
      shipping: { mode: 'me2', logistic_type: 'fulfillment', free_shipping: true },
      condition: 'new',
      pictures: []
    }),
    getItemPromotions: async () => ({
      results: [{
        id: 'P-MLB1',
        type: 'DEAL',
        name: '8.8 e Dia dos Pais',
        status: 'candidate',
        min_discounted_price: 70,
        max_discounted_price: 90,
        suggested_discounted_price: 80,
        discount_meli_boost_amount: 2,
        seller_percentage: 8,
        meli_percentage: 2
      }]
    }),
    getListingPrices: async (siteId, params) => {
      listingParams = { siteId, params };
      return [{ listing_type_id: 'gold_special', sale_fee_amount: 10, sale_fee_details: { percentage_fee: 12.5 } }];
    },
    getSellerShippingCost: async (sellerId, params) => {
      shippingParams = { sellerId, params };
      return { coverage: { all_country: { list_cost: 5, currency_id: 'BRL' } } };
    }
  }, 'MLB1234567890', {
    promotionType: 'DEAL',
    promotionId: 'P-MLB1',
    dealPrice: 80
  });

  assert.strictEqual(listingParams.siteId, 'MLB');
  assert.strictEqual(listingParams.params.price, 80);
  assert.strictEqual(shippingParams.sellerId, 123);
  assert.strictEqual(shippingParams.params.item_price, 80);
  assert.strictEqual(result.promotion.label, '8.8 e Dia dos Pais');
  assert.strictEqual(result.promotion.range.min, 70);
  assert.strictEqual(result.commission.amount, 10);
  assert.strictEqual(result.shipping.amount, 5);
  assert.strictEqual(result.promotionBenefit.amount, 2);
  assert.strictEqual(result.youReceive, 67);
  assert.strictEqual(result.complete, true);
  assert.deepStrictEqual(result.warnings, []);
});

test('promotion estimate usa preco fixo da campanha quando oferta nao tem campo editavel', async () => {
  let listingParams = null;
  let shippingParams = null;
  const result = await estimatePromotionImpact({
    getMe: async () => ({ id: 123 }),
    getItem: async () => ({
      id: 'MLB1234567890',
      seller_id: 123,
      site_id: 'MLB',
      category_id: 'MLB1055',
      status: 'active',
      price: 100,
      currency_id: 'BRL',
      listing_type_id: 'gold_special',
      shipping: { mode: 'me2', logistic_type: 'fulfillment', free_shipping: true },
      condition: 'new',
      pictures: []
    }),
    getItemPromotions: async () => ({
      results: [{
        id: 'P-MLB2',
        type: 'SMART',
        name: 'Tudo de Jardim e Piscina',
        status: 'candidate',
        price: 75,
        original_price: 100,
        seller_percentage: 10,
        meli_percentage: 5
      }]
    }),
    getListingPrices: async (siteId, params) => {
      listingParams = { siteId, params };
      return [{ listing_type_id: 'gold_special', sale_fee_amount: 9, sale_fee_details: { percentage_fee: 12 } }];
    },
    getSellerShippingCost: async (sellerId, params) => {
      shippingParams = { sellerId, params };
      return { coverage: { all_country: { list_cost: 6, currency_id: 'BRL' } } };
    }
  }, 'MLB1234567890', {
    promotionType: 'SMART',
    promotionId: 'P-MLB2'
  });

  assert.strictEqual(listingParams.params.price, 75);
  assert.strictEqual(shippingParams.params.item_price, 75);
  assert.strictEqual(result.dealPrice, 75);
  assert.strictEqual(result.promotion.label, 'Tudo de Jardim e Piscina');
  assert.strictEqual(result.promotionBenefit.amount, 3.75);
  assert.strictEqual(result.promotionBenefit.amount_source, 'calculated_from_percentage');
  assert.strictEqual(result.promotionBenefit.seller_percentage, 10);
  assert.strictEqual(result.promotionBenefit.meli_percentage, 5);
  assert.strictEqual(result.youReceive, 63.75);
  assert.deepStrictEqual(result.warnings, []);
});

test('promotion summary enriquece campanhas com dados do item', async () => {
  const calls = [];
  const summary = await buildPromotionSummary({
    getMe: async () => ({ id: 123, nickname: 'LOJA', site_id: 'MLB' }),
    getItem: async () => ({ id: 'MLB7186779490', seller_id: 123, site_id: 'MLB', price: 220.99, currency_id: 'BRL' }),
    getItemPromotions: async () => ([]),
    getSellerPromotions: async () => ({
      results: [
        { id: 'P-MLB17797034', type: 'DEAL', status: 'started', name: '8.8 e Dia dos Pais' },
        { id: 'P-MLB999', type: 'SMART', status: 'started', name: 'Campanha sem este item' }
      ]
    }),
    getPromotionItems: async (promotionId, promotionType, params) => {
      calls.push({ promotionId, promotionType, params });
      if (promotionId !== 'P-MLB17797034') return { results: [] };
      return {
        results: [{
          id: 'MLB7186779490',
          status: 'candidate',
          original_price: 220.99,
          min_discounted_price: 59.2,
          max_discounted_price: 209.94,
          suggested_discounted_price: 196.59,
          start_date: '2026-07-20T00:00:00-03:00',
          end_date: '2026-08-10T00:00:00-03:00'
        }]
      };
    }
  }, 'MLB7186779490');

  assert.strictEqual(calls[0].params.item_id, 'MLB7186779490');
  assert.strictEqual(summary.offers.eligible.length, 1);
  assert.strictEqual(summary.offers.eligible[0].label, '8.8 e Dia dos Pais');
  assert.strictEqual(summary.offers.eligible[0].min_price, 59.2);
  assert.strictEqual(summary.offers.eligible[0].max_price, 209.94);
  assert.strictEqual(summary.offers.eligible[0].suggested_price, 196.59);
});

test('promotion summary preserva aplicadas e marca preco em vigor pelo sale price', async () => {
  const summary = await buildPromotionSummary({
    getMe: async () => ({ id: 123, nickname: 'LOJA', site_id: 'MLB' }),
    getItem: async () => ({ id: 'MLB7186779490', seller_id: 123, site_id: 'MLB', price: 220.99, currency_id: 'BRL' }),
    getItemSalePrice: async () => ({
      amount: 149.99,
      regular_amount: 220.99,
      currency_id: 'BRL',
      metadata: {
        campaign_id: 'P-MLB17797034',
        promotion_id: 'OFFER-MLB7186779490-13375928811',
        promotion_type: 'campaign'
      }
    }),
    getItemPromotions: async () => ([
      {
        id: 'C-MLB4650383',
        type: 'SELLER_CAMPAIGN',
        status: 'started',
        price: 149.99,
        original_price: 220.99,
        start_date: '2020-07-01T00:00:00',
        finish_date: '2099-07-31T23:59:59',
        name: 'Desconto de Julho'
      },
      {
        id: 'P-MLB17797034',
        type: 'DEAL',
        status: 'started',
        price: 149.99,
        original_price: 220.99,
        start_date: '2021-07-20T00:00:00-03:00',
        finish_date: '2099-08-10T00:00:00-03:00',
        name: '8.8 e Dia dos Pais'
      },
      {
        id: 'P-MLB17699006',
        type: 'BANK',
        ref_id: 'OFFER-MLB7186779490-PIX',
        status: 'started',
        original_price: 220.99,
        seller_percentage: 1.68,
        meli_percentage: 0.32,
        sub_type: 'COFINANCED',
        payment_method: 'PIX',
        start_date: '2021-07-20T00:00:00-03:00',
        finish_date: '2099-07-26T00:00:00-03:00',
        name: 'Desconto no Pix'
      }
    ]),
    getSellerPromotions: async () => ({ results: [] })
  }, 'MLB7186779490');

  assert.strictEqual(summary.salePrice.metadata.campaign_id, 'P-MLB17797034');
  assert.strictEqual(summary.offers.active.length, 3);
  assert.strictEqual(summary.offers.active[0].label, '8.8 e Dia dos Pais');
  assert.strictEqual(summary.offers.active[0].is_current_price, true);
  assert.strictEqual(summary.offers.active[0].api_status, 'started');
  assert.strictEqual(summary.offers.active[0].status_bucket, 'applied');
  assert.strictEqual(summary.offers.active[0].price_role, 'current_price');
  assert.strictEqual(summary.offers.active[0].display_status, 'active');
  assert.strictEqual(summary.offers.active[1].label, 'Desconto no Pix');
  assert.strictEqual(summary.offers.active[1].type, 'BANK');
  assert.strictEqual(summary.offers.active[1].is_stackable, true);
  assert.strictEqual(summary.offers.active[1].stackable_context, 'payment_method');
  assert.strictEqual(summary.offers.active[1].payment_method, 'PIX');
  assert.strictEqual(summary.offers.active[1].is_current_price, false);
  assert.strictEqual(summary.offers.active[1].price_role, 'stackable');
  assert.strictEqual(summary.offers.active[1].display_status, 'active');
  assert.strictEqual(summary.offers.active[1].seller_percentage, 1.68);
  assert.strictEqual(summary.offers.active[1].meli_percentage, 0.32);
  assert.strictEqual(summary.offers.active[2].label, 'Desconto de Julho');
  assert.strictEqual(summary.offers.active[2].status, 'started');
  assert.strictEqual(summary.offers.active[2].api_status, 'started');
  assert.strictEqual(summary.offers.active[2].status_bucket, 'applied');
  assert.strictEqual(summary.offers.active[2].is_current_price, false);
  assert.strictEqual(summary.offers.active[2].price_role, 'not_current_price');
  assert.strictEqual(summary.offers.active[2].display_status, 'programmed');
});

test('promotion campaign cria campanha do vendedor com subtipo padrao', async () => {
  let payload = null;
  await createCampaign({
    createPromotionCampaign: async (body) => {
      payload = body;
      return { id: 'P-MLB1' };
    }
  }, {
    promotionType: 'SELLER_CAMPAIGN',
    name: 'Liquida',
    startDate: '2026-07-21T00:00:00Z',
    finishDate: '2026-07-28T00:00:00Z'
  });

  assert.deepStrictEqual(payload, {
    promotion_type: 'SELLER_CAMPAIGN',
    name: 'Liquida',
    sub_type: 'FLEXIBLE_PERCENTAGE',
    start_date: '2026-07-21T00:00:00',
    finish_date: '2026-07-28T00:00:00'
  });
});

test('promotion delete bloqueia oferta relampago ativa antes de chamar API', async () => {
  let deleteCalled = false;
  await assert.rejects(
    () => deleteOffer({
      getMe: async () => ({ id: 123 }),
      getItem: async () => ({ id: 'MLB1234567890', seller_id: 123, site_id: 'MLB' }),
      getItemPromotions: async () => ({ results: [{ type: 'LIGHTNING', status: 'started' }] }),
      deletePromotionOffer: async () => {
        deleteCalled = true;
        return {};
      }
    }, 'MLB1234567890', { promotionType: 'LIGHTNING' }),
    /lightning_started_cannot_delete/
  );
  assert.strictEqual(deleteCalled, false);
});

test('api pricing e promotions expõem rotas locais', async (t) => {
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret' }) },
    client: {
      getMe: async () => ({ id: 123, nickname: 'BOGU STORE', site_id: 'MLB' }),
      getItem: async () => ({
        id: 'MLB1234567890',
        seller_id: 123,
        site_id: 'MLB',
        status: 'active',
        price: 100,
        currency_id: 'BRL',
        tags: [],
        pictures: []
      }),
      getItemPrices: async () => ({ prices: [{ id: '1', type: 'standard', amount: 100, currency_id: 'BRL', conditions: {} }] }),
      getItemSalePrice: async () => ({ price_id: '1', amount: 100, currency_id: 'BRL', metadata: {} }),
      getPricingAutomation: async () => {
        const err = new Error('automation_not_found');
        err.statusCode = 404;
        throw err;
      },
      getPriceReference: async () => {
        const err = new Error('not found');
        err.statusCode = 404;
        throw err;
      },
      getListingPrices: async () => [],
      getItemPromotions: async () => ({
        results: [
          {
            type: 'SMART',
            status: 'candidate',
            id: 'P-MLB1',
            ref_id: 'CANDIDATE-MLB1234567890-1',
            price: 90,
            original_price: 100,
            seller_percentage: 8,
            meli_percentage: 2
          }
        ]
      }),
      getSellerPromotions: async () => ({ results: [{ type: 'SELLER_CAMPAIGN', status: 'started', id: 'P-MLB1', name: 'Semana do camping' }] })
    }
  }));
  t.after(() => server.close());

  const priceResponse = await fetch(`${server.url}/api/items/MLB1234567890/pricing/summary`);
  const priceBody = await priceResponse.json();
  assert.strictEqual(priceResponse.status, 200);
  assert.strictEqual(priceBody.standardPrice.amount, 100);

  const promoResponse = await fetch(`${server.url}/api/items/MLB1234567890/promotions/summary`);
  const promoBody = await promoResponse.json();
  assert.strictEqual(promoResponse.status, 200);
  assert.strictEqual(promoBody.offers.eligible[0].type, 'SMART');
  assert.strictEqual(promoBody.offers.eligible[0].offer_id, 'CANDIDATE-MLB1234567890-1');
  assert.strictEqual(promoBody.offers.eligible[0].seller_percentage, 8);
  assert.strictEqual(promoBody.campaigns.active[0].type, 'SELLER_CAMPAIGN');
  assert.strictEqual(promoBody.campaigns.active[0].label, 'Semana do camping');
  assert.strictEqual(promoBody.campaigns.active[0].typeLabel, 'Campanha do vendedor');

  const estimateResponse = await fetch(`${server.url}/api/items/MLB1234567890/promotions/estimate`, {
    method: 'POST',
    body: JSON.stringify({ promotionType: 'SMART', promotionId: 'P-MLB1', dealPrice: 90 })
  });
  const estimateBody = await estimateResponse.json();
  assert.strictEqual(estimateResponse.status, 200);
  assert.strictEqual(estimateBody.dealPrice, 90);
  assert.strictEqual(estimateBody.promotion.type, 'SMART');
  assert.strictEqual(estimateBody.promotion.label, 'Campanha Smart');
});
