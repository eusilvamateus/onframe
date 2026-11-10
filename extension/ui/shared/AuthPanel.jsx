import { useEffect, useId, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CodeInput,
  Divider,
  Input,
  Link,
  Logo,
  Ph,
  ProgressBar,
  Spinner,
  Tabs,
  Tooltip
} from '@onblide/ui';
import { normalizeAuthResumeState } from './popup-session-state';
import { openExternal, sendRemoteMessage } from './runtime';
import { restoreProviderSession, verifySecondFactor } from './provider-auth';

const AUTH_MODES = {
  signin: { title: 'Entrar na Onblide', description: 'Use o e-mail com que você criou a conta.' },
  signup: { title: 'Criar sua conta', description: 'Informe seus dados para começar.' },
  magic: { title: 'Entrar com código', description: 'Enviaremos um código de acesso para o seu e-mail.' },
  recovery: {
    title: 'Redefinir senha',
    description: 'Digite o e-mail da sua conta. Vamos enviar um link para você criar uma senha nova.'
  }
};

function maskEmail(value) {
  const [name, domain] = String(value || '').split('@');
  if (!name || !domain) return value;
  return `${name[0]}${'•'.repeat(Math.max(3, name.length - 1))}@${domain}`;
}

function formatCooldown(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function passwordStrength(password) {
  const value = String(password || '');
  const score = [
    value.length >= 8,
    /[a-z]/u.test(value) && /[A-Z]/u.test(value),
    /\d/u.test(value),
    /[^A-Za-z0-9]/u.test(value)
  ].filter(Boolean).length;
  if (!value) return { label: 'Força da senha', tone: 'primary', value: 0 };
  return [
    { label: 'Muito fraca', tone: 'danger', value: 12 },
    { label: 'Fraca', tone: 'danger', value: 25 },
    { label: 'Razoável', tone: 'warning', value: 50 },
    { label: 'Boa', tone: 'warning', value: 75 },
    { label: 'Forte', tone: 'success', value: 100 }
  ][score];
}

export function PasswordField({
  label,
  labelAction,
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
  error,
  autoFocus,
  onBlur
}) {
  const inputId = useId();
  const [visible, setVisible] = useState(false);
  const actionLabel = visible ? 'Ocultar senha' : 'Mostrar senha';

  return (
    <div className="onframe-field">
      <div className="onframe-field-heading">
        <label className="onframe-field-label" htmlFor={inputId}>
          {label}
        </label>
        {labelAction}
      </div>
      <Input
        size="lg"
        id={inputId}
        value={value}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
        error={error}
        autoFocus={autoFocus}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        endAddon={
          <Tooltip label={actionLabel} placement="top">
            <Button
              type="button"
              kind="quiet"
              tone="neutral"
              size="sm"
              iconOnly
              aria-label={actionLabel}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setVisible((current) => !current)}
              icon={<Ph n={visible ? 'eye-slash' : 'eye'} size={18} />}
            />
          </Tooltip>
        }
      />
    </div>
  );
}

export function PasswordStrength({ password }) {
  const strength = passwordStrength(password);
  return (
    <div className="onframe-password-strength" aria-live="polite">
      <ProgressBar value={strength.value} tone={strength.tone} size="sm" />
      <span>{strength.label}</span>
    </div>
  );
}

export function AuthStep({ onBack, icon, iconTone, title, description, children, footer }) {
  return (
    <div className="onframe-auth-step">
      {onBack && (
        <div className="onframe-auth-back">
          <Button type="button" kind="quiet" size="sm" icon={<Ph n="arrow-left" size={16} />} onClick={onBack}>
            Voltar
          </Button>
        </div>
      )}
      <div className="onframe-auth-intro">
        {icon && <Ph className="onframe-auth-step-icon" n={icon} size={40} weight="light" c={iconTone} />}
        <h1 className="onframe-auth-title">{title}</h1>
        {description && <p className="onframe-auth-subtitle">{description}</p>}
      </div>
      {children}
      {footer && <div className="onframe-auth-footer">{footer}</div>}
    </div>
  );
}

export function AuthBrand() {
  return (
    <header className="onframe-auth-brand" aria-label="Onblide">
      <Logo size={28} />
    </header>
  );
}

