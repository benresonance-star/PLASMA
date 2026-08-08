import { describe, expect, it } from 'vitest';
import { createSemanticDimension, resolveDimension } from './index.js';

describe('dimension-core', () => {
  it('resolves only when both selectors are known', () => {
    const dim = createSemanticDimension({
      id: 'd1',
      kind: 'linear',
      value: 10,
      unit: 'mm',
      anchorSelectorA: 'sel:a',
      anchorSelectorB: 'sel:b',
    });
    expect(resolveDimension(dim, new Set(['sel:a', 'sel:b'])).ok).toBe(true);
    expect(resolveDimension(dim, new Set(['sel:a'])).ok).toBe(false);
  });
});
