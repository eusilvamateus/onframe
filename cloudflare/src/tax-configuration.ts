export type TaxRateSource = 'product_account' | 'product' | 'account' | 'workspace';

export type TaxRateResolution = {
  configured: boolean;
  rate: number | null;
  rateBps: number | null;
  base: 'sale_price';
  source: TaxRateSource | null;
  sourceId: string | null;
};

type TaxConfigurationEnv = { ONFRAME_DB: D1Database };

export type TaxConfigurationActor = {
  userId: string;
  workspaceId: string;
  workspaceRole: 'admin' | 'collaborator';
};

export class TaxConfigurationError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

type TaxRateRow = {
  product_tax_rate_bps: number | null;
  product_account_tax_rate_bps: number | null;
  account_tax_rate_bps: number | null;
  workspace_tax_rate_bps: number | null;
};

const UNCONFIGURED_TAX_RATE: TaxRateResolution = {
  configured: false,
  rate: null,
  rateBps: null,
  base: 'sale_price',
  source: null,
  sourceId: null
};

function resolvedTaxRate(rateBps: number, source: TaxRateSource, sourceId: string): TaxRateResolution {
  return {
    configured: true,
    rate: rateBps / 100,
    rateBps,
    base: 'sale_price',
    source,
    sourceId
  };
}

function optionalRateBps(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const rate = Number(normalized);
  const rateBps = Math.round(rate * 100);
  if (!Number.isFinite(rate) || rate < 0 || rateBps > 10_000 || Math.abs(rate * 100 - rateBps) > 0.000001) {
    throw new TaxConfigurationError('tax_configuration_invalid_payload', 400);
  }
  return rateBps;
}

