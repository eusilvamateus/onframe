import { decryptValue, encryptValue, importAesGcmKeyBase64 } from './token-cipher';
import { recordConfirmedItemEdits } from './item-edit-history';
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

export type PromotionReconciliationParams = {
  reconciliationId: string;
};

export type RemoteRuntimeEnv = {
  ONFRAME_DB: D1Database;
  PROMOTION_RECONCILIATION: Workflow<PromotionReconciliationParams>;
  MELI_CLIENT_ID?: string;
  MELI_CLIENT_SECRET?: string;
  MELI_TOKEN_CIPHER_KEY_BASE64?: string;
};

export type RemoteApiActor = {
  sessionId: string;
  userId: string;
  workspaceId: string;
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
  const context = await createRemoteApiContext(input.env, input.actor);
  const apiPath = input.url.pathname.slice('/v1/api'.length) || '/';
  const route = `${input.request.method} ${apiPath}`;
  let requestPayload: Record<string, unknown> | null = null;
  const readJson = async (_request: Request, options: { maxBytes?: number } = {}) => {
    requestPayload = await readRequestJson(input.request, options);
    return requestPayload;
  };
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
      console.error(JSON.stringify({
        event: 'item_edit_history_write_failed',
        itemId,
        operation,
        requestId: input.requestId,
        error: sanitizeError(error)
      }));
    });
    return result;
  };

  try {
    if (route === 'GET /bulk/reconciliations') {
      return listPromotionReconciliations(input.env, input.actor, input.url);
    }

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
      const client = await resolveItemClient(standardPrice[1]);
      return runItemMutation('pricing.standard.update', standardPrice[1], client, () => handleStandardPriceUpdate({
        req: input.request,
        client,
        itemId: standardPrice[1],
        readJson
      }));
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
      return runItemMutation('description.update', descriptionBulk[1], client, () => handleDescriptionBulkUpdate({
        req: input.request,
        client,
        itemId: descriptionBulk[1],
        readJson
      }));
    }

    const description = apiPath.match(/^\/items\/(MLB\d+)\/description$/u);
    if (input.request.method === 'GET' && description) {
      return handleDescriptionGet({ client: await resolveItemClient(description[1]), itemId: description[1] });
    }
    if (input.request.method === 'PUT' && description) {
      const client = await resolveItemClient(description[1]);
      return runItemMutation('description.update', description[1], client, () => handleDescriptionUpdate({
        req: input.request,
        client,
        itemId: description[1],
        readJson
      }));
    }

    const characteristicsBulk = apiPath.match(/^\/items\/(MLB\d+)\/characteristics\/bulk$/u);
    if (input.request.method === 'POST' && characteristicsBulk) {
      const client = await resolveBulkClient(characteristicsBulk[1]);
      return runItemMutation('characteristics.update', characteristicsBulk[1], client, () => handleCharacteristicsBulkUpdate({
        req: input.request,
        client,
        itemId: characteristicsBulk[1],
        readJson
      }));
    }

    const characteristics = apiPath.match(/^\/items\/(MLB\d+)\/characteristics$/u);
    if (input.request.method === 'GET' && characteristics) {
      return handleCharacteristicsGet({ client: await resolveItemClient(characteristics[1]), itemId: characteristics[1] });
    }
    if (input.request.method === 'PUT' && characteristics) {
      const client = await resolveItemClient(characteristics[1]);
      return runItemMutation('characteristics.update', characteristics[1], client, () => handleCharacteristicsUpdate({
        req: input.request,
        client,
        itemId: characteristics[1],
        readJson
      }));
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
      const client = await resolveItemClient(offer[1]);
      return runItemMutation('promotion.offer.create', offer[1], client, () => handleCreateOffer({ req: input.request, client, itemId: offer[1], readJson }));
    }
    if (input.request.method === 'PUT' && offer) {
      const client = await resolveItemClient(offer[1]);
      return runItemMutation('promotion.offer.update', offer[1], client, () => handleUpdateOffer({ req: input.request, client, itemId: offer[1], readJson }));
    }
    if (input.request.method === 'DELETE' && offer) {
      const client = await resolveItemClient(offer[1]);
      return runItemMutation('promotion.offer.delete', offer[1], client, () => handleDeleteOffer({ req: input.request, client, itemId: offer[1], readJson }));
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
      const client = await resolveItemClient(pictureCommit[1]);
      return runItemMutation('pictures.update', pictureCommit[1], client, () => handlePictureCommit({ req: input.request, client, itemId: pictureCommit[1], readJson }));
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

  const account = input.client.historyAccount();
  for (const candidate of targets) {
    const target = recordOrNull(candidate);
    if (!target || target.status !== 'pending_confirmation') continue;
    const itemId = typeof target.itemId === 'string' ? target.itemId : '';
    const metadata = recordOrNull(target._reconciliation);
    const payload = recordOrNull(metadata?.payload);
    if (!itemId || !payload) continue;

    const reconciliationId = crypto.randomUUID();
    const now = Date.now();
    try {
      await input.env.ONFRAME_DB.prepare(`
        INSERT INTO promotion_reconciliations (
          id, workspace_id, seller_account_id, user_id, request_id,
          source_item_id, item_id, operation, payload_json, accepted_result_json, history_before_json,
          actor_name, actor_email, status, attempts, created_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
      `).bind(
        reconciliationId,
        input.actor.workspaceId,
        account.id,
        input.actor.userId,
        input.requestId,
        input.sourceItemId,
        itemId,
        action,
        JSON.stringify(payload),
        JSON.stringify(metadata?.result ?? target.result ?? {}),
        JSON.stringify(input.client.historyPromotionSnapshots(itemId).first ?? null),
        input.actor.displayName || null,
        input.actor.email || null,
        now,
        now,
        now + RECONCILIATION_RETENTION_MS
      ).run();
      target.reconciliationId = reconciliationId;
      await startPromotionReconciliation(input.env, reconciliationId);
    } catch (error) {
      console.error(JSON.stringify({
        event: 'promotion_reconciliation_registration_failed',
        itemId,
        reconciliationId,
        requestId: input.requestId,
        error: sanitizeError(error)
      }));
    }
  }
}

