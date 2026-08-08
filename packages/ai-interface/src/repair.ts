/** G13A Closed-loop repair — feedback, bounded attempts, Why/What-If, audit. */

import type { ChangeSet } from './tools.js';
import { applyChangeSet, validateChangeSet } from './tools.js';

export interface FeedbackPacket {
  readonly attempt: number;
  readonly measurements: Readonly<Record<string, number>>;
  readonly constraintResults: readonly { readonly id: string; readonly ok: boolean }[];
  readonly failures: readonly { readonly code: string; readonly summary: string; readonly lineage: readonly string[] }[];
  readonly success: boolean;
}

export function buildFeedbackPacket(input: {
  readonly attempt: number;
  readonly measurements?: Readonly<Record<string, number>>;
  readonly constraintResults?: FeedbackPacket['constraintResults'];
  readonly failures?: FeedbackPacket['failures'];
}): FeedbackPacket {
  const failures = input.failures ?? [];
  return {
    attempt: input.attempt,
    measurements: input.measurements ?? {},
    constraintResults: input.constraintResults ?? [],
    failures,
    success: failures.length === 0 && (input.constraintResults ?? []).every((c) => c.ok),
  };
}

export interface RepairAttempt {
  readonly attempt: number;
  readonly changeSet: ChangeSet;
  readonly feedback: FeedbackPacket;
}

export interface RepairSession {
  readonly sessionId: string;
  readonly maxAttempts: number;
  readonly attempts: readonly RepairAttempt[];
  readonly status: 'open' | 'succeeded' | 'exhausted' | 'blocked';
}

export function createRepairSession(sessionId: string, maxAttempts = 3): RepairSession {
  return { sessionId, maxAttempts, attempts: [], status: 'open' };
}

export function runRepairAttempt(input: {
  readonly session: RepairSession;
  readonly changeSet: ChangeSet;
  readonly currentHeadHash: string;
  readonly agentBranchId: string;
  readonly sourceBranchId: string;
  readonly feedback: FeedbackPacket;
  readonly relaxHardConstraints?: boolean;
}): RepairSession {
  if (input.relaxHardConstraints) {
    throw new Error('Cannot silently relax hard constraints');
  }
  if (input.session.attempts.length >= input.session.maxAttempts) {
    return { ...input.session, status: 'exhausted' };
  }
  const v = validateChangeSet(input.changeSet);
  if (!v.ok) throw new Error(v.reason);
  const applied = applyChangeSet({
    changeSet: input.changeSet,
    currentHeadHash: input.currentHeadHash,
    agentBranchId: input.agentBranchId,
    sourceBranchId: input.sourceBranchId,
  });
  if (applied.disposition === 'conflict') {
    return {
      ...input.session,
      attempts: [
        ...input.session.attempts,
        { attempt: input.session.attempts.length + 1, changeSet: applied, feedback: input.feedback },
      ],
      status: 'blocked',
    };
  }
  const attempts: RepairAttempt[] = [
    ...input.session.attempts,
    {
      attempt: input.session.attempts.length + 1,
      changeSet: applied,
      feedback: input.feedback,
    },
  ];
  if (input.feedback.success) {
    return { ...input.session, attempts, status: 'succeeded' };
  }
  if (attempts.length >= input.session.maxAttempts) {
    return { ...input.session, attempts, status: 'exhausted' };
  }
  return { ...input.session, attempts, status: 'open' };
}

export interface WhyResult {
  readonly semanticId: string;
  readonly lineage: readonly string[];
  readonly explanation: string;
}

export function whyTool(semanticId: string, lineage: readonly string[]): WhyResult {
  return {
    semanticId,
    lineage,
    explanation: `${semanticId} produced by ${lineage.join(' → ') || 'unknown'}`,
  };
}

export interface WhatIfResult {
  readonly branchId: string;
  readonly deltas: Readonly<Record<string, number>>;
  readonly fidelity: 'estimated' | 'exact';
}

export function whatIfTool(input: {
  readonly branchId: string;
  readonly deltas: Readonly<Record<string, number>>;
  readonly compiled: boolean;
}): WhatIfResult {
  return {
    branchId: input.branchId,
    deltas: input.deltas,
    fidelity: input.compiled ? 'exact' : 'estimated',
  };
}

export interface AiAuditRecord {
  readonly auditId: string;
  readonly intent: string;
  readonly toolCalls: readonly string[];
  readonly changeSetIds: readonly string[];
  readonly repairAttempts: number;
  readonly disposition: string;
  readonly actor: 'ai';
}

export function recordAiAudit(input: Omit<AiAuditRecord, 'actor'>): AiAuditRecord {
  return { ...input, actor: 'ai' };
}
