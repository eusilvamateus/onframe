import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useState } from 'react';
import '@onblide/ui/styles.css';
import { Alert, Avatar, Button, List, ListItem, Ph, Switch, ToastStack, Tooltip } from '@onblide/ui';
import '../shared/app.css';
import { AuthPanel } from '../shared/AuthPanel';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { WorkspaceSession } from './WorkspaceSession';
import { IntegrationsSession } from './IntegrationsSession';
import { HistorySession } from './HistorySession';
import { PopupFooter } from './PopupFooter';
import { PopupLoading } from './PopupLoading';
import { historySummary, integrationsSummary, workspaceSummary } from './summaries';

const RESOURCES_ENABLED_KEY = 'onframeEditorVisible';

function PopupUserHeader({ connection, resourcesEnabled, busy, onToggleResources, onOpenOptions }) {
  const personName = connection.user.name || 'Conta OnFrame';
  return <header className="onframe-popup-userbar">
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
          <Switch checked={resourcesEnabled} disabled={busy} onChange={onToggleResources} label="Recursos da extensão" size="md" />
        </span>
      </Tooltip>
      <Tooltip label="Abrir opções da extensão" placement="left">
        <Button kind="quiet" size="sm" iconOnly aria-label="Abrir opções da extensão" onClick={onOpenOptions} icon={<Ph n="gear" size={18} />} />
      </Tooltip>
    </div>
  </header>;
}

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

function openOptions(target) {
  if (target === 'history' && chrome.tabs?.create) {
    chrome.tabs.create({ url: `${chrome.runtime.getURL('ui/options/index.html')}#history` });
    return;
  }
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
  const [overview, setOverview] = useState(null);
  const [release, setRelease] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const refreshOverview = useCallback(async () => {
    try {
      const nextOverview = await sendRemoteMessage('app-overview');
      setOverview(nextOverview);
    } catch {
      setOverview(null);
    }
  }, []);

  const refreshRelease = useCallback(async () => {
    try {
      setRelease(await sendRemoteMessage('app-release'));
    } catch {
      setRelease(null);
    }
  }, []);

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
      setOverview(null);
      setRelease(undefined);
      if (nextConnection?.connected) {
        void refreshOverview();
        void refreshRelease();
      }
    } catch (error) {
      setConnection({ connected: false, reason: 'unavailable' });
      setFeedback(userError(error));
    } finally {
      setBusy(false);
    }
  }, [refreshOverview, refreshRelease]);

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

  async function disconnect() {
    setBusy(true);
    setFeedback('');
    try {
      await sendRemoteMessage('disconnect');
      setConnection({ connected: false, reason: 'disconnected' });
      setRelease(undefined);
      setView('home');
    } catch (error) {
      setView('home');
      setFeedback(userError(error, 'Não foi possível desconectar.'));
    } finally {
      setBusy(false);
    }
  }

  if (connection === null) return <PopupLoading />;

  const connected = Boolean(connection?.connected && connection?.user && connection?.workspace);
  if (!connected) return <main className="onframe-popup onframe-popup-auth">
    {feedback && <Alert tone="danger">{feedback}</Alert>}
    <AuthPanel onConnected={load} />
  </main>;
  const footer = <PopupFooter release={release} busy={busy} onDisconnect={() => void disconnect()} />;
  const userHeader = <PopupUserHeader
    connection={connection}
    resourcesEnabled={resourcesEnabled}
    busy={busy}
    onToggleResources={(value) => void toggleResources(value)}
    onOpenOptions={openOptions}
  />;

  function returnHome() {
    setView('home');
    void refreshOverview();
  }

  if (view === 'workspace') return <WorkspaceSession connection={connection} onBack={returnHome} onConnectionChanged={load} footer={footer} header={userHeader} />;
  if (view === 'integrations') return <IntegrationsSession connection={connection} onBack={returnHome} footer={footer} header={userHeader} />;
  if (view === 'history') return <HistorySession connection={connection} onBack={returnHome} onOpenFullHistory={() => openOptions('history')} footer={footer} header={userHeader} />;

  return (
    <main className="onframe-popup onframe-popup-home">
      {userHeader}
      {feedback && <Alert tone="danger">{feedback}</Alert>}
      <List className="onframe-popup-home-list" ariaLabel="Sessões da extensão">
        <ListItem
          className="onframe-popup-card-row onframe-popup-home-row"
          leading={<span className="onframe-popup-icon-tile onframe-popup-icon-tile--blue"><Ph n="users-three" size={18} /></span>}
          title="Workspace"
          description={workspaceSummary(overview, connection.workspace.role)}
          strong
          onClick={() => setView('workspace')}
          trailing={<Ph n="caret-right" size={16} />}
        />
        <ListItem
          className="onframe-popup-card-row onframe-popup-home-row"
          leading={<span className="onframe-popup-icon-tile onframe-popup-icon-tile--orange"><Ph n="storefront" size={18} /></span>}
          title="Integrações"
          description={integrationsSummary(overview)}
          strong
          onClick={() => setView('integrations')}
          trailing={<Ph n="caret-right" size={16} />}
        />
        <ListItem
          className="onframe-popup-card-row onframe-popup-home-row"
          leading={<span className="onframe-popup-icon-tile onframe-popup-icon-tile--green"><Ph n="clock-counter-clockwise" size={18} /></span>}
          title="Histórico"
          description={historySummary(overview)}
          strong
          onClick={() => setView('history')}
          trailing={<Ph n="caret-right" size={16} />}
        />
      </List>
      {footer}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<><ToastStack position="bottom-center" limit={1} /><Popup /></>);
