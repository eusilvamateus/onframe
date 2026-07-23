const { assertOwnedItem, summarizeItem } = require('./item-context');
const { buildCostProjection } = require('./pricing');

const PROMOTION_TYPES = Object.freeze({
  DEAL: 'DEAL',
  MARKETPLACE_CAMPAIGN: 'MARKETPLACE_CAMPAIGN',
  DOD: 'DOD',
  LIGHTNING: 'LIGHTNING',
  VOLUME: 'VOLUME',
  PRICE_DISCOUNT: 'PRICE_DISCOUNT',
  PRE_NEGOTIATED: 'PRE_NEGOTIATED',
  SELLER_CAMPAIGN: 'SELLER_CAMPAIGN',
  SMART: 'SMART',
  PRICE_MATCHING: 'PRICE_MATCHING',
  PRICE_MATCHING_MELI_ALL: 'PRICE_MATCHING_MELI_ALL',
  UNHEALTHY_STOCK: 'UNHEALTHY_STOCK',
  SELLER_COUPON_CAMPAIGN: 'SELLER_COUPON_CAMPAIGN',
  BANK: 'BANK'
});

const ADAPTERS = Object.freeze({
  [PROMOTION_TYPES.PRICE_DISCOUNT]: adapter({
    type: PROMOTION_TYPES.PRICE_DISCOUNT,
    label: 'Desconto do anúncio',
    offerCreate: ['deal_price', 'start_date', 'finish_date'],
    offerUpdate: [],
    offerDelete: [],
    campaignCreate: false
  }),
  [PROMOTION_TYPES.SELLER_CAMPAIGN]: adapter({
    type: PROMOTION_TYPES.SELLER_CAMPAIGN,
    label: 'Campanha do vendedor',
    offerCreate: ['promotion_id', 'deal_price'],
    offerUpdate: ['promotion_id', 'deal_price'],
    offerDelete: ['promotion_id'],
    campaignCreate: ['name', 'start_date', 'finish_date'],
    campaignUpdate: true,
    campaignDelete: true
  }),
  [PROMOTION_TYPES.SELLER_COUPON_CAMPAIGN]: adapter({
    type: PROMOTION_TYPES.SELLER_COUPON_CAMPAIGN,
    label: 'Cupom do vendedor',
    offerCreate: ['promotion_id'],
    offerUpdate: [],
    offerDelete: ['promotion_id'],
    campaignCreate: ['name', 'sub_type', 'start_date', 'finish_date'],
    campaignUpdate: true,
    campaignDelete: true
  }),
  [PROMOTION_TYPES.VOLUME]: adapter({
    type: PROMOTION_TYPES.VOLUME,
    label: 'Desconto por quantidade',
    offerCreate: ['promotion_id'],
    offerUpdate: [],
    offerDelete: ['promotion_id', 'offer_id'],
    campaignCreate: ['name', 'sub_type', 'start_date', 'finish_date'],
    campaignUpdate: true,
    campaignDelete: true,
    directPriceChange: 'remove_offer_first'
  }),
  [PROMOTION_TYPES.DEAL]: adapter({
    type: PROMOTION_TYPES.DEAL,
    label: 'Campanha tradicional',
    offerCreate: ['promotion_id', 'deal_price'],
    offerUpdate: ['promotion_id', 'deal_price'],
    offerDelete: ['promotion_id']
  }),
  [PROMOTION_TYPES.MARKETPLACE_CAMPAIGN]: adapter({
    type: PROMOTION_TYPES.MARKETPLACE_CAMPAIGN,
    label: 'Co-participação',
    offerCreate: ['promotion_id'],
    offerUpdate: [],
    offerDelete: ['promotion_id', 'offer_id'],
    directPriceChange: 'remove_offer_first'
  }),
  [PROMOTION_TYPES.PRE_NEGOTIATED]: adapter({
    type: PROMOTION_TYPES.PRE_NEGOTIATED,
    label: 'Desconto pré-acordado',
    offerCreate: ['promotion_id', 'offer_id'],
    offerUpdate: [],
    offerDelete: ['promotion_id', 'offer_id']
  }),
  [PROMOTION_TYPES.UNHEALTHY_STOCK]: adapter({
    type: PROMOTION_TYPES.UNHEALTHY_STOCK,
    label: 'Liquidação Full',
    offerCreate: ['promotion_id', 'offer_id'],
    offerUpdate: [],
    offerDelete: ['promotion_id', 'offer_id']
  }),
  [PROMOTION_TYPES.DOD]: adapter({
    type: PROMOTION_TYPES.DOD,
    label: 'Oferta do dia',
    offerCreate: ['deal_price'],
    offerUpdate: [],
    offerDelete: [],
    activeDeletePolicy: 'cannot_delete_started'
  }),
  [PROMOTION_TYPES.LIGHTNING]: adapter({
    type: PROMOTION_TYPES.LIGHTNING,
    label: 'Oferta relâmpago',
    offerCreate: ['deal_price', 'stock'],
    offerUpdate: [],
    offerDelete: [],
    activeDeletePolicy: 'cannot_delete_started'
  }),
  [PROMOTION_TYPES.SMART]: adapter({
    type: PROMOTION_TYPES.SMART,
    label: 'Campanha Smart',
    offerCreate: ['promotion_id', 'offer_id'],
    offerUpdate: [],
    offerDelete: ['promotion_id', 'offer_id']
  }),
  [PROMOTION_TYPES.PRICE_MATCHING]: adapter({
    type: PROMOTION_TYPES.PRICE_MATCHING,
    label: 'Preço competitivo',
    offerCreate: ['promotion_id', 'offer_id'],
    offerUpdate: [],
    offerDelete: ['promotion_id', 'offer_id']
  }),
  [PROMOTION_TYPES.PRICE_MATCHING_MELI_ALL]: adapter({
    type: PROMOTION_TYPES.PRICE_MATCHING_MELI_ALL,
    label: 'Preço competitivo automático',
    offerCreate: [],
    offerUpdate: [],
    offerDelete: [],
    readonly: true
  }),
  [PROMOTION_TYPES.BANK]: adapter({
    type: PROMOTION_TYPES.BANK,
    label: 'Co-participação PIX',
    offerCreate: ['promotion_id', 'offer_id'],
    offerUpdate: [],
    offerDelete: ['promotion_id', 'offer_id'],
    directPriceChange: 'remove_offer_first'
  })
});

