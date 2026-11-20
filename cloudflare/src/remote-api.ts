import { decryptValue, encryptValue, importAesGcmKeyBase64 } from './token-cipher';
import { recordConfirmedItemEdits } from './item-edit-history';
import { matchProductForPromotionItem, updateProductFinancials } from './products';
import { enrichPriceSummaryWithProduct, enrichPromotionEstimateWithProduct } from './product-margin';
import { resolveProductTaxRate } from './tax-configuration';
import { hasPermission, type Permission } from './permissions';
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
  buildBulkPreview,
  resolveFamilyTargets,
  resolveItemClient,
  sanitizeError,
  userFriendlyError,
  verifyOfferMutation
} from './legacy-contracts';

const MELI_API_BASE = 'https://api.mercadolibre.com';
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_LOCK_MS = 15 * 1000;
const TOKEN_REFRESH_WAIT_ATTEMPTS = 30;
const TOKEN_REFRESH_WAIT_MS = 100;
const RECONCILIATION_RETENTION_MS = 24 * 60 * 60 * 1000;
const quickCache = createItemRouteCache();

export function remotePermission(method: string, path: string, bulkAction?: string): Permission[] {
  if (path.endsWith('/bulk/commit') || (method === 'POST' && path.endsWith('/bulk/jobs'))) {
    if (bulkAction === 'pricing.standard.update') return ['listings.write'];
    if (bulkAction === 'promotion.offer.delete') return ['promotions.delete'];
    if (bulkAction === 'promotion.offer.create' || bulkAction === 'promotion.offer.update') return ['promotions.write'];
    return ['listings.read'];
  }
  if (path.includes('/bulk/jobs/')) return ['promotions.read'];
  if (path === '/promotions/campaigns' || path.includes('/promotions/')) {
    const action =
      method === 'DELETE'
        ? 'delete'
        : method === 'PUT' ||
            (path.endsWith('/offers') && method === 'POST') ||
            (path === '/promotions/campaigns' && method === 'POST')
          ? 'write'
          : 'read';
    return [`promotions.${action}`];
  }
  if (path.endsWith('/product-financials')) return ['products.write'];
  if (
    path.startsWith('/items/') &&
    (method === 'PUT' ||
      method === 'PATCH' ||
      method === 'DELETE' ||
      path.endsWith('/description/bulk') ||
      path.endsWith('/characteristics/bulk') ||
      path.includes('/pictures/'))
  ) {
    return [`listings.${method === 'DELETE' ? 'delete' : path.endsWith('/pictures/quality') ? 'read' : 'write'}`];
  }
  return ['listings.read'];
}

export type PromotionReconciliationParams = {
  reconciliationId: string;
};

export type PromotionBulkParams = { jobId: string };

export type RemoteRuntimeEnv = {
  ONFRAME_DB: D1Database;
  PROMOTION_RECONCILIATION: Workflow<PromotionReconciliationParams>;
  PROMOTION_BULK: Workflow<PromotionBulkParams>;
  MELI_CLIENT_ID?: string;
  MELI_CLIENT_SECRET?: string;
  MELI_TOKEN_CIPHER_KEY_BASE64?: string;
};

