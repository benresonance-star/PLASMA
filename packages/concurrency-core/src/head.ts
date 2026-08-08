import { createSpdsError, type SpdsError } from '@spds/failure-taxonomy';

export interface HeadConflictDetails {
  readonly expectedHeadHash: string;
  readonly actualHeadHash: string;
  readonly changedIds: readonly string[];
  readonly rebaseEligible: boolean;
  readonly conflictingActors: readonly string[];
}

export function assertExpectedHead(input: {
  expectedHeadHash: string;
  actualHeadHash: string;
  changedIds?: readonly string[];
  conflictingActors?: readonly string[];
}): void {
  if (input.expectedHeadHash === input.actualHeadHash) return;
  const details: HeadConflictDetails = {
    expectedHeadHash: input.expectedHeadHash,
    actualHeadHash: input.actualHeadHash,
    changedIds: input.changedIds ?? [],
    rebaseEligible: true,
    conflictingActors: input.conflictingActors ?? [],
  };
  throw createSpdsError({
    code: 'HEAD_CONFLICT',
    summary: 'Stale ChangeSet cannot overwrite newer head',
    affectedSemanticIds: details.changedIds,
    recoverable: true,
    suggestedNextActions: ['Rebase candidate on current head', 'Retry with fresh expectedHeadHash'],
    details: { ...details },
  });
}

export function isHeadConflict(err: unknown): err is SpdsError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as SpdsError).code === 'HEAD_CONFLICT'
  );
}
