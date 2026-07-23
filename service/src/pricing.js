const { assertOwnedItem, summarizeItem } = require('./item-context');
const { sanitizeError } = require('./errors');

const MARKETPLACE_CONTEXT = 'channel_marketplace';
const BUSINESS_CONTEXT = 'channel_marketplace,user_type_business';

async function buildPriceSummary(client, itemId) {
  const item = await assertOwnedItem(client, itemId);
  const [
    prices,
    salePrice,
    automation,
    reference,
    catalogCompetition,
    catalogSync,
    promotions
  ] = await Promise.all([
    optional(() => client.getItemPrices(item.id, { showAllPrices: true, displayVersion: true })),
    optional(() => client.getItemSalePrice(item.id, { context: MARKETPLACE_CONTEXT })),
    optional(() => client.getPricingAutomation(item.id), { nullableStatuses: [404] }),
    optional(() => client.getPriceReference(item.id), { nullableStatuses: [404] }),
    optional(() => loadCatalogCompetition(client, item), { nullableStatuses: [400, 404] }),
    optional(() => loadCatalogSync(client, item), { nullableStatuses: [400, 404] }),
    optional(() => typeof client.getItemPromotions === 'function' ? client.getItemPromotions(item.id) : null, { nullableStatuses: [400, 404] })
  ]);
  const standardPrice = summarizeStandardPrice(prices, item);
  const summarizedSalePrice = summarizeSalePrice(salePrice);
  const activePrice = activeSellingPrice({ item, standardPrice, salePrice: summarizedSalePrice });
  const [costs, shippingCost] = await Promise.all([
    optional(() => loadListingCosts(client, item, activePrice), { nullableStatuses: [400, 404] }),
    optional(() => loadSellerShippingCost(client, item, activePrice), { nullableStatuses: [400, 404] })
  ]);
  const summarizedCosts = summarizeCosts(costs);
  const summarizedShippingCost = summarizeSellerShippingCost(shippingCost, item);
  const promotionBenefits = summarizePromotionBenefits(promotions, summarizedSalePrice, activePrice);
  const promotionBenefit = promotionBenefits.primary;

  return {
    item: summarizePricingItem(item),
    standardPrice,
    salePrice: summarizedSalePrice,
    prices: summarizePrices(prices),
    quantityPrices: summarizeQuantityPrices(prices),
    pricePerQuantity: summarizePricePerQuantity(prices),
    automation: summarizeAutomation(automation, item),
    reference: summarizeReference(reference),
    costs: summarizedCosts,
    sellerShippingCost: summarizedShippingCost,
    promotionBenefit,
    promotionBenefits,
    costBreakdown: buildCostBreakdown({
      activePrice,
      currency: item.currency_id || standardPrice.currency_id || summarizedSalePrice && summarizedSalePrice.currency_id || 'BRL',
      costs: summarizedCosts,
      shippingCost: summarizedShippingCost,
      promotionBenefit,
      stackableBenefits: promotionBenefits.stackable
    }),
    catalogCompetition: summarizeCatalogCompetition(catalogCompetition),
    catalogSync: summarizeCatalogSync(catalogSync),
    restrictions: buildPriceRestrictions(item, automation)
  };
}

async function buildCostProjection(client, item, price, promotionBenefit = null) {
  const activePrice = normalizeAmount(price);
  if (!activePrice) {
    const err = new Error('pricing_invalid_amount');
    err.statusCode = 400;
    throw err;
  }

  const [costs, shippingCost] = await Promise.all([
    optional(() => loadListingCosts(client, item, activePrice), { nullableStatuses: [400, 404] }),
    optional(() => loadSellerShippingCost(client, item, activePrice), { nullableStatuses: [400, 404] })
  ]);
  const summarizedCosts = summarizeCosts(costs);
  const summarizedShippingCost = summarizeSellerShippingCost(shippingCost, item);
  const currency = item.currency_id || 'BRL';
  const costBreakdown = buildCostBreakdown({
    activePrice,
    currency,
    costs: summarizedCosts,
    shippingCost: summarizedShippingCost,
    promotionBenefit
  });

  return {
    activePrice,
    currency_id: currency,
    costs: summarizedCosts,
    sellerShippingCost: summarizedShippingCost,
    promotionBenefit: promotionBenefit || null,
    costBreakdown
  };
}