export type RemoteApiActor = {
  sessionId: string;
  userId: string;
  workspaceId: string;
  roleId: string;
  permissions?: string[];
  displayName?: string;
  email?: string;
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

type PromotionReconciliationRow = {
  id: string;
  workspace_id: string;
  seller_account_id: string;
  user_id: string | null;
  request_id: string;
  source_item_id: string;
  item_id: string;
  operation: string;
  payload_json: string;
  accepted_result_json: string;
  history_before_json: string | null;
  actor_name: string | null;
  actor_email: string | null;
  status: 'pending' | 'confirmed' | 'unconfirmed';
  attempts: number;
  last_error: string | null;
  workflow_started_at: number | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  expires_at: number;
  meli_user_id?: string;
  nickname?: string | null;
  site_id?: string | null;
  profile_url?: string | null;
  account_enabled?: number;
};

export type ReconciliationOutcome = {
  id: string;
  itemId: string;
  status: 'pending' | 'confirmed' | 'unconfirmed' | 'missing';
  attempts: number;
  message?: string;
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
  requestId: string;
  url: URL;
}): Promise<unknown> {
  const apiPath = input.url.pathname.slice('/v1/api'.length) || '/';
  const bulkPayload: unknown = apiPath.endsWith('/bulk/commit') || apiPath.endsWith('/bulk/jobs')
    ? await input.request
        .clone()
        .json()
        .catch(() => null)
    : null;
  const bulkAction =
    bulkPayload && typeof bulkPayload === 'object' && 'action' in bulkPayload ? String(bulkPayload.action) : undefined;
  for (const permission of [
    'accounts.read',
    ...remotePermission(input.request.method, apiPath, bulkAction)
  ] as Permission[]) {
    if (!hasPermission(input.actor, permission))
      throw new RemoteApiError('workspace_permission_denied', 403, 'Você não tem permissão para esta ação.');
  }
  const context = await createRemoteApiContext(input.env, input.actor);
  const route = `${input.request.method} ${apiPath}`;
  let requestPayload: Record<string, unknown> | null = null;
  const readJson = async (_request: Request, options: { maxBytes?: number } = {}) => {
    requestPayload = await readRequestJson(input.request, options);
    return requestPayload;
  };
  const resolveItemClient = (itemId: string) =>
    resolveLegacyItemClient({
      context,
      itemId,
      ownerUserId: input.url.searchParams.get('owner_user_id')
    });
  const resolveBulkClient = (subjectId: string) =>
    resolveLegacyBulkClient({
      context,
      subjectId,
      ownerUserId: input.url.searchParams.get('owner_user_id')
    });
  const matchPromotionProduct = async (client: RemoteMeliClient, itemId: string) => {
    try {
      const productMatch = await matchProductForPromotionItem(
        input.env,
        input.actor,
        client.historySnapshots(itemId).latest,
        input.url.searchParams.get('variation_id')
      );
      if (productMatch.status !== 'matched' || !productMatch.product?.id) {
        return { ...productMatch, canEdit: hasPermission(input.actor, 'products.write') };
      }
      const tax = await resolveProductTaxRate(input.env, {
        workspaceId: input.actor.workspaceId,
        sellerAccountId: client.historyAccount().id,
        productId: productMatch.product.id
      });
      return { ...productMatch, tax, canEdit: hasPermission(input.actor, 'products.write') };
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'promotion_product_match_failed',
          itemId,
          requestId: input.requestId,
          error: sanitizeError(error)
        })
      );
      return {
        status: 'unavailable',
        sku: null,
        source: null,
        variationId: null,
        reason: 'catalog_unavailable',
        product: null,
        canEdit: false
      };
    }
  };
  const runItemMutation = async (
    operation: string,
    itemId: string,
    client: RemoteMeliClient,
    execute: () => Promise<unknown>
  ): Promise<unknown> => {
    const result = await execute();
    await recordConfirmedItemEdits({
      account: client.historyAccount(),
      actor: input.actor,
      env: input.env,
      itemId,
      operation,
      payload: requestPayload,
      requestId: input.requestId,
      result,
      snapshots: (targetItemId) => client.historySnapshots(targetItemId),
      promotionSnapshots: (targetItemId) => client.historyPromotionSnapshots(targetItemId)
    }).catch((error) => {
      console.error(
        JSON.stringify({
          event: 'item_edit_history_write_failed',
          itemId,
          operation,
          requestId: input.requestId,
          error: sanitizeError(error)
        })
      );
    });
    return result;
  };
  const runPromotionOfferMutation = async (
    operation: string,
    itemId: string,
    client: RemoteMeliClient,
    execute: () => Promise<unknown>
  ): Promise<unknown> => {
    try {
      return await runItemMutation(operation, itemId, client, execute);
    } catch (error) {
      const accepted = acceptedPromotionMutation(error);
      if (!accepted) throw error;
      const reconciliationId = await registerPendingPromotionReconciliation({
        actor: input.actor,
        client,
        env: input.env,
        requestId: input.requestId,
        sourceItemId: itemId,
        itemId,
        operation,
        payload: accepted.payload,
        result: accepted.result
      });
      return {
        status: 'pending_confirmation',
        reconciliationId,
        result: accepted.result
      };
    }
  };

  try {
    if (route === 'GET /bulk/reconciliations') {
      return listPromotionReconciliations(input.env, input.actor, input.url);
    }

    if (route === 'POST /resolve') {
      return unwrapLegacyRouteResult(
        await handleResolve({
          req: input.request,
          client: context.client,
          store: context.store,
          clientFactory: context.clientFactory,
          readJson
        })
      );
    }

    if (route === 'POST /resolve/quick') {
      return unwrapLegacyRouteResult(
        await handleResolveQuick({
          req: input.request,
          client: context.client,
          store: context.store,
          clientFactory: context.clientFactory,
          readJson,
          cache: quickCache
        })
      );
    }

    const priceSummary = apiPath.match(/^\/items\/(MLB\d+)\/pricing\/summary$/u);
    if (input.request.method === 'GET' && priceSummary) {
      const client = await resolveItemClient(priceSummary[1]);
      const summary = await handlePriceSummary({ client, itemId: priceSummary[1] });
      const productMatch = await matchPromotionProduct(client, priceSummary[1]);
      return enrichPriceSummaryWithProduct(summary, productMatch);
    }

    const standardPrice = apiPath.match(/^\/items\/(MLB\d+)\/pricing\/standard$/u);
    if (input.request.method === 'PUT' && standardPrice) {
      const client = await resolveItemClient(standardPrice[1]);
      return runItemMutation('pricing.standard.update', standardPrice[1], client, () =>
        handleStandardPriceUpdate({
          req: input.request,
          client,
          itemId: standardPrice[1],
          readJson
        })
      );
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

    const bulkTargets = apiPath.match(/^\/items\/((?:MLB|MLBU)\d+)\/bulk\/targets$/u);
    if (input.request.method === 'GET' && bulkTargets) {
      const targets = await resolveFamilyTargets(await resolveBulkClient(bulkTargets[1]), bulkTargets[1]);
      return {
        total: targets.items.length,
        otherCount: targets.items.filter((target: { current: boolean }) => !target.current).length
      };
    }

    const bulkJobs = apiPath.match(/^\/items\/((?:MLB|MLBU)\d+)\/bulk\/jobs$/u);
    if (input.request.method === 'POST' && bulkJobs) {
      const body = await readJson(input.request);
      return createPromotionBulkJob(input.env, input.actor, await resolveBulkClient(bulkJobs[1]), bulkJobs[1], body);
    }
    const latestBulkJob = apiPath.match(/^\/items\/((?:MLB|MLBU)\d+)\/bulk\/jobs\/latest$/u);
    if (input.request.method === 'GET' && latestBulkJob) {
      const row = await input.env.ONFRAME_DB.prepare(
        `SELECT id FROM promotion_bulk_jobs WHERE workspace_id = ? AND user_id = ? AND source_item_id = ?
         AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 1`
      ).bind(input.actor.workspaceId, input.actor.userId, latestBulkJob[1]).first<{ id: string }>();
      return row ? getPromotionBulkJob(input.env, input.actor, latestBulkJob[1], row.id) : null;
    }
    const bulkJob = apiPath.match(/^\/items\/((?:MLB|MLBU)\d+)\/bulk\/jobs\/([0-9a-f-]{36})$/u);
    if (bulkJob && input.request.method === 'GET') {
      return getPromotionBulkJob(input.env, input.actor, bulkJob[1], bulkJob[2]);
    }
    if (bulkJob && input.request.method === 'DELETE') {
      const job = await promotionBulkJobForActor(input.env, input.actor, bulkJob[1], bulkJob[2]);
      await input.env.ONFRAME_DB.prepare('UPDATE promotion_bulk_jobs SET dismissed_at = ? WHERE id = ?')
        .bind(Date.now(), job.id).run();
      return { dismissed: true };
    }

    const bulkCommit = apiPath.match(/^\/items\/((?:MLB|MLBU)\d+)\/bulk\/commit$/u);
    if (input.request.method === 'POST' && bulkCommit) {
      const client = await resolveBulkClient(bulkCommit[1]);
      return runItemMutation('bulk.commit', bulkCommit[1], client, async () => {
        const result = await handleBulkCommit({
          req: input.request,
          client,
          itemId: bulkCommit[1],
          readJson
        });
        await registerPendingPromotionReconciliations({
          actor: input.actor,
          client,
          env: input.env,
          requestId: input.requestId,
          result,
          sourceItemId: bulkCommit[1]
        });
        return result;
      });
    }

    const descriptionBulk = apiPath.match(/^\/items\/(MLB\d+)\/description\/bulk$/u);
    if (input.request.method === 'POST' && descriptionBulk) {
      const client = await resolveBulkClient(descriptionBulk[1]);
      return runItemMutation('description.update', descriptionBulk[1], client, () =>
        handleDescriptionBulkUpdate({
          req: input.request,
          client,
          itemId: descriptionBulk[1],
          readJson
        })
      );
    }

    const description = apiPath.match(/^\/items\/(MLB\d+)\/description$/u);
    if (input.request.method === 'GET' && description) {
      return handleDescriptionGet({ client: await resolveItemClient(description[1]), itemId: description[1] });
    }
    if (input.request.method === 'PUT' && description) {
      const client = await resolveItemClient(description[1]);
      return runItemMutation('description.update', description[1], client, () =>
        handleDescriptionUpdate({
          req: input.request,
          client,
          itemId: description[1],
          readJson
        })
      );
    }

    const characteristicsBulk = apiPath.match(/^\/items\/(MLB\d+)\/characteristics\/bulk$/u);
    if (input.request.method === 'POST' && characteristicsBulk) {
      const client = await resolveBulkClient(characteristicsBulk[1]);
      return runItemMutation('characteristics.update', characteristicsBulk[1], client, () =>
        handleCharacteristicsBulkUpdate({
          req: input.request,
          client,
          itemId: characteristicsBulk[1],
          readJson
        })
      );
    }

    const characteristics = apiPath.match(/^\/items\/(MLB\d+)\/characteristics$/u);
    if (input.request.method === 'GET' && characteristics) {
      return handleCharacteristicsGet({
        client: await resolveItemClient(characteristics[1]),
        itemId: characteristics[1]
      });
    }
    if (input.request.method === 'PUT' && characteristics) {
      const client = await resolveItemClient(characteristics[1]);
      return runItemMutation('characteristics.update', characteristics[1], client, () =>
        handleCharacteristicsUpdate({
          req: input.request,
          client,
          itemId: characteristics[1],
          readJson
        })
      );
    }

    const promotionSummary = apiPath.match(/^\/items\/(MLB\d+)\/promotions\/summary$/u);
    if (input.request.method === 'GET' && promotionSummary) {
      return handlePromotionSummary({
        client: await resolveItemClient(promotionSummary[1]),
        itemId: promotionSummary[1]
      });
    }

    const promotionEstimates = apiPath.match(/^\/items\/(MLB\d+)\/promotions\/estimates$/u);
    if (input.request.method === 'POST' && promotionEstimates) {
      const client = await resolveItemClient(promotionEstimates[1]);
      const response = await handlePromotionEstimates({
        req: input.request,
        client,
        itemId: promotionEstimates[1],
        readJson
      });
      const productMatch = await matchPromotionProduct(client, promotionEstimates[1]);
      return {
        ...response,
        estimates: Array.isArray(response.estimates)
          ? response.estimates.map((estimate: unknown) => enrichPromotionEstimateWithProduct(estimate, productMatch))
          : []
      };
    }

    const promotionEstimate = apiPath.match(/^\/items\/(MLB\d+)\/promotions\/estimate$/u);
    if (input.request.method === 'POST' && promotionEstimate) {
      const client = await resolveItemClient(promotionEstimate[1]);
      const estimate = await handlePromotionEstimate({
        req: input.request,
        client,
        itemId: promotionEstimate[1],
        readJson
      });
      return enrichPromotionEstimateWithProduct(estimate, await matchPromotionProduct(client, promotionEstimate[1]));
    }

    const productFinancials = apiPath.match(/^\/items\/(MLB\d+)\/product-financials$/u);
    if (input.request.method === 'PATCH' && productFinancials) {
      const client = await resolveItemClient(productFinancials[1]);
      const productMatch = await matchPromotionProduct(client, productFinancials[1]);
      if (productMatch.status !== 'matched' || !productMatch.product?.id) {
        throw new RemoteApiError(
          'product_not_found',
          404,
          'Nenhum produto do OnFrame foi encontrado para este anúncio.'
        );
      }
      const body = await readJson(input.request);
      const hasCost = Object.prototype.hasOwnProperty.call(body, 'cost');
      const hasTaxRate = Object.prototype.hasOwnProperty.call(body, 'taxRate');
      if (!hasCost && !hasTaxRate) {
        throw new RemoteApiError('product_invalid_payload', 400, 'Informe o custo ou o imposto que deseja alterar.');
      }
      const product = await updateProductFinancials(input.env, input.actor, productMatch.product.id, input.requestId, {
        ...(hasCost ? { cost: body.cost } : {}),
        ...(hasTaxRate ? { taxRate: body.taxRate } : {}),
        taxSource: 'tax' in productMatch ? (productMatch.tax?.source ?? undefined) : undefined,
        sellerAccountId: client.historyAccount().id
      });
      const tax = await resolveProductTaxRate(input.env, {
        workspaceId: input.actor.workspaceId,
        sellerAccountId: client.historyAccount().id,
        productId: product.id
      });
      return { product, tax };
    }

    const offer = apiPath.match(/^\/items\/(MLB\d+)\/promotions\/offers$/u);
    if (input.request.method === 'POST' && offer) {
      const client = await resolveItemClient(offer[1]);
      return runPromotionOfferMutation('promotion.offer.create', offer[1], client, () =>
        handleCreateOffer({ req: input.request, client, itemId: offer[1], readJson })
      );
    }
    if (input.request.method === 'PUT' && offer) {
      const client = await resolveItemClient(offer[1]);
      return runPromotionOfferMutation('promotion.offer.update', offer[1], client, () =>
        handleUpdateOffer({ req: input.request, client, itemId: offer[1], readJson })
      );
    }
    if (input.request.method === 'DELETE' && offer) {
      const client = await resolveItemClient(offer[1]);
      return runPromotionOfferMutation('promotion.offer.delete', offer[1], client, () =>
        handleDeleteOffer({ req: input.request, client, itemId: offer[1], readJson })
      );
    }

    if (route === 'GET /promotions/campaigns') return handleCampaignList({ client: context.client });
    if (route === 'POST /promotions/campaigns')
      return handleCreateCampaign({ req: input.request, client: context.client, readJson });

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
      return handlePictureUpload({
        req: input.request,
        client: await resolveItemClient(pictureUpload[1]),
        itemId: pictureUpload[1],
        readJson
      });
    }

    const pictureQuality = apiPath.match(/^\/items\/(MLB\d+)\/pictures\/quality$/u);
    if (input.request.method === 'GET' && pictureQuality) {
      return handlePictureQuality({
        url: input.url,
        client: await resolveItemClient(pictureQuality[1]),
        itemId: pictureQuality[1]
      });
    }

    const pictureFixSize = apiPath.match(/^\/items\/(MLB\d+)\/pictures\/fix-size$/u);
    if (input.request.method === 'POST' && pictureFixSize) {
      return handlePictureFixSize({
        req: input.request,
        client: await resolveItemClient(pictureFixSize[1]),
        itemId: pictureFixSize[1],
        readJson
      });
    }

    const pictureCommit = apiPath.match(/^\/items\/(MLB\d+)\/pictures\/commit$/u);
    if (input.request.method === 'POST' && pictureCommit) {
      const client = await resolveItemClient(pictureCommit[1]);
      return runItemMutation('pictures.update', pictureCommit[1], client, () =>
        handlePictureCommit({ req: input.request, client, itemId: pictureCommit[1], readJson })
      );
    }

    throw new RemoteApiError('endpoint_not_found', 404, 'Endpoint nao encontrado.');
  } catch (error) {
    throw normalizeRemoteApiError(error);
  }
}

