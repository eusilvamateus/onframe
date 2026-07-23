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
  MercadoLivreClient,
  TokenStore,
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
  updateManager,
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
const crypto = require('crypto');

test('shared toUserError nao registra log tecnico sem debug explicito', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'shared.js'), 'utf8');
  const warnings = [];
  const sandbox = {
    console: {
      warn(...args) {
        warnings.push(args);
      }
    },
    localStorage: {
      getItem() {
        return '0';
      }
    }
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(source, sandbox);
  const err = new Error('Mensagem simples.');
  err.technicalError = 'Detalhe tecnico.';

  assert.strictEqual(sandbox.OnFrameShared.toUserError(err, { logPrefix: '[OnFrame]' }), 'Mensagem simples.');
  assert.deepStrictEqual(warnings, []);

  sandbox.localStorage.getItem = () => '1';
  sandbox.OnFrameShared.toUserError(err, { logPrefix: '[OnFrame]' });
  assert.strictEqual(warnings.length, 1);
});

test('token crypto roundtrip e sanitizacao nao vazam tokens', () => {
  const key = Buffer.alloc(32, 7);
  const encrypted = encrypt(JSON.stringify({ access_token: 'APP_USR-abc', refresh_token: 'TG-def' }), key);
  assert.deepStrictEqual(JSON.parse(decrypt(encrypted, key)), {
    access_token: 'APP_USR-abc',
    refresh_token: 'TG-def'
  });
  assert.strictEqual(
    sanitizeError(new Error('falhou APP_USR-abc-123 e TG-def-456')),
    'falhou [REDACTED] e [REDACTED]'
  );
});

test('token store salva multiplas contas e escolhe conta ativa', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onframe-tokens-'));
  const store = new TokenStore({
    env: {
      ML_TOKEN_STORE_PATH: path.join(dir, 'tokens.json'),
      ONBLIDE_TOKEN_SECRET: 'secret-test'
    }
  });

  await store.write({
    access_token: 'APP_USR-1',
    refresh_token: 'TG-1',
    user_id: 101,
    expires_at: 1000
  }, {
    nickname: 'LOJA 1',
    site_id: 'MLB'
  });
  await store.write({
    access_token: 'APP_USR-2',
    refresh_token: 'TG-2',
    user_id: 202,
    expires_at: 2000
  }, {
    nickname: 'LOJA 2',
    site_id: 'MLB'
  });

  assert.strictEqual((await store.read()).user_id, 202);
  assert.deepStrictEqual((await store.listAccounts()).map((account) => [account.user_id, account.nickname, account.active, account.enabled]), [
    [101, 'LOJA 1', false, true],
    [202, 'LOJA 2', true, true]
  ]);
  assert.deepStrictEqual((await store.listAccountTokens()).map((account) => [account.user_id, account.refresh_token, account.active, account.enabled]), [
    [101, 'TG-1', false, true],
    [202, 'TG-2', true, true]
  ]);
  assert.strictEqual((await store.readAccount(101)).nickname, 'LOJA 1');

  await store.setAccountEnabled(202, false);
  assert.strictEqual((await store.readAccount(202)).enabled, false);
  assert.strictEqual((await store.listAccounts()).find((account) => account.user_id === 202).enabled, false);

  await store.setActive(101);
  assert.strictEqual((await store.read()).refresh_token, 'TG-1');
  await store.clear();
  assert.strictEqual((await store.read()).user_id, 202);
});

test('token store trata token legado como desconectado', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onframe-legacy-token-'));
  const filePath = path.join(dir, 'tokens.json');
  const key = cryptoKeyForTest('secret-test');
  const legacy = encrypt(JSON.stringify({ access_token: 'APP_USR-old', refresh_token: 'TG-old', user_id: 1 }), key);
  fs.writeFileSync(filePath, JSON.stringify(legacy));

  const store = new TokenStore({
    env: {
      ML_TOKEN_STORE_PATH: filePath,
      ONBLIDE_TOKEN_SECRET: 'secret-test'
    }
  });
  assert.strictEqual(await store.read(), null);
  assert.deepStrictEqual(await store.listAccounts(), []);
});

