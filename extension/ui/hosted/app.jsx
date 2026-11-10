import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import '@onblide/ui/styles.css';
import { Alert, Button, Input, Logo, Ph, ProgressBar, Spinner } from '@onblide/ui';
import { ThemeCycleButton } from '../shared/ThemeControl';
import { passwordMeetsRequirements, passwordRequirementState } from '../shared/password-policy';
import { clearConnectionFragment, readConnectionContext, secondFactorUrl } from './connection-flow';
import './app.css';

function pageConfig(root) {
  try {
    return JSON.parse(root?.dataset.pageConfig || '');
  } catch {
    return null;
  }
}

function HostedLayout({ children }) {
  return (
    <div className="onframe-hosted-page">
      <header className="onframe-hosted-header">
        <a className="onframe-hosted-brand" href="/connect" aria-label="Onblide">
          <Logo size={24} />
        </a>
        <ThemeCycleButton />
      </header>
      <main className="onframe-hosted-main">{children}</main>
      <footer className="onframe-hosted-footer">ONBLIDE · ONFRAME</footer>
    </div>
  );
}

function passwordStrength(password) {
  const value = String(password || '');
  const score = passwordRequirementState(value).filter((requirement) => requirement.complete).length;
  if (!value) return { label: 'Força da senha', tone: 'primary', value: 0 };
  return [
    { label: 'Muito fraca', tone: 'danger', value: 12 },
    { label: 'Fraca', tone: 'danger', value: 25 },
    { label: 'Razoável', tone: 'warning', value: 50 },
    { label: 'Boa', tone: 'warning', value: 75 },
    { label: 'Forte', tone: 'success', value: 100 }
  ][score];
}

function HostedPasswordField({ label, value, onChange, error, disabled, autoFocus }) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      size="lg"
      label={label}
      type={visible ? 'text' : 'password'}
      autoComplete="new-password"
      value={value}
      error={error}
      disabled={disabled}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      endAddon={
        <Button
          type="button"
          kind="quiet"
          tone="neutral"
          size="sm"
          iconOnly
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          onClick={() => setVisible((current) => !current)}
          icon={<Ph n={visible ? 'eye-slash' : 'eye'} size={18} />}
        />
      }
    />
  );
}

