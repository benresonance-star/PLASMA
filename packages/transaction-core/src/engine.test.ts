import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from '@spds/version-core';
import { isHeadConflict } from '@spds/concurrency-core';
import { TransactionEngine } from './engine.js';

function setup() {
  const store = new InMemoryVersionStore();
  const model = store.createModel('G3C');
  const branchId = store.getMainBranchId(model.modelId);
  const head = store.getBranchHead(branchId).headHash;
  const engine = new TransactionEngine(store);
  return { store, model, branchId, head, engine };
}

describe('G3C transactions publication undo precursors', () => {
  it('is idempotent on begin and isolates candidates from published', () => {
    const { model, branchId, head, engine, store } = setup();
    const a = engine.begin({
      modelId: model.modelId,
      branchId,
      actorId: 'user:1',
      actorType: 'user',
      expectedHeadHash: head,
      idempotencyKey: 'k1',
    });
    const b = engine.begin({
      modelId: model.modelId,
      branchId,
      actorId: 'user:1',
      actorType: 'user',
      expectedHeadHash: head,
      idempotencyKey: 'k1',
    });
    expect(a.id).toBe(b.id);

    engine.appendCommand(a.id, {
      id: 'cmd:1',
      type: 'SET_PARAMETER',
      targetIds: ['param:freq'],
      payload: { id: 'param:freq', value: 3 },
    });
    const candidate = engine.buildCandidate(a.id);
    expect(candidate.published).toBe(false);
    expect(store.listObjects(branchId)).toHaveLength(0);
    expect(candidate.objects['param:freq']).toEqual({ id: 'param:freq', value: 3 });
  });

  it('rejects stale heads and prevents partial publication on compile failure', () => {
    const { model, branchId, head, engine, store } = setup();
    const txn = engine.begin({
      modelId: model.modelId,
      branchId,
      actorId: 'user:1',
      actorType: 'user',
      expectedHeadHash: head,
      idempotencyKey: 'k2',
    });
    engine.appendCommand(txn.id, {
      id: 'cmd:1',
      type: 'CREATE_OBJECT',
      targetIds: ['param:x'],
      payload: { id: 'param:x', object: { id: 'param:x', value: 1 } },
    });
    engine.buildCandidate(txn.id);

    expect(() =>
      engine.mockCompile(txn.id, { failAt: 'geometry' }),
    ).toThrow(/Injected compile failure/);
    expect(engine.getTransaction(txn.id)?.status).toBe('failed');
    expect(store.listObjects(branchId)).toHaveLength(0);

    try {
      engine.begin({
        modelId: model.modelId,
        branchId,
        actorId: 'ai:1',
        actorType: 'ai',
        expectedHeadHash: 'stale',
        idempotencyKey: 'k3',
      });
      expect.unreachable('should conflict');
    } catch (err) {
      expect(isHeadConflict(err)).toBe(true);
    }
  });

  it('atomically publishes on successful gate and rejects stale workers', () => {
    const { model, branchId, head, engine, store } = setup();
    const txn = engine.begin({
      modelId: model.modelId,
      branchId,
      actorId: 'user:1',
      actorType: 'user',
      expectedHeadHash: head,
      idempotencyKey: 'k4',
    });
    engine.appendCommand(txn.id, {
      id: 'cmd:1',
      type: 'CREATE_OBJECT',
      targetIds: ['param:y'],
      payload: { id: 'param:y', object: { id: 'param:y', value: 9 } },
    });
    engine.buildCandidate(txn.id);
    engine.bumpWorkerGeneration();
    expect(() => engine.mockCompile(txn.id, { workerGeneration: 1 })).toThrow(/Stale worker/);

    const txn2 = engine.begin({
      modelId: model.modelId,
      branchId,
      actorId: 'user:1',
      actorType: 'user',
      expectedHeadHash: head,
      idempotencyKey: 'k5',
    });
    engine.appendCommand(txn2.id, {
      id: 'cmd:2',
      type: 'CREATE_OBJECT',
      targetIds: ['param:y'],
      payload: { id: 'param:y', object: { id: 'param:y', value: 9 } },
    });
    engine.buildCandidate(txn2.id);
    engine.mockCompile(txn2.id);
    const committed = engine.commit(txn2.id);
    expect(committed.status).toBe('committed');
    expect(store.getObject(branchId, 'param:y')).toEqual({ id: 'param:y', value: 9 });
  });
});
