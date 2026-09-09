import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '@spds/semantic-core';
import { migrate } from './migrate.js';
import { PostgresVersionStore } from './postgres-version-store.js';

const url = process.env.DATABASE_URL;

describe.runIf(Boolean(url))('W1.1 PostgresVersionStore', () => {
  it('create -> mutate -> snapshot -> branch -> restore -> replay', async () => {
    await migrate(url!);
    const store = new PostgresVersionStore(url!);
    try {
      const model = await store.createModel('D01-pg');
      const main = store.getMainBranchId(model.modelId);
      let head = (await store.getBranchHead(main)).headHash;
      const actor = { type: 'user' as const, id: 'tester' };

      const e1 = await store.upsertObject(main, actor, head, {
        id: 'param:d01.diameter',
        kind: 'Parameter',
        name: 'Diameter',
        quantity: { value: 20000, unit: 'mm' },
        schemaVersion: CURRENT_SCHEMA_VERSION,
      });
      head = e1.afterHash;
      const snapA = await store.snapshot(main, 'v1');
      expect(snapA.stateHash).toBe(head);

      const experiment = await store.createBranch(model.modelId, `exp-${Date.now()}`, main);
      let expHead = experiment.headHash;
      const e2 = await store.upsertObject(experiment.branchId, actor, expHead, {
        id: 'param:d01.diameter',
        kind: 'Parameter',
        name: 'Diameter',
        quantity: { value: 22000, unit: 'mm' },
        schemaVersion: CURRENT_SCHEMA_VERSION,
      });
      expHead = e2.afterHash;
      await store.snapshot(experiment.branchId, 'v2');

      await store.restoreToNewHead(experiment.branchId, snapA.snapshotId, actor);
      expect(await store.getObject(experiment.branchId, 'param:d01.diameter')).toMatchObject({
        quantity: { value: 20000, unit: 'mm' },
      });

      const replay = await store.replay(experiment.branchId);
      expect(replay.stateHash).toBe((await store.getBranchHead(experiment.branchId)).headHash);

      await expect(
        store.upsertObject(main, actor, 'stale', {
          id: 'x',
          kind: 'Parameter',
          name: 'X',
          schemaVersion: CURRENT_SCHEMA_VERSION,
        }),
      ).rejects.toThrow(/HEAD_CONFLICT/);
    } finally {
      await store.close();
    }
  }, 30_000);
});