async function updateStandardPrice(client, itemId, input = {}) {
  const item = await assertOwnedItem(client, itemId);
  const amount = normalizeAmount(input.amount);
  if (!amount) {
    const err = new Error('pricing_invalid_amount');
    err.statusCode = 400;
    throw err;
  }

  const [automation, promotions] = await Promise.all([
    optional(() => client.getPricingAutomation(item.id), { nullableStatuses: [404] }),
    optional(() => client.getItemPromotions(item.id), { nullableStatuses: [404] })
  ]);

  const restrictions = buildPriceRestrictions(item, automation, promotions);
  const blocker = restrictions.find((restriction) => restriction.level === 'block');
  if (blocker) {
    const err = new Error(blocker.code);
    err.statusCode = 409;
    err.details = blocker;
    throw err;
  }

  const updated = await client.updateItem(item.id, { price: amount });
  const ignoredWarning = findPriceIgnoredWarning(updated);
  if (ignoredWarning) {
    const err = new Error('pricing_automation_active');
    err.statusCode = 409;
    err.body = ignoredWarning;
    throw err;
  }

  return {
    ok: true,
    item: summarizePricingItem(updated),
    standardPrice: {
      amount: normalizeAmount(updated.price),
      currency_id: updated.currency_id || item.currency_id || null,
      source: 'items_put'
    },
    warnings: summarizeUpdateWarnings(updated)
  };
}

async function loadListingCosts(client, item, price) {
  if (!item || !item.site_id || !price) return null;
  const params = {
    price,
    currency_id: item.currency_id,
    category_id: item.category_id,
    listing_type_id: item.listing_type_id
  };
  const shipping = item.shipping || {};
  if (shipping.logistic_type) params.logistic_type = shipping.logistic_type;
  if (shipping.mode) params.shipping_mode = shipping.mode;
  return client.getListingPrices(item.site_id, params);
}

async function loadSellerShippingCost(client, item, price) {
  if (!client || typeof client.getSellerShippingCost !== 'function') return null;
  if (!item || !item.seller_id || !price) return null;
  const shipping = item.shipping || {};
  const params = {
    item_id: item.id,
    item_price: price,
    listing_type_id: item.listing_type_id,
    mode: shipping.mode,
    logistic_type: shipping.logistic_type,
    condition: item.condition,
    currency_id: item.currency_id,
    category_id: item.category_id,
    free_shipping: shipping.free_shipping === true ? 'true' : 'false',
    verbose: 'true'
  };
  return client.getSellerShippingCost(item.seller_id, params);
}

async function loadCatalogCompetition(client, item) {
  if (!item || (!item.catalog_listing && !item.catalog_product_id)) return null;
  return client.getCatalogCompetition(item.id);
}

async function loadCatalogSync(client, item) {
  if (!item || !Array.isArray(item.item_relations) || !item.item_relations.length) return null;
  return client.getBuyboxSync(item.id);
}

function summarizePricingItem(item) {
  const summary = summarizeItem(item);
  return Object.assign({}, summary, {
    currency_id: item.currency_id || null,
    price: normalizeAmount(item.price),
    base_price: normalizeAmount(item.base_price),
    original_price: normalizeAmount(item.original_price),
    listing_type_id: item.listing_type_id || null,
    shipping: item.shipping ? {
      mode: item.shipping.mode || null,
      logistic_type: item.shipping.logistic_type || null,
      free_shipping: Boolean(item.shipping.free_shipping)
    } : null,
    catalog_product_id: item.catalog_product_id || null,
    domain_id: item.domain_id || null,
    channels: Array.isArray(item.channels) ? item.channels : []
  });
}

function summarizeStandardPrice(prices, item) {
  const standard = findStandardPrice(prices);
  return {
    id: standard && standard.id ? String(standard.id) : null,
    amount: normalizeAmount(standard && standard.amount) || normalizeAmount(item.price),
    regular_amount: normalizeAmount(standard && standard.regular_amount),
    currency_id: (standard && standard.currency_id) || item.currency_id || null,
    last_updated: standard && standard.last_updated ? standard.last_updated : null,
    source: standard ? 'items_prices' : 'items'
  };
}

