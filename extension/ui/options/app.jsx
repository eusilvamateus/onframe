import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import '@onblide/ui/styles.css';
import { Alert, Avatar, Badge, Breadcrumbs, Button, ButtonGroup, Card, Checkbox, Divider, Drawer, FileUpload, Input, Link, List, ListItem, ListSubheader, Modal, Navbar, Ph, SearchInput, Select, SideNav, Skeleton, Table, Tabs } from '@onblide/ui';
import '../shared/app.css';
import { AuthBrand, AuthPanel } from '../shared/AuthPanel';
import { PasskeySettings, TwoFactorSettings } from './TwoFactorSettings';
import { CredentialSettings } from './CredentialSettings';
import { SecuritySettings } from './SecuritySettings';
import { SectionHeader } from '../shared/SectionHeader';
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
    sessions: { title: 'Sessões ativas', icon: 'browser' },
    mfa: { title: 'Verificação em duas etapas', icon: 'shield-check' },
    passkeys: { title: 'Chaves de acesso', icon: 'key' },
    password: { title: 'Alterar senha', icon: 'password' },
    email: { title: 'Alterar e-mail', icon: 'envelope-simple' }
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
  return <List as="nav" dividers ariaLabel={ariaLabel}>{settingsOptionItems(options, onNavigate, showCategory)}</List>;
}

function SettingsDirectory({ options, onNavigate }) {
  const sections = SETTINGS_SECTIONS
    .map((section) => ({ ...section, options: options.filter((option) => option.tab === section.id) }))
    .filter((section) => section.options.length > 0);
  return <List as="nav" dividers ariaLabel="Configurações">
    {sections.flatMap((section) => [
      <ListSubheader key={`header-${section.id}`}>{section.label}</ListSubheader>,
      ...settingsOptionItems(section.options, onNavigate)
    ])}
  </List>;
}

