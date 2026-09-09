/**
 * Orchestrate AI ChangeSet accept → semantic gate → AI-branch txn → D01 compile / organise.
 */

import { acceptSemanticCommand, toDesignCommandPayload } from '@spds/semantic-commands';
import {
  changeSetToSemanticCommands,
  isOrganiseOnlyLowerResult,
  type ChangeSet,
  type OrganiseAcceptOp,
} from '@spds/ai-interface';
import type { TransactionEngine } from '@spds/transaction-core';
import { asPromise, type VersionStore } from '@spds/version-core';
import { buildD01DisplayMeshes } from '@spds/reference-pipeline';
import { createModelGroup, reparentModelNode } from './model-groups.js';
import {
  loadOrganisationFromStore,
  mergeOrganisationFromSources,
  persistOrganisationSnapshot,
} from './model-organisation-persist.js';
import { buildLiveD01QueryContext, type ModelQueryContextRegistry } from './model-query-context.js';
import { seedD01BranchObjects } from './ai-branch-seed.js';
import { extractD01GeometryParams } from './d01-candidate-params.js';
import { persistGeometrySnapshot } from './model-geometry-persist.js';
import type { BranchUndoRegistry } from './branch-undo.js';
import { withCompensating } from './compensating-command.js';
import type { DesignCommand } from '@spds/transaction-core';

export interface AiBranchContext {
  readonly modelId: string;
  readonly mainBranchId: string;
  readonly aiBranchId: string;
}

export async function ensureAiBranchContext(store: VersionStore): Promise<AiBranchContext> {
  const existing = (store as unknown as { __spdsAiCtx?: AiBranchContext }).__spdsAiCtx;
  if (existing) return existing;
  const model = await asPromise(store.createModel('D01'));
  const mainBranchId = store.getMainBranchId(model.modelId);
  // T0: seed main before forking so AI branch clones composition + params.
  await seedD01BranchObjects(store, mainBranchId);
  const ai = await asPromise(store.createBranch(model.modelId, 'ai-agent', mainBranchId));
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
  /** Live substrate model id for organise ops (create_group / connect). */
  readonly modelId?: string;
}

export interface AcceptChangeSetResult {
  readonly status: 'applied' | 'rejected';
  readonly failureCode?: string;
  readonly reason?: string;
  readonly disposition: 'applied' | 'rejected';
  readonly lengthMmOverride?: number;
  readonly armWidthMm?: number;
  readonly structuralDepthMm?: number;
  readonly frequency?: number;
  readonly diameterMm?: number;
  readonly riseRatio?: number;
  readonly pipelineHash?: string;
  readonly pirHash?: string;
  readonly meshes?: Awaited<ReturnType<typeof buildD01DisplayMeshes>>['meshes'];
  readonly branchId?: string;
  readonly newHeadHash?: string;
  readonly mainHeadHash?: string;
  readonly acceptedCommands?: number;
  readonly organisationApplied?: boolean;
  readonly mode?: 'geometry' | 'organise' | 'create' | 'pattern' | 'mixed';
  readonly patternInstanceId?: string;
  readonly appliedPatternId?: string;
  readonly audit?: {
    readonly changeSetId: string;
    readonly lengthMm?: number;
    readonly armWidthMm?: number;
    readonly structuralDepthMm?: number;
    readonly frequency?: number;
    readonly diameterMm?: number;
    readonly riseRatio?: number;
    readonly pipelineHash?: string;
    readonly organiseOpCount?: number;
    readonly patternInstanceId?: string;
  };
}

function applyOrganiseOps(
  queryContexts: ModelQueryContextRegistry,
  modelId: string,
  ops: readonly OrganiseAcceptOp[],
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  let ctx = queryContexts.get(modelId);
  if (!ctx) {
    return { ok: false, reason: `model_query_context_not_found:${modelId}` };
  }
  for (const op of ops) {
    switch (op.kind) {
      case 'create_group': {
        const created = createModelGroup(ctx, {
          parentId: op.parentId,
          ...(op.label !== undefined ? { label: op.label } : {}),
          ...(op.groupId !== undefined ? { groupId: op.groupId } : {}),
        });
        if (!created.ok) {
          return { ok: false, reason: `create_group:${created.error}` };
        }
        ctx = created.ctx;
        break;
      }
      case 'connect': {
        const moved = reparentModelNode(ctx, {
          nodeId: op.nodeId,
          newParentId: op.newParentId,
        });
        if (!moved.ok) {
          return { ok: false, reason: `connect:${moved.error}` };
        }
        ctx = moved.ctx;
        break;
      }
      default: {
        const _exhaustive: never = op;
        return { ok: false, reason: `unknown_organise_op:${String(_exhaustive)}` };
      }
    }
  }
  queryContexts.set(ctx);
  return { ok: true };
}

