(function (rootScope) {
  rootScope.OnFramePhotosModule = {
    createPhotoModule
  };

  function createPhotoModule(services) {
  const Shared = services.Shared;
  const Detection = services.Detection;
  const PhotosModel = services.PhotosModel;
  const api = services.api;
  const root = services.root;
  const requestPageContextReload = services.requestPageContextReload || (() => Promise.resolve(null));
  const escapeHtml = Shared.escapeHtml;
  const escapeAttribute = Shared.escapeAttribute;
  const isProductPageUrl = Detection.isProductPageUrl;
  const toUserError = (err) => Shared.toUserError(err, { logPrefix: '[Onblide ML] detalhe tecnico:' });

  const state = {
    context: null,
    ownerUserId: null,
    selectedVariationId: null,
    originalPictures: [],
    draftPictures: [],
    originalVariations: [],
    variations: [],
    tray: null,
    dialogRoot: null,
    fileInput: null,
    draggingId: null,
    drag: null,
    dirty: false,
    busy: false,
    loaded: false,
    editorVisible: true,
    renderTimer: null,
    reloadTimer: null,
    renderAfterDrag: false,
    reloadCountdown: 0,
    lastTrayMarkup: '',
    lastDialogMarkup: '',
    message: '',
    error: '',
    pageSignature: '',
    loadedPageSignature: '',
    blockedPageSignature: '',
    pendingPageContext: null,
    quality: null,
    qualityLoading: false,
    qualityError: '',
    qualityOverrides: {},
    qualityDialog: null,
    qualityRequestId: 0
  };

  function startProductEditor() {
    ensureFileInput();
    state.pageSignature = readPageSignature();
    if (state.editorVisible) mountEditorTray();
  }

  function resetState() {
    removeTray();
    state.context = null;
    state.ownerUserId = null;
    state.selectedVariationId = null;
    state.originalPictures = [];
    state.draftPictures = [];
    state.originalVariations = [];
    state.variations = [];
    state.draggingId = null;
    state.drag = null;
    state.dirty = false;
    state.busy = false;
    state.loaded = false;
    state.editorVisible = true;
    if (state.renderTimer) clearTimeout(state.renderTimer);
    if (state.reloadTimer) clearInterval(state.reloadTimer);
    state.renderTimer = null;
    state.reloadTimer = null;
    state.renderAfterDrag = false;
    state.reloadCountdown = 0;
    state.lastTrayMarkup = '';
    state.lastDialogMarkup = '';
    state.message = '';
    state.error = '';
    state.pageSignature = readPageSignature();
    state.loadedPageSignature = '';
    state.blockedPageSignature = '';
    state.pendingPageContext = null;
    state.quality = null;
    state.qualityLoading = false;
    state.qualityError = '';
    state.qualityOverrides = {};
    state.qualityDialog = null;
    state.qualityRequestId += 1;
    removeQualityDialog();
  }

  function scheduleRender(delay = 200) {
    if (state.renderTimer) return;
    state.renderTimer = setTimeout(() => {
      state.renderTimer = null;
      mountEditorTray();
    }, delay);
  }

  function readPageSignature() {
    return Detection.createPageSignature(document, location.href);
  }

  function handlePageContextChange(update) {
    const status = update && update.status ? update.status : '';
    const pageSignature = update && update.signature ? update.signature : readPageSignature();

    if (status === 'not_product') {
      resetState();
      return;
    }

    if (status === 'loading') {
      if (state.dirty && pageSignature !== state.loadedPageSignature) {
        state.blockedPageSignature = pageSignature;
        state.pendingPageContext = null;
        state.message = 'Salve ou descarte antes de trocar a variação.';
        state.error = '';
        rerenderTray();
        return;
      }
      state.pageSignature = pageSignature;
      state.busy = true;
      state.loaded = false;
      state.message = 'Atualizando variação...';
      state.error = '';
      rerenderTray();
      return;
    }

    if (status === 'error') {
      state.context = null;
      state.ownerUserId = null;
      state.busy = false;
      state.loaded = true;
      state.error = update && update.error ? update.error : 'Não foi possível ler este anúncio.';
      state.message = '';
      rerenderTray();
      return;
    }

    if (status !== 'ready') return;

    if (state.dirty && pageSignature !== state.loadedPageSignature) {
      state.blockedPageSignature = pageSignature;
      state.pendingPageContext = update;
      state.message = 'Salve ou descarte antes de trocar a variação.';
      state.error = '';
      rerenderTray();
      return;
    }

    if (state.drag) {
      state.pendingPageContext = update;
      return;
    }

    void loadContext({ context: update.context });
  }

  async function loadContext(options = {}) {
    state.busy = true;
    state.loaded = false;
    state.message = options.loadingMessage || '';
    state.error = '';

    try {
      const context = options.context;
      if (!context) throw new Error('Contexto do anúncio indisponível.');

      state.context = context;
      state.ownerUserId = context && context.ownerAccount && context.ownerAccount.user_id ? context.ownerAccount.user_id : null;
      state.selectedVariationId = context.selectedVariationId || null;
      state.originalVariations = cloneVariations(context.variations || []);
      state.variations = cloneVariations(context.variations || []);
      state.originalPictures = selectPicturesForActiveVariation(context).map(toDraftPicture);
      state.draftPictures = state.originalPictures.map(clonePicture);
      state.dirty = false;
      state.blockedPageSignature = '';
      state.pendingPageContext = null;
      state.loadedPageSignature = context.page && context.page.signature ? context.page.signature : readPageSignature();
      state.pageSignature = state.loadedPageSignature;
      state.message = options.successMessage || '';
      state.quality = null;
      state.qualityLoading = false;
      state.qualityError = '';
      state.qualityOverrides = {};
      state.qualityDialog = null;
      state.qualityRequestId += 1;
      if (!isPictureEditingBlocked()) void loadPictureQuality();
    } catch (err) {
      state.context = null;
      state.ownerUserId = null;
      state.qualityLoading = false;
      state.qualityRequestId += 1;
      state.error = toUserError(err);
      state.message = '';
    } finally {
      state.busy = false;
      state.loaded = true;
      mountEditorTray();
    }
  }

  function mountEditorTray() {
    if (state.drag) {
      state.renderAfterDrag = true;
      return;
    }

    if (!state.editorVisible) {
      removeTray();
      removeQualityDialog();
      return;
    }

    if (!state.tray) {
      state.tray = document.createElement('section');
      state.tray.className = 'onblide-ml-tray';
      document.body.appendChild(state.tray);
    }

    renderTray();
    renderQualityDialogRoot();
  }

  function getEditorStatus() {
    const item = state.context && state.context.item ? state.context.item : null;
    const page = state.context && state.context.page ? state.context.page : {};
    const candidates = item ? [] : page.itemCandidates || [];
    return {
      ok: true,
      isProductPage: isProductPageUrl(location.href),
      loaded: state.loaded,
      busy: state.busy,
      editorVisible: state.editorVisible,
      dirty: state.dirty,
      error: state.error || '',
      itemId: item && item.id ? item.id : candidates[0] || null,
      mode: state.context && state.context.mode ? state.context.mode : null,
      catalogListing: isCatalogListing(),
      selectedVariationId: state.selectedVariationId || null,
      url: location.href
    };
  }

  async function showEditor() {
    if (!isProductPageUrl(location.href)) return getEditorStatus();
    state.editorVisible = true;
    ensureFileInput();
    if (!state.loaded && !state.busy) {
      state.busy = true;
      state.message = 'Detectando anúncio...';
      rerenderTray();
      await requestPageContextReload('show');
    } else {
      rerenderTray();
    }
    return getEditorStatus();
  }

  function hideEditor() {
    state.editorVisible = false;
    removeTray();
    return getEditorStatus();
  }

  async function reloadEditor() {
    if (state.dirty) {
      return Object.assign(getEditorStatus(), {
        ok: false,
        error: 'Salve ou descarte antes de recarregar.'
      });
    }
    if (isProductPageUrl(location.href)) {
      state.editorVisible = true;
      ensureFileInput();
      state.busy = true;
      state.message = 'Recarregando...';
      rerenderTray();
      await requestPageContextReload('manual');
    }
    return getEditorStatus();
  }

  function renderTray() {
    if (!state.tray) return;

    const markup = buildTrayMarkup();
    if (markup === state.lastTrayMarkup) return;
    state.lastTrayMarkup = markup;
    state.tray.innerHTML = markup;
    bindTrayEvents();
  }

  function buildTrayMarkup() {
    if (!state.loaded && !state.context && !state.error) return '';

    if (!state.context) {
      return `
        <div class="onblide-ml-tray-bar">
          ${renderStatus()}
          <button class="onblide-ml-btn primary" data-action="connect" type="button">Conectar</button>
          <button class="onblide-ml-btn" data-action="reload" type="button">Recarregar</button>
        </div>
      `;
    }

    if (isPictureEditingBlocked()) {
      return `
        <div class="onblide-ml-tray-bar">
          ${renderStatus()}
          <button class="onblide-ml-btn" data-action="reload" type="button">Recarregar</button>
        </div>
      `;
    }

    const limitState = getPictureLimitState();

    return `
      <div class="onblide-ml-tray-modal-row">
        <button class="onblide-ml-expand" data-action="open-editor" type="button" title="Abrir editor completo" aria-label="Abrir editor completo">${icon('caretUp', 16)}</button>
      </div>
      ${renderTrayActions(limitState)}
      ${renderTrayFeedback(limitState)}
      <div class="onblide-ml-strip" aria-label="Editor de fotos do anuncio">
        ${state.draftPictures.map(renderPictureTile).join('')}
        ${renderUploadTile()}
      </div>
    `;
  }

  function renderStatus() {
    if (state.error) return `<div class="onblide-ml-status error">${escapeHtml(state.error)}</div>`;
    if (state.reloadCountdown) return `<div class="onblide-ml-status">Salvo. Atualizando em ${state.reloadCountdown}s.</div>`;
    const blockedMessage = getPictureEditingBlockedMessage();
    if (blockedMessage) return `<div class="onblide-ml-status muted">${escapeHtml(blockedMessage)}</div>`;
    const limitState = getPictureLimitState();
    if (limitState.message) return `<div class="onblide-ml-status error">${escapeHtml(limitState.message)}</div>`;
    if (state.message) return `<div class="onblide-ml-status">${escapeHtml(state.message)}</div>`;
    if (state.context && state.selectedVariationId) return '<div class="onblide-ml-status muted">Variação selecionada</div>';
    if (state.context) return '<div class="onblide-ml-status muted">Fotos do anúncio</div>';
    return '';
  }

  function renderTrayFeedback(limitState) {
    if (state.error) return `<div class="onblide-ml-tray-feedback error">${escapeHtml(state.error)}</div>`;
    if (state.reloadCountdown) {
      return `<div class="onblide-ml-tray-feedback">Salvo. Atualizando em ${state.reloadCountdown}s.</div>`;
    }
    if (state.dirty && limitState && limitState.message) {
      return `<div class="onblide-ml-tray-feedback error">${escapeHtml(limitState.message)}</div>`;
    }
    return '';
  }

  function renderTrayActions(limitState) {
    if (!state.dirty && !state.reloadCountdown) return '';
    return `
      <div class="onblide-ml-tray-actions">
        ${state.dirty ? `
          <button class="onblide-ml-btn primary compact" data-action="commit" type="button" ${state.busy || limitState.message ? 'disabled' : ''}>Salvar</button>
          <button class="onblide-ml-btn compact" data-action="discard" type="button" ${state.busy ? 'disabled' : ''}>Descartar</button>
        ` : ''}
        ${state.reloadCountdown ? `
          <button class="onblide-ml-btn primary compact" data-action="refresh" type="button">${icon('refresh', 14)}Atualizar agora</button>
        ` : ''}
      </div>
    `;
  }

  function getPictureLimitState() {
    const limits = state.context && state.context.pictureLimits ? state.context.pictureLimits : {};
    return PhotosModel.getPictureLimitState({
      limits,
      selectedVariationId: state.selectedVariationId,
      draftPictures: state.draftPictures,
      contextPictures: state.context ? state.context.pictures || [] : [],
      originalPictures: state.originalPictures
    });
  }

  function renderPictureTile(picture, index) {
    const url = picture.previewUrl || picture.secure_url || picture.url || picture.source || '';
    const quality = getPictureQuality(picture);
    const qualityClass = quality ? ` has-quality-${escapeAttribute(getQualityTone(quality))}` : '';
    return `
      <div class="onblide-ml-tile${qualityClass}" data-picture-id="${escapeAttribute(picture.localId)}" tabindex="0" role="button" aria-label="Foto ${index + 1}. Arraste para reordenar.">
        <img src="${escapeAttribute(url)}" alt="" draggable="false">
        <span class="onblide-ml-order">${index + 1}</span>
        ${renderPictureQualityBadge(picture, quality)}
        <button class="onblide-ml-remove" data-action="remove" data-picture-id="${escapeAttribute(picture.localId)}" type="button" aria-label="Remover foto">${icon('x', 13)}</button>
      </div>
    `;
  }

  function renderPictureQualityBadge(picture, quality) {
    if (!quality) return '';
    const resolution = quality.resolution || null;
    const tone = getQualityTone(quality);
    const label = resolution && resolution.available && resolution.score
      ? `${resolution.score}%`
      : '!';
    return `<button class="onblide-ml-quality-badge ${tone}" data-action="quality" data-picture-id="${escapeAttribute(picture.localId)}" title="${escapeAttribute(formatPictureQualityMessage(quality))}" type="button">${escapeHtml(label)}</button>`;
  }

  function renderUploadTile() {
    return `
      <div class="onblide-ml-upload" data-action="upload" tabindex="0" role="button">
        ${icon('upload', 18)}
        <span>Selecionar<br>ou arrastar</span>
      </div>
    `;
  }

  function renderQualityDialog() {
    const dialog = state.qualityDialog;
    if (!dialog) return '';
    if (dialog.mode === 'editor') return renderEditorDialog(dialog);
    if (dialog.mode === 'processing') return renderProcessingDialog(dialog);
    if (dialog.mode === 'result') return renderResultDialog(dialog);
    return renderReviewDialog(dialog);
  }

  function renderQualityDialogRoot() {
    const markup = renderQualityDialog();
    if (!markup) {
      removeQualityDialog();
      return;
    }
    if (!state.dialogRoot) {
      state.dialogRoot = document.createElement('div');
      state.dialogRoot.className = 'onblide-ml-dialog-root';
      document.body.appendChild(state.dialogRoot);
    }
    if (markup === state.lastDialogMarkup) return;
    state.lastDialogMarkup = markup;
    state.dialogRoot.innerHTML = markup;
    bindQualityDialogEvents();
    syncProcessingProgress();
  }

  function syncProcessingProgress() {
    if (!state.dialogRoot) return;
    state.dialogRoot.querySelectorAll('[data-progress-percent]').forEach((bar) => {
      const percent = Math.max(0, Math.min(100, Number(bar.dataset.progressPercent || 0)));
      bar.style.width = `${percent}%`;
    });
  }

  function renderEditorDialog(dialog) {
    const limitState = getPictureLimitState();
    const counts = getCurrentQualityCounts();
    return `
      <div class="onblide-ml-modal-backdrop">
        <section class="onblide-ml-modal editor" role="dialog" aria-modal="true" aria-label="Editor completo de fotos">
          <div class="onblide-ml-modal-head">
            <div>
              <div class="onblide-ml-modal-brand">OnFrame</div>
              <h2>Editor de fotos</h2>
            </div>
            <button class="onblide-ml-icon-btn" data-action="close-quality-dialog" type="button" aria-label="Fechar">${icon('x', 18)}</button>
          </div>
          ${renderEditorAlerts(dialog, limitState)}
          <div class="onblide-ml-editor-top">
            <div class="onblide-ml-editor-stats">
              <span class="onblide-ml-editor-stat">
                <small>Escopo</small>
                <strong>${state.selectedVariationId ? 'Variação' : 'Anúncio'}</strong>
              </span>
              <span class="onblide-ml-editor-stat${limitState.message ? ' error' : ''}">
                <small>Fotos</small>
                <strong>${escapeHtml(limitState.counterText || `${state.draftPictures.length} fotos`)}</strong>
              </span>
              <span class="onblide-ml-editor-stat${counts.belowIdeal ? ' warn' : ''}">
                <small>Dimensão</small>
                <strong>${escapeHtml(formatQualityCountLabel(counts))}</strong>
              </span>
            </div>
            <div class="onblide-ml-editor-actions">
              <button class="onblide-ml-btn primary compact" data-action="open-optimize" type="button" ${state.busy || limitState.message || !counts.optimizable ? 'disabled' : ''}>${icon('upload', 14)}Otimizar fotos</button>
              <button class="onblide-ml-btn primary compact" data-action="commit" type="button" ${state.busy || !state.dirty || limitState.message ? 'disabled' : ''}>Salvar</button>
              <button class="onblide-ml-btn compact" data-action="discard" type="button" ${state.busy || !state.dirty ? 'disabled' : ''}>Descartar</button>
              ${state.reloadCountdown ? `<button class="onblide-ml-btn primary compact" data-action="refresh" type="button">${icon('refresh', 14)}Atualizar agora</button>` : ''}
            </div>
          </div>
          <div class="onblide-ml-editor-strip-shell">
            <div class="onblide-ml-strip onblide-ml-modal-strip" aria-label="Editor completo de fotos do anuncio">
              ${state.draftPictures.map(renderPictureTile).join('')}
              ${renderUploadTile()}
            </div>
          </div>
          <div class="onblide-ml-editor-diagnostics-head">
            <strong>Dimensões</strong>
            <button class="onblide-ml-link-btn" data-action="reload-quality" type="button" ${state.qualityLoading ? 'disabled' : ''}>Atualizar análise</button>
          </div>
          <div class="onblide-ml-editor-diagnostics">
            ${renderEditorDiagnostics()}
          </div>
          <div class="onblide-ml-modal-foot">
            <button class="onblide-ml-btn" data-action="close-quality-dialog" type="button">Fechar</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderEditorAlerts(dialog, limitState) {
    if (dialog && dialog.error) return `<div class="onblide-ml-dialog-error">${escapeHtml(dialog.error)}</div>`;
    if (state.error) return `<div class="onblide-ml-dialog-error">${escapeHtml(state.error)}</div>`;
    if (limitState && limitState.message) return `<div class="onblide-ml-dialog-error">${escapeHtml(limitState.message)}</div>`;
    if (state.reloadCountdown) return `<div class="onblide-ml-dialog-note">Salvo. Atualizando em ${state.reloadCountdown}s.</div>`;
    if (dialog && dialog.notice) return `<div class="onblide-ml-dialog-note">${escapeHtml(dialog.notice)}</div>`;
    return '';
  }

  function renderEditorDiagnostics() {
    if (state.qualityLoading) return '<div class="onblide-ml-editor-empty">Analisando...</div>';
    if (state.qualityError) return `<div class="onblide-ml-editor-empty">${escapeHtml(state.qualityError)}</div>`;
    if (!state.draftPictures.length) return '<div class="onblide-ml-editor-empty">Nenhuma foto no rascunho.</div>';
    return state.draftPictures.map(renderEditorDiagnosticItem).join('');
  }

  function renderEditorDiagnosticItem(picture, index) {
    const url = picture.previewUrl || picture.secure_url || picture.url || picture.source || '';
    const quality = getPictureQuality(picture);
    const resolution = quality && quality.resolution ? quality.resolution : null;
    const tone = quality ? getQualityTone(quality) : 'muted';
    return `
      <article class="onblide-ml-diagnostic-card ${tone}">
        <img src="${escapeAttribute(url)}" alt="">
        <div class="onblide-ml-diagnostic-main">
          <strong>Imagem ${index + 1}</strong>
          <span>${escapeHtml(formatPictureDimensions(picture, resolution))}</span>
        </div>
        <span class="onblide-ml-score ${getResolutionTone(resolution)}">${escapeHtml(formatScore(resolution))}</span>
        <span class="onblide-ml-diagnostic-state">${escapeHtml(formatQualityStateLabel(quality))}</span>
      </article>
    `;
  }

  function formatQualityCountLabel(counts) {
    if (state.qualityLoading) return 'Analisando';
    if (counts.belowIdeal) return `${counts.belowIdeal} abaixo`;
    if (counts.unknown) return `${counts.unknown} sem leitura`;
    if (!state.quality && !Object.keys(state.qualityOverrides).length) return 'Sem leitura';
    return 'OK';
  }

  function renderReviewDialog(dialog) {
    const items = Array.isArray(dialog.items) ? dialog.items : [];
    const selectedCount = items.filter((item) => item.selected).length;
    return `
      <div class="onblide-ml-modal-backdrop">
        <section class="onblide-ml-modal" role="dialog" aria-modal="true" aria-label="Otimizar imagens">
          <div class="onblide-ml-modal-head">
            <div>
              <div class="onblide-ml-modal-brand">OnFrame</div>
              <h2>Otimizar imagens?</h2>
            </div>
            <button class="onblide-ml-icon-btn" data-action="close-quality-dialog" type="button" aria-label="Fechar">${icon('x', 18)}</button>
          </div>
          <p class="onblide-ml-modal-copy">Redimensiona para 1200px no lado maior e envia ao Mercado Livre.</p>
          ${dialog.error ? `<div class="onblide-ml-dialog-error">${escapeHtml(dialog.error)}</div>` : ''}
          <div class="onblide-ml-selection-bar">
            <strong>${selectedCount}</strong> de ${items.length} selecionadas
            <button data-action="${selectedCount === items.length ? 'clear-optimize' : 'select-all-optimize'}" type="button">${selectedCount === items.length ? 'Desmarcar todas' : 'Selecionar todas'}</button>
          </div>
          <div class="onblide-ml-review-list">
            ${items.map(renderOptimizeReviewItem).join('')}
          </div>
          <div class="onblide-ml-modal-foot">
            <button class="onblide-ml-btn" data-action="close-quality-dialog" type="button">Cancelar</button>
            <button class="onblide-ml-btn success" data-action="confirm-optimize" type="button" ${selectedCount ? '' : 'disabled'}>${icon('checkCircle', 14)}Confirmar e salvar (${selectedCount})</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderOptimizeReviewItem(item, index) {
    const resolution = item.resolution || {};
    return `
      <label class="onblide-ml-review-item">
        <input data-action="toggle-optimize" data-picture-id="${escapeAttribute(item.localId)}" type="checkbox" ${item.selected ? 'checked' : ''}>
        <div class="onblide-ml-review-info">
          <strong>Imagem ${index + 1}</strong>
          <span>${escapeHtml(formatDimensions(resolution))} -> ${escapeHtml(formatOptimizedDimensions(resolution))}</span>
        </div>
        <div class="onblide-ml-review-preview">
          <img src="${escapeAttribute(item.url)}" alt="">
          <span>${icon('refresh', 14)}</span>
          <img src="${escapeAttribute(item.url)}" alt="">
        </div>
        <span class="onblide-ml-score ${getResolutionTone(resolution)}">${escapeHtml(formatScore(resolution))}</span>
      </label>
    `;
  }

  function renderProcessingDialog(dialog) {
    const total = Number(dialog.total || 0);
    const processed = Number(dialog.processed || 0);
    const percent = total ? Math.round((processed / total) * 100) : 0;
    return `
      <div class="onblide-ml-modal-backdrop">
        <section class="onblide-ml-modal small" role="dialog" aria-modal="true" aria-label="Otimizando imagens">
          <div class="onblide-ml-processing">
            <div class="onblide-ml-spinner"></div>
            <div>
              <h2>Otimizando imagens...</h2>
              <p>${escapeHtml(dialog.progressText || 'Aguarde alguns instantes')}</p>
            </div>
          </div>
          <div class="onblide-ml-progress"><span data-progress-percent="${escapeAttribute(percent)}"></span></div>
        </section>
      </div>
    `;
  }

  function renderResultDialog(dialog) {
    const results = Array.isArray(dialog.results) ? dialog.results : [];
    return `
      <div class="onblide-ml-modal-backdrop">
        <section class="onblide-ml-modal result" role="dialog" aria-modal="true" aria-label="Imagens otimizadas">
          <div class="onblide-ml-modal-head">
            <div>
              <div class="onblide-ml-modal-brand">OnFrame</div>
              <h2>Imagens otimizadas</h2>
            </div>
            <button class="onblide-ml-icon-btn" data-action="close-quality-dialog" type="button" aria-label="Fechar">${icon('x', 18)}</button>
          </div>
          <p class="onblide-ml-modal-copy">Fotos enviadas. O Mercado Livre pode levar alguns minutos para exibir.</p>
          <div class="onblide-ml-result-list">
            ${results.map(renderOptimizeResultItem).join('')}
          </div>
          <div class="onblide-ml-modal-foot">
            <button class="onblide-ml-btn" data-action="close-quality-dialog" type="button">Fechar</button>
            <button class="onblide-ml-btn primary" data-action="refresh" type="button">${icon('refresh', 14)}Atualizar agora</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderOptimizeResultItem(result, index) {
    return `
      <div class="onblide-ml-result-item">
        <strong>Imagem ${index + 1}</strong>
        <div class="onblide-ml-result-grid">
          <figure>
            <img src="${escapeAttribute(result.beforeUrl)}" alt="">
            <figcaption>Original · ${escapeHtml(formatDimensions(result.originalDimensions))}</figcaption>
            <span class="onblide-ml-score warn">${escapeHtml(result.beforeScore ? `${result.beforeScore}%` : '')}</span>
          </figure>
          <figure class="ok">
            <img src="${escapeAttribute(result.afterUrl)}" alt="">
            <figcaption>Otimizada · ${escapeHtml(formatDimensions(result.optimizedDimensions))}</figcaption>
            <span class="onblide-ml-score ok">100%</span>
          </figure>
        </div>
      </div>
    `;
  }

  function bindTrayEvents() {
    bindCommonActionEvents(state.tray);
    bindPictureEditorEvents(state.tray);
  }

  function bindQualityDialogEvents() {
    if (!state.dialogRoot) return;
    bindCommonActionEvents(state.dialogRoot);
    bindPictureEditorEvents(state.dialogRoot);
    state.dialogRoot.querySelectorAll('[data-action="close-quality-dialog"]').forEach((button) => {
      button.addEventListener('click', closeQualityDialog);
    });
    state.dialogRoot.querySelectorAll('[data-action="select-all-optimize"]').forEach((button) => {
      button.addEventListener('click', () => setAllOptimizeSelection(true));
    });
    state.dialogRoot.querySelectorAll('[data-action="clear-optimize"]').forEach((button) => {
      button.addEventListener('click', () => setAllOptimizeSelection(false));
    });
    state.dialogRoot.querySelectorAll('[data-action="toggle-optimize"]').forEach((input) => {
      input.addEventListener('change', () => toggleOptimizeSelection(input.dataset.pictureId, input.checked));
    });
    state.dialogRoot.querySelectorAll('[data-action="confirm-optimize"]').forEach((button) => {
      button.addEventListener('click', () => void confirmOptimizeDialog());
    });
  }

  function bindCommonActionEvents(container) {
    container.querySelectorAll('[data-action="connect"]').forEach((button) => {
      button.addEventListener('click', () => void startAuth());
    });
    container.querySelectorAll('[data-action="reload"]').forEach((button) => {
      button.addEventListener('click', () => void reloadEditor());
    });
    container.querySelectorAll('[data-action="commit"]').forEach((button) => {
      button.addEventListener('click', () => void commit());
    });
    container.querySelectorAll('[data-action="discard"]').forEach((button) => {
      button.addEventListener('click', discardDraft);
    });
    container.querySelectorAll('[data-action="refresh"]').forEach((button) => {
      button.addEventListener('click', refreshNow);
    });
    container.querySelectorAll('[data-action="reload-quality"]').forEach((button) => {
      button.addEventListener('click', () => void loadPictureQuality());
    });
    container.querySelectorAll('[data-action="open-optimize"]').forEach((button) => {
      button.addEventListener('click', openOptimizeDialog);
    });
    container.querySelectorAll('[data-action="open-editor"]').forEach((button) => {
      button.addEventListener('click', openEditorDialog);
    });
  }

  function bindPictureEditorEvents(container) {
    container.querySelectorAll('[data-action="remove"]').forEach((button) => {
      button.addEventListener('click', () => removePicture(button.dataset.pictureId));
    });
    container.querySelectorAll('[data-action="quality"]').forEach((button) => {
      button.addEventListener('click', () => showPictureQuality(button.dataset.pictureId));
    });
    container.querySelectorAll('[data-action="upload"]').forEach((upload) => {
      upload.addEventListener('click', () => state.fileInput.click());
      upload.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          state.fileInput.click();
        }
      });
      upload.addEventListener('dragover', (event) => {
        event.preventDefault();
        upload.classList.add('is-dragover');
      });
      upload.addEventListener('dragleave', () => upload.classList.remove('is-dragover'));
      upload.addEventListener('drop', (event) => {
        event.preventDefault();
        upload.classList.remove('is-dragover');
        void addPendingFiles(event.dataTransfer.files);
      });
    });

    container.querySelectorAll('.onblide-ml-tile').forEach((tile) => {
      tile.addEventListener('dragstart', (event) => event.preventDefault());
      tile.addEventListener('pointerdown', (event) => beginPictureDrag(event, tile));
      tile.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          movePictureByKeyboard(tile.dataset.pictureId, -1);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          movePictureByKeyboard(tile.dataset.pictureId, 1);
        }
      });
    });
  }

  function beginPictureDrag(event, tile) {
    if (event.button !== 0 || state.busy || isPictureEditingBlocked() || event.target.closest('[data-action]')) return;
    const strip = tile.closest('.onblide-ml-strip');
    if (!strip) return;

    event.preventDefault();
    const onMove = (moveEvent) => movePictureDrag(moveEvent);
    const onEnd = (endEvent) => finishPictureDrag(endEvent);
    const onCancel = (cancelEvent) => finishPictureDrag(cancelEvent, true);
    const rect = tile.getBoundingClientRect();

    state.drag = {
      id: tile.dataset.pictureId,
      pointerId: event.pointerId,
      tile,
      strip,
      lastX: event.clientX,
      lastY: event.clientY,
      translateX: 0,
      translateY: 0,
      reordered: false,
      onMove,
      onEnd,
      onCancel
    };
    state.draggingId = state.drag.id;
    tile.style.width = `${rect.width}px`;
    tile.style.height = `${rect.height}px`;
    tile.classList.add('is-dragging');
    strip.classList.add('is-sorting');
    tile.setPointerCapture(event.pointerId);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
    window.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onCancel);
  }

  function movePictureDrag(event) {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    drag.translateX += event.clientX - drag.lastX;
    drag.translateY += event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    applyDragTransform(drag);
    reorderPictureDuringDrag(event.clientX);
  }

  function finishPictureDrag(event, cancelled = false) {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    document.removeEventListener('pointermove', drag.onMove);
    document.removeEventListener('pointerup', drag.onEnd);
    window.removeEventListener('pointerup', drag.onEnd);
    document.removeEventListener('pointercancel', drag.onCancel);
    try {
      drag.tile.releasePointerCapture(drag.pointerId);
    } catch (e) {
      // Pointer capture can already be released by the browser.
    }
    drag.tile.classList.remove('is-dragging');
    drag.strip.classList.remove('is-sorting');
    drag.tile.style.transform = '';
    drag.tile.style.width = '';
    drag.tile.style.height = '';
    state.drag = null;
    state.draggingId = null;
    if (!cancelled && drag.reordered) markDirty('Ordem alterada.');
    if (state.renderAfterDrag) {
      state.renderAfterDrag = false;
      rerenderTray();
    }
  }

  function applyDragTransform(drag) {
    drag.tile.style.transform = `translate3d(${drag.translateX}px, ${drag.translateY}px, 0) scale(1.04)`;
  }

  function reorderPictureDuringDrag(clientX) {
    const drag = state.drag;
    if (!drag) return;
    const ordered = Array.from(drag.strip.querySelectorAll('.onblide-ml-tile'));
    const currentIndex = ordered.indexOf(drag.tile);
    if (currentIndex < 0) return;

    let targetIndex = currentIndex;
    for (const tile of ordered) {
      if (tile === drag.tile) continue;
      const rect = tile.getBoundingClientRect();
      const tileIndex = ordered.indexOf(tile);
      const crossedLeft = tileIndex < currentIndex && clientX < rect.left + rect.width / 2;
      const crossedRight = tileIndex > currentIndex && clientX > rect.left + rect.width / 2;
      if (crossedLeft || crossedRight) targetIndex = tileIndex;
    }

    if (targetIndex === currentIndex) return;
    animateReorder(drag.strip, () => {
      const reference = ordered[targetIndex];
      if (targetIndex > currentIndex) drag.strip.insertBefore(drag.tile, reference.nextSibling);
      else drag.strip.insertBefore(drag.tile, reference);
      moveDraftPicture(drag.id, targetIndex);
      drag.reordered = true;
    });
  }

  function animateReorder(strip, mutate) {
    const drag = state.drag;
    const tiles = Array.from(strip.querySelectorAll('.onblide-ml-tile'));
    const firstRects = new Map(tiles.map((tile) => [tile, tile.getBoundingClientRect()]));
    const dragVisualRect = drag ? drag.tile.getBoundingClientRect() : null;
    if (drag) drag.tile.style.transform = '';

    mutate();

    if (drag && dragVisualRect) {
      const dragLayoutRect = drag.tile.getBoundingClientRect();
      drag.translateX = dragVisualRect.left - dragLayoutRect.left;
      drag.translateY = dragVisualRect.top - dragLayoutRect.top;
      applyDragTransform(drag);
    }

    for (const tile of tiles) {
      if (drag && tile === drag.tile) continue;
      const first = firstRects.get(tile);
      const last = tile.getBoundingClientRect();
      if (!first) continue;
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (!dx && !dy) continue;
      tile.style.transition = 'none';
      tile.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      requestAnimationFrame(() => {
        tile.style.transition = 'transform 160ms var(--ob-ease)';
        tile.style.transform = '';
      });
      tile.addEventListener('transitionend', () => {
        tile.style.transition = '';
        tile.style.transform = '';
      }, { once: true });
    }
  }

  async function loadPictureQuality() {
    if (!state.context || !state.context.item || isPictureEditingBlocked()) return;
    const itemId = state.context.item && state.context.item.id ? state.context.item.id : '';
    if (!itemId) return;
    const variationId = state.selectedVariationId || '';
    const requestId = state.qualityRequestId + 1;
    state.qualityRequestId = requestId;
    state.qualityLoading = true;
    state.qualityError = '';
    rerenderTray();

    try {
      const quality = await api(itemApiPath(itemId, '/pictures/quality', {
        variation_id: variationId
      }));
      if (!isActiveQualityRequest(requestId, itemId, variationId)) return;
      state.quality = quality;
      state.qualityError = '';
    } catch (err) {
      if (!isActiveQualityRequest(requestId, itemId, variationId)) return;
      state.quality = null;
      state.qualityError = 'Análise indisponível';
      console.warn('[OnFrame] qualidade de fotos:', err && (err.technicalError || err.message || err));
    } finally {
      if (isActiveQualityRequest(requestId, itemId, variationId)) {
        state.qualityLoading = false;
        rerenderTray();
      }
    }
  }

  function isActiveQualityRequest(requestId, itemId, variationId) {
    return state.qualityRequestId === requestId
      && state.context
      && state.context.item
      && String(state.context.item.id || '') === String(itemId || '')
      && String(state.selectedVariationId || '') === String(variationId || '');
  }

  function showPictureQuality(localId) {
    const picture = state.draftPictures.find((candidate) => candidate.localId === localId);
    const quality = picture ? getPictureQuality(picture) : null;
    if (!quality) return;
    if (state.qualityDialog && state.qualityDialog.mode === 'editor') {
      state.qualityDialog = Object.assign({}, state.qualityDialog, {
        notice: formatPictureQualityMessage(quality),
        error: ''
      });
    } else {
      state.message = formatPictureQualityMessage(quality);
    }
    state.error = '';
    rerenderTray();
  }

  async function startAuth() {
    try {
      state.busy = true;
      state.message = 'Abrindo autorização...';
      state.error = '';
      rerenderTray();
      const result = await api('/auth/start', { method: 'POST', body: '{}' });
      window.open(result.authUrl, '_blank', 'noopener,noreferrer');
      state.message = 'Autorize e recarregue.';
    } catch (err) {
      state.error = toUserError(err);
      state.message = '';
    } finally {
      state.busy = false;
      rerenderTray();
    }
  }

  async function addPendingFiles(files) {
    if (!files || !files.length || !state.context || state.busy || isPictureEditingBlocked()) return;
    state.busy = true;
    state.message = 'Preparando imagens...';
    state.error = '';
    rerenderTray();

    try {
      const accepted = Array.from(files).filter((file) => /^image\/(jpeg|png)$/i.test(file.type));
      if (!accepted.length) throw new Error('Use PNG ou JPG.');
      const added = [];

      for (const file of accepted) {
        const previewUrl = await readFileAsDataUrl(file);
        const picture = {
          localId: makeLocalId(),
          pending: true,
          filename: file.name,
          mimeType: file.type,
          base64: previewUrl,
          previewUrl
        };
        state.draftPictures.push(picture);
        added.push(picture);
      }
      markDirty('Fotos adicionadas.');
      for (const picture of added) void measureDraftPicture(picture);
    } catch (err) {
      state.error = toUserError(err);
      state.message = '';
    } finally {
      state.busy = false;
      rerenderTray();
    }
  }

  function openEditorDialog() {
    if (!state.context || isPictureEditingBlocked()) return;
    state.qualityDialog = {
      mode: 'editor',
      error: '',
      notice: ''
    };
    rerenderTray();
  }

  function openOptimizeDialog() {
    if (!state.context || state.busy || isPictureEditingBlocked()) return;
    const items = getOptimizablePictures();
    if (!items.length) {
      if (state.qualityDialog && state.qualityDialog.mode === 'editor') {
        state.qualityDialog = Object.assign({}, state.qualityDialog, {
          notice: 'Nada para otimizar.',
          error: ''
        });
      } else {
        state.message = 'Nada para otimizar.';
      }
      state.error = '';
      rerenderTray();
      return;
    }
    state.qualityDialog = {
      mode: 'review',
      items,
      error: '',
      processed: 0,
      total: items.length,
      results: []
    };
    rerenderTray();
  }

  function closeQualityDialog() {
    if (state.busy && state.qualityDialog && state.qualityDialog.mode === 'processing') return;
    state.qualityDialog = null;
    rerenderTray();
  }

  function setAllOptimizeSelection(selected) {
    if (!state.qualityDialog || state.qualityDialog.mode !== 'review') return;
    state.qualityDialog.items = state.qualityDialog.items.map((item) => Object.assign({}, item, { selected }));
    rerenderTray();
  }

  function toggleOptimizeSelection(localId, selected) {
    if (!state.qualityDialog || state.qualityDialog.mode !== 'review') return;
    state.qualityDialog.items = state.qualityDialog.items.map((item) => (
      item.localId === localId ? Object.assign({}, item, { selected }) : item
    ));
    rerenderTray();
  }

  async function confirmOptimizeDialog() {
    if (!state.context || state.busy || isPictureEditingBlocked() || !state.qualityDialog) return;
    const selectedItems = state.qualityDialog.items.filter((item) => item.selected);
    if (!selectedItems.length) return;

    const itemId = state.context.item.id;
    const total = selectedItems.length;
    const results = [];
    startOptimizeProcessing(total, results);

    try {
      for (let index = 0; index < selectedItems.length; index += 1) {
        await optimizeSelectedPicture(itemId, selectedItems[index], index, total, results);
      }

      const finalSelectedPictures = await prepareFinalSelectedPictures();
      await commitFinalSelectedPictures(finalSelectedPictures);
      finishOptimizeProcessing(results, total);
    } catch (err) {
      showOptimizeError(err);
    }
  }

  function startOptimizeProcessing(total, results) {
    state.busy = true;
    state.message = '';
    state.error = '';
    state.qualityDialog = Object.assign({}, state.qualityDialog, {
      mode: 'processing',
      processed: 0,
      total,
      progressText: 'Preparando imagens...',
      results
    });
    rerenderTray();
  }

  async function optimizeSelectedPicture(itemId, selectedItem, index, total, results) {
    updateOptimizeProgress(index, total, `Otimizando ${index + 1}/${total}`);

    const pictureIndex = state.draftPictures.findIndex((picture) => picture.localId === selectedItem.localId);
    if (pictureIndex < 0) return;
    const picture = state.draftPictures[pictureIndex];
    if (!picture.id) return;

    const source = await api(itemApiPath(itemId, '/pictures/fix-size'), {
      method: 'POST',
      body: JSON.stringify({ pictureId: picture.id })
    });
    const resized = await resizeImageToLongSide(source.base64, 1200);
    const uploaded = await uploadOptimizedPicture(itemId, picture, source, resized);
    const optimizedDimensions = {
      width: resized.width,
      height: resized.height,
      source: 'optimized'
    };
    const originalDimensions = source.originalDimensions || selectedItem.resolution || null;

    replaceDraftWithOptimizedPicture({
      picture,
      pictureIndex,
      uploaded,
      resized,
      originalDimensions,
      optimizedDimensions
    });
    results.push(buildOptimizeResult({
      picture,
      selectedItem,
      uploaded,
      resized,
      originalDimensions,
      optimizedDimensions
    }));
    updateOptimizeProgress(index + 1, total, `Enviada ${index + 1}/${total}`);
  }

  async function uploadOptimizedPicture(itemId, picture, source, resized) {
    return api(itemApiPath(itemId, '/pictures/upload'), {
      method: 'POST',
      body: JSON.stringify({
        filename: source.filename || `${picture.id}-onframe.jpg`,
        mimeType: resized.mimeType,
        base64: resized.base64
      })
    });
  }

  function replaceDraftWithOptimizedPicture({ picture, pictureIndex, uploaded, resized, originalDimensions, optimizedDimensions }) {
    const nextPicture = Object.assign({}, uploaded, {
      localId: picture.localId,
      pending: false,
      previewUrl: resized.base64,
      optimizedFromId: picture.id,
      originalDimensions,
      optimizedDimensions
    });
    state.draftPictures.splice(pictureIndex, 1, nextPicture);
    state.qualityOverrides[picture.localId] = buildOptimizedQualityOverride(uploaded.id, pictureIndex, optimizedDimensions);
  }

  function buildOptimizeResult({ picture, selectedItem, uploaded, resized, originalDimensions, optimizedDimensions }) {
    return {
      localId: picture.localId,
      beforeUrl: selectedItem.url,
      afterUrl: resized.base64,
      originalDimensions,
      optimizedDimensions,
      beforeScore: selectedItem.resolution && selectedItem.resolution.score ? selectedItem.resolution.score : null,
      uploadedId: uploaded.id || null
    };
  }

  function finishOptimizeProcessing(results, total) {
    state.qualityDialog = {
      mode: 'result',
      results,
      processed: results.length,
      total
    };
    startReloadCountdown();
  }

  function showOptimizeError(err) {
    state.busy = false;
    state.qualityDialog = Object.assign({}, state.qualityDialog || {}, {
      mode: 'review',
      error: toUserError(err)
    });
    rerenderTray();
  }

  function updateOptimizeProgress(processed, total, progressText) {
    if (!state.qualityDialog) return;
    state.qualityDialog = Object.assign({}, state.qualityDialog, {
      processed,
      total,
      progressText
    });
    rerenderTray();
  }

  async function measureDraftPicture(picture) {
    if (!state.context || !picture || !picture.base64) return;
    const itemId = state.context.item.id;
    const localId = picture.localId;
    const sourceBase64 = picture.base64;
    const role = pictureRoleForIndex(state.draftPictures.findIndex((candidate) => candidate.localId === localId));
    try {
      const dimensions = await readImageDimensions(picture.base64);
      const current = state.draftPictures.find((candidate) => candidate.localId === localId);
      if (!state.context || !state.context.item || state.context.item.id !== itemId || !current || current.base64 !== sourceBase64) return;
      state.qualityOverrides[localId] = qualityFromDimensions({
        pictureId: picture.id || null,
        role,
        dimensions,
        allowOptimize: false
      });
      rerenderTray();
    } catch (err) {
      const current = state.draftPictures.find((candidate) => candidate.localId === localId);
      if (!state.context || !state.context.item || state.context.item.id !== itemId || !current || current.base64 !== sourceBase64) return;
      state.qualityOverrides[localId] = {
        pictureId: picture.id || null,
        role,
        status: 'unknown',
        canFixSize: false,
        canOptimize: false,
        message: 'Sem leitura de dimensão.'
      };
      rerenderTray();
    }
  }

  async function commit() {
    if (!state.context || state.busy || !state.dirty || isPictureEditingBlocked()) return;
    const limitState = getPictureLimitState();
    if (limitState.message) {
      state.error = limitState.message;
      state.message = '';
      rerenderTray();
      return;
    }
    state.busy = true;
    state.message = 'Salvando...';
    state.error = '';
    rerenderTray();

    try {
      const finalSelectedPictures = await prepareFinalSelectedPictures();
      await commitFinalSelectedPictures(finalSelectedPictures);
      startReloadCountdown();
    } catch (err) {
      state.error = toUserError(err);
      state.message = '';
      state.busy = false;
      rerenderTray();
    }
  }

  async function prepareFinalSelectedPictures() {
    const finalSelectedPictures = [];

    for (const picture of state.draftPictures) {
      if (picture.pending) {
        const uploaded = await api(itemApiPath(state.context.item.id, '/pictures/upload'), {
          method: 'POST',
          body: JSON.stringify({
            filename: picture.filename || 'picture.jpg',
            mimeType: picture.mimeType || 'image/jpeg',
            base64: picture.base64 || ''
          })
        });
        finalSelectedPictures.push(Object.assign({}, uploaded, {
          localId: picture.localId,
          pending: false,
          previewUrl: picture.previewUrl || picture.base64 || uploaded.secure_url || uploaded.url || ''
        }));
      } else {
        finalSelectedPictures.push(picture);
      }
    }

    return finalSelectedPictures;
  }

  async function commitFinalSelectedPictures(finalSelectedPictures) {
    const selectedIds = finalSelectedPictures.map((picture) => picture.id).filter(Boolean);
    const variations = buildVariationPayload(selectedIds);
    const pictures = buildItemPicturesPayload(finalSelectedPictures, variations);

    await api(itemApiPath(state.context.item.id, '/pictures/commit'), {
      method: 'POST',
      body: JSON.stringify({ pictures, variations })
    });

    state.draftPictures = finalSelectedPictures.map((picture) => Object.assign({}, picture, { pending: false }));
  }

  function buildVariationPayload(selectedIds) {
    return PhotosModel.buildVariationPayload(state.variations, state.selectedVariationId, selectedIds);
  }

  function buildItemPicturesPayload(finalSelectedPictures, variations) {
    return PhotosModel.buildItemPicturesPayload({
      contextPictures: state.context ? state.context.pictures || [] : [],
      finalSelectedPictures,
      variations,
      originalPictures: state.originalPictures
    });
  }

  function estimateFinalItemPictureCount() {
    return PhotosModel.estimateFinalItemPictureCount({
      contextPictures: state.context ? state.context.pictures || [] : [],
      draftPictures: state.draftPictures,
      originalPictures: state.originalPictures
    });
  }

  function createPictureSelectionSnapshot(selectedPictures) {
    return PhotosModel.createPictureSelectionSnapshot(state.originalPictures, selectedPictures);
  }

  function pictureId(picture) {
    return PhotosModel.pictureId(picture);
  }

  function itemApiPath(itemId, suffix, params = {}) {
    const query = new URLSearchParams();
    if (state.ownerUserId) query.set('owner_user_id', String(state.ownerUserId));
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    const search = query.toString();
    return `/api/items/${encodeURIComponent(itemId)}${suffix}${search ? `?${search}` : ''}`;
  }

  function discardDraft() {
    if (state.reloadTimer) clearInterval(state.reloadTimer);
    state.reloadTimer = null;
    state.reloadCountdown = 0;
    const blockedPageSignature = state.blockedPageSignature;
    state.blockedPageSignature = '';
    state.draftPictures = state.originalPictures.map(clonePicture);
    state.variations = cloneVariations(state.originalVariations);
    state.dirty = false;
    state.error = '';
    state.message = '';
    rerenderTray();
    if (blockedPageSignature && blockedPageSignature !== state.loadedPageSignature) {
      const pending = state.pendingPageContext;
      state.pendingPageContext = null;
      if (pending) handlePageContextChange(pending);
      else void requestPageContextReload('discard');
    }
  }

  function removePicture(localId) {
    if (state.busy || isPictureEditingBlocked()) return;
    const index = state.draftPictures.findIndex((picture) => picture.localId === localId);
    if (index < 0) return;
    state.draftPictures.splice(index, 1);
    markDirty('Foto removida.');
  }

  function movePictureByKeyboard(localId, direction) {
    if (state.busy || isPictureEditingBlocked()) return;
    const currentIndex = state.draftPictures.findIndex((picture) => picture.localId === localId);
    if (currentIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(state.draftPictures.length - 1, currentIndex + direction));
    if (targetIndex === currentIndex) return;
    moveDraftPicture(localId, targetIndex);
    markDirty('Ordem alterada.');
    requestAnimationFrame(() => {
      const rootNode = state.dialogRoot || state.tray;
      const tile = rootNode && Array.from(rootNode.querySelectorAll('.onblide-ml-tile'))
        .find((candidate) => candidate.dataset.pictureId === localId);
      if (tile) tile.focus();
    });
  }

  function moveDraftPicture(localId, targetIndex) {
    const sourceIndex = state.draftPictures.findIndex((picture) => picture.localId === localId);
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= state.draftPictures.length || sourceIndex === targetIndex) return false;
    const [moved] = state.draftPictures.splice(sourceIndex, 1);
    state.draftPictures.splice(targetIndex, 0, moved);
    return true;
  }

  function markDirty(message) {
    if (isPictureEditingBlocked()) return;
    state.dirty = true;
    state.reloadCountdown = 0;
    state.message = message;
    state.error = '';
    if (state.qualityDialog && state.qualityDialog.mode === 'editor') {
      state.qualityDialog = Object.assign({}, state.qualityDialog, { error: '', notice: '' });
    }
    rerenderTray();
  }

  function rerenderTray() {
    state.lastTrayMarkup = '';
    mountEditorTray();
  }

  function startReloadCountdown() {
    if (state.reloadTimer) clearInterval(state.reloadTimer);
    state.busy = false;
    state.dirty = false;
    state.error = '';
    state.message = '';
    state.reloadCountdown = 8;
    rerenderTray();
    state.reloadTimer = setInterval(() => {
      state.reloadCountdown -= 1;
      if (state.reloadCountdown <= 0) {
        refreshNow();
        return;
      }
      rerenderTray();
    }, 1000);
  }

  function refreshNow() {
    if (state.reloadTimer) clearInterval(state.reloadTimer);
    state.reloadTimer = null;
    state.reloadCountdown = 0;
    location.reload();
  }

  function getPictureQuality(picture) {
    if (!picture) return null;
    if (state.qualityOverrides[picture.localId]) return state.qualityOverrides[picture.localId];
    const list = state.quality && Array.isArray(state.quality.pictures) ? state.quality.pictures : [];
    return list.find((quality) => String(quality.pictureId || '') === String(picture.id || '')) || null;
  }

  function getCurrentQualityCounts() {
    const counts = {
      total: state.draftPictures.length,
      belowIdeal: 0,
      unknown: 0,
      optimizable: 0
    };

    for (const picture of state.draftPictures) {
      const quality = getPictureQuality(picture);
      if (!quality) continue;
      const resolution = quality.resolution || null;
      if (resolution && resolution.belowIdeal) counts.belowIdeal += 1;
      if (quality.status === 'unknown') counts.unknown += 1;
      if (!picture.pending && picture.id && (quality.canOptimize || quality.canFixSize)) counts.optimizable += 1;
    }

    return counts;
  }

  function getOptimizablePictures() {
    return state.draftPictures
      .map((picture, index) => {
        const quality = getPictureQuality(picture);
        const resolution = quality && quality.resolution ? quality.resolution : null;
        if (!picture.id || picture.pending || !quality || !(quality.canOptimize || quality.canFixSize)) return null;
        return {
          localId: picture.localId,
          pictureId: picture.id,
          index,
          url: picture.previewUrl || picture.secure_url || picture.url || picture.source || '',
          resolution,
          selected: true
        };
      })
      .filter(Boolean);
  }

  function buildOptimizedQualityOverride(pictureId, index, dimensions) {
    const resolution = {
      available: true,
      width: dimensions.width,
      height: dimensions.height,
      source: 'optimized',
      score: 100,
      targetLongSide: 1200,
      belowIdeal: false,
      optimizedWidth: dimensions.width,
      optimizedHeight: dimensions.height
    };
    return {
      pictureId,
      role: pictureRoleForIndex(index),
      dimensions,
      resolution,
      status: 'ok',
      canFixSize: false,
      canOptimize: false,
      message: `${dimensions.width} x ${dimensions.height}px, 100% do ideal.`,
      remedy: null
    };
  }

  function qualityFromDimensions({ pictureId, role, dimensions, allowOptimize }) {
    const resolution = buildResolutionSummary(dimensions);
    const canOptimize = Boolean(allowOptimize && resolution.available && resolution.belowIdeal);
    return {
      pictureId,
      role,
      dimensions: resolution.available
        ? { width: resolution.width, height: resolution.height, source: resolution.source }
        : null,
      resolution,
      status: resolution.available
        ? resolution.belowIdeal ? 'attention' : 'ok'
        : 'unknown',
      canFixSize: canOptimize,
      canOptimize,
      message: formatPictureQualityMessage({ resolution }),
      remedy: canOptimize ? 'Pode otimizar.' : null
    };
  }

  function buildResolutionSummary(dimensions) {
    const target = 1200;
    if (!dimensions || !dimensions.width || !dimensions.height) {
      return {
        available: false,
        width: null,
        height: null,
        source: null,
        score: null,
        targetLongSide: target,
        belowIdeal: false,
        optimizedWidth: null,
        optimizedHeight: null
      };
    }
    const width = Number(dimensions.width);
    const height = Number(dimensions.height);
    const longSide = Math.max(width, height);
    const scale = longSide ? target / longSide : 1;
    return {
      available: true,
      width,
      height,
      source: dimensions.source || 'measured',
      score: longSide ? Math.max(1, Math.min(100, Math.round((longSide / target) * 100))) : null,
      targetLongSide: target,
      belowIdeal: longSide < target,
      optimizedWidth: longSide ? Math.max(1, Math.round(width * scale)) : target,
      optimizedHeight: longSide ? Math.max(1, Math.round(height * scale)) : target
    };
  }

  function formatPictureQualityMessage(quality) {
    const parts = [];
    const resolution = quality.resolution || null;
    if (resolution && resolution.available) {
      parts.push(`${resolution.width} x ${resolution.height}px`);
      if (resolution.score) parts.push(`${resolution.score}% do ideal`);
      if (resolution.belowIdeal) parts.push('Pode otimizar');
    } else if (quality.message) {
      parts.push(quality.message);
    }
    return parts.join(' ') || 'Sem leitura de dimensão.';
  }

  function getQualityTone(quality) {
    const resolution = quality && quality.resolution ? quality.resolution : null;
    if (resolution && resolution.belowIdeal) return 'warn';
    if (quality && quality.status === 'unknown') return 'muted';
    return 'ok';
  }

  function getResolutionTone(resolution) {
    if (!resolution || !resolution.available) return 'muted';
    if (resolution.belowIdeal) return 'warn';
    return 'ok';
  }

  function formatDimensions(value) {
    if (!value || !value.width || !value.height) return 'sem dimensão';
    return `${value.width} x ${value.height}px`;
  }

  function formatPictureDimensions(picture, resolution) {
    if (resolution && resolution.available) return formatDimensions(resolution);
    if (picture && picture.optimizedDimensions) return formatDimensions(picture.optimizedDimensions);
    if (picture && picture.originalDimensions) return formatDimensions(picture.originalDimensions);
    return 'sem leitura';
  }

  function formatOptimizedDimensions(resolution) {
    if (!resolution || !resolution.optimizedWidth || !resolution.optimizedHeight) return '1200px no lado maior';
    return `${resolution.optimizedWidth} x ${resolution.optimizedHeight}px`;
  }

  function formatScore(resolution) {
    return resolution && resolution.score ? `${resolution.score}%` : '--';
  }

  function formatQualityStateLabel(quality) {
    if (!quality) return 'Sem leitura';
    const resolution = quality.resolution || null;
    if (resolution && resolution.available && resolution.belowIdeal) return 'Abaixo do ideal';
    if (quality.status === 'unknown') return 'Sem leitura';
    return 'Ideal';
  }

  function pictureRoleForIndex(index) {
    if (state.selectedVariationId) return 'variation_thumbnail';
    return index === 0 ? 'thumbnail' : 'other';
  }

  function readImageDimensions(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (!width || !height) {
          reject(new Error('Imagem inválida.'));
          return;
        }
        resolve({ width, height, source: 'local' });
      };
      img.onerror = () => reject(new Error('Não consegui carregar a imagem.'));
      img.src = dataUrl;
    });
  }

  function resizeImageToLongSide(dataUrl, targetSize) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const size = Number(targetSize) || 1200;
          const longSide = Math.max(img.naturalWidth, img.naturalHeight);
          if (!longSide) throw new Error('Imagem inválida.');
          const scale = size / longSide;
          const width = Math.max(1, Math.round(img.naturalWidth * scale));
          const height = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          context.drawImage(img, 0, 0, width, height);
          resolve({
            base64: canvas.toDataURL('image/jpeg', 0.92),
            mimeType: 'image/jpeg',
            width,
            height
          });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Não consegui carregar a imagem.'));
      img.src = dataUrl;
    });
  }

  function selectPicturesForActiveVariation(context) {
    return PhotosModel.selectPicturesForActiveVariation(context, state.selectedVariationId);
  }

  function isCatalogListing() {
    return Boolean(state.context && state.context.item && state.context.item.catalog_listing);
  }

  function isPictureEditingBlocked() {
    return Boolean(getPictureEditingBlockedMessage());
  }

  function getPictureEditingBlockedMessage() {
    const item = state.context && state.context.item ? state.context.item : null;
    if (!item) return '';
    const editability = item.pictureEditability || {};
    if (editability.editable === false && editability.message) return editability.message;
    if (item.picturesEditable === false) {
      return 'Fotos bloqueadas neste anúncio.';
    }
    if (item.catalog_listing) {
      return 'Catálogo: fotos bloqueadas pelo Mercado Livre.';
    }
    return '';
  }

  function getSelectedVariation(variations) {
    return PhotosModel.getSelectedVariation(variations, state.selectedVariationId);
  }

  function ensureFileInput() {
    if (state.fileInput) return;
    state.fileInput = document.createElement('input');
    state.fileInput.type = 'file';
    state.fileInput.accept = 'image/png,image/jpeg';
    state.fileInput.multiple = true;
    state.fileInput.className = 'onblide-ml-file';
    state.fileInput.addEventListener('change', (event) => {
      void addPendingFiles(event.target.files);
      event.target.value = '';
    });
    root.appendChild(state.fileInput);
  }

  function removeTray() {
    if (state.tray) state.tray.remove();
    state.tray = null;
    state.lastTrayMarkup = '';
  }

  function removeQualityDialog() {
    if (state.dialogRoot) state.dialogRoot.remove();
    state.dialogRoot = null;
    state.lastDialogMarkup = '';
  }

  function normalizeLimit(value) {
    return PhotosModel.normalizeLimit(value);
  }

  function toDraftPicture(picture) {
    return PhotosModel.toDraftPicture(picture, makeLocalId);
  }

  function clonePicture(picture) {
    return PhotosModel.clonePicture(picture);
  }

  function cloneVariations(variations) {
    return PhotosModel.cloneVariations(variations);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function makeLocalId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function icon(name, size) {
    return window.OnblideIcons ? window.OnblideIcons.render(name, size) : '';
  }

  return {
    id: 'photos',
    label: 'Fotos',
    getMode: () => state.context && state.context.mode ? state.context.mode : null,
    getPageSignature: () => state.pageSignature,
    getStatus: getEditorStatus,
    handlePageContextChange,
    hasActiveDrag: () => Boolean(state.drag),
    hasContextOrError: () => Boolean(state.context || state.error),
    hasDirtyChanges: () => Boolean(state.dirty),
    hide: hideEditor,
    isBusy: () => Boolean(state.busy),
    isLoaded: () => Boolean(state.loaded),
    reload: reloadEditor,
    reset: resetState,
    scheduleRender,
    show: showEditor,
    start: startProductEditor
  };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
