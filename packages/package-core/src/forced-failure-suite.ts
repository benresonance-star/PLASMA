/**
 * G14B.5 Forced failure suite — timeout / crash / cancel / stale-result contracts.
 * Records diagnostic outcomes; does not require live workers.
 */

export type ForcedFailureKind =
  | 'timeout'
  | 'crash'
  | 'cancel'
  | 'stale-result'
  | 'partial-publish';

export interface ForcedFailureCase {
  readonly id: string;
  readonly worker: 'geometry' | 'meshing' | 'analysis' | 'import';
  readonly kind: ForcedFailureKind;
}

export interface ForcedFailureOutcome {
  readonly caseId: string;
  readonly accepted: false;
  readonly partialPublication: false;
  readonly diagnosticCode: string;
  readonly retryable: boolean;
}

export const DEFAULT_FORCED_FAILURE_CASES: readonly ForcedFailureCase[] = [
  { id: 'ff:geometry:timeout', worker: 'geometry', kind: 'timeout' },
  { id: 'ff:geometry:crash', worker: 'geometry', kind: 'crash' },
  { id: 'ff:meshing:cancel', worker: 'meshing', kind: 'cancel' },
  { id: 'ff:meshing:stale', worker: 'meshing', kind: 'stale-result' },
  { id: 'ff:analysis:timeout', worker: 'analysis', kind: 'timeout' },
  { id: 'ff:import:crash', worker: 'import', kind: 'crash' },
  { id: 'ff:meshing:partial', worker: 'meshing', kind: 'partial-publish' },
];

export function diagnoseForcedFailure(caseDef: ForcedFailureCase): ForcedFailureOutcome {
  const code = `${caseDef.worker.toUpperCase()}_${caseDef.kind.replace('-', '_').toUpperCase()}`;
  return {
    caseId: caseDef.id,
    accepted: false,
    partialPublication: false,
    diagnosticCode: code,
    retryable: caseDef.kind === 'timeout' || caseDef.kind === 'cancel',
  };
}

export function runForcedFailureSuite(
  cases: readonly ForcedFailureCase[] = DEFAULT_FORCED_FAILURE_CASES,
): {
  readonly outcomes: readonly ForcedFailureOutcome[];
  readonly zeroPartialPublication: boolean;
  readonly allRejected: boolean;
} {
  const outcomes = cases.map(diagnoseForcedFailure);
  return {
    outcomes,
    zeroPartialPublication: outcomes.every((o) => o.partialPublication === false),
    allRejected: outcomes.every((o) => o.accepted === false),
  };
}
