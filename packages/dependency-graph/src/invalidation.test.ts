import { describe, expect, it } from 'vitest';
import { computeInvalidationSet, planRecompilation } from './invalidation.js';

describe('dependency invalidation', () => {
  it('returns downstream closure only', () => {
    const set = computeInvalidationSet(
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'x', to: 'y' },
      ],
      ['a'],
    );
    expect(set).toEqual(['a', 'b', 'c']);
    expect(set).not.toContain('y');
  });

  it('builds a job plan from bindings', () => {
    const plan = planRecompilation(
      ['cell:1', 'orphan'],
      new Map([['cell:1', 'topology.goldberg.mock@1.0.0']]),
    );
    expect(plan.operatorKeys).toEqual(['topology.goldberg.mock@1.0.0']);
    expect(plan.staleRepresentationIds).toContain('repr:cell:1');
  });
});
