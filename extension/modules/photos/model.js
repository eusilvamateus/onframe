(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OnFramePhotosModel = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function selectPicturesForActiveVariation(context, selectedVariationId) {
    const allPictures = Array.isArray(context && context.pictures) ? context.pictures : [];
    const selected = getSelectedVariation(context && context.variations, selectedVariationId);
    if (!selected || !Array.isArray(selected.picture_ids) || !selected.picture_ids.length) return allPictures;
    const byId = new Map(allPictures.map((picture) => [picture.id, picture]));
    return selected.picture_ids.map((id) => byId.get(id)).filter(Boolean);
  }

  function buildVariationPayload(variations, selectedVariationId, selectedIds) {
    const source = Array.isArray(variations) ? variations : [];
    if (!source.length || !selectedVariationId) return source;
    return source.map((variation) => {
      if (String(variation.id) !== String(selectedVariationId)) return variation;
      return Object.assign({}, variation, { picture_ids: selectedIds });
    });
  }

  function buildItemPicturesPayload(options = {}) {
    const contextPictures = Array.isArray(options.contextPictures) ? options.contextPictures : [];
    const finalSelectedPictures = Array.isArray(options.finalSelectedPictures) ? options.finalSelectedPictures : [];
    const variations = Array.isArray(options.variations) ? options.variations : [];
    const originalPictures = Array.isArray(options.originalPictures) ? options.originalPictures : [];
    const byId = new Map(contextPictures.map((picture) => [String(picture.id || ''), picture]));
    const selection = createPictureSelectionSnapshot(originalPictures, finalSelectedPictures);
    const finalVariationIds = new Set();

    for (const variation of variations) {
      for (const id of variation.picture_ids || []) {
        if (id) finalVariationIds.add(String(id));
      }
    }
    for (const picture of finalSelectedPictures) {
      if (picture.id) byId.set(String(picture.id), picture);
    }

    const orderedIds = [];
    for (const picture of finalSelectedPictures) {
      const id = String(picture.id || '');
      if (id && !orderedIds.includes(id)) orderedIds.push(id);
    }
    for (const variation of variations) {
      for (const id of variation.picture_ids || []) {
        const idText = String(id || '');
        if (idText && !orderedIds.includes(idText)) orderedIds.push(idText);
      }
    }
    for (const picture of contextPictures) {
      const id = String(picture.id || '');
      const stillReferenced = finalVariationIds.has(id);
      if (id && (!selection.removedSelectedIds.has(id) || stillReferenced) && !orderedIds.includes(id)) {
        orderedIds.push(id);
      }
    }

    return orderedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((picture) => picture.id ? { id: picture.id } : { source: picture.source });
  }

  function getPictureLimitState(options = {}) {
    const limits = options.limits || {};
    const selectedVariationId = options.selectedVariationId || null;
    const draftPictures = Array.isArray(options.draftPictures) ? options.draftPictures : [];
    const contextPictures = Array.isArray(options.contextPictures) ? options.contextPictures : [];
    const originalPictures = Array.isArray(options.originalPictures) ? options.originalPictures : [];
    const maxPicturesPerItem = normalizeLimit(limits.maxPicturesPerItem);
    const maxPicturesPerVariation = normalizeLimit(limits.maxPicturesPerVariation);
    const variationCount = draftPictures.length;
    const isVariationEdit = Boolean(selectedVariationId);
    let message = '';

    if (isVariationEdit && maxPicturesPerVariation && variationCount > maxPicturesPerVariation) {
      const excess = variationCount - maxPicturesPerVariation;
      message = `Limite da variação: ${maxPicturesPerVariation} fotos. Remova ${excess}.`;
    }

    if (isVariationEdit && maxPicturesPerVariation) {
      return {
        count: variationCount,
        limit: maxPicturesPerVariation,
        message,
        counterText: `${variationCount}/${maxPicturesPerVariation} fotos`
      };
    }

    if (isVariationEdit) {
      return { count: variationCount, limit: null, message: '', counterText: '' };
    }

    const totalCount = estimateFinalItemPictureCount({ contextPictures, draftPictures, originalPictures });
    if (maxPicturesPerItem && totalCount > maxPicturesPerItem) {
      const excess = totalCount - maxPicturesPerItem;
      message = `Limite do anúncio: ${maxPicturesPerItem} fotos. Remova ${excess}.`;
    }

    if (maxPicturesPerItem) {
      return {
        count: totalCount,
        limit: maxPicturesPerItem,
        message,
        counterText: `${totalCount}/${maxPicturesPerItem} fotos`
      };
    }

    return { count: variationCount, limit: null, message: '', counterText: '' };
  }

  function estimateFinalItemPictureCount(options = {}) {
    const contextPictures = Array.isArray(options.contextPictures) ? options.contextPictures : [];
    const draftPictures = Array.isArray(options.draftPictures) ? options.draftPictures : [];
    const originalPictures = Array.isArray(options.originalPictures) ? options.originalPictures : [];
    if (!contextPictures.length) return draftPictures.length;

    const selection = createPictureSelectionSnapshot(originalPictures, draftPictures);
    const finalIds = new Set();

    for (const picture of contextPictures) {
      const id = String(picture.id || '');
      if (id && !selection.removedSelectedIds.has(id)) finalIds.add(id);
    }

    for (const picture of draftPictures) {
      if (picture.id) finalIds.add(String(picture.id));
      else finalIds.add(picture.localId);
    }

    return finalIds.size;
  }

  function createPictureSelectionSnapshot(originalPictures, selectedPictures) {
    const originalSelectedIds = new Set((originalPictures || []).map(pictureId).filter(Boolean));
    const finalSelectedIds = new Set((selectedPictures || []).map(pictureId).filter(Boolean));
    return {
      originalSelectedIds,
      finalSelectedIds,
      removedSelectedIds: new Set(Array.from(originalSelectedIds).filter((id) => !finalSelectedIds.has(id)))
    };
  }

  function getSelectedVariation(variations, selectedVariationId) {
    const source = Array.isArray(variations) ? variations : [];
    return source.find((variation) => String(variation.id) === String(selectedVariationId)) || null;
  }

  function normalizeLimit(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function toDraftPicture(picture, makeLocalId) {
    const source = picture || {};
    const localId = source.id || (typeof makeLocalId === 'function' ? makeLocalId() : '');
    return Object.assign({ localId, pending: false }, source);
  }

  function clonePicture(picture) {
    return Object.assign({}, picture);
  }

  function cloneVariations(variations) {
    return JSON.parse(JSON.stringify(variations || []));
  }

  function pictureId(picture) {
    return picture && picture.id ? String(picture.id) : '';
  }

  return {
    buildItemPicturesPayload,
    buildVariationPayload,
    clonePicture,
    cloneVariations,
    createPictureSelectionSnapshot,
    estimateFinalItemPictureCount,
    getPictureLimitState,
    getSelectedVariation,
    normalizeLimit,
    pictureId,
    selectPicturesForActiveVariation,
    toDraftPicture
  };
});
