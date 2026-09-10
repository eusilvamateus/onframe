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
  handlePromotionEstimates,
  handlePromotionSummary,
  handleUpdateCampaign,
  handleUpdateOffer
} = require('./routes/promotions');
const packageJson = require('../../package.json');

const DEFAULT_CONNECT_BASE_URL = 'https://connect.onblide.com';
const REQUIRED_NODE_MAJOR = 20;
const ACCOUNT_PROFILE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_PAGE_ASSETS = Object.freeze({
  'onblide-horizontal-primary.svg': {
    path: path.join(__dirname, '..', '..', 'extension', 'assets', 'onblide-horizontal-primary.svg'),
    contentType: 'image/svg+xml; charset=utf-8'
  },
  'Poppins-Regular.ttf': {
    path: path.join(__dirname, '..', '..', 'extension', 'fonts', 'Poppins-Regular.ttf'),
    contentType: 'font/ttf'
  },
  'Poppins-SemiBold.ttf': {
    path: path.join(__dirname, '..', '..', 'extension', 'fonts', 'Poppins-SemiBold.ttf'),
    contentType: 'font/ttf'
  },
  'Poppins-Bold.ttf': {
    path: path.join(__dirname, '..', '..', 'extension', 'fonts', 'Poppins-Bold.ttf'),
    contentType: 'font/ttf'
  },
  'JetBrainsMono-Medium.ttf': {
    path: path.join(__dirname, '..', '..', 'extension', 'fonts', 'JetBrainsMono-Medium.ttf'),
    contentType: 'font/ttf'
  },
  'Phosphor.woff2': {
    path: path.join(__dirname, '..', '..', 'extension', 'vendor', 'phosphor', 'Phosphor.woff2'),
    contentType: 'font/woff2'
  }
});

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

      if (req.method === 'GET' && url.pathname.startsWith('/updates/assets/')) {
        const assetName = url.pathname.slice('/updates/assets/'.length);
        if (sendUpdatePageAsset(res, assetName)) return;
      }

      if (route === 'GET /auth/status') {
        return sendJson(res, 200, await handleAuthStatus({ store }));
      }

      if (route === 'GET /auth/account') {
        return sendJson(res, 200, await handleAuthAccount({ store, client }));
      }

      if (route === 'GET /auth/accounts') {
        return sendJson(res, 200, await handleAuthAccounts({ store, clientFactory }));
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

      const promotionEstimatesMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/promotions\/estimates$/);
      if (req.method === 'POST' && promotionEstimatesMatch) {
        const itemClient = await resolveClientForItemRequest(url, promotionEstimatesMatch[1]);
        return sendJson(res, 200, await handlePromotionEstimates({ req, client: itemClient, itemId: promotionEstimatesMatch[1], readJson }));
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

async function handleAuthAccounts({ store, clientFactory }) {
  const storedAccounts = store && typeof store.listAccounts === 'function'
    ? await store.listAccounts()
    : await listAccountsFallback(store);
  const accounts = await refreshAccountProfiles({
    accounts: storedAccounts,
    store,
    clientFactory
  });
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
    await client.store.write(token, Object.assign({}, summarizeAccount(me), {
      profile_updated_at: Date.now()
    }));
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
    status: user.status || null,
    logo: accountLogoUrl(user)
  };
}