async function buildPromotionSummary(client, itemId) {
  const item = await assertOwnedItem(client, itemId);
  const [me, itemPromotions, sellerPromotions, salePrice] = await Promise.all([
    client.getMe(),
    optional(() => client.getItemPromotions(item.id), [404]),
    optional(async () => {
      const user = await client.getMe();
      return client.getSellerPromotions(user.id);
    }, [404]),
    typeof client.getItemSalePrice === 'function'
      ? optional(() => client.getItemSalePrice(item.id, { context: 'channel_marketplace' }), [400, 404])
      : null
  ]);

  const itemPromotionEntries = extractEntries(itemPromotions);
  const sellerPromotionEntries = extractEntries(sellerPromotions);
  const enrichedItemPromotions = await enrichSellerPromotionsForItem(client, item.id, sellerPromotionEntries, itemPromotionEntries);
  const offers = annotatePriceWinningPromotion(itemPromotionEntries.concat(enrichedItemPromotions).map(normalizePromotionEntry), salePrice);
  const campaigns = sellerPromotionEntries.map(normalizePromotionEntry);

  return {
    item: summarizePromotionItem(item),
    seller: { id: me.id, nickname: me.nickname || null, site_id: me.site_id || null },
    salePrice: summarizePromotionSalePrice(salePrice),
    offers: groupPromotions(offers),
    campaigns: groupPromotions(campaigns),
    adapters: summarizeAdapters(),
    raw: {
      itemPromotions: hasError(itemPromotions) ? itemPromotions : null,
      sellerPromotions: hasError(sellerPromotions) ? sellerPromotions : null
    }
  };
}

async function createOffer(client, itemId, input = {}) {
  const item = await assertOwnedItem(client, itemId);
  const promotionType = normalizePromotionType(input.promotionType || input.promotion_type);
  const promotionAdapter = requireAdapter(promotionType);
  assertNotReadonly(promotionAdapter);
  assertActionSupported(promotionAdapter, 'offerCreate');
  assertRequired(input, promotionAdapter.offerCreate);
  const payload = buildOfferPayload(input, promotionAdapter);
  await assertPromotionPriceInRange(client, item.id, payload);
  return client.createPromotionOffer(item.id, payload);
}

