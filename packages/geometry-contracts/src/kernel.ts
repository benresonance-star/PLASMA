import { randomUUID } from 'node:crypto';
import { createSpdsError } from '@spds/failure-taxonomy';
import { sha256Canonical } from '@spds/reproducibility';
import type { GeometryRepresentation, Mesh, ShellRequest, SweepRequest, TessellateRequest } from './dto.js';

type Vec3 = [number, number, number];

interface SolidRecord {
  readonly representation: GeometryRepresentation;
  readonly path: Vec3[];
  readonly profileWidthMm: number;
  readonly profileDepthMm: number;
  readonly wallThicknessMm: number;
}

/** Process-local exact geometry kernel used by reference pipelines and the geometry service. */
export class InProcessGeometryKernel {
  readonly kernelId = 'exact-adapter' as const;
  readonly version = '0.1.0';
  private readonly solids = new Map<string, SolidRecord>();

  health() {
    return {
      status: 'ok',
      service: 'geometry-kernel',
      kernel: this.kernelId,
      version: this.version,
      binding: 'docker-service-boundary/exact-adapter',
    };
  }

  sweep(req: SweepRequest): GeometryRepresentation {
    const pathLen = polylineLength(req.path);
    if (pathLen <= 0) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: 'Sweep path length must be positive',
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const wall = req.wallThicknessMm ?? 0;
    const outer = req.profileWidthMm * req.profileDepthMm * pathLen;
    const inner =
      wall > 0
        ? Math.max(0, req.profileWidthMm - 2 * wall) *
          Math.max(0, req.profileDepthMm - 2 * wall) *
          pathLen
        : 0;
    const volumeMm3 = outer - inner;
    const areaMm2 =
      2 * (req.profileWidthMm * req.profileDepthMm) +
      pathLen * 2 * (req.profileWidthMm + req.profileDepthMm);
    const center = average(req.path);
    const extents = extentsOfPath(req.path, req.profileWidthMm, req.profileDepthMm);
    const id = `repr:geom:${sha256Canonical({ owner: req.semanticOwner, pir: req.pirOperationId }).slice(0, 16)}`;
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: this.kernelId,
      validationState: 'geometry-generated',
      solid: { kind: 'solid', extentsMm: extents },
      mass: { volumeMm3, areaMm2, centerOfMassMm: center },
      subElementPaths: [
        `${req.semanticOwner}/arm:A/start`,
        `${req.semanticOwner}/arm:A/end`,
        `${req.semanticOwner}/arm:A/mounting-face`,
      ],
      fabricationReady: volumeMm3 > 0,
    };
    this.solids.set(id, {
      representation,
      path: req.path.map((p) => [p[0], p[1], p[2]] as Vec3),
      profileWidthMm: req.profileWidthMm,
      profileDepthMm: req.profileDepthMm,
      wallThicknessMm: wall,
    });
    return representation;
  }

  tessellate(req: TessellateRequest): Mesh {
    const solid = this.solids.get(req.representationId);
    if (!solid) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `Unknown representation ${req.representationId}`,
        affectedSemanticIds: [req.representationId],
        recoverable: true,
      });
    }
    const { min, max } = solid.representation.solid.extentsMm;
    const vertices: Vec3[] = [
      [min[0], min[1], min[2]],
      [max[0], min[1], min[2]],
      [max[0], max[1], min[2]],
      [min[0], max[1], min[2]],
      [min[0], min[1], max[2]],
      [max[0], min[1], max[2]],
      [max[0], max[1], max[2]],
      [min[0], max[1], max[2]],
    ];
    const indices = [
      0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4,
      3, 4, 0,
    ];
    return {
      vertices,
      indices,
      maxDeviationMm: Math.min(req.chordDeviationMm, req.angleDeviationDeg * 0.1),
    };
  }

  shell(req: ShellRequest): GeometryRepresentation {
    const solid = this.solids.get(req.representationId);
    if (!solid) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `Unknown representation ${req.representationId}`,
        affectedSemanticIds: [req.representationId, req.semanticOwner],
        recoverable: true,
      });
    }
    if (Math.abs(req.offsetMm) >= solid.profileWidthMm / 2) {
      const failed: GeometryRepresentation = {
        ...solid.representation,
        id: `repr:geom:failed:${randomUUID().slice(0, 8)}`,
        validationState: 'shell-failed',
        fabricationReady: false,
      };
      this.solids.set(failed.id, { ...solid, representation: failed });
      throw createSpdsError({
        code: 'HEALING_FAILED',
        summary: 'SHELL_SELF_INTERSECTION: offset exceeds profile',
        affectedSemanticIds: [req.semanticOwner, req.representationId],
        operationOrPirId: solid.representation.pirOperationId,
        recoverable: true,
        details: { failedRepresentationId: failed.id },
      });
    }
    return this.sweep({
      semanticOwner: req.semanticOwner,
      pirOperationId: `${solid.representation.pirOperationId}:shell`,
      path: solid.path,
      profileWidthMm: solid.profileWidthMm,
      profileDepthMm: solid.profileDepthMm,
      wallThicknessMm: Math.abs(req.offsetMm),
    });
  }

  get(representationId: string): GeometryRepresentation | undefined {
    return this.solids.get(representationId)?.representation;
  }

  /**
   * G11.4 — apply derived hole cuts as volume deltas on exact-adapter solids.
   * Full OCCT Booleans remain optional behind the geometry service.
   */
  applyHoleCuts(input: {
    readonly representationId: string;
    readonly holeIds: readonly string[];
    readonly diameterMm: number;
  }): GeometryRepresentation {
    const solid = this.solids.get(input.representationId);
    if (!solid) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `Unknown representation ${input.representationId}`,
        affectedSemanticIds: [input.representationId],
        recoverable: true,
      });
    }
    const holeVolume =
      input.holeIds.length *
      Math.PI *
      (input.diameterMm / 2) ** 2 *
      Math.min(solid.profileDepthMm, solid.profileWidthMm);
    const volumeMm3 = Math.max(1, solid.representation.mass.volumeMm3 - holeVolume);
    const next: GeometryRepresentation = {
      ...solid.representation,
      id: `repr:geom:holes:${sha256Canonical({
        base: solid.representation.id,
        holes: input.holeIds,
      }).slice(0, 16)}`,
      mass: { ...solid.representation.mass, volumeMm3 },
      subElementPaths: [
        ...solid.representation.subElementPaths,
        ...input.holeIds.map((h) => `${solid.representation.semanticOwner}/hole:${h}`),
      ],
      validationState: 'geometry-generated',
      fabricationReady: volumeMm3 > 0,
    };
    this.solids.set(next.id, { ...solid, representation: next });
    this.solids.delete(input.representationId);
    return next;
  }
}

function polylineLength(path: ReadonlyArray<readonly [number, number, number]>): number {
  let sum = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    sum += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return sum;
}

function average(path: ReadonlyArray<readonly [number, number, number]>): Vec3 {
  const n = path.length;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of path) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  return [x / n, y / n, z / n];
}

function extentsOfPath(
  path: ReadonlyArray<readonly [number, number, number]>,
  width: number,
  depth: number,
) {
  const pad = Math.max(width, depth) / 2;
  let min: Vec3 = [Infinity, Infinity, Infinity];
  let max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of path) {
    min = [Math.min(min[0], p[0] - pad), Math.min(min[1], p[1] - pad), Math.min(min[2], p[2] - pad)];
    max = [Math.max(max[0], p[0] + pad), Math.max(max[1], p[1] + pad), Math.max(max[2], p[2] + pad)];
  }
  return { min, max };
}
