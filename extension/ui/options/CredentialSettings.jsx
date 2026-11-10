import { useRef, useState } from 'react';
import { Alert, Button, Input, Ph } from '@onblide/ui';
import { AuthStep, PasswordField, PasswordStrength } from '../shared/AuthPanel';
import { passwordMeetsRequirements } from '../shared/password-policy';
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
    if (password && !passwordMeetsRequirements(value)) {
      setNotice({ tone: 'warning', message: 'Sua senha ainda não atende a todos os requisitos.' });
      return;
    }
    if (password && value !== confirmation) {
      setNotice({ tone: 'warning', message: 'As novas senhas não coincidem.' });
      return;
    }
    if (!password && (!email || email === profile.user.email.toLowerCase())) {
      setNotice({ tone: 'warning', message: 'Informe um novo e-mail válido.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const flow = password ? null : await sendRemoteMessage('auth-flow-start');
      const { error } = await client.current.auth.updateUser(
        password ? { password: value } : { email },
        flow ? { emailRedirectTo: flow.redirectTo } : undefined
      );
      if (error) throw error;
      setValue('');
      setConfirmation('');
      setComplete(true);
      if (password) {
        const { data } = await client.current.auth.getSession();
        let synchronized = true;
        try {
          await sendRemoteMessage('identity-sync', { accessToken: data.session?.access_token, disconnect: true });
        } catch {
          synchronized = false;
        }
        await onChanged({
          tone: synchronized ? 'success' : 'warning',
          message: synchronized
            ? 'Senha atualizada. Entre novamente para continuar.'
            : 'Senha atualizada. Entre novamente quando a verificação do serviço retornar.'
        });
      } else
        setNotice({
          tone: 'info',
          message:
            'Confirme a alteração nos e-mails enviados. O endereço só muda após as confirmações necessárias; depois, entre novamente.'
        });
      client.current = null;
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: window.OnFrameRemoteAuth.authErrorMessage(
          error,
          userError(error, 'Não foi possível alterar a credencial.')
        )
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="onframe-stack onframe-security-form onframe-credential-form"
      aria-label={password ? 'Alterar senha' : 'Alterar e-mail'}
    >
      {!verified ? (
        <EmailVerification
          email={profile.user.email}
          purpose={password ? 'alterar sua senha' : 'alterar seu e-mail'}
          onVerified={(provider) => {
            client.current = provider;
            setVerified(true);
          }}
        />
      ) : complete ? (
        <AuthStep
          headingLevel={2}
          icon={password ? 'check-circle' : 'envelope-simple'}
          iconTone={password ? 'var(--ob-green)' : 'var(--ob-blue)'}
          title={password ? 'Senha alterada' : 'Confira seus e-mails'}
          description={
            password
              ? 'Sua nova senha já está valendo. Entre novamente para continuar.'
              : 'Enviamos as confirmações necessárias. O endereço só muda depois que elas forem concluídas.'
          }
        >
          {notice && (
            <Alert appearance="soft" tone={notice.tone}>
              {notice.message}
            </Alert>
          )}
        </AuthStep>
      ) : (
        <AuthStep
          headingLevel={2}
          icon={password ? 'password' : 'envelope-simple'}
          iconTone="var(--ob-blue)"
          title={password ? 'Crie uma senha nova' : 'Altere seu e-mail'}
          description={
            password
              ? `Defina uma nova senha para ${profile.user.email}.`
              : `Seu e-mail atual é ${profile.user.email}. O novo endereço também precisará ser confirmado.`
          }
        >
          <form className="onframe-stack" onSubmit={submit}>
            {notice && (
              <Alert appearance="soft" tone={notice.tone}>
                {notice.message}
              </Alert>
            )}
            {password ? (
              <>
                <PasswordField
                  label="Senha nova"
                  value={value}
                  onChange={setValue}
                  autoComplete="new-password"
                  disabled={busy}
                />
                <PasswordStrength password={value} />
                <PasswordField
                  label="Confirme a senha nova"
                  value={confirmation}
                  onChange={setConfirmation}
                  autoComplete="new-password"
                  disabled={busy}
                />
                <p className="onframe-help">A alteração encerra suas sessões. Você precisará entrar novamente.</p>
              </>
            ) : (
              <Input
                size="lg"
                label="Novo e-mail"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={value}
                disabled={busy}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
            <div className="onframe-auth-actions">
              <Button
                type="submit"
                size="lg"
                disabled={busy || !value}
                icon={<Ph n={password ? 'password' : 'envelope-simple'} size={18} />}
              >
                {password ? 'Salvar nova senha' : 'Confirmar novo e-mail'}
              </Button>
            </div>
          </form>
        </AuthStep>
      )}
    </section>
  );
}