async function estimatePromotionImpact(client, itemId, input = {}) {
  const item = await assertOwnedItem(client, itemId);
  const promotionType = normalizePromotionType(input.promotionType || input.promotion_type);
  const promotionAdapter = requireAdapter(promotionType);

  const payload = {
    promotion_type: promotionAdapter.type
  };
  copy(input, payload, 'promotion_id');
  copy(input, payload, 'offer_id');
  copyAliases(input, payload);

  const current = await optional(() => client.getItemPromotions(item.id), [400, 404]);
  const match = findPromotionEntryForPayload(current, payload);
  const dealPrice = resolvePromotionEstimatePrice(input, match);
  if (!dealPrice || dealPrice <= 0) {
    const err = new Error('promotion_missing_deal_price');
    err.statusCode = 400;
    throw err;
  }
  payload.deal_price = dealPrice;

  const warnings = [];
  const range = summarizePromotionRange(match);
  if (range && ((range.min && dealPrice < range.min) || (range.max && dealPrice > range.max))) {
    warnings.push({
      code: 'promotion_price_out_of_range',
      message: 'Preço fora da faixa da promoção.',
      min_price: range.min,
      max_price: range.max,
      suggested_price: range.suggested
    });
  }

  const promotionBenefit = summarizeEstimatePromotionBenefit(match, dealPrice);
  const projection = await buildCostProjection(client, item, dealPrice, promotionBenefit);

  return {
    item: summarizePromotionItem(item),
    promotion: {
      id: payload.promotion_id || match && (match.id || match.promotion_id) || null,
      offer_id: payload.offer_id || match && (match.offer_id || match.ref_id) || null,
      type: promotionAdapter.type,
      label: match ? promotionDisplayName(match, promotionAdapter.label) : promotionAdapter.label,
      range
    },
    dealPrice,
    currency_id: projection.currency_id,
    commission: projection.costBreakdown.commission,
    shipping: projection.costBreakdown.shipping,
    promotionBenefit: projection.promotionBenefit,
    youReceive: projection.costBreakdown.you_receive,
    complete: projection.costBreakdown.complete,
    missing: projection.costBreakdown.missing,
    warnings
  };
}

function resolvePromotionEstimatePrice(input, entry) {
  if (hasOwn(input, 'dealPrice') || hasOwn(input, 'deal_price')) {
    return numberOrNull(input.dealPrice || input.deal_price);
  }
  return numberOrNull(input.dealPrice || input.deal_price) ||
    numberOrNull(entry && (entry.price || entry.new_price || entry.deal_price)) ||
    numberOrNull(entry && (entry.suggested_discounted_price || entry.suggested_price)) ||
    numberOrNull(entry && entry.total_price_for_boosted_offer);
}

async function enrichSellerPromotionsForItem(client, itemId, sellerPromotions, itemPromotions) {
  if (!client || typeof client.getPromotionItems !== 'function') return [];
  const existing = new Set(itemPromotions.map(promotionEntryKey).filter(Boolean));
  const campaigns = extractEntries(sellerPromotions)
    .filter((entry) => entry && entry.id && normalizePromotionType(entry.type || entry.promotion_type))
    .filter((entry) => !existing.has(promotionEntryKey(entry)));

  const lookups = await Promise.all(campaigns.map((campaign) => optional(() => client.getPromotionItems(
    campaign.id,
    normalizePromotionType(campaign.type || campaign.promotion_type),
    { item_id: itemId, limit: 50 }
  ), [400, 404])));

  return lookups.flatMap((response, index) => {
    const campaign = campaigns[index];
    return extractEntries(response)
      .filter((entry) => String(entry && entry.id || '') === String(itemId))
      .map((entry) => normalizeCampaignItemEntry(campaign, entry));
  });
}

function normalizeCampaignItemEntry(campaign, itemEntry) {
  return Object.assign({}, campaign, itemEntry, {
    id: campaign.id,
    promotion_id: campaign.id,
    item_id: itemEntry.id,
    type: normalizePromotionType(itemEntry.type || campaign.type || campaign.promotion_type),
    name: itemEntry.name || campaign.name || campaign.title || null,
    title: itemEntry.title || campaign.title || null,
    start_date: itemEntry.start_date || campaign.start_date || null,
    finish_date: itemEntry.finish_date || itemEntry.end_date || campaign.finish_date || campaign.end_date || null
  });
}

async function updateOffer(client, itemId, input = {}) {
  const item = await assertOwnedItem(client, itemId);
  const promotionType = normalizePromotionType(input.promotionType || input.promotion_type);
  const promotionAdapter = requireAdapter(promotionType);
  assertNotReadonly(promotionAdapter);
  assertActionSupported(promotionAdapter, 'offerUpdate');
  assertRequired(input, promotionAdapter.offerUpdate);
  const payload = buildOfferPayload(input, promotionAdapter);
  await assertPromotionPriceInRange(client, item.id, payload);
  return client.updatePromotionOffer(item.id, payload);
}

