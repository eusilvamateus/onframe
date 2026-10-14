import { useCallback, useEffect, useState } from 'react';
import { Alert, Avatar, Badge, Button, List, ListItem, Modal, Ph, Skeleton, Tooltip, toast } from '@onblide/ui';
import { WorkspaceAccessModal } from '../shared/WorkspaceAccessModal';
import { formatDate, sendRemoteMessage, userError } from '../shared/runtime';
import { PopupSessionHeader } from './PopupSessionHeader';

function memberAccess(member) {
  if (member.role === 'admin') return 'Administrador · Todas as contas';
  const count = (member.accounts || []).length;
  return `Colaborador · ${count === 0 ? 'Nenhuma conta' : `${count} ${count === 1 ? 'conta' : 'contas'}`}`;
}

function PopupIcon({ name, tone = 'blue' }) {
  return <span className={`onframe-popup-icon-tile onframe-popup-icon-tile--${tone}`}><Ph n={name} size={18} /></span>;
}

function LoadingList() {
  return <div className="onframe-popup-loading-list" aria-label="Carregando workspace">
    {[0, 1, 2].map((item) => <div className="onframe-popup-loading-row" key={item}><Skeleton circle height={36} /><div><Skeleton width={132} height={13} /><Skeleton width={210} height={10} /></div></div>)}
  </div>;
}

