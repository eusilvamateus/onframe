import { decryptValue, encryptValue } from './token-cipher';
import {
  handleResolve,
  handleResolveQuick,
  createItemRouteCache,
  handlePriceSummary,
  handleStandardPriceUpdate,
  handleCampaignList,
  handleCreateCampaign,
  handleCreateOffer,
  handleDeleteCampaign,
  handleDeleteOffer,
  handlePromotionEstimate,
  handlePromotionEstimates,
  handlePromotionSummary,
  handleUpdateCampaign,
  handleUpdateOffer,
  handleDescriptionBulkUpdate,
  handleDescriptionGet,
  handleDescriptionUpdate,
  handleCharacteristicsBulkUpdate,
  handleCharacteristicsGet,
  handleCharacteristicsUpdate,
  handlePictureCommit,
  handlePictureFixSize,
  handlePictureQuality,
  handlePictureUpload,
  handleBulkCommit,
  handleBulkPreview,
  resolveItemClient,
  sanitizeError,
  userFriendlyError
} from './legacy-contracts';

const MELI_API_BASE = 'https://api.mercadolibre.com';
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_LOCK_MS = 15 * 1000;
const TOKEN_REFRESH_WAIT_ATTEMPTS = 30;
const TOKEN_REFRESH_WAIT_MS = 100;
const quickCache = createItemRouteCache();

type RemoteRuntimeEnv = {
  ONFRAME_DB: D1Database;
  MELI_CLIENT_ID?: string;
  MELI_CLIENT_SECRET?: string;
  MELI_TOKEN_CIPHER_KEY?: CryptoKey;
};

export type RemoteApiActor = {
  sessionId: string;
  userId: string;
  workspaceId: string;
};

type MeliToken = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope?: string;
  token_type?: string;
  user_id?: number | string;
};

type SellerAccount = {
  id: string;
  meliUserId: string;
  nickname: string | null;
  siteId: string | null;
  profileUrl: string | null;
  enabled: boolean;
};

type SellerCredential = {
  token: MeliToken;
  expiresAt: number;
  updatedAt: number;
  refreshLockId: string | null;
  refreshLockExpiresAt: number | null;
};

type LegacyAccount = {
  user_id: string;
  nickname: string | null;
  site_id: string | null;
  permalink: string | null;
  enabled: boolean;
  refresh_token: string;
};

type RemoteApiContext = {
  accounts: SellerAccount[];
  client: RemoteMeliClient;
  clientFactory: (account: LegacyAccount | null) => RemoteMeliClient;
  store: {
    listAccountTokens: () => Promise<LegacyAccount[]>;
    readAccount: (userId: string) => Promise<LegacyAccount | null>;
  };
};

