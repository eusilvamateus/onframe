(function () {
  const Shared = window.OnFrameShared;
  const api = Shared.createApi({ offlineMessage: 'OnFrame fechado. Abra o OnFrame.' });
  const addIcon = Shared.addIcon;
  const escapeAttribute = Shared.escapeAttribute;
  const escapeHtml = Shared.escapeHtml;
  const setBadge = Shared.setBadge;
  const toUserError = Shared.toUserError;
  const EDITOR_VISIBLE_KEY = 'onframeEditorVisible';
  const RELEASES_URL = 'https://github.com/eusilvamateus/onframe/releases';

  const elements = {
    refresh: document.getElementById('refresh'),
    versionTag: document.getElementById('version-tag'),
    connect: document.getElementById('connect'),
    toggleEditor: document.getElementById('toggle-editor'),
    openOptions: document.getElementById('open-options'),
    updateBlock: document.getElementById('update-block'),
    updateBadge: document.getElementById('update-badge'),
    updateText: document.getElementById('update-text'),
    updateStart: document.getElementById('update-start'),
    serviceBadge: document.getElementById('service-badge'),
    serviceText: document.getElementById('service-text'),
    accountBadge: document.getElementById('account-badge'),
    accountText: document.getElementById('account-text'),
    accountList: document.getElementById('account-list'),
    actionFeedback: document.getElementById('action-feedback')
  };

  const state = {
    updateStatus: null,
    accounts: [],
    canConnect: false,
    editorVisible: true,
    pendingRemoveUserId: ''
  };

  decorateButtons();
  elements.refresh.addEventListener('click', () => void loadPopup());
  elements.versionTag.addEventListener('click', (event) => openVersionLink(event));
  elements.connect.addEventListener('click', () => void startAuth());
  elements.toggleEditor.addEventListener('click', () => void toggleEditor());
  elements.openOptions.addEventListener('click', openOptions);
  elements.updateStart.addEventListener('click', () => void copyUpdateCommand());

  void loadPopup();

  async function loadPopup() {
    setBusy(true);
    resetView();
    await loadEditorPreference();
    await loadServiceAndAccount();
    setBusy(false);
  }

  function resetView() {
    setBadge(elements.serviceBadge, 'Verificando', 'muted');
    setBadge(elements.accountBadge, 'Verificando', 'muted');
    elements.serviceText.textContent = 'Conferindo se esta pronto para uso.';
    elements.accountText.textContent = 'Buscando conta conectada.';
    elements.accountList.classList.add('is-hidden');
    elements.accountList.innerHTML = '';
    hideActionFeedback();
    elements.updateBlock.classList.add('is-hidden');
    setBadge(elements.updateBadge, 'Verificando', 'muted');
    elements.updateText.textContent = 'Conferindo releases.';
    elements.updateStart.disabled = true;
    state.updateStatus = null;
    state.canConnect = false;
    state.pendingRemoveUserId = '';
    renderVersionTag(null);
    renderEditorToggle();
  }

  async function loadServiceAndAccount() {
    try {
      const diagnostics = await api('/diagnostics');
      setBadge(elements.serviceBadge, diagnostics.ready ? 'Pronto' : 'Com avisos', diagnostics.ready ? 'ok' : 'warn');
      elements.serviceText.textContent = diagnostics.ready
        ? 'OnFrame pronto para editar anuncios.'
        : firstAction(diagnostics, 'OnFrame precisa de ajuste.');

      await loadUpdateStatus();

      const accountsResult = await api('/auth/accounts');
      const accounts = accountsResult && Array.isArray(accountsResult.accounts) ? accountsResult.accounts : [];
      state.accounts = accounts;
      const active = accounts.find((account) => account.active) || null;
      if (!active) {
        setBadge(elements.accountBadge, 'Desconectada', 'warn');
        elements.accountText.textContent = 'Nenhuma conta conectada.';
        renderAccountList([]);
        elements.connect.disabled = false;
        state.canConnect = true;
        return;
      }
      const enabledAccounts = accounts.filter((account) => account.enabled !== false);

      setBadge(elements.accountBadge, enabledAccounts.length ? 'Conectada' : 'Desativada', enabledAccounts.length ? 'ok' : 'warn');
      elements.accountText.textContent = accounts.length === 1
        ? enabledAccounts.length ? '1 conta habilitada.' : '1 conta desativada.'
        : `${enabledAccounts.length}/${accounts.length} contas habilitadas.`;
      renderAccountList(accounts);
      elements.connect.disabled = false;
      state.canConnect = true;
    } catch (err) {
      setBadge(elements.serviceBadge, 'Fechado', 'error');
      setBadge(elements.accountBadge, 'Indisponivel', 'warn');
      elements.serviceText.textContent = 'Abra o OnFrame e tente novamente.';
      elements.accountText.textContent = 'Conta indisponível.';
      renderAccountList([]);
      elements.connect.disabled = true;
      state.canConnect = false;
      renderUpdateUnavailable();
    }
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

  function getAccountInitial(account) {
    const label = String(account && (account.nickname || account.user_id) || '?').trim();
    return label ? label[0].toUpperCase() : '?';
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
      renderAccountList(accounts);
      const enabledCount = accounts.filter((account) => account.enabled !== false).length;
      setBadge(elements.accountBadge, enabledCount ? 'Conectada' : 'Desativada', enabledCount ? 'ok' : 'warn');
      elements.accountText.textContent = accounts.length === 1
        ? enabledCount ? '1 conta habilitada.' : '1 conta desativada.'
        : `${enabledCount}/${accounts.length} contas habilitadas.`;
      showActionFeedback(enabled ? 'Conta habilitada.' : 'Conta desativada.', 'ok');
    } catch (err) {
      showActionFeedback(toUserError(err), 'warn');
    } finally {
      setBusy(false);
    }
  }

  async function loadUpdateStatus() {
    try {
      const status = await api('/updates/status');
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

    setBadge(elements.updateBadge, 'Disponivel', 'blue');
    elements.updateText.textContent = `${status.message || `Versão ${status.latestVersion} disponível.`} Copie e cole no PowerShell.`;
    elements.updateStart.disabled = !status.updateCommand;
  }

  function renderUpdateUnavailable() {
    renderVersionTag(null);
    elements.updateBlock.classList.add('is-hidden');
    state.updateStatus = null;
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

  async function copyUpdateCommand() {
    if (!state.updateStatus || !state.updateStatus.updateCommand) return;
    setBusy(true);
    try {
      await copyText(state.updateStatus.updateCommand);
      elements.updateBlock.classList.remove('is-hidden');
      setBadge(elements.updateBadge, 'Copiado', 'ok');
      elements.updateText.textContent = 'Comando copiado. Cole no PowerShell.';
      elements.updateStart.disabled = true;
    } catch (err) {
      elements.updateBlock.classList.remove('is-hidden');
      setBadge(elements.updateBadge, 'Erro', 'error');
      elements.updateText.textContent = toUserError(err);
    } finally {
      setBusy(false);
    }
  }

  async function startAuth() {
    setBusy(true);
    try {
      const result = await api('/auth/start', { method: 'POST', body: '{}' });
      chrome.tabs.create({ url: result.authUrl });
      elements.accountText.textContent = 'Autorize e atualize.';
      state.canConnect = true;
    } catch (err) {
      elements.accountText.textContent = toUserError(err);
    } finally {
      setBusy(false);
    }
  }

  async function toggleEditor() {
    setBusy(true);
    try {
      const nextVisible = !state.editorVisible;
      await saveEditorPreference(nextVisible);
      state.editorVisible = nextVisible;
      renderEditorToggle();
      const tab = await getActiveProductTab();
      const nextStatus = await sendToTab(tab.id, { type: 'onframe:setEditorVisibility', visible: nextVisible });
      ensureProductStatus(nextStatus);
      showActionFeedback(nextVisible ? 'Editor visível.' : 'Editor oculto.', 'ok');
    } catch (err) {
      showActionFeedback(toActionError(err), 'warn');
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
      await loadServiceAndAccount();
    } catch (err) {
      showActionFeedback(toUserError(err), 'warn');
    } finally {
      setBusy(false);
    }
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
    if (!target) return;
    chrome.tabs.create({ url: target });
  }

  function getActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs.length ? tabs[0] : null);
      });
    });
  }

  async function getActiveProductTab() {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      throw new Error('Aba ativa não identificada.');
    }
    if (!isMercadoLivreUrl(tab.url)) {
      throw new Error('Abra um anúncio do Mercado Livre.');
    }
    return tab;
  }

  function sendToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (response && response.ok === false) {
          reject(new Error(response.error || 'Aba indisponível.'));
          return;
        }
        resolve(response);
      });
    });
  }

  function ensureProductStatus(status) {
    if (!status || !status.isProductPage) {
      throw new Error('Abra um anúncio do Mercado Livre.');
    }
  }

  function toActionError(err) {
    const message = String(err && err.message || err || '').toLowerCase();
    if (message.includes('receiving end does not exist') || message.includes('could not establish connection')) {
      return 'Recarregue esta aba.';
    }
    return toUserError(err);
  }

  function setBusy(value) {
    elements.refresh.disabled = value;
    elements.toggleEditor.disabled = value;
    elements.connect.disabled = value || !state.canConnect;
    elements.updateStart.disabled = value || !state.updateStatus || !state.updateStatus.updateCommand;
    elements.accountList.querySelectorAll('button').forEach((button) => {
      button.disabled = value;
    });
  }

  async function loadEditorPreference() {
    state.editorVisible = await readEditorPreference();
    renderEditorToggle();
  }

  function readEditorPreference() {
    return new Promise((resolve) => {
      if (!window.chrome || !chrome.storage || !chrome.storage.local) {
        resolve(true);
        return;
      }
      chrome.storage.local.get({ [EDITOR_VISIBLE_KEY]: true }, (result) => {
        resolve(result && result[EDITOR_VISIBLE_KEY] !== false);
      });
    });
  }

  function saveEditorPreference(value) {
    return new Promise((resolve) => {
      if (!window.chrome || !chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }
      chrome.storage.local.set({ [EDITOR_VISIBLE_KEY]: Boolean(value) }, resolve);
    });
  }

  function renderEditorToggle() {
    setIconButton(elements.toggleEditor, state.editorVisible ? 'eyeSlash' : 'eye', state.editorVisible ? 'Ocultar editor' : 'Mostrar editor');
  }

  function showActionFeedback(message, tone) {
    elements.actionFeedback.textContent = message;
    elements.actionFeedback.className = `action-feedback ${tone || 'muted'}`;
  }

  function hideActionFeedback() {
    elements.actionFeedback.textContent = '';
    elements.actionFeedback.className = 'action-feedback is-hidden';
  }

  function firstAction(diagnostics, fallback) {
    const actions = diagnostics && Array.isArray(diagnostics.nextActions) ? diagnostics.nextActions : [];
    return actions[0] || fallback;
  }

  function isMercadoLivreUrl(value) {
    return /^https:\/\/[^/]*mercadolivre\.com\.br\//i.test(String(value || ''));
  }

  function decorateButtons() {
    addIcon(elements.refresh, 'refresh');
    addIcon(elements.connect, 'plus');
    addIcon(elements.toggleEditor, 'eye');
    addIcon(elements.openOptions, 'gear');
    addIcon(elements.updateStart, 'copy');
  }

  function icon(name, size) {
    return window.OnblideIcons ? window.OnblideIcons.render(name, size) : '';
  }

  function getInstalledVersion() {
    return chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '-';
  }

  function setIconButton(button, icon, label) {
    if (!button || !window.OnblideIcons) return;
    button.innerHTML = window.OnblideIcons.render(icon, 16);
    button.title = label;
    button.setAttribute('aria-label', label);
    button.dataset.iconReady = 'true';
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