async function assertAdmin(env: TaxConfigurationEnv, actor: TaxConfigurationActor): Promise<void> {
  const membership = await env.ONFRAME_DB.prepare(`
    SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).bind(actor.workspaceId, actor.userId).first<{ role: string }>();
  if (membership?.role !== 'admin') throw new TaxConfigurationError('tax_configuration_forbidden', 403);
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
    return body as Record<string, unknown>;
  } catch {
    throw new TaxConfigurationError('tax_configuration_invalid_payload', 400);
  }
}

export async function getTaxConfiguration(env: TaxConfigurationEnv, actor: TaxConfigurationActor) {
  await assertAdmin(env, actor);
  const [workspaceRate, accounts] = await Promise.all([
    env.ONFRAME_DB.prepare(`
      SELECT tax_rate_bps FROM workspace_tax_rates WHERE workspace_id = ?
    `).bind(actor.workspaceId).first<{ tax_rate_bps: number }>(),
    env.ONFRAME_DB.prepare(`
      SELECT seller.id, seller.meli_user_id, seller.nickname, seller.display_name, rate.tax_rate_bps
      FROM seller_accounts seller
      LEFT JOIN seller_account_tax_rates rate
        ON rate.seller_account_id = seller.id AND rate.workspace_id = seller.workspace_id
      WHERE seller.workspace_id = ?
      ORDER BY COALESCE(seller.display_name, seller.nickname, seller.meli_user_id) COLLATE NOCASE
    `).bind(actor.workspaceId).all<{
      id: string;
      meli_user_id: string;
      nickname: string | null;
      display_name: string | null;
      tax_rate_bps: number | null;
    }>()
  ]);
  return {
    base: 'sale_price' as const,
    workspaceTaxRate: workspaceRate ? workspaceRate.tax_rate_bps / 100 : null,
    accounts: accounts.results.map((account) => ({
      id: account.id,
      userId: account.meli_user_id,
      nickname: account.nickname,
      displayName: account.display_name,
      taxRate: account.tax_rate_bps === null ? null : account.tax_rate_bps / 100
    }))
  };
}

export async function updateTaxConfiguration(
  request: Request,
  env: TaxConfigurationEnv,
  actor: TaxConfigurationActor,
  requestId: string
) {
  await assertAdmin(env, actor);
  const body = await requestBody(request);
  if (!Array.isArray(body.accounts)) throw new TaxConfigurationError('tax_configuration_invalid_payload', 400);
  const workspaceTaxRateBps = optionalRateBps(body.workspaceTaxRate);
  const accountRates = body.accounts.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TaxConfigurationError('tax_configuration_invalid_payload', 400);
    }
    const account = value as Record<string, unknown>;
    const sellerAccountId = String(account.sellerAccountId || '').trim();
    if (!sellerAccountId) throw new TaxConfigurationError('tax_configuration_invalid_payload', 400);
    return { sellerAccountId, taxRateBps: optionalRateBps(account.taxRate) };
  });
  if (new Set(accountRates.map((rate) => rate.sellerAccountId)).size !== accountRates.length) {
    throw new TaxConfigurationError('tax_configuration_invalid_payload', 400);
  }
  const workspaceAccounts = await env.ONFRAME_DB.prepare(`
    SELECT id FROM seller_accounts WHERE workspace_id = ?
  `).bind(actor.workspaceId).all<{ id: string }>();
  const accountIds = new Set(workspaceAccounts.results.map((account) => account.id));
  if (accountRates.some((rate) => !accountIds.has(rate.sellerAccountId))) {
    throw new TaxConfigurationError('tax_configuration_account_not_found', 400);
  }

  const timestamp = Date.now();
  const statements: D1PreparedStatement[] = [
    env.ONFRAME_DB.prepare('DELETE FROM workspace_tax_rates WHERE workspace_id = ?').bind(actor.workspaceId),
    env.ONFRAME_DB.prepare('DELETE FROM seller_account_tax_rates WHERE workspace_id = ?').bind(actor.workspaceId)
  ];
  if (workspaceTaxRateBps !== null) {
    statements.push(env.ONFRAME_DB.prepare(`
      INSERT INTO workspace_tax_rates (workspace_id, tax_rate_bps, updated_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(actor.workspaceId, workspaceTaxRateBps, actor.userId, timestamp, timestamp));
  }
  for (const rate of accountRates) {
    if (rate.taxRateBps === null) continue;
    statements.push(env.ONFRAME_DB.prepare(`
      INSERT INTO seller_account_tax_rates (
        workspace_id, seller_account_id, tax_rate_bps, updated_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(actor.workspaceId, rate.sellerAccountId, rate.taxRateBps, actor.userId, timestamp, timestamp));
  }
  statements.push(env.ONFRAME_DB.prepare(`
    INSERT INTO audit_events (
      id, workspace_id, user_id, seller_account_id, request_id, operation, target_type,
      target_id, outcome, status_code, metadata_json, created_at
    ) VALUES (?, ?, ?, NULL, ?, 'tax_configuration_updated', 'workspace', ?, 'success', 200, ?, ?)
  `).bind(
    crypto.randomUUID(), actor.workspaceId, actor.userId, requestId, actor.workspaceId,
    JSON.stringify({ workspaceConfigured: workspaceTaxRateBps !== null, configuredAccounts: accountRates.filter((rate) => rate.taxRateBps !== null).length }),
    timestamp
  ));
  await env.ONFRAME_DB.batch(statements);
  return getTaxConfiguration(env, actor);
}

export async function resolveProductTaxRate(
  env: TaxConfigurationEnv,
  input: { workspaceId: string; sellerAccountId: string; productId: string }
): Promise<TaxRateResolution | null> {
  const row = await env.ONFRAME_DB.prepare(`
    SELECT
      p.tax_rate_bps AS product_tax_rate_bps,
      product_account.tax_rate_bps AS product_account_tax_rate_bps,
      account.tax_rate_bps AS account_tax_rate_bps,
      workspace.tax_rate_bps AS workspace_tax_rate_bps
    FROM products p
    JOIN seller_accounts seller
      ON seller.id = ? AND seller.workspace_id = p.workspace_id
    LEFT JOIN product_account_tax_rates product_account
      ON product_account.product_id = p.id
      AND product_account.seller_account_id = seller.id
      AND product_account.workspace_id = p.workspace_id
    LEFT JOIN seller_account_tax_rates account
      ON account.seller_account_id = seller.id AND account.workspace_id = p.workspace_id
    LEFT JOIN workspace_tax_rates workspace
      ON workspace.workspace_id = p.workspace_id
    WHERE p.id = ? AND p.workspace_id = ? AND p.archived_at IS NULL
  `).bind(input.sellerAccountId, input.productId, input.workspaceId).first<TaxRateRow>();

  if (!row) return null;
  if (row.product_account_tax_rate_bps !== null) {
    return resolvedTaxRate(row.product_account_tax_rate_bps, 'product_account', `${input.productId}:${input.sellerAccountId}`);
  }
  if (row.product_tax_rate_bps !== null) {
    return resolvedTaxRate(row.product_tax_rate_bps, 'product', input.productId);
  }
  if (row.account_tax_rate_bps !== null) {
    return resolvedTaxRate(row.account_tax_rate_bps, 'account', input.sellerAccountId);
  }
  if (row.workspace_tax_rate_bps !== null) {
    return resolvedTaxRate(row.workspace_tax_rate_bps, 'workspace', input.workspaceId);
  }
  return { ...UNCONFIGURED_TAX_RATE };
}
