import { useMemo, useState } from 'react';
import { AlertDialog, Avatar, Badge, Button, List, ListItem, Ph, SearchInput, Select } from '@onblide/ui';
import { formatDate } from '../shared/runtime';

function accountAssignments(member) {
  if (member.roleId === 'admin') return 'Todas as contas';
  const accounts = member.accounts || [];
  return (
    accounts.map((account) => account.nickname || account.meliUserId || account.id).join(', ') ||
    'Nenhuma conta atribuída'
  );
}

export function WorkspacePeople({
  members,
  invitations,
  roles,
  currentUserId,
  loading,
  onEdit,
  onRevoke
}) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('Todos os perfis');
  const [revocation, setRevocation] = useState(null);
  const roleOptions = ['Todos os perfis', ...roles.map((role) => role.name)];
  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    return [
      ...members.map((member) => ({ kind: 'member', id: member.id, roleName: member.roleName, data: member })),
      ...invitations.map((invitation) => ({
        kind: 'invitation',
        id: invitation.id,
        roleName: invitation.roleName,
        data: invitation
      }))
    ].filter((entry) => {
      if (roleFilter !== 'Todos os perfis' && entry.roleName !== roleFilter) return false;
      if (!search) return true;
      const name = entry.kind === 'member' ? entry.data.name : entry.data.email || 'Link compartilhável';
      return `${name} ${entry.data.email || ''}`.toLocaleLowerCase('pt-BR').includes(search);
    });
  }, [members, invitations, query, roleFilter]);

  return (
    <div className="onframe-stack">
      <section className="onframe-stack" aria-label="Pessoas do workspace">
        <div className="onframe-access-filters">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar por nome ou e-mail"
            ariaLabel="Buscar pessoas"
            width="100%"
          />
          <Select
            value={roleFilter}
            onChange={setRoleFilter}
            options={roleOptions}
            width="100%"
            ariaLabel="Filtrar por perfil"
          />
        </div>
        {visible.length === 0 ? (
          <div className="onframe-access-empty">
            <p>
              {query || roleFilter !== 'Todos os perfis'
                ? 'Ninguém encontrado.'
                : 'Ainda não há pessoas neste workspace.'}
            </p>
            {(query || roleFilter !== 'Todos os perfis') && (
              <Button
                kind="secondary"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setRoleFilter('Todos os perfis');
                }}
              >
                Limpar busca
              </Button>
            )}
          </div>
        ) : (
          <List ariaLabel="Pessoas e convites do workspace">
            {visible.map((entry) => {
              if (entry.kind === 'invitation') {
                const invitation = entry.data;
                const name = invitation.kind === 'email' ? invitation.email : 'Link compartilhável';
                return (
                  <ListItem
                    key={`invitation-${entry.id}`}
                    leading={<Avatar name={name} size={36} />}
                    title={
                      <span className="onframe-access-name">
                        {name}
                        <Badge size="sm" tone="warning" appearance="plain" dot>
                          Convite pendente
                        </Badge>
                      </span>
                    }
                    description={`Expira em ${formatDate(invitation.expiresAt)}`}
                    meta={
                      <span className="onframe-access-role-meta" title={invitation.roleName}>
                        {invitation.roleName}
                      </span>
                    }
                    trailing={
                      <Button kind="ghost" size="sm" disabled={loading} onClick={() => setRevocation(invitation)}>
                        Revogar
                      </Button>
                    }
                  />
                );
              }
              const member = entry.data;
              const self = member.id === currentUserId;
              return (
                <ListItem
                  key={`member-${entry.id}`}
                  wrap
                  leading={<Avatar name={member.name || member.email} src={member.avatarUrl} alt="" size={36} />}
                  title={
                    <span className="onframe-access-name">
                      {member.name || member.email}
                      {self && (
                        <Badge size="sm" tone="neutral" appearance="plain" dot>
                          Você
                        </Badge>
                      )}
                    </span>
                  }
                  description={`${member.email} · ${accountAssignments(member)}`}
                  meta={
                    <span className="onframe-access-role-meta" title={member.roleName || 'Sem perfil'}>
                      {member.roleName || 'Sem perfil'}
                    </span>
                  }
                  trailing={!self && <Ph n="caret-right" size={16} />}
                  onClick={!self && !loading ? () => onEdit(member) : undefined}
                  role={!self ? 'button' : undefined}
                  tabIndex={!self && !loading ? 0 : undefined}
                  onKeyDown={
                    !self && !loading
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onEdit(member);
                          }
                        }
                      : undefined
                  }
                />
              );
            })}
          </List>
        )}
      </section>
      <AlertDialog
        open={Boolean(revocation)}
        onClose={() => setRevocation(null)}
        title="Revogar convite?"
        confirmLabel="Revogar convite"
        cancelLabel="Manter"
        tone="danger"
        loading={loading}
        onConfirm={() => {
          onRevoke(revocation);
          setRevocation(null);
        }}
      >
        O convite deixará de funcionar. Você poderá convidar esta pessoa novamente depois.
      </AlertDialog>
    </div>
  );
}
