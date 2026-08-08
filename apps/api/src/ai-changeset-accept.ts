/**
 * Orchestrate AI ChangeSet accept → semantic gate → AI-branch txn → D01 compile → meshes.
 */

import {
  acceptSemanticCommand,
  toDesignCommandPayload,
} from '@spds/semantic-commands';
import {
  changeSetToSemanticCommands,
  type ChangeSet,
} from '@spds/ai-interface';
import type { TransactionEngine } from '@spds/transaction-core';
import type { InMemoryVersionStore } from '@spds/version-core';
import { buildD01DisplayMeshes } from '@spds/reference-pipeline';

export interface AiBranchContext {
  readonly modelId: string;
  readonly mainBranchId: string;
  readonly aiBranchId: string;
}

export function ensureAiBranchContext(store: InMemoryVersionStore): AiBranchContext {
  const existing = (store as unknown as { __spdsAiCtx?: AiBranchContext }).__spdsAiCtx;
  if (existing) return existing;
  const model = store.createModel('D01');
  const mainBranchId = store.getMainBranchId(model.modelId);
  const ai = store.createBranch(model.modelId, 'ai-agent', mainBranchId);
  const ctx: AiBranchContext = {
    modelId: model.modelId,
    mainBranchId,
    aiBranchId: ai.branchId,
  };
  (store as unknown as { __spdsAiCtx?: AiBranchContext }).__spdsAiCtx = ctx;
  return ctx;
}

export interface AcceptChangeSetInput {
  readonly changeSet: ChangeSet;
  /** If provided, must equal current AI branch head (§5B.2). */
  readonly expectedHeadHash?: string;
  readonly yLimit?: number;
}

export interface AcceptChangeSetResult {
  readonly status: 'applied' | 'rejected';
  readonly failureCode?: string;
  readonly reason?: string;
  readonly disposition: 'applied' | 'rejected';
  readonly lengthMmOverride?: number;
  readonly pipelineHash?: string;
  readonly pirHash?: string;
  readonly meshes?: Awaited<ReturnType<typeof buildD01DisplayMeshes>>['meshes'];
  readonly branchId?: string;
  readonly newHeadHash?: string;
  readonly mainHeadHash?: string;
  readonly acceptedCommands?: number;
  readonly audit?: {
    readonly changeSetId: string;
    readonly lengthMm: number;
    readonly pipelineHash: string;
  };
}

export async function acceptAiChangeSet(input: {
  readonly store: InMemoryVersionStore;
  readonly txEngine: TransactionEngine;
  readonly body: AcceptChangeSetInput;
}): Promise<{ readonly httpStatus: number; readonly body: AcceptChangeSetResult }> {
  const ctx = ensureAiBranchContext(input.store);
  const mainHeadBefore = input.store.getBranchHead(ctx.mainBranchId).headHash;
  const aiHead = input.store.getBranchHead(ctx.aiBranchId).headHash;

  if (input.body.expectedHeadHash !== undefined && input.body.expectedHeadHash !== aiHead) {
    return {
      httpStatus: 422,
      body: {
        status: 'rejected',
        disposition: 'rejected',
        failureCode: 'HEAD_CONFLICT',
        reason: `expectedHeadHash mismatch (got ${input.body.expectedHeadHash}, actual ${aiHead})`,
        mainHeadHash: mainHeadBefore,
        branchId: ctx.aiBranchId,
      },
    };
  }

  const cs: ChangeSet = {
    ...input.body.changeSet,
    branchId: ctx.aiBranchId,
    expectedHeadHash: aiHead,
  };

  const lowered = changeSetToSemanticCommands(cs, { modelId: ctx.modelId });
  if (!lowered.ok || lowered.lengthMmOverride === undefined) {
    return {
      httpStatus: 422,
      body: {
        status: 'rejected',
        disposition: 'rejected',
        failureCode: lowered.failureCode ?? 'CHANGESET_INVALID',
        reason: lowered.reason ?? 'Cannot lower ChangeSet',
        mainHeadHash: mainHeadBefore,
        branchId: ctx.aiBranchId,
      },
    };
  }

  for (const env of lowered.envelopes) {
    const gate = acceptSemanticCommand(env);
    if (gate.status !== 'accepted') {
      return {
        httpStatus: 422,
        body: {
          status: 'rejected',
          disposition: 'rejected',
          failureCode: gate.failureCode ?? 'SEMANTIC_INVALID',
          reason: 'acceptSemanticCommand rejected envelope',
          mainHeadHash: mainHeadBefore,
          branchId: ctx.aiBranchId,
        },
      };
    }
  }

  const first = lowered.envelopes[0]!;
  let txnId: string | undefined;
  try {
    const txn = input.txEngine.begin({
      modelId: ctx.modelId,
      branchId: ctx.aiBranchId,
      actorId: first.actorId,
      actorType: 'ai',
      expectedHeadHash: aiHead,
      idempotencyKey: `accept:${cs.changeSetId}:${aiHead}:${lowered.lengthMmOverride}`,
    });
    txnId = txn.id;
    for (const env of lowered.envelopes) {
      const design = toDesignCommandPayload(env);
      if (!design) continue;
      input.txEngine.appendCommand(txn.id, {
        id: design.id,
        type: design.type,
        targetIds: [...design.targetIds],
        payload: design.payload,
      });
    }
    input.txEngine.buildCandidate(txn.id);
    // Txn publication gate uses mockCompile; geometry truth is D01 below.
    input.txEngine.mockCompile(txn.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TXN_FAILED';
    const failureCode = message.includes('HEAD_CONFLICT') ? 'HEAD_CONFLICT' : 'TXN_FAILED';
    if (txnId) {
      try {
        input.txEngine.abort(txnId, failureCode);
      } catch {
        /* ignore */
      }
    }
    return {
      httpStatus: 422,
      body: {
        status: 'rejected',
        disposition: 'rejected',
        failureCode,
        reason: message,
        mainHeadHash: mainHeadBefore,
        branchId: ctx.aiBranchId,
      },
    };
  }

  const yLimit = input.body.yLimit ?? 2;
  const display = await buildD01DisplayMeshes({
    yLimit,
    lengthMmOverride: lowered.lengthMmOverride,
  });

  const meshes = display.meshes;

  input.txEngine.commit(txnId!);
  const newHead = input.store.getBranchHead(ctx.aiBranchId).headHash;
  const mainHeadAfter = input.store.getBranchHead(ctx.mainBranchId).headHash;

  return {
    httpStatus: 201,
    body: {
      status: 'applied',
      disposition: 'applied',
      lengthMmOverride: lowered.lengthMmOverride,
      pipelineHash: display.pipelineHash,
      pirHash: display.pirHash,
      meshes,
      branchId: ctx.aiBranchId,
      newHeadHash: newHead,
      mainHeadHash: mainHeadAfter,
      acceptedCommands: lowered.envelopes.length,
      audit: {
        changeSetId: cs.changeSetId,
        lengthMm: lowered.lengthMmOverride,
        pipelineHash: display.pipelineHash,
      },
    },
  };
}
