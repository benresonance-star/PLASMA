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
  MeasureRequest,
  MeasureResult,
  Mesh,
  ShellRequest,
  SweepRequest,
  TessellateRequest,
  TrimPlaneRequest,
  RevolveRequest,
} from '@spds/geometry-contracts';
import {
  buildExtrusionMesh,
  buildLoftMesh,
  buildOrientedSweepMesh,
  buildPlaneTrimPrism,
  buildRevolveMesh,
  extrusionEdgeTopology,
  extrusionFaceTopology,
  loftEdgeTopology,
  loftFaceTopology,
  measureBoxFeatures,
  type GeometryTopologyElement,
  type OrientedSweepSection,
} from '@spds/geometry-contracts';
import { loadOcjs, type OcjsModule, type OcjsShape } from './occt-js.js';
import { exportShapeToStep } from './native-step-export.js';

type Vec3 = [number, number, number];

interface SolidRecordBase {
  readonly representation: GeometryRepresentation;
  readonly shape: OcjsShape;
  readonly edgesByPath?: ReadonlyMap<string, OcjsShape>;
  readonly facesByPath?: ReadonlyMap<string, OcjsShape>;
}

interface SweepSolidRecord extends SolidRecordBase {
  readonly kind: 'sweep';
  readonly path: Vec3[];
  readonly profileWidthMm: number;
  readonly profileDepthMm: number;
  readonly wallThicknessMm: number;
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

/**
 * Constructive OCCT B-rep via OpenCascade.js (Node WASM) — N1.
 * Never delegates to exact-adapter under the occt-native label.
 */
export class OcctNativeKernel {
  readonly kernelId = 'occt-native' as const;
  readonly version = '0.2.0-oriented-sweep';
  private oc: OcjsModule | null = null;
  private initError: string | null = null;
  private readonly solids = new Map<string, SolidRecord>();

  health() {
    return {
      status: this.oc ? ('ok' as const) : ('degraded' as const),
      service: 'geometry-kernel',
      kernel: this.kernelId,
      version: this.version,
      binding: 'opencascade.js-wasm-node',
      constructiveReady: this.oc !== null,
      ...(this.initError ? { initError: this.initError, note: this.initError } : {}),
      ...(!this.oc && !this.initError
        ? { note: 'OCJS not initialized — call ensureReady() or await server start' }
        : {}),
    };
  }

  async ensureReady(): Promise<void> {
    if (this.oc) return;
    if (this.initError) {
      throw createSpdsError({
        code: 'OPERATOR_UNAVAILABLE',
        summary: `occt-native unavailable: ${this.initError}`,
        affectedSemanticIds: [],
        recoverable: true,
      });
    }
    try {
      this.oc = await loadOcjs();
    } catch (err) {
      this.initError = err instanceof Error ? err.message : 'ocjs-init-failed';
      throw createSpdsError({
        code: 'OPERATOR_UNAVAILABLE',
        summary: `occt-native init failed: ${this.initError}`,
        affectedSemanticIds: [],
        recoverable: true,
      });
    }
  }

  private requireOc(): OcjsModule {
    if (!this.oc) {
      throw createSpdsError({
        code: 'OPERATOR_UNAVAILABLE',
        summary: 'occt-native not ready — ensureReady() required before constructive ops',
        affectedSemanticIds: [],
        recoverable: true,
      });
    }
    return this.oc;
  }

  sweep(req: SweepRequest): GeometryRepresentation {
    const oc = this.requireOc();
    if (req.path.length < 2) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: 'Sweep path requires at least 2 points',
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const path = req.path.map((p) => [p[0], p[1], p[2]] as Vec3);
    const length = polylineLength(path);
    if (!(length > 0)) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: 'Sweep path length must be positive',
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }

    const w = req.profileWidthMm;
    const d = req.profileDepthMm;
    const wall = req.wallThicknessMm ?? 0;

