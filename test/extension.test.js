const {
  test,
  assert,
  fs,
  os,
  path,
  vm,
  buildCommitPayload,
  pickMode,
  decrypt,
  encrypt,
  createApp,
  sanitizeError,
  userFriendlyError,
  parseValue,
  buildPictureQualityReport,
  calculateOptimizedDimensions,
  calculateResolutionScore,
  extractImageDimensions,
  extractOfficialDimensions,
  buildPriceSummary,
  updateStandardPrice,
  buildPromotionSummary,
  createCampaign,
  createOffer,
  deleteOffer,
  detection,
  photosModel,
  commerceModel,
  descriptionModel,
  characteristicsModel,
  moduleRegistry,
  icons,
  fakePng,
  fakeWebpVp8x,
  fakeDocument,
  fakeElement,
  listen
} = require('./helpers');

test('manifest carrega modulo de fotos antes do bootstrap', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
  const scripts = manifest.content_scripts[0].js;

  assert.strictEqual(manifest.action.default_popup, 'ui/popup/index.html');
  assert.strictEqual(manifest.options_ui.page, 'ui/options/index.html');
  assert.strictEqual(manifest.background.service_worker, 'background.js');
  assert.deepStrictEqual(manifest.content_scripts[0].css, [
    'vendor/phosphor/phosphor.css',
    'styles/foundations.css',
    'styles/components.css',
    'modules/photos/styles.css',
    'modules/commerce/styles.css',
    'modules/description/styles.css',
    'modules/characteristics/styles.css'
  ]);
  assert.ok(manifest.web_accessible_resources[0].resources.includes('vendor/phosphor/*'));
  assert.ok(scripts.indexOf('core/detection.js') < scripts.indexOf('modules/photos/model.js'));
  assert.ok(scripts.indexOf('core/shared.js') < scripts.indexOf('modules/photos/model.js'));
  assert.ok(scripts.indexOf('modules/photos/model.js') < scripts.indexOf('modules/photos/module.js'));
  assert.ok(scripts.indexOf('modules/photos/module.js') < scripts.indexOf('modules/commerce/model.js'));
  assert.ok(scripts.indexOf('modules/commerce/model.js') < scripts.indexOf('modules/commerce/module.js'));
  assert.ok(scripts.indexOf('modules/commerce/module.js') < scripts.indexOf('modules/description/model.js'));
  assert.ok(scripts.indexOf('modules/description/model.js') < scripts.indexOf('modules/description/module.js'));
  assert.ok(scripts.indexOf('modules/description/module.js') < scripts.indexOf('modules/characteristics/model.js'));
  assert.ok(scripts.indexOf('modules/characteristics/model.js') < scripts.indexOf('modules/characteristics/module.js'));
  assert.ok(scripts.indexOf('modules/characteristics/module.js') < scripts.indexOf('core/module-registry.js'));
  assert.ok(scripts.indexOf('modules/description/module.js') < scripts.indexOf('core/module-registry.js'));
  assert.ok(scripts.indexOf('modules/commerce/module.js') < scripts.indexOf('core/module-registry.js'));
  assert.ok(scripts.indexOf('modules/photos/module.js') < scripts.indexOf('core/module-registry.js'));
  assert.ok(scripts.indexOf('core/module-registry.js') < scripts.indexOf('core/content-shell.js'));
  assert.ok(scripts.indexOf('modules/photos/module.js') < scripts.indexOf('core/content-shell.js'));
  assert.ok(scripts.indexOf('core/content-shell.js') < scripts.indexOf('content.js'));
});

test('manifest e telas referenciam arquivos existentes', () => {
  const extensionRoot = path.join(__dirname, '..', 'extension');
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
  const manifestFiles = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...manifest.content_scripts[0].js,
    ...manifest.content_scripts[0].css
  ];

  for (const file of manifestFiles) {
    assert.strictEqual(fs.existsSync(path.join(extensionRoot, file)), true, file);
  }

  for (const htmlPath of [manifest.action.default_popup, manifest.options_ui.page, 'ui/launcher/index.html']) {
    const htmlFile = path.join(extensionRoot, htmlPath);
    const html = fs.readFileSync(htmlFile, 'utf8');
    for (const asset of extractLocalHtmlAssets(html)) {
      assert.strictEqual(fs.existsSync(path.resolve(path.dirname(htmlFile), asset)), true, `${htmlPath} -> ${asset}`);
    }
  }
});

