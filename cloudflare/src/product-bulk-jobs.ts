import { hasPermission } from './permissions';
import { changeProductsInBulk, ProductRequestError, type ProductActor } from './products';

export type ProductBulkJobParams = { jobId: string };
export type ProductBulkJobEnv = {
  ONFRAME_DB: D1Database;
  PRODUCT_BULK: Workflow<ProductBulkJobParams>;
};

type JobRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  status: 'selected' | 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  action: 'update' | 'delete' | 'restore' | 'permanent' | null;
  changes_json: string | null;
  attempt: number;
  total: number;
};

function jobError(code: string, status: number): never {
  throw new ProductRequestError(code, status);
}

function escapedLike(value: string): string {
  return `%${value.replace(/[\\%_]/gu, '\\$&')}%`;
}

async function jobForActor(env: ProductBulkJobEnv, actor: ProductActor, id: string): Promise<JobRow> {
  if (!hasPermission(actor, 'products.read')) jobError('product_access_forbidden', 403);
  const job = await env.ONFRAME_DB.prepare(
    'SELECT * FROM product_bulk_jobs WHERE id = ? AND workspace_id = ? AND user_id = ?'
  )
    .bind(id, actor.workspaceId, actor.userId)
    .first<JobRow>();
  if (!job) jobError('product_bulk_job_not_found', 404);
  return job;
}

export async function createProductBulkSelection(request: Request, env: ProductBulkJobEnv, actor: ProductActor) {
  if (!hasPermission(actor, 'products.read')) jobError('product_access_forbidden', 403);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    jobError('product_invalid_payload', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) jobError('product_invalid_payload', 400);
  const ids = body.ids;
  const filter = body.filter;
  if ((ids === undefined) === (filter === undefined)) jobError('product_invalid_payload', 400);

  let selection: D1PreparedStatement;
  const id = crypto.randomUUID();
  if (ids !== undefined) {
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 100 ||
      ids.some((item) => typeof item !== 'string' || !item.trim() || item.length > 80) ||
      new Set(ids).size !== ids.length
    )
      jobError('product_invalid_payload', 400);
    selection = env.ONFRAME_DB.prepare(
      `INSERT INTO product_bulk_job_items (job_id, product_id, sku, name)
       SELECT ?, id, sku, name FROM products
       WHERE workspace_id = ? AND id IN (SELECT value FROM json_each(?))`
    ).bind(id, actor.workspaceId, JSON.stringify(ids));
  } else {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) jobError('product_invalid_payload', 400);
    const values = filter as Record<string, unknown>;
    const status = values.status;
    const query = values.q;
    if (
      !['all', 'active', 'inactive', 'deleted'].includes(String(status)) ||
      typeof query !== 'string' ||
      query.length > 160
    )
      jobError('product_invalid_payload', 400);
    const where = ['workspace_id = ?', status === 'deleted' ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'];
    const bindings: unknown[] = [id, actor.workspaceId];
    if (status === 'active' || status === 'inactive') {
      where.push('status = ?');
      bindings.push(status);
    }
    if (query.trim()) {
      where.push("(sku LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')");
      bindings.push(escapedLike(query.trim()), escapedLike(query.trim()));
    }
    selection = env.ONFRAME_DB.prepare(
      `INSERT INTO product_bulk_job_items (job_id, product_id, sku, name)
       SELECT ?, id, sku, name FROM products WHERE ${where.join(' AND ')}`
    ).bind(...bindings);
  }

  const timestamp = Date.now();
  await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare(
      `INSERT INTO product_bulk_jobs (id, workspace_id, user_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'selected', ?, ?)`
    ).bind(id, actor.workspaceId, actor.userId, timestamp, timestamp),
    selection
  ]);
  const count = await env.ONFRAME_DB.prepare('SELECT COUNT(*) AS total FROM product_bulk_job_items WHERE job_id = ?')
    .bind(id)
    .first<{ total: number }>();
  if (!count?.total || (Array.isArray(ids) && count.total !== ids.length)) {
    await env.ONFRAME_DB.prepare('DELETE FROM product_bulk_jobs WHERE id = ?').bind(id).run();
    jobError('product_bulk_selection_changed', 409);
  }
  await env.ONFRAME_DB.prepare('UPDATE product_bulk_jobs SET total = ? WHERE id = ?').bind(count.total, id).run();
  return { id, total: count.total };
}

