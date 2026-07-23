const {
  test,
  assert,
  fs,
  os,
  path,
  vm,
  buildCommitPayload,
  collectItemIdCandidates,
  extractItemId,
  normalizeItemId,
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
  assert.deepStrictEqual(manifest.content_scripts[0].css, [
    'vendor/phosphor/phosphor.css',
    'styles/foundations.css',
    'styles/components.css',
    'modules/photos/styles.css',
    'modules/commerce/styles.css'
  ]);
  assert.ok(manifest.web_accessible_resources[0].resources.includes('vendor/phosphor/*'));
  assert.ok(scripts.indexOf('core/detection.js') < scripts.indexOf('modules/photos/model.js'));
  assert.ok(scripts.indexOf('core/shared.js') < scripts.indexOf('modules/photos/model.js'));
  assert.ok(scripts.indexOf('modules/photos/model.js') < scripts.indexOf('modules/photos/module.js'));
  assert.ok(scripts.indexOf('modules/photos/module.js') < scripts.indexOf('modules/commerce/model.js'));
  assert.ok(scripts.indexOf('modules/commerce/model.js') < scripts.indexOf('modules/commerce/module.js'));
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
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...manifest.content_scripts[0].js,
    ...manifest.content_scripts[0].css
  ];

  for (const file of manifestFiles) {
    assert.strictEqual(fs.existsSync(path.join(extensionRoot, file)), true, file);
  }

  for (const htmlPath of [manifest.action.default_popup, manifest.options_ui.page]) {
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
    marker: 'ok'
  });

  assert.deepStrictEqual(calls, ['photos:ok', 'commerce:ok']);
  assert.deepStrictEqual(modules, [photosModule, commerceModule]);
  assert.throws(() => moduleRegistry.assertModuleContract({ id: 'bad', label: 'Ruim' }), /sem contrato/);
});

test('ui carregam phosphor local do design system', () => {
  const popup = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'popup', 'index.html'), 'utf8');
  const options = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options', 'index.html'), 'utf8');

  assert.match(popup, /href="\.\.\/\.\.\/vendor\/phosphor\/phosphor\.css"/);
  assert.match(popup, /href="\.\.\/\.\.\/styles\/foundations\.css"/);
  assert.match(popup, /href="\.\.\/\.\.\/styles\/components\.css"/);
  assert.match(popup, /href="\.\.\/\.\.\/styles\/shell\.css"/);
  assert.match(options, /href="\.\.\/\.\.\/vendor\/phosphor\/phosphor\.css"/);
  assert.match(options, /href="\.\.\/\.\.\/styles\/foundations\.css"/);
  assert.match(options, /href="\.\.\/\.\.\/styles\/components\.css"/);
  assert.match(options, /href="\.\.\/\.\.\/styles\/shell\.css"/);
});

test('design system nao e redefinido pelos modulos', () => {
  const extensionRoot = path.join(__dirname, '..', 'extension');
  const foundations = fs.readFileSync(path.join(extensionRoot, 'styles', 'foundations.css'), 'utf8');
  const components = fs.readFileSync(path.join(extensionRoot, 'styles', 'components.css'), 'utf8');
  const photosStyles = fs.readFileSync(path.join(extensionRoot, 'modules', 'photos', 'styles.css'), 'utf8');
  const commerceStyles = fs.readFileSync(path.join(extensionRoot, 'modules', 'commerce', 'styles.css'), 'utf8');
  const popupStyles = fs.readFileSync(path.join(extensionRoot, 'ui', 'popup', 'popup.css'), 'utf8');
  const optionsStyles = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'options.css'), 'utf8');
  const moduleStyles = `${photosStyles}\n${commerceStyles}`;

  assert.strictEqual(fs.existsSync(path.join(extensionRoot, 'styles', 'onblide.css')), false);
  assert.strictEqual(fs.existsSync(path.join(extensionRoot, 'core', 'ui.js')), false);
  assert.match(foundations, /--ob-blue:/);
  assert.match(components, /\.onframe-commerce-btn/);
  assert.match(components, /\.account-card/);
  assert.doesNotMatch(moduleStyles, /--ob-[a-z-]+:\s/);
  assert.doesNotMatch(moduleStyles, /@font-face/);
  assert.doesNotMatch(moduleStyles, /#[0-9a-fA-F]{3,8}|rgba\(|z-index:\s*214|--ob-shadow-floating/);
  assert.doesNotMatch(`${popupStyles}\n${optionsStyles}`, /\.account-card\s*\{|\.account-switch\s*\{|\.version-tag\s*\{/);
});

test('ui exibem comando de atualizacao auditavel', () => {
  const popupHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'popup', 'index.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'popup', 'popup.js'), 'utf8');
  const optionsHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options', 'index.html'), 'utf8');
  const optionsJs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options', 'options.js'), 'utf8');

  assert.strictEqual(popupHtml.includes('update-block'), true);
  assert.strictEqual(popupHtml.includes('version-tag'), true);
  assert.strictEqual(optionsHtml.includes('version-tag'), true);
  assert.strictEqual(optionsHtml.includes('update-title'), false);
  assert.strictEqual(popupHtml.includes('Copiar comando'), true);
  assert.strictEqual(optionsHtml.includes('Copiar atualizacao'), false);
  assert.strictEqual(optionsHtml.includes('Copiar verificacao'), false);
  assert.strictEqual(popupJs.includes('/updates/status'), true);
  assert.strictEqual(popupJs.includes('releaseUrl'), true);
  assert.strictEqual(popupJs.includes('chrome.runtime.getManifest'), true);
  assert.strictEqual(popupJs.includes('/updates/start'), false);
  assert.strictEqual(popupJs.includes('navigator.clipboard.writeText'), true);
  assert.strictEqual(optionsJs.includes('/updates/status'), true);
  assert.strictEqual(optionsJs.includes('/updates/start'), false);
  assert.strictEqual(optionsJs.includes('checkCommand'), false);
  assert.strictEqual(optionsJs.includes('navigator.clipboard.writeText'), false);
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
  assert.strictEqual(registrySource.includes("'handlePageContextChange'"), true);
});

test('commerce nao usa degrade verde nos popovers', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'styles.css'), 'utf8');

  assert.strictEqual(styles.includes('linear-gradient'), false);
  assert.strictEqual(styles.includes('radial-gradient'), false);
});

test('modulos propagam conta dona nas chamadas por item', () => {
  const photosSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'photos', 'module.js'), 'utf8');
  const commerceSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'modules', 'commerce', 'module.js'), 'utf8');

  assert.match(photosSource, /ownerAccount/);
  assert.match(photosSource, /owner_user_id/);
  assert.match(photosSource, /function itemApiPath/);
  assert.match(commerceSource, /ownerAccount/);
  assert.match(commerceSource, /owner_user_id/);
  assert.match(commerceSource, /function itemApiPath/);
});

test('icons usam classes phosphor e nao svg manual', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'icons.js'), 'utf8');
  const phosphorCss = fs.readFileSync(path.join(__dirname, '..', 'extension', 'vendor', 'phosphor', 'phosphor.css'), 'utf8');

  assert.strictEqual(source.includes('<path'), false);
  assert.strictEqual(source.includes('<svg'), false);

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
    .filter((asset) => asset && !asset.startsWith('http') && !asset.startsWith('#'));
}