test('module registry cria modulos com contrato estavel', () => {
  const calls = [];
  const photosModule = {
    id: 'photos',
    label: 'Fotos',
    getStatus() {},
    handlePageContextChange() {},
    hide() {},
    isBusy() {},
    isLoaded() {},
    reload() {},
    reset() {},
    scheduleRender() {},
    show() {},
    start() {}
  };
  const commerceModule = Object.assign({}, photosModule, {
    id: 'commerce',
    label: 'Preço e promoções'
  });
  const descriptionModule = Object.assign({}, photosModule, {
    id: 'description',
    label: 'Descrição'
  });
  const characteristicsModule = Object.assign({}, photosModule, {
    id: 'characteristics',
    label: 'Características'
  });
  const modules = moduleRegistry.createModules({
    PhotosModule: {
      createPhotoModule(services) {
        calls.push(`photos:${services.marker}`);
        return photosModule;
      }
    },
    CommerceModule: {
      createCommerceModule(services) {
        calls.push(`commerce:${services.marker}`);
        return commerceModule;
      }
    },
    DescriptionModule: {
      createDescriptionModule(services) {
        calls.push(`description:${services.marker}`);
        return descriptionModule;
      }
    },
    CharacteristicsModule: {
      createCharacteristicsModule(services) {
        calls.push(`characteristics:${services.marker}`);
        return characteristicsModule;
      }
    },
    marker: 'ok'
  });

  assert.deepStrictEqual(calls, ['photos:ok', 'commerce:ok', 'description:ok', 'characteristics:ok']);
  assert.deepStrictEqual(modules, [photosModule, commerceModule, descriptionModule, characteristicsModule]);
  assert.throws(() => moduleRegistry.assertModuleContract({ id: 'bad', label: 'Ruim' }), /sem contrato/);
});

test('ui carregam phosphor local do design system', () => {
  const popup = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'popup', 'index.html'), 'utf8');
  const options = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options', 'index.html'), 'utf8');
  const launcher = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'launcher', 'index.html'), 'utf8');

  assert.match(popup, /href="\.\.\/\.\.\/vendor\/phosphor\/phosphor\.css"/);
  assert.match(popup, /href="\.\.\/\.\.\/styles\/foundations\.css"/);
  assert.match(popup, /href="\.\.\/\.\.\/styles\/components\.css"/);
  assert.match(popup, /href="\.\.\/\.\.\/styles\/shell\.css"/);
  assert.match(options, /href="\.\.\/\.\.\/vendor\/phosphor\/phosphor\.css"/);
  assert.match(options, /href="\.\.\/\.\.\/styles\/foundations\.css"/);
  assert.match(options, /href="\.\.\/\.\.\/styles\/components\.css"/);
  assert.match(options, /href="\.\.\/\.\.\/styles\/shell\.css"/);
  assert.match(launcher, /href="\.\.\/\.\.\/vendor\/phosphor\/phosphor\.css"/);
  assert.match(launcher, /href="\.\.\/\.\.\/styles\/foundations\.css"/);
  assert.match(launcher, /href="\.\.\/\.\.\/styles\/components\.css"/);
  assert.match(launcher, /href="\.\.\/\.\.\/styles\/shell\.css"/);
});

