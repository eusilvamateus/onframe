(function () {
  const Shared = window.OnFrameShared;
  const addIcon = Shared.addIcon;
  const mountTooltips = Shared.mountTooltips;
  const setBadge = Shared.setBadge;
  const setTooltip = Shared.setTooltip;
  const toUserError = Shared.toUserError;
  const toast = window.OnFrameToast;
  const RELEASES_URL = 'https://github.com/eusilvamateus/onframe/releases';

  const elements = {
    refresh: document.getElementById('refresh'),
    versionTag: document.getElementById('version-tag'),
    remoteBadge: document.getElementById('remote-badge'),
    remoteText: document.getElementById('remote-text'),
    remoteConnect: document.getElementById('remote-connect'),
    remoteContext: document.getElementById('remote-context'),
    remoteAvatar: document.getElementById('remote-avatar'),
    remoteUser: document.getElementById('remote-user'),
    remoteWorkspace: document.getElementById('remote-workspace'),
    remoteExpiresAt: document.getElementById('remote-expires-at'),
    remoteActions: document.getElementById('remote-actions'),
    remoteDisconnect: document.getElementById('remote-disconnect'),
    remoteAccountsPanel: document.getElementById('remote-accounts-panel'),
    remoteAccountsBadge: document.getElementById('remote-accounts-badge'),
    remoteAccountsText: document.getElementById('remote-accounts-text'),
    remoteAccountsList: document.getElementById('remote-accounts-list'),
    remoteAccountConnect: document.getElementById('remote-account-connect'),
    remoteAccountConnectEmpty: document.getElementById('remote-account-connect-empty'),
    updateOpen: document.getElementById('update-open')
  };
  const state = { busy: false, connected: false, accounts: [], pendingRemoveUserId: '', authController: null };

  decorateButtons();
  mountTooltips(document);
  elements.refresh.addEventListener('click', () => void loadOptions());
  elements.versionTag.addEventListener('click', openVersionLink);
  elements.remoteDisconnect.addEventListener('click', () => void disconnectConnection());
  elements.remoteAccountConnect.addEventListener('click', () => void startRemoteAuth());
  elements.remoteAccountConnectEmpty.addEventListener('click', () => void startRemoteAuth());
  elements.updateOpen.addEventListener('click', openUpdater);
  window.addEventListener('focus', () => { if (!state.busy) void loadOptions(); });
  void loadOptions();

  async function loadOptions() {
    setBusy(true);
    renderVersionTag();
    try {
      const connection = await sendRemoteMessage('status');
      renderConnection(connection);
      if (state.connected) await loadAccounts();
    } catch (error) {
      state.connected = false;
      state.accounts = [];
      renderAccounts([]);
      elements.remoteConnect.hidden = false;
      elements.remoteContext.hidden = true;
      elements.remoteActions.hidden = true;
      elements.remoteAccountsPanel.hidden = true;
      setBadge(elements.remoteBadge, 'Indisponível', 'warn');
      elements.remoteText.textContent = toUserError(error);
      ensureAuthController();
    } finally {
      setBusy(false);
    }
  }

  function renderConnection(connection) {
    const connected = Boolean(connection && connection.connected && connection.user && connection.workspace);
    state.connected = connected;
    elements.remoteConnect.hidden = connected;
    elements.remoteContext.hidden = !connected;
    elements.remoteActions.hidden = !connected;
    elements.remoteAccountsPanel.hidden = !connected;

    if (!connected) {
      state.accounts = [];
      state.pendingRemoveUserId = '';
      setBadge(elements.remoteBadge, 'Não conectada', 'warn');
      elements.remoteText.textContent = connection && connection.reason === 'auth_pending'
        ? 'Confira o link enviado para seu e-mail. Quando voltar, a extensão concluirá o acesso automaticamente.'
        : connection && connection.reason === 'expired'
          ? 'A sessão desta extensão expirou. Entre novamente para continuar.'
          : 'Entre para conectar este navegador ao seu workspace do OnFrame.';
      elements.remoteUser.textContent = '-';
      elements.remoteWorkspace.textContent = '-';
      elements.remoteExpiresAt.textContent = '-';
      elements.remoteAvatar.textContent = 'O';
      renderAccounts([]);
      ensureAuthController();
      renderControls();
      return;
    }

    const name = String(connection.user.name || connection.user.email || 'OnFrame');
    setBadge(elements.remoteBadge, 'Conectada', 'ok');
    elements.remoteText.textContent = 'Esta extensão está autorizada a usar as contas deste workspace.';
    elements.remoteUser.textContent = name;
    elements.remoteWorkspace.textContent = String(connection.workspace.name || 'Workspace OnFrame');
    elements.remoteExpiresAt.textContent = formatExpiration(connection.expiresAt);
    elements.remoteAvatar.textContent = name.slice(0, 1).toUpperCase();
    renderControls();
  }

  async function disconnectConnection() {
    setBusy(true);
    try {
      await sendRemoteMessage('disconnect');
      state.accounts = [];
      renderConnection({ connected: false });
      showFeedback('Sessão encerrada neste navegador.', 'success');
    } catch (error) {
      showFeedback(toUserError(error), 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function loadAccounts() {
    if (!state.connected) return;
    try {
      const result = await sendRemoteMessage('accounts');
      state.accounts = result && Array.isArray(result.accounts) ? result.accounts : [];
      renderAccounts(state.accounts);
    } catch (error) {
      if (error && error.code === 'extension_session_unauthorized') {
        renderConnection({ connected: false, reason: 'expired' });
        return;
      }
      setBadge(elements.remoteAccountsBadge, 'Indisponível', 'warn');
      elements.remoteAccountsText.textContent = toUserError(error);
    }
  }

  function renderAccounts(accounts) {
    elements.remoteAccountsList.replaceChildren();
    elements.remoteAccountConnectEmpty.hidden = true;
    if (!state.connected) return;

    const enabled = accounts.filter((account) => account.enabled !== false).length;
    setBadge(elements.remoteAccountsBadge, accounts.length === 1 ? '1 conta' : accounts.length + ' contas', accounts.length ? 'ok' : 'muted');
    elements.remoteAccountsText.textContent = accounts.length
      ? enabled + '/' + accounts.length + ' contas habilitadas neste workspace.'
      : 'Nenhuma conta foi conectada a este workspace ainda.';
    if (!accounts.length) {
      elements.remoteAccountsList.hidden = true;
      elements.remoteAccountConnectEmpty.hidden = false;
      return;
    }

    accounts.forEach((account) => elements.remoteAccountsList.appendChild(createAccountCard(account)));
    elements.remoteAccountsList.hidden = false;
    mountTooltips(elements.remoteAccountsList);
  }

  function createAccountCard(account) {
    const enabled = account.enabled !== false;
    const userId = String(account.user_id || '');
    const nickname = String(account.nickname || 'Conta ' + userId);
    const card = document.createElement('article');
    card.className = 'account-card account-card-manage ' + (enabled ? 'is-connected' : 'is-disabled');

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
    const status = document.createElement('span');
    status.className = 'ob-badge ' + (enabled ? 'green' : 'grey');
    status.textContent = enabled ? 'Habilitada' : 'Desativada';
    main.append(name, id, status);

    const toggle = document.createElement('button');
    toggle.className = 'account-switch ' + (enabled ? 'is-on' : '');
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(enabled));
    toggle.setAttribute('aria-label', enabled ? 'Desativar conta' : 'Habilitar conta');
    toggle.dataset.tooltip = enabled ? 'Desativar conta' : 'Habilitar conta';
    toggle.addEventListener('click', () => void toggleAccount(userId, !enabled));

    const actions = document.createElement('span');
    actions.className = 'account-card-actions';
    const profileUrl = String(account.permalink || '');
    if (profileUrl) {
      const profile = document.createElement('button');
      profile.className = 'ob-button secondary ob-icon-button compact-icon';
      profile.type = 'button';
      profile.dataset.tooltip = 'Abrir perfil';
      profile.setAttribute('aria-label', 'Abrir perfil');
      profile.innerHTML = icon('arrowSquareOut', 16);
      profile.addEventListener('click', () => openExternalUrl(profileUrl));
      actions.appendChild(profile);
    }
    const pending = state.pendingRemoveUserId === userId;
    const remove = document.createElement('button');
    remove.className = 'ob-button danger compact account-remove';
    remove.type = 'button';
    remove.textContent = pending ? 'Confirmar remoção' : 'Remover';
    remove.addEventListener('click', () => void removeAccount(userId));
    actions.appendChild(remove);
    card.append(avatar, main, toggle, actions);
    return card;
  }

  async function toggleAccount(userId, enabled) {
    setBusy(true);
    try {
      const result = await sendRemoteMessage('account-update', { userId, enabled });
      state.accounts = result && Array.isArray(result.accounts) ? result.accounts : state.accounts;
      renderAccounts(state.accounts);
      showFeedback(enabled ? 'Conta habilitada.' : 'Conta desativada.', 'success');
    } catch (error) {
      showFeedback(toUserError(error), 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount(userId) {
    if (!userId) return;
    if (state.pendingRemoveUserId !== userId) {
      state.pendingRemoveUserId = userId;
      renderAccounts(state.accounts);
      showFeedback('Confirme a remoção da conta.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const result = await sendRemoteMessage('account-remove', { userId });
      state.pendingRemoveUserId = '';
      state.accounts = result && Array.isArray(result.accounts) ? result.accounts : [];
      renderAccounts(state.accounts);
      showFeedback('Conta removida.', 'success');
    } catch (error) {
      showFeedback(toUserError(error), 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function startRemoteAuth() {
    setBusy(true);
    try {
      await sendRemoteMessage('oauth-start');
      elements.remoteAccountsText.textContent = 'Autorize a conta do Mercado Livre na aba aberta.';
      showFeedback('Autorize a conta do Mercado Livre na aba aberta.', 'success');
    } catch (error) {
      showFeedback(toUserError(error), 'danger');
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

  function openVersionLink(event) {
    event.preventDefault();
    openExternalUrl(elements.versionTag.href || RELEASES_URL);
  }

  function openExternalUrl(url) {
    const target = String(url || '').trim();
    if (target) chrome.tabs.create({ url: target });
  }

  function renderControls() {
    elements.remoteDisconnect.disabled = state.busy || !state.connected;
    elements.remoteAccountConnect.disabled = state.busy || !state.connected;
    elements.remoteAccountConnectEmpty.disabled = state.busy || !state.connected;
  }

  function setBusy(value) {
    state.busy = value;
    elements.refresh.disabled = value;
    elements.updateOpen.disabled = value;
    elements.remoteAccountsList.querySelectorAll('button').forEach((button) => { button.disabled = value; });
    renderControls();
  }

  function renderVersionTag() {
    const version = chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '-';
    elements.versionTag.textContent = 'v' + version;
    setTooltip(elements.versionTag, 'OnFrame v' + version, { placement: 'bottom' });
  }

  function formatExpiration(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit' }).format(date);
  }

  function trustedLogo(value) {
    const logo = String(value || '').trim();
    return /^https:\/\/(?:[a-z0-9-]+\.)*mlstatic\.com\//iu.test(logo) ? logo : '';
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

  function decorateButtons() {
    addIcon(elements.refresh, 'refresh');
    addIcon(elements.remoteDisconnect, 'x');
    addIcon(elements.remoteAccountConnect, 'plus');
    addIcon(elements.remoteAccountConnectEmpty, 'plus');
    addIcon(elements.updateOpen, 'arrowSquareOut');
  }

  function icon(name, size) {
    return window.OnblideIcons ? window.OnblideIcons.render(name, size) : '';
  }

  function showFeedback(title, tone) {
    toast.show({ title, tone });
  }

  function ensureAuthController() {
    if (state.authController) return;
    state.authController = window.OnFrameAuthController.create(elements.remoteConnect, {
      onConnected: async (connection) => {
        renderConnection(connection);
        await loadAccounts();
        showFeedback('Extensão conectada ao workspace.', 'success');
      },
      onPending: () => {
        elements.remoteText.textContent = 'Confira o link enviado para seu e-mail. Quando voltar, a extensão concluirá o acesso automaticamente.';
      }
    });
    void state.authController.init();
  }
})();
