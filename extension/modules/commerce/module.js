(function (rootScope) {
  rootScope.OnFrameCommerceModule = {
    createCommerceModule
  };

  function createCommerceModule(services) {
    const Shared = services.Shared;
    const Detection = services.Detection;
    const CommerceModel = services.CommerceModel;
    const api = services.api;
    const requestPageContextReload = services.requestPageContextReload || (() => Promise.resolve(null));
    const escapeHtml = Shared.escapeHtml;
    const escapeAttribute = Shared.escapeAttribute;
    const isProductPageUrl = Detection.isProductPageUrl;
    const toUserError = (err) => CommerceModel.friendlyError(Shared.toUserError(err, { logPrefix: '[OnFrame comercio] detalhe tecnico:' }));

    const state = {
      context: null,
      itemId: null,
      ownerUserId: null,
      inline: null,
      popoverRoot: null,
      modalRoot: null,
      promotionResultPopoverRoot: null,
      promotionResultPopoverKey: '',
      promotionResultPopoverAnchor: null,
      loaded: false,
      busy: false,
      visible: true,
      priceLoading: false,
      promotionLoading: false,
      priceSummary: null,
      promotionSummary: null,
      priceError: '',
      promotionError: '',
      actionMessage: '',
      actionError: '',
      popover: null,
      priceEditing: false,
      priceDraft: '',
      priceBulkEnabled: false,
      priceBulkPreview: null,
      priceBulkHash: '',
      priceBulkError: '',
      operationPending: '',
      operationPendingKey: '',
      operationPendingAction: '',
      detailsOpen: false,
      promotionModalOpen: false,
      renderingPromotionModal: false,
      promotionFormKey: '',
      promotionFormAction: '',
      promotionDraftValues: {},
      promotionEstimates: {},
      promotionEstimateTimers: {},
      promotionEstimateRequestId: 0,
      promotionBulkEnabled: false,
      promotionConfirm: null,
      promotionFocusKey: '',
      promotionSearch: '',
      promotionStatusFilters: [],
      promotionTypeFilters: [],
      promotionFinancialFilters: [],
      promotionFiltersOpen: false,
      datePickerRoot: null,
      datePickerOutsideHandler: null,
      renderTimer: null,
      requestId: 0,
      pageSignature: '',
      lastInlineMarkup: '',
      lastPopoverMarkup: '',
      lastModalMarkup: '',
      viewportEventsReady: false,
      documentEventsReady: false
    };

    function startCommerce() {
      bindViewportEvents();
      bindDocumentEvents();
      state.pageSignature = readPageSignature();
      if (state.visible) mountCommerce();
    }

    function resetState() {
      removeInline();
      removePopover();
      removeModal();
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
      state.actionMessage = '';
      state.actionError = '';
      state.popover = null;
      state.priceEditing = false;
      state.priceDraft = '';
      state.priceBulkEnabled = false;
      state.priceBulkPreview = null;
      state.priceBulkHash = '';
      state.priceBulkError = '';
      state.operationPending = '';
      state.operationPendingKey = '';
      state.operationPendingAction = '';
      state.detailsOpen = false;
      state.promotionModalOpen = false;
      state.promotionFormKey = '';
      state.promotionFormAction = '';
      state.promotionDraftValues = {};
      clearPromotionEstimateTimers();
      state.promotionEstimates = {};
      state.promotionBulkEnabled = false;
      state.promotionConfirm = null;
      state.promotionFocusKey = '';
      resetPromotionListFilters();
      removeDatePicker();
      state.renderTimer = null;
      state.requestId += 1;
      state.pageSignature = readPageSignature();
      state.lastInlineMarkup = '';
      state.lastPopoverMarkup = '';
      state.lastModalMarkup = '';
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
        resetState();
        return;
      }

      if (status === 'loading') {
        state.pageSignature = pageSignature;
        state.busy = true;
        state.loaded = false;
        state.actionMessage = '';
        state.actionError = '';
        state.popover = null;
        state.priceEditing = false;
        state.promotionModalOpen = false;
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
      state.actionMessage = '';
      state.actionError = '';
      state.popover = null;
      state.priceEditing = false;
      state.promotionModalOpen = false;
      void loadContext(update.context);
    }

    function isSameResolvedItem(context) {
      const nextItemId = context && context.item && context.item.id ? String(context.item.id) : '';
      const nextOwnerId = context && context.ownerAccount && context.ownerAccount.user_id ? String(context.ownerAccount.user_id) : '';
      return Boolean(nextItemId && state.itemId && nextItemId === String(state.itemId) && nextOwnerId === String(state.ownerUserId || ''));
    }

    async function loadContext(context) {
      state.busy = true;
      state.loaded = false;
      state.actionError = '';
      state.actionMessage = '';
      const requestId = ++state.requestId;

      try {
        if (!context) throw new Error('Contexto do anúncio indisponível.');
        if (requestId !== state.requestId) return;
        state.context = context;
        state.itemId = context && context.item && context.item.id ? context.item.id : null;
        state.ownerUserId = context && context.ownerAccount && context.ownerAccount.user_id ? context.ownerAccount.user_id : null;
        state.loaded = true;
        state.pageSignature = context && context.page && context.page.signature ? context.page.signature : readPageSignature();
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
        state.promotionError = '';
      } else {
        state.promotionSummary = null;
        state.promotionError = toUserError(promotionResult.reason);
      }

      state.priceLoading = false;
      state.promotionLoading = false;
      mountCommerce();
    }

    function mountCommerce() {
      if (!state.visible || !isProductPageUrl(location.href)) {
        removeInline();
        removePopover();
        removeModal();
        return;
      }

      const anchor = findPriceAnchor();
      if (!anchor || !state.loaded || (!state.context && !state.actionError)) {
        removeInline();
        removePopover();
        removeModal();
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
    }

    function renderInline() {
      if (!state.inline) return;
      const markup = buildInlineMarkup();
      if (markup === state.lastInlineMarkup) return;
      state.lastInlineMarkup = markup;
      state.inline.innerHTML = markup;
      bindInlineEvents();
    }

    function buildInlineMarkup() {
      if (state.actionError && !state.context) {
        return `
          <div class="onframe-commerce-chipbar">
            <button class="onframe-commerce-chip warn" data-action="reload-commerce" type="button">
              ${icon('warning', 14)}<span>${escapeHtml(shortMessage(state.actionError))}</span>
            </button>
          </div>
        `;
      }

      const priceState = state.priceSummary ? CommerceModel.getPriceState(state.priceSummary) : null;
      const promotionState = state.promotionSummary ? CommerceModel.getPromotionState(state.promotionSummary) : null;
      const priceTone = state.priceError ? 'warn' : priceState ? priceState.tone : 'muted';
      const promotionTone = state.promotionError ? 'warn' : promotionState ? promotionState.tone : 'muted';
      const priceLabel = state.priceLoading ? 'Preço' : 'Preço';
      const promotionLabel = state.promotionLoading ? 'Promoção' : promotionState ? promotionState.label : 'Promoção';

      return `
        <div class="onframe-commerce-chipbar" aria-label="Ações OnFrame para preço e promoções">
          <button class="onframe-commerce-chip ${escapeAttribute(priceTone)}" data-action="open-price" type="button">
            ${icon('price', 14)}<span>${escapeHtml(priceLabel)}</span>
          </button>
          <button class="onframe-commerce-chip ${escapeAttribute(promotionTone)}" data-action="open-promotions" type="button">
            ${icon('tag', 14)}<span>${escapeHtml(promotionLabel)}</span>
          </button>
        </div>
      `;
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
      positionFloatingRoot(state.popoverRoot, popoverAnchor());
      const markup = state.popover === 'price' ? buildPricePopover() : buildPromotionPopover();
      if (markup === state.lastPopoverMarkup) return;
      state.lastPopoverMarkup = markup;
      state.popoverRoot.innerHTML = markup;
      bindPopoverEvents();
    }

    function buildPricePopover() {
      if (state.priceLoading) {
        return `
          <section class="onframe-commerce-popover">
            ${renderPopoverHead('Preço', 'Carregando')}
            <div class="onframe-commerce-muted">Lendo preço do anúncio.</div>
          </section>
        `;
      }

      if (state.priceError) {
        return `
          <section class="onframe-commerce-popover">
            ${renderPopoverHead('Preço', 'Aviso')}
            ${renderNotice(state.priceError, 'warn')}
            <button class="onframe-commerce-btn primary" data-action="reload-commerce" type="button">${icon('refresh', 14)}Recarregar</button>
          </section>
        `;
      }

      const priceState = CommerceModel.getPriceState(state.priceSummary);
      if (state.priceEditing) return renderPriceEdit(priceState);

      return `
        <section class="onframe-commerce-popover">
          ${renderPopoverHead('Preço')}
          ${renderNotice(state.actionMessage || state.actionError, state.actionError ? 'warn' : 'ok')}
          ${renderPriceSummary(state.priceSummary, priceState)}
          ${renderPriceStackableScenarios(state.priceSummary)}
          ${state.detailsOpen ? `<p class="onframe-commerce-detail">${escapeHtml(priceState.detail)}</p>` : ''}
          <div class="onframe-commerce-actions">
            <button class="onframe-commerce-btn primary" data-action="edit-price" type="button" ${priceState.canEdit ? '' : 'disabled'}>${icon('pencil', 14)}Editar preço base</button>
            ${priceState.blocker ? '<button class="onframe-commerce-btn" data-action="toggle-details" type="button">Ver motivo</button>' : ''}
            ${renderRefreshButton()}
          </div>
        </section>
      `;
    }

    function renderPriceEdit(priceState) {
      const bulkSwitch = renderBulkSwitch('price', state.priceBulkEnabled);
      return `
        <section class="onframe-commerce-popover">
          ${renderPopoverHead('Editar preço', priceState.label)}
          ${renderNotice(state.actionError, 'warn')}
          <section class="ob-card onframe-commerce-popover-price-edit-card">
            <div class="onframe-commerce-popover-price-edit-field">
              <label class="onframe-commerce-field">
                <span>Novo preço</span>
                <input data-field="price" inputmode="decimal" autocomplete="off" value="${escapeAttribute(state.priceDraft)}">
              </label>
            </div>
            ${bulkSwitch ? `<div class="onframe-commerce-popover-price-edit-bulk">${bulkSwitch}</div>` : ''}
          </section>
          ${renderBulkBusyStatus()}
          ${renderBulkStatus(state.priceBulkPreview, state.priceBulkError)}
          <div class="onframe-commerce-actions">
            <button class="onframe-commerce-btn primary" data-action="save-price" type="button" ${state.busy ? 'disabled' : ''}>${priceSaveIcon()}${escapeHtml(priceSaveLabel())}</button>
            <button class="onframe-commerce-btn" data-action="cancel-price" type="button" ${state.busy ? 'disabled' : ''}>Descartar</button>
          </div>
        </section>
      `;
    }

    function buildPromotionPopover() {
      if (state.promotionLoading) {
        return `
          <section class="onframe-commerce-popover">
            ${renderPopoverHead('Promoções', 'Carregando')}
            <div class="onframe-commerce-muted">Lendo promoções do anúncio.</div>
          </section>
        `;
      }

      if (state.promotionError) {
        return `
          <section class="onframe-commerce-popover">
            ${renderPopoverHead('Promoções', 'Aviso')}
            ${renderNotice(state.promotionError, 'warn')}
            <button class="onframe-commerce-btn primary" data-action="reload-commerce" type="button">${icon('refresh', 14)}Recarregar</button>
          </section>
        `;
      }

      const groups = CommerceModel.collectPromotionGroups(state.promotionSummary);
      const campaign = promotionPopoverCampaignEntry(groups);
      const coupons = promotionPopoverCouponEntries(groups);
      const paymentBenefits = promotionPopoverPaymentEntries(groups);
      return `
        <section class="onframe-commerce-popover">
          ${renderPopoverHead('Promoções')}
          ${renderNotice(state.actionMessage || state.actionError, state.actionError ? 'warn' : 'ok')}
          ${campaign ? renderPromotionPopoverCampaign(campaign) : renderPromotionPopoverEmptyState()}
          ${renderPromotionPopoverCouponList(coupons)}
          ${renderPromotionPopoverPaymentList(paymentBenefits)}
          <div class="onframe-commerce-actions">
            <button class="onframe-commerce-btn primary" data-action="open-promotion-modal" type="button">${icon('tag', 14)}Gerenciar promoções</button>
            ${renderRefreshButton()}
          </div>
        </section>
      `;
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

      const modal = state.modalRoot.querySelector('.onframe-commerce-modal');
      const modalScrollTop = modal ? modal.scrollTop : 0;
      const pageScrollX = window.scrollX;
      const pageScrollY = window.scrollY;
      const focusedField = captureModalFieldFocus();
      const markup = buildPromotionModal();
      if (markup === state.lastModalMarkup) return;
      state.lastModalMarkup = markup;
      removeDatePicker();
      removePromotionResultPopover();
      state.renderingPromotionModal = true;
      try {
        state.modalRoot.innerHTML = markup;
        bindModalEvents();
        restoreModalPosition(modalScrollTop, pageScrollX, pageScrollY);
        restoreModalFieldFocus(focusedField);
      } finally {
        state.renderingPromotionModal = false;
      }
    }

    function buildPromotionModal() {
      return `
        <div class="onframe-commerce-backdrop">
          <section class="onframe-commerce-modal" role="dialog" aria-modal="true" aria-label="Gerenciar promoções">
            <header class="onframe-commerce-modal-head">
              <div>
                <span>OnFrame</span>
                <h2>Promoções</h2>
                <p>Controle ofertas e campanhas deste anúncio.</p>
              </div>
              <div class="onframe-commerce-modal-head-actions">
                ${renderIconTooltipButton({
                  action: 'reload-commerce',
                  label: 'Atualizar promoções',
                  iconMarkup: icon('reload', 16),
                  className: 'onframe-commerce-icon-btn onframe-commerce-modal-head-action',
                  tooltipId: 'onframe-promotion-modal-reload-tooltip',
                  placement: 'bottom',
                  disabled: state.promotionLoading ? 'disabled' : ''
                })}
                ${renderIconTooltipButton({
                  action: 'close-promotion-modal',
                  label: 'Fechar',
                  iconMarkup: icon('x', 18),
                  className: 'onframe-commerce-icon-btn onframe-commerce-modal-head-action',
                  tooltipId: 'onframe-promotion-modal-close-tooltip',
                  placement: 'bottom'
                })}
              </div>
            </header>
            ${renderNotice(state.actionMessage || state.actionError || state.promotionError, state.actionError || state.promotionError ? 'warn' : 'ok')}
            ${state.promotionLoading ? '<div class="onframe-commerce-empty">Lendo promoções...</div>' : renderPromotionManager()}
            <footer class="onframe-commerce-modal-foot">
              <button class="onframe-commerce-btn" data-action="close-promotion-modal" type="button">Fechar</button>
            </footer>
          </section>
        </div>
      `;
    }

    function renderPromotionManager() {
      if (!state.promotionSummary) return '<div class="onframe-commerce-empty">Promoções indisponíveis.</div>';
      const rows = filterPromotionRows(buildPromotionRows());
      return `
        <section class="onframe-commerce-promotion-list" aria-label="Lista de promoções">
          ${renderPromotionListControls()}
          <div class="ob-table-wrap onframe-commerce-promotion-table-wrap">
            <table class="ob-table onframe-commerce-promotion-table" aria-label="Promoções deste anúncio">
              <thead>
                <tr class="ob-table-row onframe-commerce-promotion-table-head">
                  <th class="ob-table-header onframe-commerce-promotion-column-name" scope="col">Promoção</th>
                  <th class="ob-table-header onframe-commerce-promotion-column-period" scope="col">Estado e vigência</th>
                  <th class="ob-table-header onframe-commerce-promotion-column-condition" scope="col">Condição</th>
                  <th class="ob-table-header onframe-commerce-promotion-column-result" scope="col">Resultado</th>
                  <th class="ob-table-header onframe-commerce-promotion-column-actions onframe-commerce-promotion-action-head" scope="col">Ação</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length ? rows.map(renderPromotionListRow).join('') : renderPromotionListEmpty()}
              </tbody>
            </table>
          </div>
        </section>
      `;
    }

    function renderPromotionListControls() {
      return `
        <div class="onframe-commerce-promotion-list-tools">
          <label class="ob-field-shell onframe-commerce-promotion-search">
            ${icon('search', 16)}
            <input class="ob-field-input" data-action="promotion-search" type="search" value="${escapeAttribute(state.promotionSearch)}" placeholder="Buscar promoção ou cupom..." aria-label="Buscar promoção ou cupom" autocomplete="off">
          </label>
          <div class="onframe-commerce-promotion-filter-wrap">
            <button class="onframe-commerce-btn compact ${hasPromotionFilters() ? 'primary' : ''}" data-action="toggle-promotion-filters" type="button" aria-expanded="${state.promotionFiltersOpen ? 'true' : 'false'}" aria-haspopup="dialog">${icon('sliders', 14)}Filtros</button>
            ${state.promotionFiltersOpen ? renderPromotionFilterPanel() : ''}
          </div>
        </div>
      `;
    }

    function renderPromotionFilterPanel() {
      return `
        <div class="onframe-commerce-promotion-filter-panel" role="dialog" aria-label="Filtrar promoções">
          <div class="onframe-commerce-promotion-filter-group">
            <strong>Estado</strong>
            ${renderPromotionFilterOption('status', 'active', 'Ativas')}
            ${renderPromotionFilterOption('status', 'programmed', 'Programadas')}
            ${renderPromotionFilterOption('status', 'available', 'Disponíveis')}
          </div>
          <div class="onframe-commerce-promotion-filter-group">
            <strong>Tipo</strong>
            ${renderPromotionFilterOption('type', 'campaign', 'Campanhas')}
            ${renderPromotionFilterOption('type', 'coupon', 'Cupons')}
            ${renderPromotionFilterOption('type', 'direct', 'Descontos diretos')}
            ${renderPromotionFilterOption('type', 'payment', 'Descontos por pagamento')}
          </div>
          <div class="onframe-commerce-promotion-filter-group">
            <strong>Financeiro</strong>
            ${renderPromotionFilterOption('financial', 'fee_reduction', 'Com redução de tarifa')}
          </div>
          ${hasPromotionFilters() ? '<button class="onframe-commerce-link" data-action="clear-promotion-filters" type="button">Limpar filtros</button>' : ''}
        </div>
      `;
    }

    function renderPromotionFilterOption(group, value, label) {
      const selected = promotionFilterValues(group).includes(value);
      return `
        <button class="ob-checkbox onframe-commerce-promotion-filter-option ${selected ? 'is-checked' : ''}" data-action="toggle-promotion-filter" data-filter-group="${escapeAttribute(group)}" data-filter-value="${escapeAttribute(value)}" type="button" role="checkbox" aria-checked="${selected ? 'true' : 'false'}">
          <span class="ob-checkbox-box" aria-hidden="true"></span>
          <span class="ob-checkbox-label">${escapeHtml(label)}</span>
        </button>
      `;
    }

    function renderPromotionListEmpty() {
      const message = state.promotionSearch || hasPromotionFilters()
        ? 'Nenhuma promoção corresponde aos filtros atuais.'
        : 'Nenhuma promoção disponível para este anúncio.';
      return `
        <tr class="ob-table-row onframe-commerce-promotion-list-empty-row">
          <td class="ob-table-cell" colspan="5">
            <div class="onframe-commerce-promotion-list-empty">${escapeHtml(message)}</div>
          </td>
        </tr>
      `;
    }

    function renderPromotionListRow(row) {
      const { entry, kind, index, key, type, status } = row;
      const canCreate = !CommerceModel.isSellerWidePromotion(entry) && (kind === 'eligible-offer' || kind === 'stackable-offer' && isCandidatePromotion(entry) || kind === 'discount-offer' && isCandidatePromotion(entry));
      const canUpdate = (kind === 'active-offer' || kind === 'programmed-offer') && CommerceModel.canUpdateOffer(entry);
      const canDelete = (kind === 'active-offer' || kind === 'programmed-offer' || kind === 'stackable-offer' && !isCandidatePromotion(entry) || kind === 'discount-offer' && !isCandidatePromotion(entry)) && CommerceModel.canDeleteOffer(entry);
      const userFields = CommerceModel.getUserFields(canUpdate ? CommerceModel.getOfferUpdateFields(entry) : CommerceModel.getOfferCreateFields(entry));
      const formOpen = state.promotionFormKey === key;
      const confirm = state.promotionConfirm && state.promotionConfirm.key === key ? state.promotionConfirm : null;
      const confirmBlocked = confirm ? isPromotionConfirmationBlocked(entry, confirm) : false;
      const expanded = formOpen || confirm;
      const actionMarkup = renderPromotionListActions({ key, kind, canCreate, canUpdate, canDelete, confirm, formOpen, confirmBlocked, userFields });

      return `
        <tr class="ob-table-row onframe-commerce-promotion-list-row ${expanded ? 'is-expanded' : ''}" data-entry-kind="${escapeAttribute(kind)}" data-entry-index="${index}" data-entry-key="${escapeAttribute(key)}">
          <td class="ob-table-cell onframe-commerce-promotion-cell onframe-commerce-promotion-name" data-label="Promoção">
            <div class="onframe-commerce-promotion-name-content">
              <span class="onframe-commerce-promotion-type-icon ${escapeAttribute(type)}" aria-hidden="true">${icon(promotionTypeIcon(type), 16)}</span>
              <div>
                <strong>${escapeHtml(entry.label || 'Promoção')}</strong>
                <span>${escapeHtml(promotionTypeLabel(entry, type))}</span>
              </div>
            </div>
          </td>
          <td class="ob-table-cell onframe-commerce-promotion-cell onframe-commerce-promotion-period" data-label="Estado e vigência">
            <div class="onframe-commerce-promotion-period-content">
              <small>${escapeHtml(formatPromotionPeriodShort(entry) || 'Sem vigência informada')}</small>
              <span class="onframe-commerce-status ${escapeAttribute(promotionDisplayTone(entry))}">${escapeHtml(promotionListStatusLabel(status))}</span>
            </div>
          </td>
          <td class="ob-table-cell onframe-commerce-promotion-cell onframe-commerce-promotion-condition" data-label="Condição"><div class="onframe-commerce-promotion-condition-content">${renderPromotionListCondition(entry, type)}</div></td>
          <td class="ob-table-cell onframe-commerce-promotion-cell onframe-commerce-promotion-result" data-label="Resultado"><div class="onframe-commerce-promotion-result-content">${renderPromotionListResult(entry, key)}</div></td>
          <td class="ob-table-cell onframe-commerce-promotion-cell onframe-commerce-promotion-row-actions" data-label="Ação"><div class="onframe-commerce-promotion-row-actions-content">${confirm ? '' : actionMarkup}</div></td>
        </tr>
        ${expanded ? `
          <tr class="ob-table-row onframe-commerce-promotion-list-detail-row" data-entry-kind="${escapeAttribute(kind)}" data-entry-index="${index}" data-entry-key="${escapeAttribute(key)}">
            <td class="ob-table-cell onframe-commerce-promotion-list-detail-cell" colspan="5">
              <div class="onframe-commerce-promotion-list-row-detail">
              ${formOpen ? renderPromotionFields(userFields, key, entry) : ''}
              ${renderPromotionReview(key, entry, formOpen, confirm)}
              ${formOpen ? `<div class="onframe-commerce-promotion-form-actions">
                <button class="onframe-commerce-btn compact danger" data-action="cancel-promotion-form" type="button">${icon('x', 14)}Descartar alterações</button>
              </div>` : ''}
              ${confirm ? `<div class="onframe-commerce-promotion-review-actions">${actionMarkup}</div>` : ''}
              </div>
            </td>
          </tr>
        ` : ''}
      `;
    }

    function renderPromotionListActions({ key, kind, canCreate, canUpdate, canDelete, confirm, formOpen, confirmBlocked, userFields }) {
      if (confirm) {
        const action = confirm.action;
        const blocked = action === 'create'
          ? confirmBlocked
          : action === 'update'
            ? confirmBlocked
            : false;
        const tone = action === 'delete' ? 'danger' : 'primary';
        return `
          <button class="onframe-commerce-btn ${tone} compact" data-action="${escapeAttribute(`${action}-offer`)}" type="button" ${promotionActionDisabled(blocked)}>${promotionActionIcon(action, key, confirm, formOpen)}${promotionActionLabel(action, confirm, formOpen, userFields, key)}</button>
          <button class="onframe-commerce-btn compact" data-action="cancel-promotion-confirm" type="button" ${state.busy ? 'disabled' : ''}>Cancelar</button>
        `;
      }
      const createLabel = promotionActionLabel('create', null, false, userFields, key);
      const updateLabel = promotionActionLabel('update', null, false, userFields, key);
      return `
        ${canCreate ? renderIconTooltipButton({
          action: 'create-offer',
          label: createLabel,
          iconMarkup: promotionActionIcon('create', key, confirm, formOpen),
          className: 'onframe-commerce-icon-btn onframe-commerce-promotion-action-btn',
          tooltipId: promotionTooltipId(key, 'create'),
          placement: 'left',
          disabled: promotionActionDisabled(false)
        }) : ''}
        ${canUpdate ? renderIconTooltipButton({
          action: 'update-offer',
          label: updateLabel,
          iconMarkup: promotionActionIcon('update', key, confirm, formOpen),
          className: 'onframe-commerce-icon-btn onframe-commerce-promotion-action-btn',
          tooltipId: promotionTooltipId(key, 'update'),
          placement: 'left',
          disabled: promotionActionDisabled(false)
        }) : ''}
        ${canDelete ? renderIconTooltipButton({
          action: 'delete-offer',
          label: 'Remover promoção',
          iconMarkup: promotionActionIcon('delete', key, confirm, formOpen),
          className: 'onframe-commerce-icon-btn onframe-commerce-promotion-action-btn danger',
          tooltipId: promotionTooltipId(key, 'delete'),
          placement: 'left',
          disabled: promotionActionDisabled(false)
        }) : ''}
      `;
    }

    function renderIconTooltipButton({ action, label, iconMarkup, className, tooltipId, placement = 'top', disabled = '' }) {
      return `
        <span class="ob-tooltip" data-placement="${escapeAttribute(placement)}">
          <button class="${escapeAttribute(className)}" data-action="${escapeAttribute(action)}" type="button" aria-label="${escapeAttribute(label)}" aria-describedby="${escapeAttribute(tooltipId)}" ${disabled}>${iconMarkup}</button>
          <span class="ob-tooltip-content" id="${escapeAttribute(tooltipId)}" role="tooltip">${escapeHtml(label)}<span class="ob-tooltip-arrow" aria-hidden="true"></span></span>
        </span>
      `;
    }

    function promotionTooltipId(key, action) {
      const safeKey = String(key || '').replace(/[^a-z0-9_-]/gi, '-');
      return `onframe-promotion-${safeKey}-${action}-tooltip`;
    }

    function buildPromotionRows() {
      const groups = CommerceModel.collectPromotionGroups(state.promotionSummary);
      const directDiscount = buildDiscountEntry();
      const sources = [
        { kind: 'active-offer', entries: currentPromotionEntries(campaignPromotionEntries(groups.activeOffers)) },
        { kind: 'stackable-offer', entries: stackablePromotionEntries(groups) },
        { kind: 'eligible-offer', entries: promotionOpportunityEntries(groups) },
        { kind: 'discount-offer', entries: directDiscount ? [directDiscount] : [] },
        { kind: 'programmed-offer', entries: programmedPromotionEntries(groups) }
      ];
      return sources.flatMap(({ kind, entries }) => entries.map((entry, index) => {
        const status = promotionListStatus(entry, kind);
        const type = promotionListType(entry);
        return { entry, kind, index, key: `${kind}:${index}`, status, type };
      })).sort(comparePromotionRows);
    }

    function filterPromotionRows(rows) {
      const query = normalizeSearchText(state.promotionSearch);
      const statuses = state.promotionStatusFilters;
      const types = state.promotionTypeFilters;
      const financial = state.promotionFinancialFilters;
      return rows.filter((row) => {
        if (statuses.length && !statuses.includes(row.status)) return false;
        if (types.length && !types.includes(row.type)) return false;
        if (financial.includes('fee_reduction') && !hasPromotionFeeReduction(row.entry)) return false;
        if (!query) return true;
        return normalizeSearchText(`${row.entry.label || ''} ${promotionTypeLabel(row.entry, row.type)}`).includes(query);
      });
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
      const display = String(entry && entry.display_status || '').toLowerCase();
      if (display === 'active') return 'active';
      if (display === 'programmed') return 'programmed';
      if (display === 'available') return 'available';
      if (kind === 'programmed-offer') return 'programmed';
      if (kind === 'eligible-offer' || kind === 'discount-offer') return 'available';
      return 'active';
    }

    function promotionListStatusLabel(status) {
      if (status === 'programmed') return 'Programada';
      if (status === 'available') return 'Disponível';
      return 'Ativa';
    }

    function promotionListType(entry) {
      const type = String(entry && entry.type || '').toUpperCase();
      if (type === 'SELLER_COUPON_CAMPAIGN' || String(entry && entry.stackable_context || '') === 'seller_coupon') return 'coupon';
      if (type === 'BANK' || String(entry && entry.stackable_context || '') === 'payment_method') return 'payment';
      if (type === 'PRICE_DISCOUNT') return 'direct';
      return 'campaign';
    }

    function promotionTypeIcon(type) {
      if (type === 'coupon') return 'ticket';
      if (type === 'payment') return 'creditCard';
      return 'tag';
    }

    function promotionTypeLabel(entry, type) {
      if (type === 'coupon') return 'Cupom do vendedor';
      if (type === 'payment') {
        const payment = stackablePaymentLabel(entry);
        return payment ? `Desconto no ${payment}` : 'Desconto por pagamento';
      }
      if (type === 'direct') return 'Desconto direto';
      if (type === 'campaign') return 'Campanha do vendedor';
      return 'Promoção';
    }

    function renderPromotionListCondition(entry, type) {
      const displayPrice = promotionDisplayPrice(entry);
      const discount = discountPercent(entry && entry.original_price, displayPrice);
      const rule = promotionAudienceRule(entry);
      if (type === 'coupon') {
        if (CommerceModel.isSellerWidePromotion(entry)) {
          return '<strong>Cupom acumulativo</strong><span>Elegibilidade depende do comprador</span>';
        }
        return `<strong>${escapeHtml(rule || 'Cupom acumulativo')}</strong>${discount ? `<span>${escapeHtml(`${discount}% OFF`)}</span>` : ''}`;
      }
      if (type === 'payment') {
        const payment = stackablePaymentLabel(entry);
        return `<strong>${escapeHtml(payment ? `No ${payment}` : 'Desconto acumulativo')}</strong>${discount ? `<span>${escapeHtml(`${discount}% OFF`)}</span>` : ''}`;
      }
      if (displayPrice) {
        return `<strong>${escapeHtml(CommerceModel.formatMoney(displayPrice, itemCurrency()))}</strong>${discount ? `<span>${escapeHtml(`${discount}% OFF`)}</span>` : ''}`;
      }
      if (type === 'direct') return '<strong>Defina preço e prazo</strong>';
      return '<span>Condição informada ao revisar</span>';
    }

    function renderPromotionListResult(entry, key) {
      if (!CommerceModel.canEstimatePromotion(entry)) {
        return '<strong>Depende do comprador</strong><span>Não entra nesta estimativa</span>';
      }
      const estimate = state.promotionEstimates[key];
      if (!estimate || estimate.status !== 'ready' || !estimate.data || moneyOrNull(estimate.data.youReceive) === null) return '';
      const currency = estimate.data.currency_id || itemCurrency();
      const financialMetrics = promotionFinancialMetrics(estimate.data.promotionFinancial);
      return `
        <div class="onframe-commerce-promotion-result-value">
          <strong>Você recebe ${escapeHtml(CommerceModel.formatMoney(estimate.data.youReceive, currency))}</strong>
          ${renderPromotionResultPopoverTrigger(key)}
        </div>
        ${financialMetrics.map((metric) => `<span>${escapeHtml(`${metric.label}: ${metric.value}`)}</span>`).join('')}
      `;
    }

    function renderPromotionResultPopoverTrigger(key) {
      const id = promotionResultPopoverId(key);
      return `
        <span class="ob-tooltip onframe-commerce-promotion-result-tooltip" data-placement="top">
          <button class="onframe-commerce-icon-btn onframe-commerce-promotion-result-info" data-action="toggle-promotion-result-popover" type="button" aria-label="Ver detalhes do cálculo" aria-controls="${escapeAttribute(id)}" aria-expanded="false">${icon('info', 14)}</button>
          <span class="ob-tooltip-content" role="tooltip">Ver detalhes do cálculo<span class="ob-tooltip-arrow" aria-hidden="true"></span></span>
        </span>
      `;
    }

    function promotionResultPopoverId(key) {
      return `onframe-promotion-result-${String(key || '').replace(/[^a-z0-9_-]/gi, '-')}`;
    }

    function togglePromotionResultPopover(button) {
      const card = button.closest('[data-entry-key]');
      const key = card && card.dataset ? card.dataset.entryKey : '';
      if (!key) return;
      if (state.promotionResultPopoverKey === key) {
        removePromotionResultPopover();
        return;
      }

      const details = promotionResultPopoverDetails(key);
      if (!details) return;
      removePromotionResultPopover();
      state.promotionResultPopoverKey = key;
      state.promotionResultPopoverAnchor = button;
      button.setAttribute('aria-expanded', 'true');
      renderPromotionResultPopover(details);
    }

    function renderPromotionResultPopover(details) {
      if (!details || !state.promotionResultPopoverAnchor) return;
      if (!state.promotionResultPopoverRoot) {
        state.promotionResultPopoverRoot = document.createElement('div');
        state.promotionResultPopoverRoot.className = 'onframe-commerce-promotion-result-popover-root';
        document.body.appendChild(state.promotionResultPopoverRoot);
      }

      state.promotionResultPopoverRoot.innerHTML = buildPromotionResultPopover(details);
      positionPromotionResultPopover(state.promotionResultPopoverRoot, state.promotionResultPopoverAnchor);
      bindButton(state.promotionResultPopoverRoot, 'close-promotion-result-popover', removePromotionResultPopover);
    }

    function buildPromotionResultPopover({ key, entry, estimate }) {
      const id = promotionResultPopoverId(key);
      const currency = estimate.currency_id || itemCurrency();
      const rows = promotionResultPopoverRows(entry, estimate, currency);
      return `
        <section class="ob-popover onframe-commerce-promotion-result-popover" id="${escapeAttribute(id)}" role="dialog" aria-label="Detalhes do cálculo da promoção">
          <header class="onframe-commerce-promotion-result-popover-head">
            <div>
              <strong>Detalhes do cálculo</strong>
              <span>${escapeHtml(entry.label || 'Promoção')}</span>
            </div>
            <button class="onframe-commerce-icon-btn onframe-commerce-promotion-result-popover-close" data-action="close-promotion-result-popover" type="button" aria-label="Fechar detalhes do cálculo">${icon('x', 14)}</button>
          </header>
          <div class="onframe-commerce-promotion-result-popover-rows">
            ${rows.map(renderPromotionResultPopoverRow).join('')}
          </div>
          <p class="onframe-commerce-promotion-result-popover-note">Estimativa calculada com o preço promocional.</p>
        </section>
      `;
    }

    function promotionResultPopoverDetails(key) {
      const [kind, indexText] = String(key || '').split(':');
      const entry = getPromotionEntry(kind, Number(indexText));
      const record = state.promotionEstimates[key];
      const estimate = record && record.status === 'ready' ? record.data : null;
      if (!entry || !estimate || moneyOrNull(estimate.youReceive) === null) return null;
      return { key, entry, estimate };
    }

    function promotionResultPopoverRows(entry, estimate, currency) {
      const price = moneyOrNull(estimate.dealPrice);
      const originalPrice = moneyOrNull(entry && entry.original_price) || moneyOrNull(estimate.item && estimate.item.price);
      const financialMetrics = promotionFinancialMetrics(estimate.promotionFinancial);
      const commission = moneyOrNull(estimate.commission && estimate.commission.amount);
      const shipping = moneyOrNull(estimate.shipping && estimate.shipping.amount);
      const rows = [];

      if (price !== null) {
        rows.push({
          label: 'Preço promocional',
          description: originalPrice !== null && originalPrice !== price ? `Preço original ${CommerceModel.formatMoney(originalPrice, currency)}` : '',
          value: CommerceModel.formatMoney(price, currency)
        });
      }
      financialMetrics.forEach((metric) => rows.push({
        label: metric.label,
        value: metric.value,
        tone: metric.tone === 'green' ? 'benefit' : ''
      }));
      if (commission !== null) rows.push({ label: 'Comissão', value: formatPromotionCost(commission, currency) });
      if (shipping !== null) {
        rows.push({
          label: 'Frete',
          description: promotionShippingDescription(estimate.shipping),
          value: formatPromotionCost(shipping, currency)
        });
      }
      rows.push({ label: 'Você recebe', value: CommerceModel.formatMoney(estimate.youReceive, currency), tone: 'total' });
      return rows;
    }

    function renderPromotionResultPopoverRow(row) {
      if (!row || !row.label || !row.value) return '';
      return `
        <div class="onframe-commerce-promotion-result-popover-row ${escapeAttribute(row.tone || '')}">
          <div>
            <strong>${escapeHtml(row.label)}</strong>
            ${row.description ? `<span>${escapeHtml(row.description)}</span>` : ''}
          </div>
          <b>${escapeHtml(row.value)}</b>
        </div>
      `;
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

    function formatPromotionPeriodShort(entry) {
      const start = formatShortPromotionDate(entry && (entry.start_date || entry.startDate));
      const end = formatShortPromotionDate(entry && (entry.end_date || entry.finish_date || entry.endDate || entry.finishDate));
      if (start && end) return `De ${start} a ${end}`;
      if (start) return `A partir de ${start}`;
      if (end) return `Até ${end}`;
      return '';
    }

    function formatShortPromotionDate(value) {
      const date = parseIsoDate(value) || parseDateValue(value);
      if (!date) return '';
      const month = date.toLocaleDateString('pt-BR', { month: 'long' });
      return `${date.getDate()} de ${month}`;
    }

    function promotionAudienceRule(entry) {
      const raw = entry && entry.raw && typeof entry.raw === 'object' ? entry.raw : {};
      const value = entry && (entry.audience || entry.target_audience) || raw.audience || raw.target_audience || raw.beneficiary;
      return typeof value === 'string' ? value.trim() : '';
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
      return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
    }

    function promotionFilterValues(group) {
      if (group === 'status') return state.promotionStatusFilters;
      if (group === 'financial') return state.promotionFinancialFilters;
      return state.promotionTypeFilters;
    }

    function hasPromotionFilters() {
      return state.promotionStatusFilters.length > 0 || state.promotionTypeFilters.length > 0 || state.promotionFinancialFilters.length > 0;
    }

    function resetPromotionListFilters() {
      state.promotionSearch = '';
      state.promotionStatusFilters = [];
      state.promotionTypeFilters = [];
      state.promotionFinancialFilters = [];
      state.promotionFiltersOpen = false;
    }

    function promotionPopoverCampaignEntry(groups) {
      const active = currentPromotionEntry(campaignPromotionEntries(groups && groups.activeOffers));
      if (active) return active;
      return programmedPromotionEntries(groups).slice().sort((left, right) => {
        const difference = promotionStartTimestamp(left) - promotionStartTimestamp(right);
        if (difference) return difference;
        return String(left && left.label || '').localeCompare(String(right && right.label || ''), 'pt-BR');
      })[0] || null;
    }

    function promotionPopoverCouponEntries(groups) {
      return stackablePromotionEntries(groups).filter((entry) => {
        return promotionListType(entry) === 'coupon' && CommerceModel.isSellerWidePromotion(entry);
      });
    }

    function promotionPopoverPaymentEntries(groups) {
      return stackablePromotionEntries(groups).filter((entry) => promotionListType(entry) === 'payment');
    }

    function renderPromotionPopoverCampaign(entry) {
      const originalPrice = promotionSummaryOriginalPrice(entry);
      const finalPrice = promotionSummaryDisplayPrice(entry);
      const discount = discountPercent(originalPrice, finalPrice);
      const period = formatPromotionPeriodShort(entry) || 'Sem vigência informada';
      const status = promotionDisplayStatusLabel(entry);
      const tone = promotionDisplayTone(entry);
      return `
        <section class="ob-card onframe-commerce-popover-campaign">
          <div class="onframe-commerce-popover-campaign-grid">
            <div class="onframe-commerce-popover-campaign-field name">
              <small>Promoção</small>
              <strong>${escapeHtml(entry.label || 'Promoção')}</strong>
            </div>
            <div class="onframe-commerce-popover-campaign-field period">
              <small>Estado e vigência</small>
              <span>${escapeHtml(period)}</span>
              <span class="ob-badge ${escapeAttribute(tone)}">${escapeHtml(status)}</span>
            </div>
            <div class="onframe-commerce-popover-campaign-field">
              <small>Desconto</small>
              <strong>${discount ? escapeHtml(`${discount}% OFF`) : '—'}</strong>
            </div>
            <div class="onframe-commerce-popover-campaign-field">
              <small>Preço final</small>
              <strong>${finalPrice ? escapeHtml(CommerceModel.formatMoney(finalPrice, itemCurrency())) : '—'}</strong>
            </div>
          </div>
          ${renderPromotionPopoverFeeReduction(entry)}
        </section>
      `;
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
      return moneyOrNull(state.priceSummary && state.priceSummary.salePrice && state.priceSummary.salePrice.regular_amount);
    }

    function renderPromotionPopoverFeeReduction(entry) {
      const reduction = promotionFinancialFromEntry(entry).fee_reduction;
      const value = formatFinancialValue(reduction, itemCurrency());
      if (!value) return '';
      return `
        <div class="onframe-commerce-popover-fee-reduction">
          <span>Redução de tarifa por venda: <strong>${escapeHtml(value)}</strong>.</span>
        </div>
      `;
    }

    function renderPromotionPopoverCouponList(entries) {
      const list = Array.isArray(entries) ? entries : [];
      if (!list.length) return '';
      return `
        <section class="onframe-commerce-popover-conditions" aria-label="Cupons de marketing">
          <div class="onframe-commerce-popover-conditions-head">
            <small>Cupons de marketing</small>
            <span>Válidos para compradores elegíveis</span>
          </div>
          <div class="onframe-commerce-popover-condition-list">
            ${list.map(renderPromotionPopoverCoupon).join('')}
          </div>
        </section>
      `;
    }

    function renderPromotionPopoverCoupon(entry) {
      const benefit = promotionPopoverConditionalBenefit(entry);
      const audience = promotionAudienceRule(entry) || 'Elegibilidade depende do comprador';
      return `
        <div class="ob-card onframe-commerce-popover-condition coupon">
          <span class="onframe-commerce-popover-condition-icon">${icon('ticket', 14)}</span>
          <div>
            <strong>${escapeHtml(entry.label || 'Cupom de marketing')}</strong>
            <span>${escapeHtml(audience)}</span>
          </div>
          ${benefit ? `<b>${escapeHtml(benefit)}</b>` : ''}
        </div>
      `;
    }

    function renderPromotionPopoverPaymentList(entries) {
      const list = Array.isArray(entries) ? entries : [];
      if (!list.length) return '';
      return `
        <section class="onframe-commerce-popover-conditions payment" aria-label="Descontos por pagamento">
          <div class="onframe-commerce-popover-conditions-head">
            <small>Descontos por pagamento</small>
          </div>
          <div class="onframe-commerce-popover-condition-list">
            ${list.map(renderPromotionPopoverPayment).join('')}
          </div>
        </section>
      `;
    }

    function renderPromotionPopoverPayment(entry) {
      const payment = stackablePaymentLabel(entry);
      const benefit = promotionPopoverConditionalBenefit(entry);
      return `
        <div class="ob-card onframe-commerce-popover-condition payment">
          <span class="onframe-commerce-popover-condition-icon">${icon('creditCard', 14)}</span>
          <div>
            <strong>${escapeHtml(entry.label || (payment ? `Desconto no ${payment}` : 'Desconto por pagamento'))}</strong>
            <span>${escapeHtml(payment ? `Válido em pagamentos no ${payment}` : 'Condição definida no pagamento')}</span>
          </div>
          ${benefit ? `<b>${escapeHtml(benefit)}</b>` : ''}
        </div>
      `;
    }

    function promotionPopoverConditionalBenefit(entry) {
      const displayPrice = promotionDisplayPrice(entry);
      const discount = discountPercent(entry && entry.original_price, displayPrice);
      if (discount) return `${discount}% OFF`;
      const sellerPercentage = Number(entry && entry.seller_percentage);
      const meliPercentage = Number(entry && entry.meli_percentage);
      const percentage = (Number.isFinite(sellerPercentage) && sellerPercentage > 0 ? sellerPercentage : 0) +
        (Number.isFinite(meliPercentage) && meliPercentage > 0 ? meliPercentage : 0);
      if (percentage) return `${formatPercent(percentage)} OFF`;
      const boostedPercentage = Number(entry && (entry.discount_meli_boosted_percentage || entry.percentage));
      if (Number.isFinite(boostedPercentage) && boostedPercentage > 0) return `${formatPercent(boostedPercentage)} OFF`;
      const raw = entry && entry.raw && typeof entry.raw === 'object' ? entry.raw : {};
      const amount = moneyOrNull(entry && entry.discount_amount || raw.discount_amount);
      return amount === null ? '' : `${CommerceModel.formatMoney(amount, itemCurrency())} OFF`;
    }

    function renderPromotionPopoverEmptyState() {
      return `
        <div class="ob-card onframe-commerce-popover-empty">
          <div>
            <small>Promoções</small>
            <strong>Nenhuma promoção aplicada</strong>
          </div>
          <span>Gerencie campanhas e descontos deste anúncio.</span>
        </div>
      `;
    }

    function promotionFinancialFromEntry(entry, options = {}) {
      if (!entry) return { meli_contribution: null, seller_contribution: null, fee_reduction: null };
      if (entry.meli_contribution || entry.seller_contribution || entry.fee_reduction) return entry;

      const raw = entry.raw && typeof entry.raw === 'object' ? entry.raw : {};
      const benefits = entry.benefits || raw.benefits || {};
      const originalPrice = moneyOrNull(entry.original_price) || moneyOrNull(raw.original_price) || moneyOrNull(options.originalPrice);
      const meliPercentage = financialPercentage(entry.meli_percentage ?? raw.meli_percentage ?? benefits.meli_percent);
      const sellerPercentage = financialPercentage(entry.seller_percentage ?? raw.seller_percentage ?? benefits.seller_percent);
      const feeReductionAmount = moneyOrNull(entry.discount_meli_boost_amount ?? raw.discount_meli_boost_amount);
      const feeReductionPercentage = financialPercentage(entry.discount_meli_boosted_percentage ?? raw.discount_meli_boosted_percentage);
      const boosted = entry.boosted_offer === true || entry.boost && entry.boost.boosted_offer === true || raw.boosted_offer === true;
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
      return Boolean(financial.fee_reduction && financial.fee_reduction.boosted_offer === true);
    }

    function promotionFinancialMetrics(financial, options = {}) {
      const metrics = [];
      const currency = itemCurrency();
      const value = promotionFinancialFromEntry(financial, options);
      const meli = value.meli_contribution;
      const seller = value.seller_contribution;
      const feeReduction = value.fee_reduction;

      if (meli && financialPercentage(meli.percentage) !== null) {
        metrics.push(buildFinancialMetric('Redução de tarifa do Mercado Livre', meli.amount, meli.percentage, currency, 'green', 'meli-contribution'));
      }
      if (seller && financialPercentage(seller.percentage) !== null) {
        metrics.push(buildFinancialMetric('Desconto do vendedor', seller.amount, seller.percentage, currency, 'muted', 'seller-contribution'));
      }
      if (feeReduction && (moneyOrNull(feeReduction.amount) !== null || financialPercentage(feeReduction.percentage) !== null)) {
        metrics.push(buildFinancialMetric('Redução de tarifa por venda', feeReduction.amount, feeReduction.percentage, currency, 'green', 'fee-reduction'));
      }
      return metrics;
    }

    function formatFinancialValue(value, currency) {
      if (!value) return '';
      const amount = moneyOrNull(value.amount);
      const percentage = financialPercentage(value.percentage);
      return [amount !== null ? CommerceModel.formatMoney(amount, currency || itemCurrency()) : '', percentage !== null ? formatPercent(percentage) : ''].filter(Boolean).join(' · ');
    }

    function renderPromotionMetricGrid(metrics) {
      const list = Array.isArray(metrics) ? metrics.filter(Boolean) : [];
      if (!list.length) return '';
      return `
        <div class="onframe-commerce-promo-metrics">
          ${list.map((metric) => `
            ${renderMetricChip(metric)}
          `).join('')}
        </div>
      `;
    }

    function currentPromotionEntries(entries) {
      return (Array.isArray(entries) ? entries : []).filter((entry) => entry && !isStackablePromotion(entry) && (entry.is_current_price === true || entry.display_status === 'active'));
    }

    function programmedPromotionEntries(groups) {
      const activeProgrammed = campaignPromotionEntries(groups.activeOffers).filter((entry) => {
        return !isStackablePromotion(entry) && String(entry && entry.display_status || '').toLowerCase() === 'programmed';
      });
      const scheduled = campaignPromotionEntries(groups.scheduledOffers).filter((entry) => !isStackablePromotion(entry));
      return uniquePromotionEntries(activeProgrammed.concat(scheduled));
    }

    function stackablePromotionEntries(groups) {
      return uniquePromotionEntries([
        groups && groups.activeOffers,
        groups && groups.eligibleOffers,
        groups && groups.scheduledOffers
      ].flat().filter(isStackablePromotion));
    }

    function currentPromotionEntry(entries) {
      return currentPromotionEntries(entries)[0] || null;
    }

    function promotionDisplayStatusLabel(entry) {
      const status = String(entry && entry.display_status || '').toLowerCase();
      if (status === 'active') return 'Ativa';
      if (status === 'programmed') return 'Programada';
      if (status === 'available') return 'Elegível';
      if (status === 'finished') return 'Finalizada';
      return 'No anúncio';
    }

    function promotionDisplayTone(entry) {
      const status = String(entry && entry.display_status || '').toLowerCase();
      if (status === 'active') return 'green';
      if (status === 'programmed') return 'blue';
      if (status === 'available') return 'orange';
      return 'muted';
    }

    function renderPromotionFacts(entry, kind, key, userFields = [], options = {}) {
      const metrics = [];
      const displayPrice = promotionDisplayPrice(entry);
      const priceLabel = entry.price ? 'Preço' : entry.suggested_price ? 'Sugerido' : entry.total_price_for_boosted_offer ? 'Preço' : '';
      if (displayPrice) metrics.push({ label: priceLabel, value: CommerceModel.formatMoney(displayPrice, itemCurrency()), tone: 'primary' });
      const discount = discountPercent(entry.original_price, displayPrice);
      if (discount) metrics.push({ label: 'Desconto', value: `${discount}% OFF`, tone: 'success' });
      if (entry.suggested_price && entry.price && entry.suggested_price !== entry.price) {
        metrics.push({ label: 'Sugerido', value: CommerceModel.formatMoney(entry.suggested_price, itemCurrency()), tone: 'primary' });
      }
      const stackableContext = stackablePromotionContextMetric(entry);
      if (stackableContext) metrics.push(stackableContext);
      let appliedCostFacts = [];
      if (!options.suppressCostFacts && kind !== 'eligible-offer') {
        appliedCostFacts = renderAppliedPromotionCostFacts(key);
        appliedCostFacts.forEach((metric) => {
          metrics.push(metric);
        });
      }
      if (!options.suppressCostFacts) {
        promotionFinancialMetrics(entry, { originalPrice: entry.original_price }).forEach((metric) => {
          if (hasMetricLabel(metrics, metric.label)) return;
          if (!hasMetric(metrics, metric)) metrics.push(metric);
        });
      }
      if (entry.stock) metrics.push({ label: 'Estoque', value: `${entry.stock} un.`, tone: 'muted' });
      if (userFields.includes('deal_price')) metrics.push({ label: 'Entrada', value: 'Preço editável', tone: 'muted' });
      return metrics.map(renderMetricChip).join('');
    }

    function renderAppliedPromotionCostFacts(key) {
      const estimate = state.promotionEstimates[key];
      if (!estimate || estimate.status !== 'ready' || !estimate.data) return [];
      const currency = estimate.data.currency_id || itemCurrency();
      const facts = [];
      if (moneyOrNull(estimate.data.youReceive) !== null) {
        facts.push({ label: 'Você recebe', value: CommerceModel.formatMoney(estimate.data.youReceive, currency), tone: 'success' });
      }
      promotionFinancialMetrics(estimate.data.promotionFinancial).forEach((metric) => {
        facts.push(Object.assign({}, metric, { tone: metric.tone === 'green' ? 'success' : metric.tone }));
      });
      return facts;
    }

    function renderPromotionStatusBadge(status, tone, kind) {
      if (kind === 'eligible-offer') return '';
      return `<span class="onframe-commerce-status ${escapeAttribute(tone)}">${escapeHtml(status)}</span>`;
    }

    function renderPriceSummary(summary, priceState) {
      const snapshot = priceSnapshot(summary, priceState);
      const costs = priceSummaryCosts(summary);
      return `
        <section class="ob-card onframe-commerce-popover-price-card">
          <div class="onframe-commerce-popover-price-grid">
            ${renderPriceSummaryField(snapshot)}
            ${costs.fields.map(renderPriceSummaryField).join('')}
          </div>
          ${renderPriceSummaryFeeReduction(costs.feeReduction)}
        </section>
      `;
    }

    function priceSnapshot(summary, priceState) {
      const standard = summary && summary.standardPrice ? summary.standardPrice : {};
      const sale = summary && summary.salePrice ? summary.salePrice : null;
      const currency = itemCurrency();
      const standardAmount = Number(standard.amount || priceState.amount || 0);
      const saleAmount = Number(sale && sale.amount || 0);
      const hasPromotionPrice = saleAmount > 0 && (!standardAmount || saleAmount !== standardAmount);
      const activeAmount = hasPromotionPrice ? saleAmount : standardAmount;
      const originalPrice = hasPromotionPrice && standardAmount ? CommerceModel.formatMoney(standardAmount, currency) : '';
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
      const financial = breakdown && breakdown.promotion_financial ? breakdown.promotion_financial : null;
      const feeReduction = breakdown && breakdown.fee_reduction ? breakdown.fee_reduction : financial && financial.fee_reduction || null;
      if (!breakdown) return { fields, feeReduction: null };

      const commission = breakdown.commission || null;
      const shipping = breakdown.shipping || null;
      if (breakdown.complete && moneyOrNull(breakdown.you_receive) !== null) {
        fields.push({ label: 'Você recebe', value: CommerceModel.formatMoney(breakdown.you_receive, currency), tone: 'success' });
      } else {
        fields.push({ label: 'Custos', value: 'Incompletos', tone: 'warning' });
      }
      if (commission && moneyOrNull(commission.amount) !== null) {
        fields.push({ label: 'Comissão', value: CommerceModel.formatMoney(commission.amount, commission.currency_id || currency) });
      }
      if (shipping && moneyOrNull(shipping.amount) !== null) {
        fields.push({ label: 'Frete', value: CommerceModel.formatMoney(shipping.amount, shipping.currency_id || currency) });
      }
      promotionFinancialMetrics(financial).filter((metric) => metric.kind !== 'fee-reduction').forEach((metric) => fields.push(metric));
      return { fields, feeReduction };
    }

    function renderPriceSummaryField(field) {
      if (!field || !field.label || !field.value) return '';
      return `
        <div class="onframe-commerce-popover-price-field ${escapeAttribute(field.tone || '')}">
          <small>${escapeHtml(field.label)}</small>
          ${field.originalPrice ? `<span class="onframe-commerce-popover-price-transition">De <s>${escapeHtml(field.originalPrice)}</s> por</span>` : ''}
          <strong>${escapeHtml(field.value)}</strong>
        </div>
      `;
    }

    function renderPriceSummaryFeeReduction(feeReduction) {
      if (!feeReduction) return '';
      const currency = itemCurrency();
      const value = formatFinancialValue(feeReduction, currency);
      if (!value) return '';
      return `<div class="onframe-commerce-popover-fee-reduction"><span>Redução de tarifa por venda: <strong>${escapeHtml(value)}</strong>.</span></div>`;
    }

    function renderPriceStackableScenarios(summary) {
      const breakdown = summary && summary.costBreakdown ? summary.costBreakdown : {};
      const financials = Array.isArray(breakdown.conditional_financials) && breakdown.conditional_financials.length
        ? breakdown.conditional_financials
        : summary && summary.promotionFinancials && Array.isArray(summary.promotionFinancials.conditional)
          ? summary.promotionFinancials.conditional
          : [];
      const list = financials.filter((financial) => promotionFinancialMetrics(financial).length > 0);
      if (!list.length) return '';
      return `
        <section class="onframe-commerce-popover-price-conditions" aria-label="Descontos condicionais">
          <div class="onframe-commerce-popover-conditions-head">
            <small>Descontos condicionais</small>
          </div>
          <div class="onframe-commerce-popover-price-scenario-list">
            ${list.map(renderPriceStackableScenario).join('')}
          </div>
        </section>
      `;
    }

    function renderPriceStackableScenario(financial) {
      const currency = itemCurrency();
      const payment = stackablePaymentLabel(financial);
      const fields = [];
      if (moneyOrNull(financial.total_price_for_boosted_offer) !== null) {
        fields.push({ label: `Preço ${payment ? `no ${payment}` : 'acumulativo'}`, value: CommerceModel.formatMoney(financial.total_price_for_boosted_offer, currency), tone: 'primary' });
      }
      promotionFinancialMetrics(financial).forEach((metric) => fields.push(metric));
      return `
        <div class="ob-card onframe-commerce-popover-price-scenario">
          <div>
            <small>Desconto acumulativo</small>
            <strong>${escapeHtml(financial.label || (payment ? `No ${payment}` : 'Acumulativo'))}</strong>
          </div>
          ${fields.map(renderPriceScenarioField).join('')}
        </div>
      `;
    }

    function renderPriceScenarioField(field) {
      if (!field || !field.label || !field.value) return '';
      return `
        <div class="onframe-commerce-popover-price-scenario-field ${escapeAttribute(field.tone || '')}">
          <small>${escapeHtml(field.label)}</small>
          <strong>${escapeHtml(field.value)}</strong>
        </div>
      `;
    }

    function renderPromotionReview(key, entry, formOpen, confirm) {
      if (!formOpen && !confirm) return '';
      if (confirm) return renderPromotionConfirmation(key, entry, confirm);
      return renderPromotionEstimate(key, 'inline');
    }

    function renderPromotionConfirmation(key, entry, confirm) {
      const values = confirm.values || {};
      const targetPrice = promotionTargetPrice(entry, values);
      const rangeWarning = promotionRangeWarning(entry, targetPrice);
      const estimateMarkup = confirm.action === 'delete' ? '' : renderPromotionEstimate(key, 'review');
      const removalWarning = confirm.action === 'delete'
        ? `<div class="onframe-commerce-review-head"><div><strong>Remover esta promoção?</strong><span>A remoção será enviada ao Mercado Livre ao confirmar.</span></div></div>`
        : '';
      return `
        <div class="onframe-commerce-review">
          ${removalWarning}
          ${renderPromotionConfirmWarnings(rangeWarning)}
          ${estimateMarkup}
          ${renderBulkSwitch('promotion', state.promotionBulkEnabled)}
          ${renderBulkBusyStatus()}
        </div>
      `;
    }

    function isPromotionConfirmationBlocked(entry, confirm) {
      if (!confirm || (confirm.action !== 'create' && confirm.action !== 'update')) return false;
      const values = confirm.values || {};
      const targetPrice = promotionTargetPrice(entry, values);
      return Boolean(promotionRangeWarning(entry, targetPrice));
    }

    function renderPromotionConfirmWarnings(rangeWarning) {
      if (!rangeWarning) return '';
      return `<div class="onframe-commerce-review-grid">${renderReviewMetric({ label: 'Ajuste necessário', value: rangeWarning, tone: 'warning' })}</div>`;
    }

    function renderPromotionEstimate(key, mode = 'review') {
      const estimate = state.promotionEstimates[key] || null;
      if (!estimate) return '';
      if (estimate.status === 'blocked') return `<div class="onframe-commerce-estimate muted">${escapeHtml(estimate.message || 'Preço fora da faixa.')}</div>`;
      if (estimate.status === 'loading') return '<div class="onframe-commerce-estimate muted">Calculando custos...</div>';
      if (estimate.status === 'error') return `<div class="onframe-commerce-estimate warn">${escapeHtml(estimate.message || 'Custos indisponíveis.')}</div>`;
      if (estimate.status === 'ready' && estimate.data) return renderPromotionEstimateResult(estimate.data, mode);
      return '';
    }

    function renderPromotionEstimateResult(estimate, mode = 'review') {
      const currency = estimate.currency_id || itemCurrency();
      const metrics = promotionEstimateMetrics(estimate, currency);

      if (!metrics.length) return '<div class="onframe-commerce-estimate warn">Custos indisponíveis.</div>';
      if (mode === 'inline') {
        return `<div class="onframe-commerce-estimate muted">Revise para ver custos e repasse.</div>`;
      }
      return `
        <div class="onframe-commerce-estimate">
          <div class="onframe-commerce-estimate-head">
            <strong>Resumo da promoção</strong>
            ${estimate.complete === false ? '<small>Dados incompletos</small>' : ''}
          </div>
          <section class="ob-card onframe-commerce-promotion-estimate-summary" aria-label="Resumo financeiro da promoção">
            ${metrics.map(renderPromotionEstimateSummaryMetric).join('')}
          </section>
        </div>
      `;
    }

    function promotionEstimateMetrics(estimate, currency) {
      const commission = estimate.commission || null;
      const shipping = estimate.shipping || null;
      const financial = estimate.promotionFinancial || null;
      const metrics = [];

      if (moneyOrNull(estimate.youReceive) !== null) {
        metrics.push({ label: 'Você recebe', value: CommerceModel.formatMoney(estimate.youReceive, currency), tone: 'review-result' });
      }
      promotionFinancialMetrics(financial).forEach((metric) => metrics.push(metric));
      if (commission && moneyOrNull(commission.amount) !== null) {
        metrics.push({ label: 'Comissão', value: CommerceModel.formatMoney(commission.amount, currency), tone: 'muted' });
      }
      if (shipping && moneyOrNull(shipping.amount) !== null) {
        metrics.push({ label: 'Frete', value: CommerceModel.formatMoney(shipping.amount, currency), tone: 'muted' });
      }
      return metrics;
    }

    function renderReviewMetric(metric) {
      return renderMetricChip(metric);
    }

    function renderPromotionEstimateSummaryMetric(metric) {
      if (!metric || !metric.label || !metric.value) return '';
      return `
        <div class="onframe-commerce-promotion-estimate-summary-metric ${escapeAttribute(metric.tone || 'muted')}">
          <small>${escapeHtml(metric.label)}</small>
          <strong>${escapeHtml(metric.value)}</strong>
        </div>
      `;
    }

    function renderMetricChip(metric) {
      if (!metric || !metric.value) return '';
      return `
        <span class="onframe-commerce-metric ${escapeAttribute(metric.tone || 'muted')}">
          <small>${escapeHtml(metric.label)}</small>
          <b>
            ${escapeHtml(metric.value)}
            ${metric.badge ? `<em class="onframe-commerce-metric-badge">${escapeHtml(metric.badge)}</em>` : ''}
          </b>
        </span>
      `;
    }

    function buildFinancialMetric(label, amount, percentage, currency, tone = 'muted', kind = '') {
      const amountText = moneyOrNull(amount) !== null ? CommerceModel.formatMoney(amount, currency || itemCurrency()) : '';
      const percentageText = financialPercentage(percentage) !== null ? formatPercent(percentage) : '';
      return {
        label,
        value: [amountText, percentageText].filter(Boolean).join(' · '),
        badge: '',
        tone,
        kind
      };
    }

    function hasMetric(metrics, candidate) {
      return metrics.some((metric) => metric &&
        metric.label === candidate.label &&
        metric.value === candidate.value &&
        (metric.badge || '') === (candidate.badge || ''));
    }

    function hasMetricLabel(metrics, label) {
      return metrics.some((metric) => metric && metric.label === label);
    }

    function priceSaveLabel() {
      if (state.operationPending === 'price-bulk-preview') return 'Validando variações...';
      if (state.operationPending === 'price-bulk-commit') return 'Aplicando...';
      if (state.operationPending === 'price-single') return 'Salvando...';
      if (!state.priceBulkEnabled || !state.priceBulkPreview) return 'Salvar';
      const eligible = bulkEligibleTargets(state.priceBulkPreview).length;
      return eligible > 1 ? `Confirmar em ${eligible} variações` : 'Confirmar';
    }

    function priceSaveIcon() {
      return state.operationPending && state.operationPending.indexOf('price-') === 0 ? spinner() : '';
    }

    function renderBulkSwitch(kind, checked) {
      if (!canUseBulkActions()) return '';
      const action = kind === 'price' ? 'toggle-price-bulk' : 'toggle-promotion-bulk';
      const id = `onframe-commerce-bulk-${kind}`;
      return `
        <button id="${escapeAttribute(id)}" class="ob-checkbox onframe-commerce-bulk-switch ${checked ? 'is-checked' : ''}" data-action="${escapeAttribute(action)}" type="button" role="checkbox" aria-checked="${checked ? 'true' : 'false'}" ${state.busy ? 'disabled' : ''}>
          <span class="ob-checkbox-box" aria-hidden="true"></span>
          <span>
            <span class="ob-checkbox-label">Aplicar a todas as variações</span>
            <span class="ob-checkbox-description">Esta aplicação será enviada para as variações ativas desta família.</span>
          </span>
        </button>
      `;
    }

    function renderBulkBusyStatus() {
      const text = bulkBusyText();
      if (!text) return '';
      return `
        <div class="onframe-commerce-bulk-status loading" aria-live="polite">
          ${spinner()}${escapeHtml(text)}
        </div>
      `;
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

    function renderBulkStatus(preview, error) {
      if (error) {
        return `<div class="onframe-commerce-bulk-status warn">${escapeHtml(shortMessage(error))}</div>`;
      }
      if (!preview) return '';
      const counts = preview.counts || {};
      const eligible = Number(counts.eligible || 0);
      const total = Number(counts.total || 0);
      const blocked = Number(counts.blocked || 0);
      if (!eligible) {
        return `<div class="onframe-commerce-bulk-status warn">Nenhuma variação elegível${blocked ? ` (${blocked} bloqueada${blocked === 1 ? '' : 's'})` : ''}.</div>`;
      }
      return `
        <div class="onframe-commerce-bulk-status ok">
          ${escapeHtml(`${eligible} de ${total} variações elegíveis.`)}
          ${blocked ? `<details><summary>${escapeHtml(`${blocked} ignorada${blocked === 1 ? '' : 's'}`)}</summary>${renderBulkBlockedList(preview)}</details>` : ''}
        </div>
      `;
    }

    function renderBulkBlockedList(preview) {
      const blocked = (preview && Array.isArray(preview.targets) ? preview.targets : [])
        .filter((target) => !target.eligible)
        .slice(0, 6);
      if (!blocked.length) return '';
      return `<ul>${blocked.map((target) => `<li>${escapeHtml(shortTargetLabel(target))}: ${escapeHtml(CommerceModel.friendlyError(target.reasonCode || target.message || 'Bloqueado'))}</li>`).join('')}</ul>`;
    }

    function shortTargetLabel(target) {
      return target && (target.title || target.itemId) ? String(target.title || target.itemId).slice(0, 42) : 'Variação';
    }

    function canUseBulkActions() {
      return Boolean(state.context && state.context.mode === 'user_product');
    }

    function bulkEligibleTargets(preview) {
      return (preview && Array.isArray(preview.targets) ? preview.targets : [])
        .filter((target) => target && target.eligible && target.itemId);
    }

    function promotionRangeWarning(entry, targetPrice) {
      const price = Number(targetPrice || 0);
      const min = Number(entry && entry.min_price || 0);
      const max = Number(entry && entry.max_price || 0);
      if (!price) return '';
      if (min && price < min) return `Mínimo ${CommerceModel.formatMoney(min, itemCurrency())}`;
      if (max && price > max) return `Máximo ${CommerceModel.formatMoney(max, itemCurrency())}`;
      return '';
    }

    function promotionActionLabel(action, confirm, formOpen, userFields, key) {
      if (isPromotionActionPending(key, action)) return promotionPendingLabel(action);
      if (confirm && confirm.action === action) {
        if (state.promotionBulkEnabled) {
          if (action === 'delete') return 'Remover em todas as variações';
          if (action === 'update') return 'Alterar em todas as variações';
          return 'Confirmar em todas as variações';
        }
        if (action === 'delete') return 'Confirmar remoção';
        if (action === 'update') return 'Confirmar alteração';
        return 'Confirmar aplicação';
      }
      if (action === 'delete') return 'Remover promoção';
      if (action === 'update') return userFields.length && !formOpen ? 'Alterar valores' : 'Revisar alteração';
      return userFields.length && !formOpen ? 'Configurar oferta' : 'Revisar aplicação';
    }

    function promotionPendingLabel(action) {
      if (state.operationPending === 'promotion-bulk-commit') return action === 'delete' ? 'Removendo da família...' : 'Aplicando na família...';
      return action === 'delete' ? 'Removendo...' : 'Enviando...';
    }

    function promotionActionIcon(action, key, confirm, formOpen) {
      if (isPromotionActionPending(key, action)) return spinner();
      const iconName = confirm && confirm.action === action
        ? 'checkCircle'
        : formOpen && state.promotionFormAction === action
          ? 'checkCircle'
          : action === 'create'
            ? 'tag'
            : action === 'update'
              ? 'pencil'
              : 'trash';
      return icon(iconName, 14);
    }

    function promotionActionDisabled(blocked) {
      return blocked || state.busy ? 'disabled' : '';
    }

    function isPromotionActionPending(key, action) {
      return Boolean(state.busy &&
        state.operationPending.indexOf('promotion-') === 0 &&
        state.operationPendingKey === key &&
        state.operationPendingAction === action);
    }

    function promotionTone(entry, kind) {
      if (kind === 'active-offer') return promotionDisplayTone(entry);
      if (kind === 'programmed-offer') return 'blue';
      if (kind === 'stackable-offer') return promotionDisplayTone(entry);
      if (kind === 'discount-offer') return promotionDisplayTone(entry);
      if (kind === 'eligible-offer') return 'orange';
      const bucket = String(entry && entry.bucket || '').toLowerCase();
      if (bucket === 'active') return 'green';
      if (bucket === 'eligible') return 'orange';
      if (bucket === 'scheduled') return 'blue';
      return 'muted';
    }

    function promotionStatusLabel(entry, kind) {
      if (kind === 'active-offer') return promotionDisplayStatusLabel(entry);
      if (kind === 'stackable-offer') return promotionDisplayStatusLabel(entry);
      if (kind === 'discount-offer') return promotionDisplayStatusLabel(entry);
      if (kind === 'eligible-offer') return 'Elegível';
      if (kind === 'programmed-offer') return 'Programada';
      const status = String(entry && entry.status || '').toLowerCase();
      if (status === 'started' || status === 'active') return 'No anúncio';
      if (status === 'candidate') return 'Elegível';
      if (status === 'pending' || status === 'programmed') return 'Programada';
      return 'Informativa';
    }

    function promotionHint(entry, kind, canCreate, canUpdate, canDelete, userFields) {
      if (kind === 'discount-offer') {
        if (canCreate) return 'Crie um desconto direto para este anúncio.';
        if (String(entry && entry.display_status || '').toLowerCase() === 'programmed') return 'Desconto direto programado para este anúncio.';
        if (canDelete) return 'Desconto direto aplicado ao anúncio.';
        return 'Desconto direto do anúncio.';
      }
      if (kind === 'active-offer') {
        if (entry && entry.display_status === 'programmed') return 'Aplicada ao anúncio. Entra quando for a promoção vigente.';
        if (canUpdate && userFields.length) return 'Edite os valores desta promoção.';
        if (canDelete) return 'Promoção aplicada. Você pode remover daqui.';
        return 'Promoção aplicada pelo Mercado Livre.';
      }
      if (kind === 'programmed-offer') {
        if (canUpdate && userFields.length) return 'Aplicada ao anúncio. Você pode alterar antes de entrar.';
        if (canDelete) return 'Aplicada ao anúncio. Você pode remover antes de entrar.';
        return 'Vai entrar em vigor automaticamente.';
      }
      if (kind === 'stackable-offer') {
        if (isCandidatePromotion(entry)) return 'Desconto acumulativo disponível para este anúncio.';
        if (String(entry && entry.display_status || '').toLowerCase() === 'programmed') return 'Desconto acumulativo programado.';
        return 'Aplica junto com a promoção do preço.';
      }
      if (canCreate && userFields.length) return 'Configure os dados antes de aplicar.';
      if (canCreate) return 'Pronta para aplicar neste anúncio.';
      return 'Disponível para consulta.';
    }

    function formatPromotionPeriod(entry) {
      const start = formatCentralDate(entry && (entry.start_date || entry.startDate));
      const end = formatCentralDate(entry && (entry.end_date || entry.finish_date || entry.endDate || entry.finishDate));
      if (start && end) return `DE ${start} A ${end}`;
      if (start) return `A PARTIR DE ${start}`;
      if (end) return `ATÉ ${end}`;
      return '';
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
      const payment = String(benefit && benefit.payment_method || '').trim().toUpperCase();
      if (payment === 'PIX') return 'Pix';
      return payment;
    }

    function uniquePromotionEntries(entries, excludedEntries = []) {
      const excluded = new Set((Array.isArray(excludedEntries) ? excludedEntries : []).map(promotionIdentity).filter(Boolean));
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
      const itemOffers = uniquePromotionEntries(campaignPromotionEntries(groups.eligibleOffers), campaignPromotionEntries(groups.activeOffers))
        .filter((entry) => !isStackablePromotion(entry));
      return itemOffers;
    }

    function campaignPromotionEntries(entries) {
      return (Array.isArray(entries) ? entries : []).filter((entry) => !isPriceDiscountPromotion(entry));
    }

    function isPriceDiscountPromotion(entry) {
      return String(entry && entry.type || '').toUpperCase() === 'PRICE_DISCOUNT';
    }

    function isStackablePromotion(entry) {
      const type = String(entry && entry.type || '').toUpperCase();
      return entry && entry.is_stackable === true || type === 'BANK' || type === 'SELLER_COUPON_CAMPAIGN';
    }

    function stackablePromotionContextMetric(entry) {
      if (!isStackablePromotion(entry)) return null;
      const paymentMethod = String(entry && entry.payment_method || '').trim().toUpperCase();
      if (paymentMethod) return { label: 'Acumula no', value: paymentMethod };
      const context = String(entry && entry.stackable_context || '').trim();
      if (context === 'seller_coupon') return { label: 'Acumula como', value: 'Cupom' };
      if (context === 'payment_method') return { label: 'Acumula no', value: 'Pagamento' };
      return { label: 'Tipo', value: 'Acumulativo' };
    }

    function isCandidatePromotion(entry) {
      const status = String(entry && (entry.status || entry.api_status) || '').toLowerCase();
      return status === 'candidate' || String(entry && entry.display_status || '').toLowerCase() === 'available';
    }

    function promotionIdentity(entry) {
      if (!entry) return '';
      return [
        String(entry.type || ''),
        String(entry.id || entry.promotion_id || ''),
        String(entry.offer_id || '')
      ].join(':');
    }

    function formatCentralDate(value) {
      const date = parseIsoDate(value) || parseDateValue(value);
      if (!date) return '';
      const month = date.toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();
      return `${date.getDate()} DE ${month}`;
    }

    function parseDateValue(value) {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDateInput(value) {
      const date = parseIsoDate(value);
      if (!date) return '';
      return [
        String(date.getDate()).padStart(2, '0'),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getFullYear())
      ].join('/');
    }

    function parseDisplayDate(value) {
      const text = String(value || '').trim();
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return null;
      const [day, month, year] = text.split('/').map(Number);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
      return date;
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

    function maskDateInput(value) {
      const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
      if (digits.length <= 2) return digits;
      if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
      return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    }

    function formatDatePickerMonth(date) {
      const month = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      return month.charAt(0).toUpperCase() + month.slice(1);
    }

    function addMonths(date, amount) {
      return new Date(date.getFullYear(), date.getMonth() + amount, 1);
    }

    function renderPromotionFields(fields, key, entry) {
      const list = Array.isArray(fields) ? fields : [];
      if (!list.length) return '';
      return `
        <div class="onframe-commerce-form-grid">
          ${list.map((field) => renderPromotionField(field, key, entry)).join('')}
        </div>
      `;
    }

    function renderPromotionField(field, key, entry) {
      const value = promotionFieldValue(key, field, entry);
      const validation = field === 'deal_price' ? promotionPriceFieldValidation(entry, value) : null;
      const fieldClass = validation && validation.tone ? ` ${validation.tone}` : '';
      if (field === 'start_date' || field === 'finish_date') {
        return `
          <label class="onframe-commerce-field onframe-commerce-date-field onframe-commerce-field-${escapeAttribute(field)}">
            <span>${escapeHtml(CommerceModel.fieldLabel(field))}</span>
            <div class="onframe-commerce-date-control">
              <input class="onframe-commerce-date-display" data-date-display="${escapeAttribute(field)}" type="text" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="dd/mm/aaaa" value="${escapeAttribute(formatDateInput(value))}">
              <input data-field="${escapeAttribute(field)}" type="hidden" value="${escapeAttribute(value)}">
              <button class="onframe-commerce-date-button" data-action="open-date-picker" data-date-target="${escapeAttribute(field)}" type="button" aria-label="Escolher data">${icon('calendar', 14)}</button>
            </div>
          </label>
        `;
      }

      return `
        <label class="onframe-commerce-field onframe-commerce-field-${escapeAttribute(field)}${escapeAttribute(fieldClass)}">
          <span>${escapeHtml(CommerceModel.fieldLabel(field))}</span>
          <input data-field="${escapeAttribute(field)}" ${fieldType(field)} value="${escapeAttribute(value)}">
          ${validation && validation.message ? `<small class="onframe-commerce-field-help">${escapeHtml(validation.message)}</small>` : ''}
        </label>
      `;
    }

    function promotionPriceFieldValidation(entry, value) {
      const raw = String(value || '').trim();
      if (!raw) return null;
      const price = CommerceModel.parseMoneyInput(raw);
      if (!price) return { tone: 'warn', message: 'Informe um preço válido.' };
      const max = moneyOrNull(entry && entry.max_price);
      if (max && price > max) return {
        tone: 'warn',
        message: `Preço máximo: ${CommerceModel.formatMoney(max, itemCurrency())}.`
      };
      return { tone: 'ok', message: 'Preço dentro da faixa permitida.' };
    }

    function renderPopoverHead(title, badge) {
      return `
        <header class="onframe-commerce-popover-head">
          <strong>${escapeHtml(title)}</strong>
          ${badge ? `<span>${escapeHtml(badge)}</span>` : ''}
          <button class="onframe-commerce-icon-btn" data-action="close-popover" type="button" aria-label="Fechar">${icon('x', 14)}</button>
        </header>
      `;
    }

    function renderNotice(message, tone) {
      if (!message) return '';
      return `<div class="onframe-commerce-notice ${escapeAttribute(tone || 'ok')}">${escapeHtml(shortMessage(message))}</div>`;
    }

    function renderRefreshButton() {
      if (!state.actionMessage) return '';
      return `<button class="onframe-commerce-btn" data-action="refresh-page" type="button">${icon('refresh', 14)}Atualizar página</button>`;
    }

    function bindInlineEvents() {
      if (!state.inline) return;
      bindButton(state.inline, 'open-price', () => openPopover('price'));
      bindButton(state.inline, 'open-promotions', () => openPopover('promotions'));
      bindButton(state.inline, 'reload-commerce', () => void reloadCommerce());
    }

    function bindPopoverEvents() {
      if (!state.popoverRoot) return;
      bindButton(state.popoverRoot, 'close-popover', closePopover);
      bindButton(state.popoverRoot, 'toggle-details', () => {
        state.detailsOpen = !state.detailsOpen;
        rerenderPopover();
      });
      bindButton(state.popoverRoot, 'edit-price', startPriceEdit);
      bindButton(state.popoverRoot, 'cancel-price', cancelPriceEdit);
      bindButton(state.popoverRoot, 'save-price', () => void savePrice());
      bindButton(state.popoverRoot, 'reload-commerce', () => void reloadCommerce());
      bindButton(state.popoverRoot, 'open-promotion-modal', openPromotionModal);
      bindButton(state.popoverRoot, 'refresh-page', refreshPage);
      bindBulkControls(state.popoverRoot);
    }

    function bindModalEvents() {
      if (!state.modalRoot) return;
      bindButton(state.modalRoot, 'close-promotion-modal', closePromotionModal);
      bindButton(state.modalRoot, 'reload-commerce', () => void reloadCommerce());
      bindButton(state.modalRoot, 'create-offer', (button) => void performPromotionAction(button, 'create'));
      bindButton(state.modalRoot, 'update-offer', (button) => void performPromotionAction(button, 'update'));
      bindButton(state.modalRoot, 'delete-offer', (button) => void performPromotionAction(button, 'delete'));
      bindButton(state.modalRoot, 'toggle-promotion-result-popover', togglePromotionResultPopover);
      bindButton(state.modalRoot, 'cancel-promotion-form', cancelPromotionForm);
      bindButton(state.modalRoot, 'cancel-promotion-confirm', cancelPromotionConfirm);
      bindButton(state.modalRoot, 'refresh-page', refreshPage);
      bindButton(state.modalRoot, 'toggle-promotion-filters', () => {
        state.promotionFiltersOpen = !state.promotionFiltersOpen;
        rerenderModal();
      });
      bindButton(state.modalRoot, 'clear-promotion-filters', () => {
        state.promotionStatusFilters = [];
        state.promotionTypeFilters = [];
        state.promotionFinancialFilters = [];
        rerenderModal();
      });
      state.modalRoot.querySelectorAll('[data-action="toggle-promotion-filter"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const group = button.dataset.filterGroup;
          const value = button.dataset.filterValue;
          const values = promotionFilterValues(group);
          const next = values.includes(value)
            ? values.filter((item) => item !== value)
            : values.concat(value);
          if (group === 'status') state.promotionStatusFilters = next;
          else if (group === 'financial') state.promotionFinancialFilters = next;
          else state.promotionTypeFilters = next;
          rerenderModal();
        });
      });
      const search = state.modalRoot.querySelector('[data-action="promotion-search"]');
      if (search) {
        search.addEventListener('input', () => {
          state.promotionSearch = search.value;
          rerenderModal();
        });
      }
      bindButton(state.modalRoot, 'open-date-picker', (button) => openDatePicker(button.closest('.onframe-commerce-date-field') && button.closest('.onframe-commerce-date-field').querySelector('[data-date-display]')));
      bindBulkControls(state.modalRoot);
      bindPromotionFieldDrafts(state.modalRoot);
      bindDateFields(state.modalRoot);
    }

    function bindBulkControls(container) {
      const priceToggle = container.querySelector('[data-action="toggle-price-bulk"]');
      if (priceToggle) {
        priceToggle.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (state.busy) return;
          state.priceBulkEnabled = priceToggle.getAttribute('aria-checked') !== 'true';
          state.priceBulkPreview = null;
          state.priceBulkHash = '';
          state.priceBulkError = '';
          state.actionError = '';
          state.actionMessage = '';
          rerenderPopover();
        });
      }

      const promotionToggle = container.querySelector('[data-action="toggle-promotion-bulk"]');
      if (promotionToggle) {
        promotionToggle.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (state.busy) return;
          state.promotionBulkEnabled = promotionToggle.getAttribute('aria-checked') !== 'true';
          state.actionError = '';
          state.actionMessage = '';
          rerenderModal();
        });
      }

      const priceInput = container.querySelector('[data-field="price"]');
      if (priceInput) {
        priceInput.addEventListener('input', () => {
          state.priceDraft = priceInput.value;
          state.priceBulkPreview = null;
          state.priceBulkHash = '';
          state.priceBulkError = '';
        });
      }
    }

    function bindButton(container, action, handler) {
      container.querySelectorAll(`[data-action="${action}"]`).forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          handler(button, event);
        });
      });
    }

    function bindDateFields(container) {
      container.querySelectorAll('[data-date-display]').forEach((input) => {
        input.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openDatePicker(input);
        });
        input.addEventListener('focus', () => openDatePicker(input));
        input.addEventListener('input', () => syncTypedDate(input));
        input.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            openDatePicker(input);
          }
        });
      });
    }

    function bindPromotionFieldDrafts(container) {
      container.querySelectorAll('[data-field]').forEach((input) => {
        input.addEventListener('input', () => savePromotionFieldDraft(input));
        input.addEventListener('change', () => savePromotionFieldDraft(input));
        input.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' || input.type === 'hidden') return;
          event.preventDefault();
          savePromotionFieldDraft(input);
          reviewPromotionFieldDraft(input);
        });
        input.addEventListener('blur', (event) => {
          if (input.type === 'hidden' || !shouldReviewPromotionFieldOnBlur(input, event)) return;
          savePromotionFieldDraft(input);
          reviewPromotionFieldDraft(input);
        });
      });
    }

    function shouldReviewPromotionFieldOnBlur(input, event) {
      if (state.renderingPromotionModal) return false;
      const next = event && event.relatedTarget;
      if (!next || typeof next.closest !== 'function') return true;
      const card = input.closest('[data-entry-key]');
      if (card && next.closest('[data-entry-key]') === card && typeof next.matches === 'function' && next.matches('[data-field], [data-date-display]')) return false;
      return !next.closest('[data-action]');
    }

    function reviewPromotionFieldDraft(input) {
      const card = input.closest('[data-entry-key]');
      const key = card && card.dataset ? card.dataset.entryKey : '';
      const action = state.promotionFormAction;
      if (!card || !key || state.promotionFormKey !== key || state.promotionConfirm || !['create', 'update'].includes(action)) return;

      const entry = getPromotionEntry(card.dataset.entryKind, Number(card.dataset.entryIndex));
      if (!entry) return;
      const values = readPromotionValues(card);
      const targetPrice = promotionTargetPrice(entry, values);
      if (!targetPrice || promotionRangeWarning(entry, targetPrice)) return;

      try {
        if (action === 'update') CommerceModel.buildOfferUpdatePayload(entry, values);
        else CommerceModel.buildOfferPayload(entry, values);
      } catch (err) {
        return;
      }

      clearPromotionEstimateTimer(key);
      delete state.promotionEstimates[key];
      state.promotionConfirm = { key, action, values };
      state.promotionFocusKey = key;
      state.actionError = '';
      state.actionMessage = '';
      schedulePromotionEstimate(key, entry, values);
      rerenderModal();
    }

    function savePromotionFieldDraft(input) {
      const card = input.closest('[data-entry-key]');
      const field = input.dataset.field;
      if (!card || !field) return;
      const key = card.dataset.entryKey;
      state.promotionDraftValues[key] = Object.assign({}, state.promotionDraftValues[key] || {}, {
        [field]: input.value
      });
      if (field === 'deal_price') {
        updatePromotionPriceFieldFeedback(input, getPromotionEntry(card.dataset.entryKind, Number(card.dataset.entryIndex)));
      }
      const clearedConfirm = Boolean(state.promotionConfirm && state.promotionConfirm.key === key);
      if (state.promotionConfirm && state.promotionConfirm.key === key) {
        state.promotionConfirm = null;
      }
      clearPromotionActionFeedback();
      schedulePromotionEstimate(key, getPromotionEntry(card.dataset.entryKind, Number(card.dataset.entryIndex)), state.promotionDraftValues[key] || {});
      if (clearedConfirm) {
        rerenderModal();
        return;
      }
      syncPromotionModalMarkupCache();
    }

    function updatePromotionPriceFieldFeedback(input, entry) {
      const label = input.closest('.onframe-commerce-field');
      if (!label) return;
      const validation = promotionPriceFieldValidation(entry, input.value);
      label.classList.remove('ok', 'warn');
      let help = label.querySelector('.onframe-commerce-field-help');
      if (!validation || !validation.message) {
        if (help) help.remove();
        return;
      }
      label.classList.add(validation.tone || 'ok');
      if (!help) {
        help = document.createElement('small');
        help.className = 'onframe-commerce-field-help';
        label.appendChild(help);
      }
      help.textContent = validation.message;
    }

    function clearPromotionActionFeedback() {
      state.actionError = '';
      state.actionMessage = '';
      if (!state.modalRoot) return;
      state.modalRoot.querySelectorAll('.onframe-commerce-notice').forEach((notice) => {
        notice.remove();
      });
    }

    function openDatePicker(input) {
      if (!input) return;
      const field = input.closest('.onframe-commerce-date-field');
      if (!field) return;
      const hidden = field.querySelector(`[data-field="${input.dataset.dateDisplay}"]`);
      if (!hidden) return;
      removeDatePicker();

      const monthDate = parseIsoDate(hidden.value) || parseDisplayDate(input.value) || new Date();
      const root = document.createElement('div');
      root.className = 'onframe-commerce-datepicker';
      field.appendChild(root);
      state.datePickerRoot = root;
      renderDatePicker(root, input, hidden, new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));

      state.datePickerOutsideHandler = (event) => {
        if (field.contains(event.target)) return;
        removeDatePicker();
      };
      setTimeout(() => document.addEventListener('click', state.datePickerOutsideHandler), 0);
    }

    function renderDatePicker(root, input, hidden, monthDate) {
      const selectedIso = hidden.value || '';
      root.dataset.month = toIsoDate(monthDate);
      root.innerHTML = buildDatePickerMarkup(monthDate, selectedIso);

      bindButton(root, 'date-prev-month', () => renderDatePicker(root, input, hidden, addMonths(monthDate, -1)));
      bindButton(root, 'date-next-month', () => renderDatePicker(root, input, hidden, addMonths(monthDate, 1)));
      bindButton(root, 'date-today', () => selectDate(input, hidden, new Date()));
      bindButton(root, 'date-clear', () => {
        input.value = '';
        hidden.value = '';
        savePromotionFieldDraft(hidden);
        removeDatePicker();
      });
      root.querySelectorAll('[data-date-day]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const date = parseIsoDate(button.dataset.dateDay);
          if (date) selectDate(input, hidden, date);
        });
      });
    }

    function buildDatePickerMarkup(monthDate, selectedIso) {
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
      const firstDay = monthStart.getDay();
      const blanks = Array.from({ length: firstDay }, () => '<span></span>').join('');
      const days = Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const iso = toIsoDate(new Date(monthStart.getFullYear(), monthStart.getMonth(), day));
        const selected = iso === selectedIso ? ' selected' : '';
        return `<button class="onframe-commerce-date-day${selected}" data-date-day="${escapeAttribute(iso)}" type="button">${day}</button>`;
      }).join('');

      return `
        <div class="onframe-commerce-datepicker-head">
          <button data-action="date-prev-month" type="button" aria-label="Mês anterior">${icon('caretLeft', 14)}</button>
          <strong>${escapeHtml(formatDatePickerMonth(monthStart))}</strong>
          <button data-action="date-next-month" type="button" aria-label="Próximo mês">${icon('caretRight', 14)}</button>
        </div>
        <div class="onframe-commerce-datepicker-grid">
          ${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day) => `<span class="onframe-commerce-date-weekday">${day}</span>`).join('')}
          ${blanks}
          ${days}
        </div>
        <div class="onframe-commerce-datepicker-foot">
          <button data-action="date-clear" type="button">Limpar</button>
          <button data-action="date-today" type="button">Hoje</button>
        </div>
      `;
    }

    function syncTypedDate(input) {
      input.value = maskDateInput(input.value);
      const field = input.closest('.onframe-commerce-date-field');
      const hidden = field ? field.querySelector(`[data-field="${input.dataset.dateDisplay}"]`) : null;
      if (!hidden) return;
      const date = parseDisplayDate(input.value);
      hidden.value = date ? toIsoDate(date) : '';
      savePromotionFieldDraft(hidden);
      if (date && state.datePickerRoot) {
        renderDatePicker(state.datePickerRoot, input, hidden, new Date(date.getFullYear(), date.getMonth(), 1));
      }
    }

    function selectDate(input, hidden, date) {
      const iso = toIsoDate(date);
      input.value = formatDateInput(iso);
      hidden.value = iso;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
      removeDatePicker();
    }

    function removeDatePicker() {
      if (state.datePickerOutsideHandler) {
        document.removeEventListener('click', state.datePickerOutsideHandler);
        state.datePickerOutsideHandler = null;
      }
      if (state.datePickerRoot) state.datePickerRoot.remove();
      state.datePickerRoot = null;
    }

    function restoreModalPosition(modalScrollTop, pageScrollX, pageScrollY) {
      const modal = state.modalRoot ? state.modalRoot.querySelector('.onframe-commerce-modal') : null;
      if (modal) modal.scrollTop = modalScrollTop || 0;
      if (state.promotionFocusKey && modal) {
        const focusedCard = modal.querySelector(`[data-entry-key="${escapeAttribute(state.promotionFocusKey)}"]`);
        if (focusedCard) {
          const modalRect = modal.getBoundingClientRect();
          const cardRect = focusedCard.getBoundingClientRect();
          const isAbove = cardRect.top < modalRect.top + 16;
          const isBelow = cardRect.bottom > modalRect.bottom - 16;
          if (isAbove || isBelow) modal.scrollTop += cardRect.top - modalRect.top - 16;
        }
      }
      if (window.scrollX !== pageScrollX || window.scrollY !== pageScrollY) {
        window.scrollTo(pageScrollX, pageScrollY);
      }
    }

    function captureModalFieldFocus() {
      if (!state.modalRoot) return null;
      const active = document.activeElement;
      if (!active || !state.modalRoot.contains(active)) return null;
      if (active.dataset && active.dataset.action === 'promotion-search') {
        return {
          promotionSearch: true,
          start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
          end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
        };
      }
      const card = active.closest && active.closest('[data-entry-key]');
      const key = card && card.dataset ? card.dataset.entryKey : '';
      const field = active.dataset ? active.dataset.field : '';
      const dateDisplay = active.dataset ? active.dataset.dateDisplay : '';
      if (!key || (!field && !dateDisplay)) return null;
      return {
        key,
        field,
        dateDisplay,
        start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
        end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
      };
    }

    function restoreModalFieldFocus(snapshot) {
      if (!snapshot || !state.modalRoot) return;
      if (snapshot.promotionSearch) {
        const search = state.modalRoot.querySelector('[data-action="promotion-search"]');
        if (!search || typeof search.focus !== 'function') return;
        search.focus({ preventScroll: true });
        if (snapshot.start !== null && typeof search.setSelectionRange === 'function') search.setSelectionRange(snapshot.start, snapshot.end);
        return;
      }
      const selector = snapshot.dateDisplay
        ? `[data-entry-key="${escapeAttribute(snapshot.key)}"] [data-date-display="${escapeAttribute(snapshot.dateDisplay)}"]`
        : `[data-entry-key="${escapeAttribute(snapshot.key)}"] [data-field="${escapeAttribute(snapshot.field)}"]`;
      const input = state.modalRoot.querySelector(selector);
      if (!input || typeof input.focus !== 'function') return;
      input.focus({ preventScroll: true });
      if (snapshot.start !== null && typeof input.setSelectionRange === 'function') {
        try {
          input.setSelectionRange(snapshot.start, snapshot.end);
        } catch (e) {
          // Some input types do not support selection ranges.
        }
      }
    }

    function syncPromotionModalMarkupCache() {
      if (!state.promotionModalOpen || !state.modalRoot) return;
      state.lastModalMarkup = buildPromotionModal();
    }

    function schedulePromotionManagerEstimates() {
      if (!state.promotionModalOpen || !state.promotionSummary) return;
      promotionEstimateCandidates().forEach(({ key, entry }) => {
        schedulePromotionEstimate(key, entry, state.promotionDraftValues[key] || {});
      });
    }

    function promotionEstimateCandidates() {
      const groups = CommerceModel.collectPromotionGroups(state.promotionSummary);
      const discountEntry = buildDiscountEntry();
      return [
        ...currentPromotionEntries(campaignPromotionEntries(groups.activeOffers)).map((entry, index) => ({ key: `active-offer:${index}`, entry })),
        ...stackablePromotionEntries(groups)
          .filter((entry) => !isCandidatePromotion(entry))
          .map((entry, index) => ({ key: `stackable-offer:${index}`, entry })),
        ...(discountEntry && !isCandidatePromotion(discountEntry) ? [{ key: 'discount-offer:0', entry: discountEntry }] : []),
        ...programmedPromotionEntries(groups).map((entry, index) => ({ key: `programmed-offer:${index}`, entry }))
      ].filter(({ entry }) => CommerceModel.canEstimatePromotion(entry) && moneyOrNull(promotionDisplayPrice(entry)));
    }

    function schedulePromotionEstimate(key, entry, values) {
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

      const rangeWarning = promotionRangeWarning(entry, targetPrice);
      if (rangeWarning) {
        clearPromotionEstimate(key);
        return;
      }

      const payload = buildPromotionEstimatePayload(entry, values, targetPrice);
      const hash = JSON.stringify(payload);
      const current = state.promotionEstimates[key];
      if (current && current.hash === hash && (current.status === 'loading' || current.status === 'ready')) return;
      clearPromotionEstimateTimer(key);
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
        const data = await api(itemApiPath('/promotions/estimate'), {
          method: 'POST',
          body: JSON.stringify(payload)
        });
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

    function promotionTargetPrice(entry, values = {}) {
      if (Object.prototype.hasOwnProperty.call(values || {}, 'deal_price')) {
        return CommerceModel.parseMoneyInput(values && values.deal_price);
      }
      return CommerceModel.parseMoneyInput(values && values.deal_price) ||
        moneyOrNull(promotionDisplayPrice(entry));
    }

    function promotionDisplayPrice(entry) {
      return entry && (entry.price || entry.suggested_price || entry.total_price_for_boosted_offer) || null;
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

    function openPopover(type) {
      state.popover = type;
      state.actionError = '';
      state.actionMessage = '';
      state.detailsOpen = false;
      if (type !== 'price') state.priceEditing = false;
      rerenderPopover();
    }

    function closePopover() {
      state.popover = null;
      state.priceEditing = false;
      removePopover();
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
      state.actionError = '';
      state.actionMessage = '';
      rerenderPopover();
    }

    function cancelPriceEdit() {
      state.priceEditing = false;
      state.priceDraft = '';
      state.priceBulkEnabled = false;
      state.priceBulkPreview = null;
      state.priceBulkHash = '';
      state.priceBulkError = '';
      state.actionError = '';
      rerenderPopover();
    }

    async function savePrice() {
      if (!state.itemId || state.busy) return;
      const input = state.popoverRoot ? state.popoverRoot.querySelector('[data-field="price"]') : null;
      const amount = CommerceModel.parseMoneyInput(input ? input.value : state.priceDraft);
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
      state.actionMessage = '';
      rerenderPopover();
      try {
        await api(itemApiPath('/pricing/standard'), {
          method: 'PUT',
          body: JSON.stringify({ amount })
        });
        state.priceEditing = false;
        state.priceDraft = '';
        state.actionMessage = 'Preço salvo.';
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
          state.actionMessage = eligible ? 'Revise as variações antes de confirmar.' : '';
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
      state.actionMessage = '';
      rerenderPopover();
      try {
        const result = await api(itemApiPath('/bulk/commit'), {
          method: 'POST',
          body: JSON.stringify(bulkRequest('pricing.standard.update', payload, targetItemIds))
        });
        state.priceEditing = false;
        state.priceDraft = '';
        state.priceBulkPreview = null;
        state.priceBulkHash = '';
        state.priceBulkError = '';
        state.actionMessage = bulkResultMessage(result, 'Preço salvo');
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
      removePromotionResultPopover();
      state.promotionModalOpen = true;
      state.actionError = '';
      state.actionMessage = '';
      state.promotionFormKey = '';
      state.promotionFormAction = '';
      state.promotionDraftValues = {};
      state.promotionBulkEnabled = false;
      resetPromotionListFilters();
      clearPromotionEstimateTimers();
      state.promotionEstimates = {};
      renderModal();
      schedulePromotionManagerEstimates();
    }

    function closePromotionModal() {
      state.promotionModalOpen = false;
      state.promotionFormKey = '';
      state.promotionFormAction = '';
      state.promotionDraftValues = {};
      state.promotionBulkEnabled = false;
      clearPromotionEstimateTimers();
      state.promotionEstimates = {};
      state.promotionConfirm = null;
      state.promotionFocusKey = '';
      resetPromotionListFilters();
      removeDatePicker();
      removeModal();
    }

    async function performPromotionAction(button, action) {
      if (!state.itemId || state.busy) return;
      const card = button.closest('[data-entry-kind]');
      if (!card) return;
      const key = `${card.dataset.entryKind}:${card.dataset.entryIndex}`;
      const entry = getPromotionEntry(card.dataset.entryKind, Number(card.dataset.entryIndex));
      if (!entry) return;

      const fields = action === 'delete'
        ? []
        : CommerceModel.getUserFields(action === 'update' ? CommerceModel.getOfferUpdateFields(entry) : CommerceModel.getOfferCreateFields(entry));
      if (fields.length && state.promotionFormKey !== key) {
        state.promotionFormKey = key;
        state.promotionFormAction = action;
        ensurePromotionDraft(key, entry, fields);
        state.promotionConfirm = null;
        state.promotionFocusKey = key;
        state.actionError = '';
        state.actionMessage = '';
        rerenderModal();
        schedulePromotionEstimate(key, entry, state.promotionDraftValues[key] || {});
        return;
      }

      try {
        if (fields.length) ensurePromotionDraft(key, entry, fields);
        state.actionError = '';
        state.actionMessage = '';
        const values = readPromotionValues(card);
        const method = action === 'delete' ? 'DELETE' : action === 'update' ? 'PUT' : 'POST';
        const payload = action === 'delete'
          ? CommerceModel.buildOfferDeletePayload(entry)
          : action === 'update'
            ? CommerceModel.buildOfferUpdatePayload(entry, values)
            : CommerceModel.buildOfferPayload(entry, values);
        const confirming = state.promotionConfirm && state.promotionConfirm.key === key && state.promotionConfirm.action === action;
        if (!confirming) {
          state.promotionConfirm = { key, action, values };
          state.promotionFocusKey = key;
          state.actionError = '';
          state.actionMessage = '';
          if (action !== 'delete') schedulePromotionEstimate(key, entry, values);
          rerenderModal();
          return;
        }

        if (state.promotionBulkEnabled && canUseBulkActions()) {
          state.busy = true;
          state.operationPending = 'promotion-bulk-commit';
          state.operationPendingKey = key;
          state.operationPendingAction = action;
          state.actionError = '';
          state.actionMessage = '';
          rerenderModal();
          const result = await api(itemApiPath('/bulk/commit'), {
            method: 'POST',
            body: JSON.stringify(bulkRequest(`promotion.offer.${action}`, payload))
          });
          state.actionMessage = bulkResultMessage(result, action === 'delete' ? 'Promoção removida' : 'Promoção enviada');
          state.promotionFormKey = '';
          state.promotionFormAction = '';
          state.promotionDraftValues = {};
          clearPromotionEstimateTimers();
          state.promotionEstimates = {};
          state.promotionConfirm = null;
          await loadSummaries(state.requestId);
          schedulePromotionManagerEstimates();
          return;
        }

        state.busy = true;
        state.operationPending = 'promotion-single';
        state.operationPendingKey = key;
        state.operationPendingAction = action;
        state.actionError = '';
        state.actionMessage = '';
        rerenderModal();
        await api(itemApiPath('/promotions/offers'), {
          method,
          body: JSON.stringify(payload)
        });
        state.actionMessage = action === 'delete' ? 'Promoção removida.' : 'Promoção enviada.';
        state.promotionFormKey = '';
        state.promotionFormAction = '';
        state.promotionDraftValues = {};
        clearPromotionEstimateTimers();
        state.promotionEstimates = {};
        state.promotionConfirm = null;
        await loadSummaries(state.requestId);
        schedulePromotionManagerEstimates();
      } catch (err) {
        state.actionError = CommerceModel.friendlyError(err);
        state.promotionConfirm = null;
      } finally {
        state.busy = false;
        state.operationPending = '';
        state.operationPendingKey = '';
        state.operationPendingAction = '';
        mountCommerce();
      }
    }

    function cancelPromotionConfirm() {
      state.promotionConfirm = null;
      state.promotionFocusKey = state.promotionFormKey || '';
      state.actionError = '';
      rerenderModal();
    }

    function cancelPromotionForm() {
      const key = state.promotionFormKey;
      if (!key || state.busy) return;
      clearPromotionEstimateTimer(key);
      delete state.promotionEstimates[key];
      delete state.promotionDraftValues[key];
      state.promotionFormKey = '';
      state.promotionFormAction = '';
      state.promotionConfirm = null;
      state.promotionFocusKey = '';
      state.promotionBulkEnabled = false;
      state.actionError = '';
      state.actionMessage = '';
      rerenderModal();
    }

    async function reloadCommerce() {
      state.actionError = '';
      state.actionMessage = '';
      state.promotionConfirm = null;
      state.promotionFocusKey = '';
      state.promotionDraftValues = {};
      clearPromotionEstimateTimers();
      state.promotionEstimates = {};
      if (!state.context || !state.itemId) {
        await reloadCommerceEditor();
        return;
      }
      await loadSummaries(state.requestId);
      schedulePromotionManagerEstimates();
    }

    function refreshPage() {
      location.reload();
    }

    function getPromotionEntry(kind, index) {
      const groups = CommerceModel.collectPromotionGroups(state.promotionSummary);
      if (kind === 'active-offer') return currentPromotionEntries(campaignPromotionEntries(groups.activeOffers))[index] || null;
      if (kind === 'stackable-offer') return stackablePromotionEntries(groups)[index] || null;
      if (kind === 'eligible-offer') return promotionOpportunityEntries(groups)[index] || null;
      if (kind === 'discount-offer') return buildDiscountEntry();
      if (kind === 'programmed-offer') return programmedPromotionEntries(groups)[index] || null;
      return null;
    }

    function buildDiscountEntry() {
      if (!state.promotionSummary || !Array.isArray(state.promotionSummary.adapters)) return null;
      const adapter = state.promotionSummary.adapters.find((item) => item.type === 'PRICE_DISCOUNT');
      if (!adapter || !Array.isArray(adapter.offerCreate)) return null;
      const groups = CommerceModel.collectPromotionGroups(state.promotionSummary);
      const existing = [
        groups.activeOffers,
        groups.scheduledOffers,
        groups.eligibleOffers
      ].flat().find(isPriceDiscountPromotion);
      if (existing) {
        return Object.assign({}, existing, {
          label: existing.label && existing.label !== existing.typeLabel ? existing.label : 'Desconto direto',
          typeLabel: 'Desconto do anúncio',
          capabilities: existing.capabilities || adapter
        });
      }
      return {
        type: 'PRICE_DISCOUNT',
        label: 'Desconto direto',
        typeLabel: 'Desconto do anúncio',
        status: 'candidate',
        api_status: 'candidate',
        status_bucket: 'candidate',
        bucket: 'eligible',
        display_status: 'available',
        price: null,
        capabilities: adapter
      };
    }

    function readPromotionValues(card) {
      const key = card.dataset.entryKey || '';
      const values = Object.assign({}, state.promotionDraftValues[key] || {});
      card.querySelectorAll('[data-field]').forEach((input) => {
        values[input.dataset.field] = input.value;
      });
      if (key) state.promotionDraftValues[key] = Object.assign({}, values);
      return values;
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
      if (!state.inline) return null;
      const action = state.popover === 'price' ? 'open-price' : 'open-promotions';
      return state.inline.querySelector(`[data-action="${action}"]`);
    }

    function positionFloatingRoot(root, anchor) {
      if (!root || !anchor || typeof anchor.getBoundingClientRect !== 'function') return;
      const rect = anchor.getBoundingClientRect();
      const isSummaryPopover = state.popover === 'promotions' || state.popover === 'price';
      const preferredWidth = isSummaryPopover ? 560 : 340;
      const availableWidth = Math.max(0, window.innerWidth - 24);
      const width = window.innerWidth <= 640 ? availableWidth : Math.min(preferredWidth, availableWidth);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const top = Math.max(12, rect.bottom + 8);
      root.style.left = `${Math.round(left)}px`;
      root.style.top = `${Math.round(top)}px`;
    }

    function positionPromotionResultPopover(root, anchor) {
      if (!root || !anchor || typeof anchor.getBoundingClientRect !== 'function') return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      root.style.left = `${Math.round(left)}px`;
      root.style.top = `${Math.round(Math.max(12, rect.bottom + 8))}px`;

      const height = root.getBoundingClientRect().height;
      if (rect.bottom + 8 + height > window.innerHeight - 12 && rect.top - height - 8 >= 12) {
        root.style.top = `${Math.round(rect.top - height - 8)}px`;
      }
    }

    function fieldType(field) {
      if (field === 'stock') return 'type="number" min="1" step="1"';
      return 'inputmode="decimal" autocomplete="off"';
    }

    function promotionFieldValue(key, field, entry) {
      if (!state.promotionDraftValues[key]) {
        ensurePromotionDraft(key, entry, [field]);
      }
      const draft = state.promotionDraftValues[key] || {};
      if (Object.prototype.hasOwnProperty.call(draft, field)) return draft[field];
      return defaultFieldValue(field, entry);
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
      if (field === 'stock') return '1';
      if (field === 'start_date') return isoDateOnly(entry && entry.start_date) || dateOffset(0);
      if (field === 'finish_date') return isoDateOnly(entry && (entry.end_date || entry.finish_date)) || dateOffset(7);
      return '';
    }

    function moneyInputValue(value) {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) return '';
      return String(Math.round(amount * 100) / 100).replace('.', ',');
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

    function bulkHash(action, payload) {
      return `${action}:${JSON.stringify(payload || {})}`;
    }

    function bulkResultMessage(result, fallback) {
      const counts = result && result.counts ? result.counts : {};
      const applied = Number(counts.applied || 0);
      const failed = Number(counts.failed || 0);
      const blocked = Number(counts.blocked || 0);
      const skipped = Number(counts.skipped || 0);
      const unchanged = failed + blocked + skipped;
      const suffix = unchanged ? ` (${unchanged} não alterada${unchanged === 1 ? '' : 's'})` : '';
      return `${fallback} em ${applied} variação${applied === 1 ? '' : 's'}.${suffix}`;
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
      state.lastPopoverMarkup = '';
      renderPopover();
    }

    function rerenderModal() {
      state.lastModalMarkup = '';
      renderModal();
    }

    function removeInline() {
      if (state.inline) state.inline.remove();
      state.inline = null;
      state.lastInlineMarkup = '';
    }

    function removePopover() {
      if (state.popoverRoot) state.popoverRoot.remove();
      state.popoverRoot = null;
      state.lastPopoverMarkup = '';
    }

    function removePromotionResultPopover() {
      if (state.promotionResultPopoverAnchor && typeof state.promotionResultPopoverAnchor.setAttribute === 'function') {
        state.promotionResultPopoverAnchor.setAttribute('aria-expanded', 'false');
      }
      if (state.promotionResultPopoverRoot) state.promotionResultPopoverRoot.remove();
      state.promotionResultPopoverRoot = null;
      state.promotionResultPopoverKey = '';
      state.promotionResultPopoverAnchor = null;
    }

    function removeModal() {
      removePromotionResultPopover();
      if (state.modalRoot) state.modalRoot.remove();
      state.modalRoot = null;
      state.lastModalMarkup = '';
    }

    function bindViewportEvents() {
      if (state.viewportEventsReady) return;
      state.viewportEventsReady = true;
      window.addEventListener('resize', () => {
        scheduleRender(80);
        if (state.promotionResultPopoverRoot) {
          positionPromotionResultPopover(state.promotionResultPopoverRoot, state.promotionResultPopoverAnchor);
        }
      });
      window.addEventListener('scroll', () => {
        if (state.popover) renderPopover();
        if (state.promotionResultPopoverRoot) positionPromotionResultPopover(state.promotionResultPopoverRoot, state.promotionResultPopoverAnchor);
      }, true);
    }

    function bindDocumentEvents() {
      if (state.documentEventsReady) return;
      state.documentEventsReady = true;
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          if (state.promotionResultPopoverRoot) {
            removePromotionResultPopover();
            return;
          }
          closePopover();
          closePromotionModal();
        }
      });
      document.addEventListener('click', (event) => {
        if (state.promotionResultPopoverRoot) {
          const target = event.target;
          const anchor = state.promotionResultPopoverAnchor;
          if (!state.promotionResultPopoverRoot.contains(target) && (!anchor || !anchor.contains(target))) {
            removePromotionResultPopover();
          }
        }
        if (!state.popoverRoot || !state.popover) return;
        const target = event.target;
        if (state.popoverRoot.contains(target)) return;
        if (state.inline && state.inline.contains(target)) return;
        state.popover = null;
        removePopover();
      });
    }

    function getCommerceStatus() {
      return {
        ok: true,
        isProductPage: isProductPageUrl(location.href),
        loaded: state.loaded,
        busy: state.busy || state.priceLoading || state.promotionLoading,
        editorVisible: state.visible,
        dirty: state.priceEditing || Boolean(state.promotionFormKey),
        error: state.actionError || state.priceError || state.promotionError || '',
        itemId: state.itemId,
        mode: state.context && state.context.mode ? state.context.mode : null,
        catalogListing: Boolean(state.context && state.context.item && state.context.item.catalog_listing),
        selectedVariationId: state.context && state.context.selectedVariationId ? state.context.selectedVariationId : null,
        url: location.href
      };
    }

    async function showCommerce() {
      state.visible = true;
      if (!state.loaded && !state.busy) {
        state.busy = true;
        mountCommerce();
        await requestPageContextReload('show');
      }
      else mountCommerce();
      return getCommerceStatus();
    }

    function hideCommerce() {
      state.visible = false;
      removeInline();
      removePopover();
      removeModal();
      return getCommerceStatus();
    }

    async function reloadCommerceEditor() {
      if (isProductPageUrl(location.href)) {
        state.visible = true;
        state.busy = true;
        mountCommerce();
        await requestPageContextReload('manual');
      }
      return getCommerceStatus();
    }

    function icon(name, size) {
      return window.OnblideIcons ? window.OnblideIcons.render(name, size) : '';
    }

    function spinner() {
      return '<span class="ob-spinner ob-spinner-sm" aria-hidden="true"></span>';
    }

    return {
      id: 'commerce',
      label: 'Preço e promoções',
      getMode: () => state.context && state.context.mode ? state.context.mode : null,
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