export async function acceptAiChangeSet(input: {
  readonly store: VersionStore;
  readonly txEngine: TransactionEngine;
  readonly body: AcceptChangeSetInput;
  readonly queryContexts?: ModelQueryContextRegistry;
  readonly undoRegistry?: BranchUndoRegistry;
}): Promise<{ readonly httpStatus: number; readonly body: AcceptChangeSetResult }> {
  const ctx = await ensureAiBranchContext(input.store);
  const mainHeadBefore = (await asPromise(input.store.getBranchHead(ctx.mainBranchId))).headHash;
  const aiHead = (await asPromise(input.store.getBranchHead(ctx.aiBranchId))).headHash;

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

  const substrateModelId = input.body.modelId ?? ctx.modelId;
  const lowered = changeSetToSemanticCommands(cs, { modelId: substrateModelId });
  if (!lowered.ok) {
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

  if (
    lowered.organiseOps.length > 0 &&
    (!input.queryContexts || !input.queryContexts.get(substrateModelId))
  ) {
    return {
      httpStatus: 422,
      body: {
        status: 'rejected',
        disposition: 'rejected',
        failureCode: 'ORGANISE_CONTEXT_REQUIRED',
        reason:
          'Organise/create-folder accept requires seeded model query context (POST …/substrate/d01)',
        mainHeadHash: mainHeadBefore,
        branchId: ctx.aiBranchId,
        mode: lowered.mode,
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
  let compilePirHash: string | undefined;
  const recordedCommands: DesignCommand[] = [];
  const priorCtxParams = input.queryContexts?.get(substrateModelId)?.parameters;
  const priorGeometry = {
    lengthMm: typeof priorCtxParams?.lengthMm === 'number' ? priorCtxParams.lengthMm : 2300,
    armWidthMm: typeof priorCtxParams?.armWidthMm === 'number' ? priorCtxParams.armWidthMm : 80,
    structuralDepthMm:
      typeof priorCtxParams?.structuralDepthMm === 'number' ? priorCtxParams.structuralDepthMm : 40,
  };
  try {
    const txn = await input.txEngine.begin({
      modelId: ctx.modelId,
      branchId: ctx.aiBranchId,
      actorId: first.actorId,
      actorType: 'ai',
      expectedHeadHash: aiHead,
      idempotencyKey: `accept:${cs.changeSetId}:${aiHead}:${lowered.mode}:${JSON.stringify(lowered.geometryParams ?? 'org')}`,
    });
    txnId = txn.id;
    let appended = 0;
    for (const env of lowered.envelopes) {
      const design = toDesignCommandPayload(env);
      if (!design) continue;
      const cmd = withCompensating(
        {
          id: design.id,
          type: design.type,
          targetIds: [...design.targetIds],
          payload: design.payload,
        },
        priorGeometry,
      );
      input.txEngine.appendCommand(txn.id, cmd);
      recordedCommands.push(cmd);
      appended += 1;
    }
    // CONNECT-only organise has no design mapping — append a CREATE_OBJECT marker so txn is non-empty.
    if (appended === 0 && lowered.organiseOps.length > 0) {
      const marker = withCompensating(
        {
          id: `${cs.changeSetId}:organise-marker`,
          type: 'CREATE_OBJECT',
          targetIds: [substrateModelId],
          payload: {
            id: `${cs.changeSetId}:organise-marker`,
            organiseOnly: true,
            opCount: lowered.organiseOps.length,
          },
        },
        priorGeometry,
      );
      input.txEngine.appendCommand(txn.id, marker);
      recordedCommands.push(marker);
    }
    await input.txEngine.buildCandidate(txn.id);
    // Geometry: real compile adapter when wired. Organise-only: mockCompile (no mesh claim).
    if (isOrganiseOnlyLowerResult(lowered)) {
      input.txEngine.mockCompile(txn.id);
    } else if (input.txEngine.hasCompileAdapter()) {
      const manifest = await input.txEngine.compile(txn.id);
      compilePirHash = manifest.pirHash;
    } else {
      // Tests / bare engine: still build candidate; mesh path supplies PIR truth below.
      input.txEngine.mockCompile(txn.id);
    }
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

  const priorOrganisation =
    lowered.organiseOps.length > 0 && input.queryContexts
      ? input.queryContexts.get(substrateModelId)
      : null;

  if (lowered.organiseOps.length > 0 && input.queryContexts) {
    const organised = applyOrganiseOps(input.queryContexts, substrateModelId, lowered.organiseOps);
    if (!organised.ok) {
      if (priorOrganisation) input.queryContexts.set(priorOrganisation);
      try {
        input.txEngine.abort(txnId!, 'ORGANISE_APPLY_FAILED');
      } catch {
        /* ignore */
      }
      return {
        httpStatus: 422,
        body: {
          status: 'rejected',
          disposition: 'rejected',
          failureCode: 'ORGANISE_APPLY_FAILED',
          reason: organised.reason,
          mainHeadHash: mainHeadBefore,
          branchId: ctx.aiBranchId,
          mode: lowered.mode,
        },
      };
    }
  }

  const recordUndo = (afterHeadHash: string) => {
    if (!input.undoRegistry || !txnId || recordedCommands.length === 0) return;
    if (!recordedCommands.every((c) => Boolean(c.compensating))) return;
    input.undoRegistry.record(ctx.aiBranchId, {
      id: `undo:${cs.changeSetId}`,
      transactionId: txnId,
      commands: recordedCommands,
      beforeHeadHash: aiHead,
      afterHeadHash,
    });
  };

  // Hierarchy / allowlisted create stubs: skip D01 mesh regenerate (plan C0b / T4).
  if (isOrganiseOnlyLowerResult(lowered)) {
    await input.txEngine.commit(txnId!);
    const organisedCtx = input.queryContexts?.get(substrateModelId);
    if (organisedCtx && input.queryContexts) {
      if (lowered.createdParameters && lowered.createdParameters.length > 0) {
        const nextParams = { ...organisedCtx.parameters };
        for (const p of lowered.createdParameters) {
          if (p.value !== undefined && p.path) nextParams[p.path] = p.value;
        }
        input.queryContexts.set({ ...organisedCtx, parameters: nextParams });
      }
      await persistOrganisationSnapshot(
        input.store,
        substrateModelId,
        input.queryContexts.get(substrateModelId) ?? organisedCtx,
      );
    }
    const newHead = (await asPromise(input.store.getBranchHead(ctx.aiBranchId))).headHash;
    const mainHeadAfter = (await asPromise(input.store.getBranchHead(ctx.mainBranchId))).headHash;
    recordUndo(newHead);
    return {
      httpStatus: 201,
      body: {
        status: 'applied',
        disposition: 'applied',
        branchId: ctx.aiBranchId,
        newHeadHash: newHead,
        mainHeadHash: mainHeadAfter,
        acceptedCommands: lowered.envelopes.length,
        organisationApplied: lowered.organiseOps.length > 0,
        mode: lowered.mode,
        audit: {
          changeSetId: cs.changeSetId,
          organiseOpCount: lowered.organiseOps.length,
        },
      },
    };
  }

  const yLimit = input.body.yLimit ?? 2;
  const txn = input.txEngine.getTransaction(txnId!)!;
  const candidate = txn.candidateRevisionId
    ? input.txEngine.getCandidate(txn.candidateRevisionId)
    : undefined;
  if (!candidate) {
    try {
      input.txEngine.abort(txnId!, 'EMPTY_CANDIDATE');
    } catch {
      /* ignore */
    }
    return {
      httpStatus: 422,
      body: {
        status: 'rejected',
        disposition: 'rejected',
        failureCode: 'EMPTY_CANDIDATE',
        reason: 'Geometry accept requires a built candidate',
        mainHeadHash: mainHeadBefore,
        branchId: ctx.aiBranchId,
        mode: lowered.mode,
      },
    };
  }

  const geometryParams = extractD01GeometryParams(candidate.objects);

  let display: Awaited<ReturnType<typeof buildD01DisplayMeshes>>;
  try {
    // Meshes from candidate-extracted params (same knobs the compile adapter used).
    display = await buildD01DisplayMeshes({
      yLimit,
      lengthMm: geometryParams.lengthMm,
      armWidthMm: geometryParams.armWidthMm,
      structuralDepthMm: geometryParams.structuralDepthMm,
      frequency: geometryParams.frequency,
      diameterMm: geometryParams.diameterMm,
      riseRatio: geometryParams.riseRatio,
    });
  } catch (err) {
    if (priorOrganisation && input.queryContexts) {
      input.queryContexts.set(priorOrganisation);
    }
    try {
      input.txEngine.abort(txnId!, 'GEOMETRY_REGEN_FAILED');
    } catch {
      /* ignore */
    }
    return {
      httpStatus: 422,
      body: {
        status: 'rejected',
        disposition: 'rejected',
        failureCode: 'GEOMETRY_REGEN_FAILED',
        reason: err instanceof Error ? err.message : 'geometry regen failed',
        mainHeadHash: mainHeadBefore,
        branchId: ctx.aiBranchId,
        mode: lowered.mode,
      },
    };
  }

  // T2a: when a real compile adapter ran at the same yLimit (adapter uses 2),
  // txn PIR must match display PIR.
  if (
    compilePirHash !== undefined &&
    input.txEngine.hasCompileAdapter() &&
    yLimit === 2 &&
    compilePirHash !== display.pirHash
  ) {
    if (priorOrganisation && input.queryContexts) {
      input.queryContexts.set(priorOrganisation);
    }
    try {
      input.txEngine.abort(txnId!, 'PIR_HASH_MISMATCH');
    } catch {
      /* ignore */
    }
    return {
      httpStatus: 422,
      body: {
        status: 'rejected',
        disposition: 'rejected',
        failureCode: 'PIR_HASH_MISMATCH',
        reason: `manifest pirHash ${compilePirHash} !== display pirHash ${display.pirHash}`,
        mainHeadHash: mainHeadBefore,
        branchId: ctx.aiBranchId,
        mode: lowered.mode,
      },
    };
  }

  await input.txEngine.commit(txnId!);

  // T9: durable geometry (+ organise) on main so substrate cold-start can rebuild.
  await persistGeometrySnapshot(input.store, substrateModelId, geometryParams);
  if (lowered.organiseOps.length > 0 && input.queryContexts) {
    const organisedCtx = input.queryContexts.get(substrateModelId);
    if (organisedCtx) {
      await persistOrganisationSnapshot(input.store, substrateModelId, organisedCtx);
    }
  }

  // T2b: refresh live substrate so explain/impact match accepted geometry.
  if (input.queryContexts) {
    const prior = input.queryContexts.get(substrateModelId);
    try {
      const next = await buildLiveD01QueryContext(substrateModelId, {
        yLimit,
        lengthMm: geometryParams.lengthMm,
        armWidthMm: geometryParams.armWidthMm,
        structuralDepthMm: geometryParams.structuralDepthMm,
        frequency: geometryParams.frequency,
        diameterMm: geometryParams.diameterMm,
        riseRatio: geometryParams.riseRatio,
      });
      const storedOrg = await loadOrganisationFromStore(input.store, substrateModelId);
      const refreshed = prior
        ? mergeOrganisationFromSources(next, prior, storedOrg)
        : mergeOrganisationFromSources(next, null, storedOrg);
      // Prefer accept-response meshes / hashes as authoritative for this model.
      input.queryContexts.set({
        ...refreshed,
        displayMeshes: display.meshes,
        pipelineHash: display.pipelineHash,
        parameters: {
          ...refreshed.parameters,
          lengthMm: geometryParams.lengthMm,
          armWidthMm: geometryParams.armWidthMm,
          structuralDepthMm: geometryParams.structuralDepthMm,
          frequency: geometryParams.frequency,
          diameterMm: geometryParams.diameterMm,
          riseRatio: geometryParams.riseRatio,
        },
      });
    } catch {
      /* substrate refresh best-effort — accept already committed */
    }
  }

  const newHead = (await asPromise(input.store.getBranchHead(ctx.aiBranchId))).headHash;
  const mainHeadAfter = (await asPromise(input.store.getBranchHead(ctx.mainBranchId))).headHash;
  recordUndo(newHead);

  return {
    httpStatus: 201,
    body: {
      status: 'applied',
      disposition: 'applied',
      lengthMmOverride: geometryParams.lengthMm,
      armWidthMm: geometryParams.armWidthMm,
      structuralDepthMm: geometryParams.structuralDepthMm,
      frequency: geometryParams.frequency,
      diameterMm: geometryParams.diameterMm,
      riseRatio: geometryParams.riseRatio,
      pipelineHash: display.pipelineHash,
      pirHash: display.pirHash,
      meshes: display.meshes,
      branchId: ctx.aiBranchId,
      newHeadHash: newHead,
      mainHeadHash: mainHeadAfter,
      acceptedCommands: lowered.envelopes.length,
      organisationApplied: lowered.organiseOps.length > 0,
      mode: lowered.mode,
      ...(lowered.patternInstanceId !== undefined
        ? { patternInstanceId: lowered.patternInstanceId }
        : {}),
      ...(lowered.appliedPatternId !== undefined
        ? { appliedPatternId: lowered.appliedPatternId }
        : {}),
      audit: {
        changeSetId: cs.changeSetId,
        ...(lowered.patternInstanceId !== undefined
          ? { patternInstanceId: lowered.patternInstanceId }
          : {}),
        lengthMm: geometryParams.lengthMm,
        armWidthMm: geometryParams.armWidthMm,
        structuralDepthMm: geometryParams.structuralDepthMm,
        frequency: geometryParams.frequency,
        diameterMm: geometryParams.diameterMm,
        riseRatio: geometryParams.riseRatio,
        pipelineHash: display.pipelineHash,
        ...(lowered.organiseOps.length > 0 ? { organiseOpCount: lowered.organiseOps.length } : {}),
      },
    },
  };
}