function accountLogoUrl(user) {
  const thumbnail = user && user.thumbnail;
  const candidates = [
    user && user.logo,
    thumbnail && thumbnail.picture_url,
    thumbnail && thumbnail.secure_url,
    typeof thumbnail === 'string' ? thumbnail : null,
    user && user.profile_picture,
    user && user.picture_url
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    try {
      const url = new URL(candidate);
      const hostname = url.hostname.toLowerCase();
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      if (hostname !== 'mlstatic.com' && !hostname.endsWith('.mlstatic.com')) continue;
      url.protocol = 'https:';
      return url.toString();
    } catch (err) {
      // Ignore malformed profile image URLs returned by third parties.
    }
  }
  return null;
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

function sendUpdatePageAsset(res, assetName) {
  const asset = UPDATE_PAGE_ASSETS[assetName];
  if (!asset) return false;

  res.statusCode = 200;
  res.setHeader('content-type', asset.contentType);
  res.setHeader('cache-control', 'no-store');
  res.end(fs.readFileSync(asset.path));
  return true;
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
      ? "onframe_bootstrap=\"$(mktemp)\" && /usr/bin/curl -fsSL 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.sh' -o \"$onframe_bootstrap\" && ONFRAME_HOME=\"$HOME/Library/Application Support/OnFrame\" /bin/sh \"$onframe_bootstrap\"; onframe_status=$?; rm -f \"$onframe_bootstrap\"; (exit \"$onframe_status\")"
      : "iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.ps1' | iex",
    repairCommand: isMac
      ? "onframe_bootstrap=\"$(mktemp)\" && /usr/bin/curl -fsSL 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/install.sh' -o \"$onframe_bootstrap\" && /bin/sh \"$onframe_bootstrap\"; onframe_status=$?; rm -f \"$onframe_bootstrap\"; (exit \"$onframe_status\")"
      : "iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/install.ps1' | iex",
    checkCommand: isMac
      ? "ONFRAME_HOME=\"$HOME/Library/Application Support/OnFrame\" \"$HOME/Library/Application Support/OnFrame/scripts/bootstrap/check.sh\""
      : "iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/check.ps1' | iex"
  };
}

async function refreshAccountProfiles({ accounts, store, clientFactory }) {
  if (!Array.isArray(accounts) || !accounts.length || !store ||
    typeof store.listAccountTokens !== 'function' || typeof clientFactory !== 'function') {
    return accounts;
  }

  const accountTokens = await store.listAccountTokens();
  const tokensByUserId = new Map(accountTokens.map((account) => [String(account.user_id), account]));
  const refreshed = [];

  for (const account of accounts) {
    const token = tokensByUserId.get(String(account.user_id));
    if (!token || !token.refresh_token || !shouldRefreshAccountProfile(token)) {
      refreshed.push(account);
      continue;
    }

    try {
      const profile = summarizeAccount(await clientFactory(token).getMe());
      const profileWithTimestamp = Object.assign({}, profile, { profile_updated_at: Date.now() });
      if (typeof store.updateAccountProfile === 'function') {
        await store.updateAccountProfile(account.user_id, profileWithTimestamp).catch(() => null);
      }
      refreshed.push(Object.assign({}, account, {
        nickname: profile.nickname || account.nickname,
        site_id: profile.site_id || account.site_id,
        permalink: profile.permalink || account.permalink,
        status: profile.status || account.status,
        logo: profile.logo
      }));
    } catch (err) {
      refreshed.push(account);
    }
  }

  return refreshed;
}

function shouldRefreshAccountProfile(account) {
  if (!account || !account.logo) return true;
  const updatedAt = Number(account && account.profile_updated_at || 0);
  return !updatedAt || Date.now() - updatedAt >= ACCOUNT_PROFILE_REFRESH_INTERVAL_MS;
}

