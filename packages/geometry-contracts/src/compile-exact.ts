import { sha256Canonical } from '@spds/reproducibility';
import type { InProcessGeometryKernel } from './kernel.js';
import type { GeometryRepresentation } from './dto.js';
import {
  compileRequestDigest,
  type GeometryCompileMesh,
  type GeometryCompileOp,
  type GeometryCompileRequest,
  type GeometryCompileResult,
} from './compile.js';

function executeCompileOperation(
  kernel: InProcessGeometryKernel,
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

/** Content hash for a disposable display mesh (metadata for artifact store). */
export function hashCompileMesh(mesh: GeometryCompileMesh): string {
  return sha256Canonical({
    semanticOwner: mesh.semanticOwner,
    pirOperationId: mesh.pirOperationId,
    kernel: mesh.kernel,
    triangleCount: mesh.triangleCount,
    vertices: mesh.vertices,
    indices: mesh.indices,
  });
}

/** Execute a compile request on the exact-adapter kernel (in-process). */
export function executeExactCompile(
  kernel: InProcessGeometryKernel,
  req: GeometryCompileRequest,
): GeometryCompileResult {
  const representations: GeometryRepresentation[] = [];
  const byOperationId = new Map<string, GeometryRepresentation>();
  for (const op of req.ops) {
    if (byOperationId.has(op.pirOperationId)) {
      throw new Error(`Duplicate compile operation id ${op.pirOperationId}`);
    }
    const representation = executeCompileOperation(kernel, op, byOperationId);
    representations.push(representation);
    byOperationId.set(op.pirOperationId, representation);
  }

  const meshes: GeometryCompileMesh[] = representations.flatMap((rep, index) => {
    if (req.ops[index]?.visibility === 'construction') return [];
    const mesh = kernel.tessellate({
      representationId: rep.id,
      chordDeviationMm: req.chordDeviationMm,
      angleDeviationDeg: req.angleDeviationDeg,
    });
    return [{
      representationId: rep.id,
      semanticOwner: rep.semanticOwner,
      pirOperationId: rep.pirOperationId,
      kernel: 'exact-adapter' as const,
      vertices: mesh.vertices,
      indices: mesh.indices,
      triangleCount: Math.floor(mesh.indices.length / 3),
      maxDeviationMm: mesh.maxDeviationMm,
    }];
  });

  const artifactHashes = meshes.map(hashCompileMesh);

  return {
    compileHash: compileRequestDigest(req),
    snapshotHash: req.snapshotHash,
    pirHash: req.pirHash,
    dagHash: req.dagHash,
    compilerVersion: req.compilerVersion,
    parameters: req.parameters,
    representations,
    meshes,
    artifactHashes,
  };
}
