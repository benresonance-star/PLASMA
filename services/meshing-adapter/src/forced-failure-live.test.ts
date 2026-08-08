import { afterEach, describe, expect, it } from 'vitest';
import { runForcedFailureSuite } from '@spds/package-core';
import { runMeshJob } from './index.js';

describe('RC-06 / G14B.5 live forced-failure hooks', () => {
  afterEach(() => {
    delete process.env.SPDS_INJECT_FAILURE;
  });

  it('rejects injected worker failures with zero partial publication', () => {
    const contract = runForcedFailureSuite();
    expect(contract.zeroPartialPublication).toBe(true);

    for (const kind of ['timeout', 'crash', 'cancel', 'stale', 'partial'] as const) {
      process.env.SPDS_INJECT_FAILURE = kind;
      const job = runMeshJob({
        requestId: `ff:${kind}`,
        geometryArtifactHash: 'g:1',
        settings: { elementSizeMm: 20, algorithm: 'frontal', determinismClass: 'D1' },
        physicalGroups: [{ name: 'm', semanticIds: ['y:1'], role: 'material' }],
        timeoutMs: 10_000,
        resourceBudgetMb: 64,
      });
      expect(job.status).not.toBe('succeeded');
      expect(job.artifact).toBeUndefined();
    }
  });
});