function buildUpdateOpenPage(data = {}) {
  const pageData = {
    protocolUrl: data.protocolUrl || 'onframe-updater://update',
    canOpenUpdater: data.canOpenUpdater !== false,
    shellLabel: data.shellLabel || 'PowerShell',
    updateCommand: data.updateCommand || '',
    repairCommand: data.repairCommand || '',
    checkCommand: data.checkCommand || '',
    messages: {
      trying: 'Tentando abrir o atualizador do OnFrame...',
      fallback: 'Se nenhuma janela abriu, use o comando manual abaixo.',
      copied: 'Copiado',
      copy: 'Copiar'
    }
  };
  const serialized = JSON.stringify(pageData).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Atualizar OnFrame</title>
  <style>
    @font-face {
      font-family: 'Poppins';
      src: url('/updates/assets/Poppins-Regular.ttf') format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Poppins';
      src: url('/updates/assets/Poppins-SemiBold.ttf') format('truetype');
      font-weight: 600;
      font-style: normal;
    }
    @font-face {
      font-family: 'Poppins';
      src: url('/updates/assets/Poppins-Bold.ttf') format('truetype');
      font-weight: 700;
      font-style: normal;
    }
    @font-face {
      font-family: 'JetBrains Mono';
      src: url('/updates/assets/JetBrainsMono-Medium.ttf') format('truetype');
      font-weight: 500;
      font-style: normal;
    }
    @font-face {
      font-family: 'Phosphor';
      src: url('/updates/assets/Phosphor.woff2') format('woff2');
      font-weight: normal;
      font-style: normal;
    }
    :root {
      color-scheme: light;
      --ob-blue: #0a4ee4;
      --ob-blue-700: #0840b8;
      --ob-blue-100: #e0eaff;
      --ob-blue-050: #f1f5ff;
      --ob-orange: #eb7c2d;
      --ob-orange-100: #fde6d3;
      --ob-ink-strong: #2a2a2a;
      --ob-ink: #545454;
      --ob-ink-soft: #7a7a7a;
      --ob-ink-mute: #a8a8a8;
      --ob-line: #ececec;
      --ob-surface: #ffffff;
      --ob-surface-2: #fbfbfb;
      --ob-border: var(--ob-line);
      --ob-shadow-lg: 0 12px 28px rgba(20, 20, 20, 0.08), 0 4px 8px rgba(20, 20, 20, 0.04);
      --ob-shadow-pop: 0 8px 24px rgba(10, 78, 228, 0.18);
      --ob-font: 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif;
      --ob-font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
      --ob-ease: cubic-bezier(0.2, 0.7, 0.2, 1);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      min-width: 360px;
      background: var(--ob-surface-2);
      color: var(--ob-ink);
      font-family: var(--ob-font);
      letter-spacing: 0;
    }
    button, a { font: inherit; }
    button { cursor: pointer; }
    .launcher {
      display: grid;
      width: min(100% - 32px, 980px);
      min-height: 100vh;
      margin: 0 auto;
      padding: 32px 0;
      align-items: center;
    }
    .launcher-shell {
      overflow: hidden;
      border: 1px solid var(--ob-border);
      border-radius: 12px;
      background: var(--ob-surface);
      box-shadow: var(--ob-shadow-lg);
    }
    .launcher-header, .launcher-footer, .launcher-layout, .launcher-action-heading,
    .launcher-actions, .launcher-links, .launcher-command-head, .launcher-status,
    .launcher-brand, .launcher-header-meta, .ob-button {
      display: flex;
      align-items: center;
    }
    .launcher-header {
      justify-content: space-between;
      gap: 16px;
      min-height: 68px;
      padding: 16px 22px;
      border-bottom: 1px solid var(--ob-border);
    }
    .launcher-brand { gap: 14px; min-width: 0; }
    .launcher-logo { display: block; width: 128px; height: auto; }
    .launcher-product {
      padding-left: 14px;
      border-left: 1px solid var(--ob-border);
      color: var(--ob-ink-strong);
      font-size: 14px;
      font-weight: 600;
    }
    .launcher-header-meta { justify-content: flex-end; gap: 6px; }
    .ob-badge {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 4px 8px;
      border-radius: 999px;
      background: #f4f4f4;
      color: var(--ob-ink-soft);
      font: 600 10px/1 var(--ob-font-mono);
      text-transform: uppercase;
    }
    .launcher-layout { align-items: stretch; }
    .launcher-action, .launcher-manual { min-width: 0; padding: 30px 32px; }
    .launcher-action { flex: 1.08 1 0; }
    .launcher-manual {
      flex: 0.92 1 0;
      border-left: 1px solid var(--ob-border);
      background: var(--ob-surface-2);
    }
    .launcher-action-heading { align-items: flex-start; gap: 14px; }
    .launcher-action-icon {
      display: inline-flex;
      width: 42px;
      height: 42px;
      flex: none;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: var(--ob-blue-050);
      color: var(--ob-blue);
    }
    .ob-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: 'Phosphor';
      font-style: normal;
      font-weight: normal;
      line-height: 1;
    }
    .launcher-action-icon .ob-icon { font-size: 20px; }
    .launcher-eyebrow {
      margin: 1px 0 4px;
      color: var(--ob-ink-soft);
      font: 500 10px/1.2 var(--ob-font-mono);
      text-transform: uppercase;
    }
    .launcher-title {
      margin: 0;
      color: var(--ob-ink-strong);
      font-size: 30px;
      font-weight: 700;
      line-height: 1.05;
    }
    .launcher-copy {
      max-width: 520px;
      margin: 20px 0 0;
      color: var(--ob-ink-soft);
      font-size: 14px;
      line-height: 1.6;
    }
    .launcher-status {
      align-items: flex-start;
      gap: 10px;
      margin-top: 22px;
      padding: 12px;
      border: 1px solid var(--ob-border);
      border-radius: 8px;
      background: var(--ob-surface-2);
    }
    .launcher-status-dot {
      width: 6px;
      height: 6px;
      margin-top: 6px;
      flex: none;
      border-radius: 999px;
      background: var(--ob-blue);
    }
    .launcher-status[data-tone='orange'] .launcher-status-dot { background: var(--ob-orange); }
    .launcher-status-copy { display: grid; gap: 3px; min-width: 0; }
    .launcher-status-label {
      color: var(--ob-ink-soft);
      font: 500 10px/1.2 var(--ob-font-mono);
      text-transform: uppercase;
    }
    .launcher-status strong {
      color: var(--ob-ink-strong);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.45;
    }
    .launcher-status small {
      color: var(--ob-ink-soft);
      font-size: 11px;
      line-height: 1.45;
    }
    .launcher-actions { gap: 8px; margin-top: 20px; }
    .ob-button {
      justify-content: center;
      gap: 8px;
      min-height: 36px;
      margin: 0;
      padding: 9px 12px;
      border: 1.5px solid var(--ob-border);
      border-radius: 8px;
      background: var(--ob-surface);
      color: var(--ob-ink-strong);
      font-family: var(--ob-font);
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      text-decoration: none;
      transition: background 120ms var(--ob-ease), border-color 120ms var(--ob-ease), box-shadow 120ms var(--ob-ease), color 120ms var(--ob-ease);
    }
    .ob-button:hover { border-color: var(--ob-ink-soft); }
    .ob-button.primary {
      border-color: var(--ob-blue);
      background: var(--ob-blue);
      color: #fff;
    }
    .ob-button.primary:hover { background: var(--ob-blue-700); box-shadow: var(--ob-shadow-pop); }
    .ob-button.ghost { border-color: transparent; background: transparent; color: var(--ob-blue); }
    .ob-button.ghost:hover { background: var(--ob-blue-100); }
    .ob-button.compact { min-height: 28px; padding: 6px 10px; gap: 6px; font-size: 11px; }
    .launcher-open { min-width: 168px; }
    .launcher-manual-heading h2 { margin: 0; color: var(--ob-ink-strong); font-size: 18px; }
    .launcher-manual-heading .manual-copy {
      margin: 6px 0 0;
      color: var(--ob-ink-soft);
      font-size: 12px;
      line-height: 1.6;
    }
    .launcher-commands { display: grid; margin-top: 18px; border-top: 1px solid var(--ob-border); }
    .launcher-command { display: grid; gap: 9px; padding: 14px 0; border-bottom: 1px solid var(--ob-border); }
    .launcher-command-head { justify-content: space-between; gap: 10px; }
    .launcher-command-head strong {
      min-width: 0;
      color: var(--ob-ink-strong);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.45;
    }
    .launcher-command code {
      display: block;
      max-height: 154px;
      overflow: auto;
      padding: 10px;
      border: 1px solid var(--ob-border);
      border-radius: 8px;
      background: var(--ob-surface);
      color: var(--ob-ink-strong);
      font: 500 11px/1.55 var(--ob-font-mono);
      overflow-wrap: anywhere;
      user-select: all;
    }
    .launcher-footer {
      justify-content: space-between;
      gap: 16px;
      padding: 14px 22px;
      border-top: 1px solid var(--ob-border);
      color: var(--ob-ink-soft);
      font-size: 11px;
    }
    .launcher-links { flex-wrap: wrap; justify-content: flex-end; gap: 2px; }
    .launcher-protocol-transport {
      position: fixed;
      width: 1px;
      height: 1px;
      inset: -1px auto auto -1px;
      border: 0;
      opacity: 0;
      pointer-events: none;
    }
    @media (max-width: 760px) {
      body { min-width: 0; }
      .launcher { width: min(100% - 20px, 980px); padding: 14px 0; }
      .launcher-header, .launcher-footer { align-items: flex-start; flex-direction: column; }
      .launcher-header-meta, .launcher-links { justify-content: flex-start; }
      .launcher-layout { display: block; }
      .launcher-action, .launcher-manual { padding: 24px 20px; }
      .launcher-manual { border-top: 1px solid var(--ob-border); border-left: 0; }
      .launcher-title { font-size: 26px; }
      .launcher-open { width: 100%; }
    }
  </style>
