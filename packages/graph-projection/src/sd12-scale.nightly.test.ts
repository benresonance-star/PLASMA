import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SD12_BUDGETS,
  assertScaleBudgets,
  measureCacheHitMs,
  regressionExceeded,
  runScaleBench,
} from './sd12-scale-bench.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(here, '../bench-baselines/sd12.json');

type BaselineFile = {
  readonly observed: {
    readonly '1000': { readonly projectMs: number; readonly layoutMs: number; readonly highlightMs: number };
    readonly '10000': { readonly projectMs: number; readonly layoutMs: number; readonly highlightMs: number };
    readonly '100000': { readonly projectMs: number; readonly layoutMs: number; readonly highlightMs: number };
    readonly cacheHitMs: number;
  };
};

function loadBaseline(): BaselineFile {
  return JSON.parse(readFileSync(baselinePath, 'utf8')) as BaselineFile;
}

describe('G1c SD12 nightly scale benches (100k + cache + regression)', () => {
  it(
    '100k ≤500 projected and within budgets',
    () => {
      const timings = runScaleBench(100_000);
      expect(timings.objectCount).toBe(100_000);
      expect(timings.projectedNodes).toBeLessThanOrEqual(SD12_BUDGETS.maxProjectedNodes);
      assertScaleBudgets(timings);

      const baseline = loadBaseline().observed['100000'];
      expect(regressionExceeded(timings.projectMs, baseline.projectMs)).toBe(false);
      expect(regressionExceeded(timings.layoutMs, baseline.layoutMs)).toBe(false);
      expect(regressionExceeded(timings.highlightMs, baseline.highlightMs)).toBe(false);
    },
    120_000,
  );

  it('cache hit average < 2ms', () => {
    const hitMs = measureCacheHitMs(100);
    expect(hitMs).toBeLessThan(SD12_BUDGETS.cacheHitMs);
    const baseline = loadBaseline().observed.cacheHitMs;
    expect(regressionExceeded(hitMs, baseline)).toBe(false);
  });

  it('1k/10k stay within 20% of observed baseline', () => {
    const baseline = loadBaseline().observed;
    for (const size of [1000, 10_000] as const) {
      const timings = runScaleBench(size);
      assertScaleBudgets(timings);
      const obs = baseline[String(size) as '1000' | '10000'];
      expect(regressionExceeded(timings.projectMs, obs.projectMs)).toBe(false);
      expect(regressionExceeded(timings.layoutMs, obs.layoutMs)).toBe(false);
      expect(regressionExceeded(timings.highlightMs, obs.highlightMs)).toBe(false);
    }
  });
});
