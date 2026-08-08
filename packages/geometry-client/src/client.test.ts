import { describe, expect, it } from 'vitest';
import { GeometryClient } from './client.js';

describe('geometry-client', () => {
  it('supports timeout/cancel via AbortSignal', async () => {
    const client = new GeometryClient({
      baseUrl: 'http://geometry.test',
      timeoutMs: 20,
      fetchImpl: async (_url, init) =>
        await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    });
    await expect(client.health()).rejects.toBeTruthy();
  });
});
