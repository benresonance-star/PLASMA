import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from '@spds/version-core';
import { BranchUndoRegistry } from './branch-undo.js';
import { withCompensating } from './compensating-command.js';

describe('BranchUndoRegistry (S25/S28)', () => {
  it('commit-record then undo restores prior head objects; redo restores after', async () => {
    const store = new InMemoryVersionStore();
    const model = store.createModel('D01');
    const branchId = store.getMainBranchId(model.modelId);
    let head = store.getBranchHead(branchId).headHash;

    const set = withCompensating(
      {
        id: 'cmd:set',
        type: 'SET_PARAMETER',
        targetIds: ['param:d01:length'],
        payload: { id: 'param:d01:length', path: 'lengthMm', value: 2100 },
      },
      { lengthMm: 2300 },
    );

    const before = head;
    const event = store.applyMutation({
      branchId,
      actor: { type: 'ai', id: 'ai:1' },
      command: set.type,
      expectedHeadHash: head,
      targetIds: [...set.targetIds],
      mutate: (objects) => {
        objects.set('param:d01:length', { id: 'param:d01:length', value: 2100, lengthMm: 2100 });
        return [...set.targetIds];
      },
    });
    head = event.afterHash;

    const registry = new BranchUndoRegistry(store);
    registry.record(branchId, {
      id: 'undo:1',
      transactionId: 'txn:1',
      commands: [set],
      beforeHeadHash: before,
      afterHeadHash: head,
    });

    expect(registry.canUndo(branchId)).toBe(true);
    const undone = await registry.undo({
      branchId,
      actorId: 'user:1',
      expectedHeadHash: head,
    });
    expect(undone.newHeadHash).not.toBe(head);
    expect(registry.canRedo(branchId)).toBe(true);
    expect(store.getBranchHead(branchId).headHash).toBe(undone.newHeadHash);

    const redone = await registry.redo({
      branchId,
      actorId: 'user:1',
      expectedHeadHash: undone.newHeadHash,
    });
    expect(redone.newHeadHash).not.toBe(undone.newHeadHash);
    expect(store.getBranchHead(branchId).headHash).toBe(redone.newHeadHash);

    await expect(
      registry.undo({
        branchId,
        actorId: 'user:1',
        expectedHeadHash: 'stale',
      }),
    ).rejects.toMatchObject({ code: 'HEAD_CONFLICT' });
  });
});
