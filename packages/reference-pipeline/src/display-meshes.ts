import {
  InProcessGeometryKernel,
  type GeometryRepresentation,
} from '@spds/geometry-contracts';
import { runD01ReferencePipeline } from './d01-pipeline.js';

export interface PipelineDisplayMesh {
  readonly representationId: string;
  readonly semanticOwner: string;
  readonly vertices: ReadonlyArray<readonly [number, number, number]>;
  readonly indices: readonly number[];
  readonly triangleCount: number;
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
    };
  });
}

/** RC-01 — D01 exact display buffers for viewport (server/API side). */
export async function buildD01DisplayMeshes(options?: {
  readonly yLimit?: number;
  readonly lengthMmOverride?: number;
}): Promise<{
  readonly pipelineHash: string;
  readonly pirHash: string;
  readonly meshes: readonly PipelineDisplayMesh[];
  readonly source: 'd01-reference-pipeline';
}> {
  const kernel = new InProcessGeometryKernel();
  const pipeline = await runD01ReferencePipeline({
    yLimit: options?.yLimit ?? 5,
    kernel,
    ...(options?.lengthMmOverride !== undefined
      ? { lengthMmOverride: options.lengthMmOverride }
      : {}),
  });
  return {
    pipelineHash: pipeline.pipelineHash,
    pirHash: pipeline.pirHash,
    meshes: tessellateRepresentations(kernel, pipeline.representations),
    source: 'd01-reference-pipeline',
  };
}