function HostedSurface({ eyebrow, title, description, icon, iconTone = 'var(--ob-blue)', children }) {
  return (
    <section className="onframe-hosted-surface" aria-live="polite">
      <div className="onframe-hosted-stack">
        <div className="onframe-hosted-intro">
          {icon && <Ph className="onframe-hosted-icon" n={icon} size={40} weight="light" c={iconTone} />}
          {eyebrow && <p className="onframe-hosted-eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function ConnectionPage({ config }) {
  const context = useMemo(() => readConnectionContext(location.href), []);
  const recovery = context.type === 'recovery';
  const [phase, setPhase] = useState(recovery ? 'recovery' : 'loading');
  const [notice, setNotice] = useState(
    !context.flow || !context.accessToken
      ? { tone: 'danger', message: 'Abra a extensão OnFrame para iniciar o acesso.' }
      : null
  );
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmationError, setConfirmationError] = useState('');
  const [busy, setBusy] = useState(false);

  async function synchronize() {
    const response = await fetch(`/v1/identity/synchronize?flow=${encodeURIComponent(context.flow)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${context.accessToken}` }
    });
    if (!response.ok) throw new Error('identity');
  }

  useEffect(() => {
    if (!context.flow || !context.accessToken) {
      setPhase('done');
      return;
    }
    if (recovery) {
      document.title = 'Redefinir senha - OnFrame';
      clearConnectionFragment();
      return;
    }
    if (context.type === 'email_change') {
      clearConnectionFragment();
      void synchronize()
        .then(() => setNotice({ tone: 'success', message: 'E-mail confirmado. Volte à extensão e entre novamente.' }))
        .catch(() =>
          setNotice({
            tone: 'danger',
            message: 'Não foi possível verificar a alteração. Volte à extensão e entre novamente.'
          })
        )
        .finally(() => setPhase('done'));
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`/v1/extension-auth-flows/${encodeURIComponent(context.flow)}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${context.accessToken}` }
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          if (error.error === 'mfa_required' && context.refreshToken) {
            location.replace(secondFactorUrl(location.origin, context));
            return;
          }
          throw new Error('flow');
        }
        clearConnectionFragment();
        setNotice({ tone: 'success', message: 'Acesso confirmado. Volte à extensão para continuar.' });
      } catch {
        setNotice({
          tone: 'danger',
          message: 'Não foi possível concluir o acesso. Solicite um novo link pela extensão.'
        });
      } finally {
        setPhase('done');
      }
    })();
  }, []);

  async function resetPassword(event) {
    event.preventDefault();
    setPasswordError('');
    setConfirmationError('');
    setNotice(null);
    if (!password) {
      setPasswordError('Crie uma nova senha.');
      return;
    }
    if (!passwordMeetsRequirements(password)) {
      setPasswordError('Sua senha ainda não atende a todos os requisitos.');
      return;
    }
    if (password !== confirmation) {
      setConfirmationError('As senhas não coincidem.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: config.supabasePublishableKey,
          authorization: `Bearer ${context.accessToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ password })
      });
      if (!response.ok) throw new Error('reset');
      setPassword('');
      setConfirmation('');
      setPhase('done');
      try {
        await synchronize();
      } catch {
        /* O acesso antigo será recusado na próxima requisição autenticada. */
      }
      setNotice({ tone: 'success', message: 'Senha atualizada. Volte à extensão e entre novamente.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível atualizar a senha. Solicite um novo link.' });
    } finally {
      setBusy(false);
    }
  }

  const eyebrow = recovery ? 'Recuperação de acesso' : config.eyebrow;
  const title = recovery ? 'Crie uma senha nova' : config.heading;
  const description = recovery ? 'Escolha uma senha nova para continuar usando sua conta.' : config.description;
  const strength = passwordStrength(password);
  const passwordRequirements = passwordRequirementState(password);

  return (
    <HostedSurface eyebrow={eyebrow} title={title} description={description}>
      {phase === 'loading' && !notice && (
        <div className="onframe-hosted-loading" aria-live="polite">
          <Spinner size="sm" label="Concluindo o acesso" />
          <span>Concluindo o acesso.</span>
        </div>
      )}
      {phase === 'recovery' && (
        <form className="onframe-hosted-form" onSubmit={resetPassword} aria-busy={busy}>
          <HostedPasswordField
            label="Senha nova"
            value={password}
            error={passwordError}
            disabled={busy}
            autoFocus
            onChange={(value) => {
              setPassword(value);
              setPasswordError('');
            }}
          />
          <div className="onframe-hosted-password-strength" aria-live="polite">
            <ProgressBar value={strength.value} tone={strength.tone} size="sm" />
            <span>{strength.label}</span>
          </div>
          <ul className="onframe-hosted-password-rules">
            {passwordRequirements.map(({ label, complete }) => (
              <li key={label} className={complete ? 'onframe-hosted-password-rule--complete' : undefined}>
                <Ph
                  n={complete ? 'check-circle' : 'circle'}
                  weight={complete ? 'fill' : 'regular'}
                  size={16}
                  c={complete ? 'var(--ob-green)' : 'var(--ob-fg-mute)'}
                />
                {label}
              </li>
            ))}
          </ul>
          <HostedPasswordField
            label="Confirme a senha nova"
            value={confirmation}
            error={confirmationError}
            disabled={busy}
            onChange={(value) => {
              setConfirmation(value);
              setConfirmationError('');
            }}
          />
          <Button
            type="submit"
            disabled={busy}
            size="lg"
            icon={busy ? <Spinner size="xs" label="Atualizando senha" /> : undefined}
          >
            Salvar senha nova
          </Button>
        </form>
      )}
      {notice && (
        <Alert appearance="soft" tone={notice.tone}>
          {notice.message}
        </Alert>
      )}
    </HostedSurface>
  );
}

function ResultPage({ config }) {
  const icon =
    config.tone === 'success' ? 'check-circle' : config.tone === 'warning' ? 'clock-countdown' : 'warning-circle';
  const iconTone =
    config.tone === 'success'
      ? 'var(--ob-green)'
      : config.tone === 'warning'
        ? 'var(--ob-warning-fg)'
        : 'var(--ob-danger)';
  return (
    <HostedSurface eyebrow={config.eyebrow} title={config.heading} icon={icon} iconTone={iconTone}>
      <Alert appearance="soft" tone={config.tone}>
        {config.message}
      </Alert>
    </HostedSurface>
  );
}

function InvitationPage({ config }) {
  return (
    <HostedSurface
      eyebrow="Convite para workspace"
      title="Continue na extensão"
      description="Abra o OnFrame para entrar ou criar sua conta. Depois, o convite será aceito automaticamente."
      icon="envelope-simple"
    >
      <Button
        size="lg"
        icon={<Ph n="arrow-square-out" size={18} />}
        onClick={() => location.assign(config.extensionUrl)}
      >
        Abrir extensão
      </Button>
    </HostedSurface>
  );
}

function HostedApp({ config }) {
  if (!config) {
    return (
      <HostedLayout>
        <HostedSurface eyebrow="OnFrame" title="Página indisponível">
          <Alert appearance="soft" tone="danger">
            Não foi possível carregar esta página.
          </Alert>
        </HostedSurface>
      </HostedLayout>
    );
  }
  return (
    <HostedLayout>
      {config.kind === 'connection' && <ConnectionPage config={config} />}
      {config.kind === 'result' && <ResultPage config={config} />}
      {config.kind === 'invitation' && <InvitationPage config={config} />}
    </HostedLayout>
  );
}

const root = document.getElementById('root');
createRoot(root).render(<HostedApp config={pageConfig(root)} />);