test('mercado livre client usa Onblide Connect para token e refresh', async () => {
  const writes = [];
  const requests = [];
  const store = {
    write: async (token, account) => writes.push({ token, account })
  };
  const client = new MercadoLivreClient({
    env: { ONBLIDE_CONNECT_BASE_URL: 'https://connect.test' },
    store,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          access_token: url.endsWith('/refresh') ? 'APP_USR-refresh' : 'APP_USR-code',
          refresh_token: url.endsWith('/refresh') ? 'TG-refresh' : 'TG-code',
          user_id: 123,
          expires_in: 21600
        })
      };
    }
  });

  const token = await client.exchangeAuthorizationCode({
    code: 'code',
    redirectUri: 'https://connect.onblide.com/api/mercadolivre/callback',
    codeVerifier: 'verifier',
    brokerState: 'state'
  });
  const refreshed = await client.refreshToken(token);

  assert.strictEqual(requests[0].url, 'https://connect.test/api/mercadolivre/token');
  assert.deepStrictEqual(JSON.parse(requests[0].options.body), {
    code: 'code',
    redirectUri: 'https://connect.onblide.com/api/mercadolivre/callback',
    codeVerifier: 'verifier',
    brokerState: 'state'
  });
  assert.strictEqual(requests[1].url, 'https://connect.test/api/mercadolivre/refresh');
  assert.deepStrictEqual(JSON.parse(requests[1].options.body), { refreshToken: 'TG-code' });
  assert.strictEqual(refreshed.access_token, 'APP_USR-refresh');
  assert.strictEqual(writes.length, 2);
  assert.strictEqual(writes[1].token.refresh_token, 'TG-refresh');
  assert.strictEqual(writes[1].account.user_id, 123);
});

test('userFriendlyError traduz erros comuns para linguagem natural', () => {
  const unauthorized = new Error('Mercado Livre nao autenticado.');
  unauthorized.statusCode = 401;
  assert.match(userFriendlyError(unauthorized), /Conta desconectada/i);

  const forbidden = new Error('Este anuncio nao pertence ao seller autenticado.');
  forbidden.statusCode = 403;
  assert.match(userFriendlyError(forbidden), /Conta errada/i);

  const localService = new Error('connect ECONNREFUSED 127.0.0.1:4765');
  assert.match(userFriendlyError(localService), /Serviço local desligado/i);

  const catalog = new Error('catalog_listing_pictures_read_only');
  catalog.statusCode = 409;
  assert.match(userFriendlyError(catalog), /Catálogo/i);

  const closedWithBids = new Error('Cannot update item MLB5770062148 [status:closed, has_bids:true]');
  closedWithBids.statusCode = 400;
  assert.match(userFriendlyError(closedWithBids), /Anúncio encerrado/i);

  const closedWithoutBids = new Error('Cannot update item MLB5770062148 [status:closed, has_bids:false]');
  closedWithoutBids.statusCode = 400;
  assert.match(userFriendlyError(closedWithoutBids), /Reative antes de editar/i);

  const automation = new Error('pricing_automation_active');
  automation.statusCode = 409;
  assert.match(userFriendlyError(automation), /Preço automático ativo/i);

  const missingStock = new Error('promotion_missing_stock');
  missingStock.statusCode = 400;
  assert.match(userFriendlyError(missingStock), /estoque reservado/i);

  const discountRule = new Error('error_credibility discounted_price');
  discountRule.body = {
    cause: [{
      min_discounted_price: 80,
      max_discounted_price: 120,
      suggested_discounted_price: 99
    }]
  };
  assert.match(userFriendlyError(discountRule), /Permitido: R\$ 80,00 a R\$ 120,00/i);
  assert.match(userFriendlyError(discountRule), /Sugerido: R\$ 99,00/i);

  const discountRuleWithoutRange = new Error('error_credibility discounted_price');
  assert.match(userFriendlyError(discountRuleWithoutRange), /Atualize as promoções/i);
  assert.doesNotMatch(userFriendlyError(discountRuleWithoutRange), /faixa exibida/i);
});

