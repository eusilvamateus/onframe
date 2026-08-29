const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { MercadoLivreClient } = require('./meli-client');
const { TokenStore } = require('./token-store');
const {
  classifyRequest,
  createAuditLogger,
  extractItemId
} = require('./audit-log');
const { ownerUserIdFromUrl, resolveItemClient } = require('./account-client');
const { createUpdateManager } = require('./update-manager');
const { sanitizeError, userFriendlyError } = require('./errors');
const {
  createItemRouteCache,
  handleResolve,
  handleResolveQuick
} = require('./routes/items');
const {
  handlePriceSummary,
  handleStandardPriceUpdate
} = require('./routes/pricing');
const {
  handleBulkCommit,
  handleBulkPreview
} = require('./routes/bulk');
const {
  handleDescriptionBulkUpdate,
  handleDescriptionGet,
  handleDescriptionUpdate
} = require('./routes/descriptions');
const {
  handleCharacteristicsBulkUpdate,
  handleCharacteristicsGet,
  handleCharacteristicsUpdate
} = require('./routes/characteristics');
const {
  handlePictureCommit,
  handlePictureFixSize,
  handlePictureQuality,
  handlePictureUpload
} = require('./routes/pictures');
const {
  handleCampaignList,
  handleCreateCampaign,
  handleCreateOffer,
  handleDeleteCampaign,
  handleDeleteOffer,
  handlePromotionEstimate,
  handlePromotionSummary,
  handleUpdateCampaign,
  handleUpdateOffer
} = require('./routes/promotions');
const packageJson = require('../../package.json');

const DEFAULT_CONNECT_BASE_URL = 'https://connect.onblide.com';
const REQUIRED_NODE_MAJOR = 20;

