const { assertOwnedItem } = require('./item-context');
const { resolveFamilyTargets } = require('./bulk-actions');
const { sanitizeError } = require('./errors');

const BULK_SCOPE = 'user_product_family';

async function getDescription(client, itemId) {
  const item = await assertOwnedItem(client, itemId);
  return getExistingDescription(client, item.id);
}

async function upsertDescription(client, itemId, input = {}) {
  const item = await assertOwnedItem(client, itemId);
  const plainText = normalizePlainText(input.plainText);
  return upsertOwnedDescription(client, item, plainText);
}

async function upsertOwnedDescription(client, item, plainText) {
  assertDescriptionEditableItem(item);
  const current = await getExistingDescription(client, item.id);
  const result = current.exists
    ? await client.updateItemDescription(item.id, plainText)
    : await client.createItemDescription(item.id, plainText);

  return {
    ok: true,
    itemId: item.id,
    created: !current.exists,
    description: normalizeDescription(item.id, result, true)
  };
}

async function updateDescriptionFamily(client, itemId, input = {}) {
  if (String(input.scope || BULK_SCOPE) !== BULK_SCOPE) {
    const err = new Error('bulk_scope_not_supported');
    err.statusCode = 400;
    throw err;
  }

  const plainText = normalizePlainText(input.plainText);
  const targets = await resolveFamilyTargets(client, itemId, input);
  const prepared = await mapLimit(targets.items, 4, async (target) => prepareDescriptionTarget(client, target));
  const editableTargets = prepared.filter((target) => target.eligible);
  const editableVariations = editableTargets.filter((target) => !target.current);

  if (!editableVariations.length) {
    const err = new Error('bulk_description_no_editable_variations');
    err.statusCode = 409;
    throw err;
  }

  const results = await mapLimit(prepared, 2, async (target) => {
    if (!target.eligible) return stripPreparedTarget(target);
    try {
      const result = await upsertOwnedDescription(client, target.item, plainText);
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
      return {
        itemId: target.itemId,
        userProductId: target.userProductId || null,
        title: target.title || null,
        current: Boolean(target.current),
        eligible: false,
        status: 'failed',
        reasonCode: err && err.message ? String(err.message) : 'description_target_error',
        statusCode: err && err.statusCode ? err.statusCode : null,
        message: sanitizeError(err)
      };
    }
  });

  return buildDescriptionBulkResponse(targets, results);
}

async function prepareDescriptionTarget(client, target) {
  try {
    const item = await assertOwnedItem(client, target.itemId);
    if (item.catalog_listing) {
      return blockedTarget(target, item, 'catalog_listing_description_read_only', 'Catálogo: descrição bloqueada pelo Mercado Livre.');
    }

    return {
      item,
      itemId: item.id,
      userProductId: target.userProductId || item.user_product_id || null,
      title: target.title || item.title || null,
      current: Boolean(target.current),
      eligible: true,
      status: 'eligible'
    };
  } catch (err) {
    return {
      itemId: target.itemId,
      userProductId: target.userProductId || null,
      title: target.title || null,
      current: Boolean(target.current),
      eligible: false,
      status: 'failed',
      reasonCode: err && err.message ? String(err.message) : 'description_target_error',
      statusCode: err && err.statusCode ? err.statusCode : null,
      message: sanitizeError(err)
    };
  }
}

function blockedTarget(target, item, reasonCode, message) {
  return {
    itemId: item.id,
    userProductId: target.userProductId || item.user_product_id || null,
    title: target.title || item.title || null,
    current: Boolean(target.current),
    eligible: false,
    status: 'blocked',
    reasonCode,
    statusCode: 409,
    message
  };
}

function stripPreparedTarget(target) {
  const output = Object.assign({}, target);
  delete output.item;
  return output;
}

async function getExistingDescription(client, itemId) {
  try {
    const description = await client.getItemDescription(itemId);
    return normalizeDescription(itemId, description, true);
  } catch (err) {
    if (Number(err && err.statusCode || 0) === 404) {
      return normalizeDescription(itemId, null, false);
    }
    throw err;
  }
}

function normalizeDescription(itemId, description, exists) {
  const source = description && typeof description === 'object' ? description : {};
  return {
    itemId,
    exists: Boolean(exists),
    plainText: String(source.plain_text || source.text || ''),
    lastUpdated: source.last_updated || null,
    dateCreated: source.date_created || null
  };
}

function assertDescriptionEditableItem(item) {
  if (item && item.catalog_listing) {
    const err = new Error('catalog_listing_description_read_only');
    err.statusCode = 409;
    throw err;
  }
}

function normalizePlainText(value) {
  const plainText = String(value === undefined || value === null ? '' : value).replace(/\r\n/g, '\n').trim();
  if (!plainText) {
    const err = new Error('description_empty');
    err.statusCode = 400;
    throw err;
  }
  return plainText;
}

function buildDescriptionBulkResponse(targets, results) {
  const entries = Array.isArray(results) ? results : [];
  return {
    ok: true,
    phase: 'commit',
    scope: BULK_SCOPE,
    action: 'description.update',
    source: targets.source,
    counts: {
      total: entries.length,
      eligible: entries.filter((entry) => entry.eligible).length,
      blocked: entries.filter((entry) => entry.status === 'blocked').length,
      applied: entries.filter((entry) => entry.status === 'applied').length,
      skipped: 0,
      failed: entries.filter((entry) => entry.status === 'failed').length
    },
    targets: entries
  };
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

module.exports = {
  getDescription,
  normalizePlainText,
  updateDescriptionFamily,
  upsertDescription
};
