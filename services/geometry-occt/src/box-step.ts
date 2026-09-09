import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  buildExtrusionMesh,
  buildLoftMesh,
  buildOrientedSweepMesh,
  buildRevolveMesh,
  trimTriangleMeshByPlane,
  type GeometryCompileOp,
} from '@spds/geometry-contracts';

type Vec3 = [number, number, number];
type Extents = { readonly min: Vec3; readonly max: Vec3 };

/** Source AABB of services/geometry-occt/fixtures/cube.stp (CARTESIAN_POINT extents). */
const CUBE_SRC_MIN: Vec3 = [-160, -140, 0];
const CUBE_SRC_MAX: Vec3 = [140, 160, 300];

let cachedCubeStep: string | null = null;

function loadCubeStepTemplate(): string {
  if (cachedCubeStep) return cachedCubeStep;
  const here = dirname(fileURLToPath(import.meta.url));
  cachedCubeStep = readFileSync(join(here, '../fixtures/cube.stp'), 'utf8');
  return cachedCubeStep;
}

function extentsOfCompileOp(
  op: GeometryCompileOp,
  byOperationId: ReadonlyMap<string, Extents>,
): { min: Vec3; max: Vec3 } {
  let extents: { readonly min: readonly number[]; readonly max: readonly number[] };
  switch (op.op) {
    case 'geometry.sweep@1.0.0':
      extents = buildOrientedSweepMesh({
        path: op.path,
        profileWidthMm: op.profileWidthMm,
        profileDepthMm: op.profileDepthMm,
        ...(op.profileUp !== undefined ? { profileUp: op.profileUp } : {}),
      }).extentsMm;
      break;
    case 'geometry.extrude@1.0.0':
      extents = buildExtrusionMesh({
        profile: op.profile,
        vector: op.vector,
      }).extentsMm;
      break;
    case 'geometry.revolve@1.0.0':
      extents = buildRevolveMesh({
        profile: op.profile,
        axisOrigin: op.axisOrigin,
        axisDirection: op.axisDirection,
        angleDeg: op.angleDeg,
        segments: op.segments,
      }).extentsMm;
      break;
    case 'geometry.loft@1.0.0':
      extents = buildLoftMesh({ profiles: op.profiles }).extentsMm;
      break;
    case 'geometry.boolean@1.0.0': {
      const left = byOperationId.get(op.leftOperationId);
      const right = byOperationId.get(op.rightOperationId);
      if (!left || !right) {
        throw new Error(
          `Boolean ${op.pirOperationId} requires prior operation extents`,
        );
      }
      switch (op.operation) {
        case 'union':
          extents = {
            min: left.min.map((value, index) =>
              Math.min(value, right.min[index]!),
            ),
            max: left.max.map((value, index) =>
              Math.max(value, right.max[index]!),
            ),
          };
          break;
        case 'cut':
          extents = left;
          break;
        case 'intersect':
          extents = {
            min: left.min.map((value, index) =>
              Math.max(value, right.min[index]!),
            ),
            max: left.max.map((value, index) =>
              Math.min(value, right.max[index]!),
            ),
          };
          break;
        default: {
          const exhaustive: never = op.operation;
          return exhaustive;
        }
      }
      break;
    }
    case 'geometry.trim-plane@1.0.0': {
      const source = byOperationId.get(op.sourceOperationId);
      if (!source) {
        throw new Error(
          `Plane trim ${op.pirOperationId} requires prior operation extents`,
        );
      }
      const sourceBox = buildExtrusionMesh({
        profile: [
          [source.min[0], source.min[1], source.min[2]],
          [source.max[0], source.min[1], source.min[2]],
          [source.max[0], source.max[1], source.min[2]],
          [source.min[0], source.max[1], source.min[2]],
        ],
        vector: [0, 0, source.max[2] - source.min[2]],
      });
      const trimmed = trimTriangleMeshByPlane({
        operand: {
          vertices: [...sourceBox.vertices],
          indices: [...sourceBox.indices],
          maxDeviationMm: 0,
        },
        planeOrigin: op.planeOrigin,
        planeNormal: op.planeNormal,
        keep: op.keep,
      });
      extents = {
        min: [0, 1, 2].map((axis) =>
          Math.min(...trimmed.vertices.map((vertex) => vertex[axis]!)),
        ),
        max: [0, 1, 2].map((axis) =>
          Math.max(...trimmed.vertices.map((vertex) => vertex[axis]!)),
        ),
      };
      break;
    }
    case 'geometry.edge-fillet@1.0.0':
    case 'geometry.edge-chamfer@1.0.0':
    case 'geometry.face-shell@1.0.0':
    case 'geometry.face-draft@1.0.0': {
      const source = byOperationId.get(op.sourceOperationId);
      if (!source) {
        throw new Error(
          `Edge modifier ${op.pirOperationId} requires prior operation extents`,
        );
      }
      extents = source;
      break;
    }
    default: {
      const exhaustive: never = op;
      return exhaustive;
    }
  }
  const min: Vec3 = [extents.min[0]!, extents.min[1]!, extents.min[2]!];
  const max: Vec3 = [extents.max[0]!, extents.max[1]!, extents.max[2]!];
  // Ensure positive volume
  for (let i = 0; i < 3; i++) {
    if (!(max[i]! > min[i]!)) {
      max[i] = min[i]! + 1;
    }
  }
  return { min, max };
}

