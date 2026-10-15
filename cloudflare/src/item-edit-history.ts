type HistoryEnv = {
  ONFRAME_DB: D1Database;
};

type HistoryActor = {
  userId: string | null;
  workspaceId: string;
  workspaceRole?: 'admin' | 'collaborator';
  displayName?: string;
  email?: string;
};

type ItemSnapshot = Record<string, unknown> | null;
type PromotionSnapshot = unknown;

type HistoryOrigin = {
  mode: 'single' | 'bulk';
  scope: 'item' | 'user_product_family';
};

export type ConfirmedEditInput = {
  account: {
    id: string;
    meliUserId: string;
    nickname: string | null;
  };
  actor: HistoryActor;
  env: HistoryEnv;
  itemId: string;
  operation: string;
  payload: Record<string, unknown> | null;
  requestId: string;
  result: unknown;
  snapshots: (itemId: string) => { first: ItemSnapshot; latest: ItemSnapshot };
  promotionSnapshots?: (itemId: string) => { first: PromotionSnapshot; latest: PromotionSnapshot };
};

type EditDraft = {
  action: string;
  changeType: string;
  details: Record<string, unknown>;
  detailsVersion: number;
  itemId: string;
  itemSnapshot: ItemSnapshot;
  operation: string;
  summary: string;
};

type HistoryRecord = {
  id: string;
  workspace_id: string;
  seller_account_id: string | null;
  user_id: string | null;
  request_id: string;
  item_id: string;
  item_title: string | null;
  item_thumbnail_url: string | null;
  item_permalink: string | null;
  account_name: string | null;
  account_meli_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  operation: string | null;
  change_type: string;
  action: string;
  summary: string;
  details_json: string;
  details_version: number;
  created_at: number;
};

