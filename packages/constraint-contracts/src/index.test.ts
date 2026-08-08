import { describe, expect, it } from 'vitest';
import {
  GEOMETRIC_CONSTRAINT_VOCABULARY,
  UnsupportedConstraintSolverAdapter,
} from './index.js';

describe('@spds/constraint-contracts', () => {
  it('exposes required vocabulary', () => {
    expect(GEOMETRIC_CONSTRAINT_VOCABULARY).toContain('coincident');
    expect(GEOMETRIC_CONSTRAINT_VOCABULARY).toContain('tangent');
  });

  it('default adapter reports unsupported without false solve claims', async () => {
    const adapter = new UnsupportedConstraintSolverAdapter();
    const result = await adapter.solve([
      { id: 'c1', kind: 'parallel', targetIds: ['edge:1', 'edge:2'] },
    ]);
    expect(result.state).toBe('unsupported');
    expect(result.unsupportedKinds).toEqual(['parallel']);
  });
});
