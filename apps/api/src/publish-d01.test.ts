import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

describe('E1 API D01 publish', () => {
  it('runs pipeline, stores artifacts, and returns published release', async () => {
    const { app } = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/references/d01/publish',
      payload: { yLimit: 3 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      release: { status: string };
      allVerified: boolean;
      stored: unknown[];
    };
    expect(body.release.status).toBe('published');
    expect(body.allVerified).toBe(true);
    expect(body.stored).toHaveLength(3);
  });
});
