(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OnFramePhotosContextController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createContextController(options) {
    const model = options.model;
    const makeLocalId = options.makeLocalId;

    function project(context) {
      if (!context) throw new Error('Contexto do anúncio indisponível.');
      const selectedVariationId = context.selectedVariationId || null;
      const originalPictures = model
        .selectPicturesForActiveVariation(context, selectedVariationId)
        .map((picture) => model.toDraftPicture(picture, makeLocalId));
      return {
        context,
        ownerUserId: context.ownerAccount && context.ownerAccount.user_id ? context.ownerAccount.user_id : null,
        selectedVariationId,
        originalVariations: model.cloneVariations(context.variations || []),
        variations: model.cloneVariations(context.variations || []),
        originalPictures,
        draftPictures: originalPictures.map(model.clonePicture)
      };
    }

    return { project };
  }

  return { createContextController };
});
