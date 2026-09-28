(function () {
  const Shared = window.OnFrameShared;
  const addIcon = Shared.addIcon;
  const escapeHtml = Shared.escapeHtml;
  const mountTooltips = Shared.mountTooltips;
  const setBadge = Shared.setBadge;
  const setTooltip = Shared.setTooltip;
  const toUserError = Shared.toUserError;
  const toast = window.OnFrameToast;
  const RELEASES_URL = 'https://github.com/eusilvamateus/onframe/releases';
  const REMOTE_CONNECT_URL = 'https://onframe.onblide.com/connect';

  const elements = {
    refresh: document.getElementById('refresh'),
    versionTag: document.getElementById('version-tag'),
    remoteBadge: document.getElementById('remote-badge'),
    remoteText: document.getElementById('remote-text'),
    remoteConnect: document.getElementById('remote-connect'),
    remotePairingCode: document.getElementById('remote-pairing-code'),
    remoteClaim: document.getElementById('remote-claim'),
    remoteOpenConnect: document.getElementById('remote-open-connect'),
    remoteContext: document.getElementById('remote-context'),
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
    updateOpen: document.getElementById('update-open')
  };
  const state = { busy: false, connected: false, accounts: [], pendingRemoveUserId: '' };

  decorateButtons();
  mountTooltips(document);
  elements.refresh.addEventListener('click', () => void loadOptions());
  elements.versionTag.addEventListener('click', openVersionLink);
  elements.remotePairingCode.addEventListener('input', renderControls);
  elements.remoteClaim.addEventListener('click', () => void claimConnection());
  elements.remoteOpenConnect.addEventListener('click', () => openExternalUrl(REMOTE_CONNECT_URL));
  elements.remoteDisconnect.addEventListener('click', () => void disconnectConnection());
  elements.remoteAccountConnect.addEventListener('click', () => void startRemoteAuth());
  elements.updateOpen.addEventListener('click', openUpdater);
  window.addEventListener('focus', () => {
    if (state.connected && !state.busy) void loadAccounts();
  });
  void loadOptions();

  async function loadOptions() {
    setBusy(true);
    resetView();
    try {
      const connection = await sendRemoteMessage('status');
      renderConnection(connection);
      if (state.connected) await loadAccounts();
    } catch (error) {
      setBadge(elements.remoteBadge, 'Indisponível', 'warn');
      elements.remoteText.textContent = toUserError(error);
      renderConnection({ connected: false });
    } finally {
      setBusy(false);
    }
  }

  function resetView() {
    renderVersionTag();
    state.connected = false;
    state.accounts = [];
    state.pendingRemoveUserId = '';
    elements.remotePairingCode.value = '';
    renderConnection({ connected: false });
    renderAccounts([]);
    setBadge(elements.remoteAccountsBadge, 'Verificando', 'muted');
    elements.remoteAccountsText.textContent = 'Buscando contas vinculadas ao workspace.';
  }

  function renderConnection(connection) {
    const connected = Boolean(connection && connection.connected && connection.user && connection.workspace);
    state.connected = connected;
    elements.remoteConnect.classList.toggle('is-hidden', connected);
    elements.remoteContext.classList.toggle('is-hidden', !connected);
    elements.remoteActions.classList.toggle('is-hidden', !connected);
    elements.remoteAccountsPanel.classList.toggle('is-hidden', !connected);

    if (!connected) {
      setBadge(elements.remoteBadge, 'Não vinculada', 'warn');
      elements.remoteText.textContent = connection && connection.reason === 'expired'
        ? 'A sessão anterior expirou. Vincule esta extensão novamente.'
        : 'Vincule esta extensão ao seu workspace no OnFrame.';
      elements.remoteUser.textContent = '-';
      elements.remoteWorkspace.textContent = '-';
      elements.remoteExpiresAt.textContent = '-';
      renderControls();
      return;
    }

    setBadge(elements.remoteBadge, 'Vinculada', 'ok');
    elements.remoteText.textContent = 'Esta extensão está vinculada ao seu workspace remoto.';
    elements.remoteUser.textContent = String(connection.user.name || connection.user.email);
    elements.remoteWorkspace.textContent = String(connection.workspace.name);
    elements.remoteExpiresAt.textContent = formatExpiration(connection.expiresAt);
    renderControls();
  }

  async function claimConnection() {
    const pairingCode = elements.remotePairingCode.value.trim();
    if (!pairingCode) {
      elements.remotePairingCode.focus();
      return showFeedback('Informe o código de pareamento.', 'warning');
    }
    setBusy(true);
    try {
      const connection = await sendRemoteMessage('claim', { pairingCode });
      elements.remotePairingCode.value = '';
      renderConnection(connection);
      await loadAccounts();
      showFeedback('Extensão vinculada ao acesso remoto.', 'success');
    } catch (error) {
      showFeedback(toUserError(error), 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function disconnectConnection() {
    setBusy(true);
    try {
      await sendRemoteMessage('disconnect');
      state.accounts = [];
      renderConnection({ connected: false });
      renderAccounts([]);
      showFeedback('Extensão desvinculada do acesso remoto.', 'success');
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
        state.accounts = [];
        renderConnection({ connected: false, reason: 'expired' });
        renderAccounts([]);
        return;
      }
      setBadge(elements.remoteAccountsBadge, 'Indisponível', 'warn');
      elements.remoteAccountsText.textContent = toUserError(error);
    }
  }

  function renderAccounts(accounts) {
    elements.remoteAccountsList.replaceChildren();
    if (!state.connected) return;
    const enabled = accounts.filter((account) => account.enabled !== false).length;
    setBadge(elements.remoteAccountsBadge, accounts.length === 1 ? '1 conta' : accounts.length + ' contas', accounts.length ? 'ok' : 'muted');
    elements.remoteAccountsText.textContent = accounts.length
      ? enabled + '/' + accounts.length + ' contas habilitadas no workspace.'
      : 'Nenhuma conta vinculada ao workspace.';
    if (!accounts.length) {
      elements.remoteAccountsList.classList.add('is-hidden');
      return;
    }

    accounts.forEach((account) => {
      elements.remoteAccountsList.appendChild(createAccountCard(account));
    });
    elements.remoteAccountsList.classList.remove('is-hidden');
    mountTooltips(elements.remoteAccountsList);
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
    const id = document.createElement('small');
    id.textContent = 'ID: ' + (userId || '-');
    const status = document.createElement('em');
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
      profile.className = 'account-icon-btn';
      profile.type = 'button';
      profile.dataset.tooltip = 'Abrir perfil';
      profile.setAttribute('aria-label', 'Abrir perfil');
      profile.innerHTML = icon('arrowSquareOut', 16);
      profile.addEventListener('click', () => openExternalUrl(profileUrl));
      actions.appendChild(profile);
    }
    const pending = state.pendingRemoveUserId === userId;
    const remove = document.createElement('button');
    remove.className = 'account-icon-btn danger' + (pending ? ' is-confirming' : '');
    remove.type = 'button';
    remove.dataset.tooltip = pending ? 'Confirmar remoção' : 'Remover conta';
    remove.setAttribute('aria-label', pending ? 'Confirmar remoção' : 'Remover conta');
    remove.innerHTML = icon(pending ? 'checkCircle' : 'x', 16);
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
      return showFeedback('Clique novamente para remover a conta.', 'warning');
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
    const canClaim = !state.busy && !state.connected && Boolean(elements.remotePairingCode.value.trim());
    elements.remotePairingCode.disabled = state.busy || state.connected;
    elements.remoteClaim.disabled = !canClaim;
    elements.remoteOpenConnect.disabled = state.busy || state.connected;
    elements.remoteDisconnect.disabled = state.busy || !state.connected;
    elements.remoteAccountConnect.disabled = state.busy || !state.connected;
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
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
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
    addIcon(elements.remoteClaim, 'link');
    addIcon(elements.remoteOpenConnect, 'arrowSquareOut');
    addIcon(elements.remoteDisconnect, 'x');
    addIcon(elements.remoteAccountConnect, 'plus');
    addIcon(elements.updateOpen, 'arrowSquareOut');
  }

  function icon(name, size) {
    return window.OnblideIcons ? window.OnblideIcons.render(name, size) : '';
  }

  function showFeedback(title, tone) {
    toast.show({ title, tone });
  }
})();
