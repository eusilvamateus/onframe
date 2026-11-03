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
  const workbook = createProductWorkbook([{
    sku: 'MESA-180',
    name: 'Mesa dobrável',
    cost: 153.45,
    taxRate: 7.25,
    customCosts: [
      { description: 'Embalagem', type: 'fixed', value: 3.5 },
      { description: 'Comissão comercial', type: 'percentage', value: 2.25 }
    ],
    status: 'inactive'
  }]);
  assert.deepEqual(parseProductWorkbook(buffer(workbook)), [{
    rowNumber: 2,
    sku: 'MESA-180',
    name: 'Mesa dobrável',
    cost: 153.45,
    taxRate: 7.25,
    customCosts: [
      { description: 'Embalagem', type: 'fixed', value: 3.5 },
      { description: 'Comissão comercial', type: 'percentage', value: 2.25 }
    ],
    status: 'inactive'
  }]);
});

test('planilha interpreta moeda e percentual no formato brasileiro', () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([
    ['SKU', 'Nome', 'Custo (R$)', 'Imposto (%)', 'Status'],
    ['KIT-01', 'Kit completo', 'R$ 1.234,56', '12,5%', 'Ativo'],
    ['', '', '', '', '']
  ]), 'Produtos');
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([
    ['SKU', 'Descrição', 'Tipo', 'Valor'],
    ['KIT-01', 'Embalagem', 'R$', '8,90'],
    ['KIT-01', 'Comissão', '%', '2,5%']
  ]), 'Custos');
  assert.deepEqual(parseProductWorkbook(buffer(workbook)), [{
    rowNumber: 2,
    sku: 'KIT-01',
    name: 'Kit completo',
    cost: 1234.56,
    taxRate: 12.5,
    customCosts: [
      { description: 'Embalagem', type: 'fixed', value: 8.9 },
      { description: 'Comissão', type: 'percentage', value: 2.5 }
    ],
    status: 'active'
  }]);
});

test('planilha sem o contrato oficial e rejeitada antes do envio', () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([
    ['SKU', 'Nome', 'Custo'],
    ['MESA-01', 'Mesa', 100]
  ]), 'Produtos');
  assert.throws(
    () => parseProductWorkbook(buffer(workbook)),
    (error: unknown) => error instanceof ProductSpreadsheetError && error.code === 'product_spreadsheet_headers'
  );
});

test('planilha com descrição legada não pertence ao contrato atual', () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([
    ['SKU', 'Nome', 'Descrição', 'Custo (R$)', 'Imposto (%)', 'Status'],
    ['MESA-01', 'Mesa', 'Legado', 100, 5, 'Ativo']
  ]), 'Produtos');
  assert.throws(
    () => parseProductWorkbook(buffer(workbook)),
    (error: unknown) => error instanceof ProductSpreadsheetError && error.code === 'product_spreadsheet_headers'
  );
});

test('planilha com outros custos legado não pertence ao contrato atual', () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([
    ['SKU', 'Nome', 'Custo (R$)', 'Imposto (%)', 'Outros custos variáveis (R$)', 'Status'],
    ['MESA-01', 'Mesa', 100, 5, 10, 'Ativo']
  ]), 'Produtos');
  assert.throws(
    () => parseProductWorkbook(buffer(workbook)),
    (error: unknown) => error instanceof ProductSpreadsheetError && error.code === 'product_spreadsheet_headers'
  );
});
