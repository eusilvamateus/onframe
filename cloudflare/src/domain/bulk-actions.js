const { assertOwnedItem } = require('./item-context');
const { sanitizeError } = require('./errors');
const { previewStandardPriceUpdate, updateStandardPrice } = require('./pricing');
const { createOffer, deleteOffer, previewOfferAction, updateOffer } = require('./promotions');

const BULK_SCOPE = 'user_product_family';
const BULK_ITEM_STATUSES = ['active', 'paused'];
const CONCURRENCY = 4;
const COMMIT_BATCH_SIZE = 3;
const PROMOTION_COMMIT_BATCH_SIZE = 2;

async function buildBulkPreview(client, itemId, input = {}) {
  const operation = normalizeOperation(input);
  const targets = await resolveFamilyTargets(client, itemId, input);
  const results = await mapLimit(targets.items, CONCURRENCY, (target) => previewTarget(client, operation, target));
  return buildBulkResponse('preview', operation, targets, results);
}

async function commitBulkAction(client, itemId, input = {}) {
  const operation = normalizeOperation(input);
  const hasTargetSelection = Array.isArray(input.targetItemIds);
  const commitPromotionDirectly = operation.type.indexOf('promotion.offer.') === 0;
  const selected = normalizeTargetItemIds(input.targetItemIds);
  if ((!commitPromotionDirectly && !selected.length) || (hasTargetSelection && !selected.length)) {
    const err = new Error('bulk_missing_targets');
    err.statusCode = 400;
    throw err;
  }

  const targets = await resolveFamilyTargets(client, itemId, input);
  const selectedSet = new Set(selected);
  const candidates = hasTargetSelection
    ? targets.items.filter((target) => selectedSet.has(target.itemId))
    : targets.items;
  if (hasTargetSelection && !candidates.length) {
    const err = new Error('bulk_targets_not_found');
    err.statusCode = 400;
    throw err;
  }

  const batchSize = commitPromotionDirectly ? PROMOTION_COMMIT_BATCH_SIZE : COMMIT_BATCH_SIZE;
  const batch = candidates.slice(0, batchSize);
  const remainingTargetItemIds = candidates.slice(batchSize).map((target) => target.itemId);
  const results = await mapLimit(batch, 2, async (target) => {
    if (commitPromotionDirectly) {
      try {
        const result = await commitTarget(client, operation, target);
        return {
          itemId: target.itemId,
          userProductId: target.userProductId || null,
          title: target.title || null,
          current: Boolean(target.current),
          eligible: true,
          status: 'applied',
          result
        };
      } catch (err) {
        if (err && err.accepted) return targetPendingConfirmation(target, err);
        return targetError(target, err, 'failed');
      }
    }

    const preview = await previewTarget(client, operation, target);
    if (!preview.eligible) {
      return Object.assign({}, preview, { status: 'skipped' });
    }
    try {
      const result = await commitTarget(client, operation, target);
      return {
        itemId: target.itemId,
        userProductId: target.userProductId,
        title: preview.title || target.title || null,
        eligible: true,
        status: 'applied',
        result
      };
    } catch (err) {
      return targetError(target, err, 'failed');
    }
  });

  return buildBulkResponse('commit', operation, targets, results, remainingTargetItemIds);
}

async function resolveFamilyTargets(client, itemId, input = {}) {
  if (String(input.scope || BULK_SCOPE) !== BULK_SCOPE) {
    const err = new Error('bulk_scope_not_supported');
    err.statusCode = 400;
    throw err;
  }

  const item = await resolveSourceItem(client, itemId);
  if (!item.user_product_id || !item.family_name) {
    const err = new Error('bulk_requires_user_product_family');
    err.statusCode = 409;
    throw err;
  }

  const userProduct = await client.getUserProduct(item.user_product_id);
  const familyId = (userProduct && userProduct.family_id) || item.family_id;
  if (!familyId) {
    const err = new Error('bulk_family_not_found');
    err.statusCode = 409;
    throw err;
  }

  const family = await client.getUserProductFamily(item.site_id, familyId);
  const familyUserProductIds = extractUserProductIds(family);
  if (!familyUserProductIds.length) {
    const err = new Error('bulk_family_shape_unknown');
    err.statusCode = 409;
    throw err;
  }

  const userProductIds = unique([item.user_product_id].concat(familyUserProductIds));
  const search = await searchItemsByStatuses(client, item.seller_id, userProductIds.join(','), 100, true);
  const itemIds = search.itemIds;
  if (!itemIds.length) {
    const err = new Error('bulk_family_without_editable_items');
    err.statusCode = 404;
    throw err;
  }

  const items = itemIds.map((targetItemId) => ({
    itemId: targetItemId,
    userProductId: null,
    title: null,
    status: search.statusByItemId.get(String(targetItemId)) || null,
    current: String(targetItemId) === String(item.id)
  }));

  return {
    source: {
      itemId: item.id,
      userProductId: item.user_product_id,
      familyId,
      familyName: item.family_name || null,
      sellerId: item.seller_id,
      siteId: item.site_id || null
    },
    family,
    userProductIds,
    items: items.filter(Boolean)
  };
}

