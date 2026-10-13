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

test('feedback transitorio usa toast e problemas que exigem atencao permanecem em alert', () => {
  const source = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'app.jsx'), 'utf8');
  const helper = source.slice(source.indexOf('function feedbackSurface'), source.indexOf('function activityLabel'));
  const feedbackSurface = vm.runInNewContext(`${helper}\nfeedbackSurface`);
  assert.equal(feedbackSurface({ tone: 'success', visible: true }), 'none');
  assert.equal(feedbackSurface({ tone: 'success' }), 'toast');
  assert.equal(feedbackSurface({ tone: 'info', needsAttention: true }), 'alert');
  assert.equal(feedbackSurface({ tone: 'danger' }), 'alert');
  assert.equal(feedbackSurface({ tone: 'danger', visible: true }), 'alert');
  assert.equal(feedbackSurface({ tone: 'warning' }), 'alert');
  assert.match(source, /<ToastStack position="bottom-right"/);
  assert.match(source.slice(source.indexOf('async function updateAccount'), source.indexOf('async function renameAccount')), /enabled \? 'Conta ativada\.' : 'Conta desativada\.'/);
});

test('integracoes alternam visualizacao e permitem renomear sem perder controles da conta', async () => {
  const source = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'app.jsx'), 'utf8');
  const helpers = source.slice(source.indexOf('function accountName'), source.indexOf('function searchValue'));
  const component = source.slice(source.indexOf('function IntegrationAccount'), source.indexOf('function settingsOptionItems'));
  const compiled = transformSync(`${helpers}\n${component}\nIntegrations`, {
    loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment'
  }).code;
  const opened = [];
  const updated = [];
  const removed = [];
  const Integrations = vm.runInNewContext(compiled, {
    React, URL, useState: React.useState, useRef: React.useRef, openExternal: (url) => opened.push(url),
    SectionHeader: ({ actions }) => React.createElement('section-header', null, actions), Button: 'button-control', ButtonGroup: 'button-group',
    ToggleButton: 'toggle-control', Card: 'card-control', Avatar: 'avatar-control',
    Tooltip: 'tooltip-control', Switch: 'switch-control', Input: 'input-control', Ph: 'icon-control'
  });
  const account = { id: 'acc-1', user_id: '123', nickname: 'Nome original', display_name: 'Loja', enabled: true, permalink: 'http://perfil.mercadolivre.com.br/loja' };
  const renamed = [];
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Integrations, {
      accounts: [account], admin: true, loading: false, onConnect: () => {}, onUpdate: (_account, enabled) => updated.push(enabled),
      onRename: async (_account, value) => { renamed.push(value); return true; }, onRemove: (_account) => removed.push(_account.user_id)
    }));
  });
  assert.equal(renderer.root.findAllByProps({ className: 'onframe-integration-list-item' }).length, 1);
  const connectButton = renderer.root.findAllByType('button-control').find((node) => node.props.children === 'Conectar conta');
  assert.equal(connectButton.props.icon.props.n, 'plus-circle');
  assert.equal(renderer.root.findAllByType('switch-control')[0].props.checked, true);
  assert.equal(renderer.root.findByType('switch-control').props.size, 'md');
  assert.equal(renderer.root.findByType('switch-control').props.label, undefined);
  assert.equal(renderer.root.findByType('button-group').props.size, 'lg');
  await act(async () => renderer.root.findByType('switch-control').props.onChange(false));
  assert.deepEqual(updated, [false]);
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Abrir página da loja de Loja' }).length, 1);
  await act(async () => renderer.root.findByType('button-group').props.onChange('cards'));
  assert.equal(renderer.root.findAllByProps({ className: 'onframe-integration-card' }).length, 1);
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Abrir página da loja de Loja' })[0].props.kind, 'quiet');
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Abrir página da loja de Loja' })[0].props.tone, 'primary');
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Remover Loja' })[0].props.kind, 'quiet');
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Remover Loja' })[0].props.tone, 'danger');
  await act(async () => renderer.root.findAllByProps({ 'aria-label': 'Remover Loja' })[0].props.onClick());
  assert.deepEqual(removed, ['123']);
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Renomear Loja' })[0].props.kind, 'quiet');
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Renomear Loja' })[0].props.tone, 'primary');
  await act(async () => renderer.root.findAllByProps({ 'aria-label': 'Renomear Loja' })[0].props.onClick());
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Salvar nome' })[0].props.kind, 'quiet');
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Salvar nome' })[0].props.tone, 'success');
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Cancelar edição' })[0].props.kind, 'quiet');
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Cancelar edição' })[0].props.tone, 'neutral');
  await act(async () => renderer.root.findAllByProps({ 'aria-label': 'Cancelar edição' })[0].props.onClick());
  assert.equal(renderer.root.findAllByType('input-control').length, 0);
  await act(async () => renderer.root.findAllByProps({ 'aria-label': 'Renomear Loja' })[0].props.onClick());
  const input = renderer.root.findByType('input-control');
  let selected = false;
  input.props.onFocus({ target: { select: () => { selected = true; } } });
  assert.equal(selected, true);
  await act(async () => input.props.onChange({ target: { value: '  Loja principal  ' } }));
  await act(async () => renderer.root.findAllByProps({ 'aria-label': 'Salvar nome' })[0].props.onClick());
  assert.deepEqual(renamed, ['Loja principal']);
  assert.equal(renderer.root.findAllByType('input-control').length, 0);
  await act(async () => renderer.root.findAllByProps({ 'aria-label': 'Abrir página da loja de Loja' })[0].props.onClick());
  assert.deepEqual(opened, ['https://perfil.mercadolivre.com.br/loja']);
});