    if (wall > 0 && wall * 2 >= Math.min(w, d)) {
      throw createSpdsError({
        code: 'HEALING_FAILED',
        summary: 'SHELL_SELF_INTERSECTION: wallThickness exceeds profile',
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }

    const oriented = buildOrientedSweepMesh({
      path,
      profileWidthMm: w,
      profileDepthMm: d,
      ...(req.profileUp !== undefined ? { profileUp: req.profileUp } : {}),
    });
    const shape = buildOrientedSweepShape(oc, oriented.sections);
    const extents = oriented.extentsMm;
    const measured = measureSolid(oc, shape);
    const volumeMm3 =
      wall > 0
        ? Math.max(
            0,
            w * d * length - Math.max(0, w - 2 * wall) * Math.max(0, d - 2 * wall) * length,
          )
        : measured.volumeMm3;

    const id = `repr:occt-native:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? 'arm:A';
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: 'occt-native',
      validationState: volumeMm3 > 0 ? 'geometry-generated' : 'geometry-invalid',
      solid: { kind: 'solid', extentsMm: { min: extents.min, max: extents.max } },
      mass: {
        volumeMm3,
        areaMm2: measured.areaMm2,
        centerOfMassMm: measured.centerOfMassMm,
      },
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/start`,
        `${req.semanticOwner}/${featurePath}/end`,
        `${req.semanticOwner}/${featurePath}/mounting-face`,
      ],
      fabricationReady: false,
    };
    this.solids.set(id, {
      kind: 'sweep',
      representation,
      shape,
      path,
      profileWidthMm: w,
      profileDepthMm: d,
      wallThicknessMm: wall,
      ...(req.profileUp !== undefined
        ? { profileUp: [req.profileUp[0], req.profileUp[1], req.profileUp[2]] as Vec3 }
        : {}),
    });
    return representation;
  }

