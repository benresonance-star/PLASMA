import {
  attachGroupsToAnalysis,
  deriveBeamsFromYNetwork,
  exportAnalysisFixture,
  importResultsMock,
  type AnalysisModel,
  type AnalysisResultField,
  type ResultsImport,
  type SolverExportFixture,
} from '@spds/analysis-core';
import { runMeshJob, type MeshArtifact, type MeshRequest } from '@spds/meshing-adapter';

/**
 * G15 / E7 analysis-worker — mesh → solver-neutral analysis export/import.
 * Not a real FEM solver; results are computational/indicative only.
 */

export type AnalysisJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'stale';

export interface AnalysisJobRequest {
  readonly requestId: string;
  readonly mesh: MeshRequest;
  readonly yMembers: readonly {
    readonly id: string;
    readonly a: readonly [number, number, number];
    readonly b: readonly [number, number, number];
  }[];
  readonly currentHeadHash?: string;
}

export interface AnalysisJobResult {
  readonly status: AnalysisJobStatus;
  readonly meshArtifact?: MeshArtifact;
  readonly model?: AnalysisModel;
  readonly exportFixture?: SolverExportFixture;
  readonly results?: ResultsImport;
  readonly failureCode?: string;
}

export function runAnalysisJob(req: AnalysisJobRequest): AnalysisJobResult {
  if (req.mesh.cancelToken?.cancelled) {
    return { status: 'cancelled', failureCode: 'CANCELLED' };
  }
  if (
    req.mesh.expectedHeadHash &&
    req.currentHeadHash &&
    req.mesh.expectedHeadHash !== req.currentHeadHash
  ) {
    return { status: 'stale', failureCode: 'STALE_RESULT' };
  }
  if (req.mesh.timeoutMs <= 0 || req.mesh.resourceBudgetMb <= 0) {
    return { status: 'failed', failureCode: 'RESOURCE_LIMIT' };
  }

  const meshResult = runMeshJob(req.mesh, req.currentHeadHash);
  if (meshResult.status !== 'succeeded' || !meshResult.artifact) {
    return {
      status: meshResult.status === 'cancelled' ? 'cancelled' : meshResult.status === 'stale' ? 'stale' : 'failed',
      failureCode: meshResult.failureCode ?? 'MESH_FAILED',
    };
  }

  const groups = attachGroupsToAnalysis({
    materialGroupSemanticIds: req.mesh.physicalGroups
      .filter((g) => g.role === 'material')
      .flatMap((g) => g.semanticIds),
    supportGroupSemanticIds: req.mesh.physicalGroups
      .filter((g) => g.role === 'support')
      .flatMap((g) => g.semanticIds),
    loadGroupSemanticIds: req.mesh.physicalGroups
      .filter((g) => g.role === 'load')
      .flatMap((g) => g.semanticIds),
  });

  const derived = deriveBeamsFromYNetwork(req.yMembers, 'sec:pipe', 'mat:steel');
  const model: AnalysisModel = {
    modelId: `analysis:${req.requestId}`,
    nodes: derived.nodes,
    beams: derived.beams,
    shells: [],
    solids: [
      {
        id: 'solid:mesh',
        meshArtifactHash: meshResult.artifact.artifactHash,
        materialId: 'mat:steel',
      },
    ],
    materials: [
      { id: 'mat:steel', E_MPa: 210_000, nu: 0.3, densityKgPerM3: 7850 },
    ],
    sections: [{ id: 'sec:pipe', areaMm2: 500, IyMm4: 20_000, IzMm4: 20_000 }],
    supports: derived.nodes[0]
      ? [
          {
            id: 'sup:1',
            nodeId: derived.nodes[0].id,
            fixedDof: ['ux', 'uy', 'uz'],
            semanticGroupId: groups.supportGroupId,
          },
        ]
      : [],
    loads: derived.nodes[derived.nodes.length - 1]
      ? [
          {
            id: 'load:1',
            kind: 'force',
            targetId: derived.nodes[derived.nodes.length - 1]!.id,
            components: [0, 0, -1000],
            semanticGroupId: groups.loadGroupId,
          },
        ]
      : [],
    loadCases: [{ id: 'lc:1', name: 'indicative', loadIds: ['load:1'] }],
  };

  const exportFixture = exportAnalysisFixture(model);
  const fields: AnalysisResultField[] = [
    {
      loadCaseId: 'lc:1',
      quantity: 'utilization',
      valuesByEntityId: Object.fromEntries(
        derived.beams.map((b, i) => [b.id, 0.2 + i * 0.05]),
      ),
      labelPolicy: 'computational-indicative',
    },
  ];
  const results = importResultsMock(fields);

  return {
    status: 'succeeded',
    meshArtifact: meshResult.artifact,
    model,
    exportFixture,
    results,
  };
}

export { packageId } from './package-id.js';
