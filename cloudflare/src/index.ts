type HealthResponse = {
  ok: boolean;
  service: 'onframe-api';
  timestamp: string;
};

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store'
    }
  });
}

function logFailure(request: Request, error: unknown): void {
  console.error(JSON.stringify({
    event: 'health_check_failed',
    method: request.method,
    path: new URL(request.url).pathname,
    error: error instanceof Error ? error.message : 'unknown_error'
  }));
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/health') {
      return json({ error: 'not_found' }, 404);
    }

    try {
      const result = await env.ONFRAME_DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
      if (result?.ok !== 1) throw new Error('D1 health query returned an invalid result.');

      const payload: HealthResponse = {
        ok: true,
        service: 'onframe-api',
        timestamp: new Date().toISOString()
      };
      return json(payload);
    } catch (error) {
      logFailure(request, error);
      return json({ error: 'service_unavailable' }, 503);
    }
  }
} satisfies ExportedHandler<Env>;
