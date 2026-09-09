import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from '@spds/version-core';
import { buildServer } from './server.js';

describe('W7.2 product smoke harness', () => {
  it('bootstrap → edit → Exact meshes → snapshot → restore branch', async () => {
    const store = new InMemoryVersionStore();
    const { app } = buildServer(store);

    const created = await app.inject({
      method: 'POST',
      url: '/models',
      payload: { name: 'D01-smoke' },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as {
      model: { modelId: string };
      branchId: string;
      headHash: string;
    };

    const meshes = await app.inject({
      method: 'POST',
      url: '/references/d01/display-meshes',
      payload: { yLimit: 2, lengthMmOverride: 2300 },
    });
    expect(meshes.statusCode).toBe(201);
    const meshBody = meshes.json() as { pipelineHash: string; meshes: unknown[] };
    expect(meshBody.pipelineHash).toBeTruthy();
    expect(meshBody.meshes.length).toBeGreaterThan(0);

    const head0 = store.getBranchHead(body.branchId).headHash;
    const upsert = await app.inject({
      method: 'POST',
      url: `/models/${body.model.modelId}/branches/${body.branchId}/objects`,
      payload: {
        expectedHeadHash: head0,
        object: {
          id: 'param:d01:length',
          kind: 'Parameter',
          semanticType: 'geometry.length',
          name: 'Y length',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          schemaVersion: '1.0.0',
          quantity: { value: 2600, unit: 'mm' },
        },
      },
    });
    expect(upsert.statusCode).toBe(201);

    const snap = await app.inject({
      method: 'POST',
      url: `/models/${body.model.modelId}/branches/${body.branchId}/snapshots`,
      payload: { name: 'after-exact' },
    });
    expect(snap.statusCode).toBe(201);
    const snapId = (snap.json() as { snapshot: { snapshotId: string } }).snapshot.snapshotId;

    const head1 = store.getBranchHead(body.branchId).headHash;
    await app.inject({
      method: 'POST',
      url: `/models/${body.model.modelId}/branches/${body.branchId}/objects`,
      payload: {
        expectedHeadHash: head1,
        object: {
          id: 'param:d01:length',
          kind: 'Parameter',
          semanticType: 'geometry.length',
          name: 'Y length',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          schemaVersion: '1.0.0',
          quantity: { value: 3000, unit: 'mm' },
        },
      },
    });
    const headAfterEdit = store.getBranchHead(body.branchId).headHash;

    const fork = await app.inject({
      method: 'POST',
      url: `/models/${body.model.modelId}/branches`,
      payload: { name: `restore-${Date.now()}`, fromBranchId: body.branchId },
    });
    expect(fork.statusCode).toBe(201);
    const forkId = (fork.json() as { branch: { branchId: string } }).branch.branchId;

    const restored = await app.inject({
      method: 'POST',
      url: `/models/${body.model.modelId}/branches/${forkId}/restore`,
      payload: { snapshotId: snapId },
    });
    expect(restored.statusCode).toBe(200);
    expect(store.getBranchHead(body.branchId).headHash).toBe(headAfterEdit);
    expect(store.getObject(forkId, 'param:d01:length')?.['id']).toBe('param:d01:length');
    expect(store.listEvents(forkId).some((e) => e.command === 'RESTORE')).toBe(true);
  }, 60_000);
});
