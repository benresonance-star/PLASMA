/**
 * Model-scoped semantic query context (SDI Wave 0 live substrate).
 * Product routes must resolve graph/provenance/meshes by modelId — not a process-global fixture.
 */

import { ProvenanceStore } from '@spds/topology-provenance';
import { IndexedSemanticGraph, buildG3bFixture, type QueryableObject } from '@spds/semantic-query';
import { buildD01DisplayMeshes, type PipelineDisplayMesh } from '@spds/reference-pipeline';

export type ModelQueryContextSource = 'live-d01' | 'unit-g3b';

export interface ModelQueryContext {
  readonly modelId: string;
  readonly source: ModelQueryContextSource;
  readonly graph: IndexedSemanticGraph;
  readonly provenance: ProvenanceStore;
  readonly dependencyEdges: ReadonlyArray<{
    readonly from: string;
    readonly to: string;
    readonly relationType?: string;
  }>;
  readonly displayMeshes: readonly PipelineDisplayMesh[];
  readonly pipelineHash?: string;
  readonly parameters: Readonly<Record<string, number>>;
}

export class ModelQueryContextRegistry {
  private readonly byModel = new Map<string, ModelQueryContext>();

  get(modelId: string): ModelQueryContext | null {
    return this.byModel.get(modelId) ?? null;
  }

  set(ctx: ModelQueryContext): void {
    this.byModel.set(ctx.modelId, ctx);
  }

  has(modelId: string): boolean {
    return this.byModel.has(modelId);
  }

  /** Unit-test helper: register G3b under an explicit model id (never the default product path). */
  seedUnitG3b(modelId = 'model:fixture'): ModelQueryContext {
    const g3b = buildG3bFixture();
    const ctx: ModelQueryContext = {
      modelId,
      source: 'unit-g3b',
      graph: g3b.graph,
      provenance: g3b.provenance,
      dependencyEdges: g3b.dependencyEdges.map((e) => ({
        ...e,
        relationType: 'depends-on',
      })),
      displayMeshes: [],
      parameters: {},
    };
    this.set(ctx);
    return ctx;
  }
}

/**
 * Build a live D01 query context: pipeline display meshes + graph whose ids match semanticOwner.
 */
