import { Webhook, WebhookVerificationError } from 'standardwebhooks';

const AUTH_EMAIL_HOOK_PATH = '/hooks/supabase/send-email';
const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const EMAIL_LOGO_LIGHT_URL = 'https://onframe.onblide.com/security/onframe-horizontal-primary.png';
const EMAIL_LOGO_DARK_URL = 'https://onframe.onblide.com/security/onframe-horizontal-white.png';
const MAX_HOOK_BODY_BYTES = 20 * 1024;
const DELIVERY_LEASE_MS = 15 * 1000;

export type AuthEmailRuntimeEnv = {
  AUTH_EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  SUPABASE_SEND_EMAIL_HOOK_SECRET?: string;
  SUPABASE_URL?: string;
  ONFRAME_DB: D1Database;
};

type EmailData = {
  token?: string;
  token_hash?: string;
  token_new?: string;
  token_hash_new?: string;
  redirect_to?: string;
  email_action_type?: string;
  old_email?: string;
  old_phone?: string;
  provider?: string;
  factor_type?: string;
};

type AuthEmailEvent = {
  user?: {
    email?: string;
    new_email?: string;
  };
  email_data?: EmailData;
};

type AuthEmailDelivery = {
  actionType: string;
  html: string;
  recipient: string;
  subject: string;
};

type ReservedDelivery = {
  id: string;
  recipientHash: string;
  state: 'reserved' | 'sent' | 'sending';
};

class AuthEmailHookError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: string, status: number, retryable = false) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function now(): number {
  return Date.now();
}

function json(payload: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('cache-control', 'no-store');
  responseHeaders.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeEmail(value: unknown): string | null {
  const email = nonEmptyString(value)?.toLowerCase() ?? null;
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return null;
  return email;
}

function sha256Hex(value: string): Promise<string> {
  return crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(value))
    .then((digest) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''));
}

function requiredText(value: string | undefined, code: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new AuthEmailHookError(code, 503, true);
  return normalized;
}

function hookSecret(value: string | undefined): string {
  const configured = requiredText(value, 'auth_email_hook_unconfigured');
  const normalized = configured.replace(/^v1,/u, '');
  if (!/^whsec_[A-Za-z0-9+/=]+$/u.test(normalized)) {
    throw new AuthEmailHookError('auth_email_hook_unconfigured', 503, true);
  }
  return normalized;
}

function emailActionType(event: AuthEmailEvent): string {
  const type = nonEmptyString(event.email_data?.email_action_type)?.toLowerCase();
  if (!type) throw new AuthEmailHookError('auth_email_payload_invalid', 400);
  return type;
}

function recipientFor(event: AuthEmailEvent): string {
  const email = normalizeEmail(event.user?.email);
  if (!email) throw new AuthEmailHookError('auth_email_payload_invalid', 400);
  return email;
}

function tokenFor(data: EmailData): string {
  const token = nonEmptyString(data.token);
  if (!token || token.length > 32) throw new AuthEmailHookError('auth_email_payload_invalid', 400);
  return token;
}

function tokenHashFor(data: EmailData, key: 'token_hash' | 'token_hash_new' = 'token_hash'): string {
  const hash = nonEmptyString(data[key]);
  if (!hash || hash.length > 256) throw new AuthEmailHookError('auth_email_payload_invalid', 400);
  return hash;
}

function verificationUrl(
  env: AuthEmailRuntimeEnv,
  actionType: string,
  tokenHash: string,
  redirectTo: string | undefined
): string {
  const baseUrl = requiredText(env.SUPABASE_URL, 'auth_email_hook_unconfigured');
  let url: URL;
  try {
    url = new URL('/auth/v1/verify', baseUrl);
  } catch {
    throw new AuthEmailHookError('auth_email_hook_unconfigured', 503, true);
  }

  url.searchParams.set('token', tokenHash);
  url.searchParams.set('type', actionType);

  if (redirectTo) {
    try {
      const redirectUrl = new URL(redirectTo);
      if (redirectUrl.protocol === 'https:' || redirectUrl.protocol === 'http:') {
        url.searchParams.set('redirect_to', redirectUrl.toString());
      }
    } catch {
      // Supabase validates redirect URLs before this hook. Ignore malformed input defensively.
    }
  }

  return url.toString();
}