</head>
<body>
  <main class="launcher">
    <section class="launcher-shell" aria-labelledby="launcher-title">
      <header class="launcher-header">
        <div class="launcher-brand">
          <img class="launcher-logo" src="/updates/assets/onblide-horizontal-primary.svg" alt="Onblide">
          <span class="launcher-product">OnFrame</span>
        </div>
        <div class="launcher-header-meta">
          <span class="ob-badge">Atualização local</span>
        </div>
      </header>

      <div class="launcher-layout">
        <section class="launcher-action" aria-labelledby="launcher-title">
          <div class="launcher-action-heading">
            <span class="launcher-action-icon" id="launcher-action-icon" aria-hidden="true"></span>
            <div>
              <p class="launcher-eyebrow">Atualização local</p>
              <h1 class="launcher-title" id="launcher-title">Atualizar OnFrame</h1>
            </div>
          </div>

          <p class="launcher-copy">Estamos solicitando a abertura do atualizador local registrado neste computador.</p>

          <div class="launcher-status" id="launcher-status" data-tone="blue" role="status" aria-live="polite">
            <span class="launcher-status-dot" aria-hidden="true"></span>
            <div class="launcher-status-copy">
              <span class="launcher-status-label" id="launcher-status-label">Abrindo automaticamente</span>
              <strong id="launcher-status-text">Tentando abrir o atualizador do OnFrame...</strong>
              <small id="launcher-status-detail">Você pode fechar esta janela quando a ação for iniciada.</small>
            </div>
          </div>

          <div class="launcher-actions">
            <button class="ob-button primary launcher-open" type="button" id="open-updater-button">Tentar novamente</button>
          </div>
        </section>

        <section class="launcher-manual" aria-labelledby="launcher-manual-title">
          <div class="launcher-manual-heading">
            <p class="launcher-eyebrow">Alternativa manual</p>
            <h2 id="launcher-manual-title">Se o controle não abrir</h2>
            <p class="manual-copy" id="launcher-manual-copy"></p>
          </div>
          <div class="launcher-commands" id="launcher-commands"></div>
        </section>
      </div>

      <footer class="launcher-footer">
        <span>Gerenciar a extensão no navegador</span>
        <nav class="launcher-links" aria-label="Atalhos do navegador">
          <a class="ob-button ghost compact" href="chrome://extensions/">Chrome</a>
          <a class="ob-button ghost compact" href="edge://extensions/">Microsoft Edge</a>
        </nav>
      </footer>
    </section>
  </main>
  <script>
    const pageData = ${serialized};
    const glyphs = { refresh: '\\ue036', copy: '\\ue1ca', arrowSquareOut: '\\ue5de' };
    const elements = {
      actionIcon: document.getElementById('launcher-action-icon'),
      status: document.getElementById('launcher-status'),
      statusLabel: document.getElementById('launcher-status-label'),
      statusText: document.getElementById('launcher-status-text'),
      statusDetail: document.getElementById('launcher-status-detail'),
      open: document.getElementById('open-updater-button'),
      manualCopy: document.getElementById('launcher-manual-copy'),
      commands: document.getElementById('launcher-commands')
    };
    let leftPage = false;
    let recoveryVisible = false;
    let protocolFrame = null;
    let protocolFrameTimer = null;

    function createIcon(name) {
      const icon = document.createElement('i');
      icon.className = 'ob-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = glyphs[name] || '';
      return icon;
    }

    function setButtonContent(button, iconName, label) {
      button.replaceChildren(createIcon(iconName), document.createTextNode(label));
    }

    function renderCommands() {
      const cards = [
        { key: 'update', label: 'Atualizar OnFrame', command: pageData.updateCommand },
        { key: 'check', label: 'Verificar instalação', command: pageData.checkCommand }
      ];
      if (recoveryVisible) {
        cards.push({ key: 'repair', label: 'Reparar instalação', command: pageData.repairCommand });
      }

      elements.commands.replaceChildren(...cards.map((card) => createCommand(card)));
    }

    function createCommand(card) {
      const article = document.createElement('article');
      article.className = 'launcher-command';
      const heading = document.createElement('div');
      heading.className = 'launcher-command-head';
      const label = document.createElement('strong');
      label.textContent = card.label;
      const copy = document.createElement('button');
      copy.className = 'ob-button compact';
      copy.type = 'button';
      copy.dataset.copy = card.key;
      setButtonContent(copy, 'copy', pageData.messages.copy);
      copy.addEventListener('click', () => void copyCommand(copy));
      heading.append(label, copy);
      const code = document.createElement('code');
      code.textContent = card.command || 'Comando indisponível.';
      article.append(heading, code);
      return article;
    }

    function showInitial() {
      recoveryVisible = false;
      renderCommands();
      elements.status.dataset.tone = 'blue';
      elements.statusLabel.textContent = 'Abrindo automaticamente';
      elements.statusText.textContent = pageData.messages.trying;
      elements.statusDetail.textContent = 'Você pode fechar esta janela quando a ação for iniciada.';
    }

    function showFallback() {
      recoveryVisible = true;
      renderCommands();
      elements.status.dataset.tone = 'orange';
      elements.statusLabel.textContent = 'Ação manual necessária';
      elements.statusText.textContent = 'Não foi possível confirmar a abertura do controle local';
      elements.statusDetail.textContent = pageData.messages.fallback + ' Use “Reparar instalação” se o atalho por um clique não estiver disponível.';
    }

    function launchProtocol() {
      if (protocolFrame) protocolFrame.remove();
      if (protocolFrameTimer) window.clearTimeout(protocolFrameTimer);
      protocolFrame = document.createElement('iframe');
      protocolFrame.className = 'launcher-protocol-transport';
      protocolFrame.setAttribute('aria-hidden', 'true');
      protocolFrame.tabIndex = -1;
      protocolFrame.src = pageData.protocolUrl;
      document.body.appendChild(protocolFrame);
      protocolFrameTimer = window.setTimeout(() => {
        if (protocolFrame) protocolFrame.remove();
        protocolFrame = null;
        protocolFrameTimer = null;
      }, 2200);
    }

    function openUpdater() {
      if (!pageData.canOpenUpdater) {
        showFallback();
        return;
      }
      leftPage = false;
      showInitial();
      launchProtocol();
      window.setTimeout(() => {
        if (!leftPage) showFallback();
      }, 1800);
    }

    async function copyCommand(button) {
      const command = pageData[button.dataset.copy + 'Command'] || '';
      try {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw new Error('clipboard_unavailable');
        await navigator.clipboard.writeText(command);
        setButtonContent(button, 'copy', pageData.messages.copied);
        window.setTimeout(() => setButtonContent(button, 'copy', pageData.messages.copy), 1400);
      } catch (error) {
        const code = button.closest('.launcher-command')?.querySelector('code');
        if (!code) return;
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    elements.actionIcon.appendChild(createIcon('refresh'));
    setButtonContent(elements.open, 'arrowSquareOut', 'Tentar novamente');
    elements.manualCopy.textContent = 'Copie o comando adequado e execute-o no ' + pageData.shellLabel + '.';
    elements.open.addEventListener('click', openUpdater);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) leftPage = true;
    });
    window.addEventListener('blur', () => {
      leftPage = true;
    });
    showInitial();
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
