import { useState } from 'react';
import { Alert, AlertDialog, Badge, Button, Checkbox, Drawer, Input, List, ListItem, Menu, Ph } from '@onblide/ui';
import { SectionHeader } from '../shared/SectionHeader';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { WORKSPACE_PERMISSION_ACTIONS, WORKSPACE_PERMISSION_RESOURCES } from '../shared/workspace-permissions';

function permissionSummary(role) {
  if (role.id === 'admin') return 'Acesso total às contas e à gestão do workspace.';
  const count = role.permissions?.length || 0;
  return `${count} ${count === 1 ? 'permissão' : 'permissões'} · ${role.memberCount || 0} ${role.memberCount === 1 ? 'pessoa' : 'pessoas'}`;
}

export function WorkspaceRoles({ roles = [], onChanged }) {
  const [draft, setDraft] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function openEditor(role = null) {
    setError('');
    setDraft({ id: role?.id || null, name: role?.name || '', permissions: [...(role?.permissions || [])] });
  }

  function duplicate(role) {
    setError('');
    setDraft({ id: null, name: `${role.name} (cópia)`, permissions: [...(role.permissions || [])] });
  }

  function togglePermission(resource, action, checked) {
    const permission = `${resource}.${action}`;
    setDraft((current) => {
      const next = new Set(current.permissions);
      if (checked) {
        next.add(`${resource}.read`);
        next.add(permission);
        if (resource === 'listings' || resource === 'promotions') next.add('accounts.read');
      } else {
        next.delete(permission);
        if (action === 'read') {
          next.delete(`${resource}.write`);
          next.delete(`${resource}.delete`);
          if (resource === 'accounts') {
            for (const dependent of ['listings', 'promotions']) {
              next.delete(`${dependent}.read`);
              next.delete(`${dependent}.write`);
              next.delete(`${dependent}.delete`);
            }
          }
        }
      }
      return { ...current, permissions: [...next] };
    });
  }

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await sendRemoteMessage('role-save', {
        roleId: draft.id,
        payload: { name: draft.name.trim(), permissions: draft.permissions }
      });
      onChanged(result.roles || []);
      setDraft(null);
    } catch (failure) {
      setError(userError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removal || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await sendRemoteMessage('role-delete', { roleId: removal.id });
      onChanged(result.roles || []);
      setRemoval(null);
    } catch (failure) {
      setRemoval(null);
      setError(userError(failure));
    } finally {
      setBusy(false);
    }
  }

  const systemRole = draft?.id === 'admin';
  return (
    <div className="onframe-stack" aria-label="Perfis de usuários">
      <SectionHeader
        title="Perfis"
        copy="Mudar um perfil altera o acesso de todas as pessoas que o usam."
        actions={
          <Button icon={<Ph n="plus" size={17} />} onClick={() => openEditor()}>
            Novo perfil
          </Button>
        }
      />
      {error && !draft && (
        <Alert appearance="soft" tone="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <List ariaLabel="Perfis do workspace">
        {roles.map((role) => {
          const inUse = (role.memberCount || 0) + (role.invitationCount || 0) > 0;
          return (
            <ListItem
              key={role.id}
              leading={<Ph n={role.id === 'admin' ? 'shield-check' : 'users'} size={20} />}
              title={
                <span className="onframe-access-name">
                  {role.name}
                  {role.id === 'admin' && (
                    <Badge size="sm" appearance="ghost">
                      Do sistema
                    </Badge>
                  )}
                </span>
              }
              description={permissionSummary(role)}
              meta={
                role.invitationCount
                  ? `${role.invitationCount} ${role.invitationCount === 1 ? 'convite' : 'convites'}`
                  : undefined
              }
              trailing={
                <Menu
                  align="right"
                  size="sm"
                  ariaLabel={`Ações de ${role.name}`}
                  items={[
                    {
                      label: role.id === 'admin' ? 'Ver permissões' : 'Editar',
                      icon: role.id === 'admin' ? 'eye' : 'pencil-simple',
                      onSelect: () => openEditor(role)
                    },
                    { label: 'Duplicar', icon: 'copy', onSelect: () => duplicate(role) },
                    { type: 'separator' },
                    {
                      label: 'Excluir',
                      icon: 'trash',
                      tone: 'danger',
                      disabled: role.id === 'admin' || inUse,
                      description: inUse ? 'Remova as pessoas e os convites deste perfil antes.' : undefined,
                      onSelect: () => setRemoval(role)
                    }
                  ]}
                  trigger={
                    <Button
                      kind="quiet"
                      size="sm"
                      iconOnly
                      aria-label={`Ações de ${role.name}`}
                      icon={<Ph n="dots-three" size={18} />}
                    />
                  }
                />
              }
            />
          );
        })}
      </List>
      {draft && (
        <Drawer
          open={Boolean(draft)}
          onClose={busy ? () => {} : () => setDraft(null)}
          title={systemRole ? 'Administrador' : draft?.id ? 'Editar perfil' : 'Novo perfil'}
          width="min(640px, 100vw)"
          footer={
            systemRole ? (
              <>
                <Button kind="secondary" onClick={() => setDraft(null)}>
                  Fechar
                </Button>
                <Button icon={<Ph n="copy" size={16} />} onClick={() => duplicate(draft)}>
                  Duplicar perfil
                </Button>
              </>
            ) : (
              <>
                <Button kind="secondary" disabled={busy} onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
                <Button loading={busy} disabled={(draft?.name.trim().length || 0) < 2} onClick={() => void save()}>
                  {draft?.id ? 'Salvar perfil' : 'Criar perfil'}
                </Button>
              </>
            )
          }
        >
          {draft && (
            <div className="onframe-stack">
              {error && (
                <Alert appearance="soft" tone="danger">
                  {error}
                </Alert>
              )}
              {systemRole ? (
                <Alert appearance="soft" tone="info">
                  Administradores têm acesso total. Este perfil não pode ser alterado.
                </Alert>
              ) : (
                <Input
                  label="Nome do perfil"
                  value={draft.name}
                  maxLength={60}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                />
              )}
              {draft.id && !systemRole && roles.find((role) => role.id === draft.id)?.memberCount > 0 && (
                <p className="onframe-muted">As mudanças passam a valer para quem usa este perfil ao salvar.</p>
              )}
              <SectionHeader
                title="Permissões"
                copy="Editar e excluir incluem leitura. Anúncios e promoções também precisam de acesso às contas."
              />
              <List ariaLabel="Permissões por área">
                {WORKSPACE_PERMISSION_RESOURCES.map((resource) => (
                  <ListItem
                    key={resource.id}
                    className="onframe-access-permission-row"
                    style={{ flexWrap: 'wrap' }}
                    leading={<Ph n={resource.icon} size={18} />}
                    title={resource.label}
                    trailing={
                      <div className="onframe-access-permission-actions">
                        {WORKSPACE_PERMISSION_ACTIONS.filter((action) => resource.actions.includes(action.id)).map(
                          (action) => (
                            <Checkbox
                              key={action.id}
                              label={action.label}
                              size="sm"
                              disabled={systemRole}
                              checked={draft.permissions.includes(`${resource.id}.${action.id}`)}
                              onChange={(checked) => togglePermission(resource.id, action.id, checked)}
                            />
                          )
                        )}
                      </div>
                    }
                  />
                ))}
              </List>
            </div>
          )}
        </Drawer>
      )}
      <AlertDialog
        open={Boolean(removal)}
        onClose={() => setRemoval(null)}
        title={removal ? `Excluir ${removal.name}?` : 'Excluir perfil?'}
        confirmLabel="Excluir perfil"
        tone="danger"
        loading={busy}
        onConfirm={() => void remove()}
      >
        Este perfil será removido. Perfis atribuídos a pessoas ou convites pendentes não podem ser excluídos.
      </AlertDialog>
    </div>
  );
}
