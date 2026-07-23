const {
  pickMode
} = require('./items');
const { sanitizeError } = require('./errors');

function buildPageIdentity(body) {
  const source = body && typeof body.pageIdentity === 'object' && body.pageIdentity ? body.pageIdentity : {};
  const urlIdentity = parsePageIdentityFromUrl(body && body.url);
  const requestWeakItems = [];
  const requestWeakUserProducts = [];

  if (Array.isArray(body && body.itemCandidates)) requestWeakItems.push(...body.itemCandidates);
  if (body && body.itemId) requestWeakItems.push(body.itemId);
  if (Array.isArray(body && body.userProductCandidates)) requestWeakUserProducts.push(...body.userProductCandidates);
  if (body && body.userProductId) requestWeakUserProducts.push(body.userProductId);

  const explicit = normalizePageIdentity(source);
  const identity = normalizePageIdentity({
    denounceItemId: explicit.denounceItemId || urlIdentity.denounceItemId,
    urlItemId: explicit.urlItemId || urlIdentity.urlItemId,
    canonicalItemId: explicit.canonicalItemId,
    urlUserProductId: explicit.urlUserProductId || urlIdentity.urlUserProductId,
    pdpFilterItemId: explicit.pdpFilterItemId || urlIdentity.pdpFilterItemId,
    productTriggerItemId: explicit.productTriggerItemId || urlIdentity.productTriggerItemId,
    catalogProductId: explicit.catalogProductId || urlIdentity.catalogProductId,
    weakItemCandidates: [
      ...explicit.weakItemCandidates,
      ...requestWeakItems
    ],
    weakUserProductCandidates: [
      ...explicit.weakUserProductCandidates,
      ...requestWeakUserProducts
    ]
  });

  identity.weakItemCandidates = identity.weakItemCandidates.filter((itemId) => !strongItemIds(identity).includes(itemId));
  identity.weakUserProductCandidates = identity.weakUserProductCandidates.filter((userProductId) => userProductId !== identity.urlUserProductId);
  return identity;
}

async function resolveItemContext(client, options) {
  const config = options || {};
  const pageIdentity = normalizePageIdentity(config.pageIdentity || {});
  if (hasAnyPageIdentity(pageIdentity)) return resolveStrictPageIdentity(client, pageIdentity);

  const err = new Error('Anúncio não detectado.');
  err.statusCode = 400;
  throw err;
}

async function resolveStrictPageIdentity(client, identity) {
  const itemTargets = selectStrongItemTargets(identity);
  const rejected = [];
  for (const itemTarget of itemTargets) {
    try {
      const context = await loadItemContext(client, itemTarget.itemId);
      assertContextMatchesPageIdentity(context, identity, itemTarget.source);
      context.pageIdentity = identity;
      context.resolvedFrom = itemTarget.source;
      if (rejected.length) context.rejectedItemCandidates = rejected;
      return context;
    } catch (err) {
      const statusCode = err && err.statusCode ? err.statusCode : 500;
      rejected.push({ itemId: itemTarget.itemId, source: itemTarget.source, statusCode, error: sanitizeError(err) });
      if (!isRetryableItemTargetError(err)) throw err;
    }
  }

  if (identity.urlUserProductId) {
    const context = await loadFirstUserProductItemContext(client, [identity.urlUserProductId]);
    context.pageIdentity = identity;
    context.resolvedFrom = 'url_user_product';
    if (rejected.length) context.rejectedItemCandidates = rejected;
    return context;
  }

  if (rejected.length) throw buildUnresolvedItemTargetsError(rejected);

  if (identity.catalogProductId) {
    const err = new Error('Catálogo sem anúncio confirmado. Abra a página do anúncio do vendedor.');
    err.statusCode = 409;
    throw err;
  }

  if (identity.weakItemCandidates.length || identity.weakUserProductCandidates.length) {
    const err = new Error('Não consegui confirmar este anúncio. Recarregue a página.');
    err.statusCode = 409;
    throw err;
  }

  const err = new Error('Anúncio não detectado.');
  err.statusCode = 400;
  throw err;
}

function selectStrongItemTargets(identity) {
  if (identity.urlItemId && identity.canonicalItemId && identity.urlItemId !== identity.canonicalItemId) {
    const err = new Error('Não consegui confirmar este anúncio. Recarregue a página.');
    err.statusCode = 409;
    throw err;
  }

  const targets = [];
  addStrongItemTarget(targets, 'denounce', identity.denounceItemId);
  addStrongItemTarget(targets, 'pdp_filter', identity.pdpFilterItemId);
  addStrongItemTarget(targets, 'url_item', identity.urlItemId);
  if (!identity.urlUserProductId) addStrongItemTarget(targets, 'canonical_item', identity.canonicalItemId);
  addStrongItemTarget(targets, 'product_trigger', identity.productTriggerItemId);
  return targets;
}

