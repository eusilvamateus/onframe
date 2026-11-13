import { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Drawer,
  Input,
  List,
  ListItem,
  Modal,
  Ph,
  Select,
  Tabs
} from '@onblide/ui';
import { WORKSPACE_PERMISSION_RESOURCES } from './workspace-permissions';

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
  presentation = 'modal',
  initialValues,
  onDraftChange,
  onClose,
  onRemove,
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
  const accessRoles = roles.filter((option) => option.id !== 'admin');
  const roleId = values.roleId;
  const selectedRole = roles.find((option) => option.id === roleId);
  const administrator = roleId === 'admin';
  const demotingAdmin = !isInvite && member.roleId === 'admin' && !administrator;
  const promotingAdmin = administrator && (isInvite || member.roleId !== 'admin');

  function update(patch) {
    const next = { ...values, ...patch };
    setValues(next);
    if (isInvite) onDraftChange?.(next);
  }

  const footer = (
    <>
      <Button kind="secondary" disabled={busy} onClick={onClose}>
        Cancelar
      </Button>
      <Button
        kind={demotingAdmin ? 'danger' : 'primary'}
        loading={busy}
        disabled={!selectedRole || (isInvite && kind === 'email' && !email.trim())}
        onClick={() => onConfirm({ kind, email: email.trim(), roleId, accountIds })}
      >
        {isInvite
          ? administrator
            ? 'Convidar administrador'
            : 'Enviar convite'
          : demotingAdmin
            ? 'Rebaixar administrador'
            : promotingAdmin
              ? 'Tornar administrador'
              : 'Salvar acesso'}
      </Button>
    </>
  );
  const content = (
    <div className="onframe-stack">
      {dialog.error && (
        <Alert appearance="soft" tone="danger">
          {dialog.error}
        </Alert>
      )}
      {!isInvite && presentation === 'drawer' && (
        <div className="onframe-access-person">
          <Avatar name={member.name || member.email} src={member.avatarUrl} alt="" size={48} />
          <div>
            <strong>{member.name || member.email}</strong>
            <span>{member.email}</span>
          </div>
        </div>
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
      <Checkbox
        label="Administrador do workspace"
        checked={administrator}
        onChange={(checked) => update({ roleId: checked ? 'admin' : '' })}
      />
      {promotingAdmin && (
        <Alert appearance="soft" tone="warning">
          Administradores acessam todas as contas e podem gerenciar pessoas, convites e perfis.
        </Alert>
      )}
      {demotingAdmin && (
        <Alert appearance="soft" tone="warning">
          Esta pessoa perderá a administração e terá acesso somente às contas atribuídas abaixo.
        </Alert>
      )}
      {!administrator && (
        <div className="onframe-stack">
          <Select
            label="Perfil de acesso"
            options={accessRoles.map((option) => option.name)}
            value={selectedRole?.name || null}
            disabled={accessRoles.length === 0}
            onChange={(value) => {
              const nextRole = accessRoles.find((option) => option.name === value);
              if (nextRole) update({ roleId: nextRole.id });
            }}
          />
          {accessRoles.length === 0 && <p className="onframe-muted">Crie um perfil de acesso para esta pessoa.</p>}
          {selectedRole && presentation === 'drawer' && (
            <div className="onframe-access-role-summary">
              <strong>Permissões de {selectedRole.name}</strong>
              <List size="sm" ariaLabel={`Permissões de ${selectedRole.name}`}>
                {WORKSPACE_PERMISSION_RESOURCES.map((resource) => {
                  const actions = resource.actions.filter((action) =>
                    selectedRole.permissions?.includes(`${resource.id}.${action}`)
                  );
                  const label =
                    actions.length === 0
                      ? 'Sem acesso'
                      : actions.includes('delete') && actions.includes('write')
                        ? 'Editar e excluir'
                        : actions.includes('delete')
                          ? 'Excluir'
                          : actions.includes('write')
                            ? 'Editar'
                            : 'Ler';
                  return (
                    <ListItem
                      key={resource.id}
                      leading={<Ph n={resource.icon} size={16} />}
                      title={resource.label}
                      trailing={
                        <Badge
                          size="sm"
                          tone={
                            actions.length === 0
                              ? 'neutral'
                              : actions.includes('write') || actions.includes('delete')
                                ? 'success'
                                : 'primary'
                          }
                          appearance="plain"
                          dot
                        >
                          {label}
                        </Badge>
                      }
                    />
                  );
                })}
              </List>
            </div>
          )}
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
  );
  if (!isInvite && presentation === 'drawer') {
    return (
      <Drawer
        open
        onClose={busy ? () => {} : onClose}
        title="Acesso da pessoa"
        width="min(520px, 100vw)"
        footer={
          <div className="onframe-access-drawer-footer">
            <Button kind="ghost" tone="danger" disabled={busy} onClick={() => onRemove?.(member)}>
              Remover
            </Button>
            <div className="onframe-actions">{footer}</div>
          </div>
        }
      >
        {content}
      </Drawer>
    );
  }
  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title={isInvite ? 'Convidar pessoa' : `Acesso de ${member.name || member.email}`}
      footer={footer}
    >
      {content}
    </Modal>
  );
}
