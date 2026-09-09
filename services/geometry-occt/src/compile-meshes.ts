import {
  executeExactCompile,
  hashCompileMesh,
  InProcessGeometryKernel,
  parseGeometryCompileRequest,
  type GeometryCompileMesh,
  type GeometryCompileOp,
  type GeometryCompileRequest,
  type GeometryCompileResult,
  type GeometryRepresentation,
} from '@spds/geometry-contracts';
import { compileOpsToStepArtifacts } from './box-step.js';
import type { OcctNativeKernel } from './occt-native-kernel.js';
import type { OcctWasmKernel } from './occt-wasm-kernel.js';

function executeNativeCompileOperation(
  kernel: OcctNativeKernel,
  op: GeometryCompileOp,
  byOperationId: ReadonlyMap<string, GeometryRepresentation>,
): GeometryRepresentation {
  switch (op.op) {
    case 'geometry.sweep@1.0.0':
      return kernel.sweep({
        semanticOwner: op.semanticOwner,
        pirOperationId: op.pirOperationId,
        path: op.path,
        profileWidthMm: op.profileWidthMm,
        profileDepthMm: op.profileDepthMm,
        ...(op.wallThicknessMm !== undefined
          ? { wallThicknessMm: op.wallThicknessMm }
          : {}),
        ...(op.featurePath !== undefined ? { featurePath: op.featurePath } : {}),
        ...(op.profileUp !== undefined ? { profileUp: op.profileUp } : {}),
      });
    case 'geometry.extrude@1.0.0':
      return kernel.extrude({
        semanticOwner: op.semanticOwner,
        pirOperationId: op.pirOperationId,
        profile: op.profile,
        vector: op.vector,
        ...(op.featurePath !== undefined ? { featurePath: op.featurePath } : {}),
      });
    case 'geometry.revolve@1.0.0':
      return kernel.revolve({
        semanticOwner: op.semanticOwner,
        pirOperationId: op.pirOperationId,
        profile: op.profile,
        axisOrigin: op.axisOrigin,
        axisDirection: op.axisDirection,
        angleDeg: op.angleDeg,
        segments: op.segments,
        ...(op.featurePath !== undefined ? { featurePath: op.featurePath } : {}),
      });
    case 'geometry.loft@1.0.0':
      return kernel.loft({
        semanticOwner: op.semanticOwner,
        pirOperationId: op.pirOperationId,
        profiles: op.profiles,
        ruled: op.ruled,
        ...(op.featurePath !== undefined ? { featurePath: op.featurePath } : {}),
      });
    case 'geometry.boolean@1.0.0': {
      const left = byOperationId.get(op.leftOperationId);
      const right = byOperationId.get(op.rightOperationId);
      if (!left || !right) {
        throw new Error(
          `Boolean ${op.pirOperationId} requires prior operations ${op.leftOperationId} and ${op.rightOperationId}`,
        );
      }
      return kernel.boolean({
        semanticOwner: op.semanticOwner,
        pirOperationId: op.pirOperationId,
        operation: op.operation,
        leftRepresentationId: left.id,
        rightRepresentationId: right.id,
        ...(op.featurePath !== undefined ? { featurePath: op.featurePath } : {}),
      });
    }
    case 'geometry.trim-plane@1.0.0': {
      const source = byOperationId.get(op.sourceOperationId);
      if (!source) {
        throw new Error(
          `Plane trim ${op.pirOperationId} requires prior operation ${op.sourceOperationId}`,
        );
      }
      return kernel.trimPlane({
        semanticOwner: op.semanticOwner,
        pirOperationId: op.pirOperationId,
        sourceRepresentationId: source.id,
        planeOrigin: op.planeOrigin,
        planeNormal: op.planeNormal,
        keep: op.keep,
        ...(op.featurePath !== undefined ? { featurePath: op.featurePath } : {}),
      });
    }
    case 'geometry.edge-fillet@1.0.0': {
      const source = byOperationId.get(op.sourceOperationId);
      if (!source) {
        throw new Error(
          `Edge fillet ${op.pirOperationId} requires prior operation ${op.sourceOperationId}`,
        );
      }
      return kernel.fillet({
        semanticOwner: op.semanticOwner,
        pirOperationId: op.pirOperationId,
        sourceRepresentationId: source.id,
        edgePaths: op.edgePaths,
        radiusMm: op.radiusMm,
        ...(op.featurePath !== undefined ? { featurePath: op.featurePath } : {}),
      });
    }
    case 'geometry.edge-chamfer@1.0.0': {
      const source = byOperationId.get(op.sourceOperationId);
      if (!source) {
        throw new Error(
          `Edge chamfer ${op.pirOperationId} requires prior operation ${op.sourceOperationId}`,
        );
      }
      return kernel.chamfer({
        semanticOwner: op.semanticOwner,
        pirOperationId: op.pirOperationId,
        sourceRepresentationId: source.id,
        edgePaths: op.edgePaths,
        distanceMm: op.distanceMm,
        ...(op.featurePath !== undefined ? { featurePath: op.featurePath } : {}),
      });
    }
    case 'geometry.face-shell@1.0.0': {
      const source = byOperationId.get(op.sourceOperationId);
      if (!source) {
        throw new Error(
          `Face shell ${op.pirOperationId} requires prior operation ${op.sourceOperationId}`,
        );
      }
      return kernel.shellFaces({
        semanticOwner: op.semanticOwner,
        pirOperationId: op.pirOperationId,
        sourceRepresentationId: source.id,
        removedFacePaths: op.removedFacePaths,
        thicknessMm: op.thicknessMm,
        inward: op.inward,
        ...(op.featurePath !== undefined ? { featurePath: op.featurePath } : {}),
      });
    }
    case 'geometry.face-draft@1.0.0': {
      const source = byOperationId.get(op.sourceOperationId);
      if (!source) {
        throw new Error(
          `Face draft ${op.pirOperationId} requires prior operation ${op.sourceOperationId}`,
        );
      }
      return kernel.draftFaces({
        semanticOwner: op.semanticOwner,
        pirOperationId: op.pirOperationId,
        sourceRepresentationId: source.id,
        selectedFacePaths: op.selectedFacePaths,
        pullDirection: op.pullDirection,
        neutralPlaneOrigin: op.neutralPlaneOrigin,
        neutralPlaneNormal: op.neutralPlaneNormal,
        angleDeg: op.angleDeg,
        reverse: op.reverse,
        ...(op.featurePath !== undefined ? { featurePath: op.featurePath } : {}),
      });
    }
    default: {
      const exhaustive: never = op;
      return exhaustive;
    }
  }
}