async function resolveSourceItem(client, subjectId) {
  const id = String(subjectId || '')
    .trim()
    .toUpperCase();
  if (!/^MLBU\d+$/.test(id)) return assertOwnedItem(client, subjectId);

  const me = await client.getMe();
  const search = await searchItemsByStatuses(client, me.id, id, 1);
  const itemId = search.itemIds[0] || null;
  if (!itemId) {
    const err = new Error('Nenhum anuncio ativo ou pausado encontrado para este user_product.');
    err.statusCode = 404;
    throw err;
  }
  return assertOwnedItem(client, itemId);
}

async function searchItemsByStatuses(client, sellerId, userProductIds, limit, fetchAll = false) {
  const searches = await Promise.all(
    BULK_ITEM_STATUSES.map(async (status) => ({
      status,
      itemIds: fetchAll
        ? await searchAllItemsByUserProduct(client, sellerId, userProductIds, status)
        : extractSearchResults(await client.searchItemsByUserProduct(sellerId, userProductIds, { status, limit }))
    }))
  );
  const statusByItemId = new Map();
  searches.forEach(({ status, itemIds }) => {
    itemIds.forEach((itemId) => {
      const normalizedId = String(itemId);
      if (!statusByItemId.has(normalizedId)) statusByItemId.set(normalizedId, status);
    });
  });
  return {
    itemIds: Array.from(statusByItemId.keys()),
    statusByItemId
  };
}

async function searchAllItemsByUserProduct(client, sellerId, userProductIds, status) {
  const limit = 100;
  const itemIds = new Set();
  let offset = 0;
  let useScan = false;

  for (let page = 0; page < 1000; page += 1) {
    const options = { status, limit };
    if (offset > 0) options.offset = offset;
    const response = await client.searchItemsByUserProduct(sellerId, userProductIds, options);
    const results = extractSearchResults(response);
    results.forEach((itemId) => itemIds.add(String(itemId)));
    const totalValue = response && response.paging && response.paging.total;
    const total =
      typeof totalValue === 'number' || (typeof totalValue === 'string' && totalValue.trim())
        ? Number(totalValue)
        : NaN;

    if (Number.isFinite(total) && total > 1000) {
      useScan = true;
      break;
    }
    if (results.length < limit || (Number.isFinite(total) && offset + results.length >= total)) {
      return Array.from(itemIds);
    }
    offset += results.length;
    if (offset >= 1000) {
      useScan = true;
      break;
    }
  }

  if (!useScan) throw bulkSearchError('bulk_item_search_page_limit');

  itemIds.clear();
  let response = await client.searchItemsByUserProduct(sellerId, userProductIds, {
    status,
    limit,
    search_type: 'scan'
  });
  let scrollId = response && response.scroll_id;
  let page = 0;

  while (true) {
    const results = extractSearchResults(response);
    results.forEach((itemId) => itemIds.add(String(itemId)));
    if (!scrollId) {
      const scanTotalValue = response && response.paging && response.paging.total;
      const scanTotal =
        typeof scanTotalValue === 'number' || (typeof scanTotalValue === 'string' && scanTotalValue.trim())
          ? Number(scanTotalValue)
          : NaN;
      if (
        (Number.isFinite(scanTotal) && scanTotal > itemIds.size) ||
        (!Number.isFinite(scanTotal) && results.length >= limit)
      ) {
        throw bulkSearchError('bulk_item_search_scroll_unavailable');
      }
      return Array.from(itemIds);
    }
    if (page >= 999) throw bulkSearchError('bulk_item_search_page_limit');
    page += 1;
    response = await client.searchItemsByUserProduct(sellerId, userProductIds, {
      status,
      limit,
      search_type: 'scan',
      scroll_id: scrollId
    });
    scrollId = response && response.scroll_id;
  }
}

function extractSearchResults(response) {
  return Array.isArray(response && response.results) ? response.results : [];
}

function bulkSearchError(code) {
  const err = new Error(code);
  err.statusCode = 502;
  return err;
}

async function previewTarget(client, operation, target) {
  try {
    const preview =
      operation.type === 'pricing.standard.update'
        ? await previewStandardPriceUpdate(client, target.itemId, operation.payload)
        : await previewOfferAction(client, target.itemId, operation.promotionAction, operation.payload);
    return {
      itemId: target.itemId,
      userProductId: target.userProductId || (preview.item && preview.item.user_product_id) || null,
      title: target.title || (preview.item && preview.item.title) || null,
      current: Boolean(target.current),
      eligible: true,
      status: 'eligible',
      preview
    };
  } catch (err) {
    return targetError(target, err, 'blocked');
  }
}