export async function startProductBulkJob(request: Request, env: ProductBulkJobEnv, actor: ProductActor, id: string) {
  const job = await jobForActor(env, actor, id);
  if (job.status !== 'selected') jobError('product_bulk_job_already_started', 409);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    jobError('product_invalid_payload', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) jobError('product_invalid_payload', 400);
  const action = body.action;
  const changes = body.changes;
  if (
    !['update', 'delete', 'restore', 'permanent'].includes(String(action)) ||
    (action === 'update' &&
      (!changes ||
        typeof changes !== 'object' ||
        Array.isArray(changes) ||
        !Object.keys(changes).length ||
        Object.keys(changes).some(
          (key) => !['status', 'cost', 'taxRate', 'minimumContributionMargin'].includes(key)
        ))) ||
    (action !== 'update' && changes !== undefined)
  )
    jobError('product_invalid_payload', 400);
  if (!hasPermission(actor, action === 'update' ? 'products.write' : 'products.delete')) {
    jobError('product_access_forbidden', 403);
  }
  const updated = await env.ONFRAME_DB.prepare(
    `UPDATE product_bulk_jobs SET status = 'queued', action = ?, changes_json = ?, updated_at = ?
     WHERE id = ? AND status = 'selected'`
  )
    .bind(action, changes === undefined ? null : JSON.stringify(changes), Date.now(), id)
    .run();
  if (updated.meta.changes !== 1) jobError('product_bulk_job_already_started', 409);
  try {
    await env.PRODUCT_BULK.create({ id: `${id}-0`, params: { jobId: id } });
  } catch (error) {
    try {
      const instance = await env.PRODUCT_BULK.get(`${id}-0`);
      await instance.status();
      return getProductBulkJob(env, actor, id);
    } catch {
      // No instance was created; the selection can be submitted again.
    }
    await env.ONFRAME_DB.prepare(
      `UPDATE product_bulk_jobs SET status = 'selected', action = NULL, changes_json = NULL
       WHERE id = ? AND status = 'queued'`
    )
      .bind(id)
      .run();
    throw error;
  }
  return getProductBulkJob(env, actor, id);
}

export async function retryProductBulkJob(env: ProductBulkJobEnv, actor: ProductActor, id: string) {
  const job = await jobForActor(env, actor, id);
  if (
    !job.action ||
    !['partial', 'failed'].includes(job.status) ||
    !hasPermission(actor, job.action === 'update' ? 'products.write' : 'products.delete')
  ) {
    jobError('product_bulk_job_not_retryable', 409);
  }
  const attempt = job.attempt + 1;
  const [updated] = await env.ONFRAME_DB.batch([
    env.ONFRAME_DB.prepare(
      `UPDATE product_bulk_jobs SET status = 'queued', attempt = ?, finished_at = NULL, updated_at = ?
       WHERE id = ? AND status IN ('partial', 'failed')`
    ).bind(attempt, Date.now(), id),
    env.ONFRAME_DB.prepare(
      `UPDATE product_bulk_job_items SET status = 'pending', error_code = NULL
       WHERE job_id = ? AND status = 'failed'
         AND EXISTS (SELECT 1 FROM product_bulk_jobs WHERE id = ? AND status = 'queued' AND attempt = ?)`
    ).bind(id, id, attempt)
  ]);
  if (updated.meta.changes !== 1) jobError('product_bulk_job_not_retryable', 409);
  try {
    await env.PRODUCT_BULK.create({ id: `${id}-${attempt}`, params: { jobId: id } });
  } catch (error) {
    try {
      const instance = await env.PRODUCT_BULK.get(`${id}-${attempt}`);
      await instance.status();
      return getProductBulkJob(env, actor, id);
    } catch {
      // Keep the previous result when the retry never started.
    }
    await env.ONFRAME_DB.batch([
      env.ONFRAME_DB.prepare(
        `UPDATE product_bulk_job_items SET status = 'failed', error_code = 'product_bulk_job_interrupted'
         WHERE job_id = ? AND status = 'pending'`
      ).bind(id),
      env.ONFRAME_DB.prepare(
        `UPDATE product_bulk_jobs SET status = ?, attempt = ?, finished_at = ?, updated_at = ? WHERE id = ? AND status = 'queued'`
      ).bind(job.status, job.attempt, Date.now(), Date.now(), id)
    ]);
    throw error;
  }
  return getProductBulkJob(env, actor, id);
}