test('design system nao e redefinido pelos modulos', () => {
  const extensionRoot = path.join(__dirname, '..', 'extension');
  const foundations = fs.readFileSync(path.join(extensionRoot, 'styles', 'foundations.css'), 'utf8');
  const components = fs.readFileSync(path.join(extensionRoot, 'styles', 'components.css'), 'utf8');
  const photosStyles = fs.readFileSync(path.join(extensionRoot, 'modules', 'photos', 'styles.css'), 'utf8');
  const commerceStyles = fs.readFileSync(path.join(extensionRoot, 'modules', 'commerce', 'styles.css'), 'utf8');
  const descriptionStyles = fs.readFileSync(path.join(extensionRoot, 'modules', 'description', 'styles.css'), 'utf8');
  const characteristicsStyles = fs.readFileSync(path.join(extensionRoot, 'modules', 'characteristics', 'styles.css'), 'utf8');
  const popupStyles = fs.readFileSync(path.join(extensionRoot, 'ui', 'popup', 'popup.css'), 'utf8');
  const optionsStyles = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'options.css'), 'utf8');
  const moduleStyles = `${photosStyles}\n${commerceStyles}\n${descriptionStyles}\n${characteristicsStyles}`;

  assert.strictEqual(fs.existsSync(path.join(extensionRoot, 'styles', 'onblide.css')), false);
  assert.strictEqual(fs.existsSync(path.join(extensionRoot, 'core', 'ui.js')), false);
  assert.match(foundations, /--ob-blue:/);
  assert.match(components, /\.onframe-commerce-btn/);
  assert.match(components, /\.account-card/);
  assert.match(components, /\.ob-checkbox/);
  assert.match(components, /\.ob-field-shell/);
  assert.match(components, /\.ob-field-input/);
  assert.match(components, /\.ob-field-select/);
  assert.match(components, /\.ob-field-shell:focus-within/);
  assert.match(components, /\.ob-select-caret/);
  assert.match(components, /\.ob-checkbox-description/);
  assert.match(components, /\.ob-icon-12/);
  assert.match(components, /\.ob-spinner/);
  assert.doesNotMatch(moduleStyles, /--ob-[a-z-]+:\s/);
  assert.doesNotMatch(moduleStyles, /@font-face/);
  assert.doesNotMatch(moduleStyles, /#[0-9a-fA-F]{3,8}|rgba\(|z-index:\s*214|--ob-shadow-floating/);
  assert.doesNotMatch(commerceStyles, /accent-color/);
  assert.doesNotMatch(`${popupStyles}\n${optionsStyles}`, /\.account-card\s*\{|\.account-switch\s*\{|\.version-tag\s*\{/);
});

test('acoes em massa usam componentes do design system e feedback de envio', () => {
  const commerceSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');
  const descriptionSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'description', 'module.js'), 'utf8');
  const characteristicsSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'characteristics', 'module.js'), 'utf8');
  const commerceStyles = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'styles.css'), 'utf8');

  assert.strictEqual(commerceSource.includes('class="ob-checkbox onframe-commerce-bulk-switch'), true);
  assert.strictEqual(commerceSource.includes('role="checkbox"'), true);
  assert.strictEqual(commerceSource.includes('aria-checked="${checked ? \'true\' : \'false\'}"'), true);
  assert.strictEqual(commerceSource.includes('ob-checkbox-description'), true);
  assert.strictEqual(commerceSource.includes('type="checkbox"'), false);
  assert.doesNotMatch(commerceStyles, /\.onframe-commerce-bulk-switch\s*{[^}]*min-height:\s*24px/s);
  assert.strictEqual(commerceSource.includes('Validando variações elegíveis...'), true);
  assert.strictEqual(commerceSource.includes('Aplicando promoção nas variações elegíveis...'), true);
  assert.strictEqual(commerceSource.includes('Removendo promoção das variações elegíveis...'), true);
  assert.strictEqual(commerceSource.includes('state.operationPending = \'promotion-bulk-preview\''), true);
  assert.strictEqual(commerceSource.includes('state.operationPending = \'promotion-bulk-commit\''), true);
  assert.strictEqual(descriptionSource.includes('class="ob-checkbox onframe-description-bulk-switch'), true);
  assert.strictEqual(descriptionSource.includes('role="checkbox"'), true);
  assert.strictEqual(descriptionSource.includes('type="checkbox"'), false);
  assert.strictEqual(descriptionSource.includes('/description/bulk'), true);
  assert.strictEqual(descriptionSource.includes('canBulkEditDescription'), true);
  assert.strictEqual(characteristicsSource.includes('class="ob-checkbox onframe-characteristics-bulk-switch'), true);
  assert.strictEqual(characteristicsSource.includes('role="checkbox"'), true);
  assert.strictEqual(characteristicsSource.includes('type="checkbox"'), false);
  assert.strictEqual(characteristicsSource.includes('/characteristics/bulk'), true);
  assert.strictEqual(characteristicsSource.includes('canBulkEditCharacteristics'), true);
  assert.strictEqual(descriptionModel.bulkResultMessage({ counts: { applied: 2, failed: 1 } }), 'Descrição salva em 2 variações. (1 não alterada)');
  assert.strictEqual(characteristicsModel.bulkResultMessage({ counts: { applied: 2, failed: 1 } }), 'Características salvas em 2 variações. (1 não alterada)');
  assert.strictEqual(descriptionModel.canBulkEditDescription({
    quick: true,
    mode: 'user_product',
    item: { id: 'MLB1000000001', user_product_id: 'MLBU100000001' },
    family: { user_products: [{ id: 'MLBU100000001' }, { id: 'MLBU100000002' }] }
  }), false);
  assert.strictEqual(descriptionModel.canBulkEditDescription({
    mode: 'user_product',
    item: { id: 'MLB1000000001', user_product_id: 'MLBU100000001', catalog_listing: true },
    family: { user_products: [{ id: 'MLBU100000001' }, { id: 'MLBU100000002' }] }
  }), false);
  assert.strictEqual(descriptionModel.canBulkEditDescription({
    mode: 'user_product',
    item: { id: 'MLB1000000001', user_product_id: 'MLBU100000001' },
    family: { user_products: [{ id: 'MLBU100000001' }] }
  }), false);
  assert.strictEqual(descriptionModel.canBulkEditDescription({
    mode: 'user_product',
    item: { id: 'MLB1000000001', user_product_id: 'MLBU100000001' },
    family: { user_products: [{ id: 'MLBU100000001' }, { id: 'MLBU100000002' }] }
  }), true);
  assert.strictEqual(characteristicsModel.canBulkEditCharacteristics({
    mode: 'user_product',
    item: { id: 'MLB1000000001', user_product_id: 'MLBU100000001' },
    family: { user_products: [{ id: 'MLBU100000001' }] }
  }), false);
  assert.strictEqual(characteristicsModel.canBulkEditCharacteristics({
    mode: 'user_product',
    item: { id: 'MLB1000000001', user_product_id: 'MLBU100000001' },
    family: { user_products: [{ id: 'MLBU100000001' }, { id: 'MLBU100000002' }] }
  }), true);
});