async function deleteOffer(client, itemId, input = {}) {
  const item = await assertOwnedItem(client, itemId);
  const current = await optional(() => client.getItemPromotions(item.id), [404]);
  const promotionType = normalizePromotionType(input.promotionType || input.promotion_type);
  const promotionAdapter = requireAdapter(promotionType);
  assertNotReadonly(promotionAdapter);
  assertActionSupported(promotionAdapter, 'offerDelete');
  assertRequired(input, promotionAdapter.offerDelete);
  assertStartedDeletePolicyDoesNotApply(input, promotionAdapter, current);
  return client.deletePromotionOffer(item.id, buildOfferDeleteParams(input, promotionAdapter));
}

async function listCampaigns(client) {
  const me = await client.getMe();
  const response = await client.getSellerPromotions(me.id);
  return {
    seller: { id: me.id, nickname: me.nickname || null, site_id: me.site_id || null },
    campaigns: groupPromotions(extractEntries(response).map(normalizePromotionEntry))
  };
}

async function createCampaign(client, input = {}) {
  const promotionType = normalizePromotionType(input.promotionType || input.promotion_type);
  const promotionAdapter = requireAdapter(promotionType);
  assertCampaignActionSupported(promotionAdapter, 'campaignCreate');
  assertRequired(input, promotionAdapter.campaignCreate);
  return client.createPromotionCampaign(buildCampaignPayload(input, promotionAdapter));
}

async function updateCampaign(client, promotionId, input = {}) {
  const promotionType = normalizePromotionType(input.promotionType || input.promotion_type);
  const promotionAdapter = requireAdapter(promotionType);
  assertCampaignActionSupported(promotionAdapter, 'campaignUpdate');
  const payload = buildCampaignPayload(input, promotionAdapter);
  if (!payload.promotion_type) payload.promotion_type = promotionType;
  return client.updatePromotionCampaign(promotionId, payload);
}

async function deleteCampaign(client, promotionId, input = {}) {
  const promotionType = normalizePromotionType(input.promotionType || input.promotion_type);
  const promotionAdapter = requireAdapter(promotionType);
  assertCampaignActionSupported(promotionAdapter, 'campaignDelete');
  return client.deletePromotionCampaign(promotionId, promotionType);
}

function adapter(config) {
  return Object.freeze(Object.assign({
    readonly: false,
    campaignCreate: false,
    campaignUpdate: false,
    campaignDelete: false,
    offerCreate: false,
    offerUpdate: false,
    offerDelete: false,
    directPriceChange: 'api_decides',
    activeDeletePolicy: 'api_decides'
  }, config));
}

function buildOfferPayload(input, promotionAdapter) {
  const payload = { promotion_type: promotionAdapter.type };
  copy(input, payload, 'promotion_id');
  copy(input, payload, 'offer_id');
  copy(input, payload, 'deal_price');
  copy(input, payload, 'top_deal_price');
  copy(input, payload, 'stock');
  copy(input, payload, 'start_date');
  copy(input, payload, 'finish_date');
  copy(input, payload, 'remove_loyalty');
  copyAliases(input, payload);
  normalizeLocalDateField(payload, 'start_date', 'start');
  normalizeLocalDateField(payload, 'finish_date', 'finish');
  return payload;
}

function buildOfferDeleteParams(input, promotionAdapter) {
  const params = { promotion_type: promotionAdapter.type };
  copy(input, params, 'promotion_id');
  copy(input, params, 'offer_id');
  copyAliases(input, params);
  return params;
}

async function assertPromotionPriceInRange(client, itemId, payload) {
  const dealPrice = numberOrNull(payload.deal_price);
  if (!dealPrice || !client || typeof client.getItemPromotions !== 'function') return;

  const current = await optional(() => client.getItemPromotions(itemId), [400, 404]);
  const match = findPromotionEntryForPayload(current, payload);
  if (!match) return;

  const min = numberOrNull(match.min_discounted_price || match.min_price);
  const max = numberOrNull(match.max_discounted_price || match.max_price);
  if ((min && dealPrice < min) || (max && dealPrice > max)) {
    const suggested = numberOrNull(match.suggested_discounted_price || match.suggested_price);
    const err = new Error('promotion_price_out_of_range');
    err.statusCode = 400;
    err.body = {
      min_discounted_price: min,
      max_discounted_price: max,
      suggested_discounted_price: suggested
    };
    throw err;
  }
}

