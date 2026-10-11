import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import '@onblide/ui/styles.css';
import { Alert, Avatar, Badge, Breadcrumbs, Button, ButtonGroup, Card, Checkbox, Divider, Drawer, FileUpload, Input, List, ListItem, ListSubheader, LogoMark, Modal, Navbar, Ph, SearchInput, Select, SideNav, Skeleton, Table, Tabs } from '@onblide/ui';
import '../shared/app.css';
import { AuthPanel, PasswordField } from '../shared/AuthPanel';
import { formatDate, initials, manifestVersion, openExternal, openUpdater, readDataUrl, sendRemoteMessage, userError } from '../shared/runtime';

const RELEASES_URL = 'https://github.com/eusilvamateus/onframe/releases';

const VIEW_META = {
  home: { title: 'Início', icon: 'house' },
  integrations: { title: 'Integrações', icon: 'storefront' },
  settings: { title: 'Configurações', icon: 'gear-six' }
};

const SETTINGS_OPTIONS = [
  { tab: 'account', page: 'profile', category: 'Conta', label: 'Perfil', description: 'Foto, nome e e-mail da sua conta.', icon: 'user-circle', keywords: 'foto nome email dados pessoais' },
  { tab: 'account', page: 'security', category: 'Conta', label: 'Segurança e login', description: 'Senha, e-mail de acesso e sessões.', icon: 'shield-check', keywords: 'senha email login credenciais seguranca' },
  { tab: 'workspace', page: 'general', category: 'Workspace', label: 'Geral', description: 'Nome e informações do workspace.', icon: 'buildings', keywords: 'nome informacoes empresa' },
  { tab: 'workspace', page: 'people', category: 'Workspace', label: 'Pessoas', description: 'Acessos, permissões e convites.', icon: 'users-three', keywords: 'membros colaboradores administradores convite permissao' },
  { tab: 'application', page: 'updates', category: 'Aplicativo', label: 'Atualizações', description: 'Versão instalada e atualizador da extensão.', icon: 'arrow-clockwise', keywords: 'versao atualizar atualizador extensao' }
];

const SETTINGS_SECTIONS = [
  { id: 'account', label: 'Conta' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'application', label: 'Aplicativo' }
];

const SETTINGS_PAGE_META = {
  account: {
    profile: { title: 'Perfil', icon: 'user-circle' },
    security: { title: 'Segurança e login', icon: 'shield-check' },
    sessions: { title: 'Sessões ativas', icon: 'browser' }
  },
  workspace: {
    general: { title: 'Geral', icon: 'buildings' },
    people: { title: 'Pessoas', icon: 'users-three' }
  },
  application: {
    updates: { title: 'Atualizações', icon: 'arrow-clockwise' }
  }
};

function accountName(account) {
  return account.nickname || `Conta ${account.user_id || ''}`.trim();
}

function trustedLogo(value) {
  const logo = String(value || '').trim();
  return /^https:\/\/(?:[a-z0-9-]+\.)*mlstatic\.com\//iu.test(logo) ? logo : '';
}

function accountAssignments(member) {
  if (member.role === 'admin') return 'Todas as contas';
  const accounts = member.accounts || [];
  return accounts.map((account) => account.nickname || account.meliUserId || account.id).join(', ') || 'Nenhuma';
}