function createApp(options = {}) {
  const env = options.env || process.env;
  const store = options.store || new TokenStore({ env });
  const client = options.client || new MercadoLivreClient({ env, store });
  const clientFactory = options.clientFactory || ((account) => createAccountClient({ env, store, client, account }));
  const updateManager = options.updateManager || createUpdateManager({ env, root: options.root || process.cwd() });
  const itemRouteCache = options.itemRouteCache || createItemRouteCache();
  const accessPolicy = createAccessPolicy({ env, root: options.root });
  const auditLogger = options.auditLogger || createAuditLogger({ env, root: options.root || process.cwd() });
  const pendingAuth = new Map();
  const startedAt = new Date();

  return http.createServer(async (req, res) => {
    const requestId = randomToken();
    const requestStartedAt = Date.now();
    res.setHeader('x-onframe-request-id', requestId);

    try {
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      setCorsHeaders(req, res, accessPolicy);
      attachAuditLogger({ req, res, url, requestId, startedAt: requestStartedAt, store, auditLogger });

      const accessError = validateLocalAccess(req, url, accessPolicy);
      if (req.method === 'OPTIONS') {
        return accessError ? sendError(res, accessError, requestId) : sendJson(res, 204, null);
      }
      if (accessError) return sendError(res, accessError, requestId);

      const route = `${req.method} ${url.pathname}`;

      if (route === 'GET /health') {
        return sendJson(res, 200, handleHealth({ env, startedAt }));
      }

      if (route === 'GET /diagnostics') {
        return sendJson(res, 200, await handleDiagnostics({ env, store, startedAt }));
      }

      if (route === 'GET /updates/status') {
        return sendJson(res, 200, await updateManager.getStatus({
          force: url.searchParams.get('force') === '1'
        }));
      }

      if (route === 'GET /updates/open') {
        return sendRawHtml(res, 200, buildUpdateOpenPage(getUpdateOpenPageData(updateManager)));
      }

      if (route === 'GET /auth/status') {
        return sendJson(res, 200, await handleAuthStatus({ store }));
      }

      if (route === 'GET /auth/account') {
        return sendJson(res, 200, await handleAuthAccount({ store, client }));
      }

      if (route === 'GET /auth/accounts') {
        return sendJson(res, 200, await handleAuthAccounts({ store }));
      }

      if (route === 'POST /auth/accounts/active') {
        return sendJson(res, 200, await handleAuthAccountActive({ req, store, readJson }));
      }

      const authAccountMatch = url.pathname.match(/^\/auth\/accounts\/([^/]+)$/);
      if (req.method === 'PATCH' && authAccountMatch) {
        return sendJson(res, 200, await handleAuthAccountUpdate({ req, store, userId: decodeURIComponent(authAccountMatch[1]), readJson }));
      }
      if (req.method === 'DELETE' && authAccountMatch) {
        return sendJson(res, 200, await handleAuthAccountRemove({ store, userId: decodeURIComponent(authAccountMatch[1]) }));
      }

      if (route === 'POST /auth/start') {
        return sendJson(res, 200, await handleAuthStart({ env, pendingAuth }));
      }

      if (route === 'GET /auth/mercadolivre/callback') {
        return await handleAuthCallback({ res, url, client, pendingAuth });
      }

      if (route === 'POST /auth/logout') {
        return sendJson(res, 200, await handleAuthLogout({ store }));
      }

      if (route === 'POST /api/resolve') {
        const result = await handleResolve({ req, client, store, clientFactory, readJson });
        return sendJson(res, result.statusCode || 200, result.payload || result);
      }

      if (route === 'POST /api/resolve/quick') {
        const result = await handleResolveQuick({ req, client, store, clientFactory, readJson, cache: itemRouteCache });
        return sendJson(res, result.statusCode || 200, result.payload || result);
      }

      const priceSummaryMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/pricing\/summary$/);
      if (req.method === 'GET' && priceSummaryMatch) {
        const itemClient = await resolveClientForItemRequest(url, priceSummaryMatch[1]);
        return sendJson(res, 200, await handlePriceSummary({ client: itemClient, itemId: priceSummaryMatch[1] }));
      }

      const standardPriceMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/pricing\/standard$/);
      if (req.method === 'PUT' && standardPriceMatch) {
        const itemClient = await resolveClientForItemRequest(url, standardPriceMatch[1]);
        return sendJson(res, 200, await handleStandardPriceUpdate({ req, client: itemClient, itemId: standardPriceMatch[1], readJson }));
      }

      const bulkPreviewMatch = url.pathname.match(/^\/api\/items\/((?:MLB|MLBU)\d+)\/bulk\/preview$/);
      if (req.method === 'POST' && bulkPreviewMatch) {
        const itemClient = await resolveClientForBulkRequest(url, bulkPreviewMatch[1]);
        return sendJson(res, 200, await handleBulkPreview({ req, client: itemClient, itemId: bulkPreviewMatch[1], readJson }));
      }

      const bulkCommitMatch = url.pathname.match(/^\/api\/items\/((?:MLB|MLBU)\d+)\/bulk\/commit$/);
      if (req.method === 'POST' && bulkCommitMatch) {
        const itemClient = await resolveClientForBulkRequest(url, bulkCommitMatch[1]);
        return sendJson(res, 200, await handleBulkCommit({ req, client: itemClient, itemId: bulkCommitMatch[1], readJson }));
      }

      const descriptionMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/description$/);
      if (req.method === 'GET' && descriptionMatch) {
        const itemClient = await resolveClientForItemRequest(url, descriptionMatch[1]);
        return sendJson(res, 200, await handleDescriptionGet({ client: itemClient, itemId: descriptionMatch[1] }));
      }
      if (req.method === 'PUT' && descriptionMatch) {
        const itemClient = await resolveClientForItemRequest(url, descriptionMatch[1]);
        return sendJson(res, 200, await handleDescriptionUpdate({ req, client: itemClient, itemId: descriptionMatch[1], readJson }));
      }

      const descriptionBulkMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/description\/bulk$/);
      if (req.method === 'POST' && descriptionBulkMatch) {
        const itemClient = await resolveClientForBulkRequest(url, descriptionBulkMatch[1]);
        return sendJson(res, 200, await handleDescriptionBulkUpdate({ req, client: itemClient, itemId: descriptionBulkMatch[1], readJson }));
      }

      const characteristicsMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/characteristics$/);
      if (req.method === 'GET' && characteristicsMatch) {
        const itemClient = await resolveClientForItemRequest(url, characteristicsMatch[1]);
        return sendJson(res, 200, await handleCharacteristicsGet({ client: itemClient, itemId: characteristicsMatch[1] }));
      }
      if (req.method === 'PUT' && characteristicsMatch) {
        const itemClient = await resolveClientForItemRequest(url, characteristicsMatch[1]);
        return sendJson(res, 200, await handleCharacteristicsUpdate({ req, client: itemClient, itemId: characteristicsMatch[1], readJson }));
      }

      const characteristicsBulkMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/characteristics\/bulk$/);
      if (req.method === 'POST' && characteristicsBulkMatch) {
        const itemClient = await resolveClientForBulkRequest(url, characteristicsBulkMatch[1]);
        return sendJson(res, 200, await handleCharacteristicsBulkUpdate({ req, client: itemClient, itemId: characteristicsBulkMatch[1], readJson }));
      }

      const promotionSummaryMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/promotions\/summary$/);
      if (req.method === 'GET' && promotionSummaryMatch) {
        const itemClient = await resolveClientForItemRequest(url, promotionSummaryMatch[1]);
        return sendJson(res, 200, await handlePromotionSummary({ client: itemClient, itemId: promotionSummaryMatch[1] }));
      }

      const promotionEstimateMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/promotions\/estimate$/);
      if (req.method === 'POST' && promotionEstimateMatch) {
        const itemClient = await resolveClientForItemRequest(url, promotionEstimateMatch[1]);
        return sendJson(res, 200, await handlePromotionEstimate({ req, client: itemClient, itemId: promotionEstimateMatch[1], readJson }));
      }

      const offerMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/promotions\/offers$/);
      if (req.method === 'POST' && offerMatch) {
        const itemClient = await resolveClientForItemRequest(url, offerMatch[1]);
        return sendJson(res, 200, await handleCreateOffer({ req, client: itemClient, itemId: offerMatch[1], readJson }));
      }
      if (req.method === 'PUT' && offerMatch) {
        const itemClient = await resolveClientForItemRequest(url, offerMatch[1]);
        return sendJson(res, 200, await handleUpdateOffer({ req, client: itemClient, itemId: offerMatch[1], readJson }));
      }
      if (req.method === 'DELETE' && offerMatch) {
        const itemClient = await resolveClientForItemRequest(url, offerMatch[1]);
        return sendJson(res, 200, await handleDeleteOffer({ req, client: itemClient, itemId: offerMatch[1], readJson }));
      }

      if (route === 'GET /api/promotions/campaigns') {
        return sendJson(res, 200, await handleCampaignList({ client }));
      }

      if (route === 'POST /api/promotions/campaigns') {
        return sendJson(res, 200, await handleCreateCampaign({ req, client, readJson }));
      }

      const campaignMatch = url.pathname.match(/^\/api\/promotions\/campaigns\/([^/]+)$/);
      if (req.method === 'PUT' && campaignMatch) {
        return sendJson(res, 200, await handleUpdateCampaign({ req, client, promotionId: decodeURIComponent(campaignMatch[1]), readJson }));
      }
      if (req.method === 'DELETE' && campaignMatch) {
        return sendJson(res, 200, await handleDeleteCampaign({ req, client, promotionId: decodeURIComponent(campaignMatch[1]), readJson }));
      }

      const uploadMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/pictures\/upload$/);
      if (req.method === 'POST' && uploadMatch) {
        const itemClient = await resolveClientForItemRequest(url, uploadMatch[1]);
        return sendJson(res, 200, await handlePictureUpload({ req, client: itemClient, itemId: uploadMatch[1], readJson }));
      }

      const qualityMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/pictures\/quality$/);
      if (req.method === 'GET' && qualityMatch) {
        const itemClient = await resolveClientForItemRequest(url, qualityMatch[1]);
        return sendJson(res, 200, await handlePictureQuality({ url, client: itemClient, itemId: qualityMatch[1] }));
      }

      const fixSizeMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/pictures\/fix-size$/);
      if (req.method === 'POST' && fixSizeMatch) {
        const itemClient = await resolveClientForItemRequest(url, fixSizeMatch[1]);
        return sendJson(res, 200, await handlePictureFixSize({ req, client: itemClient, itemId: fixSizeMatch[1], readJson }));
      }

      const commitMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/pictures\/commit$/);
      if (req.method === 'POST' && commitMatch) {
        const itemClient = await resolveClientForItemRequest(url, commitMatch[1]);
        return sendJson(res, 200, await handlePictureCommit({ req, client: itemClient, itemId: commitMatch[1], readJson }));
      }

      const notFound = new Error('Endpoint nao encontrado.');
      notFound.statusCode = 404;
      notFound.code = 'endpoint_not_found';
      throw notFound;
    } catch (err) {
      return sendError(res, err, requestId);
    }
  });

  function resolveClientForItemRequest(url, itemId) {
    return resolveItemClient({
      itemId,
      ownerUserId: ownerUserIdFromUrl(url),
      store,
      client,
      clientFactory
    });
  }

  async function resolveClientForBulkRequest(url, subjectId) {
    if (!/^MLBU\d+$/i.test(String(subjectId || ''))) return resolveClientForItemRequest(url, subjectId);
    const ownerUserId = ownerUserIdFromUrl(url);
    if (!ownerUserId || !store || typeof store.readAccount !== 'function' || typeof clientFactory !== 'function') {
      return client;
    }
    const account = await store.readAccount(ownerUserId);
    if (!account || !account.refresh_token) {
      const err = new Error('Conta conectada não encontrada para este anúncio.');
      err.statusCode = 403;
      throw err;
    }
    if (account.enabled === false) {
      const err = new Error('Esta conta está desativada no OnFrame. Ative a conta para editar este anúncio.');
      err.statusCode = 403;
      throw err;
    }
    return clientFactory(account);
  }
}