export function remoteApiErrorPayload(
  error: unknown,
  requestId: string
): { status: number; payload: Record<string, string> } {
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

type PromotionBulkJobRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  source_item_id: string;
  seller_account_id: string;
  action: string;
  payload_json: string;
  status: string;
  total: number;
};

async function promotionBulkJobForActor(
  env: RemoteRuntimeEnv, actor: RemoteApiActor, sourceItemId: string, id: string
): Promise<PromotionBulkJobRow> {
  const job = await env.ONFRAME_DB.prepare(
    `SELECT * FROM promotion_bulk_jobs WHERE id = ? AND workspace_id = ? AND user_id = ? AND source_item_id = ?`
  ).bind(id, actor.workspaceId, actor.userId, sourceItemId).first<PromotionBulkJobRow>();
  if (!job) throw new RemoteApiError('promotion_bulk_job_not_found', 404);
  return job;
}

async function createPromotionBulkJob(
  env: RemoteRuntimeEnv, actor: RemoteApiActor, client: RemoteMeliClient,
  sourceItemId: string, body: Record<string, unknown>
): Promise<unknown> {
  const action = String(body.action || '');
  const payload = recordOrNull(body.payload);
  const selected = body.targetItemIds;
  if (!/^promotion\.offer\.(create|update|delete)$/u.test(action) || !payload ||
    !Array.isArray(selected) || !selected.length || selected.some((id) => typeof id !== 'string') ||
    new Set(selected).size !== selected.length) {
    throw new RemoteApiError('promotion_bulk_invalid_selection', 400);
  }
  const preview = await buildBulkPreview(client, sourceItemId, { action, payload });
  if (preview.targets.length > 500) {
    throw new RemoteApiError('promotion_bulk_too_many_targets', 409,
      'Esta família tem anúncios demais para uma única operação.');
  }
  const eligible = preview.targets.filter((target: { eligible: boolean }) => target.eligible);
  const eligibleIds = new Set(eligible.map((target: { itemId: string }) => target.itemId));
  if (selected.length !== eligibleIds.size || selected.some((id) => !eligibleIds.has(id)) ||
    !eligible.some((target: { current: boolean }) => !target.current)) {
    throw new RemoteApiError('promotion_bulk_selection_changed', 409,
      'Os anúncios da família mudaram. Revise a prévia antes de confirmar.');
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const account = client.historyAccount();
  const active = await env.ONFRAME_DB.prepare(
    `SELECT id FROM promotion_bulk_jobs WHERE workspace_id = ? AND user_id = ? AND source_item_id = ?
     AND status IN ('queued', 'running', 'confirming') LIMIT 1`
  ).bind(actor.workspaceId, actor.userId, sourceItemId).first();
  if (active) throw new RemoteApiError('promotion_bulk_job_active', 409,
    'Já existe uma aplicação em andamento para este anúncio.');
  try {
    await env.ONFRAME_DB.prepare(
    `INSERT INTO promotion_bulk_jobs
     (id, workspace_id, user_id, source_item_id, seller_account_id, action, payload_json, total, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, actor.workspaceId, actor.userId, sourceItemId, account.id, action,
      JSON.stringify(payload), preview.targets.length, now, now).run();
  } catch (error) {
    if (/UNIQUE constraint|SQLITE_CONSTRAINT_UNIQUE/iu.test(String(error))) {
      throw new RemoteApiError('promotion_bulk_job_active', 409,
        'Já existe uma aplicação em andamento para este anúncio.');
    }
    throw error;
  }
  try {
    for (let index = 0; index < preview.targets.length; index += 50) {
      await env.ONFRAME_DB.batch(preview.targets.slice(index, index + 50).map((target: {
        itemId: string; title?: string; eligible: boolean; message?: string
      }) => env.ONFRAME_DB.prepare(
        `INSERT INTO promotion_bulk_job_items (job_id, item_id, title, status, message)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(id, target.itemId, target.title || null, target.eligible ? 'queued' : 'blocked',
        target.message || null)));
    }
    await env.PROMOTION_BULK.create({ id, params: { jobId: id } });
  } catch (error) {
    try {
      const instance = await env.PROMOTION_BULK.get(id);
      await instance.status();
      return getPromotionBulkJob(env, actor, sourceItemId, id);
    } catch {
      await env.ONFRAME_DB.prepare('DELETE FROM promotion_bulk_jobs WHERE id = ?').bind(id).run();
    }
    throw error;
  }
  return getPromotionBulkJob(env, actor, sourceItemId, id);
}