function addStrongItemTarget(targets, source, itemId) {
  if (!itemId || targets.some((target) => target.itemId === itemId)) return;
  targets.push({ source, itemId });
}

function isRetryableItemTargetError(err) {
  const statusCode = Number(err && err.statusCode ? err.statusCode : 0);
  return statusCode === 401 || statusCode === 403 || statusCode === 404;
}

function buildUnresolvedItemTargetsError(rejected) {
  const entries = Array.isArray(rejected) ? rejected : [];
  const statusCodes = entries.map((entry) => Number(entry.statusCode || 0)).filter(Boolean);
  const statusCode = statusCodes.includes(403) ? 403 : statusCodes.includes(401) ? 401 : statusCodes.includes(404) ? 404 : 409;
  const err = new Error(statusCode === 404
    ? 'Item nao encontrado.'
    : statusCode === 403
      ? 'Este anuncio nao pertence ao seller autenticado.'
      : 'Não consegui confirmar este anúncio. Recarregue a página.');
  err.statusCode = statusCode;
  err.rejectedItemCandidates = entries;
  return err;
}

function assertContextMatchesPageIdentity(context, identity, resolvedFrom) {
  if (resolvedFrom === 'product_trigger' || resolvedFrom === 'pdp_filter') return;
  const item = context && context.item ? context.item : {};
  if (!identity.urlUserProductId || !item.user_product_id) return;
  if (String(item.user_product_id).toUpperCase() === identity.urlUserProductId) return;

  const err = new Error('A página mudou de anúncio. Recarregue e tente de novo.');
  err.statusCode = 409;
  throw err;
}

async function loadFirstUserProductItemContext(client, userProductIds) {
  const rejected = [];
  const me = await client.getMe();

  for (const userProductId of userProductIds) {
    try {
      const search = await client.searchItemsByUserProduct(me.id, userProductId);
      const ids = Array.isArray(search.results) ? search.results : [];
      if (!ids.length) {
        rejected.push({ userProductId, statusCode: 404, error: 'Nenhum anuncio encontrado para este user_product.' });
        continue;
      }
      const { contexts, rejected: rejectedItems } = await loadOwnedItemContextCandidates(client, ids);
      rejected.push(...rejectedItems);
      const exactContexts = contexts.filter((context) => isExactUserProductContext(context, userProductId));
      const context = selectBestUserProductItemContext(exactContexts, userProductId);
      if (!context) continue;
      context.resolvedFromUserProductId = userProductId;
      if (rejected.length) context.rejectedUserProductCandidates = rejected;
      return context;
    } catch (err) {
      const statusCode = err && err.statusCode ? err.statusCode : 500;
      rejected.push({ userProductId, statusCode, error: sanitizeError(err) });
      if (![403, 404].includes(statusCode)) throw err;
    }
  }

  const err = new Error('Nenhum anuncio encontrado para o user_product da pagina.');
  err.statusCode = 404;
  throw err;
}

async function loadOwnedItemContextCandidates(client, candidates) {
  const contexts = [];
  const rejected = [];
  for (const itemId of candidates) {
    try {
      contexts.push(await loadItemContext(client, itemId));
    } catch (err) {
      const statusCode = err && err.statusCode ? err.statusCode : 500;
      rejected.push({ itemId, statusCode, error: sanitizeError(err) });
      if (![403, 404].includes(statusCode)) throw err;
    }
  }
  return { contexts, rejected };
}