async function listPromotionReconciliations(
  env: RemoteRuntimeEnv,
  actor: RemoteApiActor,
  url: URL
): Promise<Record<string, unknown>> {
  const ids = uniqueReconciliationIds(url.searchParams.get('ids'));
  if (!ids.length) throw new RemoteApiError('reconciliation_ids_required', 400, 'Informe as operações que deseja consultar.');

  const placeholders = ids.map(() => '?').join(', ');
  const records = await env.ONFRAME_DB.prepare(`
    SELECT id, item_id, status, attempts, last_error, workflow_started_at, accepted_result_json
    FROM promotion_reconciliations
    WHERE workspace_id = ? AND user_id = ? AND id IN (${placeholders})
  `).bind(actor.workspaceId, actor.userId, ...ids).all<{
    id: string;
    item_id: string;
    status: 'pending' | 'confirmed' | 'unconfirmed';
    attempts: number;
    last_error: string | null;
    workflow_started_at: number | null;
    accepted_result_json: string;
  }>();

  const rows = records.results ?? [];
  await Promise.all(rows
    .filter((row) => row.status === 'pending' && !row.workflow_started_at)
    .map((row) => startPromotionReconciliation(env, row.id)));

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
    await env.ONFRAME_DB.prepare(`
      UPDATE promotion_reconciliations
      SET workflow_started_at = COALESCE(workflow_started_at, ?), updated_at = ?
      WHERE id = ? AND status = 'pending'
    `).bind(Date.now(), Date.now(), reconciliationId).run();
  } catch (error) {
    console.error(JSON.stringify({
      event: 'promotion_reconciliation_start_failed',
      reconciliationId,
      error: sanitizeError(error)
    }));
  }
}

