export type PropertyVec3 = readonly [number, number, number];

export interface ClosedMeshProperties {
  readonly volumeMm3: number;
  readonly areaMm2: number;
  readonly centerOfMassMm: [number, number, number];
}

function cross(a: PropertyVec3, b: PropertyVec3): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function subtract(a: PropertyVec3, b: PropertyVec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: PropertyVec3, b: PropertyVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function measureClosedTriangleMesh(
  vertices: readonly PropertyVec3[],
  indices: readonly number[],
): ClosedMeshProperties {
  let signedVolume = 0;
  let areaMm2 = 0;
  const centroidAccumulator: [number, number, number] = [0, 0, 0];
  for (let index = 0; index < indices.length; index += 3) {
    const a = vertices[indices[index]!]!;
    const b = vertices[indices[index + 1]!]!;
    const c = vertices[indices[index + 2]!]!;
    const triangleCross = cross(subtract(b, a), subtract(c, a));
    areaMm2 += Math.hypot(...triangleCross) / 2;
    const tetraVolume = dot(a, cross(b, c)) / 6;
    signedVolume += tetraVolume;
    centroidAccumulator[0] += ((a[0] + b[0] + c[0]) / 4) * tetraVolume;
    centroidAccumulator[1] += ((a[1] + b[1] + c[1]) / 4) * tetraVolume;
    centroidAccumulator[2] += ((a[2] + b[2] + c[2]) / 4) * tetraVolume;
  }
  if (Math.abs(signedVolume) <= 1e-9) {
    throw new Error('Triangle mesh does not enclose positive volume');
  }
  return {
    volumeMm3: Math.abs(signedVolume),
    areaMm2,
    centerOfMassMm: [
      centroidAccumulator[0] / signedVolume,
      centroidAccumulator[1] / signedVolume,
      centroidAccumulator[2] / signedVolume,
    ],
  };
}
