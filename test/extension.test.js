const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const extensionRoot = path.join(root, 'extension');

test('manifest declara somente os hosts públicos indispensáveis', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.host_permissions, [
    'https://*.mercadolivre.com.br/*',
    'https://onframe.onblide.com/*',
    'https://ignrkxityihpvreaimxe.supabase.co/*'
  ]);
  assert.equal(manifest.action.default_popup, 'ui/popup/index.html');
  assert.equal(manifest.options_ui.page, 'ui/options/index.html');
  assert.equal(fs.existsSync(path.join(extensionRoot, 'ui', 'launcher')), false);
});

test('popup e opções autenticam por senha sem expor um código de pareamento', () => {
  const popup = fs.readFileSync(path.join(extensionRoot, 'ui', 'popup', 'popup.js'), 'utf8');
  const popupHtml = fs.readFileSync(path.join(extensionRoot, 'ui', 'popup', 'index.html'), 'utf8');
  const options = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'options.js'), 'utf8');
  const optionsHtml = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'index.html'), 'utf8');
  const componentsCss = fs.readFileSync(path.join(extensionRoot, 'styles', 'components.css'), 'utf8');

  assert.match(popupHtml, /data-auth-form="signin"/);
  assert.match(popupHtml, /data-auth-form="signup"/);
  assert.match(popupHtml, /data-auth-action="magic"/);
  assert.match(popupHtml, /data-auth-challenge="signin"/);
  assert.match(optionsHtml, /data-auth-form="signin"/);
  assert.match(optionsHtml, /data-auth-form="signup"/);
  assert.match(optionsHtml, /data-auth-action="recovery"/);
  assert.match(optionsHtml, /data-auth-password="remote-signin-password"/);
  assert.match(optionsHtml, /data-auth-password="remote-signup-confirmation"/);
  assert.match(popupHtml, /data-auth-password="popup-signup-confirmation"/);
  assert.match(optionsHtml, /id="remote-context" hidden/);
  assert.match(popupHtml, /id="connection-context" hidden/);
  assert.match(optionsHtml, /id="remote-account-connect"/);
  assert.match(optionsHtml, /id="remote-account-connect-empty"/);
  assert.match(optionsHtml, /core\/auth-controller\.js/);
  assert.match(popupHtml, /core\/auth-controller\.js/);
  assert.doesNotMatch(optionsHtml, /OF-\.{3}|pareamento|cole um código/i);
  assert.doesNotMatch(popupHtml, /OF-\.{3}|pareamento|cole um código/i);
  assert.match(popup, /ensureAuthController/);
  assert.match(options, /ensureAuthController/);
  assert.match(options, /remoteContext\.hidden = !connected/);
  assert.match(popup, /connectionContext\.hidden = !connected/);
  assert.match(componentsCss, /\.ob-shell :focus-visible:not\(\.ob-field-input\)/);
  assert.match(componentsCss, /\.ob-field-input\[type="password"\]::\-ms\-reveal/);
  const authController = fs.readFileSync(path.join(extensionRoot, 'core', 'auth-controller.js'), 'utf8');
  assert.match(authController, /ph-eye-closed/);
  assert.doesNotMatch(authController, /ph-eye-slash/);
  assert.match(authController, /\(token\) => \{\s*if \(token\) clearFeedback\(\);\s*\}/);
  assert.match(popup, /onframe-updater:\/\/update/);
  assert.match(options, /onframe-updater:\/\/update/);
  assert.match(options, /account-update/);
  assert.match(options, /account-remove/);
  assert.doesNotMatch(popup, /127\.0\.0\.1|onframe:openLauncher|\/updates\//);
  assert.doesNotMatch(options, /127\.0\.0\.1|onframe:openLauncher|\/updates\//);
  assert.match(options, /status\.className = 'ob-badge ' \+ \(enabled \? 'green' : 'grey'\)/);
  assert.match(popup, /status\.className = 'ob-badge ' \+ \(enabled \? 'green' : 'grey'\)/);
});

test('ponte da extensão exige sessão remota e nunca usa fallback HTTP local', () => {
  const shared = fs.readFileSync(path.join(extensionRoot, 'core', 'shared.js'), 'utf8');
  const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
  const content = fs.readFileSync(path.join(extensionRoot, 'content.js'), 'utf8');

  assert.doesNotMatch(shared, /127\.0\.0\.1|const SERVICE/);
  assert.doesNotMatch(background, /127\.0\.0\.1|onframe:openLauncher|const SERVICE/);
  assert.match(background, /Entre na extensão do OnFrame para editar anúncios/);
  assert.match(background, /\/v1\$\{path\}/);
  assert.match(content, /Entre na extensão do OnFrame para editar anúncios/);
});