function uniqueReconciliationIds(value: string | null): string[] {
  return Array.from(new Set(String(value || '').split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(entry))))
    .slice(0, 50);
}

function reconciliationMessage(status: PromotionReconciliationRow['status'], lastError: string | null): string {
  if (status === 'confirmed') return 'Alteração confirmada pelo Mercado Livre.';
  if (status === 'unconfirmed') return 'O estado final não foi confirmado. Atualize as promoções antes de repetir a ação.';
  return lastError
    ? 'A alteração foi aceita e uma nova confirmação será tentada automaticamente.'
    : 'A alteração foi aceita e aguarda confirmação do Mercado Livre.';
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
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
  const row = await env.ONFRAME_DB.prepare(`
    SELECT reconciliations.*,
           accounts.meli_user_id, accounts.nickname, accounts.site_id, accounts.profile_url,
           accounts.enabled AS account_enabled
    FROM promotion_reconciliations AS reconciliations
    INNER JOIN seller_accounts AS accounts ON accounts.id = reconciliations.seller_account_id
    WHERE reconciliations.id = ?
  `).bind(reconciliationId).first<PromotionReconciliationRow>();
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
    await env.ONFRAME_DB.prepare(`
      UPDATE promotion_reconciliations
      SET status = 'confirmed', attempts = ?, last_error = NULL, updated_at = ?, completed_at = ?
      WHERE id = ? AND status = 'pending'
    `).bind(attempts, now, now, reconciliationId).run();
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
  await env.ONFRAME_DB.prepare(`
    UPDATE promotion_reconciliations
    SET attempts = ?, last_error = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'
  `).bind(attempts, lastError, Date.now(), reconciliationId).run();
}

