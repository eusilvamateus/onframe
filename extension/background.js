const REMOTE_SERVICE = 'https://onframe.onblide.com';
const REMOTE_SESSION_KEY = 'onframeRemoteSession';
const REMOTE_AUTH_FLOW_KEY = 'onframeRemoteAuthFlow';
const REMOTE_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SUPABASE_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9._-]{20,4096}$/u;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

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
      error: 'Não consegui acessar o OnFrame remoto.',
      technicalError: err && err.message ? err.message : String(err)
    }));
  return true;
});

async function handleRemoteMessage(message) {
  const action = String(message.action || '');
  if (action === 'status') return getRemoteConnection();
  if (action === 'authenticate') return authenticateRemoteConnection(message.accessToken);
  if (action === 'identity-sync') return synchronizeRemoteIdentity(message.accessToken, message.disconnect === true);
  if (action === 'auth-flow-start') return startExtensionAuthFlow();
  if (action === 'disconnect') return disconnectRemoteConnection();
  if (action === 'accounts') return listRemoteAccounts();
  if (action === 'oauth-start') return startRemoteAuth();
  if (action === 'account-update') return updateRemoteAccount(message.userId, message.enabled);
  if (action === 'account-remove') return removeRemoteAccount(message.userId);
  if (action === 'app-overview') return requestPlatform('/v1/app/overview');
  if (action === 'workspaces') return requestPlatform('/v1/app/workspaces');
  if (action === 'workspace-activate') return activateWorkspace(message.workspaceId);
  if (action === 'workspace-leave') return leaveWorkspace();
  if (action === 'profile') return requestPlatform('/v1/profile');
  if (action === 'security') return loadAccountSecurity();
  if (action === 'security-session-remove') return requestPlatform(`/v1/security/sessions/${encodeURIComponent(String(message.sessionId || ''))}`, { method: 'DELETE' });
  if (action === 'security-sessions-remove-all') {
    const result = await requestPlatform('/v1/security/sessions', { method: 'DELETE' });
    await removeRemoteSession();
    await removePendingAuthFlow();
    return result;
  }
  if (action === 'profile-update') return requestPlatform('/v1/profile', { method: 'PATCH', body: JSON.stringify(message.payload || {}) });
  if (action === 'profile-avatar') return requestPlatform('/v1/profile/avatar', { method: 'POST', body: JSON.stringify({ dataUrl: message.dataUrl }) });
  if (action === 'profile-avatar-remove') return requestPlatform('/v1/profile/avatar', { method: 'DELETE' });
  if (action === 'profile-session-remove') return requestPlatform(`/v1/profile/sessions/${encodeURIComponent(String(message.sessionId || ''))}`, { method: 'DELETE' });
  if (action === 'members') return requestPlatform('/v1/members');
  if (action === 'member-update') return requestPlatform(`/v1/members/${encodeURIComponent(String(message.userId || ''))}`, { method: 'PATCH', body: JSON.stringify(message.payload || {}) });
  if (action === 'member-remove') return requestPlatform(`/v1/members/${encodeURIComponent(String(message.userId || ''))}`, { method: 'DELETE' });
  if (action === 'invitations') return requestPlatform('/v1/invitations');
  if (action === 'invitation-create') return requestPlatform('/v1/invitations', { method: 'POST', body: JSON.stringify(message.payload || {}) });
  if (action === 'invitation-revoke') return requestPlatform(`/v1/invitations/${encodeURIComponent(String(message.invitationId || ''))}`, { method: 'DELETE' });
  if (action === 'invitation-accept') return acceptWorkspaceInvitation(message.token);
  const failure = new Error('Ação remota inválida.');
  failure.code = 'remote_action_unsupported';
  throw failure;
}

async function loadAccountSecurity() {
  const config = await requestRemote('/v1/auth/config');
  if (config.capabilities?.accountSecurity !== 1) {
    const failure = new Error('Os novos recursos de segurança ainda não estão disponíveis no servidor conectado.');
    failure.code = 'security_backend_unavailable';
    throw failure;
  }
  try {
    const overview = await requestPlatform('/v1/security');
    if (!Array.isArray(overview.sessions) || !Array.isArray(overview.factors) || !Array.isArray(overview.passkeys)) {
      const failure = new Error('Não foi possível carregar os dados de segurança.');
      failure.code = 'security_data_unavailable';
      throw failure;
    }
    return overview;
  } catch (error) {
    if (error.status === 404 && error.code === 'not_found') error.code = 'security_backend_unavailable';
    throw error;
  }
}

