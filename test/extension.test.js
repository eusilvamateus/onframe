const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { transformSync } = require('esbuild');

const root = path.join(__dirname, '..');
const extensionRoot = path.join(root, 'extension');

test('upload de foto continua disponivel apos o seletor devolver foco a pagina', async () => {
  const source = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'app.jsx'), 'utf8');
  const profileSettings = source.slice(source.indexOf('function ProfileSettings'), source.indexOf('function SessionsSettings'));
  const compiled = transformSync(`${profileSettings}\nProfileSettings`, {
    loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment'
  }).code;
  const ProfileSettings = vm.runInNewContext(compiled, {
    React, useState: React.useState, useEffect: React.useEffect,
    SectionHeader: 'section-header', FileUpload: 'file-upload', Input: 'input-control',
    Link: 'link-control', Divider: 'divider-control', Button: 'button-control', ButtonGroup: 'button-group'
  });
  const profileWithAvatar = { user: { name: 'Mateus', email: 'mateus@example.com', avatarUrl: 'https://example.com/avatar.png' } };
  const profileWithoutAvatar = { user: { ...profileWithAvatar.user, avatarUrl: null } };
  let finishUpload;
  let finishRemoval;
  let renderer;
  const onAvatar = () => new Promise((resolve) => { finishUpload = resolve; });
  const onRemoveAvatar = () => new Promise((resolve) => { finishRemoval = resolve; });
  const renderProfile = (profile, loading) => React.createElement(ProfileSettings, {
    profile, loading, onSave: async () => {}, onAvatar, onRemoveAvatar, onOpenSecuritySettings: () => {}
  });
  await act(async () => {
    renderer = create(renderProfile(profileWithAvatar, false));
  });
  const upload = () => renderer.root.findByType('file-upload');
  assert.equal(upload().props.disabled, false);
  await act(async () => { upload().props.onChange([]); });
  assert.equal(upload().props.disabled, true);
  await act(async () => { finishRemoval(); });
  await act(async () => { renderer.update(renderProfile(profileWithoutAvatar, true)); });
  assert.equal(upload().props.disabled, false);

  let uploadResult;
  await act(async () => { uploadResult = upload().props.upload({ name: 'foto.png' }, () => {}); });
  assert.equal(upload().props.disabled, true);
  await act(async () => { finishUpload(); await uploadResult; });
  assert.equal(upload().props.disabled, false);
  await act(async () => renderer.unmount());
});

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

