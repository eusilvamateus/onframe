(function (rootScope) {
  rootScope.OnFrameCommerceModule = {
    createCommerceModule
  };

  function createCommerceModule(services) {
    const Shared = services.Shared;
    const Detection = services.Detection;
    const CommerceModel = services.CommerceModel;
    const api = services.api;
    const toast = services.toast;
    const requestPageContextReload = services.requestPageContextReload || (() => Promise.resolve(null));
    const isProductPageUrl = Detection.isProductPageUrl;
    const formatarPeriodo = rootScope.OnFramePeriod && rootScope.OnFramePeriod.formatarPeriodo;
    const CommerceActionsView = rootScope.OnFrameCommerceActionsView;
    const CommercePriceView = rootScope.OnFrameCommercePriceView;
    const CommercePromotionsView = rootScope.OnFrameCommercePromotionsView;
    const CommercePromotionManagerView = rootScope.OnFrameCommercePromotionManagerView;
    const CommerceDirectDiscountView = rootScope.OnFrameCommerceDirectDiscountView;
    const hasCommerceActionsView = Boolean(
      CommerceActionsView &&
      typeof CommerceActionsView.render === 'function' &&
      typeof CommerceActionsView.renderBadge === 'function' &&
      typeof CommerceActionsView.unmount === 'function'
    );
    if (!hasCommerceActionsView) throw new Error('Ações de comércio indisponíveis.');
    const hasCommercePriceView = Boolean(
      CommercePriceView &&
      typeof CommercePriceView.render === 'function' &&
      typeof CommercePriceView.unmount === 'function'
    );
    if (!hasCommercePriceView) throw new Error('Interface de preço indisponível.');
    const hasCommercePromotionsView = Boolean(
      CommercePromotionsView &&
      typeof CommercePromotionsView.render === 'function' &&
      typeof CommercePromotionsView.unmount === 'function'
    );
    if (!hasCommercePromotionsView) throw new Error('Interface de promoções indisponível.');
    const hasCommercePromotionManagerView = Boolean(
      CommercePromotionManagerView &&
      typeof CommercePromotionManagerView.render === 'function' &&
      typeof CommercePromotionManagerView.unmount === 'function'
    );
    if (!hasCommercePromotionManagerView) throw new Error('Gerenciador de promoções indisponível.');
    const hasCommerceDirectDiscountView = Boolean(
      CommerceDirectDiscountView &&
      typeof CommerceDirectDiscountView.render === 'function' &&
      typeof CommerceDirectDiscountView.unmount === 'function'
    );
    if (!hasCommerceDirectDiscountView) throw new Error('Interface de desconto direto indisponível.');
    const toUserError = (err) =>
      CommerceModel.friendlyError(Shared.toUserError(err, { logPrefix: '[OnFrame comercio] detalhe tecnico:' }));
    const LISTING_REQUEST_CONCURRENCY = 20;
    const PROMOTION_TYPE_LABELS = Object.freeze({
      DEAL: 'Campanha com melhor exposição',
      MARKETPLACE_CAMPAIGN: 'Campanha com aporte do Mercado Livre',
      SMART: 'Campanha do Mercado Livre',
      PRICE_MATCHING: 'Campanha de preço competitivo',
      PRICE_MATCHING_MELI_ALL: 'Campanha do Mercado Livre',
      PRE_NEGOTIATED: 'Campanha de coparticipação',
      UNHEALTHY_STOCK: 'Liquidação de estoque Full',
      LIGHTNING: 'Campanha rápida com estoque reservado',
      SMART_LIGHTNING: 'Campanha relâmpago cofinanciada',
      DOD: 'Campanha de um dia',
      VOLUME: 'Desconto por quantidade',
      PRICE_DISCOUNT: 'Desconto do anúncio',
      SELLER_CAMPAIGN: 'Campanha do vendedor',
      SELLER_COUPON_CAMPAIGN: 'Cupom do vendedor',
      BANK: 'Desconto por pagamento'
    });

    const state = {
      context: null,
      itemId: null,
      ownerUserId: null,
      inline: null,
      popoverRoot: null,
      modalRoot: null,
      directDiscountModalRoot: null,
      loaded: false,
      busy: false,
      visible: true,
      priceLoading: false,
      promotionLoading: false,
      priceSummary: null,
      promotionSummary: null,
      priceError: '',
      promotionError: '',
      surface: 'pdp',
      popoverAnchor: null,
      listingRecords: new Map(),
      listingCache: new Map(),
      listingQueue: [],
      listingResolving: 0,
      listingSummaryCache: new Map(),
      listingSummaryQueue: [],
      listingSummaryResolving: 0,
      listingMutationObserver: null,
      listingScanTimer: null,
      listingActiveRecord: null,
      actionError: '',
      popover: null,
      promotionPopoverExpanded: false,
      priceEditing: false,
      priceDraft: '',
      priceBulkEnabled: false,
      priceBulkPreview: null,
      priceBulkHash: '',
      priceBulkError: '',
      priceFeedback: null,
      operationPending: '',
      operationPendingKey: '',
      operationPendingAction: '',
      detailsOpen: false,
      promotionModalOpen: false,
      directDiscountModalOpen: false,
      promotionFormKey: '',
      promotionFormAction: '',
      promotionFormEstimate: null,
      promotionDraftValues: {},
      promotionEstimates: {},
      promotionEstimateTimers: {},
      promotionEstimateRequestId: 0,
      promotionBulkEnabled: false,
      promotionSearch: '',
      promotionTab: 'all',
      promotionStatusFilters: [],
      promotionTypeFilters: [],
      promotionFinancialFilters: [],
      promotionOptimistic: {},
      promotionFeedback: null,
      promotionRemovalKey: '',
      renderTimer: null,
      requestId: 0,
      pageSignature: '',
      viewportEventsReady: false,
      documentEventsReady: false
    };

    function startCommerce() {
      bindViewportEvents();
      bindDocumentEvents();
      state.pageSignature = readPageSignature();
      if (state.visible) mountCommerce();
    }

    function resetState(options = {}) {
      const preserveListing = options.preserveListing === true;
      removeInline();
      removePopover();
      removeModal();
      removeDirectDiscountModal();
      if (state.renderTimer) clearTimeout(state.renderTimer);
      state.context = null;
      state.itemId = null;
      state.ownerUserId = null;
      state.loaded = false;
      state.busy = false;
      state.visible = true;
      state.priceLoading = false;
      state.promotionLoading = false;
      state.priceSummary = null;
      state.promotionSummary = null;
      state.priceError = '';
      state.promotionError = '';
      state.surface = 'pdp';
      state.popoverAnchor = null;
      state.listingActiveRecord = null;
      state.actionError = '';
      state.popover = null;
      state.promotionPopoverExpanded = false;
      state.priceEditing = false;
      state.priceDraft = '';
      state.priceBulkEnabled = false;
      state.priceBulkPreview = null;
      state.priceBulkHash = '';
      state.priceBulkError = '';
      state.priceFeedback = null;
      state.operationPending = '';
      state.operationPendingKey = '';
      state.operationPendingAction = '';
      state.detailsOpen = false;
      state.promotionModalOpen = false;
      state.directDiscountModalOpen = false;
      state.promotionFormKey = '';
      state.promotionFormAction = '';
      state.promotionFormEstimate = null;
      state.promotionDraftValues = {};
      clearPromotionEstimateTimers();
      state.promotionEstimates = {};
      state.promotionOptimistic = {};
      state.promotionFeedback = null;
      state.promotionRemovalKey = '';
      state.promotionBulkEnabled = false;
      resetPromotionListFilters();
      state.renderTimer = null;
      state.requestId += 1;
      state.pageSignature = readPageSignature();
      if (!preserveListing) resetListingState();
    }

    function scheduleRender(delay = 120) {
      if (state.renderTimer) return;
      state.renderTimer = setTimeout(() => {
        state.renderTimer = null;
        mountCommerce();
      }, delay);
    }

    function readPageSignature() {
      return Detection.createPageSignature(document, location.href);
    }

    function handlePageContextChange(update) {
      const status = update && update.status ? update.status : '';
      const pageSignature = update && update.signature ? update.signature : readPageSignature();

      if (status === 'not_product') {
        if (state.surface !== 'listing') {
          resetState({ preserveListing: true });
          state.surface = 'listing';
        }
        mountCommerce();
        return;
      }

      if (state.surface === 'listing') {
        resetListingState();
        state.surface = 'pdp';
      }

      if (status === 'loading') {
        state.pageSignature = pageSignature;
        state.busy = true;
        state.loaded = false;
        state.actionError = '';
        state.popover = null;
        state.priceEditing = false;
        state.promotionModalOpen = false;
        state.directDiscountModalOpen = false;
        mountCommerce();
        return;
      }

      if (status === 'hydration-error') {
        if (!state.context) {
          state.loaded = true;
          state.busy = false;
          state.actionError = update && update.error ? update.error : 'Não foi possível ler este anúncio.';
          mountCommerce();
        }
        return;
      }

      if (status === 'error') {
        state.context = null;
        state.itemId = null;
        state.ownerUserId = null;
        state.loaded = true;
        state.busy = false;
        state.actionError = update && update.error ? update.error : 'Não foi possível ler este anúncio.';
        mountCommerce();
        return;
      }

      if (status !== 'ready' && status !== 'quick-ready') return;

      if ((status === 'ready' || status === 'quick-ready') && isSameResolvedItem(update.context) && state.context) {
        state.context = update.context;
        state.pageSignature = pageSignature;
        state.busy = false;
        state.loaded = true;
        mountCommerce();
        return;
      }

      state.pageSignature = pageSignature;
      state.actionError = '';
      state.popover = null;
      state.priceEditing = false;
      state.promotionModalOpen = false;
      state.directDiscountModalOpen = false;
      void loadContext(update.context);
    }

    function isSameResolvedItem(context) {
      const nextItemId = context && context.item && context.item.id ? String(context.item.id) : '';
      const nextOwnerId =
        context && context.ownerAccount && context.ownerAccount.user_id ? String(context.ownerAccount.user_id) : '';
      return Boolean(
        nextItemId &&
        state.itemId &&
        nextItemId === String(state.itemId) &&
        nextOwnerId === String(state.ownerUserId || '')
      );
    }

    async function loadContext(context) {
      state.busy = true;
      state.loaded = false;
      state.actionError = '';
      const requestId = ++state.requestId;

      try {
        if (!context) throw new Error('Contexto do anúncio indisponível.');
        if (requestId !== state.requestId) return;
        state.context = context;
        state.itemId = context && context.item && context.item.id ? context.item.id : null;
        state.ownerUserId =
          context && context.ownerAccount && context.ownerAccount.user_id ? context.ownerAccount.user_id : null;
        state.loaded = true;
        state.pageSignature =
          context && context.page && context.page.signature ? context.page.signature : readPageSignature();
        mountCommerce();
        await loadSummaries(requestId);
      } catch (err) {
        if (requestId !== state.requestId) return;
        state.context = null;
        state.itemId = null;
        state.ownerUserId = null;
        state.loaded = true;
        state.actionError = toUserError(err);
        mountCommerce();
      } finally {
        if (requestId === state.requestId) {
          state.busy = false;
          mountCommerce();
        }
      }
    }

    async function loadSummaries(parentRequestId = state.requestId) {
      if (!state.itemId) return;
      state.priceLoading = true;
      state.promotionLoading = true;
      state.priceError = '';
      state.promotionError = '';
      mountCommerce();

      const [priceResult, promotionResult] = await Promise.allSettled([
        api(itemApiPath('/pricing/summary')),
        api(itemApiPath('/promotions/summary'))
      ]);
      if (parentRequestId !== state.requestId) return;

      if (priceResult.status === 'fulfilled') {
        state.priceSummary = priceResult.value;
        state.priceError = '';
      } else {
        state.priceSummary = null;
        state.priceError = toUserError(priceResult.reason);
      }

      if (promotionResult.status === 'fulfilled') {
        state.promotionSummary = promotionResult.value;
        reconcileOptimisticPromotionsFromSummary();
        state.promotionError = '';
      } else {
        state.promotionSummary = null;
        state.promotionError = toUserError(promotionResult.reason);
      }

      state.priceLoading = false;
      state.promotionLoading = false;
      syncActiveListingSummaries();
      mountCommerce();
    }

    function syncActiveListingSummaries() {
      const record = state.listingActiveRecord;
      if (state.surface !== 'listing' || !record || record.itemId !== state.itemId) return;
      const entry = getListingSummaryEntry(record.itemId);
      entry.price = {
        status: state.priceError ? 'error' : 'ready',
        value: state.priceSummary,
        error: state.priceError,
        context: record.context
      };
      entry.promotions = {
        status: state.promotionError ? 'error' : 'ready',
        value: state.promotionSummary,
        error: state.promotionError,
        context: record.context
      };
      syncListingSummaryRecords(record.itemId);
    }

    function mountCommerce() {
      if (!state.visible) {
        removeInline();
        removePopover();
        removeModal();
        removeDirectDiscountModal();
        return;
      }

      if (isProductPageUrl(location.href)) {
        mountProductCommerce();
        return;
      }

      if (isListingPageUrl()) {
        mountListingCommerce();
        return;
      }

      removeInline();
      removePopover();
      removeModal();
      removeDirectDiscountModal();
    }

    function mountProductCommerce() {
      const anchor = findPriceAnchor();
      if (!anchor || !state.loaded || (!state.context && !state.actionError)) {
        removeInline();
        removePopover();
        removeModal();
        removeDirectDiscountModal();
        return;
      }

      if (!state.inline) {
        state.inline = document.createElement('div');
        state.inline.className = 'onframe-commerce-inline';
      }

      if (state.inline.parentElement !== anchor.parentElement || state.inline.previousElementSibling !== anchor) {
        anchor.insertAdjacentElement('afterend', state.inline);
      }

      renderInline();
      renderPopover();
      renderModal();
      renderDirectDiscountModal();
    }

    function mountListingCommerce() {
      removeInline();
      startListingObserver();

      if (state.listingActiveRecord && !state.listingActiveRecord.card.isConnected) {
        closePopover();
        state.listingActiveRecord = null;
      }

      renderPopover();
      renderModal();
      renderDirectDiscountModal();
    }

    function isListingPageUrl() {
      const host = String(location.hostname || '').toLowerCase();
      const path = String(location.pathname || '');
      if (host === 'lista.mercadolivre.com.br') return true;
      return /(^|\.)mercadolivre\.com\.br$/.test(host) && /^\/(?:loja|perfil)(?:\/|$)/.test(path);
    }

    function isStorefrontListingPage() {
      return String(location.hostname || '').toLowerCase() !== 'lista.mercadolivre.com.br';
    }

    function startListingObserver() {
      if (!isListingPageUrl()) return;

      if (!state.listingMutationObserver && typeof MutationObserver === 'function' && document.body) {
        state.listingMutationObserver = new MutationObserver((mutations) => {
          if (mutations.some((mutation) => mutation.type === 'childList')) scheduleListingScan();
        });
        state.listingMutationObserver.observe(document.body, { childList: true, subtree: true });
      }

      scheduleListingScan(0);
    }

    function stopListingObserver() {
      if (state.listingMutationObserver) state.listingMutationObserver.disconnect();
      state.listingMutationObserver = null;
      if (state.listingScanTimer) clearTimeout(state.listingScanTimer);
      state.listingScanTimer = null;
    }

    function resetListingState() {
      stopListingObserver();
      state.listingRecords.forEach((record) => removeListingRecord(record));
      state.listingRecords.clear();
      state.listingCache.clear();
      state.listingQueue = [];
      state.listingResolving = 0;
      state.listingSummaryCache.clear();
      state.listingSummaryQueue = [];
      state.listingSummaryResolving = 0;
      state.listingActiveRecord = null;
    }

    function scheduleListingScan(delay = 120) {
      if (state.listingScanTimer) return;
      state.listingScanTimer = setTimeout(() => {
        state.listingScanTimer = null;
        scanListingCards();
      }, delay);
    }

    function scanListingCards() {
      if (!state.visible || !isListingPageUrl()) return;
      const selector = isStorefrontListingPage() ? '.poly-card' : 'li.ui-search-layout__item';
      const cards = Array.from(document.querySelectorAll(selector));
      const currentCards = new Set(cards);

      state.listingRecords.forEach((record, card) => {
        if (!card.isConnected || !currentCards.has(card)) {
          removeListingRecord(record);
          state.listingRecords.delete(card);
        }
      });

      cards.forEach((card) => {
        if (!card || !card.isConnected || card.closest('#onblide-ml-root')) return;
        const link = card.querySelector('a.poly-component__title[href]');
        const itemId = extractListingItemId(link && link.href);
        const current = state.listingRecords.get(card);

        if (!itemId || !link) {
          if (current) {
            removeListingRecord(current);
            state.listingRecords.delete(card);
          }
          return;
        }

        if (current && current.itemId === itemId) return;
        if (current) removeListingRecord(current);

        const record = {
          card,
          link,
          itemId,
          controls: null,
          controlsLayoutFrame: null,
          originalMinHeight: null,
          badge: null,
          media: null,
          context: null,
          priceSummary: null,
          promotionSummary: null,
          priceError: '',
          promotionError: '',
          priceLoading: false,
          promotionLoading: false
        };
        state.listingRecords.set(card, record);
        observeListingRecord(record);
      });
    }

    function observeListingRecord(record) {
      const cached = state.listingCache.get(record.itemId);
      if (cached && cached.status === 'owned') {
        applyListingOwnership(record, cached.context);
        return;
      }
      if (cached && (cached.status === 'not-owned' || cached.status === 'error')) return;
      queueListingResolution(record.itemId);
    }

    function queueListingResolution(itemId) {
      const current = state.listingCache.get(itemId);
      if (
        current &&
        (current.status === 'queued' ||
          current.status === 'loading' ||
          current.status === 'owned' ||
          current.status === 'not-owned' ||
          current.status === 'error')
      )
        return;
      state.listingCache.set(itemId, { status: 'queued', context: null });
      state.listingQueue.push(itemId);
      drainListingQueue();
    }

    function drainListingQueue() {
      while (state.listingResolving < LISTING_REQUEST_CONCURRENCY && state.listingQueue.length) {
        const itemId = state.listingQueue.shift();
        const entry = state.listingCache.get(itemId);
        if (!entry || entry.status !== 'queued') continue;
        state.listingResolving += 1;
        entry.status = 'loading';
        void resolveListingItem(itemId).finally(() => {
          state.listingResolving = Math.max(0, state.listingResolving - 1);
          drainListingQueue();
        });
      }
    }

    async function resolveListingItem(itemId) {
      const entry = state.listingCache.get(itemId);
      if (!entry) return;

      try {
        const context = await api('/api/resolve/quick', {
          method: 'POST',
          body: JSON.stringify({
            url: location.href,
            html: '',
            pageIdentity: { canonicalItemId: itemId }
          })
        });
        if (!context || !context.item || String(context.item.id || '') !== itemId)
          throw new Error('Não foi possível confirmar este anúncio.');
        entry.status = 'owned';
        entry.context = context;
      } catch (err) {
        entry.status = Number(err && err.status) === 403 || Number(err && err.status) === 404 ? 'not-owned' : 'error';
        entry.error = toUserError(err);
      }

      state.listingRecords.forEach((record) => {
        if (record.itemId !== itemId) return;
        if (entry.status === 'owned') applyListingOwnership(record, entry.context);
        else removeListingDecorations(record);
      });
    }

    function applyListingOwnership(record, context) {
      if (!record || !record.card.isConnected || !context) return;
      record.context = context;
      syncListingSummaryRecord(record);
      mountListingBadge(record);
      mountListingControls(record);
      queueListingSummary(record, 'price');
      queueListingSummary(record, 'promotions');
    }

    function mountListingBadge(record) {
      const media = record.card.querySelector('.poly-card__portada') || record.card;
      if (!record.badge) {
        const badge = document.createElement('span');
        badge.className = 'onframe-commerce-listing-badge';
        media.appendChild(badge);
        record.badge = badge;
        record.media = media;
        media.classList.add('onframe-commerce-listing-media');
        CommerceActionsView.renderBadge(badge, {
          onError: (error) => console.error('[OnFrame comércio] selo da listagem:', error)
        });
      }
    }

    function mountListingControls(record) {
      const price = record.card.querySelector('.poly-component__price');
      if (!price) return;
      if (!record.controls) {
        const controls = document.createElement('div');
        controls.className = 'onframe-commerce-listing-controls';
        controls.setAttribute('aria-label', 'Ações OnFrame para este anúncio');
        price.insertAdjacentElement('afterend', controls);
        record.controls = controls;
      }
      renderListingControls(record);
    }

    function renderListingControls(record) {
      if (!record || !record.controls) return;
      CommerceActionsView.render(record.controls, buildListingActionsViewModel(record), {
        onChange: (type) => handleListingActionChange(record, type),
        onReload: () => {},
        onError: (error) => console.error('[OnFrame comércio] ações da listagem:', error)
      });
      scheduleListingControlsLayout(record);
    }

    function buildListingActionsViewModel(record) {
      return {
        active: state.listingActiveRecord === record ? state.popover : null,
        price: {
          label: 'Preço',
          tone: commercePriceActionTone(listingPriceTone(record))
        },
        promotions: {
          label: 'Promoção',
          tone: commerceActionTone(listingPromotionTone(record))
        }
      };
    }

    function handleListingActionChange(record, type) {
      if (!type) {
        if (state.listingActiveRecord === record) closePopover();
        return;
      }
      activateListingPopover(record, type, record.controls);
    }

    function scheduleListingControlsLayout(record) {
      if (!record || !record.card || !record.controls || record.controlsLayoutFrame) return;
      record.controlsLayoutFrame = requestAnimationFrame(() => {
        record.controlsLayoutFrame = null;
        syncListingControlsLayout(record);
      });
    }

    function syncListingControlsLayout(record) {
      if (!record || !record.card || !record.controls || !record.card.isConnected) return;
      const cardRect = record.card.getBoundingClientRect();
      if (!cardRect.height) return;
      const contentBottom = Array.from(record.card.querySelectorAll('*')).reduce((bottom, element) => {
        const rect = element.getBoundingClientRect();
        return Math.max(bottom, rect.bottom);
      }, cardRect.bottom);
      const overflow = Math.ceil(contentBottom - cardRect.bottom);
      if (overflow <= 0) return;
      if (!record.originalMinHeight) {
        record.originalMinHeight = {
          value: record.card.style.getPropertyValue('min-height'),
          priority: record.card.style.getPropertyPriority('min-height')
        };
      }
      record.card.style.setProperty('min-height', `${Math.ceil(cardRect.height + overflow + 8)}px`, 'important');
    }

    function listingPriceTone(record) {
      if (record.priceError) return 'warn';
      if (record.priceSummary) {
        const state = CommerceModel.getPriceState(record.priceSummary);
        if (state.blocker) return 'warn';
        return state.label === 'Com promoção' ? 'green' : '';
      }
      return record.card.querySelector('s') ? 'green' : '';
    }

    function listingPromotionTone(record) {
      if (record.promotionError) return 'warn';
      if (!record.promotionSummary) return '';
      const state = CommerceModel.getPromotionState(record.promotionSummary);
      return state.tone;
    }

    function removeListingRecord(record) {
      if (!record) return;
      if (state.listingActiveRecord === record) {
        closePopover();
        state.listingActiveRecord = null;
      }
      removeListingDecorations(record);
    }

    function removeListingDecorations(record) {
      if (!record) return;
      restoreListingControlsLayout(record);
      if (record.controls) {
        CommerceActionsView.unmount(record.controls);
        record.controls.remove();
      }
      if (record.badge) {
        CommerceActionsView.unmount(record.badge);
        record.badge.remove();
      }
      if (record.media) record.media.classList.remove('onframe-commerce-listing-media');
      record.controls = null;
      record.badge = null;
      record.media = null;
    }

    function restoreListingControlsLayout(record) {
      if (!record) return;
      if (record.controlsLayoutFrame) cancelAnimationFrame(record.controlsLayoutFrame);
      record.controlsLayoutFrame = null;
      if (!record.originalMinHeight || !record.card) return;
      if (record.originalMinHeight.value) {
        record.card.style.setProperty('min-height', record.originalMinHeight.value, record.originalMinHeight.priority);
      } else {
        record.card.style.removeProperty('min-height');
      }
      record.originalMinHeight = null;
    }

    function activateListingPopover(record, type, anchor) {
      if (!record || !record.context) return;
      const previousRecord = state.listingActiveRecord;
      state.requestId += 1;
      state.surface = 'listing';
      state.listingActiveRecord = record;
      state.popoverAnchor = anchor;
      state.context = record.context;
      state.itemId = record.itemId;
      state.ownerUserId =
        record.context.ownerAccount && record.context.ownerAccount.user_id ? record.context.ownerAccount.user_id : null;
      state.loaded = true;
      state.busy = false;
      state.priceSummary = record.priceSummary;
      state.promotionSummary = record.promotionSummary;
      state.priceError = record.priceError;
      state.promotionError = record.promotionError;
      state.priceLoading = record.priceLoading;
      state.promotionLoading = record.promotionLoading;
      state.actionError = '';
      state.priceEditing = false;
      state.detailsOpen = false;
      if (previousRecord && previousRecord !== record) renderListingControls(previousRecord);
      openPopover(type);

      if (type === 'price' && !record.priceSummary && !record.priceLoading) void loadListingSummary(record, 'price');
      if (type === 'promotions' && !record.promotionSummary && !record.promotionLoading)
        void loadListingSummary(record, 'promotions');
    }

    function loadListingSummary(record, type) {
      queueListingSummary(record, type, { force: true });
    }

    function getListingSummaryEntry(itemId) {
      let entry = state.listingSummaryCache.get(itemId);
      if (entry) return entry;
      entry = {
        price: { status: 'idle', value: null, error: '' },
        promotions: { status: 'idle', value: null, error: '' }
      };
      state.listingSummaryCache.set(itemId, entry);
      return entry;
    }

    function queueListingSummary(record, type, options = {}) {
      if (!record || !record.context || !record.itemId) return;
      const entry = getListingSummaryEntry(record.itemId);
      const summary = entry[type];
      if (!summary) return;
      if (!options.force && summary.status !== 'idle') {
        syncListingSummaryRecord(record);
        return;
      }
      if (summary.status === 'queued' || summary.status === 'loading') return;

      summary.status = 'queued';
      summary.value = null;
      summary.error = '';
      summary.context = record.context;
      syncListingSummaryRecords(record.itemId);
      state.listingSummaryQueue.push({ itemId: record.itemId, type });
      drainListingSummaryQueue();
    }

    function drainListingSummaryQueue() {
      while (state.listingSummaryResolving < LISTING_REQUEST_CONCURRENCY && state.listingSummaryQueue.length) {
        const job = state.listingSummaryQueue.shift();
        const entry = state.listingSummaryCache.get(job.itemId);
        const summary = entry && entry[job.type];
        if (!summary || summary.status !== 'queued') continue;
        state.listingSummaryResolving += 1;
        summary.status = 'loading';
        syncListingSummaryRecords(job.itemId);
        void resolveListingSummary(job.itemId, job.type).finally(() => {
          state.listingSummaryResolving = Math.max(0, state.listingSummaryResolving - 1);
          drainListingSummaryQueue();
        });
      }
    }

    async function resolveListingSummary(itemId, type) {
      const entry = state.listingSummaryCache.get(itemId);
      const summary = entry && entry[type];
      if (!summary || !summary.context) return;
      const suffix = type === 'price' ? '/pricing/summary' : '/promotions/summary';
      const record = { itemId, context: summary.context };

      try {
        summary.value = await api(listingItemApiPath(record, suffix));
        summary.error = '';
        summary.status = 'ready';
      } catch (err) {
        summary.value = null;
        summary.error = toUserError(err);
        summary.status = 'error';
      } finally {
        syncListingSummaryRecords(itemId);
      }
    }

    function syncListingSummaryRecords(itemId) {
      state.listingRecords.forEach((record) => {
        if (record.itemId !== itemId || !record.context) return;
        syncListingSummaryRecord(record);
        mountListingControls(record);
      });
      if (state.listingActiveRecord && state.listingActiveRecord.itemId === itemId) {
        syncListingPopoverState(state.listingActiveRecord);
      }
    }

    function syncListingSummaryRecord(record) {
      if (!record || !record.itemId) return;
      const entry = state.listingSummaryCache.get(record.itemId);
      if (!entry) return;
      record.priceSummary = entry.price.value;
      record.promotionSummary = entry.promotions.value;
      record.priceError = entry.price.error;
      record.promotionError = entry.promotions.error;
      record.priceLoading = entry.price.status === 'queued' || entry.price.status === 'loading';
      record.promotionLoading = entry.promotions.status === 'queued' || entry.promotions.status === 'loading';
    }

    function listingItemApiPath(record, suffix) {
      const query = new URLSearchParams();
      const ownerUserId =
        record && record.context && record.context.ownerAccount && record.context.ownerAccount.user_id;
      if (ownerUserId) query.set('owner_user_id', String(ownerUserId));
      const search = query.toString();
      return `/api/items/${encodeURIComponent(record.itemId)}${suffix}${search ? `?${search}` : ''}`;
    }

    function syncListingPopoverState(record) {
      if (state.listingActiveRecord !== record) return;
      state.priceSummary = record.priceSummary;
      state.promotionSummary = record.promotionSummary;
      state.priceError = record.priceError;
      state.promotionError = record.promotionError;
      state.priceLoading = record.priceLoading;
      state.promotionLoading = record.promotionLoading;
      mountListingControls(record);
      mountCommerce();
    }

    function extractListingItemId(href) {
      if (!href) return null;
      try {
        const url = new URL(href, location.href);
        const hash = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
        const sources = [hash, url.searchParams];
        for (const params of sources) {
          const wid = normalizeListingItemId(params.get('wid'));
          if (wid) return wid;
        }
        for (const params of sources) {
          const filter = String(params.get('pdp_filters') || '');
          const match = filter.match(/(?:^|,)item_id:(MLB\d+)(?:,|$)/i);
          const itemId = normalizeListingItemId(match && match[1]);
          if (itemId) return itemId;
        }
        if (/\/p\/MLB\d+/i.test(url.pathname)) return null;
        return normalizeListingItemId((url.href.match(/\b(MLB-?\d+)\b/i) || [])[1]);
      } catch (err) {
        return null;
      }
    }

    function normalizeListingItemId(value) {
      const normalized = String(value || '')
        .toUpperCase()
        .replace('-', '');
      return /^MLB\d+$/.test(normalized) ? normalized : null;
    }

    function renderInline() {
      if (!state.inline) return;
      CommerceActionsView.render(state.inline, buildInlineActionsViewModel(), {
        onChange: handleInlineActionChange,
        onReload: () => void reloadCommerce(),
        onError: (error) => console.error('[OnFrame comércio] ações do anúncio:', error)
      });
    }

    function buildInlineActionsViewModel() {
      if (state.actionError && !state.context) {
        return { error: shortMessage(state.actionError) };
      }

      const priceState = state.priceSummary ? CommerceModel.getPriceState(state.priceSummary) : null;
      const promotionSummary = effectivePromotionSummary();
      const promotionState = promotionSummary ? CommerceModel.getPromotionState(promotionSummary) : null;
      const priceTone = state.priceError ? 'warn' : priceState ? priceState.tone : 'muted';
      const promotionTone = state.promotionError ? 'warn' : promotionState ? promotionState.tone : 'muted';
      const promotionLabel = state.promotionLoading ? 'Promoção' : promotionState ? promotionState.label : 'Promoção';

      return {
        active: state.popover,
        price: {
          label: 'Preço',
          tone: commercePriceActionTone(priceTone)
        },
        promotions: {
          label: promotionLabel,
          tone: commerceActionTone(promotionTone)
        }
      };
    }

    function handleInlineActionChange(type) {
      if (!type) {
        closePopover();
        return;
      }
      state.popoverAnchor = state.inline;
      openPopover(type);
    }

    function commercePriceActionTone(tone) {
      return tone === 'warn' ? 'danger' : 'neutral';
    }

    function commerceActionTone(tone) {
      if (tone === 'success') return 'success';
      if (tone === 'warning') return 'warning';
      if (tone === 'primary') return 'primary';
      if (tone === 'warn') return 'danger';
      return 'neutral';
    }

    function renderPopover() {
      if (!state.popover) {
        removePopover();
        return;
      }

      if (!state.popoverRoot) {
        state.popoverRoot = document.createElement('div');
        state.popoverRoot.className = 'onframe-commerce-popover-root';
        document.body.appendChild(state.popoverRoot);
      }

      state.popoverRoot.classList.toggle('promotions', state.popover === 'promotions');
      state.popoverRoot.classList.toggle('price-summary', state.popover === 'price');
      state.popoverRoot.classList.toggle('listing', state.surface === 'listing');
      if (state.popover === 'price') {
        CommercePromotionsView.unmount(state.popoverRoot);
        CommercePriceView.render(state.popoverRoot, buildPricePopoverViewModel(), {
          onClose: closePopover,
          onReload: () => void reloadCommerce(),
          onToggleDetails: () => {
            state.detailsOpen = !state.detailsOpen;
            rerenderPopover();
          },
          onOpenPromotion: () => openPopover('promotions', { expandCurrent: true }),
          onEdit: startPriceEdit,
          onDraftChange: updatePriceDraft,
          onBulkChange: updatePriceBulkEnabled,
          onSave: () => void savePrice(),
          onCancel: cancelPriceEdit,
          onError: handleCommercePriceViewFailure
        });
        positionPopover();
        return;
      }

      CommercePriceView.unmount(state.popoverRoot);
      CommercePromotionsView.render(state.popoverRoot, buildPromotionPopoverViewModel(), {
        onClose: closePopover,
        onReload: () => void reloadCommerce(),
        onManage: openPromotionModal,
        onError: handleCommercePromotionsViewFailure
      });
      positionPopover();
    }

    function buildPricePopoverViewModel() {
      if (state.priceLoading) {
        return {
          mode: 'loading',
          title: 'Preço',
          badge: { label: 'Carregando', tone: 'neutral' },
          error: ''
        };
      }

      if (state.priceError) {
        return {
          mode: 'error',
          title: 'Preço',
          badge: { label: 'Aviso', tone: 'warning' },
          error: shortMessage(state.priceError)
        };
      }

      const priceState = CommerceModel.getPriceState(state.priceSummary);
      const badge = { label: priceState.label, tone: priceBadgeTone(priceState.tone) };
      if (state.priceEditing) {
        return {
          mode: 'edit',
          title: 'Editar preço base',
          badge,
          error: shortMessage(state.actionError),
          feedback: state.priceFeedback ? Object.assign({}, state.priceFeedback) : null,
          draft: state.priceDraft,
          draftKey: `${state.itemId || 'item'}:price-edit`,
          busy: state.busy,
          canBulk: canUseBulkActions(),
          bulkEnabled: state.priceBulkEnabled,
          bulkStatus: buildPriceBulkStatus(),
          saveLabel: priceSaveLabel()
        };
      }

      const snapshot = priceSnapshot(state.priceSummary, priceState);
      return {
        mode: 'summary',
        title: 'Preço',
        badge: null,
        error: shortMessage(state.actionError),
        feedback: state.priceFeedback ? Object.assign({}, state.priceFeedback) : null,
        fields: [snapshot].concat(priceSummaryCosts(state.priceSummary).fields),
        sellingIn: snapshot.originalPrice ? priceSellingPromotion() : null,
        scenarios: priceStackableScenarios(state.priceSummary),
        details: state.detailsOpen ? priceState.detail : '',
        hasBlocker: Boolean(priceState.blocker),
        canEdit: priceState.canEdit
      };
    }

    function buildPromotionPopoverViewModel() {
      if (state.promotionLoading) {
        return {
          mode: 'loading',
          badge: { label: 'Carregando', tone: 'neutral' },
          error: ''
        };
      }

      if (state.promotionError) {
        return {
          mode: 'error',
          badge: { label: 'Aviso', tone: 'warning' },
          error: shortMessage(state.promotionError)
        };
      }

      const groups = CommerceModel.collectPromotionGroups(effectivePromotionSummary());
      const campaignEntry = promotionPopoverCampaignEntry(groups);
      const couponEntries = promotionPopoverCouponEntries(groups);
      const paymentEntries = promotionPopoverPaymentEntries(groups);
      return {
        mode: 'summary',
        badge: null,
        error: shortMessage(state.actionError),
        campaign: campaignEntry ? promotionPopoverCampaign(campaignEntry) : null,
        coupons: couponEntries.map(promotionPopoverCoupon),
        couponApplicationLabel: couponApplicationLabel(),
        payments: paymentEntries.map(promotionPopoverPayment),
        expandCampaign: state.promotionPopoverExpanded,
        empty: !campaignEntry && !couponEntries.length && !paymentEntries.length
      };
    }

    function priceSellingPromotion() {
      const groups = CommerceModel.collectPromotionGroups(effectivePromotionSummary());
      const entry = currentPromotionEntry(pricePromotionEntries(groups));
      if (!entry) return null;
      return {
        id: entry.id || entry.promotion_id || entry.offer_id || '',
        label: entry.label || 'Promoção atual'
      };
    }

    function renderModal() {
      if (!state.promotionModalOpen) {
        removeModal();
        return;
      }

      if (!state.modalRoot) {
        state.modalRoot = document.createElement('div');
        state.modalRoot.className = 'onframe-commerce-modal-root';
        document.body.appendChild(state.modalRoot);
      }
      CommercePromotionManagerView.render(state.modalRoot, buildPromotionManagerViewModel(), {
        onClose: closePromotionModal,
        onReload: () => void reloadCommerce(),
        onCreateDiscount: openDirectDiscountForm,
        onSearchChange: setPromotionManagerSearch,
        onTabChange: setPromotionManagerTab,
        onToggleStatus: togglePromotionManagerStatus,
        onToggleType: togglePromotionManagerType,
        onToggleFinancial: togglePromotionManagerFinancial,
        onClearAdvancedFilters: clearPromotionManagerAdvancedFilters,
        onClearFilters: clearPromotionManagerFilters,
        onOpen: openPromotionManagerCard,
        onCancelEdit: cancelPromotionForm,
        onDraftChange: updatePromotionManagerDraft,
        onSaveProductFinancials: savePromotionProductFinancials,
        onToggleBulk: togglePromotionManagerBulk,
        onConfirm: (key, action) => void commitPromotionManagerAction(key, action),
        onRemove: openPromotionManagerRemoval,
        onCancelRemove: closePromotionManagerRemoval,
        onConfirmRemove: confirmPromotionManagerRemoval,
        onError: handlePromotionManagerViewError
      });
    }

    function renderDirectDiscountModal() {
      if (!state.directDiscountModalOpen) {
        removeDirectDiscountModal();
        return;
      }

      if (!state.directDiscountModalRoot) {
        state.directDiscountModalRoot = document.createElement('div');
        state.directDiscountModalRoot.className = 'onframe-commerce-direct-discount-modal-root';
        document.body.appendChild(state.directDiscountModalRoot);
      }

      const model = buildDirectDiscountViewModel();
      if (!model) {
        state.directDiscountModalOpen = false;
        state.promotionModalOpen = true;
        removeDirectDiscountModal();
        renderModal();
        return;
      }
      CommerceDirectDiscountView.render(state.directDiscountModalRoot, model, {
        onClose: cancelPromotionForm,
        onPercentageChange: updateDirectDiscountPercentage,
        onPriceChange: updateDirectDiscountPrice,
        onDateChange: updateDirectDiscountDates,
        onSubmit: submitDirectDiscount,
        onError: handleDirectDiscountViewError
      });
    }

    function buildDirectDiscountViewModel() {
      const key = directDiscountKey();
      const entry = buildDirectDiscountDraftEntry();
      if (!entry) return null;
      ensureDirectDiscountDraft(key, entry);
      const draft = state.promotionDraftValues[key] || {};
      const priceValidation = promotionPriceFieldValidation(entry, draft.deal_price);
      const percentageValidation = directDiscountPercentageValidation(draft.discount_percentage);
      const startDate = parseIsoDate(draft.start_date);
      const endDate = parseIsoDate(draft.finish_date);
      return {
        key,
        busy: state.busy,
        error: shortMessage(state.actionError),
        basePrice: CommerceModel.formatMoney(entry.original_price, itemCurrency()),
        percentage: draft.discount_percentage || '',
        price: draft.deal_price || '',
        percentageError: (percentageValidation && percentageValidation.message) || '',
        priceError: (priceValidation && priceValidation.message) || '',
        startDate,
        endDate,
        dateError: startDate && endDate && endDate < startDate ? 'A data final deve ser posterior ao início.' : '',
        actionLabel: directDiscountActionLabel(),
        estimate: buildDirectDiscountEstimateViewModel(key)
      };
    }

    function buildDirectDiscountEstimateViewModel(key) {
      const record = state.promotionEstimates[key] || null;
      const loading = Boolean(record && record.status === 'loading');
      const estimate = record && record.status === 'ready' ? record.data : null;
      const currency = (estimate && estimate.currency_id) || itemCurrency();
      const commission = (estimate && estimate.commission) || null;
      const shipping = (estimate && estimate.shipping) || null;
      const commissionPercentage = financialPercentage(commission && commission.effective_percentage);
      const value = (amount, sign = '') => {
        const normalized = moneyOrNull(amount);
        return normalized === null ? '—' : `${sign}${CommerceModel.formatMoney(normalized, currency)}`;
      };
      let message = '';
      if (record && record.status === 'blocked') message = record.message || 'Preço fora da faixa.';
      else if (record && record.status === 'error') message = record.message || 'Custos indisponíveis.';
      else if (estimate && !promotionEstimateMetrics(estimate, currency).length) message = 'Custos indisponíveis.';
      else if (estimate && estimate.complete === false) message = 'Dados financeiros incompletos.';
      return {
        loading,
        message,
        tone: 'danger',
        commission: {
          label:
            commissionPercentage === null
              ? 'Tarifa de venda'
              : `Tarifa de venda · ${formatPercent(commissionPercentage)}`,
          description: saleFeeDescription(commission, currency),
          value: value(saleFeeAmount(commission), '−')
        },
        benefits: promotionCreditMetrics(commission, currency),
        shipping: { label: 'Frete', value: value(shipping && shipping.amount, '−') },
        total: { label: 'Você recebe', value: value(estimate && estimate.youReceive) }
      };
    }

    function buildPromotionManagerViewModel() {
      const rows = state.promotionSummary ? buildPromotionRows().map(buildPromotionManagerRow) : [];
      const query = normalizeSearchText(state.promotionSearch);
      const filteredRows = rows.filter((row) => {
        if (state.promotionTab !== 'all' && row.type !== state.promotionTab) return false;
        if (state.promotionStatusFilters.length && !state.promotionStatusFilters.includes(row.status.id)) return false;
        if (state.promotionTypeFilters.length && !state.promotionTypeFilters.includes(row.type)) return false;
        if (state.promotionFinancialFilters.includes('fee_reduction') && !row.hasFeeReduction) return false;
        if (!query) return true;
        return normalizeSearchText(`${row.name} ${row.typeLabel}`).includes(query);
      });
      return {
        loading: state.promotionLoading,
        busy: state.busy,
        error: shortMessage(state.promotionError),
        feedback:
          state.promotionFeedback && state.promotionFeedback.scope === 'section'
            ? Object.assign({}, state.promotionFeedback)
            : null,
        tab: state.promotionTab,
        search: state.promotionSearch,
        statusFilters: state.promotionStatusFilters.slice(),
        typeFilters: state.promotionTypeFilters.slice(),
        financialFilters: state.promotionFinancialFilters.slice(),
        canCreateDiscount: canCreateDirectDiscount(),
        openKey: state.promotionFormKey,
        removalKey: state.promotionRemovalKey,
        rows: filteredRows
      };
    }

    function buildPromotionManagerRow(row) {
      const { entry, kind, key, status } = row;
      const type = ['campaign', 'coupon', 'direct', 'payment'].includes(row.type) ? row.type : 'campaign';
      const available = status === 'available';
      const locallyApplied = entry && entry._onframeLocalState === 'applied';
      const locallySyncing = entry && entry._onframeLocalState === 'syncing';
      const locallyPending = locallyApplied || locallySyncing;
      const canCreate =
        available &&
        !locallyPending &&
        (kind === 'eligible-offer' ||
          (kind === 'stackable-offer' && isCandidatePromotion(entry)) ||
          (kind === 'discount-offer' && isCandidatePromotion(entry)));
      const canUpdate = !available && !locallyPending && CommerceModel.canUpdateOffer(entry);
      const canDelete = !available && !locallyPending && CommerceModel.canDeleteOffer(entry);
      const formAction = state.promotionFormKey === key ? state.promotionFormAction : '';
      const readOnly = formAction === 'details';
      const fields = CommerceModel.getUserFields(
        canUpdate ? CommerceModel.getOfferUpdateFields(entry) : CommerceModel.getOfferCreateFields(entry)
      );
      const draft = state.promotionDraftValues[key] || {};
      const showPriceField = fields.includes('deal_price') && !readOnly;
      const showStockField = fields.includes('stock') && !readOnly;
      const draftPrice = Object.prototype.hasOwnProperty.call(draft, 'deal_price')
        ? draft.deal_price
        : defaultFieldValue('deal_price', entry);
      const draftStock = Object.prototype.hasOwnProperty.call(draft, 'stock')
        ? draft.stock
        : defaultFieldValue('stock', entry);
      const priceError = showPriceField ? promotionManagerPriceError(entry, draftPrice) : '';
      const stockError = showStockField ? promotionManagerStockError(entry, draftStock) : '';
      const validationError = priceError || stockError;
      const displayPrice = promotionDisplayPrice(entry);
      const originalPrice = promotionManagerOriginalPrice(entry);
      const discount = discountPercent(originalPrice, displayPrice);
      const estimateRecord = state.promotionEstimates[key] || entry._onframeEstimate || null;
      const estimate = estimateRecord && estimateRecord.status === 'ready' ? estimateRecord.data : null;
      const coupon = couponCampaignData(entry);
      const couponMinimum = couponAmount(coupon.min_purchase_amount);
      const couponMaximum =
        couponPresentation(entry).subtype === 'FIXED_PERCENTAGE' ? couponAmount(coupon.max_purchase_amount) : null;
      const metrics = promotionManagerMetrics(estimate);
      const calculation = promotionManagerCalculation(entry, estimate);
      const margin = promotionContributionMargin(estimate);
      const productFinancials = promotionManagerProductFinancials(estimate);
      const contributionMargin = estimate && estimate.contributionMargin;
      const completeMargin = contributionMargin && contributionMargin.complete;
      const feeReduction = moneyOrNull(
        estimate && estimate.commission && estimate.commission.promotion_reduction_amount
      );
      const feedback =
        state.promotionFeedback &&
        state.promotionFeedback.key === key &&
        ['form', 'card'].includes(state.promotionFeedback.scope)
          ? Object.assign({}, state.promotionFeedback)
          : null;
      return {
        key,
        group: available ? 'available' : 'applied',
        type,
        name: entry.label || (type === 'coupon' ? 'Cupom' : 'Promoção'),
        typeLabel: promotionTypeLabel(entry, type),
        period: formatPromotionManagerPeriod(entry),
        status: {
          id: status,
          label: locallySyncing ? 'Sincronizando' : locallyApplied ? 'Aplicada' : promotionListStatusLabel(status),
          tone: locallySyncing ? 'primary' : undefined
        },
        hasFeeReduction: hasPromotionFeeReduction(entry),
        condition:
          type === 'coupon'
            ? { primary: couponBenefitLabel(entry), secondary: '' }
            : {
                primary: displayPrice ? CommerceModel.formatMoney(displayPrice, itemCurrency()) : '—',
                secondary: discount ? `${discount}% OFF` : ''
              },
        result:
          type === 'coupon'
            ? {
                primary: couponMinimum === null ? '—' : formatCouponMoney(couponMinimum),
                secondary: couponMaximum === null ? '' : formatCouponMoney(couponMaximum),
                loading: false
              }
            : {
                primary:
                  estimate && moneyOrNull(estimate.youReceive) !== null
                    ? CommerceModel.formatMoney(estimate.youReceive, estimate.currency_id || itemCurrency())
                    : '',
                secondary: estimateRecord && estimateRecord.status === 'error' ? 'Valores indisponíveis.' : '',
                feeReduction:
                  feeReduction !== null && feeReduction > 0
                    ? CommerceModel.formatMoney(
                        feeReduction,
                        (estimate && estimate.commission && estimate.commission.currency_id) || itemCurrency()
                      )
                    : '',
                loading: Boolean(estimateRecord && estimateRecord.status === 'loading')
              },
        marginSummary: {
          amount:
            completeMargin && Number.isFinite(Number(contributionMargin.amount))
              ? CommerceModel.formatMoney(
                  contributionMargin.amount,
                  (estimate && estimate.currency_id) || itemCurrency(),
                  contributionMargin.costDecimalPlaces
                )
              : '',
          percentage: completeMargin ? formatContributionPercent(contributionMargin.percentage) : '',
          tone:
            completeMargin && contributionMargin.minimumStatus === 'below_minimum'
              ? 'danger'
              : completeMargin && Number(contributionMargin.amount) < 0
                ? 'danger'
                : completeMargin
                  ? 'success'
                  : '',
          recommendation:
            completeMargin && contributionMargin.minimumStatus === 'below_minimum'
              ? `Abaixo da MC mínima de ${formatContributionPercent(contributionMargin.minimumPercentage)}`
              : '',
          recommendationTone: 'below-minimum',
          loading: Boolean(estimateRecord && estimateRecord.status === 'loading')
        },
        metrics,
        calculation,
        margin,
        productFinancials,
        feedback,
        canUpdate,
        canDelete,
        locallyApplied: locallyPending,
        createAction: canCreate,
        formOpen: state.promotionFormKey === key,
        formAction,
        readOnly,
        showPriceField,
        showStockField,
        draftPrice,
        draftStock,
        priceError,
        stockError,
        validationError,
        priceHint: promotionManagerPriceHint(originalPrice, draftPrice),
        stockHint: promotionManagerStockHint(entry),
        canBulk: canUseBulkActions(),
        bulkEnabled: state.promotionBulkEnabled,
        busy: state.busy,
        confirmLabel: state.promotionBulkEnabled
          ? formAction === 'update'
            ? 'Alterar em todas as variações'
            : 'Aplicar em todas as variações'
          : formAction === 'update'
            ? 'Confirmar alteração'
            : 'Confirmar aplicação'
      };
    }

    function promotionManagerOriginalPrice(entry) {
      return (
        moneyOrNull(entry && entry.original_price) ||
        moneyOrNull(
          state.priceSummary &&
            state.priceSummary.salePrice &&
            (state.priceSummary.salePrice.regular_amount || state.priceSummary.salePrice.amount)
        )
      );
    }

    function promotionManagerPriceError(entry, value) {
      const raw = String(value || '').trim();
      if (!raw) return 'Informe um preço válido.';
      const price = CommerceModel.parseMoneyInput(raw);
      if (!price) return 'Informe um preço válido.';
      const original = promotionManagerOriginalPrice(entry);
      if (original && price >= original) return 'O preço promocional deve ser menor que o preço original.';
      const rangeWarning = promotionRangeWarning(entry, price);
      return rangeWarning || '';
    }

    function promotionManagerPriceHint(originalPrice, value) {
      const price = CommerceModel.parseMoneyInput(value);
      const discount = discountPercent(originalPrice, price);
      if (!originalPrice || !discount) return '';
      return `${discount}% OFF sobre o preço original ${CommerceModel.formatMoney(originalPrice, itemCurrency())}`;
    }

    function promotionManagerStockRange(entry) {
      const stock = (entry && entry.stock) || (entry && entry.raw && entry.raw.stock) || {};
      const min = positiveIntegerOrNull(stock.min);
      const max = positiveIntegerOrNull(stock.max);
      return { min, max };
    }

    function promotionManagerStockError(entry, value) {
      const stock = positiveIntegerOrNull(value);
      if (stock === null) return 'Informe um estoque válido.';
      const range = promotionManagerStockRange(entry);
      if (range.min !== null && stock < range.min) return `O estoque mínimo é ${range.min}.`;
      if (range.max !== null && stock > range.max) return `O estoque máximo é ${range.max}.`;
      return '';
    }

    function promotionManagerStockHint(entry) {
      const range = promotionManagerStockRange(entry);
      if (range.min !== null && range.max !== null) return `Entre ${range.min} e ${range.max} unidades.`;
      if (range.min !== null) return `A partir de ${range.min} unidades.`;
      if (range.max !== null) return `Até ${range.max} unidades.`;
      return '';
    }

    function promotionManagerMetrics(estimate) {
      if (!estimate) return [];
      const currency = estimate.currency_id || itemCurrency();
      const metrics = promotionEstimateMetrics(estimate, currency)
        .filter((metric) => ['Você recebe', 'Tarifa de venda', 'Crédito promocional', 'Frete'].includes(metric.label))
        .map((metric) => ({
          label: metric.label,
          value: metric.value,
          tone: metric.label === 'Você recebe' ? 'success' : ''
        }));
      const margin = estimate.contributionMargin;
      if (margin && margin.complete && Number.isFinite(Number(margin.amount))) {
        metrics.push({
          label: 'Margem de contribuição',
          value: `${CommerceModel.formatMoney(margin.amount, currency, margin.costDecimalPlaces)} · ${formatContributionPercent(margin.percentage)}`,
          tone: margin.amount >= 0 ? 'success' : 'danger'
        });
      }
      return metrics;
    }

    function promotionManagerCalculation(entry, estimate) {
      if (!estimate) return [];
      const currency = estimate.currency_id || itemCurrency();
      const rows = promotionResultPopoverRows(entry, estimate, currency).map((item) => ({
        label: item.label,
        value: item.value,
        description: item.description,
        benefit: item.benefit,
        tone: item.tone === 'total' ? 'success' : ''
      }));
      const margin = estimate.contributionMargin;
      if (!margin || !margin.complete) return rows;
      rows.push({
        label: 'Custo do produto',
        value: formatContributionCost(margin.productCost, currency, margin.costDecimalPlaces),
        description: '',
        tone: ''
      });
      rows.push({
        label: 'Impostos',
        value: formatContributionCost(margin.taxAmount, currency, margin.costDecimalPlaces),
        description: `${formatContributionPercent(margin.taxRate)} sobre o preço promocional · ${promotionTaxSourceLabel(margin.taxSource)}`,
        tone: ''
      });
      (margin.customCosts || []).forEach((cost) =>
        rows.push({
          label: cost.description,
          value: formatContributionCost(cost.amount, currency, margin.costDecimalPlaces),
          description:
            cost.type === 'percentage'
              ? `${formatContributionPercent(cost.value)} sobre o preço promocional`
              : 'Custo fixo por unidade',
          tone: ''
        })
      );
      rows.push({
        label: 'Margem de contribuição',
        value: CommerceModel.formatMoney(margin.amount, currency, margin.costDecimalPlaces),
        description: formatContributionPercent(margin.percentage),
        tone: margin.amount >= 0 ? 'success' : 'danger'
      });
      return rows;
    }

    function promotionContributionMargin(estimate) {
      const margin = estimate && estimate.contributionMargin;
      if (!margin) return null;
      if (margin.complete) return { available: true, message: '' };
      const missing = Array.isArray(margin.missing) ? margin.missing : [];
      const message = missing.includes('product')
        ? 'Margem indisponível: nenhum produto ativo foi encontrado para o SKU deste anúncio.'
        : missing.includes('tax_rate')
          ? 'Margem indisponível: configure uma alíquota no produto, na conta ou no workspace.'
          : missing.includes('you_receive')
            ? 'Margem indisponível: o Mercado Livre não retornou o valor líquido desta promoção.'
            : 'Margem indisponível: revise os dados financeiros deste produto.';
      return { available: false, message };
    }

    function promotionManagerProductFinancials(estimate) {
      const margin = estimate && estimate.contributionMargin;
      const productMatch = estimate && estimate.productMatch;
      const product = productMatch && productMatch.status === 'matched' ? productMatch.product : null;
      if (!margin || !margin.complete || !product || !product.id) return null;
      const values = {
        productCost: Number(margin.productCost),
        taxRate: Number(margin.taxRate),
        salePrice: Number(margin.salePrice),
        youReceive: Number(margin.youReceive),
        customCost: Number(margin.customCost || 0)
      };
      if (Object.values(values).some((value) => !Number.isFinite(value))) return null;
      return {
        productId: product.id,
        canEdit: productMatch.canEdit === true,
        productCost: values.productCost,
        taxRate: values.taxRate,
        taxSource: margin.taxSource || '',
        salePrice: values.salePrice,
        youReceive: values.youReceive,
        customCost: values.customCost,
        currency: margin.currency_id || estimate.currency_id || itemCurrency(),
        costDecimalPlaces: margin.costDecimalPlaces
      };
    }

    function promotionTaxSourceLabel(source) {
      return (
        {
          product_account: 'exceção do produto para esta conta',
          product: 'configuração do produto',
          account: 'configuração da conta',
          workspace: 'padrão do workspace'
        }[source] || 'configuração tributária'
      );
    }

    function formatContributionCost(amount, currency, decimalPlaces) {
      const value = Number(amount);
      return Number.isFinite(value) && value >= 0
        ? `-${CommerceModel.formatMoney(value, currency, decimalPlaces)}`
        : '—';
    }

    function formatContributionPercent(value) {
      const number = Number(value);
      return Number.isFinite(number) ? `${number.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '—';
    }

    function formatPromotionManagerPeriod(entry) {
      const start =
        parseIsoDate(entry && (entry.start_date || entry.startDate)) ||
        parseDateValue(entry && (entry.start_date || entry.startDate));
      const endValue = entry && (entry.end_date || entry.finish_date || entry.endDate || entry.finishDate);
      const end = parseIsoDate(endValue) || parseDateValue(endValue);
      if (!start && !end) return 'Sem prazo definido';
      const format = (date) =>
        date ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '') : '';
      if (start && end) return `${format(start)} – ${format(end)}`;
      return format(start || end);
    }

    function setPromotionManagerSearch(value) {
      state.promotionSearch = String(value || '');
      rerenderModal();
    }

    function setPromotionManagerTab(tab) {
      state.promotionTab = ['campaign', 'coupon'].includes(tab) ? tab : 'all';
      state.promotionTypeFilters = [];
      rerenderModal();
    }

    function togglePromotionManagerStatus(status) {
      const values = state.promotionStatusFilters;
      state.promotionStatusFilters = values.includes(status)
        ? values.filter((item) => item !== status)
        : values.concat(status);
      rerenderModal();
    }

    function togglePromotionManagerType(type) {
      const values = state.promotionTypeFilters;
      state.promotionTab = 'all';
      state.promotionTypeFilters = values.includes(type) ? values.filter((item) => item !== type) : values.concat(type);
      rerenderModal();
    }

    function togglePromotionManagerFinancial(financial) {
      const values = state.promotionFinancialFilters;
      state.promotionFinancialFilters = values.includes(financial)
        ? values.filter((item) => item !== financial)
        : values.concat(financial);
      rerenderModal();
    }

    function clearPromotionManagerAdvancedFilters() {
      state.promotionStatusFilters = [];
      state.promotionTypeFilters = [];
      state.promotionFinancialFilters = [];
      rerenderModal();
    }

    function clearPromotionManagerFilters() {
      resetPromotionListFilters();
      state.promotionTab = 'all';
      rerenderModal();
    }

    function promotionManagerRow(key) {
      return buildPromotionRows().find((row) => row.key === key) || null;
    }

    function openPromotionManagerCard(key, action) {
      if (state.busy) return;
      const row = promotionManagerRow(key);
      if (!row) return;
      state.promotionFormEstimate = state.promotionEstimates[key] || null;
      state.promotionFormKey = key;
      state.promotionFormAction = action;
      state.promotionBulkEnabled = false;
      state.actionError = '';
      state.promotionFeedback = null;
      if (action === 'details') {
        schedulePromotionEstimate(key, row.entry, {}, true);
      } else {
        const fields = CommerceModel.getUserFields(
          action === 'update'
            ? CommerceModel.getOfferUpdateFields(row.entry)
            : CommerceModel.getOfferCreateFields(row.entry)
        );
        ensurePromotionDraft(key, row.entry, fields);
        schedulePromotionEstimate(key, row.entry, state.promotionDraftValues[key] || {});
      }
      rerenderModal();
    }

    function updatePromotionManagerDraft(key, field, value) {
      const row = promotionManagerRow(key);
      if (!row || state.busy) return;
      state.promotionDraftValues[key] = Object.assign({}, state.promotionDraftValues[key] || {}, { [field]: value });
      state.actionError = '';
      clearPromotionFeedback(key);
      schedulePromotionEstimate(key, row.entry, state.promotionDraftValues[key]);
      rerenderModal();
    }

    async function savePromotionProductFinancials(key, changes) {
      const row = promotionManagerRow(key);
      const estimateRecord = state.promotionEstimates[key] || (row && row.entry && row.entry._onframeEstimate) || null;
      const estimate = estimateRecord && estimateRecord.status === 'ready' ? estimateRecord.data : null;
      const financials = promotionManagerProductFinancials(estimate);
      if (!row || !financials) {
        return { ok: false, error: 'Os dados financeiros deste produto estão indisponíveis.' };
      }
      const payload = {};
      if (changes && Object.prototype.hasOwnProperty.call(changes, 'cost')) payload.cost = changes.cost;
      if (changes && Object.prototype.hasOwnProperty.call(changes, 'taxRate')) payload.taxRate = changes.taxRate;
      if (!Object.keys(payload).length) return { ok: true };
      try {
        await api(itemApiPath('/product-financials'), {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        clearPromotionEstimate(key);
        schedulePromotionEstimate(key, row.entry, state.promotionDraftValues[key] || {}, true);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: toUserError(error) };
      }
    }

    function togglePromotionManagerBulk(checked) {
      if (state.busy) return;
      state.promotionBulkEnabled = Boolean(checked);
      state.actionError = '';
      clearPromotionFeedback(state.promotionFormKey);
      rerenderModal();
    }

    function clearPromotionFeedback(key = '') {
      if (!state.promotionFeedback) return;
      if (key && state.promotionFeedback.key && state.promotionFeedback.key !== key) return;
      state.promotionFeedback = null;
    }

    function setPromotionFeedback({ scope, key = '', tone = 'danger', title = '', message = '' }) {
      state.promotionFeedback = {
        scope,
        key,
        tone,
        title,
        message: shortMessage(message)
      };
      return state.promotionFeedback;
    }

    function handlePromotionManagerViewError(error) {
      state.actionError = toUserError(error);
      state.promotionModalOpen = false;
      removeModal();
    }

    function directDiscountActionLabel() {
      const key = directDiscountKey();
      if (isPromotionActionPending(key, 'create')) return 'Criando desconto...';
      return 'Criar desconto';
    }

    function buildPromotionRows() {
      const groups = CommerceModel.collectPromotionGroups(effectivePromotionSummary());
      const directDiscount = buildDiscountEntry();
      const sources = [
        {
          kind: 'active-offer',
          entries: currentPromotionEntries(campaignPromotionEntries(pricePromotionEntries(groups)))
        },
        { kind: 'stackable-offer', entries: stackablePromotionEntries(groups) },
        { kind: 'eligible-offer', entries: promotionOpportunityEntries(groups) },
        { kind: 'discount-offer', entries: directDiscount ? [directDiscount] : [] },
        { kind: 'programmed-offer', entries: programmedPromotionEntries(groups) }
      ];
      return sources
        .flatMap(({ kind, entries }) =>
          entries.map((entry, index) => {
            const status = promotionListStatus(entry, kind);
            const type = promotionListType(entry);
            return { entry, kind, index, key: `${kind}:${index}`, status, type };
          })
        )
        .sort(comparePromotionRows);
    }

    function comparePromotionRows(left, right) {
      const statusOrder = { active: 0, programmed: 1, available: 2 };
      const statusDifference = (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9);
      if (statusDifference) return statusDifference;
      const leftDate = promotionEndTimestamp(left.entry);
      const rightDate = promotionEndTimestamp(right.entry);
      if (leftDate !== rightDate) return leftDate - rightDate;
      return String(left.entry.label || '').localeCompare(String(right.entry.label || ''), 'pt-BR');
    }

    function promotionListStatus(entry, kind) {
      const display = String((entry && entry.display_status) || '').toLowerCase();
      if (display === 'active') return 'active';
      if (display === 'programmed') return 'programmed';
      if (display === 'available') return 'available';
      if (kind === 'discount-offer') {
        const directStatus = String(
          (entry && (entry.status || entry.api_status || entry.status_bucket || entry.bucket)) || ''
        ).toLowerCase();
        return ['scheduled', 'programmed', 'pending'].includes(directStatus) ? 'programmed' : 'active';
      }
      if (kind === 'programmed-offer') return 'programmed';
      if (kind === 'eligible-offer' || kind === 'discount-offer') return 'available';
      return 'active';
    }

    function promotionListStatusLabel(status) {
      if (status === 'programmed') return 'Programada';
      if (status === 'available') return 'Elegível';
      return 'Ativa';
    }

    function effectivePromotionSummary() {
      const summary = state.promotionSummary;
      const optimistic = Object.values(state.promotionOptimistic || {});
      if (!summary || !optimistic.length) return summary;
      const sourceOffers = summary.offers || {};
      const offers = Object.assign({}, sourceOffers, {
        active: Array.isArray(sourceOffers.active) ? sourceOffers.active.slice() : [],
        scheduled: Array.isArray(sourceOffers.scheduled) ? sourceOffers.scheduled.slice() : [],
        eligible: Array.isArray(sourceOffers.eligible) ? sourceOffers.eligible.slice() : [],
        finished: Array.isArray(sourceOffers.finished) ? sourceOffers.finished.slice() : []
      });

      optimistic.forEach((change) => {
        ['active', 'scheduled', 'eligible', 'finished'].forEach((bucket) => {
          offers[bucket] = offers[bucket].filter((entry) => !promotionMutationMatches(entry, change.identity));
        });
        if (change.action !== 'delete') offers.active.unshift(change.entry);
      });
      return Object.assign({}, summary, { offers });
    }

    function reconcileOptimisticPromotionsFromSummary() {
      const optimistic = Object.values(state.promotionOptimistic || {});
      if (!optimistic.length || !state.promotionSummary) return;
      const groups = CommerceModel.collectPromotionGroups(state.promotionSummary);
      const applied = groups.activeOffers.concat(groups.scheduledOffers);
      optimistic.forEach((change) => {
        const remoteEntry = applied.find((entry) => promotionMutationMatches(entry, change.identity));
        const confirmed =
          change.action === 'delete'
            ? !remoteEntry
            : Boolean(remoteEntry) &&
              (change.action !== 'update' || promotionMutationValuesMatch(remoteEntry, change.values));
        if (confirmed) {
          delete state.promotionOptimistic[change.identity];
        }
      });
    }

    function promotionMutationValuesMatch(entry, values) {
      const expected = values || {};
      if (Object.prototype.hasOwnProperty.call(expected, 'deal_price')) {
        const expectedPrice = CommerceModel.parseMoneyInput(expected.deal_price);
        const remotePrice = moneyOrNull(promotionDisplayPrice(entry));
        if (expectedPrice !== null && remotePrice !== expectedPrice) return false;
      }
      if (Object.prototype.hasOwnProperty.call(expected, 'stock') && String(expected.stock || '').trim()) {
        if (Number(entry && entry.stock) !== Number(expected.stock)) return false;
      }
      if (expected.start_date && isoDateOnly(entry && entry.start_date) !== isoDateOnly(expected.start_date))
        return false;
      if (expected.finish_date && isoDateOnly(entry && entry.finish_date) !== isoDateOnly(expected.finish_date)) {
        return false;
      }
      return true;
    }

    function promotionMutationIdentity(entry) {
      if (!entry) return '';
      const type = String(entry.type || '').toUpperCase();
      const promotionId = String(entry.id || entry.promotion_id || '');
      if (promotionId) return `${type}:${promotionId}`;
      const offerId = String(entry.offer_id || entry.ref_id || '');
      if (offerId) return `${type}:${offerId}`;
      if (type === 'PRICE_DISCOUNT' || entry.direct_discount_draft) return 'PRICE_DISCOUNT:direct';
      return promotionIdentity(entry);
    }

    function promotionMutationMatches(entry, identity) {
      return Boolean(identity && promotionMutationIdentity(entry) === identity);
    }

    function optimisticPromotionEntry(entry, values, estimate) {
      const dealPrice = CommerceModel.parseMoneyInput(values && values.deal_price);
      const stackable = isStackablePromotion(entry);
      return Object.assign({}, entry, {
        price: dealPrice || entry.price,
        deal_price: dealPrice || entry.deal_price,
        stock: (values && values.stock) || entry.stock,
        start_date: (values && values.start_date) || entry.start_date,
        finish_date: (values && values.finish_date) || entry.finish_date,
        status: stackable ? 'started' : 'pending',
        api_status: stackable ? 'started' : 'pending',
        status_bucket: stackable ? 'applied' : 'pending',
        bucket: stackable ? 'active' : 'scheduled',
        display_status: stackable ? 'active' : 'programmed',
        candidate: false,
        is_current_price: false,
        _onframeLocalState: 'applied',
        _onframeEstimate: estimate || null
      });
    }

    function applyOptimisticPromotionMutation(entry, action, values, response, estimate) {
      const identity = promotionMutationIdentity(entry);
      if (!identity) return '';
      state.promotionOptimistic[identity] = {
        identity,
        action,
        values: Object.assign({}, values || {}),
        entry: optimisticPromotionEntry(entry, values, estimate),
        reconciliationId: String((response && response.reconciliationId) || '')
      };
      return identity;
    }

    function promotionListType(entry) {
      const type = String((entry && entry.type) || '').toUpperCase();
      if (type === 'SELLER_COUPON_CAMPAIGN') return 'coupon';
      if (type === 'BANK' || String((entry && entry.stackable_context) || '') === 'payment_method') return 'payment';
      if (type === 'PRICE_DISCOUNT') return 'direct';
      return 'campaign';
    }

    function promotionTypeLabel(entry, type) {
      const promotionType = String(
        (entry && (entry.type || entry.promotion_type || entry.campaign_type)) || ''
      ).toUpperCase();
      if (PROMOTION_TYPE_LABELS[promotionType]) return PROMOTION_TYPE_LABELS[promotionType];
      if (type === 'coupon') return 'Cupom do vendedor';
      if (type === 'payment') return 'Desconto por pagamento';
      if (type === 'direct') return 'Desconto do anúncio';
      return 'Promoção';
    }

    function promotionResultPopoverRows(entry, estimate, currency) {
      const price = moneyOrNull(estimate.dealPrice);
      const originalPrice =
        moneyOrNull(entry && entry.original_price) || moneyOrNull(estimate.item && estimate.item.price);
      const commission = saleFeeAmount(estimate.commission);
      const shipping = moneyOrNull(estimate.shipping && estimate.shipping.amount);
      const rows = [];

      if (price !== null) {
        rows.push({
          label: 'Preço promocional',
          description:
            originalPrice !== null && originalPrice !== price
              ? `Preço original ${CommerceModel.formatMoney(originalPrice, currency)}`
              : '',
          value: CommerceModel.formatMoney(price, currency)
        });
      }
      if (commission !== null) {
        rows.push({
          label: 'Tarifa de venda',
          description: saleFeeListingType(estimate.commission),
          benefit: saleFeeReductionLabel(estimate.commission, currency),
          value: formatPromotionCost(commission, currency)
        });
      }
      promotionCreditMetrics(estimate.commission, currency).forEach((metric) => rows.push(metric));
      if (shipping !== null) {
        rows.push({
          label: 'Frete',
          description: promotionShippingDescription(estimate.shipping),
          value: formatPromotionCost(shipping, currency)
        });
      }
      rows.push({
        label: 'Você recebe',
        value: CommerceModel.formatMoney(estimate.youReceive, currency),
        tone: 'total'
      });
      return rows;
    }

    function promotionShippingDescription(shipping) {
      if (!shipping) return '';
      if (shipping.free_shipping) return 'Grátis para o comprador';
      return shipping.paid_by === 'seller' ? 'Pago pelo vendedor' : 'Pago pelo comprador';
    }

    function formatPromotionCost(amount, currency) {
      const value = moneyOrNull(amount);
      return value === null ? '' : `-${CommerceModel.formatMoney(value, currency)}`;
    }

    function couponCampaignData(entry) {
      return entry && entry.coupon && typeof entry.coupon === 'object' ? entry.coupon : {};
    }

    function couponBenefitLabel(entry) {
      return couponPresentation(entry).benefit;
    }

    function couponApplicationLabel() {
      return 'Aplicado sobre o total da compra';
    }

    function couponPresentation(entry) {
      const coupon = couponCampaignData(entry);
      const subtype = String(coupon.sub_type || '')
        .trim()
        .toUpperCase();
      if (subtype === 'FIXED_PERCENTAGE') {
        const percentage = couponPositiveNumber(coupon.fixed_percentage);
        return {
          subtype,
          benefit: percentage === null ? 'Desconto não informado' : `${formatPercent(percentage)} OFF`
        };
      }
      if (subtype === 'FIXED_AMOUNT') {
        const amount = couponPositiveAmount(coupon.fixed_amount);
        return {
          subtype,
          benefit: amount === null ? 'Desconto não informado' : `${formatCouponMoney(amount)} OFF`
        };
      }
      return { subtype, benefit: 'Desconto não informado' };
    }

    function couponCompactTerms(entry) {
      const coupon = couponCampaignData(entry);
      const minimum = couponAmount(coupon.min_purchase_amount);
      const maximumRefund =
        couponPresentation(entry).subtype === 'FIXED_PERCENTAGE' ? couponAmount(coupon.max_purchase_amount) : null;
      return [
        minimum === null ? '' : `Mín. ${formatCouponMoney(minimum)}`,
        maximumRefund === null ? '' : `Até ${formatCouponMoney(maximumRefund)}`
      ].filter(Boolean);
    }

    function couponAmount(value) {
      if (value === null || value === undefined || value === '') return null;
      const amount = Number(value);
      return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
    }

    function couponPositiveAmount(value) {
      const amount = couponAmount(value);
      return amount !== null && amount > 0 ? amount : null;
    }

    function couponPositiveNumber(value) {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : null;
    }

    function formatCouponMoney(amount) {
      try {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: itemCurrency(),
          minimumFractionDigits: 2
        })
          .format(amount)
          .replace(/\u00a0/g, ' ');
      } catch (err) {
        return `R$ ${Number(amount).toFixed(2).replace('.', ',')}`;
      }
    }

    function promotionEndTimestamp(entry) {
      const value = entry && (entry.end_date || entry.finish_date || entry.endDate || entry.finishDate);
      const date = parseIsoDate(value) || parseDateValue(value);
      return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
    }

    function promotionStartTimestamp(entry) {
      const value = entry && (entry.start_date || entry.startDate);
      const date = parseIsoDate(value) || parseDateValue(value);
      return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
    }

    function normalizeSearchText(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .trim();
    }

    function resetPromotionListFilters() {
      state.promotionSearch = '';
      state.promotionTab = 'all';
      state.promotionStatusFilters = [];
      state.promotionTypeFilters = [];
      state.promotionFinancialFilters = [];
    }

    function promotionPopoverCampaignEntry(groups) {
      const active = currentPromotionEntry(pricePromotionEntries(groups));
      if (active) return active;
      const programmed = programmedPromotionEntries(groups)
        .slice()
        .sort((left, right) => {
          const difference = promotionStartTimestamp(left) - promotionStartTimestamp(right);
          if (difference) return difference;
          return String((left && left.label) || '').localeCompare(String((right && right.label) || ''), 'pt-BR');
        })[0];
      if (programmed) return programmed;
      return null;
    }

    function promotionPopoverCouponEntries(groups) {
      return stackablePromotionEntries(groups).filter((entry) => promotionListType(entry) === 'coupon');
    }

    function promotionPopoverPaymentEntries(groups) {
      return stackablePromotionEntries(groups).filter((entry) => promotionListType(entry) === 'payment');
    }

    function promotionPopoverCampaign(entry) {
      const originalPrice = promotionSummaryOriginalPrice(entry);
      const finalPrice = promotionSummaryDisplayPrice(entry);
      const discount = discountPercent(originalPrice, finalPrice);
      const period = formatPromotionPeriod(entry) || 'Sem vigência informada';
      return {
        label: entry.label || 'Promoção',
        typeLabel: promotionTypeLabel(entry, promotionListType(entry)),
        period,
        status: {
          label: promotionDisplayStatusLabel(entry),
          tone: promotionBadgeTone(promotionDisplayTone(entry))
        },
        discount: discount ? `${discount}% OFF` : '—',
        finalPrice: finalPrice ? CommerceModel.formatMoney(finalPrice, itemCurrency()) : '—',
        financialBenefit: promotionPopoverFinancialBenefit(entry)
      };
    }

    function promotionSummaryDisplayPrice(entry) {
      const displayPrice = promotionDisplayPrice(entry);
      if (displayPrice) return displayPrice;
      if (!entry || entry.is_current_price !== true) return null;
      return moneyOrNull(state.priceSummary && state.priceSummary.salePrice && state.priceSummary.salePrice.amount);
    }

    function promotionSummaryOriginalPrice(entry) {
      if (entry && entry.original_price) return entry.original_price;
      if (!entry || entry.is_current_price !== true) return null;
      return moneyOrNull(
        state.priceSummary && state.priceSummary.salePrice && state.priceSummary.salePrice.regular_amount
      );
    }

    function promotionPopoverFinancialBenefit(entry) {
      const benefits = promotionFinancialMetrics(entry, { originalPrice: promotionSummaryOriginalPrice(entry) }).filter(
        (metric) => metric.kind === 'meli-contribution' || metric.kind === 'fee-reduction'
      );
      if (!benefits.length) return null;
      const primary = benefits[0];
      const description = benefits
        .map((metric) => promotionFinancialListText(metric))
        .filter(Boolean)
        .join(' ');
      return {
        label: compactPromotionBenefitLabel(primary),
        value: primary.amountText || primary.percentageText,
        description,
        tone: primary.tone || ''
      };
    }

    function compactPromotionBenefitLabel(metric) {
      if (!metric) return 'Redução de tarifa';
      return metric.kind === 'fee-reduction' ? 'Bônus ML' : 'Redução de tarifa';
    }

    function promotionBadgeTone(tone) {
      return priceBadgeTone(tone);
    }

    function promotionPopoverCoupon(entry) {
      const period = formatPromotionPeriod(entry) || 'Sem vigência informada';
      const terms = couponCompactTerms(entry);
      return {
        label: entry.label || 'Cupom',
        period,
        benefit: couponBenefitLabel(entry),
        terms: terms.join(' · ') || 'Condições não informadas',
        status: {
          label: promotionDisplayStatusLabel(entry),
          tone: promotionBadgeTone(promotionDisplayTone(entry))
        }
      };
    }

    function promotionPopoverPayment(entry) {
      const payment = stackablePaymentLabel(entry);
      return {
        label: entry.label || (payment ? `Desconto no ${payment}` : 'Desconto por pagamento'),
        description: payment ? `Válido em pagamentos no ${payment}` : 'Condição definida no pagamento',
        benefit: promotionPopoverConditionalBenefit(entry)
      };
    }

    function promotionPopoverConditionalBenefit(entry) {
      const displayPrice = promotionDisplayPrice(entry);
      const discount = discountPercent(entry && entry.original_price, displayPrice);
      if (discount) return `${discount}% OFF`;
      const sellerPercentage = Number(entry && entry.seller_percentage);
      const meliPercentage = Number(entry && entry.meli_percentage);
      const percentage =
        (Number.isFinite(sellerPercentage) && sellerPercentage > 0 ? sellerPercentage : 0) +
        (Number.isFinite(meliPercentage) && meliPercentage > 0 ? meliPercentage : 0);
      if (percentage) return `${formatPercent(percentage)} OFF`;
      const boostedPercentage = Number(entry && (entry.discount_meli_boosted_percentage || entry.percentage));
      if (Number.isFinite(boostedPercentage) && boostedPercentage > 0) return `${formatPercent(boostedPercentage)} OFF`;
      const raw = entry && entry.raw && typeof entry.raw === 'object' ? entry.raw : {};
      const amount = moneyOrNull((entry && entry.discount_amount) || raw.discount_amount);
      return amount === null ? '' : `${CommerceModel.formatMoney(amount, itemCurrency())} OFF`;
    }

    function promotionFinancialFromEntry(entry, options = {}) {
      if (!entry) return { meli_contribution: null, seller_contribution: null, fee_reduction: null };
      if (entry.meli_contribution || entry.seller_contribution || entry.fee_reduction) return entry;

      const raw = entry.raw && typeof entry.raw === 'object' ? entry.raw : {};
      const benefits = entry.benefits || raw.benefits || {};
      const originalPrice =
        moneyOrNull(entry.original_price) || moneyOrNull(raw.original_price) || moneyOrNull(options.originalPrice);
      const meliPercentage = financialPercentage(entry.meli_percentage ?? raw.meli_percentage ?? benefits.meli_percent);
      const sellerPercentage = financialPercentage(
        entry.seller_percentage ?? raw.seller_percentage ?? benefits.seller_percent
      );
      const feeReductionAmount = moneyOrNull(entry.discount_meli_boost_amount ?? raw.discount_meli_boost_amount);
      const feeReductionPercentage = financialPercentage(
        entry.discount_meli_boosted_percentage ?? raw.discount_meli_boosted_percentage
      );
      const boosted =
        entry.boosted_offer === true ||
        (entry.boost && entry.boost.boosted_offer === true) ||
        raw.boosted_offer === true;
      return {
        meli_contribution: contributionFromPercentage(meliPercentage, originalPrice),
        seller_contribution: contributionFromPercentage(sellerPercentage, originalPrice),
        fee_reduction: boosted
          ? { amount: feeReductionAmount, percentage: feeReductionPercentage, boosted_offer: boosted }
          : null
      };
    }

    function contributionFromPercentage(percentage, originalPrice) {
      if (percentage === null) return null;
      return {
        amount: originalPrice !== null ? Math.round(originalPrice * percentage) / 100 : null,
        percentage
      };
    }

    function financialPercentage(value) {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : null;
    }

    function hasPromotionFeeReduction(entry) {
      const financial = promotionFinancialFromEntry(entry);
      return (
        hasPromotionFinancialValue(financial.meli_contribution) || hasPromotionFinancialValue(financial.fee_reduction)
      );
    }

    function hasPromotionFinancialValue(value) {
      return Boolean(value && (moneyOrNull(value.amount) !== null || financialPercentage(value.percentage) !== null));
    }

    function promotionFinancialMetrics(financial, options = {}) {
      const metrics = [];
      const currency = itemCurrency();
      const value = promotionFinancialFromEntry(financial, options);
      const meli = value.meli_contribution;
      const feeReduction = value.fee_reduction;

      if (meli && financialPercentage(meli.percentage) !== null) {
        metrics.push(
          buildPromotionBenefitMetric(
            'Com redução de tarifas',
            meli.amount,
            meli.percentage,
            currency,
            'meli-contribution'
          )
        );
      }
      if (
        feeReduction &&
        (moneyOrNull(feeReduction.amount) !== null || financialPercentage(feeReduction.percentage) !== null)
      ) {
        metrics.push(
          buildPromotionBenefitMetric(
            'Bônus do Mercado Livre',
            feeReduction.amount,
            feeReduction.percentage,
            currency,
            'fee-reduction'
          )
        );
      }
      return metrics;
    }

    function promotionFinancialListText(metric, state = 'active') {
      if (!metric) return '';
      const copy = promotionBenefitMessage(metric, state) || metric.copy || metric.value;
      if (metric.kind === 'fee-reduction') return `${metric.label}. ${copy}`;
      return copy || `${metric.label}: ${metric.value}`;
    }

    function currentPromotionEntries(entries) {
      return (Array.isArray(entries) ? entries : []).filter(
        (entry) => entry && !isStackablePromotion(entry) && entry.is_current_price === true
      );
    }

    function programmedPromotionEntries(groups) {
      const activeProgrammed = campaignPromotionEntries(groups.activeOffers).filter((entry) => {
        return (
          !isStackablePromotion(entry) && String((entry && entry.display_status) || '').toLowerCase() === 'programmed'
        );
      });
      const scheduled = campaignPromotionEntries(groups.scheduledOffers).filter((entry) => {
        return (
          !isStackablePromotion(entry) &&
          entry &&
          entry.is_current_price !== true &&
          String(entry.display_status || '').toLowerCase() === 'programmed'
        );
      });
      return uniquePromotionEntries(activeProgrammed.concat(scheduled));
    }

    function pricePromotionEntries(groups) {
      return uniquePromotionEntries([groups && groups.activeOffers, groups && groups.scheduledOffers].flat());
    }

    function stackablePromotionEntries(groups) {
      return uniquePromotionEntries(
        [groups && groups.activeOffers, groups && groups.eligibleOffers, groups && groups.scheduledOffers]
          .flat()
          .filter(isStackablePromotion)
      );
    }

    function currentPromotionEntry(entries) {
      return currentPromotionEntries(entries)[0] || null;
    }

    function promotionDisplayStatusLabel(entry) {
      const status = String((entry && entry.display_status) || '').toLowerCase();
      if (status === 'active') return 'Ativa';
      if (status === 'programmed') return 'Programada';
      if (status === 'available') return 'Elegível';
      if (status === 'finished') return 'Finalizada';
      return 'Informativa';
    }

    function promotionDisplayTone(entry) {
      const status = String((entry && entry.display_status) || '').toLowerCase();
      if (status === 'active') return 'success';
      if (status === 'programmed') return 'primary';
      if (status === 'available') return 'warning';
      return 'muted';
    }

    function priceSnapshot(summary, priceState) {
      const standard = summary && summary.standardPrice ? summary.standardPrice : {};
      const sale = summary && summary.salePrice ? summary.salePrice : null;
      const currency = itemCurrency();
      const standardAmount = Number(standard.amount || priceState.amount || 0);
      const saleAmount = Number((sale && sale.amount) || 0);
      const hasPromotionPrice = saleAmount > 0 && (!standardAmount || saleAmount !== standardAmount);
      const activeAmount = hasPromotionPrice ? saleAmount : standardAmount;
      const originalPrice =
        hasPromotionPrice && standardAmount ? CommerceModel.formatMoney(standardAmount, currency) : '';
      return {
        label: hasPromotionPrice ? 'Preço promocional' : 'Preço atual',
        value: CommerceModel.formatMoney(activeAmount, currency),
        originalPrice,
        tone: hasPromotionPrice ? 'primary' : ''
      };
    }

    function priceSummaryCosts(summary) {
      const currency = itemCurrency();
      const breakdown = summary && summary.costBreakdown ? summary.costBreakdown : null;
      const fields = [];
      if (!breakdown) return { fields };

      const commission = breakdown.commission || null;
      const shipping = breakdown.shipping || null;
      if (breakdown.complete && moneyOrNull(breakdown.you_receive) !== null) {
        fields.push({
          label: 'Você recebe',
          value: CommerceModel.formatMoney(breakdown.you_receive, currency),
          tone: 'success'
        });
      } else {
        fields.push({ label: 'Custos', value: 'Incompletos', tone: 'warning' });
      }
      if (commission && saleFeeAmount(commission) !== null) {
        fields.push({
          label: 'Tarifa de venda',
          value: CommerceModel.formatMoney(saleFeeAmount(commission), commission.currency_id || currency),
          description: saleFeeDescription(commission, currency)
        });
      }
      if (shipping && moneyOrNull(shipping.amount) !== null) {
        fields.push({
          label: 'Frete',
          value: CommerceModel.formatMoney(shipping.amount, shipping.currency_id || currency)
        });
      }
      promotionCreditMetrics(commission, currency).forEach((metric) => fields.push(metric));
      const margin = summary && summary.contributionMargin;
      if (margin && margin.complete) {
        fields.push({
          label: 'Custo do produto',
          value: CommerceModel.formatMoney(margin.productCost, currency, margin.costDecimalPlaces)
        });
        fields.push({
          label: 'Impostos',
          value: CommerceModel.formatMoney(margin.taxAmount, currency, margin.costDecimalPlaces)
        });
        if (Number(margin.customCost) > 0) {
          fields.push({
            label: 'Custos adicionais',
            value: CommerceModel.formatMoney(margin.customCost, currency, margin.costDecimalPlaces)
          });
        }
        fields.push({
          label: 'Margem de contribuição',
          value: formatContributionPercent(margin.percentage),
          secondaryValue: CommerceModel.formatMoney(margin.amount, currency, margin.costDecimalPlaces),
          tone: Number(margin.amount) < 0 ? 'danger' : 'success'
        });
      }
      return { fields };
    }

    function priceStackableScenarios(summary) {
      const breakdown = summary && summary.costBreakdown ? summary.costBreakdown : {};
      const financials =
        Array.isArray(breakdown.conditional_financials) && breakdown.conditional_financials.length
          ? breakdown.conditional_financials
          : summary && summary.promotionFinancials && Array.isArray(summary.promotionFinancials.conditional)
            ? summary.promotionFinancials.conditional
            : [];
      const list = financials.filter((financial) => promotionFinancialMetrics(financial).length > 0);
      return list.map(priceStackableScenario);
    }

    function priceStackableScenario(financial) {
      const currency = itemCurrency();
      const payment = stackablePaymentLabel(financial);
      const fields = [];
      if (moneyOrNull(financial.total_price_for_boosted_offer) !== null) {
        fields.push({
          label: `Preço ${payment ? `no ${payment}` : 'acumulativo'}`,
          value: CommerceModel.formatMoney(financial.total_price_for_boosted_offer, currency),
          tone: 'primary'
        });
      }
      promotionFinancialMetrics(financial).forEach((metric) => fields.push(metric));
      return {
        label: financial.label || (payment ? `No ${payment}` : 'Acumulativo'),
        fields: fields.filter((field) => field && field.label && field.value)
      };
    }

    function promotionEstimateMetrics(estimate, currency) {
      const commission = estimate.commission || null;
      const shipping = estimate.shipping || null;
      const metrics = [];

      if (moneyOrNull(estimate.youReceive) !== null) {
        metrics.push({
          label: 'Você recebe',
          value: CommerceModel.formatMoney(estimate.youReceive, currency),
          tone: 'review-result'
        });
      }
      if (commission && saleFeeAmount(commission) !== null) {
        metrics.push({
          label: 'Tarifa de venda',
          value: CommerceModel.formatMoney(saleFeeAmount(commission), currency),
          description: saleFeeDescription(commission, currency),
          tone: 'muted'
        });
      }
      promotionCreditMetrics(commission, currency).forEach((metric) => metrics.push(metric));
      if (shipping && moneyOrNull(shipping.amount) !== null) {
        metrics.push({ label: 'Frete', value: CommerceModel.formatMoney(shipping.amount, currency), tone: 'muted' });
      }
      return metrics;
    }

    function saleFeeAmount(commission) {
      if (!commission) return null;
      const netAmount = moneyOrNull(commission.net_amount);
      return netAmount === null ? moneyOrNull(commission.amount) : netAmount;
    }

    function saleFeeDescription(commission, currency) {
      if (!commission) return '';
      const details = [];
      const listingType = saleFeeListingType(commission);
      if (listingType) details.push(listingType);
      const reduction = moneyOrNull(commission.promotion_reduction_amount);
      if (reduction !== null && reduction > 0) {
        details.push(
          `Redução de ${CommerceModel.formatMoney(reduction, commission.currency_id || currency)} já aplicada à tarifa.`
        );
      }
      return details.join(' · ');
    }

    function saleFeeListingType(commission) {
      return String((commission && commission.listing_type_name) || '').trim();
    }

    function saleFeeReductionLabel(commission, currency) {
      const reduction = moneyOrNull(commission && commission.promotion_reduction_amount);
      return reduction === null
        ? ''
        : `Redução aplicada: ${CommerceModel.formatMoney(
            reduction,
            (commission && commission.currency_id) || currency
          )}`;
    }

    function promotionCreditMetrics(commission, currency) {
      const credit = moneyOrNull(commission && commission.promotion_credit_amount);
      if (credit === null || credit <= 0) return [];
      return [
        {
          label: 'Crédito promocional',
          value: CommerceModel.formatMoney(credit, commission.currency_id || currency),
          description: 'Parcela do aporte que excede a tarifa de venda.',
          tone: 'benefit'
        }
      ];
    }

    function buildFinancialMetric(label, amount, percentage, currency, tone = 'muted', kind = '') {
      const amountText =
        moneyOrNull(amount) !== null ? CommerceModel.formatMoney(amount, currency || itemCurrency()) : '';
      const percentageText = financialPercentage(percentage) !== null ? formatPercent(percentage) : '';
      return {
        label,
        value: [amountText, percentageText].filter(Boolean).join(' · '),
        amountText,
        percentageText,
        badge: '',
        tone,
        kind
      };
    }

    function buildPromotionBenefitMetric(label, amount, percentage, currency, kind) {
      const metric = buildFinancialMetric(label, amount, percentage, currency, 'green', kind);
      return Object.assign(metric, {
        value: formatPromotionBenefitValue(metric.amountText, metric.percentageText),
        copy: formatPromotionBenefitCopy(metric)
      });
    }

    function formatPromotionBenefitValue(amountText, percentageText) {
      if (amountText && percentageText) return `${amountText} (${percentageText})`;
      return amountText || percentageText;
    }

    function formatPromotionBenefitCopy(metric) {
      return promotionBenefitMessage(metric, 'active');
    }

    function promotionBenefitMessage(metric, state = 'active') {
      if (!metric) return '';
      const benefit = [metric.amountText, metric.percentageText ? `(${metric.percentageText})` : '']
        .filter(Boolean)
        .join(' ');
      if (!benefit) return '';
      if (state === 'available') return `Redução de ${benefit} nas suas tarifas por venda ao participar.`;
      if (state === 'programmed') return `Reduziremos ${benefit} nas suas tarifas por venda.`;
      return `Reduzimos ${benefit} nas suas tarifas por venda.`;
    }

    function priceSaveLabel() {
      if (state.operationPending === 'price-bulk-preview') return 'Validando variações...';
      if (state.operationPending === 'price-bulk-commit') return 'Aplicando...';
      if (state.operationPending === 'price-single') return 'Salvando...';
      if (!state.priceBulkEnabled || !state.priceBulkPreview) return 'Salvar';
      const eligible = bulkEligibleTargets(state.priceBulkPreview).length;
      return eligible > 1 ? `Confirmar em ${eligible} variações` : 'Confirmar';
    }

    function priceBadgeTone(tone) {
      if (tone === 'success') return 'success';
      if (tone === 'primary') return 'primary';
      if (tone === 'warning' || tone === 'warn') return 'warning';
      return 'neutral';
    }

    function buildPriceBulkStatus() {
      const busyMessage = bulkBusyText();
      if (busyMessage) return { loading: true, message: busyMessage, tone: '', blocked: [] };
      if (state.priceBulkError) {
        return { loading: false, message: shortMessage(state.priceBulkError), tone: 'warn', blocked: [] };
      }
      const preview = state.priceBulkPreview;
      if (!preview) return null;

      const counts = preview.counts || {};
      const eligible = Number(counts.eligible || 0);
      const total = Number(counts.total || 0);
      const blockedCount = Number(counts.blocked || 0);
      if (!eligible) {
        return {
          loading: false,
          message: `Nenhuma variação elegível${blockedCount ? ` (${blockedCount} bloqueada${blockedCount === 1 ? '' : 's'})` : ''}.`,
          tone: 'warn',
          blocked: []
        };
      }

      const blocked = (Array.isArray(preview.targets) ? preview.targets : [])
        .filter((target) => !target.eligible)
        .slice(0, 6)
        .map((target) => ({
          label: shortTargetLabel(target),
          message: CommerceModel.friendlyError(target.reasonCode || target.message || 'Bloqueado')
        }));
      return {
        loading: false,
        message: `${eligible} de ${total} variações elegíveis.`,
        tone: 'ok',
        blocked,
        blockedLabel: blockedCount ? `${blockedCount} ignorada${blockedCount === 1 ? '' : 's'}` : ''
      };
    }

    function bulkBusyText() {
      if (state.operationPending === 'price-bulk-preview') return 'Validando variações elegíveis...';
      if (state.operationPending === 'price-bulk-commit') return 'Aplicando preço nas variações elegíveis...';
      if (state.operationPending === 'promotion-bulk-commit') {
        return state.operationPendingAction === 'delete'
          ? 'Removendo promoção das variações da família...'
          : 'Aplicando promoção nas variações da família...';
      }
      if (state.operationPending === 'promotion-single') {
        return state.operationPendingAction === 'delete' ? 'Removendo promoção...' : 'Enviando promoção...';
      }
      return '';
    }

    function shortTargetLabel(target) {
      return target && (target.title || target.itemId)
        ? String(target.title || target.itemId).slice(0, 42)
        : 'Variação';
    }

    function canUseBulkActions() {
      return Boolean(state.context && state.context.mode === 'user_product');
    }

    function bulkEligibleTargets(preview) {
      return (preview && Array.isArray(preview.targets) ? preview.targets : []).filter(
        (target) => target && target.eligible && target.itemId
      );
    }

    function promotionRangeWarning(entry, targetPrice) {
      const price = Number(targetPrice || 0);
      const min = Number((entry && entry.min_price) || 0);
      const max = Number((entry && entry.max_price) || 0);
      if (!price) return '';
      if (entry && entry.direct_discount_draft && price >= Number(entry.original_price || 0)) {
        return 'O preço promocional deve ser menor que o preço base.';
      }
      if (min && price < min) return `Mínimo ${CommerceModel.formatMoney(min, itemCurrency())}`;
      if (max && price > max) return `Máximo ${CommerceModel.formatMoney(max, itemCurrency())}`;
      return '';
    }

    function promotionDraftWarning(entry, values) {
      const rangeWarning = promotionRangeWarning(entry, promotionTargetPrice(entry, values));
      if (rangeWarning) return rangeWarning;
      if (
        entry &&
        entry.direct_discount_draft &&
        CommerceModel.parsePercentageInput(values && values.discount_percentage) === null
      ) {
        return 'Informe um desconto entre 0% e 100%.';
      }
      const start = parseIsoDate(values && values.start_date);
      const finish = parseIsoDate(values && values.finish_date);
      if (start && finish && finish < start) return 'A data final deve ser posterior ao início.';
      return '';
    }

    function isPromotionActionPending(key, action) {
      return Boolean(
        state.busy &&
        state.operationPending.indexOf('promotion-') === 0 &&
        state.operationPendingKey === key &&
        state.operationPendingAction === action
      );
    }

    function formatPromotionPeriod(entry) {
      if (typeof formatarPeriodo !== 'function') return '';
      const start =
        parseIsoDate(entry && (entry.start_date || entry.startDate)) ||
        parseDateValue(entry && (entry.start_date || entry.startDate));
      const endValue = entry && (entry.end_date || entry.finish_date || entry.endDate || entry.finishDate);
      const end = parseIsoDate(endValue) || parseDateValue(endValue);
      return formatarPeriodo(start, end);
    }

    function discountPercent(originalPrice, finalPrice) {
      const original = Number(originalPrice || 0);
      const final = Number(finalPrice || 0);
      if (!original || !final || final >= original) return 0;
      return Math.round((1 - final / original) * 100);
    }

    function moneyOrNull(value) {
      const amount = Number(value);
      return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
    }

    function formatPercent(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return '';
      return `${number.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    }

    function stackablePaymentLabel(benefit) {
      const payment = String((benefit && benefit.payment_method) || '')
        .trim()
        .toUpperCase();
      if (payment === 'PIX') return 'Pix';
      return payment;
    }

    function uniquePromotionEntries(entries, excludedEntries = []) {
      const excluded = new Set(
        (Array.isArray(excludedEntries) ? excludedEntries : []).map(promotionIdentity).filter(Boolean)
      );
      const seen = new Set();
      const result = [];
      for (const entry of Array.isArray(entries) ? entries : []) {
        const identity = promotionIdentity(entry);
        if (identity && (excluded.has(identity) || seen.has(identity))) continue;
        if (identity) seen.add(identity);
        result.push(entry);
      }
      return result;
    }

    function promotionOpportunityEntries(groups) {
      const itemOffers = uniquePromotionEntries(campaignPromotionEntries(groups.eligibleOffers)).filter(
        (entry) => !isStackablePromotion(entry)
      );
      return itemOffers;
    }

    function campaignPromotionEntries(entries) {
      return (Array.isArray(entries) ? entries : []).filter((entry) => !isPriceDiscountPromotion(entry));
    }

    function isPriceDiscountPromotion(entry) {
      return String((entry && entry.type) || '').toUpperCase() === 'PRICE_DISCOUNT';
    }

    function isStackablePromotion(entry) {
      const type = String((entry && entry.type) || '').toUpperCase();
      return (entry && entry.is_stackable === true) || type === 'BANK' || type === 'SELLER_COUPON_CAMPAIGN';
    }

    function isCandidatePromotion(entry) {
      const status = String((entry && (entry.status || entry.api_status)) || '').toLowerCase();
      return status === 'candidate' || String((entry && entry.display_status) || '').toLowerCase() === 'available';
    }

    function promotionIdentity(entry) {
      if (!entry) return '';
      return [
        String(entry.type || ''),
        String(entry.id || entry.promotion_id || ''),
        String(entry.offer_id || '')
      ].join(':');
    }

    function parseDateValue(value) {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    function parseIsoDate(value) {
      const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
      return date;
    }

    function toIsoDate(date) {
      if (!date || Number.isNaN(date.getTime())) return '';
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      ].join('-');
    }

    function promotionPriceFieldValidation(entry, value) {
      const raw = String(value || '').trim();
      if (!raw) return null;
      const price = CommerceModel.parseMoneyInput(raw);
      if (!price) return { tone: 'warn', message: 'Informe um preço válido.' };
      if (entry && entry.direct_discount_draft && price >= Number(entry.original_price || 0)) {
        return { tone: 'warn', message: 'O preço deve ser menor que o preço base.' };
      }
      const max = moneyOrNull(entry && entry.max_price);
      if (max && price > max)
        return {
          tone: 'warn',
          message: `Preço máximo: ${CommerceModel.formatMoney(max, itemCurrency())}.`
        };
      return null;
    }

    function directDiscountPercentageValidation(value) {
      const raw = String(value || '').trim();
      if (!raw) return null;
      if (CommerceModel.parsePercentageInput(raw) === null) {
        return { tone: 'warn', message: 'Informe um desconto entre 0% e 100%.' };
      }
      return null;
    }

    function updateDirectDiscountPercentage(value) {
      const key = directDiscountKey();
      const entry = buildDirectDiscountDraftEntry();
      if (!entry || state.busy) return;
      const draft = Object.assign({}, state.promotionDraftValues[key] || {}, {
        discount_percentage: value
      });
      const price = CommerceModel.calculateDiscountedPrice(entry.original_price, value);
      draft.deal_price = price === null ? '' : moneyInputValue(price);
      state.promotionDraftValues[key] = draft;
      state.actionError = '';
      schedulePromotionEstimate(key, entry, draft);
      rerenderModal();
    }

    function updateDirectDiscountPrice(value) {
      const key = directDiscountKey();
      const entry = buildDirectDiscountDraftEntry();
      if (!entry || state.busy) return;
      const percentage = CommerceModel.calculateDiscountPercentage(
        entry.original_price,
        CommerceModel.parseMoneyInput(value)
      );
      const draft = Object.assign({}, state.promotionDraftValues[key] || {}, {
        deal_price: value,
        discount_percentage: percentage === null ? '' : percentageInputValue(percentage)
      });
      state.promotionDraftValues[key] = draft;
      state.actionError = '';
      schedulePromotionEstimate(key, entry, draft);
      rerenderModal();
    }

    function updateDirectDiscountDates(value) {
      const key = directDiscountKey();
      const entry = buildDirectDiscountDraftEntry();
      if (!entry || state.busy) return;
      const draft = Object.assign({}, state.promotionDraftValues[key] || {}, {
        start_date: toIsoDate(value && value.start),
        finish_date: toIsoDate(value && value.end)
      });
      state.promotionDraftValues[key] = draft;
      state.actionError = '';
      if (draft.start_date && draft.finish_date) schedulePromotionEstimate(key, entry, draft);
      else clearDirectDiscountEstimate(key);
      rerenderModal();
    }

    function submitDirectDiscount() {
      const entry = buildDirectDiscountDraftEntry();
      if (!entry || state.busy) return;
      void commitPromotionManagerAction(directDiscountKey(), 'create', entry);
    }

    function handleDirectDiscountViewError(error) {
      state.actionError = toUserError(error);
      state.directDiscountModalOpen = false;
      state.promotionModalOpen = true;
      removeDirectDiscountModal();
      renderModal();
    }

    function clearDirectDiscountEstimate(key) {
      clearPromotionEstimateTimer(key);
      delete state.promotionEstimates[key];
    }

    function schedulePromotionManagerEstimates() {
      if (!state.promotionModalOpen || !state.promotionSummary) return;
      const candidates = promotionEstimateCandidates().flatMap(({ key, entry }) => {
        const values = state.promotionDraftValues[key] || {};
        const targetPrice = promotionTargetPrice(entry, values);
        if (!targetPrice || promotionRangeWarning(entry, targetPrice)) return [];
        const payload = buildPromotionEstimatePayload(entry, values, targetPrice);
        return [{ key, hash: promotionEstimateHash(payload), payload }];
      });
      if (candidates.length) void loadPromotionEstimateBatch(candidates);
    }

    function promotionEstimateCandidates() {
      return buildPromotionRows()
        .filter(({ entry }) => CommerceModel.canEstimatePromotion(entry) && moneyOrNull(promotionDisplayPrice(entry)))
        .map(({ key, entry }) => ({ key, entry }));
    }

    function schedulePromotionEstimate(key, entry, values, immediate = false) {
      if (!key || !entry || !state.itemId) return;
      if (!CommerceModel.canEstimatePromotion(entry)) {
        clearPromotionEstimate(key);
        return;
      }
      const targetPrice = promotionTargetPrice(entry, values);
      if (!targetPrice) {
        clearPromotionEstimate(key);
        return;
      }

      const draftWarning = promotionDraftWarning(entry, values);
      if (draftWarning) {
        clearPromotionEstimate(key);
        return;
      }

      const payload = buildPromotionEstimatePayload(entry, values, targetPrice);
      const hash = promotionEstimateHash(payload);
      const current = state.promotionEstimates[key];
      if (current && current.hash === hash && (current.status === 'loading' || current.status === 'ready')) return;
      clearPromotionEstimateTimer(key);
      if (immediate) {
        void loadPromotionEstimate(key, hash, payload);
        return;
      }
      state.promotionEstimateTimers[key] = setTimeout(() => {
        delete state.promotionEstimateTimers[key];
        void loadPromotionEstimate(key, hash, payload);
      }, 450);
    }

    async function loadPromotionEstimate(key, hash, payload) {
      const requestId = ++state.promotionEstimateRequestId;
      state.promotionEstimates[key] = { status: 'loading', hash, requestId };
      rerenderModal();
      try {
        const data = await api(
          itemApiPath('/promotions/estimate', {
            variation_id: state.context && state.context.selectedVariationId
          }),
          {
            method: 'POST',
            body: JSON.stringify(payload)
          }
        );
        const current = state.promotionEstimates[key];
        if (!current || current.requestId !== requestId || current.hash !== hash) return;
        state.promotionEstimates[key] = { status: 'ready', hash, data };
      } catch (err) {
        const current = state.promotionEstimates[key];
        if (!current || current.requestId !== requestId || current.hash !== hash) return;
        state.promotionEstimates[key] = { status: 'error', hash, message: CommerceModel.friendlyError(err) };
      } finally {
        rerenderModal();
      }
    }

    async function loadPromotionEstimateBatch(candidates) {
      if (!state.itemId || !Array.isArray(candidates) || !candidates.length) return;
      const requestId = ++state.promotionEstimateRequestId;
      candidates.forEach(({ key, hash }) => {
        state.promotionEstimates[key] = { status: 'loading', hash, requestId };
      });
      rerenderModal();

      try {
        const response = await api(
          itemApiPath('/promotions/estimates', {
            variation_id: state.context && state.context.selectedVariationId
          }),
          {
            method: 'POST',
            body: JSON.stringify({ estimates: candidates.map(({ payload }) => payload) })
          }
        );
        const estimates = Array.isArray(response && response.estimates) ? response.estimates : [];
        candidates.forEach(({ key, hash }, index) => {
          const current = state.promotionEstimates[key];
          if (!current || current.requestId !== requestId || current.hash !== hash) return;
          const data = estimates[index];
          state.promotionEstimates[key] =
            data && !data.error
              ? { status: 'ready', hash, data }
              : {
                  status: 'error',
                  hash,
                  message:
                    data && data.error
                      ? CommerceModel.friendlyError(data.error.code || data.error.message)
                      : 'Valores indisponíveis.'
                };
        });
      } catch (err) {
        candidates.forEach(({ key, hash }) => {
          const current = state.promotionEstimates[key];
          if (!current || current.requestId !== requestId || current.hash !== hash) return;
          state.promotionEstimates[key] = { status: 'error', hash, message: CommerceModel.friendlyError(err) };
        });
      } finally {
        rerenderModal();
      }
    }

    function buildPromotionEstimatePayload(entry, values, targetPrice) {
      return {
        promotionType: entry && entry.type ? entry.type : '',
        promotionId: entry && entry.id ? entry.id : '',
        offerId: entry && entry.offer_id ? entry.offer_id : '',
        dealPrice: targetPrice,
        stock: values && values.stock ? values.stock : '',
        startDate: values && values.start_date ? values.start_date : '',
        finishDate: values && values.finish_date ? values.finish_date : ''
      };
    }

    function promotionEstimateHash(payload) {
      return JSON.stringify({
        payload,
        variationId: (state.context && state.context.selectedVariationId) || ''
      });
    }

    function promotionTargetPrice(entry, values = {}) {
      if (Object.prototype.hasOwnProperty.call(values || {}, 'deal_price')) {
        return CommerceModel.parseMoneyInput(values && values.deal_price);
      }
      return CommerceModel.parseMoneyInput(values && values.deal_price) || moneyOrNull(promotionDisplayPrice(entry));
    }

    function promotionDisplayPrice(entry) {
      return (
        (entry &&
          (entry.price ||
            entry.new_price ||
            entry.deal_price ||
            entry.suggested_discounted_price ||
            entry.suggested_price ||
            entry.total_price_for_boosted_offer)) ||
        null
      );
    }

    function clearPromotionEstimate(key) {
      clearPromotionEstimateTimer(key);
      if (!state.promotionEstimates[key]) return;
      delete state.promotionEstimates[key];
      rerenderModal();
    }

    function clearPromotionEstimateTimer(key) {
      if (!state.promotionEstimateTimers[key]) return;
      clearTimeout(state.promotionEstimateTimers[key]);
      delete state.promotionEstimateTimers[key];
    }

    function clearPromotionEstimateTimers() {
      Object.keys(state.promotionEstimateTimers || {}).forEach(clearPromotionEstimateTimer);
    }

    function openPopover(type, options = {}) {
      state.popover = type;
      state.promotionPopoverExpanded = type === 'promotions' && options.expandCurrent === true;
      state.actionError = '';
      state.detailsOpen = false;
      if (type !== 'price') state.priceEditing = false;
      renderCurrentCommerceActions();
      rerenderPopover();
    }

    function closePopover() {
      state.popover = null;
      state.popoverAnchor = null;
      state.promotionPopoverExpanded = false;
      state.priceEditing = false;
      renderCurrentCommerceActions();
      removePopover();
    }

    function renderCurrentCommerceActions() {
      if (state.surface === 'listing' && state.listingActiveRecord) {
        renderListingControls(state.listingActiveRecord);
        return;
      }
      renderInline();
    }

    function startPriceEdit() {
      const priceState = CommerceModel.getPriceState(state.priceSummary);
      if (!priceState.canEdit) return;
      state.priceEditing = true;
      state.priceDraft = priceState.amount ? String(priceState.amount).replace('.', ',') : '';
      state.priceBulkEnabled = false;
      state.priceBulkPreview = null;
      state.priceBulkHash = '';
      state.priceBulkError = '';
      state.priceFeedback = null;
      state.actionError = '';
      rerenderPopover();
    }

    function updatePriceDraft(value) {
      state.priceDraft = String(value || '');
      state.priceBulkPreview = null;
      state.priceBulkHash = '';
      state.priceBulkError = '';
      state.priceFeedback = null;
    }

    function updatePriceBulkEnabled(enabled) {
      if (state.busy) return;
      state.priceBulkEnabled = Boolean(enabled);
      state.priceBulkPreview = null;
      state.priceBulkHash = '';
      state.priceBulkError = '';
      state.priceFeedback = null;
      state.actionError = '';
      rerenderPopover();
    }

    function cancelPriceEdit() {
      state.priceEditing = false;
      state.priceDraft = '';
      state.priceBulkEnabled = false;
      state.priceBulkPreview = null;
      state.priceBulkHash = '';
      state.priceBulkError = '';
      state.priceFeedback = null;
      state.actionError = '';
      rerenderPopover();
    }

    async function savePrice() {
      if (!state.itemId || state.busy) return;
      const amount = CommerceModel.parseMoneyInput(state.priceDraft);
      if (!amount) {
        state.actionError = 'Informe um preço válido.';
        rerenderPopover();
        return;
      }

      if (state.priceBulkEnabled && canUseBulkActions()) {
        await saveBulkPrice(amount);
        return;
      }

      state.busy = true;
      state.operationPending = 'price-single';
      state.actionError = '';
      rerenderPopover();
      try {
        await api(itemApiPath('/pricing/standard'), {
          method: 'PUT',
          body: JSON.stringify({ amount })
        });
        state.priceEditing = false;
        state.priceDraft = '';
        await loadSummaries(state.requestId);
      } catch (err) {
        state.actionError = toUserError(err);
      } finally {
        state.busy = false;
        state.operationPending = '';
        mountCommerce();
      }
    }

    async function saveBulkPrice(amount) {
      const payload = { amount };
      const hash = bulkHash('pricing.standard.update', payload);
      if (!state.priceBulkPreview || state.priceBulkHash !== hash) {
        state.busy = true;
        state.operationPending = 'price-bulk-preview';
        state.priceBulkError = '';
        state.priceBulkPreview = null;
        state.priceBulkHash = hash;
        rerenderPopover();
        try {
          state.priceBulkPreview = await api(itemApiPath('/bulk/preview'), {
            method: 'POST',
            body: JSON.stringify(bulkRequest('pricing.standard.update', payload))
          });
          const eligible = bulkEligibleTargets(state.priceBulkPreview).length;
          state.priceBulkError = eligible ? '' : 'Nenhuma variação elegível.';
        } catch (err) {
          state.priceBulkError = toUserError(err);
        } finally {
          state.busy = false;
          state.operationPending = '';
          rerenderPopover();
        }
        return;
      }

      const targetItemIds = bulkEligibleTargets(state.priceBulkPreview).map((target) => target.itemId);
      if (!targetItemIds.length) {
        state.priceBulkError = 'Nenhuma variação elegível.';
        rerenderPopover();
        return;
      }

      state.busy = true;
      state.operationPending = 'price-bulk-commit';
      state.actionError = '';
      rerenderPopover();
      try {
        const result = await commitBulkInBatches('pricing.standard.update', payload, targetItemIds);
        const feedback = publishPriceBulkFeedback(result);
        if (feedback.changed) {
          state.priceEditing = false;
          state.priceDraft = '';
          state.priceBulkPreview = null;
          state.priceBulkHash = '';
          state.priceBulkError = '';
        }
        await loadSummaries(state.requestId);
      } catch (err) {
        state.actionError = toUserError(err);
      } finally {
        state.busy = false;
        state.operationPending = '';
        mountCommerce();
      }
    }

    function openPromotionModal() {
      state.popover = null;
      removePopover();
      state.promotionModalOpen = true;
      state.directDiscountModalOpen = false;
      state.actionError = '';
      state.promotionFormKey = '';
      state.promotionFormAction = '';
      state.promotionFormEstimate = null;
      state.promotionFeedback = null;
      state.promotionRemovalKey = '';
      state.promotionDraftValues = {};
      state.promotionBulkEnabled = false;
      resetPromotionListFilters();
      clearPromotionEstimateTimers();
      state.promotionEstimates = {};
      renderModal();
      schedulePromotionManagerEstimates();
    }

    function openDirectDiscountForm() {
      if (state.busy) return;
      const entry = buildDirectDiscountDraftEntry();
      if (!entry) return;
      const key = directDiscountKey();
      state.promotionFormKey = key;
      state.promotionFormAction = 'create';
      state.promotionFormEstimate = null;
      state.promotionFeedback = null;
      ensureDirectDiscountDraft(key, entry);
      state.actionError = '';
      state.promotionModalOpen = false;
      state.directDiscountModalOpen = true;
      removeModal();
      rerenderModal();
      schedulePromotionEstimate(key, entry, state.promotionDraftValues[key] || {});
    }

    function closePromotionModal() {
      state.promotionModalOpen = false;
      state.directDiscountModalOpen = false;
      state.promotionFormKey = '';
      state.promotionFormAction = '';
      state.promotionFormEstimate = null;
      state.promotionFeedback = null;
      state.promotionRemovalKey = '';
      state.promotionDraftValues = {};
      state.promotionBulkEnabled = false;
      clearPromotionEstimateTimers();
      state.promotionEstimates = {};
      resetPromotionListFilters();
      removeModal();
      removeDirectDiscountModal();
    }

    async function commitPromotionManagerAction(key, action, explicitEntry = null) {
      if (!state.itemId || state.busy || !['create', 'update', 'delete'].includes(action)) return;
      const row = promotionManagerRow(key);
      const entry = explicitEntry || (row && row.entry);
      if (!entry) return;
      const createdDirectDiscount = Boolean(entry.direct_discount_draft);
      const values = Object.assign({}, state.promotionDraftValues[key] || {});
      const estimateRecord = state.promotionEstimates[key] || null;
      const fields =
        action === 'delete'
          ? []
          : CommerceModel.getUserFields(
              action === 'update'
                ? CommerceModel.getOfferUpdateFields(entry)
                : CommerceModel.getOfferCreateFields(entry)
            );
      ensurePromotionDraft(key, entry, fields);
      Object.assign(values, state.promotionDraftValues[key] || {});

      const draftWarning = action === 'delete' ? '' : promotionDraftWarning(entry, values);
      const priceWarning = fields.includes('deal_price') ? promotionManagerPriceError(entry, values.deal_price) : '';
      if (priceWarning) {
        rerenderModal();
        return;
      }
      if (draftWarning) {
        if (createdDirectDiscount) {
          state.actionError = draftWarning;
        } else {
          setPromotionFeedback({
            scope: 'form',
            key,
            title: 'Revise os dados',
            message: draftWarning
          });
        }
        rerenderModal();
        return;
      }

      let keepFormOpen = false;
      try {
        const method = action === 'delete' ? 'DELETE' : action === 'update' ? 'PUT' : 'POST';
        const payload =
          action === 'delete'
            ? CommerceModel.buildOfferDeletePayload(entry)
            : action === 'update'
              ? CommerceModel.buildOfferUpdatePayload(entry, values)
              : CommerceModel.buildOfferPayload(entry, values);

        state.busy = true;
        state.operationPending =
          state.promotionBulkEnabled && canUseBulkActions() ? 'promotion-bulk-commit' : 'promotion-single';
        state.operationPendingKey = key;
        state.operationPendingAction = action;
        state.actionError = '';
        clearPromotionFeedback(key);
        rerenderModal();

        if (state.promotionBulkEnabled && canUseBulkActions()) {
          const result = await commitBulkInBatches(`promotion.offer.${action}`, payload);
          const currentTarget = currentBulkPromotionTarget(result);
          if (currentTarget) {
            const identity = applyOptimisticPromotionMutation(entry, action, values, currentTarget, estimateRecord);
            if (identity) void reconcilePromotionManagerMutation(identity, currentTarget.reconciliationId);
          }
          keepFormOpen = !publishPromotionBulkFeedback(result, action).changed;
          void reconcilePromotionBulkResult(result, action);
        } else {
          let response;
          try {
            response = await api(itemApiPath('/promotions/offers'), {
              method,
              body: JSON.stringify(payload)
            });
          } catch (error) {
            if (!isAcceptedPromotionRequestError(error)) throw error;
            response = { status: 'pending_confirmation' };
          }
          const identity = applyOptimisticPromotionMutation(entry, action, values, response, estimateRecord);
          if (identity) void reconcilePromotionManagerMutation(identity, response && response.reconciliationId);
        }

        if (keepFormOpen) return;
        state.promotionFormKey = '';
        state.promotionFormAction = '';
        state.promotionFormEstimate = null;
        delete state.promotionDraftValues[key];
        clearPromotionEstimateTimer(key);
        delete state.promotionEstimates[key];
        state.promotionBulkEnabled = false;
        if (createdDirectDiscount) {
          state.directDiscountModalOpen = false;
          state.promotionModalOpen = true;
          removeDirectDiscountModal();
        }
      } catch (err) {
        const message = CommerceModel.friendlyError(err);
        if (createdDirectDiscount) {
          state.actionError = message;
        } else {
          setPromotionFeedback({
            scope: action === 'delete' ? 'card' : 'form',
            key,
            title: promotionActionErrorTitle(action),
            message
          });
        }
      } finally {
        state.busy = false;
        state.operationPending = '';
        state.operationPendingKey = '';
        state.operationPendingAction = '';
        mountCommerce();
      }
    }

    function currentBulkPromotionTarget(result) {
      return (
        (Array.isArray(result && result.targets) ? result.targets : []).find(
          (target) =>
            target &&
            target.itemId === state.itemId &&
            ['applied', 'pending_confirmation'].includes(String(target.status || ''))
        ) || null
      );
    }

    function isAcceptedPromotionRequestError(error) {
      const technical = String((error && (error.technicalError || error.code)) || '').toLowerCase();
      const message = String((error && error.message) || '').toLowerCase();
      return (
        technical.includes('promotion_change_not_confirmed') ||
        message.includes('mercado livre ainda está confirmando o novo estado')
      );
    }

    async function reconcilePromotionManagerMutation(identity, reconciliationId) {
      const attempts = reconciliationId ? 150 : 30;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        await waitForPromotionReconciliation(2000);
        if (!state.promotionOptimistic[identity] || !state.itemId) return;
        if (attempt === 2) markPromotionMutationSyncing(identity);
        let remotelyConfirmed = false;

        if (reconciliationId) {
          try {
            const response = await api(`/api/bulk/reconciliations?ids=${encodeURIComponent(reconciliationId)}`);
            const operation = Array.isArray(response && response.operations) ? response.operations[0] : null;
            if (operation && operation.status === 'unconfirmed') {
              rejectOptimisticPromotionMutation(identity, operation.message);
              await refreshPromotionSummarySilently();
              return;
            }
            if (!operation || operation.status === 'pending') continue;
            remotelyConfirmed = operation.status === 'confirmed';
          } catch (error) {
            continue;
          }
        }

        await refreshPromotionSummarySilently();
        if (remotelyConfirmed && state.promotionOptimistic[identity]) {
          delete state.promotionOptimistic[identity];
          mountCommerce();
        }
        if (!state.promotionOptimistic[identity]) {
          schedulePromotionManagerEstimates();
          return;
        }
      }
    }

    function markPromotionMutationSyncing(identity) {
      const change = state.promotionOptimistic[identity];
      if (!change) return;
      if (change.action === 'delete') {
        if (state.promotionModalOpen && !state.promotionFeedback) {
          setPromotionFeedback({
            scope: 'section',
            tone: 'info',
            title: 'Sincronizando remoção',
            message: 'O Mercado Livre ainda está confirmando a remoção desta promoção.'
          });
        }
      } else {
        change.entry._onframeLocalState = 'syncing';
      }
      mountCommerce();
    }

    function rejectOptimisticPromotionMutation(identity, remoteMessage = '') {
      const change = state.promotionOptimistic[identity];
      if (!change) return;
      const name = String((change.entry && change.entry.label) || 'esta promoção');
      delete state.promotionOptimistic[identity];
      const title = 'Alteração não confirmada';
      const message = remoteMessage
        ? shortMessage(remoteMessage)
        : `O Mercado Livre não confirmou a alteração em ${name}. O estado atual foi restaurado.`;
      if (state.promotionModalOpen) {
        setPromotionFeedback({ scope: 'section', tone: 'warning', title, message });
      } else {
        showToast('warning', title, message);
      }
    }

    async function refreshPromotionSummarySilently() {
      const itemId = state.itemId;
      const requestId = state.requestId;
      if (!itemId) return;
      try {
        const summary = await api(itemApiPath('/promotions/summary'));
        if (itemId !== state.itemId || requestId !== state.requestId) return;
        state.promotionSummary = summary;
        state.promotionError = '';
        reconcileOptimisticPromotionsFromSummary();
        syncActiveListingSummaries();
        mountCommerce();
      } catch (error) {
        // A escrita aceita continua visível enquanto a leitura remota é tentada novamente.
      }
    }

    function openPromotionManagerRemoval(key) {
      if (state.busy) return;
      const row = promotionManagerRow(key);
      if (!row || !CommerceModel.canDeleteOffer(row.entry)) return;
      state.promotionRemovalKey = key;
      state.actionError = '';
      state.promotionFeedback = null;
      rerenderModal();
    }

    function closePromotionManagerRemoval() {
      if (!state.promotionRemovalKey) return;
      state.promotionRemovalKey = '';
      rerenderModal();
    }

    function confirmPromotionManagerRemoval(key) {
      if (state.busy || !key || state.promotionRemovalKey !== key) return;
      state.promotionRemovalKey = '';
      void commitPromotionManagerAction(key, 'delete');
    }

    function cancelPromotionForm() {
      const key = state.promotionFormKey;
      if (!key || state.busy) return;
      const row = promotionManagerRow(key);
      const formAction = state.promotionFormAction;
      const previousEstimate = state.promotionFormEstimate;
      const returningFromDirectDiscount = state.directDiscountModalOpen && key === directDiscountKey();
      clearPromotionFeedback(key);
      clearPromotionEstimateTimer(key);
      delete state.promotionDraftValues[key];
      if (formAction !== 'details') {
        if (previousEstimate) state.promotionEstimates[key] = previousEstimate;
        else delete state.promotionEstimates[key];
      }
      state.promotionFormKey = '';
      state.promotionFormAction = '';
      state.promotionFormEstimate = null;
      state.promotionBulkEnabled = false;
      state.actionError = '';
      if (returningFromDirectDiscount) {
        state.directDiscountModalOpen = false;
        state.promotionModalOpen = true;
        removeDirectDiscountModal();
      }
      rerenderModal();
      if (!returningFromDirectDiscount && formAction !== 'details' && !previousEstimate && row) {
        schedulePromotionEstimate(key, row.entry, {}, true);
      }
    }

    async function reloadCommerce() {
      state.actionError = '';
      state.promotionFeedback = null;
      state.promotionOptimistic = {};
      state.promotionDraftValues = {};
      clearPromotionEstimateTimers();
      state.promotionEstimates = {};
      if (!state.context || !state.itemId) {
        await reloadCommerceEditor();
        return;
      }
      if (state.surface === 'listing' && state.listingActiveRecord) {
        queueListingSummary(state.listingActiveRecord, 'price', { force: true });
        queueListingSummary(state.listingActiveRecord, 'promotions', { force: true });
        return;
      }
      await loadSummaries(state.requestId);
      schedulePromotionManagerEstimates();
    }

    function buildDiscountEntry() {
      const summary = effectivePromotionSummary();
      if (!summary || !Array.isArray(summary.adapters)) return null;
      const adapter = directDiscountAdapter();
      if (!adapter || !Array.isArray(adapter.offerCreate)) return null;
      const groups = CommerceModel.collectPromotionGroups(summary);
      const existing = [groups.activeOffers, groups.scheduledOffers].flat().find(isPriceDiscountPromotion);
      if (existing) {
        return Object.assign({}, existing, {
          label: existing.label && existing.label !== existing.typeLabel ? existing.label : 'Desconto direto',
          typeLabel: 'Desconto do anúncio',
          capabilities: existing.capabilities || adapter
        });
      }
      return null;
    }

    function directDiscountKey() {
      return 'direct-discount:0';
    }

    function directDiscountAdapter() {
      if (!state.promotionSummary || !Array.isArray(state.promotionSummary.adapters)) return null;
      return state.promotionSummary.adapters.find((item) => item.type === 'PRICE_DISCOUNT') || null;
    }

    function directDiscountBasePrice() {
      const priceState = state.priceSummary ? CommerceModel.getPriceState(state.priceSummary) : null;
      return moneyOrNull(priceState && priceState.amount);
    }

    function canCreateDirectDiscount() {
      if (state.promotionFormKey) return false;
      return Boolean(buildDirectDiscountDraftEntry());
    }

    function buildDirectDiscountDraftEntry() {
      const adapter = directDiscountAdapter();
      const basePrice = directDiscountBasePrice();
      if (!adapter || !Array.isArray(adapter.offerCreate) || !basePrice || buildDiscountEntry()) return null;
      return {
        type: 'PRICE_DISCOUNT',
        label: 'Desconto direto',
        typeLabel: 'Desconto do anúncio',
        original_price: basePrice,
        direct_discount_draft: true,
        capabilities: adapter
      };
    }

    function ensureDirectDiscountDraft(key, entry) {
      if (!key || !entry) return;
      const draft = Object.assign({}, state.promotionDraftValues[key] || {});
      if (!Object.prototype.hasOwnProperty.call(draft, 'discount_percentage')) draft.discount_percentage = '';
      if (!Object.prototype.hasOwnProperty.call(draft, 'deal_price')) draft.deal_price = '';
      if (!Object.prototype.hasOwnProperty.call(draft, 'start_date'))
        draft.start_date = defaultFieldValue('start_date', entry);
      if (!Object.prototype.hasOwnProperty.call(draft, 'finish_date'))
        draft.finish_date = defaultFieldValue('finish_date', entry);
      state.promotionDraftValues[key] = draft;
    }

    function findPriceAnchor() {
      const selectors = [
        '.ui-pdp-price__main-container',
        '.ui-pdp-price__second-line',
        '.ui-pdp-price',
        '[class*="ui-pdp-price"]'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!element || !isVisible(element)) continue;
        return element.closest('.ui-pdp-price') || element;
      }
      return null;
    }

    function isVisible(element) {
      if (!element || typeof element.getBoundingClientRect !== 'function') return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    }

    function popoverAnchor() {
      const anchor = state.popoverAnchor && state.popoverAnchor.isConnected ? state.popoverAnchor : state.inline;
      const actionGroup =
        anchor &&
        (anchor.matches('[data-commerce-action-group]')
          ? anchor
          : anchor.querySelector('[data-commerce-action-group]'));
      return actionGroup || anchor;
    }

    function positionFloatingRoot(root, anchor) {
      if (!root || !anchor || typeof anchor.getBoundingClientRect !== 'function') return;
      const rect = anchor.getBoundingClientRect();
      const isListingPopover = root.classList.contains('listing');
      const isSummaryPopover = state.popover === 'promotions' || state.popover === 'price';
      const preferredWidth = isSummaryPopover ? 400 : 340;
      const availableWidth = Math.max(0, window.innerWidth - 24);
      const width = Math.min(preferredWidth, availableWidth);
      const centeredLeft = rect.left + (rect.width - width) / 2;
      const left = Math.max(12, Math.min(centeredLeft, window.innerWidth - width - 12));
      const top = isListingPopover ? rect.bottom + 8 : Math.max(12, rect.bottom + 8);
      root.style.left = `${Math.round(left)}px`;
      root.style.top = `${Math.round(top)}px`;
    }

    function positionPopover() {
      if (!state.popover || !state.popoverRoot) return;
      positionFloatingRoot(state.popoverRoot, popoverAnchor());
    }

    function ensurePromotionDraft(key, entry, fields) {
      if (!key) return;
      const draft = Object.assign({}, state.promotionDraftValues[key] || {});
      (Array.isArray(fields) ? fields : []).forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(draft, field)) {
          draft[field] = defaultFieldValue(field, entry);
        }
      });
      state.promotionDraftValues[key] = draft;
    }

    function defaultFieldValue(field, entry) {
      if (field === 'deal_price') {
        const promotionPrice = moneyInputValue(entry && (entry.price || entry.suggested_price));
        if (promotionPrice) return promotionPrice;
        const priceState = state.priceSummary ? CommerceModel.getPriceState(state.priceSummary) : null;
        return moneyInputValue(priceState && priceState.amount);
      }
      if (field === 'stock') {
        const range = promotionManagerStockRange(entry);
        return String(range.min || 1);
      }
      if (field === 'start_date') return isoDateOnly(entry && entry.start_date) || dateOffset(0);
      if (field === 'finish_date') return isoDateOnly(entry && (entry.end_date || entry.finish_date)) || dateOffset(7);
      return '';
    }

    function moneyInputValue(value) {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) return '';
      return String(Math.round(amount * 100) / 100).replace('.', ',');
    }

    function percentageInputValue(value) {
      const percentage = Number(value);
      if (!Number.isFinite(percentage) || percentage <= 0 || percentage >= 100) return '';
      return String(Math.round(percentage * 100) / 100).replace('.', ',');
    }

    function positiveIntegerOrNull(value) {
      const text = String(value || '').trim();
      if (!/^\d+$/.test(text)) return null;
      const parsed = Number(text);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }

    function itemApiPath(suffix, params = {}) {
      const query = new URLSearchParams();
      if (state.ownerUserId) query.set('owner_user_id', String(state.ownerUserId));
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
      });
      const search = query.toString();
      return `/api/items/${encodeURIComponent(state.itemId)}${suffix}${search ? `?${search}` : ''}`;
    }

    function bulkRequest(action, payload, targetItemIds) {
      const request = {
        scope: 'user_product_family',
        action,
        payload: payload || {}
      };
      if (Array.isArray(targetItemIds)) request.targetItemIds = targetItemIds;
      return request;
    }

    async function commitBulkInBatches(action, payload, targetItemIds) {
      const responses = [];
      const seenContinuations = new Set();
      let pendingTargetItemIds = Array.isArray(targetItemIds) ? targetItemIds : undefined;

      for (let page = 0; page < 100; page += 1) {
        const response = await api(itemApiPath('/bulk/commit'), {
          method: 'POST',
          body: JSON.stringify(bulkRequest(action, payload, pendingTargetItemIds))
        });
        responses.push(response);

        const next =
          response && response.continuation && Array.isArray(response.continuation.targetItemIds)
            ? response.continuation.targetItemIds.filter(Boolean)
            : [];
        if (!next.length) return mergeBulkResponses(responses);

        const signature = next.join(',');
        if (seenContinuations.has(signature)) throw new Error('bulk_continuation_repeated');
        seenContinuations.add(signature);
        pendingTargetItemIds = next;
      }

      throw new Error('bulk_continuation_limit');
    }

    function mergeBulkResponses(responses) {
      const pages = Array.isArray(responses) ? responses.filter(Boolean) : [];
      const first = pages[0] || {};
      const targets = pages.flatMap((page) => (Array.isArray(page.targets) ? page.targets : []));
      return Object.assign({}, first, {
        continuation: null,
        counts: {
          total: targets.length,
          eligible: targets.filter((target) => target && target.eligible).length,
          blocked: targets.filter((target) => target && target.status === 'blocked').length,
          applied: targets.filter((target) => target && target.status === 'applied').length,
          skipped: targets.filter((target) => target && target.status === 'skipped').length,
          failed: targets.filter((target) => target && target.status === 'failed').length,
          pending: targets.filter((target) => target && target.status === 'pending_confirmation').length,
          unconfirmed: targets.filter((target) => target && target.status === 'unconfirmed').length
        },
        targets
      });
    }

    async function reconcilePromotionBulkResult(initialResult, action) {
      let result = initialResult;
      const reconciliationIds = Array.from(
        new Set(
          (Array.isArray(result && result.targets) ? result.targets : [])
            .map((target) => (target && target.status === 'pending_confirmation' ? target.reconciliationId : ''))
            .filter(Boolean)
        )
      );
      if (!reconciliationIds.length) return;

      for (let attempt = 0; attempt < 150; attempt += 1) {
        await waitForPromotionReconciliation(2000);
        let response;
        try {
          response = await api(`/api/bulk/reconciliations?ids=${encodeURIComponent(reconciliationIds.join(','))}`);
        } catch (error) {
          continue;
        }

        const operations = Array.isArray(response && response.operations) ? response.operations : [];
        const byId = new Map(operations.map((operation) => [operation && operation.id, operation]));
        const targets = (Array.isArray(result && result.targets) ? result.targets : []).map((target) => {
          const operation = target && target.reconciliationId ? byId.get(target.reconciliationId) : null;
          if (!operation || operation.status === 'pending') return target;
          if (operation.status === 'confirmed') {
            return Object.assign({}, target, {
              eligible: true,
              status: 'applied',
              message: operation.message || 'Alteração confirmada pelo Mercado Livre.',
              result: operation.result || target.result || null
            });
          }
          if (operation.status === 'unconfirmed') {
            return Object.assign({}, target, {
              eligible: false,
              status: 'unconfirmed',
              reasonCode: 'promotion_change_unconfirmed',
              message: operation.message || 'O estado final não foi confirmado.'
            });
          }
          return target;
        });
        result = mergeBulkResponses([Object.assign({}, result, { targets })]);
        if (Number((result.counts && result.counts.pending) || 0) > 0) continue;

        publishPromotionBulkFeedback(result, action, { background: true });
        try {
          await loadSummaries(state.requestId);
          schedulePromotionManagerEstimates();
          mountCommerce();
        } catch (error) {
          // A confirmação já foi persistida; uma falha de atualização visual não a desfaz.
        }
        return;
      }
    }

    function publishPromotionBulkFeedback(result, action, options = {}) {
      const counts = result && result.counts ? result.counts : {};
      const applied = Number(counts.applied || 0);
      const pending = Number(counts.pending || 0);
      const failed = Number(counts.failed || 0);
      const blocked = Number(counts.blocked || 0);
      const skipped = Number(counts.skipped || 0);
      const unconfirmed = Number(counts.unconfirmed || 0);
      const unchanged = failed + blocked + skipped;
      const changed = applied + pending > 0;
      const hasAttention = unchanged + unconfirmed > 0;
      const tone = !changed ? 'danger' : hasAttention ? 'warning' : pending ? 'info' : 'success';
      const title = !changed
        ? 'Nenhuma variação foi alterada'
        : pending && !applied
          ? 'Sincronizando variações'
          : promotionActionSuccessLabel(action);
      const parts = [
        applied ? `${applied} variação${applied === 1 ? '' : 'ões'} alterada${applied === 1 ? '' : 's'}.` : '',
        pending ? `${pending} aguarda${pending === 1 ? '' : 'm'} confirmação do Mercado Livre.` : '',
        unconfirmed ? `${unconfirmed} não teve${unconfirmed === 1 ? '' : 'ram'} o estado final confirmado.` : '',
        unchanged ? `${unchanged} não foi${unchanged === 1 ? '' : 'ram'} alterada${unchanged === 1 ? '' : 's'}.` : ''
      ].filter(Boolean);
      const message = parts.join(' ') || 'Revise a elegibilidade das variações e tente novamente.';
      const feedback = { scope: 'section', tone, title, message };

      if (options.background && !state.promotionModalOpen) {
        if (tone !== 'success') showToast(tone, title, message);
      } else {
        setPromotionFeedback(feedback);
      }
      return { changed, feedback };
    }

    function waitForPromotionReconciliation(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    function bulkHash(action, payload) {
      return `${action}:${JSON.stringify(payload || {})}`;
    }

    function publishPriceBulkFeedback(result) {
      const counts = result && result.counts ? result.counts : {};
      const applied = Number(counts.applied || 0);
      const failed = Number(counts.failed || 0);
      const blocked = Number(counts.blocked || 0);
      const skipped = Number(counts.skipped || 0);
      const pending = Number(counts.pending || 0);
      const unconfirmed = Number(counts.unconfirmed || 0);
      const unchanged = failed + blocked + skipped;
      const changed = applied + pending > 0;
      if (!applied && !pending && !unconfirmed) {
        state.priceFeedback = {
          tone: 'danger',
          title: 'Nenhuma variação foi alterada',
          message: 'Revise a elegibilidade das variações e tente novamente.'
        };
        return { changed, feedback: state.priceFeedback };
      }
      const appliedText = `${applied} variação${applied === 1 ? '' : 'ões'} alterada${applied === 1 ? '' : 's'}.`;
      const pendingText = `${pending} aguarda${pending === 1 ? '' : 'm'} confirmação do Mercado Livre.`;
      const unconfirmedText = `${unconfirmed} não teve${unconfirmed === 1 ? '' : 'ram'} o estado final confirmado.`;
      const unchangedText = `${unchanged} não foi${unchanged === 1 ? '' : 'ram'} alterada${unchanged === 1 ? '' : 's'}.`;
      const body = [
        applied ? appliedText : '',
        pending ? pendingText : '',
        unconfirmed ? unconfirmedText : '',
        unchanged ? unchangedText : ''
      ]
        .filter(Boolean)
        .join(' ');
      state.priceFeedback = {
        tone: pending || unconfirmed || unchanged ? 'warning' : 'success',
        title: pending && !applied ? 'Sincronizando variações' : 'Preço atualizado',
        message: body
      };
      return { changed, feedback: state.priceFeedback };
    }

    function promotionActionSuccessLabel(action) {
      if (action === 'delete') return 'Promoção removida';
      if (action === 'update') return 'Promoção atualizada';
      return 'Promoção aplicada';
    }

    function promotionActionErrorTitle(action) {
      if (action === 'delete') return 'Não foi possível remover a promoção';
      if (action === 'update') return 'Não foi possível alterar a promoção';
      return 'Não foi possível aplicar a promoção';
    }

    function showToast(tone, title, body) {
      if (!toast || typeof toast.show !== 'function') return;
      toast.show({ tone, title, body });
    }

    function isoDateOnly(value) {
      const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : '';
    }

    function dateOffset(days) {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date.toISOString().slice(0, 10);
    }

    function itemCurrency() {
      const item = state.context && state.context.item ? state.context.item : {};
      return item.currency_id || 'BRL';
    }

    function shortMessage(message) {
      const text = String(message || '').trim();
      if (!text) return '';
      if (text.length <= 74) return text;
      return `${text.slice(0, 71).trim()}...`;
    }

    function rerenderPopover() {
      renderPopover();
    }

    function rerenderModal() {
      renderModal();
      renderDirectDiscountModal();
    }

    function removeInline() {
      if (state.inline) {
        CommerceActionsView.unmount(state.inline);
        state.inline.remove();
      }
      state.inline = null;
    }

    function removePopover() {
      if (state.popoverRoot) {
        CommercePriceView.unmount(state.popoverRoot);
        CommercePromotionsView.unmount(state.popoverRoot);
        state.popoverRoot.remove();
      }
      state.popoverRoot = null;
    }

    function removeModal() {
      if (state.modalRoot) CommercePromotionManagerView.unmount(state.modalRoot);
      if (state.modalRoot) state.modalRoot.remove();
      state.modalRoot = null;
    }

    function removeDirectDiscountModal() {
      if (state.directDiscountModalRoot) CommerceDirectDiscountView.unmount(state.directDiscountModalRoot);
      if (state.directDiscountModalRoot) state.directDiscountModalRoot.remove();
      state.directDiscountModalRoot = null;
    }

    function bindViewportEvents() {
      if (state.viewportEventsReady) return;
      state.viewportEventsReady = true;
      window.addEventListener('resize', () => {
        scheduleRender(80);
        positionPopover();
      });
      window.addEventListener(
        'scroll',
        () => {
          positionPopover();
        },
        true
      );
    }

    function bindDocumentEvents() {
      if (state.documentEventsReady) return;
      state.documentEventsReady = true;
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          if (state.directDiscountModalOpen) {
            event.preventDefault();
            event.stopImmediatePropagation();
            cancelPromotionForm();
            return;
          }
          if (state.promotionModalOpen && state.promotionFormKey) {
            event.preventDefault();
            event.stopImmediatePropagation();
            cancelPromotionForm();
            return;
          }
          closePopover();
          closePromotionModal();
        }
      });
      document.addEventListener('click', (event) => {
        if (!state.popoverRoot || !state.popover) return;
        const target = event.target;
        if (state.popoverRoot.contains(target)) return;
        if (state.popoverAnchor && state.popoverAnchor.contains(target)) return;
        if (state.inline && state.inline.contains(target)) return;
        closePopover();
      });
    }

    function getCommerceStatus() {
      return {
        ok: true,
        isProductPage: isProductPageUrl(location.href),
        isListingPage: isListingPageUrl(),
        loaded: state.loaded,
        busy: state.busy || state.priceLoading || state.promotionLoading,
        editorVisible: state.visible,
        dirty: state.priceEditing || Boolean(state.promotionFormKey),
        error: state.actionError || state.priceError || state.promotionError || '',
        itemId: state.itemId,
        mode: state.context && state.context.mode ? state.context.mode : null,
        catalogListing: Boolean(state.context && state.context.item && state.context.item.catalog_listing),
        selectedVariationId:
          state.context && state.context.selectedVariationId ? state.context.selectedVariationId : null,
        url: location.href
      };
    }

    async function showCommerce() {
      state.visible = true;
      if (isListingPageUrl()) {
        state.surface = 'listing';
        mountCommerce();
        return getCommerceStatus();
      }
      if (!state.loaded && !state.busy) {
        state.busy = true;
        mountCommerce();
        await requestPageContextReload('show');
      } else mountCommerce();
      return getCommerceStatus();
    }

    function hideCommerce() {
      state.visible = false;
      removeInline();
      removePopover();
      removeModal();
      removeDirectDiscountModal();
      resetListingState();
      return getCommerceStatus();
    }

    async function reloadCommerceEditor() {
      if (isProductPageUrl(location.href)) {
        state.visible = true;
        state.busy = true;
        mountCommerce();
        await requestPageContextReload('manual');
      } else if (isListingPageUrl() && state.listingActiveRecord) {
        await reloadCommerce();
      }
      return getCommerceStatus();
    }

    function handleCommercePriceViewFailure(error) {
      if (rootScope.console && typeof rootScope.console.error === 'function') {
        rootScope.console.error('[OnFrame] A interface de preço falhou.', error);
      }
    }

    function handleCommercePromotionsViewFailure(error) {
      if (rootScope.console && typeof rootScope.console.error === 'function') {
        rootScope.console.error('[OnFrame] A interface de promoções falhou.', error);
      }
    }

    return {
      id: 'commerce',
      label: 'Preço e promoções',
      supportsNonProduct: true,
      getMode: () => (state.context && state.context.mode ? state.context.mode : null),
      getPageSignature: () => state.pageSignature,
      getStatus: getCommerceStatus,
      handlePageContextChange,
      hasContextOrError: () => Boolean(state.context || state.actionError || state.priceError || state.promotionError),
      hide: hideCommerce,
      isBusy: () => Boolean(state.busy || state.priceLoading || state.promotionLoading),
      isLoaded: () => Boolean(state.loaded),
      reload: reloadCommerceEditor,
      reset: resetState,
      scheduleRender,
      show: showCommerce,
      start: startCommerce
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
