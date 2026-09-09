export type SweepVec3 = readonly [number, number, number];
type MutableVec3 = [number, number, number];

export interface OrientedSweepSection {
  readonly startCorners: readonly [
    MutableVec3,
    MutableVec3,
    MutableVec3,
    MutableVec3,
  ];
  readonly endCorners: readonly [
    MutableVec3,
    MutableVec3,
    MutableVec3,
    MutableVec3,
  ];
  readonly vector: MutableVec3;
  readonly lengthMm: number;
}

export interface OrientedSweepMesh {
  readonly vertices: readonly MutableVec3[];
  readonly indices: readonly number[];
  readonly sections: readonly OrientedSweepSection[];
  readonly extentsMm: {
    readonly min: MutableVec3;
    readonly max: MutableVec3;
  };
}

function dot(a: SweepVec3, b: SweepVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: SweepVec3, b: SweepVec3): MutableVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value: SweepVec3): MutableVec3 {
  const magnitude = Math.hypot(value[0], value[1], value[2]);
  if (!(magnitude > 1e-9)) {
    throw new Error('Cannot normalize a zero-length sweep vector');
  }
  return [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude];
}

function addScaled(
  origin: SweepVec3,
  widthAxis: SweepVec3,
  widthScale: number,
  depthAxis: SweepVec3,
  depthScale: number,
): MutableVec3 {
  return [
    origin[0] + widthAxis[0] * widthScale + depthAxis[0] * depthScale,
    origin[1] + widthAxis[1] * widthScale + depthAxis[1] * depthScale,
    origin[2] + widthAxis[2] * widthScale + depthAxis[2] * depthScale,
  ];
}

function profileAxes(
  tangent: SweepVec3,
  requestedUp?: SweepVec3,
): { readonly width: MutableVec3; readonly depth: MutableVec3 } {
  const fallback: SweepVec3 =
    Math.abs(tangent[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const up = requestedUp ?? fallback;
  const projection = dot(up, tangent);
  let depthCandidate: MutableVec3 = [
    up[0] - tangent[0] * projection,
    up[1] - tangent[1] * projection,
    up[2] - tangent[2] * projection,
  ];
  if (Math.hypot(...depthCandidate) <= 1e-9) {
    const fallbackProjection = dot(fallback, tangent);
    depthCandidate = [
      fallback[0] - tangent[0] * fallbackProjection,
      fallback[1] - tangent[1] * fallbackProjection,
      fallback[2] - tangent[2] * fallbackProjection,
    ];
  }
  const depth = normalize(depthCandidate);
  const width = normalize(cross(depth, tangent));
  return { width, depth };
}

function sectionCorners(
  point: SweepVec3,
  widthAxis: SweepVec3,
  depthAxis: SweepVec3,
  halfWidth: number,
  halfDepth: number,
): [MutableVec3, MutableVec3, MutableVec3, MutableVec3] {
  return [
    addScaled(point, widthAxis, -halfWidth, depthAxis, -halfDepth),
    addScaled(point, widthAxis, halfWidth, depthAxis, -halfDepth),
    addScaled(point, widthAxis, halfWidth, depthAxis, halfDepth),
    addScaled(point, widthAxis, -halfWidth, depthAxis, halfDepth),
  ];
}

export function buildOrientedSweepMesh(input: {
  readonly path: readonly SweepVec3[];
  readonly profileWidthMm: number;
  readonly profileDepthMm: number;
  readonly profileUp?: SweepVec3;
}): OrientedSweepMesh {
  if (input.path.length < 2) {
    throw new Error('Sweep path requires at least two points');
  }
  const vertices: MutableVec3[] = [];
  const indices: number[] = [];
  const sections: OrientedSweepSection[] = [];
  const halfWidth = input.profileWidthMm / 2;
  const halfDepth = input.profileDepthMm / 2;

  for (let index = 1; index < input.path.length; index += 1) {
    const start = input.path[index - 1]!;
    const end = input.path[index]!;
    const vector: MutableVec3 = [
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2],
    ];
    const lengthMm = Math.hypot(...vector);
    if (!(lengthMm > 1e-9)) {
      throw new Error(`Sweep segment ${index - 1} has zero length`);
    }
    const tangent = normalize(vector);
    const axes = profileAxes(tangent, input.profileUp);
    const startCorners = sectionCorners(
      start,
      axes.width,
      axes.depth,
      halfWidth,
      halfDepth,
    );
    const endCorners = sectionCorners(
      end,
      axes.width,
      axes.depth,
      halfWidth,
      halfDepth,
    );
    const offset = vertices.length;
    vertices.push(...startCorners, ...endCorners);
    indices.push(
      offset,
      offset + 2,
      offset + 1,
      offset,
      offset + 3,
      offset + 2,
      offset + 4,
      offset + 5,
      offset + 6,
      offset + 4,
      offset + 6,
      offset + 7,
      offset,
      offset + 1,
      offset + 5,
      offset,
      offset + 5,
      offset + 4,
      offset + 1,
      offset + 2,
      offset + 6,
      offset + 1,
      offset + 6,
      offset + 5,
      offset + 2,
      offset + 3,
      offset + 7,
      offset + 2,
      offset + 7,
      offset + 6,
      offset + 3,
      offset,
      offset + 4,
      offset + 3,
      offset + 4,
      offset + 7,
    );
    sections.push({ startCorners, endCorners, vector, lengthMm });
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
  return { vertices, indices, sections, extentsMm: { min, max } };
}
