import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import '@onblide/ui/styles.css';
import {
  Accordion,
  Alert,
  AlertDialog,
  Button,
  Card,
  Input,
  Link,
  List,
  ListItem,
  Menu,
  Modal,
  Ph,
  Spinner,
  Tabs
} from '@onblide/ui';
import '../shared/app.css';
import { AuthStep, VerificationCodeField, VerificationFrame } from '../shared/AuthPanel';
import { ThemeCycleButton } from '../shared/ThemeControl';
import { providerClient, verifySecondFactor } from '../shared/provider-auth';
import { formatDate } from '../shared/runtime';

const params = new URL(location.href).searchParams;
const fragment = new URLSearchParams(location.hash.slice(1));
const expectedEmail = params.get('expected_email') || fragment.get('expected_email') || '';
const transientSession = {
  access_token: fragment.get('access_token') || '',
  refresh_token: fragment.get('refresh_token') || ''
};
fragment.delete('access_token');
fragment.delete('refresh_token');
fragment.delete('expected_email');
history.replaceState(null, document.title, location.pathname + location.search);
const managing = params.get('action') === 'manage';
const verifying = params.get('action') === 'verify';
const securityVerification = verifying && params.get('purpose') === 'security';
const flow = params.get('flow') || '';

const PASSKEY_HELP = [
  {
    id: 'what',
    title: 'O que é uma chave de acesso?',
    content:
      'É uma forma de entrar sem senha. Você confirma com a digital, o rosto ou o PIN do aparelho, e o aparelho prova para a Onblide que é você.'
  },
  {
    id: 'security',
    title: 'Por que é mais segura que a senha?',
    content:
      'A chave só funciona no endereço verdadeiro da Onblide. Um site falso não consegue usá-la, e a Onblide guarda somente a parte pública da chave.'
  },
  {
    id: 'lost',
    title: 'E se eu perder o aparelho?',
    content:
      'Remova a chave dele nesta tela, entrando por outro aparelho ou com a senha. Por isso vale ter mais de uma chave em dispositivos diferentes.'
  }
];

function passkeyName(key) {
  return key?.friendly_name || 'Chave de acesso';
}

function closePasskeyPage() {
  window.close();
}

async function loadManagementKeys(provider) {
  const { data: assurance, error: assuranceError } = await provider.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (assurance.nextLevel !== assurance.currentLevel)
    throw Object.assign(new Error('mfa'), { code: 'management_auth_required' });
  const { data, error } = await provider.auth.passkey.list();
  if (error) throw error;
  return data;
}

function PasskeyLayout({ children, management = false }) {
  return (
    <main className="onframe-auth-page onframe-passkey-page">
      <header className="onframe-passkey-header">
        <Button kind="quiet" size="sm" icon={<Ph n="arrow-left" size={16} />} onClick={closePasskeyPage}>
          Segurança
        </Button>
        <ThemeCycleButton />
      </header>
      <div className={`onframe-passkey-main${management ? ' onframe-passkey-main--management' : ''}`}>{children}</div>
    </main>
  );
}