async function commitTarget(client, operation, target) {
  if (operation.type === 'pricing.standard.update') {
    return updateStandardPrice(client, target.itemId, operation.payload);
  }
  if (operation.promotionAction === 'create') {
    return createOffer(client, target.itemId, operation.payload);
  }
  if (operation.promotionAction === 'update') {
    return updateOffer(client, target.itemId, operation.payload);
  }
  if (operation.promotionAction === 'delete') {
    return deleteOffer(client, target.itemId, operation.payload);
  }
  const err = new Error('bulk_action_not_supported');
  err.statusCode = 400;
  throw err;
}

function buildBulkResponse(phase, operation, targets, results, remainingTargetItemIds = []) {
  const entries = Array.isArray(results) ? results : [];
  const continuation = normalizeTargetItemIds(remainingTargetItemIds);
  return {
    ok: true,
    phase,
    scope: BULK_SCOPE,
    action: operation.type,
    source: targets.source,
    counts: {
      total: entries.length,
      eligible: entries.filter((entry) => entry.eligible).length,
      blocked: entries.filter((entry) => entry.status === 'blocked').length,
      applied: entries.filter((entry) => entry.status === 'applied').length,
      skipped: entries.filter((entry) => entry.status === 'skipped').length,
      failed: entries.filter((entry) => entry.status === 'failed').length,
      pending: entries.filter((entry) => entry.status === 'pending_confirmation').length
    },
    continuation: continuation.length ? { targetItemIds: continuation } : null,
    targets: entries
  };
}

function normalizeOperation(input) {
  const action = String(input.action || '').trim();
  const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
  if (action === 'pricing.standard.update') return { type: action, payload };
  const promotionMatch = action.match(/^promotion\.offer\.(create|update|delete)$/);
  if (promotionMatch) {
    return {
      type: action,
      promotionAction: promotionMatch[1],
      payload
    };
  }
  const err = new Error('bulk_action_not_supported');
  err.statusCode = 400;
  throw err;
}

function normalizeTargetItemIds(values) {
  return unique(
    (Array.isArray(values) ? values : [])
      .map((value) =>
        String(value || '')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
      )
      .filter((value) => /^MLB\d{6,13}$/.test(value))
  );
}

function extractUserProductIds(value) {
  const found = [];
  visit(value, (candidate) => {
    const match = String(candidate || '')
      .toUpperCase()
      .match(/\bMLBU\d{6,}\b/);
    if (match) found.push(match[0]);
  });
  return unique(found);
}

function visit(value, onString) {
  if (!value) return;
  if (typeof value === 'string') {
    onString(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => visit(entry, onString));
    return;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach((key) => visit(value[key], onString));
  }
}

function targetError(target, err, status) {
  return {
    itemId: target.itemId,
    userProductId: target.userProductId || null,
    title: target.title || null,
    current: Boolean(target.current),
    eligible: false,
    status,
    reasonCode: err && err.message ? String(err.message) : 'bulk_target_error',
    statusCode: err && err.statusCode ? err.statusCode : null,
    message: sanitizeError(err)
  };
}

function targetPendingConfirmation(target, err) {
  const pending = {
    itemId: target.itemId,
    userProductId: target.userProductId || null,
    title: target.title || null,
    current: Boolean(target.current),
    eligible: true,
    status: 'pending_confirmation',
    reasonCode: err && err.message ? String(err.message) : 'promotion_change_not_confirmed',
    statusCode: err && err.statusCode ? err.statusCode : null,
    message: 'O Mercado Livre aceitou a alteração e ainda está confirmando o novo estado.',
    result: err && err.acceptedResult ? err.acceptedResult : null
  };
  Object.defineProperty(pending, '_reconciliation', {
    configurable: false,
    enumerable: false,
    value: {
      payload: err && err.verificationPayload ? err.verificationPayload : null,
      result: err && err.acceptedResult ? err.acceptedResult : null
    },
    writable: false
  });
  return pending;
}

async function mapLimit(items, limit, iteratee) {
  const input = Array.isArray(items) ? items : [];
  const output = new Array(input.length);
  let index = 0;
  async function worker() {
    while (index < input.length) {
      const current = index;
      index += 1;
      output[current] = await iteratee(input[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, input.length) }, worker));
  return output;
}

function unique(values) {
  const seen = new Set();
  const output = [];
  for (const value of values || []) {
    const normalized = String(value || '')
      .trim()
      .toUpperCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

module.exports = {
  buildBulkPreview,
  commitBulkAction,
  resolveFamilyTargets
};
