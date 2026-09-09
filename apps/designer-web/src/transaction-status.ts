import type { DesignTransaction, TransactionStatus } from '@spds/transaction-core';

/** Layered chrome — never overload fabrication "Published" for committed head (S23). */
export type StatusChromeMode = 'pending' | 'candidate' | 'committed' | 'release';

export interface TransactionStatusView {
  /** @deprecated use chromeMode — kept for older callers expecting published|candidate */
  readonly mode: 'published' | 'candidate';
  readonly chromeMode: StatusChromeMode;
  readonly status: TransactionStatus | 'idle' | 'pending';
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly failureStage?: string;
  readonly label: string;
  readonly fabricationRelease: boolean;
}

/** G3C.6 / S23 status chrome — pending vs candidate vs committed vs fabrication release. */
export function buildTransactionStatusView(input: {
  readonly txn?: DesignTransaction;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly pendingChangeSet?: boolean;
  readonly fabricationRelease?: boolean;
}): TransactionStatusView {
  const fabricationRelease = input.fabricationRelease === true;
  if (input.pendingChangeSet && !input.txn) {
    return {
      mode: 'candidate',
      chromeMode: 'pending',
      status: 'pending',
      canUndo: false,
      canRedo: false,
      label: 'Pending ChangeSet',
      fabricationRelease,
    };
  }
  if (!input.txn) {
    return {
      mode: 'published',
      chromeMode: fabricationRelease ? 'release' : 'committed',
      status: 'idle',
      canUndo: input.canUndo,
      canRedo: input.canRedo,
      label: fabricationRelease ? 'Release published' : 'Committed',
      fabricationRelease,
    };
  }
  const candidateStatuses: TransactionStatus[] = [
    'open',
    'validating',
    'compiling',
    'gated',
    'failed',
  ];
  const isCandidate = candidateStatuses.includes(input.txn.status);
  const chromeMode: StatusChromeMode = isCandidate
    ? 'candidate'
    : input.txn.status === 'committed'
      ? 'committed'
      : 'committed';
  const label =
    input.txn.status === 'failed'
      ? `Failed at ${input.txn.failureStage ?? 'unknown'}`
      : input.txn.status === 'compiling'
        ? 'Compiling candidate'
        : input.txn.status === 'gated'
          ? 'Publication gate'
          : input.txn.status === 'committed'
            ? 'Committed'
            : `Candidate (${input.txn.status})`;
  return {
    mode: isCandidate ? 'candidate' : 'published',
    chromeMode,
    status: input.txn.status,
    canUndo: input.canUndo,
    canRedo: input.canRedo,
    ...(input.txn.failureStage !== undefined ? { failureStage: input.txn.failureStage } : {}),
    label,
    fabricationRelease,
  };
}

/** Failed publication should be reachable in ≤3 interactions: status → details → retry/abort. */
export function failedPublicationTrace(view: TransactionStatusView): readonly string[] {
  if (view.status !== 'failed') return [];
  return ['open-status', 'open-failure-details', 'retry-or-abort'];
}
