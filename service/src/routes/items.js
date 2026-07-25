const {
  buildAllAccountsDisabledError,
  buildDisabledOwnerAccountError,
  buildMissingOwnerAccountError,
  buildNoConnectedOwnerError,
  connectedAccountTokens,
  enabledAccountTokens,
  normalizeOwnerUserId
} = require('../account-client');
const {
  buildPageIdentity,
  hasAnyPageIdentity,
  resolveItemContext,
  resolveQuickItemContext
} = require('../item-context');

const QUICK_CACHE_TTL_MS = 60 * 1000;

async function handleResolve({ req, client, store, clientFactory, readJson }) {
  const body = await readJson(req);
  const pageIdentity = buildPageIdentity(body);
  if (!hasAnyPageIdentity(pageIdentity)) {
    return { statusCode: 400, payload: { error: 'Anúncio não detectado.' } };
  }

  if (store && typeof store.listAccountTokens === 'function' && typeof clientFactory === 'function') {
    return resolveItemContextForConnectedAccounts({
      ownerUserId: body && body.ownerUserId,
      pageIdentity,
      store,
      clientFactory
    });
  }

  return resolveItemContext(client, { pageIdentity, ownerUserId: body && body.ownerUserId });
}

async function handleResolveQuick({ req, client, store, clientFactory, readJson, cache }) {
  const body = await readJson(req);
  const pageIdentity = buildPageIdentity(body);
  if (!hasAnyPageIdentity(pageIdentity)) {
    return { statusCode: 400, payload: { error: 'Anúncio não detectado.' } };
  }

  if (store && typeof store.listAccountTokens === 'function' && typeof clientFactory === 'function') {
    return resolveQuickItemContextForConnectedAccounts({
      ownerUserId: body && body.ownerUserId,
      pageIdentity,
      store,
      clientFactory,
      cache
    });
  }

  return withQuickCache(cache, null, pageIdentity, () => resolveQuickItemContext(client, {
    pageIdentity,
    ownerUserId: body && body.ownerUserId
  }));
}

async function resolveItemContextForConnectedAccounts({ ownerUserId, pageIdentity, store, clientFactory }) {
  const allAccounts = await store.listAccountTokens();
  if (connectedAccountTokens(allAccounts).length && !enabledAccountTokens(allAccounts).length) {
    throw buildAllAccountsDisabledError();
  }
  const accounts = enabledAccountTokens(allAccounts);
  if (!accounts.length) return resolveItemContext(clientFactory(null), { pageIdentity });

  const ownerAccount = findConnectedAccount(connectedAccountTokens(allAccounts), ownerUserId);
  if (ownerUserId) {
    if (!ownerAccount) throw buildMissingOwnerAccountError();
    if (ownerAccount.enabled === false) throw buildDisabledOwnerAccountError();
    const context = await resolveItemContext(clientFactory(ownerAccount), {
      pageIdentity,
      ownerUserId: ownerAccount.user_id
    });
    return Object.assign({}, context, {
      ownerAccount: summarizeOwnerAccount(ownerAccount)
    });
  }

  const rejected = [];
  for (const account of accounts) {
    try {
      const context = await resolveItemContext(clientFactory(account), {
        pageIdentity,
        ownerUserId: account.user_id
      });
      return Object.assign({}, context, {
        ownerAccount: summarizeOwnerAccount(account)
      });
    } catch (err) {
      rejected.push({ account, err });
      if (!isRetryableAccountResolveError(err)) throw err;
    }
  }

  if (pageIdentity.catalogProductId) {
    const err = new Error('Catálogo sem anúncio confirmado. Abra a página do anúncio do vendedor.');
    err.statusCode = 409;
    throw err;
  }

  throw await buildNoConnectedOwnerError({
    rejected,
    disabledAccounts: connectedAccountTokens(allAccounts).filter((account) => account.enabled === false),
    itemId: pageIdentity.urlItemId || pageIdentity.productTriggerItemId || pageIdentity.pdpFilterItemId || pageIdentity.canonicalItemId,
    clientFactory
  });
}

