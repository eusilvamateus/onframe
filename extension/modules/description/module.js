(function (rootScope) {
  rootScope.OnFrameDescriptionModule = {
    createDescriptionModule
  };

  function createDescriptionModule(services) {
    const Shared = services.Shared;
    const Detection = services.Detection;
    const DescriptionModel = services.DescriptionModel;
    const api = services.api;
    const toast = services.toast;
    const isProductPageUrl = Detection.isProductPageUrl;
    const DescriptionView = rootScope.OnFrameDescriptionView;
    const hasDescriptionView = Boolean(
      DescriptionView &&
      typeof DescriptionView.renderAction === 'function' &&
      typeof DescriptionView.renderCatalogNotice === 'function' &&
      typeof DescriptionView.renderEditor === 'function' &&
      typeof DescriptionView.unmount === 'function'
    );
    if (!hasDescriptionView) throw new Error('Interface de descrição indisponível.');
    const toUserError = (err) => DescriptionModel.friendlyError(Shared.toUserError(err, { logPrefix: '[OnFrame descrição] detalhe tecnico:' }));

    const state = {
      context: null,
      itemId: null,
      ownerUserId: null,
      visible: true,
      loaded: false,
      busy: false,
      editing: false,
      loading: false,
      saving: false,
      exists: false,
      text: '',
      originalText: '',
      bulkEnabled: false,
      bulkResult: null,
      error: '',
      editorRoot: null,
      contentElement: null,
      contentDisplay: '',
      collapsableElement: null,
      collapsableContainer: null,
      collapsableMaxHeight: '',
      editorShellMinHeight: 0,
      editorTextareaMinHeight: 0,
      renderTimer: null,
      requestId: 0,
      pageSignature: ''
    };

    function startDescription() {
      state.pageSignature = readPageSignature();
      if (state.visible) mountDescription();
    }

    function resetState() {
      closeEditor({ restoreText: false });
      if (state.renderTimer) clearTimeout(state.renderTimer);
      state.context = null;
      state.itemId = null;
      state.ownerUserId = null;
      state.visible = true;
      state.loaded = false;
      state.busy = false;
      state.editing = false;
      state.loading = false;
      state.saving = false;
      state.exists = false;
      state.text = '';
      state.originalText = '';
      state.bulkEnabled = false;
      state.bulkResult = null;
      state.error = '';
      state.renderTimer = null;
      state.requestId += 1;
      state.pageSignature = readPageSignature();
      removeInjectedActions();
    }

    function scheduleRender(delay = 120) {
      if (state.renderTimer) return;
      state.renderTimer = setTimeout(() => {
        state.renderTimer = null;
        mountDescription();
      }, delay);
    }

    function handlePageContextChange(update) {
      const status = update && update.status ? update.status : '';
      const pageSignature = update && update.signature ? update.signature : readPageSignature();

      if (status === 'not_product') {
        resetState();
        return;
      }

      if (status === 'loading' || status === 'identifying') {
        state.pageSignature = pageSignature;
        state.busy = true;
        state.error = '';
        mountDescription();
        return;
      }

      if (status === 'hydration-error') {
        state.busy = false;
        state.loaded = true;
        state.error = update && update.error ? update.error : '';
        mountDescription();
        return;
      }

      if (status === 'error') {
        state.context = null;
        state.itemId = null;
        state.ownerUserId = null;
        state.busy = false;
        state.loaded = true;
        state.error = update && update.error ? update.error : 'Não foi possível ler este anúncio.';
        closeEditor({ restoreText: false });
        removeInjectedActions();
        return;
      }

      if (status !== 'ready' && status !== 'quick-ready') return;

      const context = update && update.context ? update.context : null;
      const nextItemId = context && context.item && context.item.id ? String(context.item.id) : '';
      const nextOwnerUserId = context && context.ownerAccount && context.ownerAccount.user_id ? String(context.ownerAccount.user_id) : '';
      const changedItem = nextItemId && state.itemId && nextItemId !== String(state.itemId);

      if (changedItem) closeEditor({ restoreText: false });
      state.context = context;
      state.itemId = nextItemId || null;
      state.ownerUserId = nextOwnerUserId || null;
      state.loaded = true;
      state.busy = false;
      state.pageSignature = pageSignature;
      state.error = '';
      if (!DescriptionModel.canBulkEditDescription(state.context)) state.bulkEnabled = false;
      if (!DescriptionModel.canEditDescription(state.context) && state.editing) closeEditor({ restoreText: true });
      mountDescription();
    }

    function mountDescription() {
      if (!state.visible || !isProductPageUrl(location.href) || !state.itemId) {
        removeInjectedActions();
        return;
      }

      const elements = getDescriptionElements();
      if (!elements.content || !elements.description) {
        removeInjectedActions();
        return;
      }

      if (!DescriptionModel.canEditDescription(state.context)) {
        removeInjectedActions();
        if (isCatalogListing()) injectCatalogNotice(elements);
        return;
      }

      state.contentElement = elements.content;
      injectEditAction(elements, isDescriptionCollapsed(elements));
      bindContentClick(elements.content);
      if (state.editing) renderEditor(elements);
    }

    function getDescriptionElements() {
      const title = document.querySelector('.ui-pdp-description__title') ||
        Array.from(document.querySelectorAll('h2, h3')).find((node) => String(node.textContent || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
          .toLowerCase()
          .startsWith('descricao'));
      const description = title ? title.closest('.ui-pdp-description') : document.querySelector('.ui-pdp-description');
      const collapsable = (description || title) && (description || title).closest('.ui-pdp-collapsable');
      const container = (description || title) && (description || title).closest('.ui-pdp-collapsable__container');
      const section = collapsable ||
        (description && description.closest('section')) ||
        (title && title.closest('section')) ||
        description ||
        (title && title.parentElement);
      return {
        description,
        title,
        content: description && description.querySelector('.ui-pdp-description__content'),
        collapsable,
        container,
        section
      };
    }

    function isDescriptionCollapsed(elements) {
      const candidates = [
        elements && elements.collapsable,
        elements && elements.section,
        elements && elements.description
      ].filter(Boolean);
      return candidates.some((element) => element.classList.contains('ui-pdp-collapsable--is-collapsed') ||
        Boolean(element.querySelector('.ui-pdp-collapsable--is-collapsed')));
    }

    function injectEditAction(elements, disabled) {
      const scope = elements.section || elements.description || (elements.title && elements.title.parentElement);
      if (!elements.title || !scope) return;
      let actionRoot = scope.querySelector('.onframe-description-action-root');
      if (!actionRoot) {
        actionRoot = document.createElement('span');
        actionRoot.className = 'onframe-description-action-root';
        elements.title.insertAdjacentElement('afterend', actionRoot);
      }
      DescriptionView.renderAction(actionRoot, { disabled }, {
        onEdit: () => void openEditor(),
        onError: handleDescriptionViewFailure
      });
    }

    function injectCatalogNotice(elements) {
      const scope = elements.section || elements.description || (elements.title && elements.title.parentElement);
      if (!elements.title || !scope) return;
      let noticeRoot = scope.querySelector('.onframe-description-catalog-notice');
      if (!noticeRoot) {
        noticeRoot = document.createElement('div');
        noticeRoot.className = 'onframe-description-catalog-notice';
        elements.title.insertAdjacentElement('afterend', noticeRoot);
      }
      DescriptionView.renderCatalogNotice(noticeRoot, { onError: handleDescriptionViewFailure });
    }

    function bindContentClick(content) {
      if (!content || content.dataset.onframeDescriptionClick === 'true') return;
      content.dataset.onframeDescriptionClick = 'true';
      content.addEventListener('click', () => {
        if (!state.editing && !state.busy) void openEditor();
      });
    }

    async function openEditor() {
      if (!state.visible || !state.itemId || state.loading || state.saving || !DescriptionModel.canEditDescription(state.context)) return;
      const elements = getDescriptionElements();
      if (!elements.content || !elements.description || isDescriptionCollapsed(elements)) return;
      const visibleText = DescriptionModel.normalizeText(elements.content.innerText) ||
        DescriptionModel.normalizeText(elements.content.textContent);
      state.editing = true;
      state.loading = true;
      state.text = visibleText;
      state.originalText = visibleText;
      state.error = '';
      state.bulkEnabled = false;
      const requestId = ++state.requestId;
      mountDescription();

      try {
        const description = await api(itemApiPath('/description'));
        if (requestId !== state.requestId) return;
        state.exists = Boolean(description.exists);
        state.text = DescriptionModel.resolveDescriptionText(description, visibleText);
        state.originalText = state.text;
        state.loading = false;
        mountDescription();
      } catch (err) {
        if (requestId !== state.requestId) return;
        state.loading = false;
        state.error = toUserError(err);
        mountDescription();
      }
    }

    function renderEditor(elements) {
      const content = elements.content;
      if (!content) return;
      ensureEditingLayout(elements);

      if (!state.editorRoot) {
        state.editorRoot = document.createElement('div');
        state.editorRoot.className = 'onframe-description-root';
        content.insertAdjacentElement('afterend', state.editorRoot);
      }

      DescriptionView.renderEditor(state.editorRoot, buildEditorViewModel(), {
        onTextChange: (value) => {
          state.text = value;
        },
        onBulkChange: (checked) => {
          if (state.saving) return;
          state.bulkEnabled = checked;
          mountDescription();
        },
        onSave: () => void saveDescription(),
        onCancel: cancelEditor,
        onError: handleDescriptionViewFailure
      });
    }

    function ensureEditingLayout(elements) {
      captureEditingMetrics(elements);
      const content = elements.content;
      if (content && content.style.display !== 'none') {
        state.contentDisplay = content.style.display || '';
        content.style.display = 'none';
      }

      if (elements.container && elements.container !== state.collapsableContainer) {
        state.collapsableContainer = elements.container;
        state.collapsableMaxHeight = elements.container.style.maxHeight || '';
      }
      if (state.collapsableContainer) state.collapsableContainer.style.maxHeight = 'none';
      if (elements.collapsable) {
        state.collapsableElement = elements.collapsable;
        elements.collapsable.classList.add('onframe-description-is-editing');
      }
    }

    function captureEditingMetrics(elements) {
      if (state.editorShellMinHeight || !elements) return;
      const shell = elements.collapsable || elements.description;
      const shellHeight = shell && typeof shell.getBoundingClientRect === 'function'
        ? Math.ceil(shell.getBoundingClientRect().height)
        : 0;
      if (!shellHeight) return;
      state.editorShellMinHeight = Math.max(320, shellHeight);
      state.editorTextareaMinHeight = Math.max(260, state.editorShellMinHeight - 150);
    }

    function buildEditorViewModel() {
      const disabled = state.loading || state.saving;
      const canBulk = DescriptionModel.canBulkEditDescription(state.context);
      if (!canBulk) state.bulkEnabled = false;
      const result = state.bulkResult;
      const failures = result && Array.isArray(result.targets)
        ? result.targets.filter((target) => target.status === 'failed' || target.status === 'blocked')
        : [];
      return {
        inputKey: `${state.requestId}:${state.loading ? 'loading' : 'ready'}`,
        text: state.text,
        rows: Math.max(3, Math.ceil((Math.max(60, state.editorTextareaMinHeight || 260) - 20) / 20)),
        minHeight: state.editorShellMinHeight || undefined,
        disabled,
        saving: state.saving,
        status: state.loading
          ? 'Carregando descrição completa...'
          : state.saving
            ? 'Salvando...'
            : '',
        canBulk,
        bulkEnabled: state.bulkEnabled,
        error: state.error,
        failures: failures.map((failure) => ({
          itemId: String(failure.itemId || 'Variação'),
          message: String(failure.message || 'Falha ao salvar.')
        }))
      };
    }

    async function saveDescription() {
      if (!state.itemId || state.saving || state.loading || !DescriptionModel.canEditDescription(state.context)) return;
      const plainText = DescriptionModel.normalizeText(state.text);
      if (!plainText) {
        state.error = 'Informe a descrição.';
        mountDescription();
        return;
      }

      state.saving = true;
      state.error = '';
      state.bulkResult = null;
      mountDescription();

      try {
        const result = state.bulkEnabled
          ? await api(itemApiPath('/description/bulk'), {
              method: 'POST',
              body: JSON.stringify({ scope: 'user_product_family', plainText })
            })
          : await api(itemApiPath('/description'), {
              method: 'PUT',
              body: JSON.stringify({ plainText })
            });

        state.text = plainText;
        state.originalText = plainText;
        state.exists = true;
        if (state.contentElement) state.contentElement.textContent = plainText;
        state.bulkResult = state.bulkEnabled ? result : null;
        state.saving = false;
        const saved = notifySaveResult(result, 'Descrição salva', state.bulkEnabled);
        if (!saved || (state.bulkEnabled && countNotChanged(result) > 0)) {
          mountDescription();
          return;
        }
        closeEditor({ restoreText: false });
        mountDescription();
      } catch (err) {
        state.saving = false;
        state.error = toUserError(err);
        mountDescription();
      }
    }

    function cancelEditor() {
      closeEditor({ restoreText: true });
      mountDescription();
    }

    function closeEditor(options = {}) {
      state.requestId += 1;
      if (state.editorRoot) {
        DescriptionView.unmount(state.editorRoot);
        state.editorRoot.remove();
      }
      state.editorRoot = null;

      if (state.contentElement) {
        state.contentElement.style.display = state.contentDisplay || '';
        if (options.restoreText && state.originalText) state.contentElement.textContent = state.originalText;
      }
      if (state.collapsableContainer) state.collapsableContainer.style.maxHeight = state.collapsableMaxHeight || '';
      if (state.collapsableElement) state.collapsableElement.classList.remove('onframe-description-is-editing');

      state.contentElement = null;
      state.contentDisplay = '';
      state.collapsableElement = null;
      state.collapsableContainer = null;
      state.collapsableMaxHeight = '';
      state.editorShellMinHeight = 0;
      state.editorTextareaMinHeight = 0;
      state.editing = false;
      state.loading = false;
      state.saving = false;
      state.error = '';
    }

    function notifySaveResult(result, title, bulk) {
      if (!bulk) {
        showToast('success', title);
        return true;
      }
      const counts = result && result.counts ? result.counts : {};
      const applied = Number(counts.applied || 0);
      const notChanged = countNotChanged(result);
      if (!applied) {
        state.error = 'Nenhuma variação foi alterada.';
        return false;
      }
      const body = notChanged
        ? `${applied} variação${applied === 1 ? '' : 'ões'} alterada${applied === 1 ? '' : 's'}. ${notChanged} não foi${notChanged === 1 ? '' : 'ram'} alterada${notChanged === 1 ? '' : 's'}.`
        : `${applied} variação${applied === 1 ? '' : 'ões'} alterada${applied === 1 ? '' : 's'}.`;
      showToast(notChanged ? 'warning' : 'success', title, body);
      return true;
    }

    function showToast(tone, title, body) {
      if (!toast || typeof toast.show !== 'function') return;
      toast.show({ tone, title, body });
    }

    function removeInjectedActions() {
      document.querySelectorAll('.onframe-description-action-root, .onframe-description-catalog-notice').forEach((node) => {
        DescriptionView.unmount(node);
        node.remove();
      });
    }

    function isCatalogListing() {
      return Boolean(state.context && state.context.item && state.context.item.catalog_listing);
    }

    function hideDescription() {
      state.visible = false;
      closeEditor({ restoreText: true });
      removeInjectedActions();
      return getDescriptionStatus();
    }

    function showDescription() {
      state.visible = true;
      mountDescription();
      return getDescriptionStatus();
    }

    function reloadDescription() {
      state.visible = true;
      mountDescription();
      return getDescriptionStatus();
    }

    function getDescriptionStatus() {
      return {
        ok: true,
        isProductPage: isProductPageUrl(location.href),
        loaded: state.loaded,
        busy: state.busy || state.loading || state.saving,
        editorVisible: state.visible,
        dirty: state.editing && state.text !== state.originalText,
        error: state.error,
        itemId: state.itemId,
        mode: state.context && state.context.mode ? state.context.mode : null,
        url: location.href
      };
    }

    function itemApiPath(suffix) {
      const query = new URLSearchParams();
      if (state.ownerUserId) query.set('owner_user_id', String(state.ownerUserId));
      const search = query.toString();
      return `/api/items/${encodeURIComponent(state.itemId)}${suffix}${search ? `?${search}` : ''}`;
    }

    function countNotChanged(result) {
      const counts = result && result.counts ? result.counts : {};
      return Number(counts.failed || 0) + Number(counts.blocked || 0) + Number(counts.skipped || 0);
    }

    function readPageSignature() {
      return Detection.createPageSignature(document, location.href);
    }

    function handleDescriptionViewFailure(error) {
      if (rootScope.console && typeof rootScope.console.error === 'function') {
        rootScope.console.error('[OnFrame] A interface de descrição falhou.', error);
      }
    }

    return {
      id: 'description',
      label: 'Descrição',
      getStatus: getDescriptionStatus,
      handlePageContextChange,
      hide: hideDescription,
      isBusy: () => Boolean(state.busy || state.loading || state.saving),
      isLoaded: () => Boolean(state.loaded),
      reload: reloadDescription,
      reset: resetState,
      scheduleRender,
      show: showDescription,
      start: startDescription
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
