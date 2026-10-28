const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const extensionRoot = path.join(root, 'extension');

test('descrição usa uma view React como única rota da interface', () => {
  const view = fs.readFileSync(path.join(extensionRoot, 'ui', 'content', 'description-view.jsx'), 'utf8');
  const controller = fs.readFileSync(path.join(extensionRoot, 'modules', 'description', 'module.js'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-extension-ui.js'), 'utf8');
  const shell = fs.readFileSync(path.join(extensionRoot, 'core', 'content-shell.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
  const scripts = manifest.content_scripts[0].js;

  assert.match(view, /import \{ Accordion, Alert, Button, Card, Checkbox, Ph, Spinner, Textarea, Tooltip \} from '@onblide\/ui'/);
  assert.match(view, /globalThis\.OnFrameDescriptionView = Object\.freeze\(\{ renderAction, renderCatalogNotice, renderEditor, unmount \}\)/);
  assert.match(view, /<Button[\s\S]*Editar descrição/);
  assert.match(view, /<Tooltip label="Expanda esta seção para editar a descrição\."/);
  assert.match(view, /<Alert tone="info" title="Este é um anúncio de catálogo">/);
  assert.match(view, /<Card[\s\S]*padding="var\(--ob-s-4\)"/);
  assert.match(view, /function DescriptionTextField/);
  assert.match(view, /<Textarea[\s\S]*value=\{value\}/);
  assert.match(view, /<DescriptionTextField[\s\S]*onChange=\{actions\.onTextChange\}/);
  assert.match(view, /<Checkbox[\s\S]*label="Aplicar a todas as variações"/);
  assert.match(view, /<Accordion[\s\S]*ariaLabel="Variações não alteradas"/);

  assert.match(controller, /const DescriptionView = rootScope\.OnFrameDescriptionView/);
  assert.match(controller, /DescriptionView\.renderAction/);
  assert.match(controller, /DescriptionView\.renderCatalogNotice/);
  assert.match(controller, /DescriptionView\.renderEditor/);
  assert.match(controller, /DescriptionView\.unmount/);
  assert.match(controller, /state\.text = visibleText;\s+state\.originalText = visibleText;/);
  assert.match(controller, /function closeEditor\(options = \{\}\) \{\s+state\.requestId \+= 1;/);
  assert.doesNotMatch(controller, /state\.editorRoot\.innerHTML|renderEditorMarkup|renderBulkSwitch|renderBulkFailures|bindEditorEvents/);
  assert.doesNotMatch(controller, /setDisabledButtonTooltip|removeDisabledButtonTooltip|class="ob-button|class="ob-checkbox/);

  assert.match(build, /description-view\.jsx/);
  assert.ok(scripts.indexOf('core/description-view.js') < scripts.indexOf('modules/description/module.js'));
  assert.match(shell, /\.onframe-description-action-root/);
  assert.match(shell, /\.onframe-description-catalog-notice/);
});

test('descrição mantém apenas CSS de composição específico do produto', () => {
  const styles = fs.readFileSync(path.join(extensionRoot, 'modules', 'description', 'styles.css'), 'utf8');

  assert.match(styles, /\.onframe-description-editor \{/);
  assert.match(styles, /\.onframe-description-editor-content \{/);
  assert.match(styles, /\.onframe-description-action-root \{/);
  assert.match(styles, /\.onframe-description-actions \{/);
  assert.doesNotMatch(styles, /var\(--ob-blue-050\)|var\(--ob-blue-100\)/);
  assert.doesNotMatch(styles, /\.onframe-description-textarea|\.onframe-description-alert|\.onframe-description-failures|\.ob-button|\.ob-checkbox/);
});

test('modelo da descrição limita edição em massa à família de user product', () => {
  const model = require('../extension/modules/description/model');
  const editable = {
    mode: 'user_product',
    quick: false,
    item: { id: 'MLB1', user_product_id: 'MLBU111111' },
    family: [{ user_product_id: 'MLBU111111' }, { user_product_id: 'MLBU222222' }]
  };

  assert.equal(model.canEditDescription(editable), true);
  assert.equal(model.canBulkEditDescription(editable), true);
  assert.equal(model.canBulkEditDescription({ ...editable, quick: true }), false);
  assert.equal(model.canEditDescription({ item: { id: 'MLB1', catalog_listing: true } }), false);
});

test('modelo da descrição resolve texto remoto e preserva o conteúdo visível como fallback', () => {
  const model = require('../extension/modules/description/model');

  assert.equal(model.resolveDescriptionText({ plainText: 'Texto atual' }, 'Texto visível'), 'Texto atual');
  assert.equal(model.resolveDescriptionText({ plain_text: 'Contrato legado' }, 'Texto visível'), 'Contrato legado');
  assert.equal(model.resolveDescriptionText({ plainText: '' }, 'Texto visível'), 'Texto visível');
  assert.equal(model.resolveDescriptionText(null, 'Texto visível'), 'Texto visível');
});
