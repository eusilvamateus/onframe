import { Webhook, WebhookVerificationError } from 'standardwebhooks';

const AUTH_EMAIL_HOOK_PATH = '/hooks/supabase/send-email';
const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const LOGO_URL = 'https://onblide-design-system.vercel.app/img/marca/png/onblide-horizontal-primary.png';
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
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then((digest) => (
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  ));
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

function verificationUrl(env: AuthEmailRuntimeEnv, actionType: string, tokenHash: string, redirectTo: string | undefined): string {
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
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td valign="middle"><img src="${LOGO_URL}" width="116" alt="Onblide" style="display:block;width:116px;height:auto;border:0;outline:none;text-decoration:none;"></td>
    <td width="12"></td>
    <td valign="middle" style="border-left:1px solid #ececec;padding-left:12px;color:#a8a8a8;font-family:'JetBrains Mono','Courier New',monospace;font-size:12px;font-weight:600;letter-spacing:.04em;line-height:1;">ONFRAME</td>
  </tr>
</table>`;
}

function eyebrow(label: string): string {
  return `<p style="margin:24px 0 8px;color:#0a4ee4;font-family:'JetBrains Mono','Courier New',monospace;font-size:12px;font-weight:600;letter-spacing:.04em;line-height:1.3;text-transform:uppercase;">${escapeHtml(label)}</p>`;
}

function actionButton(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
  <tr><td style="border-radius:10px;background:#0a4ee4;"><a class="action-link" href="${escapeAttr(href)}" style="display:inline-block;padding:10px 18px;border-radius:10px;color:#ffffff;font-size:14px;font-weight:600;line-height:1.2;text-decoration:none;">${escapeHtml(label)}</a></td></tr>
</table>`;
}

function alert(title: string, description: string, tone: 'info' | 'warning' = 'info'): string {
  const colors = tone === 'warning'
    ? { background: '#fde6d3', border: 'rgba(235,124,45,.28)' }
    : { background: '#e0eaff', border: 'rgba(10,78,228,.28)' };
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;border-collapse:separate;">
  <tr><td style="padding:14px 16px;border:1px solid ${colors.border};border-radius:12px;background:${colors.background};">
    <p style="margin:0 0 3px;color:#2a2a2a;font-size:14px;font-weight:600;line-height:1.35;">${escapeHtml(title)}</p>
    <p style="margin:0;color:#545454;font-size:13.5px;line-height:1.5;">${escapeHtml(description)}</p>
  </td></tr>
</table>`;
}

function codeInput(token: string): string {
  const cells = Array.from(token, (character) => `<td class="code-cell" align="center" valign="middle" style="width:48px;height:56px;border:2px solid #0a4ee4;border-radius:12px;background:#ffffff;color:#2a2a2a;font-family:'JetBrains Mono','Courier New',monospace;font-size:22px;font-weight:700;line-height:1;">${escapeHtml(character)}</td>`);
  const spacedCells = cells.flatMap((cell, index) => index === cells.length - 1 ? [cell] : [cell, '<td class="code-gap" width="10" style="width:10px;">&nbsp;</td>']);

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
  <tr><td align="center">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>${spacedCells.join('')}</tr></table>
  </td></tr>
</table>`;
}