async function resolveQuickItemContextForConnectedAccounts({ ownerUserId, pageIdentity, store, clientFactory, cache }) {
  const allAccounts = await store.listAccountTokens();
  if (connectedAccountTokens(allAccounts).length && !enabledAccountTokens(allAccounts).length) {
    throw buildAllAccountsDisabledError();
  }
  const accounts = enabledAccountTokens(allAccounts);
  if (!accounts.length) {
    return withQuickCache(cache, null, pageIdentity, () => resolveQuickItemContext(clientFactory(null), { pageIdentity }));
  }

  const ownerAccount = findConnectedAccount(connectedAccountTokens(allAccounts), ownerUserId);
  if (ownerUserId) {
    if (!ownerAccount) throw buildMissingOwnerAccountError();
    if (ownerAccount.enabled === false) throw buildDisabledOwnerAccountError();
    const context = await withQuickCache(cache, ownerAccount, pageIdentity, () => resolveQuickItemContext(clientFactory(ownerAccount), {
      pageIdentity,
      ownerUserId: ownerAccount.user_id
    }));
    return withOwnerAccount(context, ownerAccount);
  }

  const attempts = accounts.map(async (account) => {
    const context = await withQuickCache(cache, account, pageIdentity, () => resolveQuickItemContext(clientFactory(account), {
      pageIdentity,
      ownerUserId: account.user_id
    }));
    return withOwnerAccount(context, account);
  });
  try {
    return await Promise.any(attempts);
  } catch (aggregateError) {
    const settled = await Promise.allSettled(attempts);
    const rejected = settled.map((entry, index) => ({
      account: accounts[index],
      err: entry.status === 'rejected' ? entry.reason : aggregateError
    }));

    if (pageIdentity.catalogProductId) {
      const err = new Error('Catálogo sem anúncio confirmado. Abra a página do anúncio do vendedor.');
      err.statusCode = 409;
      throw err;
    }

    throw await buildNoConnectedOwnerError({
      rejected,
      disabledAccounts: connectedAccountTokens(allAccounts).filter((account) => account.enabled === false),
      itemId: primaryItemId(pageIdentity),
      clientFactory
    });
  }
}

function isRetryableAccountResolveError(err) {
  const statusCode = Number(err && err.statusCode ? err.statusCode : 0);
  return statusCode === 401 || statusCode === 403 || statusCode === 404;
}

function summarizeOwnerAccount(account) {
  return {
    user_id: account.user_id,
    nickname: account.nickname || null,
    site_id: account.site_id || null,
    permalink: account.permalink || null,
    connected: true
  };
}

function withOwnerAccount(context, account) {
  return Object.assign({}, stripQuickCacheMetadata(context), {
    ownerAccount: summarizeOwnerAccount(account)
  });
}

function stripQuickCacheMetadata(context) {
  const copy = Object.assign({}, context || {});
  delete copy.cachedAt;
  return copy;
}

function findConnectedAccount(accounts, userId) {
  const normalized = normalizeOwnerUserId(userId);
  if (!normalized) return null;
  return (Array.isArray(accounts) ? accounts : [])
    .find((account) => String(account && account.user_id || '') === normalized) || null;
}

function primaryItemId(identity) {
  return identity.denounceItemId ||
    identity.pdpFilterItemId ||
    identity.urlItemId ||
    identity.canonicalItemId ||
    identity.productTriggerItemId ||
    null;
}

async function withQuickCache(cache, account, pageIdentity, loader) {
  const key = quickCacheKey(account, pageIdentity);
  const cached = cache && typeof cache.get === 'function' ? cache.get(key) : null;
  if (cached) return withQuickPayload(cached, true, cached.cachedAt);

  const context = await loader();
  const payload = withQuickPayload(context, false);
  if (cache && typeof cache.set === 'function') cache.set(key, payload, QUICK_CACHE_TTL_MS);
  return payload;
}

function quickCacheKey(account, identity) {
  return JSON.stringify({
    account: account && account.user_id ? String(account.user_id) : 'default',
    denounceItemId: identity.denounceItemId || '',
    pdpFilterItemId: identity.pdpFilterItemId || '',
    urlItemId: identity.urlItemId || '',
    canonicalItemId: identity.canonicalItemId || '',
    urlUserProductId: identity.urlUserProductId || '',
    productTriggerItemId: identity.productTriggerItemId || '',
    catalogProductId: identity.catalogProductId || ''
  });
}

function withQuickPayload(context, hit = false, cachedAt = Date.now()) {
  return Object.assign({}, stripQuickCacheMetadata(context), {
    quick: true,
    cache: {
      hit: Boolean(hit),
      ageMs: hit ? Math.max(0, Date.now() - Number(cachedAt || 0)) : 0
    }
  });
}

function createItemRouteCache() {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return null;
      }
      return Object.assign({}, entry.value, { cachedAt: entry.createdAt });
    },
    set(key, value, ttlMs) {
      entries.set(key, {
        value: Object.assign({}, value),
        createdAt: Date.now(),
        expiresAt: Date.now() + Math.max(1, Number(ttlMs || 0))
      });
    },
    clear() {
      entries.clear();
    }
  };
}

module.exports = {
  createItemRouteCache,
  handleResolve,
  handleResolveQuick
};
