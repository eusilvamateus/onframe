import assert from 'node:assert/strict';
import test from 'node:test';
import { latestOnFrameRelease } from '../src/releases.ts';

const RELEASE_API_URL = 'https://api.github.com/repos/eusilvamateus/onframe/releases/latest';

test('normaliza a última release oficial e aplica cache à consulta', async () => {
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), RELEASE_API_URL);
    assert.equal(new Headers(init?.headers).get('accept'), 'application/vnd.github+json');
    assert.equal(new Headers(init?.headers).get('user-agent'), 'onframe-worker');
    assert.deepEqual((init as RequestInit & { cf?: unknown }).cf, { cacheEverything: true, cacheTtl: 900 });
    return Response.json({
      tag_name: 'v0.6.0',
      html_url: 'https://github.com/eusilvamateus/onframe/releases/tag/v0.6.0',
      published_at: '2026-10-14T12:00:00Z'
    });
  }) as typeof fetch;

  assert.deepEqual(await latestOnFrameRelease(fetcher), {
    latestVersion: '0.6.0',
    changelogUrl: 'https://github.com/eusilvamateus/onframe/releases/tag/v0.6.0',
    publishedAt: '2026-10-14T12:00:00Z'
  });
});

test('rejeita resposta externa ou sem versão semântica válida', async () => {
  const fetcher = (async () => Response.json({
    tag_name: 'latest',
    html_url: 'https://example.com/release'
  })) as typeof fetch;

  await assert.rejects(() => latestOnFrameRelease(fetcher), /release_payload_invalid/);
});

test('propaga indisponibilidade da origem como falha da consulta', async () => {
  const fetcher = (async () => new Response(null, { status: 503 })) as typeof fetch;
  await assert.rejects(() => latestOnFrameRelease(fetcher), /release_lookup_failed:503/);
});
