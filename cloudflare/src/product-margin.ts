type RecordValue = Record<string, unknown>;

function recordOrNull(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function centsOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number === null ? null : Math.round(number * 100);
}

function moneyFromCents(value: number | null): number | null {
  return value === null ? null : value / 100;
}

function roundPercentage(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildContributionMargin(estimateValue: unknown, productMatchValue: unknown) {
  const estimate = recordOrNull(estimateValue);
  const productMatch = recordOrNull(productMatchValue);
  const product = productMatch?.status === 'matched' ? recordOrNull(productMatch.product) : null;
  const salePriceCents = centsOrNull(estimate?.dealPrice);
  const youReceiveCents = centsOrNull(estimate?.youReceive);
  const productCostCents = centsOrNull(product?.cost);
  const variableCostCents = centsOrNull(product?.variableCost);
  const taxRate = numberOrNull(product?.taxRate);
  const missing: string[] = [];

  if (!product) missing.push('product');
  if (salePriceCents === null || salePriceCents <= 0) missing.push('sale_price');
  if (youReceiveCents === null || youReceiveCents < 0) missing.push('you_receive');
  if (product && (productCostCents === null || productCostCents < 0)) missing.push('product_cost');
  if (product && (variableCostCents === null || variableCostCents < 0)) missing.push('variable_cost');
  if (product && (taxRate === null || taxRate < 0 || taxRate > 100)) missing.push('tax_rate');

  const complete = missing.length === 0;
  const taxRateBps = complete ? Math.round(taxRate! * 100) : null;
  const taxAmountCents = complete ? Math.round(salePriceCents! * taxRateBps! / 10_000) : null;
  const amountCents = complete
    ? youReceiveCents! - productCostCents! - taxAmountCents! - variableCostCents!
    : null;
  const percentage = complete
    ? roundPercentage(amountCents! / salePriceCents! * 100)
    : null;

  return {
    complete,
    missing,
    currency_id: typeof estimate?.currency_id === 'string' ? estimate.currency_id : null,
    salePrice: moneyFromCents(salePriceCents),
    youReceive: moneyFromCents(youReceiveCents),
    productCost: moneyFromCents(productCostCents),
    taxRate,
    taxAmount: moneyFromCents(taxAmountCents),
    variableCost: moneyFromCents(variableCostCents),
    amount: moneyFromCents(amountCents),
    percentage,
    formula: 'you_receive - product_cost - tax_amount - variable_cost'
  };
}

export function enrichPromotionEstimateWithProduct(estimateValue: unknown, productMatch: unknown) {
  const estimate = recordOrNull(estimateValue) || {};
  return {
    ...estimate,
    productMatch,
    contributionMargin: buildContributionMargin(estimate, productMatch)
  };
}
