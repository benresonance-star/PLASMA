import { randomUUID } from 'node:crypto';
import { createSpdsError } from '@spds/failure-taxonomy';
import { sha256Canonical } from '@spds/reproducibility';
import type {
  BooleanRequest,
  EdgeChamferRequest,
  EdgeFilletRequest,
  FaceShellRequest,
  FaceDraftRequest,
  ExtrudeRequest,
  GeometryRepresentation,
  LoftRequest,
  Mesh,
  ShellRequest,
  SweepRequest,
  TessellateRequest,
  TrimPlaneRequest,
  RevolveRequest,
} from './dto.js';
import { buildExtrusionMesh } from './extrusion-mesh.js';
import {
  extrusionEdgeTopology,
  extrusionFaceTopology,
} from './extrusion-topology.js';
import { buildLoftMesh, buildRevolveMesh } from './form-mesh.js';
import { loftEdgeTopology, loftFaceTopology } from './loft-topology.js';
import { booleanTriangleMeshes } from './mesh-boolean.js';
import { measureClosedTriangleMesh } from './mesh-properties.js';
import { trimTriangleMeshByPlane } from './trim-plane.js';
import { measureBoxFeatures, type MeasureRequest, type MeasureResult } from './measure.js';
import { buildOrientedSweepMesh } from './sweep-mesh.js';

type Vec3 = [number, number, number];

interface SolidRecordBase {
  readonly representation: GeometryRepresentation;
  readonly mesh: Mesh;
}

interface SweepSolidRecord extends SolidRecordBase {
  readonly kind: 'sweep';
  readonly path: Vec3[];
  readonly profileWidthMm: number;
  readonly profileDepthMm: number;
  readonly wallThicknessMm: number;
  readonly featurePath: string;
  readonly profileUp?: Vec3;
}

interface ExtrudeSolidRecord extends SolidRecordBase {
  readonly kind: 'extrude';
  readonly profile: Vec3[];
  readonly vector: Vec3;
}

interface RevolveSolidRecord extends SolidRecordBase {
  readonly kind: 'revolve';
}

interface LoftSolidRecord extends SolidRecordBase {
  readonly kind: 'loft';
}

interface BooleanSolidRecord extends SolidRecordBase {
  readonly kind: 'boolean';
}

interface TrimSolidRecord extends SolidRecordBase {
  readonly kind: 'trim-plane';
}

interface EdgeFilletSolidRecord extends SolidRecordBase {
  readonly kind: 'edge-fillet';
}

interface EdgeChamferSolidRecord extends SolidRecordBase {
  readonly kind: 'edge-chamfer';
}

interface FaceShellSolidRecord extends SolidRecordBase {
  readonly kind: 'face-shell';
}

interface FaceDraftSolidRecord extends SolidRecordBase {
  readonly kind: 'face-draft';
}

