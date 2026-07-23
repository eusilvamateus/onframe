(function () {
  const Shared = window.OnFrameShared;
  const api = Shared.createApi({ offlineMessage: 'OnFrame desligado. Abra pelo atalho.' });
  const addIcon = Shared.addIcon;
  const escapeAttribute = Shared.escapeAttribute;
  const escapeHtml = Shared.escapeHtml;
  const setBadge = Shared.setBadge;
  const toUserError = Shared.toUserError;
  const RELEASES_URL = 'https://github.com/eusilvamateus/onframe/releases';

  const elements = {
    refresh: document.getElementById('refresh'),
    versionTag: document.getElementById('version-tag'),
    connect: document.getElementById('connect'),
    serviceBadge: document.getElementById('service-badge'),
    serviceText: document.getElementById('service-text'),
    accountBadge: document.getElementById('account-badge'),
    accountText: document.getElementById('account-text'),
    accountList: document.getElementById('account-list'),
    actionFeedback: document.getElementById('action-feedback')
  };

  const state = {
    accounts: [],
    canConnect: false,
    pendingRemoveUserId: ''
  };

  decorateButtons();
  elements.refresh.addEventListener('click', () => void loadOptions());
  elements.versionTag.addEventListener('click', (event) => openVersionLink(event));
  elements.connect.addEventListener('click', () => void startAuth());

  void loadOptions();

  async function loadOptions() {
    setBusy(true);
    resetView();
    await loadServiceAndAccounts();
    setBusy(false);
  }

  function resetView() {
    setBadge(elements.serviceBadge, 'Verificando', 'muted');
    setBadge(elements.accountBadge, 'Verificando', 'muted');
    elements.serviceText.textContent = 'Verificando OnFrame.';
    elements.accountText.textContent = 'Buscando conta conectada.';
    elements.accountList.classList.add('is-hidden');
    elements.accountList.innerHTML = '';
    hideActionFeedback();
    state.accounts = [];
    state.canConnect = false;
    state.pendingRemoveUserId = '';
    renderVersionTag(null);
  }

  async function loadServiceAndAccounts() {
    try {
      const diagnostics = await api('/diagnostics');
      renderServiceStatus(diagnostics);
      await loadUpdateStatus();

      const result = await api('/auth/accounts');
      const accounts = result && Array.isArray(result.accounts) ? result.accounts : [];
      state.accounts = accounts;
      renderAccounts(accounts);
      state.canConnect = true;
      elements.connect.disabled = false;
    } catch (err) {
      setBadge(elements.serviceBadge, 'Fechado', 'error');
      setBadge(elements.accountBadge, 'Indisponível', 'warn');
      elements.serviceText.textContent = 'Abra o OnFrame e tente novamente.';
      elements.accountText.textContent = 'Contas indisponíveis.';
      renderAccountList([]);
      renderVersionTag(null);
      state.canConnect = false;
      elements.connect.disabled = true;
    }
  }

  function renderServiceStatus(diagnostics) {
    const ready = diagnostics && !hasSetupIssue(diagnostics);
    setBadge(elements.serviceBadge, ready ? 'Pronto' : 'Atenção', ready ? 'ok' : 'warn');
    elements.serviceText.textContent = ready
      ? 'OnFrame pronto para editar anúncios.'
      : firstSetupAction(diagnostics, 'OnFrame precisa de ajuste.');
  }

  async function loadUpdateStatus() {
    try {
      renderVersionTag(await api('/updates/status'));
    } catch (err) {
      renderVersionTag(null);
    }
  }

  function renderVersionTag(status) {
    const manifestVersion = getInstalledVersion();
    const currentVersion = status && status.currentVersion ? status.currentVersion : manifestVersion;
    const latestVersion = status && status.latestVersion ? status.latestVersion : currentVersion;
    const hasUpdate = Boolean(status && status.updateAvailable && latestVersion);
    elements.versionTag.textContent = hasUpdate ? `v${latestVersion}` : `v${currentVersion}`;
    elements.versionTag.classList.toggle('has-update', hasUpdate);
    elements.versionTag.title = hasUpdate ? `Versão ${latestVersion} disponível` : `OnFrame v${currentVersion}`;
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
        <span class="account-avatar">${escapeHtml(getAccountInitial(account))}</span>
        <span class="account-main">
          <strong>${escapeHtml(account.nickname || `Conta ${account.user_id}`)}</strong>
          <small>ID: ${escapeHtml(account.user_id || '-')}</small>
          <em>${enabled ? 'Habilitada' : 'Desativada'}</em>
        </span>
        <button class="account-switch ${enabled ? 'is-on' : ''}" data-action="toggle-account" data-user-id="${escapeAttribute(account.user_id)}" role="switch" aria-checked="${enabled ? 'true' : 'false'}" type="button" title="${enabled ? 'Desativar conta' : 'Habilitar conta'}" aria-label="${enabled ? 'Desativar conta' : 'Habilitar conta'}"></button>
        <span class="account-card-actions">
          ${account.permalink ? `<button class="account-icon-btn" data-action="open-account" data-url="${escapeAttribute(account.permalink)}" type="button" title="Abrir perfil" aria-label="Abrir perfil">${icon('arrowSquareOut', 16)}</button>` : ''}
          <button class="account-icon-btn danger${String(state.pendingRemoveUserId) === String(account.user_id) ? ' is-confirming' : ''}" data-action="remove-account" data-user-id="${escapeAttribute(account.user_id)}" type="button" title="${String(state.pendingRemoveUserId) === String(account.user_id) ? 'Confirmar remoção' : 'Remover conta'}" aria-label="${String(state.pendingRemoveUserId) === String(account.user_id) ? 'Confirmar remoção' : 'Remover conta'}">${icon(String(state.pendingRemoveUserId) === String(account.user_id) ? 'checkCircle' : 'x', 16)}</button>
        </span>
      </article>
    `;
    }).join('');
    elements.accountList.classList.remove('is-hidden');
    bindAccountActions();
  }

  function bindAccountActions() {
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
      showActionFeedback(toUserError(err), 'warn');
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
      showActionFeedback(toUserError(err), 'warn');
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
      showActionFeedback(toUserError(err), 'warn');
    } finally {
      setBusy(false);
    }
  }

  function getAccountInitial(account) {
    const label = String(account && (account.nickname || account.user_id) || '?').trim();
    return label ? label[0].toUpperCase() : '?';
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

  function setBusy(value) {
    elements.refresh.disabled = value;
    elements.connect.disabled = value || !state.canConnect;
    elements.accountList.querySelectorAll('button').forEach((button) => {
      button.disabled = value;
    });
  }

  function showActionFeedback(message, tone) {
    elements.actionFeedback.textContent = message;
    elements.actionFeedback.className = `action-feedback ${tone || 'muted'}`;
  }

  function hideActionFeedback() {
    elements.actionFeedback.textContent = '';
    elements.actionFeedback.className = 'action-feedback is-hidden';
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
  }

  function icon(name, size) {
    return window.OnblideIcons ? window.OnblideIcons.render(name, size) : '';
  }

  function getInstalledVersion() {
    return chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '-';
  }

})();