function createAccountClient({ env, store, client, account }) {
  if (!account) return client;
  return new MercadoLivreClient({
    env,
    fetchImpl: client && client.fetch ? client.fetch : undefined,
    store: {
      read: async () => account,
      write: async (token, accountMeta) => Object.assign({}, account, accountMeta || {}, token || {})
    }
  });
}

function handleHealth({ env, startedAt }) {
  return {
    ok: true,
    service: 'onframe',
    version: packageJson.version,
    port: Number(env.ML_SERVICE_PORT || 4765),
    startedAt: startedAt.toISOString()
  };
}

async function handleDiagnostics({ env, store, startedAt }) {
  return buildDiagnostics({ env, store, startedAt });
}

async function handleAuthStatus({ store }) {
  const token = await store.read();
  return {
    authenticated: Boolean(token && token.refresh_token),
    userId: token && token.user_id ? token.user_id : null,
    expiresAt: token && token.expires_at ? token.expires_at : null
  };
}

async function handleAuthAccount({ store, client }) {
  const token = await store.read();
  if (!token || !token.refresh_token) {
    return {
      authenticated: false,
      userId: null,
      expiresAt: null,
      account: null
    };
  }

  try {
    const me = await client.getMe();
    return {
      authenticated: true,
      userId: me && me.id ? me.id : token.user_id || null,
      expiresAt: token.expires_at || null,
      account: summarizeAccount(me)
    };
  } catch (err) {
    const technicalError = sanitizeError(err);
    if (isDisconnectedAuthError(err, technicalError)) {
      return {
        authenticated: false,
        userId: token.user_id || null,
        expiresAt: token.expires_at || null,
        account: null,
        error: userFriendlyError(err, technicalError, err.statusCode)
      };
    }
    throw err;
  }
}

