import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { CredentialSettings } from '../extension/ui/options/CredentialSettings.jsx';
import { TwoFactorSettings } from '../extension/ui/options/TwoFactorSettings.jsx';
import { SecuritySettings } from '../extension/ui/options/SecuritySettings.jsx';
import { AuthPanel } from '../extension/ui/shared/AuthPanel.jsx';

const subject = '11111111-1111-4111-8111-111111111111';
const factorId = '33333333-3333-4333-8333-333333333333';
const user = { id: subject, email: 'pessoa@example.com', factors: [] };
const token = (aal = 'aal1') => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: subject, session_id: '22222222-2222-4222-8222-222222222222', aal, exp: 4102444800 })).toString('base64url')}.test-signature`;
const session = (aal = 'aal1') => ({ access_token: token(aal), refresh_token: 'temporary-test-refresh-token', expires_in: 3600, token_type: 'bearer', user });
const profile = { user };

async function harness(render: () => React.ReactElement, failOtp = false, hasTotp = false, availableSecurity = false) {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalChrome = globalThis.chrome;
  const requests: Array<{ path: string; body?: object; method?: string; authorization?: string | null }> = [];
  const messages: object[] = [];
  globalThis.window = { OnFrameRemoteAuth: {
    loadConfig: async () => ({ supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: 'test-publishable-key', capabilities: { accountSecurity: availableSecurity } }),
    createChallenge: () => ({ getToken: () => 'captcha-test', destroy() {}, reset() {} }),
    normalizeEmail: (value: string) => value.includes('@') ? value.toLowerCase() : '',
    authErrorMessage: (_: unknown, fallback: string) => fallback,
    request: async (_: unknown, path: string, body: object) => {
      requests.push({ path, body });
      if (path === 'otp') return {};
      if (path === 'verify') { if (failOtp) throw new Error('invalid-otp'); return session(); }
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
  return { renderer: renderer!, requests, messages, close: async () => {
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

test('senha e email nao exibem formulario de alteracao antes de verificar email', async () => {
  for (const kind of ['password', 'email']) {
    const h = await harness(() => <CredentialSettings kind={kind} profile={profile} onChanged={() => {}} />);
    try {
      assert.equal(h.renderer.root.findAllByType('input').length, 0);
      assert.equal(h.requests.length, 0);
    } finally { await h.close(); }
  }
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

test('login nao oferece chave de acesso quando o backend conectado nao suporta o fluxo', async () => {
  for (const available of [false, true]) {
    const h = await harness(() => <AuthPanel />, false, false, available);
    try {
      assert.equal(JSON.stringify(h.renderer.toJSON()).includes('Entrar com chave de acesso'), available);
    } finally { await h.close(); }
  }
});
