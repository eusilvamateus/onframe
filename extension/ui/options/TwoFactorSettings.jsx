import { useEffect, useRef, useState } from 'react';
import { Accordion, Alert, Button, Input, Link, List, ListItem, Ph, Spinner, Tabs } from '@onblide/ui';
import { AuthStep, VerificationCodeField, VerificationFrame, maskEmail } from '../shared/AuthPanel';
import { restoreProviderSession, verifySecondFactor } from '../shared/provider-auth';
import { formatDate, openExternal, sendRemoteMessage } from '../shared/runtime';

export function EmailVerification({
  email,
  onVerified,
  purpose = 'confirmar sua identidade',
  alternative = null,
  allowPasskey = false
}) {
  const auth = window.OnFrameRemoteAuth;
  const challengeRef = useRef(null);
  const challenge = useRef(null);
  const [config, setConfig] = useState(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [factor, setFactor] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [passkeyFlow, setPasskeyFlow] = useState(null);
  const passkeyPoll = useRef(false);
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;
  const codeLength = factor ? 6 : config?.emailOtpLength || 6;
  const cooldownLabel = `${Math.floor(cooldown / 60)}:${String(cooldown % 60).padStart(2, '0')}`;

  useEffect(() => {
    let active = true;
    auth
      .loadConfig()
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch(() => {
        if (active) setFeedback('Não foi possível preparar a verificação.');
      });
    return () => {
      active = false;
    };
  }, [auth]);
  useEffect(() => {
    if (!config || sent || passkeyFlow || !challengeRef.current) return undefined;
    challenge.current = auth.createChallenge(
      challengeRef.current,
      () => {},
      () => setFeedback('A confirmação de segurança está indisponível.')
    );
    return () => {
      challenge.current?.destroy();
      challenge.current = null;
    };
  }, [auth, config, passkeyFlow, sent]);
  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!passkeyFlow) return undefined;
    let active = true;
    const poll = async () => {
      if (passkeyPoll.current) return;
      passkeyPoll.current = true;
      try {
        const result = await sendRemoteMessage('security-flow-consume', { flow: passkeyFlow.flow });
        if (active && result.status === 'authenticated') {
          setPasskeyFlow(null);
          await onVerifiedRef.current(null);
        } else if (active && result.status === 'verified') {
          setPasskeyFlow(null);
          await onVerifiedRef.current(null);
        } else if (active && result.status === 'identity_mismatch') {
          setFeedback('A chave de acesso pertence a outra conta.');
          setPasskeyFlow(null);
        }
      } catch (error) {
        if (active) {
          setFeedback(
            error?.code === 'auth_identity_mismatch'
              ? 'A chave de acesso pertence a outra conta.'
              : error?.code === 'auth_flow_unavailable'
                ? 'A verificação expirou. Inicie novamente.'
                : 'Não foi possível confirmar a chave de acesso. Tente novamente.'
          );
          setPasskeyFlow(null);
        }
      } finally {
        passkeyPoll.current = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [email, passkeyFlow]);

  async function startPasskeyVerification() {
    if (busy || passkeyFlow) return;
    setBusy(true);
    setFeedback(null);
    try {
      const flow = await sendRemoteMessage('security-flow-start');
      const url = new URL(flow.passkeyUrl);
      url.searchParams.set('action', 'verify');
      url.hash = new URLSearchParams({ expected_email: email }).toString();
      setPasskeyFlow(flow);
      openExternal(url.toString());
    } catch {
      setFeedback('Não foi possível abrir a verificação por chave de acesso.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelPasskeyVerification() {
    const flow = passkeyFlow?.flow;
    setPasskeyFlow(null);
    if (flow) await sendRemoteMessage('security-flow-cancel', { flow }).catch(() => undefined);
  }

  async function submit(event, submittedCode = code) {
    event?.preventDefault();
    if (busy || !config || (!sent && cooldown)) return;
    setBusy(true);
    setFeedback(null);
    try {
      if (factor) {
        await verifySecondFactor(factor.client, factor.id, submittedCode);
        await onVerified(factor.client);
        return;
      }
      if (!sent) {
        const token = await challenge.current?.execute();
        if (!token)
          throw Object.assign(new Error('A confirmação de segurança está indisponível.'), {
            code: 'captcha_unavailable'
          });
        await auth.request(
          config,
          'otp',
          { email, create_user: false, gotrue_meta_security: { captcha_token: token } },
          { redirectTo: 'https://onframe.onblide.com/connect?verification=email' }
        );
        setSent(true);
        setCooldown(60);
        setCode('');
        return;
      }
      if (!/^\d+$/u.test(submittedCode) || submittedCode.length !== codeLength)
        throw new Error('Informe o código recebido por e-mail.');
      const session = await auth.request(config, 'verify', { email, token: submittedCode, type: 'email' });
      const client = await restoreProviderSession(config, session);
      const { data: identity, error: identityError } = await client.auth.getUser();
      if (identityError || identity.user.email?.toLowerCase() !== email.toLowerCase())
        throw new Error('A conta verificada não corresponde a este perfil.');
      const { data: factors, error } = await client.auth.mfa.listFactors();
      if (error) throw error;
      if (factors.totp.length) {
        setFactor({ client, id: factors.totp[0].id, factors: factors.totp });
        setCode('');
      } else await onVerified(client);
    } catch (error) {
      if (!sent && (error?.code === 'over_email_send_rate_limit' || error?.status === 429)) setCooldown(60);
      setFeedback(
        factor
          ? 'Código do aplicativo inválido ou expirado. Tente novamente.'
          : sent
            ? 'Código inválido ou expirado. Confira o código e tente novamente.'
            : auth.authErrorMessage(error, 'Não foi possível enviar o código. Tente novamente.')
      );
      if (!sent) challenge.current?.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <VerificationFrame
      icon={factor ? 'device-mobile' : 'envelope-simple'}
      iconTone="var(--ob-blue)"
      title={factor ? 'Confirme no aplicativo' : sent ? 'Confira seu e-mail' : 'Verifique seu e-mail'}
      description={
        factor
          ? 'Abra o seu aplicativo autenticador e digite o código de 6 dígitos da Onblide.'
          : sent
            ? `Enviamos um código de ${codeLength} dígitos para ${maskEmail(email)}.`
            : `Enviaremos um código para ${maskEmail(email)} antes de ${purpose}.`
      }
      footer={
        sent && !factor ? (
          <p className="onframe-auth-resend" role="status">
            Não recebeu?{' '}
            {cooldown > 0 ? (
              <span>
                Você pode pedir de novo em <span className="ob-numeric">{cooldownLabel}</span>.
              </span>
            ) : (
              <Link
                href="#reenviar-codigo"
                onClick={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  setSent(false);
                  setCode('');
                  setFeedback(null);
                }}
              >
                Reenviar código
              </Link>
            )}
          </p>
        ) : undefined
      }
    >
      <form className="onframe-auth-fields" onSubmit={submit} aria-busy={busy}>
        {factor?.factors.length > 1 && (
          <Tabs
            size="sm"
            tabs={factor.factors.map((value, index) => ({
              id: value.id,
              label: value.friendly_name || `Autenticador ${index + 1}`
            }))}
            active={factor.id}
            onChange={(id) => {
              setFactor((current) => ({ ...current, id }));
              setCode('');
              setFeedback(null);
            }}
          />
        )}
        {sent && (
          <VerificationCodeField
            label={factor ? 'Código do aplicativo autenticador' : 'Código recebido por e-mail'}
            length={codeLength}
            value={code}
            onChange={(value) => {
              setCode(value);
              setFeedback(null);
              if (/^\d+$/u.test(value) && value.length === codeLength) void submit(undefined, value);
            }}
            error={Boolean(feedback)}
            disabled={busy}
          />
        )}
        {sent && (
          <div className="onframe-auth-code-status" aria-live="polite">
            {busy && (
              <>
                <Spinner size="xs" />
                <span>Verificando…</span>
              </>
            )}
            {!busy && feedback && <span className="onframe-auth-code-error">{feedback}</span>}
          </div>
        )}
        {!sent && feedback && (
          <p className="onframe-auth-inline-feedback" role="alert">
            {feedback}
          </p>
        )}
        {!sent && !passkeyFlow && <div className="onframe-captcha" ref={challengeRef} />}
        {!sent && passkeyFlow && (
          <div className="onframe-stack" role="status">
            <p className="onframe-auth-inline-feedback">Aguardando a confirmação da chave de acesso…</p>
            <Button
              type="button"
              kind="quiet"
              size="sm"
              disabled={busy}
              onClick={() => void cancelPasskeyVerification()}
            >
              Cancelar verificação
            </Button>
          </div>
        )}
        {!sent && (
          <>
            <Button
              type="submit"
              size="lg"
              disabled={busy || !config || cooldown > 0 || Boolean(passkeyFlow)}
              style={{ width: '100%' }}
            >
              {busy ? 'Aguarde...' : cooldown > 0 ? `Enviar código em ${cooldown} s` : 'Enviar código'}
            </Button>
            {allowPasskey && !factor && !passkeyFlow && (
              <Button
                type="button"
                kind="secondary"
                size="lg"
                disabled={busy || !config}
                icon={<Ph n="fingerprint" size={18} />}
                style={{ width: '100%' }}
                onClick={() => void startPasskeyVerification()}
              >
                Usar chave de acesso
              </Button>
            )}
          </>
        )}
        {!sent && !passkeyFlow && alternative}
      </form>
    </VerificationFrame>
  );
}

export function TwoFactorSettings({ profile, securityOverview, onDisconnect }) {
  const clientRef = useRef(null);
  const pendingRef = useRef(null);
  const [verified, setVerified] = useState(false);
  const [enrollment, setEnrollment] = useState(null);
  const [name, setName] = useState('Aplicativo autenticador');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const factors = (securityOverview?.factors || []).filter((factor) => factor.type === 'totp');

  useEffect(
    () => () => {
      const client = clientRef.current;
      const pending = pendingRef.current;
      if (client && pending) void client.auth.mfa.unenroll({ factorId: pending }).catch(() => undefined);
      clientRef.current = null;
      pendingRef.current = null;
    },
    []
  );

  async function action(callback) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await callback();
    } catch {
      setNotice({
        tone: 'danger',
        message: 'Não foi possível concluir a operação. Confira o código ou verifique novamente sua identidade.'
      });
    } finally {
      setBusy(false);
    }
  }

  async function enroll() {
    await action(async () => {
      const { data, error } = await clientRef.current.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: name.trim(),
        issuer: 'OnFrame'
      });
      if (error) throw error;
      pendingRef.current = data.id;
      setEnrollment(data);
      setCode('');
    });
  }

  function requestEnrollment() {
    if (clientRef.current) void enroll();
    else setConfirmAction('enroll');
  }

  async function confirmEnrollment(event) {
    event.preventDefault();
    await action(async () => {
      await verifySecondFactor(clientRef.current, enrollment.id, code);
      pendingRef.current = null;
      setEnrollment(null);
      setCode('');
      await onDisconnect();
    });
  }

  return (
    <section className="onframe-stack onframe-security-form" aria-label="Verificação em duas etapas">
      {!verified ? (
        <EmailVerification
          email={profile.user.email}
          purpose="configurar a verificação em duas etapas"
          allowPasskey={Boolean(securityOverview?.passkeys?.length)}
          onVerified={(client) => {
            clientRef.current = client;
            setVerified(true);
          }}
        />
      ) : confirmAction ? (
        <EmailVerification
          email={profile.user.email}
          purpose="alterar a verificação em duas etapas"
          allowPasskey={false}
          onVerified={(client) => {
            clientRef.current = client;
            setConfirmAction(null);
            if (confirmAction === 'enroll') void enroll();
          }}
        />
      ) : enrollment ? (
        <VerificationFrame
          icon="device-mobile"
          iconTone="var(--ob-blue)"
          title="Conecte seu aplicativo"
          description="Leia o QR code no aplicativo autenticador ou use a chave de configuração. Depois, digite o código gerado."
        >
          <form className="onframe-auth-fields" onSubmit={confirmEnrollment}>
            <img
              className="onframe-authenticator-qr"
              src={
                enrollment.totp.qr_code.startsWith('data:')
                  ? enrollment.totp.qr_code
                  : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.totp.qr_code)}`
              }
              alt="QR code de configuração do autenticador"
            />
            <Input label="Chave de configuração" value={enrollment.totp.secret} readOnly autoComplete="off" />
            <VerificationCodeField
              label="Código do aplicativo"
              length={6}
              value={code}
              onChange={(value) => {
                setCode(value);
                setNotice(null);
              }}
              error={notice?.tone === 'danger'}
              disabled={busy}
            />
            {notice && (
              <Alert appearance="soft" tone={notice.tone}>
                {notice.message}
              </Alert>
            )}
            <div className="onframe-auth-actions">
              <Button
                type="submit"
                size="lg"
                disabled={busy || code.length !== 6}
                icon={<Ph n="shield-check" size={18} />}
              >
                Ativar verificação em duas etapas
              </Button>
              <Button
                kind="secondary"
                size="lg"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const { error } = await clientRef.current.auth.mfa.unenroll({ factorId: enrollment.id });
                    if (error) throw error;
                    pendingRef.current = null;
                    setEnrollment(null);
                    setCode('');
                  })
                }
              >
                Cancelar configuração
              </Button>
            </div>
          </form>
        </VerificationFrame>
      ) : removal ? (
        <VerificationFrame
          icon="warning-circle"
          iconTone="var(--ob-danger)"
          title="Remover autenticador?"
          description="Digite um código deste autenticador para confirmar a remoção."
        >
          <form
            className="onframe-auth-fields"
            onSubmit={(event) => {
              event.preventDefault();
              void action(async () => {
                await verifySecondFactor(clientRef.current, removal.id, code);
                const { error } = await clientRef.current.auth.mfa.unenroll({ factorId: removal.id });
                if (error) throw error;
                setRemoval(null);
                setCode('');
                await onDisconnect();
              });
            }}
          >
            <Alert appearance="soft" tone="warning">
              Remover este autenticador encerra suas sessões. Se for o último, sua conta deixará de exigir o código do
              aplicativo.
            </Alert>
            <VerificationCodeField
              label="Código do autenticador a remover"
              length={6}
              value={code}
              onChange={(value) => {
                setCode(value);
                setNotice(null);
              }}
              error={notice?.tone === 'danger'}
              disabled={busy}
            />
            {notice && (
              <Alert appearance="soft" tone={notice.tone}>
                {notice.message}
              </Alert>
            )}
            <div className="onframe-auth-actions">
              <Button type="submit" kind="danger" size="lg" disabled={busy || code.length !== 6}>
                Remover autenticador
              </Button>
              <Button kind="secondary" size="lg" disabled={busy} onClick={() => setRemoval(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </VerificationFrame>
      ) : (
        <AuthStep
          headingLevel={2}
          icon="device-mobile"
          iconTone="var(--ob-blue)"
          title={factors.length ? 'Aplicativos autenticadores' : 'Configure um autenticador'}
          description={
            factors.length
              ? 'Revise os aplicativos conectados ou adicione outro método de verificação.'
              : 'Use um aplicativo autenticador para proteger o acesso à sua conta.'
          }
        >
          {notice && (
            <Alert appearance="soft" tone={notice.tone}>
              {notice.message}
            </Alert>
          )}
          {factors.length > 0 && (
            <List dividers ariaLabel="Aplicativos autenticadores">
              {factors.map((factor) => (
                <ListItem
                  key={factor.id}
                  leading={<Ph n="device-mobile" size={20} />}
                  title={factor.name || 'Aplicativo autenticador'}
                  description={`Adicionado em ${formatDate(factor.createdAt)}`}
                  trailing={
                    <Button
                      kind="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setRemoval(factor);
                        setCode('');
                        setNotice(null);
                        if (!clientRef.current) setConfirmAction('remove');
                      }}
                    >
                      Remover
                    </Button>
                  }
                />
              ))}
            </List>
          )}
          <Input
            size="lg"
            label="Nome do autenticador"
            value={name}
            maxLength={64}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="onframe-auth-actions">
            <Button
              size="lg"
              disabled={busy || !name.trim()}
              icon={<Ph n="plus" size={18} />}
              onClick={requestEnrollment}
            >
              Adicionar autenticador
            </Button>
          </div>
        </AuthStep>
      )}
    </section>
  );
}

export function PasskeySettings({ profile, securityOverview }) {
  const clientRef = useRef(null);
  const [opened, setOpened] = useState(false);
  const [opening, setOpening] = useState(false);
  const passkeys = securityOverview?.passkeys || [];
  const passkeyCount = passkeys.length;

  async function openManagement(client = clientRef.current) {
    if (opening) return;
    setOpening(true);
    const url = new URL('https://onframe.onblide.com/auth/passkeys?action=manage');
    let verifiedSession = false;
    try {
      if (client) {
        const { data, error } = await client.auth.getSession();
        if (!error && data.session) {
          verifiedSession = true;
          url.hash = new URLSearchParams({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token
          }).toString();
        }
      }
      openExternal(url.toString());
      if (verifiedSession) setOpened(true);
    } finally {
      setOpening(false);
    }
  }

  return (
    <section
      className={`onframe-stack onframe-security-form${opened ? ' onframe-security-form--passkeys' : ''}`}
      aria-label="Chaves de acesso"
    >
      {opened ? (
        <div className="onframe-passkey-overview">
          <p className="onframe-passkey-intro-copy">
            {passkeyCount === 0
              ? 'Você ainda entra só com a senha.'
              : `${passkeyCount} ${passkeyCount === 1 ? 'chave entra' : 'chaves entram'} na sua conta sem senha.`}
          </p>

          <section className="onframe-passkey-section" aria-labelledby="onframe-extension-passkeys-heading">
            <div className="onframe-passkey-section-heading">
              <h2 id="onframe-extension-passkeys-heading">Chaves cadastradas</h2>
              {passkeyCount > 0 && <span>{passkeyCount}</span>}
            </div>
            <div className="onframe-passkey-list-frame">
              {passkeyCount > 0 ? (
                <List dividers ariaLabel="Chaves cadastradas">
                  {passkeys.map((key) => (
                    <ListItem
                      key={key.id}
                      leading={<Ph n="key" size={20} />}
                      title={key.name || 'Chave de acesso'}
                      strong
                      wrap
                      description={
                        <span className="onframe-passkey-key-meta">
                          <span>Adicionada em {formatDate(key.createdAt)}</span>
                          <span>
                            {key.lastUsedAt ? `Último uso em ${formatDate(key.lastUsedAt)}` : 'Ainda não utilizada'}
                          </span>
                        </span>
                      }
                    />
                  ))}
                </List>
              ) : (
                <div className="onframe-passkey-empty">
                  <Ph n="key" size={22} />
                  <div>
                    <strong>Nenhuma chave cadastrada</strong>
                    <p>Crie a primeira chave na aba segura para entrar sem senha.</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="onframe-passkey-section" aria-labelledby="onframe-extension-passkey-manage-heading">
            <div className="onframe-passkey-section-heading">
              <h2 id="onframe-extension-passkey-manage-heading">Gerenciar chaves</h2>
            </div>
            <div className="onframe-passkey-external">
              <Ph n="arrow-square-out" size={20} />
              <div>
                <strong>Gerencie em uma aba segura</strong>
                <p>Crie, renomeie ou remova chaves.</p>
              </div>
              <Button
                type="button"
                kind="secondary"
                size="sm"
                disabled={opening}
                icon={<Ph n="arrow-square-out" size={16} />}
                onClick={() => void openManagement()}
              >
                {opening ? 'Abrindo…' : 'Abrir gerenciamento'}
              </Button>
            </div>
          </section>

          <section className="onframe-passkey-section" aria-labelledby="onframe-extension-passkey-help-heading">
            <div className="onframe-passkey-section-heading">
              <h2 id="onframe-extension-passkey-help-heading">Como funcionam as chaves de acesso</h2>
            </div>
            <Accordion
              size="sm"
              headingLevel={3}
              ariaLabel="Como funcionam as chaves de acesso"
              items={[
                {
                  id: 'what',
                  title: 'O que é uma chave de acesso?',
                  content: 'É uma forma de entrar sem senha. Você confirma com a digital, o rosto ou o PIN do aparelho.'
                },
                {
                  id: 'security',
                  title: 'Por que é mais segura que a senha?',
                  content: 'A chave só funciona no endereço verdadeiro da Onblide e não revela um segredo reutilizável.'
                },
                {
                  id: 'lost',
                  title: 'E se eu perder o aparelho?',
                  content: 'Entre por outro aparelho ou com a senha e remova a chave vinculada ao dispositivo perdido.'
                }
              ]}
            />
          </section>
        </div>
      ) : (
        <EmailVerification
          email={profile.user.email}
          purpose="gerenciar suas chaves de acesso"
          allowPasskey={Boolean(passkeyCount)}
          onVerified={async (client) => {
            if (!client) {
              setOpened(true);
              return;
            }
            clientRef.current = client;
            await openManagement(client);
          }}
        />
      )}
    </section>
  );
}