async function handleAuthAccounts({ store }) {
  const accounts = store && typeof store.listAccounts === 'function'
    ? await store.listAccounts()
    : await listAccountsFallback(store);
  const active = accounts.find((account) => account.active) || null;
  return {
    authenticated: Boolean(active),
    activeUserId: active && active.user_id ? active.user_id : null,
    accounts
  };
}

async function handleAuthAccountActive({ req, store, readJson }) {
  if (!store || typeof store.setActive !== 'function') {
    const err = new Error('Esta instalação não suporta múltiplas contas.');
    err.statusCode = 400;
    throw err;
  }
  const body = await readJson(req);
  const account = await store.setActive(body.userId);
  return {
    ok: true,
    activeUserId: account.user_id
  };
}

async function handleAuthAccountRemove({ store, userId }) {
  if (!store || typeof store.removeAccount !== 'function') {
    const err = new Error('Esta instalação não suporta múltiplas contas.');
    err.statusCode = 400;
    throw err;
  }
  await store.removeAccount(userId);
  const accounts = await store.listAccounts();
  const active = accounts.find((account) => account.active) || null;
  return {
    ok: true,
    activeUserId: active && active.user_id ? active.user_id : null,
    accounts
  };
}

async function handleAuthAccountUpdate({ req, store, userId, readJson }) {
  if (!store || typeof store.setAccountEnabled !== 'function') {
    const err = new Error('Esta instalação não suporta habilitar contas.');
    err.statusCode = 400;
    throw err;
  }
  const body = await readJson(req);
  await store.setAccountEnabled(userId, body.enabled !== false);
  const accounts = await store.listAccounts();
  const active = accounts.find((account) => account.active) || null;
  return {
    ok: true,
    activeUserId: active && active.user_id ? active.user_id : null,
    accounts
  };
}