  extrude(req: ExtrudeRequest): GeometryRepresentation {
    const oc = this.requireOc();
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
    const shape = buildPlanarPrismShape(
      oc,
      extrusion.profile,
      extrusion.vector,
    );
    const measured = measureSolid(oc, shape);
    const id = `repr:occt-native:${sha256Canonical({
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
    const edgeTopology = extrusionEdgeTopology(topologyInput);
    const faceTopology = extrusionFaceTopology(topologyInput);
    const topologyElements = [...edgeTopology, ...faceTopology];
    const edgesByPath = resolveShapeEdgesByTopology(
      oc,
      shape,
      edgeTopology,
    );
    const facesByPath = resolveShapeFacesByTopology(oc, shape, faceTopology);
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: 'occt-native',
      validationState:
        measured.volumeMm3 > 0 ? 'geometry-generated' : 'geometry-invalid',
      solid: { kind: 'solid', extentsMm: extrusion.extentsMm },
      mass: measured,
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/start`,
        `${req.semanticOwner}/${featurePath}/end`,
        `${req.semanticOwner}/${featurePath}/side`,
        ...topologyElements.map((element) => element.path),
      ],
      topologyElements: [...topologyElements],
      fabricationReady: false,
    };
    this.solids.set(id, {
      kind: 'extrude',
      representation,
      shape,
      profile: extrusion.profile.map((point) => [...point] as Vec3),
      vector: [...extrusion.vector] as Vec3,
      edgesByPath,
      facesByPath,
    });
    return representation;
  }

  revolve(req: RevolveRequest): GeometryRepresentation {
    const oc = this.requireOc();
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
    const face = buildPlanarFace(oc, formProfile(req.profile));
    const axis = new oc.gp_Ax1_2(
      new oc.gp_Pnt_3(
        req.axisOrigin[0],
        req.axisOrigin[1],
        req.axisOrigin[2],
      ),
      new oc.gp_Dir_4(
        req.axisDirection[0],
        req.axisDirection[1],
        req.axisDirection[2],
      ),
    );
    const shape =
      Math.abs(req.angleDeg - 360) <= 1e-9
        ? new oc.BRepPrimAPI_MakeRevol_2(face, axis, true).Shape()
        : new oc.BRepPrimAPI_MakeRevol_1(
            face,
            axis,
            (req.angleDeg * Math.PI) / 180,
            true,
          ).Shape();
    const measured = measureSolid(oc, shape);
    const id = `repr:occt-native:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? 'profile:revolve';
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: 'occt-native',
      validationState:
        measured.volumeMm3 > 0 ? 'geometry-generated' : 'geometry-invalid',
      solid: { kind: 'solid', extentsMm: form.extentsMm },
      mass: measured,
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/profile`,
        `${req.semanticOwner}/${featurePath}/axis`,
        `${req.semanticOwner}/${featurePath}/seam`,
      ],
      fabricationReady: false,
    };
    this.solids.set(id, {
      kind: 'revolve',
      representation,
      shape,
    });
    return representation;
  }

  loft(req: LoftRequest): GeometryRepresentation {
    const oc = this.requireOc();
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
    const loft = new oc.BRepOffsetAPI_ThruSections(true, req.ruled, 1e-6);
    loft.CheckCompatibility(true);
    for (const profile of req.profiles) {
      loft.AddWire(buildPlanarWire(oc, formProfile(profile)));
    }
    const progress = new oc.Message_ProgressRange_1();
    loft.Build(progress);
    if (!loft.IsDone()) {
      throw createSpdsError({
        code: 'HEALING_FAILED',
        summary: 'OCCT loft construction failed',
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const shape = loft.Shape();
    const measured = measureSolid(oc, shape);
    const id = `repr:occt-native:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? 'profile:loft';
    const edgeTopology = req.ruled
      ? loftEdgeTopology({
          semanticOwner: req.semanticOwner,
          featurePath,
          profiles: req.profiles,
        })
      : [];
    const faceTopology = req.ruled
      ? loftFaceTopology({
          semanticOwner: req.semanticOwner,
          featurePath,
          profiles: req.profiles,
        })
      : [];
    const topologyElements = [...edgeTopology, ...faceTopology];
    const edgesByPath =
      edgeTopology.length > 0
        ? resolveShapeEdgesByTopology(oc, shape, edgeTopology)
        : undefined;
    const facesByPath =
      faceTopology.length > 0
        ? resolveShapeFacesByTopology(oc, shape, faceTopology)
        : undefined;
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: 'occt-native',
      validationState:
        measured.volumeMm3 > 0 ? 'geometry-generated' : 'geometry-invalid',
      solid: { kind: 'solid', extentsMm: form.extentsMm },
      mass: measured,
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/start`,
        `${req.semanticOwner}/${featurePath}/end`,
        `${req.semanticOwner}/${featurePath}/side`,
        ...topologyElements.map((element) => element.path),
      ],
      ...(topologyElements.length > 0 ? { topologyElements } : {}),
      fabricationReady: false,
    };
    this.solids.set(id, {
      kind: 'loft',
      representation,
      shape,
      ...(edgesByPath !== undefined ? { edgesByPath } : {}),
      ...(facesByPath !== undefined ? { facesByPath } : {}),
    });
    return representation;
  }

  boolean(req: BooleanRequest): GeometryRepresentation {
    const oc = this.requireOc();
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
    const progress = new oc.Message_ProgressRange_1();
    let algorithm: {
      Build(range: unknown): void;
      IsDone(): boolean;
      Shape(): OcjsShape;
    };
    switch (req.operation) {
      case 'union':
        algorithm = new oc.BRepAlgoAPI_Fuse_3(
          left.shape,
          right.shape,
          progress,
        );
        break;
      case 'cut':
        algorithm = new oc.BRepAlgoAPI_Cut_3(
          left.shape,
          right.shape,
          progress,
        );
        break;
      case 'intersect':
        algorithm = new oc.BRepAlgoAPI_Common_3(
          left.shape,
          right.shape,
          progress,
        );
        break;
      default: {
        const exhaustive: never = req.operation;
        return exhaustive;
      }
    }
    algorithm.Build(progress);
    if (!algorithm.IsDone()) {
      throw createSpdsError({
        code: 'HEALING_FAILED',
        summary: `OCCT Boolean ${req.operation} failed`,
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const shape = algorithm.Shape();
    const measured = measureSolid(oc, shape);
    const id = `repr:occt-native:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? `boolean:${req.operation}`;
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: 'occt-native',
      validationState:
        measured.volumeMm3 > 0 ? 'geometry-generated' : 'geometry-invalid',
      solid: { kind: 'solid', extentsMm: measured.extentsMm },
      mass: measured,
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/result`,
        `${req.semanticOwner}/${featurePath}/left`,
        `${req.semanticOwner}/${featurePath}/right`,
      ],
      fabricationReady: false,
    };
    this.solids.set(id, {
      kind: 'boolean',
      representation,
      shape,
    });
    return representation;
  }

  trimPlane(req: TrimPlaneRequest): GeometryRepresentation {
    const oc = this.requireOc();
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
    const prism = buildPlaneTrimPrism({
      operandVertices: extentsVertices(
        source.representation.solid.extentsMm.min,
        source.representation.solid.extentsMm.max,
      ),
      planeOrigin: req.planeOrigin,
      planeNormal: req.planeNormal,
      keep: req.keep,
    });
    const clippingShape = buildPlanarPrismShape(
      oc,
      formProfile(prism.profile),
      prism.vector,
    );
    const progress = new oc.Message_ProgressRange_1();
    const common = new oc.BRepAlgoAPI_Common_3(
      source.shape,
      clippingShape,
      progress,
    );
    common.Build(progress);
    if (!common.IsDone()) {
      throw createSpdsError({
        code: 'HEALING_FAILED',
        summary: 'OCCT plane trim intersection failed',
        affectedSemanticIds: [req.semanticOwner],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const shape = common.Shape();
    const measured = measureSolid(oc, shape);
    const id = `repr:occt-native:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? 'trim:plane';
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: 'occt-native',
      validationState:
        measured.volumeMm3 > 0 ? 'geometry-generated' : 'geometry-invalid',
      solid: { kind: 'solid', extentsMm: measured.extentsMm },
      mass: measured,
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/cut-face`,
        `${req.semanticOwner}/${featurePath}/kept-side`,
      ],
      fabricationReady: false,
    };
    this.solids.set(id, {
      kind: 'trim-plane',
      representation,
      shape,
    });
    return representation;
  }

  fillet(req: EdgeFilletRequest): GeometryRepresentation {
    return this.applyEdgeModifier({
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
    return this.applyEdgeModifier({
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
    const oc = this.requireOc();
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
    const resolvedFaces = req.removedFacePaths.map((path) => ({
      path,
      face: source.facesByPath?.get(path),
    }));
    const missing = resolvedFaces
      .filter((entry) => entry.face === undefined)
      .map((entry) => entry.path);
    if (missing.length > 0) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `Unknown semantic face paths: ${missing.join(', ')}`,
        affectedSemanticIds: missing,
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    let shape: OcjsShape;
    try {
      const closingFaces = new oc.TopTools_ListOfShape_1();
      for (const entry of resolvedFaces) {
        closingFaces.Append_1(entry.face!);
      }
      const builder = new oc.BRepOffsetAPI_MakeThickSolid();
      builder.MakeThickSolidByJoin(
        source.shape,
        closingFaces,
        req.inward ? -req.thicknessMm : req.thicknessMm,
        1e-3,
        oc.BRepOffset_Mode.BRepOffset_Skin,
        false,
        false,
        oc.GeomAbs_JoinType.GeomAbs_Arc,
        false,
        new oc.Message_ProgressRange_1(),
      );
      shape = builder.Shape();
      if (!builder.IsDone()) {
        throw new Error('OCCT face shell builder did not complete');
      }
    } catch (error) {
      throw createSpdsError({
        code: 'HEALING_FAILED',
        summary:
          error instanceof Error ? error.message : 'OCCT face shell failed',
        affectedSemanticIds: [req.semanticOwner, ...req.removedFacePaths],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const measured = measureSolid(oc, shape);
    const id = `repr:occt-native:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? 'modifier:face-shell';
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: 'occt-native',
      validationState:
        measured.volumeMm3 > 0 ? 'geometry-generated' : 'geometry-invalid',
      solid: { kind: 'solid', extentsMm: measured.extentsMm },
      mass: measured,
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/result`,
        ...req.removedFacePaths,
      ],
      fabricationReady: false,
    };
    this.solids.set(id, {
      kind: 'face-shell',
      representation,
      shape,
    });
    return representation;
  }

  draftFaces(req: FaceDraftRequest): GeometryRepresentation {
    const oc = this.requireOc();
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
    const resolvedFaces = req.selectedFacePaths.map((path) => ({
      path,
      face: source.facesByPath?.get(path),
    }));
    const missing = resolvedFaces
      .filter((entry) => entry.face === undefined)
      .map((entry) => entry.path);
    if (missing.length > 0) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `Unknown semantic face paths: ${missing.join(', ')}`,
        affectedSemanticIds: missing,
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    let shape: OcjsShape;
    try {
      const pullDirection = new oc.gp_Dir_4(...req.pullDirection);
      const neutralPlane = new oc.gp_Pln_3(
        new oc.gp_Pnt_3(...req.neutralPlaneOrigin),
        new oc.gp_Dir_4(...req.neutralPlaneNormal),
      );
      const builder = new oc.BRepOffsetAPI_DraftAngle_2(source.shape);
      for (const entry of resolvedFaces) {
        builder.Add(
          entry.face!,
          pullDirection,
          (req.angleDeg * Math.PI) / 180,
          neutralPlane,
          req.reverse,
        );
        if (!builder.AddDone()) {
          throw new Error(`OCCT could not add draft face ${entry.path}`);
        }
      }
      builder.Build(new oc.Message_ProgressRange_1());
      shape = builder.Shape();
      if (!builder.IsDone()) {
        throw new Error('OCCT face draft builder did not complete');
      }
    } catch (error) {
      throw createSpdsError({
        code: 'HEALING_FAILED',
        summary:
          error instanceof Error ? error.message : 'OCCT face draft failed',
        affectedSemanticIds: [req.semanticOwner, ...req.selectedFacePaths],
        operationOrPirId: req.pirOperationId,
        recoverable: true,
      });
    }
    const measured = measureSolid(oc, shape);
    const id = `repr:occt-native:${sha256Canonical({
      owner: req.semanticOwner,
      pir: req.pirOperationId,
    }).slice(0, 16)}`;
    const featurePath = req.featurePath ?? 'modifier:face-draft';
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: req.pirOperationId,
      kernel: 'occt-native',
      validationState:
        measured.volumeMm3 > 0 ? 'geometry-generated' : 'geometry-invalid',
      solid: { kind: 'solid', extentsMm: measured.extentsMm },
      mass: measured,
      subElementPaths: [
        `${req.semanticOwner}/${featurePath}/result`,
        ...req.selectedFacePaths,
      ],
      fabricationReady: false,
    };
    this.solids.set(id, {
      kind: 'face-draft',
      representation,
      shape,
    });
    return representation;
  }

  private applyEdgeModifier(input: {
    readonly kind: 'edge-fillet' | 'edge-chamfer';
    readonly semanticOwner: string;
    readonly pirOperationId: string;
    readonly sourceRepresentationId: string;
    readonly edgePaths: readonly string[];
    readonly amountMm: number;
    readonly featurePath: string;
  }): GeometryRepresentation {
    const oc = this.requireOc();
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
    const resolvedEdges = input.edgePaths.map((path) => ({
      path,
      edge: source.edgesByPath?.get(path),
    }));
    const missing = resolvedEdges
      .filter((entry) => entry.edge === undefined)
      .map((entry) => entry.path);
    if (missing.length > 0) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `Unknown semantic edge paths: ${missing.join(', ')}`,
        affectedSemanticIds: missing,
        operationOrPirId: input.pirOperationId,
        recoverable: true,
      });
    }
    let shape: OcjsShape;
    try {
      const builder =
        input.kind === 'edge-fillet'
          ? new oc.BRepFilletAPI_MakeFillet(
              source.shape,
              oc.ChFi3d_FilletShape.ChFi3d_Rational,
            )
          : new oc.BRepFilletAPI_MakeChamfer(source.shape);
      for (const entry of resolvedEdges) {
        builder.Add_2(input.amountMm, entry.edge!);
      }
      shape = builder.Shape();
      if (!builder.IsDone()) {
        throw new Error(`OCCT ${input.kind} builder did not complete`);
      }
    } catch (error) {
      throw createSpdsError({
        code: 'HEALING_FAILED',
        summary:
          error instanceof Error
            ? error.message
            : `OCCT ${input.kind} failed`,
        affectedSemanticIds: [input.semanticOwner, ...input.edgePaths],
        operationOrPirId: input.pirOperationId,
        recoverable: true,
      });
    }
    const measured = measureSolid(oc, shape);
    const id = `repr:occt-native:${sha256Canonical({
      owner: input.semanticOwner,
      pir: input.pirOperationId,
    }).slice(0, 16)}`;
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: input.semanticOwner,
      pirOperationId: input.pirOperationId,
      kernel: 'occt-native',
      validationState:
        measured.volumeMm3 > 0 ? 'geometry-generated' : 'geometry-invalid',
      solid: { kind: 'solid', extentsMm: measured.extentsMm },
      mass: measured,
      subElementPaths: [
        `${input.semanticOwner}/${input.featurePath}/result`,
        ...input.edgePaths,
      ],
      fabricationReady: false,
    };
    this.solids.set(id, {
      kind: input.kind,
      representation,
      shape,
    });
    return representation;
  }

  tessellate(req: TessellateRequest): Mesh {
    const oc = this.requireOc();
    const solid = this.solids.get(req.representationId);
    if (!solid) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `Unknown representation ${req.representationId}`,
        affectedSemanticIds: [req.representationId],
        recoverable: true,
      });
    }
    const chord = req.chordDeviationMm;
    const ang = (req.angleDeviationDeg * Math.PI) / 180;
    new oc.BRepMesh_IncrementalMesh_2(solid.shape, chord, false, ang, false);
    const { vertices, indices } = extractMesh(oc, solid.shape);
    return {
      vertices,
      indices,
      maxDeviationMm: chord,
    };
  }

  shell(req: ShellRequest): GeometryRepresentation {
    const oc = this.requireOc();
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
    const offset = Math.abs(req.offsetMm);
    if (offset >= solid.profileWidthMm / 2 || offset >= solid.profileDepthMm / 2) {
      const failed: GeometryRepresentation = {
        ...solid.representation,
        id: `repr:occt-native:failed:${sha256Canonical({
          base: solid.representation.id,
          offset,
        }).slice(0, 8)}`,
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

    const { min, max } = solid.representation.solid.extentsMm;
    const innerSweep = buildOrientedSweepMesh({
      path: solid.path,
      profileWidthMm: solid.profileWidthMm - 2 * offset,
      profileDepthMm: solid.profileDepthMm - 2 * offset,
      ...(solid.profileUp !== undefined ? { profileUp: solid.profileUp } : {}),
    });
    const innerShape = buildOrientedSweepShape(oc, innerSweep.sections);
    const progress = new oc.Message_ProgressRange_1();
    const cut = new oc.BRepAlgoAPI_Cut_3(solid.shape, innerShape, progress);
    cut.Build(progress);
    if (!cut.IsDone()) {
      throw createSpdsError({
        code: 'HEALING_FAILED',
        summary: 'occt-native oriented shell Boolean cut failed',
        affectedSemanticIds: [req.semanticOwner, req.representationId],
        recoverable: true,
      });
    }
    const shape = cut.Shape();
    const measured = measureSolid(oc, shape);
    const id = `repr:occt-native:${sha256Canonical({
      owner: req.semanticOwner,
      pir: `${solid.representation.pirOperationId}:shell`,
      offset,
    }).slice(0, 16)}`;
    const representation: GeometryRepresentation = {
      id,
      semanticOwner: req.semanticOwner,
      pirOperationId: `${solid.representation.pirOperationId}:shell`,
      kernel: 'occt-native',
      validationState: measured.volumeMm3 > 0 ? 'geometry-generated' : 'geometry-invalid',
      solid: { kind: 'solid', extentsMm: { min: [...min] as Vec3, max: [...max] as Vec3 } },
      mass: {
        volumeMm3: measured.volumeMm3,
        areaMm2: measured.areaMm2,
        centerOfMassMm: measured.centerOfMassMm,
      },
      subElementPaths: solid.representation.subElementPaths,
      fabricationReady: false,
    };
    this.solids.set(id, {
      kind: 'sweep',
      representation,
      shape,
      path: solid.path,
      profileWidthMm: solid.profileWidthMm,
      profileDepthMm: solid.profileDepthMm,
      wallThicknessMm: offset,
      ...(solid.profileUp !== undefined ? { profileUp: solid.profileUp } : {}),
    });
    return representation;
  }

  get(representationId: string): GeometryRepresentation | undefined {
    return this.solids.get(representationId)?.representation;
  }

  resolveTopologyElement(representationId: string, path: string) {
    return this.solids
      .get(representationId)
      ?.representation.topologyElements?.find((element) => element.path === path);
  }

  resolveNativeEdge(
    representationId: string,
    path: string,
  ): OcjsShape | undefined {
    return this.solids.get(representationId)?.edgesByPath?.get(path);
  }

  resolveNativeFace(
    representationId: string,
    path: string,
  ): OcjsShape | undefined {
    return this.solids.get(representationId)?.facesByPath?.get(path);
  }

  /**
   * B-rep measure on stored native solid.
   * Feature paths use the shared AABB box taxonomy (current display model).
   */
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
        layer: req.layer ?? 'geometry-service',
        kernel: this.kernelId,
        label: 'OCCT native (constructive)',
      },
      features: [...req.features],
    };
  }

  /** N1.7 — true STEP from stored native solid (not placeholder STEP text). */
  exportStep(representationId: string): {
    readonly stepText: string;
    readonly contentHash: string;
    readonly fabricationReady: false;
    readonly parametricClaim: 'reference-only';
  } {
    const oc = this.requireOc();
    const solid = this.solids.get(representationId);
    if (!solid) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `Unknown representation ${representationId}`,
        affectedSemanticIds: [representationId],
        recoverable: true,
      });
    }
    const exported = exportShapeToStep(oc, solid.shape, representationId);
    return {
      ...exported,
      fabricationReady: false,
      parametricClaim: 'reference-only',
    };
  }
}

