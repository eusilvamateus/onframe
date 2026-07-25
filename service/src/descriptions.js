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
  const results = await mapLimit(targets.items, 2, async (target) => {
    try {
      const result = await upsertDescription(client, target.itemId, { plainText });
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
      blocked: 0,
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
