const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const templatesDir = path.join(root, 'supabase', 'templates');

// O Supabase so conserva uma contingencia legivel. A entrega ativa e renderizada
// pelo Worker, que aplica o design transacional da Onblide antes de usar o Resend.
const templates = {
  'confirmation.html': `
<h2>Confirme seu e-mail no OnFrame</h2>
<p>Use o link abaixo para confirmar seu endereço de e-mail.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar e-mail</a></p>
<p>Se você não criou esta conta, ignore este e-mail.</p>`,
  'invite.html': `
<h2>Você recebeu um convite para o OnFrame</h2>
<p>Use o link abaixo para aceitar seu convite.</p>
<p><a href="{{ .ConfirmationURL }}">Aceitar convite</a></p>
<p>Se você não esperava este convite, ignore este e-mail.</p>`,
  'magic-link.html': `
<h2>Seu link de acesso ao OnFrame</h2>
<p>Use o link abaixo para entrar:</p>
<p><a href="{{ .ConfirmationURL }}">Entrar no OnFrame</a></p>
<p>O link expira em 15 minutos.</p>
<p>Se você não pediu este código, ignore este e-mail.</p>`,
  'recovery.html': `
<h2>Redefina sua senha do OnFrame</h2>
<p>Use o link abaixo para criar uma nova senha.</p>
<p><a href="{{ .ConfirmationURL }}">Redefinir senha</a></p>
<p>Se você não solicitou esta alteração, ignore este e-mail.</p>`,
  'email-change.html': `
<h2>Confirme seu novo e-mail no OnFrame</h2>
<p>Você solicitou alterar o e-mail da sua conta para {{ .NewEmail }}.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar novo e-mail</a></p>
<p>Se você não solicitou esta alteração, ignore este e-mail.</p>`,
  'reauthentication.html': `
<h2>Seu código de verificação do OnFrame</h2>
<p>Use o código abaixo para confirmar esta ação:</p>
<p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; font-family: monospace;">
  {{ .Token }}
</p>
<p>Se você não solicitou esta ação, ignore este e-mail.</p>`,
  'password-changed.html': `
<h2>Sua senha do OnFrame foi alterada</h2>
<p>A senha da sua conta foi atualizada.</p>
<p>Se você não fez esta alteração, recupere o acesso imediatamente.</p>`,
  'email-changed.html': `
<h2>O e-mail da sua conta OnFrame foi alterado</h2>
<p>O e-mail {{ .OldEmail }} foi substituído por {{ .Email }}.</p>
<p>Se você não fez esta alteração, recupere o acesso imediatamente.</p>`,
  'phone-changed.html': `
<h2>O telefone da sua conta OnFrame foi alterado</h2>
<p>O telefone {{ .OldPhone }} foi substituído por {{ .Phone }}.</p>
<p>Se você não fez esta alteração, revise a segurança da sua conta.</p>`,
  'mfa-factor-enrolled.html': `
<h2>Um método de verificação foi adicionado à sua conta OnFrame</h2>
<p>O método {{ .FactorType }} foi adicionado.</p>
<p>Se você não fez esta alteração, revise a segurança da sua conta.</p>`,
  'mfa-factor-unenrolled.html': `
<h2>Um método de verificação foi removido da sua conta OnFrame</h2>
<p>O método {{ .FactorType }} foi removido.</p>
<p>Se você não fez esta alteração, revise a segurança da sua conta.</p>`,
  'identity-linked.html': `
<h2>Um método de acesso foi conectado à sua conta OnFrame</h2>
<p>O método {{ .Provider }} foi conectado.</p>
<p>Se você não fez esta alteração, revise a segurança da sua conta.</p>`,
  'identity-unlinked.html': `
<h2>Um método de acesso foi removido da sua conta OnFrame</h2>
<p>O método {{ .Provider }} foi removido.</p>
<p>Se você não fez esta alteração, revise a segurança da sua conta.</p>`,
};

const check = process.argv.includes('--check');
const stale = [];

function normalizeTemplate(content) {
  return String(content).replace(/\r\n/g, '\n').trim() + '\n';
}

for (const [filename, content] of Object.entries(templates)) {
  const target = path.join(templatesDir, filename);
  const normalized = normalizeTemplate(content);
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;

  if (check) {
    if (existing === null || normalizeTemplate(existing) !== normalized) stale.push(filename);
    continue;
  }

  fs.writeFileSync(target, normalized);
}

if (check && stale.length > 0) {
  console.error(`Templates desatualizados: ${stale.join(', ')}`);
  process.exitCode = 1;
}

if (!check) console.log(`${Object.keys(templates).length} templates de e-mail gerados.`);