function selectBestUserProductItemContext(contexts, userProductId) {
  return contexts
    .map((context, index) => ({
      context,
      index,
      score: scoreUserProductItemContext(context, userProductId)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.context)[0] || null;
}

function isExactUserProductContext(context, userProductId) {
  const item = context && context.item ? context.item : {};
  return String(item.user_product_id || '').toUpperCase() === String(userProductId || '').toUpperCase();
}

function scoreUserProductItemContext(context, userProductId) {
  const item = context && context.item ? context.item : {};
  const tags = new Set(Array.isArray(item.tags) ? item.tags.map((tag) => String(tag || '').toLowerCase()) : []);
  const status = String(item.status || '').toLowerCase();
  let score = 0;
  if (String(item.user_product_id || '').toUpperCase() === String(userProductId || '').toUpperCase()) score += 100;
  if (status === 'active') score += 80;
  if (tags.has('user_product_listing')) score += 40;
  if (status === 'closed') score -= 100;
  if (tags.has('variations_migration_source')) score -= 80;
  if (item.catalog_listing) score -= 10;
  return score;
}

async function loadItemContext(client, itemId) {
  const item = await assertOwnedItem(client, itemId);
  let userProduct = null;
  let family = null;
  const pictureLimits = await loadPictureLimits(client, item);
  const summarizedItem = summarizeItem(item);

  if (item.user_product_id) {
    try {
      userProduct = await client.getUserProduct(item.user_product_id);
      if (userProduct && userProduct.family_id) {
        family = await client.getUserProductFamily(item.site_id, userProduct.family_id);
      }
    } catch (err) {
      userProduct = { error: sanitizeError(err) };
    }
  }

  return {
    mode: pickMode(item),
    item: summarizedItem,
    capabilities: summarizeCapabilities(summarizedItem),
    userProduct,
    family,
    pictureLimits,
    pictures: Array.isArray(item.pictures) ? item.pictures : [],
    variations: Array.isArray(item.variations) ? item.variations : []
  };
}

async function loadPictureLimits(client, item) {
  const empty = {
    maxPicturesPerItem: null,
    maxPicturesPerVariation: null,
    source: null
  };

  if (!item || !item.category_id || typeof client.getCategory !== 'function') return empty;

  try {
    const category = await client.getCategory(item.category_id);
    return summarizePictureLimits(category);
  } catch (err) {
    return Object.assign({}, empty, {
      source: 'category_settings_unavailable',
      error: sanitizeError(err)
    });
  }
}

function summarizePictureLimits(category) {
  const settings = category && category.settings ? category.settings : {};
  const maxPicturesPerItem = normalizePositiveInteger(settings.max_pictures_per_item);
  const maxPicturesPerVariation = normalizePositiveInteger(settings.max_pictures_per_item_var);
  return {
    maxPicturesPerItem,
    maxPicturesPerVariation,
    source: maxPicturesPerItem || maxPicturesPerVariation ? 'category_settings' : null
  };
}

async function assertOwnedItem(client, itemId) {
  const [item, me] = await Promise.all([client.getItem(itemId), client.getMe()]);
  if (!item || !item.id) {
    const err = new Error('Item nao encontrado.');
    err.statusCode = 404;
    throw err;
  }
  if (String(item.seller_id) !== String(me.id)) {
    const err = new Error('Este anuncio nao pertence ao seller autenticado.');
    err.statusCode = 403;
    throw err;
  }
  return item;
}

function assertEditablePicturesItem(item) {
  if (item && item.catalog_listing) {
    const err = new Error('catalog_listing_pictures_read_only');
    err.statusCode = 409;
    throw err;
  }
  if (isClosedWithBids(item)) {
    const err = new Error('item_closed_with_bids');
    err.statusCode = 409;
    throw err;
  }
}

function isClosedWithBids(item) {
  return Boolean(item && String(item.status || '').toLowerCase() === 'closed' && item.has_bids === true);
}

function summarizePictureEditability(item) {
  if (item && item.catalog_listing) {
    return {
      editable: false,
      reason: 'catalog_listing',
      message: 'Catálogo: fotos bloqueadas pelo Mercado Livre.'
    };
  }
  if (isClosedWithBids(item)) {
    return {
      editable: false,
      reason: 'closed_with_bids',
      message: 'Anúncio encerrado: fotos bloqueadas pelo Mercado Livre.'
    };
  }
  return {
    editable: true,
    reason: null,
    message: null
  };
}

function findItemPicture(item, pictureId) {
  const id = String(pictureId || '');
  if (!id) return null;
  return (Array.isArray(item && item.pictures) ? item.pictures : [])
    .find((picture) => String(picture.id || '') === id) || null;
}

function summarizeItem(item) {
  const pictureEditability = summarizePictureEditability(item);
  return {
    id: item.id,
    title: item.title,
    family_name: item.family_name || null,
    seller_id: item.seller_id,
    category_id: item.category_id,
    site_id: item.site_id,
    status: item.status,
    tags: item.tags || [],
    permalink: item.permalink,
    user_product_id: item.user_product_id || null,
    family_id: item.family_id || null,
    has_bids: Boolean(item.has_bids),
    catalog_listing: Boolean(item.catalog_listing),
    picturesEditable: pictureEditability.editable,
    pictureEditability,
    pictures: item.pictures || [],
    variations: item.variations || []
  };
}

function summarizeCapabilities(item) {
  const pictureEditability = item && item.pictureEditability ? item.pictureEditability : {};
  return {
    pictures: {
      editable: Boolean(item && item.picturesEditable),
      reason: pictureEditability.reason || null,
      message: pictureEditability.message || null
    },
    pricing: {
      editable: true,
      reason: null,
      message: null
    },
    promotions: {
      editable: true,
      reason: null,
      message: null
    }
  };
}

function normalizeUserProductId(value) {
  const match = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').match(/MLBU\d{6,}/);
  return match ? match[0] : null;
}

function normalizeStrongItemId(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = raw.match(/MLB\d{6,13}/);
  return match ? match[0] : null;
}

function normalizePageIdentity(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    denounceItemId: normalizeStrongItemId(source.denounceItemId),
    urlItemId: normalizeStrongItemId(source.urlItemId),
    canonicalItemId: normalizeStrongItemId(source.canonicalItemId),
    urlUserProductId: normalizeUserProductId(source.urlUserProductId),
    pdpFilterItemId: normalizeStrongItemId(source.pdpFilterItemId),
    productTriggerItemId: normalizeStrongItemId(source.productTriggerItemId),
    catalogProductId: normalizeStrongItemId(source.catalogProductId),
    weakItemCandidates: normalizeUnique(source.weakItemCandidates, normalizeStrongItemId),
    weakUserProductCandidates: normalizeUnique(source.weakUserProductCandidates, normalizeUserProductId)
  };
}

function parsePageIdentityFromUrl(value) {
  const url = String(value || '');
  return normalizePageIdentity({
    denounceItemId: null,
    urlItemId: extractProductUrlItemId(url),
    urlUserProductId: extractUrlUserProductId(url),
    pdpFilterItemId: extractPdpFilterItemId(url),
    productTriggerItemId: extractProductTriggerItemId(url),
    catalogProductId: extractCatalogProductId(url)
  });
}

function extractProductUrlItemId(value) {
  const match = String(value || '').match(/produto\.mercadolivre\.com\.br\/[^"'<>]*?\b(MLB-?\d{9,13})\b/i);
  return match ? normalizeStrongItemId(match[1]) : null;
}

function extractUrlUserProductId(value) {
  const match = String(value || '').match(/\/up\/(MLBU\d{6,})/i);
  return match ? normalizeUserProductId(match[1]) : null;
}

function extractProductTriggerItemId(value) {
  try {
    const parsed = new URL(String(value || ''), 'https://www.mercadolivre.com.br');
    return normalizeStrongItemId(parsed.searchParams.get('product_trigger_id'));
  } catch (e) {
    return null;
  }
}

function extractCatalogProductId(value) {
  const match = String(value || '').match(/mercadolivre\.com\.br\/[^?#]+\/(?:p|up)\/(MLB\d{6,13}|MLBU\d{6,})/i);
  if (!match || /^MLBU/i.test(match[1])) return null;
  return normalizeStrongItemId(match[1]);
}

function normalizeUnique(values, normalizer) {
  const output = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizer(value);
    if (normalized && !output.includes(normalized)) output.push(normalized);
  }
  return output;
}

function strongItemIds(identity) {
  return [
    identity.denounceItemId,
    identity.urlItemId,
    identity.canonicalItemId,
    identity.pdpFilterItemId,
    identity.productTriggerItemId,
    identity.catalogProductId
  ].filter(Boolean);
}

function hasAnyPageIdentity(identity) {
  return Boolean(
    identity.denounceItemId ||
    identity.urlItemId ||
    identity.canonicalItemId ||
    identity.urlUserProductId ||
    identity.pdpFilterItemId ||
    identity.productTriggerItemId ||
    identity.catalogProductId ||
    identity.weakItemCandidates.length ||
    identity.weakUserProductCandidates.length
  );
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function extractPdpFilterItemId(value) {
  try {
    const parsed = new URL(String(value || ''), 'https://www.mercadolivre.com.br');
    const filter = parsed.searchParams.get('pdp_filters') || '';
    const match = filter.match(/\bitem_id:?(MLB\d{6,13})\b/i);
    return match ? normalizeStrongItemId(match[1]) : null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  assertEditablePicturesItem,
  assertOwnedItem,
  buildPageIdentity,
  findItemPicture,
  hasAnyPageIdentity,
  loadPictureLimits,
  resolveItemContext,
  summarizeItem
};
