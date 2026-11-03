export type ProductActor = {
  userId: string;
  workspaceId: string;
  workspaceRole: 'admin' | 'collaborator';
};

type ProductEnv = { ONFRAME_DB: D1Database };

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string;
  current_cost_cents: number;
  tax_rate_bps: number;
  variable_cost_cents: number;
  status: 'active' | 'inactive';
  created_at: number;
  updated_at: number;
};

type ProductLinkRow = {
  id: string;
  product_id: string;
  seller_account_id: string;
  item_id: string;
  variation_id: string;
  seller_sku: string | null;
  account_name: string | null;
  meli_user_id: string;
  created_at: number;
};

export class ProductRequestError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

function asText(value: unknown, maxLength: number, required = false): string {
  if (value !== null && value !== undefined && typeof value !== 'string' && typeof value !== 'number') {
    throw new ProductRequestError('product_invalid_payload', 400);
  }
  const text = String(value ?? '').trim();
  if ((required && !text) || text.length > maxLength) {
    throw new ProductRequestError('product_invalid_payload', 400);
  }
  return text;
}

function decimalToInteger(value: unknown, scale: number, max: number): number {
  if (value === '' || value === null || value === undefined) return 0;
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const number = Number(normalized);
  const scaled = Math.round(number * scale);
  if (!Number.isFinite(number) || number < 0 || scaled > max || Math.abs(number * scale - scaled) > 0.000001) {
    throw new ProductRequestError('product_invalid_payload', 400);
  }
  return scaled;
}

function normalizeSku(value: string): string {
  return value.normalize('NFKC').toLocaleUpperCase('pt-BR');
}

function productPayload(row: ProductRow, links: ProductLinkRow[] = []) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    cost: row.current_cost_cents / 100,
    taxRate: row.tax_rate_bps / 100,
    variableCost: row.variable_cost_cents / 100,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    links: links.map((link) => ({
      id: link.id,
      sellerAccountId: link.seller_account_id,
      accountName: link.account_name || link.meli_user_id,
      meliUserId: link.meli_user_id,
      itemId: link.item_id,
      variationId: link.variation_id || null,
      sellerSku: link.seller_sku,
      createdAt: new Date(link.created_at).toISOString()
    }))
  };
}