test('service separa rotas de item e fotos do servidor HTTP', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'service', 'src', 'app.js'), 'utf8');
  const itemsRoute = require('../service/src/routes/items');
  const picturesRoute = require('../service/src/routes/pictures');
  const pricingRoute = require('../service/src/routes/pricing');
  const promotionsRoute = require('../service/src/routes/promotions');
  const itemContext = require('../service/src/item-context');

  assert.strictEqual(typeof itemsRoute.handleResolve, 'function');
  assert.strictEqual(typeof picturesRoute.handlePictureCommit, 'function');
  assert.strictEqual(typeof picturesRoute.handlePictureQuality, 'function');
  assert.strictEqual(typeof pricingRoute.handlePriceSummary, 'function');
  assert.strictEqual(typeof pricingRoute.handleStandardPriceUpdate, 'function');
  assert.strictEqual(typeof promotionsRoute.handlePromotionSummary, 'function');
  assert.strictEqual(typeof promotionsRoute.handleCreateOffer, 'function');
  assert.strictEqual(typeof itemContext.resolveItemContext, 'function');
  assert.strictEqual(appSource.includes('async function handlePictureCommit'), false);
  assert.strictEqual(appSource.includes('async function resolveItemContext'), false);
});

test('service mantem exports publicos enxutos', () => {
  const meliClient = require('../service/src/meli-client');
  const pricing = require('../service/src/pricing');
  const promotions = require('../service/src/promotions');
  const pictureQuality = require('../service/src/picture-quality');
  const updateManagerModule = require('../service/src/update-manager');
  const itemContextSource = fs.readFileSync(path.join(__dirname, '..', 'service', 'src', 'item-context.js'), 'utf8');

  assert.deepStrictEqual(Object.keys(meliClient).sort(), ['MercadoLivreClient']);
  assert.deepStrictEqual(Object.keys(pricing).sort(), ['buildCostProjection', 'buildPriceSummary', 'updateStandardPrice']);
  assert.deepStrictEqual(Object.keys(promotions).sort(), [
    'buildPromotionSummary',
    'createCampaign',
    'createOffer',
    'deleteCampaign',
    'deleteOffer',
    'estimatePromotionImpact',
    'listCampaigns',
    'updateCampaign',
    'updateOffer'
  ]);
  assert.deepStrictEqual(Object.keys(pictureQuality).sort(), [
    'OFFICIAL_TARGET_SIZE',
    'buildPictureQualityReport',
    'buildResolutionSummary',
    'calculateOptimizedDimensions',
    'calculateResolutionScore',
    'downloadBestPictureImage',
    'extractImageDimensions',
    'extractImageDimensionsFromBase64',
    'extractOfficialDimensions'
  ]);
  assert.deepStrictEqual(Object.keys(updateManagerModule).sort(), [
    'buildBootstrapCommand',
    'compareVersions',
    'createUpdateManager',
    'tagToVersion'
  ]);
  assert.strictEqual(itemContextSource.includes('legacyWeakItems'), false);
  assert.strictEqual(itemContextSource.includes('legacyWeakUserProducts'), false);
});

test('service expoe status de atualizacao auditavel', async (t) => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'service', 'src', 'app.js'), 'utf8');
  const fakeUpdateManager = {
    getStatus: async () => ({ ok: true, updateAvailable: false })
  };
  const server = await listen(createApp({ updateManager: fakeUpdateManager }));
  t.after(() => server.close());

  assert.strictEqual(appSource.includes('/updates/status'), true);
  assert.strictEqual(appSource.includes('/updates/start'), false);
  assert.strictEqual(fs.existsSync(path.join(__dirname, '..', 'service', 'src', 'update-manager.js')), true);

  const status = await fetch(`${server.url}/updates/status`);
  assert.strictEqual(status.status, 200);
  assert.deepStrictEqual(await status.json(), { ok: true, updateAvailable: false });
});