function wordmark(): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0">
  <tr><td><img class="email-logo-light" src="${EMAIL_LOGO_LIGHT_URL}" width="144" alt="OnFrame" style="display:block;width:144px;height:auto;border:0;outline:none;text-decoration:none;"><img class="email-logo-dark" src="${EMAIL_LOGO_DARK_URL}" width="144" alt="OnFrame" style="display:none;width:144px;height:auto;border:0;outline:none;text-decoration:none;"></td></tr>
</table>`;
}

function actionButton(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 24px;">
  <tr><td class="email-button" style="border-radius:8px;background:#0a4ee4;"><a href="${escapeAttr(href)}" style="display:inline-block;padding:13px 24px;border-radius:8px;color:#ffffff;font-size:15px;font-weight:600;line-height:22px;text-decoration:none;">${escapeHtml(label)}</a></td></tr>
</table>`;
}

function notice(title: string, description: string, tone: 'danger' | 'info' = 'info'): string {
  const colors =
    tone === 'danger'
      ? { background: '#fff5f5', border: '#eda9a9', title: '#d23838' }
      : { background: '#f1f5ff', border: '#a0bbf6', title: '#0a4ee4' };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td class="email-notice" style="padding:16px 20px;background:${colors.background};border:1px solid ${colors.border};border-radius:12px;">
<p class="email-notice-title" style="margin:0 0 4px;font-family:Poppins,Arial,sans-serif;font-size:14px;line-height:20px;font-weight:600;color:${colors.title};">${escapeHtml(title)}</p>
<p class="email-strong" style="margin:0;font-family:Poppins,Arial,sans-serif;font-size:14px;line-height:22px;color:#2a2a2a;">${escapeHtml(description)}</p></td></tr></table>`;
}

function codeInput(token: string): string {
  const cell = token.length <= 6 ? 40 : 32;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
  <tr><td align="center">
    <span class="access-code" aria-label="Código de acesso: ${escapeAttr(token)}" style="display:inline-block;font-size:0;line-height:0;-webkit-user-select:all;user-select:all;white-space:nowrap;">${[...token].map((digit) => `<span class="access-code-cell" aria-hidden="true" style="display:inline-block;box-sizing:border-box;width:${cell}px;height:48px;margin:0 4px;border:2px solid #0a4ee4;border-radius:12px;background:#ffffff;color:#2a2a2a;font-family:'JetBrains Mono','Courier New',monospace;font-size:22px;font-weight:700;line-height:44px;text-align:center;">${escapeHtml(digit)}</span>`).join('')}</span>
    <div class="email-muted" style="margin-top:12px;font-family:Poppins,Arial,sans-serif;font-size:13px;line-height:20px;color:#7a7a7a;">Código de uso único</div>
  </td></tr>
</table>`;
}

function alternateLink(href: string): string {
  return `<p class="email-muted" style="margin:0 0 20px;font-family:Poppins,Arial,sans-serif;font-size:13px;line-height:20px;color:#7a7a7a;">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a class="email-link" href="${escapeAttr(href)}" style="color:#0a4ee4;text-decoration:underline;word-break:break-all;">${escapeHtml(href)}</a></p>`;
}

function emailThemeStyles(): string {
  const darkRules = `.email-bg{background:#1a1a1a!important}.email-card{background:#121212!important;border-color:#2a2a2a!important}.email-strong{color:#f5f5f5!important}.email-copy{color:#c8c8c8!important}.email-muted{color:#969696!important}.email-border{border-color:#2a2a2a!important}.email-button{background:#4d7fef!important}.email-link{color:#4d7fef!important}.access-code-cell{background:#121212!important;border-color:#4d7fef!important;color:#f5f5f5!important}.email-notice{background:#2b1616!important;border-color:#7a3838!important}.email-notice-title{color:#f06a6a!important}.email-logo-light{display:none!important}.email-logo-dark{display:block!important}`;
  const forcedDarkRules = darkRules.replace(
    /(^|\})([^{}]+)\{/gu,
    (_match, boundary, selector: string) => `${boundary}[data-ogsc] ${selector}{`
  );
  return `<style>
      @media only screen and (max-width: 520px) {
        .email-outer { padding:24px 12px !important; }
        .email-pad { padding:20px !important; }
      }
      @media (prefers-color-scheme: dark) { ${darkRules} }
      ${forcedDarkRules}
    </style>`;
}

