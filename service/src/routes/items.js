const {
  buildAllAccountsDisabledError,
  buildNoConnectedOwnerError,
  connectedAccountTokens,
  enabledAccountTokens
} = require('../account-client');
const {
  buildPageIdentity,
  hasAnyPageIdentity,
  resolveItemContext
} = require('../item-context');

async function handleResolve({ req, client, store, clientFactory, readJson }) {
  const body = await readJson(req);
  const pageIdentity = buildPageIdentity(body);
  if (!hasAnyPageIdentity(pageIdentity)) {
    return { statusCode: 400, payload: { error: 'Anúncio não detectado.' } };
  }

  if (store && typeof store.listAccountTokens === 'function' && typeof clientFactory === 'function') {
    return resolveItemContextForConnectedAccounts({
      pageIdentity,
      store,
      clientFactory
    });
  }

  return resolveItemContext(client, { pageIdentity });
}

async function resolveItemContextForConnectedAccounts({ pageIdentity, store, clientFactory }) {
  const allAccounts = await store.listAccountTokens();
  if (connectedAccountTokens(allAccounts).length && !enabledAccountTokens(allAccounts).length) {
    throw buildAllAccountsDisabledError();
  }
  const accounts = enabledAccountTokens(allAccounts);
  if (!accounts.length) return resolveItemContext(clientFactory(null), { pageIdentity });

  const rejected = [];
  for (const account of accounts) {
    try {
      const context = await resolveItemContext(clientFactory(account), { pageIdentity });
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

module.exports = {
  handleResolve
};
