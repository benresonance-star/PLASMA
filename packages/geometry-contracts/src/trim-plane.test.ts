import { describe, expect, it } from 'vitest';
import { buildExtrusionMesh } from './extrusion-mesh.js';
import { measureClosedTriangleMesh } from './mesh-properties.js';
import { trimTriangleMeshByPlane } from './trim-plane.js';

const box = () => {
  const extrusion = buildExtrusionMesh({
    profile: [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
    ],
    vector: [0, 0, 10],
  });
  return {
    vertices: [...extrusion.vertices],
    indices: [...extrusion.indices],
    maxDeviationMm: 0,
  };
};

describe('exact plane trim', () => {
  it.each([
    ['positive', 5, 10],
    ['negative', 0, 5],
  ] as const)('keeps the %s half-space', (keep, minX, maxX) => {
    const result = trimTriangleMeshByPlane({
      operand: box(),
      planeOrigin: [5, 0, 0],
      planeNormal: [1, 0, 0],
      keep,
    });
    const xs = result.vertices.map((vertex) => vertex[0]);
    expect(Math.min(...xs)).toBeCloseTo(minX, 8);
    expect(Math.max(...xs)).toBeCloseTo(maxX, 8);
    expect(
      measureClosedTriangleMesh(result.vertices, result.indices).volumeMm3,
    ).toBeCloseTo(500, 6);
  });
});