function emailShell(options: { title: string; preview: string; content: string; note?: string }): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${escapeHtml(options.title)}</title>
    ${emailThemeStyles()}
  </head>
  <body class="email-bg" style="margin:0;padding:0;background:#fbfbfb;color:#545454;font-family:Poppins,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(options.preview)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-bg" style="background:#fbfbfb;">
      <tr><td class="email-outer" align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;">
          <tr><td style="padding:0 4px 24px;">
            ${wordmark()}
          </td></tr>
          <tr><td class="email-card email-pad" style="padding:36px 32px 16px;background:#ffffff;border:1px solid #ececec;border-radius:16px;">
            <h1 class="email-strong" style="margin:0 0 16px;color:#2a2a2a;font-family:Poppins,Arial,sans-serif;font-size:22px;font-weight:600;letter-spacing:0;line-height:30px;">${escapeHtml(options.title)}</h1>
            ${options.content}
            ${options.note ? `<p class="email-muted" style="margin:20px 0 0;color:#7a7a7a;font-family:Poppins,Arial,sans-serif;font-size:13px;line-height:20px;">${escapeHtml(options.note)}</p>` : ''}
          </td></tr>
          <tr><td class="email-muted" style="padding:24px 4px 0;color:#7a7a7a;font-family:Poppins,Arial,sans-serif;font-size:12px;line-height:18px;">
            <p style="margin:0 0 8px;">É uma mensagem automática; não precisa responder.</p>
            <p style="margin:0;">OnFrame · onblide.com</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function actionEmail(options: {
  title: string;
  preview: string;
  description: string;
  buttonLabel: string;
  token: string;
  verificationUrl: string;
  note: string;
  warning?: string;
}): string {
  const content = `<p class="email-copy" style="margin:0;color:#545454;font-family:Poppins,Arial,sans-serif;font-size:15px;line-height:24px;">${escapeHtml(options.description)}</p>
${codeInput(options.token)}
${actionButton(options.verificationUrl, options.buttonLabel)}
${alternateLink(options.verificationUrl)}
${options.warning ? notice('Não foi você?', options.warning, 'danger') : ''}`;

  return emailShell({
    title: options.title,
    preview: options.preview,
    content,
    note: options.note
  });
}

function linkEmail(options: {
  title: string;
  preview: string;
  description: string;
  buttonLabel: string;
  verificationUrl: string;
  note: string;
  warning?: string;
}): string {
  const content = `<p class="email-copy" style="margin:0;color:#545454;font-family:Poppins,Arial,sans-serif;font-size:15px;line-height:24px;">${escapeHtml(options.description)}</p>
<div style="height:24px;line-height:24px;">&nbsp;</div>
${actionButton(options.verificationUrl, options.buttonLabel)}
${alternateLink(options.verificationUrl)}
${options.warning ? notice('Não foi você?', options.warning, 'danger') : ''}`;

  return emailShell({
    title: options.title,
    preview: options.preview,
    content,
    note: options.note
  });
}

function notificationEmail(options: { title: string; description: string; note: string }): string {
  return emailShell({
    title: options.title,
    preview: options.description,
    content: `<p class="email-copy" style="margin:0 0 20px;color:#545454;font-family:Poppins,Arial,sans-serif;font-size:15px;line-height:24px;">${escapeHtml(options.description)}</p>${notice('Não foi você?', options.note, 'danger')}`
  });
}

function createActionDelivery(
  env: AuthEmailRuntimeEnv,
  event: AuthEmailEvent,
  options: {
    actionType: string;
    recipient: string;
    title: string;
    preview: string;
    description: string;
    buttonLabel: string;
    note: string;
    warning?: string;
    token?: string;
    tokenHash?: string;
  }
): AuthEmailDelivery {
  const data = event.email_data ?? {};
  const token = options.token ?? tokenFor(data);
  const tokenHash = options.tokenHash ?? tokenHashFor(data);
  const verification = verificationUrl(env, options.actionType, tokenHash, data.redirect_to);
  return {
    actionType: options.actionType,
    recipient: options.recipient,
    subject: options.title,
    html: actionEmail({ ...options, token, verificationUrl: verification })
  };
}

