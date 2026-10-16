import React, { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Card, CodeInput, FieldShell, Input, Link, Ph, Tabs, Tooltip } from '@onblide/ui';
import { normalizeAuthResumeState } from './popup-session-state';
import { sendRemoteMessage } from './runtime';
import { restoreProviderSession, verifySecondFactor } from './provider-auth';

const AUTH_MODES = {
  signin: { title: 'Bem-vindo de volta', description: 'Entre com seu e-mail e senha para continuar.' },
  signup: { title: 'Criar conta', description: 'Escolha um e-mail e uma senha para começar.' },
  magic: { title: 'Acesse o OnFrame', description: 'Enviaremos um código de acesso para o seu e-mail.' },
  recovery: { title: 'Redefinir senha', description: 'Informe seu e-mail para receber o link de redefinição.' }
};

export function PasswordField({ label, labelAction, value, onChange, autoComplete, placeholder, disabled }) {
  const inputId = useId();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const actionLabel = visible ? 'Ocultar senha' : 'Mostrar senha';

  return (
    <div className="onframe-field">
      <div className="onframe-field-heading">
        <label className="onframe-field-label" htmlFor={inputId}>{label}</label>
        {labelAction}
      </div>
      <FieldShell focused={focused} disabled={disabled}>
        <input
          id={inputId}
          value={value}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="onframe-field-input"
        />
        <Tooltip label={actionLabel} placement="top">
          <Button
            kind="quiet"
            tone="neutral"
            size="sm"
            iconOnly
            aria-label={actionLabel}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setVisible((current) => !current)}
            icon={<Ph n={visible ? 'eye' : 'eye-closed'} size={17} />}
          />
        </Tooltip>
      </FieldShell>
    </div>
  );
}

export function AuthBrand({ src = '../../assets/onframe-stacked-primary.png' }) {
  return <header className="onframe-auth-brand">
    <img className="onframe-auth-logo" src={src} alt="OnFrame" width={192} height={96} />
  </header>;
}

export function VerificationEmailField({ email, onEdit }) {
  const inputId = useId();
  return <div className="onframe-field">
    <label className="onframe-field-label" htmlFor={inputId}>E-mail</label>
    <FieldShell disabled>
      <input id={inputId} className="onframe-field-input" type="email" value={email} disabled />
      {onEdit && <span className="onframe-field-action"><Link href="#alterar-email" onClick={(event) => { event.preventDefault(); onEdit(); }}>Alterar e-mail</Link></span>}
    </FieldShell>
  </div>;
}

export function VerificationCodeField({ label, length, value, onChange, error, disabled }) {
  return <fieldset className="onframe-auth-code-field" disabled={disabled} aria-label={label}>
    <legend className="onframe-field-label">{label}</legend>
    <div className="onframe-auth-code-scroll"><CodeInput length={length} value={value} onChange={onChange} status={error ? 'error' : 'default'} /></div>
  </fieldset>;
}