async function handleAuthStart({ env, pendingAuth }) {
  const state = randomToken();
  const codeVerifier = randomCodeVerifier();
  const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
  const port = Number(env.ML_SERVICE_PORT || 4765);
  const callbackUrl = `http://127.0.0.1:${port}/auth/mercadolivre/callback`;
  const connectBaseUrl = String(env.ONBLIDE_CONNECT_BASE_URL || DEFAULT_CONNECT_BASE_URL).replace(/\/+$/, '');

  const response = await fetchJson(`${connectBaseUrl}/api/mercadolivre/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      callbackUrl,
      state,
      codeChallenge,
      codeChallengeMethod: 'S256'
    })
  });
  if (!response.brokerState) {
    const err = new Error('Onblide Connect não retornou o estado do broker.');
    err.statusCode = 502;
    throw err;
  }

  pendingAuth.set(state, {
    codeVerifier,
    brokerState: response.brokerState,
    redirectUri: response.redirectUri,
    createdAt: Date.now()
  });
  prunePendingAuth(pendingAuth);

  return { authUrl: response.authUrl, expiresIn: response.expiresIn };
}

async function handleAuthCallback({ res, url, client, pendingAuth }) {
  const state = url.searchParams.get('state');
  const pending = state ? pendingAuth.get(state) : null;
  if (!pending) return sendHtml(res, 400, 'Autorizacao nao encontrada ou expirada.');
  pendingAuth.delete(state);

  if (url.searchParams.get('error')) {
    return sendHtml(res, 400, `Mercado Livre retornou: ${escapeHtml(url.searchParams.get('error'))}`);
  }

  const code = url.searchParams.get('code');
  if (!code) return sendHtml(res, 400, 'Codigo de autorizacao ausente.');

  const token = await client.exchangeAuthorizationCode({
    code,
    redirectUri: pending.redirectUri,
    codeVerifier: pending.codeVerifier,
    brokerState: pending.brokerState
  });
  const me = await client.getMe();
  if (client.store && typeof client.store.write === 'function') {
    await client.store.write(token, summarizeAccount(me));
  }

  return sendHtml(res, 200, 'Autenticacao concluida. Voce ja pode fechar esta janela.');
}

async function handleAuthLogout({ store }) {
  await store.clear();
  return { ok: true };
}

function summarizeAccount(user) {
  if (!user || typeof user !== 'object') return null;
  return {
    id: user.id || null,
    nickname: user.nickname || null,
    site_id: user.site_id || null,
    permalink: user.permalink || null,
    status: user.status || null
  };
}

async function buildDiagnostics({ env, store, startedAt }) {
  const token = await safeReadToken(store);
  const expiresAt = token && token.expires_at ? Number(token.expires_at) : null;
  const now = Date.now();
  const tokenSecurity = getTokenSecurityState(store, env);
  const diagnostics = {
    ok: true,
    service: 'onframe',
    version: packageJson.version,
    port: Number(env.ML_SERVICE_PORT || 4765),
    startedAt: startedAt.toISOString(),
    uptimeMs: Math.max(0, Date.now() - startedAt.getTime()),
    runtime: {
      nodeVersion: process.versions.node,
      nodeMajor: Number(process.versions.node.split('.')[0] || 0),
      requiredNodeMajor: REQUIRED_NODE_MAJOR,
      nodeOk: Number(process.versions.node.split('.')[0] || 0) >= REQUIRED_NODE_MAJOR,
      platform: process.platform,
      arch: process.arch
    },
    config: {
      envFileExists: fs.existsSync(path.resolve(__dirname, '..', '..', '.env')),
      tokenSecretConfigured: tokenSecurity.configured,
      tokenSecretMode: tokenSecurity.mode
    },
    auth: {
      tokenPresent: Boolean(token && token.refresh_token),
      userId: token && token.user_id ? token.user_id : null,
      expiresAt,
      expiresInMs: expiresAt ? expiresAt - now : null,
      expired: expiresAt ? expiresAt <= now : false,
      expiringSoon: expiresAt ? expiresAt <= now + 30 * 60 * 1000 : false
    },
    issues: [],
    nextActions: []
  };

  diagnostics.issues = buildDiagnosticIssues(diagnostics);
  diagnostics.nextActions = buildDiagnosticActions(diagnostics);
  diagnostics.ready = diagnostics.issues.length === 0;
  return diagnostics;
}

async function safeReadToken(store) {
  if (!store || typeof store.read !== 'function') return null;
  try {
    return await store.read();
  } catch (err) {
    return null;
  }
}

function buildDiagnosticIssues(diagnostics) {
  const issues = [];
  if (!diagnostics.runtime.nodeOk) issues.push('node_version');
  if (diagnostics.config.tokenSecretMode === 'fallback') issues.push('token_secret_fallback');
  if (!diagnostics.auth.tokenPresent) issues.push('account_disconnected');
  return issues;
}

function buildDiagnosticActions(diagnostics) {
  const actions = [];
  if (!diagnostics.runtime.nodeOk) {
    actions.push('Instale Node.js 20+.');
  }
  if (!diagnostics.auth.tokenPresent) {
    actions.push('Conecte a conta.');
  }
  if (diagnostics.config.tokenSecretMode === 'fallback') {
    actions.push('Configure o segredo local de tokens reiniciando pelo bootstrap.');
  }
  if (!actions.length) actions.push('Pronto para editar fotos.');
  return actions;
}

function getTokenSecurityState(store, env) {
  if (store && typeof store.getSecurityState === 'function') return store.getSecurityState();
  const configured = hasValue(env && env.ONBLIDE_TOKEN_SECRET);
  return {
    configured,
    mode: configured ? 'configured' : 'fallback'
  };
}

function hasValue(value) {
  return String(value || '').trim().length > 0;
}

function isDisconnectedAuthError(err, sanitized) {
  const text = String(sanitized || '').toLowerCase();
  const status = Number(err && err.statusCode ? err.statusCode : 0);
  return status === 401 ||
    text.includes('invalid_token') ||
    text.includes('invalid_grant') ||
    text.includes('unauthorized') ||
    text.includes('mercado livre nao autenticado');
}

async function readJson(req, options = {}) {
  const maxBytes = options.maxBytes || 1024 * 1024;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error('Payload excede o limite permitido.');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  assertJsonContentType(req);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (err) {
    const parseError = new Error('JSON invalido.');
    parseError.statusCode = 400;
    parseError.code = 'invalid_json';
    throw parseError;
  }
}

function assertJsonContentType(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType || contentType.includes('application/json')) return;
  if (!req.headers.origin && contentType.includes('text/plain')) return;
  const err = new Error('Content-Type invalido. Use application/json.');
  err.statusCode = 415;
  err.code = 'invalid_content_type';
  throw err;
}

async function listAccountsFallback(store) {
  const token = store && typeof store.read === 'function' ? await store.read() : null;
  if (!token || !token.user_id) return [];
  return [{
    user_id: token.user_id,
    nickname: token.nickname || null,
    site_id: token.site_id || null,
    permalink: token.permalink || null,
    status: token.status || null,
    expires_at: token.expires_at || null,
    connected_at: token.connected_at || null,
    updated_at: token.updated_at || null,
    enabled: token.enabled !== false,
    active: true
  }];
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const err = new Error(body.error || `HTTP ${response.status}`);
    err.statusCode = response.status;
    throw err;
  }
  return body;
}

function prunePendingAuth(pendingAuth) {
  const expiresBefore = Date.now() - 10 * 60 * 1000;
  for (const [state, value] of pendingAuth.entries()) {
    if (!value.createdAt || value.createdAt < expiresBefore) pendingAuth.delete(state);
  }
}

function createAccessPolicy({ env, root } = {}) {
  return {
    allowedOrigins: getAllowedOrigins(env, root)
  };
}

function getAllowedOrigins(env, root) {
  const configured = String(env && env.ONFRAME_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const extensionId = configured.length ? null : getManifestExtensionId(root);
  return configured.length
    ? configured
    : (extensionId ? [`chrome-extension://${extensionId}`] : []);
}

function getManifestExtensionId(root) {
  try {
    const manifestPath = path.join(root || path.resolve(__dirname, '..', '..'), 'extension', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest.key) return null;
    const der = Buffer.from(manifest.key, 'base64');
    const hash = crypto.createHash('sha256').update(der).digest();
    return Array.from(hash.subarray(0, 16))
      .map((byte) => [byte >> 4, byte & 15].map((nibble) => String.fromCharCode(97 + nibble)).join(''))
      .join('');
  } catch (err) {
    return null;
  }
}

function validateLocalAccess(req, url, accessPolicy) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return null;
  if (accessPolicy.allowedOrigins.includes(origin)) return null;
  if (isPublicRoute(req, url)) return null;
  const err = new Error('Origem nao autorizada para o serviço local.');
  err.statusCode = 403;
  err.code = 'origin_not_allowed';
  return err;
}

