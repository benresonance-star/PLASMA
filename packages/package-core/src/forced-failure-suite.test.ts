import { describe, expect, it } from 'vitest';
import { runForcedFailureSuite } from './forced-failure-suite.js';

describe('G14B.5 forced failure suite', () => {
  it('rejects timeout/crash/cancel/stale/partial-publish with zero partial publication', () => {
    const result = runForcedFailureSuite();
    expect(result.outcomes.length).toBeGreaterThanOrEqual(7);
    expect(result.allRejected).toBe(true);
    expect(result.zeroPartialPublication).toBe(true);
    expect(result.outcomes.some((o) => o.retryable)).toBe(true);
    expect(result.outcomes.every((o) => o.diagnosticCode.length > 0)).toBe(true);
  });
});
