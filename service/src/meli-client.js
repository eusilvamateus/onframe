const crypto = require('crypto');

const API_BASE = 'https://api.mercadolibre.com';
const DEFAULT_CONNECT_BASE_URL = 'https://connect.onblide.com';

class MercadoLivreClient {
  constructor({ env, store, fetchImpl } = {}) {
    this.env = env || process.env;
    this.store = store;
    this.fetch = fetchImpl || fetch;
  }

  async exchangeAuthorizationCode({ code, redirectUri, codeVerifier, brokerState }) {
    const token = await this.postConnect('/api/mercadolivre/token', {
      code,
      redirectUri,
      codeVerifier,
      brokerState
    });
    const stored = withExpiresAt(token);
    await this.store.write(stored);
    return stored;
  }

  async refreshToken(token) {
    const refreshed = await this.postConnect('/api/mercadolivre/refresh', {
      refreshToken: token.refresh_token
    });
    const stored = withExpiresAt(Object.assign({}, token, refreshed, {
      user_id: refreshed.user_id || token.user_id
    }));
    await this.store.write(stored, token);
    return stored;
  }

  async getAccessToken() {
    const token = await this.store.read();
    if (!token || !token.refresh_token) {
      const err = new Error('Mercado Livre nao autenticado.');
      err.statusCode = 401;
      throw err;
    }
    if (!token.access_token || Number(token.expires_at || 0) < Date.now() + 5 * 60 * 1000) {
      return (await this.refreshToken(token)).access_token;
    }
    return token.access_token;
  }

  async postConnect(path, payload) {
    const response = await this.fetch(`${getConnectBaseUrl(this.env)}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  }

  async getMe() {
    return this.request('/users/me');
  }

  async getItem(itemId) {
    return this.request(`/items/${itemId}`);
  }

  async getItemPrices(itemId, options = {}) {
    const params = {};
    if (options.displayVersion) params.display_version = 'true';
    const headers = {};
    if (options.showAllPrices) headers['show-all-prices'] = 'true';
    return this.request(withQuery(`/items/${encodeURIComponent(itemId)}/prices`, params), { headers });
  }

  async getItemSalePrice(itemId, params = {}, options = {}) {
    const headers = {};
    if (options.calculateNetTaxes) headers['x-calculate-net-taxes'] = 'true';
    return this.request(withQuery(`/items/${encodeURIComponent(itemId)}/sale_price`, params), { headers });
  }

  async getCategory(categoryId) {
    return this.request(`/categories/${encodeURIComponent(categoryId)}`);
  }

  async getUserProduct(userProductId) {
    return this.request(`/user-products/${encodeURIComponent(userProductId)}`);
  }

  async getUserProductFamily(siteId, familyId) {
    return this.request(`/sites/${encodeURIComponent(siteId)}/user-products-families/${encodeURIComponent(familyId)}`);
  }

  async searchItemsByUserProduct(userId, userProductId) {
    return this.request(`/users/${encodeURIComponent(userId)}/items/search?user_product_id=${encodeURIComponent(userProductId)}`);
  }

  async getListingPrices(siteId, params = {}) {
    return this.request(withQuery(`/sites/${encodeURIComponent(siteId)}/listing_prices`, params));
  }

  async getSellerShippingCost(userId, params = {}) {
    return this.request(withQuery(`/users/${encodeURIComponent(userId)}/shipping_options/free`, params));
  }

  async getPriceReference(itemId) {
    return this.request(`/suggestions/items/${encodeURIComponent(itemId)}/details`);
  }

  async getPricingAutomation(itemId) {
    return this.request(`/pricing-automation/items/${encodeURIComponent(itemId)}/automation`);
  }

  async getCatalogCompetition(itemId) {
    return this.request(`/items/${encodeURIComponent(itemId)}/price_to_win?version=v2`);
  }

  async getBuyboxSync(itemId) {
    return this.request(`/public/buybox/sync/${encodeURIComponent(itemId)}`, {
      headers: { 'x-public': 'true' }
    });
  }

  async getSellerPromotions(userId) {
    return this.request(`/seller-promotions/users/${encodeURIComponent(userId)}?app_version=v2`);
  }

  async getItemPromotions(itemId) {
    return this.request(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`);
  }

