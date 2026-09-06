(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OnFramePhotosDockView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createDockView(options) {
    const state = options.state;
    const escapeHtml = options.escapeHtml;
    const icon = options.icon;

    function buildMarkup() {
      if (!state.loaded && !state.context && !state.error) return '';
      const expanded = state.dockExpanded;
      return `
        <div class="onblide-ml-dock-shell">
          <svg class="onblide-ml-dock-silhouette" viewBox="0 0 1000 28" preserveAspectRatio="none" focusable="false">
            <path class="onblide-ml-dock-silhouette-fill" d="M16 28H390C410 28 414 0 438 0H562C586 0 590 28 610 28H984Z"></path>
            <path class="onblide-ml-dock-silhouette-outline" d="M16 28H390C410 28 414 0 438 0H562C586 0 590 28 610 28H984"></path>
          </svg>
          <div class="onblide-ml-dock-panel${expanded ? ' is-expanded' : ''}">
            <div class="onblide-ml-dock-content">${buildContent()}</div>
          </div>
        </div>
        <button class="onblide-ml-dock-tab" data-action="toggle-dock" type="button" title="${expanded ? 'Recolher editor de fotos' : 'Expandir editor de fotos'}">
          <span class="onblide-ml-dock-tab-icon${expanded ? ' is-expanded' : ''}">${icon('caretUp', 16)}</span>
        </button>
      `;
    }

    function buildContent() {
      if (!state.context) {
        return `
          <div class="onblide-ml-tray-bar">
            ${renderStatus()}
            <button class="onblide-ml-btn primary" data-action="connect" type="button">Conectar</button>
            <button class="onblide-ml-btn" data-action="reload" type="button">Recarregar</button>
          </div>
        `;
      }
      if (options.isEditingBlocked()) {
        return `
          <div class="onblide-ml-tray-bar">
            ${renderStatus()}
            <button class="onblide-ml-btn" data-action="reload" type="button">Recarregar</button>
          </div>
        `;
      }

      const limitState = options.getLimitState();
      return `
        <div class="onblide-ml-dock-main">
          ${renderIdentity(limitState)}
          <div class="onblide-ml-strip" aria-label="Editor de fotos do anuncio">
            ${state.draftPictures.map(options.renderPictureTile).join('')}
            ${options.renderUploadTile()}
          </div>
          <div class="onblide-ml-dock-command-stack">
            <button class="onblide-ml-btn primary compact onblide-ml-dock-open-editor" data-action="open-editor" type="button" ${state.busy ? 'disabled' : ''}>${icon('arrowSquareOut', 14)}Abrir editor</button>
            ${renderActions(limitState)}
          </div>
        </div>
        ${renderFeedback(limitState)}
      `;
    }

    function renderIdentity(limitState) {
      const counter = limitState.counterText || `${state.draftPictures.length} fotos`;
      return `
        <div class="onblide-ml-dock-identity">
          <span class="onblide-ml-dock-identity-icon">${icon('image', 16)}</span>
          <span class="onblide-ml-dock-identity-copy"><strong>Editor de fotos</strong><small>${escapeHtml(counter)}</small></span>
        </div>
      `;
    }

    function renderStatus() {
      if (state.error) return `<div class="onblide-ml-status error">${escapeHtml(state.error)}</div>`;
      if (state.reloadCountdown) return `<div class="onblide-ml-status">Salvo. Atualizando em ${state.reloadCountdown}s.</div>`;
      const blockedMessage = options.getBlockedMessage();
      if (blockedMessage) return `<div class="onblide-ml-status muted">${escapeHtml(blockedMessage)}</div>`;
      const limitState = options.getLimitState();
      if (limitState.message) return `<div class="onblide-ml-status error">${escapeHtml(limitState.message)}</div>`;
      if (state.message) return `<div class="onblide-ml-status">${escapeHtml(state.message)}</div>`;
      if (state.context && state.selectedVariationId) return '<div class="onblide-ml-status muted">Variação selecionada</div>';
      if (state.context) return '<div class="onblide-ml-status muted">Fotos do anúncio</div>';
      return '';
    }

    function renderFeedback(limitState) {
      if (state.error) return `<div class="onblide-ml-tray-feedback error">${escapeHtml(state.error)}</div>`;
      if (state.reloadCountdown) return `<div class="onblide-ml-tray-feedback">Salvo. Atualizando em ${state.reloadCountdown}s.</div>`;
      if (state.dirty && limitState && limitState.message) return `<div class="onblide-ml-tray-feedback error">${escapeHtml(limitState.message)}</div>`;
      return '';
    }

    function renderActions(limitState) {
      if (!state.dirty && !state.reloadCountdown) return '';
      return `
        <div class="onblide-ml-tray-actions">
          ${state.dirty ? `
            <button class="onblide-ml-btn compact onblide-ml-dock-save" data-action="commit" type="button" ${state.busy || limitState.message ? 'disabled' : ''}>Salvar</button>
            <button class="onblide-ml-btn compact onblide-ml-dock-discard" data-action="discard" type="button" ${state.busy ? 'disabled' : ''}>${icon('trash', 13)}Descartar</button>
          ` : ''}
          ${state.reloadCountdown ? `<button class="onblide-ml-btn compact onblide-ml-dock-refresh" data-action="refresh" type="button">${icon('refresh', 14)}Atualizar agora</button>` : ''}
        </div>
      `;
    }

    return { buildMarkup };
  }

  return { createDockView };
});
