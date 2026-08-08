import { createSpdsError } from '@spds/failure-taxonomy';
import type { GeometryRepresentation } from '@spds/geometry-contracts';
import { parseCoordinateFrame, type CoordinateFrame } from '@spds/coordinate-frames';
import type { ExactKernelAdapter } from './exact-kernel.js';

export interface PlaneCutAffector {
  readonly id: string;
  readonly kind: 'world-plane-cut';
  readonly frameId: string;
  readonly planeZMm: number;
  readonly targetRepresentationIds: readonly string[];
}

export interface VolumeExclusionAffector {
  readonly id: string;
  readonly kind: 'box-exclusion';
  readonly minMm: readonly [number, number, number];
  readonly maxMm: readonly [number, number, number];
  readonly targetRepresentationIds: readonly string[];
}

export interface ScalarAffector {
  readonly id: string;
  readonly kind: 'scalar-radial';
  readonly scale: number;
  readonly targetRepresentationIds: readonly string[];
}

export type GeometryAffector = PlaneCutAffector | VolumeExclusionAffector | ScalarAffector;

export function assertWorldFrame(frame: CoordinateFrame): void {
  if (frame.role !== 'WORLD') {
    throw createSpdsError({
      code: 'SEMANTIC_INVALID',
      summary: 'World-space affectors must reference WORLD frame',
      affectedSemanticIds: [frame.id],
      recoverable: true,
    });
  }
}

export function applyPlaneCut(
  kernel: ExactKernelAdapter,
  affector: PlaneCutAffector,
  worldFrame: CoordinateFrame,
): GeometryRepresentation[] {
  assertWorldFrame(worldFrame);
  const out: GeometryRepresentation[] = [];
  for (const id of affector.targetRepresentationIds) {
    const rep = kernel.get(id);
    if (!rep) continue;
    const zMax = rep.solid.extentsMm.max[2];
    if (zMax < affector.planeZMm) {
      out.push({
        ...rep,
        id: `${rep.id}:cut-excluded`,
        validationState: 'geometry-invalid',
        fabricationReady: false,
        mass: { ...rep.mass, volumeMm3: 0 },
      });
      continue;
    }
    // survivors keep semantic owner; extents clipped in Z
    out.push({
      ...rep,
      id: `${rep.id}:cut`,
      solid: {
        kind: 'solid',
        extentsMm: {
          min: [
            rep.solid.extentsMm.min[0],
            rep.solid.extentsMm.min[1],
            Math.max(rep.solid.extentsMm.min[2], affector.planeZMm),
          ],
          max: [...rep.solid.extentsMm.max],
        },
      },
      validationState: 'geometry-generated',
      fabricationReady: true,
    });
  }
  return out;
}

export function applyVolumeExclusion(
  kernel: ExactKernelAdapter,
  affector: VolumeExclusionAffector,
): GeometryRepresentation[] {
  const out: GeometryRepresentation[] = [];
  for (const id of affector.targetRepresentationIds) {
    const rep = kernel.get(id);
    if (!rep) continue;
    const c = rep.mass.centerOfMassMm;
    const inside =
      c[0] >= affector.minMm[0] &&
      c[0] <= affector.maxMm[0] &&
      c[1] >= affector.minMm[1] &&
      c[1] <= affector.maxMm[1] &&
      c[2] >= affector.minMm[2] &&
      c[2] <= affector.maxMm[2];
    if (inside) {
      out.push({
        ...rep,
        id: `${rep.id}:excluded`,
        validationState: 'geometry-invalid',
        fabricationReady: false,
        mass: { ...rep.mass, volumeMm3: 0 },
      });
    } else {
      out.push(rep);
    }
  }
  return out;
}

export function applyScalarRadial(
  kernel: ExactKernelAdapter,
  affector: ScalarAffector,
): GeometryRepresentation[] {
  if (!(affector.scale > 0)) {
    throw createSpdsError({
      code: 'GEOMETRY_INVALID',
      summary: 'Scalar affector scale must be positive',
      affectedSemanticIds: [affector.id],
      recoverable: true,
    });
  }
  return affector.targetRepresentationIds
    .map((id) => kernel.get(id))
    .filter((r): r is GeometryRepresentation => r !== undefined)
    .map((rep) => ({
      ...rep,
      id: `${rep.id}:scaled`,
      mass: {
        ...rep.mass,
        volumeMm3: rep.mass.volumeMm3 * affector.scale ** 3,
        areaMm2: rep.mass.areaMm2 * affector.scale ** 2,
      },
    }));
}

export function defaultWorldFrame(): CoordinateFrame {
  return parseCoordinateFrame({
    id: 'frame:world',
    role: 'WORLD',
    parentId: null,
    provenance: { source: 'system' },
  });
}
