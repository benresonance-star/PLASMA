import type { Mesh } from './dto.js';
import { buildExtrusionMesh, type ExtrusionVec3 } from './extrusion-mesh.js';
import { booleanTriangleMeshes } from './mesh-boolean.js';

type Vec3 = [number, number, number];
export type PlaneTrimSide = 'positive' | 'negative';

function subtract(a: ExtrusionVec3, b: ExtrusionVec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: ExtrusionVec3, b: ExtrusionVec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value: ExtrusionVec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!(length > 1e-9)) throw new Error('Trim plane normal must be non-zero');
  return [value[0] / length, value[1] / length, value[2] / length];
}

function addScaled(
  origin: ExtrusionVec3,
  u: ExtrusionVec3,
  uScale: number,
  v: ExtrusionVec3,
  vScale: number,
): Vec3 {
  return [
    origin[0] + u[0] * uScale + v[0] * vScale,
    origin[1] + u[1] * uScale + v[1] * vScale,
    origin[2] + u[2] * uScale + v[2] * vScale,
  ];
}

export function buildPlaneTrimPrism(input: {
  readonly operandVertices: readonly ExtrusionVec3[];
  readonly planeOrigin: ExtrusionVec3;
  readonly planeNormal: ExtrusionVec3;
  readonly keep: PlaneTrimSide;
}): {
  readonly profile: readonly Vec3[];
  readonly vector: Vec3;
} {
  if (input.operandVertices.length === 0) {
    throw new Error('Plane trim requires operand vertices');
  }
  const normal = normalize(input.planeNormal);
  const reference: ExtrusionVec3 =
    Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u = normalize(cross(reference, normal));
  const v = normalize(cross(normal, u));
  const radius =
    Math.max(
      ...input.operandVertices.map((vertex) =>
        Math.hypot(...subtract(vertex, input.planeOrigin)),
      ),
    ) *
      4 +
    1;
  const profile = [
    addScaled(input.planeOrigin, u, -radius, v, -radius),
    addScaled(input.planeOrigin, u, radius, v, -radius),
    addScaled(input.planeOrigin, u, radius, v, radius),
    addScaled(input.planeOrigin, u, -radius, v, radius),
  ];
  const direction = input.keep === 'positive' ? 1 : -1;
  const vector: Vec3 = [
    normal[0] * radius * 2 * direction,
    normal[1] * radius * 2 * direction,
    normal[2] * radius * 2 * direction,
  ];
  return { profile, vector };
}

export function trimTriangleMeshByPlane(input: {
  readonly operand: Mesh;
  readonly planeOrigin: ExtrusionVec3;
  readonly planeNormal: ExtrusionVec3;
  readonly keep: PlaneTrimSide;
}): Mesh {
  const prism = buildPlaneTrimPrism({
    operandVertices: input.operand.vertices,
    planeOrigin: input.planeOrigin,
    planeNormal: input.planeNormal,
    keep: input.keep,
  });
  const clipping = buildExtrusionMesh(prism);
  return booleanTriangleMeshes({
    left: input.operand,
    right: {
      vertices: [...clipping.vertices],
      indices: [...clipping.indices],
      maxDeviationMm: 0,
    },
    operation: 'intersect',
  });
}