function PasskeyPage() {
  const [client, setClient] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState('');
  const [factor, setFactor] = useState(null);
  const [code, setCode] = useState('');
  const [removal, setRemoval] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [created, setCreated] = useState(null);
  const [complete, setComplete] = useState(false);
  const [managementAuthRequired, setManagementAuthRequired] = useState(false);
  const [managementPasskeyPending, setManagementPasskeyPending] = useState(false);
  const [managementPasskeyValidated, setManagementPasskeyValidated] = useState(false);
  const [challengeReady, setChallengeReady] = useState(false);
  const challengeRef = useRef(null);
  const challenge = useRef(null);
  const attemptStarted = useRef(false);

  useEffect(() => {
    if (
      !ready ||
      (verifying && !securityVerification) ||
      (managing && !managementAuthRequired) ||
      factor ||
      complete ||
      !challengeRef.current
    )
      return undefined;
    challenge.current = window.OnFrameRemoteAuth.createChallenge(
      challengeRef.current,
      () => setChallengeReady(true),
      () => setNotice({ tone: 'danger', message: 'A confirmação de segurança está indisponível.' })
    );
    return () => {
      challenge.current?.destroy();
      challenge.current = null;
    };
  }, [ready, managing, managementAuthRequired, verifying, securityVerification, Boolean(factor), complete]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/v1/auth/config', { cache: 'no-store' });
        if (!response.ok) throw new Error('config');
        const config = await response.json();
        const provider = providerClient(
          config,
          managing
            ? {
                persistSession: true,
                autoRefreshToken: true,
                storage: window.sessionStorage
              }
            : undefined
        );
        if (managing) {
          let session = null;
          if (transientSession.access_token && transientSession.refresh_token) {
            const { data, error } = await provider.auth.setSession(transientSession);
            if (!error) session = data.session;
          } else {
            const { data, error } = await provider.auth.getSession();
            if (!error) session = data.session;
          }
          transientSession.access_token = '';
          transientSession.refresh_token = '';
          if (session) {
            try {
              const data = await loadManagementKeys(provider);
              if (active) setKeys(data);
            } catch (error) {
              if (error?.code !== 'management_auth_required') throw error;
              if (active) setManagementAuthRequired(true);
            }
          } else if (active) setManagementAuthRequired(true);
        } else if (verifying && !securityVerification) {
          if (!transientSession.access_token || !transientSession.refresh_token) throw new Error('session');
          const { error } = await provider.auth.setSession(transientSession);
          transientSession.access_token = '';
          transientSession.refresh_token = '';
          if (error) throw error;
          if (!/^[A-Za-z0-9_-]{43}$/u.test(flow)) throw new Error('flow');
          const { data: identity, error: identityError } = await provider.auth.getUser();
          if (identityError || !identity.user?.email) throw identityError || new Error('identity');
          if (!securityVerification) {
            const { data, error: factorError } = await provider.auth.mfa.listFactors();
            if (factorError || !data.totp.length) throw factorError || new Error('factor');
            if (active) setFactor({ id: data.totp[0].id, factors: data.totp });
          }
        } else if (!/^[A-Za-z0-9_-]{43}$/u.test(flow)) throw new Error('flow');
        if (active) {
          setClient(provider);
          setReady(true);
        }
      } catch {
        transientSession.access_token = '';
        transientSession.refresh_token = '';
        if (active)
          setNotice({
            tone: 'danger',
            message:
              'Não foi possível preparar as chaves de acesso. Volte à extensão e verifique sua identidade novamente. O recurso também precisa estar habilitado no Supabase.'
          });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function run(callback) {
    if (busy || !client) return;
    setBusy(true);
    setNotice(null);
    try {
      await callback();
    } catch (error) {
      setNotice({
        tone: 'danger',
        message:
          error?.code === 'auth_identity_mismatch'
            ? 'Esta chave de acesso pertence a outra conta. Volte à extensão e confirme com a conta conectada.'
            : error?.code === 'captcha_unavailable'
              ? 'A confirmação de segurança está indisponível. Tente novamente.'
              : error?.name === 'NotAllowedError'
                ? 'A solicitação foi cancelada ou expirou. Tente novamente.'
                : 'Não foi possível concluir a operação. Verifique a disponibilidade do recurso e tente novamente.'
      });
    } finally {
      setBusy(false);
    }
  }

  async function refreshKeys() {
    const { data, error } = await client.auth.passkey.list();
    if (error) throw error;
    setKeys(data);
  }

  async function finishManagementAuthentication(showPasskeySuccess = false) {
    const data = await loadManagementKeys(client);
    setKeys(data);
    setFactor(null);
    setCode('');
    setManagementAuthRequired(false);
    setManagementPasskeyPending(false);
    setManagementPasskeyValidated(showPasskeySuccess);
    setNotice(null);
  }

  async function createPasskey() {
    await run(async () => {
      const { data, error } = await client.auth.registerPasskey();
      if (error) throw error;
      setKeys((current) => [...current, data]);
      setCreated(data);
      setName(passkeyName(data));
    });
  }

  async function savePasskeyName() {
    const target = created || renaming;
    if (!target || !name.trim()) return;
    await run(async () => {
      const { error } = await client.auth.passkey.update({
        passkeyId: target.id,
        friendlyName: name.trim()
      });
      if (error) throw error;
      setCreated(null);
      setRenaming(null);
      setName('');
      await refreshKeys();
    });
  }

  async function finishLogin(session) {
    const sessionEmail = String(session.user?.email || '')
      .trim()
      .toLowerCase();
    if (!securityVerification && expectedEmail && sessionEmail !== expectedEmail.trim().toLowerCase())
      throw Object.assign(new Error('A chave de acesso pertence a outra conta.'), { code: 'auth_identity_mismatch' });
    const path = securityVerification
      ? `/v1/security/verification-flows/${encodeURIComponent(flow)}`
      : `/v1/extension-auth-flows/${encodeURIComponent(flow)}`;
    const response = await fetch(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${session.access_token}` },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('flow');
    if (securityVerification) {
      const result = await response.json();
      if (result.status === 'identity_mismatch')
        throw Object.assign(new Error('A chave de acesso pertence a outra conta.'), { code: 'auth_identity_mismatch' });
      if (result.status !== 'verified') throw new Error('flow');
    }
    setComplete(true);
    setFactor(null);
    setCode('');
    setNotice({ tone: 'success', message: 'Acesso confirmado. Volte à extensão para continuar.' });
  }

  async function authenticateWithPasskey() {
    await run(async () => {
      const captchaToken = await challenge.current?.execute();
      if (!captchaToken)
        throw Object.assign(new Error('A confirmação de segurança está indisponível.'), {
          code: 'captcha_unavailable'
        });
      let result;
      try {
        result = await client.auth.signInWithPasskey({ options: { captchaToken } });
      } finally {
        challenge.current?.reset();
      }
      const { data, error } = result;
      if (error || !data.session) throw error || new Error('session');
      if (securityVerification) {
        await finishLogin(data.session);
        return;
      }
      const { data: factors, error: factorError } = await client.auth.mfa.listFactors();
      if (factorError) throw factorError;
      if (factors.totp.length) {
        const identityEmail = data.session.user?.email || (await client.auth.getUser()).data.user?.email;
        if (!identityEmail) throw new Error('identity');
        if (managing) setManagementPasskeyPending(true);
        setFactor({ id: factors.totp[0].id, factors: factors.totp });
      } else if (managing) await finishManagementAuthentication(true);
      else await finishLogin(data.session);
    });
  }

  useEffect(() => {
    if (
      !ready ||
      (verifying && !securityVerification) ||
      (managing && !managementAuthRequired) ||
      factor ||
      complete ||
      !challengeReady ||
      attemptStarted.current
    )
      return;
    attemptStarted.current = true;
    void authenticateWithPasskey();
  }, [challengeReady, complete, factor, managementAuthRequired, ready]);

  async function verifyAuthenticator(value) {
    if (!/^\d{6}$/u.test(value) || busy || !factor) return;
    await run(async () => {
      const session = await verifySecondFactor(client, factor.id, value);
      if (managing) await finishManagementAuthentication(managementPasskeyPending);
      else await finishLogin(session);
    });
  }

  if (ready && factor && !complete)
    return (
      <PasskeyLayout>
        <VerificationFrame
          title="Confirme no aplicativo"
          description="Abra o seu aplicativo autenticador e digite o código de 6 dígitos da Onblide."
          icon="device-mobile"
          iconTone="var(--ob-blue)"
          headingLevel={1}
          framed={false}
        >
          <form
            className="onframe-auth-fields"
            onSubmit={(event) => {
              event.preventDefault();
              void verifyAuthenticator(code);
            }}
            aria-busy={busy}
          >
            {factor.factors.length > 1 && (
              <Tabs
                tabs={factor.factors.map((value, index) => ({
                  id: value.id,
                  label: value.friendly_name || `Autenticador ${index + 1}`
                }))}
                active={factor.id}
                onChange={(id) => {
                  setFactor((current) => ({ ...current, id }));
                  setCode('');
                  setNotice(null);
                }}
                size="sm"
              />
            )}
            <VerificationCodeField
              label="Código do aplicativo autenticador"
              length={6}
              value={code}
              onChange={(value) => {
                setCode(value);
                setNotice(null);
                if (/^\d{6}$/u.test(value)) void verifyAuthenticator(value);
              }}
              error={notice?.tone === 'danger'}
              disabled={busy}
            />
            {notice && (
              <Alert appearance="soft" tone={notice.tone}>
                {notice.message}
              </Alert>
            )}
          </form>
        </VerificationFrame>
      </PasskeyLayout>
    );

  if (!managing) {
    const failed = notice?.tone === 'danger';
    const title = complete
      ? 'Acesso confirmado'
      : failed
        ? 'Não foi possível usar a chave'
        : verifying && !securityVerification
          ? 'Verificação em duas etapas'
          : 'Use sua chave de acesso';
    const description = complete
      ? 'Volte à extensão para continuar.'
      : failed
        ? 'A verificação foi cancelada ou demorou demais. Nada foi alterado na sua conta.'
        : 'Siga as instruções do navegador. Você pode usar a digital, o rosto, o PIN do dispositivo ou uma chave de segurança.';
    const returnToPassword = (event) => {
      event?.preventDefault();
      window.close();
    };
    return (
      <PasskeyLayout>
        <section className="onframe-auth-panel" aria-label="Chave de acesso">
          <AuthStep
            onBack={returnToPassword}
            icon={complete ? 'check-circle' : failed ? 'warning-circle' : 'fingerprint'}
            iconTone={complete ? 'var(--ob-green)' : failed ? 'var(--ob-danger)' : 'var(--ob-blue)'}
            title={title}
            description={description}
            footer={
              !complete ? (
                <p className="onframe-muted">
                  Prefere a senha?{' '}
                  <Link href="#entrar-com-senha" onClick={returnToPassword}>
                    Entrar com senha
                  </Link>
                </p>
              ) : undefined
            }
          >
            {ready && (!verifying || securityVerification) && !complete && !factor && (
              <div className="onframe-captcha" ref={challengeRef} />
            )}
            {complete ? (
              <Button type="button" size="lg" style={{ width: '100%' }} onClick={returnToPassword}>
                Voltar à extensão
              </Button>
            ) : failed ? (
              <div className="onframe-passkey-actions">
                <Button
                  type="button"
                  size="lg"
                  icon={<Ph n="arrow-clockwise" size={18} />}
                  onClick={() => {
                    attemptStarted.current = true;
                    void authenticateWithPasskey();
                  }}
                >
                  Tentar de novo
                </Button>
              </div>
            ) : (
              <div className="onframe-passkey-actions">
                <Card padding="var(--ob-space-16)">
                  <div className="onframe-passkey-status" role="status">
                    <Spinner size="sm" />
                    {busy ? 'Aguardando a confirmação no navegador…' : 'Preparando a verificação…'}
                  </div>
                </Card>
                <Button type="button" kind="secondary" size="lg" onClick={returnToPassword}>
                  Cancelar
                </Button>
              </div>
            )}
          </AuthStep>
        </section>
      </PasskeyLayout>
    );
  }

  if (ready && managementAuthRequired) {
    const failed = notice?.tone === 'danger';
    return (
      <PasskeyLayout>
        <section className="onframe-auth-panel" aria-label="Confirmar acesso às chaves">
          <AuthStep
            onBack={closePasskeyPage}
            icon={failed ? 'warning-circle' : 'fingerprint'}
            iconTone={failed ? 'var(--ob-danger)' : 'var(--ob-blue)'}
            title={failed ? 'Não foi possível confirmar sua chave' : 'Confirme com sua chave de acesso'}
            description={
              failed
                ? 'Tente novamente ou volte à extensão para confirmar sua identidade por e-mail.'
                : 'Use a digital, o rosto, o PIN do dispositivo ou uma chave de segurança para abrir o gerenciamento.'
            }
          >
            {!factor && <div className="onframe-captcha" ref={challengeRef} />}
            <div className="onframe-passkey-actions">
              {failed ? (
                <Button
                  type="button"
                  size="lg"
                  icon={<Ph n="arrow-clockwise" size={18} />}
                  onClick={() => void authenticateWithPasskey()}
                >
                  Tentar novamente
                </Button>
              ) : (
                <Card padding="var(--ob-space-16)">
                  <div className="onframe-passkey-status" role="status">
                    <Spinner size="sm" />
                    {busy ? 'Aguardando a confirmação no navegador…' : 'Preparando a verificação…'}
                  </div>
                </Card>
              )}
              <Button type="button" kind="secondary" size="lg" onClick={closePasskeyPage}>
                Voltar à extensão
              </Button>
            </div>
          </AuthStep>
        </section>
      </PasskeyLayout>
    );
  }

  if (ready && managementPasskeyValidated) {
    return (
      <PasskeyLayout>
        <section className="onframe-auth-panel" aria-label="Chave de acesso confirmada">
          <AuthStep
            icon="check-circle"
            iconTone="var(--ob-green)"
            title="A chave funcionou"
            description="Sua identidade foi confirmada. Agora você pode continuar para gerenciar suas chaves de acesso."
          >
            <Button
              type="button"
              size="lg"
              style={{ width: '100%' }}
              onClick={() => setManagementPasskeyValidated(false)}
            >
              Continuar para gerenciamento
            </Button>
          </AuthStep>
        </section>
      </PasskeyLayout>
    );
  }

  const passkeyCount = keys.length;
  const namingTarget = created || renaming;

  return (
    <PasskeyLayout management>
      <section className="onframe-passkey-management onframe-passkey-overview" aria-label="Chaves de acesso">
        <div className="onframe-passkey-intro">
          <h1>Chaves de acesso</h1>
          <p>
            {passkeyCount === 0
              ? 'Você ainda entra só com a senha.'
              : `${passkeyCount} ${passkeyCount === 1 ? 'chave entra' : 'chaves entram'} na sua conta sem senha.`}
          </p>
        </div>

        {notice && (
          <Alert appearance="soft" tone={notice.tone}>
            {notice.message}
          </Alert>
        )}

        {!ready && !notice && (
          <div className="onframe-passkey-loading" role="status">
            <Spinner size="sm" />
            Carregando suas chaves…
          </div>
        )}

        {ready && managing && (
          <>
            <section className="onframe-passkey-section" aria-labelledby="onframe-passkeys-heading">
              <div className="onframe-passkey-section-heading">
                <h2 id="onframe-passkeys-heading">Chaves cadastradas</h2>
                {passkeyCount > 0 && <span>{passkeyCount}</span>}
              </div>
              <div className="onframe-passkey-list-frame">
                {passkeyCount > 0 ? (
                  <List dividers ariaLabel="Chaves de acesso cadastradas">
                    {keys.map((key) => (
                      <ListItem
                        key={key.id}
                        leading={<Ph n="key" size={20} />}
                        title={passkeyName(key)}
                        strong
                        wrap
                        description={
                          <span className="onframe-passkey-key-meta">
                            <span>Adicionada em {formatDate(key.created_at)}</span>
                            <span>
                              {key.last_used_at
                                ? `Último uso em ${formatDate(key.last_used_at)}`
                                : 'Ainda não utilizada'}
                            </span>
                          </span>
                        }
                        trailing={
                          <Menu
                            size="sm"
                            align="right"
                            placement="auto"
                            ariaLabel={`Ações de ${passkeyName(key)}`}
                            trigger={
                              <Button
                                kind="quiet"
                                size="sm"
                                iconOnly
                                aria-label={`Ações de ${passkeyName(key)}`}
                                disabled={busy}
                                icon={<Ph n="dots-three-vertical" size={18} />}
                              />
                            }
                            items={[
                              {
                                label: 'Renomear',
                                icon: 'pencil-simple',
                                onSelect: () => {
                                  setRenaming(key);
                                  setName(passkeyName(key));
                                }
                              },
                              { type: 'separator' },
                              {
                                label: 'Remover',
                                icon: 'trash',
                                tone: 'danger',
                                onSelect: () => setRemoval(key)
                              }
                            ]}
                          />
                        }
                      />
                    ))}
                  </List>
                ) : (
                  <div className="onframe-passkey-empty">
                    <Ph n="key" size={22} />
                    <div>
                      <strong>Nenhuma chave cadastrada</strong>
                      <p>Crie a primeira chave para entrar com a digital, o rosto ou o PIN do dispositivo.</p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="onframe-passkey-section" aria-labelledby="onframe-add-passkey-heading">
              <div className="onframe-passkey-section-heading">
                <h2 id="onframe-add-passkey-heading">Adicionar outra chave</h2>
              </div>
              <div className="onframe-passkey-list-frame">
                <List ariaLabel="Adicionar outra chave">
                  <ListItem
                    leading={<Ph n="fingerprint" size={20} />}
                    title="Criar chave neste dispositivo"
                    description="Use a digital, o rosto, o PIN ou uma chave de segurança compatível."
                    trailing={<Ph n="caret-right" size={16} />}
                    strong
                    wrap
                    disabled={busy}
                    onClick={() => void createPasskey()}
                  />
                </List>
              </div>
            </section>

            <section className="onframe-passkey-section" aria-labelledby="onframe-passkey-help-heading">
              <div className="onframe-passkey-section-heading">
                <h2 id="onframe-passkey-help-heading">Como funcionam as chaves de acesso</h2>
              </div>
              <Accordion
                items={PASSKEY_HELP}
                size="sm"
                headingLevel={3}
                ariaLabel="Como funcionam as chaves de acesso"
              />
            </section>
          </>
        )}
      </section>

      <Modal
        open={Boolean(namingTarget)}
        onClose={() => {
          setCreated(null);
          setRenaming(null);
          setName('');
        }}
        title={created ? 'Chave criada' : 'Renomear chave'}
        size="sm"
        footer={
          <>
            <Button
              kind="secondary"
              disabled={busy}
              onClick={() => {
                setCreated(null);
                setRenaming(null);
                setName('');
              }}
            >
              Cancelar
            </Button>
            <Button disabled={busy || !name.trim()} onClick={() => void savePasskeyName()}>
              Salvar
            </Button>
          </>
        }
      >
        <Input
          label="Nome da chave"
          value={name}
          maxLength={64}
          disabled={busy}
          autoFocus
          hint="Escolha algo que você reconheça, como “Notebook de casa”."
          onChange={(event) => setName(event.target.value)}
        />
      </Modal>

      <AlertDialog
        open={Boolean(removal)}
        onClose={() => setRemoval(null)}
        title={removal ? `Remover “${passkeyName(removal)}”?` : 'Remover chave?'}
        confirmLabel="Remover chave"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={() =>
          removal &&
          void run(async () => {
            const { error } = await client.auth.passkey.delete({ passkeyId: removal.id });
            if (error) throw error;
            setRemoval(null);
            await refreshKeys();
          })
        }
      >
        Ninguém mais vai conseguir entrar na sua conta com ela. Se a chave estava em um aparelho perdido, troque também
        a senha.
      </AlertDialog>
    </PasskeyLayout>
  );
}

createRoot(document.getElementById('root')).render(<PasskeyPage />);