export async function getPromotionBulkJob(
  env: RemoteRuntimeEnv, actor: RemoteApiActor, sourceItemId: string, id: string
): Promise<unknown> {
  const job = await promotionBulkJobForActor(env, actor, sourceItemId, id);
  let status = job.status;
  if (job.status === 'queued' || job.status === 'running') {
    try {
      const instance = await env.PROMOTION_BULK.get(id);
      const state = await instance.status();
      if (state.status === 'errored' || state.status === 'terminated') {
        await env.ONFRAME_DB.prepare(
          `UPDATE promotion_bulk_job_items SET status = 'unconfirmed',
           message = 'A execução foi interrompida; confira o anúncio antes de repetir a ação.'
           WHERE job_id = ? AND status = 'running'`
        ).bind(id).run();
        await env.ONFRAME_DB.prepare(
          `UPDATE promotion_bulk_job_items SET status = 'failed', message = 'A execução foi interrompida.'
           WHERE job_id = ? AND status = 'queued'`
        ).bind(id).run();
        await finishPromotionBulkJob(env, id);
        const finished = await env.ONFRAME_DB.prepare('SELECT status FROM promotion_bulk_jobs WHERE id = ?')
          .bind(id).first<{ status: string }>();
        status = finished?.status || status;
      }
    } catch {
      // A instância pode ainda estar sendo criada; a próxima consulta reconcilia o estado.
    }
  }
  if (status === 'confirming') {
    const stalled = await env.ONFRAME_DB.prepare(
      `SELECT reconciliations.id, reconciliations.expires_at AS expiresAt
       FROM promotion_bulk_job_items AS items
       INNER JOIN promotion_reconciliations AS reconciliations ON reconciliations.id = items.reconciliation_id
       WHERE items.job_id = ? AND items.status = 'pending_confirmation'
         AND reconciliations.status = 'pending'
         AND (reconciliations.workflow_started_at IS NULL OR reconciliations.expires_at <= ?)
       LIMIT 10`
    ).bind(id, Date.now()).all<{ id: string; expiresAt: number }>();
    for (const row of stalled.results) {
      if (row.expiresAt <= Date.now()) await markPromotionReconciliationUnconfirmed(env, row.id);
      else await startPromotionReconciliation(env, row.id);
    }
  }
  const rows = await env.ONFRAME_DB.prepare(
    `SELECT items.item_id AS itemId, items.title, items.status, items.message,
            items.result_json AS resultJson, items.reconciliation_id AS reconciliationId,
            reconciliations.status AS confirmationStatus, reconciliations.last_error AS confirmationError
     FROM promotion_bulk_job_items AS items
     LEFT JOIN promotion_reconciliations AS reconciliations ON reconciliations.id = items.reconciliation_id
     WHERE items.job_id = ? ORDER BY items.item_id`
  ).bind(id).all<{
    itemId: string; title: string | null; status: string; message: string | null;
    resultJson: string | null; reconciliationId: string | null; confirmationStatus: string | null;
    confirmationError: string | null
  }>();
  const targets = rows.results.map((row) => ({
    itemId: row.itemId,
    title: row.title,
    status: row.status === 'pending_confirmation' && row.confirmationStatus === 'confirmed' ? 'applied'
      : row.status === 'pending_confirmation' && row.confirmationStatus === 'unconfirmed' ? 'unconfirmed'
        : row.status,
    eligible: row.status !== 'blocked',
    message: row.confirmationStatus === 'confirmed' || row.confirmationStatus === 'unconfirmed'
      ? reconciliationMessage(row.confirmationStatus, row.confirmationError) : row.message,
    reconciliationId: row.reconciliationId,
    result: row.resultJson ? parseStoredJson(row.resultJson) : null
  }));
  const counts = {
    total: targets.length,
    eligible: targets.filter((target) => target.eligible).length,
    blocked: targets.filter((target) => target.status === 'blocked').length,
    applied: targets.filter((target) => target.status === 'applied').length,
    failed: targets.filter((target) => target.status === 'failed').length,
    pending: targets.filter((target) => target.status === 'pending_confirmation').length,
    unconfirmed: targets.filter((target) => target.status === 'unconfirmed').length,
    queued: targets.filter((target) => target.status === 'queued' || target.status === 'running').length
  };
  if (status === 'confirming' && !counts.pending) {
    await finishPromotionBulkJob(env, id, counts);
    status = counts.failed || counts.unconfirmed || counts.blocked
      ? counts.applied ? 'partial' : 'failed' : 'completed';
  }
  return { id, status, action: job.action, counts, targets };
}

export async function applyPromotionBulkTarget(env: RemoteRuntimeEnv, jobId: string, itemId: string) {
  const claimed = await env.ONFRAME_DB.prepare(
    `UPDATE promotion_bulk_job_items SET status = 'running'
     WHERE job_id = ? AND item_id = ? AND status = 'queued'`
  ).bind(jobId, itemId).run();
  if (claimed.meta.changes !== 1) {
    return { status: 'unconfirmed', message: 'Confira o anúncio antes de repetir a ação.' };
  }
  const job = await env.ONFRAME_DB.prepare('SELECT * FROM promotion_bulk_jobs WHERE id = ?')
    .bind(jobId).first<PromotionBulkJobRow>();
  if (!job) return { status: 'failed', message: 'A operação não foi encontrada.' };
  const membership = await env.ONFRAME_DB.prepare(
    `SELECT role_id, (SELECT group_concat(permission) FROM workspace_role_permissions
      WHERE role_id = workspace_members.role_id) AS permissions_csv
     FROM workspace_members WHERE workspace_id = ? AND user_id = ?`
  ).bind(job.workspace_id, job.user_id).first<{ role_id: string; permissions_csv: string | null }>();
  if (!membership) return { status: 'failed', message: 'O acesso ao workspace foi removido.' };
  const account = await env.ONFRAME_DB.prepare(
    'SELECT meli_user_id FROM seller_accounts WHERE id = ? AND workspace_id = ?'
  ).bind(job.seller_account_id, job.workspace_id).first<{ meli_user_id: string }>();
  if (!account) return { status: 'failed', message: 'A conta conectada não está mais disponível.' };
  const actor: RemoteApiActor = {
    sessionId: job.id, userId: job.user_id, workspaceId: job.workspace_id,
    roleId: membership.role_id, permissions: membership.permissions_csv?.split(',') || []
  };
  const url = new URL(`https://onframe.onblide.com/v1/api/items/${job.source_item_id}/bulk/commit`);
  url.searchParams.set('owner_user_id', account.meli_user_id);
  const request = new Request(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'user_product_family', action: job.action,
      payload: JSON.parse(job.payload_json), targetItemIds: [itemId] })
  });
  try {
    const response = await handleRemoteApiRequest({ actor, env, request, requestId: `${jobId}:${itemId}`, url });
    const responseTargets = recordOrNull(response)?.targets;
    const target = recordOrNull(Array.isArray(responseTargets) ? responseTargets[0] : null);
    if (!target || target.itemId !== itemId) return { status: 'unconfirmed', message: 'Resultado do anúncio indisponível.' };
    if (target.status === 'pending_confirmation' && typeof target.reconciliationId !== 'string') {
      return { status: 'unconfirmed', message: 'A alteração foi aceita, mas não foi possível acompanhar a confirmação.' };
    }
    const uncertainFailure = target.status === 'failed' &&
      (target.statusCode == null || !Number.isInteger(Number(target.statusCode)) || Number(target.statusCode) >= 500);
    return {
      status: uncertainFailure ? 'unconfirmed' : String(target.status || 'unconfirmed'),
      message: String(target.message || ''),
      reconciliationId: typeof target.reconciliationId === 'string' ? target.reconciliationId : null,
      result: target.result || null
    };
  } catch (error) {
    const failure = normalizeRemoteApiError(error);
    return { status: failure.statusCode >= 500 ? 'unconfirmed' : 'failed',
      message: userFriendlyError(failure, sanitizeError(failure), failure.statusCode) };
  }
}

