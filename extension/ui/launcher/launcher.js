(function () {
  const RAW_ROOT = 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap';
  const WINDOWS_ROOT_COMMAND = "$root=Join-Path $env:LOCALAPPDATA 'OnFrame'";
  const MAC_ROOT = '"$HOME/Library/Application Support/OnFrame"';
  const toast = window.OnFrameToast;

  const elements = {
    eyebrow: document.getElementById('launcher-eyebrow'),
    title: document.getElementById('launcher-title'),
    copy: document.getElementById('launcher-copy'),
    actionIcon: document.getElementById('launcher-action-icon'),
    preview: document.getElementById('launcher-preview'),
    status: document.getElementById('launcher-status'),
    statusLabel: document.getElementById('launcher-status-label'),
    statusText: document.getElementById('launcher-status-text'),
    statusDetail: document.getElementById('launcher-status-detail'),
    open: document.getElementById('launcher-open'),
    commands: document.getElementById('launcher-commands')
  };

  let action;
  let isPreview = false;
  let previewState = 'initial';
  let checkCommand = '';
  let leftPage = false;
  let recoveryVisible = false;
  let protocolFrame = null;
  let protocolFrameTimer = null;

  void initialize();

  async function initialize() {
    const platform = await detectPlatform();
    const actions = buildActions(platform);
    checkCommand = actions.check.primaryCommand;
    action = getAction(actions);
    isPreview = isPreviewMode();
    previewState = isPreview ? getPreviewState() : 'initial';
    render();
    bindEvents();
    if (!isPreview) window.setTimeout(openProtocol, 320);
  }

  function detectPlatform() {
    return new Promise((resolve) => {
      if (!window.chrome || !chrome.runtime || typeof chrome.runtime.getPlatformInfo !== 'function') {
        resolve('windows');
        return;
      }
      chrome.runtime.getPlatformInfo((info) => {
        resolve(info && info.os === 'mac' ? 'mac' : 'windows');
      });
    });
  }

  function buildActions(platform) {
    const isMac = platform === 'mac';
    const shellLabel = isMac ? 'Terminal' : 'PowerShell';
    const updateCommand = isMac
      ? `ONFRAME_HOME=${MAC_ROOT} /bin/sh -c "$(/usr/bin/curl -fsSL '${RAW_ROOT}/update.sh')"`
      : `$env:ONFRAME_HOME=(Join-Path $env:LOCALAPPDATA 'OnFrame'); iwr -useb '${RAW_ROOT}/update.ps1' | iex`;
    const repairCommand = isMac
      ? `/bin/sh -c "$(/usr/bin/curl -fsSL '${RAW_ROOT}/install.sh')"`
      : `iwr -useb '${RAW_ROOT}/install.ps1' | iex`;
    const localCommand = (name) => isMac
      ? `${MAC_ROOT}/scripts/bootstrap/${name}.sh`
      : `${WINDOWS_ROOT_COMMAND}; & (Join-Path $root 'scripts/bootstrap/${name}.ps1') -Root $root`;
    const restartCommand = isMac
      ? localCommand('restart')
      : localCommand('restart');
    const fallback = `Se nenhuma janela abriu, use o comando manual abaixo no ${shellLabel}.`;

    return {
      update: createAction('Atualização local', 'Atualizar OnFrame', 'Estamos solicitando a abertura do atualizador local registrado neste computador.', 'update', 'Tentar novamente', 'Tentando abrir o atualizador do OnFrame...', fallback, 'Atualizar OnFrame', updateCommand, repairCommand, { icon: 'refresh', tone: 'blue' }),
      start: createAction('Serviço local', 'Iniciar OnFrame', 'Estamos solicitando o início do serviço local do OnFrame neste computador.', 'start', 'Tentar novamente', 'Tentando iniciar o serviço local...', fallback, 'Iniciar serviço', localCommand('start'), repairCommand, { icon: 'play', tone: 'green' }),
      stop: createAction('Serviço local', 'Parar OnFrame', 'Estamos solicitando o encerramento do serviço local do OnFrame neste computador.', 'stop', 'Tentar novamente', 'Tentando encerrar o serviço local...', fallback, 'Parar serviço', localCommand('stop'), repairCommand, { icon: 'stop', tone: 'red', buttonTone: 'danger' }),
      restart: createAction('Serviço local', 'Reiniciar OnFrame', 'Estamos solicitando a reinicialização do serviço local do OnFrame neste computador.', 'restart', 'Tentar novamente', 'Tentando reiniciar o serviço local...', fallback, 'Reiniciar serviço', restartCommand, repairCommand, { icon: 'refresh', tone: 'orange' }),
      check: Object.assign(
        createAction('Diagnóstico local', 'Verificar OnFrame', 'Estamos solicitando a abertura da verificação local do OnFrame neste computador.', 'check', 'Tentar novamente', 'Tentando abrir a verificação local...', fallback, 'Verificar instalação', localCommand('check'), repairCommand, { icon: 'checkCircle', tone: 'blue' }),
        { hideCheckCommand: true }
      )
    };
  }

  function createAction(eyebrow, title, copy, protocolAction, openLabel, trying, fallback, primaryCommandLabel, primaryCommand, repairCommand, presentation = {}) {
    return Object.assign({
      eyebrow,
      title,
      copy,
      protocolUrl: `onframe-updater://${protocolAction}`,
      openLabel,
      trying,
      fallback,
      primaryCommandLabel,
      primaryCommand,
      repairCommand,
      icon: 'refresh',
      tone: 'blue',
      buttonTone: 'primary'
    }, presentation);
  }

  function getAction(actions) {
    const params = new URLSearchParams(window.location.search);
    const value = String(params.get('action') || 'update').toLowerCase();
    return actions[value] || actions.update;
  }

  function isPreviewMode() {
    return new URLSearchParams(window.location.search).get('preview') === '1';
  }

  function getPreviewState() {
    const value = String(new URLSearchParams(window.location.search).get('state') || 'initial').toLowerCase();
    return value === 'fallback' ? 'fallback' : 'initial';
  }

  function render() {
    elements.eyebrow.textContent = action.eyebrow;
    elements.title.textContent = action.title;
    elements.copy.textContent = action.copy;
    elements.preview.classList.toggle('is-hidden', !isPreview);
    elements.actionIcon.className = `launcher-action-icon is-${action.tone}`;
    elements.actionIcon.innerHTML = icon(action.icon, 20);
    elements.open.className = `ob-button ${action.buttonTone} launcher-open`;
    elements.open.disabled = isPreview;
    setButtonContent(elements.open, 'arrowSquareOut', action.openLabel);
    renderCommands();
    renderState();
  }

  function renderState() {
    if (isPreview && previewState === 'fallback') {
      showFallback();
      return;
    }
    showInitial();
  }

  function renderCommands() {
    const cards = [{ key: 'primary', label: action.primaryCommandLabel, command: action.primaryCommand }];
    if (!action.hideCheckCommand) {
      cards.push({ key: 'check', label: 'Verificar instalação', command: checkCommand });
    }
    if (recoveryVisible) {
      cards.push({ key: 'repair', label: 'Reparar instalação', command: action.repairCommand });
    }

    elements.commands.innerHTML = cards.map((card) => `
      <article class="launcher-command">
        <div class="launcher-command-head">
          <strong>${escapeHtml(card.label)}</strong>
          <button class="ob-button secondary compact" data-copy="${escapeAttribute(card.key)}" type="button">Copiar</button>
        </div>
        <code>${escapeHtml(card.command)}</code>
      </article>
    `).join('');

    elements.commands.querySelectorAll('[data-copy]').forEach((button) => {
      addIcon(button, 'copy');
      button.addEventListener('click', () => void copyCommand(button));
    });
  }

  function bindEvents() {
    elements.open.addEventListener('click', () => {
      if (!isPreview) openProtocol();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) leftPage = true;
    });
    window.addEventListener('blur', () => {
      leftPage = true;
    });
  }

  function openProtocol() {
    if (isPreview) return;
    leftPage = false;
    showInitial();
    launchProtocol();
    window.setTimeout(() => {
      if (!leftPage) showFallback();
    }, 1800);
  }

  function launchProtocol() {
    if (protocolFrame) protocolFrame.remove();
    if (protocolFrameTimer) window.clearTimeout(protocolFrameTimer);

    protocolFrame = document.createElement('iframe');
    protocolFrame.className = 'launcher-protocol-transport';
    protocolFrame.setAttribute('aria-hidden', 'true');
    protocolFrame.tabIndex = -1;
    protocolFrame.src = action.protocolUrl;
    document.body.appendChild(protocolFrame);

    protocolFrameTimer = window.setTimeout(() => {
      if (protocolFrame) protocolFrame.remove();
      protocolFrame = null;
      protocolFrameTimer = null;
    }, 2200);
  }

  function showInitial() {
    recoveryVisible = false;
    renderCommands();
    elements.status.dataset.tone = 'blue';
    elements.statusLabel.textContent = 'Abrindo automaticamente';
    elements.statusText.textContent = action.trying;
    elements.statusDetail.textContent = 'Você pode fechar esta janela quando a ação for iniciada.';
  }

  function showFallback() {
    recoveryVisible = true;
    renderCommands();
    elements.status.dataset.tone = 'orange';
    elements.statusLabel.textContent = 'Ação manual necessária';
    elements.statusText.textContent = 'Não foi possível confirmar a abertura do controle local';
    elements.statusDetail.textContent = `${action.fallback} Use “Reparar instalação” se o atalho por um clique não estiver disponível.`;
  }

  async function copyCommand(button) {
    const command = button.dataset.copy === 'check'
      ? checkCommand
      : button.dataset.copy === 'repair'
        ? action.repairCommand
        : action.primaryCommand;
    try {
      await navigator.clipboard.writeText(command);
      notify('success', 'Comando copiado');
    } catch (err) {
      const code = button.closest('.launcher-command')?.querySelector('code');
      if (!code) return;
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      notify('warning', 'Comando selecionado', 'Copie-o manualmente no terminal.');
    }
  }

  function setButtonContent(button, iconName, label) {
    button.innerHTML = `${icon(iconName, 14)}<span>${escapeHtml(label)}</span>`;
  }

  function addIcon(element, name) {
    if (!element || !window.OnblideIcons || element.dataset.iconReady) return;
    element.insertAdjacentHTML('afterbegin', window.OnblideIcons.render(name, 14));
    element.dataset.iconReady = 'true';
  }

  function icon(name, size) {
    return window.OnblideIcons ? window.OnblideIcons.render(name, size) : '';
  }

  function notify(tone, title, body) {
    if (toast && typeof toast.show === 'function') toast.show({ tone, title, body });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
