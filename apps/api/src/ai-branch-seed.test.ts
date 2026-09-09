import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from '@spds/version-core';
import {
  COMPOSITION_D01_ID,
  PARAM_D01_LENGTH_ID,
  seedD01BranchObjects,
} from './ai-branch-seed.js';
import { ensureAiBranchContext } from './ai-changeset-accept.js';

describe('T0 D01 AI branch seed', () => {
  it('seeds composition + param:d01:length on main; AI branch inherits non-empty objects', async () => {
    const store = new InMemoryVersionStore();
    const t0 = performance.now();
    const ctx = await ensureAiBranchContext(store);
    expect(performance.now() - t0).toBeLessThan(200);

    const mainObjects = store.listObjects(ctx.mainBranchId);
    const aiObjects = store.listObjects(ctx.aiBranchId);
    expect(mainObjects.length).toBeGreaterThan(0);
    expect(aiObjects.length).toBe(mainObjects.length);
    expect(store.getObject(ctx.aiBranchId, PARAM_D01_LENGTH_ID)).toMatchObject({
      id: PARAM_D01_LENGTH_ID,
      value: 2300,
      quantity: { value: 2300, unit: 'mm' },
    });
    expect(store.getObject(ctx.aiBranchId, COMPOSITION_D01_ID)).toMatchObject({
      id: COMPOSITION_D01_ID,
      publishedBaseId: 'pattern:goldberg-cellular-topology@1.0.0',
    });
  });

  it('seed is idempotent on a branch', async () => {
    const store = new InMemoryVersionStore();
    const model = store.createModel('seed');
    const main = store.getMainBranchId(model.modelId);
    const a = await seedD01BranchObjects(store, main);
    const b = await seedD01BranchObjects(store, main);
    expect(a.objectCount).toBe(b.objectCount);
    expect(store.listObjects(main).length).toBe(a.objectCount);
  });
});
