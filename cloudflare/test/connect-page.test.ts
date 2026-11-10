import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  captchaPage,
  captchaPageCsp,
  connectionPage,
  interactivePageCsp,
  invitationPage,
  resultPage
} from '../src/connect-page.ts';
import { readConnectionContext, secondFactorUrl } from '../../extension/ui/hosted/connection-flow.js';
import worker from '../src/index.ts';

const hostedApp = fs.readFileSync(new URL('../../extension/ui/hosted/app.jsx', import.meta.url), 'utf8');

test('configuracao publica informa o contrato de seguranca sem expor segredo', async () => {
  const response = await worker.fetch(new Request('https://onframe.onblide.com/v1/auth/config'), {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-secret'
  } as Env);
  const payload = (await response.json()) as { emailOtpLength: number; capabilities: { accountSecurity: number } };
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

  assert.match(page, /\/security\/hosted\.css/);
  assert.match(page, /\/security\/hosted\.js/);
  assert.match(page, /data-page-config=/);
  assert.doesNotMatch(page, /<input\b|<button\b|<style>/);
  assert.match(hostedApp, /import \{ Alert, Button, Input, Logo, Ph, ProgressBar, Spinner \} from '@onblide\/ui'/);
  assert.doesNotMatch(hostedApp, /<Card/);
  assert.match(hostedApp, /extension-auth-flows/);
  assert.match(hostedApp, /auth\/v1\/user/);
  assert.match(hostedApp, /Acesso confirmado\. Volte à extensão para continuar/);
  assert.match(hostedApp, /context\.type === 'recovery'/);
  assert.doesNotMatch(
    hostedApp,
    /token\?grant_type=password|request-otp|verify-otp|pairing-code|Cole este código|OF-\[/
  );
  assert.doesNotMatch(hostedApp, /<input\b|<button\b/);
});

test('recuperacao apresenta titulo e legenda proprios sem alterar o fluxo de senha', () => {
  const context = readConnectionContext(
    'https://onframe.onblide.com/connect?flow=test#access_token=test-recovery-token&refresh_token=test-refresh&type=recovery'
  );
  assert.deepEqual(context, {
    flow: 'test',
    accessToken: 'test-recovery-token',
    refreshToken: 'test-refresh',
    type: 'recovery'
  });
  assert.match(hostedApp, /Crie uma senha nova/);
  assert.match(hostedApp, /Escolha uma senha nova para continuar usando sua conta/);
  assert.match(hostedApp, /Recuperação de acesso/);
  assert.match(hostedApp, /<HostedPasswordField[\s\S]*label="Senha nova"[\s\S]*autoFocus/);
  assert.match(hostedApp, /<HostedPasswordField[\s\S]*label="Confirme a senha nova"/);
  assert.match(hostedApp, /<ProgressBar value=\{strength\.value\}/);
  assert.match(
    secondFactorUrl('https://onframe.onblide.com', context),
    /\/auth\/passkeys\?action=verify&flow=test#access_token=test-recovery-token&refresh_token=test-refresh/
  );
});

test('desafio do Turnstile fica em uma origem do OnFrame e responde somente ao pai da extensão', () => {
  const page = captchaPage('0x4AAAAAAFIJHY8iacQ0d-dn');
  assert.match(page, /challenges\.cloudflare\.com\/turnstile/);
  assert.match(page, /chrome-extension/);
  assert.match(page, /window\.parent\.postMessage/);
  assert.match(page, /nonce/);
  assert.match(page, /status,nonce,token/);
  assert.match(page, /appearance:'interaction-only',execution:'execute'/);
  assert.match(page, /event\.origin!==parentOrigin\|\|event\.source!==window\.parent/);
  assert.match(page, /window\.turnstile\.execute\(widgetId\)/);
  assert.match(page, /publish\('interaction'\)/);
  assert.match(page, /requestedTheme==='dark'\?'dark':'light'/);
  assert.match(page, /theme,appearance:'interaction-only'/);
  assert.doesNotMatch(page, /theme:'light'/);

  const [inlineScript] = Array.from(page.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  assert.ok(inlineScript);
  assert.doesNotThrow(() => new Function(inlineScript));
});

test('CSP da confirmação e do desafio permite somente as origens necessárias', () => {
  const csp = interactivePageCsp('https://ignrkxityihpvreaimxe.supabase.co');
  assert.match(csp, /connect-src 'self' https:\/\/ignrkxityihpvreaimxe\.supabase\.co/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
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
    eyebrow: 'Mercado Livre',
    heading: 'Conta conectada',
    message: 'Tudo certo.',
    tone: 'success'
  });
  assert.match(page, /Tudo certo\./);
  assert.doesNotMatch(page, /<a[^>]*>\s*<button/);
});

test('convite hospedado encaminha para as opções sem expor um bearer', () => {
  const page = invitationPage('chrome-extension://example/ui/options/index.html?invite=abc');
  assert.match(hostedApp, /Convite para workspace/);
  assert.match(hostedApp, /Abrir extensão/);
  assert.match(page, /chrome-extension:\/\/example\/ui\/options\/index\.html\?invite=abc/);
  assert.doesNotMatch(page, /access_token|refresh_token|supabase\.co/);
});
