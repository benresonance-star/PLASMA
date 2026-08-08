import type { DesignTransaction, TransactionStatus } from '@spds/transaction-core';

export interface TransactionStatusView {
  readonly mode: 'published' | 'candidate';
  readonly status: TransactionStatus | 'idle';
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly failureStage?: string;
  readonly label: string;
}

/** G3C.6 status chrome model — published vs candidate identifiable without deep navigation. */
export function buildTransactionStatusView(input: {
  readonly txn?: DesignTransaction;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}): TransactionStatusView {
  if (!input.txn) {
    return {
      mode: 'published',
      status: 'idle',
      canUndo: input.canUndo,
      canRedo: input.canRedo,
      label: 'Published',
    };
  }
  const candidateStatuses: TransactionStatus[] = [
    'open',
    'validating',
    'compiling',
    'gated',
    'failed',
  ];
  const mode = candidateStatuses.includes(input.txn.status) ? 'candidate' : 'published';
  const label =
    input.txn.status === 'failed'
      ? `Failed at ${input.txn.failureStage ?? 'unknown'}`
      : input.txn.status === 'compiling'
        ? 'Compiling candidate'
        : input.txn.status === 'gated'
          ? 'Publication gate'
          : input.txn.status === 'committed'
            ? 'Published'
            : `Candidate (${input.txn.status})`;
  return {
    mode,
    status: input.txn.status,
    canUndo: input.canUndo,
    canRedo: input.canRedo,
    ...(input.txn.failureStage !== undefined ? { failureStage: input.txn.failureStage } : {}),
    label,
  };
}

/** Failed publication should be reachable in ≤3 interactions: status → details → retry/abort. */
export function failedPublicationTrace(view: TransactionStatusView): readonly string[] {
  if (view.status !== 'failed') return [];
  return ['open-status', 'open-failure-details', 'retry-or-abort'];
}
