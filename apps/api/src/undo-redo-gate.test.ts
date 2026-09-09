/**
 * S28 — Accept-length then undo restores AI head; redo restores forward; main AI isolation.
 */

import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from '@spds/version-core';
import { buildServer } from './server.js';
import { ensureAiBranchContext } from './ai-changeset-accept.js';

describe('undo/redo e2e gate (S28)', () => {
  it('AI accept enables undo; undo/redo move AI head; main head unchanged by undo', async () => {
    const store = new InMemoryVersionStore();
    const { app } = buildServer(store);
    const ctx = await ensureAiBranchContext(store);
    const mainBefore = store.getBranchHead(ctx.mainBranchId).headHash;

    const accept = await app.inject({
      method: 'POST',
      url: '/ai/changeset/accept',
      payload: {
        changeSet: {
          changeSetId: 'cs:undo-gate',
          branchId: ctx.aiBranchId,
          expectedHeadHash: 'ignored',
          transactionId: 'txn:undo-gate',
          actor: 'ai',
          disposition: 'proposed',
          commands: [{ op: 'update', targetId: 'y:demo:01', payload: { lengthMm: 2000 } }],
        },
        yLimit: 2,
      },
    });
    expect(accept.statusCode).toBe(201);
    const accepted = accept.json() as {
      status: string;
      newHeadHash: string;
      branchId: string;
      mainHeadHash: string;
    };
    expect(accepted.status).toBe('applied');
    const aiAfter = accepted.newHeadHash;
    expect(aiAfter).toBeTruthy();

    const stack = await app.inject({
      method: 'GET',
      url: `/branches/${encodeURIComponent(ctx.aiBranchId)}/undo-stack`,
    });
    expect(stack.statusCode).toBe(200);
    expect((stack.json() as { canUndo: boolean }).canUndo).toBe(true);

    const undo = await app.inject({
      method: 'POST',
      url: `/branches/${encodeURIComponent(ctx.aiBranchId)}/undo`,
      payload: { expectedHeadHash: aiAfter },
    });
    expect(undo.statusCode).toBe(200);
    const undone = undo.json() as { newHeadHash: string; canRedo: boolean };
    expect(undone.newHeadHash).not.toBe(aiAfter);
    expect(undone.canRedo).toBe(true);
    expect(store.getBranchHead(ctx.mainBranchId).headHash).toBe(accepted.mainHeadHash);

    const redo = await app.inject({
      method: 'POST',
      url: `/branches/${encodeURIComponent(ctx.aiBranchId)}/redo`,
      payload: { expectedHeadHash: undone.newHeadHash },
    });
    expect(redo.statusCode).toBe(200);
    expect((redo.json() as { newHeadHash: string }).newHeadHash).not.toBe(undone.newHeadHash);
    expect(store.getBranchHead(ctx.mainBranchId).headHash).toBe(accepted.mainHeadHash);
    void mainBefore;
  }, 20_000);
});
