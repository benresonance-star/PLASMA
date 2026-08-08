/**
 * G15 Solver-neutral analysis contracts — not a real FEM solver.
 * Results are computational/indicative only; never certification claims.
 */

export type AnalysisLabelPolicy = 'computational-indicative';

export interface AnalysisNode {
  readonly id: string;
  readonly positionMm: readonly [number, number, number];
}

export interface AnalysisBeam {
  readonly id: string;
  readonly nodeA: string;
  readonly nodeB: string;
  readonly sectionId: string;
  readonly materialId: string;
  readonly semanticSourceId: string;
}

export interface AnalysisShell {
  readonly id: string;
  readonly nodeIds: readonly string[];
  readonly thicknessMm: number;
  readonly materialId: string;
}

export interface AnalysisSolid {
  readonly id: string;
  readonly meshArtifactHash: string;
  readonly materialId: string;
}

export interface AnalysisMaterial {
  readonly id: string;
  readonly E_MPa: number;
  readonly nu: number;
  readonly densityKgPerM3: number;
}

export interface AnalysisSection {
  readonly id: string;
  readonly areaMm2: number;
  readonly IyMm4: number;
  readonly IzMm4: number;
}

export interface AnalysisSupport {
  readonly id: string;
  readonly nodeId: string;
  readonly fixedDof: readonly ('ux' | 'uy' | 'uz' | 'rx' | 'ry' | 'rz')[];
  readonly semanticGroupId: string;
}

export interface AnalysisLoad {
  readonly id: string;
  readonly kind: 'force' | 'pressure' | 'gravity';
  readonly targetId: string;
  readonly components: readonly number[];
  readonly semanticGroupId: string;
}

export interface AnalysisLoadCase {
  readonly id: string;
  readonly name: string;
  readonly loadIds: readonly string[];
}

export interface AnalysisResultField {
  readonly loadCaseId: string;
  readonly quantity: 'displacement' | 'stress' | 'utilization';
  readonly valuesByEntityId: Readonly<Record<string, number>>;
  readonly labelPolicy: AnalysisLabelPolicy;
}

export interface AnalysisModel {
  readonly modelId: string;
  readonly nodes: readonly AnalysisNode[];
  readonly beams: readonly AnalysisBeam[];
  readonly shells: readonly AnalysisShell[];
  readonly solids: readonly AnalysisSolid[];
  readonly materials: readonly AnalysisMaterial[];
  readonly sections: readonly AnalysisSection[];
  readonly supports: readonly AnalysisSupport[];
  readonly loads: readonly AnalysisLoad[];
  readonly loadCases: readonly AnalysisLoadCase[];
}

export function deriveBeamsFromYNetwork(
  ys: readonly {
    readonly id: string;
    readonly a: readonly [number, number, number];
    readonly b: readonly [number, number, number];
  }[],
  sectionId: string,
  materialId: string,
): { readonly nodes: AnalysisNode[]; readonly beams: AnalysisBeam[] } {
  const nodes: AnalysisNode[] = [];
  const beams: AnalysisBeam[] = [];
  for (const y of ys) {
    const nodeA = `node:${y.id}:a`;
    const nodeB = `node:${y.id}:b`;
    nodes.push({ id: nodeA, positionMm: y.a }, { id: nodeB, positionMm: y.b });
    beams.push({
      id: `beam:${y.id}`,
      nodeA,
      nodeB,
      sectionId,
      materialId,
      semanticSourceId: y.id,
    });
  }
  return { nodes, beams };
}

export function attachGroupsToAnalysis(input: {
  readonly materialGroupSemanticIds: readonly string[];
  readonly supportGroupSemanticIds: readonly string[];
  readonly loadGroupSemanticIds: readonly string[];
}): {
  readonly materialGroupId: string;
  readonly supportGroupId: string;
  readonly loadGroupId: string;
  readonly mappedSemanticIds: readonly string[];
} {
  return {
    materialGroupId: 'group:material',
    supportGroupId: 'group:support',
    loadGroupId: 'group:load',
    mappedSemanticIds: [
      ...input.materialGroupSemanticIds,
      ...input.supportGroupSemanticIds,
      ...input.loadGroupSemanticIds,
    ],
  };
}

export interface SolverExportFixture {
  readonly format: 'spds-analysis-json';
  readonly payload: string;
  readonly labelPolicy: AnalysisLabelPolicy;
}

export function exportAnalysisFixture(model: AnalysisModel): SolverExportFixture {
  return {
    format: 'spds-analysis-json',
    payload: JSON.stringify(model),
    labelPolicy: 'computational-indicative',
  };
}

export interface ResultsImport {
  readonly fields: readonly AnalysisResultField[];
  readonly viewportLabels: readonly {
    readonly entityId: string;
    readonly text: string;
    readonly indicative: true;
  }[];
}

export function importResultsMock(fields: readonly AnalysisResultField[]): ResultsImport {
  for (const f of fields) {
    if (f.labelPolicy !== 'computational-indicative') {
      throw new Error('Results must be labeled computational/indicative');
    }
  }
  const viewportLabels = fields.flatMap((f) =>
    Object.entries(f.valuesByEntityId).map(([entityId, value]) => ({
      entityId,
      text: `${f.quantity}=${value} (indicative)`,
      indicative: true as const,
    })),
  );
  return { fields, viewportLabels };
}

export function buildD01AnalysisFixture(): AnalysisModel {
  const material: AnalysisMaterial = {
    id: 'mat:steel',
    E_MPa: 210_000,
    nu: 0.3,
    densityKgPerM3: 7850,
  };
  const section: AnalysisSection = {
    id: 'sec:pipe',
    areaMm2: 500,
    IyMm4: 20_000,
    IzMm4: 20_000,
  };
  const derived = deriveBeamsFromYNetwork(
    [
      { id: 'Y:1', a: [0, 0, 0], b: [1000, 0, 0] },
      { id: 'Y:2', a: [1000, 0, 0], b: [1500, 500, 0] },
    ],
    section.id,
    material.id,
  );
  return {
    modelId: 'analysis:D01',
    nodes: derived.nodes,
    beams: derived.beams,
    shells: [],
    solids: [],
    materials: [material],
    sections: [section],
    supports: [
      {
        id: 'sup:1',
        nodeId: derived.nodes[0]!.id,
        fixedDof: ['ux', 'uy', 'uz'],
        semanticGroupId: 'group:support',
      },
    ],
    loads: [
      {
        id: 'load:1',
        kind: 'force',
        targetId: derived.nodes[derived.nodes.length - 1]!.id,
        components: [0, 0, -1000],
        semanticGroupId: 'group:load',
      },
    ],
    loadCases: [{ id: 'lc:1', name: 'gravity+point', loadIds: ['load:1'] }],
  };
}