export function VerificationFrame({ title, children, headingLevel = 2 }) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return <div className="onframe-auth-panel onframe-security-verification">
    <Card padding={24}><div className="onframe-auth-content">
      <Heading className="onframe-auth-title">{title}</Heading>
      {children}
    </div></Card>
  </div>;
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
  const [fields, setFields] = useState({ name: resumeState?.name || '', email: resumeState?.email || '', password: '', confirmation: '' });
  const [secondFactor, setSecondFactor] = useState(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(resumeState?.cooldownUntil || 0);
  const [cooldown, setCooldown] = useState(() => Math.max(0, Math.ceil(((resumeState?.cooldownUntil || 0) - Date.now()) / 1000)));
  const [resending, setResending] = useState(false);
  const [captchaMounted, setCaptchaMounted] = useState(false);
  const codeLength = secondFactor ? 6 : config?.emailOtpLength || 6;
  const needsCaptcha = !secondFactor && (phase === 'password' || (phase === 'email' && ['signup', 'magic', 'recovery'].includes(mode)) || resending);

  useEffect(() => { if (needsCaptcha) setCaptchaMounted(true); }, [needsCaptcha]);

  useEffect(() => {
    onStateChange?.({ mode, phase, name: fields.name, email: fields.email, cooldownUntil });
  }, [cooldownUntil, fields.email, fields.name, mode, onStateChange, phase]);

  useEffect(() => {
    let active = true;
    RemoteAuth.loadConfig().then((value) => { if (active) setConfig(value); })
      .catch(() => { if (active) setFeedback({ tone: 'danger', message: 'Não foi possível preparar o acesso ao OnFrame.' }); });
    return () => { active = false; };
  }, [RemoteAuth]);
  useEffect(() => {
    if (!captchaMounted || !config || !challengeRef.current) return undefined;
    challengeInstance.current = RemoteAuth.createChallenge(challengeRef.current, () => {},
      () => setFeedback({ tone: 'danger', message: 'A confirmação de segurança está indisponível. Tente novamente.' }));
    return () => { challengeInstance.current?.destroy(); challengeInstance.current = null; };
  }, [RemoteAuth, config, captchaMounted]);
  useEffect(() => {
    if (!cooldown) {
      if (cooldownUntil) setCooldownUntil(0);
      return undefined;
    }
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown, cooldownUntil]);

  function update(name, value) { setFields((current) => ({ ...current, [name]: value })); }
  function changeMode(nextMode) {
    if (!AUTH_MODES[nextMode] || pending.current) return;
    setMode(nextMode); setPhase('email'); setCode(''); setCodeError(false);
    setSecondFactor(null); setFeedback(null); setResending(false);
    setFields((current) => ({ ...current, password: '', confirmation: '' }));
  }
  function editEmail() { changeMode(mode); }
  async function authenticate(accessToken) {
    const connection = await sendRemoteMessage('authenticate', { accessToken });
    await onConnected?.(connection);
  }
  async function acceptSession(session) {
    const client = await restoreProviderSession(config, session);
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) throw error;
    setFields((current) => ({ ...current, password: '', confirmation: '' }));
    setCode(''); setResending(false);
    if (data.totp.length) setSecondFactor({ client, id: data.totp[0].id, factors: data.totp });
    else await authenticate(session.access_token);
  }
  async function run(callback, fallback, verification = false) {
    if (pending.current || !config) return;
    pending.current = true; setBusy(true); setFeedback(null);
    try { await callback(); }
    catch (error) {
      setCodeError(verification);
      setFeedback({ tone: 'danger', message: RemoteAuth.authErrorMessage(error, fallback) });
    } finally { pending.current = false; setBusy(false); }
  }
  async function sendCode() {
    if (cooldown || pending.current) return;
    const email = RemoteAuth.normalizeEmail(fields.email);
    if (!email) return;
    await run(async () => {
      const token = await challengeInstance.current?.execute();
      if (!token) throw Object.assign(new Error('A confirmação de segurança está indisponível.'), { code: 'captcha_unavailable' });
      try {
        await RemoteAuth.request(config, 'otp', { email, create_user: false, gotrue_meta_security: { captcha_token: token } },
          { redirectTo: 'https://onframe.onblide.com/connect?verification=login' });
        update('email', email);
        setPhase('code'); setCode(''); setCodeError(false); setResending(false);
        setCooldown(60); setCooldownUntil(Date.now() + 60_000);
        setCaptchaMounted(false);
      } catch (error) { challengeInstance.current?.reset(); throw error; }
    }, 'Não foi possível enviar o código. Aguarde e tente novamente.');
  }
  async function verifyCode(value) {
    if (!/^\d+$/u.test(value) || value.length !== codeLength) return;
    await run(async () => {
      if (secondFactor) {
        await authenticate((await verifySecondFactor(secondFactor.client, secondFactor.id, value)).access_token);
      } else {
        const session = await RemoteAuth.request(config, 'verify', { email: RemoteAuth.normalizeEmail(fields.email), token: value, type: 'email' });
        await acceptSession(session);
      }
    }, 'Código incorreto ou expirado. Tente novamente ou reenvie.', true);
  }
  function changeCode(value) {
    if (pending.current) return;
    setCode(value); setCodeError(false); setFeedback(null);
    if (/^\d+$/u.test(value) && value.length === codeLength) void verifyCode(value);
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current || !config) return;
    if (secondFactor || phase === 'code') { await verifyCode(code); return; }
    const email = RemoteAuth.normalizeEmail(fields.email);
    if (!email) { setFeedback({ tone: 'warning', message: 'Informe um e-mail válido.' }); return; }
    if (phase === 'email' && mode === 'signin') {
      update('email', email); setFeedback(null); setPhase('password'); return;
    }
    if (mode === 'magic') { await sendCode(); return; }
    if (mode === 'signup' && !fields.name.trim()) { setFeedback({ tone: 'warning', message: 'Informe seu nome.' }); return; }
    if (['signin', 'signup'].includes(mode) && !fields.password) { setFeedback({ tone: 'warning', message: 'Informe sua senha.' }); return; }
    if (mode === 'signup' && fields.password !== fields.confirmation) { setFeedback({ tone: 'warning', message: 'As senhas não coincidem.' }); return; }
    await run(async () => {
      const token = await challengeInstance.current?.execute();
      if (!token) throw Object.assign(new Error('A confirmação de segurança está indisponível.'), { code: 'captcha_unavailable' });
      try {
        if (mode === 'signin') {
          await acceptSession(await RemoteAuth.request(config, 'token?grant_type=password', { email, password: fields.password, gotrue_meta_security: { captcha_token: token } }));
          setCaptchaMounted(false);
          return;
        }
        const flow = await sendRemoteMessage('auth-flow-start');
        if (mode === 'signup') {
          const result = await RemoteAuth.request(config, 'signup', { email, password: fields.password, data: { display_name: fields.name.trim() }, gotrue_meta_security: { captcha_token: token } }, { redirectTo: flow.redirectTo });
          setFields((current) => ({ ...current, password: '', confirmation: '' }));
          if (result.access_token) { await acceptSession(result); setCaptchaMounted(false); return; }
          setFeedback({ tone: 'info', message: 'Confira seu e-mail para confirmar o cadastro.' });
        } else {
          await RemoteAuth.request(config, 'recover', { email, gotrue_meta_security: { captcha_token: token } }, { redirectTo: flow.redirectTo });
          setFeedback({ tone: 'info', message: 'Se houver uma conta para este e-mail, você receberá um link para redefinir a senha.' });
        }
        setPhase('sent'); onPending?.(flow);
        setCaptchaMounted(false);
      } catch (error) { challengeInstance.current?.reset(); throw error; }
    }, mode === 'signin' ? 'E-mail ou senha incorretos. Tente novamente.' : mode === 'signup' ? 'Não foi possível criar a conta agora.' : 'Não foi possível enviar o e-mail agora.');
  }
  function linkTo(nextMode) { return (event) => { event.preventDefault(); changeMode(nextMode); }; }
  const verifying = Boolean(secondFactor) || phase === 'code';
  const title = secondFactor ? 'Verificação em duas etapas' : phase === 'code' ? 'Verifique seu e-mail' : phase === 'sent' ? 'Confira seu e-mail' : AUTH_MODES[mode].title;
  const description = !secondFactor && !['code', 'sent'].includes(phase) ? AUTH_MODES[mode].description : null;
  const buttonLabel = verifying ? 'Verificar e entrar' : mode === 'signup' ? 'Criar conta' : mode === 'magic' ? 'Enviar código' : mode === 'recovery' ? 'Enviar link de redefinição' : phase === 'email' ? 'Continuar' : 'Entrar';

  return <div className="onframe-auth-panel">
    <AuthBrand />
    <Card padding={32}>
      <div className="onframe-auth-content">
        {!secondFactor && ['signin', 'magic'].includes(mode) && phase !== 'sent' && <nav className="onframe-auth-methods" aria-label="Método de acesso">
          <Tabs variant="pill" size="md" active={mode} onChange={changeMode} tabs={[
            { id: 'signin', label: 'E-mail e senha', disabled: busy },
            { id: 'magic', label: 'Magic Link', disabled: busy }
          ]} />
        </nav>}
        <div className="onframe-auth-intro">
          <h1 className="onframe-auth-title">{title}</h1>
          {description && <p className="onframe-auth-subtitle">{description}</p>}
        </div>
        <form className="onframe-auth-fields" onSubmit={submit} noValidate aria-busy={busy}>
          {phase !== 'email' && <VerificationEmailField email={fields.email} onEdit={() => { if (!pending.current) editEmail(); }} />}
          {!verifying && phase === 'email' && <Input label="E-mail" type="email" inputMode="email" autoComplete="username" value={fields.email} disabled={busy} onChange={(event) => update('email', event.target.value)} />}
          {!verifying && mode === 'signup' && phase === 'email' && <Input label="Nome" autoComplete="name" value={fields.name} disabled={busy} onChange={(event) => update('name', event.target.value)} />}
          {!verifying && (phase === 'password' || (mode === 'signup' && phase === 'email')) && <PasswordField label="Senha" labelAction={mode === 'signin' ? <Link href="#recuperar-senha" onClick={linkTo('recovery')}>Esqueci minha senha</Link> : undefined} value={fields.password} onChange={(value) => update('password', value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} disabled={busy} />}
          {!verifying && mode === 'signup' && phase === 'email' && <PasswordField label="Confirme a senha" value={fields.confirmation} onChange={(value) => update('confirmation', value)} autoComplete="new-password" disabled={busy} />}
          {verifying && <>
            {secondFactor?.factors.length > 1 && <Tabs tabs={secondFactor.factors.map((factor, index) => ({ id: factor.id, label: factor.friendly_name || `Autenticador ${index + 1}` }))} active={secondFactor.id} onChange={(id) => { setSecondFactor((current) => ({ ...current, id })); setCode(''); setCodeError(false); }} size="sm" />}
            <VerificationCodeField label={secondFactor ? 'Código do aplicativo autenticador' : 'Insira o código de verificação'} length={codeLength} value={code} onChange={changeCode} error={codeError} disabled={busy} />
            {!secondFactor && <p className="onframe-help">Se houver uma conta para este e-mail, você receberá um código de {codeLength} dígitos.</p>}
          </>}
          {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}
          {captchaMounted && <div className="onframe-captcha" ref={challengeRef} />}
          {mode === 'magic' && phase === 'email' && cooldown > 0 && <p className="onframe-help" role="status">Enviar outro código em {cooldown} s</p>}
          {phase !== 'sent' && <Button type="submit" disabled={busy || !config || (verifying && code.length !== codeLength) || (mode === 'magic' && phase === 'email' && cooldown > 0)} style={{ width: '100%' }}>{busy ? 'Aguarde...' : buttonLabel}</Button>}
        </form>
        {!secondFactor && phase === 'code' && <div className="onframe-auth-footer">
          {cooldown ? <p className="onframe-help" role="status">Reenviar código em {cooldown} s</p> : <Link href="#reenviar-codigo" onClick={(event) => { event.preventDefault(); if (pending.current) return; if (!resending) setResending(true); else void sendCode(); }}>{resending ? 'Enviar novo código' : 'Reenviar código'}</Link>}
        </div>}
        {mode === 'signin' && !secondFactor && phase !== 'sent' && <div className="onframe-auth-footer">
          <p className="onframe-muted">Não tem uma conta? <Link href="#criar-conta" onClick={linkTo('signup')}>Criar conta</Link></p>
        </div>}
        {mode === 'signup' && !secondFactor && <div className="onframe-auth-footer"><p className="onframe-muted">Já tem uma conta? <Link href="#entrar" onClick={linkTo('signin')}>Entrar</Link></p></div>}
        {mode === 'recovery' && !secondFactor && <div className="onframe-auth-footer"><Link href="#entrar" onClick={linkTo('signin')}>Voltar para o login</Link></div>}
        {secondFactor && <div className="onframe-auth-footer"><Link href="#entrar" onClick={linkTo('signin')}>Voltar para entrar</Link></div>}
      </div>
    </Card>
  </div>;
}