async function authenticateRemoteConnection(value) {
  const accessToken = String(value || '').trim();
  if (!SUPABASE_ACCESS_TOKEN_PATTERN.test(accessToken)) {
    throw new Error('A sessão de acesso recebida é inválida.');
  }

  const claim = await requestRemote('/v1/extension-sessions/from-auth', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
    body: '{}'
  });

  const session = normalizeRemoteSession(claim);
  await writeRemoteSession(session);
  await removePendingAuthFlow();

  try {
    return await getRemoteConnection();
  } catch (error) {
    await removeRemoteSession();
    throw error;
  }
}

async function synchronizeRemoteIdentity(value, disconnect = false) {
  const accessToken = String(value || '').trim();
  if (!SUPABASE_ACCESS_TOKEN_PATTERN.test(accessToken)) throw new Error('A sessão de acesso recebida é inválida.');
  try {
    // O token do provedor e temporario e nao substitui a sessao operacional.
    return await requestRemote('/v1/identity/synchronize', {
      method: 'POST', headers: { authorization: `Bearer ${accessToken}` }, body: '{}'
    });
  } finally {
    if (disconnect) {
      await removeRemoteSession();
      await removePendingAuthFlow();
    }
  }
}

async function startExtensionAuthFlow() {
  const result = await requestRemote('/v1/extension-auth-flows', {
    method: 'POST',
    body: '{}'
  });
  const flow = normalizePendingAuthFlow(result);
  await storageSet({ [REMOTE_AUTH_FLOW_KEY]: flow });
  return {
    expiresAt: flow.expiresAt,
    redirectTo: `${REMOTE_SERVICE}/connect?flow=${encodeURIComponent(flow.token)}`
  };
}

async function getRemoteConnection() {
  let session = await readRemoteSession();
  if (!session) {
    const pending = await consumePendingAuthFlow();
    if (pending.status === 'pending') {
      return { connected: false, reason: 'auth_pending', expiresAt: pending.expiresAt };
    }
    session = pending.session;
  }
  if (!session) return { connected: false };

  if (isRemoteSessionExpired(session)) {
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
  if (!session) {
    await removePendingAuthFlow();
    return { connected: false };
  }

  try {
    await requestRemote('/v1/extension-session', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${session.token}` }
    });
  } catch (error) {
    if (!error || error.status !== 401) throw error;
  }

  await removeRemoteSession();
  await removePendingAuthFlow();
  return { connected: false };
}

async function listRemoteAccounts() {
  const session = await requireRemoteSession();
  try {
    const result = await requestRemote('/v1/accounts', {
      headers: { authorization: `Bearer ${session.token}` }
    });
    return { accounts: normalizeRemoteAccounts(result && result.accounts) };
  } catch (error) {
    if (error && error.status === 401) await removeRemoteSession();
    throw error;
  }
}

async function updateRemoteAccount(userId, enabled) {
  const session = await requireRemoteSession();
  const result = await requestRemote(`/v1/accounts/${encodeURIComponent(normalizeRemoteAccountUserId(userId))}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ enabled: Boolean(enabled) })
  });
  return { accounts: normalizeRemoteAccounts(result && result.accounts) };
}

async function removeRemoteAccount(userId) {
  const session = await requireRemoteSession();
  const result = await requestRemote(`/v1/accounts/${encodeURIComponent(normalizeRemoteAccountUserId(userId))}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${session.token}` }
  });
  return { accounts: normalizeRemoteAccounts(result && result.accounts) };
}

async function requestPlatform(path, options = {}) {
  const session = await requireRemoteSession();
  try {
    return await requestRemote(path, Object.assign({}, options, {
      headers: Object.assign({}, options.headers || {}, { authorization: `Bearer ${session.token}` })
    }));
  } catch (error) {
    if (error && error.status === 401) await removeRemoteSession();
    throw error;
  }
}

async function activateWorkspace(workspaceId) {
  const session = await requireRemoteSession();
  const id = String(workspaceId || '').trim();
  if (!id) throw new Error('Workspace inválido.');
  const result = await requestRemote(`/v1/app/workspaces/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.token}` },
    body: '{}'
  });
  const nextSession = normalizeRemoteSession(result);
  await writeRemoteSession(nextSession);
  return getRemoteConnection();
}

async function leaveWorkspace() {
  const result = await requestPlatform('/v1/app/workspaces/current/membership', { method: 'DELETE' });
  if (result.token) await writeRemoteSession(normalizeRemoteSession(result));
  else await removeRemoteSession();
  return getRemoteConnection();
}

