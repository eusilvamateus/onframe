import { Avatar, Badge, Button, Divider, Ph, Table } from '@onblide/ui';
import { SectionHeader } from '../shared/SectionHeader';
import { formatDate } from '../shared/runtime';

function accountAssignments(member) {
  if (member.roleId === 'admin') return 'Todas as contas';
  const accounts = member.accounts || [];
  return accounts.map((account) => account.nickname || account.meliUserId || account.id).join(', ') || 'Nenhuma';
}

export function WorkspacePeople({
  members,
  invitations,
  currentUserId,
  loading,
  onInvite,
  onOpenRoles,
  onEdit,
  onRemove,
  onRevoke,
  onLeave
}) {
  const canLeave = members.filter((member) => member.roleId === 'admin').length > 1;
  const columns = [
    {
      key: 'name',
      label: 'Pessoa',
      bold: true,
      render: (_, member) => (
        <div className="onframe-row">
          <Avatar name={member.name || member.email} src={member.avatarUrl} alt="" size={32} />
          <div>
            <p className="onframe-list-title">
              {member.name || member.email}
              {member.id === currentUserId ? ' (você)' : ''}
            </p>
            <p className="onframe-list-meta">{member.email}</p>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      label: 'Permissão',
      render: (_, member) => <Badge tone={member.roleId === 'admin' ? 'primary' : 'neutral'}>{member.roleName}</Badge>
    },
    { key: 'accounts', label: 'Contas', render: (_, member) => accountAssignments(member) },
    {
      key: 'actions',
      label: '',
      width: 210,
      render: (_, member) =>
        member.id === currentUserId ? null : (
          <div className="onframe-actions">
            <Button kind="secondary" size="sm" disabled={loading} onClick={() => onEdit(member)}>
              Gerenciar
            </Button>
            <Button kind="ghost" size="sm" disabled={loading} onClick={() => onRemove(member)}>
              Remover
            </Button>
          </div>
        )
    }
  ];
  return (
    <div className="onframe-stack">
      <section className="onframe-stack" aria-label="Acesso ao workspace">
        <SectionHeader
          title="Acesso ao workspace"
          copy="Gerencie quem participa do workspace e quais contas cada pessoa pode acessar."
          actions={
            <div className="onframe-actions">
              <Button kind="secondary" onClick={onOpenRoles} icon={<Ph n="shield-check" size={17} />}>
                Perfis de usuários
              </Button>
              <Button disabled={loading} onClick={onInvite} icon={<Ph n="user-plus" size={17} />}>
                Convidar pessoa
              </Button>
            </div>
          }
        />
        <Table columns={columns} rows={members} loading={loading} emptyState="Ainda não há pessoas neste workspace." />
      </section>
      <section className="onframe-stack" aria-label="Convites pendentes">
        <SectionHeader title="Convites pendentes" />
        {invitations.length === 0 ? (
          <p className="onframe-empty">Não há convites pendentes.</p>
        ) : (
          <div className="onframe-list">
            {invitations.map((invitation) => (
              <div className="onframe-list-row" key={invitation.id}>
                <Avatar name={invitation.kind === 'email' ? invitation.email : 'Link'} size={32} />
                <div className="onframe-grow">
                  <p className="onframe-list-title">
                    {invitation.kind === 'email' ? invitation.email : 'Link compartilhável'}
                  </p>
                  <p className="onframe-list-meta">
                    {invitation.roleName} · expira {formatDate(invitation.expiresAt)}
                  </p>
                </div>
                <Button kind="ghost" size="sm" disabled={loading} onClick={() => onRevoke(invitation)}>
                  Revogar
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
      <Divider decorative />
      <section className="onframe-stack" aria-label="Sair do workspace">
        <SectionHeader
          title="Sair do workspace"
          copy={
            canLeave
              ? 'Seu acesso a este workspace será encerrado. As outras pessoas continuarão com acesso.'
              : 'Para sair, outra pessoa precisa ser administradora deste workspace.'
          }
          actions={
            <Button
              kind="danger"
              disabled={loading || !canLeave}
              icon={<Ph n="sign-out" size={17} />}
              onClick={onLeave}
            >
              Sair do workspace
            </Button>
          }
        />
      </section>
    </div>
  );
}
