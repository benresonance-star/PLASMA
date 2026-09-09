import type { ProvenanceStore } from '@spds/topology-provenance';
import { traceLineage } from './explain.js';

export type ValueProvenanceKind =
  | 'field'
  | 'mapping'
  | 'request'
  | 'rationalise'
  | 'actual'
  | 'incomplete';

export interface ValueProvenanceStep {
  readonly kind: ValueProvenanceKind;
  readonly semanticId?: string;
  readonly label: string;
}

/**
 * Human-readable value provenance (SD5.1). Incomplete chains are explicit.
 */
export function buildValueProvenance(input: {
  readonly targetId: string;
  readonly provenance: ProvenanceStore;
  readonly valueLabel?: string;
}): { readonly steps: readonly ValueProvenanceStep[]; readonly complete: boolean } {
  const lineage = traceLineage(input.provenance, input.targetId);
  if (lineage.length === 0) {
    return {
      complete: false,
      steps: [
        {
          kind: 'incomplete',
          semanticId: input.targetId,
          label: `No provenance recorded for ${input.targetId}`,
        },
      ],
    };
  }

  const steps: ValueProvenanceStep[] = [];
  const causes = lineage.flatMap((s) => s.causes);
  for (const cause of causes) {
    if (cause.startsWith('param:') || cause.includes('parameter')) {
      steps.push({ kind: 'request', semanticId: cause, label: `Parameter request ${cause}` });
    } else if (cause.startsWith('pattern:') || cause.includes('pattern')) {
      steps.push({ kind: 'mapping', semanticId: cause, label: `Mapped by ${cause}` });
    } else if (cause.includes('field')) {
      steps.push({ kind: 'field', semanticId: cause, label: `Field ${cause}` });
    } else {
      steps.push({ kind: 'rationalise', semanticId: cause, label: `Cause ${cause}` });
    }
  }
  steps.push({
    kind: 'actual',
    semanticId: input.targetId,
    label: input.valueLabel ?? `Actual value on ${input.targetId}`,
  });

  const complete = steps.some((s) => s.kind === 'request' || s.kind === 'mapping');
  if (!complete) {
    steps.unshift({
      kind: 'incomplete',
      semanticId: input.targetId,
      label: 'Provenance chain incomplete — missing parameter/field drivers',
    });
  }
  return { steps, complete };
}