export async function compileMeshesExact(
  req: GeometryCompileRequest,
): Promise<GeometryCompileResult> {
  const kernel = new InProcessGeometryKernel();
  return executeExactCompile(kernel, req);
}

/**
 * Schema compile → STEP boxes → OCCT WASM tessellate, rebound to compile owners.
 */
export async function compileMeshesOcctWasm(
  kernel: OcctWasmKernel,
  req: GeometryCompileRequest,
): Promise<{
  readonly meshes: readonly GeometryCompileMesh[];
  readonly stepHashes: readonly string[];
  readonly kernel: 'occt-wasm';
}> {
  const artifacts = compileOpsToStepArtifacts(req.ops);
  const meshes: GeometryCompileMesh[] = [];
  const stepHashes: string[] = [];

  for (const art of artifacts) {
    stepHashes.push(art.contentHash);
    const imported = await kernel.importStep({
      bytes: art.stepText,
      semanticOwnerPrefix: 'compile:tmp',
    });
    const solid = imported.solids[0];
    if (!solid || solid.mesh.vertices.length === 0) {
      throw new Error(`OCCT produced no mesh for ${art.semanticOwner}`);
    }
    meshes.push({
      representationId: `repr:occt:${art.contentHash.slice(0, 16)}`,
      semanticOwner: art.semanticOwner,
      pirOperationId: art.pirOperationId,
      kernel: 'occt-wasm',
      vertices: solid.mesh.vertices,
      indices: solid.mesh.indices,
      triangleCount: Math.floor(solid.mesh.indices.length / 3),
      maxDeviationMm: solid.mesh.maxDeviationMm,
    });
  }

  return { meshes, stepHashes, kernel: 'occt-wasm' };
}

/**
 * Schema compile → constructive OCCT B-rep (opencascade.js) → tessellate.
 * No STEP-box remapping.
 */