test('update manager compara versoes semver e extrai tags', () => {
  assert.match(
    updateManager.buildBootstrapCommand({ root: 'C:\\OnFrame', scriptUrl: 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.ps1' }),
    /^\$env:ONFRAME_HOME='C:\\OnFrame'; iwr -useb 'https:\/\/raw\.githubusercontent\.com\/eusilvamateus\/onframe\/main\/scripts\/bootstrap\/update\.ps1' \| iex$/
  );
  assert.strictEqual(updateManager.tagToVersion('v0.3.2'), '0.3.2');
  assert.strictEqual(updateManager.tagToVersion('0.3.2-preview.1'), '0.3.2-preview.1');
  assert.strictEqual(updateManager.compareVersions('0.3.2', '0.3.1'), 1);
  assert.strictEqual(updateManager.compareVersions('0.3.2-preview.1', '0.3.2'), -1);
  assert.strictEqual(updateManager.compareVersions('0.3.2-preview.2', '0.3.2-preview.1'), 1);
});

test('update manager usa stable ou preview conforme canal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onframe-update-'));
  const fetchImpl = async () => ({
    ok: true,
    text: async () => JSON.stringify([
      release('v0.3.3-preview.1', true),
      release('v0.3.2', false)
    ])
  });

  const stable = updateManager.createUpdateManager({
    root,
    currentVersion: '0.3.1',
    env: { ONFRAME_UPDATE_CHANNEL: 'stable' },
    fetchImpl
  });
  const preview = updateManager.createUpdateManager({
    root,
    currentVersion: '0.3.1',
    env: { ONFRAME_UPDATE_CHANNEL: 'preview' },
    fetchImpl
  });

  assert.strictEqual((await stable.getStatus({ force: true })).latestVersion, '0.3.2');
  assert.strictEqual((await preview.getStatus({ force: true })).latestVersion, '0.3.3-preview.1');
});

test('update manager retorna comando quando existe versao nova', async () => {
  const root = 'C:\\Users\\Mateus\\onframe';
  const fetchImpl = async () => ({
    ok: true,
    text: async () => JSON.stringify([release('v0.3.2', false)])
  });
  const manager = updateManager.createUpdateManager({
    root,
    currentVersion: '0.3.1',
    env: {},
    fetchImpl
  });

  const status = await manager.getStatus({ force: true });
  assert.strictEqual(status.updateAvailable, true);
  assert.strictEqual(status.canUpdate, true);
  assert.strictEqual(status.reason, 'copy_command');
  assert.match(status.updateCommand, /ONFRAME_HOME='C:\\Users\\Mateus\\onframe'/);
  assert.match(status.updateCommand, /scripts\/bootstrap\/update\.ps1/);
  assert.match(status.checkCommand, /ONFRAME_HOME='C:\\Users\\Mateus\\onframe'/);
  assert.match(status.checkCommand, /scripts\/bootstrap\/check\.ps1/);
});

test('release package nao inclui env nem estado gerenciado', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'release', 'package-release.js'), 'utf8');

  assert.match(source, /'\.env\.example'/);
  assert.strictEqual(source.includes("'.env'"), false);
  assert.strictEqual(source.includes('install.json'), false);
  assert.strictEqual(source.includes('.bat'), false);
});

