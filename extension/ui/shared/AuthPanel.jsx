import React, { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Card, CodeInput, FieldShell, Input, Link, Ph, Tabs, Tooltip } from '@onblide/ui';
import { sendRemoteMessage } from './runtime';
import { restoreProviderSession, verifySecondFactor } from './provider-auth';

const AUTH_MODES = {
  signin: { title: 'Bem-vindo de volta' },
  signup: { title: 'Crie sua conta no OnFrame' },
  magic: { title: 'Acesse o OnFrame' },
  recovery: { title: 'Recupere seu acesso' }
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
            kind="ghost"
            size="sm"
            aria-label={actionLabel}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setVisible((current) => !current)}
            style={{ minWidth: 32, padding: 6 }}
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
    <p className="onframe-help">by onblide</p>
  </header>;
}

export function VerificationEmailField({ email, onEdit }) {
  return <Input label="E-mail" type="email" value={email} disabled hint={onEdit ? <Link href="#alterar-email" onClick={(event) => { event.preventDefault(); onEdit(); }}>Alterar e-mail</Link> : undefined} />;
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

export function AuthPanel({ onConnected, onPending }) {
  const RemoteAuth = window.OnFrameRemoteAuth;
  const challengeRef = useRef(null);
  const challengeInstance = useRef(null);
  const pending = useRef(false);
  const [mode, setMode] = useState('signin');
  const [phase, setPhase] = useState('email');
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [fields, setFields] = useState({ name: '', email: '', password: '', confirmation: '' });
  const [secondFactor, setSecondFactor] = useState(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [captchaMounted, setCaptchaMounted] = useState(false);
  const codeLength = secondFactor ? 6 : config?.emailOtpLength || 6;
  const needsCaptcha = !secondFactor && (phase === 'password' || phase === 'details' || (phase === 'email' && ['magic', 'recovery'].includes(mode)) || resending);

  useEffect(() => { if (needsCaptcha) setCaptchaMounted(true); }, [needsCaptcha]);

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
    if (!cooldown) return undefined;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

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
        setPhase('code'); setCode(''); setCodeError(false); setResending(false); setCooldown(60);
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
    if (phase === 'email' && ['signin', 'signup'].includes(mode)) {
      update('email', email); setFeedback(null); setPhase(mode === 'signin' ? 'password' : 'details'); return;
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
  const showPasswordEmail = mode === 'signin' && phase === 'password' && !verifying;
  const title = secondFactor ? 'Verificação em duas etapas' : phase === 'code' ? 'Verifique seu e-mail' : phase === 'sent' ? 'Confira seu e-mail' : AUTH_MODES[mode].title;
  const buttonLabel = phase === 'email' ? mode === 'magic' ? 'Enviar código' : mode === 'recovery' ? 'Enviar link de recuperação' : 'Continuar' : mode === 'signup' ? 'Criar conta' : verifying ? 'Verificar e entrar' : 'Entrar';

  return <div className="onframe-auth-panel">
    <AuthBrand />
    <Card padding={24}>
      <div className="onframe-auth-content">
        <h1 className="onframe-auth-title">{title}</h1>
        {!secondFactor && ['signin', 'magic'].includes(mode) && phase !== 'sent' && <nav className="onframe-auth-methods" aria-label="Método de acesso">
          <Tabs variant="pill" size="sm" active={mode} onChange={changeMode} tabs={[
            { id: 'signin', label: 'Email e senha', disabled: busy },
            { id: 'magic', label: 'Magic Link', disabled: busy }
          ]} />
        </nav>}
        <form className="onframe-auth-fields" onSubmit={submit} noValidate aria-busy={busy}>
          {verifying && <VerificationEmailField email={fields.email} onEdit={() => { if (!pending.current) editEmail(); }} />}
          {phase !== 'email' && !showPasswordEmail && !verifying && <div className="onframe-auth-identity"><p className="onframe-muted">{fields.email}</p><Link href="#alterar-email" onClick={(event) => { event.preventDefault(); if (!pending.current) editEmail(); }}>Alterar e-mail</Link></div>}
          {!verifying && (phase === 'email' || showPasswordEmail) && <Input label="E-mail" type="email" inputMode="email" autoComplete="username" value={fields.email} disabled={busy || showPasswordEmail} onChange={(event) => update('email', event.target.value)} hint={showPasswordEmail ? <Link href="#alterar-email" onClick={linkTo(mode)}>Alterar e-mail</Link> : undefined} />}
          {!verifying && phase === 'details' && <Input label="Nome" autoComplete="name" value={fields.name} disabled={busy} onChange={(event) => update('name', event.target.value)} />}
          {!verifying && ['password', 'details'].includes(phase) && <PasswordField label="Senha" labelAction={mode === 'signin' ? <Link href="#recuperar-senha" onClick={linkTo('recovery')}>Esqueci minha senha</Link> : undefined} value={fields.password} onChange={(value) => update('password', value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} disabled={busy} />}
          {!verifying && phase === 'details' && <PasswordField label="Confirme a senha" value={fields.confirmation} onChange={(value) => update('confirmation', value)} autoComplete="new-password" disabled={busy} />}
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
        {(secondFactor || ['signup', 'recovery'].includes(mode)) && <div className="onframe-auth-footer"><Link href="#entrar" onClick={linkTo('signin')}>Voltar para entrar</Link></div>}
      </div>
    </Card>
  </div>;
}
