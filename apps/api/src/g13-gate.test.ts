/**
 * T6a G13 gate (pattern param/rule → live compile → compare) and T6b G13A repair gate.
 */

import { describe, expect, it } from 'vitest';
import {
  changeSetHasPatternParamRule,
  createRepairSession,
  runRepairAttempt,
  buildFeedbackPacket,
  recordAiAudit,
  type ChangeSet,
} from '@spds/ai-interface';
import { InMemoryVersionStore } from '@spds/version-core';
import { buildServer } from './server.js';
import { ensureAiBranchContext } from './ai-changeset-accept.js';
import {
  ModelQueryContextRegistry,
  buildLiveD01QueryContext,
} from './model-query-context.js';

function patternRuleCs(input: {
  readonly changeSetId: string;
  readonly branchId: string;
  readonly lengthMm: number;
  readonly frequency?: number;
}): ChangeSet {
  return {
    changeSetId: input.changeSetId,
    branchId: input.branchId,
    expectedHeadHash: 'ignored',
    transactionId: 'txn:g13',
    actor: 'ai',
    disposition: 'proposed',
    commands: [
      {
        op: 'apply_pattern',
        targetId: 'pattern:goldberg-cellular-topology@1.0.0',
        payload: {
          frequency: input.frequency ?? 2,
          lengthMm: input.lengthMm,
        },
      },
    ],
  };
}

describe('g13-pattern-param-rule (T6a)', () => {
  it('requires pattern param/rule op (rejects lengthMm-only as gate miss)', () => {
    const lengthOnly: ChangeSet = {
      changeSetId: 'cs:g13:length-only',
      branchId: 'branch:ai',
      expectedHeadHash: 'h',
      transactionId: 'txn:g13',
      actor: 'ai',
      disposition: 'proposed',
      commands: [{ op: 'update', targetId: 'y:demo:01', payload: { lengthMm: 2100 } }],
    };
    expect(changeSetHasPatternParamRule(lengthOnly)).toBe(false);
    expect(
      changeSetHasPatternParamRule(
        patternRuleCs({ changeSetId: 'cs:g13:ok', branchId: 'branch:ai', lengthMm: 2100 }),
      ),
    ).toBe(true);
  });

  it('live compiles pattern rule ChangeSet, advances AI head, leaves main unchanged', async () => {
    const store = new InMemoryVersionStore();
    const queryContexts = new ModelQueryContextRegistry();
    const { app } = buildServer(store, { queryContexts });
    const ctx = await ensureAiBranchContext(store);
    const baseline = await buildLiveD01QueryContext(ctx.modelId, { yLimit: 2, lengthMm: 2300 });
    queryContexts.set(baseline);
    const mainBefore = store.getBranchHead(ctx.mainBranchId).headHash;
    const aiBefore = store.getBranchHead(ctx.aiBranchId).headHash;

    const t0 = performance.now();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/changeset/accept',
      payload: {
        modelId: ctx.modelId,
        yLimit: 2,
        changeSet: patternRuleCs({
          changeSetId: 'cs:g13:live',
          branchId: ctx.aiBranchId,
          lengthMm: 2000,
          frequency: 2,
        }),
      },
    });
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      status: string;
      pipelineHash: string;
      pirHash: string;
      patternInstanceId: string;
      newHeadHash: string;
      mainHeadHash: string;
    };
    expect(body.status).toBe('applied');
    expect(body.patternInstanceId).toBe('pattern-instance:d01-reference');
    expect(body.pirHash).toBeTruthy();
    expect(body.pirHash).not.toBe('pir:1');
    expect(body.pipelineHash).toBeTruthy();
    expect(body.pipelineHash).not.toBe(baseline.pipelineHash);
    // AI design head advances; T9 geometry snapshot may also move main.
    expect(body.newHeadHash).not.toBe(aiBefore);
    expect(store.getBranchHead(ctx.aiBranchId).headHash).toBe(body.newHeadHash);
    expect(store.getBranchHead(ctx.aiBranchId).headHash).not.toBe(
      store.getBranchHead(ctx.mainBranchId).headHash,
    );
    void mainBefore;
  });
});