async function assertAdmin(env: ProductEnv, actor: ProductActor): Promise<void> {
  const membership = await env.ONFRAME_DB.prepare(`
    SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).bind(actor.workspaceId, actor.userId).first<{ role: string }>();
  if (membership?.role !== 'admin') throw new ProductRequestError('product_access_forbidden', 403);
}

async function assertProduct(env: ProductEnv, actor: ProductActor, productId: string): Promise<ProductRow> {
  const product = await env.ONFRAME_DB.prepare(`
    SELECT id, sku, name, description, current_cost_cents, tax_rate_bps, variable_cost_cents, status, created_at, updated_at
    FROM products WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
  `).bind(productId, actor.workspaceId).first<ProductRow>();
  if (!product) throw new ProductRequestError('product_not_found', 404);
  return product;
}

async function audit(env: ProductEnv, actor: ProductActor, requestId: string, operation: string, targetType: string, targetId: string, statusCode: number): Promise<void> {
  await env.ONFRAME_DB.prepare(`
    INSERT INTO audit_events (id, workspace_id, user_id, seller_account_id, request_id, operation, target_type, target_id, outcome, status_code, metadata_json, created_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'success', ?, '{}', ?)
  `).bind(crypto.randomUUID(), actor.workspaceId, actor.userId, requestId, operation, targetType, targetId, statusCode, Date.now()).run();
}

function escapedLike(value: string): string {
  return `%${value.replace(/[\\%_]/gu, '\\$&')}%`;
}

async function visibleLinks(env: ProductEnv, actor: ProductActor, productIds: string[]): Promise<ProductLinkRow[]> {
  if (productIds.length === 0) return [];
  const placeholders = productIds.map(() => '?').join(', ');
  const collaboratorFilter = actor.workspaceRole === 'admin' ? '' : `
    AND EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.seller_account_id = link.seller_account_id AND am.user_id = ?
    )
  `;
  const bindings: unknown[] = [actor.workspaceId, ...productIds];
  if (actor.workspaceRole !== 'admin') bindings.push(actor.userId);
  const result = await env.ONFRAME_DB.prepare(`
    SELECT link.id, link.product_id, link.seller_account_id, link.item_id, link.variation_id, link.seller_sku,
           COALESCE(account.nickname, account.meli_user_id) AS account_name, account.meli_user_id, link.created_at
    FROM product_listing_links link
    JOIN seller_accounts account ON account.id = link.seller_account_id
    WHERE link.workspace_id = ? AND link.product_id IN (${placeholders}) ${collaboratorFilter}
    ORDER BY link.created_at DESC
  `).bind(...bindings).all<ProductLinkRow>();
  return result.results;
}

export async function listProducts(env: ProductEnv, actor: ProductActor, url: URL) {
  const query = String(url.searchParams.get('q') || '').trim();
  const requestedStatus = String(url.searchParams.get('status') || 'all');
  const status = ['active', 'inactive', 'all'].includes(requestedStatus) ? requestedStatus : 'all';
  const requestedPage = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '25', 10) || 25));
  const where = ['workspace_id = ?', 'archived_at IS NULL'];
  const bindings: unknown[] = [actor.workspaceId];
  if (status !== 'all') {
    where.push('status = ?');
    bindings.push(status);
  }
  if (query) {
    where.push(`(sku LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')`);
    const pattern = escapedLike(query);
    bindings.push(pattern, pattern, pattern);
  }
  const clause = where.join(' AND ');
  const count = await env.ONFRAME_DB.prepare(`SELECT COUNT(*) AS total FROM products WHERE ${clause}`)
    .bind(...bindings).first<{ total: number }>();
  const total = Number(count?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);
  const rows = await env.ONFRAME_DB.prepare(`
    SELECT id, sku, name, description, current_cost_cents, tax_rate_bps, variable_cost_cents, status, created_at, updated_at
    FROM products WHERE ${clause}
    ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?
  `).bind(...bindings, limit, (page - 1) * limit).all<ProductRow>();
  const links = await visibleLinks(env, actor, rows.results.map((row) => row.id));
  const linksByProduct = new Map<string, ProductLinkRow[]>();
  for (const link of links) linksByProduct.set(link.product_id, [...(linksByProduct.get(link.product_id) || []), link]);
  return {
    products: rows.results.map((row) => productPayload(row, linksByProduct.get(row.id))),
    pagination: { page, limit, total, totalPages }
  };
}

function parseProductBody(body: Record<string, unknown>) {
  const sku = asText(body.sku, 80, true);
  const status = body.status ?? 'active';
  if (status !== 'active' && status !== 'inactive') throw new ProductRequestError('product_invalid_payload', 400);
  return {
    sku,
    normalizedSku: normalizeSku(sku),
    name: asText(body.name, 160, true),
    description: asText(body.description, 4000),
    costCents: decimalToInteger(body.cost, 100, 9_999_999_999),
    taxRateBps: decimalToInteger(body.taxRate, 100, 10_000),
    variableCostCents: decimalToInteger(body.variableCost, 100, 9_999_999_999),
    status
  };
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
    return body as Record<string, unknown>;
  } catch {
    throw new ProductRequestError('product_invalid_payload', 400);
  }
}

function mapWriteError(error: unknown): never {
  if (String(error).includes('UNIQUE constraint failed')) throw new ProductRequestError('product_sku_conflict', 409);
  throw error;
}

export async function createProduct(request: Request, env: ProductEnv, actor: ProductActor, requestId: string) {
  await assertAdmin(env, actor);
  const data = parseProductBody(await requestBody(request));
  const timestamp = Date.now();
  const id = crypto.randomUUID();
  try {
    await env.ONFRAME_DB.batch([
      env.ONFRAME_DB.prepare(`
        INSERT INTO products (
          id, workspace_id, sku, normalized_sku, name, description, current_cost_cents, tax_rate_bps,
          variable_cost_cents, status, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, actor.workspaceId, data.sku, data.normalizedSku, data.name, data.description, data.costCents, data.taxRateBps, data.variableCostCents, data.status, actor.userId, actor.userId, timestamp, timestamp),
      env.ONFRAME_DB.prepare(`
        INSERT INTO product_cost_history (id, product_id, cost_cents, effective_at, created_by_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), id, data.costCents, timestamp, actor.userId, timestamp)
    ]);
  } catch (error) {
    mapWriteError(error);
  }
  await audit(env, actor, requestId, 'product_created', 'product', id, 201);
  return productPayload(await assertProduct(env, actor, id));
}

