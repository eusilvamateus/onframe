import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContributionMargin, enrichPromotionEstimateWithProduct } from '../src/product-margin.ts';

test('margem de contribuicao usa o valor liquido oficial da promocao', () => {
  const margin = buildContributionMargin({
    dealPrice: 361.99,
    youReceive: 263.58,
    currency_id: 'BRL',
    complete: true
  }, {
    status: 'matched',
    product: { cost: 170, taxRate: 10, variableCost: 5 }
  });

  assert.deepEqual(margin, {
    complete: true,
    missing: [],
    currency_id: 'BRL',
    salePrice: 361.99,
    youReceive: 263.58,
    productCost: 170,
    taxRate: 10,
    taxAmount: 36.2,
    variableCost: 5,
    amount: 52.38,
    percentage: 14.47,
    formula: 'you_receive - product_cost - tax_amount - variable_cost'
  });
});

test('margem de contribuicao preserva resultado negativo', () => {
  const margin = buildContributionMargin({
    dealPrice: 100,
    youReceive: 70,
    currency_id: 'BRL'
  }, {
    status: 'matched',
    product: { cost: 80, taxRate: 10, variableCost: 5 }
  });

  assert.equal(margin.amount, -25);
  assert.equal(margin.percentage, -25);
  assert.equal(margin.complete, true);
});

test('margem de contribuicao informa dados ausentes sem estimar valores', () => {
  const withoutProduct = buildContributionMargin({
    dealPrice: 100,
    youReceive: 70,
    currency_id: 'BRL'
  }, {
    status: 'unmatched',
    reason: 'product_not_found',
    product: null
  });
  assert.deepEqual(withoutProduct.missing, ['product']);
  assert.equal(withoutProduct.amount, null);
  assert.equal(withoutProduct.complete, false);

  const withoutFinancialEstimate = buildContributionMargin({
    dealPrice: 100,
    youReceive: null,
    currency_id: 'BRL',
    complete: false
  }, {
    status: 'matched',
    product: { cost: 40, taxRate: 5, variableCost: 2 }
  });
  assert.deepEqual(withoutFinancialEstimate.missing, ['you_receive']);
  assert.equal(withoutFinancialEstimate.amount, null);
  assert.equal(withoutFinancialEstimate.complete, false);
});

test('estimativa enriquecida preserva o contrato financeiro e associa o produto', () => {
  const estimate = { dealPrice: 100, youReceive: 70, currency_id: 'BRL', promotion: { id: 'P-MLB1' } };
  const productMatch = { status: 'matched', sku: 'SKU-1', product: { cost: 40, taxRate: 5, variableCost: 2 } };
  const enriched = enrichPromotionEstimateWithProduct(estimate, productMatch);

  assert.deepEqual(enriched.promotion, estimate.promotion);
  assert.equal(enriched.productMatch, productMatch);
  assert.equal(enriched.contributionMargin.amount, 23);
  assert.equal(enriched.contributionMargin.percentage, 23);
});