export function WorkspaceSession({ connection, onBack, onOpenOptions, onConnectionChanged, footer }) {
  const admin = connection.workspace.role === 'admin';
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(admin);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [dialog, setDialog] = useState(null);

  const loadWorkspace = useCallback(async () => {
    if (!admin) return;
    const [memberResult, invitationResult, accountResult] = await Promise.all([
      sendRemoteMessage('members'),
      sendRemoteMessage('invitations'),
      sendRemoteMessage('accounts')
    ]);
    setMembers(memberResult.members || []);
    setInvitations(invitationResult.invitations || []);
    setAccounts(accountResult.accounts || []);
  }, [admin]);

  useEffect(() => {
    let active = true;
    if (!admin) return () => { active = false; };
    setLoading(true);
    void loadWorkspace()
      .catch((error) => { if (active) setFeedback({ tone: 'danger', message: userError(error) }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [admin, loadWorkspace]);

  async function run(action, successMessage) {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await action();
      if (successMessage) toast({ tone: 'success', title: successMessage });
      return result;
    } catch (error) {
      setFeedback({ tone: 'danger', message: userError(error) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submitAccess(values) {
    const currentDialog = dialog;
    const result = await run(async () => {
      if (currentDialog.type === 'member') {
        await sendRemoteMessage('member-update', {
          userId: currentDialog.member.id,
          payload: { role: values.role, accountIds: values.accountIds }
        });
        await loadWorkspace();
        return { updated: true };
      }

      const response = await sendRemoteMessage('invitation-create', { payload: values });
      await loadWorkspace();
      return response;
    }, currentDialog.type === 'member' ? 'Acesso atualizado.' : values.kind === 'email' ? 'Convite enviado.' : null);

    if (!result) return;
    setDialog(null);
    const invitationUrl = result.invitation?.url;
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      toast({ tone: 'success', title: 'Link de convite copiado.' });
    } catch {
      setFeedback({
        tone: 'warning',
        message: 'O convite foi criado, mas o link não foi copiado.',
        action: 'Copiar link',
        onAction: () => void navigator.clipboard.writeText(invitationUrl)
          .then(() => { setFeedback(null); toast({ tone: 'success', title: 'Link copiado.' }); })
          .catch(() => setFeedback((current) => current && { ...current, message: 'Não foi possível copiar o link. Tente novamente.' }))
      });
    }
  }

  async function confirmDestructive() {
    const currentDialog = dialog;
    if (!currentDialog) return;
    const result = await run(async () => {
      if (currentDialog.type === 'member-delete') {
        await sendRemoteMessage('member-remove', { userId: currentDialog.member.id });
        await loadWorkspace();
      }
      if (currentDialog.type === 'invitation-delete') {
        await sendRemoteMessage('invitation-revoke', { invitationId: currentDialog.invitation.id });
        await loadWorkspace();
      }
      if (currentDialog.type === 'workspace-leave') {
        await sendRemoteMessage('workspace-leave');
      }
      return true;
    }, currentDialog.type === 'member-delete' ? 'Pessoa removida.' : currentDialog.type === 'invitation-delete' ? 'Convite revogado.' : 'Você saiu do workspace.');

    if (!result) return;
    setDialog(null);
    if (currentDialog.type === 'workspace-leave') {
      await onConnectionChanged();
      onBack();
    }
  }

  const currentUserId = connection.user.id;
  const canLeave = members.filter((member) => member.role === 'admin').length > 1;
  const confirmation = ['member-delete', 'invitation-delete', 'workspace-leave'].includes(dialog?.type);
  const confirmationTitle = dialog?.type === 'member-delete' ? 'Remover pessoa' : dialog?.type === 'invitation-delete' ? 'Revogar convite' : 'Sair do workspace';
  const confirmationCopy = dialog?.type === 'member-delete'
    ? `Remover ${dialog.member.name || dialog.member.email} deste workspace? O acesso às contas atribuídas será encerrado.`
    : dialog?.type === 'invitation-delete'
      ? 'Revogar este convite? O link ou e-mail enviado deixará de conceder acesso.'
      : `Sair de ${connection.workspace.name}? Você perderá acesso às contas e pessoas deste workspace.`;

  return (
    <main className="onframe-popup onframe-popup-session">
      <PopupSessionHeader title="Workspace" subtitle={connection.workspace.name} onBack={onBack} onOpenOptions={onOpenOptions} />

      <div className="onframe-popup-session-body">
        {feedback && <Alert tone={feedback.tone} action={feedback.action} onAction={feedback.onAction} dismissible onClose={() => setFeedback(null)}>{feedback.message}</Alert>}
        {!admin && <Alert tone="info">Somente administradores podem gerenciar pessoas, convites e permissões deste workspace.</Alert>}
        {loading ? <LoadingList /> : admin && <>
          <section className="onframe-popup-section" aria-labelledby="workspace-people-title">
            <div className="onframe-popup-section-header">
              <div><h2 id="workspace-people-title">Pessoas</h2><p>{members.length} {members.length === 1 ? 'pessoa' : 'pessoas'} neste workspace</p></div>
              <Tooltip label="Convidar pessoa" placement="left"><Button kind="quiet" tone="primary" size="sm" iconOnly disabled={busy} aria-label="Convidar pessoa" onClick={() => setDialog({ type: 'invite' })} icon={<Ph n="user-plus" size={18} />} /></Tooltip>
            </div>
            <List className="onframe-popup-card-list" ariaLabel="Pessoas do workspace">
              {members.map((member) => {
                const self = member.id === currentUserId;
                return <ListItem
                  key={member.id}
                  className="onframe-popup-card-row"
                  leading={<Avatar name={member.name || member.email} src={member.avatarUrl} alt="" size={36} />}
                  title={member.name || member.email}
                  description={memberAccess(member)}
                  strong
                  onClick={self ? undefined : () => setDialog({ type: 'member', member })}
                  trailing={self
                    ? <Badge tone="blue">Você</Badge>
                    : <><Tooltip label="Remover pessoa" placement="left"><Button kind="quiet" tone="danger" size="sm" iconOnly disabled={busy} aria-label={`Remover ${member.name || member.email}`} onClick={(event) => { event.stopPropagation(); setDialog({ type: 'member-delete', member }); }} icon={<Ph n="trash" size={16} />} /></Tooltip><Ph n="caret-right" size={16} /></>}
                />;
              })}
            </List>
          </section>

          <section className="onframe-popup-section" aria-labelledby="workspace-invitations-title">
            <div className="onframe-popup-section-header">
              <div><h2 id="workspace-invitations-title">Convites pendentes</h2><p>{invitations.length ? `${invitations.length} aguardando aceite` : 'Nenhum convite pendente'}</p></div>
            </div>
            {invitations.length > 0 && <List className="onframe-popup-card-list" ariaLabel="Convites pendentes">
              {invitations.map((invitation) => <ListItem
                key={invitation.id}
                className="onframe-popup-card-row"
                leading={<PopupIcon name="envelope-simple" tone="orange" />}
                title={invitation.kind === 'email' ? invitation.email : 'Link compartilhável'}
                description={`${invitation.role === 'admin' ? 'Administrador' : 'Colaborador'} · expira ${formatDate(invitation.expiresAt)}`}
                wrap
                strong
                trailing={<Tooltip label="Revogar convite" placement="left"><Button kind="quiet" tone="danger" size="sm" iconOnly disabled={busy} aria-label="Revogar convite" onClick={() => setDialog({ type: 'invitation-delete', invitation })} icon={<Ph n="trash" size={16} />} /></Tooltip>}
              />)}
            </List>}
          </section>

          <section className="onframe-popup-section" aria-label="Ações do workspace">
            <List className="onframe-popup-card-list">
              <ListItem
                className="onframe-popup-card-row"
                tone="danger"
                leading={<PopupIcon name="sign-out" tone="red" />}
                title="Sair do workspace"
                description={canLeave ? 'Seu acesso será encerrado.' : 'Outro administrador é necessário para sair.'}
                disabled={!canLeave || busy}
                onClick={() => setDialog({ type: 'workspace-leave' })}
                trailing={<Ph n="caret-right" size={16} />}
              />
            </List>
          </section>
        </>}
      </div>

      {footer}

      <WorkspaceAccessModal dialog={dialog} accounts={accounts} busy={busy} onClose={() => setDialog(null)} onConfirm={(values) => void submitAccess(values)} />
      <Modal
        open={confirmation}
        onClose={() => setDialog(null)}
        title={confirmationTitle}
        role="alertdialog"
        footer={<><Button kind="secondary" disabled={busy} onClick={() => setDialog(null)}>Cancelar</Button><Button kind="danger" disabled={busy} onClick={() => void confirmDestructive()}>{dialog?.type === 'workspace-leave' ? 'Sair' : dialog?.type === 'invitation-delete' ? 'Revogar' : 'Remover'}</Button></>}
      >
        {confirmationCopy}
      </Modal>
    </main>
  );
}
