import React, { useRef, useState } from 'react';
import { Alert, Button, Input, Ph, Stepper } from '@onblide/ui';
import { PasswordField } from '../shared/AuthPanel';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { EmailVerification } from './TwoFactorSettings';

export function CredentialSettings({ kind, profile, onChanged }) {
  const client = useRef(null);
  const [verified, setVerified] = useState(false);
  const [value, setValue] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [complete, setComplete] = useState(false);
  const password = kind === 'password';

  async function submit(event) {
    event.preventDefault();
    if (busy || !client.current) return;
    const email = password ? '' : window.OnFrameRemoteAuth.normalizeEmail(value);
    if (password && (!value || value !== confirmation)) { setNotice({ tone: 'warning', message: 'As novas senhas não coincidem.' }); return; }
    if (!password && (!email || email === profile.user.email.toLowerCase())) { setNotice({ tone: 'warning', message: 'Informe um novo e-mail válido.' }); return; }
    setBusy(true); setNotice(null);
    try {
      const flow = password ? null : await sendRemoteMessage('auth-flow-start');
      const { error } = await client.current.auth.updateUser(password ? { password: value } : { email }, flow ? { emailRedirectTo: flow.redirectTo } : undefined);
      if (error) throw error;
      setValue(''); setConfirmation(''); setComplete(true);
      if (password) {
        const { data } = await client.current.auth.getSession();
        let synchronized = true;
        try { await sendRemoteMessage('identity-sync', { accessToken: data.session?.access_token, disconnect: true }); }
        catch { synchronized = false; }
        await onChanged({ tone: synchronized ? 'success' : 'warning', message: synchronized ? 'Senha atualizada. Entre novamente para continuar.' : 'Senha atualizada. Entre novamente quando a verificação do serviço retornar.' });
      } else setNotice({ tone: 'info', message: 'Confirme a alteração nos e-mails enviados. O endereço só muda após as confirmações necessárias; depois, entre novamente.' });
      client.current = null;
    } catch (error) {
      setNotice({ tone: 'danger', message: window.OnFrameRemoteAuth.authErrorMessage(error, userError(error, 'Não foi possível alterar a credencial.')) });
    } finally { setBusy(false); }
  }

  return <section className="onframe-stack onframe-security-form" aria-label={password ? 'Alterar senha' : 'Alterar e-mail'}>
    {verified && <Stepper variant="compact" size="sm" current={complete ? 2 : 1} steps={[{ label: 'Verificar e-mail atual' }, { label: password ? 'Definir nova senha' : 'Definir novo e-mail' }, { label: 'Concluir alteração' }]} />}
    {notice && <Alert tone={notice.tone}>{notice.message}</Alert>}
    {!verified ? <EmailVerification email={profile.user.email} purpose={password ? 'alterar sua senha' : 'alterar seu e-mail'} onVerified={(provider) => { client.current = provider; setVerified(true); }} /> : !complete && <form className="onframe-stack" onSubmit={submit}>
      {password ? <>
        <PasswordField label="Nova senha" value={value} onChange={setValue} autoComplete="new-password" disabled={busy} />
        <PasswordField label="Confirme a nova senha" value={confirmation} onChange={setConfirmation} autoComplete="new-password" disabled={busy} />
        <p className="onframe-help">A alteração encerra suas sessões. Você precisará entrar novamente.</p>
      </> : <>
        <Input label="E-mail atual" value={profile.user.email} disabled />
        <Input label="Novo e-mail" type="email" inputMode="email" autoComplete="email" value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} />
        <p className="onframe-help">O novo endereço também precisa ser confirmado.</p>
      </>}
      <div className="onframe-actions"><Button type="submit" disabled={busy || !value} icon={<Ph n={password ? 'password' : 'envelope-simple'} size={18} />}>{password ? 'Salvar nova senha' : 'Confirmar novo e-mail'}</Button></div>
    </form>}
  </section>;
}
