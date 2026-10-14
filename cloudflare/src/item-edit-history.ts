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
};

type EditDraft = {
  action: string;
  changeType: string;
  details: Record<string, unknown>;
  itemId: string;
  itemSnapshot: ItemSnapshot;
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
  change_type: string;
  action: string;
  summary: string;
  details_json: string;
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
        change_type, action, summary, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      draft.changeType,
      draft.action,
      draft.summary,
      JSON.stringify(draft.details),
      createdAt
    );
  }));
}

export function buildConfirmedEditDrafts(input: Pick<ConfirmedEditInput, 'itemId' | 'operation' | 'payload' | 'result' | 'snapshots'>): EditDraft[] {
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
          snapshots: (targetItemId) => {
            const snapshots = input.snapshots(targetItemId);
            return {
              first: snapshots.first || entrySnapshot,
              latest: snapshots.latest || entrySnapshot
            };
          }
        });
      });
  }

  return buildSingleDraft(input);
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

function buildSingleDraft(input: Pick<ConfirmedEditInput, 'itemId' | 'operation' | 'payload' | 'result' | 'snapshots'>): EditDraft[] {
  const result = objectOrNull(input.result) || {};
  const payload = input.payload || {};
  const snapshots = input.snapshots(input.itemId);
  const characteristics = objectOrNull(result.characteristics);
  const itemSnapshot = objectOrNull(result.item) || objectOrNull(characteristics?.item) || snapshots.latest || snapshots.first;

  if (input.operation === 'pricing.standard.update') {
    const standardPrice = objectOrNull(result.standardPrice) || {};
    return [draft(input.itemId, itemSnapshot, 'price', 'updated', 'Preço alterado', {
      before: numberOrNull(snapshots.first?.price),
      after: numberOrNull(standardPrice.amount) ?? numberOrNull(payload.amount),
      currency: stringOrNull(standardPrice.currency_id) || stringOrNull(snapshots.first?.currency_id)
    })];
  }

  if (input.operation === 'description.update') {
    const created = result.created === true;
    return [draft(input.itemId, itemSnapshot, 'description', created ? 'created' : 'updated', created ? 'Descrição adicionada' : 'Descrição alterada', {})];
  }

  if (input.operation === 'characteristics.update') {
    const changes = characteristicChanges(payload, result, snapshots.first);
    return [draft(input.itemId, itemSnapshot, 'characteristics', 'updated', characteristicsSummary(changes.length), { changes })];
  }

  if (input.operation.startsWith('promotion.offer.')) {
    const action = input.operation.slice('promotion.offer.'.length);
    const labels: Record<string, string> = { create: 'Promoção adicionada', update: 'Promoção alterada', delete: 'Promoção removida' };
    return [draft(input.itemId, itemSnapshot, 'promotion', action === 'create' ? 'created' : action === 'delete' ? 'removed' : 'updated', labels[action] || 'Promoção alterada', {})];
  }

  if (input.operation === 'pictures.update') {
    const before = Array.isArray(snapshots.first?.pictures) ? snapshots.first.pictures.length : null;
    const after = Array.isArray(objectOrNull(result.item)?.pictures)
      ? (objectOrNull(result.item)?.pictures as unknown[]).length
      : Array.isArray(payload.pictures) ? payload.pictures.length : null;
    return [draft(input.itemId, itemSnapshot, 'pictures', 'updated', 'Fotos alteradas', { beforeCount: before, afterCount: after })];
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

function draft(itemId: string, itemSnapshot: ItemSnapshot, changeType: string, action: string, summary: string, details: Record<string, unknown>): EditDraft {
  return { itemId, itemSnapshot, changeType, action, summary, details };
}

function isBulkResult(value: Record<string, unknown>): value is Record<string, unknown> & { targets: unknown[] } {
  return value.phase === 'commit' && Array.isArray(value.targets);
}

function bulkPayload(payload: Record<string, unknown> | null): Record<string, unknown> {
  const nested = objectOrNull(payload?.payload);
  return nested || payload || {};
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
    changeType: record.change_type,
    action: record.action,
    summary: record.summary,
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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