export async function storePromotionBulkTarget(
  env: RemoteRuntimeEnv, jobId: string, itemId: string,
  outcome: { status: string; message?: string; reconciliationId?: string | null; result?: unknown }
) {
  const status = ['applied', 'pending_confirmation', 'failed', 'unconfirmed'].includes(outcome.status)
    ? outcome.status : 'unconfirmed';
  await env.ONFRAME_DB.prepare(
    `UPDATE promotion_bulk_job_items SET status = ?, message = ?, result_json = ?, reconciliation_id = ?
     WHERE job_id = ? AND item_id = ? AND status = 'running'`
  ).bind(status, outcome.message || null, outcome.result ? JSON.stringify(outcome.result) : null,
    outcome.reconciliationId || null, jobId, itemId).run();
}

export async function finishPromotionBulkJob(
  env: RemoteRuntimeEnv, id: string, providedCounts?: { pending: number; applied: number; failed: number; unconfirmed: number; blocked: number }
) {
  let counts = providedCounts;
  if (!counts) {
    const rows = await env.ONFRAME_DB.prepare(
      'SELECT status, COUNT(*) AS total FROM promotion_bulk_job_items WHERE job_id = ? GROUP BY status'
    ).bind(id).all<{ status: string; total: number }>();
    const byStatus = Object.fromEntries(rows.results.map((row) => [row.status, row.total]));
    counts = { pending: byStatus.pending_confirmation || 0, applied: byStatus.applied || 0,
      failed: byStatus.failed || 0, unconfirmed: byStatus.unconfirmed || 0, blocked: byStatus.blocked || 0 };
  }
  const status = counts.pending ? 'confirming' : counts.failed || counts.unconfirmed || counts.blocked
    ? counts.applied ? 'partial' : 'failed' : 'completed';
  await env.ONFRAME_DB.prepare(
    'UPDATE promotion_bulk_jobs SET status = ?, updated_at = ?, finished_at = ? WHERE id = ?'
  ).bind(status, Date.now(), status === 'confirming' ? null : Date.now(), id).run();
}

function unwrapLegacyRouteResult(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const result = value as { statusCode?: unknown; payload?: unknown };
  if (
    !Object.prototype.hasOwnProperty.call(result, 'statusCode') ||
    !Object.prototype.hasOwnProperty.call(result, 'payload')
  ) {
    return value;
  }
  const statusCode = Number(result.statusCode);
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) return value;
  if (statusCode < 400) return result.payload;

  const payload =
    result.payload && typeof result.payload === 'object' ? (result.payload as Record<string, unknown>) : {};
  const message =
    typeof payload.error === 'string' && payload.error.trim() ? payload.error : 'A requisicao nao pode ser concluida.';
  throw new RemoteApiError(errorCodeForStatus(statusCode), statusCode, message, result.payload);
}

async function registerPendingPromotionReconciliations(input: {
  actor: RemoteApiActor;
  client: RemoteMeliClient;
  env: RemoteRuntimeEnv;
  requestId: string;
  result: unknown;
  sourceItemId: string;
}): Promise<void> {
  const result = recordOrNull(input.result);
  const action = typeof result?.action === 'string' ? result.action : '';
  const targets = Array.isArray(result?.targets) ? result.targets : [];
  if (!/^promotion\.offer\.(create|update|delete)$/u.test(action) || !targets.length) return;

  for (const candidate of targets) {
    const target = recordOrNull(candidate);
    if (!target || target.status !== 'pending_confirmation') continue;
    const itemId = typeof target.itemId === 'string' ? target.itemId : '';
    const metadata = recordOrNull(target._reconciliation);
    const payload = recordOrNull(metadata?.payload);
    if (!itemId || !payload) continue;
    target.reconciliationId = await registerPendingPromotionReconciliation({
      actor: input.actor,
      client: input.client,
      env: input.env,
      requestId: input.requestId,
      sourceItemId: input.sourceItemId,
      itemId,
      operation: action,
      payload,
      result: metadata?.result ?? target.result ?? {}
    });
  }
}

async function registerPendingPromotionReconciliation(input: {
  actor: RemoteApiActor;
  client: RemoteMeliClient;
  env: RemoteRuntimeEnv;
  requestId: string;
  sourceItemId: string;
  itemId: string;
  operation: string;
  payload: Record<string, unknown>;
  result: unknown;
}): Promise<string | null> {
  const reconciliationId = crypto.randomUUID();
  const now = Date.now();
  const account = input.client.historyAccount();
  try {
    await input.env.ONFRAME_DB.prepare(
      `
      INSERT INTO promotion_reconciliations (
        id, workspace_id, seller_account_id, user_id, request_id,
        source_item_id, item_id, operation, payload_json, accepted_result_json, history_before_json,
        actor_name, actor_email, status, attempts, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
    `
    )
      .bind(
        reconciliationId,
        input.actor.workspaceId,
        account.id,
        input.actor.userId,
        input.requestId,
        input.sourceItemId,
        input.itemId,
        input.operation,
        JSON.stringify(input.payload),
        JSON.stringify(input.result ?? {}),
        JSON.stringify(input.client.historyPromotionSnapshots(input.itemId).first ?? null),
        input.actor.displayName || null,
        input.actor.email || null,
        now,
        now,
        now + RECONCILIATION_RETENTION_MS
      )
      .run();
    await startPromotionReconciliation(input.env, reconciliationId);
    return reconciliationId;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'promotion_reconciliation_registration_failed',
        itemId: input.itemId,
        reconciliationId,
        requestId: input.requestId,
        error: sanitizeError(error)
      })
    );
    return null;
  }
}

function acceptedPromotionMutation(error: unknown): { payload: Record<string, unknown>; result: unknown } | null {
  const candidate = error as {
    accepted?: unknown;
    acceptedResult?: unknown;
    verificationPayload?: unknown;
  } | null;
  const payload = recordOrNull(candidate?.verificationPayload);
  if (candidate?.accepted !== true || !payload) return null;
  return { payload, result: candidate.acceptedResult ?? {} };
}

async function listPromotionReconciliations(
  env: RemoteRuntimeEnv,
  actor: RemoteApiActor,
  url: URL
): Promise<Record<string, unknown>> {
  const ids = uniqueReconciliationIds(url.searchParams.get('ids'));
  if (!ids.length)
    throw new RemoteApiError('reconciliation_ids_required', 400, 'Informe as operações que deseja consultar.');

  const placeholders = ids.map(() => '?').join(', ');
  const records = await env.ONFRAME_DB.prepare(
    `
    SELECT id, item_id, status, attempts, last_error, workflow_started_at, accepted_result_json
    FROM promotion_reconciliations
    WHERE workspace_id = ? AND user_id = ? AND id IN (${placeholders})
  `
  )
    .bind(actor.workspaceId, actor.userId, ...ids)
    .all<{
      id: string;
      item_id: string;
      status: 'pending' | 'confirmed' | 'unconfirmed';
      attempts: number;
      last_error: string | null;
      workflow_started_at: number | null;
      accepted_result_json: string;
    }>();

  const rows = records.results ?? [];
  await Promise.all(
    rows
      .filter((row) => row.status === 'pending' && !row.workflow_started_at)
      .map((row) => startPromotionReconciliation(env, row.id))
  );

  return {
    operations: rows.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      status: row.status,
      attempts: Number(row.attempts || 0),
      message: reconciliationMessage(row.status, row.last_error),
      result: row.status === 'confirmed' ? parseStoredJson(row.accepted_result_json) : undefined
    }))
  };
}

async function startPromotionReconciliation(env: RemoteRuntimeEnv, reconciliationId: string): Promise<void> {
  try {
    await env.PROMOTION_RECONCILIATION.create({
      id: reconciliationId,
      params: { reconciliationId }
    });
    await env.ONFRAME_DB.prepare(
      `
      UPDATE promotion_reconciliations
      SET workflow_started_at = COALESCE(workflow_started_at, ?), updated_at = ?
      WHERE id = ? AND status = 'pending'
    `
    )
      .bind(Date.now(), Date.now(), reconciliationId)
      .run();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'promotion_reconciliation_start_failed',
        reconciliationId,
        error: sanitizeError(error)
      })
    );
  }
}

function uniqueReconciliationIds(value: string | null): string[] {
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(entry))
    )
  ).slice(0, 50);
}

