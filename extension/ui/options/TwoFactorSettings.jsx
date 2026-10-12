import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Link, List, ListItem, Ph, Stepper, Tabs } from '@onblide/ui';
import { VerificationCodeField, VerificationEmailField, VerificationFrame } from '../shared/AuthPanel';
import { restoreProviderSession, verifySecondFactor } from '../shared/provider-auth';
import { formatDate, openExternal } from '../shared/runtime';

export function EmailVerification({ email, onVerified, purpose = 'confirmar sua identidade' }) {
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
  const codeLength = factor ? 6 : config?.emailOtpLength || 6;

  useEffect(() => {
    let active = true;
    auth.loadConfig().then((value) => { if (active) setConfig(value); })
      .catch(() => { if (active) setFeedback('Não foi possível preparar a verificação.'); });
    return () => { active = false; };
  }, [auth]);
  useEffect(() => {
    if (!config || sent || !challengeRef.current) return undefined;
    challenge.current = auth.createChallenge(challengeRef.current, () => {}, () => setFeedback('A confirmação de segurança está indisponível.'));
    return () => { challenge.current?.destroy(); challenge.current = null; };
  }, [auth, config, sent]);
  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function submit(event) {
    event.preventDefault();
    if (busy || !config || (!sent && cooldown)) return;
    setBusy(true);
    setFeedback(null);
    try {
      if (factor) {
        await verifySecondFactor(factor.client, factor.id, code);
        await onVerified(factor.client);
        return;
      }
      if (!sent) {
        const token = await challenge.current?.execute();
        if (!token) throw Object.assign(new Error('A confirmação de segurança está indisponível.'), { code: 'captcha_unavailable' });
        await auth.request(config, 'otp', { email, create_user: false, gotrue_meta_security: { captcha_token: token } }, { redirectTo: 'https://onframe.onblide.com/connect?verification=email' });
        setSent(true);
        setCooldown(60);
        setCode('');
        return;
      }
      if (!/^\d+$/u.test(code) || code.length !== codeLength) throw new Error('Informe o código recebido por e-mail.');
      const session = await auth.request(config, 'verify', { email, token: code, type: 'email' });
      const client = await restoreProviderSession(config, session);
      const { data: identity, error: identityError } = await client.auth.getUser();
      if (identityError || identity.user.email?.toLowerCase() !== email.toLowerCase()) throw new Error('A conta verificada não corresponde a este perfil.');
      const { data: factors, error } = await client.auth.mfa.listFactors();
      if (error) throw error;
      if (factors.totp.length) {
        setFactor({ client, id: factors.totp[0].id, factors: factors.totp });
        setCode('');
      } else await onVerified(client);
    } catch (error) {
      if (!sent && (error?.code === 'over_email_send_rate_limit' || error?.status === 429)) setCooldown(60);
      setFeedback(factor ? 'Código do aplicativo inválido ou expirado. Tente novamente.' : sent ? 'Código inválido ou expirado. Confira o código e tente novamente.' : auth.authErrorMessage(error, 'Não foi possível enviar o código. Tente novamente.'));
      if (!sent) challenge.current?.reset();
    } finally { setBusy(false); }
  }

  return <VerificationFrame title={factor ? 'Confirme no aplicativo' : sent ? 'Verifique seu e-mail' : `Verifique seu e-mail para ${purpose}`}>
    <form className="onframe-auth-fields" onSubmit={submit} aria-busy={busy}>
      <VerificationEmailField email={email} />
      {factor?.factors.length > 1 && <Tabs size="sm" tabs={factor.factors.map((value, index) => ({ id: value.id, label: value.friendly_name || `Autenticador ${index + 1}` }))} active={factor.id} onChange={(id) => { setFactor((current) => ({ ...current, id })); setCode(''); setFeedback(null); }} />}
      {sent && <VerificationCodeField label={factor ? 'Código do aplicativo autenticador' : 'Código recebido por e-mail'} length={codeLength} value={code} onChange={(value) => { setCode(value); setFeedback(null); }} error={Boolean(feedback)} disabled={busy} />}
      {sent && !factor && <p className="onframe-help">Enviamos um código de {codeLength} dígitos para este e-mail.</p>}
      {feedback && <Alert tone="danger">{feedback}</Alert>}
      {!sent && <div className="onframe-captcha" ref={challengeRef} />}
      <Button type="submit" disabled={busy || !config || (!sent && cooldown > 0) || (sent && code.length !== codeLength)} style={{ width: '100%' }}>{busy ? 'Aguarde...' : factor ? 'Verificar aplicativo' : sent ? 'Verificar identidade' : cooldown > 0 ? `Enviar código em ${cooldown} s` : 'Enviar código'}</Button>
    </form>
    {sent && !factor && <div className="onframe-auth-footer">
      {cooldown > 0 ? <p className="onframe-help" role="status">Reenviar código em {cooldown} s</p> : <Link href="#reenviar-codigo" onClick={(event) => { event.preventDefault(); if (busy) return; setSent(false); setCode(''); setFeedback(null); }}>Reenviar código</Link>}
    </div>}
  </VerificationFrame>;
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
  const factors = (securityOverview?.factors || []).filter((factor) => factor.type === 'totp');

  useEffect(() => () => {
    const client = clientRef.current;
    const pending = pendingRef.current;
    if (client && pending) void client.auth.mfa.unenroll({ factorId: pending }).catch(() => undefined);
    clientRef.current = null;
    pendingRef.current = null;
  }, []);

  async function action(callback) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try { await callback(); } catch { setNotice({ tone: 'danger', message: 'Não foi possível concluir a operação. Confira o código ou verifique novamente sua identidade.' }); }
    finally { setBusy(false); }
  }

  async function enroll() {
    await action(async () => {
      const { data, error } = await clientRef.current.auth.mfa.enroll({ factorType: 'totp', friendlyName: name.trim(), issuer: 'OnFrame' });
      if (error) throw error;
      pendingRef.current = data.id;
      setEnrollment(data);
      setCode('');
    });
  }

  async function confirmEnrollment(event) {
    event.preventDefault();
    await action(async () => {
      await verifySecondFactor(clientRef.current, enrollment.id, code);
      pendingRef.current = null;
      setEnrollment(null);
      setCode('');
      setNotice({ tone: 'success', message: 'Verificação em duas etapas ativada. Entre novamente para continuar.' });
      await onDisconnect();
    });
  }

  return <section className="onframe-stack onframe-security-form" aria-label="Verificação em duas etapas">
    {verified && !enrollment && !removal && <>
      <p className="onframe-muted">Adicione um aplicativo autenticador para proteger o acesso à sua conta.</p>
      <Stepper variant="compact" size="sm" steps={[{ label: 'Verificar identidade' }, { label: 'Configurar autenticador' }, { label: 'Confirmar código' }]} current={1} />
    </>}
    {notice && !enrollment && !removal && <Alert tone={notice.tone}>{notice.message}</Alert>}
    {!verified ? <EmailVerification email={profile.user.email} purpose="configurar a verificação em duas etapas" onVerified={(client) => { clientRef.current = client; setVerified(true); }} /> : enrollment ? <VerificationFrame title="Confirme seu autenticador"><form className="onframe-auth-fields" onSubmit={confirmEnrollment}>
      <VerificationEmailField email={profile.user.email} />
      <p className="onframe-muted">Leia o QR code no aplicativo autenticador ou use a chave de configuração.</p>
      <img className="onframe-authenticator-qr" src={enrollment.totp.qr_code.startsWith('data:') ? enrollment.totp.qr_code : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.totp.qr_code)}`} alt="QR code de configuração do autenticador" />
      <Input label="Chave de configuração" value={enrollment.totp.secret} readOnly autoComplete="off" />
      <VerificationCodeField label="Código do aplicativo" length={6} value={code} onChange={(value) => { setCode(value); setNotice(null); }} error={notice?.tone === 'danger'} disabled={busy} />
      {notice && <Alert tone={notice.tone}>{notice.message}</Alert>}
      <div className="onframe-actions"><Button type="submit" disabled={busy || code.length !== 6} icon={<Ph n="shield-check" size={18} />}>Ativar verificação em duas etapas</Button><Button kind="secondary" disabled={busy} onClick={() => void action(async () => {
        const { error } = await clientRef.current.auth.mfa.unenroll({ factorId: enrollment.id });
        if (error) throw error;
        pendingRef.current = null; setEnrollment(null); setCode('');
      })}>Cancelar configuração</Button></div>
    </form></VerificationFrame> : <>
      {!removal && <List dividers ariaLabel="Aplicativos autenticadores">{factors.map((factor) => <ListItem key={factor.id} leading={<Ph n="device-mobile" size={20} />} title={factor.name || 'Aplicativo autenticador'} description={`Adicionado em ${formatDate(factor.createdAt)}`} trailing={<Button kind="secondary" size="sm" disabled={busy} onClick={() => { setRemoval(factor); setCode(''); setNotice(null); }}>Remover</Button>} />)}</List>}
      {removal ? <VerificationFrame title="Confirme a remoção"><form className="onframe-auth-fields" onSubmit={(event) => {
        event.preventDefault(); void action(async () => {
          await verifySecondFactor(clientRef.current, removal.id, code);
          const { error } = await clientRef.current.auth.mfa.unenroll({ factorId: removal.id });
          if (error) throw error;
          setRemoval(null); setCode('');
          await onDisconnect();
        });
      }}>
        <VerificationEmailField email={profile.user.email} />
        <Alert tone="warning">Remover este autenticador encerra suas sessões. Se for o último, sua conta deixará de exigir o código do aplicativo.</Alert>
        <VerificationCodeField label="Código do autenticador a remover" length={6} value={code} onChange={(value) => { setCode(value); setNotice(null); }} error={notice?.tone === 'danger'} disabled={busy} />
        {notice && <Alert tone={notice.tone}>{notice.message}</Alert>}
        <div className="onframe-actions"><Button kind="secondary" disabled={busy} onClick={() => setRemoval(null)}>Cancelar</Button><Button type="submit" kind="danger" disabled={busy || code.length !== 6}>Remover autenticador</Button></div>
      </form></VerificationFrame> : <>
        <Input label="Nome do autenticador" value={name} maxLength={64} disabled={busy} onChange={(event) => setName(event.target.value)} />
        <div className="onframe-actions"><Button disabled={busy || !name.trim()} icon={<Ph n="plus" size={18} />} onClick={() => void enroll()}>Adicionar autenticador</Button></div>
      </>}
    </>}
  </section>;
}

export function PasskeySettings({ profile, securityOverview }) {
  const [opened, setOpened] = useState(false);
  return <section className="onframe-stack onframe-security-form" aria-label="Chaves de acesso">
    <p className="onframe-muted">Use uma chave de acesso para entrar com a biometria ou o desbloqueio do seu dispositivo.</p>
    <List dividers ariaLabel="Chaves cadastradas">{(securityOverview?.passkeys || []).map((key) => <ListItem key={key.id} leading={<Ph n="key" size={20} />} title={key.name || 'Chave de acesso'} wrap description={`Adicionada em ${formatDate(key.createdAt)} · ${key.lastUsedAt ? `Último uso: ${formatDate(key.lastUsedAt)}` : 'Ainda não utilizada'}`} />)}</List>
    {opened ? <Alert tone="info">Continue na aba segura aberta para criar, renomear ou remover suas chaves de acesso.</Alert> : <EmailVerification email={profile.user.email} purpose="gerenciar suas chaves de acesso" onVerified={async (client) => {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) throw error || new Error('session');
      const url = new URL('https://onframe.onblide.com/auth/passkeys?action=manage');
      url.hash = new URLSearchParams({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }).toString();
      openExternal(url.toString()); setOpened(true);
    }} />}
  </section>;
}
