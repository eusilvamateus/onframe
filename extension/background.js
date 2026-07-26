const SERVICE = 'http://127.0.0.1:4765';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'onframe:api') return false;

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
