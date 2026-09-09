import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

describe('SDI Wave 0 live substrate API', () => {
  it('404s explain when model has no query context', async () => {
    const { app } = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/models/model:missing/explain',
      payload: { targetId: 'component:y:0000' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('model_query_context_not_found');
  });

  it('seeds live D01 substrate and explains a generated semanticOwner', async () => {
    const { app } = buildServer();
    const created = await app.inject({
      method: 'POST',
      url: '/models',
      payload: { name: 'Live D01 SDI' },
    });
    expect(created.statusCode).toBe(201);
    const modelId = created.json().model.modelId as string;

    const seeded = await app.inject({
      method: 'POST',
      url: `/models/${modelId}/substrate/d01`,
      payload: { yLimit: 3 },
    });
    expect(seeded.statusCode).toBe(201);
    expect(seeded.json().source).toBe('live-d01');
    expect(seeded.json().meshCount).toBe(9);
    const owners = seeded.json().semanticOwners as string[];
    expect(owners.every((id) => id.startsWith('component:y:'))).toBe(true);

    const owner = owners[0]!;
    const explain = await app.inject({
      method: 'POST',
      url: `/models/${modelId}/explain`,
      payload: { targetId: owner },
    });
    expect(explain.statusCode).toBe(200);
    expect(explain.json().source).toBe('live-d01');
    expect(explain.json().explain.whyExists.length).toBeGreaterThan(0);

    const upstream = await app.inject({
      method: 'POST',
      url: `/models/${modelId}/upstream`,
      payload: { objectId: owner, radius: 2 },
    });
    expect(upstream.statusCode).toBe(200);
    expect(upstream.json().ids).toContain('pattern:d01:y-network');

    const substrate = await app.inject({
      method: 'GET',
      url: `/models/${modelId}/substrate`,
    });
    expect(substrate.statusCode).toBe(200);
    expect(
      substrate.json().meshes.some((m: { semanticOwner: string }) => m.semanticOwner === owner),
    ).toBe(true);
  });
});
