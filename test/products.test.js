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
const taxSettings = readFileSync(join(root, 'extension/ui/options/TaxSettings.jsx'), 'utf8');
const productSettings = readFileSync(join(root, 'extension/ui/options/ProductSettings.jsx'), 'utf8');

test('catalogo de produtos usa apenas componentes do design system', () => {
  for (const component of [
    'Table',
    'NumberField',
    'SearchInput',
    'Switch',
    'Drawer',
    'Modal',
    'Pagination',
    'Chip',
    'Popover',
    'MenuPanel',
    'Tooltip',
    'ButtonGroup',
    'ToggleButton'
  ]) {
    assert.match(products, new RegExp(`<${component}\\b`, 'u'));
  }
  assert.match(products, /startAddon="R\$"/u);
  assert.match(products, /function displayedCostText[^]*maximumFractionDigits: decimalPlaces/u);
  assert.match(products, /function ProductCostField[^]*focused \? text : displayedCostText\(value, decimalPlaces\)/u);
  assert.match(products, /function ProductCostField[^]*if \(parsed !== null\) onChange\(parsed\)/u);
  assert.match(products, /endAddon="%"/u);
  assert.match(spreadsheetModal, /<FileUpload\b/u);
  assert.match(spreadsheetModal, /<Stepper\b/u);
  assert.match(spreadsheetModal, /<Table\b/u);
  assert.doesNotMatch(`${products}\n${spreadsheetModal}`, /<input\b|<textarea\b|<select\b/u);
  assert.doesNotMatch(products, /Textarea|nome ou descrição|product\.description|variableCost|Outros custos/u);
  assert.doesNotMatch(spreadsheet, /variableCost|Outros custos variáveis/u);
  assert.match(products, /<Drawer[^]*title=\{current \? \(admin \? 'Editar produto'[^]*side="right"/u);
  assert.match(
    products,
    /onframe-product-form-section[^]*Identificação[^]*onframe-product-form-section[^]*Custos[^]*onframe-product-form-section[^]*Impostos[^]*onframe-product-form-section[^]*Situação/u
  );
  assert.match(products, /onframe-product-form-fields[^]*<Input[^]*label="Nome"[^]*<Input[^]*label="SKU"/u);
  assert.match(
    products,
    /<Switch[^]*checked=\{values\.status === 'active'\}[^]*onChange=\{\(checked\) => setField\('status'/u
  );
  assert.match(
    products,
    /taxRate: null[^]*label="Alíquota específica do produto"[^]*onChange=\{\(value\) => setField\('taxRate', value\)\}/u
  );
  assert.match(products, /Exceções por conta[^]*Adicionar exceção[^]*<Select[^]*label="Conta"[^]*label="Alíquota"/u);
  assert.match(
    products,
    /function customCostSummary[^]*Novo custo[^]*Custos personalizados[^]*Adicionar custo[^]*onframe-product-custom-cost-chips[^]*<Chip[^]*onframe-product-custom-cost-chip-name[^]*summary\.description[^]*onframe-product-custom-cost-chip-value[^]*summary\.value[^]*aria-label=\{`Editar custo[^]*selected=\{selectedCustomCostKey === cost\.key\}[^]*removable=\{admin\}[^]*onRemove=/u
  );
  assert.doesNotMatch(products, /\$\{description\} · \$\{value\}/u);
  assert.match(
    products,
    /selectedCustomCost &&[^]*Descrição do custo[^]*selection="single"[^>]*>[^]*value="fixed" appearance="ghost" tone="primary">\s*R\$[^]*value="percentage" appearance="ghost" tone="primary">\s*%/u
  );
  assert.match(products, /const key = customCostKey\(\)[^]*setSelectedCustomCostKey\(key\)/u);
  assert.doesNotMatch(products, /<ButtonGroup[^>]*(?:appearance|tone|attached=\{false\})/u);
  assert.doesNotMatch(products, /aria-label=\{`Remover custo/u);
  assert.match(products, /kind="quiet"\s*tone="primary"[^]*n="plus-circle"[^]*Adicionar custo/u);
  assert.match(products, /n="plus-circle" size=\{17\}[^]*Criar produto/u);
  assert.doesNotMatch(products, /<Ph n="plus"/u);
  assert.match(
    spreadsheetModal,
    /steps=\{\[\{ label: 'Arquivo' \}, \{ label: 'Revisão' \}, \{ label: 'Resultado' \}\]\}/u
  );
  assert.match(spreadsheetModal, /disabled=\{busy \|\| !selectedFile\}[^]*Revisar planilha/u);
  assert.match(spreadsheetModal, /Revise os produtos/u);
  assert.match(spreadsheetModal, /Nenhuma mudança foi encontrada/u);
  assert.match(spreadsheetModal, /Trocar arquivo[^]*Nada para importar/u);
  assert.match(
    spreadsheetModal,
    /key: 'name', label: 'Produto'[^]*key: 'sku', label: 'SKU'[^]*label: result \? 'Resultado' : 'Ação'/u
  );
  assert.match(spreadsheetModal, /disabled=\{busy \|\| actionable === 0\}[^]*Importar \$\{actionable\}/u);
  assert.match(
    spreadsheetModal,
    /\['Novos', values\.create, 'success'\][^]*\['Atualizações', values\.update, 'primary'\][^]*\['Sem alteração', values\.unchanged, 'neutral'\][^]*\['Com erro', values\.error, 'danger'\]/u
  );
  assert.match(spreadsheetModal, /onframe-product-import-summary-\$\{tone\}[^]*onframe-product-import-summary-marker/u);
  assert.match(
    sharedStyles,
    /onframe-product-import-summary-success[^}]*var\(--ob-green\)[^]*onframe-product-import-summary-primary[^}]*var\(--ob-blue\)[^]*onframe-product-import-summary-danger[^}]*var\(--ob-danger\)/u
  );
  assert.match(sharedStyles, /\.onframe-product-custom-cost-chips\s*\{[^}]*flex-wrap: wrap;/u);
  assert.match(sharedStyles, /\.onframe-product-custom-cost-chip-name\s*\{[^}]*opacity: var\(--ob-opacity-strong\);/u);
  assert.match(
    sharedStyles,
    /\.onframe-product-custom-cost-chip-value\s*\{[^}]*font-family: var\(--ob-font-mono\);[^}]*font-variant-numeric: tabular-nums;/u
  );
  assert.match(
    sharedStyles,
    /\.onframe-product-custom-cost-editor\s*\{[^}]*border-top: 1px solid var\(--ob-border\);/u
  );
});

test('produtos integram navegacao e todas as operacoes remotas', () => {
  assert.match(options, /id: 'products', label: 'Produtos', icon: 'package'/u);
  assert.match(options, /view === 'products' && \(\s*<Products/u);
  for (const action of [
    'products',
    'product-create',
    'product-update',
    'product-archive',
    'product-import-preview',
    'product-import-commit',
    'product-settings',
    'product-settings-update',
    'tax-configuration',
    'tax-configuration-update'
  ]) {
    assert.match(background, new RegExp(`action === '${action}'`, 'u'));
  }
  assert.doesNotMatch(`${products}\n${background}`, /product-link|Anúncios vinculados|Vincular/u);
  assert.match(spreadsheet, /writeFileXLSX/u);
  assert.match(
    spreadsheet,
    /product\.taxRate === null \|\| product\.taxRate === undefined \? '' : Number\(product\.taxRate\)/u
  );
  assert.match(products, /downloadProductExport/u);
  assert.match(
    products,
    /onHeaderActionsChange\([^]*onframe-products-header-actions[^]*Baixar planilha[^]*Importar[^]*Criar produto/u
  );
  assert.match(products, /aria-busy=\{exportBusy\}[^]*Gerando planilha\.\.\./u);
  assert.match(
    products,
    /onframe-products-toolbar[^]*onframe-products-search[^]*<SearchInput[^]*onframe-products-filters/u
  );
  assert.match(
    products,
    /function ProductChipFilter[^]*<Popover[^]*placement="bottom"[^]*align="start"[^]*trigger=\{<Chip/u
  );
  assert.match(products, /options\.map\([^]*<Chip[^]*selected=\{value === option\.value\}/u);
  assert.match(products, /SORT_FILTERS[^]*Código SKU[^]*Nome[^]*Mais recentes[^]*Data de atualização/u);
  assert.match(products, /query: \{ q: debouncedQuery, status, sort, page, limit: PAGE_SIZE \}/u);
  assert.match(background, /\['q', 'status', 'sort', 'page', 'limit'\]/u);
  assert.match(
    products,
    /<Popover[^]*align="end"[^]*dots-three-vertical[^]*<MenuPanel[^]*Editar produto[^]*Arquivar produto/u
  );
  assert.doesNotMatch(products, /className="onframe-actions"/u);
  assert.doesNotMatch(products, /key: 'status', label: 'Status'/u);
  assert.match(
    products,
    /function ProductSku[^]*navigator\.clipboard\.writeText\(sku\)[^]*label="Copiar SKU"[^]*onframe-product-sku-value[^]*<Ph n="copy"/u
  );
  assert.match(products, /fontFamily: 'var\(--ob-font-mono\)',\s*fontSize: 'var\(--ob-fs-12\)'/u);
  assert.match(products, /key: 'sku', label: 'SKU', width: 220/u);
  assert.match(products, /const columns = \[[^]*key: 'name', label: 'Produto'[^]*key: 'sku', label: 'SKU'/u);
  assert.match(sharedStyles, /\.onframe-product-sku-value\s*\{[^}]*overflow-wrap: anywhere;/u);
  assert.doesNotMatch(sharedStyles, /\.onframe-product-sku-value\s*\{[^}]*white-space: nowrap;/u);
  assert.match(sharedStyles, /\.onframe-products-table \.onframe-list-title\s*\{[^}]*font-size: var\(--ob-fs-12\);/u);
  assert.match(options, /actions=\{pageHeaderActions\}/u);
  assert.match(
    options,
    /<Products accounts=\{accounts\} admin=\{admin\} onHeaderActionsChange=\{setProductHeaderActions\}/u
  );
  assert.match(sharedStyles, /\.onframe-products-header-actions\s*\{[^}]*justify-content: flex-end;/u);
  assert.match(sharedStyles, /\.onframe-products-search\s*\{[^}]*width: 50%;/u);
  assert.match(
    sharedStyles,
    /\.onframe-product-import-upload button\[aria-label\^=['"]Remover ['"]\]\s*\{[^}]*var\(--ob-danger\)/u
  );
  assert.match(commerce, /variation_id: state\.context && state\.context\.selectedVariationId/u);
  assert.match(commerce, /function promotionEstimateHash\(payload\)/u);
  assert.match(commerce, /hash: promotionEstimateHash\(payload\)/u);
  assert.match(
    commerce,
    /Margem de contribuição[^]*promotionTaxSourceLabel[^]*configure uma alíquota no produto, na conta ou no workspace/u
  );
  assert.match(options, /page: 'margin'[^]*label: 'Margem de contribuição'/u);
  assert.match(options, /page: 'products'[^]*label: 'Produtos'[^]*Preferências do cadastro de produtos/u);
  assert.match(taxSettings, /tax-configuration-update/u);
  assert.doesNotMatch(taxSettings, /costDecimalPlaces|Precisão dos custos|Casas decimais/u);
  assert.match(productSettings, /product-settings-update/u);
  assert.match(productSettings, /label="Casas decimais do custo"/u);
  assert.match(productSettings, /label: String\(value\)/u);
  assert.doesNotMatch(productSettings, /label:.*casa decimal/u);
  assert.match(products, /result\.settings\?\.costDecimalPlaces \?\? 2/u);
  assert.match(commerce, /formatContributionCost\(margin\.productCost, currency, margin\.costDecimalPlaces\)/u);
});

test('retornos de produtos permanecem na superfície que originou a ação', () => {
  assert.doesNotMatch(products, /title: 'Produto atualizado\.'/u);
  assert.doesNotMatch(products, /title: 'Produto criado\.'/u);
  assert.doesNotMatch(products, /title: 'Produto arquivado\.'/u);
  assert.doesNotMatch(products, /title: 'Planilha gerada\.'/u);
  assert.doesNotMatch(products, /title: 'Importação processada\.'/u);
  assert.match(products, /setProducts\(\(items\) => items\.filter\(\(item\) => item\.id !== product\.id\)\)/u);
  assert.match(products, /dialog\?\.error[^]*<Alert appearance="soft" tone="danger">/u);
  assert.match(spreadsheetModal, /step === 'result'[^]*Resultado da importação/u);
});
