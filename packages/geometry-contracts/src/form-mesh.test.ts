import { describe, expect, it } from 'vitest';
import { buildLoftMesh, buildRevolveMesh } from './form-mesh.js';

describe('revolve and loft meshes', () => {
  it('revolves a closed radial profile into an annular solid', () => {
    const mesh = buildRevolveMesh({
      profile: [
        [20, 0, 0],
        [50, 0, 0],
        [50, 0, 100],
        [20, 0, 100],
      ],
      axisOrigin: [0, 0, 0],
      axisDirection: [0, 0, 1],
      angleDeg: 360,
      segments: 64,
    });
    expect(mesh.vertices).toHaveLength(256);
    const expectedVolume = Math.PI * (50 ** 2 - 20 ** 2) * 100;
    expect(Math.abs(mesh.volumeMm3 - expectedVolume) / expectedVolume).toBeLessThan(
      0.002,
    );
    expect(mesh.extentsMm.min[0]).toBeCloseTo(-50, 8);
    expect(mesh.extentsMm.max[1]).toBeCloseTo(50, 8);
  });

  it('caps partial revolutions as closed solids', () => {
    const mesh = buildRevolveMesh({
      profile: [
        [20, 0, 0],
        [50, 0, 0],
        [50, 0, 100],
        [20, 0, 100],
      ],
      axisOrigin: [0, 0, 0],
      axisDirection: [0, 0, 1],
      angleDeg: 180,
      segments: 32,
    });
    const expectedVolume = (Math.PI * (50 ** 2 - 20 ** 2) * 100) / 2;
    expect(Math.abs(mesh.volumeMm3 - expectedVolume) / expectedVolume).toBeLessThan(
      0.002,
    );
  });

  it('lofts matching closed profiles into a tapered solid', () => {
    const mesh = buildLoftMesh({
      profiles: [
        [
          [-5, -5, 0],
          [5, -5, 0],
          [5, 5, 0],
          [-5, 5, 0],
        ],
        [
          [-10, -10, 100],
          [10, -10, 100],
          [10, 10, 100],
          [-10, 10, 100],
        ],
      ],
    });
    expect(mesh.vertices).toHaveLength(8);
    expect(mesh.indices).toHaveLength(36);
    expect(mesh.volumeMm3).toBeCloseTo(70000 / 3, 6);
    expect(mesh.centerOfMassMm[2]).toBeGreaterThan(50);
  });
});
