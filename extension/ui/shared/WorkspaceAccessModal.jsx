import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Input, Modal, Select, Tabs } from '@onblide/ui';

function accountName(account) {
  return account.displayName || account.display_name || account.nickname || `Conta ${account.userId || account.user_id || ''}`.trim();
}

export function WorkspaceAccessModal({ dialog, accounts, busy, initialValues, onDraftChange, onClose, onConfirm }) {
  const member = dialog?.member;
  const [values, setValues] = useState({ kind: 'email', email: '', role: 'collaborator', accountIds: [] });

  useEffect(() => {
    setValues(dialog?.type === 'invite'
      ? {
          kind: initialValues?.kind === 'link' ? 'link' : 'email',
          email: initialValues?.email || '',
          role: initialValues?.role === 'admin' ? 'admin' : 'collaborator',
          accountIds: Array.isArray(initialValues?.accountIds) ? initialValues.accountIds : []
        }
      : {
          kind: 'email',
          email: '',
          role: member?.role || 'collaborator',
          accountIds: (member?.accounts || []).map((account) => account.id || account.accountId).filter(Boolean)
        });
  }, [member, dialog?.type]);

  if (!dialog || !['invite', 'member'].includes(dialog.type)) return null;
  const isInvite = dialog.type === 'invite';
  const { kind, email, role, accountIds } = values;
  const administrator = role === 'admin';
  const demotingAdmin = !isInvite && member.role === 'admin' && !administrator;

  function update(patch) {
    const next = { ...values, ...patch };
    setValues(next);
    if (isInvite) onDraftChange?.(next);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isInvite ? 'Convidar pessoa' : `Acesso de ${member.name || member.email}`}
      footer={<><Button kind="secondary" disabled={busy} onClick={onClose}>Cancelar</Button><Button kind={demotingAdmin ? 'danger' : 'primary'} disabled={busy || (isInvite && kind === 'email' && !email.trim())} onClick={() => onConfirm({ kind, email: email.trim(), role, accountIds })}>{isInvite ? 'Enviar convite' : demotingAdmin ? 'Rebaixar administrador' : 'Salvar acesso'}</Button></>}
    >
      <div className="onframe-stack">
        {isInvite && <Tabs tabs={[{ id: 'email', label: 'E-mail' }, { id: 'link', label: 'Link' }]} active={kind} onChange={(value) => update({ kind: value })} variant="pill" size="sm" />}
        {isInvite && kind === 'email' && <Input label="E-mail" type="email" value={email} placeholder="pessoa@empresa.com" onChange={(event) => update({ email: event.target.value })} />}
        <Select label="Permissão" options={['Colaborador', 'Administrador']} value={administrator ? 'Administrador' : 'Colaborador'} onChange={(value) => update({ role: value === 'Administrador' ? 'admin' : 'collaborator' })} />
        {administrator && <p className="onframe-muted">Administradores acessam todas as contas e podem gerenciar pessoas e convites.</p>}
        {demotingAdmin && <Alert tone="warning">Esta pessoa perderá a administração e terá acesso somente às contas atribuídas abaixo.</Alert>}
        {!administrator && (
          <div className="onframe-stack">
            <p className="onframe-field-label">Contas atribuídas</p>
            {accounts.length === 0 ? <p className="onframe-muted">Nenhuma conta conectada.</p> : (
              <div className="onframe-check-list">
                {accounts.map((account) => {
                  const id = account.id;
                  return <Checkbox key={id} checked={accountIds.includes(id)} label={accountName(account)} onChange={(checked) => update({ accountIds: checked ? [...accountIds, id] : accountIds.filter((value) => value !== id) })} />;
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