function findPromotionEntryForPayload(current, payload) {
  const type = normalizePromotionType(payload.promotion_type);
  const promotionId = String(payload.promotion_id || '');
  const offerId = String(payload.offer_id || '');
  const entries = extractEntries(current);
  const matches = entries.filter((entry) => {
    if (normalizePromotionType(entry.type || entry.promotion_type) !== type) return false;
    if (promotionId && String(entry.id || entry.promotion_id || '') !== promotionId) return false;
    return true;
  });
  if (offerId) {
    const byOffer = matches.find((entry) => String(entry.offer_id || entry.ref_id || '') === offerId);
    if (byOffer) return byOffer;
  }
  return matches.find((entry) => entry.min_discounted_price || entry.min_price || entry.max_discounted_price || entry.max_price) || matches[0] || null;
}

function summarizePromotionRange(entry) {
  if (!entry) return null;
  const min = numberOrNull(entry.min_discounted_price || entry.min_price);
  const max = numberOrNull(entry.max_discounted_price || entry.max_price);
  const suggested = numberOrNull(entry.suggested_discounted_price || entry.suggested_price);
  if (min === null && max === null && suggested === null) return null;
  return {
    min,
    max,
    suggested
  };
}

function summarizeEstimatePromotionBenefit(entry, dealPrice) {
  if (!entry) return null;
  const amount = numberOrNull(entry.discount_meli_boost_amount);
  const percentage = numberOrNull(entry.discount_meli_boosted_percentage);
  const sellerPercentage = numberOrNull(entry.seller_percentage);
  const meliPercentage = numberOrNull(entry.meli_percentage);
  const totalPrice = numberOrNull(entry.total_price_for_boosted_offer);
  const effectivePercentage = meliPercentage !== null ? meliPercentage : percentage;
  const basePrice = numberOrNull(dealPrice || totalPrice);
  const computedAmount = amount !== null ? amount : basePrice !== null && effectivePercentage !== null
    ? roundMoney(basePrice * effectivePercentage / 100)
    : null;
  if (amount === null && percentage === null && sellerPercentage === null && meliPercentage === null && totalPrice === null) return null;
  return {
    amount: computedAmount,
    raw_amount: amount,
    amount_source: amount !== null ? 'api' : computedAmount !== null ? 'calculated_from_percentage' : null,
    percentage,
    seller_percentage: sellerPercentage,
    meli_percentage: meliPercentage,
    base_price: basePrice,
    total_price_for_boosted_offer: totalPrice,
    promotion_id: entry.id || entry.promotion_id || null,
    offer_id: entry.offer_id || entry.ref_id || null,
    source: 'seller_promotions'
  };
}

function buildCampaignPayload(input, promotionAdapter) {
  const payload = { promotion_type: promotionAdapter.type };
  copy(input, payload, 'name');
  copy(input, payload, 'sub_type');
  copy(input, payload, 'start_date');
  copy(input, payload, 'finish_date');
  copy(input, payload, 'buy_quantity');
  copy(input, payload, 'pay_quantity');
  copy(input, payload, 'discount_percentage');
  copy(input, payload, 'allow_combination');
  copy(input, payload, 'fixed_amount');
  copy(input, payload, 'fixed_percentage');
  copy(input, payload, 'min_purchase_amount');
  copy(input, payload, 'max_purchase_amount');
  copy(input, payload, 'partial_coupon_code');
  copy(input, payload, 'budget');
  copyAliases(input, payload);
  normalizeLocalDateField(payload, 'start_date', 'start');
  normalizeLocalDateField(payload, 'finish_date', 'finish');
  if (promotionAdapter.type === PROMOTION_TYPES.SELLER_CAMPAIGN && !payload.sub_type) {
    payload.sub_type = 'FLEXIBLE_PERCENTAGE';
  }
  return payload;
}

function normalizeLocalDateField(payload, field, edge) {
  if (!payload[field]) return;
  payload[field] = toLocalDateTime(payload[field], edge);
}

