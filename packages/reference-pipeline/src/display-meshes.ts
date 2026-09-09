import {
  InProcessGeometryKernel,
  type GeometryCompileMesh,
  type GeometryCompileRequest,
  type GeometryRepresentation,
} from '@spds/geometry-contracts';
import { runD01ReferencePipeline } from './d01-pipeline.js';

export interface PipelineDisplayMesh {
  readonly representationId: string;
  readonly semanticOwner: string;
  readonly vertices: ReadonlyArray<readonly [number, number, number]>;
  readonly indices: readonly number[];
  readonly triangleCount: number;
  readonly kernel?: 'exact-adapter' | 'occt-wasm' | 'occt-native';
}

/** Tessellate live representations with the same kernel that produced them. */
export function tessellateRepresentations(
  kernel: InProcessGeometryKernel,
  representations: readonly GeometryRepresentation[],
): readonly PipelineDisplayMesh[] {
  return representations.map((rep) => {
    const mesh = kernel.tessellate({
      representationId: rep.id,
      chordDeviationMm: 1,
      angleDeviationDeg: 20,
    });
    return {
      representationId: rep.id,
      semanticOwner: rep.semanticOwner,
      vertices: mesh.vertices,
      indices: mesh.indices,
      triangleCount: Math.floor(mesh.indices.length / 3),
      kernel: 'exact-adapter' as const,
    };
  });
}

export function compileMeshesToDisplay(
  meshes: readonly GeometryCompileMesh[],
): readonly PipelineDisplayMesh[] {
  return meshes.map((m) => ({
    representationId: m.representationId,
    semanticOwner: m.semanticOwner,
    vertices: m.vertices,
    indices: m.indices,
    triangleCount: m.triangleCount,
    kernel: m.kernel,
  }));
}

/** RC-01 — D01 display buffers from schema compile (exact-adapter). */
export async function buildD01DisplayMeshes(options?: {
  readonly yLimit?: number;
  readonly lengthMm?: number;
  /** @deprecated Use lengthMm */
  readonly lengthMmOverride?: number;
  readonly armWidthMm?: number;
  readonly structuralDepthMm?: number;
  readonly frequency?: number;
  readonly diameterMm?: number;
  readonly riseRatio?: number;
}): Promise<{
  readonly pipelineHash: string;
  readonly pirHash: string;
  readonly compileHash: string;
  readonly compileRequest: GeometryCompileRequest;
  readonly meshes: readonly PipelineDisplayMesh[];
  readonly source: 'd01-reference-pipeline';
  readonly parameters: Readonly<Record<string, number>>;
}> {
  const kernel = new InProcessGeometryKernel();
  const lengthMm = options?.lengthMm ?? options?.lengthMmOverride;
  const pipeline = await runD01ReferencePipeline({
    yLimit: options?.yLimit ?? 5,
    kernel,
    ...(lengthMm !== undefined ? { lengthMm } : {}),
    ...(options?.armWidthMm !== undefined ? { armWidthMm: options.armWidthMm } : {}),
    ...(options?.structuralDepthMm !== undefined
      ? { structuralDepthMm: options.structuralDepthMm }
      : {}),
    ...(options?.frequency !== undefined ? { frequency: options.frequency } : {}),
    ...(options?.diameterMm !== undefined ? { diameterMm: options.diameterMm } : {}),
    ...(options?.riseRatio !== undefined ? { riseRatio: options.riseRatio } : {}),
  });
  return {
    pipelineHash: pipeline.pipelineHash,
    pirHash: pipeline.pirHash,
    compileHash: pipeline.compileHash,
    compileRequest: pipeline.compileRequest,
    meshes: compileMeshesToDisplay(pipeline.exactMeshes),
    source: 'd01-reference-pipeline',
    parameters: pipeline.compileRequest.parameters,
  };
}