test('editor inline de descricao preserva altura visual ao abrir', () => {
  const descriptionSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'description', 'module.js'), 'utf8');

  assert.strictEqual(descriptionSource.includes('captureEditingMetrics(elements)'), true);
  assert.strictEqual(descriptionSource.includes('state.editorShellMinHeight = Math.max(320, shellHeight)'), true);
  assert.strictEqual(descriptionSource.includes('style="min-height:${escapeAttribute(state.editorShellMinHeight)}px"'), true);
  assert.strictEqual(descriptionSource.includes('style="min-height:${escapeAttribute(state.editorTextareaMinHeight)}px"'), true);
});

test('editor inline de caracteristicas ancora no bloco tecnico do Mercado Livre', () => {
  const characteristicsSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'characteristics', 'module.js'), 'utf8');
  const shellSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'content-shell.js'), 'utf8');
  const components = fs.readFileSync(path.join(__dirname, '..', 'extension', 'styles', 'components.css'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'characteristics', 'styles.css'), 'utf8');

  assert.strictEqual(characteristicsSource.includes("closest('#highlighted_specs_attrs')"), true);
  assert.strictEqual(characteristicsSource.includes("closest('.ui-vpp-highlighted-specs')"), true);
  assert.strictEqual(characteristicsSource.includes("closest('.ui-pdp-container__row--highlighted-specs-title')"), true);
  assert.strictEqual(characteristicsSource.includes('const anchor = elements.titleRow || elements.title'), true);
  assert.strictEqual(characteristicsSource.includes("anchor.insertAdjacentElement('afterend', action)"), true);
  assert.strictEqual(characteristicsSource.includes('syncEditActionState(existingAction, elements.section)'), true);
  assert.strictEqual(characteristicsSource.includes('function isCharacteristicsCollapsed(section)'), true);
  assert.strictEqual(characteristicsSource.includes("querySelector('.ui-pdp-collapsable--is-collapsed')"), true);
  assert.strictEqual(characteristicsSource.includes('action.disabled = collapsed'), true);
  assert.strictEqual(characteristicsSource.includes("action.setAttribute('aria-disabled', collapsed ? 'true' : 'false')"), true);
  assert.strictEqual(characteristicsSource.includes('if (elements.section && isCharacteristicsCollapsed(elements.section)) return;'), true);
  assert.strictEqual(characteristicsSource.includes("querySelectorAll('.ui-vpp-striped-specs__table')"), true);
  assert.strictEqual(characteristicsSource.includes("querySelectorAll('tr.andes-table__row, tr.ui-vpp-striped-specs__row')"), true);
  assert.strictEqual(characteristicsSource.includes("querySelector('.andes-table__column--value')"), true);
  assert.strictEqual(characteristicsSource.includes('renderInlineFields(elements.section, disabled)'), true);
  assert.strictEqual(characteristicsSource.includes('renderPackageDimensionsCard(disabled)'), true);
  assert.strictEqual(characteristicsSource.includes('onframe-characteristics-package-card'), true);
  assert.strictEqual(characteristicsSource.includes('onframe-characteristics-package-grid'), true);
  assert.strictEqual(characteristicsSource.includes('onframe-characteristics-package-control'), true);
  assert.strictEqual(characteristicsSource.includes("icon('package', 18)"), true);
  assert.strictEqual(characteristicsSource.includes('insertSyntheticFieldRow(groupTargets, group, field, disabled)'), true);
  assert.strictEqual(characteristicsSource.includes('renderCompositeFieldTargets(targets, usedTargets, group, fields, disabled, activeIds)'), true);
  assert.strictEqual(characteristicsSource.includes('isCompositeRenderedFieldTarget(target, group, field)'), true);
  assert.strictEqual(characteristicsSource.includes('splitCompositeHeading(target.fieldLabel).includes(fieldLabel)'), true);
  assert.strictEqual(characteristicsSource.includes('renderCompositeFieldControls(matches, disabled)'), true);
  assert.strictEqual(characteristicsSource.includes('canShareCompositeUnit(fields)'), true);
  assert.strictEqual(characteristicsSource.includes('renderSharedCompositeNumberUnitControls(fields, disabled)'), true);
  assert.strictEqual(characteristicsSource.includes('data-select-composite-ids'), true);
  assert.strictEqual(characteristicsSource.includes('renderSyntheticFieldValue(field, disabled)'), true);
  assert.strictEqual(characteristicsSource.includes('onframe-characteristics-extra-row'), true);
  assert.strictEqual(characteristicsSource.includes('onframe-characteristics-row-composite'), true);
  assert.strictEqual(characteristicsSource.includes('onframe-characteristics-composite-control'), true);
  assert.strictEqual(characteristicsSource.includes('onframe-characteristics-extra-label-text'), true);
  assert.strictEqual(characteristicsSource.includes('renderCharacteristicStatusBadge(field)'), true);
  assert.strictEqual(characteristicsSource.includes('function getCharacteristicStatus(field)'), true);
  assert.strictEqual(characteristicsSource.includes("label: 'Pendente'"), true);
  assert.strictEqual(characteristicsSource.includes("label: 'Leitura'"), true);
  assert.strictEqual(characteristicsSource.includes("label: 'Oculto'"), true);
  assert.strictEqual(characteristicsSource.includes('renderPendingStatusBadge(field)'), false);
  assert.strictEqual(characteristicsSource.includes('renderHiddenStatusBadge(field)'), false);
  assert.strictEqual(characteristicsSource.includes('renderFieldStatusBadges(field)'), false);
  assert.strictEqual(characteristicsSource.includes('renderMissingFields(disabled)'), false);
  assert.strictEqual(characteristicsSource.includes('ob-field-shell onframe-characteristics-field-shell'), true);
  assert.strictEqual(characteristicsSource.includes('ob-field-input onframe-characteristics-compact-field'), true);
  assert.strictEqual(characteristicsSource.includes('onframe-characteristics-select-trigger'), true);
  assert.strictEqual(characteristicsSource.includes('ob-select-caret'), true);
  assert.strictEqual(characteristicsSource.includes('ob-checkbox-label'), true);
  assert.strictEqual(characteristicsSource.includes('ob-checkbox-description'), true);
  assert.doesNotMatch(characteristicsSource, /class="ob-field\s/);
  assert.doesNotMatch(characteristicsSource, /type="checkbox"/);
  assert.doesNotMatch(characteristicsSource, /<select\b/);
  assert.strictEqual(characteristicsSource.includes('data-action="characteristics-select"'), true);
  assert.strictEqual(characteristicsSource.includes('role="listbox"'), true);
  assert.strictEqual(characteristicsSource.includes("querySelectorAll('[data-field-id][data-field-part]')"), true);
  assert.strictEqual(characteristicsSource.includes('row.dataset.fieldId'), false);
  assert.strictEqual(characteristicsSource.includes('row.dataset.characteristicsExtraFieldId'), true);
  assert.strictEqual(characteristicsSource.includes("!('value' in control)"), true);
  assert.strictEqual(characteristicsSource.includes('inlineSyntheticRows'), true);
  assert.strictEqual(characteristicsSource.includes('missingFields.push(field)'), false);
  assert.strictEqual(characteristicsSource.includes('restoreInlineCells()'), true);
  assert.strictEqual(characteristicsSource.includes('isInlineControlActive()'), true);
  assert.strictEqual(characteristicsSource.includes('onframe-characteristics-is-editing'), true);
  assert.strictEqual(characteristicsSource.includes('onframe-characteristics-groups'), false);
  assert.strictEqual(characteristicsSource.includes('onframe-characteristics-grid'), false);
  assert.strictEqual(characteristicsSource.includes('onframe-characteristics-field"'), false);
  assert.strictEqual(styles.includes('.onframe-characteristics-footer'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-package-card'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-package-grid'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-package-control'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-package-unit-shell'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-package-title span'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-package-head span'), false);
  assert.strictEqual(styles.includes('.onframe-characteristics-inline-cell'), true);
  assert.strictEqual(styles.includes('display: inline-flex'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-inline-control .ob-field-shell'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-inline-control .ob-field-input'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-inline-control .ob-field-input:focus'), true);
  assert.strictEqual(styles.includes('outline: none !important'), true);
  assert.strictEqual(styles.includes('box-shadow: none !important'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-inline-control .ob-select-shell'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-select-menu'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-select-option'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-row-editable:has(.onframe-characteristics-select.is-open)'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-composite-control'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-composite-separator'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-composite-unit-shell'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-composite-unit-shell .onframe-characteristics-select-trigger'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-row-composite > .andes-table__header'), true);
  assert.strictEqual(styles.includes('min-height: 64px !important'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-composite-label'), false);
  assert.strictEqual(styles.includes('overflow: visible !important'), true);
  assert.strictEqual(styles.includes('height: 26px'), true);
  assert.strictEqual(styles.includes('height: 48px !important'), true);
  assert.strictEqual(styles.includes('padding-top: 0 !important'), true);
  assert.strictEqual(styles.includes('min-height: 34px'), false);
  assert.strictEqual(styles.includes('.onframe-characteristics-extra-row'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-extra-label'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-extra-label-text'), true);
  assert.strictEqual(styles.includes('display: flex !important'), true);
  assert.strictEqual(styles.includes('text-align: left !important'), true);
  assert.strictEqual(styles.includes('white-space: normal !important'), true);
  assert.strictEqual(styles.includes('width: 100%'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-status-badge'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-status-badge.pending'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-status-badge.readonly'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-status-badge.hidden'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-is-editing .onframe-characteristics-inline-cell input'), true);
  assert.strictEqual(components.includes('#highlighted_specs_attrs.onframe-characteristics-is-editing'), true);
  assert.strictEqual(styles.includes('.onframe-characteristics-hidden-fields'), false);
  assert.strictEqual(styles.includes('.onframe-characteristics-groups'), false);
  assert.strictEqual(styles.includes('.onframe-characteristics-grid'), false);
  assert.strictEqual(shellSource.includes('.onframe-characteristics-inline-control'), true);
  assert.strictEqual(shellSource.includes('.onframe-characteristics-inline-cell'), true);
  assert.strictEqual(shellSource.includes('.onframe-characteristics-extra-row'), true);
  assert.strictEqual(characteristicsSource.includes("field.reason !== 'hidden'"), true);
  assert.strictEqual(styles.includes('[data-testid="action-collapsable-target"].ui-vpp-highlighted-specs__striped-collapsed__action'), true);
  assert.strictEqual(styles.includes('.ui-pdp-collapsable__container'), true);
});

test('ui exibem comando de atualizacao auditavel', () => {
  const popupHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'popup', 'index.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'popup', 'popup.js'), 'utf8');
  const launcherHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'launcher', 'index.html'), 'utf8');
  const launcherJs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'launcher', 'launcher.js'), 'utf8');
  const optionsHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options', 'index.html'), 'utf8');
  const optionsJs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options', 'options.js'), 'utf8');
  const optionsCss = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options', 'options.css'), 'utf8');

  assert.strictEqual(popupHtml.includes('update-block'), true);
  assert.strictEqual(popupHtml.includes('service-start'), true);
  assert.strictEqual(popupHtml.includes('service-restart'), true);
  assert.strictEqual(popupHtml.includes('service-stop'), true);
  assert.strictEqual(popupHtml.includes('service-check'), true);
  assert.strictEqual(popupHtml.includes('service-danger'), true);
  assert.strictEqual(popupHtml.includes('version-tag'), true);
  assert.strictEqual(optionsHtml.includes('version-tag'), true);
  assert.strictEqual(optionsHtml.includes('service-start'), true);
  assert.strictEqual(optionsHtml.includes('service-restart'), true);
  assert.strictEqual(optionsHtml.includes('service-stop'), true);
  assert.strictEqual(optionsHtml.includes('service-check'), true);
  assert.strictEqual(optionsHtml.includes('service-danger'), true);
  assert.strictEqual(optionsHtml.includes('update-title'), false);
  assert.strictEqual(popupHtml.includes('Atualizar agora'), true);
  assert.strictEqual(popupHtml.includes('Copiar comando'), true);
  assert.strictEqual(optionsHtml.includes('Copiar atualizacao'), false);
  assert.strictEqual(optionsHtml.includes('Copiar verificacao'), false);
  assert.strictEqual(popupJs.includes('/updates/status'), true);
  assert.strictEqual(popupJs.includes('updatePageUrl'), true);
  assert.strictEqual(popupJs.includes('releaseUrl'), true);
  assert.strictEqual(popupJs.includes('chrome.runtime.getManifest'), true);
  assert.strictEqual(popupJs.includes('/updates/start'), false);
  assert.strictEqual(popupJs.includes('navigator.clipboard.writeText'), true);
  assert.strictEqual(optionsJs.includes('/updates/status'), true);
  assert.strictEqual(optionsJs.includes('/updates/start'), false);
  assert.strictEqual(optionsJs.includes('checkCommand'), false);
  assert.strictEqual(optionsJs.includes('navigator.clipboard.writeText'), false);
  assert.strictEqual(popupJs.includes('ui/launcher/index.html?action='), true);
  assert.strictEqual(optionsJs.includes('ui/launcher/index.html?action='), true);
  assert.strictEqual(launcherHtml.includes('launcher-commands'), true);
  assert.strictEqual(launcherJs.includes('onframe-updater://update'), true);
  assert.strictEqual(launcherJs.includes('onframe-updater://start'), true);
  assert.strictEqual(launcherJs.includes('onframe-updater://stop'), true);
  assert.strictEqual(launcherJs.includes('onframe-updater://restart'), true);
  assert.strictEqual(launcherJs.includes('onframe-updater://check'), true);
  assert.strictEqual(launcherJs.includes("scripts/bootstrap/start.ps1"), true);
  assert.strictEqual(launcherJs.includes("scripts/bootstrap/stop.ps1"), true);
  assert.strictEqual(launcherJs.includes("scripts/bootstrap/check.ps1"), true);
  const popupCss = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'popup', 'popup.css'), 'utf8');
  assert.strictEqual(popupCss.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'), true);
  assert.strictEqual(popupCss.includes('.service-primary:not(.is-hidden)'), true);
  assert.strictEqual(popupCss.includes('.service-danger'), true);
  assert.strictEqual(optionsCss.includes('.service-actions'), true);
  assert.strictEqual(optionsCss.includes('.service-primary:not(.is-hidden)'), true);
  assert.strictEqual(optionsCss.includes('.service-danger'), true);
});

test('ui usam gerenciamento multi-conta local', () => {
  const popupHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'popup', 'index.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'popup', 'popup.js'), 'utf8');
  const optionsHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options', 'index.html'), 'utf8');
  const optionsJs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options', 'options.js'), 'utf8');

  assert.strictEqual(popupHtml.includes('account-list'), true);
  assert.strictEqual(popupHtml.includes('account-select'), false);
  assert.strictEqual(popupHtml.includes('Aba atual'), false);
  assert.strictEqual(popupHtml.includes('tab-badge'), false);
  assert.strictEqual(popupJs.includes('/auth/accounts'), true);
  assert.strictEqual(popupJs.includes('/auth/accounts/active'), false);
  assert.strictEqual(popupJs.includes('role="switch"'), true);
  assert.strictEqual(popupJs.includes('aria-hidden="true"'), false);
  assert.strictEqual(popupJs.includes('toggle-account'), true);
  assert.strictEqual(popupJs.includes("method: 'PATCH'"), true);
  assert.strictEqual(popupJs.includes('DELETE'), true);
  assert.strictEqual(popupJs.includes('/auth/accounts/${encodeURIComponent(userId)}'), true);
  assert.strictEqual(popupJs.includes('open-account'), true);
  assert.strictEqual(popupJs.includes('remove-account'), true);
  assert.strictEqual(popupJs.includes('account-card-actions'), true);
  assert.strictEqual(popupJs.includes('loadTabStatus'), false);
  assert.strictEqual(popupHtml.includes('Recarregar editor'), false);
  assert.strictEqual(popupHtml.includes('reload-editor'), false);
  assert.strictEqual(popupJs.includes('onframe:reloadEditor'), false);
  assert.strictEqual(optionsHtml.includes('account-list'), true);
  assert.strictEqual(optionsHtml.includes('Remover conta ativa'), false);
  assert.strictEqual(optionsJs.includes('/auth/accounts'), true);
  assert.strictEqual(optionsJs.includes('/auth/accounts/active'), false);
  assert.strictEqual(optionsJs.includes('role="switch"'), true);
  assert.strictEqual(optionsJs.includes('toggle-account'), true);
  assert.strictEqual(optionsJs.includes("method: 'PATCH'"), true);
  assert.strictEqual(optionsJs.includes('DELETE'), true);
  assert.strictEqual(optionsJs.includes('open-account'), true);
  assert.strictEqual(optionsJs.includes('remove-account'), true);
  assert.strictEqual(optionsJs.includes('account-card-actions'), true);
  assert.strictEqual(optionsJs.includes("addIcon(elements.connect, 'plus')"), true);
  assert.strictEqual(optionsJs.includes('client_secret_missing'), false);
});

test('popup persiste visibilidade global do editor', () => {
  const popupJs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'popup', 'popup.js'), 'utf8');
  const shellSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'content-shell.js'), 'utf8');

  assert.strictEqual(popupJs.includes('onframeEditorVisible'), true);
  assert.strictEqual(popupJs.includes('chrome.storage.local.get'), true);
  assert.strictEqual(popupJs.includes('chrome.storage.local.set'), true);
  assert.strictEqual(popupJs.includes('onframe:setEditorVisibility'), true);
  assert.strictEqual(shellSource.includes('onframeEditorVisible'), true);
  assert.strictEqual(shellSource.includes('chrome.storage.onChanged'), true);
  assert.strictEqual(shellSource.includes('setModulesVisible'), true);
  assert.strictEqual(shellSource.includes('onframe:setEditorVisibility'), true);
});