function formProfile(
  profile: ReadonlyArray<readonly [number, number, number]>,
): Vec3[] {
  const points = profile.map((point): Vec3 => [point[0], point[1], point[2]]);
  if (points.length > 3) {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (
      Math.hypot(
        first[0] - last[0],
        first[1] - last[1],
        first[2] - last[2],
      ) <= 1e-9
    ) {
      points.pop();
    }
  }
  return points;
}

function buildPlanarWire(oc: OcjsModule, profile: readonly Vec3[]): unknown {
  const polygon = new oc.BRepBuilderAPI_MakePolygon_1();
  for (const point of profile) {
    polygon.Add_1(new oc.gp_Pnt_3(point[0], point[1], point[2]));
  }
  polygon.Close();
  return polygon.Wire();
}

function buildPlanarFace(oc: OcjsModule, profile: readonly Vec3[]): OcjsShape {
  return new oc.BRepBuilderAPI_MakeFace_15(
    buildPlanarWire(oc, profile),
    true,
  ).Face();
}

function buildPlanarPrismShape(
  oc: OcjsModule,
  profile: readonly Vec3[],
  vector: Vec3,
): OcjsShape {
  return new oc.BRepPrimAPI_MakePrism_1(
    buildPlanarFace(oc, profile),
    new oc.gp_Vec_4(vector[0], vector[1], vector[2]),
    true,
    true,
  ).Shape();
}

