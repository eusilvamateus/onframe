import { createClient } from '@supabase/supabase-js';
import { authenticateSupabaseRequest } from './browser-auth';

type DeletionEnv = {
  ONFRAME_DB: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type DeletionActor = {
  userId: string;
  subject: string;
  email: string;
  authSessionId: string;
  identityVersion: number;
};

type WorkspaceImpact = { id: string; name: string };

export type AccountDeletionImpact = {
  removedWorkspaces: WorkspaceImpact[];
  retainedWorkspaces: WorkspaceImpact[];
  blockedWorkspaces: WorkspaceImpact[];
};

export class AccountDeletionError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly cause?: unknown
  ) {
    super(code);
  }
}

export function hasRecentEmailProof(claims: unknown, timestamp = Math.floor(Date.now() / 1000)): boolean {
  if (!claims || typeof claims !== 'object') return false;
  const value = claims as { iat?: unknown; amr?: unknown };
  if (typeof value.iat !== 'number' || !Number.isInteger(value.iat) || !Array.isArray(value.amr)) return false;
  const age = timestamp - value.iat;
  return (
    age >= 0 &&
    age <= 300 &&
    value.amr.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const method = entry as { method?: unknown; timestamp?: unknown };
      if (method.method !== 'otp' || typeof method.timestamp !== 'number' || !Number.isInteger(method.timestamp))
        return false;
      const methodAge = timestamp - method.timestamp;
      return methodAge >= 0 && methodAge <= 300;
    })
  );
}

async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function accountDeletionImpact(env: DeletionEnv, actor: DeletionActor): Promise<AccountDeletionImpact> {
  const rows = await env.ONFRAME_DB.prepare(
    `SELECT workspaces.id, workspaces.name, workspace_members.role_id,
      (SELECT COUNT(*) FROM workspace_members AS members WHERE members.workspace_id = workspaces.id) AS member_count,
      (SELECT COUNT(*) FROM workspace_members AS admins
       WHERE admins.workspace_id = workspaces.id AND admins.role_id = 'admin' AND admins.user_id <> ?) AS other_admin_count
     FROM workspaces
     LEFT JOIN workspace_members ON workspace_members.workspace_id = workspaces.id AND workspace_members.user_id = ?
     WHERE workspace_members.user_id IS NOT NULL
       OR (workspaces.created_by_user_id = ? AND NOT EXISTS
         (SELECT 1 FROM workspace_members AS members WHERE members.workspace_id = workspaces.id))
     ORDER BY workspaces.name`
  )
    .bind(actor.userId, actor.userId, actor.userId)
    .all<{ id: string; name: string; role_id: string | null; member_count: number; other_admin_count: number }>();

  const impact: AccountDeletionImpact = {
    removedWorkspaces: [],
    retainedWorkspaces: [],
    blockedWorkspaces: []
  };
  for (const row of rows.results) {
    const workspace = { id: row.id, name: row.name };
    if (row.member_count <= 1) impact.removedWorkspaces.push(workspace);
    else if (row.role_id === 'admin' && row.other_admin_count === 0) impact.blockedWorkspaces.push(workspace);
    else impact.retainedWorkspaces.push(workspace);
  }
  return impact;
}

export async function verifyDeletionProof(env: DeletionEnv, actor: DeletionActor, proof: unknown): Promise<void> {
  if (!proof || typeof proof !== 'object')
    throw new AccountDeletionError('account_deletion_verification_required', 403);
  const value = proof as { accessToken?: unknown; verificationFlow?: unknown };
  if (typeof value.accessToken === 'string' && /^[A-Za-z0-9._-]{20,4096}$/u.test(value.accessToken)) {
    let identity;
    try {
      identity = await authenticateSupabaseRequest(
        new Request('https://onframe.onblide.com/v1/account/deletion', {
          headers: { authorization: `Bearer ${value.accessToken}` }
        }),
        env
      );
    } catch {
      throw new AccountDeletionError('account_deletion_verification_required', 403);
    }
    let claims: unknown;
    try {
      claims = JSON.parse(atob(value.accessToken.split('.')[1].replace(/-/gu, '+').replace(/_/gu, '/')));
    } catch {
      throw new AccountDeletionError('account_deletion_verification_required', 403);
    }
    if (
      identity.subject !== actor.subject ||
      identity.email !== actor.email ||
      identity.identityVersion !== actor.identityVersion ||
      !hasRecentEmailProof(claims)
    ) {
      throw new AccountDeletionError('account_deletion_verification_required', 403);
    }
    return;
  }

  if (typeof value.verificationFlow === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(value.verificationFlow)) {
    const timestamp = Date.now();
    const result = await env.ONFRAME_DB.prepare(
      `UPDATE extension_auth_flows SET expires_at = 0
       WHERE token_hash = ? AND user_id = ? AND workspace_id IS NULL
         AND identity_version = ? AND auth_session_id = ?
         AND verification_result = 'verified' AND claimed_at IS NOT NULL
         AND completed_at >= ? AND claimed_at >= ? AND expires_at > 0`
    )
      .bind(
        await tokenHash(value.verificationFlow),
        actor.userId,
        actor.identityVersion,
        actor.authSessionId,
        timestamp - 300_000,
        timestamp - 300_000
      )
      .run();
    if (result.meta.changes === 1) return;
  }
  throw new AccountDeletionError('account_deletion_verification_required', 403);
}