function summarizeSalePrice(salePrice) {
  if (!salePrice || salePrice.error) return errorOrNull(salePrice);
  return {
    price_id: salePrice.price_id || null,
    amount: normalizeAmount(salePrice.amount),
    regular_amount: normalizeAmount(salePrice.regular_amount),
    currency_id: salePrice.currency_id || null,
    reference_date: salePrice.reference_date || null,
    promotion: salePrice.metadata && salePrice.metadata.promotion_id ? {
      id: salePrice.metadata.promotion_id,
      type: salePrice.metadata.promotion_type || null
    } : null,
    metadata: salePrice.metadata || {}
  };
}

function summarizePrices(prices) {
  if (!prices || prices.error) return { items: [], version: null, error: prices ? prices.error : null };
  return {
    version: prices.version || null,
    items: (Array.isArray(prices.prices) ? prices.prices : []).map((price) => ({
      id: price.id || null,
      type: price.type || null,
      amount: normalizeAmount(price.amount),
      regular_amount: normalizeAmount(price.regular_amount),
      currency_id: price.currency_id || null,
      last_updated: price.last_updated || null,
      conditions: price.conditions || {},
      amount_tax_inclusion_type: price.amount_tax_inclusion_type || null,
      metadata: price.metadata || {}
    }))
  };
}

function summarizeQuantityPrices(prices) {
  if (!prices || prices.error || !Array.isArray(prices.prices)) return [];
  return prices.prices
    .filter((price) => hasMinPurchaseUnit(price) && hasContext(price, 'user_type_business'))
    .map((price) => ({
      id: price.id || null,
      type: price.type || null,
      amount: normalizeAmount(price.amount),
      currency_id: price.currency_id || null,
      min_purchase_unit: normalizeInteger(price.conditions && price.conditions.min_purchase_unit),
      net: price.amount_tax_inclusion_type === 'net',
      conditions: price.conditions || {}
    }))
    .sort((left, right) => left.min_purchase_unit - right.min_purchase_unit);
}

function summarizePricePerQuantity(prices) {
  if (!prices || prices.error || !Array.isArray(prices.price_per_quantity)) return [];
  return prices.price_per_quantity
    .map((price) => ({
      id: price.id || null,
      type: price.type || null,
      percentage: normalizeAmount(price.percentage),
      min_purchase_unit: normalizeInteger(price.conditions && price.conditions.min_purchase_unit),
      eligible: price.conditions ? price.conditions.eligible !== false : null,
      conditions: price.conditions || {}
    }))
    .sort((left, right) => left.min_purchase_unit - right.min_purchase_unit);
}

function summarizeAutomation(automation, item) {
  const hasTag = Array.isArray(item && item.tags) && item.tags.includes('dynamic_standard_price');
  if (!automation || automation.error) {
    return {
      active: hasTag,
      detectedByTag: hasTag,
      status: null,
      rule: null,
      min_price: null,
      max_price: null,
      detail: null,
      error: automation && automation.error ? automation.error : null
    };
  }
  return {
    active: String(automation.status || '').toUpperCase() === 'ACTIVE' || hasTag,
    detectedByTag: hasTag,
    status: automation.status || null,
    rule: automation.rule || null,
    min_price: normalizeAmount(automation.min_price),
    max_price: normalizeAmount(automation.max_price),
    detail: automation.status_detail || null,
    raw: automation
  };
}

function summarizeReference(reference) {
  if (!reference || reference.error) return errorOrNull(reference);
  return {
    item_id: reference.item_id || null,
    status: reference.status || null,
    currency_id: reference.currency_id || null,
    current_price: money(reference.current_price),
    suggested_price: money(reference.suggested_price),
    lowest_price: money(reference.lowest_price),
    internal_price: money(reference.internal_price),
    costs: reference.costs || null,
    applicable: reference.applicable_suggestion === true,
    percent_difference: normalizeAmount(reference.percent_difference),
    promotion_detail: reference.promotion_detail || null,
    last_updated: reference.last_updated || null
  };
}

function summarizeCosts(costs) {
  if (!costs || costs.error) return errorOrNull(costs);
  const rows = Array.isArray(costs) ? costs : [costs];
  return rows.flatMap((row) => Array.isArray(row) ? row : [row]).map(summarizeCostRow).filter(Boolean);
}

function summarizeCostRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    currency_id: row.currency_id || null,
    listing_type_id: row.listing_type_id || null,
    listing_type_name: row.listing_type_name || null,
    listing_exposure: row.listing_exposure || null,
    listing_fee_amount: normalizeAmount(row.listing_fee_amount),
    sale_fee_amount: normalizeAmount(row.sale_fee_amount),
    sale_fee_details: row.sale_fee_details || null,
    listing_fee_details: row.listing_fee_details || null,
    requires_picture: row.requires_picture === true
  };
}

function summarizeSellerShippingCost(value, item) {
  const shipping = item && item.shipping ? item.shipping : {};
  if ((!value || value.error) && shipping.free_shipping !== true) {
    return {
      amount: 0,
      currency_id: item && item.currency_id || null,
      free_shipping: false,
      paid_by: 'buyer',
      source: 'items.shipping',
      complete: true,
      error: value && value.error ? value.error : null
    };
  }
  if (!value || value.error) return errorOrNull(value);

  const coverage = value.coverage || {};
  const allCountry = coverage.all_country || {};
  const amount = amountOrNull(allCountry.list_cost);
  return {
    amount,
    currency_id: allCountry.currency_id || item && item.currency_id || null,
    billable_weight: normalizeInteger(allCountry.billable_weight),
    free_shipping: shipping.free_shipping === true,
    paid_by: shipping.free_shipping === true ? 'seller' : 'buyer',
    discount: summarizeShippingDiscount(coverage.discount),
    source: 'shipping_options_free',
    complete: amount !== null,
    raw: value
  };
}

function summarizeShippingDiscount(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    rate: amountOrNull(value.rate),
    type: value.type || null,
    promoted_amount: amountOrNull(value.promoted_amount)
  };
}

function summarizePromotionBenefits(promotions, salePrice, activePrice) {
  const entries = extractPromotionEntries(promotions);
  const primaryEntry = findSalePricePromotionEntry(entries, salePrice) ||
    entries.find((candidate) => candidate && candidate.boosted_offer === true) ||
    null;
  const primary = summarizePromotionBenefit(primaryEntry, activePrice, 'primary');
  const stackable = entries
    .filter((entry) => entry !== primaryEntry && isStackablePromotionEntry(entry))
    .map((entry) => summarizePromotionBenefit(entry, stackableBenefitBasePrice(entry, activePrice), 'stackable'))
    .filter(Boolean);

  return {
    primary,
    stackable,
    all: [primary].concat(stackable).filter(Boolean)
  };
}

function summarizePromotionBenefit(entry, basePrice, role = 'primary') {
  if (!entry) return null;
  const amount = amountOrNull(entry.discount_meli_boost_amount);
  const percentage = amountOrNull(entry.discount_meli_boosted_percentage);
  const sellerPercentage = amountOrNull(entry.seller_percentage);
  const meliPercentage = amountOrNull(entry.meli_percentage);
  const effectivePercentage = meliPercentage !== null ? meliPercentage : percentage;
  const baseAmount = amountOrNull(basePrice);
  const computedAmount = amount !== null ? amount : baseAmount !== null && effectivePercentage !== null
    ? roundMoney(baseAmount * effectivePercentage / 100)
    : null;
  if (amount === null && percentage === null && sellerPercentage === null && meliPercentage === null) return null;

  return {
    amount: computedAmount,
    raw_amount: amount,
    amount_source: amount !== null ? 'api' : computedAmount !== null ? 'calculated_from_percentage' : null,
    percentage,
    seller_percentage: sellerPercentage,
    meli_percentage: meliPercentage,
    base_price: baseAmount,
    role,
    label: entry.name || entry.label || null,
    type: String(entry.type || entry.promotion_type || '').toUpperCase() || null,
    is_stackable: isStackablePromotionEntry(entry),
    payment_method: entry.payment_method || null,
    total_price_for_boosted_offer: amountOrNull(entry.total_price_for_boosted_offer),
    promotion_id: entry.id || entry.promotion_id || null,
    offer_id: entry.offer_id || entry.ref_id || null,
    source: 'seller_promotions'
  };
}

function stackableBenefitBasePrice(entry, activePrice) {
  return amountOrNull(entry && entry.total_price_for_boosted_offer) || amountOrNull(activePrice);
}

