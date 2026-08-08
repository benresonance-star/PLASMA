import { describe, expect, it } from 'vitest';
import { buildServer } from '@spds/api';
import { recordBenchmark } from './index.js';

describe('E9 end-to-end API smoke', () => {
  it('publish → completeness → analyze without bypass', async () => {
    const { app } = buildServer();
    const t0 = performance.now();
    const publish = await app.inject({
      method: 'POST',
      url: '/references/d01/publish',
      payload: { yLimit: 2 },
    });
    expect(publish.statusCode).toBe(201);
    const completeness = await app.inject({ method: 'GET', url: '/references/completeness' });
    expect(completeness.statusCode).toBe(200);
    expect((completeness.json() as { allClear: boolean }).allClear).toBe(true);
    const analyze = await app.inject({
      method: 'POST',
      url: '/references/d01/analyze',
      payload: { yLimit: 2 },
    });
    expect(analyze.statusCode).toBe(201);
    expect((analyze.json() as { labelPolicy: string }).labelPolicy).toBe(
      'computational-indicative',
    );
    recordBenchmark({
      id: 'E9.api-publish-analyze',
      durationMs: performance.now() - t0,
      objectCount: 3,
      determinismClass: 'D1',
    });
  });
});
