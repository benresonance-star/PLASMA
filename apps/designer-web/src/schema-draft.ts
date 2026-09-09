/**
 * Human Draft actions → pending ChangeSet (plan S10). No LLM, no mesh mutation.
 */

import {
  GOLDBERG_PATTERN_PUBLISHED_ID,
  PARAM_D01_ARM_WIDTH_ID,
  PARAM_D01_LENGTH_ID,
  PARAM_D01_STRUCTURAL_DEPTH_ID,
} from '@spds/ai-interface';
import type { PendingAiChangeSet } from './app-session.js';

export type SchemaDraftErrorCode =
  'MISSING_MODEL' | 'MISSING_HEAD' | 'INVALID_VALUE' | 'UNSUPPORTED';

export type SchemaDraftResult =
  | { readonly ok: true; readonly pending: PendingAiChangeSet }
  | { readonly ok: false; readonly code: SchemaDraftErrorCode; readonly reason: string };

export interface SchemaDraftContext {
  readonly modelId: string | null;
  readonly branchId: string | null;
  readonly headHash: string | null;
  readonly transactionId?: string | null;
}

function basePending(
  ctx: SchemaDraftContext,
  commands: PendingAiChangeSet['commands'],
  changeSetId: string,
): SchemaDraftResult {
  if (!ctx.modelId) {
    return { ok: false, code: 'MISSING_MODEL', reason: 'modelId required to draft ChangeSet' };
  }
  if (!ctx.headHash) {
    return {
      ok: false,
      code: 'MISSING_HEAD',
      reason: 'expectedHeadHash required to draft ChangeSet',
    };
  }
  const branchId = ctx.branchId ?? `branch:ai:${ctx.modelId}`;
  return {
    ok: true,
    pending: {
      changeSetId,
      branchId,
      expectedHeadHash: ctx.headHash,
      transactionId: ctx.transactionId ?? `txn:draft:${Date.now()}`,
      commands,
      actor: 'ai',
      disposition: 'proposed',
    },
  };
}

export function draftUpdateLengthMm(
  ctx: SchemaDraftContext,
  lengthMm: number,
  nowMs = Date.now(),
): SchemaDraftResult {
  if (!Number.isFinite(lengthMm) || lengthMm < 500 || lengthMm > 4000) {
    return {
      ok: false,
      code: 'INVALID_VALUE',
      reason: 'lengthMm must be between 500 and 4000',
    };
  }
  return basePending(
    ctx,
    [{ op: 'update', targetId: PARAM_D01_LENGTH_ID, payload: { lengthMm } }],
    `cs:draft:length:${nowMs}`,
  );
}

export function draftUpdateParam(
  ctx: SchemaDraftContext,
  input: {
    readonly paramId: string;
    readonly path: 'lengthMm' | 'armWidthMm' | 'structuralDepthMm';
    readonly value: number;
  },
  nowMs = Date.now(),
): SchemaDraftResult {
  if (!Number.isFinite(input.value)) {
    return { ok: false, code: 'INVALID_VALUE', reason: 'value must be finite' };
  }
  const targetId =
    input.paramId ||
    (input.path === 'lengthMm'
      ? PARAM_D01_LENGTH_ID
      : input.path === 'armWidthMm'
        ? PARAM_D01_ARM_WIDTH_ID
        : PARAM_D01_STRUCTURAL_DEPTH_ID);
  return basePending(
    ctx,
    [{ op: 'update', targetId, payload: { [input.path]: input.value } }],
    `cs:draft:${input.path}:${nowMs}`,
  );
}

export function draftCreateFolder(
  ctx: SchemaDraftContext,
  input?: { readonly label?: string; readonly parentId?: string },
  nowMs = Date.now(),
): SchemaDraftResult {
  return basePending(
    ctx,
    [
      {
        op: 'create',
        payload: {
          kind: 'ui.folder',
          semanticType: 'ui.folder',
          label: input?.label ?? 'Folder',
          ...(input?.parentId ? { parentId: input.parentId } : {}),
        },
      },
    ],
    `cs:draft:folder:${nowMs}`,
  );
}

export function draftApplyGoldbergPattern(
  ctx: SchemaDraftContext,
  input?: { readonly patternId?: string; readonly instanceId?: string },
  nowMs = Date.now(),
): SchemaDraftResult {
  const patternId = input?.patternId ?? GOLDBERG_PATTERN_PUBLISHED_ID;
  return basePending(
    ctx,
    [
      {
        op: 'apply_pattern',
        targetId: patternId,
        payload: {
          patternId,
          ...(input?.instanceId ? { patternInstanceId: input.instanceId } : {}),
        },
      },
    ],
    `cs:draft:apply_pattern:${nowMs}`,
  );
}

export function draftUpdatePatternParam(
  ctx: SchemaDraftContext,
  input: {
    readonly patternId?: string;
    readonly path: string;
    readonly value: number;
  },
  nowMs = Date.now(),
): SchemaDraftResult {
  if (!input.path.startsWith('params.') || !Number.isFinite(input.value)) {
    return {
      ok: false,
      code: 'INVALID_VALUE',
      reason: 'Pattern parameter update requires a finite value and params.* path',
    };
  }
  const patternId = input.patternId ?? GOLDBERG_PATTERN_PUBLISHED_ID;
  return basePending(
    ctx,
    [
      {
        op: 'apply_pattern',
        targetId: patternId,
        payload: {
          patternId,
          overrides: [{ path: input.path, value: input.value }],
        },
      },
    ],
    `cs:draft:pattern-param:${nowMs}`,
  );
}

/** Collect semantic ids touched by a pending draft (for Schema annotations). */
export function pendingSchemaAnnotationIds(
  pending: PendingAiChangeSet | null,
): ReadonlySet<string> {
  const ids = new Set<string>();
  if (!pending) return ids;
  for (const c of pending.commands) {
    if (typeof c.targetId === 'string' && c.targetId.length > 0) ids.add(c.targetId);
    const payload = c.payload as Record<string, unknown> | undefined;
    if (payload && typeof payload.patternId === 'string') ids.add(payload.patternId);
    if (payload && typeof payload.kind === 'string') ids.add(payload.kind);
    if (payload && typeof payload.semanticType === 'string') ids.add(payload.semanticType);
    if (c.op === 'update' && payload) {
      if ('lengthMm' in payload) ids.add(PARAM_D01_LENGTH_ID);
      if ('armWidthMm' in payload) ids.add(PARAM_D01_ARM_WIDTH_ID);
      if ('structuralDepthMm' in payload) ids.add(PARAM_D01_STRUCTURAL_DEPTH_ID);
    }
  }
  return ids;
}
