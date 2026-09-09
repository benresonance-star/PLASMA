import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SD12_BUDGETS, regressionExceeded } from './sd12-scale-bench.js';

describe('SD12 regression helper', () => {
  it('flags >20% regressions and ignores non-positive baselines', () => {
    expect(regressionExceeded(13, 10)).toBe(true);
    expect(regressionExceeded(12, 10)).toBe(false);
    expect(regressionExceeded(100, 0)).toBe(false);
  });

  it('budget table matches plan SD12 thresholds', () => {
    expect(SD12_BUDGETS[1000]).toEqual({ projectMs: 20, layoutMs: 50, highlightMs: 50 });
    expect(SD12_BUDGETS[10_000]).toEqual({ projectMs: 50, layoutMs: 150, highlightMs: 100 });
    expect(SD12_BUDGETS[100_000]).toEqual({ projectMs: 100, layoutMs: 300, highlightMs: 150 });
    expect(SD12_BUDGETS.cacheHitMs).toBe(2);
    expect(SD12_BUDGETS.maxProjectedNodes).toBe(500);
  });

  it('PR and nightly workflows are present', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const pr = readFileSync(
      path.join(root, '.github/workflows/graph-projection-bench.yml'),
      'utf8',
    );
    const nightly = readFileSync(
      path.join(root, '.github/workflows/graph-projection-bench-nightly.yml'),
      'utf8',
    );
    expect(pr).toContain('test:scale:pr');
    expect(pr).toContain('timeout-minutes: 10');
    expect(nightly).toContain('test:scale:nightly');
    expect(nightly).toContain('schedule:');
  });
});
