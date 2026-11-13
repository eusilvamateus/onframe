import { useState } from 'react';
import { Alert, AlertDialog, Button, Drawer, Ph, Spinner } from '@onblide/ui';
import { SectionHeader } from '../shared/SectionHeader';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { EmailVerification } from './TwoFactorSettings';

function workspaceNames(workspaces) {
  return workspaces.map((workspace) => workspace.name).join(', ');
}

export function AccountDeletionSettings({ profile, securityOverview, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState(null);
  const [proof, setProof] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function openDeletion() {
    setOpen(true);
    setImpact(null);
    setProof(null);
    setError('');
    try {
      setImpact(await sendRemoteMessage('account-deletion-preview'));
    } catch (failure) {
      setError(userError(failure, 'Não foi possível preparar a exclusão da conta.'));
    }
  }

  async function verify(provider, details) {
    if (details?.verificationFlow) {
      setProof({ verificationFlow: details.verificationFlow });
      return;
    }
    const { data, error: sessionError } = await provider.auth.getSession();
    if (sessionError || !data.session?.access_token) throw new Error('Não foi possível confirmar sua identidade.');
    setProof({ accessToken: data.session.access_token });
  }

  async function removeAccount() {
    if (!proof || busy) return;
    setBusy(true);
    setError('');
    try {
      await sendRemoteMessage('account-delete-self', { proof });
      setConfirming(false);
      setOpen(false);
      onDeleted();
    } catch (failure) {
      setConfirming(false);
      if (failure?.code === 'account_deletion_cleanup_failed') {
        setOpen(false);
        onDeleted(true);
        return;
      }
      if (failure?.code === 'account_deletion_verification_required') setProof(null);
      if (failure?.code === 'account_deletion_blocked') {
        setProof(null);
        sendRemoteMessage('account-deletion-preview')
          .then(setImpact)
          .catch(() => undefined);
      }
      setError(userError(failure, 'Não foi possível excluir sua conta agora.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHeader
        title="Excluir conta"
        copy="Remova sua conta e seus acessos do OnFrame."
        actions={
          <Button kind="danger" icon={<Ph n="trash" size={18} />} onClick={() => void openDeletion()}>
            Excluir conta
          </Button>
        }
      />
      <Drawer
        open={open}
        onClose={busy ? () => {} : () => setOpen(false)}
        title="Excluir conta"
        width="min(520px, 100vw)"
        footer={
          <>
            <Button kind="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            {proof && !impact?.blockedWorkspaces?.length && (
              <Button kind="danger" disabled={busy} onClick={() => setConfirming(true)}>
                Excluir minha conta
              </Button>
            )}
          </>
        }
      >
        <div className="onframe-stack">
          {error && (
            <Alert appearance="soft" tone="danger">
              {error}
            </Alert>
          )}
          {!impact && !error && <Spinner label="Verificando seus workspaces" />}
          {impact && (
            <>
              {impact.blockedWorkspaces.length > 0 ? (
                <Alert appearance="soft" tone="warning">
                  Defina outra pessoa administradora em {workspaceNames(impact.blockedWorkspaces)} antes de excluir sua
                  conta.
                </Alert>
              ) : (
                <>
                  {impact.removedWorkspaces.length > 0 && (
                    <p>
                      {impact.removedWorkspaces.length === 1 ? 'O workspace' : 'Os workspaces'}{' '}
                      <strong>{workspaceNames(impact.removedWorkspaces)}</strong> e seus dados serão excluídos porque
                      não há outras pessoas participando.
                    </p>
                  )}
                  {impact.retainedWorkspaces.length > 0 && (
                    <p>
                      Seu acesso a <strong>{workspaceNames(impact.retainedWorkspaces)}</strong> será removido. Os dados
                      desses workspaces permanecerão para as outras pessoas.
                    </p>
                  )}
                  <p>Esta ação é permanente. Confirme sua identidade para continuar.</p>
                  {proof ? (
                    <Alert appearance="soft" tone="success">
                      Identidade confirmada.
                    </Alert>
                  ) : (
                    <EmailVerification
                      email={profile.user.email}
                      purpose="excluir sua conta"
                      allowPasskey={Boolean(securityOverview?.passkeys?.length)}
                      onVerified={verify}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </Drawer>
      <AlertDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Excluir sua conta?"
        confirmLabel="Excluir definitivamente"
        cancelLabel="Manter conta"
        tone="danger"
        loading={busy}
        onConfirm={() => void removeAccount()}
      >
        Você perderá o acesso ao OnFrame. Esta ação não pode ser desfeita.
      </AlertDialog>
    </>
  );
}
