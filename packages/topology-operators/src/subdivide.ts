import type { Vec3 } from './vec3.js';
import { normalize, scale, add } from './vec3.js';

/**
 * Class-I geodesic subdivision: each triangular face → frequency² subfaces.
 * Vertices projected onto the unit sphere.
 */
export function subdivideGeodesic(
  vertices: readonly Vec3[],
  faces: readonly (readonly [number, number, number])[],
  frequency: number,
): {
  readonly vertices: readonly Vec3[];
  readonly faces: readonly (readonly [number, number, number])[];
} {
  if (!Number.isInteger(frequency) || frequency < 1) {
    throw new Error('frequency must be a positive integer');
  }
  const v = frequency;
  const outVerts: Vec3[] = [];
  const keyToIndex = new Map<string, number>();

  const getIndex = (point: Vec3): number => {
    const n = normalize(point);
    const key = `${n[0].toFixed(12)},${n[1].toFixed(12)},${n[2].toFixed(12)}`;
    const existing = keyToIndex.get(key);
    if (existing !== undefined) return existing;
    const idx = outVerts.length;
    outVerts.push(n);
    keyToIndex.set(key, idx);
    return idx;
  };

  // seed original vertices for stable first indices
  for (const vert of vertices) getIndex(vert);

  const outFaces: Array<readonly [number, number, number]> = [];

  for (const face of faces) {
    const [i0, i1, i2] = face;
    const a = vertices[i0]!;
    const b = vertices[i1]!;
    const c = vertices[i2]!;
    const grid: number[][] = [];
    for (let i = 0; i <= v; i += 1) {
      grid[i] = [];
      for (let j = 0; j <= v - i; j += 1) {
        const k = v - i - j;
        const point = normalize(
          add(add(scale(a, i / v), scale(b, j / v)), scale(c, k / v)),
        );
        grid[i]![j] = getIndex(point);
      }
    }
    for (let i = 0; i < v; i += 1) {
      for (let j = 0; j < v - i; j += 1) {
        const aIdx = grid[i]![j]!;
        const bIdx = grid[i]![j + 1]!;
        const cIdx = grid[i + 1]![j]!;
        outFaces.push([aIdx, bIdx, cIdx]);
        if (j < v - i - 1) {
          const dIdx = grid[i + 1]![j + 1]!;
          outFaces.push([bIdx, dIdx, cIdx]);
        }
      }
    }
  }

  return { vertices: outVerts, faces: outFaces };
}

export function expectedGeodesicCounts(frequency: number): {
  vertices: number;
  faces: number;
  edges: number;
} {
  return {
    vertices: 10 * frequency * frequency + 2,
    faces: 20 * frequency * frequency,
    edges: 30 * frequency * frequency,
  };
}