export async function markPromotionReconciliationUnconfirmed(
  env: RemoteRuntimeEnv,
  reconciliationId: string,
  lastError: string | null = null
): Promise<ReconciliationOutcome> {
  const now = Date.now();
  await env.ONFRAME_DB.prepare(`
    UPDATE promotion_reconciliations
    SET status = 'unconfirmed', last_error = COALESCE(?, last_error), updated_at = ?, completed_at = ?
    WHERE id = ? AND status = 'pending'
  `).bind(lastError, now, now, reconciliationId).run();
  const row = await env.ONFRAME_DB.prepare(`
    SELECT id, item_id, status, attempts, last_error
    FROM promotion_reconciliations
    WHERE id = ?
  `).bind(reconciliationId).first<PromotionReconciliationRow>();
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
  const records = await env.ONFRAME_DB.prepare(`
    SELECT accounts.id, accounts.meli_user_id, accounts.nickname, accounts.site_id,
           accounts.profile_url, accounts.enabled
    FROM seller_accounts AS accounts
    INNER JOIN workspace_members AS members
      ON members.workspace_id = accounts.workspace_id AND members.user_id = ?
    WHERE accounts.workspace_id = ?
      AND (
        members.role = 'admin'
        OR EXISTS (
          SELECT 1
          FROM account_members
          WHERE account_members.seller_account_id = accounts.id
            AND account_members.user_id = ?
        )
      )
    ORDER BY accounts.created_at ASC
  `).bind(actor.userId, actor.workspaceId, actor.userId).all<{
    id: string;
    meli_user_id: string;
    nickname: string | null;
    site_id: string | null;
    profile_url: string | null;
    enabled: number;
  }>();
  if (!records.results?.length) {
    const membership = await env.ONFRAME_DB.prepare(`
      SELECT role
      FROM workspace_members
      WHERE workspace_id = ? AND user_id = ?
    `).bind(actor.workspaceId, actor.userId).first<{ role: 'admin' | 'collaborator' }>();
    if (!membership) throw new RemoteApiError('workspace_access_forbidden', 403, 'Você não faz mais parte deste workspace.');
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
  async getItemPromotions(itemId: string): Promise<unknown> {
    const promotions = await this.request(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`);
    this.rememberPromotionSnapshot(itemId, promotions);
    return promotions;
  }
  async getPromotion(promotionId: string, promotionType: string): Promise<unknown> { return this.request(withQuery(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}`, { promotion_type: promotionType, app_version: 'v2' })); }
  async getPromotionItems(promotionId: string, promotionType: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.request(withQuery(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}/items`, { ...params, promotion_type: promotionType, app_version: 'v2' }));
  }
  async getPromotionOffer(offerId: string): Promise<unknown> { return this.request(`/seller-promotions/offers/${encodeURIComponent(offerId)}?app_version=v2`); }
  async createPromotionCampaign(payload: unknown): Promise<unknown> { return this.request('/seller-promotions/promotions?app_version=v2', { method: 'POST', body: JSON.stringify(payload) }); }
  async updatePromotionCampaign(promotionId: string, payload: unknown): Promise<unknown> { return this.request(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}?app_version=v2`, { method: 'PUT', body: JSON.stringify(payload) }); }
  async deletePromotionCampaign(promotionId: string, promotionType: string): Promise<unknown> { return this.request(withQuery(`/seller-promotions/promotions/${encodeURIComponent(promotionId)}`, { promotion_type: promotionType, app_version: 'v2' }), { method: 'DELETE' }); }
  async createPromotionOffer(itemId: string, payload: unknown): Promise<unknown> {
    await this.ensurePromotionHistoryBefore(itemId);
    return this.request(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, { method: 'POST', body: JSON.stringify(payload) });
  }
  async updatePromotionOffer(itemId: string, payload: unknown): Promise<unknown> {
    await this.ensurePromotionHistoryBefore(itemId);
    return this.request(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, { method: 'PUT', body: JSON.stringify(payload) });
  }
  async deletePromotionOffer(itemId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    await this.ensurePromotionHistoryBefore(itemId);
    return this.request(withQuery(`/seller-promotions/items/${encodeURIComponent(itemId)}`, { ...params, app_version: 'v2' }), { method: 'DELETE' });
  }
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

  async readImageHeader(url: string, maxBytes = 4 * 1024): Promise<Uint8Array> {
    assertAllowedImageUrl(url);
    const limit = Math.max(1024, Math.min(256 * 1024, Math.trunc(maxBytes)));
    const response = await fetch(String(url), {
      headers: { accept: 'image/*', range: `bytes=0-${limit - 1}` }
    });
    if (!response.ok) throw new RemoteApiError('image_download_failed', response.status, `Nao consegui ler a imagem. HTTP ${response.status}`);
    return readResponsePrefix(response, limit);
  }

  private async request(path: string, options: RequestInit = {}, retried = false): Promise<unknown> {
    const accessToken = await this.getAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${accessToken}`);
    if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');

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
      this.refreshAccessTokenPromise = refreshSellerCredential(this.env, this.account, failedAccessToken)
        .then((token) => token.access_token);
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
    tokenPayload = JSON.parse(await decryptValue(await importMeliTokenCipherKey(env), {
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
      const encrypted = await encryptValue(await importMeliTokenCipherKey(env), JSON.stringify(refreshed));
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
  MELI_TOKEN_CIPHER_KEY_BASE64: string;
} {
  if (!String(env.MELI_CLIENT_ID || '').trim() || !String(env.MELI_CLIENT_SECRET || '').trim() || !String(env.MELI_TOKEN_CIPHER_KEY_BASE64 || '').trim()) {
    throw new RemoteApiError('remote_oauth_unconfigured', 503, 'A conexao remota do Mercado Livre ainda nao esta configurada.');
  }
}

async function importMeliTokenCipherKey(env: RemoteRuntimeEnv): Promise<CryptoKey> {
  try {
    return await importAesGcmKeyBase64(env.MELI_TOKEN_CIPHER_KEY_BASE64 || '');
  } catch {
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
