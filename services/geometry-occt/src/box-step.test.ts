import { describe, expect, it } from 'vitest';
import { compileOpToBoxStep } from './box-step.js';

describe('compileOpToBoxStep', () => {
  it('emits stable content-addressed STEP for a sweep op', () => {
    const op = {
      op: 'geometry.sweep@1.0.0' as const,
      semanticOwner: 'component:y:0000',
      pirOperationId: 'pir:y-brep:component:y:0000',
      path: [
        [0, 0, 0],
        [1000, 0, 0],
      ] as [number, number, number][],
      profileWidthMm: 60,
      profileDepthMm: 180,
    };
    const a = compileOpToBoxStep(op);
    const b = compileOpToBoxStep(op);
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.stepText).toContain('ISO-10303-21');
    expect(a.stepText).toContain('CARTESIAN_POINT');
    expect(a.contentHash).toHaveLength(64);
  });
});