export class RemoteApiError extends Error {
  readonly body: unknown;
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message = code, body: unknown = null) {
    super(message);
    this.name = 'RemoteApiError';
    this.body = body;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function handleRemoteApiRequest(input: {
  actor: RemoteApiActor;
  env: RemoteRuntimeEnv;
  request: Request;
  url: URL;
}): Promise<unknown> {
  const context = await createRemoteApiContext(input.env, input.actor);
  const apiPath = input.url.pathname.slice('/v1/api'.length) || '/';
  const route = `${input.request.method} ${apiPath}`;
  const readJson = (_request: Request, options: { maxBytes?: number } = {}) => readRequestJson(input.request, options);
  const resolveItemClient = (itemId: string) => resolveLegacyItemClient({
    context,
    itemId,
    ownerUserId: input.url.searchParams.get('owner_user_id')
  });
  const resolveBulkClient = (subjectId: string) => resolveLegacyBulkClient({
    context,
    subjectId,
    ownerUserId: input.url.searchParams.get('owner_user_id')
  });

  try {
    if (route === 'POST /resolve') {
      return unwrapLegacyRouteResult(await handleResolve({
        req: input.request,
        client: context.client,
        store: context.store,
        clientFactory: context.clientFactory,
        readJson
      }));
    }

    if (route === 'POST /resolve/quick') {
      return unwrapLegacyRouteResult(await handleResolveQuick({
        req: input.request,
        client: context.client,
        store: context.store,
        clientFactory: context.clientFactory,
        readJson,
        cache: quickCache
      }));
    }

    const priceSummary = apiPath.match(/^\/items\/(MLB\d+)\/pricing\/summary$/u);
    if (input.request.method === 'GET' && priceSummary) {
      return handlePriceSummary({ client: await resolveItemClient(priceSummary[1]), itemId: priceSummary[1] });
    }

    const standardPrice = apiPath.match(/^\/items\/(MLB\d+)\/pricing\/standard$/u);
    if (input.request.method === 'PUT' && standardPrice) {
      return handleStandardPriceUpdate({
        req: input.request,
        client: await resolveItemClient(standardPrice[1]),
        itemId: standardPrice[1],
        readJson
      });
    }

    const bulkPreview = apiPath.match(/^\/items\/((?:MLB|MLBU)\d+)\/bulk\/preview$/u);
    if (input.request.method === 'POST' && bulkPreview) {
      return handleBulkPreview({
        req: input.request,
        client: await resolveBulkClient(bulkPreview[1]),
        itemId: bulkPreview[1],
        readJson
      });
    }

    const bulkCommit = apiPath.match(/^\/items\/((?:MLB|MLBU)\d+)\/bulk\/commit$/u);
    if (input.request.method === 'POST' && bulkCommit) {
      return handleBulkCommit({
        req: input.request,
        client: await resolveBulkClient(bulkCommit[1]),
        itemId: bulkCommit[1],
        readJson
      });
    }

    const descriptionBulk = apiPath.match(/^\/items\/(MLB\d+)\/description\/bulk$/u);
    if (input.request.method === 'POST' && descriptionBulk) {
      return handleDescriptionBulkUpdate({
        req: input.request,
        client: await resolveBulkClient(descriptionBulk[1]),
        itemId: descriptionBulk[1],
        readJson
      });
    }

    const description = apiPath.match(/^\/items\/(MLB\d+)\/description$/u);
    if (input.request.method === 'GET' && description) {
      return handleDescriptionGet({ client: await resolveItemClient(description[1]), itemId: description[1] });
    }
    if (input.request.method === 'PUT' && description) {
      return handleDescriptionUpdate({
        req: input.request,
        client: await resolveItemClient(description[1]),
        itemId: description[1],
        readJson
      });
    }

    const characteristicsBulk = apiPath.match(/^\/items\/(MLB\d+)\/characteristics\/bulk$/u);
    if (input.request.method === 'POST' && characteristicsBulk) {
      return handleCharacteristicsBulkUpdate({
        req: input.request,
        client: await resolveBulkClient(characteristicsBulk[1]),
        itemId: characteristicsBulk[1],
        readJson
      });
    }

    const characteristics = apiPath.match(/^\/items\/(MLB\d+)\/characteristics$/u);
    if (input.request.method === 'GET' && characteristics) {
      return handleCharacteristicsGet({ client: await resolveItemClient(characteristics[1]), itemId: characteristics[1] });
    }
    if (input.request.method === 'PUT' && characteristics) {
      return handleCharacteristicsUpdate({
        req: input.request,
        client: await resolveItemClient(characteristics[1]),
        itemId: characteristics[1],
        readJson
      });
    }

    const promotionSummary = apiPath.match(/^\/items\/(MLB\d+)\/promotions\/summary$/u);
    if (input.request.method === 'GET' && promotionSummary) {
      return handlePromotionSummary({ client: await resolveItemClient(promotionSummary[1]), itemId: promotionSummary[1] });
    }

    const promotionEstimates = apiPath.match(/^\/items\/(MLB\d+)\/promotions\/estimates$/u);
    if (input.request.method === 'POST' && promotionEstimates) {
      return handlePromotionEstimates({
        req: input.request,
        client: await resolveItemClient(promotionEstimates[1]),
        itemId: promotionEstimates[1],
        readJson
      });
    }

    const promotionEstimate = apiPath.match(/^\/items\/(MLB\d+)\/promotions\/estimate$/u);
    if (input.request.method === 'POST' && promotionEstimate) {
      return handlePromotionEstimate({
        req: input.request,
        client: await resolveItemClient(promotionEstimate[1]),
        itemId: promotionEstimate[1],
        readJson
      });
    }

    const offer = apiPath.match(/^\/items\/(MLB\d+)\/promotions\/offers$/u);
    if (input.request.method === 'POST' && offer) {
      return handleCreateOffer({ req: input.request, client: await resolveItemClient(offer[1]), itemId: offer[1], readJson });
    }
    if (input.request.method === 'PUT' && offer) {
      return handleUpdateOffer({ req: input.request, client: await resolveItemClient(offer[1]), itemId: offer[1], readJson });
    }
    if (input.request.method === 'DELETE' && offer) {
      return handleDeleteOffer({ req: input.request, client: await resolveItemClient(offer[1]), itemId: offer[1], readJson });
    }

    if (route === 'GET /promotions/campaigns') return handleCampaignList({ client: context.client });
    if (route === 'POST /promotions/campaigns') return handleCreateCampaign({ req: input.request, client: context.client, readJson });

    const campaign = apiPath.match(/^\/promotions\/campaigns\/([^/]+)$/u);
    if (input.request.method === 'PUT' && campaign) {
      return handleUpdateCampaign({
        req: input.request,
        client: context.client,
        promotionId: decodeURIComponent(campaign[1]),
        readJson
      });
    }
    if (input.request.method === 'DELETE' && campaign) {
      return handleDeleteCampaign({
        req: input.request,
        client: context.client,
        promotionId: decodeURIComponent(campaign[1]),
        readJson
      });
    }

    const pictureUpload = apiPath.match(/^\/items\/(MLB\d+)\/pictures\/upload$/u);
    if (input.request.method === 'POST' && pictureUpload) {
      return handlePictureUpload({ req: input.request, client: await resolveItemClient(pictureUpload[1]), itemId: pictureUpload[1], readJson });
    }

    const pictureQuality = apiPath.match(/^\/items\/(MLB\d+)\/pictures\/quality$/u);
    if (input.request.method === 'GET' && pictureQuality) {
      return handlePictureQuality({ url: input.url, client: await resolveItemClient(pictureQuality[1]), itemId: pictureQuality[1] });
    }

    const pictureFixSize = apiPath.match(/^\/items\/(MLB\d+)\/pictures\/fix-size$/u);
    if (input.request.method === 'POST' && pictureFixSize) {
      return handlePictureFixSize({ req: input.request, client: await resolveItemClient(pictureFixSize[1]), itemId: pictureFixSize[1], readJson });
    }

    const pictureCommit = apiPath.match(/^\/items\/(MLB\d+)\/pictures\/commit$/u);
    if (input.request.method === 'POST' && pictureCommit) {
      return handlePictureCommit({ req: input.request, client: await resolveItemClient(pictureCommit[1]), itemId: pictureCommit[1], readJson });
    }

    throw new RemoteApiError('endpoint_not_found', 404, 'Endpoint nao encontrado.');
  } catch (error) {
    throw normalizeRemoteApiError(error);
  }
}

export function remoteApiErrorPayload(error: unknown, requestId: string): { status: number; payload: Record<string, string> } {
  const normalized = normalizeRemoteApiError(error);
  const technicalError = sanitizeError(normalized);
  return {
    status: normalized.statusCode,
    payload: {
      error: userFriendlyError(normalized, technicalError, normalized.statusCode),
      code: normalized.code,
      requestId
    }
  };
}

function unwrapLegacyRouteResult(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const result = value as { statusCode?: unknown; payload?: unknown };
  if (!Object.prototype.hasOwnProperty.call(result, 'statusCode') || !Object.prototype.hasOwnProperty.call(result, 'payload')) {
    return value;
  }
  const statusCode = Number(result.statusCode);
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) return value;
  if (statusCode < 400) return result.payload;

  const payload = result.payload && typeof result.payload === 'object'
    ? result.payload as Record<string, unknown>
    : {};
  const message = typeof payload.error === 'string' && payload.error.trim()
    ? payload.error
    : 'A requisicao nao pode ser concluida.';
  throw new RemoteApiError(errorCodeForStatus(statusCode), statusCode, message, result.payload);
}