function toLocalDateTime(value, edge = 'start') {
  const text = String(value || '').trim();
  if (!text) return '';
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}T${edge === 'finish' ? '23:59:59' : '00:00:00'}`;
  const dateTime = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)/);
  if (!dateTime) return text;
  const time = dateTime[2].length === 5 ? `${dateTime[2]}:00` : dateTime[2];
  return `${dateTime[1]}T${time}`;
}

function copyAliases(input, output) {
  const aliases = {
    promotionId: 'promotion_id',
    offerId: 'offer_id',
    dealPrice: 'deal_price',
    topDealPrice: 'top_deal_price',
    startDate: 'start_date',
    finishDate: 'finish_date',
    removeLoyalty: 'remove_loyalty',
    subType: 'sub_type',
    buyQuantity: 'buy_quantity',
    payQuantity: 'pay_quantity',
    discountPercentage: 'discount_percentage',
    allowCombination: 'allow_combination',
    fixedAmount: 'fixed_amount',
    fixedPercentage: 'fixed_percentage',
    minPurchaseAmount: 'min_purchase_amount',
    maxPurchaseAmount: 'max_purchase_amount',
    partialCouponCode: 'partial_coupon_code'
  };
  for (const [from, to] of Object.entries(aliases)) {
    if (output[to] !== undefined) continue;
    if (input[from] !== undefined && input[from] !== null && input[from] !== '') output[to] = input[from];
  }
}

function copy(input, output, field) {
  if (input[field] !== undefined && input[field] !== null && input[field] !== '') output[field] = input[field];
}

function hasOwn(input, field) {
  return Boolean(input && Object.prototype.hasOwnProperty.call(input, field));
}

function normalizePromotionEntry(value) {
  const type = normalizePromotionType(value.type || value.promotion_type || value.campaign_type);
  const promotionAdapter = ADAPTERS[type] || null;
  const status = String(value.status || value.status_item || '').toLowerCase();
  const typeLabel = promotionAdapter ? promotionAdapter.label : type || 'Promoção';
  const isStackable = isStackablePromotionType(type);
  return {
    id: value.id || value.promotion_id || null,
    type,
    label: promotionDisplayName(value, typeLabel),
    typeLabel,
    status: status || null,
    api_status: status || null,
    status_bucket: apiStatusBucket(status),
    bucket: classifyStatus(status),
    offer_id: value.offer_id || value.offerId || value.ref_id || null,
    price: numberOrNull(value.price || value.new_price || value.deal_price),
    original_price: numberOrNull(value.original_price),
    min_price: numberOrNull(value.min_discounted_price || value.min_price),
    max_price: numberOrNull(value.max_discounted_price || value.max_price),
    suggested_price: numberOrNull(value.suggested_discounted_price || value.suggested_price),
    seller_percentage: numberOrNull(value.seller_percentage),
    meli_percentage: numberOrNull(value.meli_percentage),
    discount_meli_boosted_percentage: numberOrNull(value.discount_meli_boosted_percentage),
    discount_meli_boost_amount: numberOrNull(value.discount_meli_boost_amount),
    total_price_for_boosted_offer: numberOrNull(value.total_price_for_boosted_offer),
    is_stackable: isStackable,
    stackable_context: isStackable ? stackablePromotionContext(type, value) : null,
    payment_method: value.payment_method || null,
    sub_type: value.sub_type || null,
    start_date: value.start_date || null,
    end_date: value.end_date || value.finish_date || null,
    candidate: status === 'candidate',
    is_current_price: false,
    price_role: 'unknown',
    display_status: displayPromotionStatus(status, type, false, false),
    capabilities: promotionAdapter ? summarizeAdapter(promotionAdapter) : null,
    boost: summarizeBoost(value),
    raw: value
  };
}

function promotionEntryKey(entry) {
  const type = normalizePromotionType(entry && (entry.type || entry.promotion_type || entry.campaign_type));
  const id = entry && (entry.promotion_id || (/^P-|^C-|^LGH-/i.test(String(entry.id || '')) ? entry.id : null));
  return type && id ? `${type}:${id}` : '';
}

function promotionDisplayName(value, fallback) {
  const candidates = [
    value.name,
    value.title,
    value.promotion_name,
    value.campaign_name,
    value.description,
    value.raw && value.raw.name,
    value.raw && value.raw.title
  ];
  return candidates
    .map((candidate) => String(candidate || '').trim())
    .find(Boolean) || fallback || 'Promoção';
}

function groupPromotions(entries) {
  const groups = {
    active: [],
    scheduled: [],
    eligible: [],
    finished: [],
    other: []
  };
  for (const entry of entries) {
    if (groups[entry.bucket]) groups[entry.bucket].push(entry);
    else groups.other.push(entry);
  }
  return groups;
}

function classifyStatus(status) {
  if (['started', 'active'].includes(status)) return 'active';
  if (['pending', 'programmed', 'sync_requested'].includes(status)) return 'scheduled';
  if (['candidate'].includes(status)) return 'eligible';
  if (['finished', 'deleted', 'restore_requested'].includes(status)) return 'finished';
  return 'other';
}

function apiStatusBucket(status) {
  if (['started', 'active'].includes(status)) return 'applied';
  if (['pending', 'programmed', 'sync_requested'].includes(status)) return 'pending';
  if (['candidate'].includes(status)) return 'candidate';
  if (['finished', 'deleted', 'restore_requested'].includes(status)) return 'finished';
  return 'other';
}

function isStackablePromotionType(type) {
  return [
    PROMOTION_TYPES.BANK,
    PROMOTION_TYPES.SELLER_COUPON_CAMPAIGN
  ].includes(normalizePromotionType(type));
}

function stackablePromotionContext(type, value = {}) {
  const normalizedType = normalizePromotionType(type);
  if (normalizedType === PROMOTION_TYPES.BANK) return 'payment_method';
  if (normalizedType === PROMOTION_TYPES.SELLER_COUPON_CAMPAIGN) return 'seller_coupon';
  return String(value.stackable_context || 'discount').trim() || 'discount';
}

function annotatePriceWinningPromotion(entries, salePrice) {
  const hasSaleContext = Boolean(salePrice && !hasError(salePrice));
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const isCurrentPrice = hasSaleContext && isSalePricePromotion(entry, salePrice);
      const isStackable = entry && entry.is_stackable === true || isStackablePromotionType(entry && entry.type);
      return Object.assign({}, entry, {
        is_current_price: isCurrentPrice,
        price_role: hasSaleContext
          ? isCurrentPrice ? 'current_price' : isStackable ? 'stackable' : 'not_current_price'
          : 'unknown',
        display_status: displayPromotionStatus(entry.status, entry.type, isCurrentPrice, hasSaleContext)
      });
    })
    .sort(comparePromotionDisplayOrder);
}

function isSalePricePromotion(entry, salePrice) {
  const metadata = salePrice && salePrice.metadata ? salePrice.metadata : {};
  const campaignId = String(metadata.campaign_id || '').trim();
  const promotionId = String(metadata.promotion_id || '').trim();
  const ids = [
    entry && entry.id,
    entry && entry.promotion_id,
    entry && entry.offer_id
  ].map((value) => String(value || '').trim()).filter(Boolean);

  return Boolean(
    campaignId && ids.includes(campaignId) ||
    promotionId && ids.includes(promotionId)
  );
}

function displayPromotionStatus(status, type, isCurrentPrice, hasSaleContext) {
  const value = String(status || '').toLowerCase();
  if (['candidate'].includes(value)) return 'available';
  if (['pending', 'programmed', 'sync_requested'].includes(value)) return 'programmed';
  if (['finished', 'deleted', 'restore_requested'].includes(value)) return 'finished';
  if (['started', 'active'].includes(value)) {
    if (!hasSaleContext || isCurrentPrice || isStackablePromotionType(type)) return 'active';
    return 'programmed';
  }
  return 'informational';
}

function comparePromotionDisplayOrder(left, right) {
  const leftRank = promotionDisplayRank(left);
  const rightRank = promotionDisplayRank(right);
  if (leftRank !== rightRank) return leftRank - rightRank;
  return String(left && left.label || '').localeCompare(String(right && right.label || ''), 'pt-BR');
}

function promotionDisplayRank(entry) {
  const status = String(entry && entry.display_status || '');
  if (entry && entry.is_current_price === true) return 0;
  if (status === 'active' && entry && entry.is_stackable === true) return 1;
  if (status === 'active') return 2;
  if (status === 'programmed') return 3;
  if (status === 'available') return 4;
  if (status === 'finished') return 5;
  return 6;
}

function summarizePromotionSalePrice(salePrice) {
  if (!salePrice || hasError(salePrice)) return errorOrNull(salePrice);
  return {
    amount: numberOrNull(salePrice.amount),
    regular_amount: numberOrNull(salePrice.regular_amount),
    currency_id: salePrice.currency_id || null,
    reference_date: salePrice.reference_date || null,
    metadata: salePrice.metadata || {}
  };
}

function summarizeAdapters() {
  return Object.values(ADAPTERS).map(summarizeAdapter);
}

function summarizeAdapter(value) {
  return {
    type: value.type,
    label: value.label,
    readonly: value.readonly,
    offerCreate: Array.isArray(value.offerCreate) ? value.offerCreate : false,
    offerUpdate: Array.isArray(value.offerUpdate) ? value.offerUpdate : false,
    offerDelete: Array.isArray(value.offerDelete) ? value.offerDelete : false,
    campaignCreate: value.campaignCreate,
    campaignUpdate: value.campaignUpdate === true,
    campaignDelete: value.campaignDelete === true,
    directPriceChange: value.directPriceChange,
    activeDeletePolicy: value.activeDeletePolicy
  };
}

function summarizePromotionItem(item) {
  const summary = summarizeItem(item);
  return Object.assign({}, summary, {
    currency_id: item.currency_id || null,
    price: numberOrNull(item.price),
    original_price: numberOrNull(item.original_price),
    listing_type_id: item.listing_type_id || null,
    catalog_product_id: item.catalog_product_id || null,
    domain_id: item.domain_id || null
  });
}

function summarizeBoost(value) {
  if (!value || value.boosted_offer !== true) return null;
  return {
    boosted_offer: true,
    discount_meli_boosted_percentage: numberOrNull(value.discount_meli_boosted_percentage),
    discount_meli_boost_amount: numberOrNull(value.discount_meli_boost_amount),
    total_price_for_boosted_offer: numberOrNull(value.total_price_for_boosted_offer)
  };
}

function assertRequired(input, fields) {
  for (const field of fields || []) {
    const aliases = fieldAliases(field);
    if (aliases.some((name) => input[name] !== undefined && input[name] !== null && input[name] !== '')) continue;
    const err = new Error(`promotion_missing_${field}`);
    err.statusCode = 400;
    throw err;
  }
}

function fieldAliases(field) {
  const aliases = {
    promotion_id: ['promotion_id', 'promotionId'],
    offer_id: ['offer_id', 'offerId'],
    deal_price: ['deal_price', 'dealPrice'],
    top_deal_price: ['top_deal_price', 'topDealPrice'],
    start_date: ['start_date', 'startDate'],
    finish_date: ['finish_date', 'finishDate'],
    sub_type: ['sub_type', 'subType']
  };
  return aliases[field] || [field];
}

function assertStartedDeletePolicyDoesNotApply(input, promotionAdapter, current) {
  if (promotionAdapter.activeDeletePolicy !== 'cannot_delete_started') return;
  const entries = extractEntries(current);
  const matching = entries.find((entry) => normalizePromotionType(entry.type || entry.promotion_type) === promotionAdapter.type);
  if (!matching || !['started', 'active'].includes(String(matching.status || '').toLowerCase())) return;
  const err = new Error(`${promotionAdapter.type.toLowerCase()}_started_cannot_delete`);
  err.statusCode = 409;
  throw err;
}

function assertActionSupported(promotionAdapter, action) {
  if (!Array.isArray(promotionAdapter[action])) {
    const err = new Error(`promotion_${action}_not_supported`);
    err.statusCode = 409;
    throw err;
  }
}

function assertCampaignActionSupported(promotionAdapter, action) {
  const value = promotionAdapter[action];
  if (value === true || Array.isArray(value)) return;
  const err = new Error(`promotion_${action}_not_supported`);
  err.statusCode = 409;
  throw err;
}

function assertNotReadonly(promotionAdapter) {
  if (!promotionAdapter.readonly) return;
  const err = new Error('promotion_readonly');
  err.statusCode = 409;
  throw err;
}

function requireAdapter(type) {
  if (ADAPTERS[type]) return ADAPTERS[type];
  const err = new Error('promotion_type_not_supported');
  err.statusCode = 400;
  throw err;
}

function normalizePromotionType(value) {
  return String(value || '').trim().toUpperCase();
}

function extractEntries(source) {
  if (!source || hasError(source)) return [];
  if (Array.isArray(source)) return source;
  if (Array.isArray(source.results)) return source.results;
  if (Array.isArray(source.promotions)) return source.promotions;
  if (Array.isArray(source.offers)) return source.offers;
  if (Array.isArray(source.items)) return source.items;
  return [];
}

function hasError(value) {
  return Boolean(value && value.error);
}

async function optional(load, nullableStatuses = []) {
  try {
    return await load();
  } catch (err) {
    if (nullableStatuses.includes(Number(err && err.statusCode))) return null;
    return {
      error: err && err.message ? err.message : String(err || 'Erro inesperado.'),
      statusCode: err && err.statusCode ? err.statusCode : null
    };
  }
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function errorOrNull(value) {
  if (!value) return null;
  if (value.error) return { error: value.error, statusCode: value.statusCode || null };
  return null;
}

module.exports = {
  buildPromotionSummary,
  createCampaign,
  createOffer,
  deleteCampaign,
  deleteOffer,
  estimatePromotionImpact,
  listCampaigns,
  updateCampaign,
  updateOffer
};
