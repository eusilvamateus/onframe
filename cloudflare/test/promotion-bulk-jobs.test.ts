import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { finishPromotionBulkJob, getPromotionBulkJob, storePromotionBulkTarget } from '../src/remote-api.ts';

async function testDatabase() {
  const simulator = new Miniflare({
    workers: [
      {
        config: {
          name: 'promotion-bulk-tests',
          compatibilityDate: '2026-09-24',
          manifest: {
            mainModule: 'index.js',
            modules: {
              'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" }
            }
          },
          env: { ONFRAME_DB: { type: 'd1', id: 'promotion-bulk-test-db' } }
        }
      }
    ]
  });
  const db = await simulator.getD1Database('ONFRAME_DB');
  const files = (await readdir(new URL('../migrations/', import.meta.url)))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
  }
  await db.batch([
    db.prepare(
      "INSERT INTO users (id, identity_subject, email, created_at, updated_at, identity_version) VALUES ('user-1', 'subject-1', 'admin@example.com', 1, 1, 1)"
    ),
    db.prepare(
      "INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('workspace-1', 'Principal', 'user-1', 1, 1)"
    ),
    db.prepare(
      "INSERT INTO workspace_members (workspace_id, user_id, role_id, created_at, updated_at) VALUES ('workspace-1', 'user-1', 'admin', 1, 1)"
    ),
    db.prepare(
      "INSERT INTO seller_accounts (id, workspace_id, meli_user_id, enabled, created_at, updated_at) VALUES ('account-1', 'workspace-1', '123', 1, 1, 1)"
    ),
    db.prepare(
      "INSERT INTO promotion_bulk_jobs (id, workspace_id, user_id, source_item_id, seller_account_id, action, payload_json, status, total, created_at, updated_at) VALUES ('job-1', 'workspace-1', 'user-1', 'MLB1000000001', 'account-1', 'promotion.offer.create', '{}', 'running', 3, 1, 1)"
    ),
    db.prepare(
      "INSERT INTO promotion_bulk_job_items (job_id, item_id, status, thumbnail_url) VALUES ('job-1', 'MLB1000000001', 'running', 'https://example.com/item-1.jpg'), ('job-1', 'MLB1000000002', 'queued', NULL), ('job-1', 'MLB1000000003', 'blocked', NULL)"
    )
  ]);
  const env = {
    ONFRAME_DB: db,
    PROMOTION_BULK: { get: async () => ({ status: async () => ({ status: 'running' }) }) }
  } as never;
  const actor = { sessionId: 'session-1', userId: 'user-1', workspaceId: 'workspace-1', roleId: 'admin' };
  return { simulator, db, env, actor };
}

test('job de promoção persiste progresso, restringe acesso e impede execução duplicada', async () => {
  const { simulator, db, env, actor } = await testDatabase();
  try {
    const running = (await getPromotionBulkJob(env, actor, 'MLB1000000001', 'job-1')) as {
      status: string;
      counts: { queued: number; blocked: number };
      targets: { itemId: string; thumbnailUrl: string | null }[];
    };
    assert.equal(running.status, 'running');
    assert.equal(running.counts.queued, 2);
    assert.equal(running.counts.blocked, 1);
    assert.equal(running.targets.find((target) => target.itemId === 'MLB1000000001')?.thumbnailUrl,
      'https://example.com/item-1.jpg');
    await assert.rejects(getPromotionBulkJob(env, { ...actor, userId: 'other' }, 'MLB1000000001', 'job-1'));
    await assert.rejects(
      db
        .prepare(
          "INSERT INTO promotion_bulk_jobs (id, workspace_id, user_id, source_item_id, seller_account_id, action, payload_json, total, created_at, updated_at) VALUES ('job-2', 'workspace-1', 'user-1', 'MLB1000000001', 'account-1', 'promotion.offer.create', '{}', 1, 2, 2)"
        )
        .run()
    );

    await storePromotionBulkTarget(env, 'job-1', 'MLB1000000001', { status: 'applied' });
    await db
      .prepare(
        "UPDATE promotion_bulk_job_items SET status = 'failed', message = 'Não aceita a promoção' WHERE job_id = 'job-1' AND item_id = 'MLB1000000002'"
      )
      .run();
    await finishPromotionBulkJob(env, 'job-1');
    const result = (await getPromotionBulkJob(env, actor, 'MLB1000000001', 'job-1')) as {
      status: string;
      counts: { applied: number; failed: number; blocked: number };
    };
    assert.equal(result.status, 'partial');
    assert.equal(result.counts.applied, 1);
    assert.equal(result.counts.failed, 1);
    assert.equal(result.counts.blocked, 1);
  } finally {
    await simulator.dispose();
  }
});

