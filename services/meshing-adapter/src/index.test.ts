import { describe, expect, it } from 'vitest';
import { meshHashStable, runMeshJob } from './index.js';

describe('G10A meshing-adapter', () => {
  const base = {
    requestId: 'req:1',
    geometryArtifactHash: 'geo:abc',
    settings: {
      elementSizeMm: 5,
      algorithm: 'mock' as const,
      determinismClass: 'D1' as const,
    },
    physicalGroups: [
      { name: 'steel', semanticIds: ['Y:1', 'Y:2'], role: 'material' as const },
      { name: 'fixed', semanticIds: ['support:1'], role: 'support' as const },
    ],
    timeoutMs: 30_000,
    resourceBudgetMb: 512,
  };

  it('produces deterministic mesh hash with semantic groups', () => {
    const hash = meshHashStable(base);
    expect(hash).toHaveLength(64);
    const result = runMeshJob(base);
    expect(result.status).toBe('succeeded');
    expect(result.artifact?.groupMapping.steel).toEqual(['Y:1', 'Y:2']);
    expect(result.artifact?.labelPolicy).toBe('computational-indicative');
  });

  it('honours cancel and stale rejection', () => {
    expect(runMeshJob({ ...base, cancelToken: { cancelled: true } }).status).toBe('cancelled');
    expect(
      runMeshJob({ ...base, expectedHeadHash: 'old' }, 'new').failureCode,
    ).toBe('STALE_RESULT');
  });
});
