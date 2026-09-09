import { describe, expect, it } from 'vitest';

/**
 * Documents the causal-lens layout contract: user placements are keyed by
 * semantic id and must win over projection positionHints on selection sync.
 */
function mergePositions(
  incoming: readonly { semanticId: string; x: number; y: number }[],
  user: ReadonlyMap<string, { x: number; y: number }>,
): readonly { semanticId: string; x: number; y: number }[] {
  return incoming.map((n) => {
    const preserved = user.get(n.semanticId);
    return preserved ? { ...n, ...preserved } : n;
  });
}

describe('causal lens layout persistence', () => {
  it('keeps user placements when selection changes', () => {
    const user = new Map([['component:y:0001', { x: 900, y: 40 }]]);
    const next = mergePositions(
      [
        { semanticId: 'component:y:0000', x: 560, y: 0 },
        { semanticId: 'component:y:0001', x: 560, y: 96 },
      ],
      user,
    );
    expect(next.find((n) => n.semanticId === 'component:y:0001')).toEqual({
      semanticId: 'component:y:0001',
      x: 900,
      y: 40,
    });
    expect(next.find((n) => n.semanticId === 'component:y:0000')?.y).toBe(0);
  });

  it('clears placements on layout reset', () => {
    const user = new Map([['component:y:0001', { x: 900, y: 40 }]]);
    user.clear();
    const next = mergePositions(
      [{ semanticId: 'component:y:0001', x: 560, y: 96 }],
      user,
    );
    expect(next[0]).toEqual({ semanticId: 'component:y:0001', x: 560, y: 96 });
  });
});
