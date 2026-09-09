import { describe, expect, it } from 'vitest';
import {
  SD12_BUDGETS,
  assertScaleBudgets,
  assertSyntheticConnectivity,
  buildScaleGraph,
  runScaleBench,
} from './sd12-scale-bench.js';

describe('G1a/G1b SD12 PR scale benches (1k / 10k)', () => {
  it('suite startup + 1k size/connectivity ≤2s excluding 100k', () => {
    const t0 = performance.now();
    const bundle = buildScaleGraph(1000);
    assertSyntheticConnectivity(1000, bundle);
    expect(bundle.objectCount).toBe(1000);
    expect(bundle.edgeCount).toBe(999);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('1k projection/layout/highlight within SD12 budgets', () => {
    const timings = runScaleBench(1000);
    expect(timings.projectedNodes).toBeLessThanOrEqual(SD12_BUDGETS.maxProjectedNodes);
    assertScaleBudgets(timings);
  });

  it('10k size/connectivity + budgets', () => {
    const bundle = buildScaleGraph(10_000);
    assertSyntheticConnectivity(10_000, bundle);
    expect(bundle.objectCount).toBe(10_000);

    const timings = runScaleBench(10_000);
    expect(timings.projectedNodes).toBeLessThanOrEqual(SD12_BUDGETS.maxProjectedNodes);
    assertScaleBudgets(timings);
  });
});