function createLinkDelivery(
  env: AuthEmailRuntimeEnv,
  event: AuthEmailEvent,
  options: {
    actionType: string;
    recipient: string;
    title: string;
    preview: string;
    description: string;
    buttonLabel: string;
    note: string;
    warning?: string;
  }
): AuthEmailDelivery {
  const data = event.email_data ?? {};
  const verification = verificationUrl(env, options.actionType, tokenHashFor(data), data.redirect_to);
  return {
    actionType: options.actionType,
    recipient: options.recipient,
    subject: options.title,
    html: linkEmail({ ...options, verificationUrl: verification })
  };
}

function emailChangeDeliveries(env: AuthEmailRuntimeEnv, event: AuthEmailEvent): AuthEmailDelivery[] {
  const data = event.email_data ?? {};
  const currentEmail = recipientFor(event);
  const newEmail = normalizeEmail(event.user?.new_email);
  const hasSecureChangePair = Boolean(
    newEmail && nonEmptyString(data.token_new) && nonEmptyString(data.token_hash_new)
  );

  if (!hasSecureChangePair) {
    return [
      createActionDelivery(env, event, {
        actionType: 'email_change',
        recipient: newEmail ?? currentEmail,
        title: 'Confirme seu novo e-mail',
        preview: 'Confirme o novo e-mail da sua conta OnFrame.',
        description: 'Use o código abaixo ou o botão para confirmar o novo e-mail da sua conta.',
        buttonLabel: 'Confirmar novo e-mail',
        note: 'Se você não solicitou esta alteração, não confirme este código.',
        warning: 'Ignore este e-mail se você não solicitou alterar o endereço da conta.'
      })
    ];
  }

  if (!newEmail) throw new AuthEmailHookError('auth_email_payload_invalid', 400);

  return [
    createActionDelivery(env, event, {
      actionType: 'email_change',
      recipient: currentEmail,
      title: 'Confirme a alteração de e-mail',
      preview: 'Confirme a alteração solicitada para o e-mail da sua conta.',
      description: 'Você solicitou trocar o e-mail da sua conta. Confirme esta etapa no endereço atual.',
      buttonLabel: 'Confirmar alteração',
      note: 'Se você não solicitou esta alteração, ignore este e-mail.',
      warning: 'Nenhum endereço será alterado sem confirmar as duas etapas.',
      token: tokenFor(data),
      tokenHash: tokenHashFor(data, 'token_hash_new')
    }),
    createActionDelivery(env, event, {
      actionType: 'email_change',
      recipient: newEmail,
      title: 'Confirme seu novo e-mail',
      preview: 'Confirme o novo e-mail da sua conta OnFrame.',
      description: 'Confirme esta etapa no novo endereço para concluir a alteração.',
      buttonLabel: 'Confirmar novo e-mail',
      note: 'Se você não solicitou esta alteração, ignore este e-mail.',
      warning: 'Nenhum endereço será alterado sem confirmar as duas etapas.',
      token: nonEmptyString(data.token_new) as string,
      tokenHash: tokenHashFor(data)
    })
  ];
}

function notificationDelivery(
  event: AuthEmailEvent,
  options: {
    actionType: string;
    title: string;
    description: string;
    note: string;
  }
): AuthEmailDelivery {
  return {
    actionType: options.actionType,
    recipient: recipientFor(event),
    subject: options.title,
    html: notificationEmail(options)
  };
}

