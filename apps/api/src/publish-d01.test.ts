import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

describe('E1/E6 API reference publish', () => {
  it('publishes D01 artifacts', async () => {
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

  it('publishes A01 and F01 through the same API surface', async () => {
    const { app } = buildServer();
    const a01 = await app.inject({ method: 'POST', url: '/references/a01/publish' });
    const f01 = await app.inject({ method: 'POST', url: '/references/f01/publish' });
    expect(a01.statusCode).toBe(201);
    expect(f01.statusCode).toBe(201);
    const aBody = a01.json() as {
      release: { status: string };
      allVerified: boolean;
      instanceCount: number;
    };
    const fBody = f01.json() as {
      release: { status: string };
      allVerified: boolean;
      usesDomeImports: boolean;
      panelCount: number;
    };
    expect(aBody.release.status).toBe('published');
    expect(aBody.allVerified).toBe(true);
    expect(aBody.instanceCount).toBeGreaterThan(0);
    expect(fBody.release.status).toBe('published');
    expect(fBody.allVerified).toBe(true);
    expect(fBody.usesDomeImports).toBe(false);
    expect(fBody.panelCount).toBe(1);
  });
});
