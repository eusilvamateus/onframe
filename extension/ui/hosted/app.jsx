import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import '@onblide/ui/styles.css';
import { Alert, Button, Input, Link, Logo, Ph, ProgressBar, Spinner } from '@onblide/ui';
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

function HostedLayout({ children, document = false }) {
  return (
    <div className="onframe-hosted-page">
      <header className="onframe-hosted-header">
        <a className="onframe-hosted-brand" href="/connect" aria-label="onblide">
          <Logo size={24} />
        </a>
        <ThemeCycleButton />
      </header>
      <main className={`onframe-hosted-main${document ? ' onframe-hosted-main--document' : ''}`}>{children}</main>
      <footer className="onframe-hosted-footer">
        onblide · onframe
        {!document && <Link href="/privacidade" tone="muted">Política de privacidade</Link>}
      </footer>
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
      ? { tone: 'danger', message: 'Abra a extensão onframe para iniciar o acesso.' }
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
      document.title = 'Redefinir senha - onframe';
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
      description="Abra o onframe para entrar ou criar sua conta. Depois, o convite será aceito automaticamente."
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

function PrivacyPage() {
  return (
    <article className="onframe-hosted-policy">
      <header className="onframe-hosted-policy-intro">
        <h1>Política de privacidade do onframe</h1>
        <p>Atualizada em 21 de novembro de 2026.</p>
        <p>
          O onframe é uma extensão da onblide para gerenciar anúncios do Mercado Livre. Esta política explica
          quais dados usamos para oferecer o serviço, onde são processados e como você pode gerenciá-los.
        </p>
      </header>

      <section>
        <h2>Dados tratados</h2>
        <ul>
          <li>Dados da conta onframe: nome, e-mail, foto de perfil, credenciais de autenticação e informações de segurança da sessão.</li>
          <li>Dados do workspace: nome, logo, membros, convites, perfis de acesso, contas conectadas e histórico das operações.</li>
          <li>Dados das contas Mercado Livre autorizadas: identificadores, informações públicas da conta e credenciais de autorização necessárias para executar operações.</li>
          <li>Dados dos anúncios e produtos gerenciados: títulos, descrições, fotos, características, preços, custos, impostos, margens, estoque e promoções, conforme os recursos utilizados.</li>
          <li>Dados técnicos necessários à segurança e ao funcionamento, como identificadores de sessão e registros de falhas e operações.</li>
        </ul>
        <p>
          A extensão atua nas páginas do Mercado Livre declaradas no navegador. Ela usa os dados do anúncio exibido
          para mostrar ferramentas de edição e identificar o produto correspondente. Não acompanha o histórico geral
          de navegação nem usa esses dados para publicidade comportamental.
        </p>
      </section>

      <section>
        <h2>Finalidades e armazenamento</h2>
        <p>
          Usamos esses dados para autenticar sua conta, proteger o acesso, administrar workspaces, consultar e editar
          anúncios autorizados, calcular resultados comerciais e registrar ações necessárias ao funcionamento e à
          segurança do onframe. A extensão guarda localmente o identificador de sessão revogável e preferências como
          tema. As operações autenticadas passam pelo serviço onframe em onframe.onblide.com.
        </p>
        <p>
          As credenciais de autorização do Mercado Livre ficam cifradas no banco do serviço onframe e não são
          entregues à página do anúncio. Senhas e fatores de autenticação são processados pelo provedor de identidade,
          não guardados pelo onframe como texto. Fotos de perfil e logos enviados para a plataforma ficam em
          armazenamento público e podem ser acessados por quem tiver o endereço do arquivo.
        </p>
      </section>

      <section>
        <h2>Compartilhamento necessário</h2>
        <p>Os dados são compartilhados apenas conforme a função de cada serviço:</p>
        <ul>
          <li>Mercado Livre: autorização da conta e consultas ou alterações de anúncios solicitadas no onframe.</li>
          <li>Supabase: autenticação, fatores de segurança e armazenamento das imagens de perfil e workspace.</li>
          <li>Cloudflare: hospedagem do serviço, banco de dados, proteção contra abuso e execução das operações.</li>
          <li>Resend: entrega dos e-mails transacionais de acesso e segurança.</li>
          <li>Membros do mesmo workspace: dados e ações permitidos pelo perfil e pelas contas atribuídas a cada pessoa.</li>
        </ul>
        <p>Não vendemos dados pessoais nem os usamos para anúncios personalizados.</p>
      </section>

      <section>
        <h2>Conservação e controle</h2>
        <p>
          Mantemos os dados enquanto a conta, o workspace ou a integração precisarem deles. Você pode desconectar
          contas do Mercado Livre, encerrar sessões e solicitar a exclusão da sua conta nas configurações do onframe.
          A exclusão pode exigir que outro administrador assuma um workspace compartilhado. Registros de operações
          que permanecem no workspace perdem a identificação pessoal da conta excluída. A conservação de registros
          técnicos dos provedores segue as políticas e configurações desses serviços.
        </p>
      </section>

      <section>
        <h2>Seus direitos e contato</h2>
        <p>
          Você pode consultar e corrigir seus dados no perfil, gerenciar integrações e solicitar acesso, informação
          ou exclusão de dados pessoais. Para dúvidas e solicitações de privacidade, escreva para{' '}
          <Link href="mailto:eu.silvamateus80@gmail.com">eu.silvamateus80@gmail.com</Link>.
        </p>
      </section>

      <section>
        <h2>Uso limitado</h2>
        <p>
          O uso de informações obtidas pelas permissões da extensão segue a Política de Dados do Usuário da Chrome
          Web Store, inclusive os requisitos de Uso Limitado. Usamos essas informações somente para oferecer e
          melhorar as funções descritas aqui, sem venda de dados ou publicidade personalizada. O acesso humano a
          dados pessoais é restrito às situações permitidas pela política, como suporte solicitado, segurança e
          obrigações legais.
        </p>
      </section>
    </article>
  );
}

function HostedApp({ config }) {
  if (!config) {
    return (
      <HostedLayout>
        <HostedSurface eyebrow="onframe" title="Página indisponível">
          <Alert appearance="soft" tone="danger">
            Não foi possível carregar esta página.
          </Alert>
        </HostedSurface>
      </HostedLayout>
    );
  }
  if (config.kind === 'privacy') return <HostedLayout document><PrivacyPage /></HostedLayout>;
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
