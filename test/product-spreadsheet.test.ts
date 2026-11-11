import assert from 'node:assert/strict';
import test from 'node:test';
import { utils, write } from 'xlsx';
import {
  ProductSpreadsheetError,
  createProductWorkbook,
  parseProductWorkbook
} from '../extension/ui/options/product-spreadsheet.js';

function buffer(workbook: ReturnType<typeof utils.book_new>) {
  return write(workbook, { type: 'array', bookType: 'xlsx' });
}

test('planilha de produtos preserva os campos do catalogo', () => {
  const workbook = createProductWorkbook([
    {
      sku: 'MESA-180',
      name: 'Mesa dobrável',
      cost: 153.45,
      taxRate: 7.25,
      minimumContributionMargin: 14.5,
      customCosts: [
        { description: 'Embalagem', type: 'fixed', value: 3.5 },
        { description: 'Comissão comercial', type: 'percentage', value: 2.25 }
      ],
      accountTaxRates: [{ accountUserId: '310458346', taxRate: 9.5 }],
      status: 'inactive'
    }
  ]);
  assert.deepEqual(parseProductWorkbook(buffer(workbook)), [
    {
      rowNumber: 2,
      sku: 'MESA-180',
      name: 'Mesa dobrável',
      cost: 153.45,
      taxRate: 7.25,
      minimumContributionMargin: 14.5,
      customCosts: [
        { description: 'Embalagem', type: 'fixed', value: 3.5 },
        { description: 'Comissão comercial', type: 'percentage', value: 2.25 }
      ],
      accountTaxRates: [{ accountUserId: '310458346', taxRate: 9.5 }],
      status: 'inactive'
    }
  ]);
});

test('planilha preserva a precisao completa do custo unitario', () => {
  const workbook = createProductWorkbook([
    { sku: 'CHINES-4UN', name: 'Kit 4 chapéus chineses', cost: 44.328, taxRate: 23, customCosts: [], status: 'active' },
    { sku: 'CAR-1608', name: 'Carrinho dobrável', cost: 95.1997031, taxRate: 23, customCosts: [], status: 'active' },
    { sku: 'FTX9057PP-MR-39', name: 'Pantufa', cost: 16.67288, taxRate: 23, customCosts: [], status: 'active' }
  ]);

  assert.deepEqual(
    parseProductWorkbook(buffer(workbook)).map(({ sku, cost }) => ({ sku, cost })),
    [
      { sku: 'CHINES-4UN', cost: 44.328 },
      { sku: 'CAR-1608', cost: 95.1997031 },
      { sku: 'FTX9057PP-MR-39', cost: 16.67288 }
    ]
  );
});

test('planilha interpreta moeda e percentual no formato brasileiro', () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([
      ['SKU', 'Nome', 'Custo (R$)', 'Imposto (%)', 'Status'],
      ['KIT-01', 'Kit completo', 'R$ 1.234,56', '12,5%', 'Ativo'],
      ['', '', '', '', '']
    ]),
    'Produtos'
  );
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([
      ['SKU', 'Descrição', 'Tipo', 'Valor'],
      ['KIT-01', 'Embalagem', 'R$', '8,90'],
      ['KIT-01', 'Comissão', '%', '2,5%']
    ]),
    'Custos'
  );
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([
      ['SKU', 'ID da conta Mercado Livre', 'Imposto (%)'],
      ['KIT-01', '310458346', '8,75%']
    ]),
    'Impostos por conta'
  );
  assert.deepEqual(parseProductWorkbook(buffer(workbook)), [
    {
      rowNumber: 2,
      sku: 'KIT-01',
      name: 'Kit completo',
      cost: 1234.56,
      taxRate: 12.5,
      customCosts: [
        { description: 'Embalagem', type: 'fixed', value: 8.9 },
        { description: 'Comissão', type: 'percentage', value: 2.5 }
      ],
      accountTaxRates: [{ accountUserId: '310458346', taxRate: 8.75 }],
      status: 'active'
    }
  ]);
});

test('planilha preserva imposto vazio como configuracao herdada', () => {
  const workbook = createProductWorkbook([
    {
      sku: 'HERDA-01',
      name: 'Produto herdado',
      cost: 50,
      taxRate: null,
      customCosts: [],
      status: 'active'
    }
  ]);
  assert.equal(parseProductWorkbook(buffer(workbook))[0].taxRate, '');
});

test('planilha preserva o limite de margem individual do produto', () => {
  const workbook = createProductWorkbook([
    {
      sku: 'MC-01',
      name: 'Produto com limite',
      cost: 50,
      taxRate: null,
      minimumContributionMargin: 17.25,
      customCosts: [],
      status: 'active'
    }
  ]);
  assert.equal(parseProductWorkbook(buffer(workbook))[0].minimumContributionMargin, 17.25);
});

test('planilha sem o contrato oficial e rejeitada antes do envio', () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([
      ['SKU', 'Nome', 'Custo'],
      ['MESA-01', 'Mesa', 100]
    ]),
    'Produtos'
  );
  assert.throws(
    () => parseProductWorkbook(buffer(workbook)),
    (error: unknown) => error instanceof ProductSpreadsheetError && error.code === 'product_spreadsheet_headers'
  );
});

test('planilha com descrição legada não pertence ao contrato atual', () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([
      ['SKU', 'Nome', 'Descrição', 'Custo (R$)', 'Imposto (%)', 'Status'],
      ['MESA-01', 'Mesa', 'Legado', 100, 5, 'Ativo']
    ]),
    'Produtos'
  );
  assert.throws(
    () => parseProductWorkbook(buffer(workbook)),
    (error: unknown) => error instanceof ProductSpreadsheetError && error.code === 'product_spreadsheet_headers'
  );
});

test('planilha com outros custos legado não pertence ao contrato atual', () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([
      ['SKU', 'Nome', 'Custo (R$)', 'Imposto (%)', 'Outros custos variáveis (R$)', 'Status'],
      ['MESA-01', 'Mesa', 100, 5, 10, 'Ativo']
    ]),
    'Produtos'
  );
  assert.throws(
    () => parseProductWorkbook(buffer(workbook)),
    (error: unknown) => error instanceof ProductSpreadsheetError && error.code === 'product_spreadsheet_headers'
  );
});
