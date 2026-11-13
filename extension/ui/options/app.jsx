import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import '@onblide/ui/styles.css';
import {
  Alert,
  AlertDialog,
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  ButtonGroup,
  Card,
  Divider,
  FileUpload,
  Input,
  Link,
  List,
  ListItem,
  Menu,
  Modal,
  Navbar,
  Ph,
  SearchInput,
  Select,
  Sidebar,
  Skeleton,
  Tabs,
  ToastStack,
  ToggleButton,
  Tooltip,
  toast
} from '@onblide/ui';
import '../shared/app.css';
import { AuthBrand, AuthPanel } from '../shared/AuthPanel';
import { PasskeySettings, TwoFactorSettings } from './TwoFactorSettings';
import { CredentialSettings } from './CredentialSettings';
import { SecuritySettings } from './SecuritySettings';
import { WorkspacePeople } from './WorkspacePeople';
import { WorkspaceRoles } from './WorkspaceRoles';
import { AccountDeletionSettings } from './AccountDeletionSettings';
import { SectionHeader } from '../shared/SectionHeader';
import { ThemeCycleButton, useThemeSubmenuItem } from '../shared/ThemeControl';
import { AppearanceSettings } from './AppearanceSettings';
import { WorkspaceAccessModal } from '../shared/WorkspaceAccessModal';
import { IntegrationAccount, accountName } from '../shared/IntegrationAccount';
import { ItemEditHistory } from './ItemEditHistory';
import { Products } from './Products';
import { ProductSettings } from './ProductSettings';
import { TaxSettings } from './TaxSettings';
import { formatDate, openUpdater, readDataUrl, sendRemoteMessage, userError } from '../shared/runtime';

const VIEW_META = {
  home: { title: 'Início', icon: 'house' },
  integrations: { title: 'Integrações', icon: 'storefront' },
  products: { title: 'Produtos', icon: 'package' },
  history: { title: 'Histórico', icon: 'clock-counter-clockwise' },
  settings: { title: 'Configurações', icon: 'gear-six' }
};

const VIEW_HASHES = {
  home: '#inicio',
  integrations: '#integracoes',
  products: '#products',
  history: '#history',
  settings: '#configuracoes'
};

const HASH_VIEWS = Object.fromEntries(Object.entries(VIEW_HASHES).map(([view, hash]) => [hash, view]));

const SETTINGS_OPTIONS = [
  {
    tab: 'account',
    page: 'profile',
    category: 'Conta',
    label: 'Perfil',
    description: 'Foto, nome e e-mail da sua conta.',
    icon: 'user-circle',
    keywords: 'foto nome email dados pessoais'
  },
  {
    tab: 'account',
    page: 'security',
    category: 'Conta',
    label: 'Segurança e login',
    description: 'Senha, e-mail de acesso e sessões.',
    icon: 'shield-check',
    keywords: 'senha email login credenciais seguranca'
  },
  {
    tab: 'workspace',
    page: 'general',
    category: 'Workspace',
    label: 'Geral',
    description: 'Nome e informações do workspace.',
    icon: 'buildings',
    keywords: 'nome informacoes empresa'
  },
  {
    tab: 'workspace',
    page: 'people',
    category: 'Workspace',
    label: 'Perfis de usuários',
    description: 'Pessoas, perfis e convites do workspace.',
    icon: 'users-three',
    keywords: 'membros administradores convites permissoes roles acesso'
  },
  {
    tab: 'workspace',
    page: 'products',
    category: 'Workspace',
    label: 'Produtos',
    description: 'Preferências do cadastro de produtos.',
    icon: 'package',
    keywords: 'produto cadastro custo casas decimais precisao'
  },
  {
    tab: 'workspace',
    page: 'margin',
    category: 'Workspace',
    label: 'Margem de contribuição',
    description: 'Impostos usados no cálculo das promoções.',
    icon: 'percent',
    keywords: 'margem imposto aliquota produto conta promocao'
  },
  {
    tab: 'application',
    page: 'appearance',
    category: 'Aplicativo',
    label: 'Aparência',
    description: 'Tema claro, escuro ou definido pelo sistema.',
    icon: 'circle-half',
    keywords: 'aparencia tema claro escuro sistema'
  },
  {
    tab: 'application',
    page: 'updates',
    category: 'Aplicativo',
    label: 'Atualizações',
    description: 'Versão instalada e atualizador da extensão.',
    icon: 'arrow-clockwise',
    keywords: 'versao atualizar atualizador extensao'
  }
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
    people: { title: 'Perfis de usuários', icon: 'users-three' },
    roles: { title: 'Perfis de usuários', icon: 'shield-check' },
    products: { title: 'Configurações de produtos', icon: 'package' },
    margin: { title: 'Margem de contribuição', icon: 'percent' }
  },
  application: {
    appearance: { title: 'Aparência', icon: 'circle-half' },
    updates: { title: 'Atualizações', icon: 'arrow-clockwise' }
  }
};

function workspaceCan(workspace, permission) {
  return workspace?.roleId === 'admin' || workspace?.permissions?.includes(permission) === true;
}

function routeFromHash(hash) {
  if (HASH_VIEWS[hash]) return { view: HASH_VIEWS[hash], tab: 'account', page: 'index' };
  for (const [tab, pages] of Object.entries(SETTINGS_PAGE_META)) {
    for (const page of Object.keys(pages)) {
      if (hash === `#configuracoes-${tab}-${page}`) return { view: 'settings', tab, page };
    }
  }
  return { view: 'home', tab: 'account', page: 'index' };
}

function hashFromRoute(view, tab, page) {
  if (view === 'settings' && SETTINGS_PAGE_META[tab]?.[page]) return `#configuracoes-${tab}-${page}`;
  return VIEW_HASHES[view] || VIEW_HASHES.home;
}

function searchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function feedbackSurface({ tone, visible = false, needsAttention = false }) {
  if (needsAttention || tone === 'danger' || tone === 'warning') return 'alert';
  return visible ? 'none' : 'toast';
}

function PageHeader({ meta, actions, onBack, reserveContextSpace = false, alignActionsWithTitle = false }) {
  return (
    <header className={`onframe-page-header${alignActionsWithTitle ? ' onframe-page-header--aligned-actions' : ''}`}>
      <div className="onframe-stack" style={{ gap: 'var(--ob-space-4)' }}>
        {reserveContextSpace && <div className="onframe-page-context-spacer" aria-hidden="true" />}
        <div>
          {meta.eyebrow && <p className="onframe-eyebrow">{meta.eyebrow}</p>}
          <div className="onframe-page-heading">
            {onBack && (
              <Tooltip label="Voltar" placement="bottom">
                <Button
                  kind="quiet"
                  tone="neutral"
                  size="sm"
                  iconOnly
                  aria-label="Voltar"
                  icon={<Ph n="arrow-left" size={18} />}
                  onClick={onBack}
                />
              </Tooltip>
            )}
            <h1 className="onframe-page-title">{meta.title}</h1>
          </div>
        </div>
      </div>
      {actions && <div className="onframe-actions">{actions}</div>}
    </header>
  );
}

