function summarizePromotionFinancial(entry, options = {}) {
  if (!entry) return null;
  const originalPrice = promotionOriginalPrice(entry, options.originalPrice);
  const meliPercentage = promotionContributionPercentage(entry, 'meli');
  const sellerPercentage = promotionContributionPercentage(entry, 'seller');
  const meliContribution = summarizeContribution(meliPercentage, originalPrice);
  const sellerContribution = summarizeContribution(sellerPercentage, originalPrice);
  const feeReduction = summarizeFeeReduction(entry);
  if (!meliContribution && !sellerContribution && !feeReduction) return null;

  return {
    meli_contribution: meliContribution,
    seller_contribution: sellerContribution,
    fee_reduction: feeReduction,
    original_price: originalPrice,
    active_price: amountOrNull(options.activePrice),
    role: options.role || 'primary',
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

function isStackablePromotionEntry(entry) {
  const type = String(entry && (entry.type || entry.promotion_type || entry.campaign_type) || '').toUpperCase();
  return Boolean(entry && entry.is_stackable === true || type === 'BANK' || type === 'SELLER_COUPON_CAMPAIGN');
}

function promotionOriginalPrice(entry, fallback) {
  const raw = entry && entry.raw && typeof entry.raw === 'object' ? entry.raw : {};
  return amountOrNull(entry && entry.original_price) ||
    amountOrNull(raw.original_price) ||
    amountOrNull(fallback);
}

function promotionContributionPercentage(entry, party) {
  const raw = entry && entry.raw && typeof entry.raw === 'object' ? entry.raw : {};
  const benefits = entry && entry.benefits || raw.benefits || {};
  const topLevel = party === 'meli' ? entry && entry.meli_percentage : entry && entry.seller_percentage;
  const rawTopLevel = party === 'meli' ? raw.meli_percentage : raw.seller_percentage;
  const benefitValue = party === 'meli' ? benefits.meli_percent : benefits.seller_percent;
  return amountOrNull(topLevel) ?? amountOrNull(rawTopLevel) ?? amountOrNull(benefitValue);
}

function summarizeContribution(percentage, originalPrice) {
  if (percentage === null || percentage === undefined) return null;
  return {
    percentage,
    amount: originalPrice !== null && originalPrice !== undefined
      ? roundMoney(originalPrice * percentage / 100)
      : null,
    amount_source: originalPrice !== null && originalPrice !== undefined ? 'calculated_from_original_price' : null
  };
}

function summarizeFeeReduction(entry) {
  const raw = entry && entry.raw && typeof entry.raw === 'object' ? entry.raw : {};
  const boosted = entry && entry.boosted_offer === true || raw.boosted_offer === true;
  const amount = amountOrNull(entry && entry.discount_meli_boost_amount) ?? amountOrNull(raw.discount_meli_boost_amount);
  const percentage = amountOrNull(entry && entry.discount_meli_boosted_percentage) ?? amountOrNull(raw.discount_meli_boosted_percentage);
  if (!boosted) return null;
  return {
    amount,
    percentage,
    amount_source: amount !== null ? 'api' : null,
    boosted_offer: boosted
  };
}

function amountOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? roundMoney(parsed) : null;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

module.exports = {
  isStackablePromotionEntry,
  summarizePromotionFinancial
};
