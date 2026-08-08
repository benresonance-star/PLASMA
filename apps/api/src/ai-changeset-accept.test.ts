import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';
import { ensureAiBranchContext } from './ai-changeset-accept.js';
import { InMemoryVersionStore } from '@spds/version-core';
import { TransactionEngine } from '@spds/transaction-core';
import { acceptAiChangeSet } from './ai-changeset-accept.js';
import type { ChangeSet } from '@spds/ai-interface';

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
    const ctx = ensureAiBranchContext(store);
    const mainBefore = store.getBranchHead(ctx.mainBranchId).headHash;

    const res = await app.inject({
      method: 'POST',
      url: '/ai/changeset/accept',
      payload: { changeSet: sampleCs(8), yLimit: 2 },
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
    expect(body.lengthMmOverride).toBe(8);
    expect(body.mainHeadHash).toBe(mainBefore);
    expect(store.getBranchHead(ctx.mainBranchId).headHash).toBe(mainBefore);
  });

  it('rejects unsupported ops and head conflicts', async () => {
    const { app } = buildServer();
    const bad = await app.inject({
      method: 'POST',
      url: '/ai/changeset/accept',
      payload: {
        changeSet: {
          ...sampleCs(8),
          commands: [{ op: 'create', targetId: 'y:demo:01', payload: {} }],
        },
      },
    });
    expect(bad.statusCode).toBe(422);
    expect((bad.json() as { failureCode: string }).failureCode).toBe('UNSUPPORTED_OP');

    const store = new InMemoryVersionStore();
    const { app: app2 } = buildServer(store);
    ensureAiBranchContext(store);
    const conflict = await app2.inject({
      method: 'POST',
      url: '/ai/changeset/accept',
      payload: { changeSet: sampleCs(9), expectedHeadHash: 'not-the-real-head' },
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
      body: { changeSet: sampleCs(8), yLimit: 2 },
    });
    const b = await acceptAiChangeSet({
      store,
      txEngine: tx,
      body: { changeSet: sampleCs(12), yLimit: 2 },
    });
    expect(a.body.pipelineHash).toBeTruthy();
    expect(b.body.pipelineHash).toBeTruthy();
    expect(a.body.pipelineHash).not.toBe(b.body.pipelineHash);
  });
});
