/** G9.1 Pipeline view-model bound to execution DAG stage status. */

export type PipelineStageStatus =
  | 'pending'
  | 'running'
  | 'cached'
  | 'succeeded'
  | 'failed'
  | 'warning';

export interface PipelineStageView {
  readonly id: string;
  readonly operator: string;
  readonly semanticOwner: string;
  readonly status: PipelineStageStatus;
  readonly timingMs: number | null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly dependsOn: readonly string[];
}

export interface PipelineViewModel {
  readonly dagId: string;
  readonly stages: readonly PipelineStageView[];
  readonly totalTimingMs: number;
  readonly failedStageIds: readonly string[];
}

export function buildPipelineView(input: {
  readonly dagId: string;
  readonly nodes: readonly {
    readonly id: string;
    readonly operator: string;
    readonly semanticOwner: string;
    readonly status: PipelineStageStatus;
    readonly timingMs?: number;
    readonly diagnostics?: readonly string[];
    readonly dependsOn: readonly string[];
  }[];
}): PipelineViewModel {
  const stages: PipelineStageView[] = input.nodes.map((n) => {
    const diagnostics = n.diagnostics ?? [];
    const errors = n.status === 'failed' ? diagnostics : [];
    const warnings = n.status === 'warning' ? diagnostics : diagnostics.filter((d) => d.startsWith('warn:'));
    return {
      id: n.id,
      operator: n.operator,
      semanticOwner: n.semanticOwner,
      status: n.status,
      timingMs: n.timingMs ?? null,
      errors,
      warnings,
      dependsOn: n.dependsOn,
    };
  });
  const totalTimingMs = stages.reduce((sum, s) => sum + (s.timingMs ?? 0), 0);
  return {
    dagId: input.dagId,
    stages,
    totalTimingMs,
    failedStageIds: stages.filter((s) => s.status === 'failed').map((s) => s.id),
  };
}

export function drillInStage(view: PipelineViewModel, stageId: string): PipelineStageView | undefined {
  return view.stages.find((s) => s.id === stageId);
}
