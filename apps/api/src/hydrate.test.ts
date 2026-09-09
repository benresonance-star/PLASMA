import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from '@spds/version-core';
import { buildServer } from './server.js';
import { ensureAiBranchContext } from './ai-changeset-accept.js';
import {
  ModelQueryContextRegistry,
  buildLiveD01QueryContext,
} from './model-query-context.js';

describe('T8 ChangeSet-only hydrate', () => {
  it('hydrates checked-in style ChangeSet to meshes + explainable owners', async () => {
    const store = new InMemoryVersionStore();
    const queryContexts = new ModelQueryContextRegistry();
    const { app } = buildServer(store, { queryContexts });
    const ctx = await ensureAiBranchContext(store);
    queryContexts.set(await buildLiveD01QueryContext(ctx.modelId, { yLimit: 3 }));

    const t0 = performance.now();
    const res = await app.inject({
      method: 'POST',
      url: `/models/${ctx.modelId}/hydrate`,
      headers: { 'content-type': 'application/json' },
      payload: {
        schemaVersion: 'hydrate/1',
        yLimit: 3,
        changeSet: {
          changeSetId: 'cs:hydrate:fixture',
          branchId: ctx.aiBranchId,
          expectedHeadHash: 'ignored',
          transactionId: 'txn:hydrate',
          actor: 'ai',
          disposition: 'proposed',
          commands: [
            {
              op: 'apply_pattern',
              targetId: 'pattern:goldberg-cellular-topology@1.0.0',
              payload: { frequency: 2, lengthMm: 2050 },
            },
          ],
        },
      },
    });
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      hydrated: boolean;
      meshes: { semanticOwner: string }[];
      patternInstanceId: string;
      impact: { commandCount: number; ops: string[] };
    };
    expect(body.hydrated).toBe(true);
    expect(body.meshes.length).toBeGreaterThan(0);
    expect(body.meshes[0]?.semanticOwner).toBeTruthy();
    expect(body.patternInstanceId).toBe('pattern-instance:d01-reference');
    expect(body.impact.ops).toContain('apply_pattern');
  });

  it('rejects markdown content-type and forbidden fields', async () => {
    const store = new InMemoryVersionStore();
    const { app } = buildServer(store);
    const ctx = await ensureAiBranchContext(store);

    const md = await app.inject({
      method: 'POST',
      url: `/models/${ctx.modelId}/hydrate`,
      headers: { 'content-type': 'text/markdown' },
      payload: '# nope',
    });
    expect(md.statusCode).toBe(415);

    const forbidden = await app.inject({
      method: 'POST',
      url: `/models/${ctx.modelId}/hydrate`,
      payload: {
        changeSet: {
          changeSetId: 'cs:bad',
          branchId: ctx.aiBranchId,
          expectedHeadHash: 'h',
          transactionId: 't',
          actor: 'ai',
          disposition: 'proposed',
          commands: [{ op: 'update', targetId: 'y:demo:01', payload: { lengthMm: 2000 } }],
        },
        meshes: [],
      },
    });
    expect(forbidden.statusCode).toBe(422);
    expect((forbidden.json() as { failureCode: string }).failureCode).toBe('FORBIDDEN_FIELDS');
  });
});
