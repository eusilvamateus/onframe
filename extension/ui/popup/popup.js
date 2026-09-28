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
    connectionConnect: document.getElementById('connection-connect'),
    connectionContext: document.getElementById('connection-context'),
    connectionAvatar: document.getElementById('connection-avatar'),
    connectionUser: document.getElementById('connection-user'),
    connectionWorkspace: document.getElementById('connection-workspace'),
    connectionExpiresAt: document.getElementById('connection-expires-at'),
    accountList: document.getElementById('account-list'),
    updateOpen: document.getElementById('update-open')
  };
  const state = { busy: false, connected: false, editorVisible: true, authController: null };

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
      renderConnection(connection);
      if (state.connected) await loadAccounts();
    } catch (error) {
      state.connected = false;
      renderAccounts([]);
      elements.connectionConnect.hidden = false;
      elements.connectionContext.hidden = true;
      setBadge(elements.connectionBadge, 'Indisponível', 'warn');
      elements.connectionText.textContent = toUserError(error);
      ensureAuthController();
    } finally {
      setBusy(false);
    }
  }

  function renderConnection(connection) {
    const connected = Boolean(connection && connection.connected && connection.user && connection.workspace);
    state.connected = connected;
    elements.connectionConnect.hidden = connected;
    elements.connectionContext.hidden = !connected;

    if (!connected) {
      setBadge(elements.connectionBadge, 'Não conectada', 'warn');
      elements.connectionText.textContent = connection && connection.reason === 'auth_pending'
        ? 'Confira o link enviado para seu e-mail. Ao abrir esta janela novamente, o acesso será concluído.'
        : connection && connection.reason === 'expired'
          ? 'A sessão desta extensão expirou. Entre novamente para continuar.'
          : 'Entre para conectar esta extensão ao seu workspace.';
      elements.connectionUser.textContent = '-';
      elements.connectionWorkspace.textContent = '-';
      elements.connectionExpiresAt.textContent = '-';
      elements.connectionAvatar.textContent = 'O';
      renderAccounts([]);
      ensureAuthController();
      renderControls();
      return;
    }

    const name = String(connection.user.name || connection.user.email || 'OnFrame');
    setBadge(elements.connectionBadge, 'Conectada', 'ok');
    elements.connectionText.textContent = 'Esta extensão usa o acesso remoto do seu workspace.';
    elements.connectionUser.textContent = name;
    elements.connectionWorkspace.textContent = String(connection.workspace.name || 'Workspace OnFrame');
    elements.connectionExpiresAt.textContent = formatExpiration(connection.expiresAt);
    elements.connectionAvatar.textContent = name.slice(0, 1).toUpperCase();
    renderControls();
  }

  async function loadAccounts() {
    if (!state.connected) return;
    try {
      const result = await sendRemoteMessage('accounts');
      renderAccounts(result && Array.isArray(result.accounts) ? result.accounts : []);
    } catch (error) {
      if (error && error.code === 'extension_session_unauthorized') {
        renderConnection({ connected: false, reason: 'expired' });
        return;
      }
      elements.connectionText.textContent = toUserError(error);
    }
  }

  function renderAccounts(accounts) {
    elements.accountList.replaceChildren();
    if (!state.connected || !accounts.length) {
      elements.accountList.hidden = true;
      return;
    }

    accounts.forEach((account) => elements.accountList.appendChild(createAccountCard(account)));
    elements.accountList.hidden = false;
  }

  function createAccountCard(account) {
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
    const status = document.createElement('span');
    status.className = 'ob-badge ' + (enabled ? 'green' : 'grey');
    status.textContent = enabled ? 'Habilitada' : 'Desativada';
    main.append(name, status);
    card.append(avatar, main);
    return card;
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
    openExternalUrl(elements.versionTag.href || RELEASES_URL);
  }

  function openExternalUrl(url) {
    const target = String(url || '').trim();
    if (target) chrome.tabs.create({ url: target });
  }

  function renderVersionTag() {
    const version = chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '-';
    elements.versionTag.textContent = 'v' + version;
    setTooltip(elements.versionTag, 'OnFrame v' + version, { placement: 'bottom' });
  }

  function renderControls() {
    elements.manageAccess.disabled = state.busy || !state.connected;
  }

  function formatExpiration(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function loadEditorPreference() {
    return new Promise((resolve) => chrome.storage.local.get({ [EDITOR_VISIBLE_KEY]: true }, (result) => {
      state.editorVisible = result && result[EDITOR_VISIBLE_KEY] !== false;
      renderEditorToggle();
      resolve();
    }));
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

  function toActionError(error) {
    const message = String(error && error.message || error || '').toLowerCase();
    return message.includes('receiving end does not exist') || message.includes('could not establish connection') ? 'Recarregue esta aba.' : toUserError(error);
  }

  function setBusy(value) {
    state.busy = value;
    elements.refresh.disabled = value;
    elements.toggleEditor.disabled = value;
    elements.openOptions.disabled = value;
    elements.updateOpen.disabled = value;
    renderControls();
  }

  function decorateButtons() {
    addIcon(elements.refresh, 'refresh');
    addIcon(elements.openOptions, 'gear');
    addIcon(elements.manageAccess, 'gear');
    addIcon(elements.updateOpen, 'arrowSquareOut');
  }

  function showFeedback(title, tone) {
    toast.show({ title, tone });
  }

  function ensureAuthController() {
    if (state.authController) return;
    state.authController = window.OnFrameAuthController.create(elements.connectionConnect, {
      onConnected: async (connection) => {
        renderConnection(connection);
        await loadAccounts();
        showFeedback('Extensão conectada ao workspace.', 'success');
      },
      onPending: () => {
        elements.connectionText.textContent = 'Confira o link enviado para seu e-mail. Ao abrir esta janela novamente, o acesso será concluído.';
      }
    });
    void state.authController.init();
  }
})();