function FeedbackRoot({ children }) {
  return (
    <>
      <ToastStack position="bottom-right" />
      {children}
    </>
  );
}

function Home({
  workspace,
  accounts,
  invitations,
  admin,
  canAccountsRead,
  canAccountsWrite,
  canProductsRead,
  canSettingsRead,
  canHistoryRead,
  loading,
  onConnect,
  onOpenIntegrations,
  onOpenProducts,
  onOpenMargin,
  onOpenHistory,
  onOpenPeople
}) {
  const pendingInvitations = invitations.length;
  const disabledAccounts = accounts.filter((account) => account.enabled === false).length;
  const emptyAccounts = accounts.length === 0;
  const hasAttention =
    (canAccountsRead && (emptyAccounts || disabledAccounts > 0)) || (admin && pendingInvitations > 0);
  const navigation = (href, onClick) => ({
    href,
    onClick: (event) => {
      event.preventDefault();
      onClick();
    }
  });
  return (
    <div className="onframe-stack onframe-home">
      <SectionHeader
        eyebrow="Workspace atual"
        title={workspace.name}
        copy="Organize os dados que sustentam a análise de margem das suas promoções."
      />
      {hasAttention && (
        <section className="onframe-stack onframe-home-section" aria-label="Precisa de atenção">
          <SectionHeader title="Precisa de atenção" />
          <List dividers ariaLabel="Pendências do workspace">
            {canAccountsRead && emptyAccounts && (
              <ListItem
                leading={<Ph n="storefront" size={20} />}
                title={canAccountsWrite ? 'Conecte uma conta do Mercado Livre' : 'Nenhuma conta atribuída'}
                description={
                  canAccountsWrite
                    ? 'A conexão é necessária para editar anúncios e analisar promoções.'
                    : 'Um administrador precisa atribuir uma conta ao seu acesso.'
                }
                trailing={
                  canAccountsWrite ? (
                    <Button size="sm" disabled={loading} onClick={onConnect} icon={<Ph n="plus-circle" size={16} />}>
                      Conectar conta
                    </Button>
                  ) : undefined
                }
              />
            )}
            {canAccountsRead && disabledAccounts > 0 && (
              <ListItem
                leading={<Ph n="warning-circle" size={20} />}
                title={`${disabledAccounts} ${disabledAccounts === 1 ? 'conta desativada' : 'contas desativadas'}`}
                description="Estas contas não estão disponíveis para operação."
                trailing={<Ph n="caret-right" size={16} />}
                {...navigation('#integrations', onOpenIntegrations)}
              />
            )}
            {admin && pendingInvitations > 0 && (
              <ListItem
                leading={<Ph n="user-plus" size={20} />}
                title={`${pendingInvitations} ${pendingInvitations === 1 ? 'convite pendente' : 'convites pendentes'}`}
                description="Há pessoas aguardando acesso a este workspace."
                trailing={<Ph n="caret-right" size={16} />}
                {...navigation('#settings-workspace-people', onOpenPeople)}
              />
            )}
          </List>
        </section>
      )}
      <section className="onframe-stack onframe-home-section" aria-label="Acessos rápidos">
        <SectionHeader title="Acessos rápidos" copy="Continue pelos fluxos centrais do OnFrame." />
        <List as="nav" size="sm" dividers ariaLabel="Acessos rápidos">
          {canProductsRead && (
            <ListItem
              leading={<Ph n="package" size={20} />}
              title="Produtos"
              description="Cadastre custos e prepare os dados usados na análise de margem."
              trailing={<Ph n="caret-right" size={16} />}
              {...navigation('#products', onOpenProducts)}
            />
          )}
          {canSettingsRead && (
            <ListItem
              leading={<Ph n="percent" size={20} />}
              title="Margem de contribuição"
              description="Defina os impostos aplicados às promoções deste workspace."
              trailing={<Ph n="caret-right" size={16} />}
              {...navigation('#settings-workspace-margin', onOpenMargin)}
            />
          )}
          {canHistoryRead && (
            <ListItem
              leading={<Ph n="clock-counter-clockwise" size={20} />}
              title="Histórico"
              description="Consulte as alterações confirmadas nos anúncios."
              trailing={<Ph n="caret-right" size={16} />}
              {...navigation('#history', onOpenHistory)}
            />
          )}
        </List>
      </section>
    </div>
  );
}

