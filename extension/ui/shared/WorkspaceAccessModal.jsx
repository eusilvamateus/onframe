import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Input, Modal, Select, Tabs } from '@onblide/ui';

function accountName(account) {
  return account.displayName || account.display_name || account.nickname || `Conta ${account.userId || account.user_id || ''}`.trim();
}

export function WorkspaceAccessModal({ dialog, accounts, busy, onClose, onConfirm }) {
  const member = dialog?.member;
  const [kind, setKind] = useState('email');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('collaborator');
  const [accountIds, setAccountIds] = useState([]);

  useEffect(() => {
    setKind('email');
    setEmail('');
    setRole(member?.role || 'collaborator');
    setAccountIds((member?.accounts || []).map((account) => account.id || account.accountId).filter(Boolean));
  }, [member, dialog?.type]);

  if (!dialog || !['invite', 'member'].includes(dialog.type)) return null;
  const isInvite = dialog.type === 'invite';
  const administrator = role === 'admin';
  const demotingAdmin = !isInvite && member.role === 'admin' && !administrator;

  return (
    <Modal
      open
      onClose={onClose}
      title={isInvite ? 'Convidar pessoa' : `Acesso de ${member.name || member.email}`}
      footer={<><Button kind="secondary" disabled={busy} onClick={onClose}>Cancelar</Button><Button kind={demotingAdmin ? 'danger' : 'primary'} disabled={busy || (isInvite && kind === 'email' && !email.trim())} onClick={() => onConfirm({ kind, email: email.trim(), role, accountIds })}>{isInvite ? 'Enviar convite' : demotingAdmin ? 'Rebaixar administrador' : 'Salvar acesso'}</Button></>}
    >
      <div className="onframe-stack">
        {isInvite && <Tabs tabs={[{ id: 'email', label: 'E-mail' }, { id: 'link', label: 'Link' }]} active={kind} onChange={setKind} variant="pill" size="sm" />}
        {isInvite && kind === 'email' && <Input label="E-mail" type="email" value={email} placeholder="pessoa@empresa.com" onChange={(event) => setEmail(event.target.value)} />}
        <Select label="Permissão" options={['Colaborador', 'Administrador']} value={administrator ? 'Administrador' : 'Colaborador'} onChange={(value) => setRole(value === 'Administrador' ? 'admin' : 'collaborator')} />
        {administrator && <p className="onframe-muted">Administradores acessam todas as contas e podem gerenciar pessoas e convites.</p>}
        {demotingAdmin && <Alert tone="warning">Esta pessoa perderá a administração e terá acesso somente às contas atribuídas abaixo.</Alert>}
        {!administrator && (
          <div className="onframe-stack">
            <p className="onframe-field-label">Contas atribuídas</p>
            {accounts.length === 0 ? <p className="onframe-muted">Nenhuma conta conectada.</p> : (
              <div className="onframe-check-list">
                {accounts.map((account) => {
                  const id = account.id;
                  return <Checkbox key={id} checked={accountIds.includes(id)} label={accountName(account)} onChange={(checked) => setAccountIds((current) => checked ? [...current, id] : current.filter((value) => value !== id))} />;
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
