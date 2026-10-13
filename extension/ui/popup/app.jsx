import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useState } from 'react';
import '@onblide/ui/styles.css';
import { Alert, Avatar, Button, List, ListItem, Ph, Skeleton, Switch, ToastStack, Tooltip } from '@onblide/ui';
import '../shared/app.css';
import { AuthPanel } from '../shared/AuthPanel';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { WorkspaceSession } from './WorkspaceSession';
import { IntegrationsSession } from './IntegrationsSession';

const RESOURCES_ENABLED_KEY = 'onframeEditorVisible';

function readResourcesPreference() {
  return new Promise((resolve) => chrome.storage.local.get({ [RESOURCES_ENABLED_KEY]: true }, (result) => {
    resolve(result?.[RESOURCES_ENABLED_KEY] !== false);
  }));
}

function writeResourcesPreference(value) {
  return new Promise((resolve, reject) => chrome.storage.local.set({ [RESOURCES_ENABLED_KEY]: Boolean(value) }, () => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve();
  }));
}

function openOptions() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
    return;
  }
  window.open(chrome.runtime.getURL('ui/options/index.html'));
}

function Popup() {
  const [connection, setConnection] = useState(null);
  const [view, setView] = useState('home');
  const [resourcesEnabled, setResourcesEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [nextConnection, nextResourcesEnabled] = await Promise.all([
        sendRemoteMessage('status'),
        readResourcesPreference()
      ]);
      setConnection(nextConnection);
      if (!nextConnection?.connected) setView('home');
      setResourcesEnabled(nextResourcesEnabled);
      setFeedback('');
    } catch (error) {
      setConnection({ connected: false, reason: 'unavailable' });
      setFeedback(userError(error));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleResources(nextEnabled) {
    const previous = resourcesEnabled;
    setResourcesEnabled(nextEnabled);
    setBusy(true);
    setFeedback('');
    try {
      await writeResourcesPreference(nextEnabled);
    } catch (error) {
      setResourcesEnabled(previous);
      setFeedback(userError(error));
    } finally {
      setBusy(false);
    }
  }

  if (connection === null) return <main className="onframe-popup onframe-popup-home" aria-busy="true" aria-label="Carregando conta">
    <header className="onframe-popup-userbar">
      <div className="onframe-popup-user">
        <Skeleton circle height={40} />
        <div className="onframe-popup-skeleton-copy">
          <Skeleton width={112} height={14} />
          <Skeleton width={164} height={10} />
        </div>
      </div>
      <div className="onframe-popup-actions">
        <Skeleton width={40} height={22} radius={999} />
        <Skeleton width={32} height={32} />
      </div>
    </header>
  </main>;

  const connected = Boolean(connection?.connected && connection?.user && connection?.workspace);
  if (!connected) return <main className="onframe-popup onframe-popup-auth">
    {feedback && <Alert tone="danger">{feedback}</Alert>}
    <AuthPanel onConnected={load} />
  </main>;
  const personName = connection.user.name || 'Conta OnFrame';

  if (view === 'workspace') return <WorkspaceSession connection={connection} onBack={() => setView('home')} onOpenOptions={openOptions} onConnectionChanged={load} />;
  if (view === 'integrations') return <IntegrationsSession connection={connection} onBack={() => setView('home')} onOpenOptions={openOptions} />;

  return (
    <main className="onframe-popup onframe-popup-home">
      <header className="onframe-popup-userbar">
        <div className="onframe-popup-user">
          <Avatar name={personName} src={connection.user.avatarUrl} alt="" size={40} />
          <div className="onframe-popup-user-copy">
            <h1 className="onframe-popup-user-name">{personName}</h1>
            <p className="onframe-popup-user-email">{connection.user.email}</p>
          </div>
        </div>
        <div className="onframe-popup-actions">
          <Tooltip label={resourcesEnabled ? 'Desativar recursos da extensão' : 'Ativar recursos da extensão'} placement="bottom">
            <span className="onframe-popup-resource-switch">
              <Switch checked={resourcesEnabled} disabled={busy} onChange={(value) => void toggleResources(value)} label="Recursos da extensão" size="md" />
            </span>
          </Tooltip>
          <Tooltip label="Abrir opções da extensão" placement="left">
            <Button kind="quiet" size="sm" iconOnly aria-label="Abrir opções da extensão" onClick={openOptions} icon={<Ph n="gear" size={18} />} />
          </Tooltip>
        </div>
      </header>
      {feedback && <Alert tone="danger">{feedback}</Alert>}
      <List className="onframe-popup-home-list" ariaLabel="Sessões da extensão">
        <ListItem
          className="onframe-popup-card-row onframe-popup-home-row"
          leading={<span className="onframe-popup-icon-tile onframe-popup-icon-tile--blue"><Ph n="users-three" size={18} /></span>}
          title="Workspace"
          description="Pessoas, convites e acesso às contas"
          strong
          onClick={() => setView('workspace')}
          trailing={<Ph n="caret-right" size={16} />}
        />
        <ListItem
          className="onframe-popup-card-row onframe-popup-home-row"
          leading={<span className="onframe-popup-icon-tile onframe-popup-icon-tile--orange"><Ph n="storefront" size={18} /></span>}
          title="Integrações"
          description="Contas conectadas e acesso ao Mercado Livre"
          strong
          onClick={() => setView('integrations')}
          trailing={<Ph n="caret-right" size={16} />}
        />
      </List>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<><ToastStack position="bottom-center" limit={1} /><Popup /></>);