function mapPoint(src: Vec3, min: Vec3, max: Vec3): Vec3 {
  const sx = CUBE_SRC_MAX[0] - CUBE_SRC_MIN[0];
  const sy = CUBE_SRC_MAX[1] - CUBE_SRC_MIN[1];
  const sz = CUBE_SRC_MAX[2] - CUBE_SRC_MIN[2];
  return [
    min[0] + ((src[0] - CUBE_SRC_MIN[0]) / sx) * (max[0] - min[0]),
    min[1] + ((src[1] - CUBE_SRC_MIN[1]) / sy) * (max[1] - min[1]),
    min[2] + ((src[2] - CUBE_SRC_MIN[2]) / sz) * (max[2] - min[2]),
  ];
}

/**
 * Content-addressed schema STEP: remap known-good cube.stp AABB onto each sweep's
 * extents so occt-import-js can tessellate real OCCT meshes from compile ops.
 */
export function compileOpToBoxStep(
  op: GeometryCompileOp,
  byOperationId: ReadonlyMap<string, Extents> = new Map(),
): {
  readonly stepText: string;
  readonly contentHash: string;
  readonly extents: { readonly min: Vec3; readonly max: Vec3 };
} {
  const { min, max } = extentsOfCompileOp(op, byOperationId);
  const template = loadCubeStepTemplate();
  const stepText = template.replace(
    /CARTESIAN_POINT\('',[ ]*\(([^)]+)\)\);/g,
    (_m, coords: string) => {
      const parts = coords.split(',').map((s) => Number(s.trim()));
      const mapped = mapPoint([parts[0]!, parts[1]!, parts[2]!], min, max);
      return `CARTESIAN_POINT('',(${mapped[0]},${mapped[1]},${mapped[2]}));`;
    },
  );
  const contentHash = createHash('sha256').update(stepText).digest('hex');
  return { stepText, contentHash, extents: { min, max } };
}

export function compileOpsToStepArtifacts(ops: readonly GeometryCompileOp[]): readonly {
  readonly semanticOwner: string;
  readonly pirOperationId: string;
  readonly stepText: string;
  readonly contentHash: string;
}[] {
  const byOperationId = new Map<string, Extents>();
  const artifacts: {
    semanticOwner: string;
    pirOperationId: string;
    stepText: string;
    contentHash: string;
  }[] = [];
  for (const op of ops) {
    const box = compileOpToBoxStep(op, byOperationId);
    byOperationId.set(op.pirOperationId, box.extents);
    if (op.visibility === 'construction') continue;
    artifacts.push({
      semanticOwner: op.semanticOwner,
      pirOperationId: op.pirOperationId,
      stepText: box.stepText,
      contentHash: box.contentHash,
    });
  }
  return artifacts;
}
