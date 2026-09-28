import assert from 'node:assert/strict';
import test from 'node:test';
import { Webhook } from 'standardwebhooks';
import { deliveriesForEvent, handleSupabaseSendEmailHook } from '../src/auth-email.ts';

const hookSecret = 'v1,whsec_b25mZnJhbWUtc2VuZC1lbWFpbC1ob29rLXNlY3JldA==';
const rawHookSecret = hookSecret.replace('v1,', '');

class FakeD1 {
  rows = new Map();

  prepare(sql: string) {
    return {
      bind: (...args: unknown[]) => ({
        run: async () => this.run(sql, args),
        first: async () => this.first(sql, args)
      })
    };
  }

  async run(sql: string, args: unknown[]) {
    if (sql.includes('INSERT OR IGNORE INTO auth_email_deliveries')) {
      const [id, webhookId, recipientHash, actionType, createdAt, updatedAt, leaseExpiresAt] = args as string[];
      if (this.rows.has(id)) return { meta: { changes: 0 } };
      this.rows.set(id, {
        id,
        webhook_id: webhookId,
        recipient_hash: recipientHash,
        email_action_type: actionType,
        status: 'sending',
        lease_expires_at: leaseExpiresAt,
        created_at: createdAt,
        updated_at: updatedAt
      });
      return { meta: { changes: 1 } };
    }

    if (sql.includes("SET status = 'sent'")) {
      const [sentAt, updatedAt, id] = args as string[];
      const row = this.rows.get(id);
      if (row) Object.assign(row, { status: 'sent', sent_at: sentAt, updated_at: updatedAt, lease_expires_at: null });
      return { meta: { changes: row ? 1 : 0 } };
    }

    if (sql.includes('SET attempt_count = attempt_count + 1')) {
      const [updatedAt, leaseExpiresAt, id] = args as string[];
      const row = this.rows.get(id);
      if (!row || row.status !== 'sending') return { meta: { changes: 0 } };
      Object.assign(row, { updated_at: updatedAt, lease_expires_at: leaseExpiresAt });
      return { meta: { changes: 1 } };
    }

    if (sql.includes('DELETE FROM auth_email_deliveries')) {
      const [id] = args as string[];
      return { meta: { changes: this.rows.delete(id) ? 1 : 0 } };
    }

    throw new Error(`Consulta não prevista: ${sql}`);
  }

  async first(sql: string, args: unknown[]) {
    if (sql.includes('FROM auth_email_deliveries')) {
      const row = this.rows.get(args[0] as string);
      return row ? { status: row.status, lease_expires_at: row.lease_expires_at } : null;
    }
    throw new Error(`Consulta não prevista: ${sql}`);
  }
}

function event(actionType: string, overrides = {}) {
  return {
    user: { email: 'pessoa@example.com' },
    email_data: {
      token: '12345678',
      token_hash: 'token-hash-principal',
      redirect_to: 'https://onframe.onblide.com/auth/callback',
      email_action_type: actionType
    },
    ...overrides
  };
}

function signedRequest(payload: object, options: { webhookId?: string; timestamp?: Date; signature?: string } = {}) {
  const body = JSON.stringify(payload);
  const webhookId = options.webhookId ?? 'msg_onframe_test_001';
  const timestamp = options.timestamp ?? new Date();
  const signer = new Webhook(rawHookSecret);
  const signature = options.signature ?? signer.sign(webhookId, timestamp, body);
  return new Request('https://onframe.onblide.com/hooks/supabase/send-email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': webhookId,
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'webhook-signature': signature
    },
    body
  });
}

function runtime(db: FakeD1) {
  return {
    AUTH_EMAIL_FROM: 'OnFrame <acesso@onframe.onblide.com>',
    ONFRAME_DB: db as unknown as D1Database,
    RESEND_API_KEY: 're_test_key',
    SUPABASE_SEND_EMAIL_HOOK_SECRET: hookSecret,
    SUPABASE_URL: 'https://ignrkxityihpvreaimxe.supabase.co'
  };
}

test('renderiza magic link sem transformar o acesso em OTP', () => {
  const [delivery] = deliveriesForEvent(runtime(new FakeD1()), event('magiclink'));

  assert.equal(delivery.recipient, 'pessoa@example.com');
  assert.equal(delivery.subject, 'Seu link de acesso');
  assert.doesNotMatch(delivery.html, /class="code-cell"/);
  assert.match(delivery.html, /onblide-horizontal-primary\.png/);
  assert.match(delivery.html, /auth\/v1\/verify\?token=token-hash-principal&amp;type=magiclink/);
});

test('aplica a superfície bordered do design system aos e-mails', () => {
  const [delivery] = deliveriesForEvent(runtime(new FakeD1()), event('magiclink'));

  assert.match(delivery.html, /background:#ffffff/);
  assert.match(delivery.html, /border:1px solid #ececec;border-radius:12px;background:#ffffff;box-shadow:none/);
  assert.doesNotMatch(delivery.html, /background:#f2f0e8/);
  assert.doesNotMatch(delivery.html, /box-shadow:(?!none)/);
  assert.match(delivery.html, /font-family:'JetBrains Mono','Courier New',monospace;font-size:12px;font-weight:600;letter-spacing:\.04em/);
  assert.match(delivery.html, /margin:24px 0 8px/);
  assert.match(delivery.html, /border-radius:10px;color:#ffffff;font-size:14px;font-weight:600/);
  assert.doesNotMatch(delivery.html, /\.action-link \{/);
  assert.doesNotMatch(delivery.html, /\.code-cell \{/);
});

test('separa as duas confirmações da alteração segura de e-mail', () => {
  const deliveries = deliveriesForEvent(runtime(new FakeD1()), event('email_change', {
    user: { email: 'atual@example.com', new_email: 'novo@example.com' },
    email_data: {
      token: '11111111',
      token_hash: 'hash-novo-email',
      token_new: '22222222',
      token_hash_new: 'hash-email-atual',
      redirect_to: 'https://onframe.onblide.com/auth/callback',
      email_action_type: 'email_change'
    }
  }));

  assert.equal(deliveries.length, 2);
  assert.deepEqual(deliveries.map((delivery) => delivery.recipient), ['atual@example.com', 'novo@example.com']);
  assert.match(deliveries[0].html, /token=hash-email-atual&amp;type=email_change/);
  assert.match(deliveries[1].html, /token=hash-novo-email&amp;type=email_change/);
});

test('aceita somente hook assinado e não duplica um reenvio do Supabase', async () => {
  const db = new FakeD1();
  const sent: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.match(String(init?.headers && new Headers(init.headers).get('idempotency-key')), /^[a-f0-9]{64}$/u);
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: 'email_test_001' }), { status: 200 });
  };

  try {
    const payload = event('magiclink');
    const first = await handleSupabaseSendEmailHook(signedRequest(payload), runtime(db));
    const retry = await handleSupabaseSendEmailHook(signedRequest(payload), runtime(db));

    assert.equal(first.status, 200);
    assert.equal(retry.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].from, 'OnFrame <acesso@onframe.onblide.com>');

    const invalid = await handleSupabaseSendEmailHook(signedRequest(payload, { signature: 'v1,invalid' }), runtime(db));
    assert.equal(invalid.status, 401);
    assert.equal(sent.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