async function reconcileStoppedJob(env: ProductBulkJobEnv, job: JobRow): Promise<JobRow> {
  if (job.status !== 'queued' && job.status !== 'running') return job;
  try {
    const instance = await env.PRODUCT_BULK.get(`${job.id}-${job.attempt}`);
    const { status } = await instance.status();
    if (status !== 'errored' && status !== 'terminated') return job;
    await env.ONFRAME_DB.batch([
      env.ONFRAME_DB.prepare(
        `UPDATE product_bulk_job_items SET status = 'failed', error_code = 'product_bulk_job_interrupted'
         WHERE job_id = ? AND status = 'pending'`
      ).bind(job.id),
      env.ONFRAME_DB.prepare(
        `UPDATE product_bulk_jobs SET status = CASE
           WHEN EXISTS (SELECT 1 FROM product_bulk_job_items WHERE job_id = ? AND status = 'succeeded')
           THEN 'partial' ELSE 'failed' END,
           finished_at = ?, updated_at = ? WHERE id = ? AND status IN ('queued', 'running')`
      ).bind(job.id, Date.now(), Date.now(), job.id)
    ]);
    return (
      (await env.ONFRAME_DB.prepare('SELECT * FROM product_bulk_jobs WHERE id = ?').bind(job.id).first<JobRow>()) || job
    );
  } catch {
    return job;
  }
}

export async function getProductBulkJob(env: ProductBulkJobEnv, actor: ProductActor, id: string, failedPage = 1) {
  const job = await reconcileStoppedJob(env, await jobForActor(env, actor, id));
  const counts = await env.ONFRAME_DB.prepare(
    `SELECT status, COUNT(*) AS total FROM product_bulk_job_items WHERE job_id = ? GROUP BY status`
  )
    .bind(id)
    .all<{ status: string; total: number }>();
  const byStatus = Object.fromEntries(counts.results.map((row) => [row.status, row.total]));
  const page = Math.max(1, Math.min(100000, failedPage));
  const failures = await env.ONFRAME_DB.prepare(
    `SELECT product_id AS productId, sku, name, error_code AS errorCode
     FROM product_bulk_job_items WHERE job_id = ? AND status = 'failed'
     ORDER BY sku, product_id LIMIT 25 OFFSET ?`
  )
    .bind(id, (page - 1) * 25)
    .all();
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    action: job.action,
    succeeded: byStatus.succeeded || 0,
    failed: byStatus.failed || 0,
    pending: byStatus.pending || 0,
    failedPage: page,
    failures: failures.results
  };
}

