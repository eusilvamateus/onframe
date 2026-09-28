const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
const generator = path.join(root, 'scripts', 'auth', 'generate-email-templates.js');
const templates = {
  confirmation: ['confirmation.html', '{{ .ConfirmationURL }}'],
  invite: ['invite.html', '{{ .ConfirmationURL }}'],
  magicLink: ['magic-link.html', '{{ .ConfirmationURL }}'],
  recovery: ['recovery.html', '{{ .ConfirmationURL }}'],
  emailChange: ['email-change.html', '{{ .NewEmail }}'],
  reauthentication: ['reauthentication.html', '{{ .Token }}'],
  passwordChanged: ['password-changed.html'],
  emailChanged: ['email-changed.html', '{{ .OldEmail }}'],
  phoneChanged: ['phone-changed.html', '{{ .OldPhone }}'],
  mfaFactorEnrolled: ['mfa-factor-enrolled.html', '{{ .FactorType }}'],
  mfaFactorUnenrolled: ['mfa-factor-unenrolled.html', '{{ .FactorType }}'],
  identityLinked: ['identity-linked.html', '{{ .Provider }}'],
  identityUnlinked: ['identity-unlinked.html', '{{ .Provider }}'],
};

test('configura todos os templates de autenticação e notificações do Supabase', () => {
  for (const [file] of Object.values(templates)) {
    assert.ok(config.includes(`content_path = "./supabase/templates/${file}"`), `${file} não foi configurado`);
  }

  for (const notification of ['password_changed', 'email_changed', 'phone_changed', 'mfa_factor_enrolled', 'mfa_factor_unenrolled', 'identity_linked', 'identity_unlinked']) {
    assert.match(config, new RegExp(`\\[auth\\.email\\.notification\\.${notification}\\][\\s\\S]*?enabled = true`));
  }
});

test('protege os fluxos de Auth com Turnstile sem versionar seu segredo', () => {
  assert.match(config, /\[auth\.captcha\]\s+enabled = true\s+provider = "turnstile"\s+secret = "env\(SUPABASE_TURNSTILE_SECRET\)"/);
  assert.doesNotMatch(config, /secret = "0x[^"]+"/i);
});

test('templates do Supabase são contingências textuais mínimas', () => {
  for (const [name, [file, variable]] of Object.entries(templates)) {
    const content = fs.readFileSync(path.join(root, 'supabase', 'templates', file), 'utf8');
    assert.ok(content.length < 700, `${name} deve permanecer curto`);
    assert.doesNotMatch(content, /<!doctype html>|onblide-design-system|#0a4ee4|CodeInput/i, `${name} não deve carregar a apresentação final`);
    assert.match(content, /<h2>/i, `${name} precisa informar o contexto`);
    if (variable) assert.ok(content.includes(variable), `${name} precisa preservar ${variable}`);
  }
});

test('somente os fluxos que exigem confirmação manual preservam o OTP', () => {
  const magicLink = fs.readFileSync(path.join(root, 'supabase', 'templates', 'magic-link.html'), 'utf8');
  const reauthentication = fs.readFileSync(path.join(root, 'supabase', 'templates', 'reauthentication.html'), 'utf8');

  assert.doesNotMatch(magicLink, /\{\{ \.Token \}\}/);
  assert.match(magicLink, /\{\{ \.ConfirmationURL \}\}/);
  assert.match(reauthentication, /\{\{ \.Token \}\}/);
  assert.doesNotMatch(reauthentication, /index \.Token|code-cell|code-gap/);
});

test('templates rastreados correspondem ao gerador de contingência', () => {
  const { status } = require('node:child_process').spawnSync(process.execPath, [generator, '--check'], { cwd: root });
  assert.equal(status, 0);
});