async function acceptWorkspaceInvitation(token) {
  const session = await requireRemoteSession();
  const value = String(token || '').trim();
  if (!REMOTE_SESSION_TOKEN_PATTERN.test(value)) throw new Error('Convite inválido.');
  const result = await requestRemote(`/v1/invitations/accept/${encodeURIComponent(value)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.token}` },
    body: '{}'
  });
  await writeRemoteSession(normalizeRemoteSession(result));
  return getRemoteConnection();
}

function normalizeRemoteAccountUserId(value) {
  const userId = String(value || '').trim();
  if (!/^\d+$/u.test(userId)) {
    const error = new Error('Conta do Mercado Livre inválida.');
    error.code = 'invalid_account_id';
    error.status = 400;
    throw error;
  }
  return userId;
}

function normalizeRemoteAccounts(value) {
  if (!Array.isArray(value)) return [];
  return value.map((account) => ({
    id: account && account.id ? String(account.id) : '',
    user_id: account && account.userId ? String(account.userId) : '',
    nickname: account && account.nickname ? String(account.nickname) : '',
    permalink: account && account.profileUrl ? String(account.profileUrl) : '',
    logo: account && account.logoUrl ? String(account.logoUrl) : '',
    enabled: !(account && account.enabled === false)
  })).filter((account) => account.user_id);
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
  if (!session || isRemoteSessionExpired(session)) {
    await removeRemoteSession();
    const error = new Error('A sessão desta extensão não é mais válida.');
    error.code = 'extension_session_unauthorized';
    error.status = 401;
    throw error;
  }
  return session;
}

function normalizePendingAuthFlow(payload) {
  const token = String(payload && payload.flow || '');
  const expiresAt = String(payload && payload.expiresAt || '');
  if (!REMOTE_SESSION_TOKEN_PATTERN.test(token) || !Number.isFinite(Date.parse(expiresAt))) {
    const error = new Error('O OnFrame remoto retornou um fluxo de acesso inválido.');
    error.code = 'invalid_remote_auth_flow';
    throw error;
  }
  return { token, expiresAt };
}

function normalizeStoredPendingAuthFlow(value) {
  if (!value || typeof value !== 'object') return null;
  const token = String(value.token || '');
  const expiresAt = String(value.expiresAt || '');
  if (!REMOTE_SESSION_TOKEN_PATTERN.test(token) || !Number.isFinite(Date.parse(expiresAt))) return null;
  return { token, expiresAt };
}

async function consumePendingAuthFlow() {
  const flow = await readPendingAuthFlow();
  if (!flow) return { status: 'absent', session: null };
  if (Date.parse(flow.expiresAt) <= Date.now()) {
    await removePendingAuthFlow();
    return { status: 'absent', session: null };
  }

  try {
    const result = await requestRemote(`/v1/extension-auth-flows/${encodeURIComponent(flow.token)}`);
    if (result && result.status === 'pending') {
      return { status: 'pending', expiresAt: flow.expiresAt, session: null };
    }
    if (!result || result.status !== 'authenticated') {
      throw new Error('O OnFrame remoto retornou um fluxo de acesso inválido.');
    }
    const session = normalizeRemoteSession(result);
    await writeRemoteSession(session);
    await removePendingAuthFlow();
    return { status: 'authenticated', session };
  } catch (error) {
    if (error && (error.status === 404 || error.status === 409)) {
      await removePendingAuthFlow();
      return { status: 'absent', session: null };
    }
    throw error;
  }
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
    user: {
      id: String(user.id || ''),
      email: String(user.email),
      name: String(user.name || user.email),
      avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : ''
    },
    workspace: {
      id: String(workspace.id || ''),
      name: String(workspace.name),
      role: workspace.role === 'admin' ? 'admin' : 'collaborator'
    }
  };
}

async function requestRemote(path, options = {}) {
  const result = await requestRemoteResponse(path, options);
  return result.body;
}

async function requestRemoteResponse(path, options = {}) {
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
    const code = body && (body.code || body.error) ? (body.code || body.error) : 'remote_request_failed';
    const failure = new Error(remoteErrorMessage(code, response.status, body && body.error));
    failure.code = code;
    failure.status = response.status;
    failure.technicalError = failure.code;
    throw failure;
  }
  return {
    body: body || {},
    status: response.status
  };
}

