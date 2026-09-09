import { describe, expect, it } from 'vitest';
import { createModel, fetchHealth } from './api-client.js';

describe('W0.1 api-client contracts', () => {
  it('builds health and createModel URLs against mocked fetch', async () => {
    const calls: { url: string; method: string }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok', service: 'spds-api' }), {
          status: 200,
        });
      }
      if (url.endsWith('/models')) {
        return new Response(
          JSON.stringify({
            model: { modelId: 'model:1', name: 'D01' },
            branchId: 'branch:1',
            headHash: 'hash:0',
          }),
          { status: 201 },
        );
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      await fetchHealth();
      await createModel('D01');
    }
    const elapsed = performance.now() - t0;
    globalThis.fetch = original;

    expect(calls.some((c) => c.url.endsWith('/health') && c.method === 'GET')).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/models') && c.method === 'POST')).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });
});