async function createRemoteApiContext(env: RemoteRuntimeEnv, actor: RemoteApiActor): Promise<RemoteApiContext> {
  assertRemoteMeliConfigured(env);
  const records = await env.ONFRAME_DB.prepare(`
    SELECT id, meli_user_id, nickname, site_id, profile_url, enabled
    FROM seller_accounts
    WHERE workspace_id = ?
    ORDER BY created_at ASC
  `).bind(actor.workspaceId).all<{
    id: string;
    meli_user_id: string;
    nickname: string | null;
    site_id: string | null;
    profile_url: string | null;
    enabled: number;
  }>();
  const accounts = (records.results ?? []).map((record) => ({
    id: record.id,
    meliUserId: String(record.meli_user_id),
    nickname: record.nickname,
    siteId: record.site_id,
    profileUrl: record.profile_url,
    enabled: record.enabled === 1
  }));
  const enabledAccounts = accounts.filter((account) => account.enabled);

  if (!accounts.length) {
    throw new RemoteApiError('workspace_account_unavailable', 409, 'Nenhuma conta conectada neste workspace.');
  }
  if (!enabledAccounts.length) {
    throw new RemoteApiError('workspace_accounts_disabled', 403, 'Nenhuma conta habilitada para detectar anuncios.');
  }

  const legacyAccounts = accounts.map(toLegacyAccount);
  const accountsByUserId = new Map(accounts.map((account) => [account.meliUserId, account]));
  const defaultAccount = enabledAccounts[0];
  const clientFactory = (legacyAccount: LegacyAccount | null): RemoteMeliClient => {
    const account = legacyAccount && accountsByUserId.get(String(legacyAccount.user_id)) || defaultAccount;
    if (!account) throw new RemoteApiError('workspace_account_unavailable', 409);
    return new RemoteMeliClient(env, account);
  };

  return {
    accounts,
    client: clientFactory(null),
    clientFactory,
    store: {
      listAccountTokens: async () => legacyAccounts,
      readAccount: async (userId: string) => legacyAccounts.find((account) => account.user_id === String(userId)) || null
    }
  };
}

