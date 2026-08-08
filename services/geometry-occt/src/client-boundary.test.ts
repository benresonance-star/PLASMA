import { describe, expect, it } from 'vitest';
import { GeometryClient } from '@spds/geometry-client';
import { buildGeometryServer } from './server.js';

describe('E7 geometry-client ↔ geometry service boundary', () => {
  it('sweeps and tessellates through HTTP inject without Docker', async () => {
    const { app } = buildGeometryServer();
    const client = new GeometryClient({
      baseUrl: 'http://geometry.local',
      fetchImpl: async (url, init) => {
        const path = String(url).replace('http://geometry.local', '');
        const res = await app.inject({
          method: (init?.method as 'GET' | 'POST') ?? 'GET',
          url: path,
          headers: { 'content-type': 'application/json' },
          payload: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(res.body, {
          status: res.statusCode,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const health = await client.health();
    expect(health.status).toBe('ok');
    expect(health.kernel).toBe('exact-adapter');

    const rep = await client.sweep({
      semanticOwner: 'y:boundary',
      pirOperationId: 'pir:boundary:1',
      path: [
        [0, 0, 0],
        [200, 0, 0],
      ],
      profileWidthMm: 40,
      profileDepthMm: 40,
    });
    expect(rep.mass.volumeMm3).toBeGreaterThan(0);
    expect(rep.kernel).toBe('exact-adapter');

    const mesh = await client.tessellate({
      representationId: rep.id,
      chordDeviationMm: 0.5,
      angleDeviationDeg: 15,
    });
    expect(mesh.vertices.length).toBeGreaterThanOrEqual(8);
    expect(mesh.indices.length).toBeGreaterThanOrEqual(36);
  });
});
