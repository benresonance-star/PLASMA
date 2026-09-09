import {
  triangulatePlanarProfile,
  type ExtrusionVec3,
} from './extrusion-mesh.js';
import {
  measureClosedTriangleMesh,
  type ClosedMeshProperties,
} from './mesh-properties.js';

type MutableVec3 = [number, number, number];

export interface FormMesh extends ClosedMeshProperties {
  readonly vertices: readonly MutableVec3[];
  readonly indices: readonly number[];
  readonly extentsMm: {
    readonly min: MutableVec3;
    readonly max: MutableVec3;
  };
}

function subtract(a: ExtrusionVec3, b: ExtrusionVec3): MutableVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: ExtrusionVec3, b: ExtrusionVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: ExtrusionVec3, b: ExtrusionVec3): MutableVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value: ExtrusionVec3): MutableVec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!(length > 1e-9)) throw new Error('Axis direction must be non-zero');
  return [value[0] / length, value[1] / length, value[2] / length];
}

function rotateAroundAxis(
  point: ExtrusionVec3,
  origin: ExtrusionVec3,
  direction: ExtrusionVec3,
  angle: number,
): MutableVec3 {
  const relative = subtract(point, origin);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const axisCross = cross(direction, relative);
  const axisDot = dot(direction, relative);
  return [
    origin[0] +
      relative[0] * cosine +
      axisCross[0] * sine +
      direction[0] * axisDot * (1 - cosine),
    origin[1] +
      relative[1] * cosine +
      axisCross[1] * sine +
      direction[1] * axisDot * (1 - cosine),
    origin[2] +
      relative[2] * cosine +
      axisCross[2] * sine +
      direction[2] * axisDot * (1 - cosine),
  ];
}

function extentsOf(vertices: readonly ExtrusionVec3[]): {
  readonly min: MutableVec3;
  readonly max: MutableVec3;
} {
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
  return { min, max };
}

export function buildRevolveMesh(input: {
  readonly profile: readonly ExtrusionVec3[];
  readonly axisOrigin: ExtrusionVec3;
  readonly axisDirection: ExtrusionVec3;
  readonly angleDeg: number;
  readonly segments: number;
}): FormMesh {
  const profile = triangulatePlanarProfile(input.profile);
  const axis = normalize(input.axisDirection);
  const fullRevolution = Math.abs(input.angleDeg - 360) <= 1e-9;
  const ringCount = fullRevolution ? input.segments : input.segments + 1;
  const angleRad = (input.angleDeg * Math.PI) / 180;
  const vertices: MutableVec3[] = [];
  for (let ring = 0; ring < ringCount; ring += 1) {
    const fraction = ring / input.segments;
    for (const point of profile.points) {
      vertices.push(
        rotateAroundAxis(
          point,
          input.axisOrigin,
          axis,
          angleRad * fraction,
        ),
      );
    }
  }

  const count = profile.points.length;
  const indices: number[] = [];
  const spanCount = fullRevolution ? ringCount : ringCount - 1;
  for (let ring = 0; ring < spanCount; ring += 1) {
    const nextRing = (ring + 1) % ringCount;
    for (let point = 0; point < count; point += 1) {
      const nextPoint = (point + 1) % count;
      const a = ring * count + point;
      const b = ring * count + nextPoint;
      const c = nextRing * count + nextPoint;
      const d = nextRing * count + point;
      indices.push(a, b, c, a, c, d);
    }
  }
  if (!fullRevolution) {
    const endOffset = (ringCount - 1) * count;
    for (let index = 0; index < profile.triangles.length; index += 3) {
      const a = profile.triangles[index]!;
      const b = profile.triangles[index + 1]!;
      const c = profile.triangles[index + 2]!;
      indices.push(a, c, b, endOffset + a, endOffset + b, endOffset + c);
    }
  }
  const properties = measureClosedTriangleMesh(vertices, indices);
  return {
    vertices,
    indices,
    extentsMm: extentsOf(vertices),
    ...properties,
  };
}

export function buildLoftMesh(input: {
  readonly profiles: readonly (readonly ExtrusionVec3[])[];
}): FormMesh {
  if (input.profiles.length < 2) {
    throw new Error('Loft requires at least two profiles');
  }
  const profiles = input.profiles.map(triangulatePlanarProfile);
  const count = profiles[0]!.points.length;
  if (profiles.some((profile) => profile.points.length !== count)) {
    throw new Error('Exact loft requires matching profile vertex counts');
  }
  const vertices = profiles.flatMap((profile) =>
    profile.points.map((point): MutableVec3 => [...point]),
  );
  const indices: number[] = [];
  for (let section = 0; section < profiles.length - 1; section += 1) {
    const nextSection = section + 1;
    for (let point = 0; point < count; point += 1) {
      const nextPoint = (point + 1) % count;
      const a = section * count + point;
      const b = section * count + nextPoint;
      const c = nextSection * count + nextPoint;
      const d = nextSection * count + point;
      indices.push(a, b, c, a, c, d);
    }
  }
  const firstTriangles = profiles[0]!.triangles;
  const lastOffset = (profiles.length - 1) * count;
  const lastTriangles = profiles[profiles.length - 1]!.triangles;
  for (let index = 0; index < firstTriangles.length; index += 3) {
    indices.push(
      firstTriangles[index]!,
      firstTriangles[index + 2]!,
      firstTriangles[index + 1]!,
    );
  }
  for (let index = 0; index < lastTriangles.length; index += 3) {
    indices.push(
      lastOffset + lastTriangles[index]!,
      lastOffset + lastTriangles[index + 1]!,
      lastOffset + lastTriangles[index + 2]!,
    );
  }
  const properties = measureClosedTriangleMesh(vertices, indices);
  return {
    vertices,
    indices,
    extentsMm: extentsOf(vertices),
    ...properties,
  };
}
