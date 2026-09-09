export type ExtrusionVec3 = readonly [number, number, number];
type MutableVec3 = [number, number, number];
type Vec2 = readonly [number, number];

export interface ExtrusionMesh {
  readonly vertices: readonly MutableVec3[];
  readonly indices: readonly number[];
  readonly profile: readonly MutableVec3[];
  readonly vector: MutableVec3;
  readonly extentsMm: {
    readonly min: MutableVec3;
    readonly max: MutableVec3;
  };
  readonly volumeMm3: number;
  readonly areaMm2: number;
  readonly centerOfMassMm: MutableVec3;
}

export interface TriangulatedPlanarProfile {
  readonly points: readonly MutableVec3[];
  readonly normal: MutableVec3;
  readonly triangles: readonly number[];
}

function subtract(a: ExtrusionVec3, b: ExtrusionVec3): MutableVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: ExtrusionVec3, b: ExtrusionVec3): MutableVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: ExtrusionVec3, b: ExtrusionVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function magnitude(value: ExtrusionVec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function samePoint(a: ExtrusionVec3, b: ExtrusionVec3): boolean {
  return magnitude(subtract(a, b)) <= 1e-9;
}

function profileNormal(profile: readonly ExtrusionVec3[]): MutableVec3 {
  const normal: MutableVec3 = [0, 0, 0];
  for (let index = 0; index < profile.length; index += 1) {
    const current = profile[index]!;
    const next = profile[(index + 1) % profile.length]!;
    normal[0] += (current[1] - next[1]) * (current[2] + next[2]);
    normal[1] += (current[2] - next[2]) * (current[0] + next[0]);
    normal[2] += (current[0] - next[0]) * (current[1] + next[1]);
  }
  const length = magnitude(normal);
  if (!(length > 1e-9)) {
    throw new Error('Extrusion profile is degenerate');
  }
  return [normal[0] / length, normal[1] / length, normal[2] / length];
}

function projectProfile(
  profile: readonly ExtrusionVec3[],
  normal: ExtrusionVec3,
): readonly Vec2[] {
  const abs = normal.map(Math.abs);
  const dropAxis: 0 | 1 | 2 =
    abs[0]! >= abs[1]! && abs[0]! >= abs[2]! ? 0 : abs[1]! >= abs[2]! ? 1 : 2;
  return profile.map((point) => {
    switch (dropAxis) {
      case 0:
        return [point[1], point[2]];
      case 1:
        return [point[0], point[2]];
      case 2:
        return [point[0], point[1]];
      default: {
        const exhaustive: never = dropAxis;
        return exhaustive;
      }
    }
  });
}

function signedArea2(profile: readonly Vec2[]): number {
  let area = 0;
  for (let index = 0; index < profile.length; index += 1) {
    const current = profile[index]!;
    const next = profile[(index + 1) % profile.length]!;
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area;
}

function triangleCross(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTriangle(point: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const ab = triangleCross(a, b, point);
  const bc = triangleCross(b, c, point);
  const ca = triangleCross(c, a, point);
  const hasNegative = ab < -1e-9 || bc < -1e-9 || ca < -1e-9;
  const hasPositive = ab > 1e-9 || bc > 1e-9 || ca > 1e-9;
  return !(hasNegative && hasPositive);
}

function triangulate(profile: readonly Vec2[]): readonly number[] {
  const orientation = signedArea2(profile) >= 0 ? 1 : -1;
  const remaining = profile.map((_point, index) => index);
  const triangles: number[] = [];
  while (remaining.length > 3) {
    let clipped = false;
    for (let index = 0; index < remaining.length; index += 1) {
      const previous = remaining[(index - 1 + remaining.length) % remaining.length]!;
      const current = remaining[index]!;
      const next = remaining[(index + 1) % remaining.length]!;
      if (
        orientation *
          triangleCross(profile[previous]!, profile[current]!, profile[next]!) <=
        1e-9
      ) {
        continue;
      }
      const containsVertex = remaining.some(
        (candidate) =>
          candidate !== previous &&
          candidate !== current &&
          candidate !== next &&
          pointInTriangle(
            profile[candidate]!,
            profile[previous]!,
            profile[current]!,
            profile[next]!,
          ),
      );
      if (containsVertex) continue;
      triangles.push(previous, current, next);
      remaining.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      throw new Error('Extrusion profile cannot be triangulated');
    }
  }
  triangles.push(remaining[0]!, remaining[1]!, remaining[2]!);
  return triangles;
}

export function triangulatePlanarProfile(
  input: readonly ExtrusionVec3[],
): TriangulatedPlanarProfile {
  const profileInput =
    input.length > 3 && samePoint(input[0]!, input[input.length - 1]!)
      ? input.slice(0, -1)
      : input;
  if (profileInput.length < 3) {
    throw new Error('Planar profile requires at least three points');
  }
  const points = profileInput.map(
    (point): MutableVec3 => [point[0], point[1], point[2]],
  );
  const normal = profileNormal(points);
  const origin = points[0]!;
  for (const point of points.slice(1)) {
    if (Math.abs(dot(subtract(point, origin), normal)) > 1e-6) {
      throw new Error('Profile must be planar');
    }
  }
  return {
    points,
    normal,
    triangles: triangulate(projectProfile(points, normal)),
  };
}

export function buildExtrusionMesh(input: {
  readonly profile: readonly ExtrusionVec3[];
  readonly vector: ExtrusionVec3;
}): ExtrusionMesh {
  const triangulated = triangulatePlanarProfile(input.profile);
  const profile = [...triangulated.points];
  const vector: MutableVec3 = [
    input.vector[0],
    input.vector[1],
    input.vector[2],
  ];
  const normal = triangulated.normal;
  const heightMm = Math.abs(dot(vector, normal));
  if (!(heightMm > 1e-9)) {
    throw new Error('Extrusion vector must leave the profile plane');
  }

  const capTriangles = triangulated.triangles;
  const end = profile.map(
    (point): MutableVec3 => [
      point[0] + vector[0],
      point[1] + vector[1],
      point[2] + vector[2],
    ],
  );
  const vertices = [...profile, ...end];
  const count = profile.length;
  const vectorFollowsNormal = dot(vector, normal) > 0;
  const indices: number[] = [];
  for (let index = 0; index < capTriangles.length; index += 3) {
    const a = capTriangles[index]!;
    const b = capTriangles[index + 1]!;
    const c = capTriangles[index + 2]!;
    if (vectorFollowsNormal) {
      indices.push(a, c, b, a + count, b + count, c + count);
    } else {
      indices.push(a, b, c, a + count, c + count, b + count);
    }
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    if (vectorFollowsNormal) {
      indices.push(index, next, next + count, index, next + count, index + count);
    } else {
      indices.push(index, next + count, next, index, index + count, next + count);
    }
  }

  let baseAreaMm2 = 0;
  const baseCentroid: MutableVec3 = [0, 0, 0];
  for (let index = 0; index < capTriangles.length; index += 3) {
    const a = profile[capTriangles[index]!]!;
    const b = profile[capTriangles[index + 1]!]!;
    const c = profile[capTriangles[index + 2]!]!;
    const area = magnitude(cross(subtract(b, a), subtract(c, a))) / 2;
    baseAreaMm2 += area;
    baseCentroid[0] += ((a[0] + b[0] + c[0]) / 3) * area;
    baseCentroid[1] += ((a[1] + b[1] + c[1]) / 3) * area;
    baseCentroid[2] += ((a[2] + b[2] + c[2]) / 3) * area;
  }
  baseCentroid[0] /= baseAreaMm2;
  baseCentroid[1] /= baseAreaMm2;
  baseCentroid[2] /= baseAreaMm2;
  let sideAreaMm2 = 0;
  for (let index = 0; index < count; index += 1) {
    sideAreaMm2 += magnitude(
      cross(subtract(profile[(index + 1) % count]!, profile[index]!), vector),
    );
  }

  const min: MutableVec3 = [Infinity, Infinity, Infinity];
  const max: MutableVec3 = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) {
    min[0] = Math.min(min[0], vertex[0]);
    min[1] = Math.min(min[1], vertex[1]);
    min[2] = Math.min(min[2], vertex[2]);
    max[0] = Math.max(max[0], vertex[0]);
    max[1] = Math.max(max[1], vertex[1]);
    max[2] = Math.max(max[2], vertex[2]);
  }
  return {
    vertices,
    indices,
    profile,
    vector,
    extentsMm: { min, max },
    volumeMm3: baseAreaMm2 * heightMm,
    areaMm2: baseAreaMm2 * 2 + sideAreaMm2,
    centerOfMassMm: [
      baseCentroid[0] + vector[0] / 2,
      baseCentroid[1] + vector[1] / 2,
      baseCentroid[2] + vector[2] / 2,
    ],
  };
}