function emailShell(options: {
  title: string;
  eyebrow: string;
  preview: string;
  content: string;
  note?: string;
}): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(options.title)}</title>
    <style>
      @media only screen and (max-width: 520px) {
        .email-outer { padding:24px 12px !important; }
        .email-pad { padding:20px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#545454;font-family:Poppins,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(options.preview)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;">
      <tr><td class="email-outer" align="center" style="padding:48px 16px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;border:1px solid #ececec;border-radius:12px;background:#ffffff;box-shadow:none;">
          <tr><td class="email-pad" style="padding:20px;">
            ${wordmark()}
            ${eyebrow(options.eyebrow)}
            <h1 style="margin:0 0 12px;color:#2a2a2a;font-size:28px;font-weight:600;letter-spacing:0;line-height:1.2;">${escapeHtml(options.title)}</h1>
            ${options.content}
            ${options.note ? `<p style="margin:20px 0 0;color:#7a7a7a;font-size:14px;line-height:1.45;">${escapeHtml(options.note)}</p>` : ''}
          </td></tr>
          <tr><td style="padding:16px 20px;border-top:1px solid #ececec;color:#7a7a7a;font-size:14px;line-height:1.45;text-align:center;">OnFrame · onblide.com</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function actionEmail(options: {
  title: string;
  eyebrow: string;
  preview: string;
  description: string;
  buttonLabel: string;
  token: string;
  verificationUrl: string;
  note: string;
  warning?: string;
}): string {
  const content = `<p style="margin:0;color:#545454;font-size:16px;line-height:1.6;">${escapeHtml(options.description)}</p>
${codeInput(options.token)}
${actionButton(options.verificationUrl, options.buttonLabel)}
<p style="margin:0;color:#7a7a7a;font-size:14px;line-height:1.45;">O código e o link são de uso único.</p>
${options.warning ? alert('Não foi você?', options.warning, 'warning') : ''}`;

  return emailShell({
    title: options.title,
    eyebrow: options.eyebrow,
    preview: options.preview,
    content,
    note: options.note
  });
}

function notificationEmail(options: {
  title: string;
  eyebrow: string;
  description: string;
  note: string;
  tone?: 'info' | 'warning';
}): string {
  return emailShell({
    title: options.title,
    eyebrow: options.eyebrow,
    preview: options.description,
    content: `<p style="margin:0;color:#545454;font-size:16px;line-height:1.6;">${escapeHtml(options.description)}</p>${alert('Segurança da conta', options.note, options.tone ?? 'info')}`,
    note: 'Este é um aviso transacional. Nenhuma ação é necessária se a alteração foi feita por você.'
  });
}

function createActionDelivery(env: AuthEmailRuntimeEnv, event: AuthEmailEvent, options: {
  actionType: string;
  recipient: string;
  title: string;
  eyebrow: string;
  preview: string;
  description: string;
  buttonLabel: string;
  note: string;
  warning?: string;
  token?: string;
  tokenHash?: string;
}): AuthEmailDelivery {
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

function emailChangeDeliveries(env: AuthEmailRuntimeEnv, event: AuthEmailEvent): AuthEmailDelivery[] {
  const data = event.email_data ?? {};
  const currentEmail = recipientFor(event);
  const newEmail = normalizeEmail(event.user?.new_email);
  const hasSecureChangePair = Boolean(newEmail && nonEmptyString(data.token_new) && nonEmptyString(data.token_hash_new));

  if (!hasSecureChangePair) {
    return [createActionDelivery(env, event, {
      actionType: 'email_change',
      recipient: newEmail ?? currentEmail,
      title: 'Confirme seu novo e-mail',
      eyebrow: 'ALTERAÇÃO DE E-MAIL',
      preview: 'Confirme o novo e-mail da sua conta OnFrame.',
      description: 'Use o código abaixo ou o botão para confirmar o novo e-mail da sua conta.',
      buttonLabel: 'Confirmar novo e-mail',
      note: 'Se você não solicitou esta alteração, não confirme este código.',
      warning: 'Ignore este e-mail se você não solicitou alterar o endereço da conta.'
    })];
  }

  if (!newEmail) throw new AuthEmailHookError('auth_email_payload_invalid', 400);

  return [
    createActionDelivery(env, event, {
      actionType: 'email_change',
      recipient: currentEmail,
      title: 'Confirme a alteração de e-mail',
      eyebrow: 'SEGURANÇA DA CONTA',
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
      eyebrow: 'ALTERAÇÃO DE E-MAIL',
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

function notificationDelivery(event: AuthEmailEvent, options: {
  actionType: string;
  title: string;
  eyebrow: string;
  description: string;
  note: string;
  tone?: 'info' | 'warning';
}): AuthEmailDelivery {
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
      return [createActionDelivery(env, event, {
        actionType,
        recipient,
        title: 'Confirme seu e-mail',
        eyebrow: 'CONTA ONFRAME',
        preview: 'Confirme seu endereço para ativar a conta OnFrame.',
        description: 'Use o código abaixo ou o botão para confirmar seu endereço de e-mail.',
        buttonLabel: 'Confirmar e-mail',
        note: 'Se você não criou esta conta, ignore este e-mail.',
        warning: 'Nenhuma conta será ativada sem confirmar este endereço.'
      })];
    case 'invite':
      return [createActionDelivery(env, event, {
        actionType,
        recipient,
        title: 'Você recebeu um convite',
        eyebrow: 'ACESSO COMPARTILHADO',
        preview: 'Você foi convidado para acessar um workspace no OnFrame.',
        description: 'Use o código abaixo ou o botão para aceitar seu convite para o OnFrame.',
        buttonLabel: 'Aceitar convite',
        note: 'Se você não esperava este convite, ignore este e-mail.',
        warning: 'O convite só será aceito depois da sua confirmação.'
      })];
    case 'magiclink':
      return [createActionDelivery(env, event, {
        actionType,
        recipient,
        title: 'Seu código de acesso',
        eyebrow: 'LOGIN SEGURO',
        preview: 'Use este código para entrar no OnFrame.',
        description: 'Use o código abaixo ou o link único para entrar na sua conta.',
        buttonLabel: 'Entrar no OnFrame',
        note: 'Se você não solicitou este acesso, ignore este e-mail.',
        warning: 'Nenhum acesso será concedido sem usar o código ou o link.'
      })];
    case 'recovery':
      return [createActionDelivery(env, event, {
        actionType,
        recipient,
        title: 'Redefina sua senha',
        eyebrow: 'RECUPERAÇÃO DE CONTA',
        preview: 'Use este código para redefinir a senha da sua conta OnFrame.',
        description: 'Use o código abaixo ou o link único para definir uma nova senha.',
        buttonLabel: 'Redefinir senha',
        note: 'Se você não solicitou esta recuperação, ignore este e-mail. Sua senha não será alterada.',
        warning: 'Nenhuma senha será alterada sem usar o código ou o link.'
      })];
    case 'reauthentication':
      return [createActionDelivery(env, event, {
        actionType,
        recipient,
        title: 'Confirme esta ação',
        eyebrow: 'VERIFICAÇÃO DE SEGURANÇA',
        preview: 'Use este código para confirmar uma ação sensível no OnFrame.',
        description: 'Informe este código na tela de verificação para continuar.',
        buttonLabel: 'Confirmar ação',
        note: 'Se você não iniciou esta ação, ignore este e-mail.',
        warning: 'O código não concede acesso à sua conta por conta própria.'
      })];
    case 'email_change':
      return emailChangeDeliveries(env, event);
    case 'password_changed_notification':
      return [notificationDelivery(event, {
        actionType,
        title: 'Sua senha foi alterada',
        eyebrow: 'SEGURANÇA DA CONTA',
        description: 'A senha da sua conta OnFrame foi alterada.',
        note: 'Se você não fez esta alteração, recupere o acesso imediatamente.',
        tone: 'warning'
      })];
    case 'email_changed_notification':
      return [notificationDelivery(event, {
        actionType,
        title: 'O e-mail da sua conta foi alterado',
        eyebrow: 'SEGURANÇA DA CONTA',
        description: `O endereço de e-mail da sua conta foi atualizado${nonEmptyString(event.email_data?.old_email) ? ` a partir de ${nonEmptyString(event.email_data?.old_email)}.` : '.'}`,
        note: 'Se você não fez esta alteração, recupere o acesso imediatamente.',
        tone: 'warning'
      })];
    case 'phone_changed_notification':
      return [notificationDelivery(event, {
        actionType,
        title: 'O telefone da sua conta foi alterado',
        eyebrow: 'SEGURANÇA DA CONTA',
        description: 'O telefone associado à sua conta OnFrame foi atualizado.',
        note: 'Se você não fez esta alteração, revise a segurança da sua conta.',
        tone: 'warning'
      })];
    case 'mfa_factor_enrolled_notification':
      return [notificationDelivery(event, {
        actionType,
        title: 'Um método de verificação foi adicionado',
        eyebrow: 'AUTENTICAÇÃO EM DUAS ETAPAS',
        description: 'Um novo método de verificação em duas etapas foi adicionado à sua conta.',
        note: 'Se você não fez esta alteração, revise a segurança da sua conta.',
        tone: 'warning'
      })];
    case 'mfa_factor_unenrolled_notification':
      return [notificationDelivery(event, {
        actionType,
        title: 'Um método de verificação foi removido',
        eyebrow: 'AUTENTICAÇÃO EM DUAS ETAPAS',
        description: 'Um método de verificação em duas etapas foi removido da sua conta.',
        note: 'Se você não fez esta alteração, revise a segurança da sua conta.',
        tone: 'warning'
      })];
    case 'identity_linked_notification':
      return [notificationDelivery(event, {
        actionType,
        title: 'Um método de acesso foi conectado',
        eyebrow: 'SEGURANÇA DA CONTA',
        description: 'Um método adicional de acesso foi conectado à sua conta OnFrame.',
        note: 'Se você não fez esta alteração, revise a segurança da sua conta.',
        tone: 'warning'
      })];
    case 'identity_unlinked_notification':
      return [notificationDelivery(event, {
        actionType,
        title: 'Um método de acesso foi removido',
        eyebrow: 'SEGURANÇA DA CONTA',
        description: 'Um método de acesso foi removido da sua conta OnFrame.',
        note: 'Se você não fez esta alteração, revise a segurança da sua conta.',
        tone: 'warning'
      })];
    default:
      throw new AuthEmailHookError('auth_email_action_unsupported', 400);
  }
}

async function reserveDelivery(env: AuthEmailRuntimeEnv, webhookId: string, delivery: AuthEmailDelivery): Promise<ReservedDelivery> {
  const recipientHash = await sha256Hex(delivery.recipient);
  const id = await sha256Hex(`${webhookId}:${recipientHash}`);
  const timestamp = now();
  const inserted = await env.ONFRAME_DB.prepare(`
    INSERT OR IGNORE INTO auth_email_deliveries (
      id, webhook_id, recipient_hash, email_action_type, status, attempt_count, created_at, updated_at, lease_expires_at
    ) VALUES (?, ?, ?, ?, 'sending', 1, ?, ?, ?)
  `).bind(id, webhookId, recipientHash, delivery.actionType, timestamp, timestamp, timestamp + DELIVERY_LEASE_MS).run();

  if (inserted.meta.changes === 1) return { id, recipientHash, state: 'reserved' };

  const existing = await env.ONFRAME_DB.prepare(`
    SELECT status, lease_expires_at
    FROM auth_email_deliveries
    WHERE id = ?
  `).bind(id).first<{ status: string; lease_expires_at: number | null }>();

  if (existing?.status === 'sent') return { id, recipientHash, state: 'sent' };

  if (Number(existing?.lease_expires_at ?? 0) > timestamp) {
    return { id, recipientHash, state: 'sending' };
  }

  const claimed = await env.ONFRAME_DB.prepare(`
    UPDATE auth_email_deliveries
    SET attempt_count = attempt_count + 1, updated_at = ?, lease_expires_at = ?
    WHERE id = ? AND status = 'sending' AND lease_expires_at <= ?
  `).bind(timestamp, timestamp + DELIVERY_LEASE_MS, id, timestamp).run();

  return { id, recipientHash, state: claimed.meta.changes === 1 ? 'reserved' : 'sending' };
}

async function markDeliverySent(env: AuthEmailRuntimeEnv, id: string): Promise<void> {
  const timestamp = now();
  await env.ONFRAME_DB.prepare(`
    UPDATE auth_email_deliveries
    SET status = 'sent', sent_at = ?, updated_at = ?, lease_expires_at = NULL
    WHERE id = ?
  `).bind(timestamp, timestamp, id).run();
}

async function releaseDelivery(env: AuthEmailRuntimeEnv, id: string): Promise<void> {
  await env.ONFRAME_DB.prepare(`
    DELETE FROM auth_email_deliveries
    WHERE id = ? AND status = 'sending'
  `).bind(id).run();
}

async function sendWithResend(env: AuthEmailRuntimeEnv, delivery: AuthEmailDelivery, idempotencyKey: string): Promise<void> {
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
  const hookError = error instanceof AuthEmailHookError
    ? error
    : new AuthEmailHookError('auth_email_delivery_unavailable', 503, true);
  const headers = hookError.retryable ? { 'retry-after': '2' } : undefined;
  return json({ error: { message: hookError.code } }, hookError.status, headers);
}

async function verifyEvent(request: Request, env: AuthEmailRuntimeEnv): Promise<{ event: AuthEmailEvent; webhookId: string }> {
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
    const event = new Webhook(hookSecret(env.SUPABASE_SEND_EMAIL_HOOK_SECRET)).verify(payload, Object.fromEntries(request.headers));
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

    console.log(JSON.stringify({
      event: 'auth_email_sent',
      webhookId,
      actionType: emailActionType(event),
      deliveryCount: deliveries.length
    }));
    return json({});
  } catch (error) {
    const response = hookErrorResponse(error);
    console.error(JSON.stringify({
      event: 'auth_email_failed',
      code: error instanceof AuthEmailHookError ? error.code : 'auth_email_delivery_unavailable',
      status: response.status
    }));
    return response;
  }
}

export { AUTH_EMAIL_HOOK_PATH, deliveriesForEvent };
