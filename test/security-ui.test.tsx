import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { CodeInput, Link, Tabs } from '@onblide/ui';
import { act, create } from 'react-test-renderer';
import { CredentialSettings } from '../extension/ui/options/CredentialSettings.jsx';
import { EmailVerification, TwoFactorSettings } from '../extension/ui/options/TwoFactorSettings.jsx';
import { SecuritySettings } from '../extension/ui/options/SecuritySettings.jsx';
import { AuthPanel, PasswordField } from '../extension/ui/shared/AuthPanel.jsx';

const subject = '11111111-1111-4111-8111-111111111111';
const factorId = '33333333-3333-4333-8333-333333333333';
const user = { id: subject, email: 'pessoa@example.com', factors: [] };
const token = (aal = 'aal1') => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: subject, session_id: '22222222-2222-4222-8222-222222222222', aal, exp: 4102444800 })).toString('base64url')}.test-signature`;
const session = (aal = 'aal1') => ({ access_token: token(aal), refresh_token: 'temporary-test-refresh-token', expires_in: 3600, token_type: 'bearer', user });
const profile = { user };

async function harness(render: () => React.ReactElement, failOtp = false, hasTotp = false, availableSecurity = false, captcha = 'captcha-test', otpError: Error | null = null) {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalChrome = globalThis.chrome;
  const requests: Array<{ path: string; body?: object; method?: string; authorization?: string | null; redirectTo?: string }> = [];
  const messages: object[] = [];
  const challenges = { created: 0, destroyed: 0 };
  globalThis.window = { OnFrameRemoteAuth: {
    loadConfig: async () => ({ supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: 'test-publishable-key', emailOtpLength: 6, capabilities: { accountSecurity: availableSecurity } }),
    createChallenge: () => { challenges.created += 1; return { getToken: () => captcha, isLoading: () => false, isAvailable: () => true, destroy() { challenges.destroyed += 1; }, reset() {} }; },
    normalizeEmail: (value: string) => value.includes('@') ? value.trim().toLowerCase() : '',
    authErrorMessage: (_: unknown, fallback: string) => fallback,
    request: async (_: unknown, path: string, body: object, options: { redirectTo?: string } = {}) => {
      requests.push({ path, body, ...options });
      if (path === 'otp') { if (otpError) throw otpError; return {}; }
      if (path === 'verify') { if (failOtp) throw new Error('invalid-otp'); return session(); }
      if (path === 'token?grant_type=password') return session();
      if (path === 'signup' || path === 'recover') return {};
      throw new Error(`Unexpected request ${path}`);
    }
  } } as typeof window;
  globalThis.chrome = { runtime: { lastError: null, sendMessage: (message: object, callback: (value: object) => void) => {
    messages.push(message); callback({ ok: true, body: { redirectTo: 'https://onframe.onblide.com/connect?flow=test-flow' } });
  } } } as typeof chrome;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    requests.push({ path, method: init?.method, authorization: new Headers(init?.headers).get('authorization'), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path.endsWith('/user')) return Response.json({ ...user, factors: hasTotp ? [{ id: factorId, status: 'verified', factor_type: 'totp', friendly_name: 'Meu autenticador' }] : [] });
    if (path.endsWith('/factors') && init?.method === 'POST') return Response.json({ id: factorId, type: 'totp', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', secret: 'TEMPORARY-SECRET', uri: 'otpauth://totp/test' } });
    if (path.endsWith('/challenge')) return Response.json({ id: 'challenge-id', expires_at: 4102444800 });
    if (path.endsWith('/verify')) return Response.json(session('aal2'));
    if (path.endsWith(`/factors/${factorId}`) && init?.method === 'DELETE') return Response.json({ id: factorId });
    throw new Error(`Unexpected SDK request ${path}`);
  };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(render(), { createNodeMock: () => ({}) }); });
  return { renderer: renderer!, requests, messages, challenges, close: async () => {
    await act(async () => renderer!.unmount());
    globalThis.fetch = originalFetch; globalThis.window = originalWindow; globalThis.chrome = originalChrome;
  } };
}

async function emailVerified(renderer: ReturnType<typeof create>) {
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  const input = renderer.root.findAllByType('input').find((field) => field.props.autoComplete === 'one-time-code');
  assert.ok(input);
  await act(async () => input.props.onChange({ target: { value: '123456' } }));
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
}

test('campo de senha preserva um unico botao de revelar e ocultar sem alterar o valor', async () => {
  for (const disabled of [false, true]) {
    const h = await harness(() => <PasswordField label="Senha" value="senha-de-teste" onChange={() => {}} autoComplete="current-password" disabled={disabled} />);
    try {
      const input = h.renderer.root.findByType('input');
      const buttons = h.renderer.root.findAllByType('button');
      assert.equal(input.props.type, 'password');
      assert.equal(input.props.className, 'onframe-field-input');
      assert.equal(input.props.disabled, disabled);
      assert.ok(input.props.id);
      const label = h.renderer.root.findByType('label');
      assert.equal(label.props.htmlFor, input.props.id);
      assert.equal(label.props.children, 'Senha');
      assert.equal(label.findAllByType('button').length, 0);
      assert.equal(buttons.length, 1);
      assert.equal(buttons[0].props['aria-label'], 'Mostrar senha');
      assert.equal(buttons[0].props.disabled, disabled);
      if (!disabled) {
        await act(async () => buttons[0].props.onClick());
        assert.equal(h.renderer.root.findByType('input').props.type, 'text');
        assert.equal(h.renderer.root.findByType('input').props.value, 'senha-de-teste');
        assert.equal(h.renderer.root.findByType('button').props['aria-label'], 'Ocultar senha');
        await act(async () => h.renderer.root.findByType('button').props.onClick());
        assert.equal(h.renderer.root.findByType('input').props.type, 'password');
        assert.equal(h.renderer.root.findByType('input').props.value, 'senha-de-teste');
      }
      assert.equal(h.requests.length, 0);
      assert.equal(h.messages.length, 0);
    } finally { await h.close(); }
  }
});

test('senha e email nao exibem formulario de alteracao antes de verificar email', async () => {
  for (const kind of ['password', 'email']) {
    const h = await harness(() => <CredentialSettings kind={kind} profile={profile} onChanged={() => {}} />);
    try {
      assert.equal(h.renderer.root.findAllByType('input').length, 0);
      assert.equal(h.requests.length, 0);
    } finally { await h.close(); }
  }
});

test('verificacao por email aguarda antes de reenviar e nao exibe codigos internos em erros', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = await harness(() => <EmailVerification email={user.email} onVerified={() => {}} />);
  try {
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    const resend = h.renderer.root.findAllByType('button').find((button) => String(button.props.children).includes('Enviar outro código'));
    assert.ok(resend);
    assert.equal(resend.props.disabled, true);
    assert.equal(h.requests.filter((request) => request.path === 'otp').length, 1);
    for (let second = 0; second < 60; second += 1) await act(async () => t.mock.timers.tick(1000));
    const available = h.renderer.root.findAllByType('button').find((button) => String(button.props.children).includes('Enviar outro código'));
    assert.equal(available.props.disabled, false);
    await act(async () => available.props.onClick());
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(h.requests.filter((request) => request.path === 'otp').length, 2);
  } finally { await h.close(); }

  const error = Object.assign(new Error('auth_request_failed'), { code: 'auth_request_failed', status: 502 });
  const failed = await harness(() => <EmailVerification email={user.email} onVerified={() => {} } />, false, false, false, 'captcha-test', error);
  try {
    await act(async () => failed.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.match(JSON.stringify(failed.renderer.toJSON()), /Não foi possível enviar o código/);
    assert.doesNotMatch(JSON.stringify(failed.renderer.toJSON()), /auth_request_failed/);
  } finally { await failed.close(); }

  const noCaptcha = await harness(() => <EmailVerification email={user.email} onVerified={() => {}} />, false, false, false, '');
  try {
    await act(async () => noCaptcha.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.match(JSON.stringify(noCaptcha.renderer.toJSON()), /Conclua a confirmação de segurança/);
    assert.equal(noCaptcha.requests.length, 0);
  } finally { await noCaptcha.close(); }
});

test('OTP invalido nao libera formulario nem envia alteracao ao provedor', async () => {
  const h = await harness(() => <CredentialSettings kind="password" profile={profile} onChanged={() => {}} />, true);
  try {
    await emailVerified(h.renderer);
    assert.equal(h.renderer.root.findAllByType('input').some((input) => input.props.autoComplete === 'new-password'), false);
    assert.equal(h.requests.some((request) => request.method === 'PUT'), false);
    assert.deepEqual(h.requests.find((request) => request.path === 'otp')?.body, { email: user.email, create_user: false, gotrue_meta_security: { captcha_token: 'captcha-test' } });
  } finally { await h.close(); }
});

test('senha exige confirmacao coincidente e usa somente a sessao verificada', async () => {
  let changed = 0;
  const h = await harness(() => <CredentialSettings kind="password" profile={profile} onChanged={() => { changed += 1; }} />);
  try {
    await emailVerified(h.renderer);
    const fields = h.renderer.root.findAllByType('input').filter((input) => input.props.autoComplete === 'new-password');
    assert.equal(fields.length, 2);
    await act(async () => fields[0].props.onChange({ target: { value: 'strong-new-password' } }));
    await act(async () => fields[1].props.onChange({ target: { value: 'different-password' } }));
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(h.requests.some((request) => request.method === 'PUT'), false);
    await act(async () => h.renderer.root.findAllByType('input').filter((input) => input.props.autoComplete === 'new-password')[1].props.onChange({ target: { value: 'strong-new-password' } }));
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    const update = h.requests.find((request) => request.method === 'PUT');
    assert.equal((update?.body as { password?: string })?.password, 'strong-new-password');
    assert.equal(update?.authorization, `Bearer ${token()}`);
    assert.equal(changed, 1);
    assert.equal(h.messages.some((message: { action?: string; disconnect?: boolean }) => message.action === 'identity-sync' && message.disconnect), true);
  } finally { await h.close(); }
});

test('ativacao TOTP so conclui depois de verificar o codigo do autenticador', async () => {
  let disconnected = 0;
  const h = await harness(() => <TwoFactorSettings profile={profile} securityOverview={{ factors: [] }} onDisconnect={async () => { disconnected += 1; }} />);
  try {
    await emailVerified(h.renderer);
    const button = h.renderer.root.findAllByType('button').find((value) => value.props.children?.includes?.('Adicionar autenticador'));
    assert.ok(button);
    await act(async () => button.props.onClick());
    assert.equal(disconnected, 0);
    assert.equal(h.requests.some((request) => request.path.endsWith('/verify')), false);
    const code = h.renderer.root.findAllByType('input').find((input) => input.props.autoComplete === 'one-time-code');
    assert.ok(code);
    await act(async () => code.props.onChange({ target: { value: '123456' } }));
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(h.requests.some((request) => request.path.endsWith('/challenge')), true);
    assert.equal(disconnected, 1);
  } finally { await h.close(); }
});

test('OTP de email nao substitui o segundo fator de uma conta protegida', async () => {
  const h = await harness(() => <CredentialSettings kind="password" profile={profile} onChanged={() => {}} />, false, true);
  try {
    await emailVerified(h.renderer);
    assert.equal(h.renderer.root.findAllByType('input').some((field) => field.props.autoComplete === 'new-password'), false);
    assert.equal(h.requests.some((request) => request.method === 'PUT'), false);
    const code = h.renderer.root.findAllByType('input').find((field) => field.props.autoComplete === 'one-time-code');
    await act(async () => code.props.onChange({ target: { value: '123456' } }));
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(h.renderer.root.findAllByType('input').filter((field) => field.props.autoComplete === 'new-password').length, 2);
    assert.equal(h.requests.some((request) => request.path.endsWith('/challenge')), true);
  } finally { await h.close(); }
});

test('alteracao de email usa verificacao previa e preserva confirmacoes nativas', async () => {
  let changed = false;
  const h = await harness(() => <CredentialSettings kind="email" profile={profile} onChanged={() => { changed = true; }} />);
  try {
    await emailVerified(h.renderer);
    const fields = h.renderer.root.findAllByType('input');
    assert.equal(fields.find((field) => field.props.value === user.email)?.props.disabled, true);
    const email = fields.find((field) => field.props.type === 'email');
    await act(async () => email.props.onChange({ target: { value: 'nova@example.com' } }));
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    const update = h.requests.find((request) => request.method === 'PUT');
    assert.equal((update?.body as { email?: string })?.email, 'nova@example.com');
    assert.equal(update?.authorization, `Bearer ${token()}`);
    assert.equal(h.messages.some((message: { action?: string }) => message.action === 'auth-flow-start'), true);
    assert.equal(changed, false);
    assert.equal(h.messages.some((message: { action?: string }) => message.action === 'identity-sync'), false);
  } finally { await h.close(); }
});

test('dados de seguranca ausentes nao se tornam zero sessoes ou 2FA desativado', async () => {
  for (const loading of [true, false]) {
    const h = await harness(() => <SecuritySettings profile={profile} securityOverview={null} loading={loading} />);
    try {
      const text = JSON.stringify(h.renderer.toJSON());
      assert.doesNotMatch(text, /0 sessões|Não ativada/);
      assert.match(text, loading ? /Carregando/ : /Indisponível/);
      assert.equal(h.renderer.root.findAll((node) => node.props['aria-disabled'] === true).length, 5);
      assert.equal(h.renderer.root.findAllByType('a').length, 0);
    } finally { await h.close(); }
  }
});

test('resumo mostra estados e libera navegacao apenas depois de carregar dados reais', async () => {
  let opened = false;
  const h = await harness(() => <SecuritySettings profile={profile} securityOverview={{ sessions: [{ id: 'one' }, { id: 'two' }], factors: [{ id: factorId }], passkeys: [] }} loading={false} onOpenSessions={() => { opened = true; }} />);
  try {
    const text = JSON.stringify(h.renderer.toJSON());
    assert.match(text, /2 sessões ativas/);
    assert.match(text, /Ativada/);
    assert.doesNotMatch(text, /Indisponível|Não ativada/);
    const item = h.renderer.root.findByProps({ title: 'Navegadores autorizados' });
    await act(async () => item.props.onClick({ preventDefault() {} }));
    assert.equal(opened, true);
  } finally { await h.close(); }
});

test('login usa Tabs pill para Email e senha e Magic Link sem aba de cadastro nem passkeys', async () => {
  for (const available of [false, true]) {
    const h = await harness(() => <AuthPanel />, false, false, available);
    try {
      const rendered = JSON.stringify(h.renderer.toJSON());
      assert.equal(rendered.includes('Entrar com chave de acesso'), false);
      const methods = h.renderer.root.findByType(Tabs);
      assert.equal(methods.props.variant, 'pill');
      assert.equal(methods.props.active, 'signin');
      assert.deepEqual(methods.props.tabs.map((tab) => ({ id: tab.id, label: tab.label })), [
        { id: 'signin', label: 'Email e senha' }, { id: 'magic', label: 'Magic Link' }
      ]);
      assert.equal(rendered.includes('Código por e-mail'), false);
      const brand = h.renderer.root.findByType('header');
      assert.equal(brand.findByType('img').props.alt, 'OnFrame');
      assert.equal(brand.findByType('img').props.src, '../../assets/onframe-stacked-primary.png');
      assert.equal(brand.findByType('p').props.children, 'by onblide');
      assert.equal(h.renderer.root.findAllByType('input').some((node) => node.props.type === 'password'), false);
    } finally { await h.close(); }
  }
});

async function continueEmail(renderer: ReturnType<typeof create>, value = ' Pessoa@Example.com ') {
  const email = renderer.root.findAllByType('input').find((field) => field.props.type === 'email');
  assert.ok(email);
  await act(async () => email.props.onChange({ target: { value } }));
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
}
async function selectCode(renderer: ReturnType<typeof create>) {
  const method = renderer.root.findAllByType(Tabs).find((tabs) => tabs.props.tabs.some((tab) => tab.id === 'magic'));
  assert.ok(method);
  await act(async () => method.props.onChange('magic'));
}
async function fillCode(renderer: ReturnType<typeof create>, value = '123456') {
  await act(async () => {
    renderer.root.findByType(CodeInput).props.onChange(value);
    await new Promise((resolve) => setImmediate(resolve));
  });
}

test('login cadastro e recuperacao usam chamadas principais sem legendas introdutorias', async () => {
  const h = await harness(() => <AuthPanel />);
  try {
    function expectTitle(title: string) {
      const content = h.renderer.root.findByProps({ className: 'onframe-auth-content' });
      assert.equal(content.findByType('h1').props.children, title);
      assert.equal(content.children[0].type, 'h1');
      assert.equal(content.children.some((child) => typeof child !== 'string' && child.type === 'p'), false);
      assert.equal(h.renderer.root.findAllByProps({ className: 'onframe-auth-intro' }).length, 0);
    }
    expectTitle('Bem-vindo de volta');
    await act(async () => h.renderer.root.findAllByType(Link).find((link) => link.props.children === 'Criar conta').props.onClick({ preventDefault() {} }));
    expectTitle('Crie sua conta no OnFrame');
    await continueEmail(h.renderer);
    expectTitle('Crie sua conta no OnFrame');
    const signupFields = h.renderer.root.findAllByType('input');
    const passwords = signupFields.filter((field) => field.props.autoComplete === 'new-password');
    assert.equal(new Set(passwords.map((field) => field.props.id)).size, 2);
    await act(async () => {
      signupFields.find((field) => field.props.autoComplete === 'name').props.onChange({ target: { value: 'Pessoa' } });
      passwords.forEach((field) => field.props.onChange({ target: { value: 'valid-new-password' } }));
    });
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    expectTitle('Confira seu e-mail');
    assert.match(JSON.stringify(h.renderer.toJSON()), /Confira seu e-mail para confirmar o cadastro/);
    await act(async () => h.renderer.root.findAllByType(Link).find((link) => link.props.children === 'Voltar para entrar').props.onClick({ preventDefault() {} }));
    await continueEmail(h.renderer);
    expectTitle('Bem-vindo de volta');
    await act(async () => h.renderer.root.findAllByType(Link).find((link) => link.props.children === 'Esqueci minha senha').props.onClick({ preventDefault() {} }));
    expectTitle('Recupere seu acesso');
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    expectTitle('Confira seu e-mail');
    assert.match(JSON.stringify(h.renderer.toJSON()), /receberá um link para redefinir a senha/);
    await act(async () => h.renderer.root.findAllByType(Link).find((link) => link.props.children === 'Voltar para entrar').props.onClick({ preventDefault() {} }));
    await selectCode(h.renderer);
    expectTitle('Acesse o OnFrame');
    await continueEmail(h.renderer);
    expectTitle('Verifique seu e-mail');
    assert.match(JSON.stringify(h.renderer.toJSON()), /código de.*6.*dígitos/);
  } finally { await h.close(); }
});

test('recuperacao aparece ao lado do rotulo da senha sem duplicar a acao no rodape', async () => {
  const h = await harness(() => <AuthPanel />);
  try {
    assert.equal(h.renderer.root.findAllByType(Link).some((link) => link.props.children === 'Esqueci minha senha'), false);
    await continueEmail(h.renderer);
    const field = h.renderer.root.findByType(PasswordField);
    const heading = field.findByProps({ className: 'onframe-field-heading' });
    const recovery = heading.findByType(Link);
    assert.equal(recovery.props.children, 'Esqueci minha senha');
    assert.equal(heading.findByType('label').props.htmlFor, field.findByType('input').props.id);
    assert.equal(h.renderer.root.findAllByType(Link).filter((link) => link.props.children === 'Esqueci minha senha').length, 1);
    assert.equal(h.renderer.root.findByProps({ className: 'onframe-auth-footer' }).findAllByType(Link).length, 1);
    assert.equal(heading.findByType('label').findAllByType('a').length, 0);
    await act(async () => recovery.props.onClick({ preventDefault() {} }));
    assert.equal(h.renderer.root.findByType('h1').props.children, 'Recupere seu acesso');
    assert.equal(h.renderer.root.findByType('input').props.value, user.email);
    assert.equal(h.requests.length, 0);
  } finally { await h.close(); }
});

test('login faseado nao consulta conta na etapa do email nem envia senha antes de continuar', async () => {
  let connected = 0;
  const h = await harness(() => <AuthPanel onConnected={() => { connected += 1; }} />);
  try {
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(h.requests.length, 0);
    await continueEmail(h.renderer);
    assert.equal(h.requests.length, 0);
    const email = h.renderer.root.findAllByType('input').find((field) => field.props.type === 'email');
    assert.ok(email);
    assert.equal(email.props.value, user.email);
    assert.equal(email.props.disabled, true);
    assert.equal(h.renderer.root.findAllByType(Link).some((link) => link.props.children === 'Alterar e-mail'), true);
    assert.equal(h.renderer.root.findAllByProps({ className: 'onframe-auth-identity' }).length, 0);
    const password = h.renderer.root.findAllByType('input').find((field) => field.props.type === 'password');
    assert.ok(password);
    await act(async () => password.props.onChange({ target: { value: 'valid-test-password' } }));
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.deepEqual(h.requests.find((request) => request.path === 'token?grant_type=password')?.body, { email: user.email, password: 'valid-test-password', gotrue_meta_security: { captcha_token: 'captcha-test' } });
    assert.equal(connected, 1);
    assert.equal(h.messages.some((message: { password?: string }) => Boolean(message.password)), false);
  } finally { await h.close(); }
});

test('codigo por email usa OTP nativo sem criar conta ou fluxo externo e autentica uma vez', async () => {
  let connected = 0;
  const h = await harness(() => <AuthPanel onConnected={() => { connected += 1; }} />);
  try {
    await selectCode(h.renderer); await continueEmail(h.renderer);
    assert.equal(h.renderer.root.findAllByType(CodeInput).length, 1);
    assert.equal(h.renderer.root.findAllByType('input').some((field) => field.props.type === 'password'), false);
    const sent = h.requests.find((request) => request.path === 'otp');
    assert.equal((sent?.body as { create_user?: boolean })?.create_user, false);
    assert.equal(sent?.redirectTo, 'https://onframe.onblide.com/connect?verification=login');
    assert.equal(h.messages.length, 0);
    assert.equal(h.renderer.root.findByType(CodeInput).props.length, 6);
    assert.match(JSON.stringify(h.renderer.toJSON()), /6.*dígitos/);
    await fillCode(h.renderer, '12345');
    assert.equal(h.requests.some((request) => request.path === 'verify'), false);
    await act(async () => {
      h.renderer.root.findByType(CodeInput).props.onChange('123456');
      await h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} });
      await new Promise((resolve) => setImmediate(resolve));
    });
    assert.equal(h.requests.filter((request) => request.path === 'verify').length, 1);
    assert.equal(connected, 1);
  } finally { await h.close(); }
});

test('codigo invalido nao conecta e permite corrigir o CodeInput', async () => {
  const h = await harness(() => <AuthPanel />, true);
  try {
    await selectCode(h.renderer); await continueEmail(h.renderer); await fillCode(h.renderer);
    assert.equal(h.renderer.root.findByType(CodeInput).props.status, 'error');
    assert.equal(h.messages.length, 0);
    await fillCode(h.renderer, '123');
    assert.equal(h.renderer.root.findByType(CodeInput).props.status, 'default');
    assert.equal(h.requests.filter((request) => request.path === 'verify').length, 1);
  } finally { await h.close(); }
});

test('senha e OTP continuam exigindo TOTP antes de criar acesso no Worker', async () => {
  for (const method of ['password', 'otp']) {
    const h = await harness(() => <AuthPanel />, false, true);
    try {
      if (method === 'otp') { await selectCode(h.renderer); await continueEmail(h.renderer); await fillCode(h.renderer); }
      else {
        await continueEmail(h.renderer);
        await act(async () => h.renderer.root.findAllByType('input').find((field) => field.props.type === 'password').props.onChange({ target: { value: 'valid-password' } }));
        await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
      }
      assert.equal(h.messages.some((message: { action?: string }) => message.action === 'authenticate'), false);
      assert.match(JSON.stringify(h.renderer.toJSON()), /Verificação em duas etapas/);
      assert.equal(h.renderer.root.findByType(CodeInput).props.length, 6);
      await fillCode(h.renderer, '123456');
      const authenticate = h.messages.find((message: { action?: string }) => message.action === 'authenticate') as { accessToken: string };
      assert.equal(authenticate.accessToken, token('aal2'));
    } finally { await h.close(); }
  }
});

test('cadastro e recuperacao sao links e preservam os callbacks nativos', async () => {
  const h = await harness(() => <AuthPanel />);
  try {
    await continueEmail(h.renderer);
    const recovery = h.renderer.root.findAllByType(Link).find((link) => link.props.children === 'Esqueci minha senha');
    await act(async () => recovery.props.onClick({ preventDefault() {} }));
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.ok(h.requests.find((request) => request.path === 'recover')?.redirectTo);
    await act(async () => h.renderer.root.findAllByType(Link).find((link) => link.props.children === 'Voltar para entrar').props.onClick({ preventDefault() {} }));
    await act(async () => h.renderer.root.findAllByType(Link).find((link) => link.props.children === 'Criar conta').props.onClick({ preventDefault() {} }));
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    const fields = h.renderer.root.findAllByType('input');
    await act(async () => {
      fields.find((field) => field.props.autoComplete === 'name').props.onChange({ target: { value: 'Pessoa' } });
      fields.filter((field) => field.props.autoComplete === 'new-password').forEach((field) => field.props.onChange({ target: { value: 'valid-new-password' } }));
    });
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.ok(h.requests.find((request) => request.path === 'signup')?.redirectTo);
    assert.match(JSON.stringify(h.renderer.toJSON()), /confirmar o cadastro/);
  } finally { await h.close(); }
});

test('editar email descarta a senha anterior sem consultar existencia da conta', async () => {
  const h = await harness(() => <AuthPanel />);
  try {
    await continueEmail(h.renderer);
    await act(async () => h.renderer.root.findAllByType('input').find((field) => field.props.type === 'password').props.onChange({ target: { value: 'senha-anterior' } }));
    await act(async () => h.renderer.root.findAllByType(Link).find((link) => link.props.children === 'Alterar e-mail').props.onClick({ preventDefault() {} }));
    assert.equal(h.renderer.root.findAllByType('input').some((field) => field.props.type === 'password'), false);
    const email = h.renderer.root.findAllByType('input').find((field) => field.props.type === 'email');
    assert.equal(email.props.disabled, false);
    assert.equal(email.props.value, user.email);
    await continueEmail(h.renderer, 'outro@example.com');
    const updatedEmail = h.renderer.root.findAllByType('input').find((field) => field.props.type === 'email');
    assert.equal(updatedEmail.props.value, 'outro@example.com');
    assert.equal(updatedEmail.props.disabled, true);
    assert.equal(h.renderer.root.findAllByType('input').find((field) => field.props.type === 'password').props.value, '');
    assert.equal(h.requests.length, 0);
  } finally { await h.close(); }
});

test('reenviar OTP respeita cooldown e exige novo desafio mesmo depois de editar email', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = await harness(() => <AuthPanel />);
  try {
    await selectCode(h.renderer); await continueEmail(h.renderer);
    assert.equal(h.challenges.created, 1);
    assert.equal(h.challenges.destroyed, 1);
    await act(async () => h.renderer.root.findAllByType(Link).find((link) => link.props.children === 'Alterar e-mail').props.onClick({ preventDefault() {} }));
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(h.requests.filter((request) => request.path === 'otp').length, 1);
    for (let second = 0; second < 60; second += 1) await act(async () => t.mock.timers.tick(1000));
    await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    for (let second = 0; second < 60; second += 1) await act(async () => t.mock.timers.tick(1000));
    const created = h.challenges.created;
    await act(async () => h.renderer.root.findAllByType(Link).find((link) => link.props.children === 'Reenviar código').props.onClick({ preventDefault() {} }));
    assert.equal(h.challenges.created, created + 1);
    assert.equal(h.requests.filter((request) => request.path === 'otp').length, 2);
    await act(async () => h.renderer.root.findAllByType(Link).find((link) => link.props.children === 'Enviar novo código').props.onClick({ preventDefault() {} }));
    assert.equal(h.requests.filter((request) => request.path === 'otp').length, 3);
    assert.match(JSON.stringify(h.renderer.toJSON()), /Reenviar código em/);
  } finally { await h.close(); }
});

test('senha e envio de OTP nao aceitam ausencia da verificacao de seguranca', async () => {
  for (const method of ['password', 'otp']) {
    const h = await harness(() => <AuthPanel />, false, false, false, '');
    try {
      if (method === 'otp') await selectCode(h.renderer);
      await continueEmail(h.renderer);
      if (method === 'password') {
        await act(async () => h.renderer.root.findAllByType('input').find((field) => field.props.type === 'password').props.onChange({ target: { value: 'senha-de-teste' } }));
        await act(async () => h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
      }
      assert.equal(h.requests.length, 0);
      assert.equal(h.messages.length, 0);
      assert.match(JSON.stringify(h.renderer.toJSON()), /Conclua a confirmação de segurança/);
    } finally { await h.close(); }
  }
});