function AuthIdentity({ email, onEdit }) {
  return (
    <div className="onframe-auth-identity">
      <span className="onframe-auth-identity-icon" aria-hidden="true">
        <Ph n="envelope-simple" size={18} />
      </span>
      <span>{email}</span>
      <Button type="button" kind="quiet" size="sm" disabled={!onEdit} onClick={onEdit}>
        Trocar
      </Button>
    </div>
  );
}

export function VerificationEmailField({ email, onEdit }) {
  return (
    <Input
      size="lg"
      label="E-mail"
      type="email"
      value={email}
      readOnly
      endAddon={
        onEdit ? (
          <Link
            href="#alterar-email"
            onClick={(event) => {
              event.preventDefault();
              onEdit();
            }}
          >
            Alterar e-mail
          </Link>
        ) : undefined
      }
    />
  );
}

export function VerificationCodeField({ label, length, value, onChange, error, status, disabled }) {
  return (
    <fieldset className="onframe-auth-code-field" disabled={disabled} aria-label={label}>
      <legend className="onframe-field-label">{label}</legend>
      <div className="onframe-auth-code-scroll">
        <CodeInput length={length} value={value} onChange={onChange} status={error ? 'error' : status || 'default'} />
      </div>
    </fieldset>
  );
}

export function VerificationFrame({ title, children, headingLevel = 2, framed = true, brand = false }) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const content = (
    <div className="onframe-auth-content">
      <Heading className="onframe-auth-title">{title}</Heading>
      {children}
    </div>
  );
  return (
    <div className="onframe-auth-panel onframe-security-verification">
      {brand && <AuthBrand />}
      {framed ? <Card padding="var(--ob-space-24)">{content}</Card> : content}
    </div>
  );
}