function deliveriesForEvent(env: AuthEmailRuntimeEnv, event: AuthEmailEvent): AuthEmailDelivery[] {
  const actionType = emailActionType(event);
  const recipient = recipientFor(event);

  switch (actionType) {
    case 'signup':
    case 'email':
      return [
        createLinkDelivery(env, event, {
          actionType,
          recipient,
          title: 'Confirme seu e-mail',
          preview: 'Confirme seu endereço para ativar a conta OnFrame.',
          description: 'Use o link abaixo para confirmar seu endereço de e-mail.',
          buttonLabel: 'Confirmar e-mail',
          note: 'Se você não criou esta conta, ignore este e-mail.',
          warning: 'Nenhuma conta será ativada sem confirmar este endereço.'
        })
      ];
    case 'invite':
      return [
        createActionDelivery(env, event, {
          actionType,
          recipient,
          title: 'Você recebeu um convite',
          preview: 'Você foi convidado para acessar um workspace no OnFrame.',
          description: 'Use o código abaixo ou o botão para aceitar seu convite para o OnFrame.',
          buttonLabel: 'Aceitar convite',
          note: 'Se você não esperava este convite, ignore este e-mail.',
          warning: 'O convite só será aceito depois da sua confirmação.'
        })
      ];
    case 'magiclink':
      if (event.email_data?.redirect_to === 'https://onframe.onblide.com/connect?verification=login') {
        return [
          {
            actionType,
            recipient,
            subject: 'Seu código de acesso ao OnFrame',
            html: emailShell({
              title: 'Seu código de acesso',
              preview: 'Use este código para entrar no OnFrame.',
              content: `<p class="email-copy" style="margin:0;color:#545454;font-family:Poppins,Arial,sans-serif;font-size:15px;line-height:24px;">Informe este código na tela de login.</p>${codeInput(tokenFor(event.email_data))}${notice('Não foi você?', 'Não compartilhe este código. Ignore este e-mail se você não solicitou o acesso.', 'danger')}`,
              note: 'Este código é de uso único.'
            })
          }
        ];
      }
      if (event.email_data?.redirect_to === 'https://onframe.onblide.com/connect?verification=email') {
        return [
          {
            actionType,
            recipient,
            subject: 'Confirme seu e-mail no OnFrame',
            html: emailShell({
              title: 'Confirme seu e-mail',
              preview: 'Use este código na tela de segurança do OnFrame.',
              content: `<p class="email-copy" style="margin:0;color:#545454;font-family:Poppins,Arial,sans-serif;font-size:15px;line-height:24px;">Informe este código na tela em que você iniciou a verificação.</p>${codeInput(tokenFor(event.email_data))}${notice('Não foi você?', 'Não compartilhe este código. Ignore este e-mail se você não iniciou a verificação.', 'danger')}`,
              note: 'Este código é de uso único e permite verificar o acesso à sua conta.'
            })
          }
        ];
      }
      return [
        createLinkDelivery(env, event, {
          actionType,
          recipient,
          title: 'Seu link de acesso',
          preview: 'Use este link para entrar no OnFrame.',
          description: 'Use o link abaixo para entrar na sua conta.',
          buttonLabel: 'Entrar no OnFrame',
          note: 'Se você não solicitou este acesso, ignore este e-mail.',
          warning: 'Nenhum acesso será concedido sem usar este link.'
        })
      ];
    case 'recovery':
      return [
        createLinkDelivery(env, event, {
          actionType,
          recipient,
          title: 'Redefina sua senha',
          preview: 'Use este link para redefinir a senha da sua conta OnFrame.',
          description: 'Use o link abaixo para definir uma nova senha.',
          buttonLabel: 'Redefinir senha',
          note: 'Se você não solicitou esta recuperação, ignore este e-mail. Sua senha não será alterada.',
          warning: 'Nenhuma senha será alterada sem usar este link.'
        })
      ];
    case 'reauthentication':
      return [
        createActionDelivery(env, event, {
          actionType,
          recipient,
          title: 'Confirme esta ação',
          preview: 'Use este código para confirmar uma ação sensível no OnFrame.',
          description: 'Informe este código na tela de verificação para continuar.',
          buttonLabel: 'Confirmar ação',
          note: 'Se você não iniciou esta ação, ignore este e-mail.',
          warning: 'O código não concede acesso à sua conta por conta própria.'
        })
      ];
    case 'email_change':
      return emailChangeDeliveries(env, event);
    case 'password_changed_notification':
      return [
        notificationDelivery(event, {
          actionType,
          title: 'Sua senha foi alterada',
          description: 'A senha da sua conta OnFrame foi alterada.',
          note: 'Se você não fez esta alteração, recupere o acesso imediatamente.'
        })
      ];
    case 'email_changed_notification':
      return [
        notificationDelivery(event, {
          actionType,
          title: 'O e-mail da sua conta foi alterado',
          description: `O endereço de e-mail da sua conta foi atualizado${nonEmptyString(event.email_data?.old_email) ? ` a partir de ${nonEmptyString(event.email_data?.old_email)}.` : '.'}`,
          note: 'Se você não fez esta alteração, recupere o acesso imediatamente.'
        })
      ];
    case 'phone_changed_notification':
      return [
        notificationDelivery(event, {
          actionType,
          title: 'O telefone da sua conta foi alterado',
          description: 'O telefone associado à sua conta OnFrame foi atualizado.',
          note: 'Se você não fez esta alteração, revise a segurança da sua conta.'
        })
      ];
    case 'mfa_factor_enrolled_notification':
      return [
        notificationDelivery(event, {
          actionType,
          title: 'Um método de verificação foi adicionado',
          description: 'Um novo método de verificação em duas etapas foi adicionado à sua conta.',
          note: 'Se você não fez esta alteração, revise a segurança da sua conta.'
        })
      ];
    case 'mfa_factor_unenrolled_notification':
      return [
        notificationDelivery(event, {
          actionType,
          title: 'Um método de verificação foi removido',
          description: 'Um método de verificação em duas etapas foi removido da sua conta.',
          note: 'Se você não fez esta alteração, revise a segurança da sua conta.'
        })
      ];
    case 'identity_linked_notification':
      return [
        notificationDelivery(event, {
          actionType,
          title: 'Um método de acesso foi conectado',
          description: 'Um método adicional de acesso foi conectado à sua conta OnFrame.',
          note: 'Se você não fez esta alteração, revise a segurança da sua conta.'
        })
      ];
    case 'identity_unlinked_notification':
      return [
        notificationDelivery(event, {
          actionType,
          title: 'Um método de acesso foi removido',
          description: 'Um método de acesso foi removido da sua conta OnFrame.',
          note: 'Se você não fez esta alteração, revise a segurança da sua conta.'
        })
      ];
    default:
      throw new AuthEmailHookError('auth_email_action_unsupported', 400);
  }
}

