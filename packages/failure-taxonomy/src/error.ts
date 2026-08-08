import { type FailureCode, isFailureCode } from './codes.js';

export interface SpdsError {
  readonly code: FailureCode;
  readonly summary: string;
  readonly affectedSemanticIds: readonly string[];
  readonly operationOrPirId?: string;
  readonly lineage?: readonly string[];
  readonly recoverable: boolean;
  readonly suggestedNextActions?: readonly string[];
  readonly details?: Readonly<Record<string, unknown>>;
}

export function createSpdsError(input: SpdsError): SpdsError {
  if (!isFailureCode(input.code)) {
    throw new Error(`Unknown failure code: ${String(input.code)}`);
  }
  if (!input.summary.trim()) {
    throw new Error('Failure summary is required');
  }
  return {
    code: input.code,
    summary: input.summary,
    affectedSemanticIds: [...input.affectedSemanticIds],
    recoverable: input.recoverable,
    ...(input.operationOrPirId !== undefined
      ? { operationOrPirId: input.operationOrPirId }
      : {}),
    ...(input.lineage !== undefined ? { lineage: [...input.lineage] } : {}),
    ...(input.suggestedNextActions !== undefined
      ? { suggestedNextActions: [...input.suggestedNextActions] }
      : {}),
    ...(input.details !== undefined ? { details: { ...input.details } } : {}),
  };
}