function isPublicRoute(req, url) {
  const pathname = url && url.pathname ? url.pathname : '';
  return (req.method === 'GET' && pathname === '/health') ||
    (req.method === 'GET' && pathname === '/auth/mercadolivre/callback');
}

function setCorsHeaders(req, res, accessPolicy) {
  const origin = String(req.headers.origin || '').trim();
  if (origin && accessPolicy.allowedOrigins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
  }
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,x-onframe-extension');
}

function attachAuditLogger({ req, res, url, requestId, startedAt, store, auditLogger }) {
  if (!auditLogger || typeof auditLogger.log !== 'function' || req.method === 'OPTIONS' || url.pathname === '/health') return;
  const originalEnd = res.end;
  res.end = function wrappedEnd(...args) {
    const result = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'error';
    const entry = {
      requestId,
      origin: req.headers.origin || null,
      action: classifyRequest(req.method, url.pathname),
      method: req.method,
      path: url.pathname,
      itemId: extractItemId(url.pathname),
      status: res.statusCode,
      result,
      durationMs: Date.now() - startedAt,
      errorCode: res.locals && res.locals.errorCode ? res.locals.errorCode : null
    };
    readAuditUserId(store)
      .then((userId) => auditLogger.log(Object.assign(entry, { userId })))
      .catch(() => auditLogger.log(entry));
    return originalEnd.apply(this, args);
  };
}

async function readAuditUserId(store) {
  if (!store || typeof store.read !== 'function') return null;
  const token = await store.read();
  return token && token.user_id ? token.user_id : null;
}

function sendError(res, err, requestId) {
  const status = err && err.statusCode ? Number(err.statusCode) : 500;
  const code = err && err.code ? err.code : statusToErrorCode(status);
  const technicalError = sanitizeError(err);
  res.locals = Object.assign({}, res.locals || {}, { errorCode: code });
  const payload = {
    error: userFriendlyError(err, technicalError, status),
    code,
    requestId
  };
  return sendJson(res, status, payload);
}