test('shell centraliza sincronizacao de contexto da pagina', () => {
  const shellSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'content-shell.js'), 'utf8');
  const contentSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  const photosSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'photos', 'module.js'), 'utf8');
  const commerceSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');
  const characteristicsSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'characteristics', 'module.js'), 'utf8');
  const registrySource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'module-registry.js'), 'utf8');

  assert.strictEqual(shellSource.includes('setInterval(syncPageState'), false);
  assert.strictEqual(shellSource.includes('MutationObserver'), true);
  assert.strictEqual(shellSource.includes('history.pushState'), true);
  assert.strictEqual(shellSource.includes('handlePageContextChange'), true);
  assert.strictEqual(contentSource.includes('requestPageContextReload'), true);
  assert.strictEqual(contentSource.includes('resolvePageContext: (options)'), false);
  assert.strictEqual(photosSource.includes('services.resolvePageContext'), false);
  assert.strictEqual(commerceSource.includes('services.resolvePageContext'), false);
  assert.strictEqual(photosSource.includes('scheduleContextSync'), false);
  assert.strictEqual(commerceSource.includes('scheduleContextSync'), false);
  assert.strictEqual(characteristicsSource.includes('services.resolvePageContext'), false);
  assert.strictEqual(registrySource.includes("'handlePageContextChange'"), true);
});

