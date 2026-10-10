import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useState } from 'react';
import '@onblide/ui/styles.css';
import { Avatar, Badge, Button, Card, LogoMark, Ph, Switch, Tooltip } from '@onblide/ui';
import '../shared/app.css';
import { AuthPanel } from '../shared/AuthPanel';
import { initials, manifestVersion, openExternal, openUpdater, sendRemoteMessage, userError } from '../shared/runtime';

const RELEASES_URL = 'https://github.com/eusilvamateus/onframe/releases';
const EDITOR_VISIBLE_KEY = 'onframeEditorVisible';

function trustedLogo(value) {
  const logo = String(value || '').trim();
  return /^https:\/\/(?:[a-z0-9-]+\.)*mlstatic\.com\//iu.test(logo) ? logo : '';
}

function readEditorPreference() {
  return new Promise((resolve) => chrome.storage.local.get({ [EDITOR_VISIBLE_KEY]: true }, (result) => {
    resolve(result?.[EDITOR_VISIBLE_KEY] !== false);
  }));
}

function writeEditorPreference(value) {
  return new Promise((resolve) => chrome.storage.local.set({ [EDITOR_VISIBLE_KEY]: Boolean(value) }, resolve));
}

function activeProductTab() {
  return new Promise((resolve, reject) => chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    if (!tab?.id || !/^https:\/\/(?:[\w-]+\.)*mercadolivre\.com\.br\//iu.test(String(tab.url || ''))) {
      reject(new Error('Abra um anúncio do Mercado Livre.'));
      return;
    }
    resolve(tab);
  }));
}

function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => chrome.tabs.sendMessage(tabId, message, (response) => {
    const error = chrome.runtime.lastError;
    if (error) {
      reject(new Error(error.message));
      return;
    }
    resolve(response);
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
  const [accounts, setAccounts] = useState([]);
  const [editorVisible, setEditorVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [nextConnection, nextEditorVisible] = await Promise.all([
        sendRemoteMessage('status'),
        readEditorPreference()
      ]);
      setConnection(nextConnection);
      setEditorVisible(nextEditorVisible);
      if (nextConnection?.connected) {
        const result = await sendRemoteMessage('accounts');
        setAccounts(result.accounts || []);
      } else {
        setAccounts([]);
      }
      setFeedback('');
    } catch (error) {
      setConnection({ connected: false, reason: 'unavailable' });
      setAccounts([]);
      setFeedback(userError(error));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleEditor(nextVisible) {
    setBusy(true);
    try {
      await writeEditorPreference(nextVisible);
      setEditorVisible(nextVisible);
      const tab = await activeProductTab();
      const result = await sendToTab(tab.id, { type: 'onframe:setEditorVisibility', visible: nextVisible });
      if (!result?.isProductPage) throw new Error('Abra um anúncio do Mercado Livre.');
      setFeedback(nextVisible ? 'Editor visível.' : 'Editor oculto.');
    } catch (error) {
      setFeedback(userError(error));
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(connection?.connected && connection?.user && connection?.workspace);
  const status = connected
    ? { label: 'Conectada', tone: 'green' }
    : connection?.reason === 'auth_pending'
      ? { label: 'Confirmação pendente', tone: 'orange' }
      : { label: 'Não conectada', tone: 'orange' };

  return (
    <main className="onframe-popup">
      <header className="onframe-popup-header">
        <div className="onframe-brand">
          <LogoMark size={24} />
          <div>
            <p className="onframe-eyebrow">ONFRAME</p>
            <p className="onframe-brand-name">Controle <em>rápido</em></p>
          </div>
        </div>
        <div className="onframe-popup-actions">
          <Tooltip label={`OnFrame v${manifestVersion()}`} placement="bottom">
            <Button kind="ghost" size="sm" onClick={() => openExternal(RELEASES_URL)}>v{manifestVersion()}</Button>
          </Tooltip>
          <Tooltip label="Atualizar dados" placement="bottom">
            <Button kind="secondary" size="sm" aria-label="Atualizar dados" disabled={busy} onClick={() => void load()} icon={<Ph n="arrow-clockwise" size={17} />} />
          </Tooltip>
        </div>
      </header>

      <Card padding={20}>
        <div className="onframe-stack">
          <div className="onframe-row onframe-row-between">
            <div>
              <p className="onframe-eyebrow">ACESSO</p>
              <h1 className="onframe-card-title">Workspace</h1>
            </div>
            <Badge tone={status.tone} size="sm">{status.label}</Badge>
          </div>

          {!connected && (
            <>
              <p className="onframe-muted">
                {connection?.reason === 'auth_pending'
                  ? 'Confira o link enviado para seu e-mail. Ao abrir esta janela novamente, o acesso será concluído.'
                  : 'Entre para conectar esta extensão ao seu workspace.'}
              </p>
              <AuthPanel onConnected={load} onPending={() => setFeedback('Confira seu e-mail para concluir o acesso.')} />
            </>
          )}

          {connected && (
            <>
              <div className="onframe-popup-account">
                <Avatar name={initials(connection.user.name || connection.user.email)} src={connection.user.avatarUrl} alt="" size={40} />
                <div className="onframe-grow">
                  <p className="onframe-list-title">{connection.user.name || connection.user.email}</p>
                  <p className="onframe-list-meta">{connection.workspace.name}</p>
                </div>
              </div>
              {accounts.length > 0 && (
                <div className="onframe-list" aria-label="Contas Mercado Livre">
                  {accounts.slice(0, 3).map((account) => (
                    <div className="onframe-popup-account" key={account.id || account.user_id}>
                      <Avatar name={account.nickname || account.user_id} src={trustedLogo(account.logo)} alt="" size={32} />
                      <div className="onframe-grow">
                        <p className="onframe-list-title">{account.nickname || `Conta ${account.user_id}`}</p>
                        <p className="onframe-list-meta">Mercado Livre</p>
                      </div>
                      <Badge tone={account.enabled === false ? 'grey' : 'green'} size="sm">{account.enabled === false ? 'Desativada' : 'Habilitada'}</Badge>
                    </div>
                  ))}
                </div>
              )}
              <Button kind="secondary" style={{ width: '100%' }} onClick={openOptions} icon={<Ph n="arrow-square-out" size={16} />}>Abrir painel do workspace</Button>
            </>
          )}
          {feedback && <p className="onframe-muted" role="status">{feedback}</p>}
        </div>
      </Card>

      <Card padding={20}>
        <div className="onframe-stack">
          <div className="onframe-row onframe-row-between">
            <div>
              <p className="onframe-eyebrow">EDITOR</p>
              <h2 className="onframe-card-title">Visibilidade na página</h2>
            </div>
            <Switch checked={editorVisible} disabled={busy} onChange={(value) => void toggleEditor(value)} label={editorVisible ? 'Visível' : 'Oculto'} size="sm" />
          </div>
          <p className="onframe-muted">Controla o editor quando você estiver em um anúncio do Mercado Livre.</p>
        </div>
      </Card>

      <Card padding={20}>
        <div className="onframe-row onframe-row-between">
          <div>
            <p className="onframe-eyebrow">APLICATIVO</p>
            <h2 className="onframe-card-title">Atualização</h2>
            <p className="onframe-card-copy">Instale a versão mais recente pelo atualizador.</p>
          </div>
          <Button kind="secondary" aria-label="Abrir atualizador" onClick={openUpdater} icon={<Ph n="arrow-square-out" size={17} />} />
        </div>
      </Card>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Popup />);