type SolidRecord =
  | SweepSolidRecord
  | ExtrudeSolidRecord
  | RevolveSolidRecord
  | LoftSolidRecord
  | BooleanSolidRecord
  | TrimSolidRecord
  | EdgeFilletSolidRecord
  | EdgeChamferSolidRecord
  | FaceShellSolidRecord
  | FaceDraftSolidRecord;

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
    if (
      wall > 0 &&
      wall * 2 >= Math.min(req.profileWidthMm, req.profileDepthMm)
    ) {
      throw createSpdsError({
        code: 'HEALING_FAILED',
        summary: 'SHELL_SELF_INTERSECTION: wallThickness exceeds profile',
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
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
    const orientedMesh = buildOrientedSweepMesh({
      path: req.path,
      profileWidthMm: req.profileWidthMm,
      profileDepthMm: req.profileDepthMm,
      ...(req.profileUp !== undefined ? { profileUp: req.profileUp } : {}),
    });
    const extents = orientedMesh.extentsMm;
    const featurePath = req.featurePath ?? 'arm:A';
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
        `${req.semanticOwner}/${featurePath}/start`,
        `${req.semanticOwner}/${featurePath}/end`,
        `${req.semanticOwner}/${featurePath}/mounting-face`,
      ],
      fabricationReady: volumeMm3 > 0,
    };
    this.solids.set(id, {
      kind: 'sweep',
      representation,
      path: req.path.map((p) => [p[0], p[1], p[2]] as Vec3),
      profileWidthMm: req.profileWidthMm,
      profileDepthMm: req.profileDepthMm,
      wallThicknessMm: wall,
      featurePath,
      ...(req.profileUp !== undefined
        ? { profileUp: [req.profileUp[0], req.profileUp[1], req.profileUp[2]] as Vec3 }
        : {}),
      mesh: {
        vertices: [...orientedMesh.vertices],
        indices: [...orientedMesh.indices],
        maxDeviationMm: 0,
      },
    });
    return representation;
  }

  extrude(req: ExtrudeRequest): GeometryRepresentation {
    let extrusion: ReturnType<typeof buildExtrusionMesh>;
    try {
      extrusion = buildExtrusionMesh({
        profile: req.profile,
        vector: req.vector,
      });
    } catch (error) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary:
          error instanceof Error ? error.message : 'Invalid planar extrusion',
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const id = `repr:geom:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? 'profile:extrude';
    const topologyInput = {
      semanticOwner: req.semanticOwner,
      featurePath,
      profile: extrusion.profile,
      vector: extrusion.vector,
    };
    const topologyElements = [
      ...extrusionEdgeTopology(topologyInput),
      ...extrusionFaceTopology(topologyInput),
    ];
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: this.kernelId,
      validationState: 'geometry-generated',
      solid: { kind: 'solid', extentsMm: extrusion.extentsMm },
      mass: {
        volumeMm3: extrusion.volumeMm3,
        areaMm2: extrusion.areaMm2,
        centerOfMassMm: extrusion.centerOfMassMm,
      },
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/start`,
        `${req.semanticOwner}/${featurePath}/end`,
        `${req.semanticOwner}/${featurePath}/side`,
        ...topologyElements.map((element) => element.path),
      ],
      topologyElements: [...topologyElements],
      fabricationReady: extrusion.volumeMm3 > 0,
    };
    this.solids.set(id, {
      kind: 'extrude',
      representation,
      profile: extrusion.profile.map((point) => [...point] as Vec3),
      vector: [...extrusion.vector] as Vec3,
      mesh: {
        vertices: [...extrusion.vertices],
        indices: [...extrusion.indices],
        maxDeviationMm: 0,
      },
    });
    return representation;
  }

  revolve(req: RevolveRequest): GeometryRepresentation {
    let form: ReturnType<typeof buildRevolveMesh>;
    try {
      form = buildRevolveMesh({
        profile: req.profile,
        axisOrigin: req.axisOrigin,
        axisDirection: req.axisDirection,
        angleDeg: req.angleDeg,
        segments: req.segments,
      });
    } catch (error) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: error instanceof Error ? error.message : 'Invalid revolve',
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const id = `repr:geom:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? 'profile:revolve';
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: this.kernelId,
      validationState: 'geometry-generated',
      solid: { kind: 'solid', extentsMm: form.extentsMm },
      mass: {
        volumeMm3: form.volumeMm3,
        areaMm2: form.areaMm2,
        centerOfMassMm: form.centerOfMassMm,
      },
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/profile`,
        `${req.semanticOwner}/${featurePath}/axis`,
        `${req.semanticOwner}/${featurePath}/seam`,
      ],
      fabricationReady: form.volumeMm3 > 0,
    };
    this.solids.set(id, {
      kind: 'revolve',
      representation,
      mesh: {
        vertices: [...form.vertices],
        indices: [...form.indices],
        maxDeviationMm: 0,
      },
    });
    return representation;
  }

  loft(req: LoftRequest): GeometryRepresentation {
    let form: ReturnType<typeof buildLoftMesh>;
    try {
      form = buildLoftMesh({ profiles: req.profiles });
    } catch (error) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: error instanceof Error ? error.message : 'Invalid loft',
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const id = `repr:geom:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? 'profile:loft';
    const topologyElements = req.ruled
      ? [
          ...loftEdgeTopology({
            semanticOwner: req.semanticOwner,
            featurePath,
            profiles: req.profiles,
          }),
          ...loftFaceTopology({
            semanticOwner: req.semanticOwner,
            featurePath,
            profiles: req.profiles,
          }),
        ]
      : [];
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: this.kernelId,
      validationState: 'geometry-generated',
      solid: { kind: 'solid', extentsMm: form.extentsMm },
      mass: {
        volumeMm3: form.volumeMm3,
        areaMm2: form.areaMm2,
        centerOfMassMm: form.centerOfMassMm,
      },
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/start`,
        `${req.semanticOwner}/${featurePath}/end`,
        `${req.semanticOwner}/${featurePath}/side`,
        ...topologyElements.map((element) => element.path),
      ],
      ...(topologyElements.length > 0 ? { topologyElements } : {}),
      fabricationReady: form.volumeMm3 > 0,
    };
    this.solids.set(id, {
      kind: 'loft',
      representation,
      mesh: {
        vertices: [...form.vertices],
        indices: [...form.indices],
        maxDeviationMm: 0,
      },
    });
    return representation;
  }

  boolean(req: BooleanRequest): GeometryRepresentation {
    const left = this.solids.get(req.leftRepresentationId);
    const right = this.solids.get(req.rightRepresentationId);
    if (!left || !right) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: 'Boolean operands must reference existing representations',
        affectedSemanticIds: [
          req.leftRepresentationId,
          req.rightRepresentationId,
        ],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    let mesh: Mesh;
    try {
      mesh = booleanTriangleMeshes({
        left: left.mesh,
        right: right.mesh,
        operation: req.operation,
      });
    } catch (error) {
      throw createSpdsError({
        code: 'HEALING_FAILED',
        summary:
          error instanceof Error ? error.message : 'Exact Boolean failed',
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const measured = measureClosedTriangleMesh(mesh.vertices, mesh.indices);
    const id = `repr:geom:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? `boolean:${req.operation}`;
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: this.kernelId,
      validationState: 'geometry-generated',
      solid: { kind: 'solid', extentsMm: meshExtents(mesh) },
      mass: measured,
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/result`,
        `${req.semanticOwner}/${featurePath}/left`,
        `${req.semanticOwner}/${featurePath}/right`,
      ],
      fabricationReady: measured.volumeMm3 > 0,
    };
    this.solids.set(id, {
      kind: 'boolean',
      representation,
      mesh,
    });
    return representation;
  }

  trimPlane(req: TrimPlaneRequest): GeometryRepresentation {
    const source = this.solids.get(req.sourceRepresentationId);
    if (!source) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: 'Plane trim source must reference an existing representation',
        affectedSemanticIds: [req.sourceRepresentationId],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    let mesh: Mesh;
    try {
      mesh = trimTriangleMeshByPlane({
        operand: source.mesh,
        planeOrigin: req.planeOrigin,
        planeNormal: req.planeNormal,
        keep: req.keep,
      });
    } catch (error) {
      throw createSpdsError({
        code: 'HEALING_FAILED',
        summary:
          error instanceof Error ? error.message : 'Exact plane trim failed',
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const measured = measureClosedTriangleMesh(mesh.vertices, mesh.indices);
    const id = `repr:geom:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? 'trim:plane';
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: this.kernelId,
      validationState: 'geometry-generated',
      solid: { kind: 'solid', extentsMm: meshExtents(mesh) },
      mass: measured,
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/cut-face`,
        `${req.semanticOwner}/${featurePath}/kept-side`,
      ],
      fabricationReady: measured.volumeMm3 > 0,
    };
    this.solids.set(id, {
      kind: 'trim-plane',
      representation,
      mesh,
    });
    return representation;
  }

  fillet(req: EdgeFilletRequest): GeometryRepresentation {
    return this.approximateEdgeModifier({
      kind: 'edge-fillet',
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      sourceRepresentationId: req.sourceRepresentationId,
      edgePaths: req.edgePaths,
      amountMm: req.radiusMm,
      featurePath: req.featurePath ?? 'modifier:fillet',
    });
  }

  chamfer(req: EdgeChamferRequest): GeometryRepresentation {
    return this.approximateEdgeModifier({
      kind: 'edge-chamfer',
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      sourceRepresentationId: req.sourceRepresentationId,
      edgePaths: req.edgePaths,
      amountMm: req.distanceMm,
      featurePath: req.featurePath ?? 'modifier:chamfer',
    });
  }

  shellFaces(req: FaceShellRequest): GeometryRepresentation {
    const source = this.solids.get(req.sourceRepresentationId);
    if (!source) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: 'Face shell source must reference an existing representation',
        affectedSemanticIds: [req.sourceRepresentationId],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const available = new Set(
      source.representation.topologyElements
        ?.filter((element) => element.kind === 'face')
        .map((element) => element.path) ?? [],
    );
    const missing = req.removedFacePaths.filter((path) => !available.has(path));
    if (missing.length > 0) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `Unknown semantic face paths: ${missing.join(', ')}`,
        affectedSemanticIds: missing,
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const id = `repr:geom:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? 'modifier:face-shell';
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: this.kernelId,
      validationState: 'geometry-approximated',
      solid: {
        kind: 'solid',
        extentsMm: source.representation.solid.extentsMm,
      },
      mass: source.representation.mass,
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/result`,
        ...req.removedFacePaths,
      ],
      fabricationReady: false,
    };
    this.solids.set(id, {
      kind: 'face-shell',
      representation,
      mesh: {
        vertices: source.mesh.vertices.map((point) => [...point] as Vec3),
        indices: [...source.mesh.indices],
        maxDeviationMm: Math.max(
          source.mesh.maxDeviationMm,
          req.thicknessMm,
        ),
      },
    });
    return representation;
  }

  draftFaces(req: FaceDraftRequest): GeometryRepresentation {
    const source = this.solids.get(req.sourceRepresentationId);
    if (!source) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: 'Face draft source must reference an existing representation',
        affectedSemanticIds: [req.sourceRepresentationId],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const available = new Set(
      source.representation.topologyElements
        ?.filter((element) => element.kind === 'face')
        .map((element) => element.path) ?? [],
    );
    const missing = req.selectedFacePaths.filter((path) => !available.has(path));
    if (missing.length > 0) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `Unknown semantic face paths: ${missing.join(', ')}`,
        affectedSemanticIds: missing,
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const id = `repr:geom:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? 'modifier:face-draft';
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: this.kernelId,
      validationState: 'geometry-approximated',
      solid: {
        kind: 'solid',
        extentsMm: source.representation.solid.extentsMm,
      },
      mass: source.representation.mass,
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/result`,
        ...req.selectedFacePaths,
      ],
      fabricationReady: false,
    };
    const maxDraftDeviationMm = draftEnvelopeDeviation(
      source.representation.solid.extentsMm,
      req.neutralPlaneOrigin,
      req.neutralPlaneNormal,
      req.angleDeg,
    );
    this.solids.set(id, {
      kind: 'face-draft',
      representation,
      mesh: {
        vertices: source.mesh.vertices.map((point) => [...point] as Vec3),
        indices: [...source.mesh.indices],
        maxDeviationMm: Math.max(
          source.mesh.maxDeviationMm,
          maxDraftDeviationMm,
        ),
      },
    });
    return representation;
  }

  private approximateEdgeModifier(input: {
    readonly kind: 'edge-fillet' | 'edge-chamfer';
    readonly semanticOwner: string;
    readonly pirOperationId: string;
    readonly sourceRepresentationId: string;
    readonly edgePaths: readonly string[];
    readonly amountMm: number;
    readonly featurePath: string;
  }): GeometryRepresentation {
    const source = this.solids.get(input.sourceRepresentationId);
    if (!source) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: 'Edge modifier source must reference an existing representation',
        affectedSemanticIds: [input.sourceRepresentationId],
        operationOrPirId: input.pirOperationId,
        recoverable: true,
      });
    }
    const available = new Set(
      source.representation.topologyElements?.map((element) => element.path) ??
        [],
    );
    const missing = input.edgePaths.filter((path) => !available.has(path));
    if (missing.length > 0) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `Unknown semantic edge paths: ${missing.join(', ')}`,
        affectedSemanticIds: missing,
        operationOrPirId: input.pirOperationId,
        recoverable: true,
      });
    }
    const id = `repr:geom:${sha256Canonical({
      owner: input.semanticOwner,
      pir: input.pirOperationId,
    }).slice(0, 16)}`;
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: input.semanticOwner,
      pirOperationId: input.pirOperationId,
      kernel: this.kernelId,
      validationState: 'geometry-approximated',
      solid: {
        kind: 'solid',
        extentsMm: source.representation.solid.extentsMm,
      },
      mass: source.representation.mass,
      subElementPaths: [
        `${input.semanticOwner}/${input.featurePath}/result`,
        ...input.edgePaths,
      ],
      fabricationReady: false,
    };
    this.solids.set(id, {
      kind: input.kind,
      representation,
      mesh: {
        vertices: source.mesh.vertices.map((point) => [...point] as Vec3),
        indices: [...source.mesh.indices],
        maxDeviationMm: Math.max(
          source.mesh.maxDeviationMm,
          input.amountMm,
        ),
      },
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
    return {
      vertices: [...solid.mesh.vertices],
      indices: [...solid.mesh.indices],
      maxDeviationMm: Math.max(
        solid.mesh.maxDeviationMm,
        Math.min(req.chordDeviationMm, req.angleDeviationDeg * 0.1),
      ),
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
    if (solid.kind !== 'sweep') {
      throw createSpdsError({
        code: 'OPERATOR_UNAVAILABLE',
        summary: 'Shell currently requires a sweep representation',
        affectedSemanticIds: [req.representationId, req.semanticOwner],
        recoverable: true,
      });
    }
    if (
      Math.abs(req.offsetMm) >= solid.profileWidthMm / 2 ||
      Math.abs(req.offsetMm) >= solid.profileDepthMm / 2
    ) {
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
      featurePath: solid.featurePath,
      ...(solid.profileUp !== undefined ? { profileUp: solid.profileUp } : {}),
    });
  }

  get(representationId: string): GeometryRepresentation | undefined {
    return this.solids.get(representationId)?.representation;
  }

  resolveTopologyElement(representationId: string, path: string) {
    return this.solids
      .get(representationId)
      ?.representation.topologyElements?.find((element) => element.path === path);
  }

  findBySemanticOwner(semanticOwner: string): GeometryRepresentation | undefined {
    for (const solid of this.solids.values()) {
      if (solid.representation.semanticOwner === semanticOwner) {
        return solid.representation;
      }
    }
    return undefined;
  }

  /** Authoritative AABB box measure (distance / edgeLength / faceArea / angle). */
  measure(req: MeasureRequest): MeasureResult {
    const solid =
      (req.representationId ? this.solids.get(req.representationId) : undefined) ??
      (req.semanticOwner
        ? [...this.solids.values()].find(
            (s) => s.representation.semanticOwner === req.semanticOwner,
          )
        : undefined);
    const extents = req.extentsMm ?? solid?.representation.solid.extentsMm;
    if (!extents) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: 'Unknown representation for measure (provide extentsMm or stored solid)',
        affectedSemanticIds: [req.representationId ?? req.semanticOwner ?? ''],
        recoverable: true,
      });
    }
    const { quantity, unit } = measureBoxFeatures(req.kind, req.features, extents);
    return {
      kind: req.kind,
      quantity,
      unit,
      provenance: 'brep',
      engine: {
        layer: req.layer ?? 'reference',
        kernel: this.kernelId,
        label: 'Exact adapter',
      },
      features: [...req.features],
    };
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
    const extents = solid.representation.solid.extentsMm;
    const cutDepthMm =
      solid.kind === 'sweep'
        ? Math.min(solid.profileDepthMm, solid.profileWidthMm)
        : Math.min(
            extents.max[0] - extents.min[0],
            extents.max[1] - extents.min[1],
            extents.max[2] - extents.min[2],
          );
    const holeVolume =
      input.holeIds.length *
      Math.PI *
      (input.diameterMm / 2) ** 2 *
      cutDepthMm;
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

