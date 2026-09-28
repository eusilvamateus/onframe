(function () {
  const Shared = window.OnFrameShared;
  const api = Shared.createApi({ offlineMessage: 'OnFrame desligado. Abra pelo atalho.' });
  const addIcon = Shared.addIcon;
  const escapeAttribute = Shared.escapeAttribute;
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
    connect: document.getElementById('connect'),
    serviceBadge: document.getElementById('service-badge'),
    serviceText: document.getElementById('service-text'),
    serviceActions: document.querySelector('.service-actions'),
    serviceStart: document.getElementById('service-start'),
    serviceRestart: document.getElementById('service-restart'),
    serviceStop: document.getElementById('service-stop'),
    serviceCheck: document.getElementById('service-check'),
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
    updateBlock: document.getElementById('update-block'),
    updateBadge: document.getElementById('update-badge'),
    updateText: document.getElementById('update-text'),
    updateOpen: document.getElementById('update-open'),
    updateStart: document.getElementById('update-start'),
    accountBadge: document.getElementById('account-badge'),
    accountText: document.getElementById('account-text'),
    accountList: document.getElementById('account-list')
  };

  const state = {
    updateStatus: null,
    accounts: [],
    canConnect: false,
    serviceOnline: false,
    pendingRemoveUserId: '',
    remoteConnected: false,
    remoteAccounts: [],
    busy: false
  };

  decorateButtons();
  mountTooltips(document);
  elements.refresh.addEventListener('click', () => void loadOptions({ forceUpdate: true }));
  elements.versionTag.addEventListener('click', (event) => openVersionLink(event));
  elements.connect.addEventListener('click', () => void startAuth());
  elements.serviceStart.addEventListener('click', () => openLocalServiceAction('start'));
  elements.serviceRestart.addEventListener('click', () => openLocalServiceAction('restart'));
  elements.serviceStop.addEventListener('click', () => openLocalServiceAction('stop'));
  elements.serviceCheck.addEventListener('click', () => openLocalServiceAction('check'));
  elements.remotePairingCode.addEventListener('input', renderRemoteControls);
  elements.remoteClaim.addEventListener('click', () => void claimRemoteConnection());
  elements.remoteOpenConnect.addEventListener('click', openRemotePairing);
  elements.remoteDisconnect.addEventListener('click', () => void disconnectRemoteConnection());
  elements.remoteAccountConnect.addEventListener('click', () => void startRemoteAuth());
  elements.updateOpen.addEventListener('click', () => openUpdatePage());
  elements.updateStart.addEventListener('click', () => void copyUpdateCommand());

  void loadOptions();
  window.addEventListener('focus', () => {
    if (state.remoteConnected && !state.busy) void loadRemoteAccounts();
  });

  async function loadOptions(options = {}) {
    setBusy(true);
    resetView();
    await Promise.all([
      loadServiceAndAccounts(options),
      loadRemoteConnection()
    ]);
    setBusy(false);
  }

  function resetView() {
    setBadge(elements.serviceBadge, 'Verificando', 'muted');
    setBadge(elements.accountBadge, 'Verificando', 'muted');
    elements.serviceText.textContent = 'Verificando OnFrame.';
    elements.accountText.textContent = 'Buscando conta conectada.';
    elements.accountList.classList.add('is-hidden');
    elements.accountList.innerHTML = '';
    setBadge(elements.remoteBadge, 'Verificando', 'muted');
    elements.remoteText.textContent = 'Conferindo a vinculação desta extensão.';
    elements.remotePairingCode.value = '';
    elements.remoteConnect.classList.remove('is-hidden');
    elements.remoteContext.classList.add('is-hidden');
    elements.remoteActions.classList.add('is-hidden');
    elements.remoteUser.textContent = '-';
    elements.remoteWorkspace.textContent = '-';
    elements.remoteExpiresAt.textContent = '-';
    elements.remoteAccountsPanel.classList.add('is-hidden');
    elements.remoteAccountsList.classList.add('is-hidden');
    elements.remoteAccountsList.innerHTML = '';
    setBadge(elements.remoteAccountsBadge, 'Verificando', 'muted');
    elements.remoteAccountsText.textContent = 'Buscando contas vinculadas ao workspace.';
    elements.updateBlock.classList.add('is-hidden');
    setBadge(elements.updateBadge, 'Verificando', 'muted');
    elements.updateText.textContent = 'Conferindo releases.';
    elements.updateOpen.disabled = true;
    elements.updateStart.disabled = true;
    state.updateStatus = null;
    state.accounts = [];
    state.canConnect = false;
    state.serviceOnline = false;
    state.pendingRemoveUserId = '';
    state.remoteConnected = false;
    state.remoteAccounts = [];
    renderServiceControls();
    renderRemoteControls();
    renderVersionTag(null);
  }

  async function loadServiceAndAccounts(options = {}) {
    try {
      const diagnostics = await api('/diagnostics');
      renderServiceStatus(diagnostics);
      await loadUpdateStatus(options);

      const result = await api('/auth/accounts');
      const accounts = result && Array.isArray(result.accounts) ? result.accounts : [];
      state.accounts = accounts;
      renderAccounts(accounts);
      state.canConnect = true;
      elements.connect.disabled = false;
    } catch (err) {
      setBadge(elements.serviceBadge, 'Fechado', 'error');
      setBadge(elements.accountBadge, 'Indisponível', 'warn');
      elements.serviceText.textContent = 'Use Iniciar para abrir o servico local.';
      elements.accountText.textContent = 'Contas indisponíveis.';
      renderAccountList([]);
      renderUpdateUnavailable();
      state.canConnect = false;
      state.serviceOnline = false;
      elements.connect.disabled = true;
      renderServiceControls();
    }
  }

  function renderServiceStatus(diagnostics) {
    const ready = diagnostics && !hasSetupIssue(diagnostics);
    setBadge(elements.serviceBadge, ready ? 'Pronto' : 'Atenção', ready ? 'ok' : 'warn');
    elements.serviceText.textContent = ready
      ? 'OnFrame pronto para editar anúncios.'
      : firstSetupAction(diagnostics, 'OnFrame precisa de ajuste.');
    state.serviceOnline = true;
    renderServiceControls();
  }

  async function loadUpdateStatus(options = {}) {
    try {
      const status = await api(options.forceUpdate ? '/updates/status?force=1' : '/updates/status');
      state.updateStatus = status;
      renderUpdateStatus(status);
    } catch (err) {
      renderUpdateUnavailable();
    }
  }

  function renderUpdateStatus(status) {
    const visible = Boolean(status && status.updateAvailable);
    renderVersionTag(status);
    elements.updateBlock.classList.toggle('is-hidden', !visible);
    if (!visible) return;

    setBadge(elements.updateBadge, 'Disponível', 'blue');
    elements.updateText.textContent = `${status.message || `Versão ${status.latestVersion} disponível.`} Abra o atualizador ou copie o comando.`;
    elements.updateOpen.disabled = !status.updateAvailable;
    elements.updateStart.disabled = !status.updateCommand;
  }

  function renderUpdateUnavailable() {
    renderVersionTag(null);
    elements.updateBlock.classList.add('is-hidden');
    state.updateStatus = null;
  }

  function openUpdatePage() {
    if (!state.updateStatus || !state.updateStatus.updateAvailable) return;
    openLocalServiceAction('update');
    elements.updateBlock.classList.remove('is-hidden');
    setBadge(elements.updateBadge, 'Abrindo', 'blue');
    elements.updateText.textContent = 'A pagina de atualizacao foi aberta.';
  }

  function renderVersionTag(status) {
    const manifestVersion = getInstalledVersion();
    const currentVersion = status && status.currentVersion ? status.currentVersion : manifestVersion;
    const latestVersion = status && status.latestVersion ? status.latestVersion : currentVersion;
    const hasUpdate = Boolean(status && status.updateAvailable && latestVersion);
    elements.versionTag.textContent = hasUpdate ? `v${latestVersion}` : `v${currentVersion}`;
    elements.versionTag.classList.toggle('has-update', hasUpdate);
    setTooltip(elements.versionTag, hasUpdate ? `Versão ${latestVersion} disponível` : `OnFrame v${currentVersion}`, { placement: 'bottom' });
    elements.versionTag.href = status && status.releaseUrl ? status.releaseUrl : RELEASES_URL;
  }

  function renderAccounts(accounts) {
    if (!accounts.length) {
      setBadge(elements.accountBadge, 'Desconectada', 'warn');
      elements.accountText.textContent = 'Nenhuma conta conectada.';
      renderAccountList([]);
      return;
    }

    const enabledCount = accounts.filter((account) => account.enabled !== false).length;
    setBadge(elements.accountBadge, enabledCount ? 'Conectada' : 'Desativada', enabledCount ? 'ok' : 'warn');
    elements.accountText.textContent = accounts.length === 1
      ? enabledCount ? '1 conta habilitada.' : '1 conta desativada.'
      : `${enabledCount}/${accounts.length} contas habilitadas.`;
    renderAccountList(accounts);
  }

  function renderAccountList(accounts) {
    if (!accounts || !accounts.length) {
      elements.accountList.classList.add('is-hidden');
      elements.accountList.innerHTML = '';
      return;
    }
    elements.accountList.innerHTML = accounts.map((account) => {
      const enabled = account.enabled !== false;
      return `
      <article class="account-card ${enabled ? 'is-connected' : 'is-disabled'}" data-user-id="${escapeAttribute(account.user_id)}">
        ${renderAccountAvatar(account)}
        <span class="account-main">
          <strong>${escapeHtml(account.nickname || `Conta ${account.user_id}`)}</strong>
          <small>ID: ${escapeHtml(account.user_id || '-')}</small>
          <em>${enabled ? 'Habilitada' : 'Desativada'}</em>
        </span>
        <button class="account-switch ${enabled ? 'is-on' : ''}" data-action="toggle-account" data-user-id="${escapeAttribute(account.user_id)}" data-tooltip="${enabled ? 'Desativar conta' : 'Habilitar conta'}" role="switch" aria-checked="${enabled ? 'true' : 'false'}" type="button" aria-label="${enabled ? 'Desativar conta' : 'Habilitar conta'}"></button>
        <span class="account-card-actions">
          ${account.permalink ? `<button class="account-icon-btn" data-action="open-account" data-url="${escapeAttribute(account.permalink)}" data-tooltip="Abrir perfil" type="button" aria-label="Abrir perfil">${icon('arrowSquareOut', 16)}</button>` : ''}
          <button class="account-icon-btn danger${String(state.pendingRemoveUserId) === String(account.user_id) ? ' is-confirming' : ''}" data-action="remove-account" data-user-id="${escapeAttribute(account.user_id)}" data-tooltip="${String(state.pendingRemoveUserId) === String(account.user_id) ? 'Confirmar remoção' : 'Remover conta'}" type="button" aria-label="${String(state.pendingRemoveUserId) === String(account.user_id) ? 'Confirmar remoção' : 'Remover conta'}">${icon(String(state.pendingRemoveUserId) === String(account.user_id) ? 'checkCircle' : 'x', 16)}</button>
        </span>
      </article>
    `;
    }).join('');
    elements.accountList.classList.remove('is-hidden');
    mountTooltips(elements.accountList);
    bindAccountActions();
  }

  function bindAccountActions() {
    elements.accountList.querySelectorAll('.account-avatar-image').forEach((image) => {
      image.addEventListener('error', () => image.remove(), { once: true });
    });
    elements.accountList.querySelectorAll('[data-action="open-account"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        openExternalUrl(button.dataset.url);
      });
    });
    elements.accountList.querySelectorAll('[data-action="toggle-account"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        void toggleAccountEnabled(button.dataset.userId, button.getAttribute('aria-checked') !== 'true');
      });
    });
    elements.accountList.querySelectorAll('[data-action="remove-account"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        void removeAccount(button.dataset.userId);
      });
    });
  }

  async function toggleAccountEnabled(userId, enabled) {
    if (!userId) return;
    setBusy(true);
    try {
      const result = await api(`/auth/accounts/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled })
      });
      const accounts = result && Array.isArray(result.accounts) ? result.accounts : state.accounts;
      state.accounts = accounts;
      renderAccounts(accounts);
      showActionFeedback(enabled ? 'Conta habilitada.' : 'Conta desativada.', 'ok');
    } catch (err) {
      showActionFeedback(toUserError(err), 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount(userId) {
    if (!userId) return;
    if (String(state.pendingRemoveUserId) !== String(userId)) {
      state.pendingRemoveUserId = String(userId);
      renderAccountList(state.accounts);
      showActionFeedback('Clique novamente para remover a conta.', 'warn');
      return;
    }

    setBusy(true);
    try {
      await api(`/auth/accounts/${encodeURIComponent(userId)}`, { method: 'DELETE' });
      state.pendingRemoveUserId = '';
      showActionFeedback('Conta removida.', 'ok');
      await loadServiceAndAccounts();
    } catch (err) {
      showActionFeedback(toUserError(err), 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function startAuth() {
    setBusy(true);
    try {
      const result = await api('/auth/start', { method: 'POST', body: '{}' });
      openExternalUrl(result.authUrl);
      elements.accountText.textContent = 'Autorize e atualize os dados.';
      state.canConnect = true;
    } catch (err) {
      showActionFeedback(toUserError(err), 'danger');
    } finally {
      setBusy(false);
    }
  }

  function getAccountInitial(account) {
    const label = String(account && (account.nickname || account.user_id) || '?').trim();
    return label ? label[0].toUpperCase() : '?';
  }

  function renderAccountAvatar(account) {
    const initial = escapeHtml(getAccountInitial(account));
    const logo = getAccountLogo(account);
    return `<span class="account-avatar"><span class="account-avatar-fallback">${initial}</span>${logo ? `<img class="account-avatar-image" src="${escapeAttribute(logo)}" alt="" referrerpolicy="no-referrer">` : ''}</span>`;
  }

  function getAccountLogo(account) {
    const logo = String(account && account.logo || '').trim();
    return /^https:\/\/(?:[a-z0-9-]+\.)*mlstatic\.com\//i.test(logo) ? logo : '';
  }

  function openVersionLink(event) {
    event.preventDefault();
    openExternalUrl(elements.versionTag.href || RELEASES_URL);
  }

  function openExternalUrl(url) {
    const target = String(url || '').trim();
    if (!target) return;
    if (window.chrome && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: target });
      return;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  function openLocalServiceAction(action) {
    const path = `ui/launcher/index.html?action=${encodeURIComponent(action)}`;
    const url = window.chrome && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL(path) : `../launcher/index.html?action=${encodeURIComponent(action)}`;
    openExternalUrl(url);
    showActionFeedback('Janela de controle aberta.', 'ok');
  }

  async function copyUpdateCommand() {
    if (!state.updateStatus || !state.updateStatus.updateCommand) return;
    setBusy(true);
    try {
      await copyText(state.updateStatus.updateCommand);
      elements.updateBlock.classList.remove('is-hidden');
      setBadge(elements.updateBadge, 'Copiado', 'ok');
      elements.updateText.textContent = `Comando copiado. Cole no ${state.updateStatus.shellLabel || 'PowerShell'}.`;
      elements.updateStart.disabled = true;
    } catch (err) {
      elements.updateBlock.classList.remove('is-hidden');
      setBadge(elements.updateBadge, 'Erro', 'error');
      elements.updateText.textContent = toUserError(err);
    } finally {
      setBusy(false);
    }
  }

  async function loadRemoteConnection() {
    try {
      const connection = await sendRemoteMessage('status');
      renderRemoteConnection(connection);
      if (connection && connection.connected) await loadRemoteAccounts();
    } catch (err) {
      state.remoteConnected = false;
      setBadge(elements.remoteBadge, 'Indisponível', 'warn');
      elements.remoteText.textContent = 'Não foi possível consultar o OnFrame remoto.';
      elements.remoteConnect.classList.remove('is-hidden');
      elements.remoteContext.classList.add('is-hidden');
      elements.remoteActions.classList.add('is-hidden');
      elements.remoteAccountsPanel.classList.add('is-hidden');
      renderRemoteControls();
    }
  }

  async function claimRemoteConnection() {
    const pairingCode = elements.remotePairingCode.value.trim();
    if (!pairingCode) {
      elements.remotePairingCode.focus();
      showActionFeedback('Informe o código de pareamento.', 'warn');
      return;
    }

    setBusy(true);
    try {
      const connection = await sendRemoteMessage('claim', { pairingCode });
      elements.remotePairingCode.value = '';
      renderRemoteConnection(connection);
      await loadRemoteAccounts();
      showActionFeedback('Extensão vinculada ao acesso remoto.', 'ok');
    } catch (err) {
      showActionFeedback(toUserError(err), 'danger');
    } finally {
      setBusy(false);
    }
  }

  function openRemotePairing() {
    openExternalUrl(REMOTE_CONNECT_URL);
  }

  async function disconnectRemoteConnection() {
    setBusy(true);
    try {
      await sendRemoteMessage('disconnect');
      renderRemoteConnection({ connected: false });
      showActionFeedback('Extensão desvinculada do acesso remoto.', 'ok');
    } catch (err) {
      showActionFeedback(toUserError(err), 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function loadRemoteAccounts() {
    if (!state.remoteConnected) {
      renderRemoteAccounts([]);
      return;
    }

    try {
      const result = await sendRemoteMessage('accounts');
      const accounts = result && Array.isArray(result.accounts) ? result.accounts : [];
      state.remoteAccounts = accounts;
      renderRemoteAccounts(accounts);
    } catch (err) {
      if (err && err.code === 'extension_session_unauthorized') {
        renderRemoteConnection({ connected: false, reason: 'unauthorized' });
        return;
      }
      elements.remoteAccountsPanel.classList.remove('is-hidden');
      elements.remoteAccountsList.classList.add('is-hidden');
      setBadge(elements.remoteAccountsBadge, 'Indisponível', 'warn');
      elements.remoteAccountsText.textContent = 'Não foi possível consultar as contas do workspace.';
    }
  }

  async function startRemoteAuth() {
    setBusy(true);
    try {
      await sendRemoteMessage('oauth-start');
      elements.remoteAccountsText.textContent = 'Autorize a conta do Mercado Livre na aba aberta.';
      showActionFeedback('Autorize a conta do Mercado Livre na aba aberta.', 'ok');
    } catch (err) {
      showActionFeedback(toUserError(err), 'danger');
    } finally {
      setBusy(false);
    }
  }

  function renderRemoteAccounts(accounts) {
    const visible = state.remoteConnected;
    elements.remoteAccountsPanel.classList.toggle('is-hidden', !visible);
    if (!visible) {
      elements.remoteAccountsList.classList.add('is-hidden');
      elements.remoteAccountsList.innerHTML = '';
      return;
    }

    const count = accounts.length;
    setBadge(elements.remoteAccountsBadge, count === 1 ? '1 conta' : `${count} contas`, count ? 'ok' : 'muted');
    elements.remoteAccountsText.textContent = count
      ? `${count === 1 ? '1 conta vinculada' : `${count} contas vinculadas`} ao workspace.`
      : 'Nenhuma conta vinculada ao workspace.';

    if (!count) {
      elements.remoteAccountsList.classList.add('is-hidden');
      elements.remoteAccountsList.innerHTML = '';
      return;
    }

    elements.remoteAccountsList.innerHTML = accounts.map((account) => {
      const enabled = account && account.enabled !== false;
      const userId = String(account && account.userId || '');
      const nickname = String(account && account.nickname || `Conta ${userId}`);
      const logo = String(account && account.logoUrl || '');
      const profileUrl = String(account && account.profileUrl || '');
      return `
        <article class="account-card ${enabled ? 'is-connected' : 'is-disabled'}">
          ${renderAccountAvatar({ nickname, user_id: userId, logo })}
          <span class="account-main">
            <strong>${escapeHtml(nickname)}</strong>
            <span>Mercado Livre</span>
            <em>${enabled ? 'Habilitada' : 'Desativada'}</em>
          </span>
          ${profileUrl ? `<span class="account-card-actions"><button class="account-icon-btn" data-action="open-remote-account" data-url="${escapeAttribute(profileUrl)}" data-tooltip="Abrir perfil" type="button" aria-label="Abrir perfil">${icon('arrowSquareOut', 16)}</button></span>` : ''}
        </article>
      `;
    }).join('');
    elements.remoteAccountsList.classList.remove('is-hidden');
    elements.remoteAccountsList.querySelectorAll('.account-avatar-image').forEach((image) => {
      image.addEventListener('error', () => image.remove(), { once: true });
    });
    elements.remoteAccountsList.querySelectorAll('[data-action="open-remote-account"]').forEach((button) => {
      button.addEventListener('click', () => openExternalUrl(button.dataset.url));
    });
    mountTooltips(elements.remoteAccountsList);
  }

  function renderRemoteConnection(connection) {
    const connected = Boolean(connection && connection.connected && connection.user && connection.workspace);
    state.remoteConnected = connected;
    elements.remoteConnect.classList.toggle('is-hidden', connected);
    elements.remoteContext.classList.toggle('is-hidden', !connected);
    elements.remoteActions.classList.toggle('is-hidden', !connected);

    if (!connected) {
      const expired = connection && connection.reason === 'expired';
      setBadge(elements.remoteBadge, 'Não vinculada', 'warn');
      elements.remoteText.textContent = expired
        ? 'A sessão anterior expirou. Vincule esta extensão novamente.'
        : 'Vincule esta extensão ao seu workspace no OnFrame.';
      elements.remoteUser.textContent = '-';
      elements.remoteWorkspace.textContent = '-';
      elements.remoteExpiresAt.textContent = '-';
      state.remoteAccounts = [];
      renderRemoteAccounts([]);
      renderRemoteControls();
      return;
    }

    setBadge(elements.remoteBadge, 'Vinculada', 'ok');
    elements.remoteText.textContent = 'Esta extensão está vinculada ao seu workspace remoto.';
    elements.remoteUser.textContent = String(connection.user.name || connection.user.email);
    elements.remoteWorkspace.textContent = String(connection.workspace.name);
    elements.remoteExpiresAt.textContent = formatRemoteExpiration(connection.expiresAt);
    renderRemoteControls();
  }

  function formatRemoteExpiration(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function sendRemoteMessage(action, payload = {}) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(Object.assign({ type: 'onframe:remote', action }, payload), (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            const error = new Error('Não foi possível acessar o OnFrame remoto.');
            error.technicalError = runtimeError.message || String(runtimeError);
            reject(error);
            return;
          }
          if (!response || response.ok !== true) {
            const error = new Error(response && response.error ? response.error : 'Não foi possível acessar o OnFrame remoto.');
            error.code = response && response.code ? response.code : '';
            error.technicalError = response && response.technicalError ? response.technicalError : error.code || error.message;
            reject(error);
            return;
          }
          resolve(response.body || {});
        });
      } catch (err) {
        const error = new Error('Não foi possível acessar o OnFrame remoto.');
        error.technicalError = err && err.message ? err.message : String(err);
        reject(error);
      }
    });
  }

  function renderRemoteControls() {
    const canClaim = !state.busy && !state.remoteConnected && Boolean(elements.remotePairingCode.value.trim());
    elements.remotePairingCode.disabled = state.busy || state.remoteConnected;
    elements.remoteClaim.disabled = !canClaim;
    elements.remoteOpenConnect.disabled = state.busy || state.remoteConnected;
    elements.remoteDisconnect.disabled = state.busy || !state.remoteConnected;
    elements.remoteAccountConnect.disabled = state.busy || !state.remoteConnected;
  }

  function setBusy(value) {
    state.busy = value;
    elements.refresh.disabled = value;
    elements.connect.disabled = value || !state.canConnect;
    elements.serviceStart.disabled = value;
    elements.serviceRestart.disabled = value;
    elements.serviceStop.disabled = value;
    elements.serviceCheck.disabled = value;
    elements.updateOpen.disabled = value || !state.updateStatus || !state.updateStatus.updateAvailable;
    elements.updateStart.disabled = value || !state.updateStatus || !state.updateStatus.updateCommand;
    elements.accountList.querySelectorAll('button').forEach((button) => {
      button.disabled = value;
    });
    elements.remoteAccountsList.querySelectorAll('button').forEach((button) => {
      button.disabled = value;
    });
    renderRemoteControls();
  }

  function renderServiceControls() {
    elements.serviceStart.classList.toggle('is-hidden', state.serviceOnline);
    elements.serviceRestart.classList.toggle('is-hidden', !state.serviceOnline);
    elements.serviceStop.classList.toggle('is-hidden', !state.serviceOnline);
    const visibleActions = [...elements.serviceActions.querySelectorAll('.ob-button')]
      .filter((button) => !button.classList.contains('is-hidden')).length;
    elements.serviceActions.dataset.actionCount = String(visibleActions);
  }

  function showActionFeedback(message, tone) {
    const mappedTone = tone === 'ok' ? 'success' : tone === 'danger' ? 'danger' : 'warning';
    toast.show({ tone: mappedTone, title: message });
  }

  function hasSetupIssue(diagnostics) {
    const issues = diagnostics && Array.isArray(diagnostics.issues) ? diagnostics.issues : [];
    return issues.some((issue) => [
      'node_version'
    ].includes(issue));
  }

  function firstSetupAction(diagnostics, fallback) {
    const issues = diagnostics && Array.isArray(diagnostics.issues) ? diagnostics.issues : [];
    if (issues.includes('node_version')) return 'Instale Node.js 20+.';
    return fallback;
  }

  function decorateButtons() {
    addIcon(elements.refresh, 'refresh');
    addIcon(elements.connect, 'plus');
    setServiceActionIcon(elements.serviceStart, 'play');
    setServiceActionIcon(elements.serviceRestart, 'refresh');
    setServiceActionIcon(elements.serviceStop, 'stop');
    setServiceActionIcon(elements.serviceCheck, 'checkCircle');
    addIcon(elements.remoteClaim, 'link');
    addIcon(elements.remoteOpenConnect, 'arrowSquareOut');
    addIcon(elements.remoteDisconnect, 'x');
    addIcon(elements.remoteAccountConnect, 'plus');
    addIcon(elements.updateOpen, 'arrowSquareOut');
    addIcon(elements.updateStart, 'copy');
  }

  function setServiceActionIcon(button, name) {
    if (!button || !window.OnblideIcons) return;
    const label = button.textContent.trim();
    button.innerHTML = `${window.OnblideIcons.render(name, 14)}<span class="service-action-label">${escapeHtml(label)}</span>`;
    button.dataset.iconReady = 'true';
  }

  function icon(name, size) {
    return window.OnblideIcons ? window.OnblideIcons.render(name, size) : '';
  }

  function getInstalledVersion() {
    return chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '-';
  }

  async function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

})();
