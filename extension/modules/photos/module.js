(function (rootScope) {
  rootScope.OnFramePhotosModule = {
    createPhotoModule
  };

  function createPhotoModule(services) {
  const Shared = services.Shared;
  const Detection = services.Detection;
  const PhotosModel = services.PhotosModel;
  const api = services.api;
  const toast = services.toast;
  const root = services.root;
  const requestPageContextReload = services.requestPageContextReload || (() => Promise.resolve(null));
  const isProductPageUrl = Detection.isProductPageUrl;
  const PhotosView = rootScope.OnFramePhotosView;
  const hasPhotosView = Boolean(
    PhotosView &&
    typeof PhotosView.renderTray === 'function' &&
    typeof PhotosView.renderDialog === 'function' &&
    typeof PhotosView.unmount === 'function'
  );
  if (!hasPhotosView) throw new Error('Interface de fotos indisponível.');
  const toUserError = (err) => Shared.toUserError(err, { logPrefix: '[Onblide ML] detalhe tecnico:' });
  const EDITOR_MORPH_OPEN_DURATION = 900;
  const EDITOR_MORPH_CLOSE_DURATION = 950;

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
    dockExpanded: false,
    editorTransition: null,
    editorTransitionTimer: null,
    editorTransitionResolve: null,
    editorTransitionAnimations: [],
    renderTimer: null,
    renderAfterDrag: false,
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
    clearEditorTransition();
    if (state.renderTimer) clearTimeout(state.renderTimer);
    state.renderTimer = null;
    state.renderAfterDrag = false;
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

    if (status === 'hydration-error' || status === 'error') {
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

    if (state.loaded && isSamePhotoContext(update.context)) {
      state.context = update.context;
      state.pageSignature = pageSignature;
      state.loadedPageSignature = pageSignature;
      state.ownerUserId = update.context && update.context.ownerAccount && update.context.ownerAccount.user_id || null;
      rerenderTray();
      return;
    }

    void loadContext({ context: update.context });
  }

  function isSamePhotoContext(context) {
    const currentItemId = state.context && state.context.item && state.context.item.id;
    const nextItemId = context && context.item && context.item.id;
    const currentOwnerId = state.context && state.context.ownerAccount && state.context.ownerAccount.user_id;
    const nextOwnerId = context && context.ownerAccount && context.ownerAccount.user_id;
    const nextVariationId = context && context.selectedVariationId || null;
    return Boolean(currentItemId && nextItemId &&
      String(currentItemId) === String(nextItemId) &&
      String(currentOwnerId || '') === String(nextOwnerId || '') &&
      String(state.selectedVariationId || '') === String(nextVariationId || ''));
  }

  async function loadContext(options = {}) {
    const preservedEditorDialog = state.qualityDialog && state.qualityDialog.mode === 'editor'
      ? Object.assign({}, state.qualityDialog, { error: '', notice: '' })
      : null;
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
      state.originalVariations = PhotosModel.cloneVariations(context.variations || []);
      state.variations = PhotosModel.cloneVariations(context.variations || []);
      state.originalPictures = PhotosModel
        .selectPicturesForActiveVariation(context, state.selectedVariationId)
        .map((picture) => PhotosModel.toDraftPicture(picture, makeLocalId));
      state.draftPictures = state.originalPictures.map(PhotosModel.clonePicture);
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
      state.qualityDialog = preservedEditorDialog;
      if (!preservedEditorDialog) restoreTrayAfterDialog();
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

    if (state.tray && !state.tray.isConnected) {
      clearEditorTransition();
      unmountPhotoView(state.tray);
      state.tray = null;
    }

    if (!state.tray) {
      state.tray = document.createElement('section');
      state.tray.className = 'onblide-ml-tray';
      if (state.qualityDialog) state.tray.classList.add('is-editor-hidden');
      document.body.appendChild(state.tray);
    }

    renderTray();
    if (!state.editorTransition) renderQualityDialogRoot();
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
    state.qualityDialog = null;
    clearEditorTransition();
    removeTray();
    removeQualityDialog();
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
    try {
      PhotosView.renderTray(state.tray, buildTrayViewModel(), {
        onToggle: toggleDock,
        onConnect: () => void startAuth(),
        onReload: () => void reloadEditor(),
        onOpenEditor: openEditorDialog,
        onCommit: () => void commit(),
        onDiscard: discardDraft,
        onRemove: removePicture,
        onUpload: () => state.fileInput.click(),
        onUploadFiles: (files) => void addPendingFiles(files),
        onPicturePointerDown: beginPictureDrag,
        onMovePicture: movePictureByKeyboard,
        onError: handlePhotosViewFailure
      });
    } catch (error) {
      handlePhotosViewFailure(error);
    }
  }

  function buildTrayViewModel() {
    const visible = Boolean(state.loaded || state.context || state.error);
    const hasContext = Boolean(state.context);
    const blocked = hasContext && isPictureEditingBlocked();
    const catalog = blocked && isCatalogListing();
    const limitState = hasContext ? getPictureLimitState() : null;
    return {
      visible,
      expanded: state.dockExpanded,
      hasContext,
      blocked,
      catalog,
      busy: state.busy,
      dirty: state.dirty,
      saveDisabled: Boolean(state.busy || (limitState && limitState.message)),
      status: buildTrayStatusViewModel(limitState),
      counter: limitState && limitState.counterText
        ? limitState.counterText
        : `${state.draftPictures.length} fotos`,
      pictures: state.draftPictures.map(buildTrayPictureViewModel),
      feedback: buildTrayFeedbackViewModel(limitState)
    };
  }

  function buildTrayStatusViewModel(limitState) {
    if (state.error) return { text: state.error, tone: 'error' };
    const blockedMessage = getPictureEditingBlockedMessage();
    if (blockedMessage) return { text: blockedMessage, tone: 'muted' };
    if (limitState && limitState.message) return { text: limitState.message, tone: 'error' };
    if (state.message) return { text: state.message, tone: '' };
    if (state.context && state.selectedVariationId) return { text: 'Variação selecionada', tone: 'muted' };
    if (state.context) return { text: 'Fotos do anúncio', tone: 'muted' };
    return null;
  }

  function buildTrayPictureViewModel(picture, index) {
    const quality = getPictureQuality(picture);
    return {
      localId: picture.localId,
      index,
      url: picture.previewUrl || picture.secure_url || picture.url || picture.source || '',
      quality: quality ? {
        tone: getQualityTone(quality),
        badgeTone: getQualityBadgeTone(quality),
        label: formatPictureQualityScore(quality)
      } : null
    };
  }

  function buildTrayFeedbackViewModel(limitState) {
    if (state.error) return { text: state.error, tone: 'error' };
    if (state.dirty && limitState && limitState.message) {
      return { text: limitState.message, tone: 'error' };
    }
    return null;
  }

  function handlePhotosViewFailure(error) {
    if (rootScope.console && typeof rootScope.console.error === 'function') {
      rootScope.console.error('[OnFrame] A interface de fotos falhou.', error);
    }
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

  function toggleDock() {
    state.dockExpanded = !state.dockExpanded;
    rerenderTray();
  }

  function renderQualityDialogRoot() {
    if (!state.qualityDialog) {
      if (!state.editorTransition) restoreTrayAfterDialog();
      removeQualityDialog();
      return;
    }
    if (state.dialogRoot && !state.dialogRoot.isConnected) {
      unmountPhotoView(state.dialogRoot);
      state.dialogRoot = null;
    }
    if (!state.dialogRoot) {
      state.dialogRoot = document.createElement('div');
      state.dialogRoot.className = 'onblide-ml-dialog-root';
      document.body.appendChild(state.dialogRoot);
    }
    try {
      PhotosView.renderDialog(state.dialogRoot, buildQualityDialogViewModel(), {
        onClose: closeQualityDialog,
        onOpenOptimize: openOptimizeDialog,
        onCommit: () => void commit(),
        onDiscard: discardDraft,
        onReloadQuality: () => void loadPictureQuality(),
        onRemove: removePicture,
        onUpload: () => state.fileInput.click(),
        onUploadFiles: (files) => void addPendingFiles(files),
        onPicturePointerDown: beginPictureDrag,
        onMovePicture: movePictureByKeyboard,
        onSelectAll: () => setAllOptimizeSelection(true),
        onClear: () => setAllOptimizeSelection(false),
        onToggle: toggleOptimizeSelection,
        onConfirm: () => void confirmOptimizeDialog(),
        onError: handlePhotosViewFailure
      });
    } catch (error) {
      handlePhotosViewFailure(error);
    }
  }

  function buildQualityDialogViewModel() {
    const dialog = state.qualityDialog;
    if (!dialog) throw new Error('Diálogo de fotos indisponível.');
    if (dialog.mode === 'editor') return buildEditorDialogViewModel(dialog);
    if (dialog.mode === 'processing') {
      return Object.assign({ mode: 'processing' }, buildProcessingDialogViewModel(dialog));
    }
    if (dialog.mode === 'review') return buildReviewDialogViewModel(dialog);
    if (dialog.mode === 'result') return buildResultDialogViewModel(dialog);
    throw new Error(`Modo do diálogo de fotos desconhecido: ${dialog.mode || 'ausente'}.`);
  }

  function buildEditorDialogViewModel(dialog) {
    const limitState = getPictureLimitState();
    const counts = getCurrentQualityCounts();
    return {
      mode: 'editor',
      alert: buildEditorAlertViewModel(dialog, limitState),
      optimizeDisabled: Boolean(state.busy || limitState.message || !counts.optimizable),
      saveDisabled: Boolean(state.busy || !state.dirty || limitState.message),
      discardDisabled: Boolean(state.busy || !state.dirty),
      qualityLoading: state.qualityLoading,
      pictures: state.draftPictures.map(buildTrayPictureViewModel),
      diagnostics: buildEditorDiagnosticsViewModel()
    };
  }

  function buildEditorAlertViewModel(dialog, limitState) {
    const error = (dialog && dialog.error) || state.error || (limitState && limitState.message);
    if (error) return { tone: 'danger', message: error };
    if (dialog && dialog.notice) return { tone: 'success', message: dialog.notice };
    return null;
  }

  function buildEditorDiagnosticsViewModel() {
    if (state.qualityLoading) return { mode: 'loading', message: 'Analisando...' };
    if (state.qualityError) return { mode: 'error', message: state.qualityError };
    if (!state.draftPictures.length) return { mode: 'empty', message: 'Nenhuma foto no rascunho.' };
    return {
      mode: 'items',
      items: state.draftPictures.map((picture, index) => {
        const quality = getPictureQuality(picture);
        const resolution = quality && quality.resolution ? quality.resolution : null;
        return {
          localId: picture.localId,
          index,
          url: picture.previewUrl || picture.secure_url || picture.url || picture.source || '',
          tone: quality ? getQualityTone(quality) : 'muted',
          dimensions: formatPictureDimensions(picture, resolution),
          score: formatScore(resolution),
          badgeTone: getResolutionBadgeTone(resolution),
          stateLabel: formatQualityStateLabel(quality)
        };
      })
    };
  }

  function buildReviewDialogViewModel(dialog) {
    const items = Array.isArray(dialog.items) ? dialog.items : [];
    const selectedCount = items.filter((item) => item.selected).length;
    return {
      mode: 'review',
      error: dialog.error || '',
      selectedCount,
      allSelected: items.length > 0 && selectedCount === items.length,
      items: items.map((item, index) => {
        const resolution = item.resolution || {};
        return {
          localId: item.localId,
          index,
          url: item.url,
          selected: Boolean(item.selected),
          dimensions: formatDimensions(resolution),
          optimizedDimensions: formatOptimizedDimensions(resolution),
          score: formatScore(resolution),
          badgeTone: getResolutionBadgeTone(resolution)
        };
      })
    };
  }

  function buildProcessingDialogViewModel(dialog) {
    const total = Number(dialog.total || 0);
    const processed = Number(dialog.processed || 0);
    return {
      percent: total ? Math.round((processed / total) * 100) : 0,
      progressText: dialog.progressText || 'Aguarde alguns instantes'
    };
  }

  function buildResultDialogViewModel(dialog) {
    const results = Array.isArray(dialog.results) ? dialog.results : [];
    return {
      mode: 'result',
      items: results.map((result, index) => ({
        localId: result.localId || `result-${index}`,
        index,
        beforeUrl: result.beforeUrl || '',
        afterUrl: result.afterUrl || '',
        originalDimensions: formatDimensions(result.originalDimensions),
        optimizedDimensions: formatDimensions(result.optimizedDimensions),
        beforeScore: result.beforeScore ? `${result.beforeScore}%` : ''
      }))
    };
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
      const quality = await loadPictureQualityReport(itemId, variationId);
      if (!isActiveQualityRequest(requestId, itemId, variationId)) return;
      state.quality = quality;
      state.qualityError = '';
    } catch (err) {
      if (!isActiveQualityRequest(requestId, itemId, variationId)) return;
      state.quality = null;
      state.qualityError = 'Análise indisponível';
      logPictureQualityWarning(err);
    } finally {
      if (isActiveQualityRequest(requestId, itemId, variationId)) {
        state.qualityLoading = false;
        rerenderTray();
      }
    }
  }

  async function loadPictureQualityReport(itemId, variationId) {
    const path = itemApiPath(itemId, '/pictures/quality', {
      variation_id: variationId
    });
    try {
      return await api(path);
    } catch (err) {
      if (!isTransientFetchError(err)) throw err;
      await wait(250);
      return api(path);
    }
  }

  function isTransientFetchError(err) {
    const text = String(err && (err.technicalError || err.message) || err || '');
    return /failed to fetch|networkerror|load failed|network request failed/i.test(text);
  }

  function logPictureQualityWarning(err) {
    if (!Shared.isDebugLoggingEnabled || !Shared.isDebugLoggingEnabled()) return;
    console.warn('[OnFrame] qualidade de fotos:', err && (err.technicalError || err.message || err));
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isActiveQualityRequest(requestId, itemId, variationId) {
    return state.qualityRequestId === requestId
      && state.context
      && state.context.item
      && String(state.context.item.id || '') === String(itemId || '')
      && String(state.selectedVariationId || '') === String(variationId || '');
  }

  async function startAuth() {
    try {
      state.busy = true;
      state.message = 'Abrindo autorização...';
      state.error = '';
      rerenderTray();
      await sendRemoteMessage('oauth-start');
      state.message = '';
      showToast('info', 'Autorização aberta', 'Conclua a autorização e recarregue a página.');
    } catch (err) {
      state.error = '';
      state.message = '';
      showToast('danger', toUserError(err));
    } finally {
      state.busy = false;
      rerenderTray();
    }
  }

  function sendRemoteMessage(action, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!window.chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
        reject(new Error('A extensão OnFrame não está disponível.'));
        return;
      }
      chrome.runtime.sendMessage(Object.assign({ type: 'onframe:remote', action }, payload), (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || 'Não consegui acessar o OnFrame remoto.'));
          return;
        }
        if (!response || response.ok !== true) {
          const error = new Error(response && response.error ? response.error : 'Não consegui acessar o OnFrame remoto.');
          error.code = response && response.code ? response.code : '';
          error.technicalError = response && response.technicalError ? response.technicalError : error.message;
          reject(error);
          return;
        }
        resolve(response.body || {});
      });
    });
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
    if (state.qualityDialog && state.qualityDialog.mode === 'editor') return;
    clearEditorTransition();
    state.editorTransition = {
      direction: 'open',
      dockRect: readDockRect()
    };
    state.qualityDialog = {
      mode: 'editor',
      error: '',
      notice: ''
    };
    renderQualityDialogRoot();
    beginEditorOpenTransition();
  }

  function openOptimizeDialog() {
    if (!state.context || state.busy || isPictureEditingBlocked()) return;
    const items = getOptimizablePictures();
    if (!items.length) {
      if (state.qualityDialog && state.qualityDialog.mode === 'editor') {
        state.qualityDialog = Object.assign({}, state.qualityDialog, { notice: '', error: '' });
      } else state.message = '';
      state.error = '';
      showToast('info', 'Nada para otimizar');
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
    if (state.qualityDialog && state.qualityDialog.mode === 'editor') {
      beginEditorCloseTransition();
      return;
    }
    state.qualityDialog = null;
    restoreTrayAfterDialog();
    rerenderTray();
  }

  async function beginEditorOpenTransition() {
    const modal = getEditorDialogElement();
    const backdrop = getEditorBackdropElement();
    const tray = state.tray;
    const dockRect = state.editorTransition && state.editorTransition.dockRect;

    if (!modal || !backdrop) {
      state.qualityDialog = null;
      restoreTrayAfterDialog();
      state.editorTransition = null;
      renderQualityDialogRoot();
      return;
    }

    if (!tray || !dockRect) {
      if (tray) hideTrayForEditor();
      state.editorTransition = null;
      return;
    }

    const transition = state.editorTransition;
    const transform = getEditorMorphTransform(modal, dockRect);
    const modalStyle = getComputedStyle(modal);
    const backdropStyle = getComputedStyle(backdrop);
    const targetRadius = modalStyle.borderRadius;
    const targetShadow = modalStyle.boxShadow;
    const targetScrim = backdropStyle.backgroundColor;
    modal.classList.add('is-editor-morphing', 'is-editor-opening');
    backdrop.classList.add('is-editor-morphing', 'is-editor-opening');
    tray.classList.add('is-editor-leaving');

    const animations = [
      animateEditorElement(modal, [
        { transform, borderRadius: '8px', boxShadow: 'none' },
        { transform: 'none', borderRadius: targetRadius, boxShadow: targetShadow }
      ], {
        duration: EDITOR_MORPH_OPEN_DURATION,
        easing: 'cubic-bezier(0.22, 0.78, 0.18, 1)',
        fill: 'both'
      }),
      animateEditorElement(backdrop, [
        { backgroundColor: 'transparent' },
        { backgroundColor: targetScrim }
      ], {
        duration: 620,
        easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
        fill: 'both'
      }),
      animateEditorElement(tray, [
        { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
        { opacity: 0, transform: 'translateX(-50%) translateY(10px)' }
      ], {
        duration: 180,
        easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
        fill: 'both'
      }),
      ...animateEditorChildren(modal, 'open')
    ].filter(Boolean);

    await waitForEditorAnimations(animations, EDITOR_MORPH_OPEN_DURATION);
    if (state.editorTransition !== transition) return;
    hideTrayForEditor();
    modal.classList.remove('is-editor-morphing', 'is-editor-opening');
    backdrop.classList.remove('is-editor-morphing', 'is-editor-opening');
    finishEditorAnimations();
    state.editorTransition = null;
    renderQualityDialogRoot();
  }

  async function beginEditorCloseTransition() {
    if (state.editorTransition) return;

    const modal = getEditorDialogElement();
    const backdrop = getEditorBackdropElement();
    const tray = state.tray;

    if (!modal || !backdrop || !tray) {
      state.qualityDialog = null;
      rerenderTray();
      return;
    }

    const dockRect = readDockRect();
    if (!dockRect) {
      state.qualityDialog = null;
      rerenderTray();
      return;
    }

    const transition = { direction: 'close', dockRect };
    state.editorTransition = transition;
    const modalStyle = getComputedStyle(modal);
    const backdropStyle = getComputedStyle(backdrop);
    const targetTransform = getEditorMorphTransform(modal, dockRect);
    modal.classList.add('is-editor-morphing', 'is-editor-closing');
    backdrop.classList.add('is-editor-morphing', 'is-editor-closing');

    const animations = [
      animateEditorElement(modal, [
        { transform: 'none', borderRadius: modalStyle.borderRadius, boxShadow: modalStyle.boxShadow },
        { transform: targetTransform, borderRadius: '8px', boxShadow: 'none' }
      ], {
        duration: 800,
        delay: 100,
        easing: 'cubic-bezier(0.4, 0, 0.7, 0.2)',
        fill: 'both'
      }),
      animateEditorElement(backdrop, [
        { backgroundColor: backdropStyle.backgroundColor },
        { backgroundColor: 'transparent' }
      ], {
        duration: 760,
        easing: 'cubic-bezier(0.4, 0, 0.7, 0.2)',
        fill: 'both'
      }),
      ...animateEditorChildren(modal, 'close')
    ].filter(Boolean);

    await waitForEditorAnimations(animations, EDITOR_MORPH_CLOSE_DURATION);
    if (state.editorTransition !== transition) return;
    state.qualityDialog = null;
    restoreTrayAfterDialog();
    renderQualityDialogRoot();
    finishEditorAnimations();
    state.editorTransition = null;
  }

  function animateEditorChildren(modal, direction) {
    return Array.from(modal.children).map((child, index, children) => {
      const opening = direction === 'open';
      const sequenceIndex = opening ? index : children.length - index - 1;
      return animateEditorElement(child, opening ? [
        { opacity: 0, transform: 'translateY(20px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ] : [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(14px)' }
      ], {
        duration: opening ? 360 : 200,
        delay: opening ? 220 + sequenceIndex * 55 : sequenceIndex * 18,
        easing: opening ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.4, 0, 0.7, 0.2)',
        fill: 'both'
      });
    }).filter(Boolean);
  }

  function animateEditorElement(element, keyframes, options) {
    if (!element || typeof element.animate !== 'function') return null;
    try {
      const animation = element.animate(keyframes, options);
      state.editorTransitionAnimations.push(animation);
      return animation;
    } catch (_err) {
      return null;
    }
  }

  function waitForEditorAnimations(animations, fallbackDuration) {
    return new Promise((resolve) => {
      let settled = false;
      const complete = () => {
        if (settled) return;
        settled = true;
        if (state.editorTransitionTimer) clearTimeout(state.editorTransitionTimer);
        state.editorTransitionTimer = null;
        state.editorTransitionResolve = null;
        resolve();
      };

      state.editorTransitionResolve = complete;
      state.editorTransitionTimer = setTimeout(complete, fallbackDuration + 250);
      if (animations.length) {
        Promise.all(animations.map((animation) => animation.finished.catch(() => null))).then(complete);
      }
    });
  }

  function finishEditorAnimations() {
    const resolveTransition = state.editorTransitionResolve;
    state.editorTransitionResolve = null;
    state.editorTransitionAnimations.forEach((animation) => animation.cancel());
    state.editorTransitionAnimations = [];
    if (state.editorTransitionTimer) clearTimeout(state.editorTransitionTimer);
    state.editorTransitionTimer = null;
    if (resolveTransition) resolveTransition();
  }

  function getEditorDialogElement() {
    return state.dialogRoot && state.dialogRoot.querySelector('.onblide-ml-modal.editor');
  }

  function getEditorBackdropElement() {
    return state.dialogRoot && state.dialogRoot.querySelector('.onblide-ml-modal-backdrop');
  }

  function readDockRect() {
    if (!state.tray || typeof state.tray.getBoundingClientRect !== 'function') return null;
    const rect = state.tray.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  function getEditorMorphTransform(modal, dockRect) {
    const modalRect = modal.getBoundingClientRect();
    const translateX = dockRect.left + dockRect.width / 2 - (modalRect.left + modalRect.width / 2);
    const translateY = dockRect.top + dockRect.height / 2 - (modalRect.top + modalRect.height / 2);
    const scaleX = dockRect.width / modalRect.width;
    const scaleY = dockRect.height / modalRect.height;
    return `translate(${Math.round(translateX)}px, ${Math.round(translateY)}px) scale(${scaleX}, ${scaleY})`;
  }

  function hideTrayForEditor() {
    if (!state.tray) return;
    state.tray.classList.remove('is-editor-leaving', 'is-editor-returning', 'is-editor-returned');
    state.tray.classList.add('is-editor-hidden');
  }

  function restoreTrayAfterDialog() {
    if (!state.tray) return;
    state.tray.classList.remove('is-editor-hidden', 'is-editor-leaving');
  }

  function clearEditorTransition() {
    finishEditorAnimations();
    const modal = getEditorDialogElement();
    const backdrop = getEditorBackdropElement();
    if (modal) modal.classList.remove('is-editor-morphing', 'is-editor-opening', 'is-editor-closing');
    if (backdrop) backdrop.classList.remove('is-editor-morphing', 'is-editor-opening', 'is-editor-closing');
    state.editorTransition = null;
    if (state.qualityDialog) hideTrayForEditor();
    else restoreTrayAfterDialog();
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
    showToast('success', 'Fotos otimizadas');
    finishPhotoSave();
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
      showToast('success', 'Fotos salvas');
      finishPhotoSave();
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
    const variations = PhotosModel.buildVariationPayload(state.variations, state.selectedVariationId, selectedIds);
    const pictures = PhotosModel.buildItemPicturesPayload({
      contextPictures: state.context ? state.context.pictures || [] : [],
      finalSelectedPictures,
      variations,
      originalPictures: state.originalPictures
    });

    await api(itemApiPath(state.context.item.id, '/pictures/commit'), {
      method: 'POST',
      body: JSON.stringify({ pictures, variations })
    });

    syncCommittedPictures(finalSelectedPictures, pictures, variations);
  }

  function syncCommittedPictures(finalSelectedPictures, pictures, variations) {
    const committedPictures = finalSelectedPictures.map((picture) => Object.assign({}, picture, { pending: false }));
    const currentPictures = state.context && Array.isArray(state.context.pictures) ? state.context.pictures : [];
    const currentById = new Map(currentPictures.map((picture) => [String(picture.id || ''), picture]));
    const committedById = new Map(committedPictures.map((picture) => [String(picture.id || ''), picture]));
    const contextPictures = pictures.map((picture) => {
      const id = String(picture && picture.id || '');
      return committedById.get(id) || currentById.get(id) || picture;
    });

    state.draftPictures = committedPictures.map(PhotosModel.clonePicture);
    state.originalPictures = committedPictures.map(PhotosModel.clonePicture);
    state.variations = PhotosModel.cloneVariations(variations);
    state.originalVariations = PhotosModel.cloneVariations(variations);
    state.context = Object.assign({}, state.context, {
      pictures: contextPictures,
      variations: PhotosModel.cloneVariations(variations)
    });
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
    const blockedPageSignature = state.blockedPageSignature;
    state.blockedPageSignature = '';
    state.draftPictures = state.originalPictures.map(PhotosModel.clonePicture);
    state.variations = PhotosModel.cloneVariations(state.originalVariations);
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
    state.message = message;
    state.error = '';
    if (state.qualityDialog && state.qualityDialog.mode === 'editor') {
      state.qualityDialog = Object.assign({}, state.qualityDialog, { error: '', notice: '' });
    }
    rerenderTray();
  }

  function rerenderTray() {
    mountEditorTray();
  }

  function finishPhotoSave() {
    state.busy = false;
    state.dirty = false;
    state.error = '';
    state.message = '';
    rerenderTray();
  }

  function showToast(tone, title, body) {
    if (!toast || typeof toast.show !== 'function') return;
    toast.show({ tone, title, body });
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

  function getQualityBadgeTone(quality) {
    const tone = getQualityTone(quality);
    if (tone === 'ok') return 'green';
    if (tone === 'warn') return 'orange';
    if (tone === 'error') return 'red';
    return 'grey';
  }

  function formatPictureQualityScore(quality) {
    const resolution = quality && quality.resolution ? quality.resolution : null;
    return resolution && resolution.available && resolution.score ? `${resolution.score}%` : '!';
  }

  function getResolutionTone(resolution) {
    if (!resolution || !resolution.available) return 'muted';
    if (resolution.belowIdeal) return 'warn';
    return 'ok';
  }

  function getResolutionBadgeTone(resolution) {
    const tone = getResolutionTone(resolution);
    if (tone === 'ok') return 'green';
    if (tone === 'warn') return 'orange';
    return 'grey';
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

  function isCatalogListing() {
    return Boolean(state.context && state.context.item && state.context.item.catalog_listing);
  }

  function isPictureEditingBlocked() {
    return Boolean(getPictureEditingBlockedMessage());
  }

  function getPictureEditingBlockedMessage() {
    const item = state.context && state.context.item ? state.context.item : null;
    const permissions = state.context && state.context.permissions ? state.context.permissions : {};
    const editability = permissions.pictureEditability || item && item.pictureEditability || {};
    if (isCatalogListing()) return 'Fotos definidas pelo catálogo.';
    if (editability.editable === false) return editability.message || 'Fotos bloqueadas neste anúncio.';
    if (permissions.picturesEditable === false) return 'Fotos bloqueadas neste anúncio.';
    return '';
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
    unmountPhotoView(state.tray);
    if (state.tray) state.tray.remove();
    state.tray = null;
  }

  function removeQualityDialog() {
    unmountPhotoView(state.dialogRoot);
    if (state.dialogRoot) state.dialogRoot.remove();
    state.dialogRoot = null;
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

  function unmountPhotoView(host) {
    if (!host) return;
    PhotosView.unmount(host);
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
