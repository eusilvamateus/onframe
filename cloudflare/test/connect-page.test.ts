import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { captchaPage, captchaPageCsp, connectionPage, interactivePageCsp, invitationPage, resultPage } from '../src/connect-page.ts';
import worker from '../src/index.ts';

test('configuracao publica informa o contrato de seguranca sem expor segredo', async () => {
  const response = await worker.fetch(new Request('https://onframe.onblide.com/v1/auth/config'), {
    SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-test-key', SUPABASE_SERVICE_ROLE_KEY: 'server-only-secret'
  } as Env);
  const payload = await response.json() as { emailOtpLength: number; capabilities: { accountSecurity: number } };
  assert.equal(response.status, 200);
  assert.equal(payload.capabilities.accountSecurity, 1);
  assert.equal(payload.emailOtpLength, 6);
  assert.doesNotMatch(JSON.stringify(payload), /server-only-secret/);
});

test('página pública conclui o fluxo iniciado pela extensão sem exibir código de pareamento', () => {
  const page = connectionPage({
    title: 'Conectar extensão - OnFrame',
    eyebrow: 'ACESSO À EXTENSÃO',
    heading: 'Conclua o acesso ao <em>OnFrame</em>',
    description: 'Texto de teste.',
    supabaseUrl: 'https://ignrkxityihpvreaimxe.supabase.co',
    supabasePublishableKey: 'sb_publishable_example'
  });

  assert.match(page, /extension-auth-flows/);
  assert.match(page, /auth\/v1\/user/);
  assert.match(page, /Acesso confirmado\. Volte à extensão para continuar/);
  assert.match(page, /type==='recovery'/);
  assert.doesNotMatch(page, /token\?grant_type=password|request-otp|verify-otp|pairing-code|Cole este código|OF-\[/);

  const [inlineScript] = Array.from(page.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  assert.ok(inlineScript);
  assert.doesNotThrow(() => new Function(inlineScript));
});

test('recuperacao apresenta titulo e legenda proprios sem alterar o fluxo de senha', () => {
  const page = connectionPage({ title: 'Conectar extensão - OnFrame', eyebrow: 'ACESSO À EXTENSÃO', heading: 'Conclua o acesso', description: 'Confirmação de acesso.', supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: 'public-test-key' });
  const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  let focused = false;
  let hashCleared = false;
  const elements: Record<string, { hidden: boolean; value: string; textContent: string; focus: () => void; addEventListener: () => void }> = {};
  for (const key of ['feedback', 'reset-form', 'password', 'confirmation', '.auth-card h1', '.description', '.eyebrow']) elements[key] = { hidden: true, value: '', textContent: '', focus: () => { focused = true; }, addEventListener: () => {} };
  const document = { title: '', getElementById: (key: string) => elements[key], querySelector: (key: string) => elements[key] };
  runInNewContext(script, { document, URL, URLSearchParams, location: new URL('https://onframe.onblide.com/connect?flow=test#access_token=test-recovery-token&type=recovery'), history: { replaceState: () => { hashCleared = true; } }, fetch: () => { throw new Error('Unexpected request'); } });
  assert.equal(document.title, 'Redefinir senha - OnFrame');
  assert.equal(elements['.auth-card h1'].textContent, 'Defina uma nova senha');
  assert.equal(elements['.description'].textContent, 'Escolha uma nova senha para sua conta.');
  assert.equal(elements['.eyebrow'].textContent, 'RECUPERAÇÃO DE ACESSO');
  assert.equal(elements['reset-form'].hidden, false);
  assert.equal(elements.feedback.hidden, true);
  assert.equal(focused, true);
  assert.equal(hashCleared, true);
});

test('desafio do Turnstile fica em uma origem do OnFrame e responde somente ao pai da extensão', () => {
  const page = captchaPage('0x4AAAAAAFIJHY8iacQ0d-dn');
  assert.match(page, /challenges\.cloudflare\.com\/turnstile/);
  assert.match(page, /chrome-extension/);
  assert.match(page, /window\.parent\.postMessage/);
  assert.match(page, /nonce/);
  assert.match(page, /status,nonce,token/);

  const [inlineScript] = Array.from(page.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  assert.ok(inlineScript);
  assert.doesNotThrow(() => new Function(inlineScript));
});

test('CSP da confirmação e do desafio permite somente as origens necessárias', () => {
  const csp = interactivePageCsp('https://ignrkxityihpvreaimxe.supabase.co');
  assert.match(csp, /connect-src 'self' https:\/\/ignrkxityihpvreaimxe\.supabase\.co/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /challenges\.cloudflare\.com/);
  assert.doesNotMatch(csp, /\*/);

  const captchaCsp = captchaPageCsp();
  assert.match(captchaCsp, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.match(captchaCsp, /script-src 'unsafe-inline' https:\/\/challenges\.cloudflare\.com/);
  assert.doesNotMatch(captchaCsp, /\*/);
  assert.throws(() => interactivePageCsp('http://localhost:54321'));
});

test('resultado OAuth mantém um resultado sem controles interativos aninhados', () => {
  const page = resultPage({
    title: 'Conta conectada - OnFrame',
    eyebrow: 'MERCADO LIVRE',
    heading: 'Conta conectada',
    message: 'Tudo certo.',
    tone: 'success'
  });
  assert.match(page, /Tudo certo\./);
  assert.doesNotMatch(page, /<a[^>]*>\s*<button/);
});

test('convite hospedado encaminha para as opções sem expor um bearer', () => {
  const page = invitationPage('chrome-extension://example/ui/options/index.html?invite=abc');
  assert.match(page, /CONVITE PARA WORKSPACE/);
  assert.match(page, /chrome-extension:\/\/example\/ui\/options\/index\.html\?invite=abc/);
  assert.doesNotMatch(page, /access_token|refresh_token|supabase\.co/);
});
