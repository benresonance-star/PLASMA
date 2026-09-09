import { describe, expect, it } from 'vitest';
import { buildExtrusionMesh } from './extrusion-mesh.js';
import { booleanTriangleMeshes } from './mesh-boolean.js';
import { measureClosedTriangleMesh } from './mesh-properties.js';

function box(minX: number, maxX: number) {
  const extrusion = buildExtrusionMesh({
    profile: [
      [minX, 0, 0],
      [maxX, 0, 0],
      [maxX, 10, 0],
      [minX, 10, 0],
    ],
    vector: [0, 0, 10],
  });
  return {
    vertices: [...extrusion.vertices],
    indices: [...extrusion.indices],
    maxDeviationMm: 0,
  };
}

describe('exact BSP mesh Booleans', () => {
  it.each([
    ['union', 1500],
    ['cut', 500],
    ['intersect', 500],
  ] as const)('%s preserves closed-solid volume', (operation, expectedVolume) => {
    const result = booleanTriangleMeshes({
      left: box(0, 10),
      right: box(5, 15),
      operation,
    });
    expect(result.indices.length).toBeGreaterThan(0);
    expect(
      measureClosedTriangleMesh(result.vertices, result.indices).volumeMm3,
    ).toBeCloseTo(expectedVolume, 6);
  });
});