function isStackablePromotionEntry(entry) {
  const type = String(entry && (entry.type || entry.promotion_type || entry.campaign_type) || '').toUpperCase();
  return Boolean(entry && entry.is_stackable === true || type === 'BANK' || type === 'SELLER_COUPON_CAMPAIGN');
}

function buildCostBreakdown({ activePrice, currency, costs, shippingCost, promotionBenefit, stackableBenefits = [] }) {
  const commission = summarizeCommissionCost(costs);
  const shipping = shippingCost && !shippingCost.error ? shippingCost : null;
  const benefitAmount = amountOrNull(promotionBenefit && promotionBenefit.amount) || 0;
  const missing = [];
  if (amountOrNull(activePrice) === null) missing.push('active_price');
  if (!commission) missing.push('commission');
  if (!shipping || shipping.amount === null || shipping.amount === undefined) missing.push('shipping');

  const complete = missing.length === 0;
  const youReceive = complete
    ? roundMoney(activePrice - commission.amount - shipping.amount + benefitAmount)
    : null;

  return {
    active_price: amountOrNull(activePrice),
    currency_id: currency || 'BRL',
    commission,
    shipping,
    promotion_benefit: promotionBenefit || null,
    stackable_benefits: Array.isArray(stackableBenefits) ? stackableBenefits : [],
    you_receive: complete && youReceive >= 0 ? youReceive : null,
    complete,
    missing,
    formula: complete ? 'active_price - commission - shipping + promotion_benefit' : null
  };
}

function summarizeCommissionCost(costs) {
  const row = Array.isArray(costs) ? costs.find((entry) => amountOrNull(entry && entry.sale_fee_amount) !== null) : null;
  if (!row) return null;
  const details = row.sale_fee_details || {};
  return {
    amount: amountOrNull(row.sale_fee_amount),
    percentage: amountOrNull(details.percentage_fee),
    gross_amount: amountOrNull(details.gross_amount),
    fixed_fee: amountOrNull(details.fixed_fee),
    financing_add_on_fee: amountOrNull(details.financing_add_on_fee),
    currency_id: row.currency_id || null,
    source: 'listing_prices'
  };
}

function activeSellingPrice({ item, standardPrice, salePrice }) {
  const saleAmount = amountOrNull(salePrice && salePrice.amount);
  const standardAmount = amountOrNull(standardPrice && standardPrice.amount);
  const itemAmount = amountOrNull(item && item.price);
  return saleAmount !== null ? saleAmount : standardAmount !== null ? standardAmount : itemAmount;
}

function findSalePricePromotionEntry(entries, salePrice) {
  const metadata = salePrice && salePrice.metadata ? salePrice.metadata : {};
  const campaignId = String(metadata.campaign_id || '').trim();
  const promotionId = String(metadata.promotion_id || '').trim();
  if (!campaignId && !promotionId) return null;
  return (Array.isArray(entries) ? entries : []).find((entry) => {
    const ids = [
      entry && entry.id,
      entry && entry.promotion_id,
      entry && entry.offer_id,
      entry && entry.ref_id
    ].map((value) => String(value || '').trim()).filter(Boolean);
    return Boolean(campaignId && ids.includes(campaignId) || promotionId && ids.includes(promotionId));
  }) || null;
}

function summarizeCatalogCompetition(competition) {
  if (!competition || competition.error) return errorOrNull(competition);
  return {
    item_id: competition.item_id || null,
    status: competition.status || null,
    current_price: normalizeAmount(competition.current_price),
    price_to_win: normalizeAmount(competition.price_to_win),
    currency_id: competition.currency_id || null,
    visit_share: competition.visit_share || null,
    consistent: competition.consistent === true,
    competitors_sharing_first_place: competition.competitors_sharing_first_place ?? null,
    reason: Array.isArray(competition.reason) ? competition.reason : [],
    boosts: Array.isArray(competition.boosts) ? competition.boosts : [],
    winner: competition.winner || null,
    catalog_product_id: competition.catalog_product_id || null
  };
}

function summarizeCatalogSync(sync) {
  if (!sync || sync.error) return errorOrNull(sync);
  return {
    item_id: sync.item_id || null,
    status: sync.status || null,
    relations: Array.isArray(sync.relations) ? sync.relations : [],
    timestamp: sync.timestamp || null
  };
}

