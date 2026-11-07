import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContributionMargin, enrichPromotionEstimateWithProduct } from '../src/product-margin.ts';

test('margem de contribuicao usa o valor liquido oficial da promocao', () => {
  const margin = buildContributionMargin(
    {
      dealPrice: 361.99,
      youReceive: 263.58,
      currency_id: 'BRL',
      complete: true
    },
    {
      status: 'matched',
      tax: { configured: true, rate: 10, base: 'sale_price', source: 'account', sourceId: 'account-1' },
      product: {
        cost: 170,
        customCosts: [
          { description: 'Embalagem', type: 'fixed', value: 5 },
          { description: 'Comissão comercial', type: 'percentage', value: 2 }
        ]
      }
    }
  );

  assert.deepEqual(margin, {
    complete: true,
    missing: [],
    currency_id: 'BRL',
    salePrice: 361.99,
    youReceive: 263.58,
    productCost: 170,
    taxRate: 10,
    taxBase: 'sale_price',
    taxSource: 'account',
    taxSourceId: 'account-1',
    taxAmount: 36.2,
    customCosts: [
      { description: 'Embalagem', type: 'fixed', value: 5, base: 'unit', amount: 5 },
      { description: 'Comissão comercial', type: 'percentage', value: 2, base: 'sale_price', amount: 7.24 }
    ],
    customCost: 12.24,
    amount: 45.14,
    percentage: 12.47,
    formula: 'you_receive - product_cost - tax_amount - custom_costs'
  });
});

test('margem de contribuicao preserva resultado negativo', () => {
  const margin = buildContributionMargin(
    {
      dealPrice: 100,
      youReceive: 70,
      currency_id: 'BRL'
    },
    {
      status: 'matched',
      tax: { configured: true, rate: 10, base: 'sale_price', source: 'product', sourceId: 'product-1' },
      product: { cost: 80, customCosts: [{ description: 'Embalagem', type: 'fixed', value: 5 }] }
    }
  );

  assert.equal(margin.amount, -25);
  assert.equal(margin.percentage, -25);
  assert.equal(margin.complete, true);
});

test('margem preserva o custo preciso e arredonda somente o resultado monetario', () => {
  const margin = buildContributionMargin(
    { dealPrice: 100, youReceive: 70, currency_id: 'BRL' },
    {
      status: 'matched',
      tax: { configured: true, rate: 10, base: 'sale_price', source: 'product', sourceId: 'product-1' },
      product: { cost: 16.67288, customCosts: [] }
    }
  );

  assert.equal(margin.productCost, 16.67288);
  assert.equal(margin.amount, 43.33);
  assert.equal(margin.percentage, 43.33);
});

test('margem de contribuicao informa dados ausentes sem estimar valores', () => {
  const withoutProduct = buildContributionMargin(
    {
      dealPrice: 100,
      youReceive: 70,
      currency_id: 'BRL'
    },
    {
      status: 'unmatched',
      reason: 'product_not_found',
      product: null
    }
  );
  assert.deepEqual(withoutProduct.missing, ['product']);
  assert.equal(withoutProduct.amount, null);
  assert.equal(withoutProduct.complete, false);

  const withoutFinancialEstimate = buildContributionMargin(
    {
      dealPrice: 100,
      youReceive: null,
      currency_id: 'BRL',
      complete: false
    },
    {
      status: 'matched',
      tax: { configured: true, rate: 5, base: 'sale_price', source: 'workspace', sourceId: 'workspace-1' },
      product: { cost: 40, customCosts: [] }
    }
  );
  assert.deepEqual(withoutFinancialEstimate.missing, ['you_receive']);
  assert.equal(withoutFinancialEstimate.amount, null);
  assert.equal(withoutFinancialEstimate.complete, false);
});

test('estimativa enriquecida preserva o contrato financeiro e associa o produto', () => {
  const estimate = { dealPrice: 100, youReceive: 70, currency_id: 'BRL', promotion: { id: 'P-MLB1' } };
  const productMatch = {
    status: 'matched',
    sku: 'SKU-1',
    tax: { configured: true, rate: 5, base: 'sale_price', source: 'product_account', sourceId: 'product-1:account-1' },
    product: { cost: 40, customCosts: [{ description: 'Embalagem', type: 'fixed', value: 2 }] }
  };
  const enriched = enrichPromotionEstimateWithProduct(estimate, productMatch);

  assert.deepEqual(enriched.promotion, estimate.promotion);
  assert.equal(enriched.productMatch, productMatch);
  assert.equal(enriched.contributionMargin.amount, 23);
  assert.equal(enriched.contributionMargin.percentage, 23);
});

test('margem fica indisponivel quando nenhuma aliquota foi configurada', () => {
  const margin = buildContributionMargin(
    { dealPrice: 100, youReceive: 70, currency_id: 'BRL' },
    {
      status: 'matched',
      tax: { configured: false, rate: null, base: 'sale_price', source: null, sourceId: null },
      product: { cost: 40, customCosts: [] }
    }
  );
  assert.equal(margin.complete, false);
  assert.deepEqual(margin.missing, ['tax_rate']);
  assert.equal(margin.amount, null);
});
