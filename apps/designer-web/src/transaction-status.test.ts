import { describe, expect, it } from 'vitest';
import { buildTransactionStatusView, failedPublicationTrace } from './transaction-status.js';

describe('G3C.6 / S23 transaction UI status', () => {
  it('distinguishes committed vs candidate vs pending vs release', () => {
    const committed = buildTransactionStatusView({ canUndo: true, canRedo: false });
    expect(committed.mode).toBe('published');
    expect(committed.chromeMode).toBe('committed');
    expect(committed.label).toBe('Committed');

    const pending = buildTransactionStatusView({
      canUndo: true,
      canRedo: false,
      pendingChangeSet: true,
    });
    expect(pending.chromeMode).toBe('pending');
    expect(pending.canUndo).toBe(false);
    expect(pending.label).toBe('Pending ChangeSet');

    const release = buildTransactionStatusView({
      canUndo: false,
      canRedo: false,
      fabricationRelease: true,
    });
    expect(release.chromeMode).toBe('release');
    expect(release.label).toBe('Release published');

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
    expect(failed.chromeMode).toBe('candidate');
    expect(failedPublicationTrace(failed)).toHaveLength(3);
  });
});
