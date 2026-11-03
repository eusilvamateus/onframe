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
  current_cost_cents: number;
  tax_rate_bps: number;
  variable_cost_cents: number;
  status: 'active' | 'inactive';
  created_at: number;
  updated_at: number;
};

type ProductData = {
  sku: string;
  normalizedSku: string;
  name: string;
  costCents: number;
  taxRateBps: number;
  variableCostCents: number;
  status: 'active' | 'inactive';
};

type ProductImportPlanRow = {
  index: number;
  rowNumber: number;
  sku: string;
  name: string;
  action: 'create' | 'update' | 'unchanged' | 'error';
  errors: string[];
  productId: string | null;
  values: {
    sku: string;
    name: string;
    cost: number;
    taxRate: number;
    variableCost: number;
    status: 'active' | 'inactive';
  } | null;
  data?: ProductData;
  existing?: ProductRow;
};

type ProductSkuResolution = {
  status: 'resolved' | 'unmatched';
  sku: string | null;
  source: 'item' | 'variation' | null;
  variationId: string | null;
  reason?: string;
  product?: null;
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
  return value.trim().normalize('NFKC').toLocaleUpperCase('pt-BR');
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sellerSkuFromAttributes(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const candidate of value) {
    const attribute = recordValue(candidate);
    if (!attribute || String(attribute.id || '').toUpperCase() !== 'SELLER_SKU') continue;
    const sku = String(attribute.value_name ?? attribute.valueName ?? '').trim();
    if (sku) return sku;
  }
  return null;
}

function sellerSkuFromEntity(value: unknown): string | null {
  const entity = recordValue(value);
  if (!entity) return null;
  const direct = String(entity.seller_custom_field ?? entity.seller_sku ?? entity.sellerSku ?? '').trim();
  return direct || sellerSkuFromAttributes(entity.attributes);
}

function unresolvedProductMatch(reason: string, sku: string | null = null, source: 'item' | 'variation' | null = null, variationId: string | null = null): ProductSkuResolution {
  return { status: 'unmatched', sku, source, variationId, reason, product: null };
}

function resolvePromotionItemSku(itemValue: unknown, requestedVariationId: string | null): ProductSkuResolution {
  const item = recordValue(itemValue);
  if (!item) return unresolvedProductMatch('item_unavailable');
  const itemSku = sellerSkuFromEntity(item);
  const variations = Array.isArray(item.variations) ? item.variations.map(recordValue).filter(Boolean) as Record<string, unknown>[] : [];
  const variationId = String(requestedVariationId || '').trim();

  if (variationId) {
    const variation = variations.find((entry) => String(entry.id || '') === variationId);
    if (!variation) return unresolvedProductMatch('variation_not_found', null, 'variation', variationId);
    const variationSku = sellerSkuFromEntity(variation);
    if (variationSku) return { status: 'resolved', sku: variationSku, source: 'variation', variationId };
    if (itemSku) return { status: 'resolved', sku: itemSku, source: 'item', variationId };
    return unresolvedProductMatch('sku_unavailable', null, 'variation', variationId);
  }

  if (itemSku) return { status: 'resolved', sku: itemSku, source: 'item', variationId: null };
  const variationSkus = variations.flatMap((variation) => {
    const sku = sellerSkuFromEntity(variation);
    return sku ? [{ sku, variationId: String(variation.id || '') || null }] : [];
  });
  const unique = new Map<string, { sku: string; variationId: string | null }>();
  for (const candidate of variationSkus) unique.set(normalizeSku(candidate.sku), candidate);
  if (unique.size === 0) return unresolvedProductMatch('sku_unavailable');
  if (unique.size > 1) return unresolvedProductMatch('variation_required', null, 'variation');
  const [candidate] = unique.values();
  return { status: 'resolved', sku: candidate.sku, source: 'variation', variationId: candidate.variationId };
}

export async function matchProductForPromotionItem(
  env: ProductEnv,
  actor: { workspaceId: string },
  item: unknown,
  requestedVariationId: string | null = null
) {
  const resolution = resolvePromotionItemSku(item, requestedVariationId);
  if (resolution.status !== 'resolved' || !resolution.sku) return resolution;
  const product = await env.ONFRAME_DB.prepare(`
    SELECT id, sku, name, current_cost_cents, tax_rate_bps, variable_cost_cents, status, created_at, updated_at
    FROM products
    WHERE workspace_id = ? AND normalized_sku = ? AND status = 'active' AND archived_at IS NULL
  `).bind(actor.workspaceId, normalizeSku(resolution.sku)).first<ProductRow>();
  if (!product) return unresolvedProductMatch('product_not_found', resolution.sku, resolution.source, resolution.variationId);
  return {
    status: 'matched',
    sku: resolution.sku,
    source: resolution.source,
    variationId: resolution.variationId,
    reason: null,
    product: productPayload(product)
  };
}

