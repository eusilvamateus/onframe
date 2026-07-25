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

  function bulkResultMessage(result) {
    const counts = result && result.counts ? result.counts : {};
    const applied = Number(counts.applied || 0);
    const failed = Number(counts.failed || 0);
    const suffix = failed ? ` (${failed} falha${failed === 1 ? '' : 's'})` : '';
    return `Descrição salva em ${applied} ${applied === 1 ? 'variação' : 'variações'}.${suffix}`;
  }

  function friendlyError(message) {
    const text = String(message || '');
    if (/description_empty/i.test(text)) return 'Informe a descrição.';
    if (/plain text|item\.description\.type\.invalid/i.test(text)) return 'A descrição deve conter apenas texto simples.';
    return text || 'Não consegui salvar a descrição.';
  }

  return {
    bulkResultMessage,
    friendlyError,
    isUserProductContext,
    normalizeText
  };
});
