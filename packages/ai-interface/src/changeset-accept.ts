/**
 * Lower AI ChangeSets to semantic UPDATE envelopes for acceptSemanticCommand.
 * MVP: update + lengthMm only.
 */

import type { ChangeSet } from './tools.js';
import { validateChangeSet } from './tools.js';
import { DEMO_Y_SEMANTIC_ID, mapChangeSetTargetId } from './id-map.js';

export const LENGTH_MM_MIN = 6;
export const LENGTH_MM_MAX = 12;

export interface ChangeSetAcceptEnvelope {
  readonly commandId: string;
  readonly command: 'UPDATE';
  readonly modelId: string;
  readonly branchId: string;
  readonly expectedHeadHash: string;
  readonly actorId: string;
  readonly actorType: 'ai';
  readonly payload: {
    readonly id: string;
    readonly targetIds: readonly string[];
    readonly path: 'lengthMm';
    readonly value: number;
  };
  readonly idempotencyKey: string;
}

export interface ChangeSetLowerResult {
  readonly ok: boolean;
  readonly envelopes: readonly ChangeSetAcceptEnvelope[];
  readonly lengthMmOverride?: number;
  readonly failureCode?: string;
  readonly reason?: string;
}

function clampLengthMm(n: number): number {
  return Math.min(LENGTH_MM_MAX, Math.max(LENGTH_MM_MIN, n));
}

export function changeSetToSemanticCommands(
  cs: ChangeSet,
  options?: { readonly modelId?: string },
): ChangeSetLowerResult {
  const v = validateChangeSet(cs);
  if (!v.ok) {
    return {
      ok: false,
      envelopes: [],
      failureCode: 'CHANGESET_INVALID',
      reason: v.reason ?? 'invalid ChangeSet',
    };
  }

  const modelId = options?.modelId ?? 'model:D01';
  const envelopes: ChangeSetAcceptEnvelope[] = [];
  let lengthMmOverride: number | undefined;

  for (let i = 0; i < cs.commands.length; i++) {
    const cmd = cs.commands[i]!;
    if (cmd.op !== 'update') {
      return {
        ok: false,
        envelopes: [],
        failureCode: 'UNSUPPORTED_OP',
        reason: `MVP accept supports update only (got ${cmd.op})`,
      };
    }
    if (!cmd.targetId) {
      return {
        ok: false,
        envelopes: [],
        failureCode: 'MISSING_TARGET',
        reason: 'update requires targetId',
      };
    }
    const mapped = mapChangeSetTargetId(cmd.targetId);
    if (!mapped.ok) {
      return {
        ok: false,
        envelopes: [],
        failureCode: 'UNKNOWN_TARGET',
        reason: mapped.reason ?? 'Unknown target',
      };
    }
    const payload = cmd.payload;
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        envelopes: [],
        failureCode: 'MISSING_LENGTH',
        reason: 'update requires lengthMm payload',
      };
    }
    const raw = (payload as Record<string, unknown>).lengthMm;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return {
        ok: false,
        envelopes: [],
        failureCode: 'MISSING_LENGTH',
        reason: 'update requires numeric lengthMm',
      };
    }
    const value = clampLengthMm(raw);
    lengthMmOverride = value;
    envelopes.push({
      commandId: `${cs.changeSetId}:cmd:${i}`,
      command: 'UPDATE',
      modelId,
      branchId: cs.branchId,
      expectedHeadHash: cs.expectedHeadHash,
      actorId: 'agent:spds',
      actorType: 'ai',
      payload: {
        id: DEMO_Y_SEMANTIC_ID,
        targetIds: [DEMO_Y_SEMANTIC_ID],
        path: 'lengthMm',
        value,
      },
      idempotencyKey: `${cs.changeSetId}:${i}:${value}`,
    });
  }

  if (envelopes.length === 0 || lengthMmOverride === undefined) {
    return {
      ok: false,
      envelopes: [],
      failureCode: 'EMPTY',
      reason: 'No lengthMm updates to accept',
    };
  }

  return { ok: true, envelopes, lengthMmOverride };
}
