function extractItemId(value) {
  return collectItemIdCandidates(value)[0] || null;
}

function collectItemIdCandidates(value) {
  const text = String(value || '');
  const candidates = [];

  collectByPattern(candidates, text, /produto\.mercadolivre\.com\.br\/[^"'<>]*?\b(MLB-?\d{9,13})\b/ig, null, { skipExcludedContext: false });
  collectByPattern(candidates, text, /"item_?id"\s*:\s*"?(MLB-?\d{9,13})"?/ig, null, { skipExcludedContext: false });
  collectByPattern(candidates, text, /"id"\s*:\s*"(MLB-?\d{9,13})"/ig, isLikelyItemContext);

  return Array.from(new Set(candidates.map(normalizeItemId).filter(Boolean)));
}

function normalizeItemId(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = raw.match(/MLB\d{9,13}/);
  return match ? match[0] : null;
}

function pickMode(item) {
  if (item && item.user_product_id && item.family_name) return 'user_product';
  if (item && Array.isArray(item.variations) && item.variations.length) return 'legacy_variations';
  return 'classic';
}

function buildCommitPayload(currentItem, input, options = {}) {
  if (!currentItem || !currentItem.id) throw new Error('Item atual ausente.');
  if (!input || !Array.isArray(input.pictures) || input.pictures.length === 0) {
    const err = new Error('Mantenha pelo menos 1 foto.');
    err.statusCode = 400;
    throw err;
  }

  const pictures = input.pictures.map(normalizePictureRef);
  const payload = { pictures };

  if (Array.isArray(currentItem.variations) && currentItem.variations.length) {
    const incoming = new Map();
    for (const variation of input.variations || []) {
      incoming.set(String(variation.id), variation);
    }

    payload.variations = currentItem.variations.map((variation) => {
      const override = incoming.get(String(variation.id));
      return {
        id: variation.id,
        picture_ids: normalizePictureIds(override ? override.picture_ids : variation.picture_ids)
      };
    });
  }

  validatePictureLimits(payload, options.pictureLimits);
  return payload;
}

function validatePictureLimits(payload, pictureLimits) {
  if (!pictureLimits || typeof pictureLimits !== 'object') return;

  const hasVariationPayload = Array.isArray(payload.variations);
  const maxPicturesPerItem = normalizeLimit(pictureLimits.maxPicturesPerItem);
  if (!hasVariationPayload && maxPicturesPerItem && payload.pictures.length > maxPicturesPerItem) {
    const excess = payload.pictures.length - maxPicturesPerItem;
    const err = new Error(`Limite do anúncio: ${maxPicturesPerItem} fotos. Remova ${excess}.`);
    err.statusCode = 400;
    throw err;
  }

  const maxPicturesPerVariation = normalizeLimit(pictureLimits.maxPicturesPerVariation);
  if (!maxPicturesPerVariation || !hasVariationPayload) return;

  for (const variation of payload.variations) {
    const pictureIds = Array.isArray(variation.picture_ids) ? variation.picture_ids : [];
    if (pictureIds.length <= maxPicturesPerVariation) continue;
    const excess = pictureIds.length - maxPicturesPerVariation;
    const err = new Error(`Limite da variação: ${maxPicturesPerVariation} fotos. Remova ${excess}.`);
    err.statusCode = 400;
    throw err;
  }
}

function normalizePictureRef(value) {
  if (!value || typeof value !== 'object') throw new Error('Foto inválida.');
  if (value.id) return { id: String(value.id).trim() };
  if (value.source) return { source: String(value.source).trim() };
  throw new Error('Foto inválida.');
}

function normalizePictureIds(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function normalizeLimit(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function collectByPattern(candidates, text, pattern, contextGuard, options = {}) {
  for (const match of text.matchAll(pattern)) {
    const raw = match[1] || match[0];
    const context = text.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80);
    if (options.skipExcludedContext !== false && hasExcludedContext(context)) continue;
    if (contextGuard && !contextGuard(context)) continue;
    const itemId = normalizeItemId(raw);
    if (itemId) candidates.push(itemId);
  }
}

function hasExcludedContext(context) {
  return /\b(category_id|categoryId|domain_id|domainId|family_id|familyId|catalog_product_id|catalogProductId|picture_id|pictureId|thumbnail|secure_url|pictures?)\b/i.test(context);
}

function isLikelyItemContext(context) {
  return /\b(item|product|listing|permalink|produto\.mercadolivre)\b/i.test(context);
}

module.exports = {
  buildCommitPayload,
  collectItemIdCandidates,
  extractItemId,
  normalizeItemId,
  pickMode
};
