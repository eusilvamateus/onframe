(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = model;
  } else {
    root.OnFrameCommerceModel = model;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FIELD_LABELS = Object.freeze({
    deal_price: 'Preço promocional',
    stock: 'Estoque reservado',
    start_date: 'Início',
    finish_date: 'Fim'
  });

  const USER_FIELDS = Object.freeze(['deal_price', 'stock', 'start_date', 'finish_date']);

  function getPriceState(summary) {
    const item = summary && summary.item ? summary.item : {};
    const standard = summary && summary.standardPrice ? summary.standardPrice : {};
    const sale = summary && summary.salePrice ? summary.salePrice : null;
    const blocker = firstBlocker(summary && summary.restrictions);
    const amount = moneyAmount(standard.amount) || moneyAmount(item.price);
    const currency = standard.currency_id || item.currency_id || 'BRL';
    const hasPromotion = Boolean(
      sale && (sale.promotion || positiveNumber(sale.regular_amount) > positiveNumber(sale.amount)) ||
      positiveNumber(item.original_price) > positiveNumber(item.price)
    );

    if (blocker) {
      return {
        amount,
        amountText: formatMoney(amount, currency),
        canEdit: false,
        currency,
        detail: restrictionDetail(blocker),
        label: restrictionLabel(blocker),
        blocker,
        tone: 'warn'
      };
    }

    return {
      amount,
      amountText: formatMoney(amount, currency),
      canEdit: true,
      currency,
      detail: hasPromotion ? 'Preço com promoção ativa.' : 'Preço padrão editável.',
      label: hasPromotion ? 'Com promoção' : 'Editável',
      blocker: null,
      tone: 'green'
    };
  }

  function getPromotionState(summary) {
    const entries = collectPromotionGroups(summary);
    const activeCount = currentOfferCount(entries.activeOffers);
    const appliedCount = entries.activeOffers.length;
    const eligibleCount = list(entries.eligibleOffers).filter((entry) => !isStackablePromotion(entry)).length;
    const scheduledCount = programmedOfferCount(entries);

    if (activeCount) {
      return {
        activeCount,
        appliedCount,
        eligibleCount,
        scheduledCount,
        label: activeCount === 1 ? 'Promo ativa' : `${activeCount} ativas`,
        tone: 'green',
        summary: activeCount === 1 ? 'Existe promoção em vigor.' : `${activeCount} promoções em vigor.`
      };
    }

    if (scheduledCount) {
      return {
        activeCount,
        appliedCount,
        eligibleCount,
        scheduledCount,
        label: 'Programada',
        tone: 'blue',
        summary: 'Promoção programada.'
      };
    }

    if (eligibleCount) {
      return {
        activeCount,
        appliedCount,
        eligibleCount,
        scheduledCount,
        label: 'Elegível',
        tone: 'orange',
        summary: `${eligibleCount} oportunidade${eligibleCount === 1 ? '' : 's'} disponível${eligibleCount === 1 ? '' : 'is'}.`
      };
    }

    return {
      activeCount,
      appliedCount,
      eligibleCount,
      scheduledCount,
      label: 'Sem promo',
      tone: 'muted',
      summary: 'Nenhuma promoção ativa.'
    };
  }

  function collectPromotionGroups(summary) {
    const offers = summary && summary.offers ? summary.offers : {};
    const campaigns = summary && summary.campaigns ? summary.campaigns : {};
    return {
      activeOffers: list(offers.active),
      scheduledOffers: list(offers.scheduled),
      eligibleOffers: list(offers.eligible),
      finishedOffers: list(offers.finished),
      activeCampaigns: list(campaigns.active),
      scheduledCampaigns: list(campaigns.scheduled),
      eligibleCampaigns: list(campaigns.eligible),
      finishedCampaigns: list(campaigns.finished)
    };
  }

  function parseMoneyInput(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? roundMoney(value) : null;
    let text = String(value || '').trim();
    if (!text) return null;
    text = text.replace(/[^\d,.-]/g, '');
    if (!text) return null;

    if (text.includes(',')) {
      text = text.replace(/\./g, '').replace(',', '.');
    }

    const amount = Number(text);
    return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : null;
  }

  function currentOfferCount(entries) {
    const offers = list(entries).filter((entry) => !isStackablePromotion(entry));
    const current = offers.filter((entry) => entry && (entry.is_current_price === true || entry.display_status === 'active')).length;
    if (offers.some((entry) => entry && entry.display_status)) return current;
    return current || offers.filter((entry) => {
      const status = String(entry && entry.status || '').toLowerCase();
      return ['started', 'active'].includes(status);
    }).length;
  }

  function programmedOfferCount(entries) {
    const activeProgrammed = list(entries && entries.activeOffers).filter((entry) => {
      return !isStackablePromotion(entry) && String(entry && entry.display_status || '').toLowerCase() === 'programmed';
    });
    const scheduled = list(entries && entries.scheduledOffers).filter((entry) => !isStackablePromotion(entry));
    return uniquePromotionEntries(activeProgrammed.concat(scheduled)).length;
  }

  function isStackablePromotion(entry) {
    const type = String(entry && entry.type || '').toUpperCase();
    return entry && entry.is_stackable === true || type === 'BANK' || type === 'SELLER_COUPON_CAMPAIGN';
  }

  function uniquePromotionEntries(entries) {
    const seen = new Set();
    return list(entries).filter((entry, index) => {
      const key = entry && (entry.offer_id || entry.ref_id || entry.id)
        ? `${entry.type || ''}:${entry.offer_id || entry.ref_id || entry.id}`
        : `index:${index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function formatMoney(value, currency = 'BRL') {
    const amount = moneyAmount(value);
    if (!amount) return 'R$ --';
    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: currency || 'BRL',
        minimumFractionDigits: 2
      }).format(amount).replace(/\u00a0/g, ' ');
    } catch (e) {
      return `R$ ${amount.toFixed(2).replace('.', ',')}`;
    }
  }

  function buildOfferPayload(entry, values = {}) {
    const fields = getOfferCreateFields(entry);
    const payload = {
      promotionType: entry && entry.type ? entry.type : ''
    };

    if (entry && entry.id) payload.promotionId = entry.id;
    if (entry && entry.offer_id) payload.offerId = entry.offer_id;

    for (const field of fields) {
      if (field === 'promotion_id' && !payload.promotionId && values.promotion_id) payload.promotionId = values.promotion_id;
      if (field === 'offer_id' && !payload.offerId && values.offer_id) payload.offerId = values.offer_id;
      if (field === 'deal_price') {
        const dealPrice = parseMoneyInput(values.deal_price);
        if (!dealPrice) throw userFieldError('promotion_missing_deal_price');
        assertDealPriceInRange(entry, dealPrice);
        payload.dealPrice = dealPrice;
      }
      if (field === 'stock') {
        const stock = parseInteger(values.stock);
        if (!stock) throw userFieldError('promotion_missing_stock');
        payload.stock = stock;
      }
      if (field === 'start_date') {
        if (!values.start_date) throw userFieldError('promotion_missing_start_date');
        payload.startDate = toApiDate(values.start_date, 'start');
      }
      if (field === 'finish_date') {
        if (!values.finish_date) throw userFieldError('promotion_missing_finish_date');
        payload.finishDate = toApiDate(values.finish_date, 'finish');
      }
    }

    if (fields.includes('promotion_id') && !payload.promotionId) throw userFieldError('promotion_missing_promotion_id');
    if (fields.includes('offer_id') && !payload.offerId) throw userFieldError('promotion_missing_offer_id');
    return payload;
  }

  function buildOfferUpdatePayload(entry, values = {}) {
    const fields = getOfferUpdateFields(entry);
    return Object.assign(buildOfferPayload(Object.assign({}, entry, {
      capabilities: Object.assign({}, entry && entry.capabilities, { offerCreate: fields })
    }), values), {
      promotionType: entry && entry.type ? entry.type : ''
    });
  }

  function buildOfferDeletePayload(entry) {
    const fields = getOfferDeleteFields(entry);
    const payload = {
      promotionType: entry && entry.type ? entry.type : ''
    };
    if (entry && entry.id) payload.promotionId = entry.id;
    if (entry && entry.offer_id) payload.offerId = entry.offer_id;
    if (fields.includes('promotion_id') && !payload.promotionId) throw userFieldError('promotion_missing_promotion_id');
    if (fields.includes('offer_id') && !payload.offerId) throw userFieldError('promotion_missing_offer_id');
    return payload;
  }

  function canCreateOffer(entry) {
    return getOfferCreateFields(entry).length > 0 && !(entry && entry.capabilities && entry.capabilities.readonly);
  }

  function canUpdateOffer(entry) {
    return getOfferUpdateFields(entry).length > 0 && !(entry && entry.capabilities && entry.capabilities.readonly);
  }

  function canDeleteOffer(entry) {
    if (entry && entry.capabilities && entry.capabilities.readonly) return false;
    const fields = getOfferDeleteFields(entry);
    if (fields.length > 0) return true;
    return String(entry && entry.type || '').toUpperCase() === 'PRICE_DISCOUNT' &&
      entry && entry.capabilities && Array.isArray(entry.capabilities.offerDelete);
  }

  function getOfferCreateFields(entry) {
    return capabilityFields(entry, 'offerCreate');
  }

  function getOfferUpdateFields(entry) {
    return capabilityFields(entry, 'offerUpdate');
  }

  function getOfferDeleteFields(entry) {
    return capabilityFields(entry, 'offerDelete');
  }

  function getUserFields(fields) {
    return list(fields).filter((field) => USER_FIELDS.includes(field));
  }

  function fieldLabel(field) {
    return FIELD_LABELS[field] || field;
  }

  function friendlyError(error) {
    const message = String(error && error.message ? error.message : error || '');
    const text = message.toLowerCase();
    if (text.includes('pricing_invalid_amount')) return 'Informe um preço válido.';
    if (text.includes('pricing_automation_active')) return 'Preço automático ativo.';
    if (text.includes('price_blocked_by_promotion')) return 'Remova a promoção antes.';
    if (text.includes('item_closed') || text.includes('status:closed')) return 'Anúncio encerrado.';
    if (text.includes('promotion_missing_deal_price')) return 'Informe o preço promocional.';
    if (text.includes('promotion_missing_stock')) return 'Informe o estoque.';
    if (text.includes('promotion_missing_offer_id')) return 'Oferta não identificada. Atualize e tente de novo.';
    if (text.includes('start and finish dates must be in local format')) return 'Use datas sem fuso horário. Atualize e tente de novo.';
    if (text.includes('promotion_missing_start_date') || text.includes('promotion_missing_finish_date')) return 'Informe início e fim.';
    if (text.includes('promotion_readonly')) return 'Promoção automática.';
    if (text.includes('not_supported')) return 'Ação indisponível.';
    return message || 'Não consegui concluir.';
  }

  function firstBlocker(restrictions) {
    return list(restrictions).find((restriction) => restriction && restriction.level === 'block') || null;
  }

  function restrictionLabel(restriction) {
    const code = String(restriction && restriction.code || '');
    if (code === 'pricing_automation_active') return 'Automação ativa';
    if (code === 'price_blocked_by_promotion') return 'Promoção ativa';
    if (code === 'item_closed_with_bids' || code === 'item_closed') return 'Encerrado';
    return 'Bloqueado';
  }

  function restrictionDetail(restriction) {
    const code = String(restriction && restriction.code || '');
    if (code === 'pricing_automation_active') return 'Desative a automação para editar.';
    if (code === 'price_blocked_by_promotion') return 'Remova a promoção antes de alterar.';
    if (code === 'item_closed_with_bids' || code === 'item_closed') return 'Reative o anúncio para editar.';
    return restriction && restriction.message ? restriction.message : 'Alteração indisponível.';
  }

  function capabilityFields(entry, key) {
    const fields = entry && entry.capabilities && Array.isArray(entry.capabilities[key])
      ? entry.capabilities[key]
      : [];
    return fields.map((field) => String(field || '')).filter(Boolean);
  }

  function toApiDate(value, edge = 'start') {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.includes('T')) return text.replace(/(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/, '');
    return `${text}T${edge === 'finish' ? '23:59:59' : '00:00:00'}`;
  }

  function parseInteger(value) {
    const parsed = Number(String(value || '').replace(/[^\d]/g, ''));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function assertDealPriceInRange(entry, dealPrice) {
    const min = moneyAmount(entry && entry.min_price);
    const max = moneyAmount(entry && entry.max_price);
    if (min && dealPrice < min) throw userFieldError(formatDealPriceRangeMessage(min, max));
    if (max && dealPrice > max) throw userFieldError(formatDealPriceRangeMessage(min, max));
  }

  function formatDealPriceRangeMessage(min, max) {
    if (min && max) return `Use um preço entre ${formatMoney(min)} e ${formatMoney(max)}.`;
    if (min) return `Use um preço a partir de ${formatMoney(min)}.`;
    if (max) return `Use um preço até ${formatMoney(max)}.`;
    return 'Preço fora da faixa permitida.';
  }

  function userFieldError(code) {
    return new Error(code);
  }

  function moneyAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : null;
  }

  function positiveNumber(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
  }

  function roundMoney(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  return {
    buildOfferDeletePayload,
    buildOfferPayload,
    buildOfferUpdatePayload,
    canCreateOffer,
    canDeleteOffer,
    canUpdateOffer,
    collectPromotionGroups,
    fieldLabel,
    formatMoney,
    friendlyError,
    getOfferCreateFields,
    getOfferDeleteFields,
    getOfferUpdateFields,
    getPriceState,
    getPromotionState,
    getUserFields,
    parseMoneyInput
  };
});