function buildOrientedSweepShape(
  oc: OcjsModule,
  sections: readonly OrientedSweepSection[],
): OcjsShape {
  const shapes = sections.map((section) => {
    const points = section.startCorners.map(
      (corner) => new oc.gp_Pnt_3(corner[0], corner[1], corner[2]),
    );
    const polygon = new oc.BRepBuilderAPI_MakePolygon_4(
      points[0]!,
      points[1]!,
      points[2]!,
      points[3]!,
      true,
    );
    const face = new oc.BRepBuilderAPI_MakeFace_15(polygon.Wire(), true).Face();
    return new oc.BRepPrimAPI_MakePrism_1(
      face,
      new oc.gp_Vec_4(
        section.vector[0],
        section.vector[1],
        section.vector[2],
      ),
      true,
      true,
    ).Shape();
  });
  const firstShape = shapes[0];
  if (!firstShape) {
    throw new Error('Oriented sweep produced no segments');
  }
  let shape: OcjsShape = firstShape;
  for (const next of shapes.slice(1)) {
    const progress = new oc.Message_ProgressRange_1();
    const fuseOperation: {
      Build(range: unknown): void;
      IsDone(): boolean;
      Shape(): OcjsShape;
    } = new oc.BRepAlgoAPI_Fuse_3(shape, next, progress);
    fuseOperation.Build(progress);
    if (!fuseOperation.IsDone()) {
      throw new Error('OCCT sweep segment fuse failed');
    }
    shape = fuseOperation.Shape();
  }
  return shape;
}