function ProfileSettings({ profile, loading, onSave, onAvatar, onRemoveAvatar, onOpenSecuritySettings }) {
  const savedName = profile?.user?.name || '';
  const [name, setName] = useState(savedName);
  const [avatarControlKey, setAvatarControlKey] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  useEffect(() => setName(savedName), [savedName]);
  if (!profile) return null;
  const changed = name !== savedName;
  async function uploadProfileAvatar(file, onProgress) {
    setAvatarBusy(true);
    let progress = 5;
    onProgress(progress);
    const timer = setInterval(() => {
      progress = Math.min(95, progress + Math.max(1, Math.ceil((95 - progress) / 6)));
      onProgress(progress);
      if (progress === 95) clearInterval(timer);
    }, 150);
    try {
      await onAvatar(file);
      onProgress(100);
    } finally {
      clearInterval(timer);
      setAvatarBusy(false);
    }
  }
  async function removeProfileAvatar() {
    setAvatarBusy(true);
    try {
      await onRemoveAvatar();
    } finally {
      setAvatarControlKey((current) => current + 1);
      setAvatarBusy(false);
    }
  }
  const avatarFiles = profile.user.avatarUrl ? [{
    id: 'profile-avatar',
    name: 'Foto do perfil',
    size: 0,
    type: 'image/*',
    url: profile.user.avatarUrl
  }] : [];
  return (
    <section className="onframe-stack onframe-settings-form" aria-label="Dados pessoais">
      <SectionHeader title="Dados pessoais" copy="Defina como sua conta aparece no OnFrame." />
      <div className="onframe-profile-layout">
        <FileUpload
          key={`${profile.user.avatarUrl || 'empty'}-${avatarControlKey}`}
          variant="image"
          shape="square"
          size={160}
          multiple={false}
          label="Foto do perfil"
          hint="PNG, JPEG ou WebP. Até 2 MB."
          accept="image/png,image/jpeg,image/webp"
          acceptLabel="PNG, JPEG ou WebP"
          maxSize={2 * 1024 * 1024}
          defaultFiles={avatarFiles}
          disabled={avatarBusy}
          upload={uploadProfileAvatar}
          onChange={(files) => {
            if (files.length === 0 && profile.user.avatarUrl) {
              void removeProfileAvatar();
            }
          }}
        />
        <div className="onframe-profile-fields">
          <Input label="Nome" value={name} autoComplete="name" disabled={loading} onChange={(event) => setName(event.target.value)} />
          <Input
            label="E-mail"
            value={profile.user.email || ''}
            disabled
            hint={<><span>Para alterar este e-mail, acesse </span><Link href="#settings-account-security" onClick={(event) => { event.preventDefault(); onOpenSecuritySettings(); }}>Segurança e login</Link>.</>}
          />
        </div>
      </div>
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

function SessionsSettings({ securityOverview, loading, onRemoveSession, onRemoveAllSessions }) {
  const [confirmation, setConfirmation] = useState(null);
  if (!securityOverview) return <p className="onframe-muted" role="status">{loading ? 'Carregando sessões...' : 'Os dados de sessões estão indisponíveis.'}</p>;
  const sessions = securityOverview.sessions;
  return (
    <div className="onframe-stack">
      <section className="onframe-stack" aria-label="Navegadores autorizados">
        <SectionHeader title="Dispositivos conectados" copy="Confira onde sua conta está conectada e encerre acessos que não reconhece." />
        <List ariaLabel="Dispositivos conectados" dividers>
          {sessions.map((session) => (
            <ListItem
              key={session.id}
              leading={<Ph n={session.deviceType === 'mobile' ? 'device-mobile' : session.deviceType === 'tablet' ? 'device-tablet' : 'desktop'} size={20} />}
              title={session.browser}
              strong
              wrap
              description={<>{session.operatingSystem}<br />Última atividade: {formatDate(session.lastSeenAt || session.createdAt)}<br />Conectado desde: {formatDate(session.createdAt)}</>}
              meta={session.current ? <Badge tone="blue">Sessão atual</Badge> : undefined}
              trailing={<Button kind="secondary" size="sm" disabled={loading} icon={<Ph n="sign-out" size={16} />} onClick={() => setConfirmation(session)}>Sair</Button>}
            />
          ))}
        </List>
        {sessions.length === 0 && <p className="onframe-empty">Não há sessões ativas.</p>}
      </section>
      <Divider decorative />
      <SectionHeader title="Sair de todas as sessões" copy="Encerra os acessos em todos os dispositivos, incluindo este." actions={<Button kind="danger" disabled={loading} icon={<Ph n="sign-out" size={18} />} onClick={() => setConfirmation('all')}>Sair de todas as sessões</Button>} />
      {confirmation && <div className="onframe-stack" role="region" aria-label="Confirmar encerramento">
        <Alert tone="warning">{confirmation === 'all' ? 'Você precisará entrar novamente em todos os dispositivos.' : `Encerrar a sessão de ${confirmation.browser}?${confirmation.current ? ' Você precisará entrar novamente neste dispositivo.' : ''}`}</Alert>
        <div className="onframe-actions"><Button kind="secondary" disabled={loading} onClick={() => setConfirmation(null)}>Cancelar</Button><Button kind="danger" disabled={loading} onClick={async () => {
          const result = confirmation === 'all' ? await onRemoveAllSessions() : await onRemoveSession(confirmation);
          if (result !== null) setConfirmation(null);
        }}>Confirmar encerramento</Button></div>
      </div>}
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

function Settings({ activeSection, onSectionChange, settingsPage, onSettingsPageChange, workspace, profile, securityOverview, members, invitations, accounts, admin, loading, onSaveProfile, onAvatar, onRemoveAvatar, onCredentialChanged, onRemoveSession, onRemoveAllSessions, onDisconnect, onSaveWorkspace, onInvite, onEdit, onRemove, onRevoke }) {
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
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar configurações..." width="min(100%, 520px)" />
        {normalizedQuery && (matches.length > 0
          ? <SettingsOptionList options={matches} ariaLabel="Resultados da busca" onNavigate={selectOption} showCategory />
          : <p className="onframe-empty">Nenhuma configuração encontrada.</p>)}
        {!normalizedQuery && <SettingsDirectory options={availableOptions} onNavigate={selectOption} />}
      </>}
      {!isIndex && activeSection === 'account' && settingsPage === 'profile' && <ProfileSettings profile={profile} loading={loading} onSave={onSaveProfile} onAvatar={onAvatar} onRemoveAvatar={onRemoveAvatar} onOpenSecuritySettings={() => onSettingsPageChange('security')} />}
      {!isIndex && activeSection === 'account' && settingsPage === 'security' && <SecuritySettings profile={profile} securityOverview={securityOverview} loading={loading} onOpenSecurity={onSettingsPageChange} onOpenSessions={() => onSettingsPageChange('sessions')} onOpenMfa={() => onSettingsPageChange('mfa')} onOpenPasskeys={() => onSettingsPageChange('passkeys')} />}
      {!isIndex && activeSection === 'account' && ['password', 'email', 'mfa', 'passkeys'].includes(settingsPage) && !securityOverview && <p className="onframe-muted" role="status">{loading ? 'Carregando segurança da conta...' : 'Os dados de segurança estão indisponíveis.'}</p>}
      {!isIndex && activeSection === 'account' && ['password', 'email'].includes(settingsPage) && profile && securityOverview && <CredentialSettings key={settingsPage} kind={settingsPage} profile={profile} onChanged={onCredentialChanged} />}
      {!isIndex && activeSection === 'account' && settingsPage === 'sessions' && <SessionsSettings securityOverview={securityOverview} loading={loading} onRemoveSession={onRemoveSession} onRemoveAllSessions={onRemoveAllSessions} />}
      {!isIndex && activeSection === 'account' && settingsPage === 'mfa' && profile && securityOverview && <TwoFactorSettings profile={profile} securityOverview={securityOverview} onDisconnect={onDisconnect} />}
      {!isIndex && activeSection === 'account' && settingsPage === 'passkeys' && profile && securityOverview && <PasskeySettings profile={profile} securityOverview={securityOverview} />}
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

function OptionsApp() {
  const [connection, setConnection] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [profile, setProfile] = useState(null);
  const [securityOverview, setSecurityOverview] = useState(null);
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
  const acceptingInvitation = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextConnection = await sendRemoteMessage('status');
      setConnection(nextConnection);
      if (!nextConnection?.connected) {
        setWorkspaces([]);
        setProfile(null);
        setSecurityOverview(null);
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
    const needsSecurity = view === 'settings' && settingsTab === 'account' && ['security', 'sessions', 'mfa', 'passkeys', 'password', 'email'].includes(settingsPage);
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
      if (view === 'settings' && settingsTab === 'account') {
        const [nextProfile, nextSecurity] = await Promise.all([
          sendRemoteMessage('profile'), needsSecurity ? sendRemoteMessage('security') : Promise.resolve(null)
        ]);
        setProfile(nextProfile);
        if (needsSecurity) setSecurityOverview(nextSecurity);
      }
      if (view === 'settings' && settingsTab === 'workspace' && admin) {
        const [memberResult, invitationResult] = await Promise.all([sendRemoteMessage('members'), sendRemoteMessage('invitations'), loadAccounts()]);
        setMembers(memberResult.members || []);
        setInvitations(invitationResult.invitations || []);
      }
    } catch (error) {
      if (needsSecurity) setSecurityOverview(null);
      setNotice({ tone: error?.code === 'security_backend_unavailable' ? 'info' : 'danger', message: userError(error) });
      if (error?.code === 'identity_session_invalid' || error?.code === 'extension_session_unauthorized') {
        setConnection({ connected: false, reason: 'unauthorized' });
      }
    } finally {
      setLoading(false);
    }
  }, [connection?.connected, connection?.workspace?.id, connection?.workspace?.role, loadAccounts, settingsTab, settingsPage, view]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const refreshOnFocus = () => { void reload().then(loadView); };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [reload, loadView]);
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
      if (error?.code === 'identity_session_invalid' || error?.code === 'extension_session_unauthorized') {
        setConnection({ connected: false, reason: 'unauthorized' });
      }
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

  async function uploadAvatar(file) {
    if (!(file instanceof File)) throw new Error('Não foi possível ler a imagem.');
    try {
      const dataUrl = await readDataUrl(file);
      const result = await sendRemoteMessage('profile-avatar', { dataUrl });
      setProfile(result);
      setConnection((current) => ({ ...current, user: { ...current.user, avatarUrl: result.user.avatarUrl } }));
    } catch (error) {
      const failure = new Error(userError(error, 'Não foi possível enviar a imagem agora. Tente novamente.'));
      failure.code = error?.code || '';
      throw failure;
    }
  }

  async function removeAvatar() {
    return run(async () => {
      const result = await sendRemoteMessage('profile-avatar-remove');
      setProfile(result);
      setConnection((current) => ({ ...current, user: { ...current.user, avatarUrl: result.user.avatarUrl } }));
      return result;
    }, 'Foto removida.');
  }

  async function saveWorkspace(name) {
    await run(async () => {
      const result = await sendRemoteMessage('profile-update', { payload: { displayName: profile.user.name, workspaceName: name } });
      setProfile(result);
      await reload();
    }, 'Nome do workspace salvo.');
  }

  async function removeSession(session) {
    return run(async () => {
      await sendRemoteMessage('security-session-remove', { sessionId: session.id });
      if (session.current) await disconnect();
      else setSecurityOverview(await sendRemoteMessage('security'));
      return true;
    }, 'Sessão encerrada.');
  }

  async function removeAllSessions() {
    return run(async () => {
      await sendRemoteMessage('security-sessions-remove-all');
      await reload();
      setSecurityOverview(null);
      return true;
    }, 'Todas as sessões foram encerradas.');
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
          <AuthBrand />
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
          {notice && <Alert tone={notice.tone} dismissible onClose={() => setNotice(null)}>{notice.message}</Alert>}
          <AuthPanel onConnected={reload} />
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
      ...(settingsTab === 'account' && ['sessions', 'mfa', 'passkeys', 'password', 'email'].includes(settingsPage) ? [{ label: 'Segurança e login', href: '#configuracoes-account-security' }] : []),
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
      if (settingsTab === 'account' && ['sessions', 'mfa', 'passkeys', 'password', 'email'].includes(settingsPage)) {
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
      <Breadcrumbs items={breadcrumbs} size="sm" maxItems={3} onNavigate={navigateBreadcrumb} />
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
            {view === 'settings' && <Settings activeSection={settingsTab} onSectionChange={setSettingsTab} settingsPage={settingsPage} onSettingsPageChange={setSettingsPage} workspace={workspace} profile={profile} securityOverview={securityOverview} members={members} invitations={invitations} accounts={accounts} admin={admin} loading={loading} onSaveProfile={saveProfile} onAvatar={uploadAvatar} onRemoveAvatar={removeAvatar} onCredentialChanged={(message) => { setConnection({ connected: false }); setProfile(null); setSecurityOverview(null); setNotice(message); }} onRemoveSession={removeSession} onRemoveAllSessions={removeAllSessions} onDisconnect={() => void disconnect()} onSaveWorkspace={(name) => void saveWorkspace(name)} onInvite={() => setDialog({ type: 'invite' })} onEdit={(member) => setDialog({ type: 'member', member })} onRemove={(member) => setDialog({ type: 'member-delete', member })} onRevoke={(invitation) => void revokeInvitation(invitation)} />}
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
