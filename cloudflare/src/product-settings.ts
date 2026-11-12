import { hasPermission, type Permission } from './permissions';

type ProductSettingsEnv = { ONFRAME_DB: D1Database };

export type ProductSettingsActor = {
  userId: string;
  workspaceId: string;
  roleId: string;
  permissions?: string[];
};

export class ProductSettingsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number
  ) {
    super(code);
  }
}

async function assertAdmin(
  env: ProductSettingsEnv,
  actor: ProductSettingsActor,
  permission: Permission
): Promise<void> {
  const membership = await env.ONFRAME_DB.prepare(
    'SELECT role_id FROM workspace_members WHERE workspace_id = ? AND user_id = ?'
  )
    .bind(actor.workspaceId, actor.userId)
    .first<{ role_id: string }>();
  if (!membership || !hasPermission(actor, permission))
    throw new ProductSettingsError('product_settings_forbidden', 403);
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
    return body as Record<string, unknown>;
  } catch {
    throw new ProductSettingsError('product_settings_invalid_payload', 400);
  }
}

function costDecimalPlaces(value: unknown): number {
  const places = Number(value);
  if (!Number.isInteger(places) || places < 0 || places > 8) {
    throw new ProductSettingsError('product_settings_invalid_payload', 400);
  }
  return places;
}

export async function getProductSettings(env: ProductSettingsEnv, actor: ProductSettingsActor) {
  await assertAdmin(env, actor, 'settings.read');
  const workspace = await env.ONFRAME_DB.prepare('SELECT cost_display_decimal_places FROM workspaces WHERE id = ?')
    .bind(actor.workspaceId)
    .first<{ cost_display_decimal_places: number }>();
  return { costDecimalPlaces: workspace?.cost_display_decimal_places ?? 2 };
}

export async function updateProductSettings(
  request: Request,
  env: ProductSettingsEnv,
  actor: ProductSettingsActor,
  requestId: string
) {
  await assertAdmin(env, actor, 'settings.write');
  const body = await requestBody(request);
  const displayDecimalPlaces = costDecimalPlaces(body.costDecimalPlaces);
  const timestamp = Date.now();
  await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare('UPDATE workspaces SET cost_display_decimal_places = ?, updated_at = ? WHERE id = ?').bind(
      displayDecimalPlaces,
      timestamp,
      actor.workspaceId
    ),
    env.ONFRAME_DB.prepare(
      `
      INSERT INTO audit_events (
        id, workspace_id, user_id, seller_account_id, request_id, operation, target_type,
        target_id, outcome, status_code, metadata_json, created_at
      ) VALUES (?, ?, ?, NULL, ?, 'product_settings_updated', 'workspace', ?, 'success', 200, ?, ?)
    `
    ).bind(
      crypto.randomUUID(),
      actor.workspaceId,
      actor.userId,
      requestId,
      actor.workspaceId,
      JSON.stringify({ costDecimalPlaces: displayDecimalPlaces }),
      timestamp
    )
  ]);
  return getProductSettings(env, actor);
}
