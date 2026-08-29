(function () {
  const RAW_ROOT = 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap';
  const WINDOWS_ROOT_COMMAND = "$root=Join-Path $env:LOCALAPPDATA 'OnFrame'";
  const MAC_ROOT = '"$HOME/Library/Application Support/OnFrame"';

  const elements = {
    eyebrow: document.getElementById('launcher-eyebrow'),
    title: document.getElementById('launcher-title'),
    copy: document.getElementById('launcher-copy'),
    status: document.getElementById('launcher-status'),
    statusText: document.getElementById('launcher-status-text'),
    open: document.getElementById('launcher-open'),
    commands: document.getElementById('launcher-commands')
  };

  let action;
  let checkCommand = '';
  let leftPage = false;

  void initialize();

  async function initialize() {
    const platform = await detectPlatform();
    const actions = buildActions(platform);
    checkCommand = actions.check.primaryCommand;
    action = getAction(actions);
    render();
    bindEvents();
    window.setTimeout(openProtocol, 320);
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
    const localCommand = (name) => isMac
      ? `${MAC_ROOT}/scripts/bootstrap/${name}.sh`
      : `${WINDOWS_ROOT_COMMAND}; & (Join-Path $root 'scripts/bootstrap/${name}.ps1') -Root $root`;
    const restartCommand = isMac
      ? localCommand('restart')
      : `${WINDOWS_ROOT_COMMAND}; & (Join-Path $root 'scripts/bootstrap/stop.ps1') -Root $root; & (Join-Path $root 'scripts/bootstrap/start.ps1') -Root $root`;
    const fallback = `Se nenhuma janela abriu, use o comando manual abaixo no ${shellLabel}.`;

    return {
      update: createAction('Atualizacao local', 'Atualizar OnFrame', 'Esta pagina pede ao navegador para abrir o atualizador local registrado neste computador.', 'update', 'Abrir atualizador novamente', 'Tentando abrir o atualizador do OnFrame...', fallback, 'Atualizar', updateCommand),
      start: createAction('Servico local', 'Iniciar OnFrame', 'Esta pagina pede ao navegador para iniciar o servico local do OnFrame neste computador.', 'start', 'Iniciar novamente', 'Tentando iniciar o servico local...', fallback, 'Iniciar servico', localCommand('start')),
      stop: createAction('Servico local', 'Parar OnFrame', 'Esta pagina pede ao navegador para encerrar o servico local do OnFrame neste computador.', 'stop', 'Parar novamente', 'Tentando encerrar o servico local...', fallback, 'Parar servico', localCommand('stop')),
      restart: createAction('Servico local', 'Reiniciar OnFrame', 'Esta pagina pede ao navegador para reiniciar o servico local do OnFrame neste computador.', 'restart', 'Reiniciar novamente', 'Tentando reiniciar o servico local...', fallback, 'Reiniciar servico', restartCommand),
      check: Object.assign(
        createAction('Diagnostico local', 'Verificar OnFrame', 'Esta pagina pede ao navegador para abrir a verificacao local do OnFrame neste computador.', 'check', 'Verificar novamente', 'Tentando abrir a verificacao local...', fallback, 'Verificar instalacao', localCommand('check')),
        { hideCheckCommand: true }
      )
    };
  }

  function createAction(eyebrow, title, copy, protocolAction, openLabel, trying, fallback, primaryCommandLabel, primaryCommand) {
    return {
      eyebrow,
      title,
      copy,
      protocolUrl: `onframe-updater://${protocolAction}`,
      openLabel,
      trying,
      fallback,
      primaryCommandLabel,
      primaryCommand
    };
  }

  function getAction(actions) {
    const params = new URLSearchParams(window.location.search);
    const value = String(params.get('action') || 'update').toLowerCase();
    return actions[value] || actions.update;
  }

  function render() {
    elements.eyebrow.textContent = action.eyebrow;
    elements.title.textContent = action.title;
    elements.copy.textContent = action.copy;
    elements.statusText.textContent = action.trying;
    elements.open.textContent = action.openLabel;
    addIcon(elements.open, 'arrowSquareOut');
    renderCommands();
  }

  function renderCommands() {
    const cards = [{ key: 'primary', label: action.primaryCommandLabel, command: action.primaryCommand }];
    if (!action.hideCheckCommand) {
      cards.push({ key: 'check', label: 'Verificar instalacao', command: checkCommand });
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

    document.querySelectorAll('[data-copy]').forEach((button) => {
      addIcon(button, 'copy');
      button.addEventListener('click', () => void copyCommand(button));
    });
  }

  function bindEvents() {
    elements.open.addEventListener('click', openProtocol);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) leftPage = true;
    });
    window.addEventListener('blur', () => {
      leftPage = true;
    });
  }

  function openProtocol() {
    leftPage = false;
    elements.status.classList.remove('is-fallback');
    elements.statusText.textContent = action.trying;
    window.setTimeout(() => {
      window.location.href = action.protocolUrl;
    }, 60);
    window.setTimeout(() => {
      if (!leftPage) showFallback();
    }, 1800);
  }

  function showFallback() {
    elements.status.classList.add('is-fallback');
    elements.statusText.textContent = action.fallback;
  }

  async function copyCommand(button) {
    const command = button.dataset.copy === 'check' ? checkCommand : action.primaryCommand;
    const previous = button.textContent;
    try {
      await navigator.clipboard.writeText(command);
      button.textContent = 'Copiado';
      window.setTimeout(() => {
        button.textContent = previous || 'Copiar';
        addIcon(button, 'copy');
      }, 1400);
    } catch (err) {
      const code = button.closest('.launcher-command')?.querySelector('code');
      if (!code) return;
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function addIcon(element, name) {
    if (!element || !window.OnblideIcons) return;
    element.insertAdjacentHTML('afterbegin', window.OnblideIcons.render(name, 14));
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