function productPayload(row: ProductRow) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    cost: row.current_cost_cents / 100,
    taxRate: row.tax_rate_bps / 100,
    variableCost: row.variable_cost_cents / 100,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
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
    SELECT id, sku, name, current_cost_cents, tax_rate_bps, variable_cost_cents, status, created_at, updated_at
    FROM products WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
  `).bind(productId, actor.workspaceId).first<ProductRow>();
  if (!product) throw new ProductRequestError('product_not_found', 404);
  return product;
}

async function audit(env: ProductEnv, actor: ProductActor, requestId: string, operation: string, targetType: string, targetId: string, statusCode: number, metadata: Record<string, unknown> = {}): Promise<void> {
  await env.ONFRAME_DB.prepare(`
    INSERT INTO audit_events (id, workspace_id, user_id, seller_account_id, request_id, operation, target_type, target_id, outcome, status_code, metadata_json, created_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'success', ?, ?, ?)
  `).bind(crypto.randomUUID(), actor.workspaceId, actor.userId, requestId, operation, targetType, targetId, statusCode, JSON.stringify(metadata), Date.now()).run();
}

function escapedLike(value: string): string {
  return `%${value.replace(/[\\%_]/gu, '\\$&')}%`;
}

export async function listProducts(env: ProductEnv, actor: ProductActor, url: URL) {
  const query = String(url.searchParams.get('q') || '').trim();
  const requestedStatus = String(url.searchParams.get('status') || 'all');
  const status = ['active', 'inactive', 'all'].includes(requestedStatus) ? requestedStatus : 'all';
  const requestedSort = String(url.searchParams.get('sort') || 'updated');
  const orderBy = {
    sku: 'normalized_sku ASC, id ASC',
    name: 'name COLLATE NOCASE ASC, id ASC',
    recent: 'created_at DESC, id DESC',
    updated: 'updated_at DESC, id DESC'
  }[requestedSort] || 'updated_at DESC, id DESC';
  const requestedPage = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '25', 10) || 25));
  const where = ['workspace_id = ?', 'archived_at IS NULL'];
  const bindings: unknown[] = [actor.workspaceId];
  if (status !== 'all') {
    where.push('status = ?');
    bindings.push(status);
  }
  if (query) {
    where.push(`(sku LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')`);
    const pattern = escapedLike(query);
    bindings.push(pattern, pattern);
  }
  const clause = where.join(' AND ');
  const count = await env.ONFRAME_DB.prepare(`SELECT COUNT(*) AS total FROM products WHERE ${clause}`)
    .bind(...bindings).first<{ total: number }>();
  const total = Number(count?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);
  const rows = await env.ONFRAME_DB.prepare(`
    SELECT id, sku, name, current_cost_cents, tax_rate_bps, variable_cost_cents, status, created_at, updated_at
    FROM products WHERE ${clause}
    ORDER BY ${orderBy} LIMIT ? OFFSET ?
  `).bind(...bindings, limit, (page - 1) * limit).all<ProductRow>();
  return {
    products: rows.results.map(productPayload),
    pagination: { page, limit, total, totalPages }
  };
}