async function reserveDelivery(
  env: AuthEmailRuntimeEnv,
  webhookId: string,
  delivery: AuthEmailDelivery
): Promise<ReservedDelivery> {
  const recipientHash = await sha256Hex(delivery.recipient);
  const id = await sha256Hex(`${webhookId}:${recipientHash}`);
  const timestamp = now();
  const inserted = await env.ONFRAME_DB.prepare(
    `
    INSERT OR IGNORE INTO auth_email_deliveries (
      id, webhook_id, recipient_hash, email_action_type, status, attempt_count, created_at, updated_at, lease_expires_at
    ) VALUES (?, ?, ?, ?, 'sending', 1, ?, ?, ?)
  `
  )
    .bind(id, webhookId, recipientHash, delivery.actionType, timestamp, timestamp, timestamp + DELIVERY_LEASE_MS)
    .run();

  if (inserted.meta.changes === 1) return { id, recipientHash, state: 'reserved' };

  const existing = await env.ONFRAME_DB.prepare(
    `
    SELECT status, lease_expires_at
    FROM auth_email_deliveries
    WHERE id = ?
  `
  )
    .bind(id)
    .first<{ status: string; lease_expires_at: number | null }>();

  if (existing?.status === 'sent') return { id, recipientHash, state: 'sent' };

  if (Number(existing?.lease_expires_at ?? 0) > timestamp) {
    return { id, recipientHash, state: 'sending' };
  }

  const claimed = await env.ONFRAME_DB.prepare(
    `
    UPDATE auth_email_deliveries
    SET attempt_count = attempt_count + 1, updated_at = ?, lease_expires_at = ?
    WHERE id = ? AND status = 'sending' AND lease_expires_at <= ?
  `
  )
    .bind(timestamp, timestamp + DELIVERY_LEASE_MS, id, timestamp)
    .run();

  return { id, recipientHash, state: claimed.meta.changes === 1 ? 'reserved' : 'sending' };
}

async function markDeliverySent(env: AuthEmailRuntimeEnv, id: string): Promise<void> {
  const timestamp = now();
  await env.ONFRAME_DB.prepare(
    `
    UPDATE auth_email_deliveries
    SET status = 'sent', sent_at = ?, updated_at = ?, lease_expires_at = NULL
    WHERE id = ?
  `
  )
    .bind(timestamp, timestamp, id)
    .run();
}

async function releaseDelivery(env: AuthEmailRuntimeEnv, id: string): Promise<void> {
  await env.ONFRAME_DB.prepare(
    `
    DELETE FROM auth_email_deliveries
    WHERE id = ? AND status = 'sending'
  `
  )
    .bind(id)
    .run();
}