test('shell usa resolucao rapida antes da hidratacao completa', () => {
  const shellSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'content-shell.js'), 'utf8');
  const photosSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'photos', 'module.js'), 'utf8');
  const commerceSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');
  const characteristicsSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'characteristics', 'module.js'), 'utf8');

  assert.strictEqual(shellSource.includes('/api/resolve/quick'), true);
  assert.strictEqual(shellSource.includes("status: 'quick-ready'"), true);
  assert.strictEqual(shellSource.includes("status: 'hydration-error'"), true);
  assert.strictEqual(shellSource.includes('waitForStableProductPage'), false);
  assert.strictEqual(commerceSource.includes("status !== 'ready' && status !== 'quick-ready'"), true);
  assert.strictEqual(photosSource.includes("status === 'hydration-error' || status === 'error'"), true);
});

test('commerce nao usa degrade verde nos popovers', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'styles.css'), 'utf8');

  assert.strictEqual(styles.includes('linear-gradient'), false);
  assert.strictEqual(styles.includes('radial-gradient'), false);
});

test('modulos propagam conta dona nas chamadas por item', () => {
  const photosSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'photos', 'module.js'), 'utf8');
  const commerceSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');
  const characteristicsSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'characteristics', 'module.js'), 'utf8');

  assert.match(photosSource, /ownerAccount/);
  assert.match(photosSource, /owner_user_id/);
  assert.match(photosSource, /function itemApiPath/);
  assert.match(commerceSource, /ownerAccount/);
  assert.match(commerceSource, /owner_user_id/);
  assert.match(commerceSource, /function itemApiPath/);
  assert.match(characteristicsSource, /ownerAccount/);
  assert.match(characteristicsSource, /owner_user_id/);
  assert.match(characteristicsSource, /function itemApiPath/);
});

