const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const products = readFileSync(join(root, 'extension/ui/options/Products.jsx'), 'utf8');
const options = readFileSync(join(root, 'extension/ui/options/app.jsx'), 'utf8');
const background = readFileSync(join(root, 'extension/background.js'), 'utf8');

test('catalogo de produtos usa apenas componentes do design system', () => {
  for (const component of ['Table', 'Textarea', 'NumberField', 'SearchInput', 'Select', 'Modal', 'Pagination']) {
    assert.match(products, new RegExp(`<${component}\\b`, 'u'));
  }
  assert.match(products, /startAddon="R\$"/u);
  assert.match(products, /endAddon="%"/u);
  assert.doesNotMatch(products, /<input\b|<textarea\b|<select\b/u);
});

test('produtos integram navegacao e todas as operacoes remotas', () => {
  assert.match(options, /id: 'products', label: 'Produtos', icon: 'package'/u);
  assert.match(options, /view === 'products' && <Products/u);
  for (const action of ['products', 'product-create', 'product-update', 'product-archive', 'product-link-create', 'product-link-delete']) {
    assert.match(background, new RegExp(`action === '${action}'`, 'u'));
  }
});
