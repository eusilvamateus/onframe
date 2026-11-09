import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import '@onblide/ui/styles.css';
import { Alert, Button, Card, Input, Logo, Ph, Spinner } from '@onblide/ui';
import { ThemeMenuButton } from '../shared/ThemeControl';
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
        <a className="onframe-hosted-brand" href="/connect" aria-label="OnFrame">
          <Logo size={24} />
          <span aria-hidden="true" />
          <strong>OnFrame</strong>
        </a>
        <ThemeMenuButton />
      </header>
      <main className="onframe-hosted-main">{children}</main>
      <footer className="onframe-hosted-footer">ONBLIDE · ONFRAME</footer>
    </div>
  );
}

function HostedSurface({ eyebrow, title, description, children }) {
  return (
    <section className="onframe-hosted-surface" aria-live="polite">
      <Card padding="var(--ob-space-24)" elevation="shadow">
        <div className="onframe-hosted-stack">
          <div className="onframe-hosted-intro">
            <p className="onframe-hosted-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          {children}
        </div>
      </Card>
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
  const title = recovery ? 'Defina uma nova senha' : config.heading;
  const description = recovery ? 'Escolha uma nova senha para sua conta.' : config.description;

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
          <Input
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            placeholder="Crie uma nova senha"
            value={password}
            error={passwordError}
            disabled={busy}
            autoFocus
            onChange={(event) => {
              setPassword(event.target.value);
              setPasswordError('');
            }}
          />
          <Input
            label="Confirme a nova senha"
            type="password"
            autoComplete="new-password"
            placeholder="Repita a nova senha"
            value={confirmation}
            error={confirmationError}
            disabled={busy}
            onChange={(event) => {
              setConfirmation(event.target.value);
              setConfirmationError('');
            }}
          />
          <Button
            type="submit"
            disabled={busy}
            icon={busy ? <Spinner size="xs" label="Atualizando senha" /> : <Ph n="check-circle" size={16} />}
          >
            Atualizar senha
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
  return (
    <HostedSurface eyebrow={config.eyebrow} title={config.heading}>
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
    >
      <Button icon={<Ph n="arrow-square-out" size={16} />} onClick={() => location.assign(config.extensionUrl)}>
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