test('qualidade de fotos nao registra falha tecnica sem debug', () => {
  const photosSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'photos', 'module.js'), 'utf8');
  const warnIndex = photosSource.indexOf("console.warn('[OnFrame] qualidade de fotos:'");
  const debugIndex = photosSource.indexOf('Shared.isDebugLoggingEnabled');

  assert.match(photosSource, /function isTransientFetchError/);
  assert.match(photosSource, /await wait\(250\)/);
  assert.ok(debugIndex >= 0);
  assert.ok(warnIndex > debugIndex);
});

test('icons usam classes phosphor e nao svg manual', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'icons.js'), 'utf8');
  const components = fs.readFileSync(path.join(__dirname, '..', 'extension', 'styles', 'components.css'), 'utf8');
  const phosphorCss = fs.readFileSync(path.join(__dirname, '..', 'extension', 'vendor', 'phosphor', 'phosphor.css'), 'utf8');

  assert.strictEqual(source.includes('<path'), false);
  assert.strictEqual(source.includes('<svg'), false);
  assert.match(components, /\.ob-icon\s*\{[^}]*place-items:\s*center/s);
  assert.match(components, /\.ob-icon\s+\.ph::before\s*\{[^}]*line-height:\s*1/s);

  for (const [name, phosphorName] of Object.entries(icons.names)) {
    const rendered = icons.render(name, 16);
    assert.ok(phosphorCss.includes(`.ph-${phosphorName}:before`), `${name} aponta para icone Phosphor inexistente`);
    assert.match(rendered, new RegExp(`ph ph-${phosphorName}`));
    assert.match(rendered, /ob-icon-16/);
    assert.doesNotMatch(rendered, /style=/);
  }
});

test('icons registra fonte phosphor com URL absoluta da extensao', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'icons.js'), 'utf8');
  const appended = [];
  const sandbox = {
    chrome: {
      runtime: {
        getURL(resourcePath) {
          return `chrome-extension://onframe/${resourcePath}`;
        }
      }
    },
    document: {
      head: {
        appendChild(element) {
          appended.push(element);
        }
      },
      createElement(tag) {
        assert.strictEqual(tag, 'style');
        return {};
      },
      getElementById() {
        return null;
      }
    },
    module: { exports: {} }
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(source, sandbox);
  sandbox.module.exports.render('upload', 16);

  assert.strictEqual(appended.length, 1);
  assert.match(appended[0].textContent, /chrome-extension:\/\/onframe\/vendor\/phosphor\/Phosphor\.woff2/);
});

function extractLocalHtmlAssets(html) {
  return Array.from(html.matchAll(/\b(?:href|src)="([^"]+)"/g))
    .map((match) => match[1])
    .filter((asset) => asset && !/^[a-z][a-z0-9+.-]*:/i.test(asset) && !asset.startsWith('#'));
}
