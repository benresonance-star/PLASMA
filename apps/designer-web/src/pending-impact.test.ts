import { describe, expect, it } from 'vitest';
import { PARAM_D01_LENGTH_ID } from '@spds/ai-interface';
import { projectCausalNeighbourhood } from '@spds/graph-projection';
import { IndexedSemanticGraph } from '@spds/semantic-query';
import type { PendingAiChangeSet } from './app-session.js';
import { biaStripFromPending, impactViewFromPending } from './pending-impact.js';

const pending: PendingAiChangeSet = {
  changeSetId: 'cs:impact:1',
  branchId: 'branch:ai',
  expectedHeadHash: 'hash:1',
  transactionId: 'txn:1',
  actor: 'ai',
  disposition: 'proposed',
  commands: [
    { op: 'update', targetId: PARAM_D01_LENGTH_ID, payload: { lengthMm: 2100 } },
  ],
};

describe('pending-impact', () => {
  it('computes downstream from fixture edges', () => {
    const edges = [
      { from: PARAM_D01_LENGTH_ID, to: 'component:y:0000', relationType: 'drives' },
      { from: 'component:y:0000', to: 'part:y:0000', relationType: 'generates' },
    ];
    const t0 = performance.now();
    const impact = impactViewFromPending(pending, edges);
    expect(performance.now() - t0).toBeLessThan(20);
    expect(impact?.directIds).toContain(PARAM_D01_LENGTH_ID);
    expect(impact?.downstreamIds).toContain('component:y:0000');
  });

  it('partitions BIA for update into Intervention', () => {
    const graph = new IndexedSemanticGraph([
      { id: PARAM_D01_LENGTH_ID, semanticType: 'parameter.number' },
      { id: 'component:y:0000', semanticType: 'structural.y-component' },
    ]);
    const base = projectCausalNeighbourhood({
      graph,
      dependencyEdges: [
        { from: PARAM_D01_LENGTH_ID, to: 'component:y:0000', relationType: 'drives' },
      ],
      focusObjectIds: [PARAM_D01_LENGTH_ID],
      radius: 2,
    });
    const bia = biaStripFromPending(pending, base);
    expect(bia.intervention.some((s) => s.includes(PARAM_D01_LENGTH_ID))).toBe(true);
  });
});