function extentsVertices(
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): Vec3[] {
  return [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [max[0], max[1], min[2]],
    [min[0], max[1], min[2]],
    [min[0], min[1], max[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], max[2]],
    [min[0], max[1], max[2]],
  ];
}

function shapeBounds(
  oc: OcjsModule,
  shape: OcjsShape,
): GeometryTopologyElement['boundsMm'] {
  const box = new oc.Bnd_Box_1();
  oc.BRepBndLib.Add(shape, box, false);
  const min = box.CornerMin();
  const max = box.CornerMax();
  return {
    min: [min.X(), min.Y(), min.Z()],
    max: [max.X(), max.Y(), max.Z()],
  };
}

function boundsDistance(
  left: GeometryTopologyElement['boundsMm'],
  right: GeometryTopologyElement['boundsMm'],
): number {
  return (
    Math.abs(left.min[0] - right.min[0]) +
    Math.abs(left.min[1] - right.min[1]) +
    Math.abs(left.min[2] - right.min[2]) +
    Math.abs(left.max[0] - right.max[0]) +
    Math.abs(left.max[1] - right.max[1]) +
    Math.abs(left.max[2] - right.max[2])
  );
}

function resolveShapeEdgesByTopology(
  oc: OcjsModule,
  shape: OcjsShape,
  topology: readonly GeometryTopologyElement[],
): ReadonlyMap<string, OcjsShape> {
  const edges: {
    readonly shape: OcjsShape;
    readonly boundsMm: GeometryTopologyElement['boundsMm'];
  }[] = [];
  const explorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  while (explorer.More()) {
    const edge = oc.TopoDS.Edge_1(explorer.Current());
    edges.push({ shape: edge, boundsMm: shapeBounds(oc, edge) });
    explorer.Next();
  }
  const unused = new Set(edges.map((_edge, index) => index));
  const resolved = new Map<string, OcjsShape>();
  for (const element of topology) {
    let bestIndex: number | undefined;
    let bestDistance = Infinity;
    for (const index of unused) {
      const distance = boundsDistance(element.boundsMm, edges[index]!.boundsMm);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    if (bestIndex === undefined || bestDistance > 1e-3) {
      throw new Error(`Unable to resolve native edge ${element.path}`);
    }
    unused.delete(bestIndex);
    resolved.set(element.path, edges[bestIndex]!.shape);
  }
  return resolved;
}

function resolveShapeFacesByTopology(
  oc: OcjsModule,
  shape: OcjsShape,
  topology: readonly GeometryTopologyElement[],
): ReadonlyMap<string, OcjsShape> {
  const faces: {
    readonly shape: OcjsShape;
    readonly boundsMm: GeometryTopologyElement['boundsMm'];
  }[] = [];
  const explorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  while (explorer.More()) {
    const face = oc.TopoDS.Face_1(explorer.Current());
    faces.push({ shape: face, boundsMm: shapeBounds(oc, face) });
    explorer.Next();
  }
  const unused = new Set(faces.map((_face, index) => index));
  const resolved = new Map<string, OcjsShape>();
  for (const element of topology) {
    let bestIndex: number | undefined;
    let bestDistance = Infinity;
    for (const index of unused) {
      const distance = boundsDistance(element.boundsMm, faces[index]!.boundsMm);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    if (bestIndex === undefined || bestDistance > 1e-3) {
      throw new Error(`Unable to resolve native face ${element.path}`);
    }
    unused.delete(bestIndex);
    resolved.set(element.path, faces[bestIndex]!.shape);
  }
  return resolved;
}

function polylineLength(path: ReadonlyArray<Vec3>): number {
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    sum += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return sum;
}

function measureSolid(
  oc: OcjsModule,
  shape: OcjsShape,
): {
  volumeMm3: number;
  areaMm2: number;
  centerOfMassMm: Vec3;
  extentsMm: { min: Vec3; max: Vec3 };
} {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(shape, props, false, false, false);
  const surf = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(shape, surf, false, false);
  const com = props.CentreOfMass();
  const bb = new oc.Bnd_Box_1();
  oc.BRepBndLib.Add(shape, bb, false);
  const mn = bb.CornerMin();
  const mx = bb.CornerMax();
  return {
    volumeMm3: props.Mass(),
    areaMm2: surf.Mass(),
    centerOfMassMm: [com.X(), com.Y(), com.Z()],
    extentsMm: {
      min: [mn.X(), mn.Y(), mn.Z()],
      max: [mx.X(), mx.Y(), mx.Z()],
    },
  };
}

function extractMesh(oc: OcjsModule, shape: OcjsShape): { vertices: Vec3[]; indices: number[] } {
  const vertices: Vec3[] = [];
  const indices: number[] = [];
  const exp = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  while (exp.More()) {
    const face = oc.TopoDS.Face_1(exp.Current());
    const loc = new oc.TopLoc_Location_1();
    const handle = oc.BRep_Tool.Triangulation(face, loc, 0);
    if (!handle.IsNull()) {
      const tri = handle.get();
      const trsf = loc.Transformation();
      const base = vertices.length;
      for (let i = 1; i <= tri.NbNodes(); i++) {
        const p = tri.Node(i).Transformed(trsf);
        vertices.push([p.X(), p.Y(), p.Z()]);
      }
      for (let i = 1; i <= tri.NbTriangles(); i++) {
        const t = tri.Triangle(i);
        indices.push(base + t.Value(1) - 1, base + t.Value(2) - 1, base + t.Value(3) - 1);
      }
    }
    exp.Next();
  }
  return { vertices, indices };
}