async function sendWithResend(
  env: AuthEmailRuntimeEnv,
  delivery: AuthEmailDelivery,
  idempotencyKey: string
): Promise<void> {
  const apiKey = requiredText(env.RESEND_API_KEY, 'auth_email_sender_unconfigured');
  const from = requiredText(env.AUTH_EMAIL_FROM, 'auth_email_sender_unconfigured');
  let response: Response;

  try {
    response = await fetch(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify({
        from,
        to: delivery.recipient,
        subject: delivery.subject,
        html: delivery.html
      }),
      signal: AbortSignal.timeout(3500)
    });
  } catch {
    throw new AuthEmailHookError('auth_email_delivery_unavailable', 503, true);
  }

  if (!response.ok) {
    const retryable = response.status >= 500 || response.status === 429 || response.status === 409;
    throw new AuthEmailHookError('auth_email_delivery_failed', retryable ? 503 : 400, retryable);
  }
}

function hookErrorResponse(error: unknown): Response {
  const hookError =
    error instanceof AuthEmailHookError ? error : new AuthEmailHookError('auth_email_delivery_unavailable', 503, true);
  const headers = hookError.retryable ? { 'retry-after': '2' } : undefined;
  return json({ error: { message: hookError.code } }, hookError.status, headers);
}

async function verifyEvent(
  request: Request,
  env: AuthEmailRuntimeEnv
): Promise<{ event: AuthEmailEvent; webhookId: string }> {
  if (request.method !== 'POST') throw new AuthEmailHookError('method_not_allowed', 405);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new AuthEmailHookError('invalid_content_type', 400);
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HOOK_BODY_BYTES) {
    throw new AuthEmailHookError('payload_too_large', 413);
  }

  const payload = await request.text();
  if (new TextEncoder().encode(payload).byteLength > MAX_HOOK_BODY_BYTES) {
    throw new AuthEmailHookError('payload_too_large', 413);
  }

  const webhookId = nonEmptyString(request.headers.get('webhook-id'));
  if (!webhookId || webhookId.length > 128) throw new AuthEmailHookError('auth_email_signature_invalid', 401);

  try {
    const event = new Webhook(hookSecret(env.SUPABASE_SEND_EMAIL_HOOK_SECRET)).verify(
      payload,
      Object.fromEntries(request.headers)
    );
    if (!isRecord(event)) throw new AuthEmailHookError('auth_email_payload_invalid', 400);
    return { event: event as AuthEmailEvent, webhookId };
  } catch (error) {
    if (error instanceof AuthEmailHookError) throw error;
    if (error instanceof WebhookVerificationError) throw new AuthEmailHookError('auth_email_signature_invalid', 401);
    throw new AuthEmailHookError('auth_email_payload_invalid', 400);
  }
}

export async function handleSupabaseSendEmailHook(request: Request, env: AuthEmailRuntimeEnv): Promise<Response> {
  if (new URL(request.url).pathname !== AUTH_EMAIL_HOOK_PATH) return json({ error: 'not_found' }, 404);

  try {
    const { event, webhookId } = await verifyEvent(request, env);
    const deliveries = deliveriesForEvent(env, event);

    for (const delivery of deliveries) {
      const reserved = await reserveDelivery(env, webhookId, delivery);
      if (reserved.state === 'sent') continue;
      if (reserved.state === 'sending') throw new AuthEmailHookError('auth_email_delivery_in_progress', 503, true);

      try {
        await sendWithResend(env, delivery, reserved.id);
        await markDeliverySent(env, reserved.id);
      } catch (error) {
        await releaseDelivery(env, reserved.id).catch(() => undefined);
        throw error;
      }
    }

    console.log(
      JSON.stringify({
        event: 'auth_email_sent',
        webhookId,
        actionType: emailActionType(event),
        deliveryCount: deliveries.length
      })
    );
    return json({});
  } catch (error) {
    const response = hookErrorResponse(error);
    console.error(
      JSON.stringify({
        event: 'auth_email_failed',
        code: error instanceof AuthEmailHookError ? error.code : 'auth_email_delivery_unavailable',
        status: response.status
      })
    );
    return response;
  }
}

export { AUTH_EMAIL_HOOK_PATH, deliveriesForEvent };
