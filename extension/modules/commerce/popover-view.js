(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OnFrameCommercePopoverView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createPopoverView(options) {
    const state = options.state;
    const Model = options.model;
    const escapeHtml = options.escapeHtml;
    const escapeAttribute = options.escapeAttribute;
    const icon = options.icon;

    function buildPrice() {
      if (state.priceLoading) return loading('Preço', 'Lendo preço do anúncio.');
      if (state.priceError) return error('Preço', state.priceError);
      const priceState = Model.getPriceState(state.priceSummary);
      if (state.priceEditing) return buildPriceEdit(priceState);
      return `
        <section class="onframe-commerce-popover">
          ${options.renderHead('Preço')}
          ${options.renderNotice(state.actionError, 'warn')}
          ${options.renderPriceSummary(state.priceSummary, priceState)}
          ${options.renderPriceScenarios(state.priceSummary)}
          ${state.detailsOpen ? `<p class="onframe-commerce-detail">${escapeHtml(priceState.detail)}</p>` : ''}
          <div class="onframe-commerce-actions">
            <button class="onframe-commerce-btn primary" data-action="edit-price" type="button" ${priceState.canEdit ? '' : 'disabled'}>${icon('pencil', 14)}Editar preço base</button>
            ${priceState.blocker ? '<button class="onframe-commerce-btn" data-action="toggle-details" type="button">Ver motivo</button>' : ''}
          </div>
        </section>
      `;
    }

    function buildPriceEdit(priceState) {
      const bulkSwitch = options.renderBulkSwitch('price', state.priceBulkEnabled);
      return `
        <section class="onframe-commerce-popover">
          ${options.renderHead('Editar preço', priceState.label)}
          ${options.renderNotice(state.actionError, 'warn')}
          <section class="ob-card onframe-commerce-popover-price-edit-card">
            <div class="onframe-commerce-popover-price-edit-field">
              <label class="onframe-commerce-field">
                <span>Novo preço</span>
                <input data-field="price" inputmode="decimal" autocomplete="off" value="${escapeAttribute(state.priceDraft)}">
              </label>
            </div>
            ${bulkSwitch ? `<div class="onframe-commerce-popover-price-edit-bulk">${bulkSwitch}</div>` : ''}
          </section>
          ${options.renderBulkBusyStatus()}
          ${options.renderBulkStatus(state.priceBulkPreview, state.priceBulkError)}
          <div class="onframe-commerce-actions">
            <button class="onframe-commerce-btn primary" data-action="save-price" type="button" ${state.busy ? 'disabled' : ''}>${options.priceSaveIcon()}${escapeHtml(options.priceSaveLabel())}</button>
            <button class="onframe-commerce-btn" data-action="cancel-price" type="button" ${state.busy ? 'disabled' : ''}>Descartar</button>
          </div>
        </section>
      `;
    }

    function buildPromotions() {
      if (state.promotionLoading) return loading('Promoções', 'Lendo promoções do anúncio.');
      if (state.promotionError) return error('Promoções', state.promotionError);
      const groups = Model.collectPromotionGroups(state.promotionSummary);
      const campaign = options.campaignEntry(groups);
      const coupons = options.couponEntries(groups);
      const paymentBenefits = options.paymentEntries(groups);
      return `
        <section class="onframe-commerce-popover">
          ${options.renderHead('Promoções')}
          ${options.renderNotice(state.actionError, 'warn')}
          ${campaign ? options.renderCampaign(campaign) : options.renderEmptyState()}
          ${options.renderCoupons(coupons)}
          ${options.renderPayments(paymentBenefits)}
          <div class="onframe-commerce-actions">
            <button class="onframe-commerce-btn primary" data-action="open-promotion-modal" type="button">${icon('tag', 14)}Gerenciar promoções</button>
          </div>
        </section>
      `;
    }

    function loading(title, message) {
      return `<section class="onframe-commerce-popover">${options.renderHead(title, 'Carregando')}<div class="onframe-commerce-muted">${escapeHtml(message)}</div></section>`;
    }

    function error(title, message) {
      return `
        <section class="onframe-commerce-popover">
          ${options.renderHead(title, 'Aviso')}
          ${options.renderNotice(message, 'warn')}
          <button class="onframe-commerce-btn primary" data-action="reload-commerce" type="button">${icon('refresh', 14)}Recarregar</button>
        </section>
      `;
    }

    return { buildPrice, buildPromotions };
  }

  return { createPopoverView };
});
