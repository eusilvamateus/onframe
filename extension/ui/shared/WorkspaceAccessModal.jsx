import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Input, Modal, Select, Tabs } from '@onblide/ui';

function accountName(account) {
  return (
    account.displayName ||
    account.display_name ||
    account.nickname ||
    `Conta ${account.userId || account.user_id || ''}`.trim()
  );
}

export function WorkspaceAccessModal({
  dialog,
  accounts,
  roles = [],
  busy,
  initialValues,
  onDraftChange,
  onClose,
  onConfirm
}) {
  const member = dialog?.member;
  const [values, setValues] = useState({
    kind: 'email',
    email: '',
    roleId: '',
    accountIds: []
  });

  useEffect(() => {
    setValues(
      dialog?.type === 'invite'
        ? {
            kind: initialValues?.kind === 'link' ? 'link' : 'email',
            email: initialValues?.email || '',
            roleId: initialValues?.roleId || '',
            accountIds: Array.isArray(initialValues?.accountIds) ? initialValues.accountIds : []
          }
        : {
            kind: 'email',
            email: '',
            roleId: member?.roleId || '',
            accountIds: (member?.accounts || []).map((account) => account.id || account.accountId).filter(Boolean)
          }
    );
  }, [member, dialog?.type]);

  if (!dialog || !['invite', 'member'].includes(dialog.type)) return null;
  const isInvite = dialog.type === 'invite';
  const { kind, email, accountIds } = values;
  const availableRoles = roles;
  const roleId = values.roleId || (isInvite ? availableRoles.find((option) => option.isDefault)?.id : '');
  const selectedRole = availableRoles.find((option) => option.id === roleId);
  const administrator = roleId === 'admin';
  const demotingAdmin = !isInvite && member.roleId === 'admin' && !administrator;

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
      footer={
        <>
          <Button kind="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            kind={demotingAdmin ? 'danger' : 'primary'}
            disabled={busy || !selectedRole || (isInvite && kind === 'email' && !email.trim())}
            onClick={() => onConfirm({ kind, email: email.trim(), roleId, accountIds })}
          >
            {isInvite ? 'Enviar convite' : demotingAdmin ? 'Rebaixar administrador' : 'Salvar acesso'}
          </Button>
        </>
      }
    >
      <div className="onframe-stack">
        {dialog.error && (
          <Alert appearance="soft" tone="danger">
            {dialog.error}
          </Alert>
        )}
        {isInvite && (
          <Tabs
            tabs={[
              { id: 'email', label: 'E-mail' },
              { id: 'link', label: 'Link' }
            ]}
            active={kind}
            onChange={(value) => update({ kind: value })}
            variant="pill"
            size="sm"
          />
        )}
        {isInvite && kind === 'email' && (
          <Input
            label="E-mail"
            type="email"
            value={email}
            placeholder="pessoa@empresa.com"
            onChange={(event) => update({ email: event.target.value })}
          />
        )}
        <Select
          label="Perfil de usuário"
          options={availableRoles.map((option) => option.name)}
          value={selectedRole?.name || null}
          disabled={availableRoles.length === 0}
          onChange={(value) => {
            const nextRole = availableRoles.find((option) => option.name === value);
            if (nextRole) update({ roleId: nextRole.id });
          }}
        />
        {administrator && (
          <p className="onframe-muted">Administradores acessam todas as contas e podem gerenciar pessoas e convites.</p>
        )}
        {demotingAdmin && (
          <Alert appearance="soft" tone="warning">
            Esta pessoa perderá a administração e terá acesso somente às contas atribuídas abaixo.
          </Alert>
        )}
        {!administrator && (
          <div className="onframe-stack">
            <p className="onframe-field-label">Contas atribuídas</p>
            {accounts.length === 0 ? (
              <p className="onframe-muted">Nenhuma conta conectada.</p>
            ) : (
              <div className="onframe-check-list">
                {accounts.map((account) => {
                  const id = account.id;
                  return (
                    <Checkbox
                      key={id}
                      checked={accountIds.includes(id)}
                      label={accountName(account)}
                      onChange={(checked) =>
                        update({
                          accountIds: checked ? [...accountIds, id] : accountIds.filter((value) => value !== id)
                        })
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