async function resolveLegacyItemClient(input: {
  context: RemoteApiContext;
  itemId: string;
  ownerUserId: string | null;
}): Promise<RemoteMeliClient> {
  return resolveItemClient({
    itemId: input.itemId,
    ownerUserId: input.ownerUserId,
    store: input.context.store,
    client: input.context.client,
    clientFactory: input.context.clientFactory
  });
}

async function resolveLegacyBulkClient(input: {
  context: RemoteApiContext;
  subjectId: string;
  ownerUserId: string | null;
}): Promise<RemoteMeliClient> {
  if (!/^MLBU\d+$/iu.test(input.subjectId)) {
    return resolveLegacyItemClient({
      context: input.context,
      itemId: input.subjectId,
      ownerUserId: input.ownerUserId
    });
  }
  const ownerUserId = String(input.ownerUserId || '').trim();
  if (!/^\d+$/u.test(ownerUserId)) {
    throw new RemoteApiError('workspace_account_access_forbidden', 403, 'Conta conectada nao encontrada para este anuncio.');
  }
  const account = await input.context.store.readAccount(ownerUserId);
  if (!account) throw new RemoteApiError('workspace_account_access_forbidden', 403, 'Conta conectada nao encontrada para este anuncio.');
  if (account.enabled === false) throw new RemoteApiError('workspace_accounts_disabled', 403, 'Esta conta esta desativada no OnFrame.');
  return input.context.clientFactory(account);
}

function toLegacyAccount(account: SellerAccount): LegacyAccount {
  return {
    user_id: account.meliUserId,
    nickname: account.nickname,
    site_id: account.siteId,
    permalink: account.profileUrl,
    enabled: account.enabled,
    refresh_token: 'remote'
  };
}

async function readRequestJson(request: Request, options: { maxBytes?: number } = {}): Promise<Record<string, unknown>> {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    throw new RemoteApiError('invalid_content_type', 415, 'Content-Type invalido. Use application/json.');
  }
  const body = await request.text();
  const maxBytes = options.maxBytes || 1024 * 1024;
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    throw new RemoteApiError('payload_too_large', 413, 'Payload excede o limite permitido.');
  }
  if (!body) return {};
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new RemoteApiError('invalid_json', 400, 'JSON invalido.');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RemoteApiError) throw error;
    throw new RemoteApiError('invalid_json', 400, 'JSON invalido.');
  }
}

