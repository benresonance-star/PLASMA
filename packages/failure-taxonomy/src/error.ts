import { type FailureCode, isFailureCode } from './codes.js';

export interface SpdsErrorFields {
  readonly code: FailureCode;
  readonly summary: string;
  readonly affectedSemanticIds: readonly string[];
  readonly operationOrPirId?: string;
  readonly lineage?: readonly string[];
  readonly recoverable: boolean;
  readonly suggestedNextActions?: readonly string[];
  readonly details?: Readonly<Record<string, unknown>>;
}

export type SpdsError = SpdsFailure;

export class SpdsFailure extends Error implements SpdsErrorFields {
  readonly code: FailureCode;
  readonly summary: string;
  readonly affectedSemanticIds: readonly string[];
  readonly operationOrPirId?: string;
  readonly lineage?: readonly string[];
  readonly recoverable: boolean;
  readonly suggestedNextActions?: readonly string[];
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(input: SpdsErrorFields) {
    super(input.summary);
    this.name = 'SpdsFailure';
    this.code = input.code;
    this.summary = input.summary;
    this.affectedSemanticIds = [...input.affectedSemanticIds];
    this.recoverable = input.recoverable;
    if (input.operationOrPirId !== undefined) this.operationOrPirId = input.operationOrPirId;
    if (input.lineage !== undefined) this.lineage = [...input.lineage];
    if (input.suggestedNextActions !== undefined) {
      this.suggestedNextActions = [...input.suggestedNextActions];
    }
    if (input.details !== undefined) this.details = { ...input.details };
  }
}

export function createSpdsError(input: SpdsErrorFields): SpdsFailure {
  if (!isFailureCode(input.code)) {
    throw new Error(`Unknown failure code: ${String(input.code)}`);
  }
  if (!input.summary.trim()) {
    throw new Error('Failure summary is required');
  }
  return new SpdsFailure(input);
}