export async function recordConfirmedItemEdits(input: ConfirmedEditInput): Promise<void> {
  const drafts = buildConfirmedEditDrafts(input);
  if (!drafts.length) return;
  const createdAt = Date.now();
  await input.env.ONFRAME_DB.batch(drafts.map((draft) => {
    const item = draft.itemSnapshot || {};
    return input.env.ONFRAME_DB.prepare(`
      INSERT OR IGNORE INTO item_edit_events (
        id, workspace_id, seller_account_id, user_id, request_id,
        item_id, item_title, item_thumbnail_url, item_permalink,
        account_name, account_meli_user_id, actor_name, actor_email,
        operation, change_type, action, summary, details_json, details_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      input.actor.workspaceId,
      input.account.id,
      input.actor.userId,
      input.requestId,
      draft.itemId,
      stringOrNull(item.title),
      itemThumbnail(item),
      stringOrNull(item.permalink),
      input.account.nickname,
      input.account.meliUserId,
      input.actor.displayName || null,
      input.actor.email || null,
      draft.operation,
      draft.changeType,
      draft.action,
      draft.summary,
      JSON.stringify(draft.details),
      draft.detailsVersion,
      createdAt
    );
  }));
}

export function buildConfirmedEditDrafts(input: Pick<ConfirmedEditInput, 'itemId' | 'operation' | 'payload' | 'result' | 'snapshots' | 'promotionSnapshots'>): EditDraft[] {
  const result = objectOrNull(input.result);
  if (!result || result.ok === false) return [];

  if (isBulkResult(result)) {
    return result.targets
      .filter((target) => objectOrNull(target)?.status === 'applied')
      .flatMap((target) => {
        const entry = objectOrNull(target) || {};
        const itemId = stringOrNull(entry.itemId);
        if (!itemId) return [];
        const entrySnapshot = { id: itemId, title: stringOrNull(entry.title) };
        return buildSingleDraft({
          itemId,
          operation: stringOrNull(result.action) || input.operation,
          payload: bulkPayload(input.payload),
          result: entry.result,
          origin: historyOrigin(result),
          snapshots: (targetItemId) => {
            const snapshots = input.snapshots(targetItemId);
            return {
              first: snapshots.first || entrySnapshot,
              latest: snapshots.latest || entrySnapshot
            };
          },
          promotionSnapshots: input.promotionSnapshots
        });
      });
  }

  return buildSingleDraft({ ...input, origin: { mode: 'single', scope: 'item' } });
}

export async function listItemEditHistory(env: HistoryEnv, actor: HistoryActor, url: URL): Promise<Record<string, unknown>> {
  const limit = boundedLimit(url.searchParams.get('limit'));
  const cursor = parseCursor(url.searchParams.get('cursor'));
  const pageParam = String(url.searchParams.get('page') || '').trim();
  const paginated = Boolean(pageParam);
  const requestedPage = boundedPage(pageParam);
  const filters: string[] = ['events.workspace_id = ?'];
  const values: unknown[] = [actor.workspaceId];

  if (actor.workspaceRole !== 'admin') {
    filters.push(`EXISTS (
      SELECT 1 FROM account_members
      WHERE account_members.seller_account_id = events.seller_account_id
        AND account_members.user_id = ?
    )`);
    values.push(actor.userId);
  }
  addFilter(filters, values, 'events.item_id', url.searchParams.get('itemId'));
  addFilter(filters, values, 'events.seller_account_id', url.searchParams.get('accountId'));
  addFilter(filters, values, 'events.user_id', url.searchParams.get('userId'));
  addFilter(filters, values, 'events.change_type', url.searchParams.get('changeType'));
  addTimestampFilter(filters, values, 'events.created_at', '>=', url.searchParams.get('from'));
  addTimestampFilter(filters, values, 'events.created_at', '<=', url.searchParams.get('to'));

  const count = await env.ONFRAME_DB.prepare(`
    SELECT COUNT(*) AS total
    FROM item_edit_events AS events
    WHERE ${filters.join('\n      AND ')}
  `).bind(...values).first<{ total: number }>();
  const total = Number(count?.total) || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = paginated ? Math.min(requestedPage, totalPages) : 1;

  if (!paginated && cursor) {
    filters.push('(events.created_at < ? OR (events.created_at = ? AND events.id < ?))');
    values.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }

  const records = await env.ONFRAME_DB.prepare(`
    SELECT events.*,
           COALESCE(events.item_thumbnail_url, (
             SELECT related.item_thumbnail_url
             FROM item_edit_events AS related
             WHERE related.workspace_id = events.workspace_id
               AND related.item_id = events.item_id
               AND related.item_thumbnail_url IS NOT NULL
             ORDER BY related.created_at DESC
             LIMIT 1
           )) AS current_item_thumbnail_url,
           COALESCE(events.item_permalink, (
             SELECT related.item_permalink
             FROM item_edit_events AS related
             WHERE related.workspace_id = events.workspace_id
               AND related.item_id = events.item_id
               AND related.item_permalink IS NOT NULL
             ORDER BY related.created_at DESC
             LIMIT 1
           )) AS current_item_permalink,
           COALESCE(users.display_name, events.actor_name) AS current_actor_name,
           COALESCE(users.email, events.actor_email) AS current_actor_email,
           users.avatar_url AS current_actor_avatar_url,
           COALESCE(seller_accounts.display_name, seller_accounts.nickname, events.account_name) AS current_account_name
    FROM item_edit_events AS events
    LEFT JOIN users ON users.id = events.user_id
    LEFT JOIN seller_accounts ON seller_accounts.id = events.seller_account_id
    WHERE ${filters.join('\n      AND ')}
    ORDER BY events.created_at DESC, events.id DESC
    LIMIT ? OFFSET ?
  `).bind(...values, paginated ? limit : limit + 1, paginated ? (page - 1) * limit : 0).all<HistoryRecord & {
    current_actor_name: string | null;
    current_actor_email: string | null;
    current_actor_avatar_url: string | null;
    current_account_name: string | null;
    current_item_thumbnail_url: string | null;
    current_item_permalink: string | null;
  }>();
  const rows = records.results ?? [];
  const hasMore = paginated ? page < totalPages : rows.length > limit;
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);

  return {
    events: visible.map(toHistoryPayload),
    nextCursor: hasMore && last ? `${last.created_at}.${last.id}` : null,
    page,
    total,
    totalPages
  };
}

function buildSingleDraft(input: Pick<ConfirmedEditInput, 'itemId' | 'operation' | 'payload' | 'result' | 'snapshots' | 'promotionSnapshots'> & { origin: HistoryOrigin }): EditDraft[] {
  const result = objectOrNull(input.result) || {};
  const payload = input.payload || {};
  const snapshots = input.snapshots(input.itemId);
  const characteristics = objectOrNull(result.characteristics);
  const itemSnapshot = objectOrNull(result.item) || objectOrNull(characteristics?.item) || snapshots.latest || snapshots.first;

  if (input.operation === 'pricing.standard.update') {
    const standardPrice = objectOrNull(result.standardPrice) || {};
    return [draft(input.itemId, itemSnapshot, 'price', 'updated', 'Preço alterado', {
      before: moneyValue(snapshots.first?.price, snapshots.first?.currency_id),
      after: moneyValue(standardPrice.amount ?? payload.amount, standardPrice.currency_id ?? snapshots.first?.currency_id)
    }, input.operation)];
  }

  if (input.operation === 'description.update') {
    const created = result.created === true;
    return [draft(input.itemId, itemSnapshot, 'description', created ? 'created' : 'updated', created ? 'Descrição adicionada' : 'Descrição alterada', descriptionDetails(payload, result, created), input.operation)];
  }

  if (input.operation === 'characteristics.update') {
    const changes = characteristicChanges(payload, result, snapshots.first);
    return [draft(input.itemId, itemSnapshot, 'characteristics', 'updated', characteristicsSummary(changes.length), { changes }, input.operation)];
  }

  if (input.operation.startsWith('promotion.offer.')) {
    const action = input.operation.slice('promotion.offer.'.length);
    const labels: Record<string, string> = { create: 'Promoção adicionada', update: 'Promoção alterada', delete: 'Promoção removida' };
    return [draft(
      input.itemId,
      itemSnapshot,
      'promotion',
      action === 'create' ? 'created' : action === 'delete' ? 'removed' : 'updated',
      labels[action] || 'Promoção alterada',
      promotionDetails(input.itemId, payload, snapshots, input.promotionSnapshots, input.origin, action),
      input.operation
    )];
  }

  if (input.operation === 'pictures.update') {
    return [draft(input.itemId, itemSnapshot, 'pictures', 'updated', 'Fotos alteradas', pictureDetails(snapshots.first, objectOrNull(result.item), payload), input.operation)];
  }

  return [];
}

function characteristicChanges(payload: Record<string, unknown>, result: Record<string, unknown>, beforeItem: ItemSnapshot): Array<Record<string, unknown>> {
  const requested = Array.isArray(payload.attributes) ? payload.attributes : [];
  const before = new Map((Array.isArray(beforeItem?.attributes) ? beforeItem.attributes : [])
    .map(objectOrNull)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry?.id))
    .map((entry) => [String(entry.id), entry]));
  const characteristics = objectOrNull(result.characteristics);
  const afterFields = new Map((Array.isArray(characteristics?.fields) ? characteristics.fields : [])
    .map(objectOrNull)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry?.id))
    .map((entry) => [String(entry.id), entry]));

  return requested.map(objectOrNull).filter((entry): entry is Record<string, unknown> => Boolean(entry?.id)).map((entry) => {
    const id = String(entry.id);
    const previous = before.get(id);
    const current = afterFields.get(id);
    return {
      id,
      label: stringOrNull(current?.label) || stringOrNull(previous?.name) || id,
      before: attributeValue(previous),
      after: stringOrNull(current?.displayValue) || attributeValue(entry)
    };
  });
}

function attributeValue(value: Record<string, unknown> | null | undefined): string | null {
  if (!value) return null;
  const values = Array.isArray(value.values) ? value.values.map(objectOrNull).filter(Boolean) : [];
  if (values.length) return values.map((entry) => stringOrNull(entry?.name) || stringOrNull(entry?.value_name) || stringOrNull(entry?.id)).filter(Boolean).join(', ') || null;
  const structured = objectOrNull(value.value_struct);
  if (structured && structured.number !== undefined) return [structured.number, structured.unit].filter((entry) => entry !== undefined && entry !== null && entry !== '').join(' ');
  return stringOrNull(value.valueName) || stringOrNull(value.value_name) || stringOrNull(value.valueId) || stringOrNull(value.value_id);
}

function draft(itemId: string, itemSnapshot: ItemSnapshot, changeType: string, action: string, summary: string, details: Record<string, unknown>, operation: string): EditDraft {
  return { itemId, itemSnapshot, changeType, action, summary, details, detailsVersion: 1, operation };
}

function isBulkResult(value: Record<string, unknown>): value is Record<string, unknown> & { targets: unknown[] } {
  return value.phase === 'commit' && Array.isArray(value.targets);
}

function bulkPayload(payload: Record<string, unknown> | null): Record<string, unknown> {
  const nested = objectOrNull(payload?.payload);
  return nested || payload || {};
}

function historyOrigin(result: Record<string, unknown>): HistoryOrigin {
  return {
    mode: 'bulk',
    scope: stringOrNull(result.scope) === 'user_product_family' ? 'user_product_family' : 'item'
  };
}

function moneyValue(amount: unknown, currency: unknown): Record<string, unknown> | null {
  const normalizedAmount = numberOrNull(amount);
  if (normalizedAmount === null) return null;
  return { amount: normalizedAmount, currency: stringOrNull(currency) || 'BRL' };
}

function descriptionDetails(payload: Record<string, unknown>, result: Record<string, unknown>, created: boolean): Record<string, unknown> {
  const history = objectOrNull(result.history);
  const before = objectOrNull(history?.before);
  const after = objectOrNull(history?.after);
  const plainText = String(payload.plainText ?? payload.plain_text ?? '').replace(/\r\n/gu, '\n').trim();
  return {
    before: {
      exists: before?.exists === true || (!before && !created),
      length: nonNegativeInteger(before?.length)
    },
    after: {
      exists: after?.exists !== false,
      length: nonNegativeInteger(after?.length) ?? plainText.length
    }
  };
}

function pictureDetails(beforeItem: ItemSnapshot, resultItem: ItemSnapshot, payload: Record<string, unknown>): Record<string, unknown> {
  const before = pictureRefs(beforeItem?.pictures);
  const afterSource = Array.isArray(resultItem?.pictures) ? resultItem?.pictures : payload.pictures;
  const after = pictureRefs(afterSource);
  const beforeByKey = new Map(before.map((picture) => [pictureKey(picture), picture]));
  const afterByKey = new Map(after.map((picture) => [pictureKey(picture), picture]));
  const beforeKeys = before.map(pictureKey);
  const afterKeys = after.map(pictureKey);
  const added = after.filter((picture) => !beforeByKey.has(pictureKey(picture)));
  const removed = before.filter((picture) => !afterByKey.has(pictureKey(picture)));
  return {
    beforeCount: before.length,
    afterCount: after.length,
    added,
    removed,
    reordered: added.length === 0 && removed.length === 0 && beforeKeys.join('|') !== afterKeys.join('|')
  };
}

function pictureRefs(value: unknown): Array<Record<string, string | null>> {
  return (Array.isArray(value) ? value : [])
    .map(objectOrNull)
    .filter((picture): picture is Record<string, unknown> => Boolean(picture))
    .map((picture) => ({
      id: stringOrNull(picture.id),
      thumbnailUrl: stringOrNull(picture.secure_url) || stringOrNull(picture.url)
    }))
    .filter((picture) => Boolean(picture.id || picture.thumbnailUrl));
}

function pictureKey(picture: Record<string, unknown>): string {
  return stringOrNull(picture.id) || stringOrNull(picture.thumbnailUrl) || '';
}

function promotionDetails(
  itemId: string,
  payload: Record<string, unknown>,
  itemSnapshots: { first: ItemSnapshot; latest: ItemSnapshot },
  snapshots: ConfirmedEditInput['promotionSnapshots'],
  origin: HistoryOrigin,
  action: string
): Record<string, unknown> {
  const promotionSnapshots = snapshots ? snapshots(itemId) : { first: null, latest: null };
  const beforeEntry = findPromotionEntry(promotionSnapshots.first, payload);
  const afterEntry = action === 'delete' ? null : findPromotionEntry(promotionSnapshots.latest, payload);
  const currency = stringOrNull(itemSnapshots.latest?.currency_id) || stringOrNull(itemSnapshots.first?.currency_id) || 'BRL';
  const before = promotionState(beforeEntry, payload, currency, false);
  const after = action === 'delete' ? null : promotionState(afterEntry, payload, currency, true);
  return {
    promotion: {
      type: promotionField(payload, 'promotionType', 'promotion_type') || promotionField(afterEntry, 'type', 'promotion_type') || promotionField(beforeEntry, 'type', 'promotion_type') || '',
      id: promotionField(payload, 'promotionId', 'promotion_id') || promotionField(afterEntry, 'id', 'promotion_id') || promotionField(beforeEntry, 'id', 'promotion_id'),
      offerId: promotionField(payload, 'offerId', 'offer_id') || promotionField(afterEntry, 'offerId', 'offer_id', 'ref_id') || promotionField(beforeEntry, 'offerId', 'offer_id', 'ref_id'),
      name: promotionField(afterEntry, 'name', 'title', 'promotion_name', 'campaign_name') || promotionField(beforeEntry, 'name', 'title', 'promotion_name', 'campaign_name')
    },
    before,
    after,
    changedFields: promotionChangedFields(before, after),
    origin
  };
}

function promotionState(entry: Record<string, unknown> | null, payload: Record<string, unknown>, currency: string, usePayload: boolean): Record<string, unknown> | null {
  if (!entry && !usePayload) return null;
  const price = firstNumber(entry, ['price', 'new_price', 'deal_price']) ?? (usePayload ? firstNumber(payload, ['dealPrice', 'deal_price']) : null);
  const originalPrice = firstNumber(entry, ['original_price', 'regular_amount', 'base_price']);
  const percentage = firstNumber(entry, ['discount_percentage', 'percentage']) ?? discountPercentage(originalPrice, price);
  return {
    status: promotionStatus(entry),
    price: moneyValue(price, currency),
    discountPercentage: percentage,
    stock: firstNumber(entry, ['stock', 'available_quantity']) ?? (usePayload ? firstNumber(payload, ['stock']) : null),
    startDate: promotionField(entry, 'start_date', 'startDate') || (usePayload ? promotionField(payload, 'startDate', 'start_date') : null),
    endDate: promotionField(entry, 'end_date', 'finish_date', 'finishDate') || (usePayload ? promotionField(payload, 'finishDate', 'finish_date') : null)
  };
}

function promotionChangedFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  if (!before && !after) return [];
  const fields = ['status', 'price', 'discountPercentage', 'stock', 'startDate', 'endDate'];
  return fields.filter((field) => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after?.[field] ?? null));
}

function findPromotionEntry(snapshot: PromotionSnapshot, payload: Record<string, unknown>): Record<string, unknown> | null {
  const type = normalizePromotionType(promotionField(payload, 'promotionType', 'promotion_type'));
  const promotionId = promotionField(payload, 'promotionId', 'promotion_id');
  const offerId = promotionField(payload, 'offerId', 'offer_id');
  const matches = promotionEntries(snapshot).filter((entry) => {
    if (type && normalizePromotionType(promotionField(entry, 'type', 'promotion_type', 'campaign_type')) !== type) return false;
    if (promotionId && promotionField(entry, 'id', 'promotion_id') !== promotionId) return false;
    return true;
  });
  if (offerId) return matches.find((entry) => promotionField(entry, 'offerId', 'offer_id', 'ref_id') === offerId) || matches[0] || null;
  return matches[0] || null;
}

function promotionEntries(snapshot: PromotionSnapshot): Record<string, unknown>[] {
  if (Array.isArray(snapshot)) return snapshot.map(objectOrNull).filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const source = objectOrNull(snapshot);
  if (!source) return [];
  for (const key of ['results', 'promotions', 'offers', 'items']) {
    if (Array.isArray(source[key])) return (source[key] as unknown[]).map(objectOrNull).filter((entry): entry is Record<string, unknown> => Boolean(entry));
  }
  return [];
}

function promotionField(value: Record<string, unknown> | null, ...keys: string[]): string | null {
  for (const key of keys) {
    const normalized = stringOrNull(value?.[key]);
    if (normalized) return normalized;
  }
  return null;
}

function promotionStatus(entry: Record<string, unknown> | null): string | null {
  const status = String(entry?.status ?? entry?.status_item ?? '').toLowerCase();
  if (['started', 'active'].includes(status)) return 'active';
  if (['pending', 'programmed', 'scheduled'].includes(status)) return 'scheduled';
  if (['candidate', 'eligible', 'finished', 'inactive'].includes(status)) return 'inactive';
  return null;
}

function normalizePromotionType(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function firstNumber(value: Record<string, unknown> | null, keys: string[]): number | null {
  for (const key of keys) {
    const normalized = numberOrNull(value?.[key]);
    if (normalized !== null) return normalized;
  }
  return null;
}

function discountPercentage(originalPrice: number | null, price: number | null): number | null {
  if (!originalPrice || price === null || price >= originalPrice) return null;
  return Math.round((1 - price / originalPrice) * 10000) / 100;
}

function nonNegativeInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function characteristicsSummary(count: number): string {
  if (count === 1) return '1 característica alterada';
  return `${count} características alteradas`;
}

export function itemThumbnail(item: Record<string, unknown>): string | null {
  const first = Array.isArray(item.pictures) ? objectOrNull(item.pictures[0]) : null;
  return stringOrNull(item.thumbnailUrl)
    || stringOrNull(item.secure_thumbnail)
    || stringOrNull(item.thumbnail)
    || stringOrNull(first?.secure_url)
    || stringOrNull(first?.url);
}

function toHistoryPayload(record: HistoryRecord & { current_actor_name: string | null; current_actor_email: string | null; current_actor_avatar_url: string | null; current_account_name: string | null; current_item_thumbnail_url: string | null; current_item_permalink: string | null }): Record<string, unknown> {
  return {
    id: record.id,
    requestId: record.request_id,
    item: {
      id: record.item_id,
      title: record.item_title,
      thumbnailUrl: record.current_item_thumbnail_url,
      permalink: record.current_item_permalink
    },
    account: {
      id: record.seller_account_id,
      meliUserId: record.account_meli_user_id,
      name: record.current_account_name
    },
    actor: {
      id: record.user_id,
      name: record.current_actor_name,
      email: record.current_actor_email,
      avatarUrl: record.current_actor_avatar_url
    },
    operation: record.operation,
    changeType: record.change_type,
    action: record.action,
    summary: record.summary,
    detailsVersion: Number(record.details_version) || 0,
    details: parseDetails(record.details_json),
    createdAt: new Date(record.created_at).toISOString()
  };
}

function parseDetails(value: string): Record<string, unknown> {
  try {
    return objectOrNull(JSON.parse(value)) || {};
  } catch {
    return {};
  }
}

function addFilter(filters: string[], values: unknown[], column: string, value: string | null): void {
  const normalized = String(value || '').trim();
  if (!normalized) return;
  filters.push(`${column} = ?`);
  values.push(normalized);
}

function addTimestampFilter(filters: string[], values: unknown[], column: string, operator: '>=' | '<=', value: string | null): void {
  const normalized = String(value || '').trim();
  if (!normalized) return;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return;
  filters.push(`${column} ${operator} ?`);
  values.push(Math.trunc(parsed));
}

function boundedLimit(value: string | null): number {
  const parsed = Number(value || 20);
  return Number.isInteger(parsed) ? Math.min(50, Math.max(1, parsed)) : 20;
}

function boundedPage(value: string | null): number {
  const parsed = Number(value || 1);
  return Number.isInteger(parsed) ? Math.max(1, parsed) : 1;
}

function parseCursor(value: string | null): { createdAt: number; id: string } | null {
  const match = String(value || '').match(/^(\d+)\.([0-9a-f-]{36})$/iu);
  if (!match) return null;
  return { createdAt: Number(match[1]), id: match[2] };
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
