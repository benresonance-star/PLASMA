import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '@spds/semantic-core';
import { buildServer } from './server.js';

describe('G2 API CRUD + history', () => {
  it('supports model create, object upsert, snapshot, branch', async () => {
    const { app } = buildServer();
    const created = await app.inject({
      method: 'POST',
      url: '/models',
      payload: { name: 'D01' },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as {
      model: { modelId: string };
      branchId: string;
      headHash: string;
    };

    const now = '2026-08-08T00:00:00.000Z';
    const upsert = await app.inject({
      method: 'POST',
      url: `/models/${body.model.modelId}/branches/${body.branchId}/objects`,
      payload: {
        expectedHeadHash: body.headHash,
        object: {
          id: 'param:api:diameter',
          kind: 'Parameter',
          semanticType: 'geometry.length',
          name: 'Diameter',
          createdAt: now,
          updatedAt: now,
          schemaVersion: CURRENT_SCHEMA_VERSION,
        },
      },
    });
    expect(upsert.statusCode).toBe(201);

    const snap = await app.inject({
      method: 'POST',
      url: `/models/${body.model.modelId}/branches/${body.branchId}/snapshots`,
      payload: { name: 'checkpoint' },
    });
    expect(snap.statusCode).toBe(201);

    const branch = await app.inject({
      method: 'POST',
      url: `/models/${body.model.modelId}/branches`,
      payload: { name: 'experiment', fromBranchId: body.branchId },
    });
    expect(branch.statusCode).toBe(201);
  });
});
