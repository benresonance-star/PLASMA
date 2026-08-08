import { describe, expect, it } from 'vitest';
import { buildTransactionStatusView, failedPublicationTrace } from './transaction-status.js';

describe('G3C.6 transaction UI status', () => {
  it('distinguishes published vs candidate and traces failed publication in 3 steps', () => {
    const published = buildTransactionStatusView({ canUndo: true, canRedo: false });
    expect(published.mode).toBe('published');
    expect(published.label).toBe('Published');

    const failed = buildTransactionStatusView({
      canUndo: false,
      canRedo: false,
      txn: {
        id: 'txn:1',
        modelId: 'm',
        branchId: 'b',
        actorId: 'u',
        actorType: 'user',
        expectedHeadHash: 'h',
        idempotencyKey: 'k',
        status: 'failed',
        commands: [],
        failureStage: 'geometry',
        createdAt: 't',
        updatedAt: 't',
      },
    });
    expect(failed.mode).toBe('candidate');
    expect(failedPublicationTrace(failed)).toHaveLength(3);
  });
});