test('job de promoção acompanha a confirmação assíncrona após reabrir', async () => {
  const { simulator, db, env, actor } = await testDatabase();
  try {
    await db
      .prepare(
        `INSERT INTO promotion_reconciliations
       (id, workspace_id, seller_account_id, user_id, request_id, source_item_id, item_id,
        operation, payload_json, workflow_started_at, created_at, updated_at, expires_at)
       VALUES ('reconciliation-1', 'workspace-1', 'account-1', 'user-1', 'request-1',
       'MLB1000000001', 'MLB1000000001', 'promotion.offer.create', '{}', 1, 1, 1, ?)`
      )
      .bind(Date.now() + 86400000)
      .run();
    await db.batch([
      db.prepare(
        "UPDATE promotion_bulk_job_items SET status = 'pending_confirmation', reconciliation_id = 'reconciliation-1' WHERE job_id = 'job-1' AND item_id = 'MLB1000000001'"
      ),
      db.prepare(
        "UPDATE promotion_bulk_job_items SET status = 'applied' WHERE job_id = 'job-1' AND item_id = 'MLB1000000002'"
      ),
      db.prepare("UPDATE promotion_bulk_jobs SET status = 'confirming' WHERE id = 'job-1'")
    ]);
    const waiting = (await getPromotionBulkJob(env, actor, 'MLB1000000001', 'job-1')) as {
      status: string;
      counts: { pending: number };
    };
    assert.equal(waiting.status, 'confirming');
    assert.equal(waiting.counts.pending, 1);

    await db.prepare("UPDATE promotion_reconciliations SET status = 'confirmed' WHERE id = 'reconciliation-1'").run();
    const completed = (await getPromotionBulkJob(env, actor, 'MLB1000000001', 'job-1')) as {
      status: string;
      counts: { applied: number; pending: number };
      targets: { status: string }[];
    };
    assert.equal(completed.status, 'partial');
    assert.equal(completed.counts.applied, 2);
    assert.equal(completed.counts.pending, 0);
    assert.equal(completed.targets.find((target) => target.status === 'applied')?.status, 'applied');
  } finally {
    await simulator.dispose();
  }
});

test('confirmação vencida encerra o job sem reenviar a oferta', async () => {
  const { simulator, db, env, actor } = await testDatabase();
  try {
    await db
      .prepare(
        `INSERT INTO promotion_reconciliations
       (id, workspace_id, seller_account_id, user_id, request_id, source_item_id, item_id,
        operation, payload_json, created_at, updated_at, expires_at)
       VALUES ('expired-1', 'workspace-1', 'account-1', 'user-1', 'request-1',
       'MLB1000000001', 'MLB1000000001', 'promotion.offer.create', '{}', 1, 1, 100)`
      )
      .run();
    await db.batch([
      db.prepare(
        "UPDATE promotion_bulk_job_items SET status = 'pending_confirmation', reconciliation_id = 'expired-1' WHERE job_id = 'job-1' AND item_id = 'MLB1000000001'"
      ),
      db.prepare(
        "UPDATE promotion_bulk_job_items SET status = 'applied' WHERE job_id = 'job-1' AND item_id = 'MLB1000000002'"
      ),
      db.prepare("UPDATE promotion_bulk_jobs SET status = 'confirming' WHERE id = 'job-1'")
    ]);
    const result = (await getPromotionBulkJob(env, actor, 'MLB1000000001', 'job-1')) as {
      status: string;
      counts: { pending: number; unconfirmed: number };
    };
    assert.equal(result.status, 'partial');
    assert.equal(result.counts.pending, 0);
    assert.equal(result.counts.unconfirmed, 1);
  } finally {
    await simulator.dispose();
  }
});

test('workflow interrompido não deixa itens eternamente em andamento', async () => {
  const { simulator, db, actor } = await testDatabase();
  try {
    const stoppedEnv = {
      ONFRAME_DB: db,
      PROMOTION_BULK: { get: async () => ({ status: async () => ({ status: 'errored' }) }) }
    } as never;
    const result = (await getPromotionBulkJob(stoppedEnv, actor, 'MLB1000000001', 'job-1')) as {
      status: string;
      counts: { queued: number; unconfirmed: number; failed: number };
    };
    assert.equal(result.status, 'failed');
    assert.equal(result.counts.queued, 0);
    assert.equal(result.counts.unconfirmed, 1);
    assert.equal(result.counts.failed, 1);
  } finally {
    await simulator.dispose();
  }
});