function searchValue(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function activityLabel(operation) {
  return {
    mercadolivre_oauth_connected: 'Conta do Mercado Livre conectada',
    seller_account_updated: 'Conta do Mercado Livre atualizada',
    seller_account_deleted: 'Conta do Mercado Livre removida',
    workspace_member_updated: 'Acesso de uma pessoa atualizado',
    workspace_member_removed: 'Pessoa removida do workspace',
    workspace_invitation_created: 'Convite criado',
    workspace_invitation_revoked: 'Convite revogado',
    profile_updated: 'Perfil atualizado'
  }[operation] || 'Atividade no workspace';
}

function PageHeader({ meta, actions, reserveContextSpace = false }) {
  return (
    <header className="onframe-page-header">
      <div className="onframe-stack" style={{ gap: 'var(--ob-s-1)' }}>
        {reserveContextSpace && <div className="onframe-page-context-spacer" aria-hidden="true" />}
        <div>
          {meta.eyebrow && <p className="onframe-eyebrow">{meta.eyebrow}</p>}
          <h1 className="onframe-page-title">{meta.title}</h1>
        </div>
      </div>
      {actions && <div className="onframe-actions">{actions}</div>}
    </header>
  );
}

function SectionHeader({ eyebrow, title, copy, actions }) {
  return (
    <div className="onframe-row onframe-row-between" style={{ alignItems: 'flex-start' }}>
      <div className="onframe-grow">
        {eyebrow && <p className="onframe-eyebrow">{eyebrow}</p>}
        <h2 className="onframe-card-title">{title}</h2>
        {copy && <p className="onframe-card-copy">{copy}</p>}
      </div>
      {actions && <div className="onframe-actions">{actions}</div>}
    </div>
  );
}

function Home({ workspace, overview, accounts, invitations, admin, loading, onConnect, onOpenIntegrations, onOpenWorkspace }) {
  const activity = overview?.recentActivity || [];
  const pendingInvitations = invitations.length;
  const emptyAccounts = accounts.length === 0;
  return (
    <div className="onframe-stack">
      <SectionHeader
        eyebrow="WORKSPACE"
        title={workspace.name}
        copy={admin ? 'Você administra as integrações e os acessos deste workspace.' : 'Você acessa as integrações atribuídas a este workspace.'}
      />
      {emptyAccounts && (
        <Card padding={24}>
          <SectionHeader
            eyebrow="PRÓXIMA AÇÃO"
            title={admin ? 'Conecte uma conta do Mercado Livre' : 'Aguarde uma conta ser atribuída'}
            copy={admin ? 'Conecte a primeira conta para começar a usar o OnFrame neste workspace.' : 'Um administrador precisa atribuir uma conta do Mercado Livre ao seu acesso.'}
            actions={admin ? <Button disabled={loading} onClick={onConnect} icon={<Ph n="plus" size={17} />}>Conectar conta</Button> : undefined}
          />
        </Card>
      )}
      {pendingInvitations > 0 && (
        <Card padding={24}>
          <SectionHeader
            eyebrow="PRÓXIMA AÇÃO"
            title={`${pendingInvitations} ${pendingInvitations === 1 ? 'convite pendente' : 'convites pendentes'}`}
            copy="Há pessoas aguardando acesso a este workspace."
            actions={<Button kind="secondary" disabled={loading} onClick={onOpenWorkspace}>Gerenciar pessoas</Button>}
          />
        </Card>
      )}
      {!emptyAccounts && (
        <Card padding={24}>
          <div className="onframe-stack">
            <SectionHeader
              eyebrow="INTEGRAÇÃO"
              title="Mercado Livre"
              copy={accounts.length === 1 ? '1 conta disponível neste workspace.' : `${accounts.length} contas disponíveis neste workspace.`}
              actions={<Button kind="secondary" disabled={loading} onClick={onOpenIntegrations}>Gerenciar integrações</Button>}
            />
            <div className="onframe-list">
              {accounts.map((account) => (
                <div className="onframe-list-row" key={account.id || account.user_id}>
                  <Avatar name={accountName(account)} src={trustedLogo(account.logo)} alt="" size={32} />
                  <div className="onframe-grow">
                    <p className="onframe-list-title">{accountName(account)}</p>
                    <p className="onframe-list-meta">Mercado Livre</p>
                  </div>
                  <Badge tone={account.enabled === false ? 'grey' : 'green'}>{account.enabled === false ? 'Desativada' : 'Habilitada'}</Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
      <Card padding={24}>
        <div className="onframe-stack">
          <SectionHeader eyebrow="ATIVIDADE" title="Atividade recente" />
          {activity.length === 0 ? <p className="onframe-empty">Ainda não há atividade neste workspace.</p> : (
            <div className="onframe-list">
              {activity.map((event) => (
                <div className="onframe-list-row" key={event.id || `${event.operation}-${event.occurredAt}`}>
                  <Avatar name={initials(event.actorName)} size={32} />
                  <div className="onframe-grow">
                    <p className="onframe-list-title">{activityLabel(event.operation)}</p>
                    <p className="onframe-list-meta">{event.actorName} · {formatDate(event.occurredAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Integrations({ accounts, admin, onConnect, onUpdate, onRemove, loading }) {
  return (
    <div className="onframe-stack">
      <SectionHeader
        eyebrow="MERCADO LIVRE"
        title="Mercado Livre"
        copy={admin ? 'Conecte e controle as contas disponíveis neste workspace.' : 'Contas atribuídas ao seu acesso neste workspace.'}
        actions={admin && <Button disabled={loading} onClick={onConnect} icon={<Ph n="plus" size={17} />}>Conectar conta</Button>}
      />
      {accounts.length === 0 ? (
        <Card padding={24}>
          <SectionHeader
            eyebrow="ESTADO"
            title={admin ? 'Nenhuma conta conectada' : 'Nenhuma conta atribuída'}
            copy={admin ? 'Conecte uma conta do Mercado Livre para disponibilizá-la neste workspace.' : 'Um administrador precisa atribuir uma conta para que você possa usá-la.'}
            actions={admin ? <Button disabled={loading} onClick={onConnect} icon={<Ph n="plus" size={17} />}>Conectar conta</Button> : undefined}
          />
        </Card>
      ) : accounts.map((account) => (
        <Card key={account.id || account.user_id} padding={20}>
          <div className="onframe-row onframe-row-between" style={{ alignItems: 'flex-start' }}>
            <div className="onframe-row onframe-grow">
              <Avatar name={accountName(account)} src={trustedLogo(account.logo)} alt="" size={44} />
              <div className="onframe-grow">
                <p className="onframe-card-title">{accountName(account)}</p>
                <p className="onframe-card-copy">Mercado Livre · {account.enabled === false ? 'Conta desativada' : 'Conta habilitada'}</p>
              </div>
            </div>
            <Badge tone={account.enabled === false ? 'grey' : 'green'}>{account.enabled === false ? 'Desativada' : 'Habilitada'}</Badge>
          </div>
          {admin && (
            <div className="onframe-actions" style={{ marginTop: 16 }}>
              <Button kind="secondary" disabled={loading} onClick={() => onUpdate(account, !account.enabled)}>{account.enabled === false ? 'Habilitar' : 'Desativar'}</Button>
              <Button kind="danger" disabled={loading} onClick={() => onRemove(account)}>Remover</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function WorkspacePeople({ members, invitations, accounts, loading, onInvite, onEdit, onRemove, onRevoke }) {
  const columns = [
    {
      key: 'name', label: 'Pessoa', bold: true,
      render: (_, member) => <div className="onframe-row"><Avatar name={member.name || member.email} src={member.avatarUrl} alt="" size={32} /><div><p className="onframe-list-title">{member.name || member.email}</p><p className="onframe-list-meta">{member.email}</p></div></div>
    },
    { key: 'role', label: 'Permissão', render: (_, member) => <Badge tone={member.role === 'admin' ? 'blue' : 'grey'}>{member.role === 'admin' ? 'Administrador' : 'Colaborador'}</Badge> },
    { key: 'accounts', label: 'Contas', render: (_, member) => accountAssignments(member) },
    { key: 'actions', label: '', width: 210, render: (_, member) => <div className="onframe-actions"><Button kind="secondary" size="sm" disabled={loading} onClick={() => onEdit(member)}>Gerenciar</Button><Button kind="ghost" size="sm" disabled={loading} onClick={() => onRemove(member)}>Remover</Button></div> }
  ];
  return (
    <div className="onframe-stack">
      <section className="onframe-stack" aria-label="Acesso ao workspace">
        <SectionHeader
          title="Acesso ao workspace"
          copy="Gerencie quem participa do workspace e quais contas cada pessoa pode acessar."
          actions={<Button disabled={loading} onClick={onInvite} icon={<Ph n="user-plus" size={17} />}>Convidar pessoa</Button>}
        />
        <Table columns={columns} rows={members} loading={loading} emptyState="Ainda não há pessoas neste workspace." />
      </section>
      <section className="onframe-stack" aria-label="Convites pendentes">
        <SectionHeader title="Convites pendentes" />
        {invitations.length === 0 ? <p className="onframe-empty">Não há convites pendentes.</p> : (
          <div className="onframe-list">
            {invitations.map((invitation) => (
              <div className="onframe-list-row" key={invitation.id}>
                <Avatar name={invitation.kind === 'email' ? invitation.email : 'Link'} size={32} />
                <div className="onframe-grow">
                  <p className="onframe-list-title">{invitation.kind === 'email' ? invitation.email : 'Link compartilhável'}</p>
                  <p className="onframe-list-meta">{invitation.role === 'admin' ? 'Administrador' : 'Colaborador'} · expira {formatDate(invitation.expiresAt)}</p>
                </div>
                <Button kind="ghost" size="sm" disabled={loading} onClick={() => onRevoke(invitation)}>Revogar</Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function settingsOptionItems(options, onNavigate, showCategory = false) {
  return options.map((option) => (
    <ListItem
      key={`${option.tab}-${option.page}`}
      leading={<Ph n={option.icon} size={18} />}
      title={option.label}
      description={option.description}
      meta={showCategory ? option.category : undefined}
      href={`#settings-${option.tab}-${option.page}`}
      onClick={(event) => { event.preventDefault(); onNavigate(option); }}
    />
  ));
}

function SettingsOptionList({ options, ariaLabel, onNavigate, showCategory = false }) {
  return <List as="nav" ariaLabel={ariaLabel}>{settingsOptionItems(options, onNavigate, showCategory)}</List>;
}

function SettingsDirectory({ options, onNavigate }) {
  const sections = SETTINGS_SECTIONS
    .map((section) => ({ ...section, options: options.filter((option) => option.tab === section.id) }))
    .filter((section) => section.options.length > 0);
  return <List as="nav" ariaLabel="Configurações">
    {sections.flatMap((section) => [
      <ListSubheader key={`header-${section.id}`}>{section.label}</ListSubheader>,
      ...settingsOptionItems(section.options, onNavigate)
    ])}
  </List>;
}

function ProfileSettings({ profile, loading, onSave, onAvatar }) {
  const savedName = profile?.user?.name || '';
  const [name, setName] = useState(savedName);
  useEffect(() => setName(savedName), [savedName]);
  if (!profile) return null;
  const changed = name !== savedName;
  return (
    <section className="onframe-stack onframe-settings-form" aria-label="Dados pessoais">
      <SectionHeader title="Dados pessoais" copy="Defina como sua conta aparece no OnFrame." />
      <div className="onframe-row">
        <Avatar name={profile.user.name || profile.user.email} src={profile.user.avatarUrl} alt="" size={64} />
        <FileUpload
          variant="button"
          multiple={false}
          accept="image/png,image/jpeg,image/webp"
          acceptLabel="PNG, JPEG ou WebP"
          maxSize={2 * 1024 * 1024}
          buttonLabel="Trocar imagem"
          hint="PNG, JPEG ou WebP de até 2 MB"
          disabled={loading}
          upload={onAvatar}
        />
      </div>
      <Input label="Nome" value={name} autoComplete="name" disabled={loading} onChange={(event) => setName(event.target.value)} />
      <Input label="E-mail" value={profile.user.email || ''} disabled />
      <footer className="onframe-settings-action-bar" aria-label="Ações do perfil">
        <div className="onframe-settings-action-bar-content">
          <Divider decorative />
          <div className="onframe-settings-action-bar-controls">
            {changed && <p className="onframe-settings-action-status" role="status">Alterações não salvas</p>}
            <div className="onframe-settings-action-buttons">
              <ButtonGroup attached={false} justify="end" ariaLabel="Ações do perfil">
                {changed && <Button kind="ghost" disabled={loading} onClick={() => setName(savedName)}>Descartar</Button>}
                <Button disabled={loading || !changed} onClick={() => void onSave(name)}>Salvar alterações</Button>
              </ButtonGroup>
            </div>
          </div>
        </div>
      </footer>
    </section>
  );
}

function SecuritySettings({ profile, loading, onOpenSecurity, onOpenSessions }) {
  if (!profile) return null;
  const sessions = profile.sessions || [];
  return (
    <div className="onframe-stack">
      <section className="onframe-stack" aria-label="Formas de entrar">
        <SectionHeader title="Formas de entrar" copy="Controle as credenciais usadas para acessar sua conta." />
        <List ariaLabel="Formas de entrar">
          <ListItem leading={<Ph n="password" size={18} />} title="Senha" description="Altere a senha usada para entrar no OnFrame." trailing={<Button kind="secondary" size="sm" disabled={loading} onClick={() => onOpenSecurity('password')}>Alterar</Button>} />
          <ListItem leading={<Ph n="envelope-simple" size={18} />} title="E-mail de acesso" description={profile.user.email} trailing={<Button kind="secondary" size="sm" disabled={loading} onClick={() => onOpenSecurity('email')}>Alterar</Button>} />
        </List>
      </section>
      <section className="onframe-stack" aria-label="Sessões">
        <SectionHeader title="Sessões ativas" copy="Revogue navegadores que não precisam mais acessar sua conta." />
        <List as="nav" ariaLabel="Sessões ativas">
          <ListItem
            leading={<Ph n="browser" size={18} />}
            title="Navegadores autorizados"
            description={sessions.length === 1 ? '1 sessão ativa na sua conta.' : `${sessions.length} sessões ativas na sua conta.`}
            meta={sessions.length}
            href="#sessoes-ativas"
            onClick={(event) => { event.preventDefault(); onOpenSessions(); }}
          />
        </List>
      </section>
    </div>
  );
}

function SessionsSettings({ profile, loading, onRemoveSession, onDisconnect }) {
  if (!profile) return null;
  return (
    <div className="onframe-stack">
      <section className="onframe-stack" aria-label="Navegadores autorizados">
        <SectionHeader title="Navegadores autorizados" copy="Revogue os outros navegadores quando eles não forem mais necessários." />
        <List ariaLabel="Navegadores autorizados">
          {(profile.sessions || []).map((session) => (
            <ListItem
              key={session.id}
              leading={<Ph n="browser" size={18} />}
              title={session.label}
              description={session.lastSeenAt ? `Visto ${formatDate(session.lastSeenAt)}` : `Criado ${formatDate(session.createdAt)}`}
              meta={session.current ? <Badge tone="blue">Atual</Badge> : undefined}
              trailing={session.current
                ? <Button kind="danger" size="sm" disabled={loading} onClick={onDisconnect}>Sair</Button>
                : <Button kind="secondary" size="sm" disabled={loading} onClick={() => onRemoveSession(session.id)}>Revogar</Button>}
            />
          ))}
        </List>
      </section>
    </div>
  );
}

function WorkspaceGeneralSettings({ workspace, loading, onSaveWorkspace }) {
  const savedName = workspace?.name || '';
  const [name, setName] = useState(savedName);
  useEffect(() => setName(savedName), [savedName]);
  const changed = name !== savedName;
  return (
    <section className="onframe-stack onframe-settings-form" aria-label="Informações gerais">
      <SectionHeader title="Informações gerais" />
      <Input label="Nome" value={name} disabled={loading} maxLength={120} onChange={(event) => setName(event.target.value)} />
      <footer className="onframe-settings-action-bar" aria-label="Ações do workspace">
        <div className="onframe-settings-action-bar-content">
          <Divider decorative />
          <div className="onframe-settings-action-bar-controls">
            {changed && <p className="onframe-settings-action-status" role="status">Alterações não salvas</p>}
            <div className="onframe-settings-action-buttons">
              <ButtonGroup attached={false} justify="end" ariaLabel="Ações do workspace">
                {changed && <Button kind="ghost" disabled={loading} onClick={() => setName(savedName)}>Descartar</Button>}
                <Button disabled={loading || !changed} onClick={() => void onSaveWorkspace(name)}>Salvar alterações</Button>
              </ButtonGroup>
            </div>
          </div>
        </div>
      </footer>
    </section>
  );
}

function WorkspacePeopleSettings({ members, invitations, accounts, loading, onInvite, onEdit, onRemove, onRevoke }) {
  return <WorkspacePeople members={members} invitations={invitations} accounts={accounts} loading={loading} onInvite={onInvite} onEdit={onEdit} onRemove={onRemove} onRevoke={onRevoke} />;
}

function ApplicationUpdatesSettings() {
  return (
    <section className="onframe-stack" aria-label="Atualizador">
      <SectionHeader
        title="Atualizador"
        copy="Instale a versão mais recente pelo atualizador."
        actions={<Button kind="secondary" onClick={openUpdater} icon={<Ph n="arrow-square-out" size={17} />}>Abrir atualizador</Button>}
      />
    </section>
  );
}

function Settings({ activeSection, onSectionChange, settingsPage, onSettingsPageChange, workspace, profile, members, invitations, accounts, admin, loading, onSaveProfile, onAvatar, onOpenSecurity, onRemoveSession, onDisconnect, onSaveWorkspace, onInvite, onEdit, onRemove, onRevoke }) {
  const [query, setQuery] = useState('');
  const availableOptions = SETTINGS_OPTIONS.filter((option) => option.tab !== 'workspace' || admin);
  const isIndex = settingsPage === 'index';
  const normalizedQuery = searchValue(query).trim();
  const matches = normalizedQuery
    ? availableOptions.filter((option) => searchValue(`${option.category} ${option.label} ${option.description} ${option.keywords}`).includes(normalizedQuery))
    : [];
  const selectOption = (option) => {
    onSectionChange(option.tab);
    onSettingsPageChange(option.page);
    setQuery('');
  };
  return (
    <div className="onframe-stack">
      {isIndex && <>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar configurações..." width="100%" />
        {normalizedQuery && (matches.length > 0
          ? <SettingsOptionList options={matches} ariaLabel="Resultados da busca" onNavigate={selectOption} showCategory />
          : <p className="onframe-empty">Nenhuma configuração encontrada.</p>)}
        {!normalizedQuery && <SettingsDirectory options={availableOptions} onNavigate={selectOption} />}
      </>}
      {!isIndex && activeSection === 'account' && settingsPage === 'profile' && <ProfileSettings profile={profile} loading={loading} onSave={onSaveProfile} onAvatar={onAvatar} />}
      {!isIndex && activeSection === 'account' && settingsPage === 'security' && <SecuritySettings profile={profile} loading={loading} onOpenSecurity={onOpenSecurity} onOpenSessions={() => onSettingsPageChange('sessions')} />}
      {!isIndex && activeSection === 'account' && settingsPage === 'sessions' && <SessionsSettings profile={profile} loading={loading} onRemoveSession={onRemoveSession} onDisconnect={onDisconnect} />}
      {!isIndex && activeSection === 'workspace' && admin && settingsPage === 'general' && <WorkspaceGeneralSettings workspace={workspace} loading={loading} onSaveWorkspace={onSaveWorkspace} />}
      {!isIndex && activeSection === 'workspace' && admin && settingsPage === 'people' && <WorkspacePeopleSettings members={members} invitations={invitations} accounts={accounts} loading={loading} onInvite={onInvite} onEdit={onEdit} onRemove={onRemove} onRevoke={onRevoke} />}
      {!isIndex && activeSection === 'application' && settingsPage === 'updates' && <ApplicationUpdatesSettings />}
    </div>
  );
}

function MemberModal({ dialog, accounts, busy, onClose, onConfirm }) {
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
  return (
    <Modal
      open
      onClose={onClose}
      title={isInvite ? 'Convidar pessoa' : `Acesso de ${member.name || member.email}`}
      footer={<><Button kind="secondary" disabled={busy} onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={() => onConfirm({ kind, email, role, accountIds })}>{isInvite ? 'Enviar convite' : 'Salvar acesso'}</Button></>}
    >
      <div className="onframe-stack">
        {isInvite && <Tabs tabs={[{ id: 'email', label: 'E-mail' }, { id: 'link', label: 'Link' }]} active={kind} onChange={setKind} variant="pill" size="sm" />}
        {isInvite && kind === 'email' && <Input label="E-mail" type="email" value={email} placeholder="pessoa@empresa.com" onChange={(event) => setEmail(event.target.value)} />}
        <Select label="Permissão" options={['Colaborador', 'Administrador']} value={administrator ? 'Administrador' : 'Colaborador'} onChange={(value) => setRole(value === 'Administrador' ? 'admin' : 'collaborator')} />
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

function SecurityModal({ open, kind, email, busy, onClose, onConfirm }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [nextEmail, setNextEmail] = useState('');
  useEffect(() => {
    setCurrentPassword('');
    setNextPassword('');
    setConfirmation('');
    setNextEmail('');
  }, [kind, open]);
  if (!open) return null;
  const changingPassword = kind === 'password';
  return (
    <Modal
      open
      onClose={onClose}
      title={changingPassword ? 'Alterar senha' : 'Alterar e-mail'}
      footer={<><Button kind="secondary" disabled={busy} onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={() => onConfirm({ currentPassword, nextPassword, confirmation, nextEmail })}>Confirmar</Button></>}
    >
      <div className="onframe-stack">
        <p className="onframe-muted">Confirme sua senha atual para continuar.</p>
        <PasswordField label="Senha atual" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" placeholder="Sua senha atual" disabled={busy} />
        {changingPassword ? <><PasswordField label="Nova senha" value={nextPassword} onChange={setNextPassword} autoComplete="new-password" placeholder="Nova senha" disabled={busy} /><PasswordField label="Confirme a nova senha" value={confirmation} onChange={setConfirmation} autoComplete="new-password" placeholder="Repita a nova senha" disabled={busy} /></> : <Input label="Novo e-mail" type="email" value={nextEmail} autoComplete="email" placeholder={email} disabled={busy} onChange={(event) => setNextEmail(event.target.value)} />}
      </div>
    </Modal>
  );
}

function OptionsApp() {
  const [connection, setConnection] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [profile, setProfile] = useState(null);
  const [overview, setOverview] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [view, setView] = useState('home');
  const [settingsTab, setSettingsTab] = useState('account');
  const [settingsPage, setSettingsPage] = useState('index');
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [security, setSecurity] = useState(null);
  const acceptingInvitation = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextConnection = await sendRemoteMessage('status');
      setConnection(nextConnection);
      if (!nextConnection?.connected) {
        setWorkspaces([]);
        setProfile(null);
        setOverview(null);
        setAccounts([]);
        setMembers([]);
        setInvitations([]);
        return;
      }
      const [workspaceResult, profileResult] = await Promise.all([
        sendRemoteMessage('workspaces'),
        sendRemoteMessage('profile')
      ]);
      setWorkspaces(workspaceResult.workspaces || []);
      setProfile(profileResult);
    } catch (error) {
      setConnection({ connected: false, reason: 'unavailable' });
      setNotice({ tone: 'danger', message: userError(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    const result = await sendRemoteMessage('accounts');
    setAccounts(result.accounts || []);
    return result.accounts || [];
  }, []);

  const loadView = useCallback(async () => {
    if (!connection?.connected) return;
    const admin = connection.workspace?.role === 'admin';
    const needsData = view === 'home' || view === 'integrations' || (view === 'settings' && (settingsTab === 'account' || (settingsTab === 'workspace' && admin)));
    if (!needsData) return;
    setLoading(true);
    try {
      if (view === 'home') {
        const requests = [sendRemoteMessage('app-overview'), loadAccounts()];
        if (admin) requests.push(sendRemoteMessage('invitations'));
        const [overviewResult, , invitationResult] = await Promise.all(requests);
        setOverview(overviewResult);
        setInvitations(invitationResult?.invitations || []);
      }
      if (view === 'integrations') await loadAccounts();
      if (view === 'settings' && settingsTab === 'account') setProfile(await sendRemoteMessage('profile'));
      if (view === 'settings' && settingsTab === 'workspace' && admin) {
        const [memberResult, invitationResult] = await Promise.all([sendRemoteMessage('members'), sendRemoteMessage('invitations'), loadAccounts()]);
        setMembers(memberResult.members || []);
        setInvitations(invitationResult.invitations || []);
      }
    } catch (error) {
      setNotice({ tone: 'danger', message: userError(error) });
    } finally {
      setLoading(false);
    }
  }, [connection?.connected, connection?.workspace?.id, connection?.workspace?.role, loadAccounts, settingsTab, view]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { void loadView(); }, [loadView]);
  useEffect(() => {
    if (!connection?.connected || acceptingInvitation.current) return;
    const token = new URL(window.location.href).searchParams.get('invite');
    if (!token) return;
    acceptingInvitation.current = true;
    void sendRemoteMessage('invitation-accept', { token })
      .then(() => {
        window.history.replaceState(null, document.title, window.location.pathname);
        setNotice({ tone: 'success', message: 'Convite aceito. O workspace foi ativado.' });
        return reload();
      })
      .catch((error) => {
        window.history.replaceState(null, document.title, window.location.pathname);
        setNotice({ tone: 'danger', message: userError(error) });
      });
  }, [connection?.connected, reload]);

  async function run(action, successMessage) {
    setLoading(true);
    try {
      const result = await action();
      if (successMessage) setNotice({ tone: 'success', message: successMessage });
      return result;
    } catch (error) {
      setNotice({ tone: 'danger', message: userError(error) });
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function activateWorkspace(workspaceId) {
    if (!workspaceId) return;
    await run(async () => {
      await sendRemoteMessage('workspace-activate', { workspaceId });
      await reload();
    });
  }

  async function connectAccount() {
    await run(async () => {
      await sendRemoteMessage('oauth-start');
    }, 'Autorize a conta do Mercado Livre na aba aberta.');
  }

  async function updateAccount(account, enabled) {
    await run(async () => {
      await sendRemoteMessage('account-update', { userId: account.user_id, enabled });
      await loadAccounts();
    }, enabled ? 'Conta habilitada.' : 'Conta desativada.');
  }

  async function confirmDialog() {
    if (!dialog) return;
    if (dialog.type === 'account-delete') {
      const result = await run(async () => {
        await sendRemoteMessage('account-remove', { userId: dialog.account.user_id });
        await loadAccounts();
      }, 'Conta removida do workspace.');
      if (result !== null) setDialog(null);
      return;
    }
    if (dialog.type === 'member-delete') {
      const result = await run(async () => {
        await sendRemoteMessage('member-remove', { userId: dialog.member.id });
        await loadView();
      }, 'Pessoa removida do workspace.');
      if (result !== null) setDialog(null);
    }
  }

  async function submitMember(values) {
    const result = await run(async () => {
      if (dialog.type === 'member') {
        await sendRemoteMessage('member-update', { userId: dialog.member.id, payload: { role: values.role, accountIds: values.accountIds } });
      } else {
        const response = await sendRemoteMessage('invitation-create', { payload: values });
        if (response.invitation?.url) {
          await navigator.clipboard.writeText(response.invitation.url).catch(() => undefined);
          setNotice({ tone: 'success', message: 'Link de convite criado e copiado.' });
        }
      }
      await loadView();
    }, dialog.type === 'member' ? 'Acesso atualizado.' : values.kind === 'email' ? 'Convite enviado.' : null);
    if (result !== null) setDialog(null);
  }

  async function revokeInvitation(invitation) {
    await run(async () => {
      await sendRemoteMessage('invitation-revoke', { invitationId: invitation.id });
      await loadView();
    }, 'Convite revogado.');
  }

  async function saveProfile(name) {
    return run(async () => {
      const result = await sendRemoteMessage('profile-update', { payload: { displayName: name } });
      setProfile(result);
      setConnection((current) => ({ ...current, user: { ...current.user, name: name.trim() || current.user.name } }));
    }, 'Perfil salvo.');
  }

  async function uploadAvatar(file, onProgress) {
    if (!(file instanceof File)) throw new Error('Não foi possível ler a imagem.');
    try {
      const dataUrl = await readDataUrl(file);
      const result = await sendRemoteMessage('profile-avatar', { dataUrl });
      setProfile(result);
      setConnection((current) => ({ ...current, user: { ...current.user, avatarUrl: result.user.avatarUrl } }));
      onProgress(100);
    } catch (error) {
      const failure = new Error(userError(error, 'Não foi possível enviar a imagem agora. Tente novamente.'));
      failure.code = error?.code || '';
      throw failure;
    }
  }

  async function saveWorkspace(name) {
    await run(async () => {
      const result = await sendRemoteMessage('profile-update', { payload: { displayName: profile.user.name, workspaceName: name } });
      setProfile(result);
      await reload();
    }, 'Nome do workspace salvo.');
  }

  async function submitSecurity(values) {
    if (!values.currentPassword) {
      setNotice({ tone: 'warning', message: 'Informe sua senha atual.' });
      return;
    }
    if (security === 'password' && (!values.nextPassword || values.nextPassword !== values.confirmation)) {
      setNotice({ tone: 'warning', message: 'As novas senhas não coincidem.' });
      return;
    }
    if (security === 'email' && !values.nextEmail) {
      setNotice({ tone: 'warning', message: 'Informe o novo e-mail.' });
      return;
    }
    const result = await run(async () => {
      const RemoteAuth = window.OnFrameRemoteAuth;
      const config = await RemoteAuth.loadConfig();
      const session = await RemoteAuth.request(config, 'token?grant_type=password', {
        email: profile.user.email,
        password: values.currentPassword
      });
      const requestOptions = { method: 'PUT', accessToken: session.access_token };
      const payload = security === 'password' ? { password: values.nextPassword } : { email: values.nextEmail };
      if (security === 'email') {
        const flow = await sendRemoteMessage('auth-flow-start');
        requestOptions.redirectTo = flow.redirectTo;
      }
      await RemoteAuth.request(config, 'user', payload, requestOptions);
    }, security === 'password' ? 'Senha atualizada.' : 'Confira seu novo e-mail para concluir a alteração.');
    if (result !== null) setSecurity(null);
  }

  async function removeSession(sessionId) {
    await run(async () => {
      setProfile(await sendRemoteMessage('profile-session-remove', { sessionId }));
    }, 'Sessão revogada.');
  }

  async function disconnect() {
    await run(async () => {
      await sendRemoteMessage('disconnect');
      await reload();
    });
  }

  if (connection === null && loading) {
    return (
      <main className="onframe-auth-page" aria-busy="true">
        <div className="onframe-auth-surface onframe-stack" role="status" aria-label="Verificando acesso">
          <div className="onframe-brand">
            <LogoMark size={28} />
            <div><p className="onframe-eyebrow">ONFRAME</p><Skeleton width={152} height={18} radius={6} /></div>
          </div>
          <Card padding={24}>
            <div className="onframe-stack">
              <Skeleton width="32%" height={10} radius={5} />
              <Skeleton width="68%" height={20} radius={6} />
              <Skeleton width="100%" height={14} radius={6} />
              <Skeleton width="100%" height={42} radius={10} />
            </div>
          </Card>
        </div>
      </main>
    );
  }

  const connected = Boolean(connection?.connected && connection?.user && connection?.workspace);
  if (!connected) {
    return (
      <main className="onframe-auth-page">
        <div className="onframe-auth-surface onframe-stack">
          <div className="onframe-brand">
            <LogoMark size={28} />
            <div><p className="onframe-eyebrow">ONFRAME</p><p className="onframe-brand-name">Acesso da <em>extensão</em></p></div>
          </div>
          <Card padding={24}>
            <div className="onframe-stack">
              <div>
                <p className="onframe-eyebrow">WORKSPACE</p>
                <h1 className="onframe-card-title">Entre no OnFrame</h1>
                <p className="onframe-card-copy">Use sua conta para conectar este navegador ao workspace.</p>
              </div>
              {connection?.reason === 'auth_pending' && <Alert tone="info">Confira o link enviado para seu e-mail. Ao voltar à extensão, o acesso será concluído.</Alert>}
              {notice && <Alert tone={notice.tone} dismissible onClose={() => setNotice(null)}>{notice.message}</Alert>}
              <AuthPanel onConnected={reload} onPending={() => setNotice({ tone: 'info', message: 'Confira seu e-mail para concluir o acesso.' })} />
            </div>
          </Card>
        </div>
      </main>
    );
  }

  const workspace = connection.workspace;
  const settingsTabLabels = {
    account: 'Conta',
    workspace: 'Workspace',
    application: 'Aplicativo'
  };
  const settingsDetail = view === 'settings' && settingsPage !== 'index' ? SETTINGS_PAGE_META[settingsTab]?.[settingsPage] : undefined;
  const meta = settingsDetail || VIEW_META[view];
  const breadcrumbs = settingsDetail
    ? [
      { label: 'Início', icon: 'house', href: '#inicio' },
      { label: 'Configurações', icon: 'gear-six', href: '#configuracoes' },
      { label: settingsTabLabels[settingsTab] },
      ...(settingsTab === 'account' && settingsPage === 'sessions' ? [{ label: 'Segurança e login', href: '#configuracoes-account-security' }] : []),
      { label: meta.title }
    ]
    : view === 'home'
      ? [{ label: 'Início', icon: 'house' }]
      : [
        { label: 'Início', icon: 'house', href: '#inicio' },
        { label: meta.title }
      ];
  const goBackFromSettingsDetail = settingsDetail
    ? () => {
      if (settingsTab === 'account' && settingsPage === 'sessions') {
        setSettingsPage('security');
        return;
      }
      setSettingsPage('index');
    }
    : undefined;
  const navigateBreadcrumb = (item) => {
    const targets = {
      '#inicio': { view: 'home' },
      '#configuracoes': { tab: 'account', page: 'index' },
      '#configuracoes-account-security': { tab: 'account', page: 'security' }
    };
    const target = targets[item.href];
    if (target) {
      if (target.view) {
        setView(target.view);
        return;
      }
      setSettingsTab(target.tab);
      setSettingsPage(target.page);
      setView('settings');
    }
  };
  const admin = workspace.role === 'admin';
  const navigation = [
    { id: 'home', label: 'Início', icon: 'house' },
    { id: 'integrations', label: 'Integrações', icon: 'storefront' },
    { id: 'settings', label: 'Configurações', icon: 'gear-six' }
  ];
  const personName = connection.user.name || connection.user.email;
  const accountMenu = [
    { label: 'Conta', icon: 'user-circle', onSelect: () => { setSettingsTab('account'); setSettingsPage('profile'); setView('settings'); } },
    ...(admin ? [{ label: 'Workspace', icon: 'gear-six', onSelect: () => { setSettingsTab('workspace'); setSettingsPage('general'); setView('settings'); } }] : []),
    { type: 'separator' },
    { label: 'Sair', icon: 'sign-out', tone: 'danger', onSelect: () => void disconnect() }
  ];
  const navigate = (next) => {
    if (next === 'settings') {
      setSettingsTab('account');
      setSettingsPage('index');
    }
    setView(next || 'home');
    setMobileNavigationOpen(false);
  };
  const openSettings = (tab, page = 'index') => {
    setSettingsTab(tab);
    setSettingsPage(page);
    setView('settings');
    setMobileNavigationOpen(false);
  };
  const activeWorkspace = workspaces.find((item) => item.id === workspace.id);
  const workspaceOptions = workspaces.map((item) => ({ label: item.name, id: item.id }));
  const workspaceControl = workspaceOptions.length > 1 ? (
    <Select
      label="Workspace ativo"
      options={workspaceOptions}
      value={activeWorkspace?.name || null}
      onChange={(name) => activateWorkspace(workspaces.find((item) => item.name === name)?.id)}
      width={220}
    />
  ) : null;
  const pageContext = (
    <div className="onframe-options-context-crumbs">
      {settingsDetail && <Button kind="primary" size="sm" icon={<Ph n="caret-left" size={16} />} onClick={goBackFromSettingsDetail}>Voltar</Button>}
      <Breadcrumbs items={breadcrumbs} size="sm" onNavigate={navigateBreadcrumb} />
    </div>
  );
  const pageHeaderActions = workspaceControl || undefined;

  return (
    <main className={`onframe-options${navigationCollapsed ? ' onframe-options--collapsed' : ''}`}>
      <aside className="onframe-options-sidebar" aria-label="Navegação do workspace">
        <SideNav
          items={navigation}
          active={view}
          onNav={navigate}
          collapsed={navigationCollapsed}
          onToggle={() => setNavigationCollapsed((collapsed) => !collapsed)}
          flush
          accountName={personName}
          accountDetail={connection.user.email}
          accountImage={connection.user.avatarUrl}
          accountImageAlt=""
          accountMenu={accountMenu}
          menuLabel="Conta"
        />
      </aside>
      <div className="onframe-options-column">
        <div className="onframe-options-desktop-context">{pageContext}</div>
        <div className="onframe-options-mobile-nav">
          <Navbar
            layout="context"
            size="sm"
            sticky
            onMenuToggle={() => setMobileNavigationOpen(true)}
            crumbs={pageContext}
          />
        </div>
        <section className="onframe-options-main">
          <div className={`onframe-options-content${settingsDetail ? '' : ' onframe-options-content--root'}`}>
            <PageHeader
              meta={meta}
              actions={pageHeaderActions}
              reserveContextSpace
            />
            {notice && <Alert tone={notice.tone} dismissible onClose={() => setNotice(null)}>{notice.message}</Alert>}
            {view === 'home' && <Home workspace={workspace} overview={overview} accounts={accounts} invitations={admin ? invitations : []} admin={admin} loading={loading} onConnect={() => void connectAccount()} onOpenIntegrations={() => setView('integrations')} onOpenWorkspace={() => openSettings('workspace', 'general')} />}
            {view === 'integrations' && <Integrations accounts={accounts} admin={admin} loading={loading} onConnect={() => void connectAccount()} onUpdate={(account, enabled) => void updateAccount(account, enabled)} onRemove={(account) => setDialog({ type: 'account-delete', account })} />}
            {view === 'settings' && <Settings activeSection={settingsTab} onSectionChange={setSettingsTab} settingsPage={settingsPage} onSettingsPageChange={setSettingsPage} workspace={workspace} profile={profile} members={members} invitations={invitations} accounts={accounts} admin={admin} loading={loading} onSaveProfile={saveProfile} onAvatar={uploadAvatar} onOpenSecurity={setSecurity} onRemoveSession={(sessionId) => void removeSession(sessionId)} onDisconnect={() => void disconnect()} onSaveWorkspace={(name) => void saveWorkspace(name)} onInvite={() => setDialog({ type: 'invite' })} onEdit={(member) => setDialog({ type: 'member', member })} onRemove={(member) => setDialog({ type: 'member-delete', member })} onRevoke={(invitation) => void revokeInvitation(invitation)} />}
          </div>
        </section>
      </div>
      <Drawer open={mobileNavigationOpen} onClose={() => setMobileNavigationOpen(false)} side="left" width={300} title="Navegação do OnFrame">
        <div className="onframe-options-drawer-content">
          <SideNav
            items={navigation}
            active={view}
            onNav={navigate}
            flush
            hideBrand
            accountName={personName}
            accountDetail={connection.user.email}
            accountImage={connection.user.avatarUrl}
            accountImageAlt=""
            accountMenu={accountMenu}
            menuLabel="Conta"
          />
        </div>
      </Drawer>

      <MemberModal dialog={dialog} accounts={accounts} busy={loading} onClose={() => setDialog(null)} onConfirm={(values) => void submitMember(values)} />
      <SecurityModal open={Boolean(security)} kind={security} email={profile?.user?.email} busy={loading} onClose={() => setSecurity(null)} onConfirm={(values) => void submitSecurity(values)} />
      <Modal
        open={dialog?.type === 'account-delete' || dialog?.type === 'member-delete'}
        onClose={() => setDialog(null)}
        title={dialog?.type === 'account-delete' ? 'Remover conta' : 'Remover pessoa'}
        footer={<><Button kind="secondary" disabled={loading} onClick={() => setDialog(null)}>Cancelar</Button><Button kind="danger" disabled={loading} onClick={() => void confirmDialog()}>Remover</Button></>}
      >
        {dialog?.type === 'account-delete'
          ? `Remover ${accountName(dialog.account)} deste workspace? Esta ação não revoga a autorização no Mercado Livre.`
          : dialog?.member ? `Remover ${dialog.member.name || dialog.member.email} deste workspace? O acesso às contas atribuídas será encerrado.` : ''}
      </Modal>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<OptionsApp />);