function reconciliationMessage(status: PromotionReconciliationRow['status'], lastError: string | null): string {
  if (status === 'confirmed') return 'Alteração confirmada pelo Mercado Livre.';
  if (status === 'unconfirmed')
    return 'O estado final não foi confirmado. Atualize as promoções antes de repetir a ação.';
  return lastError
    ? 'A alteração foi aceita e uma nova confirmação será tentada automaticamente.'
    : 'A alteração foi aceita e aguarda confirmação do Mercado Livre.';
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseStoredJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export async function reconcilePromotionOperation(
  env: RemoteRuntimeEnv,
  reconciliationId: string
): Promise<ReconciliationOutcome> {
  const row = await env.ONFRAME_DB.prepare(
    `
    SELECT reconciliations.*,
           accounts.meli_user_id, accounts.nickname, accounts.site_id, accounts.profile_url,
           accounts.enabled AS account_enabled
    FROM promotion_reconciliations AS reconciliations
    INNER JOIN seller_accounts AS accounts ON accounts.id = reconciliations.seller_account_id
    WHERE reconciliations.id = ?
  `
  )
    .bind(reconciliationId)
    .first<PromotionReconciliationRow>();
  if (!row) return { id: reconciliationId, itemId: '', status: 'missing', attempts: 0 };
  if (row.status !== 'pending') return reconciliationOutcome(row);
  if (row.expires_at <= Date.now() || row.account_enabled !== 1) {
    return markPromotionReconciliationUnconfirmed(env, reconciliationId);
  }

  const attempts = Number(row.attempts || 0) + 1;
  const payload = recordOrNull(parseStoredJson(row.payload_json));
  const action = row.operation.match(/^promotion\.offer\.(create|update|delete)$/u)?.[1];
  if (!payload || !action || !row.meli_user_id) {
    return markPromotionReconciliationUnconfirmed(env, reconciliationId, 'reconciliation_payload_invalid');
  }

  const account: SellerAccount = {
    id: row.seller_account_id,
    meliUserId: row.meli_user_id,
    nickname: row.nickname || null,
    siteId: row.site_id || null,
    profileUrl: row.profile_url || null,
    enabled: row.account_enabled === 1
  };
  const client = new RemoteMeliClient(env, account);

  try {
    const confirmed = await verifyOfferMutation(client, row.item_id, action, payload);
    if (!confirmed) {
      await updatePendingPromotionReconciliation(env, reconciliationId, attempts, null);
      return { id: row.id, itemId: row.item_id, status: 'pending', attempts };
    }

    await client.getItem(row.item_id);
    await recordConfirmedItemEdits({
      account: client.historyAccount(),
      actor: {
        userId: row.user_id,
        workspaceId: row.workspace_id,
        displayName: row.actor_name || undefined,
        email: row.actor_email || undefined
      },
      env,
      itemId: row.item_id,
      operation: row.operation,
      payload,
      requestId: row.request_id,
      result: parseStoredJson(row.accepted_result_json),
      snapshots: (itemId) => client.historySnapshots(itemId),
      promotionSnapshots: (itemId) => ({
        first: parseStoredJson(row.history_before_json || 'null'),
        latest: client.historyPromotionSnapshots(itemId).latest
      })
    });

    const now = Date.now();
    await env.ONFRAME_DB.prepare(
      `
      UPDATE promotion_reconciliations
      SET status = 'confirmed', attempts = ?, last_error = NULL, updated_at = ?, completed_at = ?
      WHERE id = ? AND status = 'pending'
    `
    )
      .bind(attempts, now, now, reconciliationId)
      .run();
    return {
      id: row.id,
      itemId: row.item_id,
      status: 'confirmed',
      attempts
    };
  } catch (error) {
    const message = sanitizeError(error);
    await updatePendingPromotionReconciliation(env, reconciliationId, attempts, message);
    return { id: row.id, itemId: row.item_id, status: 'pending', attempts, message };
  }
}

async function updatePendingPromotionReconciliation(
  env: RemoteRuntimeEnv,
  reconciliationId: string,
  attempts: number,
  lastError: string | null
): Promise<void> {
  await env.ONFRAME_DB.prepare(
    `
    UPDATE promotion_reconciliations
    SET attempts = ?, last_error = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'
  `
  )
    .bind(attempts, lastError, Date.now(), reconciliationId)
    .run();
}

export async function markPromotionReconciliationUnconfirmed(
  env: RemoteRuntimeEnv,
  reconciliationId: string,
  lastError: string | null = null
): Promise<ReconciliationOutcome> {
  const now = Date.now();
  await env.ONFRAME_DB.prepare(
    `
    UPDATE promotion_reconciliations
    SET status = 'unconfirmed', last_error = COALESCE(?, last_error), updated_at = ?, completed_at = ?
    WHERE id = ? AND status = 'pending'
  `
  )
    .bind(lastError, now, now, reconciliationId)
    .run();
  const row = await env.ONFRAME_DB.prepare(
    `
    SELECT id, item_id, status, attempts, last_error
    FROM promotion_reconciliations
    WHERE id = ?
  `
  )
    .bind(reconciliationId)
    .first<PromotionReconciliationRow>();
  if (!row) return { id: reconciliationId, itemId: '', status: 'missing', attempts: 0 };
  return reconciliationOutcome(row);
}

function reconciliationOutcome(row: PromotionReconciliationRow): ReconciliationOutcome {
  return {
    id: row.id,
    itemId: row.item_id,
    status: row.status,
    attempts: Number(row.attempts || 0),
    message: reconciliationMessage(row.status, row.last_error)
  };
}

async function createRemoteApiContext(env: RemoteRuntimeEnv, actor: RemoteApiActor): Promise<RemoteApiContext> {
  assertRemoteMeliConfigured(env);
  const records = await env.ONFRAME_DB.prepare(
    `
    SELECT accounts.id, accounts.meli_user_id, accounts.nickname, accounts.site_id,
           accounts.profile_url, accounts.enabled
    FROM seller_accounts AS accounts
    INNER JOIN workspace_members AS members
      ON members.workspace_id = accounts.workspace_id AND members.user_id = ?
    WHERE accounts.workspace_id = ?
      AND (
        members.role_id = 'admin'
        OR EXISTS (
          SELECT 1
          FROM account_members
          WHERE account_members.seller_account_id = accounts.id
            AND account_members.user_id = ?
        )
      )
    ORDER BY accounts.created_at ASC
  `
  )
    .bind(actor.userId, actor.workspaceId, actor.userId)
    .all<{
      id: string;
      meli_user_id: string;
      nickname: string | null;
      site_id: string | null;
      profile_url: string | null;
      enabled: number;
    }>();
  if (!records.results?.length) {
    const membership = await env.ONFRAME_DB.prepare(
      `
      SELECT role_id
      FROM workspace_members
      WHERE workspace_id = ? AND user_id = ?
    `
    )
      .bind(actor.workspaceId, actor.userId)
      .first<{ role_id: string }>();
    if (!membership)
      throw new RemoteApiError('workspace_access_forbidden', 403, 'Você não faz mais parte deste workspace.');
  }
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
    const account = (legacyAccount && accountsByUserId.get(String(legacyAccount.user_id))) || defaultAccount;
    if (!account) throw new RemoteApiError('workspace_account_unavailable', 409);
    return new RemoteMeliClient(env, account);
  };

  return {
    accounts,
    client: clientFactory(null),
    clientFactory,
    store: {
      listAccountTokens: async () => legacyAccounts,
      readAccount: async (userId: string) =>
        legacyAccounts.find((account) => account.user_id === String(userId)) || null
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
    throw new RemoteApiError(
      'workspace_account_access_forbidden',
      403,
      'Conta conectada nao encontrada para este anuncio.'
    );
  }
  const account = await input.context.store.readAccount(ownerUserId);
  if (!account)
    throw new RemoteApiError(
      'workspace_account_access_forbidden',
      403,
      'Conta conectada nao encontrada para este anuncio.'
    );
  if (account.enabled === false)
    throw new RemoteApiError('workspace_accounts_disabled', 403, 'Esta conta esta desativada no OnFrame.');
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

async function readRequestJson(
  request: Request,
  options: { maxBytes?: number } = {}
): Promise<Record<string, unknown>> {
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
  private readonly firstItemSnapshots = new Map<string, Record<string, unknown>>();
  private readonly latestItemSnapshots = new Map<string, Record<string, unknown>>();
  private readonly firstPromotionSnapshots = new Map<string, unknown>();
  private readonly latestPromotionSnapshots = new Map<string, unknown>();
  private accessTokenPromise: Promise<string> | null = null;
  private refreshAccessTokenPromise: Promise<string> | null = null;

  constructor(
    private readonly env: RemoteRuntimeEnv,
    private readonly account: SellerAccount
  ) {}

  async getMe(): Promise<{ id: string }> {
    return { id: this.account.meliUserId };
  }

  async getItem(itemId: string): Promise<unknown> {
    const item = await this.request(`/items/${encodeURIComponent(itemId)}`);
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const snapshot = item as Record<string, unknown>;
      const normalizedId = String(snapshot.id || itemId);
      if (!this.firstItemSnapshots.has(normalizedId)) this.firstItemSnapshots.set(normalizedId, snapshot);
      this.latestItemSnapshots.set(normalizedId, snapshot);
      if (!this.firstItemSnapshots.has(itemId)) this.firstItemSnapshots.set(itemId, snapshot);
      this.latestItemSnapshots.set(itemId, snapshot);
    }
    return item;
  }

  historyAccount(): { id: string; meliUserId: string; nickname: string | null } {
    return { id: this.account.id, meliUserId: this.account.meliUserId, nickname: this.account.nickname };
  }

  historySnapshots(itemId: string): { first: Record<string, unknown> | null; latest: Record<string, unknown> | null } {
    return {
      first: this.firstItemSnapshots.get(itemId) || null,
      latest: this.latestItemSnapshots.get(itemId) || null
    };
  }

  historyPromotionSnapshots(itemId: string): { first: unknown; latest: unknown } {
    return {
      first: this.firstPromotionSnapshots.get(itemId) ?? null,
      latest: this.latestPromotionSnapshots.get(itemId) ?? null
    };
  }

  private rememberPromotionSnapshot(itemId: string, snapshot: unknown): void {
    if (!this.firstPromotionSnapshots.has(itemId)) this.firstPromotionSnapshots.set(itemId, snapshot);
    this.latestPromotionSnapshots.set(itemId, snapshot);
  }

  private async ensurePromotionHistoryBefore(itemId: string): Promise<void> {
    if (this.firstPromotionSnapshots.has(itemId)) return;
    try {
      await this.getItemPromotions(itemId);
    } catch {
      // Historico auxiliar nao deve impedir uma mutacao valida.
    }
  }
  async getItemPrices(
    itemId: string,
    options: { displayVersion?: boolean; showAllPrices?: boolean } = {}
  ): Promise<unknown> {
    return this.request(
      withQuery(`/items/${encodeURIComponent(itemId)}/prices`, {
        display_version: options.displayVersion ? 'true' : undefined
      }),
      {
        headers: options.showAllPrices ? { 'show-all-prices': 'true' } : undefined
      }
    );
  }
  async getItemSalePrice(
    itemId: string,
    params: Record<string, unknown> = {},
    options: { calculateNetTaxes?: boolean } = {}
  ): Promise<unknown> {
    return this.request(withQuery(`/items/${encodeURIComponent(itemId)}/sale_price`, params), {
      headers: options.calculateNetTaxes ? { 'x-calculate-net-taxes': 'true' } : undefined
    });
  }
  async getCategory(categoryId: string): Promise<unknown> {
    return this.request(`/categories/${encodeURIComponent(categoryId)}`);
  }
  async getCategoryAttributes(categoryId: string): Promise<unknown> {
    return this.request(`/categories/${encodeURIComponent(categoryId)}/attributes`);
  }
  async getDomainTechnicalSpecs(domainId: string): Promise<unknown> {
    return this.request(`/domains/${encodeURIComponent(domainId)}/technical_specs`);
  }
  async getUserProduct(userProductId: string): Promise<unknown> {
    return this.request(`/user-products/${encodeURIComponent(userProductId)}`);
  }
  async getUserProductFamily(siteId: string, familyId: string): Promise<unknown> {
    return this.request(`/sites/${encodeURIComponent(siteId)}/user-products-families/${encodeURIComponent(familyId)}`);
  }
  async searchItemsByUserProduct(
    userId: string | number,
    userProductId: string,
    options: Record<string, unknown> = {}
  ): Promise<unknown> {
    return this.request(
      withQuery(`/users/${encodeURIComponent(userId)}/items/search`, { ...options, user_product_id: userProductId })
    );
  }
  async getListingPrices(siteId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.request(withQuery(`/sites/${encodeURIComponent(siteId)}/listing_prices`, params));
  }
  async getSellerShippingCost(userId: string | number, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.request(withQuery(`/users/${encodeURIComponent(userId)}/shipping_options/free`, params));
  }
  async getPriceReference(itemId: string): Promise<unknown> {
    return this.request(`/suggestions/items/${encodeURIComponent(itemId)}/details`);
  }
  async getPricingAutomation(itemId: string): Promise<unknown> {
    return this.request(`/pricing-automation/items/${encodeURIComponent(itemId)}/automation`);
  }
  async getCatalogCompetition(itemId: string): Promise<unknown> {
    return this.request(`/items/${encodeURIComponent(itemId)}/price_to_win?version=v2`);
  }
  async getBuyboxSync(itemId: string): Promise<unknown> {
    return this.request(`/public/buybox/sync/${encodeURIComponent(itemId)}`, { headers: { 'x-public': 'true' } });
  }
  async getSellerPromotions(userId: string | number): Promise<unknown> {
    return this.request(`/seller-promotions/users/${encodeURIComponent(userId)}?app_version=v2`);
  }
  async getItemPromotions(itemId: string): Promise<unknown> {
    const promotions = await this.request(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`);
    this.rememberPromotionSnapshot(itemId, promotions);
    return promotions;
  }
  async getPromotion(promotionId: string, promotionType: string): Promise<unknown> {
    return this.request(
      withQuery(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}`, {
        promotion_type: promotionType,
        app_version: 'v2'
      })
    );
  }
  async getPromotionItems(
    promotionId: string,
    promotionType: string,
    params: Record<string, unknown> = {}
  ): Promise<unknown> {
    return this.request(
      withQuery(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}/items`, {
        ...params,
        promotion_type: promotionType,
        app_version: 'v2'
      })
    );
  }
  async getPromotionOffer(offerId: string): Promise<unknown> {
    return this.request(`/seller-promotions/offers/${encodeURIComponent(offerId)}?app_version=v2`);
  }
  async createPromotionCampaign(payload: unknown): Promise<unknown> {
    return this.request('/seller-promotions/promotions?app_version=v2', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
  async updatePromotionCampaign(promotionId: string, payload: unknown): Promise<unknown> {
    return this.request(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}?app_version=v2`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }
  async deletePromotionCampaign(promotionId: string, promotionType: string): Promise<unknown> {
    return this.request(
      withQuery(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}`, {
        promotion_type: promotionType,
        app_version: 'v2'
      }),
      { method: 'DELETE' }
    );
  }
  async createPromotionOffer(itemId: string, payload: unknown): Promise<unknown> {
    await this.ensurePromotionHistoryBefore(itemId);
    return this.request(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
  async updatePromotionOffer(itemId: string, payload: unknown): Promise<unknown> {
    await this.ensurePromotionHistoryBefore(itemId);
    return this.request(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }
  async deletePromotionOffer(itemId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    await this.ensurePromotionHistoryBefore(itemId);
    return this.request(
      withQuery(`/seller-promotions/items/${encodeURIComponent(itemId)}`, { ...params, app_version: 'v2' }),
      { method: 'DELETE' }
    );
  }
  async getItemDescription(itemId: string): Promise<unknown> {
    return this.request(`/items/${encodeURIComponent(itemId)}/description`);
  }
  async createItemDescription(itemId: string, plainText: string): Promise<unknown> {
    return this.request(`/items/${encodeURIComponent(itemId)}/description`, {
      method: 'POST',
      body: JSON.stringify({ plain_text: plainText })
    });
  }
  async updateItemDescription(itemId: string, plainText: string): Promise<unknown> {
    return this.request(`/items/${encodeURIComponent(itemId)}/description?api_version=2`, {
      method: 'PUT',
      body: JSON.stringify({ plain_text: plainText })
    });
  }
  async updateItem(itemId: string, payload: unknown): Promise<unknown> {
    return this.request(`/items/${encodeURIComponent(itemId)}`, { method: 'PUT', body: JSON.stringify(payload) });
  }

  async uploadPicture(input: { filename: string; mimeType: string; base64: string }): Promise<unknown> {
    const bytes = decodeBase64(input.base64);
    if (!bytes.byteLength) throw new RemoteApiError('invalid_picture', 400, 'Imagem vazia.');
    const form = new FormData();
    form.append(
      'file',
      new Blob([bytes], { type: input.mimeType || 'application/octet-stream' }),
      sanitizeFilename(input.filename)
    );
    return this.request('/pictures/items/upload', { method: 'POST', body: form });
  }

  async downloadImage(url: string): Promise<{ mimeType: string; base64: string }> {
    assertAllowedImageUrl(url);
    const response = await fetch(String(url), { headers: { accept: 'image/*' } });
    if (!response.ok)
      throw new RemoteApiError(
        'image_download_failed',
        response.status,
        `Nao consegui baixar a imagem. HTTP ${response.status}`
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength) throw new RemoteApiError('invalid_picture', 400, 'Imagem vazia.');
    return { mimeType: normalizeImageMimeType(response.headers.get('content-type')), base64: encodeBase64(bytes) };
  }

  async readImageHeader(url: string, maxBytes = 4 * 1024): Promise<Uint8Array> {
    assertAllowedImageUrl(url);
    const limit = Math.max(1024, Math.min(256 * 1024, Math.trunc(maxBytes)));
    const response = await fetch(String(url), {
      headers: { accept: 'image/*', range: `bytes=0-${limit - 1}` }
    });
    if (!response.ok)
      throw new RemoteApiError(
        'image_download_failed',
        response.status,
        `Nao consegui ler a imagem. HTTP ${response.status}`
      );
    return readResponsePrefix(response, limit);
  }

  private async request(path: string, options: RequestInit = {}, retried = false): Promise<unknown> {
    const accessToken = await this.getAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${accessToken}`);
    if (options.body && !(options.body instanceof FormData) && !headers.has('content-type'))
      headers.set('content-type', 'application/json');

    const response = await fetch(`${MELI_API_BASE}${path}`, { ...options, headers });
    if (response.status === 401 && !retried) {
      await this.refreshAccessToken(accessToken);
      return this.request(path, options, true);
    }
    return parseMeliResponse(response);
  }

  private getAccessToken(): Promise<string> {
    if (!this.accessTokenPromise) this.accessTokenPromise = this.loadAccessToken();
    return this.accessTokenPromise;
  }

  private async loadAccessToken(): Promise<string> {
    const credential = await readSellerCredential(this.env, this.account);
    if (credential.expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) return credential.token.access_token;
    return (await refreshSellerCredential(this.env, this.account)).access_token;
  }

  private async refreshAccessToken(failedAccessToken: string): Promise<string> {
    if (!this.refreshAccessTokenPromise) {
      this.refreshAccessTokenPromise = refreshSellerCredential(this.env, this.account, failedAccessToken).then(
        (token) => token.access_token
      );
    }
    const accessToken = await this.refreshAccessTokenPromise;
    this.accessTokenPromise = Promise.resolve(accessToken);
    return accessToken;
  }
}

async function readResponsePrefix(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new RemoteApiError('invalid_picture', 400, 'Imagem vazia.');
  const reader = response.body.getReader();
  const bytes = new Uint8Array(maxBytes);
  let length = 0;
  try {
    while (length < maxBytes) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const available = Math.min(chunk.value.byteLength, maxBytes - length);
      bytes.set(chunk.value.subarray(0, available), length);
      length += available;
      if (available < chunk.value.byteLength) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (!length) throw new RemoteApiError('invalid_picture', 400, 'Imagem vazia.');
  return bytes.slice(0, length);
}

async function readSellerCredential(env: RemoteRuntimeEnv, account: SellerAccount): Promise<SellerCredential> {
  assertRemoteMeliConfigured(env);
  const record = await env.ONFRAME_DB.prepare(
    `
    SELECT token_ciphertext, token_iv, token_auth_tag, expires_at, updated_at, refresh_lock_id, refresh_lock_expires_at
    FROM seller_credentials
    WHERE seller_account_id = ?
  `
  )
    .bind(account.id)
    .first<{
      token_ciphertext: string;
      token_iv: string;
      token_auth_tag: string;
      expires_at: number;
      updated_at: number;
      refresh_lock_id: string | null;
      refresh_lock_expires_at: number | null;
    }>();
  if (!record)
    throw new RemoteApiError('workspace_account_unavailable', 409, 'Conta conectada nao encontrada para este anuncio.');

  let tokenPayload: unknown;
  try {
    tokenPayload = JSON.parse(
      await decryptValue(await importMeliTokenCipherKey(env), {
        ciphertext: record.token_ciphertext,
        iv: record.token_iv,
        authTag: record.token_auth_tag
      })
    );
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

async function refreshSellerCredential(
  env: RemoteRuntimeEnv,
  account: SellerAccount,
  failedAccessToken = ''
): Promise<MeliToken> {
  for (let attempt = 0; attempt < TOKEN_REFRESH_WAIT_ATTEMPTS; attempt += 1) {
    const current = await readSellerCredential(env, account);
    if (!needsRefresh(current, failedAccessToken)) return current.token;

    const lockId = crypto.randomUUID();
    const timestamp = Date.now();
    const lockResult = await env.ONFRAME_DB.prepare(
      `
      UPDATE seller_credentials
      SET refresh_lock_id = ?, refresh_lock_expires_at = ?
      WHERE seller_account_id = ?
        AND (refresh_lock_expires_at IS NULL OR refresh_lock_expires_at <= ?)
    `
    )
      .bind(lockId, timestamp + TOKEN_REFRESH_LOCK_MS, account.id, timestamp)
      .run();

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
      const encrypted = await encryptValue(await importMeliTokenCipherKey(env), JSON.stringify(refreshed));
      const expiresAt = Date.now() + Math.max(0, Number(refreshed.expires_in || 0)) * 1000;
      const write = await env.ONFRAME_DB.prepare(
        `
        UPDATE seller_credentials
        SET token_ciphertext = ?, token_iv = ?, token_auth_tag = ?, expires_at = ?, refreshed_at = ?, updated_at = ?,
            refresh_lock_id = NULL, refresh_lock_expires_at = NULL
        WHERE seller_account_id = ? AND refresh_lock_id = ?
      `
      )
        .bind(
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
          expiresAt,
          Date.now(),
          Date.now(),
          account.id,
          lockId
        )
        .run();
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
  await env.ONFRAME_DB.prepare(
    `
    UPDATE seller_credentials
    SET refresh_lock_id = NULL, refresh_lock_expires_at = NULL
    WHERE seller_account_id = ? AND refresh_lock_id = ?
  `
  )
    .bind(accountId, lockId)
    .run();
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

  const objectBody = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
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
  const source = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
    body?: unknown;
  } | null;
  const statusCode = Number(source?.statusCode || source?.status || 0);
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
  MELI_TOKEN_CIPHER_KEY_BASE64: string;
} {
  if (
    !String(env.MELI_CLIENT_ID || '').trim() ||
    !String(env.MELI_CLIENT_SECRET || '').trim() ||
    !String(env.MELI_TOKEN_CIPHER_KEY_BASE64 || '').trim()
  ) {
    throw new RemoteApiError(
      'remote_oauth_unconfigured',
      503,
      'A conexao remota do Mercado Livre ainda nao esta configurada.'
    );
  }
}

async function importMeliTokenCipherKey(env: RemoteRuntimeEnv): Promise<CryptoKey> {
  try {
    return await importAesGcmKeyBase64(env.MELI_TOKEN_CIPHER_KEY_BASE64 || '');
  } catch {
    throw new RemoteApiError(
      'remote_oauth_unconfigured',
      503,
      'A conexao remota do Mercado Livre ainda nao esta configurada.'
    );
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
  return String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase() === 'image/png'
    ? 'image/png'
    : 'image/jpeg';
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