export async function deleteAccount(env: DeletionEnv, actor: DeletionActor, proof: unknown): Promise<void> {
  let impact = await accountDeletionImpact(env, actor);
  if (impact.blockedWorkspaces.length) throw new AccountDeletionError('account_deletion_blocked', 409);
  await verifyDeletionProof(env, actor, proof);
  impact = await accountDeletionImpact(env, actor);
  if (impact.blockedWorkspaces.length) throw new AccountDeletionError('account_deletion_blocked', 409);

  const origin = String(env.SUPABASE_URL || '').trim();
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/u.test(origin) || !serviceKey)
    throw new AccountDeletionError('account_deletion_unavailable', 503);
  const client = createClient(origin, serviceKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  });
  const avatars = client.storage.from('onframe-avatars');
  for (const prefix of [actor.userId, ...impact.removedWorkspaces.map((workspace) => `workspaces/${workspace.id}`)]) {
    let empty = false;
    for (let page = 0; page < 100; page += 1) {
      const listed = await avatars.list(prefix, { limit: 100, offset: 0 });
      if (listed.error) throw new AccountDeletionError('account_deletion_unavailable', 503);
      const paths = (listed.data || []).filter((item) => item.id !== null).map((item) => `${prefix}/${item.name}`);
      if (paths.length === 0) {
        empty = true;
        break;
      }
      const removed = await avatars.remove(paths);
      if (removed.error) throw new AccountDeletionError('account_deletion_unavailable', 503);
    }
    if (!empty) throw new AccountDeletionError('account_deletion_unavailable', 503);
  }
  const deleted = await client.auth.admin.deleteUser(actor.subject);
  if (deleted.error) throw new AccountDeletionError('account_deletion_unavailable', 503);
  await purgeAccountData(env, actor, impact);
}

export async function purgeAccountData(
  env: DeletionEnv,
  actor: DeletionActor,
  impact: AccountDeletionImpact
): Promise<void> {
  try {
    const statements = impact.removedWorkspaces.map((workspace) =>
      env.ONFRAME_DB.prepare(
        `DELETE FROM workspaces WHERE id = ?
         AND (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ?) <= 1`
      ).bind(workspace.id, workspace.id)
    );
    statements.push(
      env.ONFRAME_DB.prepare('DELETE FROM workspace_members WHERE user_id = ?').bind(actor.userId),
      env.ONFRAME_DB.prepare('DELETE FROM account_members WHERE user_id = ?').bind(actor.userId),
      env.ONFRAME_DB.prepare('DELETE FROM workspace_invitations WHERE email = ?').bind(actor.email),
      env.ONFRAME_DB.prepare(
        'UPDATE workspace_invitations SET accepted_by_user_id = NULL WHERE accepted_by_user_id = ?'
      ).bind(actor.userId),
      env.ONFRAME_DB.prepare('DELETE FROM extension_sessions WHERE user_id = ?').bind(actor.userId),
      env.ONFRAME_DB.prepare('DELETE FROM extension_auth_flows WHERE user_id = ?').bind(actor.userId),
      env.ONFRAME_DB.prepare('DELETE FROM oauth_transactions WHERE user_id = ?').bind(actor.userId),
      env.ONFRAME_DB.prepare(
        'UPDATE item_edit_events SET actor_name = NULL, actor_email = NULL, user_id = NULL WHERE user_id = ?'
      ).bind(actor.userId),
      env.ONFRAME_DB.prepare(
        'UPDATE promotion_reconciliations SET actor_name = NULL, actor_email = NULL, user_id = NULL WHERE user_id = ?'
      ).bind(actor.userId),
      env.ONFRAME_DB.prepare('UPDATE products SET created_by_user_id = NULL WHERE created_by_user_id = ?').bind(
        actor.userId
      ),
      env.ONFRAME_DB.prepare('UPDATE products SET updated_by_user_id = NULL WHERE updated_by_user_id = ?').bind(
        actor.userId
      ),
      env.ONFRAME_DB.prepare(
        'UPDATE product_cost_history SET created_by_user_id = NULL WHERE created_by_user_id = ?'
      ).bind(actor.userId),
      env.ONFRAME_DB.prepare(
        'UPDATE workspace_tax_rates SET updated_by_user_id = NULL WHERE updated_by_user_id = ?'
      ).bind(actor.userId),
      env.ONFRAME_DB.prepare(
        'UPDATE seller_account_tax_rates SET updated_by_user_id = NULL WHERE updated_by_user_id = ?'
      ).bind(actor.userId),
      env.ONFRAME_DB.prepare(
        'UPDATE product_account_tax_rates SET updated_by_user_id = NULL WHERE updated_by_user_id = ?'
      ).bind(actor.userId),
      env.ONFRAME_DB.prepare(
        'UPDATE workspace_margin_settings SET updated_by_user_id = NULL WHERE updated_by_user_id = ?'
      ).bind(actor.userId),
      env.ONFRAME_DB.prepare("UPDATE audit_events SET user_id = NULL, metadata_json = '{}' WHERE user_id = ?").bind(
        actor.userId
      ),
      env.ONFRAME_DB.prepare(
        'UPDATE users SET identity_subject = NULL, email = NULL, display_name = NULL, avatar_url = NULL, identity_version = 0, updated_at = ? WHERE id = ?'
      ).bind(Date.now(), actor.userId)
    );
    await env.ONFRAME_DB.batch(statements);
  } catch (error) {
    throw new AccountDeletionError('account_deletion_cleanup_failed', 503, error);
  }
}
