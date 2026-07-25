(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = model;
  } else {
    root.OnFrameDescriptionModel = model;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value === undefined || value === null ? '' : value).replace(/\r\n/g, '\n').trim();
  }

  function isUserProductContext(context) {
    return Boolean(context && context.mode === 'user_product' && context.item && context.item.user_product_id);
  }

  function canEditDescription(context) {
    const item = context && context.item ? context.item : null;
    return Boolean(item && item.id && !item.catalog_listing);
  }

  function canBulkEditDescription(context) {
    const item = context && context.item ? context.item : null;
    if (!canEditDescription(context)) return false;
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
    return `Descrição salva em ${applied} ${applied === 1 ? 'variação' : 'variações'}.${suffix}`;
  }

  function friendlyError(message) {
    const text = String(message || '');
    if (/description_empty/i.test(text)) return 'Informe a descrição.';
    if (/bulk_description_no_editable_variations/i.test(text)) return 'Não há variações editáveis para aplicar em massa.';
    if (/catalog_listing_description_read_only|description is not modifiable on catalog listing item/i.test(text)) return 'Catálogo: descrição bloqueada pelo Mercado Livre.';
    if (/plain text|item\.description\.type\.invalid/i.test(text)) return 'A descrição deve conter apenas texto simples.';
    return text || 'Não consegui salvar a descrição.';
  }

  return {
    bulkResultMessage,
    canBulkEditDescription,
    canEditDescription,
    friendlyError,
    isUserProductContext,
    normalizeText
  };
});
