import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from '@spds/version-core';
import { UndoRedoStack } from './stack.js';

describe('G3C.5 undo/redo', () => {
  it('undoes published create via compensating command without rewriting history', () => {
    const store = new InMemoryVersionStore();
    const model = store.createModel('undo');
    const branchId = store.getMainBranchId(model.modelId);
    const before = store.getBranchHead(branchId).headHash;
    const created = store.upsertObject(
      branchId,
      { type: 'user', id: 'u1' },
      before,
      { id: 'param:z', value: 1 },
    );
    const stack = new UndoRedoStack(store);
    stack.record({
      id: 'ug:1',
      transactionId: 'txn:1',
      beforeHeadHash: before,
      afterHeadHash: created.afterHash,
      commands: [
        {
          id: 'cmd:1',
          type: 'CREATE_OBJECT',
          targetIds: ['param:z'],
          payload: { id: 'param:z', object: { id: 'param:z', value: 1 } },
          compensating: { type: 'DELETE_OBJECT', payload: { id: 'param:z' } },
        },
      ],
    });
    const undoneHead = stack.undo(branchId, 'u1');
    expect(store.getObject(branchId, 'param:z')).toBeUndefined();
    expect(undoneHead).not.toBe(created.afterHash);
    expect(store.getBranchHead(branchId).headEventId).not.toBe(created.eventId);

    stack.redo(branchId, 'u1');
    expect(store.getObject(branchId, 'param:z')).toEqual({ id: 'param:z', value: 1 });
  });
});