function buildPriceRestrictions(item, automation, promotions) {
  const restrictions = [];
  const normalizedAutomation = summarizeAutomation(automation, item);
  if (normalizedAutomation.active) {
    restrictions.push({
      code: 'pricing_automation_active',
      level: 'block',
      message: 'Preço automático ativo.'
    });
  }

  if (isClosedItem(item)) {
    restrictions.push({
      code: item.has_bids === true ? 'item_closed_with_bids' : 'item_closed',
      level: 'block',
      message: item.has_bids === true ? 'Anúncio encerrado com vendas.' : 'Anúncio encerrado.'
    });
  }

  const promotionBlocker = findPromotionPriceBlocker(promotions);
  if (promotionBlocker) restrictions.push(promotionBlocker);
  return restrictions;
}

function findPromotionPriceBlocker(promotions) {
  const entries = extractPromotionEntries(promotions);
  const blockedTypes = new Set(['MARKETPLACE_CAMPAIGN', 'VOLUME', 'BANK']);
  const blocked = entries.find((entry) => blockedTypes.has(String(entry.type || entry.promotion_type || '').toUpperCase()) &&
    isLivePromotionStatus(entry.status));
  if (!blocked) return null;
  return {
    code: 'price_blocked_by_promotion',
    level: 'block',
    promotionType: String(blocked.type || blocked.promotion_type || '').toUpperCase(),
    promotionId: blocked.id || blocked.promotion_id || null,
    offerId: blocked.offer_id || null,
    message: 'Essa promoção exige remover a oferta antes de alterar preço.'
  };
}

function findPriceIgnoredWarning(updated) {
  const warnings = Array.isArray(updated && updated.warnings) ? updated.warnings : [];
  return warnings.find((warning) => {
    const text = JSON.stringify(warning || {}).toLowerCase();
    return text.includes('item.price.not_modifiable') || text.includes('dynamic pricing');
  }) || null;
}

function summarizeUpdateWarnings(updated) {
  return (Array.isArray(updated && updated.warnings) ? updated.warnings : []).map((warning) => ({
    code: warning.code || warning.cause_id || null,
    message: warning.message || sanitizeError(warning)
  }));
}

function extractPromotionEntries(promotions) {
  if (!promotions || promotions.error) return [];
  if (Array.isArray(promotions)) return promotions;
  if (Array.isArray(promotions.results)) return promotions.results;
  if (Array.isArray(promotions.promotions)) return promotions.promotions;
  if (Array.isArray(promotions.offers)) return promotions.offers;
  return [];
}

function isLivePromotionStatus(value) {
  return ['started', 'active', 'pending', 'programmed'].includes(String(value || '').toLowerCase());
}

async function optional(load, options = {}) {
  try {
    return await load();
  } catch (err) {
    const nullableStatuses = options.nullableStatuses || [];
    if (nullableStatuses.includes(Number(err && err.statusCode))) return null;
    return {
      error: sanitizeError(err),
      statusCode: err && err.statusCode ? err.statusCode : null
    };
  }
}

function findStandardPrice(prices) {
  const rows = Array.isArray(prices && prices.prices) ? prices.prices : [];
  return rows.find((price) => price.type === 'standard' && !hasMinPurchaseUnit(price) && !hasContext(price, 'user_type_business')) ||
    rows.find((price) => price.type === 'standard') ||
    null;
}

function hasMinPurchaseUnit(price) {
  return normalizeInteger(price && price.conditions && price.conditions.min_purchase_unit) > 0;
}

function hasContext(price, context) {
  const values = price && price.conditions && Array.isArray(price.conditions.context_restrictions)
    ? price.conditions.context_restrictions
    : [];
  return values.includes(context);
}

function money(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    amount: normalizeAmount(value.amount),
    usd_amount: normalizeAmount(value.usd_amount)
  };
}

function normalizeAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function amountOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? roundMoney(parsed) : null;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function normalizeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function errorOrNull(value) {
  if (!value) return null;
  if (value.error) return { error: value.error, statusCode: value.statusCode || null };
  return null;
}

function isClosedWithBids(item) {
  return Boolean(isClosedItem(item) && item.has_bids === true);
}

function isClosedItem(item) {
  return Boolean(item && String(item.status || '').toLowerCase() === 'closed');
}

module.exports = {
  buildCostProjection,
  buildPriceSummary,
  updateStandardPrice
};
