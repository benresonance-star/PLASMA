import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOLERANCE_POLICY,
  TOLERANCE_POLICY_VERSION,
  assertNamedTolerance,
} from './tolerance.js';

describe('tolerance policy', () => {
  it('exposes a versioned default policy', () => {
    expect(DEFAULT_TOLERANCE_POLICY.version).toBe(TOLERANCE_POLICY_VERSION);
    expect(DEFAULT_TOLERANCE_POLICY.modellingLengthMm).toBeGreaterThan(0);
    expect(DEFAULT_TOLERANCE_POLICY.familyClusteringLengthMm).toBeGreaterThan(
      DEFAULT_TOLERANCE_POLICY.modellingLengthMm,
    );
  });

  it('accepts the default policy', () => {
    expect(() => assertNamedTolerance(DEFAULT_TOLERANCE_POLICY)).not.toThrow();
  });

  it('rejects negative tolerances', () => {
    expect(() =>
      assertNamedTolerance({
        ...DEFAULT_TOLERANCE_POLICY,
        coincidenceMm: -1,
      }),
    ).toThrow(/coincidenceMm/);
  });
});