class RemoteMeliClient {
  constructor(
    private readonly env: RemoteRuntimeEnv,
    private readonly account: SellerAccount
  ) {}

  async getMe(): Promise<{ id: string }> {
    return { id: this.account.meliUserId };
  }

  async getItem(itemId: string): Promise<unknown> { return this.request(`/items/${encodeURIComponent(itemId)}`); }
  async getItemPrices(itemId: string, options: { displayVersion?: boolean; showAllPrices?: boolean } = {}): Promise<unknown> {
    return this.request(withQuery(`/items/${encodeURIComponent(itemId)}/prices`, { display_version: options.displayVersion ? 'true' : undefined }), {
      headers: options.showAllPrices ? { 'show-all-prices': 'true' } : undefined
    });
  }
  async getItemSalePrice(itemId: string, params: Record<string, unknown> = {}, options: { calculateNetTaxes?: boolean } = {}): Promise<unknown> {
    return this.request(withQuery(`/items/${encodeURIComponent(itemId)}/sale_price`, params), {
      headers: options.calculateNetTaxes ? { 'x-calculate-net-taxes': 'true' } : undefined
    });
  }
  async getCategory(categoryId: string): Promise<unknown> { return this.request(`/categories/${encodeURIComponent(categoryId)}`); }
  async getCategoryAttributes(categoryId: string): Promise<unknown> { return this.request(`/categories/${encodeURIComponent(categoryId)}/attributes`); }
  async getDomainTechnicalSpecs(domainId: string): Promise<unknown> { return this.request(`/domains/${encodeURIComponent(domainId)}/technical_specs`); }
  async getUserProduct(userProductId: string): Promise<unknown> { return this.request(`/user-products/${encodeURIComponent(userProductId)}`); }
  async getUserProductFamily(siteId: string, familyId: string): Promise<unknown> { return this.request(`/sites/${encodeURIComponent(siteId)}/user-products-families/${encodeURIComponent(familyId)}`); }
  async searchItemsByUserProduct(userId: string | number, userProductId: string, options: Record<string, unknown> = {}): Promise<unknown> {
    return this.request(withQuery(`/users/${encodeURIComponent(userId)}/items/search`, { ...options, user_product_id: userProductId }));
  }
  async getListingPrices(siteId: string, params: Record<string, unknown> = {}): Promise<unknown> { return this.request(withQuery(`/sites/${encodeURIComponent(siteId)}/listing_prices`, params)); }
  async getSellerShippingCost(userId: string | number, params: Record<string, unknown> = {}): Promise<unknown> { return this.request(withQuery(`/users/${encodeURIComponent(userId)}/shipping_options/free`, params)); }
  async getPriceReference(itemId: string): Promise<unknown> { return this.request(`/suggestions/items/${encodeURIComponent(itemId)}/details`); }
  async getPricingAutomation(itemId: string): Promise<unknown> { return this.request(`/pricing-automation/items/${encodeURIComponent(itemId)}/automation`); }
  async getCatalogCompetition(itemId: string): Promise<unknown> { return this.request(`/items/${encodeURIComponent(itemId)}/price_to_win?version=v2`); }
  async getBuyboxSync(itemId: string): Promise<unknown> { return this.request(`/public/buybox/sync/${encodeURIComponent(itemId)}`, { headers: { 'x-public': 'true' } }); }
  async getSellerPromotions(userId: string | number): Promise<unknown> { return this.request(`/seller-promotions/users/${encodeURIComponent(userId)}?app_version=v2`); }
  async getItemPromotions(itemId: string): Promise<unknown> { return this.request(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`); }
  async getPromotion(promotionId: string, promotionType: string): Promise<unknown> { return this.request(withQuery(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}`, { promotion_type: promotionType, app_version: 'v2' })); }
  async getPromotionItems(promotionId: string, promotionType: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.request(withQuery(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}/items`, { ...params, promotion_type: promotionType, app_version: 'v2' }));
  }
  async getPromotionOffer(offerId: string): Promise<unknown> { return this.request(`/seller-promotions/offers/${encodeURIComponent(offerId)}?app_version=v2`); }
  async createPromotionCampaign(payload: unknown): Promise<unknown> { return this.request('/seller-promotions/promotions?app_version=v2', { method: 'POST', body: JSON.stringify(payload) }); }
  async updatePromotionCampaign(promotionId: string, payload: unknown): Promise<unknown> { return this.request(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}?app_version=v2`, { method: 'PUT', body: JSON.stringify(payload) }); }
  async deletePromotionCampaign(promotionId: string, promotionType: string): Promise<unknown> { return this.request(withQuery(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}`, { promotion_type: promotionType, app_version: 'v2' }), { method: 'DELETE' }); }
  async createPromotionOffer(itemId: string, payload: unknown): Promise<unknown> { return this.request(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, { method: 'POST', body: JSON.stringify(payload) }); }
  async updatePromotionOffer(itemId: string, payload: unknown): Promise<unknown> { return this.request(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, { method: 'PUT', body: JSON.stringify(payload) }); }
  async deletePromotionOffer(itemId: string, params: Record<string, unknown> = {}): Promise<unknown> { return this.request(withQuery(`/seller-promotions/items/${encodeURIComponent(itemId)}`, { ...params, app_version: 'v2' }), { method: 'DELETE' }); }
  async getItemDescription(itemId: string): Promise<unknown> { return this.request(`/items/${encodeURIComponent(itemId)}/description`); }
  async createItemDescription(itemId: string, plainText: string): Promise<unknown> { return this.request(`/items/${encodeURIComponent(itemId)}/description`, { method: 'POST', body: JSON.stringify({ plain_text: plainText }) }); }
  async updateItemDescription(itemId: string, plainText: string): Promise<unknown> { return this.request(`/items/${encodeURIComponent(itemId)}/description?api_version=2`, { method: 'PUT', body: JSON.stringify({ plain_text: plainText }) }); }
  async updateItem(itemId: string, payload: unknown): Promise<unknown> { return this.request(`/items/${encodeURIComponent(itemId)}`, { method: 'PUT', body: JSON.stringify(payload) }); }

  async uploadPicture(input: { filename: string; mimeType: string; base64: string }): Promise<unknown> {
    const bytes = decodeBase64(input.base64);
    if (!bytes.byteLength) throw new RemoteApiError('invalid_picture', 400, 'Imagem vazia.');
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: input.mimeType || 'application/octet-stream' }), sanitizeFilename(input.filename));
    return this.request('/pictures/items/upload', { method: 'POST', body: form });
  }

  async downloadImage(url: string): Promise<{ mimeType: string; base64: string }> {
    assertAllowedImageUrl(url);
    const response = await fetch(String(url), { headers: { accept: 'image/*' } });
    if (!response.ok) throw new RemoteApiError('image_download_failed', response.status, `Nao consegui baixar a imagem. HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength) throw new RemoteApiError('invalid_picture', 400, 'Imagem vazia.');
    return { mimeType: normalizeImageMimeType(response.headers.get('content-type')), base64: encodeBase64(bytes) };
  }

  private async request(path: string, options: RequestInit = {}, retried = false): Promise<unknown> {
    const accessToken = await this.getAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${accessToken}`);
    if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');

    const response = await fetch(`${MELI_API_BASE}${path}`, { ...options, headers });
    if (response.status === 401 && !retried) {
      await refreshSellerCredential(this.env, this.account, accessToken);
      return this.request(path, options, true);
    }
    return parseMeliResponse(response);
  }

  private async getAccessToken(): Promise<string> {
    const credential = await readSellerCredential(this.env, this.account);
    if (credential.expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) return credential.token.access_token;
    return (await refreshSellerCredential(this.env, this.account)).access_token;
  }
}

async function readSellerCredential(env: RemoteRuntimeEnv, account: SellerAccount): Promise<SellerCredential> {
  assertRemoteMeliConfigured(env);
  const record = await env.ONFRAME_DB.prepare(`
    SELECT token_ciphertext, token_iv, token_auth_tag, expires_at, updated_at, refresh_lock_id, refresh_lock_expires_at
    FROM seller_credentials
    WHERE seller_account_id = ?
  `).bind(account.id).first<{
    token_ciphertext: string;
    token_iv: string;
    token_auth_tag: string;
    expires_at: number;
    updated_at: number;
    refresh_lock_id: string | null;
    refresh_lock_expires_at: number | null;
  }>();
  if (!record) throw new RemoteApiError('workspace_account_unavailable', 409, 'Conta conectada nao encontrada para este anuncio.');

  let tokenPayload: unknown;
  try {
    tokenPayload = JSON.parse(await decryptValue(env.MELI_TOKEN_CIPHER_KEY, {
      ciphertext: record.token_ciphertext,
      iv: record.token_iv,
      authTag: record.token_auth_tag
    }));
  } catch {
    throw new RemoteApiError('remote_credentials_unavailable', 503, 'Nao foi possivel ler a credencial remota.');
  }

  return {
    token: parseMeliToken(tokenPayload),
    expiresAt: Number(record.expires_at || 0),
    updatedAt: Number(record.updated_at || 0),
    refreshLockId: record.refresh_lock_id || null,
    refreshLockExpiresAt: record.refresh_lock_expires_at === null ? null : Number(record.refresh_lock_expires_at)
  };
}

async function refreshSellerCredential(env: RemoteRuntimeEnv, account: SellerAccount, failedAccessToken = ''): Promise<MeliToken> {
  for (let attempt = 0; attempt < TOKEN_REFRESH_WAIT_ATTEMPTS; attempt += 1) {
    const current = await readSellerCredential(env, account);
    if (!needsRefresh(current, failedAccessToken)) return current.token;

    const lockId = crypto.randomUUID();
    const timestamp = Date.now();
    const lockResult = await env.ONFRAME_DB.prepare(`
      UPDATE seller_credentials
      SET refresh_lock_id = ?, refresh_lock_expires_at = ?
      WHERE seller_account_id = ?
        AND (refresh_lock_expires_at IS NULL OR refresh_lock_expires_at <= ?)
    `).bind(lockId, timestamp + TOKEN_REFRESH_LOCK_MS, account.id, timestamp).run();

    if (lockResult.meta.changes !== 1) {
      await wait(TOKEN_REFRESH_WAIT_MS);
      continue;
    }

    try {
      const latest = await readSellerCredential(env, account);
      if (!needsRefresh(latest, failedAccessToken)) {
        await releaseRefreshLock(env, account.id, lockId);
        return latest.token;
      }

      const refreshed = await requestMeliRefresh(env, latest.token.refresh_token);
      const encrypted = await encryptValue(env.MELI_TOKEN_CIPHER_KEY as CryptoKey, JSON.stringify(refreshed));
      const expiresAt = Date.now() + Math.max(0, Number(refreshed.expires_in || 0)) * 1000;
      const write = await env.ONFRAME_DB.prepare(`
        UPDATE seller_credentials
        SET token_ciphertext = ?, token_iv = ?, token_auth_tag = ?, expires_at = ?, refreshed_at = ?, updated_at = ?,
            refresh_lock_id = NULL, refresh_lock_expires_at = NULL
        WHERE seller_account_id = ? AND refresh_lock_id = ?
      `).bind(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        expiresAt,
        Date.now(),
        Date.now(),
        account.id,
        lockId
      ).run();
      if (write.meta.changes !== 1) throw new RemoteApiError('remote_token_refresh_conflict', 503);
      return refreshed;
    } catch (error) {
      await releaseRefreshLock(env, account.id, lockId);
      throw error;
    }
  }

  throw new RemoteApiError('remote_token_refresh_busy', 503, 'A credencial esta sendo atualizada. Tente novamente.');
}

function needsRefresh(credential: SellerCredential, failedAccessToken: string): boolean {
  if (failedAccessToken && credential.token.access_token === failedAccessToken) return true;
  return credential.expiresAt <= Date.now() + TOKEN_REFRESH_SKEW_MS;
}

async function releaseRefreshLock(env: RemoteRuntimeEnv, accountId: string, lockId: string): Promise<void> {
  await env.ONFRAME_DB.prepare(`
    UPDATE seller_credentials
    SET refresh_lock_id = NULL, refresh_lock_expires_at = NULL
    WHERE seller_account_id = ? AND refresh_lock_id = ?
  `).bind(accountId, lockId).run();
}

async function requestMeliRefresh(env: RemoteRuntimeEnv, refreshToken: string): Promise<MeliToken> {
  assertRemoteMeliConfigured(env);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: env.MELI_CLIENT_ID,
    client_secret: env.MELI_CLIENT_SECRET,
    refresh_token: refreshToken
  });
  const response = await fetch(`${MELI_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  return parseMeliToken(await parseMeliResponse(response));
}

async function parseMeliResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (response.ok) return body;

  const objectBody = body && typeof body === 'object' ? body as Record<string, unknown> : null;
  const message = objectBody
    ? String(objectBody.message || objectBody.error_description || objectBody.error || JSON.stringify(objectBody))
    : String(body || `HTTP ${response.status}`);
  throw new RemoteApiError('mercadolivre_request_failed', response.status, message, body);
}

