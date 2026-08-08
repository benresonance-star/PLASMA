import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from './memory-store.js';

describe('G2 version store gate', () => {
  it('create -> mutate -> snapshot -> branch -> mutate -> restore -> replay hashes', () => {
    const store = new InMemoryVersionStore();
    const model = store.createModel('D01');
    const main = store.getMainBranchId(model.modelId);
    let head = store.getBranchHead(main).headHash;
    const actor = { type: 'user' as const, id: 'tester' };

    const e1 = store.upsertObject(main, actor, head, {
      id: 'param:d01.diameter',
      kind: 'Parameter',
      name: 'Diameter',
      quantity: { value: 20000, unit: 'mm' },
    });
    head = e1.afterHash;

    const snapA = store.snapshot(main, 'v1');
    expect(snapA.stateHash).toBe(head);

    const experiment = store.createBranch(model.modelId, 'experiment-A', main);
    let expHead = experiment.headHash;

    const e2 = store.upsertObject(experiment.branchId, actor, expHead, {
      id: 'param:d01.diameter',
      kind: 'Parameter',
      name: 'Diameter',
      quantity: { value: 22000, unit: 'mm' },
    });
    expHead = e2.afterHash;

    const e3 = store.upsertObject(experiment.branchId, actor, expHead, {
      id: 'param:d01.rise',
      kind: 'Parameter',
      name: 'Rise',
      quantity: { value: 6500, unit: 'mm' },
    });
    expHead = e3.afterHash;
    const snapB = store.snapshot(experiment.branchId, 'v2');

    // Main unchanged
    expect(store.getObject(main, 'param:d01.diameter')).toMatchObject({
      quantity: { value: 20000, unit: 'mm' },
    });

    // Restore experiment to snapA state (non-destructive new head)
    const restored = store.restoreToNewHead(experiment.branchId, snapA.snapshotId, actor);
    expect(restored.command).toBe('RESTORE');
    expect(store.getObject(experiment.branchId, 'param:d01.diameter')).toMatchObject({
      quantity: { value: 20000, unit: 'mm' },
    });
    expect(store.getObject(experiment.branchId, 'param:d01.rise')).toBeUndefined();

    const replay = store.replay(experiment.branchId);
    expect(replay.stateHash).toBe(store.getBranchHead(experiment.branchId).headHash);

    const diff = store.compareSnapshots(snapA.snapshotId, snapB.snapshotId, experiment.branchId);
    expect(diff.addedIds).toContain('param:d01.rise');
    expect(diff.changedIds).toContain('param:d01.diameter');
  });

  it('rejects stale expected head', () => {
    const store = new InMemoryVersionStore();
    const model = store.createModel('X');
    const main = store.getMainBranchId(model.modelId);
    const head = store.getBranchHead(main).headHash;
    const actor = { type: 'ai' as const, id: 'agent-1' };
    store.upsertObject(main, actor, head, { id: 'entity:a:1', kind: 'Entity', name: 'A' });
    expect(() =>
      store.upsertObject(main, actor, head, { id: 'entity:b:1', kind: 'Entity', name: 'B' }),
    ).toThrow(/HEAD_CONFLICT/);
  });
});
