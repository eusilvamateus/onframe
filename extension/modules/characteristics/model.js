(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = model;
  } else {
    root.OnFrameCharacteristicsModel = model;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function canEditCharacteristics(context) {
    const item = context && context.item ? context.item : null;
    return Boolean(item && item.id && !item.catalog_listing);
  }

  function canBulkEditCharacteristics(context) {
    const item = context && context.item ? context.item : null;
    if (!canEditCharacteristics(context)) return false;
    if (!context || context.quick || context.mode !== 'user_product' || !item.user_product_id) return false;

    const familyIds = collectUserProductIds(context.family);
    familyIds.add(normalizeUserProductId(item.user_product_id));
    return Array.from(familyIds).filter(Boolean).length > 1;
  }

  function collectUserProductIds(value, output = new Set()) {
    if (!value) return output;
    if (typeof value === 'string') {
      const id = normalizeUserProductId(value);
      if (id) output.add(id);
      return output;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectUserProductIds(item, output));
      return output;
    }
    if (typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => {
        if (/user_product/i.test(key) || key === 'id') collectUserProductIds(item, output);
        else if (item && typeof item === 'object') collectUserProductIds(item, output);
      });
    }
    return output;
  }

  function normalizeUserProductId(value) {
    const match = String(value || '').match(/\bMLBU\d{6,}\b/i);
    return match ? match[0].toUpperCase() : '';
  }

  function bulkResultMessage(result) {
    const counts = result && result.counts ? result.counts : {};
    const applied = Number(counts.applied || 0);
    const failed = Number(counts.failed || 0);
    const blocked = Number(counts.blocked || 0);
    const skipped = Number(counts.skipped || 0);
    const notChanged = failed + blocked + skipped;
    const suffix = notChanged ? ` (${notChanged} não alterada${notChanged === 1 ? '' : 's'})` : '';
    return `Características salvas em ${applied} ${applied === 1 ? 'variação' : 'variações'}.${suffix}`;
  }

  function friendlyError(message) {
    const text = String(message || '');
    if (/bulk_characteristics_no_editable_variations/i.test(text)) return 'Não há variações editáveis para aplicar em massa.';
    if (/catalog_listing_characteristics_read_only|attributes is not modifiable on catalog listing item/i.test(text)) return 'Catálogo: características bloqueadas pelo Mercado Livre.';
    if (/characteristics_missing_updates/i.test(text)) return 'Altere ao menos uma característica.';
    if (/characteristics_attribute_not_editable/i.test(text)) return 'Essa característica não pode ser editada pelo Mercado Livre.';
    if (/characteristics_invalid_number_unit|characteristics_invalid_value/i.test(text)) return 'Informe um valor válido para a característica.';
    if (/characteristics_empty_value/i.test(text)) return 'Informe o valor da característica.';
    return text || 'Não consegui salvar as características.';
  }

  function normalizeFieldText(value) {
    return String(value === undefined || value === null ? '' : value).trim();
  }

  return {
    bulkResultMessage,
    canBulkEditCharacteristics,
    canEditCharacteristics,
    friendlyError,
    normalizeFieldText
  };
});