export async function buildLiveD01QueryContext(
  modelId: string,
  options?: {
    readonly yLimit?: number;
    readonly lengthMm?: number;
    readonly armWidthMm?: number;
    readonly structuralDepthMm?: number;
    readonly frequency?: number;
    readonly diameterMm?: number;
    readonly riseRatio?: number;
  },
): Promise<ModelQueryContext> {
  const built = await buildD01DisplayMeshes({
    yLimit: options?.yLimit ?? 5,
    ...(options?.lengthMm !== undefined ? { lengthMm: options.lengthMm } : {}),
    ...(options?.armWidthMm !== undefined ? { armWidthMm: options.armWidthMm } : {}),
    ...(options?.structuralDepthMm !== undefined
      ? { structuralDepthMm: options.structuralDepthMm }
      : {}),
    ...(options?.frequency !== undefined ? { frequency: options.frequency } : {}),
    ...(options?.diameterMm !== undefined ? { diameterMm: options.diameterMm } : {}),
    ...(options?.riseRatio !== undefined ? { riseRatio: options.riseRatio } : {}),
  });

  const owners = [...new Set(built.meshes.map((m) => m.semanticOwner))];
  const objects: QueryableObject[] = [
    {
      id: modelId,
      semanticType: 'structure.geodesic-dome',
      tags: ['d01', 'live-substrate'],
      attributes: { pipelineHash: built.pipelineHash },
    },
  ];

  const dependencyEdges: Array<{
    from: string;
    to: string;
    relationType?: string;
  }> = [];
  const provenance = new ProvenanceStore();

  const paramIds: string[] = [];
  for (const [key, value] of Object.entries(built.parameters)) {
    const paramId = `param:d01:${key}`;
    paramIds.push(paramId);
    objects.push({
      id: paramId,
      semanticType: 'parameter.number',
      attributes: { value, key },
      edges: [{ type: 'part-of', to: modelId }],
    });
    dependencyEdges.push({
      from: paramId,
      to: modelId,
      relationType: 'part-of',
    });
  }

  // Length parameter always present for explain/impact demos even if compile defaults omit it.
  if (!paramIds.includes('param:d01:lengthMm')) {
    const lengthMm = options?.lengthMm ?? 2300;
    paramIds.push('param:d01:lengthMm');
    objects.push({
      id: 'param:d01:lengthMm',
      semanticType: 'parameter.number',
      attributes: { value: lengthMm, key: 'lengthMm' },
      edges: [{ type: 'part-of', to: modelId }],
    });
  }

  const patternId = 'pattern:d01:y-network';
  objects.push({
    id: patternId,
    semanticType: 'pattern.y-network',
    tags: ['pattern'],
    attributes: { yCount: owners.length },
    edges: [
      { type: 'part-of', to: modelId },
      ...paramIds.map((p) => ({ type: 'driven-by', to: p })),
    ],
  });
  for (const p of paramIds) {
    dependencyEdges.push({
      from: p,
      to: patternId,
      relationType: 'pattern.drives',
    });
  }

  for (const owner of owners) {
    objects.push({
      id: owner,
      semanticType: 'structural.y-component',
      tags: ['generated', 'primary'],
      attributes: { source: 'd01-reference-pipeline' },
      edges: [
        { type: 'generated-from', to: patternId },
        { type: 'part-of', to: modelId },
      ],
      capabilities: ['fabricate.panel'],
    });
    dependencyEdges.push({
      from: patternId,
      to: owner,
      relationType: 'produces',
    });
    for (const p of paramIds) {
      dependencyEdges.push({
        from: p,
        to: owner,
        relationType: 'depends-on',
      });
    }
    provenance.write({
      id: `prov:${owner}`,
      semanticAnchor: owner,
      relation: 'generated-from',
      pirOperationId: `pir:y-brep:${owner}`,
      kernelResultId: `kernel:exact:${owner}`,
      subElementIds: [],
      causes: [patternId, ...paramIds],
    });
  }

  // Live field + constraint objects so Causal F/C lenses and viewport tint need no explorer fallbacks.
  const fieldId = 'field:d01:distance';
  objects.push({
    id: fieldId,
    semanticType: 'field.distance',
    tags: ['field', 'live-substrate'],
    attributes: { sampleGridSize: 64 },
    edges: [
      { type: 'part-of', to: modelId },
      ...owners.map((o) => ({ type: 'influences', to: o })),
    ],
  });
  for (const owner of owners) {
    dependencyEdges.push({
      from: fieldId,
      to: owner,
      relationType: 'influences',
    });
  }

  const constraintId = 'constraint:d01.max-member-length';
  const limitedOwners = owners.slice(0, Math.min(4, owners.length));
  objects.push({
    id: constraintId,
    semanticType: 'constraint.fabrication.max-length',
    tags: ['constraint', 'live-substrate'],
    attributes: {
      operator: 'less-than-or-equal',
      limitMm: 2400,
      property: 'fabrication.memberLength',
    },
    edges: [
      { type: 'part-of', to: modelId },
      ...limitedOwners.map((o) => ({ type: 'limits', to: o })),
    ],
  });
  for (const owner of limitedOwners) {
    dependencyEdges.push({
      from: constraintId,
      to: owner,
      relationType: 'limits',
    });
  }

  return {
    modelId,
    source: 'live-d01',
    graph: new IndexedSemanticGraph(objects),
    provenance,
    dependencyEdges,
    displayMeshes: built.meshes,
    pipelineHash: built.pipelineHash,
    parameters: {
      ...built.parameters,
      ...(paramIds.includes('param:d01:lengthMm') && built.parameters.lengthMm === undefined
        ? { lengthMm: options?.lengthMm ?? 2300 }
        : {}),
    },
  };
}
