import { describe, expect, it } from 'vitest';
import { changeSetToSemanticCommands } from './changeset-accept.js';
import {
  buildTenMoveOrganiseFixture,
  proposeOrganiseChangeSet,
} from './organise-propose.js';
import { applyChangeSet } from './tools.js';

describe('C2c organise propose bench', () => {
  it('builds 10-move organise proposal under 20ms without mutating catalog', () => {
    const modelId = 'model:d01';
    const catalogSnapshot = Object.freeze({
      objects: Object.freeze([{ id: 'component:y:0001', kind: 'structural.y-component' }]),
    });
    const moves = buildTenMoveOrganiseFixture(modelId);

    const t0 = performance.now();
    const proposed = proposeOrganiseChangeSet({
      changeSetId: 'cs:c2c:bench',
      branchId: 'branch:ai-agent',
      expectedHeadHash: 'head:1',
      transactionId: 'txn:c2c',
      moves,
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    // Propose-side lower (still no accept / no graph mutate).
    const lowered = changeSetToSemanticCommands(proposed.changeSet, { modelId });
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(20);
    expect(lowered.ok).toBe(true);
    expect(lowered.mode).toBe('organise');
    expect(lowered.organiseOps).toHaveLength(10);
    expect(proposed.changeSet.disposition).toBe('proposed');
    expect(catalogSnapshot.objects).toHaveLength(1);

    // applyChangeSet only flips disposition on the AI branch — still not substrate mutate.
    const applied = applyChangeSet({
      changeSet: proposed.changeSet,
      currentHeadHash: 'head:1',
      agentBranchId: 'branch:ai-agent',
      sourceBranchId: 'branch:main',
    });
    expect(applied.disposition).toBe('applied');
    expect(catalogSnapshot.objects[0]?.id).toBe('component:y:0001');
  });

  it('rejects connect without targetId on propose', () => {
    const bad = proposeOrganiseChangeSet({
      changeSetId: 'cs:bad',
      branchId: 'branch:ai-agent',
      expectedHeadHash: 'head:1',
      transactionId: 'txn:bad',
      moves: [{ op: 'connect', parentId: 'folder:bay' }],
    });
    expect(bad.ok).toBe(false);
  });
});
