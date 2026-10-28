const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const extensionRoot = path.join(root, 'extension');

test('ação e aviso da ficha técnica usam a view React e o design system', () => {
  const view = fs.readFileSync(path.join(extensionRoot, 'ui', 'content', 'characteristics-view.jsx'), 'utf8');
  const controller = fs.readFileSync(path.join(extensionRoot, 'modules', 'characteristics', 'module.js'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-extension-ui.js'), 'utf8');
  const shell = fs.readFileSync(path.join(extensionRoot, 'core', 'content-shell.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
  const scripts = manifest.content_scripts[0].js;

  assert.match(view, /import \{ Accordion, Alert, Button, Card, Checkbox, Ph, Spinner, Tooltip \} from '@onblide\/ui'/);
  assert.match(view, /<Button[\s\S]*Editar características/);
  assert.match(view, /<Tooltip label="Expanda esta seção para editar as características\."/);
  assert.match(view, /<Alert tone="info" title="Este é um anúncio de catálogo">/);
  assert.match(view, /<Card padding="var\(--ob-s-3\)"/);
  assert.match(view, /<Checkbox[\s\S]*label="Aplicar a todas as variações"/);
  assert.match(view, /<Accordion[\s\S]*ariaLabel="Variações não alteradas"/);
  assert.match(view, /globalThis\.OnFrameCharacteristicsView = Object\.freeze\(\{ renderAction, renderCatalogNotice, renderFooter, unmount \}\)/);

  assert.match(controller, /const CharacteristicsView = rootScope\.OnFrameCharacteristicsView/);
  assert.match(controller, /CharacteristicsView\.renderAction/);
  assert.match(controller, /CharacteristicsView\.renderCatalogNotice/);
  assert.match(controller, /CharacteristicsView\.renderFooter/);
  assert.match(controller, /CharacteristicsView\.unmount/);
  assert.doesNotMatch(controller, /setDisabledButtonTooltip\(action|removeDisabledButtonTooltip\(wrapper/);
  assert.doesNotMatch(controller, /renderFooterMarkup|renderBulkSwitch|renderBulkFailures|data-action="save-characteristics"|data-action="toggle-characteristics-bulk"/);

  assert.match(build, /characteristics-view\.jsx/);
  assert.ok(scripts.indexOf('core/characteristics-view.js') < scripts.indexOf('modules/characteristics/module.js'));
  assert.match(shell, /\.onframe-characteristics-action-root/);
  assert.match(shell, /\.onframe-characteristics-catalog-notice/);
});
