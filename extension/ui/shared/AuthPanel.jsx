import { useEffect, useRef, useState } from 'react';
import { Alert, Button, FieldShell, Input, Ph, Tabs, Tooltip } from '@onblide/ui';
import { sendRemoteMessage } from './runtime';

const AUTH_MODES = {
  signin: { label: 'Entrar' },
  signup: { label: 'Criar conta' },
  magic: { label: 'Link mágico' },
  recovery: { label: 'Recuperar acesso' }
};

export function PasswordField({ label, value, onChange, autoComplete, placeholder, disabled }) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const actionLabel = visible ? 'Ocultar senha' : 'Mostrar senha';

  return (
    <label className="onframe-field">
      <span className="onframe-field-label">{label}</span>
      <FieldShell focused={focused} disabled={disabled}>
        <input
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
    </label>
  );
}

export function AuthPanel({ onConnected, onPending }) {
  const RemoteAuth = window.OnFrameRemoteAuth;
  const challengeRef = useRef(null);
  const challengeInstance = useRef(null);
  const [mode, setMode] = useState('signin');
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [captcha, setCaptcha] = useState('');
  const [fields, setFields] = useState({ name: '', email: '', password: '', confirmation: '' });

  useEffect(() => {
    let active = true;
    RemoteAuth.loadConfig()
      .then((value) => { if (active) setConfig(value); })
      .catch(() => { if (active) setFeedback({ tone: 'danger', message: 'Não foi possível preparar o acesso ao OnFrame.' }); });
    return () => { active = false; };
  }, [RemoteAuth]);

  useEffect(() => {
    if (!challengeRef.current || !config) return undefined;
    challengeInstance.current?.destroy();
    challengeInstance.current = RemoteAuth.createChallenge(
      challengeRef.current,
      (token) => {
        setCaptcha(token);
        if (token) setFeedback(null);
      },
      () => setFeedback({ tone: 'danger', message: 'A confirmação de segurança está indisponível. Atualize a página e tente novamente.' })
    );
    return () => challengeInstance.current?.destroy();
  }, [RemoteAuth, config, mode]);

  function update(name, value) {
    setFields((current) => ({ ...current, [name]: value }));
  }

  function changeMode(nextMode) {
    if (!AUTH_MODES[nextMode] || busy) return;
    setMode(nextMode);
    setFeedback(null);
    setCaptcha('');
  }

  function requireCaptcha() {
    const instance = challengeInstance.current;
    if (instance?.isLoading()) {
      setFeedback({ tone: 'warning', message: 'A confirmação de segurança ainda está sendo carregada. Aguarde um instante.' });
      return false;
    }
    if (!instance?.isAvailable()) {
      setFeedback({ tone: 'danger', message: 'A confirmação de segurança está indisponível. Atualize a página e tente novamente.' });
      return false;
    }
    if (!captcha) {
      setFeedback({ tone: 'warning', message: 'Conclua a confirmação de segurança para continuar.' });
      return false;
    }
    return true;
  }

  async function authenticate(accessToken) {
    const connection = await sendRemoteMessage('authenticate', { accessToken });
    await onConnected?.(connection);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || !config) return;
    const email = RemoteAuth.normalizeEmail(fields.email);
    if (mode === 'signup' && !fields.name.trim()) {
      setFeedback({ tone: 'warning', message: 'Informe seu nome para criar a conta.' });
      return;
    }
    if (!email) {
      setFeedback({ tone: 'warning', message: 'Informe um e-mail válido.' });
      return;
    }
    if (['signin', 'signup'].includes(mode) && !fields.password) {
      setFeedback({ tone: 'warning', message: mode === 'signup' ? 'Crie uma senha para continuar.' : 'Informe sua senha.' });
      return;
    }
    if (mode === 'signup' && fields.password !== fields.confirmation) {
      setFeedback({ tone: 'warning', message: 'As senhas não coincidem.' });
      return;
    }
    if (!requireCaptcha()) return;

    setBusy(true);
    setFeedback(null);
    try {
      if (mode === 'signin') {
        const session = await RemoteAuth.request(config, 'token?grant_type=password', {
          email,
          password: fields.password,
          gotrue_meta_security: { captcha_token: captcha }
        });
        await authenticate(session.access_token);
        return;
      }

      const flow = await sendRemoteMessage('auth-flow-start');
      if (mode === 'signup') {
        const result = await RemoteAuth.request(config, 'signup', {
          email,
          password: fields.password,
          data: { display_name: fields.name.trim() },
          gotrue_meta_security: { captcha_token: captcha }
        }, { redirectTo: flow.redirectTo });
        if (result.access_token) {
          await authenticate(result.access_token);
          return;
        }
        setFeedback({ tone: 'info', message: 'Confira seu e-mail para confirmar a conta. Depois, volte a esta extensão.' });
        onPending?.(flow);
        return;
      }

      if (mode === 'magic') {
        await RemoteAuth.request(config, 'otp', {
          email,
          create_user: false,
          gotrue_meta_security: { captcha_token: captcha }
        }, { redirectTo: flow.redirectTo });
        setFeedback({ tone: 'info', message: 'Se existir uma conta para este e-mail, enviamos um link de acesso. Depois, volte a esta extensão.' });
        onPending?.(flow);
        return;
      }

      await RemoteAuth.request(config, 'recover', {
        email,
        gotrue_meta_security: { captcha_token: captcha }
      }, { redirectTo: flow.redirectTo });
      setFeedback({ tone: 'info', message: 'Se existir uma conta para este e-mail, enviamos um link para atualizar sua senha. Depois, volte a esta extensão.' });
      onPending?.(flow);
    } catch (error) {
      const fallback = mode === 'signin'
        ? 'E-mail ou senha incorretos. Tente novamente.'
        : mode === 'signup'
          ? 'Não foi possível criar a conta agora. Tente novamente.'
          : 'Não foi possível enviar o e-mail agora. Tente novamente.';
      setFeedback({ tone: 'danger', message: RemoteAuth.authErrorMessage(error, fallback) });
    } finally {
      challengeInstance.current?.reset();
      setCaptcha('');
      setBusy(false);
    }
  }

  const authenticationTabs = [
    { id: 'signin', label: 'Entrar' },
    { id: 'signup', label: 'Criar conta' }
  ];
  const isPasswordFlow = mode === 'signin' || mode === 'signup';

  return (
    <div className="onframe-auth-panel">
      {isPasswordFlow ? (
        <Tabs tabs={authenticationTabs} active={mode} onChange={changeMode} variant="pill" size="sm" />
      ) : (
        <Button kind="ghost" size="sm" onClick={() => changeMode('signin')} icon={<Ph n="arrow-left" size={16} />}>Voltar para entrar</Button>
      )}

      <form className="onframe-auth-fields" onSubmit={submit} noValidate>
        {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}

        {mode === 'signup' && (
          <Input label="Nome" value={fields.name} autoComplete="name" placeholder="Seu nome" disabled={busy} onChange={(event) => update('name', event.target.value)} />
        )}
        <Input label="E-mail" value={fields.email} type="email" inputMode="email" autoComplete={mode === 'signin' ? 'username' : 'email'} placeholder="voce@empresa.com" disabled={busy} onChange={(event) => update('email', event.target.value)} />
        {isPasswordFlow && (
          <PasswordField label={mode === 'signup' ? 'Crie uma senha' : 'Senha'} value={fields.password} onChange={(value) => update('password', value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? 'Crie uma senha' : 'Sua senha'} disabled={busy} />
        )}
        {mode === 'signup' && (
          <PasswordField label="Confirme sua senha" value={fields.confirmation} onChange={(value) => update('confirmation', value)} autoComplete="new-password" placeholder="Repita a senha" disabled={busy} />
        )}
        {mode === 'magic' && <p className="onframe-help">Enviaremos um link de uso único. Ele não cria uma conta.</p>}
        {mode === 'recovery' && <p className="onframe-help">Enviaremos um link para criar uma nova senha.</p>}

        <div className="onframe-captcha" ref={challengeRef} />
        <Button type="submit" disabled={busy || !config} style={{ width: '100%' }}>
          {busy ? 'Aguarde...' : AUTH_MODES[mode].label === 'Entrar' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : mode === 'magic' ? 'Enviar link mágico' : 'Enviar link de recuperação'}
        </Button>

        {mode === 'signin' && (
          <div className="onframe-auth-links">
            <Button kind="ghost" size="sm" disabled={busy} onClick={() => changeMode('magic')}>Entrar com link mágico</Button>
            <Button kind="ghost" size="sm" disabled={busy} onClick={() => changeMode('recovery')}>Esqueci minha senha</Button>
          </div>
        )}
      </form>
    </div>
  );
}
