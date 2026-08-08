/**
 * Analysis Mesh View — semantic physical groups + indicative result labels.
 * Never presents results as certification claims.
 */

export interface AnalysisMeshGroupView {
  readonly name: string;
  readonly role: 'material' | 'support' | 'load';
  readonly semanticIds: readonly string[];
  readonly elementCountHint: number;
}

export interface AnalysisResultLabelView {
  readonly entityId: string;
  readonly text: string;
  readonly indicative: true;
}

export interface AnalysisMeshViewModel {
  readonly meshArtifactHash: string;
  readonly elementCount: number;
  readonly groups: readonly AnalysisMeshGroupView[];
  readonly labels: readonly AnalysisResultLabelView[];
  readonly labelPolicy: 'computational-indicative';
  readonly chromeNote: string;
}

export function buildAnalysisMeshView(input: {
  readonly meshArtifactHash: string;
  readonly elementCount: number;
  readonly groupMapping: Readonly<Record<string, readonly string[]>>;
  readonly groupRoles?: Readonly<Record<string, 'material' | 'support' | 'load'>>;
  readonly labels?: readonly AnalysisResultLabelView[];
}): AnalysisMeshViewModel {
  const groups: AnalysisMeshGroupView[] = Object.entries(input.groupMapping).map(([name, semanticIds]) => ({
    name,
    role: input.groupRoles?.[name] ?? 'material',
    semanticIds,
    elementCountHint: Math.max(1, Math.floor(input.elementCount / Math.max(1, Object.keys(input.groupMapping).length))),
  }));
  return {
    meshArtifactHash: input.meshArtifactHash,
    elementCount: input.elementCount,
    groups,
    labels: input.labels ?? [],
    labelPolicy: 'computational-indicative',
    chromeNote: 'Computational / indicative — not a certification claim',
  };
}

export function analysisLabelIsIndicative(view: AnalysisMeshViewModel): boolean {
  return (
    view.labelPolicy === 'computational-indicative' &&
    view.labels.every((l) => l.indicative) &&
    view.chromeNote.toLowerCase().includes('indicative')
  );
}