function statusToErrorCode(status) {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 413) return 'payload_too_large';
  if (status === 415) return 'unsupported_media_type';
  if (status === 502) return 'upstream_error';
  return 'internal_error';
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(payload === null ? '' : JSON.stringify(payload));
}

function sendHtml(res, statusCode, message) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end('<!doctype html><meta charset="utf-8"><title>OnFrame</title><body style="font-family:Poppins,system-ui,-apple-system,Segoe UI,sans-serif;color:#545454;background:#ffffff;padding:32px"><main style="max-width:640px"><p style="margin:0 0 4px;color:#0a4ee4;font:500 12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;text-transform:uppercase">OnFrame</p><h1 style="margin:0 0 12px;color:#2a2a2a;font-size:28px;line-height:1.1">Mercado Livre conectado</h1><p style="margin:0;font-size:16px;line-height:1.6">' + escapeHtml(message) + '</p></main></body>');
}

function sendRawHtml(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(html);
}

function getUpdateOpenPageData(updateManager) {
  if (updateManager && typeof updateManager.getOpenPageData === 'function') {
    return updateManager.getOpenPageData();
  }
  const isMac = process.platform === 'darwin';
  return {
    protocolUrl: 'onframe-updater://update',
    platform: process.platform,
    shell: isMac ? 'terminal' : 'powershell',
    shellLabel: isMac ? 'Terminal' : 'PowerShell',
    canOpenUpdater: process.platform === 'win32' || isMac,
    updateCommand: isMac
      ? "ONFRAME_HOME=\"$HOME/Library/Application Support/OnFrame\" /bin/sh -c \"$(/usr/bin/curl -fsSL 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.sh')\""
      : "iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.ps1' | iex",
    checkCommand: isMac
      ? "ONFRAME_HOME=\"$HOME/Library/Application Support/OnFrame\" \"$HOME/Library/Application Support/OnFrame/scripts/bootstrap/check.sh\""
      : "iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/check.ps1' | iex"
  };
}