export async function latestProductBulkJob(env: ProductBulkJobEnv, actor: ProductActor) {
  if (!hasPermission(actor, 'products.read')) jobError('product_access_forbidden', 403);
  const job = await env.ONFRAME_DB.prepare(
    `SELECT id FROM product_bulk_jobs WHERE workspace_id = ? AND user_id = ? AND status != 'selected'
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(actor.workspaceId, actor.userId)
    .first<{ id: string }>();
  return job ? getProductBulkJob(env, actor, job.id) : null;
}

async function jobActor(env: ProductBulkJobEnv, job: JobRow): Promise<ProductActor> {
  const membership = await env.ONFRAME_DB.prepare(
    `SELECT role_id, (SELECT group_concat(permission) FROM workspace_role_permissions
      WHERE role_id = workspace_members.role_id) AS permissions_csv
     FROM workspace_members WHERE workspace_id = ? AND user_id = ?`
  )
    .bind(job.workspace_id, job.user_id)
    .first<{ role_id: string; permissions_csv: string | null }>();
  if (!membership) jobError('product_access_forbidden', 403);
  return {
    workspaceId: job.workspace_id,
    userId: job.user_id,
    roleId: membership.role_id,
    permissions: membership.permissions_csv?.split(',') || []
  };
}

export async function processProductBulkJobBatch(env: ProductBulkJobEnv, jobId: string): Promise<boolean> {
  const job = await env.ONFRAME_DB.prepare('SELECT * FROM product_bulk_jobs WHERE id = ?').bind(jobId).first<JobRow>();
  if (!job || !job.action) return false;
  const pending = await env.ONFRAME_DB.prepare(
    `SELECT product_id FROM product_bulk_job_items WHERE job_id = ? AND status = 'pending'
     ORDER BY product_id LIMIT 100`
  )
    .bind(jobId)
    .all<{ product_id: string }>();
  const ids = pending.results.map((item) => item.product_id);
  if (!ids.length) return false;
  const payload = { ids, action: job.action, ...(job.changes_json ? { changes: JSON.parse(job.changes_json) } : {}) };
  const actor = await jobActor(env, job);
  const apply = async (targetIds: string[]) => {
    await changeProductsInBulk(
      new Request('https://onframe.onblide.com/v1/app/products/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, ids: targetIds })
      }),
      env,
      actor,
      `product-bulk-${jobId}`,
      jobId
    );
  };
  const applyOrSplit = async (targetIds: string[]): Promise<void> => {
    try {
      await apply(targetIds);
    } catch (error) {
      const remaining = await env.ONFRAME_DB.prepare(
        `SELECT product_id FROM product_bulk_job_items
         WHERE job_id = ? AND status = 'pending'
           AND product_id IN (SELECT value FROM json_each(?))`
      )
        .bind(jobId, JSON.stringify(targetIds))
        .all<{ product_id: string }>();
      const pendingIds = remaining.results.map((item) => item.product_id);
      if (!pendingIds.length) return;
      if (pendingIds.length === 1) {
        await env.ONFRAME_DB.prepare(
          `UPDATE product_bulk_job_items SET status = 'failed', error_code = ?
           WHERE job_id = ? AND product_id = ? AND status = 'pending'`
        )
          .bind(String((error as { code?: string })?.code || 'product_bulk_failed').slice(0, 80), jobId, pendingIds[0])
          .run();
        return;
      }
      const middle = Math.ceil(pendingIds.length / 2);
      await applyOrSplit(pendingIds.slice(0, middle));
      await applyOrSplit(pendingIds.slice(middle));
    }
  };
  await applyOrSplit(ids);
  return true;
}

export async function finishProductBulkJob(env: ProductBulkJobEnv, id: string): Promise<void> {
  const summary = await env.ONFRAME_DB.prepare(
    `SELECT status, COUNT(*) AS total FROM product_bulk_job_items WHERE job_id = ? GROUP BY status`
  )
    .bind(id)
    .all<{ status: string; total: number }>();
  const failed = summary.results.find((row) => row.status === 'failed')?.total || 0;
  const succeeded = summary.results.find((row) => row.status === 'succeeded')?.total || 0;
  const status = failed ? (succeeded ? 'partial' : 'failed') : 'completed';
  await env.ONFRAME_DB.prepare(`UPDATE product_bulk_jobs SET status = ?, finished_at = ?, updated_at = ? WHERE id = ?`)
    .bind(status, Date.now(), Date.now(), id)
    .run();
}