export async function compileMeshesOcctNative(
  kernel: OcctNativeKernel,
  req: GeometryCompileRequest,
): Promise<{
  readonly representations: readonly GeometryRepresentation[];
  readonly meshes: readonly GeometryCompileMesh[];
  readonly meshHashes: readonly string[];
  readonly stepHashes: readonly string[];
  readonly kernel: 'occt-native';
}> {
  await kernel.ensureReady();
  const representations: GeometryRepresentation[] = [];
  const meshes: GeometryCompileMesh[] = [];
  const stepHashes: string[] = [];
  const byOperationId = new Map<string, GeometryRepresentation>();
  for (const op of req.ops) {
    if (byOperationId.has(op.pirOperationId)) {
      throw new Error(`Duplicate compile operation id ${op.pirOperationId}`);
    }
    const rep = executeNativeCompileOperation(kernel, op, byOperationId);
    byOperationId.set(op.pirOperationId, rep);
    representations.push(rep);
    if (op.visibility === 'construction') continue;
    const mesh = kernel.tessellate({
      representationId: rep.id,
      chordDeviationMm: req.chordDeviationMm,
      angleDeviationDeg: req.angleDeviationDeg,
    });
    meshes.push({
      representationId: rep.id,
      semanticOwner: op.semanticOwner,
      pirOperationId: op.pirOperationId,
      kernel: 'occt-native',
      vertices: mesh.vertices,
      indices: mesh.indices,
      triangleCount: Math.floor(mesh.indices.length / 3),
      maxDeviationMm: mesh.maxDeviationMm,
    });
    const step = kernel.exportStep(rep.id);
    stepHashes.push(step.contentHash);
  }
  return {
    representations,
    meshes,
    meshHashes: meshes.map(hashCompileMesh),
    stepHashes,
    kernel: 'occt-native',
  };
}

export async function compileMeshesDual(input: {
  readonly compile: unknown;
  readonly occtKernel?: OcctWasmKernel | null;
  readonly nativeKernel?: OcctNativeKernel | null;
}): Promise<{
  readonly exact: GeometryCompileResult;
  readonly occt?: {
    readonly meshes: readonly GeometryCompileMesh[];
    readonly stepHashes: readonly string[];
    readonly kernel: 'occt-wasm';
  };
  readonly occtNative?: {
    readonly representations: readonly GeometryRepresentation[];
    readonly meshes: readonly GeometryCompileMesh[];
    readonly meshHashes: readonly string[];
    readonly stepHashes: readonly string[];
    readonly kernel: 'occt-native';
  };
  readonly occtError?: string;
  readonly occtNativeError?: string;
}> {
  const req = parseGeometryCompileRequest(input.compile);
  const exact = await compileMeshesExact(req);

  let occt:
    | {
        readonly meshes: readonly GeometryCompileMesh[];
        readonly stepHashes: readonly string[];
        readonly kernel: 'occt-wasm';
      }
    | undefined;
  let occtError: string | undefined;
  if (input.occtKernel) {
    try {
      occt = await compileMeshesOcctWasm(input.occtKernel, req);
    } catch (err) {
      occtError = err instanceof Error ? err.message : 'OCCT WASM compile failed';
    }
  } else {
    occtError = 'OCCT WASM kernel not configured';
  }

  let occtNative:
    | {
        readonly representations: readonly GeometryRepresentation[];
        readonly meshes: readonly GeometryCompileMesh[];
        readonly meshHashes: readonly string[];
        readonly stepHashes: readonly string[];
        readonly kernel: 'occt-native';
      }
    | undefined;
  let occtNativeError: string | undefined;
  if (input.nativeKernel) {
    try {
      occtNative = await compileMeshesOcctNative(input.nativeKernel, req);
    } catch (err) {
      occtNativeError = err instanceof Error ? err.message : 'OCCT native compile failed';
    }
  }

  const extraHashes = [
    ...(occt?.stepHashes ?? []),
    ...(occtNative?.meshHashes ?? []),
    ...(occtNative?.stepHashes ?? []),
  ];

  return {
    exact:
      extraHashes.length > 0
        ? { ...exact, artifactHashes: [...exact.artifactHashes, ...extraHashes] }
        : exact,
    ...(occt ? { occt } : {}),
    ...(occtNative ? { occtNative } : {}),
    ...(occtError !== undefined && !occt ? { occtError } : {}),
    ...(occtNativeError !== undefined ? { occtNativeError } : {}),
  };
}
