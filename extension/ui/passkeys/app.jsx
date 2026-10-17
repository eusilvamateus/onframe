import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import '@onblide/ui/styles.css';
import { Alert, Button, Input, List, ListItem, LogoMark, Ph, Tabs } from '@onblide/ui';
import '../shared/app.css';
import { VerificationCodeField, VerificationEmailField, VerificationFrame } from '../shared/AuthPanel';
import { ThemeMenuButton } from '../shared/ThemeControl';
import { providerClient, verifySecondFactor } from '../shared/provider-auth';
import { formatDate } from '../shared/runtime';

const params = new URL(location.href).searchParams;
const fragment = new URLSearchParams(location.hash.slice(1));
const transientSession = { access_token: fragment.get('access_token') || '', refresh_token: fragment.get('refresh_token') || '' };
fragment.delete('access_token'); fragment.delete('refresh_token');
history.replaceState(null, document.title, location.pathname + location.search);
const managing = params.get('action') === 'manage';
const verifying = params.get('action') === 'verify';
const flow = params.get('flow') || '';

function PasskeyPage() {
  const [client, setClient] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState('');
  const [factor, setFactor] = useState(null);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [removal, setRemoval] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [complete, setComplete] = useState(false);
  const challengeRef = useRef(null);
  const challenge = useRef(null);

  useEffect(() => {
    if (!ready || managing || verifying || factor || complete || !challengeRef.current) return undefined;
    challenge.current = window.OnFrameRemoteAuth.createChallenge(challengeRef.current, () => {}, () => setNotice({ tone: 'danger', message: 'A confirmação de segurança está indisponível.' }));
    return () => { challenge.current?.destroy(); challenge.current = null; };
  }, [ready, Boolean(factor), complete]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/v1/auth/config', { cache: 'no-store' });
        if (!response.ok) throw new Error('config');
        const config = await response.json();
        const provider = providerClient(config);
        if (managing || verifying) {
          if (!transientSession.access_token || !transientSession.refresh_token) throw new Error('session');
          const { error } = await provider.auth.setSession(transientSession);
          transientSession.access_token = ''; transientSession.refresh_token = '';
          if (error) throw error;
          if (managing) {
            const { data: assurance, error: assuranceError } = await provider.auth.mfa.getAuthenticatorAssuranceLevel();
            if (assuranceError || assurance.nextLevel !== assurance.currentLevel) throw new Error('mfa');
            const { data, error: listError } = await provider.auth.passkey.list();
            if (listError) throw listError;
            if (active) setKeys(data);
          } else {
            if (!/^[A-Za-z0-9_-]{43}$/u.test(flow)) throw new Error('flow');
            const { data: identity, error: identityError } = await provider.auth.getUser();
            if (identityError || !identity.user?.email) throw identityError || new Error('identity');
            const { data, error: factorError } = await provider.auth.mfa.listFactors();
            if (factorError || !data.totp.length) throw factorError || new Error('factor');
            if (active) { setEmail(identity.user.email); setFactor({ id: data.totp[0].id, factors: data.totp }); }
          }
        } else if (!/^[A-Za-z0-9_-]{43}$/u.test(flow)) throw new Error('flow');
        if (active) { setClient(provider); setReady(true); }
      } catch {
        transientSession.access_token = ''; transientSession.refresh_token = '';
        if (active) setNotice({ tone: 'danger', message: 'Não foi possível preparar as chaves de acesso. Volte à extensão e verifique sua identidade novamente. O recurso também precisa estar habilitado no Supabase.' });
      }
    })();
    return () => { active = false; };
  }, []);

  async function run(callback) {
    if (busy || !client) return;
    setBusy(true); setNotice(null);
    try { await callback(); }
    catch (error) { setNotice({ tone: 'danger', message: error?.code === 'captcha_unavailable' ? 'A confirmação de segurança está indisponível. Tente novamente.' : error?.name === 'NotAllowedError' ? 'A solicitação foi cancelada ou expirou. Tente novamente.' : 'Não foi possível concluir a operação. Verifique a disponibilidade do recurso e tente novamente.' }); }
    finally { setBusy(false); }
  }

  async function refreshKeys() {
    const { data, error } = await client.auth.passkey.list();
    if (error) throw error;
    setKeys(data);
  }

  async function finishLogin(session) {
    const response = await fetch(`/v1/extension-auth-flows/${encodeURIComponent(flow)}`, {
      method: 'POST', headers: { authorization: `Bearer ${session.access_token}` }, cache: 'no-store'
    });
    if (!response.ok) throw new Error('flow');
    setComplete(true); setFactor(null); setCode('');
    setNotice({ tone: 'success', message: 'Acesso confirmado. Volte à extensão para continuar.' });
  }

  if (ready && factor && !complete) return <main className="onframe-auth-page">
    <div className="onframe-auth-page-theme"><ThemeMenuButton /></div>
    <VerificationFrame title="Confirme no aplicativo" headingLevel={1}>
      <form className="onframe-auth-fields" onSubmit={(event) => { event.preventDefault(); void run(async () => finishLogin(await verifySecondFactor(client, factor.id, code))); }} aria-busy={busy}>
        <VerificationEmailField email={email} />
        {factor.factors.length > 1 && <Tabs tabs={factor.factors.map((value, index) => ({ id: value.id, label: value.friendly_name || `Autenticador ${index + 1}` }))} active={factor.id} onChange={(id) => { setFactor((current) => ({ ...current, id })); setCode(''); setNotice(null); }} size="sm" />}
        <VerificationCodeField label="Código do aplicativo autenticador" length={6} value={code} onChange={(value) => { setCode(value); setNotice(null); }} error={notice?.tone === 'danger'} disabled={busy} />
        {notice && <Alert tone={notice.tone}>{notice.message}</Alert>}
        <Button type="submit" disabled={busy || code.length !== 6} style={{ width: '100%' }}>Verificar e entrar</Button>
      </form>
    </VerificationFrame>
  </main>;

  return <main className="onframe-auth-page">
    <div className="onframe-auth-page-theme"><ThemeMenuButton /></div>
    <section className="onframe-auth-surface onframe-stack" aria-label="Chaves de acesso">
    {!managing && <div className="onframe-brand"><LogoMark size={28} /><p className="onframe-eyebrow">ONFRAME</p></div>}
    <h1 className="onframe-page-title">{verifying ? 'Verificação em duas etapas' : managing ? 'Chaves de acesso' : 'Entrar com chave de acesso'}</h1>
    {notice && <Alert tone={notice.tone}>{notice.message}</Alert>}
    {ready && !managing && !verifying && !complete && !factor && <div className="onframe-captcha" ref={challengeRef} />}
    {ready && !managing && !complete && <Button disabled={busy} icon={<Ph n="key" size={18} />} onClick={() => void run(async () => {
      const captchaToken = await challenge.current?.execute();
      if (!captchaToken) throw Object.assign(new Error('A confirmação de segurança está indisponível.'), { code: 'captcha_unavailable' });
      let result;
      try { result = await client.auth.signInWithPasskey({ options: { captchaToken } }); }
      finally { challenge.current?.reset(); }
      const { data, error } = result;
      if (error || !data.session) throw error || new Error('session');
      const { data: factors, error: factorError } = await client.auth.mfa.listFactors();
      if (factorError) throw factorError;
      if (factors.totp.length) {
        const identityEmail = data.session.user?.email || (await client.auth.getUser()).data.user?.email;
        if (!identityEmail) throw new Error('identity');
        setEmail(identityEmail);
        setFactor({ id: factors.totp[0].id, factors: factors.totp });
      }
      else await finishLogin(data.session);
    })}>Usar chave de acesso</Button>}
    {ready && managing && <>
      <Input label="Nome da chave" value={name} maxLength={64} disabled={busy} onChange={(event) => setName(event.target.value)} />
      <div className="onframe-actions"><Button disabled={busy || Boolean(renaming) || !name.trim()} icon={<Ph n="plus" size={18} />} onClick={() => void run(async () => {
        const { data, error } = await client.auth.registerPasskey();
        if (error) throw error;
        // O cadastro ja existe, mesmo se a renomeacao falhar.
        setKeys((current) => [...current, data]);
        const { error: namingError } = await client.auth.passkey.update({ passkeyId: data.id, friendlyName: name.trim() });
        setName('');
        try { await refreshKeys(); }
        catch { setNotice({ tone: 'warning', message: 'Chave adicionada, mas a lista não pôde ser atualizada. Reabra o gerenciamento antes de criar outra chave.' }); return; }
        setNotice(namingError ? { tone: 'warning', message: 'Chave adicionada. Não foi possível salvar o nome; use Renomear para ajustá-lo.' } : { tone: 'success', message: 'Chave de acesso adicionada.' });
      })}>Criar chave de acesso</Button></div>
      <List dividers ariaLabel="Chaves de acesso cadastradas">{keys.map((key) => <ListItem key={key.id} leading={<Ph n="key" size={20} />} title={key.friendly_name || 'Chave de acesso'} description={`Adicionada em ${formatDate(key.created_at)} · ${key.last_used_at ? `Último uso: ${formatDate(key.last_used_at)}` : 'Ainda não utilizada'}`} wrap trailing={<div className="onframe-actions"><Button kind="secondary" size="sm" disabled={busy} onClick={() => { setRenaming(key); setName(key.friendly_name || ''); }}>Renomear</Button><Button kind="secondary" size="sm" disabled={busy} onClick={() => setRemoval(key)}>Remover</Button></div>} />)}</List>
      {renaming && <div className="onframe-actions"><Button kind="secondary" disabled={busy} onClick={() => setRenaming(null)}>Cancelar renomeação</Button><Button disabled={busy || !name.trim()} onClick={() => void run(async () => {
        const { error } = await client.auth.passkey.update({ passkeyId: renaming.id, friendlyName: name.trim() });
        if (error) throw error;
        setRenaming(null); setName(''); await refreshKeys();
      })}>Salvar nome</Button></div>}
      {removal && <div className="onframe-stack"><Alert tone="warning">Remover a chave {removal.friendly_name || 'selecionada'}? Ela não poderá mais ser usada para entrar.</Alert><div className="onframe-actions"><Button kind="secondary" disabled={busy} onClick={() => setRemoval(null)}>Cancelar</Button><Button kind="danger" disabled={busy} onClick={() => void run(async () => {
        const { error } = await client.auth.passkey.delete({ passkeyId: removal.id });
        if (error) throw error;
        setRemoval(null); await refreshKeys();
      })}>Remover chave de acesso</Button></div></div>}
    </>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<PasskeyPage />);