export function AuthPanel({ initialState, onStateChange, onConnected, onPending }) {
  const RemoteAuth = window.OnFrameRemoteAuth;
  const resumeState = normalizeAuthResumeState(initialState);
  const challengeRef = useRef(null);
  const challengeInstance = useRef(null);
  const pending = useRef(false);
  const [mode, setMode] = useState(resumeState?.mode || 'signin');
  const [phase, setPhase] = useState(resumeState?.phase || 'email');
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [fields, setFields] = useState({
    name: resumeState?.name || '',
    email: resumeState?.email || '',
    password: '',
    confirmation: ''
  });
  const [secondFactor, setSecondFactor] = useState(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [codeSuccess, setCodeSuccess] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(resumeState?.cooldownUntil || 0);
  const [cooldown, setCooldown] = useState(() =>
    Math.max(0, Math.ceil(((resumeState?.cooldownUntil || 0) - Date.now()) / 1000))
  );
  const [resending, setResending] = useState(false);
  const [automaticCodeRequest, setAutomaticCodeRequest] = useState(false);
  const [passkeyOpened, setPasskeyOpened] = useState(false);
  const [captchaMounted, setCaptchaMounted] = useState(false);
  const codeLength = secondFactor ? 6 : config?.emailOtpLength || 6;
  const needsCaptcha =
    !secondFactor &&
    (phase === 'password' || (phase === 'email' && ['signup', 'magic', 'recovery'].includes(mode)) || resending);

  useEffect(() => {
    if (needsCaptcha) setCaptchaMounted(true);
  }, [needsCaptcha]);

  useEffect(() => {
    onStateChange?.({ mode, phase, name: fields.name, email: fields.email, cooldownUntil });
  }, [cooldownUntil, fields.email, fields.name, mode, onStateChange, phase]);

  useEffect(() => {
    let active = true;
    RemoteAuth.loadConfig()
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch(() => {
        if (active) setFeedback({ tone: 'danger', message: 'Não foi possível preparar o acesso ao OnFrame.' });
      });
    return () => {
      active = false;
    };
  }, [RemoteAuth]);
  useEffect(() => {
    if (!captchaMounted || !config || !challengeRef.current) return undefined;
    challengeInstance.current = RemoteAuth.createChallenge(
      challengeRef.current,
      () => {},
      () => setFeedback({ tone: 'danger', message: 'A confirmação de segurança está indisponível. Tente novamente.' })
    );
    if (automaticCodeRequest || resending) queueMicrotask(() => void sendCode());
    return () => {
      challengeInstance.current?.destroy();
      challengeInstance.current = null;
    };
  }, [RemoteAuth, automaticCodeRequest, captchaMounted, config, resending]);
  useEffect(() => {
    if (!cooldown) {
      if (cooldownUntil) setCooldownUntil(0);
      return undefined;
    }
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown, cooldownUntil]);

  function update(name, value) {
    setFields((current) => ({ ...current, [name]: value }));
  }
  function changeMode(nextMode) {
    if (!AUTH_MODES[nextMode] || pending.current) return;
    setMode(nextMode);
    setPhase('email');
    setCode('');
    setCodeError(false);
    setCodeSuccess(false);
    setSecondFactor(null);
    setFeedback(null);
    setResending(false);
    setAutomaticCodeRequest(false);
    setPasskeyOpened(false);
    setFields((current) => ({ ...current, password: '', confirmation: '' }));
  }
  function editEmail() {
    changeMode(mode);
  }
  async function authenticate(accessToken) {
    const connection = await sendRemoteMessage('authenticate', { accessToken });
    await onConnected?.(connection);
  }
  async function acceptSession(session) {
    const client = await restoreProviderSession(config, session);
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) throw error;
    setFields((current) => ({ ...current, password: '', confirmation: '' }));
    setResending(false);
    if (data.totp.length) {
      setCode('');
      setCodeSuccess(false);
      setSecondFactor({ client, id: data.totp[0].id, factors: data.totp });
    } else await authenticate(session.access_token);
  }
  async function run(callback, fallback, verification = false) {
    if (pending.current || !config) return;
    pending.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await callback();
    } catch (error) {
      setCodeError(verification);
      setCodeSuccess(false);
      setFeedback({ tone: 'danger', message: RemoteAuth.authErrorMessage(error, fallback) });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function sendCode() {
    if (cooldown || pending.current) return;
    const email = RemoteAuth.normalizeEmail(fields.email);
    if (!email) return;
    await run(async () => {
      const token = await challengeInstance.current?.execute();
      if (!token)
        throw Object.assign(new Error('A confirmação de segurança está indisponível.'), {
          code: 'captcha_unavailable'
        });
      try {
        await RemoteAuth.request(
          config,
          'otp',
          { email, create_user: false, gotrue_meta_security: { captcha_token: token } },
          { redirectTo: 'https://onframe.onblide.com/connect?verification=login' }
        );
        update('email', email);
        setPhase('code');
        setCode('');
        setCodeError(false);
        setCodeSuccess(false);
        setResending(false);
        setAutomaticCodeRequest(false);
        setCooldown(60);
        setCooldownUntil(Date.now() + 60_000);
        setCaptchaMounted(false);
      } catch (error) {
        challengeInstance.current?.reset();
        throw error;
      }
    }, 'Não foi possível enviar o código. Aguarde e tente novamente.');
    setResending(false);
    setAutomaticCodeRequest(false);
  }
  function requestEmailCode() {
    if (pending.current) return;
    setMode('magic');
    setPhase('email');
    setFeedback(null);
    setPasskeyOpened(false);
    setAutomaticCodeRequest(true);
    setCaptchaMounted(true);
  }
  function resendCode() {
    if (pending.current || cooldown) return;
    setFeedback(null);
    setResending(true);
    setCaptchaMounted(true);
  }
  async function startPasskey() {
    await run(async () => {
      const flow = await sendRemoteMessage('auth-flow-start');
      const target = flow.passkeyUrl
        ? new URL(flow.passkeyUrl)
        : new URL('/auth/passkeys', 'https://onframe.onblide.com');
      if (!flow.passkeyUrl) {
        const flowId = new URL(flow.redirectTo).searchParams.get('flow');
        if (!flowId) throw new Error('Não foi possível iniciar a chave de acesso.');
        target.searchParams.set('flow', flowId);
      }
      openExternal(target.toString());
      setPasskeyOpened(true);
      onPending?.(flow);
    }, 'Não foi possível abrir a chave de acesso agora.');
  }
  async function verifyCode(value) {
    if (!/^\d+$/u.test(value) || value.length !== codeLength) return;
    await run(
      async () => {
        if (secondFactor) {
          const session = await verifySecondFactor(secondFactor.client, secondFactor.id, value);
          setCodeSuccess(true);
          await authenticate(session.access_token);
        } else {
          const session = await RemoteAuth.request(config, 'verify', {
            email: RemoteAuth.normalizeEmail(fields.email),
            token: value,
            type: 'email'
          });
          setCodeSuccess(true);
          await acceptSession(session);
        }
      },
      'Código incorreto ou expirado. Tente novamente ou reenvie.',
      true
    );
  }
  function changeCode(value) {
    if (pending.current) return;
    setCode(value);
    setCodeError(false);
    setCodeSuccess(false);
    setFeedback(null);
    if (/^\d+$/u.test(value) && value.length === codeLength) void verifyCode(value);
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current || !config) return;
    if (secondFactor || phase === 'code') {
      await verifyCode(code);
      return;
    }
    const email = RemoteAuth.normalizeEmail(fields.email);
    if (!email) {
      setFeedback({ tone: 'warning', message: 'Informe um e-mail válido.' });
      return;
    }
    update('email', email);
    if (phase === 'email' && mode === 'signin') {
      setFeedback(null);
      setPhase('password');
      return;
    }
    if (mode === 'magic') {
      await sendCode();
      return;
    }
    if (mode === 'signup' && !fields.name.trim()) {
      setFeedback({ tone: 'warning', message: 'Informe seu nome.' });
      return;
    }
    if (['signin', 'signup'].includes(mode) && !fields.password) {
      setFeedback({ tone: 'warning', message: 'Informe sua senha.' });
      return;
    }
    if (mode === 'signup' && fields.password !== fields.confirmation) {
      setFeedback({ tone: 'warning', message: 'As senhas não coincidem.' });
      return;
    }
    await run(
      async () => {
        const token = await challengeInstance.current?.execute();
        if (!token)
          throw Object.assign(new Error('A confirmação de segurança está indisponível.'), {
            code: 'captcha_unavailable'
          });
        try {
          if (mode === 'signin') {
            await acceptSession(
              await RemoteAuth.request(config, 'token?grant_type=password', {
                email,
                password: fields.password,
                gotrue_meta_security: { captcha_token: token }
              })
            );
            setCaptchaMounted(false);
            return;
          }
          const flow = await sendRemoteMessage('auth-flow-start');
          if (mode === 'signup') {
            const result = await RemoteAuth.request(
              config,
              'signup',
              {
                email,
                password: fields.password,
                data: { display_name: fields.name.trim() },
                gotrue_meta_security: { captcha_token: token }
              },
              { redirectTo: flow.redirectTo }
            );
            setFields((current) => ({ ...current, password: '', confirmation: '' }));
            if (result.access_token) {
              await acceptSession(result);
              setCaptchaMounted(false);
              return;
            }
            setFeedback({ tone: 'info', message: 'Confira seu e-mail para confirmar o cadastro.' });
          } else {
            await RemoteAuth.request(
              config,
              'recover',
              { email, gotrue_meta_security: { captcha_token: token } },
              { redirectTo: flow.redirectTo }
            );
            setFeedback({
              tone: 'info',
              message: 'Se houver uma conta para este e-mail, você receberá um link para redefinir a senha.'
            });
          }
          setPhase('sent');
          onPending?.(flow);
          setCaptchaMounted(false);
        } catch (error) {
          challengeInstance.current?.reset();
          throw error;
        }
      },
      mode === 'signin'
        ? 'E-mail ou senha incorretos. Tente novamente.'
        : mode === 'signup'
          ? 'Não foi possível criar a conta agora.'
          : 'Não foi possível enviar o e-mail agora.'
    );
  }
  function linkTo(nextMode) {
    return (event) => {
      event.preventDefault();
      changeMode(nextMode);
    };
  }
  function goBack() {
    if (secondFactor) {
      changeMode('signin');
      return;
    }
    if (mode === 'signin' && phase === 'password') {
      setPhase('email');
      setFeedback(null);
      setFields((current) => ({ ...current, password: '' }));
      return;
    }
    if (mode === 'magic' && phase === 'code') {
      setMode('signin');
      setPhase('password');
      setCode('');
      setCodeError(false);
      setCodeSuccess(false);
      setFeedback(null);
      return;
    }
    changeMode('signin');
  }
  const verifying = Boolean(secondFactor) || phase === 'code';
  const title = secondFactor
    ? 'Verificação em duas etapas'
    : phase === 'code'
      ? 'Confira seu e-mail'
      : phase === 'sent'
        ? mode === 'signup'
          ? 'Confirme seu e-mail'
          : 'Confira seu e-mail'
        : mode === 'signin' && phase === 'password'
          ? 'Digite sua senha'
          : AUTH_MODES[mode].title;
  const description = secondFactor
    ? 'Abra o seu aplicativo autenticador e digite o código de 6 dígitos do OnFrame.'
    : phase === 'code'
      ? `Enviamos um código de ${codeLength} dígitos para ${maskEmail(fields.email)}.`
      : phase === 'sent' && mode === 'signup'
        ? `Enviamos a confirmação para ${maskEmail(fields.email)}.`
        : phase === 'sent'
          ? `Se existir uma conta com ${maskEmail(fields.email)}, você receberá um link para criar uma senha nova.`
          : mode === 'signin' && phase === 'password'
            ? null
            : AUTH_MODES[mode].description;
  const icon = secondFactor ? 'device-mobile' : phase === 'code' || phase === 'sent' ? 'envelope-simple' : null;
  const buttonLabel = verifying
    ? 'Verificar e entrar'
    : mode === 'signup'
      ? 'Criar conta'
      : mode === 'magic'
        ? 'Enviar código'
        : mode === 'recovery'
          ? 'Enviar link de redefinição'
          : phase === 'email'
            ? 'Continuar'
            : 'Entrar';
  const canGoBack = Boolean(secondFactor) || mode !== 'signin' || phase !== 'email';
  const footer =
    mode === 'signin' && !secondFactor && phase === 'email' ? (
      <p className="onframe-muted">
        Não tem uma conta?{' '}
        <Link href="#criar-conta" onClick={linkTo('signup')}>
          Criar conta
        </Link>
      </p>
    ) : mode === 'signup' && !secondFactor ? (
      <p className="onframe-muted">
        Já tem uma conta?{' '}
        <Link href="#entrar" onClick={linkTo('signin')}>
          Entrar
        </Link>
      </p>
    ) : mode === 'recovery' && !secondFactor ? (
      <p className="onframe-muted">
        Lembrou a senha?{' '}
        <Link href="#entrar" onClick={linkTo('signin')}>
          Voltar para o login
        </Link>
      </p>
    ) : null;

  return (
    <div className="onframe-auth-panel">
      <AuthBrand />
      <AuthStep
        onBack={canGoBack ? goBack : undefined}
        icon={icon}
        iconTone="var(--ob-blue)"
        title={title}
        description={description}
        footer={footer}
      >
        <div className="onframe-auth-content">
          {phase === 'sent' ? (
            <div className="onframe-auth-sent">
              {feedback && (
                <Alert appearance="soft" tone={feedback.tone}>
                  {feedback.message}
                </Alert>
              )}
              <Button
                type="button"
                kind="secondary"
                size="lg"
                style={{ width: '100%' }}
                onClick={() => changeMode(mode)}
              >
                Usar outro e-mail
              </Button>
            </div>
          ) : (
            <form className="onframe-auth-fields" onSubmit={submit} noValidate aria-busy={busy}>
              {!verifying && phase === 'password' && (
                <AuthIdentity
                  email={fields.email}
                  onEdit={() => {
                    if (!pending.current) editEmail();
                  }}
                />
              )}
              {verifying && (
                <VerificationEmailField
                  email={fields.email}
                  onEdit={() => {
                    if (!pending.current) editEmail();
                  }}
                />
              )}
              {!verifying && mode === 'signup' && phase === 'email' && (
                <Input
                  size="lg"
                  label="Nome completo"
                  autoComplete="name"
                  value={fields.name}
                  disabled={busy}
                  onChange={(event) => update('name', event.target.value)}
                />
              )}
              {!verifying && phase === 'email' && (
                <Input
                  size="lg"
                  label="E-mail"
                  type="email"
                  inputMode="email"
                  autoComplete="username webauthn"
                  value={fields.email}
                  disabled={busy}
                  autoFocus
                  onChange={(event) => update('email', event.target.value)}
                />
              )}
              {!verifying && (phase === 'password' || (mode === 'signup' && phase === 'email')) && (
                <div className="onframe-auth-password-block">
                  <PasswordField
                    label="Senha"
                    labelAction={
                      mode === 'signin' ? (
                        <Link href="#recuperar-senha" onClick={linkTo('recovery')}>
                          Esqueci a senha
                        </Link>
                      ) : undefined
                    }
                    value={fields.password}
                    onChange={(value) => update('password', value)}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    disabled={busy}
                    autoFocus={phase === 'password'}
                  />
                  {mode === 'signup' && <PasswordStrength password={fields.password} />}
                </div>
              )}
              {!verifying && mode === 'signup' && phase === 'email' && (
                <PasswordField
                  label="Confirme sua senha"
                  value={fields.confirmation}
                  onChange={(value) => update('confirmation', value)}
                  autoComplete="new-password"
                  disabled={busy}
                />
              )}
              {verifying && (
                <>
                  {secondFactor?.factors.length > 1 && (
                    <Tabs
                      tabs={secondFactor.factors.map((factor, index) => ({
                        id: factor.id,
                        label: factor.friendly_name || `Autenticador ${index + 1}`
                      }))}
                      active={secondFactor.id}
                      onChange={(id) => {
                        setSecondFactor((current) => ({ ...current, id }));
                        setCode('');
                        setCodeError(false);
                        setCodeSuccess(false);
                      }}
                      size="sm"
                    />
                  )}
                  <VerificationCodeField
                    label={secondFactor ? 'Código do aplicativo autenticador' : 'Insira o código de verificação'}
                    length={codeLength}
                    value={code}
                    onChange={changeCode}
                    error={codeError}
                    status={codeSuccess ? 'success' : 'default'}
                    disabled={busy}
                  />
                  <div className="onframe-auth-code-status" aria-live="polite">
                    {busy && (
                      <>
                        <Spinner size="xs" />
                        <span>Verificando…</span>
                      </>
                    )}
                    {!busy && codeError && <span className="onframe-auth-code-error">{feedback?.message}</span>}
                    {!busy && codeSuccess && <span className="onframe-auth-code-success">Código confirmado.</span>}
                  </div>
                </>
              )}
              {feedback && !verifying && (
                <Alert appearance="soft" tone={feedback.tone}>
                  {feedback.message}
                </Alert>
              )}
              {captchaMounted && <div className="onframe-captcha" ref={challengeRef} />}
              {mode === 'magic' && phase === 'email' && cooldown > 0 && (
                <p className="onframe-help" role="status">
                  Enviar outro código em {cooldown} s
                </p>
              )}
              {phase !== 'sent' && (
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !config ||
                    (verifying && code.length !== codeLength) ||
                    (mode === 'magic' && phase === 'email' && cooldown > 0)
                  }
                  style={{ width: '100%' }}
                  size="lg"
                >
                  {busy ? 'Aguarde…' : buttonLabel}
                </Button>
              )}
              {mode === 'signin' && phase === 'email' && (
                <>
                  <Divider label="ou" />
                  <Button
                    type="button"
                    kind="secondary"
                    size="lg"
                    icon={<Ph n="fingerprint" size={20} />}
                    disabled={busy}
                    style={{ width: '100%' }}
                    onClick={() => void startPasskey()}
                  >
                    Entrar com chave de acesso
                  </Button>
                  {passkeyOpened && (
                    <p className="onframe-help" role="status">
                      Continue a verificação na aba que foi aberta.
                    </p>
                  )}
                </>
              )}
              {mode === 'signin' && phase === 'password' && (
                <>
                  <Divider label="ou" />
                  <Button
                    type="button"
                    kind="secondary"
                    size="lg"
                    icon={<Ph n="envelope-simple" size={20} />}
                    disabled={busy}
                    style={{ width: '100%' }}
                    onClick={requestEmailCode}
                  >
                    Receber um código por e-mail
                  </Button>
                </>
              )}
            </form>
          )}
          {!secondFactor && phase === 'code' && (
            <div className="onframe-auth-resend">
              <span>Não recebeu?</span>
              {cooldown ? (
                <span role="status">Peça de novo em {formatCooldown(cooldown)}.</span>
              ) : (
                <Link
                  href="#reenviar-codigo"
                  onClick={(event) => {
                    event.preventDefault();
                    resendCode();
                  }}
                >
                  Reenviar código
                </Link>
              )}
            </div>
          )}
        </div>
      </AuthStep>
    </div>
  );
}