test('verificacao hospedada de chaves reutiliza a interface de codigo do login', () => {
  const passkeys = fs.readFileSync(path.join(extensionRoot, 'ui', 'passkeys', 'app.jsx'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-security-ui.js'), 'utf8');
  assert.match(passkeys, /<VerificationFrame title="Confirme no aplicativo"/);
  assert.match(passkeys, /<VerificationEmailField email=\{email\}/);
  assert.match(passkeys, /<VerificationCodeField label="Código do aplicativo autenticador" length=\{6\}/);
  assert.doesNotMatch(passkeys, /<Input label="Código do aplicativo autenticador"/);
  assert.match(build, /onframe-stacked-primary\.png/);
});

test('erros de autenticação sem mensagem útil preservam o status HTTP e traduzem limites de envio', () => {
  const code = fs.readFileSync(path.join(extensionRoot, 'core', 'remote-auth.js'), 'utf8');
  const window = {};
  vm.runInNewContext(code, { window });
  const message = window.OnFrameRemoteAuth.authErrorMessage;
  const fallback = 'Não foi possível enviar o código. Tente novamente.';
  assert.equal(message({ code: 'auth_request_failed', status: 403 }, fallback), `${fallback} (HTTP 403)`);
  assert.equal(message({ code: 'over_email_send_rate_limit', status: 429 }, fallback), 'Aguarde um minuto antes de solicitar outro código.');
  assert.equal(message({ code: 'auth_request_failed', status: 502 }, fallback), 'O serviço de autenticação está indisponível. Tente novamente em instantes.');
});

test('popup e opções usam o pacote oficial da Onblide sem expor um código de pareamento', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const popup = fs.readFileSync(path.join(extensionRoot, 'ui', 'popup', 'app.jsx'), 'utf8');
  const popupHtml = fs.readFileSync(path.join(extensionRoot, 'ui', 'popup', 'index.html'), 'utf8');
  const options = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'app.jsx'), 'utf8');
  const optionsCss = fs.readFileSync(path.join(extensionRoot, 'ui', 'shared', 'app.css'), 'utf8');
  const optionsHtml = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'index.html'), 'utf8');
  const authPanel = fs.readFileSync(path.join(extensionRoot, 'ui', 'shared', 'AuthPanel.jsx'), 'utf8');
  const runtime = fs.readFileSync(path.join(extensionRoot, 'ui', 'shared', 'runtime.js'), 'utf8');
  const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
  const buildScript = fs.readFileSync(path.join(root, 'scripts', 'build-extension-ui.js'), 'utf8');
  const profileSettings = options.slice(options.indexOf('function ProfileSettings'), options.indexOf('function SessionsSettings'));

  assert.equal(packageJson.dependencies['@onblide/ui'], 'file:../../onblide-design-system/project/package');
  assert.match(options, /@onblide\/ui\/styles\.css/);
  assert.match(popup, /@onblide\/ui\/styles\.css/);
  assert.match(options, /<AuthBrand \/>/);
  assert.match(authPanel, /alt="OnFrame"/);
  assert.match(authPanel, /by onblide/);
  assert.match(optionsCss, /\.onframe-auth-brand\s*\{[^}]*width:\s*min\(100%, 192px\);[^}]*align-self:\s*center;[^}]*flex-direction:\s*column;[^}]*align-items:\s*flex-end;[^}]*gap:\s*var\(--ob-s-2\)/);
  assert.match(optionsCss, /\.onframe-auth-brand \.onframe-help\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(optionsCss, /\.onframe-auth-title\s*\{[^}]*font-size:\s*var\(--ob-fs-lg\);[^}]*letter-spacing:\s*0;[^}]*text-align:\s*left;[^}]*overflow-wrap:\s*anywhere/);
  assert.match(optionsCss, /\.onframe-auth-content\s*\{[^}]*gap:\s*var\(--ob-s-5\);[^}]*min-width:\s*0/);
  assert.match(optionsCss, /\.onframe-field-heading\s*\{[^}]*justify-content:\s*space-between;[^}]*flex-wrap:\s*wrap;[^}]*gap:\s*var\(--ob-s-2\)/);
  assert.doesNotMatch(optionsCss, /\.onframe-auth-intro/);
  assert.match(optionsCss, /\.onframe-auth-code-scroll\s*\{[^}]*display:\s*flex/);
  assert.match(optionsCss, /\.onframe-auth-code-scroll > \*\s*\{[^}]*margin-inline:\s*auto/);
  const loginLogo = fs.readFileSync(path.join(extensionRoot, 'assets', 'onframe-stacked-primary.png'));
  assert.equal(loginLogo.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.match(options, /SideNav/);
  assert.match(options, /\bflush\b/);
  assert.match(options, /accountName=\{personName\}/);
  assert.match(options, /accountDetail=\{connection\.user\.email\}/);
  assert.match(options, /accountImage=\{connection\.user\.avatarUrl\}/);
  assert.match(options, /onToggle=\{\(\) => setNavigationCollapsed/);
  assert.match(options, /Drawer open=\{mobileNavigationOpen\}/);
  assert.match(options, /Navbar/);
  assert.match(options, /id: 'home', label: 'Início'/);
  assert.match(options, /id: 'integrations', label: 'Integrações'/);
  assert.match(options, /id: 'settings', label: 'Configurações'/);
  assert.match(options, /function Home/);
  assert.match(options, /function Integrations/);
  assert.match(options, /function WorkspacePeople/);
  assert.match(options, /activeSection=\{settingsTab\}/);
  assert.doesNotMatch(options, /label: 'Visão geral'/);
  assert.doesNotMatch(options, /label: 'Contas Mercado Livre'/);
  assert.doesNotMatch(options, /label: 'Perfil e segurança'/);
  assert.match(options, /connection === null && loading/);
  assert.match(options, /Skeleton/);
  assert.doesNotMatch(options, /hideAccount/);
  assert.match(options, /Table/);
  assert.match(options, /Modal/);
  assert.match(options, /layout="context"/);
  assert.match(options, /const breadcrumbs = settingsDetail/);
  assert.match(options, /\{ label: 'Início', icon: 'house', href: '#inicio' \}/);
  assert.match(options, /const pageContext = \(/);
  assert.match(options, /crumbs={pageContext}/);
  assert.match(options, /function PageHeader\(\{ meta, actions, reserveContextSpace = false \}\)/);
  assert.match(options, /<h1 className="onframe-page-title">\{meta\.title\}<\/h1>/);
  assert.doesNotMatch(options, /showTitle=/);
  assert.match(options, /onframe-options-content--root/);
  assert.doesNotMatch(options, /Atualizar dados/);
  assert.doesNotMatch(options, /function refreshView/);
  assert.match(options, /<div className="onframe-options-desktop-context">\{pageContext\}<\/div>/);
  assert.doesNotMatch(options, /onframe-options-desktop-context">\s*<Navbar/);
  assert.match(options, /setSettingsPage\('security'\)/);
  assert.match(options, />Voltar<\/Button>/);
  assert.match(options, /className="onframe-options-context-crumbs"/);
  assert.match(options, /<Breadcrumbs items=\{breadcrumbs\} size="sm" maxItems=\{3\} onNavigate=\{navigateBreadcrumb\} \/>/);
  assert.match(options, /<Button kind="primary" size="sm" icon=\{<Ph n="caret-left" size=\{16\} \/>\}/);
  assert.match(options, /onNavigate={navigateBreadcrumb}/);
  assert.match(options, /reserveContextSpace/);
  assert.match(options, /SearchInput/);
  assert.match(options, /width="min\(100%, 520px\)"/);
  assert.match(options, /ButtonGroup/);
  assert.match(options, /Divider/);
  assert.match(options, /onframe-settings-action-bar/);
  assert.doesNotMatch(options, /function ActionBar/);
  assert.match(optionsCss, /\.onframe-settings-action-bar\s*\{\s*position: fixed;/);
  assert.match(optionsCss, /\.onframe-options-sidebar\s*\{[^}]*z-index: var\(--ob-z-raised\);/);
  assert.match(optionsCss, /\.onframe-options-desktop-context\s*\{[^}]*position: absolute;[^}]*top: var\(--ob-s-4\);[^}]*left: calc\(var\(--ob-s-6\) \+ var\(--ob-s-2\)\);/);
  assert.match(optionsCss, /\.onframe-options-main\s*\{[^}]*padding: var\(--ob-s-7\) var\(--ob-s-6\) var\(--ob-s-6\);/);
  assert.match(optionsCss, /\.onframe-page-title\s*\{[^}]*font-size: var\(--ob-fs-lg\);/);
  assert.match(options, /const isIndex = settingsPage === 'index';/);
  assert.match(options, /\{isIndex && <>/);
  assert.match(options, /SETTINGS_OPTIONS/);
  assert.match(options, /SETTINGS_SECTIONS/);
  assert.match(options, /SettingsDirectory/);
  assert.match(options, /ListSubheader/);
  assert.doesNotMatch(options, /<Tabs tabs=\{tabs\} active=\{activeTab\}/);
  assert.doesNotMatch(options, /<Card padding=\{0\}>\s*<List/);
  assert.match(options, /<List as="nav" dividers ariaLabel=\{ariaLabel\}>/);
  assert.match(options, /<List as="nav" dividers ariaLabel="Configurações">/);
  assert.doesNotMatch(options, /<List[^>]*dividers[^>]*ariaLabel="(?:Formas de entrar|Navegadores autorizados)"/);
  assert.doesNotMatch(options, /trailing=\{<Ph n="caret-right" size=\{18\} \/>\}/);
  assert.doesNotMatch(options, /function (?:ProfileSettings|WorkspacePeople|WorkspaceGeneralSettings|ApplicationUpdatesSettings)[\s\S]{0,500}<Card/);
  assert.match(options, /List/);
  assert.match(options, /ListItem/);
  assert.match(options, /ProfileSettings/);
  assert.match(options, /SecuritySettings/);
  assert.match(options, /SessionsSettings/);
  assert.match(options, /WorkspaceGeneralSettings/);
  assert.match(options, /WorkspacePeopleSettings/);
  assert.match(options, /ApplicationUpdatesSettings/);
  assert.doesNotMatch(options, /eyebrow: 'CONFIGURAÇÕES'/);
  assert.match(options, /FileUpload/);
  assert.match(options, /className="onframe-profile-layout"/);
  assert.match(profileSettings, /variant="image"/);
  assert.match(profileSettings, /shape="square"/);
  assert.match(profileSettings, /indeterminate/);
  assert.match(profileSettings, /size=\{160\}/);
  assert.match(profileSettings, /defaultFiles=\{avatarFiles\}/);
  assert.match(profileSettings, /onRemoveAvatar\(\)/);
  assert.match(options, /profile-avatar-remove/);
  assert.match(profileSettings, /label="E-mail"/);
  assert.match(profileSettings, /disabled/);
  assert.match(profileSettings, /onOpenSecuritySettings\(\)/);
  assert.match(profileSettings, /Segurança e login/);
  assert.match(optionsCss, /\.onframe-profile-layout\s*\{[^}]*display: grid;[^}]*grid-template-columns: minmax\(220px, 260px\) minmax\(0, 480px\);/);
  assert.doesNotMatch(optionsCss, /\.onframe-profile-access\s*\{/);
  assert.match(popup, /Switch/);
  assert.match(authPanel, /FieldShell/);
  assert.match(authPanel, /eye-closed/);
  assert.match(optionsCss, /\.onframe-field-input\[type="password"\]::-ms-reveal\s*\{\s*display:\s*none;\s*\}/);
  assert.doesNotMatch(authPanel, /eye-slash/);
  assert.match(optionsHtml, /app\.css/);
  assert.match(optionsHtml, /app\.js/);
  assert.match(popupHtml, /app\.css/);
  assert.match(popupHtml, /app\.js/);
  assert.doesNotMatch(optionsHtml, /auth-controller\.js/);
  assert.doesNotMatch(popupHtml, /auth-controller\.js/);
  assert.match(buildScript, /assetNames: 'assets\/\[name\]-\[hash\]'/);
  assert.match(buildScript, /'react\/jsx-runtime': require\.resolve\('react\/jsx-runtime'\)/);
  assert.match(buildScript, /assertSingleReact/);
  assert.doesNotMatch(optionsHtml, /OF-\.{3}|pareamento|cole um código/i);
  assert.doesNotMatch(popupHtml, /OF-\.{3}|pareamento|cole um código/i);
  assert.match(authPanel, /auth-flow-start/);
  assert.match(authPanel, /gotrue_meta_security/);
  assert.match(options, /workspace-activate/);
  assert.match(options, /invitation-create/);
  assert.match(options, /profile-avatar/);
  assert.doesNotMatch(options, /onProgress\(100\)/);
  assert.match(background, /profile-avatar-remove/);
  assert.match(options, /account-update/);
  assert.match(options, /account-remove/);
  assert.match(runtime, /onframe-updater:\/\/update/);
  assert.doesNotMatch(optionsHtml, /Sessão expira/);
  assert.doesNotMatch(popupHtml, /Sessão expira/);
  assert.doesNotMatch(popup, /127\.0\.0\.1|onframe:openLauncher|\/updates\//);
  assert.doesNotMatch(options, /127\.0\.0\.1|onframe:openLauncher|\/updates\//);
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
  let identityUnavailable = false;
  let securityMode = 'legacy';
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
      if (url.endsWith('/v1/auth/config')) return Response.json(securityMode === 'legacy' ? {} : { capabilities: { accountSecurity: 1 } });
      if (url.endsWith('/v1/security')) {
        if (securityMode === 'missing-route') return Response.json({ error: 'not_found' }, { status: 404 });
        if (securityMode === 'unavailable') return Response.json({ error: 'identity_security_unavailable' }, { status: 503 });
        return Response.json(securityMode === 'malformed' ? {} : { sessions: [{ id: 'provider-session' }], factors: [], passkeys: [] });
      }
      if (identityUnavailable && url.endsWith('/v1/identity/synchronize')) return Response.json({ error: 'identity_security_unavailable' }, { status: 503 });
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

  const legacySecurity = await send({ type: 'onframe:remote', action: 'security' });
  assert.equal(legacySecurity.code, 'security_backend_unavailable');
  assert.equal(requests.some((request) => request.url.endsWith('/v1/security')), false);
  assert.equal(storage.onframeRemoteSession.token, token);
  securityMode = 'ready';
  const security = await send({ type: 'onframe:remote', action: 'security' });
  assert.equal(security.ok, true);
  assert.equal(security.body.sessions[0].id, 'provider-session');
  assert.equal(requests.at(-1).headers.get('authorization'), 'Bearer ' + token);
  for (const [mode, code] of [['missing-route', 'security_backend_unavailable'], ['unavailable', 'identity_security_unavailable'], ['malformed', 'security_data_unavailable']]) {
    securityMode = mode;
    const failedSecurity = await send({ type: 'onframe:remote', action: 'security' });
    assert.equal(failedSecurity.ok, false);
    assert.equal(failedSecurity.code, code);
    assert.equal(failedSecurity.body, undefined);
    assert.equal(storage.onframeRemoteSession.token, token);
  }

  const beforeSync = JSON.stringify(storage);
  const synchronized = await send({ type: 'onframe:remote', action: 'identity-sync', accessToken: 'c'.repeat(20) });
  assert.equal(synchronized.ok, true);
  assert.equal(requests.at(-1).url.endsWith('/v1/identity/synchronize'), true);
  assert.equal(requests.at(-1).headers.get('authorization'), 'Bearer ' + 'c'.repeat(20));
  assert.equal(JSON.stringify(storage), beforeSync);

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

  await send({ type: 'onframe:remote', action: 'authenticate', accessToken: 'a'.repeat(20) });
  await send({ type: 'onframe:remote', action: 'auth-flow-start' });
  identityUnavailable = true;
  const changedPassword = await send({ type: 'onframe:remote', action: 'identity-sync', accessToken: 'c'.repeat(20), disconnect: true });
  assert.equal(changedPassword.ok, false);
  assert.equal(changedPassword.code, 'identity_security_unavailable');
  assert.equal(storage.onframeRemoteSession, undefined);
  assert.equal(storage.onframeRemoteAuthFlow, undefined);
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
