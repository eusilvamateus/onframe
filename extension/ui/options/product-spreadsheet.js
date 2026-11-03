import { read, utils, writeFileXLSX } from 'xlsx';

export const PRODUCT_SPREADSHEET_HEADERS = [
  'SKU',
  'Nome',
  'Custo (R$)',
  'Imposto (%)',
  'Outros custos variáveis (R$)',
  'Status'
];

const HEADER_KEYS = [
  ['sku', 'sku'],
  ['nome', 'name'],
  ['custo r', 'cost'],
  ['imposto', 'taxRate'],
  ['outros custos variaveis r', 'variableCost'],
  ['status', 'status']
];

export class ProductSpreadsheetError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function normalizedHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-zA-Z0-9]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function headerKey(value) {
  const normalized = normalizedHeader(value);
  const direct = HEADER_KEYS.find(([header]) => header === normalized);
  if (direct) return direct[1];
  if (normalized === 'custo' || normalized === 'custo do produto') return 'cost';
  if (normalized === 'aliquota de imposto' || normalized === 'imposto percentual') return 'taxRate';
  if (normalized === 'outros custos variaveis') return 'variableCost';
  return null;
}

function spreadsheetNumber(value) {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined || String(value).trim() === '') return '';
  let normalized = String(value).trim().replace(/R\$/giu, '').replace(/%/gu, '').replace(/[\s\u00a0]/gu, '');
  if (normalized.includes(',')) normalized = normalized.replace(/\./gu, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/u.test(normalized)) return value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : value;
}

function spreadsheetStatus(value) {
  const normalized = normalizedHeader(value);
  if (normalized === 'ativo' || normalized === 'active') return 'active';
  if (normalized === 'inativo' || normalized === 'inactive') return 'inactive';
  return normalized;
}

function rowHasContent(row) {
  return row.some((value) => value !== null && value !== undefined && String(value).trim() !== '');
}

export function parseProductWorkbook(buffer) {
  let workbook;
  try {
    workbook = read(buffer, { type: 'array', cellDates: false });
  } catch {
    throw new ProductSpreadsheetError('product_spreadsheet_invalid', 'Não foi possível ler esta planilha.');
  }
  const worksheet = workbook.Sheets.Produtos || workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new ProductSpreadsheetError('product_spreadsheet_empty', 'A planilha não possui uma aba com dados.');
  const matrix = utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });
  if (matrix.length === 0) throw new ProductSpreadsheetError('product_spreadsheet_empty', 'A planilha está vazia.');
  const indexes = new Map();
  const unknownHeaders = [];
  matrix[0].forEach((header, index) => {
    const key = headerKey(header);
    if (key && !indexes.has(key)) indexes.set(key, index);
    else if (!key && normalizedHeader(header)) unknownHeaders.push(header);
  });
  const required = ['sku', 'name', 'cost', 'taxRate', 'variableCost', 'status'];
  const missing = required.filter((key) => !indexes.has(key));
  if (missing.length > 0 || unknownHeaders.length > 0) {
    throw new ProductSpreadsheetError('product_spreadsheet_headers', 'Use o modelo oficial do OnFrame sem adicionar, remover ou renomear colunas.');
  }
  const rows = matrix.slice(1).flatMap((row, index) => {
    if (!Array.isArray(row) || !rowHasContent(row)) return [];
    const value = (key) => row[indexes.get(key)];
    return [{
      rowNumber: index + 2,
      sku: String(value('sku') ?? '').trim(),
      name: String(value('name') ?? '').trim(),
      cost: spreadsheetNumber(value('cost')),
      taxRate: spreadsheetNumber(value('taxRate')),
      variableCost: spreadsheetNumber(value('variableCost')),
      status: spreadsheetStatus(value('status'))
    }];
  });
  if (rows.length === 0) throw new ProductSpreadsheetError('product_spreadsheet_empty', 'A planilha não contém produtos preenchidos.');
  if (rows.length > 2000) throw new ProductSpreadsheetError('product_spreadsheet_limit', 'Importe no máximo 2.000 produtos por vez.');
  return rows;
}

export async function parseProductSpreadsheetFile(file) {
  return parseProductWorkbook(await file.arrayBuffer());
}

function productsWorksheet(products) {
  const data = [PRODUCT_SPREADSHEET_HEADERS, ...products.map((product) => [
    product.sku,
    product.name,
    Number(product.cost || 0),
    Number(product.taxRate || 0),
    Number(product.variableCost || 0),
    product.status === 'inactive' ? 'Inativo' : 'Ativo'
  ])];
  const worksheet = utils.aoa_to_sheet(data);
  worksheet['!cols'] = [{ wch: 20 }, { wch: 34 }, { wch: 16 }, { wch: 14 }, { wch: 30 }, { wch: 14 }];
  worksheet['!autofilter'] = { ref: `A1:F${Math.max(1, data.length)}` };
  for (let row = 2; row <= data.length; row += 1) {
    for (const column of ['C', 'D', 'E']) {
      if (worksheet[`${column}${row}`]) worksheet[`${column}${row}`].z = '0.00';
    }
  }
  return worksheet;
}

export function createProductWorkbook(products = [], includeInstructions = false) {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, productsWorksheet(products), 'Produtos');
  if (includeInstructions) {
    const instructions = utils.aoa_to_sheet([
      ['Como preencher'],
      ['SKU', 'Identificador único do produto no workspace.'],
      ['Nome', 'Nome interno do produto.'],
      ['Custo (R$)', 'Custo unitário do produto. Use valor numérico.'],
      ['Imposto (%)', 'Alíquota aplicada sobre a venda. Exemplo: 7,25.'],
      ['Outros custos variáveis (R$)', 'Embalagem e outros custos unitários.'],
      ['Status', 'Use Ativo ou Inativo.'],
      ['', 'Não altere os títulos da aba Produtos. O SKU decide se a linha cria ou atualiza um produto.']
    ]);
    instructions['!cols'] = [{ wch: 30 }, { wch: 82 }];
    utils.book_append_sheet(workbook, instructions, 'Instruções');
  }
  workbook.Props = { Title: products.length ? 'Produtos do OnFrame' : 'Modelo de produtos do OnFrame', Subject: 'Catálogo de produtos' };
  return workbook;
}

export function downloadProductTemplate() {
  writeFileXLSX(createProductWorkbook([], true), 'modelo-produtos-onframe.xlsx', { compression: true });
}

export function downloadProductExport(products) {
  const date = new Date().toISOString().slice(0, 10);
  writeFileXLSX(createProductWorkbook(products), `produtos-onframe-${date}.xlsx`, { compression: true });
}