function parseProductBody(body: Record<string, unknown>): ProductData {
  const sku = asText(body.sku, 80, true);
  const status = body.status ?? 'active';
  if (status !== 'active' && status !== 'inactive') throw new ProductRequestError('product_invalid_payload', 400);
  return {
    sku,
    normalizedSku: normalizeSku(sku),
    name: asText(body.name, 160, true),
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

function importRowNumber(value: unknown, index: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2 ? parsed : index + 2;
}

function importRowPlan(source: unknown, index: number): ProductImportPlanRow {
  const rowNumber = importRowNumber(source && typeof source === 'object' ? (source as Record<string, unknown>).rowNumber : null, index);
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { index, rowNumber, sku: '', name: '', action: 'error', errors: ['A linha não contém dados válidos.'], productId: null, values: null };
  }
  const row = source as Record<string, unknown>;
  const sku = typeof row.sku === 'string' || typeof row.sku === 'number' ? String(row.sku).trim() : '';
  const name = typeof row.name === 'string' || typeof row.name === 'number' ? String(row.name).trim() : '';
  const errors: string[] = [];
  if (!sku) errors.push('SKU obrigatório.');
  else if (sku.length > 80) errors.push('SKU deve ter até 80 caracteres.');
  if (!name) errors.push('Nome obrigatório.');
  else if (name.length > 160) errors.push('Nome deve ter até 160 caracteres.');
  if (row.cost === '' || row.cost === null || row.cost === undefined) errors.push('Custo obrigatório.');
  if (row.taxRate === '' || row.taxRate === null || row.taxRate === undefined) errors.push('Imposto obrigatório.');
  if (row.variableCost === '' || row.variableCost === null || row.variableCost === undefined) errors.push('Outros custos variáveis são obrigatórios.');
  if (row.status === '' || row.status === null || row.status === undefined) errors.push('Status obrigatório.');
  if (errors.length > 0) return { index, rowNumber, sku, name, action: 'error', errors, productId: null, values: null };
  try {
    const data = parseProductBody(row);
    return {
      index,
      rowNumber,
      sku: data.sku,
      name: data.name,
      action: 'create',
      errors: [],
      productId: null,
      values: {
        sku: data.sku,
        name: data.name,
        cost: data.costCents / 100,
        taxRate: data.taxRateBps / 100,
        variableCost: data.variableCostCents / 100,
        status: data.status
      },
      data
    };
  } catch {
    return { index, rowNumber, sku, name, action: 'error', errors: ['Revise os valores, percentuais e o status desta linha.'], productId: null, values: null };
  }
}

function productMatchesImport(product: ProductRow, data: ProductData): boolean {
  return product.sku === data.sku
    && product.name === data.name
    && product.current_cost_cents === data.costCents
    && product.tax_rate_bps === data.taxRateBps
    && product.variable_cost_cents === data.variableCostCents
    && product.status === data.status;
}

async function buildProductImportPlan(request: Request, env: ProductEnv, actor: ProductActor): Promise<ProductImportPlanRow[]> {
  await assertAdmin(env, actor);
  const body = await requestBody(request);
  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 2000) {
    throw new ProductRequestError('product_import_invalid_payload', 400);
  }
  const plan = body.rows.map(importRowPlan);
  const counts = new Map<string, number>();
  for (const row of plan) {
    if (row.data) counts.set(row.data.normalizedSku, (counts.get(row.data.normalizedSku) || 0) + 1);
  }
  for (const row of plan) {
    if (row.data && (counts.get(row.data.normalizedSku) || 0) > 1) {
      row.action = 'error';
      row.errors = ['SKU repetido na planilha.'];
      delete row.data;
    }
  }
  const existing = await env.ONFRAME_DB.prepare(`
    SELECT id, sku, normalized_sku, name, current_cost_cents, tax_rate_bps, variable_cost_cents, status, created_at, updated_at
    FROM products WHERE workspace_id = ? AND archived_at IS NULL
  `).bind(actor.workspaceId).all<ProductRow & { normalized_sku: string }>();
  const productsBySku = new Map(existing.results.map((product) => [product.normalized_sku, product]));
  for (const row of plan) {
    if (!row.data) continue;
    const product = productsBySku.get(row.data.normalizedSku);
    if (!product) continue;
    row.existing = product;
    row.productId = product.id;
    row.action = productMatchesImport(product, row.data) ? 'unchanged' : 'update';
  }
  return plan;
}

function publicImportRow(row: ProductImportPlanRow) {
  return {
    rowNumber: row.rowNumber,
    sku: row.sku,
    name: row.name,
    action: row.action,
    errors: row.errors,
    productId: row.productId,
    values: row.values
  };
}

function previewSummary(rows: ProductImportPlanRow[]) {
  return {
    total: rows.length,
    create: rows.filter((row) => row.action === 'create').length,
    update: rows.filter((row) => row.action === 'update').length,
    unchanged: rows.filter((row) => row.action === 'unchanged').length,
    error: rows.filter((row) => row.action === 'error').length
  };
}

export async function previewProductImport(request: Request, env: ProductEnv, actor: ProductActor) {
  const rows = await buildProductImportPlan(request, env, actor);
  return { rows: rows.map(publicImportRow), summary: previewSummary(rows) };
}