test('background cria a sessão remota a partir do bearer do Supabase sem expor o token', async () => {
  const source = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
  const token = 'a'.repeat(43);
  const storage = {};
  const requests = [];
  let listener = null;
  const chrome = {
    runtime: {
      lastError: null,
      onMessage: { addListener(value) { listener = value; } }
    },
    storage: {
      local: {
        get(defaults, callback) { callback(Object.assign({}, defaults, storage)); },
        set(value, callback) { Object.assign(storage, value); callback(); },
        remove(key, callback) { delete storage[key]; callback(); }
      }
    },
    tabs: { async create() {} }
  };
  const sandbox = {
    chrome,
    fetch: async (url, options = {}) => {
      const request = { url, method: options.method || 'GET', headers: new Headers(options.headers || {}), body: options.body || '' };
      requests.push(request);
      if (url.endsWith('/v1/extension-auth-flows') && options.method === 'POST') return Response.json({ flow: 'b'.repeat(43), expiresAt: '2099-01-01T00:00:00.000Z' }, { status: 201 });
      if (url.endsWith('/v1/extension-sessions/from-auth')) return Response.json({ token, sessionId: 'session-1', expiresAt: '2099-01-01T00:00:00.000Z' }, { status: 201 });
      if (url.endsWith('/v1/accounts')) return Response.json({ accounts: [{ id: 'acc-1', userId: '123', nickname: 'OnFrame', enabled: true }] });
      if (url.endsWith('/v1/accounts/123')) return Response.json({ accounts: [{ id: 'acc-1', userId: '123', nickname: 'OnFrame', enabled: options.method !== 'PATCH' || JSON.parse(options.body).enabled }] });
      if (url.endsWith('/v1/mercadolivre/oauth/start')) return Response.json({ authorizationUrl: 'https://auth.mercadolivre.com.br/authorization?response_type=code' }, { status: 201 });
      if (url.endsWith('/v1/api/resolve/quick')) return Response.json({ item: { id: 'MLB1234567890' }, quick: true });
      if (options.method === 'DELETE') return Response.json({ revokedAt: '2026-09-28T00:00:00.000Z' });
      return Response.json({ user: { email: 'mateus@example.com', name: 'Mateus' }, workspace: { name: 'OnFrame' } });
    },
    Headers,
    Response
  };
  vm.runInNewContext(source, sandbox);
  const send = (message) => new Promise((resolve) => assert.equal(listener(message, {}, resolve), true));

  const flow = await send({ type: 'onframe:remote', action: 'auth-flow-start' });
  assert.equal(flow.ok, true);
  assert.match(flow.body.redirectTo, /\/connect\?flow=/);
  assert.equal(storage.onframeRemoteAuthFlow.token, 'b'.repeat(43));

  const authenticated = await send({ type: 'onframe:remote', action: 'authenticate', accessToken: 'a'.repeat(20) });
  assert.equal(authenticated.ok, true);
  assert.equal(authenticated.body.token, undefined);
  assert.equal(storage.onframeRemoteSession.token, token);
  assert.equal(storage.onframeRemoteAuthFlow, undefined);
  assert.equal(requests.find((request) => request.url.endsWith('/v1/extension-sessions/from-auth')).headers.get('authorization'), 'Bearer ' + 'a'.repeat(20));

  const accounts = await send({ type: 'onframe:remote', action: 'accounts' });
  assert.equal(accounts.ok, true);
  assert.equal(accounts.body.accounts[0].user_id, '123');

  const updated = await send({ type: 'onframe:remote', action: 'account-update', userId: '123', enabled: false });
  assert.equal(updated.ok, true);
  assert.equal(updated.body.accounts[0].enabled, false);
  assert.equal(requests.at(-1).method, 'PATCH');
  assert.equal(requests.at(-1).headers.get('authorization'), 'Bearer ' + token);

  const remoteApi = await send({ type: 'onframe:api', path: '/api/resolve/quick', options: { method: 'POST', body: '{}' } });
  assert.equal(remoteApi.ok, true);
  assert.equal(requests.at(-1).url.endsWith('/v1/api/resolve/quick'), true);

  await send({ type: 'onframe:remote', action: 'disconnect' });
  const noSession = await send({ type: 'onframe:api', path: '/api/resolve/quick', options: { method: 'POST', body: '{}' } });
  assert.equal(noSession.ok, false);
  assert.equal(noSession.status, 401);
  assert.equal(noSession.code, 'extension_session_unauthorized');
});

test('Worker mantém as contas e o contrato remoto como única fronteira', () => {
  const worker = fs.readFileSync(path.join(root, 'cloudflare', 'src', 'index.ts'), 'utf8');
  const contracts = fs.readFileSync(path.join(root, 'cloudflare', 'src', 'legacy-contracts.ts'), 'utf8');
  assert.match(worker, /function updateWorkspaceAccount/);
  assert.match(worker, /function deleteWorkspaceAccount/);
  assert.match(worker, /seller_account_updated/);
  assert.match(worker, /seller_account_deleted/);
  assert.match(worker, /\/v1\/accounts/);
  assert.match(worker, /\/v1\/extension-sessions\/from-auth/);
  assert.match(worker, /\/v1\/extension-auth-flows/);
  assert.doesNotMatch(worker, /extension_pairings|\/v1\/connect\/issue/);
  assert.doesNotMatch(contracts, /\.\.\/\.\.\/service/);
  assert.match(contracts, /\.\/domain\/routes\/items\.js/);
});

test('módulo de fotos abre a autorização remota sem controle de serviço local', () => {
  const source = fs.readFileSync(path.join(extensionRoot, 'modules', 'photos', 'module.js'), 'utf8');
  assert.match(source, /sendRemoteMessage\('oauth-start'\)/);
  assert.doesNotMatch(source, /LOCAL_SERVICE_OFFLINE_MESSAGE|start-service|openLocalServiceLauncher|onframe:openLauncher/);
});
