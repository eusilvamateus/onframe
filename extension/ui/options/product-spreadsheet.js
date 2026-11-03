import { read, utils, writeFileXLSX } from 'xlsx';

export const PRODUCT_SPREADSHEET_HEADERS = [
  'SKU',
  'Nome',
  'Custo (R$)',
  'Imposto (%)',
  'Status'
];

export const PRODUCT_COST_SPREADSHEET_HEADERS = ['SKU', 'Descrição', 'Tipo', 'Valor'];

const HEADER_KEYS = [
  ['sku', 'sku'],
  ['nome', 'name'],
  ['custo r', 'cost'],
  ['imposto', 'taxRate'],
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

function normalizedSku(value) {
  return String(value || '').trim().normalize('NFKC').toLocaleUpperCase('pt-BR');
}

function headerKey(value) {
  const normalized = normalizedHeader(value);
  const direct = HEADER_KEYS.find(([header]) => header === normalized);
  if (direct) return direct[1];
  if (normalized === 'custo' || normalized === 'custo do produto') return 'cost';
  if (normalized === 'aliquota de imposto' || normalized === 'imposto percentual') return 'taxRate';
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

function spreadsheetCostType(value) {
  const normalized = normalizedHeader(value);
  if (normalized === 'r' || normalized === 'reais' || normalized === 'real' || normalized === 'fixo') return 'fixed';
  if (normalized === 'percentual' || normalized === 'porcentagem') return 'percentage';
  if (String(value || '').trim() === '%') return 'percentage';
  return '';
}

function sheetIndexes(matrix, keys, headerResolver = headerKey) {
  const indexes = new Map();
  const unknownHeaders = [];
  (matrix[0] || []).forEach((header, index) => {
    const key = headerResolver(header);
    if (key && !indexes.has(key)) indexes.set(key, index);
    else if (!key && normalizedHeader(header)) unknownHeaders.push(header);
  });
  const missing = keys.filter((key) => !indexes.has(key));
  if (missing.length > 0 || unknownHeaders.length > 0) {
    throw new ProductSpreadsheetError('product_spreadsheet_headers', 'Use o modelo oficial do OnFrame sem adicionar, remover ou renomear colunas.');
  }
  return indexes;
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
  const indexes = sheetIndexes(matrix, ['sku', 'name', 'cost', 'taxRate', 'status']);
  const rows = matrix.slice(1).flatMap((row, index) => {
    if (!Array.isArray(row) || !rowHasContent(row)) return [];
    const value = (key) => row[indexes.get(key)];
    return [{
      rowNumber: index + 2,
      sku: String(value('sku') ?? '').trim(),
      name: String(value('name') ?? '').trim(),
      cost: spreadsheetNumber(value('cost')),
      taxRate: spreadsheetNumber(value('taxRate')),
      customCosts: [],
      status: spreadsheetStatus(value('status'))
    }];
  });
  if (rows.length === 0) throw new ProductSpreadsheetError('product_spreadsheet_empty', 'A planilha não contém produtos preenchidos.');
  if (rows.length > 2000) throw new ProductSpreadsheetError('product_spreadsheet_limit', 'Importe no máximo 2.000 produtos por vez.');

  const costsWorksheet = workbook.Sheets.Custos;
  if (!costsWorksheet) throw new ProductSpreadsheetError('product_spreadsheet_headers', 'Use o modelo oficial do OnFrame com as abas Produtos e Custos.');
  const costsMatrix = utils.sheet_to_json(costsWorksheet, { header: 1, raw: true, defval: '' });
  const costHeader = (value) => ({ sku: 'sku', descricao: 'description', tipo: 'type', valor: 'value' })[normalizedHeader(value)] || null;
  const costIndexes = sheetIndexes(costsMatrix, ['sku', 'description', 'type', 'value'], costHeader);
  const productsBySku = new Map(rows.map((row) => [normalizedSku(row.sku), row]));
  for (const row of costsMatrix.slice(1)) {
    if (!Array.isArray(row) || !rowHasContent(row)) continue;
    const value = (key) => row[costIndexes.get(key)];
    const sku = String(value('sku') ?? '').trim();
    const product = productsBySku.get(normalizedSku(sku));
    const description = String(value('description') ?? '').trim();
    const type = spreadsheetCostType(value('type'));
    const amount = spreadsheetNumber(value('value'));
    if (!product || !description || description.length > 120 || !type || typeof amount !== 'number' || amount < 0 || (type === 'percentage' && amount > 100)) {
      throw new ProductSpreadsheetError('product_spreadsheet_costs', 'Revise SKU, descrição, tipo e valor na aba Custos.');
    }
    product.customCosts.push({ description, type, value: amount });
  }
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
    product.status === 'inactive' ? 'Inativo' : 'Ativo'
  ])];
  const worksheet = utils.aoa_to_sheet(data);
  worksheet['!cols'] = [{ wch: 20 }, { wch: 34 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
  worksheet['!autofilter'] = { ref: `A1:E${Math.max(1, data.length)}` };
  for (let row = 2; row <= data.length; row += 1) {
    for (const column of ['C', 'D']) {
      if (worksheet[`${column}${row}`]) worksheet[`${column}${row}`].z = '0.00';
    }
  }
  return worksheet;
}

function costsWorksheet(products) {
  const data = [PRODUCT_COST_SPREADSHEET_HEADERS];
  for (const product of products) {
    for (const cost of product.customCosts || []) {
      data.push([product.sku, cost.description, cost.type === 'percentage' ? '%' : 'R$', Number(cost.value || 0)]);
    }
  }
  const worksheet = utils.aoa_to_sheet(data);
  worksheet['!cols'] = [{ wch: 20 }, { wch: 36 }, { wch: 14 }, { wch: 14 }];
  worksheet['!autofilter'] = { ref: `A1:D${Math.max(1, data.length)}` };
  for (let row = 2; row <= data.length; row += 1) {
    if (worksheet[`D${row}`]) worksheet[`D${row}`].z = '0.00';
  }
  return worksheet;
}

export function createProductWorkbook(products = [], includeInstructions = false) {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, productsWorksheet(products), 'Produtos');
  utils.book_append_sheet(workbook, costsWorksheet(products), 'Custos');
  if (includeInstructions) {
    const instructions = utils.aoa_to_sheet([
      ['Como preencher'],
      ['SKU', 'Identificador único do produto no workspace.'],
      ['Nome', 'Nome interno do produto.'],
      ['Custo (R$)', 'Custo unitário do produto. Use valor numérico.'],
      ['Imposto (%)', 'Alíquota aplicada sobre a venda. Exemplo: 7,25.'],
      ['Custos', 'Na aba Custos, associe cada custo ao SKU e escolha R$ ou %. Percentuais usam o preço efetivo da venda.'],
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
