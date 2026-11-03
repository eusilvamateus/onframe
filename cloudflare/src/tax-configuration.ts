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
