import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

describe('G3B query/explain/trace API', () => {
  it('serves FILTER query and EXPLAIN lineage', async () => {
    const { app } = buildServer();
    const query = await app.inject({
      method: 'POST',
      url: '/models/model:fixture/query',
      payload: {
        op: 'FILTER',
        where: { semanticType: 'structural.y-component', adjacentToType: 'topology.cell' },
      },
    });
    expect(query.statusCode).toBe(200);
    expect(query.json().result.ids).toContain('component:y:0042');

    const explain = await app.inject({
      method: 'POST',
      url: '/models/model:fixture/explain',
      payload: { targetId: 'part:panel:0042', changedParameters: ['param:frequency'] },
    });
    expect(explain.statusCode).toBe(200);
    expect(explain.json().explain.invalidatesOn).toContain('part:panel:0042');

    const trace = await app.inject({
      method: 'POST',
      url: '/models/model:fixture/trace',
      payload: { semanticAnchor: 'part:panel:0042' },
    });
    expect(trace.statusCode).toBe(200);
    expect(trace.json().trace.length).toBeGreaterThan(0);
  });
});
