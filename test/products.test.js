const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const products = readFileSync(join(root, 'extension/ui/options/Products.jsx'), 'utf8');
const sharedStyles = readFileSync(join(root, 'extension/ui/shared/app.css'), 'utf8');
const spreadsheetModal = readFileSync(join(root, 'extension/ui/options/ProductSpreadsheetModal.jsx'), 'utf8');
const spreadsheet = readFileSync(join(root, 'extension/ui/options/product-spreadsheet.js'), 'utf8');
const options = readFileSync(join(root, 'extension/ui/options/app.jsx'), 'utf8');
const background = readFileSync(join(root, 'extension/background.js'), 'utf8');
const commerce = readFileSync(join(root, 'extension/modules/commerce/module.js'), 'utf8');

test('catalogo de produtos usa apenas componentes do design system', () => {
  for (const component of ['Table', 'Textarea', 'NumberField', 'SearchInput', 'Select', 'Modal', 'Pagination', 'Chip', 'Popover']) {
    assert.match(products, new RegExp(`<${component}\\b`, 'u'));
  }
  assert.match(products, /startAddon="R\$"/u);
  assert.match(products, /endAddon="%"/u);
  assert.match(spreadsheetModal, /<FileUpload\b/u);
  assert.match(spreadsheetModal, /<Table\b/u);
  assert.doesNotMatch(`${products}\n${spreadsheetModal}`, /<input\b|<textarea\b|<select\b/u);
});

test('produtos integram navegacao e todas as operacoes remotas', () => {
  assert.match(options, /id: 'products', label: 'Produtos', icon: 'package'/u);
  assert.match(options, /view === 'products' && <Products/u);
  for (const action of ['products', 'product-create', 'product-update', 'product-archive', 'product-import-preview', 'product-import-commit']) {
    assert.match(background, new RegExp(`action === '${action}'`, 'u'));
  }
  assert.doesNotMatch(`${products}\n${background}`, /product-link|Anúncios vinculados|Vincular/u);
  assert.match(spreadsheet, /writeFileXLSX/u);
  assert.match(products, /downloadProductExport/u);
  assert.match(products, /onHeaderActionsChange\([^]*onframe-products-header-actions[^]*Exportar[^]*Importar[^]*Criar produto/u);
  assert.match(products, /onframe-products-toolbar[^]*<SearchInput[^]*<Popover/u);
  assert.match(products, /<Popover[^]*placement="bottom"[^]*align="start"[^]*trigger=\{<Chip/u);
  assert.match(products, /STATUS_FILTERS\.map\([^]*<Chip[^]*selected=\{status === option\.value\}/u);
  assert.match(options, /actions=\{pageHeaderActions\}/u);
  assert.match(options, /<Products admin=\{admin\} onHeaderActionsChange=\{setProductHeaderActions\}/u);
  assert.match(sharedStyles, /\.onframe-products-header-actions\s*\{[^}]*justify-content: flex-end;/u);
  assert.match(sharedStyles, /\.onframe-products-toolbar\s*\{[^}]*grid-template-columns: minmax\(260px, 1fr\) auto;/u);
  assert.match(commerce, /variation_id: state\.context && state\.context\.selectedVariationId/u);
  assert.match(commerce, /function promotionEstimateHash\(payload\)/u);
  assert.match(commerce, /hash: promotionEstimateHash\(payload\)/u);
});
