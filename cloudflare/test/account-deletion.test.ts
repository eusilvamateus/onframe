import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import {
  accountDeletionImpact,
  deleteAccount,
  hasRecentEmailProof,
  verifyDeletionProof
} from '../src/account-deletion.ts';

const actor = {
  userId: 'user-1',
  subject: '11111111-1111-4111-8111-111111111111',
  email: 'person@example.com',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  identityVersion: 1
};

test('exige OTP recente, nao apenas JWT renovado', () => {
  const now = 1_700_000_000;
  assert.equal(hasRecentEmailProof({ iat: now, amr: [{ method: 'otp', timestamp: now - 10 }] }, now), true);
  assert.equal(hasRecentEmailProof({ iat: now, amr: [{ method: 'otp', timestamp: now - 301 }] }, now), false);
  assert.equal(hasRecentEmailProof({ iat: now, amr: [{ method: 'token_refresh', timestamp: now }] }, now), false);
  assert.equal(hasRecentEmailProof({ iat: now, amr: [{ method: 'password', timestamp: now }] }, now), false);
});

test('exclusao distingue workspace individual, compartilhado e sem outro administrador', async () => {
  const simulator = new Miniflare({
    workers: [
      {
        config: {
          name: 'account-deletion-tests',
          compatibilityDate: '2026-09-24',
          manifest: {
            mainModule: 'index.js',
            modules: {
              'index.js': { type: 'esm', contents: "export default { fetch() { return new Response('ok'); } }" }
            }
          },
          env: { ONFRAME_DB: { type: 'd1', id: 'account-deletion-test-db' } }
        }
      }
    ]
  });
  try {
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
        "INSERT INTO users (id, identity_subject, email, display_name, created_at, updated_at, identity_version) VALUES ('user-1', '11111111-1111-4111-8111-111111111111', 'person@example.com', 'Pessoa', 1, 1, 1), ('user-2', '33333333-3333-4333-8333-333333333333', 'other@example.com', 'Outra pessoa', 1, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspaces (id, name, created_by_user_id, created_at, updated_at) VALUES ('solo', 'Individual', 'user-1', 1, 1), ('shared', 'Compartilhado', 'user-1', 1, 1), ('blocked', 'Sem sucessor', 'user-1', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspace_roles (id, workspace_id, name, system_key, created_at, updated_at) VALUES ('role-blocked', 'blocked', 'Colaborador', NULL, 1, 1)"
      ),
      db.prepare(
        "INSERT INTO workspace_members (workspace_id, user_id, role_id, created_at, updated_at) VALUES ('solo', 'user-1', 'admin', 1, 1), ('shared', 'user-1', 'admin', 1, 1), ('shared', 'user-2', 'admin', 1, 1), ('blocked', 'user-1', 'admin', 1, 1), ('blocked', 'user-2', 'admin', 1, 1)"
      )
    ]);
    await db
      .prepare(
        "UPDATE workspace_members SET role_id = 'role-blocked' WHERE workspace_id = 'blocked' AND user_id = 'user-2'"
      )
      .run();
    const env = { ONFRAME_DB: db };
    const impact = await accountDeletionImpact(env, actor);
    assert.deepEqual(
      impact.removedWorkspaces.map((workspace) => workspace.id),
      ['solo']
    );
    assert.deepEqual(
      impact.retainedWorkspaces.map((workspace) => workspace.id),
      ['shared']
    );
    assert.deepEqual(
      impact.blockedWorkspaces.map((workspace) => workspace.id),
      ['blocked']
    );
    await assert.rejects(deleteAccount(env, actor, null), { code: 'account_deletion_blocked' });

    await db
      .prepare("UPDATE workspace_members SET role_id = 'admin' WHERE workspace_id = 'blocked' AND user_id = 'user-2'")
      .run();
    const unblocked = await accountDeletionImpact(env, actor);
    assert.equal(unblocked.blockedWorkspaces.length, 0);
    const flow = 'a'.repeat(43);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(flow));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const timestamp = Date.now();
    await db
      .prepare(
        `INSERT INTO extension_auth_flows
       (id, token_hash, user_id, workspace_id, expires_at, completed_at, claimed_at, created_at,
        identity_version, auth_session_id, verification_result)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'verified')`
      )
      .bind(
        'flow-1',
        hash,
        actor.userId,
        timestamp + 60_000,
        timestamp,
        timestamp,
        timestamp,
        actor.identityVersion,
        actor.authSessionId
      )
      .run();
    await verifyDeletionProof(env, actor, { verificationFlow: flow });
    await assert.rejects(verifyDeletionProof(env, actor, { verificationFlow: flow }), {
      code: 'account_deletion_verification_required'
    });
    const fullFlow = 'b'.repeat(43);
    const fullDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fullFlow));
    const fullHash = Array.from(new Uint8Array(fullDigest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    await db
      .prepare(
        `INSERT INTO extension_auth_flows
         (id, token_hash, user_id, workspace_id, expires_at, completed_at, claimed_at, created_at,
          identity_version, auth_session_id, verification_result)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'verified')`
      )
      .bind(
        'flow-2',
        fullHash,
        actor.userId,
        timestamp + 60_000,
        timestamp,
        timestamp,
        timestamp,
        actor.identityVersion,
        actor.authSessionId
      )
      .run();
    const requests: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      requests.push(url);
      if (url.endsWith('/storage/v1/object/list/onframe-avatars')) return Response.json([]);
      if (url.endsWith(`/auth/v1/admin/users/${actor.subject}`)) return Response.json({});
      throw new Error(`Unexpected request: ${url}`);
    };
    try {
      await deleteAccount(
        { ...env, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key' },
        actor,
        { verificationFlow: fullFlow }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.equal(requests.length, 3);
    assert.ok(requests[0].endsWith('/storage/v1/object/list/onframe-avatars'));
    assert.ok(requests[1].endsWith('/storage/v1/object/list/onframe-avatars'));
    assert.ok(requests[2].endsWith(`/auth/v1/admin/users/${actor.subject}`));
    assert.equal(await db.prepare("SELECT id FROM workspaces WHERE id = 'solo'").first(), null);
    assert.ok(await db.prepare("SELECT id FROM workspaces WHERE id = 'shared'").first());
    assert.equal(await db.prepare("SELECT user_id FROM workspace_members WHERE user_id = 'user-1'").first(), null);
    assert.ok(await db.prepare("SELECT user_id FROM workspace_members WHERE user_id = 'user-2'").first());
    const tombstone = await db
      .prepare("SELECT identity_subject, email, display_name FROM users WHERE id = 'user-1'")
      .first();
    assert.deepEqual(tombstone, { identity_subject: null, email: null, display_name: null });
  } finally {
    await simulator.dispose();
  }
});
