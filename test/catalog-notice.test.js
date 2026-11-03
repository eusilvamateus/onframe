const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const notice = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'ui', 'content', 'catalog-notice.jsx'),
  'utf8'
);

test('aviso de catálogo é compacto, compartilhado e usa o design system', () => {
  assert.match(notice, /import \{ Ph \} from '@onblide\/ui'/);
  assert.match(notice, /role="note" aria-label="Anúncio de catálogo"/);
  assert.match(notice, /<Ph n="info" size=\{16\} weight="fill"/);
  assert.match(notice, /fontFamily: 'var\(--ob-font\)'/);
  assert.match(notice, /fontSize: 12/);
  assert.match(notice, /<strong style=\{titleStyle\}>Este é um anúncio de catálogo\.<\/strong>/);
  assert.doesNotMatch(notice, /<Alert|<Card|background:|border:|padding:/);
});