test('upload de foto estima progresso sem concluir antes da resposta e libera o controle apos falha', async () => {
  const source = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'app.jsx'), 'utf8');
  const profileSettings = source.slice(source.indexOf('function ProfileSettings'), source.indexOf('function SessionsSettings'));
  const compiled = transformSync(`${profileSettings}\nProfileSettings`, {
    loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment'
  }).code;
  const intervals = new Map();
  let nextIntervalId = 0;
  const ProfileSettings = vm.runInNewContext(compiled, {
    React, useState: React.useState, useEffect: React.useEffect,
    setInterval: (callback) => { const id = ++nextIntervalId; intervals.set(id, callback); return id; },
    clearInterval: (id) => intervals.delete(id),
    SectionHeader: 'section-header', FileUpload: 'file-upload', Input: 'input-control',
    Link: 'link-control', Divider: 'divider-control', Button: 'button-control', ButtonGroup: 'button-group'
  });
  const profileWithAvatar = { user: { name: 'Mateus', email: 'mateus@example.com', avatarUrl: 'https://example.com/avatar.png' } };
  const profileWithoutAvatar = { user: { ...profileWithAvatar.user, avatarUrl: null } };
  let finishUpload;
  let failUpload;
  let finishRemoval;
  let renderer;
  const onAvatar = () => new Promise((resolve, reject) => { finishUpload = resolve; failUpload = reject; });
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
  const progress = [];
  await act(async () => { uploadResult = upload().props.upload({ name: 'foto.png' }, (value) => progress.push(value)); });
  assert.equal(upload().props.disabled, true);
  assert.deepEqual(progress, [5]);
  for (let index = 0; index < 50; index += 1) {
    for (const callback of intervals.values()) callback();
  }
  assert.ok(progress.some((value) => value > 5));
  assert.equal(progress.at(-1), 95);
  await act(async () => { finishUpload(); await uploadResult; });
  assert.equal(progress.at(-1), 100);
  assert.equal(intervals.size, 0);
  assert.equal(upload().props.disabled, false);

  const failedProgress = [];
  let failedUpload;
  await act(async () => { failedUpload = upload().props.upload({ name: 'falha.png' }, (value) => failedProgress.push(value)); });
  for (const callback of intervals.values()) callback();
  await act(async () => { failUpload(new Error('Falha no envio')); await assert.rejects(failedUpload, /Falha no envio/); });
  assert.ok(failedProgress.at(-1) > 5);
  assert.ok(failedProgress.every((value) => value < 100));
  assert.equal(intervals.size, 0);
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
  assert.doesNotMatch(passkeys, /brandSrc=/);
  assert.match(passkeys, /!managing && <div className="onframe-brand"/);
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

