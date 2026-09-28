const SERVICE = 'http://127.0.0.1:4765';
const REMOTE_SERVICE = 'https://onframe.onblide.com';
const REMOTE_SESSION_KEY = 'onframeRemoteSession';
const PAIRING_CODE_PATTERN = /^OF-[A-Za-z0-9_-]{24}$/u;
const REMOTE_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'onframe:openLauncher') {
    openLauncher(message.action)
      .then((payload) => sendResponse(payload))
      .catch((err) => sendResponse({
        ok: false,
        error: err && err.message ? err.message : 'Não consegui abrir o controle local.'
      }));
    return true;
  }

  if (message.type === 'onframe:remote') {
    handleRemoteMessage(message)
      .then((payload) => sendResponse({ ok: true, body: payload }))
      .catch((err) => sendResponse({
        ok: false,
        error: err && err.message ? err.message : 'Não consegui acessar o OnFrame remoto.',
        code: err && err.code ? err.code : '',
        technicalError: err && err.technicalError ? err.technicalError : (err && err.message ? err.message : String(err))
      }));
    return true;
  }

  if (message.type !== 'onframe:api') return false;

  handleApiMessage(message)
    .then((payload) => sendResponse(payload))
    .catch((err) => sendResponse({
      ok: false,
      status: 0,
      error: 'Serviço local desligado. Abra o OnFrame.',
      technicalError: err && err.message ? err.message : String(err)
    }));
  return true;
});

async function openLauncher(action) {
  const name = String(action || '').toLowerCase();
  if (!['start', 'stop', 'restart', 'check', 'update'].includes(name)) {
    throw new Error('Ação local inválida.');
  }
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`ui/launcher/index.html?action=${encodeURIComponent(name)}`)
  });
  return { ok: true };
}

async function handleRemoteMessage(message) {
  const action = String(message.action || '');
  if (action === 'status') return getRemoteConnection();
  if (action === 'claim') return claimRemoteConnection(message.pairingCode);
  if (action === 'disconnect') return disconnectRemoteConnection();
  if (action === 'accounts') return listRemoteAccounts();
  if (action === 'oauth-start') return startRemoteAuth();
  throw new Error('Ação remota inválida.');
}

async function claimRemoteConnection(value) {
  const pairingCode = String(value || '').trim();
  if (!PAIRING_CODE_PATTERN.test(pairingCode)) {
    throw new Error('Informe um código de pareamento válido.');
  }

  const claim = await requestRemote('/v1/extension-sessions', {
    method: 'POST',
    body: JSON.stringify({
      pairingCode,
      label: 'Extensão OnFrame'
    })
  });

  const session = normalizeRemoteSession(claim);
  await writeRemoteSession(session);

  try {
    return await getRemoteConnection();
  } catch (error) {
    await removeRemoteSession();
    throw error;
  }
}

async function getRemoteConnection() {
  const session = await readRemoteSession();
  if (!session) return { connected: false };

  if (Date.parse(session.expiresAt) <= Date.now()) {
    await removeRemoteSession();
    return { connected: false, reason: 'expired' };
  }

  try {
    const context = await requestRemote('/v1/extension-session', {
      headers: { authorization: `Bearer ${session.token}` }
    });
    return serializeRemoteConnection(session, context);
  } catch (error) {
    if (error && error.status === 401) {
      await removeRemoteSession();
      return { connected: false, reason: 'unauthorized' };
    }
    throw error;
  }
}

