function connectedAccountTokens(accounts) {
  return (Array.isArray(accounts) ? accounts : [])
    .filter((account) => account && account.refresh_token);
}

function enabledAccountTokens(accounts) {
  return connectedAccountTokens(accounts)
    .filter((account) => account.enabled !== false);
}

async function resolveItemClient({ itemId, ownerUserId, store, client, clientFactory }) {
  if (!store || typeof clientFactory !== 'function') return client;

  const explicitOwner = normalizeUserId(ownerUserId);
  if (explicitOwner) {
    const account = await readConnectedAccount(store, explicitOwner);
    if (!account) {
      const err = new Error('Conta conectada não encontrada para este anúncio.');
      err.statusCode = 403;
      throw err;
    }
    if (account.enabled === false) {
      const err = new Error('Esta conta está desativada no OnFrame. Ative a conta para editar este anúncio.');
      err.statusCode = 403;
      err.disabledAccount = true;
      throw err;
    }
    return clientFactory(account);
  }

  if (typeof store.listAccountTokens !== 'function') return client;
  const allAccounts = await store.listAccountTokens();
  if (connectedAccountTokens(allAccounts).length && !enabledAccountTokens(allAccounts).length) {
    throw buildAllAccountsDisabledError();
  }
  const accounts = enabledAccountTokens(allAccounts);
  if (!accounts.length) return client;

  const rejected = [];
  for (const account of accounts) {
    const scopedClient = clientFactory(account);
    try {
      await assertClientOwnsItem(scopedClient, itemId);
      return scopedClient;
    } catch (err) {
      rejected.push({ account, err });
      if (!isRetryableOwnerLookupError(err)) throw err;
    }
  }

  throw await buildNoConnectedOwnerError({
    rejected,
    disabledAccounts: connectedAccountTokens(allAccounts).filter((account) => account.enabled === false),
    itemId,
    clientFactory
  });
}

async function readConnectedAccount(store, userId) {
  if (!store || typeof store.readAccount !== 'function') return null;
  const account = await store.readAccount(userId);
  return account && account.refresh_token ? account : null;
}

async function assertClientOwnsItem(client, itemId) {
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

function isRetryableOwnerLookupError(err) {
  const statusCode = Number(err && err.statusCode ? err.statusCode : 0);
  return statusCode === 401 || statusCode === 403 || statusCode === 404;
}

async function buildNoConnectedOwnerError(input) {
  const rejected = Array.isArray(input) ? input : input && Array.isArray(input.rejected) ? input.rejected : [];
  const disabledAccounts = input && Array.isArray(input.disabledAccounts) ? input.disabledAccounts : [];
  const itemId = input && input.itemId ? input.itemId : '';
  const clientFactory = input && input.clientFactory ? input.clientFactory : null;
  if (disabledAccounts.length && itemId && clientFactory && await disabledAccountOwnsItem(disabledAccounts, itemId, clientFactory)) {
    const err = new Error('Esta conta está desativada no OnFrame. Ative a conta para editar este anúncio.');
    err.statusCode = 403;
    err.disabledAccount = true;
    return err;
  }
  const authErrors = rejected.filter((entry) => Number(entry.err && entry.err.statusCode) === 401);
  const err = new Error(authErrors.length === rejected.length
    ? 'Conta desconectada. Clique em Conectar.'
    : 'Este anúncio não pertence a nenhuma conta conectada no OnFrame.');
  err.statusCode = authErrors.length === rejected.length ? 401 : 403;
  err.rejectedAccounts = rejected.map((entry) => ({
    user_id: entry.account && entry.account.user_id ? entry.account.user_id : null,
    statusCode: entry.err && entry.err.statusCode ? entry.err.statusCode : 500
  }));
  return err;
}

async function disabledAccountOwnsItem(accounts, itemId, clientFactory) {
  for (const account of accounts) {
    try {
      await assertClientOwnsItem(clientFactory(account), itemId);
      return true;
    } catch (err) {
      if (!isRetryableOwnerLookupError(err)) throw err;
    }
  }
  return false;
}

function buildAllAccountsDisabledError() {
  const err = new Error('Nenhuma conta habilitada para detectar anúncios.');
  err.statusCode = 403;
  err.disabledAccount = true;
  return err;
}

function normalizeUserId(value) {
  const text = String(value || '').trim();
  return /^\d+$/.test(text) ? text : '';
}

function ownerUserIdFromUrl(url) {
  return normalizeUserId(url && url.searchParams ? url.searchParams.get('owner_user_id') : '');
}

module.exports = {
  buildAllAccountsDisabledError,
  buildNoConnectedOwnerError,
  connectedAccountTokens,
  enabledAccountTokens,
  ownerUserIdFromUrl,
  resolveItemClient
};