function parseMeliToken(value: unknown): MeliToken {
  if (!value || typeof value !== 'object') throw new RemoteApiError('remote_credentials_unavailable', 503);
  const token = value as Record<string, unknown>;
  const accessToken = typeof token.access_token === 'string' ? token.access_token.trim() : '';
  const refreshToken = typeof token.refresh_token === 'string' ? token.refresh_token.trim() : '';
  const expiresIn = Number(token.expires_in || 0);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new RemoteApiError('remote_credentials_unavailable', 503);
  }
  return {
    access_token: accessToken,
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: typeof token.scope === 'string' ? token.scope : undefined,
    token_type: typeof token.token_type === 'string' ? token.token_type : undefined,
    user_id: typeof token.user_id === 'string' || typeof token.user_id === 'number' ? token.user_id : undefined
  };
}

function normalizeRemoteApiError(error: unknown): RemoteApiError {
  if (error instanceof RemoteApiError) return error;
  const source = error as { statusCode?: unknown; code?: unknown; message?: unknown; body?: unknown } | null;
  const statusCode = Number(source?.statusCode || 0);
  return new RemoteApiError(
    typeof source?.code === 'string' && source.code ? source.code : errorCodeForStatus(statusCode || 500),
    statusCode >= 400 && statusCode <= 599 ? statusCode : 500,
    typeof source?.message === 'string' && source.message ? source.message : 'Erro inesperado.',
    source?.body
  );
}

