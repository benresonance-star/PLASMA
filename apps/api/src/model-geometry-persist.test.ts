import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from '@spds/version-core';
import { TransactionEngine } from '@spds/transaction-core';
import { buildServer } from './server.js';
import { acceptAiChangeSet, ensureAiBranchContext } from './ai-changeset-accept.js';
import { ModelQueryContextRegistry, buildLiveD01QueryContext } from './model-query-context.js';
import { loadGeometryFromStore } from './model-geometry-persist.js';
import type { ChangeSet } from '@spds/ai-interface';

describe('T9 geometry persist slice', () => {
  it('geometry accept params survive registry drop + substrate reload', async () => {
    const store = new InMemoryVersionStore();
    const queryContexts = new ModelQueryContextRegistry();
    const ctx = await ensureAiBranchContext(store);
    queryContexts.set(await buildLiveD01QueryContext(ctx.modelId, { yLimit: 2 }));

    const cs: ChangeSet = {
      changeSetId: 'cs:t9:geom',
      branchId: ctx.aiBranchId,
      expectedHeadHash: 'ignored',
      transactionId: 'txn:t9',
      actor: 'ai',
      disposition: 'proposed',
      commands: [
        {
          op: 'apply_pattern',
          targetId: 'pattern:goldberg-cellular-topology@1.0.0',
          payload: { frequency: 3, lengthMm: 2000 },
        },
      ],
    };
    const accepted = await acceptAiChangeSet({
      store,
      txEngine: new TransactionEngine(store),
      queryContexts,
      body: { changeSet: cs, yLimit: 2, modelId: ctx.modelId },
    });
    expect(accepted.body.status).toBe('applied');
    expect(accepted.body.lengthMmOverride).toBe(2000);

    const stored = await loadGeometryFromStore(store, ctx.modelId);
    expect(stored.lengthMm).toBe(2000);
    expect(stored.frequency).toBe(3);

    // Fresh registry (simulate process restart) — cold GET rebuilds from store.
    const cold = buildServer(store, { queryContexts: new ModelQueryContextRegistry() });
    const res = await cold.app.inject({
      method: 'GET',
      url: `/models/${ctx.modelId}/substrate`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { parameters: { lengthMm: number; frequency: number } };
    expect(body.parameters.lengthMm).toBe(2000);
    expect(body.parameters.frequency).toBe(3);
  });

  it('HEAD_CONFLICT still works after geometry persist', async () => {
    const store = new InMemoryVersionStore();
    const { app } = buildServer(store);
    const ctx = await ensureAiBranchContext(store);
    const conflict = await app.inject({
      method: 'POST',
      url: '/ai/changeset/accept',
      payload: {
        expectedHeadHash: 'not-real',
        changeSet: {
          changeSetId: 'cs:t9:conflict',
          branchId: ctx.aiBranchId,
          expectedHeadHash: 'not-real',
          transactionId: 'txn:t9',
          actor: 'ai',
          disposition: 'proposed',
          commands: [{ op: 'update', targetId: 'y:demo:01', payload: { lengthMm: 2100 } }],
        },
      },
    });
    expect(conflict.statusCode).toBe(422);
    expect((conflict.json() as { failureCode: string }).failureCode).toBe('HEAD_CONFLICT');
  });
});
