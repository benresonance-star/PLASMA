import { describe, expect, it } from 'vitest';

/**
 * Schema canvas layout contract: user placements are keyed by semantic id and
 * must win over projection defaults on selection / catalog rebind.
 */
function mergeSchemaPositions(
  incoming: readonly { semanticId: string; x: number; y: number }[],
  user: ReadonlyMap<string, { x: number; y: number }>,
): readonly { semanticId: string; x: number; y: number }[] {
  return incoming.map((n) => {
    const preserved = user.get(n.semanticId);
    return preserved ? { ...n, ...preserved } : n;
  });
}

describe('schema canvas layout persistence', () => {
  it('keeps user placements when selection changes', () => {
    const user = new Map([['param:d01:length', { x: 900, y: 40 }]]);
    const next = mergeSchemaPositions(
      [
        { semanticId: 'param:d01:armWidth', x: 560, y: 0 },
        { semanticId: 'param:d01:length', x: 560, y: 96 },
      ],
      user,
    );
    expect(next.find((n) => n.semanticId === 'param:d01:length')).toEqual({
      semanticId: 'param:d01:length',
      x: 900,
      y: 40,
    });
    expect(next.find((n) => n.semanticId === 'param:d01:armWidth')?.y).toBe(0);
  });

  it('clears placements on layout reset', () => {
    const user = new Map([['param:d01:length', { x: 900, y: 40 }]]);
    user.clear();
    const next = mergeSchemaPositions(
      [{ semanticId: 'param:d01:length', x: 560, y: 96 }],
      user,
    );
    expect(next[0]).toEqual({ semanticId: 'param:d01:length', x: 560, y: 96 });
  });
});
