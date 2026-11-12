import { useState } from 'react';
import { Alert, AlertDialog, Badge, Button, Checkbox, Input, List, ListItem, Modal, Ph } from '@onblide/ui';
import { SectionHeader } from '../shared/SectionHeader';
import { sendRemoteMessage, userError } from '../shared/runtime';

const RESOURCES = [
  { id: 'accounts', label: 'Contas Mercado Livre', actions: ['read', 'write', 'delete'] },
  { id: 'listings', label: 'Anúncios', actions: ['read', 'write'] },
  { id: 'promotions', label: 'Promoções', actions: ['read', 'write', 'delete'] },
  { id: 'products', label: 'Produtos', actions: ['read', 'write', 'delete'] },
  { id: 'history', label: 'Histórico', actions: ['read'] },
  { id: 'settings', label: 'Configurações', actions: ['read', 'write'] }
];

function permissionSummary(role) {
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
    setDraft({
      id: role?.id || null,
      name: role?.name || '',
      isDefault: role?.isDefault || false,
      permissions: role?.permissions || []
    });
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

  return (
    <section className="onframe-stack" aria-label="Perfis de usuários">
      <SectionHeader
        title="Perfis do workspace"
        copy="Defina o que cada perfil pode fazer. As contas acessíveis são atribuídas a cada pessoa."
        actions={
          <Button icon={<Ph n="plus" size={17} />} onClick={() => openEditor()}>
            Criar perfil
          </Button>
        }
      />
      {error && !draft && (
        <Alert appearance="soft" tone="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <List ariaLabel="Perfis de usuários" dividers>
        {roles.map((role) => (
          <ListItem
            key={role.id}
            leading={<Ph n={role.system ? 'shield-check' : 'users'} size={20} />}
            title={role.name}
            description={permissionSummary(role)}
            meta={role.system ? <Badge tone="neutral">Padrão</Badge> : undefined}
            trailing={
              role.editable ? (
                <div className="onframe-actions">
                  <Button kind="secondary" size="sm" onClick={() => openEditor(role)}>
                    Editar
                  </Button>
                  {role.deletable && (
                    <Button kind="ghost" size="sm" onClick={() => setRemoval(role)}>
                      Excluir
                    </Button>
                  )}
                </div>
              ) : null
            }
          />
        ))}
      </List>
      <Modal
        open={Boolean(draft)}
        onClose={busy ? undefined : () => setDraft(null)}
        title={draft?.id ? 'Editar perfil' : 'Criar perfil'}
        size="md"
        footer={
          <>
            <Button kind="secondary" disabled={busy} onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button loading={busy} disabled={(draft?.name.trim().length || 0) < 2} onClick={() => void save()}>
              Salvar perfil
            </Button>
          </>
        }
      >
        {draft && (
          <div className="onframe-stack">
            {error && (
              <Alert appearance="soft" tone="danger">
                {error}
              </Alert>
            )}
            <Input
              label="Nome do perfil"
              value={draft.name}
              maxLength={60}
              disabled={draft.isDefault}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
            <div className="onframe-role-permissions" aria-label="Permissões do perfil">
              <span />
              <strong>Ler</strong>
              <strong>Editar</strong>
              <strong>Excluir</strong>
              {RESOURCES.map((resource) => (
                <div className="onframe-role-permissions-row" key={resource.id}>
                  <span>{resource.label}</span>
                  {['read', 'write', 'delete'].map((action) => (
                    <div key={action}>
                      {resource.actions.includes(action) && (
                        <Checkbox
                          ariaLabel={`${resource.label}: ${action === 'read' ? 'ler' : action === 'write' ? 'editar' : 'excluir'}`}
                          size="sm"
                          checked={draft.permissions.includes(`${resource.id}.${action}`)}
                          onChange={(checked) => togglePermission(resource.id, action, checked)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
      <AlertDialog
        open={Boolean(removal)}
        onClose={() => setRemoval(null)}
        title={removal ? `Excluir ${removal.name}?` : 'Excluir perfil?'}
        confirmLabel="Excluir perfil"
        tone="danger"
        loading={busy}
        onConfirm={() => void remove()}
      >
        Esta ação não pode ser desfeita. Perfis atribuídos a pessoas ou convites pendentes não podem ser excluídos.
      </AlertDialog>
    </section>
  );
}
