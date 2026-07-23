const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { MercadoLivreClient } = require('./meli-client');
const { TokenStore } = require('./token-store');
const { ownerUserIdFromUrl, resolveItemClient } = require('./account-client');
const { createUpdateManager } = require('./update-manager');
const { sanitizeError, userFriendlyError } = require('./errors');
const { handleResolve } = require('./routes/items');
const {
  handlePriceSummary,
  handleStandardPriceUpdate
} = require('./routes/pricing');
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
  const updateManager = options.updateManager || createUpdateManager({ env });
  const pendingAuth = new Map();
  const startedAt = new Date();

  return http.createServer(async (req, res) => {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return sendJson(res, 204, null);

    try {
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
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

      return sendJson(res, 404, { error: 'Endpoint nao encontrado.' });
    } catch (err) {
      const status = err && err.statusCode ? err.statusCode : 500;
      const technicalError = sanitizeError(err);
      return sendJson(res, status, {
        error: userFriendlyError(err, technicalError, status),
        technicalError
      });
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
  const envFilePath = path.resolve(__dirname, '..', '..', '.env');
  const token = await safeReadToken(store);
  const expiresAt = token && token.expires_at ? Number(token.expires_at) : null;
  const now = Date.now();
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
      arch: process.arch,
      pid: process.pid,
      cwd: process.cwd()
    },
    config: {
      envFileExists: fs.existsSync(envFilePath),
      envFilePath,
      connectBaseUrl: env.ONBLIDE_CONNECT_BASE_URL || DEFAULT_CONNECT_BASE_URL,
      tokenSecretConfigured: hasValue(env.ONBLIDE_TOKEN_SECRET)
    },
    auth: {
      tokenPresent: Boolean(token && token.refresh_token),
      userId: token && token.user_id ? token.user_id : null,
      expiresAt,
      expiresInMs: expiresAt ? expiresAt - now : null,
      expired: expiresAt ? expiresAt <= now : false,
      expiringSoon: expiresAt ? expiresAt <= now + 30 * 60 * 1000 : false
    },
    paths: {
      tokenStore: store && store.filePath ? store.filePath : null
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
  if (!actions.length) actions.push('Pronto para editar fotos.');
  return actions;
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
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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

function setCorsHeaders(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
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
