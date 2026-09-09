import { describe, expect, it } from 'vitest';
import { scaleArmMeshes } from './mesh-length.js';

describe('scaleArmMeshes', () => {
  it('scales along arm axis without changing cross-section width', () => {
    const meshes = scaleArmMeshes(
      [
        {
          representationId: 'r1',
          semanticOwner: 'y:1',
          vertices: [
            [0, 0, 0],
            [100, 0, 0],
            [100, 10, 0],
            [0, 10, 0],
          ],
          indices: [0, 1, 2, 0, 2, 3],
        },
      ],
      2,
    );
    const v = meshes[0]!.vertices;
    expect(v[1]![0]).toBeCloseTo(200);
    expect(v[2]![0]).toBeCloseTo(200);
    expect(v[2]![1]).toBeCloseTo(10);
    expect(v[3]![1]).toBeCloseTo(10);
  });
});