function buildUpdateOpenPage(data = {}) {
  const pageData = {
    protocolUrl: data.protocolUrl || 'onframe-updater://update',
    canOpenUpdater: data.canOpenUpdater !== false,
    shellLabel: data.shellLabel || 'PowerShell',
    updateCommand: data.updateCommand || '',
    checkCommand: data.checkCommand || '',
    messages: {
      trying: 'Tentando abrir o atualizador do OnFrame...',
      fallback: 'Se nenhuma janela abriu, use o comando manual abaixo.',
      copied: 'Copiado',
      copy: 'Copiar'
    }
  };
  const serialized = JSON.stringify(pageData).replace(/</g, '\\u003c');
  const updateCommand = escapeHtml(pageData.updateCommand || 'Comando indisponivel.');
  const checkCommand = escapeHtml(pageData.checkCommand || 'Comando indisponivel.');
  const shellLabel = escapeHtml(pageData.shellLabel);

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Atualizar OnFrame</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --surface: #fff;
      --line: #e6e9ef;
      --line-strong: #d8dde7;
      --ink: #171a21;
      --muted: #667085;
      --blue: #0a4ee4;
      --blue-soft: #edf3ff;
      --green: #0a9f4a;
      --shadow: 0 16px 42px rgba(16, 24, 40, .08), 0 2px 8px rgba(16, 24, 40, .04);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      background: var(--bg);
      color: var(--ink);
      font-family: Poppins, Inter, system-ui, -apple-system, Segoe UI, sans-serif;
      letter-spacing: 0;
    }
    .page { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .shell { width: min(920px, 100%); display: grid; gap: 14px; }
    .hero, .panel {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .hero { padding: 28px; display: grid; gap: 22px; }
    .brand { margin: 0; color: var(--blue); font: 700 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(32px, 5vw, 52px); line-height: 1.02; letter-spacing: 0; }
    .copy { margin: 0; max-width: 680px; color: var(--muted); font-size: 15px; line-height: 1.55; }
    .status {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 12px 14px;
      border-radius: 8px;
      background: var(--blue-soft);
      color: var(--blue);
      font-weight: 700;
    }
    .status.is-fallback { background: #fff7e8; color: #9a5a00; }
    .dot { width: 10px; height: 10px; border-radius: 999px; background: currentColor; box-shadow: 0 0 0 0 rgba(10, 78, 228, .34); animation: pulse 1.25s infinite; }
    @keyframes pulse { 70% { box-shadow: 0 0 0 12px rgba(10, 78, 228, 0); } 100% { box-shadow: 0 0 0 0 rgba(10, 78, 228, 0); } }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    button, a.button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 9px 12px;
      border: 1.5px solid var(--line-strong);
      border-radius: 8px;
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      font: 700 13px/1 Poppins, Inter, system-ui, sans-serif;
      text-decoration: none;
    }
    button.primary { border-color: var(--blue); background: var(--blue); color: #fff; }
    .panel { overflow: hidden; }
    .panel-head { padding: 16px 18px; border-bottom: 1px solid var(--line); }
    .panel-head strong { display: block; font-size: 15px; }
    .panel-head span { display: block; margin-top: 4px; color: var(--muted); font-size: 13px; }
    .commands { display: grid; grid-template-columns: 1fr 1fr; }
    .command { padding: 16px 18px; border-right: 1px solid var(--line); }
    .command:last-child { border-right: 0; }
    .command-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; font-size: 13px; font-weight: 800; }
    code {
      display: block;
      min-height: 64px;
      padding: 12px;
      border-radius: 8px;
      background: #f0f2f6;
      color: #283040;
      font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      overflow-wrap: anywhere;
      user-select: all;
    }
    .destinations { display: flex; flex-wrap: wrap; gap: 8px; padding: 14px 18px; border-top: 1px solid var(--line); }
    @media (max-width: 720px) {
      .page { padding: 14px; }
      .commands { grid-template-columns: 1fr; }
      .command { border-right: 0; border-bottom: 1px solid var(--line); }
      .command:last-child { border-bottom: 0; }
    }
  </style>
</head>
<body>
  <main class="page">
    <div class="shell">
      <section class="hero">
        <p class="brand">OnFrame</p>
        <h1>Atualizar OnFrame</h1>
        <p class="copy">Esta pagina pede ao navegador para abrir o atualizador local registrado neste computador. Se nada abrir, use o comando manual.</p>
        <div class="status" id="statusBox">
          <span class="dot" aria-hidden="true"></span>
          <span id="statusText">Tentando abrir o atualizador do OnFrame...</span>
        </div>
        <div class="actions">
          <button class="primary" type="button" id="openUpdaterButton">Abrir atualizador novamente</button>
          <button type="button" data-copy="update">Copiar comando manual</button>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head">
          <strong>Fallback manual</strong>
          <span>Copie o comando e execute no ${shellLabel} quando o protocolo local ainda nao estiver registrado.</span>
        </div>
        <div class="commands">
          <div class="command">
            <div class="command-head"><span>Atualizar</span><button type="button" data-copy="update">Copiar</button></div>
            <code>${updateCommand}</code>
          </div>
          <div class="command">
            <div class="command-head"><span>Verificar instalacao</span><button type="button" data-copy="check">Copiar</button></div>
            <code>${checkCommand}</code>
          </div>
        </div>
        <div class="destinations">
          <a class="button" href="chrome://extensions/">Chrome extensions</a>
          <a class="button" href="edge://extensions/">Edge extensions</a>
        </div>
      </section>
    </div>
  </main>
  <script>
    const pageData = ${serialized};
    const statusBox = document.getElementById('statusBox');
    const statusText = document.getElementById('statusText');
    const openUpdaterButton = document.getElementById('openUpdaterButton');
    let leftPage = false;

    function showFallback() {
      statusBox.classList.add('is-fallback');
      statusText.textContent = pageData.messages.fallback;
    }

    function openUpdater() {
      if (!pageData.canOpenUpdater) {
        showFallback();
        return;
      }
      statusBox.classList.remove('is-fallback');
      statusText.textContent = pageData.messages.trying;
      leftPage = false;
      window.setTimeout(() => {
        window.location.href = pageData.protocolUrl;
      }, 60);
      window.setTimeout(() => {
        if (!leftPage) showFallback();
      }, 1800);
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) leftPage = true;
    });
    window.addEventListener('blur', () => {
      leftPage = true;
    });
    openUpdaterButton.addEventListener('click', openUpdater);

    for (const button of document.querySelectorAll('[data-copy]')) {
      button.addEventListener('click', async () => {
        const key = button.getAttribute('data-copy') === 'check' ? 'checkCommand' : 'updateCommand';
        const command = pageData[key] || '';
        try {
          await navigator.clipboard.writeText(command);
          const previous = button.textContent;
          button.textContent = pageData.messages.copied;
          window.setTimeout(() => { button.textContent = previous || pageData.messages.copy; }, 1400);
        } catch (error) {
          const code = button.closest('.command')?.querySelector('code');
          if (!code) return;
          const range = document.createRange();
          range.selectNodeContents(code);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
      });
    }

    window.setTimeout(openUpdater, 320);
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function randomToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function randomCodeVerifier() {
  return crypto.randomBytes(48).toString('base64url');
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

module.exports = {
  createApp,
  sanitizeError,
  userFriendlyError
};
