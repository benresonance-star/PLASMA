import { describe, expect, it } from 'vitest';
import { planIncrementalInvalidation } from './dag.js';
import { resolveG3aFixture, runG3aFixtureTwice } from './pipeline.js';

describe('G3A gate', () => {
  it('resolves patterns/overrides/variants into inspectable PIR and reproducible DAG', () => {
    const { first, second, cacheHitOnSecond } = runG3aFixtureTwice();
    expect(first.effectiveHash).toBe(second.effectiveHash);
    expect(first.pirHash).toBe(second.pirHash);
    expect(first.dagHash).toBe(second.dagHash);
    expect(first.variantSelection?.selectedVariantIds).toEqual(['variant:skin-etfe']);
    expect(first.dag.topoOrder[0]).toBe('pir:topology.goldberg');
    expect(first.dag.nodes.every((n) => n.cacheKey.length === 64)).toBe(true);
    expect(cacheHitOnSecond).toBe(true);

    const invalidated = planIncrementalInvalidation(first.dag, ['pir:topology.goldberg']);
    expect(invalidated).toContain('pir:topology.goldberg');
    expect(invalidated).toContain('pir:cells.bind');
  });

  it('keeps DAG inspectable for diagnostics', () => {
    const result = resolveG3aFixture();
    expect(result.dag.nodes.map((n) => n.id)).toEqual(result.dag.topoOrder);
    expect(result.dag.pirHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
