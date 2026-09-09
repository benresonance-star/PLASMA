import { describe, expect, it } from 'vitest';
import { buildExtrusionMesh } from './extrusion-mesh.js';

describe('planar extrusion mesh', () => {
  it('extrudes a rectangular profile with exact mass properties', () => {
    const mesh = buildExtrusionMesh({
      profile: [
        [0, 0, 0],
        [800, 0, 0],
        [800, 600, 0],
        [0, 600, 0],
      ],
      vector: [0, 0, 4],
    });
    expect(mesh.vertices).toHaveLength(8);
    expect(mesh.indices).toHaveLength(36);
    expect(mesh.volumeMm3).toBe(800 * 600 * 4);
    expect(mesh.centerOfMassMm[0]).toBeCloseTo(400, 8);
    expect(mesh.centerOfMassMm[1]).toBeCloseTo(300, 8);
    expect(mesh.centerOfMassMm[2]).toBeCloseTo(2, 8);
    expect(mesh.extentsMm).toEqual({
      min: [0, 0, 0],
      max: [800, 600, 4],
    });
  });

  it('triangulates a concave planar profile deterministically', () => {
    const mesh = buildExtrusionMesh({
      profile: [
        [0, 0, 0],
        [100, 0, 0],
        [100, 40, 0],
        [40, 40, 0],
        [40, 100, 0],
        [0, 100, 0],
      ],
      vector: [0, 0, 10],
    });
    expect(mesh.indices).toHaveLength(60);
    expect(mesh.volumeMm3).toBe(64000);
  });

  it('rejects vectors that remain in the profile plane', () => {
    expect(() =>
      buildExtrusionMesh({
        profile: [
          [0, 0, 0],
          [100, 0, 0],
          [0, 100, 0],
        ],
        vector: [10, 0, 0],
      }),
    ).toThrow(/leave the profile plane/);
  });
});
