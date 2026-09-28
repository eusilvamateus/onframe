import assert from 'node:assert/strict';
import test from 'node:test';
import { captchaPage, captchaPageCsp, connectionPage, interactivePageCsp, resultPage } from '../src/connect-page.ts';

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