test('bootstrap substitui atalhos bat legados', () => {
  const root = path.join(__dirname, '..');
  const updateScript = fs.readFileSync(path.join(root, 'scripts', 'bootstrap', 'update.ps1'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.strictEqual(fs.existsSync(path.join(root, 'onframe-start.bat')), false);
  assert.strictEqual(fs.existsSync(path.join(root, 'onframe-stop.bat')), false);
  assert.strictEqual(fs.existsSync(path.join(root, 'onframe-doctor.bat')), false);
  assert.strictEqual(fs.existsSync(path.join(root, 'onframe-update.bat')), false);
  assert.deepStrictEqual(
    fs.existsSync(path.join(root, 'scripts', 'windows'))
      ? fs.readdirSync(path.join(root, 'scripts', 'windows')).filter((entry) => entry !== '.gitkeep')
      : [],
    []
  );
  assert.strictEqual(updateScript.includes('.bat'), false);
  assert.strictEqual(updateScript.includes('Start-OnFrameService'), true);
  assert.strictEqual(updateScript.includes('powershell -NoProfile -ExecutionPolicy Bypass -File $startScript'), false);
  assert.strictEqual(updateScript.includes("Join-Path $env:LOCALAPPDATA 'OnFrame'"), true);
  assert.strictEqual(updateScript.includes('(Get-Location).Path'), false);
  assert.strictEqual(packageJson.scripts.check.includes('scripts/bootstrap/check.ps1'), true);
  assert.strictEqual(JSON.stringify(packageJson.scripts).includes('doctor'), false);
});

function release(tag, prerelease) {
  return {
    tag_name: tag,
    html_url: `https://github.test/release/${tag}`,
    draft: false,
    prerelease,
    assets: [{
      name: `onframe-release-${tag}.zip`,
      browser_download_url: `https://github.test/download/${tag}.zip`
    }]
  };
}

function cryptoKeyForTest(secret) {
  return crypto.scryptSync(secret, 'onblide-ml-token-store-v1', 32);
}

test('dotenv parseValue remove aspas simples ou duplas', () => {
  assert.strictEqual(parseValue('"abc"'), 'abc');
  assert.strictEqual(parseValue("'abc'"), 'abc');
  assert.strictEqual(parseValue('abc'), 'abc');
});

test('auth account retorna desconectado sem token salvo', async (t) => {
  const server = await listen(createApp({
    store: { read: async () => null },
    client: { getMe: async () => { throw new Error('getMe nao deveria ser chamado'); } }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/auth/account`);
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), {
    authenticated: false,
    userId: null,
    expiresAt: null,
    account: null
  });
});

test('auth start e callback usam brokerState do Onblide Connect', async (t) => {
  const oldFetch = global.fetch;
  let startPayload = null;
  const exchanges = [];
  const writes = [];
  global.fetch = async (url, options) => {
    assert.strictEqual(url, 'https://connect.test/api/mercadolivre/start');
    startPayload = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        authUrl: 'https://auth.mercadolibre.com.br/authorization',
        redirectUri: 'https://connect.onblide.com/api/mercadolivre/callback',
        brokerState: 'broker-state',
        expiresIn: 600
      })
    };
  };
  t.after(() => { global.fetch = oldFetch; });

  const client = {
    store: {
      write: async (token, account) => writes.push({ token, account })
    },
    exchangeAuthorizationCode: async (payload) => {
      exchanges.push(payload);
      return {
        access_token: 'APP_USR-token',
        refresh_token: 'TG-token',
        user_id: 123,
        expires_at: Date.now() + 3600000
      };
    },
    getMe: async () => ({
      id: 123,
      nickname: 'BOGU STORE',
      site_id: 'MLB'
    })
  };
  const server = await listen(createApp({
    env: {
      ML_SERVICE_PORT: '4765',
      ONBLIDE_CONNECT_BASE_URL: 'https://connect.test'
    },
    store: { read: async () => null },
    client
  }));
  t.after(() => server.close());

  const start = await oldFetch(`${server.url}/auth/start`, { method: 'POST', body: '{}' });
  assert.strictEqual(start.status, 200);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(startPayload, 'clientId'), false);
  assert.strictEqual(startPayload.callbackUrl, 'http://127.0.0.1:4765/auth/mercadolivre/callback');
  assert.ok(startPayload.state);

  const callback = await oldFetch(`${server.url}/auth/mercadolivre/callback?state=${encodeURIComponent(startPayload.state)}&code=code-123`);
  assert.strictEqual(callback.status, 200);
  assert.strictEqual(exchanges[0].code, 'code-123');
  assert.strictEqual(exchanges[0].redirectUri, 'https://connect.onblide.com/api/mercadolivre/callback');
  assert.strictEqual(exchanges[0].brokerState, 'broker-state');
  assert.ok(exchanges[0].codeVerifier);
  assert.strictEqual(writes[0].account.nickname, 'BOGU STORE');
});

test('diagnostics retorna estado local sem vazar tokens', async (t) => {
  const server = await listen(createApp({
    env: {
      ML_SERVICE_PORT: '4765'
    },
    store: {
      filePath: 'C:\\tokens\\tokens.json',
      read: async () => ({
        refresh_token: 'TG-secret',
        access_token: 'APP_USR-secret',
        user_id: 123,
        expires_at: Date.now() + 3600000
      })
    },
    client: { getMe: async () => ({ id: 123 }) }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/diagnostics`);
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.service, 'onframe');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(body.config, 'clientIdConfigured'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(body.config, 'clientSecretConfigured'), false);
  assert.strictEqual(body.auth.tokenPresent, true);
  assert.strictEqual(body.auth.userId, 123);
  assert.strictEqual(serialized.includes('TG-secret'), false);
  assert.strictEqual(serialized.includes('APP_USR-secret'), false);
});

test('diagnostics nao alerta token expirado quando refresh esta salvo', async (t) => {
  const server = await listen(createApp({
    store: {
      read: async () => ({
        refresh_token: 'TG-secret',
        access_token: 'APP_USR-expired',
        user_id: 123,
        expires_at: Date.now() - 1000
      })
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/diagnostics`);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.auth.tokenPresent, true);
  assert.strictEqual(body.auth.expired, true);
  assert.strictEqual(body.ready, true);
  assert.deepStrictEqual(body.issues, []);
  assert.deepStrictEqual(body.nextActions, ['Pronto para editar fotos.']);
});

test('auth accounts lista, ativa e remove contas locais', async (t) => {
  const accounts = [
    { user_id: 101, nickname: 'LOJA 1', active: true, enabled: true },
    { user_id: 202, nickname: 'LOJA 2', active: false, enabled: true }
  ];
  const store = {
    listAccounts: async () => accounts,
    setActive: async (userId) => {
      accounts.forEach((account) => { account.active = String(account.user_id) === String(userId); });
      return accounts.find((account) => account.active);
    },
    removeAccount: async (userId) => {
      const index = accounts.findIndex((account) => String(account.user_id) === String(userId));
      if (index >= 0) accounts.splice(index, 1);
      if (!accounts.some((account) => account.active) && accounts[0]) accounts[0].active = true;
    },
    setAccountEnabled: async (userId, enabled) => {
      const account = accounts.find((item) => String(item.user_id) === String(userId));
      account.enabled = enabled;
      return account;
    }
  };
  const server = await listen(createApp({ store }));
  t.after(() => server.close());

  const list = await fetch(`${server.url}/auth/accounts`);
  assert.strictEqual(list.status, 200);
  assert.strictEqual((await list.json()).activeUserId, 101);

  const active = await fetch(`${server.url}/auth/accounts/active`, {
    method: 'POST',
    body: JSON.stringify({ userId: 202 })
  });
  assert.strictEqual(active.status, 200);
  assert.strictEqual((await active.json()).activeUserId, 202);

  const enabled = await fetch(`${server.url}/auth/accounts/202`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled: false })
  });
  assert.strictEqual(enabled.status, 200);
  assert.strictEqual((await enabled.json()).accounts.find((account) => account.user_id === 202).enabled, false);

  const removed = await fetch(`${server.url}/auth/accounts/202`, { method: 'DELETE' });
  assert.strictEqual(removed.status, 200);
  const body = await removed.json();
  assert.strictEqual(body.activeUserId, 101);
  assert.deepStrictEqual(body.accounts.map((account) => account.user_id), [101]);
});

test('auth account retorna dados seguros da conta conectada', async (t) => {
  const expiresAt = Date.now() + 3600000;
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret', user_id: 123, expires_at: expiresAt }) },
    client: {
      getMe: async () => ({
        id: 123,
        nickname: 'BOGU STORE',
        site_id: 'MLB',
        permalink: 'https://perfil.mercadolivre.com.br/BOGU+STORE',
        status: { site_status: 'active' },
        email: 'privado@example.com'
      })
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/auth/account`);
  const body = await response.json();
  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.authenticated, true);
  assert.strictEqual(body.userId, 123);
  assert.strictEqual(body.expiresAt, expiresAt);
  assert.deepStrictEqual(body.account, {
    id: 123,
    nickname: 'BOGU STORE',
    site_id: 'MLB',
    permalink: 'https://perfil.mercadolivre.com.br/BOGU+STORE',
    status: { site_status: 'active' }
  });
  assert.strictEqual(JSON.stringify(body).includes('TG-secret'), false);
  assert.strictEqual(JSON.stringify(body).includes('privado@example.com'), false);
});

test('auth account traduz token invalido como conta desconectada', async (t) => {
  const server = await listen(createApp({
    store: { read: async () => ({ refresh_token: 'TG-secret', user_id: 123, expires_at: 1 }) },
    client: {
      getMe: async () => {
        const err = new Error('invalid_grant');
        err.statusCode = 401;
        throw err;
      }
    }
  }));
  t.after(() => server.close());

  const response = await fetch(`${server.url}/auth/account`);
  const body = await response.json();
  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.authenticated, false);
  assert.strictEqual(body.userId, 123);
  assert.strictEqual(body.account, null);
  assert.match(body.error, /Conta desconectada/i);
});
