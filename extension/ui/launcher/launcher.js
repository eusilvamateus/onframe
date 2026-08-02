(function () {
  const UPDATE_SCRIPT_URL = 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.ps1';
  const rootCommand = "$root=Join-Path $env:LOCALAPPDATA 'OnFrame'";
  const checkCommand = `${rootCommand}; & (Join-Path $root 'scripts/bootstrap/check.ps1') -Root $root`;

  const ACTIONS = {
    update: {
      eyebrow: 'Atualizacao local',
      title: 'Atualizar OnFrame',
      copy: 'Esta pagina pede ao navegador para abrir o atualizador local registrado neste computador.',
      protocolUrl: 'onframe-updater://update',
      openLabel: 'Abrir atualizador novamente',
      trying: 'Tentando abrir o atualizador do OnFrame...',
      fallback: 'Se nenhuma janela abriu, use o comando manual abaixo.',
      primaryCommandLabel: 'Atualizar',
      primaryCommand: `$env:ONFRAME_HOME=(Join-Path $env:LOCALAPPDATA 'OnFrame'); iwr -useb '${UPDATE_SCRIPT_URL}' | iex`
    },
    start: {
      eyebrow: 'Servico local',
      title: 'Iniciar OnFrame',
      copy: 'Esta pagina pede ao navegador para iniciar o servico local do OnFrame neste computador.',
      protocolUrl: 'onframe-updater://start',
      openLabel: 'Iniciar novamente',
      trying: 'Tentando iniciar o servico local...',
      fallback: 'Se nenhuma janela abriu, use o comando manual abaixo.',
      primaryCommandLabel: 'Iniciar servico',
      primaryCommand: `${rootCommand}; & (Join-Path $root 'scripts/bootstrap/start.ps1') -Root $root`
    },
    stop: {
      eyebrow: 'Servico local',
      title: 'Parar OnFrame',
      copy: 'Esta pagina pede ao navegador para encerrar o servico local do OnFrame neste computador.',
      protocolUrl: 'onframe-updater://stop',
      openLabel: 'Parar novamente',
      trying: 'Tentando encerrar o servico local...',
      fallback: 'Se nenhuma janela abriu, use o comando manual abaixo.',
      primaryCommandLabel: 'Parar servico',
      primaryCommand: `${rootCommand}; & (Join-Path $root 'scripts/bootstrap/stop.ps1') -Root $root`
    },
    restart: {
      eyebrow: 'Servico local',
      title: 'Reiniciar OnFrame',
      copy: 'Esta pagina pede ao navegador para reiniciar o servico local do OnFrame neste computador.',
      protocolUrl: 'onframe-updater://restart',
      openLabel: 'Reiniciar novamente',
      trying: 'Tentando reiniciar o servico local...',
      fallback: 'Se nenhuma janela abriu, use o comando manual abaixo.',
      primaryCommandLabel: 'Reiniciar servico',
      primaryCommand: `${rootCommand}; & (Join-Path $root 'scripts/bootstrap/stop.ps1') -Root $root; & (Join-Path $root 'scripts/bootstrap/start.ps1') -Root $root`
    },
    check: {
      eyebrow: 'Diagnostico local',
      title: 'Verificar OnFrame',
      copy: 'Esta pagina pede ao navegador para abrir a verificacao local do OnFrame neste computador.',
      protocolUrl: 'onframe-updater://check',
      openLabel: 'Verificar novamente',
      trying: 'Tentando abrir a verificacao local...',
      fallback: 'Se nenhuma janela abriu, use o comando manual abaixo.',
      primaryCommandLabel: 'Verificar instalacao',
      primaryCommand: checkCommand,
      hideCheckCommand: true
    }
  };

  const elements = {
    eyebrow: document.getElementById('launcher-eyebrow'),
    title: document.getElementById('launcher-title'),
    copy: document.getElementById('launcher-copy'),
    status: document.getElementById('launcher-status'),
    statusText: document.getElementById('launcher-status-text'),
    open: document.getElementById('launcher-open'),
    commands: document.getElementById('launcher-commands')
  };

  const action = getAction();
  let leftPage = false;

  render();
  bindEvents();
  window.setTimeout(openProtocol, 320);

  function getAction() {
    const params = new URLSearchParams(window.location.search);
    const value = String(params.get('action') || 'update').toLowerCase();
    return ACTIONS[value] || ACTIONS.update;
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
    const cards = [
      {
        key: 'primary',
        label: action.primaryCommandLabel,
        command: action.primaryCommand
      }
    ];
    if (!action.hideCheckCommand) {
      cards.push({
        key: 'check',
        label: 'Verificar instalacao',
        command: checkCommand
      });
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
    const key = button.dataset.copy === 'check' ? 'check' : 'primary';
    const command = key === 'check' ? checkCommand : action.primaryCommand;
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