function remoteErrorMessage(code, status, fallbackMessage) {
  if (code === 'auth_flow_unavailable') return 'Esse link de acesso expirou ou já foi usado. Solicite outro pela extensão.';
  if (code === 'extension_session_unauthorized') return 'A sessão desta extensão não é mais válida.';
  if (code === 'remote_oauth_unconfigured') return 'A conexão remota do Mercado Livre ainda não está configurada.';
  if (code === 'workspace_account_access_forbidden') return 'Seu acesso não pode conectar contas ao workspace.';
  if (code === 'workspace_admin_required') return 'Esta ação exige uma pessoa administradora do workspace.';
  if (code === 'workspace_last_admin_required') return 'O workspace precisa manter pelo menos uma pessoa administradora.';
  if (code === 'workspace_self_management_forbidden') return 'Use a ação Sair do workspace para encerrar sua participação.';
  if (code === 'workspace_already_member') return 'Esta pessoa já participa do workspace.';
  if (code === 'workspace_access_forbidden') return 'Você não tem acesso a este workspace.';
  if (code === 'workspace_invitation_delivery_failed') return 'Não foi possível enviar o convite agora. Tente novamente.';
  if (code === 'avatar_storage_unconfigured') return 'O envio de avatar ainda não foi configurado.';
  if (code === 'avatar_storage_authorization_failed') return 'O serviço de imagens não aceitou a configuração atual. Tente novamente mais tarde.';
  if (code === 'avatar_storage_bucket_unavailable') return 'O armazenamento de imagens está indisponível no momento. Tente novamente mais tarde.';
  if (code === 'avatar_storage_unavailable') return 'O armazenamento de imagens está indisponível no momento. Tente novamente mais tarde.';
  if (code === 'avatar_upload_failed') return 'Não foi possível enviar a imagem agora. Tente novamente.';
  if (code === 'avatar_profile_update_failed') return 'A imagem foi recebida, mas não foi possível atualizar seu perfil. Tente novamente.';
  if (code === 'avatar_too_large') return 'Escolha uma imagem de até 2 MB.';
  if (code === 'invalid_avatar') return 'Escolha uma imagem PNG, JPEG ou WebP válida.';
  if (code === 'workspace_account_unavailable') return 'Nenhuma conta do Mercado Livre está conectada neste workspace.';
  if (code === 'workspace_accounts_disabled') return 'Nenhuma conta habilitada para detectar anúncios.';
  if (code === 'remote_credentials_unavailable') return 'A conta remota precisa ser conectada novamente.';
  if (typeof fallbackMessage === 'string' && fallbackMessage.trim() && !/^[a-z_]+$/u.test(fallbackMessage)) {
    return fallbackMessage;
  }
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

function readPendingAuthFlow() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get({ [REMOTE_AUTH_FLOW_KEY]: null }, (result) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message || 'Não foi possível ler o acesso pendente.'));
        return;
      }
      resolve(normalizeStoredPendingAuthFlow(result && result[REMOTE_AUTH_FLOW_KEY]));
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

function removePendingAuthFlow() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(REMOTE_AUTH_FLOW_KEY, () => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message || 'Não foi possível remover o acesso pendente.'));
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
  if (!path.startsWith('/api/')) {
    return {
      ok: false,
      status: 404,
      error: 'Endpoint da extensão não encontrado.',
      code: 'endpoint_not_found'
    };
  }

  const remoteSession = await readRemoteSession();
  if (!remoteSession || isRemoteSessionExpired(remoteSession)) {
    if (remoteSession) await removeRemoteSession();
    return {
      ok: false,
      status: 401,
      error: 'Entre na extensão do OnFrame para editar anúncios.',
      code: 'extension_session_unauthorized',
      technicalError: remoteSession ? 'extension_session_expired' : 'extension_session_missing'
    };
  }
  return handleRemoteApiMessage(path, options, remoteSession);
}

function isRemoteSessionExpired(session) {
  const expiresAt = Date.parse(String(session && session.expiresAt || ''));
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

async function handleRemoteApiMessage(path, options, session) {
  try {
    const response = await requestRemoteResponse(`/v1${path}`, {
      method: options.method,
      headers: Object.assign({}, options.headers || {}, {
        authorization: `Bearer ${session.token}`
      }),
      body: options.body
    });
    const body = response.body || {};
    return {
      ok: true,
      status: response.status,
      requestId: body.requestId || '',
      body
    };
  } catch (error) {
    if (error && error.status === 401) await removeRemoteSession();
    return {
      ok: false,
      status: error && error.status ? error.status : 0,
      error: error && error.message ? error.message : 'Não consegui acessar o OnFrame remoto.',
      code: error && error.code ? error.code : '',
      technicalError: error && error.technicalError ? error.technicalError : (error && error.message ? error.message : String(error))
    };
  }
}

function normalizePath(value) {
  const path = String(value || '');
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Caminho da extensão inválido.');
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