async function disconnectRemoteConnection() {
  const session = await readRemoteSession();
  if (!session) return { connected: false };

  try {
    await requestRemote('/v1/extension-session', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${session.token}` }
    });
  } catch (error) {
    if (!error || error.status !== 401) throw error;
  }

  await removeRemoteSession();
  return { connected: false };
}

async function listRemoteAccounts() {
  const session = await requireRemoteSession();
  try {
    const result = await requestRemote('/v1/accounts', {
      headers: { authorization: `Bearer ${session.token}` }
    });
    const accounts = result && Array.isArray(result.accounts) ? result.accounts : [];
    return { accounts };
  } catch (error) {
    if (error && error.status === 401) await removeRemoteSession();
    throw error;
  }
}

async function startRemoteAuth() {
  const session = await requireRemoteSession();
  let result;
  try {
    result = await requestRemote('/v1/mercadolivre/oauth/start', {
      method: 'POST',
      headers: { authorization: `Bearer ${session.token}` },
      body: '{}'
    });
  } catch (error) {
    if (error && error.status === 401) await removeRemoteSession();
    throw error;
  }
  const authUrl = String(result && result.authorizationUrl || '');
  if (!/^https:\/\/auth\.mercadolivre\.com\.br\/authorization\?/u.test(authUrl)) {
    const error = new Error('O OnFrame remoto retornou uma autorização inválida.');
    error.code = 'invalid_remote_authorization';
    throw error;
  }
  await chrome.tabs.create({ url: authUrl });
  return { started: true };
}

async function requireRemoteSession() {
  const session = await readRemoteSession();
  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    await removeRemoteSession();
    const error = new Error('A vinculação desta extensão não é mais válida.');
    error.code = 'extension_session_unauthorized';
    error.status = 401;
    throw error;
  }
  return session;
}

function normalizeRemoteSession(payload) {
  const token = String(payload && payload.token || '');
  const sessionId = String(payload && payload.sessionId || '');
  const expiresAt = String(payload && payload.expiresAt || '');
  if (!REMOTE_SESSION_TOKEN_PATTERN.test(token) || !sessionId || !Number.isFinite(Date.parse(expiresAt))) {
    const error = new Error('O OnFrame remoto retornou uma sessão inválida.');
    error.code = 'invalid_remote_session';
    throw error;
  }
  return { token, sessionId, expiresAt };
}

function serializeRemoteConnection(session, context) {
  const user = context && context.user && typeof context.user === 'object' ? context.user : null;
  const workspace = context && context.workspace && typeof context.workspace === 'object' ? context.workspace : null;
  if (!user || !workspace || !user.email || !workspace.name) {
    const error = new Error('O OnFrame remoto retornou um contexto inválido.');
    error.code = 'invalid_remote_context';
    throw error;
  }
  return {
    connected: true,
    expiresAt: session.expiresAt,
    user: {
      email: String(user.email),
      name: String(user.name || user.email)
    },
    workspace: {
      name: String(workspace.name)
    }
  };
}

async function requestRemote(path, options = {}) {
  let response;
  try {
    response = await fetch(`${REMOTE_SERVICE}${path}`, {
      method: options.method || 'GET',
      headers: Object.assign({
        accept: 'application/json',
        'content-type': 'application/json'
      }, options.headers || {}),
      body: options.body,
      cache: 'no-store',
      credentials: 'omit'
    });
  } catch (error) {
    const failure = new Error('Não foi possível acessar o OnFrame remoto.');
    failure.code = 'remote_unavailable';
    failure.technicalError = error && error.message ? error.message : String(error);
    throw failure;
  }

  const body = parseJson(await response.text());
  if (!response.ok) {
    const failure = new Error(remoteErrorMessage(body && body.error, response.status));
    failure.code = body && body.error ? body.error : 'remote_request_failed';
    failure.status = response.status;
    failure.technicalError = failure.code;
    throw failure;
  }
  return body || {};
}

function remoteErrorMessage(code, status) {
  if (code === 'invalid_pairing_code') return 'O código de pareamento é inválido.';
  if (code === 'pairing_unavailable') return 'Esse código expirou ou já foi usado. Gere outro código.';
  if (code === 'extension_session_unauthorized') return 'A vinculação desta extensão não é mais válida.';
  if (code === 'remote_oauth_unconfigured') return 'A conexão remota do Mercado Livre ainda não está configurada.';
  if (code === 'workspace_account_access_forbidden') return 'Seu acesso não pode conectar contas ao workspace.';
  return `Não foi possível acessar o OnFrame remoto. Código ${status}.`;
}

function readRemoteSession() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get({ [REMOTE_SESSION_KEY]: null }, (result) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message || 'Não foi possível ler a sessão remota.'));
        return;
      }
      const value = result && result[REMOTE_SESSION_KEY];
      if (!value || typeof value !== 'object') {
        resolve(null);
        return;
      }
      const session = normalizeStoredRemoteSession(value);
      resolve(session);
    });
  });
}

function normalizeStoredRemoteSession(value) {
  const token = String(value.token || '');
  const sessionId = String(value.sessionId || '');
  const expiresAt = String(value.expiresAt || '');
  if (!REMOTE_SESSION_TOKEN_PATTERN.test(token) || !sessionId || !Number.isFinite(Date.parse(expiresAt))) {
    return null;
  }
  return { token, sessionId, expiresAt };
}

function writeRemoteSession(session) {
  return storageSet({ [REMOTE_SESSION_KEY]: session });
}

function removeRemoteSession() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(REMOTE_SESSION_KEY, () => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message || 'Não foi possível remover a sessão remota.'));
        return;
      }
      resolve();
    });
  });
}

function storageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message || 'Não foi possível guardar a sessão remota.'));
        return;
      }
      resolve();
    });
  });
}

async function handleApiMessage(message) {
  const path = normalizePath(message.path);
  const options = normalizeRequestOptions(message.options);
  const response = await fetch(`${SERVICE}${path}`, options);
  const requestId = response.headers.get('x-onframe-request-id') || '';
  const text = await response.text();
  const body = parseJson(text);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: body && body.error ? body.error : `Falha na ação. Código ${response.status}.`,
      code: body && body.code ? body.code : '',
      requestId: body && body.requestId ? body.requestId : requestId
    };
  }

  return {
    ok: true,
    status: response.status,
    requestId,
    body: body || {}
  };
}

function normalizePath(value) {
  const path = String(value || '');
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Caminho local inválido.');
  }
  return path;
}

function normalizeRequestOptions(options) {
  const request = options && typeof options === 'object' ? options : {};
  const headers = Object.assign({}, request.headers || {}, {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-onframe-extension': '1'
  });
  const normalized = {
    method: request.method || 'GET',
    headers,
    cache: 'no-store',
    credentials: 'omit'
  };
  if (Object.prototype.hasOwnProperty.call(request, 'body')) {
    normalized.body = request.body;
  }
  return normalized;
}

function parseJson(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    return {};
  }
}
