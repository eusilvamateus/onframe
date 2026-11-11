type RecordValue = Record<string, unknown>;

function recordOrNull(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : null;
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

function roundMarginAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
}

function roundPercentage(value: number): number {
  return Math.round(value * 100) / 100;
}

function displayDecimalPlaces(value: unknown): number {
  const places = Number(value);
  return Number.isInteger(places) && places >= 0 && places <= 8 ? places : 2;
}

function customCosts(value: unknown, salePriceCents: number | null) {
  if (!Array.isArray(value) || salePriceCents === null) return null;
  const costs = [];
  for (const entryValue of value) {
    const entry = recordOrNull(entryValue);
    const description = typeof entry?.description === 'string' ? entry.description.trim() : '';
    const type = entry?.type;
    const valueNumber = numberOrNull(entry?.value);
    if (
      !description ||
      (type !== 'fixed' && type !== 'percentage') ||
      valueNumber === null ||
      valueNumber < 0 ||
      (type === 'percentage' && valueNumber > 100)
    )
      return null;
    const amountCents =
      type === 'fixed'
        ? Math.round(valueNumber * 100)
        : Math.round((salePriceCents * Math.round(valueNumber * 100)) / 10_000);
    costs.push({
      description,
      type,
      value: valueNumber,
      base: type === 'percentage' ? 'sale_price' : 'unit',
      amount: moneyFromCents(amountCents),
      amountCents
    });
  }
  return costs;
}

export function buildContributionMargin(estimateValue: unknown, productMatchValue: unknown) {
  const estimate = recordOrNull(estimateValue);
  const productMatch = recordOrNull(productMatchValue);
  const product = productMatch?.status === 'matched' ? recordOrNull(productMatch.product) : null;
  const costDecimalPlaces = displayDecimalPlaces(productMatch?.costDecimalPlaces);
  const tax = recordOrNull(productMatch?.tax);
  const salePriceCents = centsOrNull(estimate?.dealPrice);
  const youReceiveCents = centsOrNull(estimate?.youReceive);
  const productCost = numberOrNull(product?.cost);
  const taxRate = tax?.configured === true ? numberOrNull(tax.rate) : null;
  const taxBase = tax?.configured === true && tax.base === 'sale_price' ? 'sale_price' : null;
  const taxSource = tax?.configured === true && typeof tax.source === 'string' ? tax.source : null;
  const taxSourceId = tax?.configured === true && typeof tax.sourceId === 'string' ? tax.sourceId : null;
  const productMinimum = numberOrNull(product?.minimumContributionMargin);
  const workspaceMinimum = numberOrNull(productMatch?.workspaceMinimumContributionMargin);
  const minimumPercentage = productMinimum ?? workspaceMinimum;
  const minimumSource = productMinimum !== null ? 'product' : workspaceMinimum !== null ? 'workspace' : null;
  const calculatedCustomCosts = product ? customCosts(product.customCosts, salePriceCents) : null;
  const missing: string[] = [];

  if (!product) missing.push('product');
  if (salePriceCents === null || salePriceCents <= 0) missing.push('sale_price');
  if (youReceiveCents === null || youReceiveCents < 0) missing.push('you_receive');
  if (product && (productCost === null || productCost < 0)) missing.push('product_cost');
  if (product && calculatedCustomCosts === null) missing.push('custom_costs');
  if (product && (taxRate === null || taxRate < 0 || taxRate > 100 || taxBase !== 'sale_price'))
    missing.push('tax_rate');

  const complete = missing.length === 0;
  const taxRateBps = complete ? Math.round(taxRate! * 100) : null;
  const taxAmountCents = complete ? Math.round((salePriceCents! * taxRateBps!) / 10_000) : null;
  const customCostCents = complete ? calculatedCustomCosts!.reduce((total, cost) => total + cost.amountCents, 0) : null;
  const preciseAmount = complete
    ? youReceiveCents! / 100 - productCost! - taxAmountCents! / 100 - customCostCents! / 100
    : null;
  const amount = preciseAmount === null ? null : roundMarginAmount(preciseAmount);
  const percentage = complete ? roundPercentage((preciseAmount! / (salePriceCents! / 100)) * 100) : null;

  return {
    complete,
    missing,
    currency_id: typeof estimate?.currency_id === 'string' ? estimate.currency_id : null,
    costDecimalPlaces,
    salePrice: moneyFromCents(salePriceCents),
    youReceive: moneyFromCents(youReceiveCents),
    productCost,
    taxRate,
    taxBase,
    taxSource,
    taxSourceId,
    taxAmount: moneyFromCents(taxAmountCents),
    customCosts: calculatedCustomCosts?.map(({ amountCents: _amountCents, ...cost }) => cost) || [],
    customCost: moneyFromCents(customCostCents),
    amount,
    percentage,
    minimumPercentage,
    minimumSource,
    minimumStatus:
      !complete || minimumPercentage === null
        ? null
        : percentage! < minimumPercentage
          ? 'below_minimum'
          : 'meets_minimum',
    formula: 'you_receive - product_cost - tax_amount - custom_costs'
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

export function enrichPriceSummaryWithProduct(summaryValue: unknown, productMatch: unknown) {
  const summary = recordOrNull(summaryValue) || {};
  const salePrice = recordOrNull(summary.salePrice);
  const standardPrice = recordOrNull(summary.standardPrice);
  const item = recordOrNull(summary.item);
  const costBreakdown = recordOrNull(summary.costBreakdown);
  const saleAmount = numberOrNull(salePrice?.amount);
  const standardAmount = numberOrNull(standardPrice?.amount);
  const activePrice = saleAmount !== null && saleAmount > 0 ? saleAmount : standardAmount;
  const currency =
    (typeof salePrice?.currency_id === 'string' && salePrice.currency_id) ||
    (typeof standardPrice?.currency_id === 'string' && standardPrice.currency_id) ||
    (typeof item?.currency_id === 'string' && item.currency_id) ||
    null;
  const estimate = {
    dealPrice: activePrice,
    youReceive: costBreakdown?.you_receive,
    currency_id: currency
  };

  return {
    ...summary,
    productMatch,
    contributionMargin: buildContributionMargin(estimate, productMatch)
  };
}
