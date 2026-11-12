import { hasPermission, type Permission } from './permissions';

type MarginConfigurationEnv = { ONFRAME_DB: D1Database };

export type MarginConfigurationActor = {
  userId: string;
  workspaceId: string;
  roleId: string;
  permissions?: string[];
};

export class MarginConfigurationError extends Error {
  constructor(
    readonly code: string,
    readonly status: number
  ) {
    super(code);
  }
}

function minimumMarginBps(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new MarginConfigurationError('margin_configuration_invalid_payload', 400);
  }
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const percent = Number(normalized);
  const basisPoints = Math.round(percent * 100);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100 || Math.abs(percent * 100 - basisPoints) > 0.000001) {
    throw new MarginConfigurationError('margin_configuration_invalid_payload', 400);
  }
  return basisPoints;
}

async function assertAdmin(
  env: MarginConfigurationEnv,
  actor: MarginConfigurationActor,
  permission: Permission
): Promise<void> {
  const membership = await env.ONFRAME_DB.prepare(
    'SELECT role_id FROM workspace_members WHERE workspace_id = ? AND user_id = ?'
  )
    .bind(actor.workspaceId, actor.userId)
    .first<{ role_id: string }>();
  if (!membership || !hasPermission(actor, permission))
    throw new MarginConfigurationError('margin_configuration_forbidden', 403);
}

export async function getMarginConfiguration(env: MarginConfigurationEnv, actor: MarginConfigurationActor) {
  await assertAdmin(env, actor, 'settings.read');
  const row = await env.ONFRAME_DB.prepare(
    'SELECT minimum_contribution_margin_bps FROM workspace_margin_settings WHERE workspace_id = ?'
  )
    .bind(actor.workspaceId)
    .first<{ minimum_contribution_margin_bps: number }>();
  return {
    workspaceMinimumContributionMargin: row === null ? null : row.minimum_contribution_margin_bps / 100
  };
}

export async function updateMarginConfiguration(
  request: Request,
  env: MarginConfigurationEnv,
  actor: MarginConfigurationActor,
  requestId: string
) {
  await assertAdmin(env, actor, 'settings.write');
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    body = parsed as Record<string, unknown>;
  } catch {
    throw new MarginConfigurationError('margin_configuration_invalid_payload', 400);
  }
  if (!Object.prototype.hasOwnProperty.call(body, 'minimumContributionMargin')) {
    throw new MarginConfigurationError('margin_configuration_invalid_payload', 400);
  }

  const minimumBps = minimumMarginBps(body.minimumContributionMargin);
  const timestamp = Date.now();
  const statements = [];
  if (minimumBps === null) {
    statements.push(
      env.ONFRAME_DB.prepare('DELETE FROM workspace_margin_settings WHERE workspace_id = ?').bind(actor.workspaceId)
    );
  } else {
    statements.push(
      env.ONFRAME_DB.prepare(
        `INSERT INTO workspace_margin_settings (
        workspace_id, minimum_contribution_margin_bps, updated_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        minimum_contribution_margin_bps = excluded.minimum_contribution_margin_bps,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = excluded.updated_at`
      ).bind(actor.workspaceId, minimumBps, actor.userId, timestamp, timestamp)
    );
  }
  statements.push(
    env.ONFRAME_DB.prepare(
      `INSERT INTO audit_events (
        id, workspace_id, user_id, seller_account_id, request_id, operation, target_type,
        target_id, outcome, status_code, metadata_json, created_at
      ) VALUES (?, ?, ?, NULL, ?, 'margin_configuration_updated', 'workspace', ?, 'success', 200, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      actor.workspaceId,
      actor.userId,
      requestId,
      actor.workspaceId,
      JSON.stringify({ minimumContributionMargin: minimumBps === null ? null : minimumBps / 100 }),
      timestamp
    )
  );
  await env.ONFRAME_DB.batch(statements);
  return getMarginConfiguration(env, actor);
}
