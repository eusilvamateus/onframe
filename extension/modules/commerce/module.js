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
      detailsOpen: false,
      promotionModalOpen: false,
      promotionFormKey: '',
      promotionDraftValues: {},
      promotionEstimates: {},
      promotionEstimateTimers: {},
      promotionEstimateRequestId: 0,
      promotionConfirm: null,
      promotionFocusKey: '',
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
      state.detailsOpen = false;
      state.promotionModalOpen = false;
      state.promotionFormKey = '';
      state.promotionDraftValues = {};
      clearPromotionEstimateTimers();
      state.promotionEstimates = {};
      state.promotionConfirm = null;
      state.promotionFocusKey = '';
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

      if (status !== 'ready') return;

      state.pageSignature = pageSignature;
      state.actionMessage = '';
      state.actionError = '';
      state.popover = null;
      state.priceEditing = false;
      state.promotionModalOpen = false;
      void loadContext(update.context);
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
          ${renderPopoverHead('Preço', priceState.label)}
          ${renderNotice(state.actionMessage || state.actionError, state.actionError ? 'warn' : 'ok')}
          ${renderPriceSnapshot(state.priceSummary, priceState)}
          ${renderPriceCosts(state.priceSummary)}
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
      return `
        <section class="onframe-commerce-popover">
          ${renderPopoverHead('Editar preço', priceState.label)}
          ${renderNotice(state.actionError, 'warn')}
          <label class="onframe-commerce-field">
            <span>Novo preço</span>
            <input data-field="price" inputmode="decimal" autocomplete="off" value="${escapeAttribute(state.priceDraft)}">
          </label>
          <div class="onframe-commerce-actions">
            <button class="onframe-commerce-btn primary" data-action="save-price" type="button" ${state.busy ? 'disabled' : ''}>Salvar</button>
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

      const promoState = CommerceModel.getPromotionState(state.promotionSummary);
      const groups = CommerceModel.collectPromotionGroups(state.promotionSummary);
      const campaignOffers = campaignPromotionEntries(groups.activeOffers);
      const active = currentPromotionEntry(campaignOffers);
      const stackables = stackablePromotionEntries(groups);
      const opportunities = promotionOpportunityEntries(groups);
      return `
        <section class="onframe-commerce-popover">
          ${renderPopoverHead('Promoções', promoState.label)}
          ${renderNotice(state.actionMessage || state.actionError, state.actionError ? 'warn' : 'ok')}
          ${active ? renderActivePromotionSummary(active) : renderNoActivePromotionSummary(opportunities)}
          ${renderStackablePromotionSummary(stackables)}
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
      state.modalRoot.innerHTML = markup;
      bindModalEvents();
      restoreModalPosition(modalScrollTop, pageScrollX, pageScrollY);
      restoreModalFieldFocus(focusedField);
    }

    function buildPromotionModal() {
      const promoState = state.promotionSummary ? CommerceModel.getPromotionState(state.promotionSummary) : null;
      const promoChips = state.promotionSummary ? renderPromotionSummaryChips(state.promotionSummary) : '';
      return `
        <div class="onframe-commerce-backdrop">
          <section class="onframe-commerce-modal" role="dialog" aria-modal="true" aria-label="Gerenciar promoções">
            <header class="onframe-commerce-modal-head">
              <div>
                <span>OnFrame</span>
                <h2>Promoções</h2>
                <p>Controle ofertas e campanhas deste anúncio.</p>
              </div>
              <button class="onframe-commerce-icon-btn" data-action="close-promotion-modal" type="button" aria-label="Fechar">${icon('x', 18)}</button>
            </header>
            <div class="onframe-commerce-modal-summary">
              <div class="onframe-commerce-summary-copy">
                <span class="onframe-commerce-pill ${escapeAttribute(promoState ? promoState.tone : 'muted')}">${escapeHtml(promoState ? promoState.label : 'Lendo')}</span>
                ${promoChips}
              </div>
              <button class="onframe-commerce-link" data-action="reload-commerce" type="button" ${state.promotionLoading ? 'disabled' : ''}>${icon('refresh', 14)}Atualizar</button>
            </div>
            ${renderNotice(state.actionMessage || state.actionError || state.promotionError, state.actionError || state.promotionError ? 'warn' : 'ok')}
            ${state.promotionLoading ? '<div class="onframe-commerce-empty">Lendo promoções...</div>' : renderPromotionManager()}
            <footer class="onframe-commerce-modal-foot">
              ${renderRefreshButton()}
              <button class="onframe-commerce-btn" data-action="close-promotion-modal" type="button">Fechar</button>
            </footer>
          </section>
        </div>
      `;
    }

    function renderPromotionManager() {
      if (!state.promotionSummary) return '<div class="onframe-commerce-empty">Promoções indisponíveis.</div>';
      const groups = CommerceModel.collectPromotionGroups(state.promotionSummary);
      const discountEntry = buildDiscountEntry();
      const openCampaigns = promotionOpportunityEntries(groups);
      const currentOffers = currentPromotionEntries(campaignPromotionEntries(groups.activeOffers));
      const stackableOffers = stackablePromotionEntries(groups);
      const programmedOffers = programmedPromotionEntries(groups);
      return `
        ${renderPromotionSection('Promoção no preço', currentOffers, 'active-offer', 'Nenhuma promoção ativa.')}
        ${renderPromotionSection('Descontos acumulativos', stackableOffers, 'stackable-offer', '')}
        ${renderPromotionSection('Disponíveis para entrar', openCampaigns, 'eligible-offer', 'Nenhuma oportunidade disponível.')}
        ${discountEntry ? renderPromotionSection('Desconto do anúncio', [discountEntry], 'discount-offer', '') : ''}
        ${renderPromotionSection('Programadas', programmedOffers, 'programmed-offer', 'Nenhuma promoção programada.')}
      `;
    }

    function renderActivePromotionSummary(entry) {
      const originalPrice = entry.original_price || null;
      const finalPrice = entry.price || entry.suggested_price || null;
      const discount = discountPercent(originalPrice, finalPrice);
      const metrics = [
        discount ? { label: 'Desconto', value: `${discount}% OFF`, tone: 'green' } : null,
        ...promotionContributionMetrics(entry)
      ].filter(Boolean);
      return `
        <div class="onframe-commerce-promo-summary">
          ${renderPromotionPeriodLegend(entry)}
          <small>Promoção aplicada</small>
          <strong>${escapeHtml(entry.label || 'Promoção')}</strong>
          ${renderPromotionMetricGrid(metrics)}
        </div>
      `;
    }

    function renderStackablePromotionSummary(entries) {
      const list = Array.isArray(entries) ? entries : [];
      if (!list.length) return '';
      return list.map((entry) => {
        const metrics = [
          stackablePromotionContextMetric(entry),
          ...promotionContributionMetrics(entry)
        ].filter(Boolean);
        return `
          <div class="onframe-commerce-promo-summary">
            ${renderPromotionPeriodLegend(entry)}
            <small>Desconto acumulativo</small>
            <strong>${escapeHtml(entry.label || 'Promoção')}</strong>
            ${renderPromotionMetricGrid(metrics)}
          </div>
        `;
      }).join('');
    }

    function renderNoActivePromotionSummary(opportunities) {
      const count = Array.isArray(opportunities) ? opportunities.length : 0;
      return `
        <div class="onframe-commerce-promo-summary muted">
          <small>Promoções</small>
          <strong>Nenhuma aplicada</strong>
          ${renderPromotionMetricGrid([{ label: 'Disponíveis', value: `${count} promoç${count === 1 ? 'ão' : 'ões'}` }])}
        </div>
      `;
    }

    function promotionContributionMetrics(entry) {
      return promotionBenefitMetrics(entry, { includeAmount: true, basePrice: promotionDisplayPrice(entry) });
    }

    function promotionBenefitMetrics(entry, options = {}) {
      const metrics = [];
      const currency = itemCurrency();
      const amount = promotionBenefitAmount(entry, options.basePrice);
      const sellerPercentage = Number(entry && entry.seller_percentage);
      const meliPercentage = Number(entry && entry.meli_percentage);
      const boostPercentage = Number(entry && entry.discount_meli_boosted_percentage);
      const benefitPercentage = Number.isFinite(meliPercentage) && meliPercentage > 0 ? meliPercentage : boostPercentage;

      if (options.includeAmount && amount !== null) {
        metrics.push({ label: 'Mercado Livre paga', value: formatBenefitValue(amount, benefitPercentage, currency), tone: 'green' });
      }
      if (Number.isFinite(sellerPercentage) && sellerPercentage > 0) {
        metrics.push({ label: 'Você paga', value: formatPercent(sellerPercentage) });
      }
      if (!(options.includeAmount && amount !== null) && Number.isFinite(benefitPercentage) && benefitPercentage > 0) {
        metrics.push({ label: 'Mercado Livre paga', value: formatPercent(benefitPercentage), tone: 'green' });
      }
      return metrics;
    }

    function promotionBenefitAmount(entry, basePrice) {
      const amount = moneyOrNull(entry && (entry.discount_meli_boost_amount || entry.amount));
      if (amount !== null) return amount;
      const price = moneyOrNull(basePrice);
      const percentage = Number(entry && (entry.meli_percentage || entry.discount_meli_boosted_percentage || entry.percentage));
      if (!price || !Number.isFinite(percentage) || percentage <= 0) return null;
      return Math.round(price * percentage) / 100;
    }

    function renderPromotionPeriodLegend(entry) {
      const period = formatPromotionPeriod(entry);
      return period ? `<div class="onframe-commerce-period-legend">${escapeHtml(period)}</div>` : '';
    }

    function renderPromotionMetricGrid(metrics) {
      const list = Array.isArray(metrics) ? metrics.filter(Boolean) : [];
      if (!list.length) return '';
      return `
        <div class="onframe-commerce-promo-metrics">
          ${list.map((metric) => `
            <span class="${escapeAttribute(metric.tone || '')}">
              <small>${escapeHtml(metric.label)}</small>
              <b>${escapeHtml(metric.value)}</b>
            </span>
          `).join('')}
        </div>
      `;
    }

    function renderPromotionSection(title, entries, kind, emptyText) {
      const list = Array.isArray(entries) ? entries : [];
      if (!list.length && !emptyText) return '';
      return `
        <section class="onframe-commerce-section">
          <div class="onframe-commerce-section-head">
            <h3>${escapeHtml(title)}</h3>
            <span>${list.length}</span>
          </div>
          ${list.length ? `<div class="onframe-commerce-card-grid">${list.map((entry, index) => renderPromotionCard(entry, kind, index)).join('')}</div>` : `<div class="onframe-commerce-empty">${escapeHtml(emptyText)}</div>`}
        </section>
      `;
    }

    function renderPromotionCard(entry, kind, index) {
      const key = `${kind}:${index}`;
      const canCreate = kind === 'eligible-offer' || kind === 'stackable-offer' && isCandidatePromotion(entry) || kind === 'discount-offer' && isCandidatePromotion(entry);
      const canUpdate = (kind === 'active-offer' || kind === 'programmed-offer') && CommerceModel.canUpdateOffer(entry);
      const canDelete = (kind === 'active-offer' || kind === 'programmed-offer' || kind === 'stackable-offer' && !isCandidatePromotion(entry) || kind === 'discount-offer' && !isCandidatePromotion(entry)) && CommerceModel.canDeleteOffer(entry);
      const userFields = CommerceModel.getUserFields(canUpdate ? CommerceModel.getOfferUpdateFields(entry) : CommerceModel.getOfferCreateFields(entry));
      const formOpen = state.promotionFormKey === key;
      const confirm = state.promotionConfirm && state.promotionConfirm.key === key ? state.promotionConfirm : null;
      const confirmBlocked = confirm ? isPromotionConfirmationBlocked(entry, confirm) : false;
      const tone = promotionTone(entry, kind);
      const status = promotionStatusLabel(entry, kind);
      const facts = renderPromotionFacts(entry, kind, key, userFields);
      const hint = promotionHint(entry, kind, canCreate, canUpdate, canDelete, userFields);
      const statusBadge = renderPromotionStatusBadge(status, tone, kind);

      return `
        <article class="onframe-commerce-card ${escapeAttribute(tone)}" data-entry-kind="${escapeAttribute(kind)}" data-entry-index="${index}" data-entry-key="${escapeAttribute(key)}">
          ${renderPromotionPeriodLegend(entry)}
          <div class="onframe-commerce-card-main">
            <div>
              <strong>${escapeHtml(entry.label || 'Promoção')}</strong>
              <span>${escapeHtml(hint)}</span>
            </div>
            ${statusBadge}
          </div>
          ${facts ? `<div class="onframe-commerce-meta">${facts}</div>` : ''}
          ${formOpen ? renderPromotionFields(userFields, key, entry) : ''}
          ${renderPromotionReview(key, entry, formOpen, confirm)}
          <div class="onframe-commerce-card-actions">
            ${canCreate ? `<button class="onframe-commerce-btn primary compact" data-action="create-offer" type="button" ${confirmBlocked && confirm.action === 'create' ? 'disabled' : ''}>${icon(confirm && confirm.action === 'create' ? 'checkCircle' : formOpen ? 'checkCircle' : 'tag', 14)}${confirm && confirm.action === 'create' ? 'Confirmar aplicação' : userFields.length && !formOpen ? 'Configurar oferta' : 'Revisar aplicação'}</button>` : ''}
            ${canUpdate ? `<button class="onframe-commerce-btn compact" data-action="update-offer" type="button" ${confirmBlocked && confirm.action === 'update' ? 'disabled' : ''}>${icon(confirm && confirm.action === 'update' ? 'checkCircle' : formOpen ? 'checkCircle' : 'pencil', 14)}${confirm && confirm.action === 'update' ? 'Confirmar alteração' : userFields.length && !formOpen ? 'Alterar valores' : 'Revisar alteração'}</button>` : ''}
            ${canDelete ? `<button class="onframe-commerce-btn danger compact" data-action="delete-offer" type="button">${icon(confirm && confirm.action === 'delete' ? 'checkCircle' : 'x', 14)}${confirm && confirm.action === 'delete' ? 'Confirmar remoção' : 'Remover promoção'}</button>` : ''}
            ${confirm ? '<button class="onframe-commerce-btn compact" data-action="cancel-promotion-confirm" type="button">Cancelar</button>' : ''}
          </div>
        </article>
      `;
    }

    function renderPromotionSummaryChips(summary) {
      const groups = CommerceModel.collectPromotionGroups(summary);
      const active = currentPromotionEntries(campaignPromotionEntries(groups.activeOffers)).length;
      const opportunities = promotionOpportunityEntries(groups).length;
      const scheduled = programmedPromotionEntries(groups).length;
      const stackable = stackablePromotionEntries(groups).length;
      const applied = campaignPromotionEntries(groups.activeOffers).filter((entry) => !isStackablePromotion(entry)).length;
      return `
        <span class="onframe-commerce-mini-chip green">${active} ativa${active === 1 ? '' : 's'}</span>
        <span class="onframe-commerce-mini-chip green">${applied} aplicada${applied === 1 ? '' : 's'}</span>
        ${stackable ? `<span class="onframe-commerce-mini-chip green">${stackable} acumulativo${stackable === 1 ? '' : 's'}</span>` : ''}
        <span class="onframe-commerce-mini-chip orange">${opportunities} disponíve${opportunities === 1 ? 'l' : 'is'}</span>
        <span class="onframe-commerce-mini-chip blue">${scheduled} programada${scheduled === 1 ? '' : 's'}</span>
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

    function renderPromotionFacts(entry, kind, key, userFields = []) {
      const chips = [];
      const displayPrice = promotionDisplayPrice(entry);
      const priceLabel = entry.price ? 'Preço' : entry.suggested_price ? 'Sugerido' : entry.total_price_for_boosted_offer ? 'Preço' : '';
      if (displayPrice) chips.push(renderMetaChip(priceLabel, CommerceModel.formatMoney(displayPrice, itemCurrency()), 'primary'));
      const discount = discountPercent(entry.original_price, displayPrice);
      if (discount) chips.push(renderMetaChip('Desconto', `${discount}% OFF`, 'success'));
      if (entry.suggested_price && entry.price && entry.suggested_price !== entry.price) {
        chips.push(renderMetaChip('Sugerido', CommerceModel.formatMoney(entry.suggested_price, itemCurrency()), 'primary'));
      }
      const stackableContext = stackablePromotionContextMetric(entry);
      if (stackableContext) chips.push(renderMetaChip(stackableContext.label, stackableContext.value, 'muted'));
      let appliedCostFacts = [];
      if (kind !== 'eligible-offer') {
        appliedCostFacts = renderAppliedPromotionCostFacts(key);
        appliedCostFacts.forEach((metric) => {
          chips.push(renderMetaChip(metric.label, metric.value, metric.tone || 'muted'));
        });
      }
      if (!appliedCostFacts.length) promotionBenefitMetrics(entry, { includeAmount: true, basePrice: displayPrice }).forEach((metric) => {
        chips.push(renderMetaChip(metric.label, metric.value, metric.tone || 'muted'));
      });
      if (entry.stock) chips.push(renderMetaChip('Estoque', `${entry.stock} un.`, 'muted'));
      if (userFields.includes('deal_price')) chips.push(renderMetaChip('Preço', 'Editável', 'muted'));
      return chips.join('');
    }

    function renderAppliedPromotionCostFacts(key) {
      const estimate = state.promotionEstimates[key];
      if (!estimate || estimate.status !== 'ready' || !estimate.data) return [];
      const currency = estimate.data.currency_id || itemCurrency();
      const facts = [];
      if (moneyOrNull(estimate.data.youReceive) !== null) {
        facts.push({ label: 'Você recebe', value: CommerceModel.formatMoney(estimate.data.youReceive, currency), tone: 'success' });
      }
      const benefitAmount = promotionBenefitAmount(estimate.data.promotionBenefit, estimate.data.dealPrice);
      if (benefitAmount !== null) {
        facts.push({ label: 'Mercado Livre paga', value: formatBenefitValue(benefitAmount, promotionBenefitPercentage(estimate.data.promotionBenefit), currency), tone: 'success' });
      }
      return facts;
    }

    function renderPromotionStatusBadge(status, tone, kind) {
      if (kind === 'eligible-offer') return '';
      return `<span class="onframe-commerce-status ${escapeAttribute(tone)}">${escapeHtml(status)}</span>`;
    }

    function renderMetaChip(label, value, tone) {
      if (!value) return '';
      return `
        <span class="${escapeAttribute(tone || 'muted')}">
          <small>${escapeHtml(label)}</small>
          <b>${escapeHtml(value)}</b>
        </span>
      `;
    }

    function renderPriceSnapshot(summary, priceState) {
      const standard = summary && summary.standardPrice ? summary.standardPrice : {};
      const sale = summary && summary.salePrice ? summary.salePrice : null;
      const currency = itemCurrency();
      const standardAmount = Number(standard.amount || priceState.amount || 0);
      const saleAmount = Number(sale && sale.amount || 0);
      const hasPromotionPrice = saleAmount > 0 && (!standardAmount || saleAmount !== standardAmount);
      const activeAmount = hasPromotionPrice ? saleAmount : standardAmount;
      const discount = hasPromotionPrice ? discountPercent(standardAmount || sale.regular_amount, saleAmount) : 0;

      return `
        <div class="onframe-commerce-price-summary">
          <div class="onframe-commerce-price-main ${hasPromotionPrice ? 'promo' : ''}">
            <small>${hasPromotionPrice ? 'Preço com promoção' : 'Preço atual'}</small>
            <strong>${escapeHtml(CommerceModel.formatMoney(activeAmount, currency))}</strong>
            ${discount ? `<span>${discount}% OFF</span>` : ''}
          </div>
        </div>
      `;
    }

    function renderPriceCosts(summary) {
      const metrics = priceCostMetrics(summary);
      if (!metrics.length) return '';
      return `
        <div class="onframe-commerce-cost-grid">
          ${metrics.map((metric) => `
            <span class="${escapeAttribute(metric.tone || '')}">
              <small>${escapeHtml(metric.label)}</small>
              <b>${escapeHtml(metric.value)}</b>
            </span>
          `).join('')}
        </div>
      `;
    }

    function priceCostMetrics(summary) {
      if (!summary) return [];
      const currency = itemCurrency();
      const breakdown = summary.costBreakdown || null;
      const metrics = [];

      if (!breakdown) return metrics;
      const commission = breakdown.commission || null;
      const shipping = breakdown.shipping || null;
      const benefit = breakdown.promotion_benefit || null;
      if (breakdown.complete && moneyOrNull(breakdown.you_receive) !== null) {
        metrics.push({ label: 'Você recebe', value: CommerceModel.formatMoney(breakdown.you_receive, currency), tone: 'green' });
      } else {
        metrics.push({ label: 'Custos', value: 'Incompletos', tone: 'warning' });
      }
      if (commission && moneyOrNull(commission.amount) !== null) {
        metrics.push({ label: 'Comissão ML', value: CommerceModel.formatMoney(commission.amount, commission.currency_id || currency) });
      }
      if (shipping && moneyOrNull(shipping.amount) !== null) {
        metrics.push({ label: 'Frete vendedor', value: CommerceModel.formatMoney(shipping.amount, shipping.currency_id || currency) });
      }
      if (benefit && moneyOrNull(benefit.amount) !== null) {
        metrics.splice(1, 0, { label: 'Mercado Livre paga', value: formatBenefitValue(benefit.amount, promotionBenefitPercentage(benefit), currency), tone: 'green' });
      } else if (benefit && Number(benefit.meli_percentage) > 0) {
        metrics.splice(1, 0, { label: 'Mercado Livre paga', value: formatPercent(benefit.meli_percentage), tone: 'green' });
      }
      return metrics;
    }

    function renderPriceStackableScenarios(summary) {
      const breakdown = summary && summary.costBreakdown ? summary.costBreakdown : {};
      const benefits = Array.isArray(breakdown.stackable_benefits) && breakdown.stackable_benefits.length
        ? breakdown.stackable_benefits
        : summary && summary.promotionBenefits && Array.isArray(summary.promotionBenefits.stackable)
          ? summary.promotionBenefits.stackable
          : [];
      const list = benefits.filter((benefit) => benefit && (moneyOrNull(benefit.amount) !== null || promotionBenefitPercentage(benefit)));
      if (!list.length) return '';
      return `
        <div class="onframe-commerce-price-scenarios">
          ${list.map(renderPriceStackableScenario).join('')}
        </div>
      `;
    }

    function renderPriceStackableScenario(benefit) {
      const currency = itemCurrency();
      const payment = stackablePaymentLabel(benefit);
      const metrics = [];
      if (moneyOrNull(benefit.total_price_for_boosted_offer) !== null) {
        metrics.push({ label: `Preço ${payment ? `no ${payment}` : 'acumulativo'}`, value: CommerceModel.formatMoney(benefit.total_price_for_boosted_offer, currency), tone: 'primary' });
      }
      if (moneyOrNull(benefit.amount) !== null) {
        metrics.push({ label: 'Mercado Livre paga', value: formatBenefitValue(benefit.amount, promotionBenefitPercentage(benefit), currency), tone: 'green' });
      } else if (promotionBenefitPercentage(benefit)) {
        metrics.push({ label: 'Mercado Livre paga', value: formatPercent(promotionBenefitPercentage(benefit)), tone: 'green' });
      }
      if (Number(benefit.seller_percentage) > 0) {
        metrics.push({ label: 'Você paga', value: formatPercent(benefit.seller_percentage), tone: 'muted' });
      }
      return `
        <div class="onframe-commerce-price-scenario">
          <div>
            <small>Desconto acumulativo</small>
            <strong>${escapeHtml(benefit.label || (payment ? `No ${payment}` : 'Acumulativo'))}</strong>
          </div>
          ${renderPromotionMetricGrid(metrics)}
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
      const period = formatPromotionPeriodFromValues(entry, values);
      const rangeWarning = promotionRangeWarning(entry, targetPrice);
      const estimateMarkup = confirm.action === 'delete' ? '' : renderPromotionEstimate(key, 'review');
      return `
        <div class="onframe-commerce-review">
          <strong>${escapeHtml(confirmationTitle(confirm.action))}</strong>
          <span>${escapeHtml(confirmationText(confirm.action))}</span>
          ${period ? `<div class="onframe-commerce-period-legend">${escapeHtml(period)}</div>` : ''}
          ${renderPromotionConfirmFacts(entry, targetPrice, rangeWarning)}
          ${estimateMarkup}
        </div>
      `;
    }

    function isPromotionConfirmationBlocked(entry, confirm) {
      if (!confirm || (confirm.action !== 'create' && confirm.action !== 'update')) return false;
      const values = confirm.values || {};
      const targetPrice = promotionTargetPrice(entry, values);
      return Boolean(promotionRangeWarning(entry, targetPrice));
    }

    function renderPromotionConfirmFacts(entry, targetPrice, rangeWarning) {
      const facts = [];
      const discount = discountPercent(entry.original_price, targetPrice);
      if (targetPrice) facts.push({ label: 'Preço final', value: CommerceModel.formatMoney(targetPrice, itemCurrency()), tone: 'primary' });
      if (discount) facts.push({ label: 'Desconto', value: `${discount}% OFF`, tone: 'success' });
      if (rangeWarning) facts.push({ label: 'Ajuste necessário', value: rangeWarning, tone: 'warning' });
      if (!facts.length) return '';
      return `<div class="onframe-commerce-review-grid">${facts.map((metric) => renderReviewMetric(metric)).join('')}</div>`;
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
            <strong>Revisão antes de enviar</strong>
            ${estimate.complete === false ? '<span>Incompleto</span>' : ''}
          </div>
          <div class="onframe-commerce-estimate-grid">
            ${metrics.map(renderReviewMetric).join('')}
          </div>
        </div>
      `;
    }

    function promotionEstimateMetrics(estimate, currency) {
      const commission = estimate.commission || null;
      const shipping = estimate.shipping || null;
      const benefit = estimate.promotionBenefit || null;
      const metrics = [];

      if (moneyOrNull(estimate.youReceive) !== null) {
        metrics.push({ label: 'Você recebe', value: CommerceModel.formatMoney(estimate.youReceive, currency), tone: 'green' });
      }
      const benefitAmount = promotionBenefitAmount(benefit, estimate.dealPrice);
      if (benefitAmount !== null) {
        metrics.push({ label: 'Mercado Livre paga', value: formatBenefitValue(benefitAmount, promotionBenefitPercentage(benefit), currency), tone: 'green' });
      }
      if (commission && moneyOrNull(commission.amount) !== null) {
        metrics.push({ label: 'Comissão', value: CommerceModel.formatMoney(commission.amount, currency), tone: 'muted' });
      }
      if (shipping && moneyOrNull(shipping.amount) !== null) {
        metrics.push({ label: 'Frete', value: CommerceModel.formatMoney(shipping.amount, currency), tone: 'muted' });
      }
      promotionBenefitMetrics(benefit, { includeAmount: false }).forEach((metric) => {
        if (benefitAmount !== null && metric.label === 'Mercado Livre paga') return;
        if (!metrics.some((item) => item.label === metric.label && item.value === metric.value)) metrics.push(metric);
      });
      return metrics;
    }

    function renderReviewMetric(metric) {
      return `
        <span class="${escapeAttribute(metric.tone || 'muted')}">
          <small>${escapeHtml(metric.label)}</small>
          <b>${escapeHtml(metric.value)}</b>
        </span>
      `;
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

    function confirmationTitle(action) {
      if (action === 'delete') return 'Remover esta promoção?';
      if (action === 'update') return 'Confirmar alteração?';
      return 'Aplicar esta promoção?';
    }

    function confirmationText(action) {
      if (action === 'delete') return 'A remoção será enviada ao Mercado Livre ao confirmar.';
      return 'Nada foi enviado ainda. Revise antes de confirmar.';
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

    function formatPromotionPeriodFromValues(entry, values) {
      const startValue = values && values.start_date ? values.start_date : entry && (entry.start_date || entry.startDate);
      const endValue = values && values.finish_date ? values.finish_date : entry && (entry.end_date || entry.finish_date || entry.endDate || entry.finishDate);
      const start = formatCentralDate(startValue);
      const end = formatCentralDate(endValue);
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

    function formatBenefitValue(amount, percentage, currency) {
      const amountText = CommerceModel.formatMoney(amount, currency || itemCurrency());
      const percentageText = formatPercent(percentage);
      return percentageText ? `${amountText} · ${percentageText}` : amountText;
    }

    function promotionBenefitPercentage(benefit) {
      const meliPercentage = Number(benefit && benefit.meli_percentage);
      const boostPercentage = Number(benefit && (benefit.discount_meli_boosted_percentage || benefit.percentage));
      if (Number.isFinite(meliPercentage) && meliPercentage > 0) return meliPercentage;
      if (Number.isFinite(boostPercentage) && boostPercentage > 0) return boostPercentage;
      return 0;
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
          <span>${escapeHtml(badge || '')}</span>
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
    }

    function bindModalEvents() {
      if (!state.modalRoot) return;
      bindButton(state.modalRoot, 'close-promotion-modal', closePromotionModal);
      bindButton(state.modalRoot, 'reload-commerce', () => void reloadCommerce());
      bindButton(state.modalRoot, 'create-offer', (button) => void performPromotionAction(button, 'create'));
      bindButton(state.modalRoot, 'update-offer', (button) => void performPromotionAction(button, 'update'));
      bindButton(state.modalRoot, 'delete-offer', (button) => void performPromotionAction(button, 'delete'));
      bindButton(state.modalRoot, 'cancel-promotion-confirm', cancelPromotionConfirm);
      bindButton(state.modalRoot, 'refresh-page', refreshPage);
      bindButton(state.modalRoot, 'open-date-picker', (button) => openDatePicker(button.closest('.onframe-commerce-date-field') && button.closest('.onframe-commerce-date-field').querySelector('[data-date-display]')));
      bindPromotionFieldDrafts(state.modalRoot);
      bindDateFields(state.modalRoot);
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
      });
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
      ].filter(({ entry }) => moneyOrNull(promotionDisplayPrice(entry)));
    }

    function schedulePromotionEstimate(key, entry, values) {
      if (!key || !entry || !state.itemId) return;
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
      state.actionError = '';
      state.actionMessage = '';
      rerenderPopover();
    }

    function cancelPriceEdit() {
      state.priceEditing = false;
      state.priceDraft = '';
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

      state.busy = true;
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
        mountCommerce();
      }
    }

    function openPromotionModal() {
      state.popover = null;
      removePopover();
      state.promotionModalOpen = true;
      state.actionError = '';
      state.actionMessage = '';
      state.promotionFormKey = '';
      state.promotionDraftValues = {};
      clearPromotionEstimateTimers();
      state.promotionEstimates = {};
      renderModal();
      schedulePromotionManagerEstimates();
    }

    function closePromotionModal() {
      state.promotionModalOpen = false;
      state.promotionFormKey = '';
      state.promotionDraftValues = {};
      clearPromotionEstimateTimers();
      state.promotionEstimates = {};
      state.promotionConfirm = null;
      state.promotionFocusKey = '';
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

        state.busy = true;
        state.actionError = '';
        state.actionMessage = '';
        rerenderModal();
        await api(itemApiPath('/promotions/offers'), {
          method,
          body: JSON.stringify(payload)
        });
        state.actionMessage = action === 'delete' ? 'Promoção removida.' : 'Promoção enviada.';
        state.promotionFormKey = '';
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
        mountCommerce();
      }
    }

    function cancelPromotionConfirm() {
      state.promotionConfirm = null;
      state.promotionFocusKey = state.promotionFormKey || '';
      state.actionError = '';
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
      const width = 340;
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const top = Math.max(12, rect.bottom + 8);
      root.style.left = `${Math.round(left)}px`;
      root.style.top = `${Math.round(top)}px`;
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

    function removeModal() {
      if (state.modalRoot) state.modalRoot.remove();
      state.modalRoot = null;
      state.lastModalMarkup = '';
    }

    function bindViewportEvents() {
      if (state.viewportEventsReady) return;
      state.viewportEventsReady = true;
      window.addEventListener('resize', () => scheduleRender(80));
      window.addEventListener('scroll', () => {
        if (state.popover) renderPopover();
      }, true);
    }

    function bindDocumentEvents() {
      if (state.documentEventsReady) return;
      state.documentEventsReady = true;
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          closePopover();
          closePromotionModal();
        }
      });
      document.addEventListener('click', (event) => {
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
