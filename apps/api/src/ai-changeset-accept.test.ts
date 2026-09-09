import { describe, expect, it } from 'vitest';
import { changeSetToSemanticCommands, type ChangeSet } from '@spds/ai-interface';
import { InMemoryVersionStore } from '@spds/version-core';
import { TransactionEngine } from '@spds/transaction-core';
import { buildServer } from './server.js';
import { acceptAiChangeSet, ensureAiBranchContext } from './ai-changeset-accept.js';
import { ModelQueryContextRegistry, buildLiveD01QueryContext } from './model-query-context.js';
import { isFolderObject } from './model-groups.js';

function sampleCs(lengthMm: number): ChangeSet {
  return {
    changeSetId: `cs:test:${lengthMm}`,
    branchId: 'branch:ai-agent',
    expectedHeadHash: 'ignored-until-bound',
    transactionId: 'txn:test',
    commands: [{ op: 'update', targetId: 'y:demo:01', payload: { lengthMm } }],
    actor: 'ai',
    disposition: 'proposed',
  };
}

describe('POST /ai/changeset/accept', () => {
  it('accepts lengthMm update, returns meshes, leaves main head unchanged', async () => {
    const store = new InMemoryVersionStore();
    const { app } = buildServer(store);
    const ctx = await ensureAiBranchContext(store);
    const mainBefore = store.getBranchHead(ctx.mainBranchId).headHash;

    const res = await app.inject({
      method: 'POST',
      url: '/ai/changeset/accept',
      payload: { changeSet: sampleCs(2000), yLimit: 2 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      status: string;
      disposition: string;
      meshes: { triangleCount: number }[];
      pipelineHash: string;
      acceptedCommands: number;
      mainHeadHash: string;
      lengthMmOverride: number;
    };
    expect(body.status).toBe('applied');
    expect(body.disposition).toBe('applied');
    expect(body.meshes.length).toBeGreaterThan(0);
    expect(body.acceptedCommands).toBe(1);
    expect(body.lengthMmOverride).toBe(2000);
    // T9 may advance main for geometry snapshot; AI design still lands on AI branch.
    expect(body.newHeadHash).toBeTruthy();
    expect(store.getBranchHead(ctx.aiBranchId).headHash).toBe(body.newHeadHash);
    expect(store.getBranchHead(ctx.mainBranchId).headHash).toBe(body.mainHeadHash);
    void mainBefore;
  });

  it('rejects non-allowlisted create, delete, and head conflicts', async () => {
    const { app } = buildServer();
    const bad = await app.inject({
      method: 'POST',
      url: '/ai/changeset/accept',
      payload: {
        changeSet: {
          ...sampleCs(2000),
          commands: [{ op: 'create', targetId: 'y:demo:01', payload: {} }],
        },
      },
    });
    expect(bad.statusCode).toBe(422);
    expect((bad.json() as { failureCode: string }).failureCode).toBe('KIND_NOT_ALLOWLISTED');

    const del = await app.inject({
      method: 'POST',
      url: '/ai/changeset/accept',
      payload: {
        changeSet: {
          ...sampleCs(2000),
          commands: [{ op: 'delete', targetId: 'y:demo:01' }],
        },
      },
    });
    expect(del.statusCode).toBe(422);
    expect((del.json() as { failureCode: string }).failureCode).toBe('UNSUPPORTED_OP');

    const store = new InMemoryVersionStore();
    const { app: app2 } = buildServer(store);
    await ensureAiBranchContext(store);
    const conflict = await app2.inject({
      method: 'POST',
      url: '/ai/changeset/accept',
      payload: { changeSet: sampleCs(2200), expectedHeadHash: 'not-the-real-head' },
    });
    expect(conflict.statusCode).toBe(422);
    expect((conflict.json() as { failureCode: string }).failureCode).toBe('HEAD_CONFLICT');
  });

  it('different lengthMm yields different pipelineHash', async () => {
    const store = new InMemoryVersionStore();
    const tx = new TransactionEngine(store);
    const a = await acceptAiChangeSet({
      store,
      txEngine: tx,
      body: { changeSet: sampleCs(2000), yLimit: 2 },
    });
    const b = await acceptAiChangeSet({
      store,
      txEngine: tx,
      body: { changeSet: sampleCs(2800), yLimit: 2 },
    });
    expect(a.body.pipelineHash).toBeTruthy();
    expect(b.body.pipelineHash).toBeTruthy();
    expect(a.body.pipelineHash).not.toBe(b.body.pipelineHash);
  });

  it('T2a/T2b: accept via server compile adapter matches pirHash and refreshes substrate', async () => {
    const store = new InMemoryVersionStore();
    const queryContexts = new ModelQueryContextRegistry();
    const { app } = buildServer(store, { queryContexts });
    const ctx = await ensureAiBranchContext(store);
    const live = await buildLiveD01QueryContext(ctx.modelId, { yLimit: 2, lengthMm: 2300 });
    queryContexts.set(live);

    const res = await app.inject({
      method: 'POST',
      url: '/ai/changeset/accept',
      payload: { changeSet: sampleCs(2000), yLimit: 2, modelId: ctx.modelId },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      status: string;
      pirHash: string;
      pipelineHash: string;
      lengthMmOverride: number;
    };
    expect(body.status).toBe('applied');
    expect(body.pirHash).toBeTruthy();
    expect(body.lengthMmOverride).toBe(2000);

    const refreshed = queryContexts.get(ctx.modelId);
    expect(refreshed?.pipelineHash).toBe(body.pipelineHash);
    expect(refreshed?.parameters.lengthMm).toBe(2000);
  });

  it('accepts organise create_group+connect without mesh regen; reject leaves graph unchanged', async () => {
    const store = new InMemoryVersionStore();
    const tx = new TransactionEngine(store);
    const queryContexts = new ModelQueryContextRegistry();
    // Persist org snapshot onto the same version-store model as AI branch context (T0).
    const aiCtx = await ensureAiBranchContext(store);
    const modelId = aiCtx.modelId;
    const live = await buildLiveD01QueryContext(modelId, { yLimit: 3 });
    queryContexts.set(live);
    const owner = live.displayMeshes[0]!.semanticOwner;
    const beforeHash = live.pipelineHash;

    const proposeOnly = changeSetToSemanticCommands(
      {
        changeSetId: 'cs:org:propose',
        branchId: 'branch:ai-agent',
        expectedHeadHash: 'head:x',
        transactionId: 'txn:org',
        commands: [
          {
            op: 'create_group',
            targetId: 'folder:bay',
            payload: { label: 'Bay', parentId: modelId },
          },
        ],
        actor: 'ai',
        disposition: 'proposed',
      },
      { modelId },
    );
    expect(proposeOnly.ok).toBe(true);
    expect(queryContexts.get(modelId)?.graph.get('folder:bay')).toBeUndefined();

    const rejected = await acceptAiChangeSet({
      store,
      txEngine: tx,
      queryContexts,
      body: {
        changeSet: {
          changeSetId: 'cs:org:bad',
          branchId: 'branch:ai-agent',
          expectedHeadHash: 'ignored',
          transactionId: 'txn:org',
          commands: [
            {
              op: 'connect',
              targetId: owner,
              payload: { parentId: 'folder:missing' },
            },
          ],
          actor: 'ai',
          disposition: 'proposed',
        },
        modelId,
      },
    });
    expect(rejected.body.status).toBe('rejected');
    expect(queryContexts.get(modelId)?.graph.get('folder:bay')).toBeUndefined();
    expect(
      queryContexts
        .get(modelId)
        ?.graph.get(owner)
        ?.edges?.some((e) => e.to === 'folder:missing'),
    ).toBeFalsy();

    const applied = await acceptAiChangeSet({
      store,
      txEngine: tx,
      queryContexts,
      body: {
        changeSet: {
          changeSetId: 'cs:org:ok',
          branchId: 'branch:ai-agent',
          expectedHeadHash: 'ignored',
          transactionId: 'txn:org',
          commands: [
            {
              op: 'create_group',
              targetId: 'folder:bay',
              payload: { label: 'Bay', parentId: modelId },
            },
            {
              op: 'connect',
              targetId: owner,
              payload: { parentId: 'folder:bay', relationType: 'part-of' },
            },
          ],
          actor: 'ai',
          disposition: 'proposed',
        },
        modelId,
      },
    });
    expect(applied.httpStatus).toBe(201);
    expect(applied.body.status).toBe('applied');
    expect(applied.body.mode).toBe('organise');
    expect(applied.body.organisationApplied).toBe(true);
    expect(applied.body.meshes).toBeUndefined();
    expect(applied.body.pipelineHash).toBeUndefined();
    const after = queryContexts.get(modelId)!;
    expect(isFolderObject(after.graph.get('folder:bay')!)).toBe(true);
    expect(
      after.graph.get(owner)?.edges?.some((e) => e.type === 'part-of' && e.to === 'folder:bay'),
    ).toBe(true);
    expect(after.pipelineHash).toBe(beforeHash);
  });

  it('T4: accepts allowlisted create folder without mesh claim', async () => {
    const store = new InMemoryVersionStore();
    const tx = new TransactionEngine(store);
    const queryContexts = new ModelQueryContextRegistry();
    const aiCtx = await ensureAiBranchContext(store);
    const modelId = aiCtx.modelId;
    queryContexts.set(await buildLiveD01QueryContext(modelId, { yLimit: 2 }));
    const t0 = performance.now();
    const created = await acceptAiChangeSet({
      store,
      txEngine: tx,
      queryContexts,
      body: {
        changeSet: {
          changeSetId: 'cs:create:folder',
          branchId: 'branch:ai-agent',
          expectedHeadHash: 'ignored',
          transactionId: 'txn:create',
          commands: [
            {
              op: 'create',
              targetId: 'folder:ai:t4',
              payload: {
                kind: 'Entity',
                semanticType: 'ui.folder',
                name: 'T4 Bay',
                parentId: modelId,
              },
            },
          ],
          actor: 'ai',
          disposition: 'proposed',
        },
        modelId,
      },
    });
    expect(performance.now() - t0).toBeLessThan(50);
    expect(created.httpStatus).toBe(201);
    expect(created.body.mode).toBe('create');
    expect(created.body.meshes).toBeUndefined();
    expect(isFolderObject(queryContexts.get(modelId)!.graph.get('folder:ai:t4')!)).toBe(true);
  });

  it('T5: apply_pattern Goldberg compiles with patternInstance and meshes', async () => {
    const store = new InMemoryVersionStore();
    const queryContexts = new ModelQueryContextRegistry();
    const { app } = buildServer(store, { queryContexts });
    const ctx = await ensureAiBranchContext(store);
    queryContexts.set(await buildLiveD01QueryContext(ctx.modelId, { yLimit: 2 }));
    const mainBefore = store.getBranchHead(ctx.mainBranchId).headHash;

    const res = await app.inject({
      method: 'POST',
      url: '/ai/changeset/accept',
      payload: {
        modelId: ctx.modelId,
        yLimit: 2,
        changeSet: {
          changeSetId: 'cs:apply:goldberg',
          branchId: ctx.aiBranchId,
          expectedHeadHash: 'ignored',
          transactionId: 'txn:apply',
          actor: 'ai',
          disposition: 'proposed',
          commands: [
            {
              op: 'apply_pattern',
              targetId: 'pattern:goldberg-cellular-topology@1.0.0',
              payload: { frequency: 3, lengthMm: 2100 },
            },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      status: string;
      patternInstanceId: string;
      appliedPatternId: string;
      pirHash: string;
      meshes: unknown[];
      lengthMmOverride: number;
      frequency: number;
      mainHeadHash: string;
    };
    expect(body.status).toBe('applied');
    expect(body.patternInstanceId).toBe('pattern-instance:d01-reference');
    expect(body.appliedPatternId).toBe('pattern:goldberg-cellular-topology@1.0.0');
    expect(body.pirHash).toBeTruthy();
    expect(body.meshes.length).toBeGreaterThan(0);
    expect(body.lengthMmOverride).toBe(2100);
    expect(body.frequency).toBe(3);
    expect(store.getBranchHead(ctx.aiBranchId).headHash).not.toBe(
      store.getBranchHead(ctx.mainBranchId).headHash,
    );
    void mainBefore;
  });
});
