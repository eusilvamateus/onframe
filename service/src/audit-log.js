const fs = require('fs/promises');
const path = require('path');

function createAuditLogger({ env, root } = {}) {
  const runtimeRoot = root || process.cwd();
  const filePath = env && env.ONFRAME_AUDIT_LOG_PATH
    ? env.ONFRAME_AUDIT_LOG_PATH
    : path.join(runtimeRoot, '.onframe', 'logs', 'security.log');

  return {
    async log(entry) {
      const safeEntry = sanitizeAuditEntry(entry);
      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(filePath, `${JSON.stringify(safeEntry)}\n`, 'utf8');
      } catch (err) {
        // Audit logging must not block the local editing workflow.
      }
    }
  };
}

function sanitizeAuditEntry(entry) {
  const normalized = {
    timestamp: new Date().toISOString(),
    requestId: safeString(entry && entry.requestId),
    origin: safeOrigin(entry && entry.origin),
    action: safeString(entry && entry.action),
    method: safeString(entry && entry.method),
    path: safePath(entry && entry.path),
    itemId: safeMlId(entry && entry.itemId),
    userId: safeId(entry && entry.userId),
    status: Number(entry && entry.status) || 0,
    result: entry && entry.result === 'success' ? 'success' : 'error',
    durationMs: Math.max(0, Number(entry && entry.durationMs) || 0)
  };
  if (entry && entry.errorCode) normalized.errorCode = safeString(entry.errorCode);
  return normalized;
}

function classifyRequest(method, pathname) {
  const route = `${method} ${pathname}`;
  if (route === 'GET /diagnostics') return 'diagnostics.read';
  if (route === 'GET /updates/status') return 'updates.status';
  if (route === 'GET /auth/status') return 'auth.status';
  if (route === 'GET /auth/account') return 'auth.account';
  if (route === 'GET /auth/accounts') return 'auth.accounts';
  if (route === 'POST /auth/start') return 'auth.start';
  if (route === 'GET /auth/mercadolivre/callback') return 'auth.callback';
  if (route === 'POST /auth/logout') return 'auth.logout';
  if (route === 'POST /auth/accounts/active') return 'auth.accounts.active';
  if (/^\/auth\/accounts\/[^/]+$/.test(pathname)) return 'auth.accounts.update';
  if (route === 'POST /api/resolve') return 'items.resolve';
  if (route === 'POST /api/resolve/quick') return 'items.resolve.quick';
  if (/\/pricing\/standard$/.test(pathname)) return 'pricing.standard.update';
  if (/\/pricing\/summary$/.test(pathname)) return 'pricing.summary';
  if (/\/bulk\/preview$/.test(pathname)) return 'bulk.preview';
  if (/\/bulk\/commit$/.test(pathname)) return 'bulk.commit';
  if (/\/description\/bulk$/.test(pathname)) return 'description.bulk.update';
  if (/\/description$/.test(pathname)) return method === 'GET' ? 'description.read' : 'description.update';
  if (/\/characteristics\/bulk$/.test(pathname)) return 'characteristics.bulk.update';
  if (/\/characteristics$/.test(pathname)) return method === 'GET' ? 'characteristics.read' : 'characteristics.update';
  if (/\/promotions\/summary$/.test(pathname)) return 'promotions.summary';
  if (/\/promotions\/estimate$/.test(pathname)) return 'promotions.estimate';
  if (/\/promotions\/offers$/.test(pathname)) return `promotions.offers.${method.toLowerCase()}`;
  if (pathname === '/api/promotions/campaigns') return `promotions.campaigns.${method.toLowerCase()}`;
  if (/^\/api\/promotions\/campaigns\/[^/]+$/.test(pathname)) return `promotions.campaign.${method.toLowerCase()}`;
  if (/\/pictures\/upload$/.test(pathname)) return 'pictures.upload';
  if (/\/pictures\/quality$/.test(pathname)) return 'pictures.quality';
  if (/\/pictures\/fix-size$/.test(pathname)) return 'pictures.fix_size';
  if (/\/pictures\/commit$/.test(pathname)) return 'pictures.commit';
  return 'request';
}

function extractItemId(pathname) {
  const match = String(pathname || '').match(/\/api\/items\/((?:MLB|MLBU)\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

function safeString(value) {
  return String(value || '').slice(0, 120);
}

function safeOrigin(value) {
  const text = String(value || 'none');
  if (text === 'none') return text;
  try {
    const url = new URL(text);
    return `${url.protocol}//${url.host}`;
  } catch (err) {
    return 'invalid';
  }
}

function safePath(value) {
  return String(value || '').replace(/[?#].*$/, '').slice(0, 180);
}

function safeMlId(value) {
  const text = String(value || '').toUpperCase();
  return /^(?:MLB|MLBU)\d+$/.test(text) ? text : null;
}

function safeId(value) {
  const text = String(value || '').trim();
  return /^\d{1,32}$/.test(text) ? text : null;
}

module.exports = {
  classifyRequest,
  createAuditLogger,
  extractItemId
};
