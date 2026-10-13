import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useState } from 'react';
import '@onblide/ui/styles.css';
import { Alert, Avatar, Button, Ph, Skeleton, Switch, Tooltip } from '@onblide/ui';
import '../shared/app.css';
import { AuthPanel } from '../shared/AuthPanel';
import { sendRemoteMessage, userError } from '../shared/runtime';

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
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Popup />);