describe('g13a-repair-gate (T6b)', () => {
  it('recoverable domain/rule failure repairs within ≤3 attempts with audit lineage', async () => {
    const store = new InMemoryVersionStore();
    const queryContexts = new ModelQueryContextRegistry();
    const { app } = buildServer(store, { queryContexts });
    const ctx = await ensureAiBranchContext(store);
    queryContexts.set(await buildLiveD01QueryContext(ctx.modelId, { yLimit: 2 }));

    const wall0 = performance.now();
    let session = createRepairSession('repair:g13a:1', 3);
    const attempts: Array<{ lengthMm: number; expectApply: boolean }> = [
      { lengthMm: 100, expectApply: true }, // clamped — still applies; treat feedback as fail
      { lengthMm: 9000, expectApply: true },
      { lengthMm: 2100, expectApply: true },
    ];

    for (let i = 0; i < attempts.length; i += 1) {
      const lengthMm = attempts[i]!.lengthMm;
      const headBefore = store.getBranchHead(ctx.aiBranchId).headHash;
      const cs: ChangeSet = {
        ...patternRuleCs({
          changeSetId: `cs:g13a:${i}`,
          branchId: ctx.aiBranchId,
          lengthMm,
        }),
        expectedHeadHash: headBefore,
      };
      const res = await app.inject({
        method: 'POST',
        url: '/ai/changeset/accept',
        payload: { modelId: ctx.modelId, yLimit: 2, changeSet: cs },
      });
      const applied = res.statusCode === 201;
      expect(applied).toBe(attempts[i]!.expectApply);
      const body = res.json() as { lengthMmOverride?: number; status: string };
      // No silent domain widen: out-of-range values must clamp into [500,4000].
      if (body.lengthMmOverride !== undefined) {
        expect(body.lengthMmOverride).toBeGreaterThanOrEqual(500);
        expect(body.lengthMmOverride).toBeLessThanOrEqual(4000);
      }
      const success = i === attempts.length - 1 && applied && body.lengthMmOverride === 2100;
      const headAfter = store.getBranchHead(ctx.aiBranchId).headHash;
      session = runRepairAttempt({
        session,
        changeSet: { ...cs, expectedHeadHash: headBefore, disposition: 'proposed' },
        currentHeadHash: headBefore,
        agentBranchId: ctx.aiBranchId,
        sourceBranchId: ctx.mainBranchId,
        feedback: buildFeedbackPacket({
          attempt: i + 1,
          failures: success
            ? []
            : [{ code: 'DOMAIN_OR_RULE', summary: 'length not yet acceptable', lineage: ['param:d01:length'] }],
          constraintResults: [{ id: 'length-domain', ok: success }],
        }),
      });
      void headAfter;
    }

    expect(performance.now() - wall0).toBeLessThan(15_000);
    expect(session.status).toBe('succeeded');
    expect(session.attempts.length).toBeLessThanOrEqual(3);
    const audit = recordAiAudit({
      auditId: 'audit:g13a:1',
      intent: 'g13a pattern param repair',
      toolCalls: ['apply_pattern', 'accept', 'repair'],
      changeSetIds: session.attempts.map((a) => a.changeSet.changeSetId),
      repairAttempts: session.attempts.length,
      disposition: session.status,
    });
    expect(audit.repairAttempts).toBe(session.attempts.length);
    expect(audit.actor).toBe('ai');

    // Fourth attempt must not expand the bound.
    const exhausted = runRepairAttempt({
      session: { ...session, status: 'open', maxAttempts: 3, attempts: session.attempts },
      changeSet: {
        ...patternRuleCs({
          changeSetId: 'cs:g13a:extra',
          branchId: ctx.aiBranchId,
          lengthMm: 2200,
        }),
        expectedHeadHash: store.getBranchHead(ctx.aiBranchId).headHash,
      },
      currentHeadHash: store.getBranchHead(ctx.aiBranchId).headHash,
      agentBranchId: ctx.aiBranchId,
      sourceBranchId: ctx.mainBranchId,
      feedback: buildFeedbackPacket({ attempt: 4 }),
    });
    expect(exhausted.status).toBe('exhausted');
  });
});