test('Turnstile so executa sob demanda e exibe area apenas durante interacao', async () => {
  const code = fs.readFileSync(path.join(extensionRoot, 'core', 'remote-auth.js'), 'utf8');
  const css = fs.readFileSync(path.join(extensionRoot, 'ui', 'shared', 'app.css'), 'utf8');
  assert.match(css, /\.onframe-captcha \{ position: absolute;/);
  assert.match(css, /\.onframe-captcha\[data-interactive="true"\]:not\(\[hidden\]\) \{ position: static;/);
  const sent = [];
  let onMessage;
  const container = {
    dataset: {}, hidden: false, frame: null,
    replaceChildren(frame) { this.frame = frame || null; }
  };
  const window = {
    location: { origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    addEventListener: (_name, listener) => { onMessage = listener; },
    removeEventListener: () => {}
  };
  const document = { createElement: () => ({
    contentWindow: { postMessage: (message, origin) => sent.push({ message, origin }) },
    setAttribute: () => {}, remove: () => {}
  }) };
  vm.runInNewContext(code, {
    window, document, crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true, headers: { get: () => 'text/html' } })
  });
  const challenge = window.OnFrameRemoteAuth.createChallenge(container, () => {});
  await new Promise(setImmediate);
  assert.ok(container.frame);
  assert.equal(sent.length, 0);
  const nonce = new URL(container.frame.src).searchParams.get('nonce');
  const source = container.frame.contentWindow;
  const request = challenge.execute();
  await new Promise(setImmediate);
  assert.equal(sent.length, 0);
  onMessage({ origin: 'https://onframe.onblide.com', source, data: { type: 'onframe:turnstile', nonce, status: 'ready' } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.type, 'onframe:turnstile:execute');
  onMessage({ origin: 'https://onframe.onblide.com', source, data: { type: 'onframe:turnstile', nonce, status: 'interaction' } });
  assert.equal(container.dataset.interactive, 'true');
  onMessage({ origin: 'https://onframe.onblide.com', source, data: { type: 'onframe:turnstile', nonce, status: 'success', token: 'captcha-test' } });
  assert.equal(await request, 'captcha-test');
  onMessage({ origin: 'https://onframe.onblide.com', source, data: { type: 'onframe:turnstile', nonce, status: 'idle' } });
  assert.equal(container.dataset.interactive, undefined);
  challenge.reset();
  await new Promise(setImmediate);
  const nextSource = container.frame.contentWindow;
  const nextNonce = new URL(container.frame.src).searchParams.get('nonce');
  const failed = challenge.execute();
  await new Promise(setImmediate);
  onMessage({ origin: 'https://onframe.onblide.com', source: nextSource, data: { type: 'onframe:turnstile', nonce: nextNonce, status: 'error' } });
  await assert.rejects(failed, { code: 'captcha_unavailable' });
  const retried = challenge.execute();
  await new Promise(setImmediate);
  assert.ok(container.frame);
  const retryNonce = new URL(container.frame.src).searchParams.get('nonce');
  onMessage({ origin: 'https://onframe.onblide.com', source: container.frame.contentWindow, data: { type: 'onframe:turnstile', nonce: retryNonce, status: 'ready' } });
  onMessage({ origin: 'https://onframe.onblide.com', source: container.frame.contentWindow, data: { type: 'onframe:turnstile', nonce: retryNonce, status: 'success', token: 'captcha-retry' } });
  assert.equal(await retried, 'captcha-retry');
  challenge.destroy();
});

test('popup e opções usam o pacote oficial da Onblide sem expor um código de pareamento', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const popup = fs.readFileSync(path.join(extensionRoot, 'ui', 'popup', 'app.jsx'), 'utf8');
  const popupHtml = fs.readFileSync(path.join(extensionRoot, 'ui', 'popup', 'index.html'), 'utf8');
  const options = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'app.jsx'), 'utf8');
  const people = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'WorkspacePeople.jsx'), 'utf8');
  const optionsCss = fs.readFileSync(path.join(extensionRoot, 'ui', 'shared', 'app.css'), 'utf8');
  const optionsHtml = fs.readFileSync(path.join(extensionRoot, 'ui', 'options', 'index.html'), 'utf8');
  const authPanel = fs.readFileSync(path.join(extensionRoot, 'ui', 'shared', 'AuthPanel.jsx'), 'utf8');
  const runtime = fs.readFileSync(path.join(extensionRoot, 'ui', 'shared', 'runtime.js'), 'utf8');
  const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
  const buildScript = fs.readFileSync(path.join(root, 'scripts', 'build-extension-ui.js'), 'utf8');
  const profileSettings = options.slice(options.indexOf('function ProfileSettings'), options.indexOf('function SessionsSettings'));
  const integrations = options.slice(options.indexOf('function Integrations'), options.indexOf('function settingsOptionItems'));

  assert.equal(packageJson.dependencies['@onblide/ui'], 'file:../../onblide-design-system/project/package');
  assert.match(options, /@onblide\/ui\/styles\.css/);
  assert.match(popup, /@onblide\/ui\/styles\.css/);
  assert.match(popupHtml, /<html lang="pt-BR" class="onframe-popup-window">/);
  assert.match(popupHtml, /<body class="onframe-popup-document">/);
  assert.match(optionsCss, /\.onframe-popup-document\s*\{[^}]*width:\s*420px;[^}]*min-width:\s*420px/);
  assert.match(optionsCss, /\.onframe-popup-window, \.onframe-popup-document\s*\{[^}]*background:\s*transparent;[^}]*border-radius:\s*var\(--ob-r-surface\);[^}]*overflow:\s*hidden;/);
  assert.match(optionsCss, /\.onframe-popup-document #root\s*\{[^}]*background:\s*var\(--ob-surface\);[^}]*border-radius:\s*inherit;[^}]*overflow:\s*hidden;/);
  assert.match(optionsCss, /\.onframe-popup\s*\{[^}]*width:\s*100%;/);
  assert.doesNotMatch(optionsCss, /\.onframe-popup\s*\{\s*width:\s*100vw;/);
  assert.match(optionsCss, /\.onframe-popup-session\s*\{[^}]*height:\s*600px;/);
  assert.doesNotMatch(optionsCss, /\.onframe-popup-session\s*\{[^}]*100vh/);
  assert.match(options, /<AuthBrand \/>/);
  assert.match(authPanel, /alt="OnFrame"/);
  assert.match(authPanel, /by onblide/);
  assert.match(optionsCss, /\.onframe-auth-brand\s*\{[^}]*width:\s*min\(100%, 192px\);[^}]*align-self:\s*center;[^}]*flex-direction:\s*column;[^}]*align-items:\s*flex-end;[^}]*gap:\s*var\(--ob-s-2\)/);
  assert.match(optionsCss, /\.onframe-security-form\s*\{[^}]*margin-inline:\s*auto/);
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
  assert.match(integrations, /eyebrow="MERCADO LIVRE"/);
  assert.match(integrations, /title=\{admin \? 'Contas conectadas' : 'Contas atribuídas'\}/);
  assert.doesNotMatch(integrations, /title="Mercado Livre"/);
  assert.match(people, /function WorkspacePeople/);
  assert.match(options, /activeSection=\{settingsTab\}/);
  assert.doesNotMatch(options, /label: 'Visão geral'/);
  assert.doesNotMatch(options, /label: 'Contas Mercado Livre'/);
  assert.doesNotMatch(options, /label: 'Perfil e segurança'/);
  assert.match(options, /connection === null && loading/);
  assert.match(options, /Skeleton/);
  assert.doesNotMatch(options, /hideAccount/);
  assert.match(people, /Table/);
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
  assert.match(options, /<Button kind="primary" size="sm" icon=\{<Ph n="arrow-circle-left" size=\{16\} \/>\}/);
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
  assert.match(options, /<WorkspacePeople /);
  assert.match(options, /ApplicationUpdatesSettings/);
  assert.doesNotMatch(options, /eyebrow: 'CONFIGURAÇÕES'/);
  assert.match(options, /FileUpload/);
  assert.match(options, /className="onframe-profile-layout"/);
  assert.match(profileSettings, /variant="image"/);
  assert.match(profileSettings, /shape="square"/);
  assert.match(profileSettings, /onProgress\(100\)/);
  assert.match(profileSettings, /size=\{160\}/);
  assert.match(profileSettings, /defaultFiles=\{avatarFiles\}/);
  assert.match(profileSettings, /onRemoveAvatar\(\)/);
  assert.match(options, /profile-avatar-remove/);
  assert.match(profileSettings, /label="E-mail"/);
  assert.match(profileSettings, /disabled/);
  assert.match(profileSettings, /onOpenSecuritySettings\(\)/);
  assert.match(profileSettings, /Segurança e login/);
  assert.match(optionsCss, /\.onframe-profile-layout\s*\{[^}]*display: grid;[^}]*grid-template-columns: minmax\(220px, 260px\) minmax\(0, 480px\);/);
  assert.match(fs.readFileSync(path.join(extensionRoot, 'ui', 'shared', 'app.css'), 'utf8'), /\.onframe-credential-form\s*\{[^}]*max-width: 448px;[^}]*margin-inline: auto;/);
  assert.doesNotMatch(optionsCss, /\.onframe-profile-access\s*\{/);
  assert.match(popup, /className="onframe-popup-userbar"/);
  assert.match(popup, /connection === null[^]*<Skeleton circle height=\{40\}/);
  assert.match(popup, /<Avatar name=\{personName\} src=\{connection\.user\.avatarUrl\} alt="" size=\{40\} \/>/);
  assert.match(popup, /<Switch checked=\{resourcesEnabled\} disabled=\{busy\}/);
  assert.match(popup, /label="Recursos da extensão" size="md" \/>/);
  assert.match(popup, /aria-label="Abrir opções da extensão"[^>]*onClick=\{openOptions\}/);
  assert.doesNotMatch(popup, /LogoMark|manifestVersion|openUpdater|sendToTab|activeProductTab|sendRemoteMessage\('accounts'\)/);
  assert.doesNotMatch(popup, /<Card|<Badge|Visibilidade na página|Abrir painel do workspace/);
  assert.match(optionsCss, /\.onframe-popup-resource-switch label > span:last-child\s*\{[^}]*position:\s*absolute;[^}]*width:\s*1px;/);
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
  assert.match(options, /workspace-leave/);
  assert.match(background, /\/v1\/app\/workspaces\/current\/membership/);
  assert.match(options, /invitation-create/);
  assert.match(options, /profile-avatar/);
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
      if (url.endsWith('/v1/accounts/123')) {
        const payload = options.method === 'PATCH' ? JSON.parse(options.body) : {};
        return Response.json({ accounts: [{ id: 'acc-1', userId: '123', nickname: 'OnFrame', displayName: payload.displayName || null, enabled: payload.enabled ?? true }] });
      }
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

  const updated = await send({ type: 'onframe:remote', action: 'account-update', userId: '123', payload: { enabled: false } });
  assert.equal(updated.ok, true);
  assert.equal(updated.body.accounts[0].enabled, false);
  assert.equal(requests.at(-1).method, 'PATCH');
  assert.equal(requests.at(-1).headers.get('authorization'), 'Bearer ' + token);
  assert.equal(requests.at(-1).body, JSON.stringify({ enabled: false }));

  const renamed = await send({ type: 'onframe:remote', action: 'account-update', userId: '123', payload: { displayName: 'Loja principal' } });
  assert.equal(renamed.ok, true);
  assert.equal(renamed.body.accounts[0].display_name, 'Loja principal');
  assert.equal(requests.at(-1).body, JSON.stringify({ displayName: 'Loja principal' }));

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