export async function updateProduct(request: Request, env: ProductEnv, actor: ProductActor, productId: string, requestId: string) {
  await assertAdmin(env, actor);
  const current = await assertProduct(env, actor, productId);
  const data = parseProductBody(await requestBody(request));
  const timestamp = Date.now();
  const statements = [env.ONFRAME_DB.prepare(`
    UPDATE products SET sku = ?, normalized_sku = ?, name = ?, description = ?, current_cost_cents = ?,
      tax_rate_bps = ?, variable_cost_cents = ?, status = ?, updated_by_user_id = ?, updated_at = ?
    WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
  `).bind(data.sku, data.normalizedSku, data.name, data.description, data.costCents, data.taxRateBps, data.variableCostCents, data.status, actor.userId, timestamp, productId, actor.workspaceId)];
  if (current.current_cost_cents !== data.costCents) {
    statements.push(env.ONFRAME_DB.prepare(`
      INSERT INTO product_cost_history (id, product_id, cost_cents, effective_at, created_by_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), productId, data.costCents, timestamp, actor.userId, timestamp));
  }
  try {
    await env.ONFRAME_DB.batch(statements);
  } catch (error) {
    mapWriteError(error);
  }
  await audit(env, actor, requestId, 'product_updated', 'product', productId, 200);
  return productPayload(await assertProduct(env, actor, productId), await visibleLinks(env, actor, [productId]));
}

export async function archiveProduct(env: ProductEnv, actor: ProductActor, productId: string, requestId: string) {
  await assertAdmin(env, actor);
  await assertProduct(env, actor, productId);
  const timestamp = Date.now();
  await env.ONFRAME_DB.prepare(`
    UPDATE products SET status = 'inactive', archived_at = ?, updated_by_user_id = ?, updated_at = ?
    WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
  `).bind(timestamp, actor.userId, timestamp, productId, actor.workspaceId).run();
  await audit(env, actor, requestId, 'product_archived', 'product', productId, 200);
  return { archived: true };
}

export async function createProductLink(request: Request, env: ProductEnv, actor: ProductActor, productId: string, requestId: string) {
  await assertAdmin(env, actor);
  await assertProduct(env, actor, productId);
  const body = await requestBody(request);
  const sellerAccountId = asText(body.sellerAccountId, 80, true);
  const itemId = asText(body.itemId, 32, true).toUpperCase();
  const variationId = asText(body.variationId, 32);
  const sellerSku = asText(body.sellerSku, 80) || null;
  if (!/^MLB\d+$/u.test(itemId) || (variationId && !/^\d+$/u.test(variationId))) {
    throw new ProductRequestError('product_link_invalid_payload', 400);
  }
  const account = await env.ONFRAME_DB.prepare(`
    SELECT id FROM seller_accounts WHERE id = ? AND workspace_id = ?
  `).bind(sellerAccountId, actor.workspaceId).first<{ id: string }>();
  if (!account) throw new ProductRequestError('product_link_account_not_found', 404);
  const id = crypto.randomUUID();
  const timestamp = Date.now();
  try {
    await env.ONFRAME_DB.prepare(`
      INSERT INTO product_listing_links (
        id, workspace_id, product_id, seller_account_id, item_id, variation_id, seller_sku,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, actor.workspaceId, productId, sellerAccountId, itemId, variationId, sellerSku, actor.userId, timestamp, timestamp).run();
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed')) throw new ProductRequestError('product_link_conflict', 409);
    throw error;
  }
  await audit(env, actor, requestId, 'product_listing_link_created', 'product_listing_link', id, 201);
  return productPayload(await assertProduct(env, actor, productId), await visibleLinks(env, actor, [productId]));
}

export async function deleteProductLink(env: ProductEnv, actor: ProductActor, productId: string, linkId: string, requestId: string) {
  await assertAdmin(env, actor);
  await assertProduct(env, actor, productId);
  const result = await env.ONFRAME_DB.prepare(`
    DELETE FROM product_listing_links WHERE id = ? AND product_id = ? AND workspace_id = ?
  `).bind(linkId, productId, actor.workspaceId).run();
  if (result.meta.changes !== 1) throw new ProductRequestError('product_link_not_found', 404);
  await audit(env, actor, requestId, 'product_listing_link_deleted', 'product_listing_link', linkId, 200);
  return productPayload(await assertProduct(env, actor, productId), await visibleLinks(env, actor, [productId]));
}