  async getPromotion(promotionId, promotionType) {
    return this.request(withQuery(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}`, {
      promotion_type: promotionType,
      app_version: 'v2'
    }));
  }

  async getPromotionItems(promotionId, promotionType, params = {}) {
    return this.request(withQuery(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}/items`, Object.assign({}, params, {
      promotion_type: promotionType,
      app_version: 'v2'
    })));
  }

  async createPromotionCampaign(payload) {
    return this.request('/seller-promotions/promotions?app_version=v2', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updatePromotionCampaign(promotionId, payload) {
    return this.request(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}?app_version=v2`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async deletePromotionCampaign(promotionId, promotionType) {
    return this.request(withQuery(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}`, {
      promotion_type: promotionType,
      app_version: 'v2'
    }), { method: 'DELETE' });
  }

  async createPromotionOffer(itemId, payload) {
    return this.request(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updatePromotionOffer(itemId, payload) {
    return this.request(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async deletePromotionOffer(itemId, params = {}) {
    return this.request(withQuery(`/seller-promotions/items/${encodeURIComponent(itemId)}`, Object.assign({}, params, {
      app_version: 'v2'
    })), { method: 'DELETE' });
  }

  async updateItem(itemId, payload) {
    return this.request(`/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async uploadPicture({ filename, mimeType, base64 }) {
    const fileBuffer = Buffer.from(stripDataUrl(base64), 'base64');
    if (!fileBuffer.length) {
      const err = new Error('Imagem vazia.');
      err.statusCode = 400;
      throw err;
    }

    const boundary = `----onblide-${crypto.randomBytes(12).toString('hex')}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="file"; filename="${sanitizeFilename(filename)}"\r\n`),
      Buffer.from(`Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    return this.request('/pictures/items/upload', {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body
    });
  }

  async downloadImage(url) {
    const response = await this.fetch(String(url || ''), {
      headers: { accept: 'image/*' }
    });
    if (!response.ok) {
      const err = new Error(`Nao consegui baixar a imagem. HTTP ${response.status}`);
      err.statusCode = response.status;
      throw err;
    }

    const mimeType = normalizeImageMimeType(response.headers.get('content-type'));
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      const err = new Error('Imagem vazia.');
      err.statusCode = 400;
      throw err;
    }
    return {
      mimeType,
      base64: buffer.toString('base64')
    };
  }

  async request(path, options = {}) {
    const accessToken = await this.getAccessToken();
    const headers = Object.assign({
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`
    }, options.headers || {});

    if (options.body && !headers['content-type'] && !headers['Content-Type']) {
      headers['content-type'] = 'application/json';
    }

    const response = await this.fetch(`${API_BASE}${path}`, Object.assign({}, options, { headers }));
    return parseResponse(response);
  }
}

async function parseResponse(response) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = text;
  }

  if (!response.ok) {
    const message = body && typeof body === 'object'
      ? (body.message || body.error_description || body.error || JSON.stringify(body))
      : String(body || `HTTP ${response.status}`);
    const err = new Error(message);
    err.statusCode = response.status;
    err.body = body;
    throw err;
  }

  return body;
}

function withExpiresAt(token) {
  return Object.assign({}, token, {
    expires_at: Date.now() + Math.max(0, Number(token.expires_in || 0) - 60) * 1000
  });
}

function stripDataUrl(value) {
  return String(value || '').replace(/^data:[^,]+,/, '');
}

function sanitizeFilename(value) {
  return String(value || 'picture.jpg').replace(/[^\w.-]/g, '_');
}

function withQuery(path, params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

function getConnectBaseUrl(env) {
  return String(env && env.ONBLIDE_CONNECT_BASE_URL || DEFAULT_CONNECT_BASE_URL).replace(/\/+$/, '');
}

function normalizeImageMimeType(value) {
  const text = String(value || '').split(';')[0].trim().toLowerCase();
  if (text === 'image/png') return 'image/png';
  return 'image/jpeg';
}

module.exports = {
  MercadoLivreClient
};
