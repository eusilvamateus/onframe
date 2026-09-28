(function () {
  const Shared = window.OnFrameShared;
  const addIcon = Shared.addIcon;
  const mountTooltips = Shared.mountTooltips;
  const setBadge = Shared.setBadge;
  const setTooltip = Shared.setTooltip;
  const toUserError = Shared.toUserError;
  const toast = window.OnFrameToast;
  const EDITOR_VISIBLE_KEY = 'onframeEditorVisible';
  const RELEASES_URL = 'https://github.com/eusilvamateus/onframe/releases';

  const elements = {
    refresh: document.getElementById('refresh'),
    versionTag: document.getElementById('version-tag'),
    toggleEditor: document.getElementById('toggle-editor'),
    openOptions: document.getElementById('open-options'),
    manageAccess: document.getElementById('manage-access'),
    connectionBadge: document.getElementById('connection-badge'),
    connectionText: document.getElementById('connection-text'),
    accountList: document.getElementById('account-list'),
    updateOpen: document.getElementById('update-open')
  };
  const state = { busy: false, editorVisible: true };

  decorateButtons();
  mountTooltips(document);
  elements.refresh.addEventListener('click', () => void loadPopup());
  elements.versionTag.addEventListener('click', openVersionLink);
  elements.toggleEditor.addEventListener('click', () => void toggleEditor());
  elements.openOptions.addEventListener('click', openOptions);
  elements.manageAccess.addEventListener('click', openOptions);
  elements.updateOpen.addEventListener('click', openUpdater);
  void loadPopup();

  async function loadPopup() {
    setBusy(true);
    renderVersionTag();
    await loadEditorPreference();
    try {
      const connection = await sendRemoteMessage('status');
      await renderConnection(connection);
    } catch (error) {
      setBadge(elements.connectionBadge, 'Indisponível', 'warn');
      elements.connectionText.textContent = toUserError(error);
      renderAccounts([]);
    } finally {
      setBusy(false);
    }
  }

  async function renderConnection(connection) {
    if (!connection || !connection.connected) {
      setBadge(elements.connectionBadge, 'Não vinculada', 'warn');
      elements.connectionText.textContent = 'Vincule esta extensão ao seu workspace no OnFrame.';
      elements.manageAccess.textContent = 'Vincular extensão';
      renderAccounts([]);
      return;
    }

    const result = await sendRemoteMessage('accounts');
    const accounts = result && Array.isArray(result.accounts) ? result.accounts : [];
    const enabled = accounts.filter((account) => account.enabled !== false).length;
    setBadge(elements.connectionBadge, enabled ? 'Conectada' : 'Sem contas', enabled ? 'ok' : 'warn');
    elements.connectionText.textContent = accounts.length
      ? enabled + '/' + accounts.length + ' contas habilitadas no workspace ' + connection.workspace.name + '.'
      : 'Nenhuma conta foi conectada ao workspace ' + connection.workspace.name + '.';
    elements.manageAccess.textContent = 'Gerenciar acesso';
    renderAccounts(accounts);
  }

  function renderAccounts(accounts) {
    elements.accountList.replaceChildren();
    if (!accounts.length) {
      elements.accountList.classList.add('is-hidden');
      return;
    }
    accounts.forEach((account) => {
      const enabled = account.enabled !== false;
      const userId = String(account.user_id || '');
      const nickname = String(account.nickname || 'Conta ' + userId);
      const card = document.createElement('article');
      card.className = 'account-card ' + (enabled ? 'is-connected' : 'is-disabled');

      const avatar = document.createElement('span');
      avatar.className = 'account-avatar';
      const fallback = document.createElement('span');
      fallback.className = 'account-avatar-fallback';
      fallback.textContent = nickname[0] || '?';
      avatar.appendChild(fallback);
      const logo = trustedLogo(account.logo);
      if (logo) {
        const image = document.createElement('img');
        image.className = 'account-avatar-image';
        image.src = logo;
        image.alt = '';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.remove(), { once: true });
        avatar.appendChild(image);
      }

      const main = document.createElement('span');
      main.className = 'account-main';
      const name = document.createElement('strong');
      name.textContent = nickname;
      const id = document.createElement('small');
      id.textContent = 'ID: ' + (userId || '-');
      const status = document.createElement('em');
      status.textContent = enabled ? 'Habilitada' : 'Desativada';
      main.append(name, id, status);
      card.append(avatar, main);
      elements.accountList.appendChild(card);
    });
    elements.accountList.classList.remove('is-hidden');
  }

  function trustedLogo(value) {
    const logo = String(value || '').trim();
    return /^https:\/\/(?:[a-z0-9-]+\.)*mlstatic\.com\//iu.test(logo) ? logo : '';
  }

  async function toggleEditor() {
    setBusy(true);
    try {
      const visible = !state.editorVisible;
      await saveEditorPreference(visible);
      state.editorVisible = visible;
      renderEditorToggle();
      const tab = await getActiveProductTab();
      const status = await sendToTab(tab.id, { type: 'onframe:setEditorVisibility', visible });
      if (!status || !status.isProductPage) throw new Error('Abra um anúncio do Mercado Livre.');
      showFeedback(visible ? 'Editor visível.' : 'Editor oculto.', 'success');
    } catch (error) {
      showFeedback(toActionError(error), 'danger');
    } finally {
      setBusy(false);
    }
  }

  function openUpdater() {
    const link = document.createElement('a');
    link.href = 'onframe-updater://update';
    link.click();
    showFeedback('Atualizador aberto.', 'success');
  }

  function openOptions() {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      return;
    }
    window.open(chrome.runtime.getURL('ui/options/index.html'));
  }

  function openVersionLink(event) {
    event.preventDefault();
    chrome.tabs.create({ url: elements.versionTag.href || RELEASES_URL });
  }

  function renderVersionTag() {
    const version = chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '-';
    elements.versionTag.textContent = 'v' + version;
    setTooltip(elements.versionTag, 'OnFrame v' + version, { placement: 'bottom' });
  }

  function sendRemoteMessage(action, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(Object.assign({ type: 'onframe:remote', action }, payload), (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) return reject(new Error(runtimeError.message || 'Não consegui acessar o OnFrame remoto.'));
        if (!response || response.ok !== true) {
          const error = new Error(response && response.error ? response.error : 'Não consegui acessar o OnFrame remoto.');
          error.code = response && response.code ? response.code : '';
          error.technicalError = response && response.technicalError ? response.technicalError : error.message;
          return reject(error);
        }
        resolve(response.body || {});
      });
    });
  }

  async function loadEditorPreference() {
    state.editorVisible = await new Promise((resolve) => chrome.storage.local.get({ [EDITOR_VISIBLE_KEY]: true }, (result) => resolve(result && result[EDITOR_VISIBLE_KEY] !== false)));
    renderEditorToggle();
  }

  function saveEditorPreference(value) {
    return new Promise((resolve) => chrome.storage.local.set({ [EDITOR_VISIBLE_KEY]: Boolean(value) }, resolve));
  }

  function renderEditorToggle() {
    const label = state.editorVisible ? 'Ocultar editor' : 'Mostrar editor';
    elements.toggleEditor.classList.toggle('is-on', state.editorVisible);
    elements.toggleEditor.setAttribute('aria-checked', String(state.editorVisible));
    elements.toggleEditor.setAttribute('aria-label', label);
    setTooltip(elements.toggleEditor, label, { placement: 'bottom' });
  }

  function getActiveProductTab() {
    return new Promise((resolve, reject) => chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id || !/^https:\/\/(?:[\w-]+\.)*mercadolivre\.com\.br\//iu.test(String(tab.url || ''))) return reject(new Error('Abra um anúncio do Mercado Livre.'));
      resolve(tab);
    }));
  }

  function sendToTab(tabId, message) {
    return new Promise((resolve, reject) => chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(error.message));
      resolve(response);
    }));
  }

  function toActionError(error) {
    const message = String(error && error.message || error || '').toLowerCase();
    return message.includes('receiving end does not exist') || message.includes('could not establish connection') ? 'Recarregue esta aba.' : toUserError(error);
  }

  function setBusy(value) {
    state.busy = value;
    elements.refresh.disabled = value;
    elements.toggleEditor.disabled = value;
    elements.manageAccess.disabled = value;
    elements.updateOpen.disabled = value;
  }

  function decorateButtons() {
    addIcon(elements.refresh, 'refresh');
    addIcon(elements.openOptions, 'gear');
    addIcon(elements.updateOpen, 'arrowSquareOut');
  }

  function showFeedback(title, tone) {
    toast.show({ title, tone });
  }
})();