export async function commitProductImport(request: Request, env: ProductEnv, actor: ProductActor, requestId: string) {
  const plan = await buildProductImportPlan(request, env, actor);
  const outcomes = plan.map((row) => ({
    ...publicImportRow(row),
    result: row.action === 'error' ? 'rejected' : row.action
  }));
  const actionable = plan.filter((row) => row.data && (row.action === 'create' || row.action === 'update'));
  const timestamp = Date.now();

  for (let offset = 0; offset < actionable.length; offset += 250) {
    const chunk = actionable.slice(offset, offset + 250);
    const statements: D1PreparedStatement[] = [];
    const references: Array<{ row: ProductImportPlanRow; statementIndex: number; result: 'created' | 'updated' }> = [];
    for (const row of chunk) {
      const data = row.data!;
      if (row.action === 'create') {
        const productId = crypto.randomUUID();
        references.push({ row, statementIndex: statements.length, result: 'created' });
        statements.push(env.ONFRAME_DB.prepare(`
          INSERT OR IGNORE INTO products (
            id, workspace_id, sku, normalized_sku, name, current_cost_cents, tax_rate_bps,
            variable_cost_cents, status, created_by_user_id, updated_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(productId, actor.workspaceId, data.sku, data.normalizedSku, data.name, data.costCents, data.taxRateBps, data.variableCostCents, data.status, actor.userId, actor.userId, timestamp, timestamp));
        statements.push(env.ONFRAME_DB.prepare(`
          INSERT INTO product_cost_history (id, product_id, cost_cents, effective_at, created_by_user_id, created_at)
          SELECT ?, id, ?, ?, ?, ? FROM products WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
        `).bind(crypto.randomUUID(), data.costCents, timestamp, actor.userId, timestamp, productId, actor.workspaceId));
      } else {
        references.push({ row, statementIndex: statements.length, result: 'updated' });
        statements.push(env.ONFRAME_DB.prepare(`
          UPDATE products SET sku = ?, normalized_sku = ?, name = ?, current_cost_cents = ?,
            tax_rate_bps = ?, variable_cost_cents = ?, status = ?, updated_by_user_id = ?, updated_at = ?
          WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
        `).bind(data.sku, data.normalizedSku, data.name, data.costCents, data.taxRateBps, data.variableCostCents, data.status, actor.userId, timestamp, row.productId, actor.workspaceId));
        if (row.existing?.current_cost_cents !== data.costCents) {
          statements.push(env.ONFRAME_DB.prepare(`
            INSERT INTO product_cost_history (id, product_id, cost_cents, effective_at, created_by_user_id, created_at)
            SELECT ?, id, ?, ?, ?, ? FROM products WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
          `).bind(crypto.randomUUID(), data.costCents, timestamp, actor.userId, timestamp, row.productId, actor.workspaceId));
        }
      }
    }
    try {
      const results = await env.ONFRAME_DB.batch(statements);
      for (const reference of references) {
        const outcome = outcomes[reference.row.index];
        if (results[reference.statementIndex]?.meta.changes === 1) {
          outcome.result = reference.result;
        } else {
          outcome.result = 'rejected';
          outcome.errors = ['O produto foi alterado por outra operação. Revise a planilha e tente novamente.'];
        }
      }
    } catch {
      for (const row of chunk) {
        outcomes[row.index].result = 'rejected';
        outcomes[row.index].errors = ['Não foi possível gravar esta linha. Tente novamente.'];
      }
    }
  }

  const summary = {
    total: outcomes.length,
    created: outcomes.filter((row) => row.result === 'created').length,
    updated: outcomes.filter((row) => row.result === 'updated').length,
    unchanged: outcomes.filter((row) => row.result === 'unchanged').length,
    rejected: outcomes.filter((row) => row.result === 'rejected').length
  };
  await audit(env, actor, requestId, 'product_import_committed', 'workspace', actor.workspaceId, 200, summary);
  return { rows: outcomes, summary };
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
          id, workspace_id, sku, normalized_sku, name, current_cost_cents, tax_rate_bps,
          variable_cost_cents, status, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, actor.workspaceId, data.sku, data.normalizedSku, data.name, data.costCents, data.taxRateBps, data.variableCostCents, data.status, actor.userId, actor.userId, timestamp, timestamp),
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
    UPDATE products SET sku = ?, normalized_sku = ?, name = ?, current_cost_cents = ?,
      tax_rate_bps = ?, variable_cost_cents = ?, status = ?, updated_by_user_id = ?, updated_at = ?
    WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
  `).bind(data.sku, data.normalizedSku, data.name, data.costCents, data.taxRateBps, data.variableCostCents, data.status, actor.userId, timestamp, productId, actor.workspaceId)];
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
  return productPayload(await assertProduct(env, actor, productId));
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
