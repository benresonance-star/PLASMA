import { computeInvalidationSet } from '@spds/dependency-graph';
import type { ProvenanceStore } from '@spds/topology-provenance';
import type { IndexedSemanticGraph } from './graph.js';

export interface TraceStep {
  readonly semanticAnchor: string;
  readonly relation: string;
  readonly pirOperationId: string;
  readonly causes: readonly string[];
}

export interface ExplainPacket {
  readonly targetId: string;
  readonly whyExists: readonly TraceStep[];
  readonly invalidatesOn: readonly string[];
  readonly deterministic: true;
}

export function traceLineage(
  store: ProvenanceStore,
  semanticAnchor: string,
): TraceStep[] {
  const steps: TraceStep[] = [];
  const queue = [semanticAnchor];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const anchor = queue.shift()!;
    if (seen.has(anchor)) continue;
    seen.add(anchor);
    for (const rec of store.bySemanticAnchor(anchor)) {
      steps.push({
        semanticAnchor: rec.semanticAnchor,
        relation: rec.relation,
        pirOperationId: rec.pirOperationId,
        causes: rec.causes,
      });
      for (const cause of rec.causes) queue.push(cause);
    }
  }
  return steps;
}

export function explainObject(input: {
  readonly targetId: string;
  readonly graph: IndexedSemanticGraph;
  readonly provenance: ProvenanceStore;
  readonly dependencyEdges: ReadonlyArray<{ readonly from: string; readonly to: string }>;
  readonly changedParameters?: readonly string[];
}): ExplainPacket {
  const whyExists = traceLineage(input.provenance, input.targetId);
  const seeds = input.changedParameters ?? whyExists.flatMap((s) => s.causes);
  const invalidatesOn = computeInvalidationSet(input.dependencyEdges, seeds);
  return {
    targetId: input.targetId,
    whyExists,
    invalidatesOn,
    deterministic: true,
  };
}