function draftEnvelopeDeviation(
  extents: { readonly min: Vec3; readonly max: Vec3 },
  planeOrigin: Vec3,
  planeNormal: Vec3,
  angleDeg: number,
): number {
  const normalLength = Math.hypot(...planeNormal);
  let maxDistance = 0;
  for (const x of [extents.min[0], extents.max[0]]) {
    for (const y of [extents.min[1], extents.max[1]]) {
      for (const z of [extents.min[2], extents.max[2]]) {
        const distance = Math.abs(
          ((x - planeOrigin[0]) * planeNormal[0] +
            (y - planeOrigin[1]) * planeNormal[1] +
            (z - planeOrigin[2]) * planeNormal[2]) /
            normalLength,
        );
        maxDistance = Math.max(maxDistance, distance);
      }
    }
  }
  return maxDistance * Math.tan((angleDeg * Math.PI) / 180);
}

function meshExtents(mesh: Mesh): {
  readonly min: Vec3;
  readonly max: Vec3;
} {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const vertex of mesh.vertices) {
    min[0] = Math.min(min[0], vertex[0]);
    min[1] = Math.min(min[1], vertex[1]);
    min[2] = Math.min(min[2], vertex[2]);
    max[0] = Math.max(max[0], vertex[0]);
    max[1] = Math.max(max[1], vertex[1]);
    max[2] = Math.max(max[2], vertex[2]);
  }
  return { min, max };
}
