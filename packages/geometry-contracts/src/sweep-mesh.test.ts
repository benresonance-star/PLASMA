import { describe, expect, it } from 'vitest';
import { buildOrientedSweepMesh } from './sweep-mesh.js';

describe('oriented sweep mesh', () => {
  it('builds a rectangular prism aligned to a diagonal path', () => {
    const mesh = buildOrientedSweepMesh({
      path: [
        [0, 0, 0],
        [100, 100, 0],
      ],
      profileWidthMm: 20,
      profileDepthMm: 10,
      profileUp: [0, 0, 1],
    });

    expect(mesh.vertices).toHaveLength(8);
    expect(mesh.indices).toHaveLength(36);
    expect(mesh.sections[0]?.lengthMm).toBeCloseTo(Math.sqrt(20000), 8);
    expect(mesh.extentsMm.min[2]).toBeCloseTo(-5, 8);
    expect(mesh.extentsMm.max[2]).toBeCloseTo(5, 8);

    const { min } = mesh.extentsMm;
    expect(
      mesh.vertices.some(
        (vertex) =>
          vertex[0] === min[0] && vertex[1] === min[1] && vertex[2] === min[2],
      ),
    ).toBe(false);
  });

  it('uses a deterministic fallback when profileUp is parallel to the path', () => {
    expect(() =>
      buildOrientedSweepMesh({
        path: [
          [0, 0, 0],
          [0, 0, 100],
        ],
        profileWidthMm: 20,
        profileDepthMm: 10,
        profileUp: [0, 0, 1],
      }),
    ).not.toThrow();
  });
});