function errorCodeForStatus(status: number): string {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 413) return 'payload_too_large';
  if (status === 415) return 'unsupported_media_type';
  if (status === 502) return 'upstream_error';
  return 'internal_error';
}

function assertRemoteMeliConfigured(env: RemoteRuntimeEnv): asserts env is RemoteRuntimeEnv & {
  MELI_CLIENT_ID: string;
  MELI_CLIENT_SECRET: string;
  MELI_TOKEN_CIPHER_KEY: CryptoKey;
} {
  if (!String(env.MELI_CLIENT_ID || '').trim() || !String(env.MELI_CLIENT_SECRET || '').trim() || !env.MELI_TOKEN_CIPHER_KEY) {
    throw new RemoteApiError('remote_oauth_unconfigured', 503, 'A conexao remota do Mercado Livre ainda nao esta configurada.');
  }
}

function withQuery(path: string, params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

function decodeBase64(value: string): Uint8Array {
  const normalized = String(value || '').replace(/^data:[^,]+,/u, '');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(''));
}

function sanitizeFilename(value: string): string {
  return String(value || 'picture.jpg').replace(/[^\w.-]/gu, '_');
}

function normalizeImageMimeType(value: string | null): string {
  return String(value || '').split(';')[0].trim().toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
}

function assertAllowedImageUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new RemoteApiError('invalid_image_url', 400, 'URL de imagem invalida.');
  }
  const hostname = parsed.hostname.toLowerCase();
  const allowedHost = hostname === 'mlstatic.com' || hostname.endsWith('.mlstatic.com');
  if (!['https:', 'http:'].includes(parsed.protocol.toLowerCase()) || !allowedHost) {
    throw new RemoteApiError('image_host_not_allowed', 400, 'Host de imagem nao permitido.');
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