function Integrations({
  accounts,
  admin,
  canWrite,
  canDelete,
  feedback,
  onDismissFeedback,
  onConnect,
  onUpdate,
  onRename,
  onRemove,
  loading
}) {
  const [mode, setMode] = useState('list');
  return (
    <div className="onframe-stack onframe-integrations">
      <div className="onframe-integration-header">
        <SectionHeader
          eyebrow="Mercado Livre"
          title={admin ? 'Contas conectadas' : 'Contas atribuídas'}
          copy={
            admin
              ? 'Conecte e controle as contas disponíveis neste workspace.'
              : 'Contas atribuídas ao seu acesso neste workspace.'
          }
          actions={
            canWrite && (
              <Button disabled={loading} onClick={onConnect} icon={<Ph n="plus-circle" size={17} />}>
                Conectar conta
              </Button>
            )
          }
        />
      </div>
      {feedback && (
        <Alert appearance="soft" tone={feedback.tone} dismissible onClose={onDismissFeedback}>
          {feedback.message}
        </Alert>
      )}
      {accounts.length === 0 ? (
        <Card padding="var(--ob-space-24)">
          <SectionHeader
            eyebrow="Estado"
            title={admin ? 'Nenhuma conta conectada' : 'Nenhuma conta atribuída'}
            copy={
              admin
                ? 'Conecte uma conta do Mercado Livre para disponibilizá-la neste workspace.'
                : 'Um administrador precisa atribuir uma conta para que você possa usá-la.'
            }
            actions={
              canWrite ? (
                <Button disabled={loading} onClick={onConnect} icon={<Ph n="plus-circle" size={17} />}>
                  Conectar conta
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <section className="onframe-integration-results" aria-label="Contas">
          <div className="onframe-integration-view-bar">
            <ButtonGroup
              selection="single"
              value={mode}
              onChange={setMode}
              ariaLabel="Visualização das contas"
              size="md"
            >
              <Tooltip label="Visualizar como lista">
                <ToggleButton value="list" appearance="ghost" icon="list-bullets" ariaLabel="Lista" />
              </Tooltip>
              <Tooltip label="Visualizar como cards">
                <ToggleButton value="cards" appearance="ghost" icon="squares-four" ariaLabel="Cards" />
              </Tooltip>
            </ButtonGroup>
          </div>
          <div className={mode === 'cards' ? 'onframe-integration-grid' : 'onframe-integration-list'}>
            {accounts.map((account) => (
              <IntegrationAccount
                key={account.id || account.user_id}
                account={account}
                admin={admin}
                canWrite={canWrite}
                canDelete={canDelete}
                mode={mode}
                loading={loading}
                onUpdate={onUpdate}
                onRename={onRename}
                onRemove={onRemove}
              />
            ))}
          </div>
        </section>
      )}
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
      onClick={(event) => {
        event.preventDefault();
        onNavigate(option);
      }}
    />
  ));
}

function SettingsOptionList({ options, ariaLabel, onNavigate, showCategory = false }) {
  return (
    <List as="nav" size="sm" ariaLabel={ariaLabel}>
      {settingsOptionItems(options, onNavigate, showCategory)}
    </List>
  );
}

function SettingsDirectory({ options, onNavigate }) {
  const sections = SETTINGS_SECTIONS.map((section) => ({
    ...section,
    options: options.filter((option) => option.tab === section.id)
  })).filter((section) => section.options.length > 0);
  return (
    <div className="onframe-settings-directory">
      {sections.map((section) => (
        <section className="onframe-settings-directory-section" key={section.id}>
          <h2 className="onframe-section-title">{section.label}</h2>
          <List as="nav" size="sm" ariaLabel={section.label}>
            {settingsOptionItems(section.options, onNavigate)}
          </List>
        </section>
      ))}
    </div>
  );
}

function ProfileSettings({ profile, securityOverview, loading, onSave, onAvatar, onRemoveAvatar, onOpenSecuritySettings, onAccountDeleted }) {
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
  const avatarFiles = profile.user.avatarUrl
    ? [
        {
          id: 'profile-avatar',
          name: 'Foto do perfil',
          size: 0,
          type: 'image/*',
          url: profile.user.avatarUrl
        }
      ]
    : [];
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
          <Input
            label="Nome"
            value={name}
            autoComplete="name"
            disabled={loading}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            label="E-mail"
            value={profile.user.email || ''}
            disabled
            hint={
              <>
                <span>Para alterar este e-mail, acesse </span>
                <Link
                  href="#settings-account-security"
                  onClick={(event) => {
                    event.preventDefault();
                    onOpenSecuritySettings();
                  }}
                >
                  Segurança e login
                </Link>
                .
              </>
            }
          />
        </div>
      </div>
      <Divider decorative />
      <AccountDeletionSettings profile={profile} securityOverview={securityOverview} onDeleted={onAccountDeleted} />
      <footer className="onframe-settings-action-bar" aria-label="Ações do perfil">
        <div className="onframe-settings-action-bar-content">
          <Divider decorative />
          <div className="onframe-settings-action-bar-controls">
            {changed && (
              <p className="onframe-settings-action-status" role="status">
                Alterações não salvas
              </p>
            )}
            <div className="onframe-settings-action-buttons">
              <ButtonGroup attached={false} justify="end" ariaLabel="Ações do perfil">
                {changed && (
                  <Button kind="ghost" disabled={loading} onClick={() => setName(savedName)}>
                    Descartar
                  </Button>
                )}
                <Button disabled={loading || !changed} onClick={() => void onSave(name)}>
                  Salvar alterações
                </Button>
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
  if (!securityOverview)
    return (
      <p className="onframe-muted" role="status">
        {loading ? 'Carregando sessões...' : 'Os dados de sessões estão indisponíveis.'}
      </p>
    );
  const sessions = securityOverview.sessions;
  return (
    <div className="onframe-stack">
      <section className="onframe-stack" aria-label="Sessões ativas">
        <SectionHeader
          title="Sessões ativas"
          copy="Confira os detalhes de cada sessão e encerre as que não reconhece."
        />
        <List ariaLabel="Sessões ativas">
          {sessions.map((session) => (
            <ListItem
              key={session.id}
              leading={
                <Ph
                  n={
                    session.deviceType === 'mobile'
                      ? 'device-mobile'
                      : session.deviceType === 'tablet'
                        ? 'device-tablet'
                        : 'desktop'
                  }
                  size={20}
                />
              }
              title={session.browser}
              strong
              wrap
              description={
                <>
                  {session.operatingSystem}
                  <br />
                  Atividade recente: {formatDate(session.lastSeenAt || session.createdAt)}
                  <br />
                  Iniciada: {formatDate(session.createdAt)}
                </>
              }
              meta={session.current ? <Badge tone="primary">Sessão atual</Badge> : undefined}
              trailing={
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={loading}
                  icon={<Ph n="sign-out" size={16} />}
                  onClick={() => setConfirmation(session)}
                >
                  Encerrar
                </Button>
              }
            />
          ))}
        </List>
        {sessions.length === 0 && <p className="onframe-empty">Não há sessões ativas.</p>}
      </section>
      <Divider decorative />
      <SectionHeader
        title="Sair de todas as sessões"
        copy="Encerra os acessos em todos os dispositivos, incluindo este."
        actions={
          <Button
            kind="danger"
            disabled={loading}
            icon={<Ph n="sign-out" size={18} />}
            onClick={() => setConfirmation('all')}
          >
            Sair de todas as sessões
          </Button>
        }
      />
      <AlertDialog
        open={Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        title={confirmation === 'all' ? 'Sair de todas as sessões?' : 'Encerrar sessão?'}
        confirmLabel={confirmation === 'all' ? 'Sair de todas as sessões' : 'Encerrar sessão'}
        cancelLabel="Cancelar"
        tone="danger"
        loading={loading}
        onConfirm={async () => {
          if (!confirmation) return;
          if (confirmation === 'all') await onRemoveAllSessions();
          else await onRemoveSession(confirmation);
          setConfirmation(null);
        }}
      >
        {confirmation === 'all'
          ? 'Você precisará entrar novamente em todos os dispositivos, incluindo este.'
          : confirmation
            ? `A sessão de ${confirmation.browser} em ${confirmation.operatingSystem}, iniciada em ${formatDate(confirmation.createdAt)}, será encerrada.${confirmation.current ? ' Você precisará entrar novamente neste dispositivo.' : ''}`
            : null}
      </AlertDialog>
    </div>
  );
}

function WorkspaceGeneralSettings({ workspace, loading, canWrite, onSaveWorkspace }) {
  const savedName = workspace?.name || '';
  const [name, setName] = useState(savedName);
  useEffect(() => setName(savedName), [savedName]);
  const changed = name !== savedName;
  return (
    <section className="onframe-stack onframe-settings-form" aria-label="Informações gerais">
      <SectionHeader title="Informações gerais" />
      <Input
        label="Nome"
        value={name}
        disabled={loading || !canWrite}
        maxLength={120}
        onChange={(event) => setName(event.target.value)}
      />
      {canWrite && (
        <footer className="onframe-settings-action-bar" aria-label="Ações do workspace">
          <div className="onframe-settings-action-bar-content">
            <Divider decorative />
            <div className="onframe-settings-action-bar-controls">
              {changed && (
                <p className="onframe-settings-action-status" role="status">
                  Alterações não salvas
                </p>
              )}
              <div className="onframe-settings-action-buttons">
                <ButtonGroup attached={false} justify="end" ariaLabel="Ações do workspace">
                  {changed && (
                    <Button kind="ghost" disabled={loading} onClick={() => setName(savedName)}>
                      Descartar
                    </Button>
                  )}
                  <Button disabled={loading || !changed} onClick={() => void onSaveWorkspace(name)}>
                    Salvar alterações
                  </Button>
                </ButtonGroup>
              </div>
            </div>
          </div>
        </footer>
      )}
    </section>
  );
}

function ApplicationUpdatesSettings() {
  return (
    <section className="onframe-stack" aria-label="Atualizador">
      <SectionHeader
        title="Atualizador"
        copy="Instale a versão mais recente pelo atualizador."
        actions={
          <Button kind="secondary" onClick={openUpdater} icon={<Ph n="arrow-square-out" size={17} />}>
            Abrir atualizador
          </Button>
        }
      />
    </section>
  );
}

function Settings({
  activeSection,
  onSectionChange,
  settingsPage,
  onSettingsPageChange,
  workspace,
  accounts,
  profile,
  securityOverview,
  members,
  invitations,
  roles,
  onRolesChanged,
  admin,
  canSettingsRead,
  canSettingsWrite,
  loading,
  onSaveProfile,
  onAvatar,
  onRemoveAvatar,
  onAccountDeleted,
  onCredentialChanged,
  onRemoveSession,
  onRemoveAllSessions,
  onDisconnect,
  onSaveWorkspace,
  onEdit,
  onRevoke,
  onLeave,
  createRoleRequested,
  onRoleCreateHandled
}) {
  const [query, setQuery] = useState('');
  const availableOptions = SETTINGS_OPTIONS.filter(
    (option) => option.tab !== 'workspace' || (['people', 'roles'].includes(option.page) ? admin : canSettingsRead)
  );
  const isIndex = settingsPage === 'index';
  const normalizedQuery = searchValue(query).trim();
  const matches = normalizedQuery
    ? availableOptions.filter((option) =>
        searchValue(`${option.category} ${option.label} ${option.description} ${option.keywords}`).includes(
          normalizedQuery
        )
      )
    : [];
  const selectOption = (option) => {
    onSectionChange(option.tab);
    onSettingsPageChange(option.page);
    setQuery('');
  };
  return (
    <div className="onframe-stack">
      {isIndex && (
        <>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar configurações..."
            width="min(100%, 520px)"
          />
          {normalizedQuery &&
            (matches.length > 0 ? (
              <SettingsOptionList
                options={matches}
                ariaLabel="Resultados da busca"
                onNavigate={selectOption}
                showCategory
              />
            ) : (
              <p className="onframe-empty">Nenhuma configuração encontrada.</p>
            ))}
          {!normalizedQuery && <SettingsDirectory options={availableOptions} onNavigate={selectOption} />}
        </>
      )}
      {!isIndex && activeSection === 'account' && settingsPage === 'profile' && (
        <ProfileSettings
          profile={profile}
          securityOverview={securityOverview}
          loading={loading}
          onSave={onSaveProfile}
          onAvatar={onAvatar}
          onRemoveAvatar={onRemoveAvatar}
          onOpenSecuritySettings={() => onSettingsPageChange('security')}
          onAccountDeleted={onAccountDeleted}
        />
      )}
      {!isIndex && activeSection === 'account' && settingsPage === 'security' && (
        <SecuritySettings
          profile={profile}
          securityOverview={securityOverview}
          loading={loading}
          onOpenSecurity={onSettingsPageChange}
          onOpenSessions={() => onSettingsPageChange('sessions')}
          onOpenMfa={() => onSettingsPageChange('mfa')}
          onOpenPasskeys={() => onSettingsPageChange('passkeys')}
        />
      )}
      {!isIndex &&
        activeSection === 'account' &&
        ['password', 'email', 'mfa', 'passkeys'].includes(settingsPage) &&
        !securityOverview && (
          <p className="onframe-muted" role="status">
            {loading ? 'Carregando segurança da conta...' : 'Os dados de segurança estão indisponíveis.'}
          </p>
        )}
      {!isIndex &&
        activeSection === 'account' &&
        ['password', 'email'].includes(settingsPage) &&
        profile &&
        securityOverview && (
          <CredentialSettings
            key={settingsPage}
            kind={settingsPage}
            profile={profile}
            securityOverview={securityOverview}
            onChanged={onCredentialChanged}
          />
        )}
      {!isIndex && activeSection === 'account' && settingsPage === 'sessions' && (
        <SessionsSettings
          securityOverview={securityOverview}
          loading={loading}
          onRemoveSession={onRemoveSession}
          onRemoveAllSessions={onRemoveAllSessions}
        />
      )}
      {!isIndex && activeSection === 'account' && settingsPage === 'mfa' && profile && securityOverview && (
        <TwoFactorSettings profile={profile} securityOverview={securityOverview} onDisconnect={onDisconnect} />
      )}
      {!isIndex && activeSection === 'account' && settingsPage === 'passkeys' && profile && securityOverview && (
        <PasskeySettings profile={profile} securityOverview={securityOverview} />
      )}
      {!isIndex && activeSection === 'workspace' && canSettingsRead && settingsPage === 'general' && (
        <WorkspaceGeneralSettings
          workspace={workspace}
          loading={loading}
          canWrite={canSettingsWrite}
          onSaveWorkspace={onSaveWorkspace}
        />
      )}
      {!isIndex && activeSection === 'workspace' && admin && ['people', 'roles'].includes(settingsPage) && (
        <div className="onframe-stack onframe-access-page">
          <p className="onframe-muted">Quem tem acesso ao workspace e o que cada pessoa pode fazer.</p>
          <Tabs
            tabs={[
              { id: 'people', label: 'Pessoas', icon: 'users-three', badge: members.length + invitations.length },
              { id: 'roles', label: 'Perfis', icon: 'identification-badge', badge: roles.filter((role) => role.id !== 'admin').length }
            ]}
            active={settingsPage}
            onChange={onSettingsPageChange}
          />
          {settingsPage === 'people' ? (
            <WorkspacePeople
              members={members}
              invitations={invitations}
              roles={roles}
              currentUserId={profile?.user?.id}
              loading={loading}
              onEdit={onEdit}
              onRevoke={onRevoke}
              onLeave={onLeave}
            />
          ) : (
            <WorkspaceRoles
              roles={roles}
              onChanged={onRolesChanged}
              createRequested={createRoleRequested}
              onCreateHandled={onRoleCreateHandled}
            />
          )}
        </div>
      )}
      {!isIndex && activeSection === 'workspace' && canSettingsRead && settingsPage === 'products' && (
        <ProductSettings workspaceId={workspace.id} canWrite={canSettingsWrite} />
      )}
      {!isIndex && activeSection === 'workspace' && canSettingsRead && settingsPage === 'margin' && (
        <TaxSettings key={workspace.id} accounts={accounts} canWrite={canSettingsWrite} />
      )}
      {!isIndex && activeSection === 'application' && settingsPage === 'appearance' && <AppearanceSettings />}
      {!isIndex && activeSection === 'application' && settingsPage === 'updates' && <ApplicationUpdatesSettings />}
    </div>
  );
}

function OptionsApp() {
  const [initialRoute] = useState(() => routeFromHash(window.location.hash));
  const [connection, setConnection] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [profile, setProfile] = useState(null);
  const [securityOverview, setSecurityOverview] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [roles, setRoles] = useState([]);
  const [view, setView] = useState(initialRoute.view);
  const [settingsTab, setSettingsTab] = useState(initialRoute.tab);
  const [settingsPage, setSettingsPage] = useState(initialRoute.page);
  const routeInitialized = useRef(false);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [integrationFeedback, setIntegrationFeedback] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [createRoleRequested, setCreateRoleRequested] = useState(false);
  const [productHeaderActions, setProductHeaderActions] = useState(null);
  const acceptingInvitation = useRef(false);
  const appearanceMenuItem = useThemeSubmenuItem();

  function showFeedback({ tone, message, visible = false, needsAttention = false, action, onAction }) {
    const surface = feedbackSurface({ tone, visible, needsAttention });
    if (surface === 'alert') setNotice({ tone, message, action, onAction });
    else {
      setNotice(null);
      if (surface === 'toast') toast({ tone, title: message });
    }
  }

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextConnection = await sendRemoteMessage('status');
      setConnection(nextConnection);
      if (!nextConnection?.connected) {
        setWorkspaces([]);
        setProfile(null);
        setSecurityOverview(null);
        setAccounts([]);
        setMembers([]);
        setInvitations([]);
        setRoles([]);
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
    const admin = connection.workspace?.roleId === 'admin';
    const needsData =
      view === 'home' ||
      view === 'integrations' ||
      view === 'products' ||
      view === 'history' ||
      (view === 'settings' &&
        (settingsTab === 'account' ||
          (settingsTab === 'workspace' && workspaceCan(connection.workspace, 'settings.read'))));
    if (!needsData) return;
    const needsSecurity =
      view === 'settings' &&
      settingsTab === 'account' &&
      ['security', 'sessions', 'mfa', 'passkeys', 'password', 'email'].includes(settingsPage);
    setLoading(true);
    try {
      if (view === 'home') {
        const requests = [workspaceCan(connection.workspace, 'accounts.read') ? loadAccounts() : Promise.resolve([])];
        if (admin) requests.push(sendRemoteMessage('invitations'));
        const [, invitationResult] = await Promise.all(requests);
        setInvitations(invitationResult?.invitations || []);
      }
      if (view === 'integrations' && workspaceCan(connection.workspace, 'accounts.read')) await loadAccounts();
      if (view === 'history') {
        const [, memberResult] = await Promise.all([
          workspaceCan(connection.workspace, 'accounts.read') ? loadAccounts() : Promise.resolve([]),
          admin ? sendRemoteMessage('members') : Promise.resolve(null)
        ]);
        if (admin) setMembers(memberResult?.members || []);
      }
      if (view === 'settings' && settingsTab === 'account') {
        const [nextProfile, nextSecurity] = await Promise.all([
          sendRemoteMessage('profile'),
          needsSecurity ? sendRemoteMessage('security') : Promise.resolve(null)
        ]);
        setProfile(nextProfile);
        if (needsSecurity) setSecurityOverview(nextSecurity);
      }
      if (view === 'settings' && settingsTab === 'workspace') {
        if (workspaceCan(connection.workspace, 'accounts.read')) await loadAccounts();
        if (admin) {
          const [memberResult, invitationResult, roleResult] = await Promise.all([
            sendRemoteMessage('members'),
            sendRemoteMessage('invitations'),
            sendRemoteMessage('roles')
          ]);
          setMembers(memberResult.members || []);
          setInvitations(invitationResult.invitations || []);
          setRoles(roleResult.roles || []);
        }
      }
    } catch (error) {
      if (needsSecurity) setSecurityOverview(null);
      setNotice({
        tone: error?.code === 'security_backend_unavailable' ? 'info' : 'danger',
        message: userError(error)
      });
      if (error?.code === 'identity_session_invalid' || error?.code === 'extension_session_unauthorized') {
        setConnection({ connected: false, reason: 'unauthorized' });
      }
    } finally {
      setLoading(false);
    }
  }, [connection?.connected, connection?.workspace, loadAccounts, settingsTab, settingsPage, view]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const hash = hashFromRoute(view, settingsTab, settingsPage);
    const target = `${window.location.pathname}${window.location.search}${hash}`;
    if (window.location.hash !== hash) {
      window.history[routeInitialized.current ? 'pushState' : 'replaceState'](null, document.title, target);
    }
    routeInitialized.current = true;
  }, [view, settingsTab, settingsPage]);
  useEffect(() => {
    const restoreRoute = () => {
      const route = routeFromHash(window.location.hash);
      const hash = hashFromRoute(route.view, route.tab, route.page);
      if (window.location.hash !== hash) {
        window.history.replaceState(
          null,
          document.title,
          `${window.location.pathname}${window.location.search}${hash}`
        );
      }
      setView(route.view);
      setSettingsTab(route.tab);
      setSettingsPage(route.page);
    };
    window.addEventListener('popstate', restoreRoute);
    window.addEventListener('hashchange', restoreRoute);
    return () => {
      window.removeEventListener('popstate', restoreRoute);
      window.removeEventListener('hashchange', restoreRoute);
    };
  }, []);
  useEffect(() => {
    if (!connection?.connected || view !== 'settings' || settingsTab !== 'workspace') return;
    if (
      workspaceCan(connection.workspace, 'settings.read') &&
      (!['people', 'roles'].includes(settingsPage) || connection.workspace?.roleId === 'admin')
    )
      return;
    const hash = VIEW_HASHES.settings;
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}${hash}`);
    setSettingsTab('account');
    setSettingsPage('index');
  }, [connection?.connected, connection?.workspace, view, settingsTab, settingsPage]);
  useEffect(() => {
    if (!connection?.connected) return;
    const permission = { integrations: 'accounts.read', products: 'products.read', history: 'history.read' }[view];
    if (permission && !workspaceCan(connection.workspace, permission)) setView('home');
  }, [connection?.connected, connection?.workspace, view]);
  useEffect(() => {
    const refreshOnFocus = () => {
      void reload().then(loadView);
    };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [reload, loadView]);
  useEffect(() => {
    void loadView();
  }, [loadView]);
  useEffect(() => {
    if (!connection?.connected || acceptingInvitation.current) return;
    const token = new URL(window.location.href).searchParams.get('invite');
    if (!token) return;
    acceptingInvitation.current = true;
    void sendRemoteMessage('invitation-accept', { token })
      .then(() => {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.hash);
        return reload();
      })
      .catch((error) => {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.hash);
        setNotice({ tone: 'danger', message: userError(error) });
      });
  }, [connection?.connected, reload]);

  async function run(action) {
    setLoading(true);
    setNotice(null);
    if (dialog) setDialog((current) => (current ? { ...current, error: '' } : current));
    try {
      return await action();
    } catch (error) {
      const message = userError(error);
      if (dialog) setDialog((current) => (current ? { ...current, error: message } : current));
      else setNotice({ tone: 'danger', message });
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
    setLoading(true);
    setIntegrationFeedback(null);
    try {
      await sendRemoteMessage('oauth-start');
      const feedback = {
        tone: 'info',
        message: 'Autorização aberta. Conclua a conexão no Mercado Livre e retorne ao OnFrame.'
      };
      if (view === 'integrations') setIntegrationFeedback(feedback);
      else setNotice(feedback);
    } catch (error) {
      const feedback = { tone: 'danger', message: userError(error) };
      if (view === 'integrations') setIntegrationFeedback(feedback);
      else setNotice(feedback);
    } finally {
      setLoading(false);
    }
  }

  async function runIntegration(action) {
    setLoading(true);
    setIntegrationFeedback(null);
    try {
      return await action();
    } catch (error) {
      setIntegrationFeedback({ tone: 'danger', message: userError(error) });
      if (error?.code === 'identity_session_invalid' || error?.code === 'extension_session_unauthorized') {
        setConnection({ connected: false, reason: 'unauthorized' });
      }
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function updateAccount(account, enabled) {
    await runIntegration(async () => {
      const result = await sendRemoteMessage('account-update', { userId: account.user_id, payload: { enabled } });
      setAccounts(result.accounts || []);
      return true;
    });
  }

  async function renameAccount(account, displayName) {
    const result = await runIntegration(async () => {
      const response = await sendRemoteMessage('account-update', { userId: account.user_id, payload: { displayName } });
      setAccounts(response.accounts || []);
      return true;
    });
    return result === true;
  }

  async function confirmDialog() {
    if (!dialog) return;
    if (dialog.type === 'workspace-leave') {
      const result = await run(async () => {
        await sendRemoteMessage('workspace-leave');
        setView('home');
        setSettingsPage('index');
        await reload();
      });
      if (result !== null) setDialog(null);
      return;
    }
    if (dialog.type === 'account-delete') {
      setLoading(true);
      setDialog((current) => (current?.type === 'account-delete' ? { ...current, error: '' } : current));
      try {
        const result = await sendRemoteMessage('account-remove', { userId: dialog.account.user_id });
        setAccounts(result.accounts || []);
        setDialog(null);
      } catch (error) {
        setDialog((current) =>
          current?.type === 'account-delete' ? { ...current, error: userError(error) } : current
        );
      } finally {
        setLoading(false);
      }
      return;
    }
    if (dialog.type === 'member-delete') {
      const result = await run(async () => {
        await sendRemoteMessage('member-remove', { userId: dialog.member.id });
        await loadView();
      });
      if (result !== null) setDialog(null);
    }
  }

  async function submitMember(values) {
    const result = await run(async () => {
      if (dialog.type === 'member') {
        await sendRemoteMessage('member-update', {
          userId: dialog.member.id,
          payload: { roleId: values.roleId, accountIds: values.accountIds }
        });
      } else {
        const response = await sendRemoteMessage('invitation-create', { payload: values });
        if (response.invitation?.url) {
          try {
            await navigator.clipboard.writeText(response.invitation.url);
            showFeedback({ tone: 'success', message: 'Link de convite criado e copiado.' });
          } catch {
            const retryCopy = () =>
              void navigator.clipboard
                .writeText(response.invitation.url)
                .then(() => showFeedback({ tone: 'success', message: 'Link copiado.' }))
                .catch(() =>
                  setNotice(
                    (current) => current && { ...current, message: 'Não foi possível copiar o link. Tente novamente.' }
                  )
                );
            showFeedback({
              tone: 'warning',
              message: 'Convite criado, mas o link não foi copiado.',
              needsAttention: true,
              action: 'Copiar link',
              onAction: retryCopy
            });
          }
        }
      }
      await loadView();
    });
    if (result !== null) setDialog(null);
  }

  async function revokeInvitation(invitation) {
    await run(async () => {
      await sendRemoteMessage('invitation-revoke', { invitationId: invitation.id });
      await loadView();
    });
  }

  async function saveProfile(name) {
    return run(async () => {
      const result = await sendRemoteMessage('profile-update', { payload: { displayName: name } });
      setProfile(result);
      setConnection((current) => ({ ...current, user: { ...current.user, name: name.trim() || current.user.name } }));
    });
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
    });
  }

  async function saveWorkspace(name) {
    await run(async () => {
      const result = await sendRemoteMessage('profile-update', {
        payload: { displayName: profile.user.name, workspaceName: name }
      });
      setProfile(result);
      await reload();
    });
  }

  async function removeSession(session) {
    return run(async () => {
      await sendRemoteMessage('security-session-remove', { sessionId: session.id });
      if (session.current) await disconnect();
      else setSecurityOverview(await sendRemoteMessage('security'));
      return true;
    });
  }

  async function removeAllSessions() {
    return run(async () => {
      await sendRemoteMessage('security-sessions-remove-all');
      await reload();
      setSecurityOverview(null);
      return true;
    });
  }

  async function disconnect() {
    await run(async () => {
      await sendRemoteMessage('disconnect');
      await reload();
    });
  }

  if (connection === null && loading) {
    return (
      <FeedbackRoot>
        <main className="onframe-auth-page" aria-busy="true">
          <div className="onframe-auth-page-theme">
            <ThemeCycleButton />
          </div>
          <div className="onframe-auth-surface onframe-stack" role="status" aria-label="Verificando acesso">
            <AuthBrand />
            <Card padding="var(--ob-space-24)">
              <div className="onframe-stack">
                <Skeleton width="32%" height={10} radius="var(--ob-r-xs)" />
                <Skeleton width="68%" height={20} radius="var(--ob-r-xs)" />
                <Skeleton width="100%" height={14} radius="var(--ob-r-xs)" />
                <Skeleton width="100%" height={42} radius="var(--ob-r-md)" />
              </div>
            </Card>
          </div>
        </main>
      </FeedbackRoot>
    );
  }

  const connected = Boolean(connection?.connected && connection?.user && connection?.workspace);
  if (!connected) {
    return (
      <FeedbackRoot>
        <main className="onframe-auth-page">
          <div className="onframe-auth-page-theme">
            <ThemeCycleButton />
          </div>
          <div className="onframe-auth-surface onframe-stack">
            {notice && (
              <Alert
                appearance="soft"
                tone={notice.tone}
                action={notice.action}
                onAction={notice.onAction}
                dismissible
                onClose={() => setNotice(null)}
              >
                {notice.message}
              </Alert>
            )}
            <AuthPanel onConnected={reload} />
          </div>
        </main>
      </FeedbackRoot>
    );
  }

  const workspace = connection.workspace;
  const settingsTabLabels = {
    account: 'Conta',
    workspace: 'Workspace',
    application: 'Aplicativo'
  };
  const settingsDetail =
    view === 'settings' && settingsPage !== 'index' ? SETTINGS_PAGE_META[settingsTab]?.[settingsPage] : undefined;
  const meta = settingsDetail || VIEW_META[view];
  const contentWidth =
    view === 'products'
      ? 'wide'
      : view === 'integrations' ||
          view === 'history' ||
          (view === 'settings' && ['profile', 'margin', 'sessions', 'people', 'roles'].includes(settingsPage))
        ? 'medium'
        : 'compact';
  const breadcrumbs = settingsDetail
    ? [
        { label: 'Início', icon: 'house', href: '#inicio' },
        { label: 'Configurações', icon: 'gear-six', href: '#configuracoes' },
        { label: settingsTabLabels[settingsTab] },
        ...(settingsTab === 'account' && ['sessions', 'mfa', 'passkeys', 'password', 'email'].includes(settingsPage)
          ? [{ label: 'Segurança e login', href: '#configuracoes-account-security' }]
          : []),
        { label: meta.title }
      ]
    : view === 'home'
      ? [{ label: 'Início', icon: 'house' }]
      : [{ label: 'Início', icon: 'house', href: '#inicio' }, { label: meta.title }];
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
  const admin = workspace.roleId === 'admin';
  const canSettingsRead = workspaceCan(workspace, 'settings.read');
  const canSettingsWrite = workspaceCan(workspace, 'settings.write');
  const canAccountsWrite = workspaceCan(workspace, 'accounts.write');
  const canAccountsDelete = workspaceCan(workspace, 'accounts.delete');
  const canAccountsRead = workspaceCan(workspace, 'accounts.read');
  const canProductsRead = workspaceCan(workspace, 'products.read');
  const canProductsWrite = workspaceCan(workspace, 'products.write');
  const canProductsDelete = workspaceCan(workspace, 'products.delete');
  const canHistoryRead = workspaceCan(workspace, 'history.read');
  const navigation = [
    { id: 'home', label: 'Início', icon: 'house', href: VIEW_HASHES.home },
    ...(canAccountsRead
      ? [{ id: 'integrations', label: 'Integrações', icon: 'storefront', href: VIEW_HASHES.integrations }]
      : []),
    ...(canProductsRead ? [{ id: 'products', label: 'Produtos', icon: 'package', href: VIEW_HASHES.products }] : []),
    ...(canHistoryRead
      ? [{ id: 'history', label: 'Histórico', icon: 'clock-counter-clockwise', href: VIEW_HASHES.history }]
      : []),
    { id: 'settings', label: 'Configurações', icon: 'gear-six', href: VIEW_HASHES.settings }
  ];
  const personName = connection.user.name || connection.user.email;
  const accountMenu = [
    {
      type: 'account',
      name: personName,
      email: connection.user.email,
      src: connection.user.avatarUrl
    },
    { type: 'separator' },
    {
      label: 'Perfil',
      icon: 'user-circle',
      onSelect: () => {
        setSettingsTab('account');
        setSettingsPage('profile');
        setView('settings');
      }
    },
    ...(canSettingsRead
      ? [
          {
            label: 'Workspace',
            icon: 'gear-six',
            onSelect: () => {
              setSettingsTab('workspace');
              setSettingsPage('general');
              setView('settings');
            }
          }
        ]
      : []),
    appearanceMenuItem,
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
  const workspaceControl =
    workspaceOptions.length > 1 ? (
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
      <Breadcrumbs items={breadcrumbs} size="sm" maxItems={3} onNavigate={navigateBreadcrumb} />
    </div>
  );
  const accessPageActions =
    view === 'settings' && settingsTab === 'workspace' && admin && ['people', 'roles'].includes(settingsPage) ? (
      <>
        <Button
          kind="secondary"
          icon={<Ph n="plus-circle" size={17} />}
          disabled={loading}
          onClick={() => {
            setSettingsPage('roles');
            setCreateRoleRequested(true);
          }}
        >
          Novo perfil
        </Button>
        <Button
          icon={<Ph n="user-plus" size={17} />}
          disabled={loading}
          onClick={() => setDialog({ type: 'invite' })}
        >
          Convidar pessoa
        </Button>
      </>
    ) : null;
  const pageHeaderActions =
    workspaceControl || (view === 'products' && productHeaderActions) || accessPageActions ? (
      <>
        {workspaceControl}
        {view === 'products' && productHeaderActions}
        {accessPageActions}
      </>
    ) : undefined;

  return (
    <FeedbackRoot>
      <main className={`onframe-options${navigationCollapsed ? ' onframe-options--collapsed' : ''}`}>
        <aside className="onframe-options-sidebar" aria-label="Navegação do workspace">
          <Sidebar
            groups={[{ items: navigation }]}
            active={view}
            onNav={navigate}
            ariaLabel="Navegação do workspace"
            header={<img className="onframe-sidebar-brand" src="../../assets/icons/icon-32.png" alt="OnFrame" />}
            footer={({ collapsed }) => (
              <Menu
                block
                placement={collapsed ? 'right-end' : 'top'}
                ariaLabel="Conta"
                items={accountMenu}
                trigger={
                  <Button
                    kind="quiet"
                    iconOnly={collapsed}
                    aria-label={`Conta de ${personName}`}
                    icon={<Avatar name={personName} src={connection.user.avatarUrl} alt="" size={28} />}
                    style={
                      collapsed
                        ? undefined
                        : {
                            width: '100%',
                            justifyContent: 'flex-start',
                            paddingLeft: 'var(--ob-space-8)'
                          }
                    }
                  >
                    {!collapsed && (
                      <span className="onframe-sidebar-account-trigger">
                        <span className="onframe-sidebar-account-name">{personName}</span>
                        <span className="onframe-sidebar-account-email">{connection.user.email}</span>
                      </span>
                    )}
                  </Button>
                }
              />
            )}
            collapsible
            toggleShortcut="b"
            collapsed={navigationCollapsed}
            onCollapsedChange={setNavigationCollapsed}
            variant="flush"
            mobileOpen={mobileNavigationOpen}
            onMobileOpenChange={setMobileNavigationOpen}
          />
        </aside>
        <div className="onframe-options-column">
          <div className="onframe-options-desktop-context">{pageContext}</div>
          <div className="onframe-options-mobile-nav">
            <Navbar
              layout="context"
              size="sm"
              sticky
              menuOpen={mobileNavigationOpen}
              onMenuToggle={() => setMobileNavigationOpen((open) => !open)}
              crumbs={pageContext}
            />
          </div>
          <section className="onframe-options-main">
            <div
              className={`onframe-options-content onframe-options-content--${contentWidth}${settingsDetail ? '' : ' onframe-options-content--root'}`}
            >
              <PageHeader
                meta={meta}
                actions={pageHeaderActions}
                onBack={goBackFromSettingsDetail}
                reserveContextSpace
                alignActionsWithTitle={Boolean(accessPageActions)}
              />
              {notice && (
                <Alert
                  appearance="soft"
                  tone={notice.tone}
                  action={notice.action}
                  onAction={notice.onAction}
                  dismissible
                  onClose={() => setNotice(null)}
                >
                  {notice.message}
                </Alert>
              )}
              {view === 'home' && (
                <Home
                  workspace={workspace}
                  accounts={accounts}
                  invitations={admin ? invitations : []}
                  admin={admin}
                  canAccountsRead={canAccountsRead}
                  canAccountsWrite={canAccountsWrite}
                  canProductsRead={canProductsRead}
                  canSettingsRead={canSettingsRead}
                  canHistoryRead={canHistoryRead}
                  loading={loading}
                  onConnect={() => void connectAccount()}
                  onOpenIntegrations={() => setView('integrations')}
                  onOpenProducts={() => setView('products')}
                  onOpenMargin={() => openSettings('workspace', 'margin')}
                  onOpenHistory={() => setView('history')}
                  onOpenPeople={() => openSettings('workspace', 'people')}
                />
              )}
              {view === 'integrations' && (
                <Integrations
                  accounts={accounts}
                  admin={admin}
                  canWrite={canAccountsWrite}
                  canDelete={canAccountsDelete}
                  feedback={integrationFeedback}
                  onDismissFeedback={() => setIntegrationFeedback(null)}
                  loading={loading}
                  onConnect={() => void connectAccount()}
                  onUpdate={(account, enabled) => void updateAccount(account, enabled)}
                  onRename={renameAccount}
                  onRemove={(account) => setDialog({ type: 'account-delete', account })}
                />
              )}
              {view === 'products' && (
                <Products
                  accounts={accounts}
                  admin={canProductsWrite}
                  canDelete={canProductsDelete}
                  onHeaderActionsChange={setProductHeaderActions}
                />
              )}
              {view === 'history' && (
                <ItemEditHistory
                  accounts={accounts}
                  members={members}
                  currentUser={connection.user}
                  admin={admin}
                  canSettingsRead={canSettingsRead}
                  canSettingsWrite={canSettingsWrite}
                  onOpenActor={admin ? () => openSettings('workspace', 'people') : undefined}
                />
              )}
              {view === 'settings' && (
                <Settings
                  activeSection={settingsTab}
                  onSectionChange={setSettingsTab}
                  settingsPage={settingsPage}
                  onSettingsPageChange={setSettingsPage}
                  workspace={workspace}
                  accounts={accounts}
                  profile={profile}
                  securityOverview={securityOverview}
                  members={members}
                  invitations={invitations}
                  roles={roles}
                  onRolesChanged={setRoles}
                  admin={admin}
                  loading={loading}
                  onSaveProfile={saveProfile}
                  onAvatar={uploadAvatar}
                  onRemoveAvatar={removeAvatar}
                  onAccountDeleted={(cleanupPending = false) => {
                    setConnection({ connected: false, reason: 'deleted' });
                    setProfile(null);
                    setSecurityOverview(null);
                    setNotice(
                      cleanupPending
                        ? { tone: 'danger', message: 'Sua identidade foi removida, mas a limpeza dos dados não terminou. Entre em contato com o suporte.' }
                        : { tone: 'success', message: 'Sua conta foi excluída.' }
                    );
                  }}
                  onCredentialChanged={(message) => {
                    setConnection({ connected: false });
                    setProfile(null);
                    setSecurityOverview(null);
                    setNotice(message);
                  }}
                  onRemoveSession={removeSession}
                  onRemoveAllSessions={removeAllSessions}
                  onDisconnect={() => void disconnect()}
                  onSaveWorkspace={(name) => void saveWorkspace(name)}
                  onEdit={(member) => setDialog({ type: 'member', member })}
                  onRevoke={(invitation) => void revokeInvitation(invitation)}
                  onLeave={() => setDialog({ type: 'workspace-leave' })}
                  createRoleRequested={createRoleRequested}
                  onRoleCreateHandled={() => setCreateRoleRequested(false)}
                />
              )}
            </div>
          </section>
        </div>
        <WorkspaceAccessModal
          dialog={dialog}
          accounts={accounts}
          roles={roles}
          busy={loading}
          presentation="drawer"
          onRemove={(member) => setDialog({ type: 'member-delete', member })}
          onClose={() => setDialog(null)}
          onConfirm={(values) => void submitMember(values)}
        />
        <Modal
          open={dialog?.type === 'account-delete' || dialog?.type === 'workspace-leave'}
          onClose={() => setDialog(null)}
          title={
            dialog?.type === 'workspace-leave'
              ? 'Sair do workspace'
              : 'Remover conta'
          }
          footer={
            <>
              <Button kind="secondary" disabled={loading} onClick={() => setDialog(null)}>
                Cancelar
              </Button>
              <Button kind="danger" disabled={loading} onClick={() => void confirmDialog()}>
                {dialog?.type === 'workspace-leave' ? 'Sair do workspace' : 'Remover'}
              </Button>
            </>
          }
        >
          <div className="onframe-stack">
            {dialog?.error && (
              <Alert appearance="soft" tone="danger">
                {dialog.error}
              </Alert>
            )}
            <p>
              {dialog?.type === 'workspace-leave'
                ? `Sair de ${workspace.name}? Você perderá acesso às contas e às pessoas deste workspace. Os demais administradores continuarão com acesso.`
                : dialog?.type === 'account-delete'
                  ? `Remover ${accountName(dialog.account)} deste workspace? Esta ação não revoga a autorização no Mercado Livre.`
                  : ''}
            </p>
          </div>
        </Modal>
        <AlertDialog
          open={dialog?.type === 'member-delete'}
          onClose={() => setDialog(null)}
          title={dialog?.member ? `Remover ${dialog.member.name || dialog.member.email} do workspace?` : 'Remover pessoa?'}
          confirmLabel="Remover"
          cancelLabel="Manter"
          tone="danger"
          loading={loading}
          onConfirm={() => void confirmDialog()}
        >
          O acesso desta pessoa ao workspace e às contas atribuídas será encerrado.
        </AlertDialog>
      </main>
    </FeedbackRoot>
  );
}

createRoot(document.getElementById('root')).render(<OptionsApp />);
