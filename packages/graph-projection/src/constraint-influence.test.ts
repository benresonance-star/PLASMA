import { describe, expect, it } from 'vitest';
import {
  allConstraintTintTokens,
  buildConstraintTintPass,
  constraintTintToken,
  resolveConstraintOwners,
} from './constraint-influence.js';

describe('E2 constraint influence', () => {
  it('resolves ≥1 owner and four distinct tint tokens', () => {
    const resolution = resolveConstraintOwners({
      constraintId: 'constraint:d01.max-member-length',
      dependencyEdges: [
        {
          from: 'constraint:d01.max-member-length',
          to: 'component:y:0000',
          relationType: 'limits',
        },
      ],
      explicitTargetIds: ['component:y:0001'],
    });
    expect(resolution.ownerIds.length).toBeGreaterThanOrEqual(1);
    expect(resolution.ownerIds).toContain('component:y:0000');

    const t0 = performance.now();
    resolveConstraintOwners({
      constraintId: 'constraint:x',
      dependencyEdges: Array.from({ length: 200 }, (_, i) => ({
        from: 'constraint:x',
        to: `component:y:${i}`,
      })),
    });
    expect(performance.now() - t0).toBeLessThan(5);

    const tokens = allConstraintTintTokens();
    expect(tokens).toHaveLength(4);
    expect(new Set(tokens.map((t) => t.colour)).size).toBe(4);
    expect(new Set(tokens.map((t) => t.glyph)).size).toBe(4);
    expect(constraintTintToken('violating').glyph).toBeTruthy();

    const pass = buildConstraintTintPass(
      resolveConstraintOwners({
        constraintId: 'constraint:demo',
        dependencyEdges: [],
        explicitTargetIds: ['a', 'b', 'c', 'd'],
        ratiosByOwner: { a: 0.2, b: 0.85, c: 0.99, d: 1.2 },
      }),
    );
    expect(pass.map((p) => p.status).sort()).toEqual([
      'approaching',
      'at_limit',
      'safe',
      'violating',
    ].sort());

    const tintT0 = performance.now();
    const owners = Array.from({ length: 100 }, (_, i) => `component:y:${i}`);
    buildConstraintTintPass(
      resolveConstraintOwners({
        constraintId: 'constraint:scale',
        dependencyEdges: [],
        explicitTargetIds: owners,
      }),
    );
    expect(performance.now() - tintT0).toBeLessThan(20);

    const k1 = performance.now();
    buildConstraintTintPass(
      resolveConstraintOwners({
        constraintId: 'constraint:1k',
        dependencyEdges: [],
        explicitTargetIds: Array.from({ length: 1000 }, (_, i) => `id:${i}`),
      }),
    );
    expect(performance.now() - k1).toBeLessThan(100);
  });
});
