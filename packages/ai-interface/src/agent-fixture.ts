/**
 * G13/G13A scripted agent fixture — branch-isolated ChangeSet → compile/validate/compare → repair.
 */

import {
  applyChangeSet,
  buildAiChangesView,
  executeReadTool,
  type AiJob,
  type ChangeSet,
} from './tools.js';
import {
  buildFeedbackPacket,
  createRepairSession,
  recordAiAudit,
  runRepairAttempt,
  whyTool,
  type AiAuditRecord,
  type RepairSession,
} from './repair.js';

export interface AgentFixtureResult {
  readonly readSummary: { readonly objectCount: number };
  readonly applied: ChangeSet;
  readonly compileJob: AiJob;
  readonly validateJob: AiJob;
  readonly compareJob: AiJob;
  readonly repair: RepairSession;
  readonly audit: AiAuditRecord;
  readonly why: ReturnType<typeof whyTool>;
  readonly changesView: ReturnType<typeof buildAiChangesView>;
}

export function enqueueJob(kind: AiJob['kind'], ok: boolean, result?: unknown): AiJob {
  if (ok) {
    return { jobId: `job:${kind}`, kind, status: 'succeeded', result: result ?? { ok: true } };
  }
  return {
    jobId: `job:${kind}`,
    kind,
    status: 'failed',
    failure: { code: `${kind.toUpperCase()}_FAILED`, summary: `${kind} failed` },
  };
}

/** Run compile/validate/compare as deterministic in-process jobs (not async workers). */
export function runCompileValidateCompare(input: {
  readonly compileOk: boolean;
  readonly validateOk: boolean;
  readonly compareOk?: boolean;
}): { readonly compileJob: AiJob; readonly validateJob: AiJob; readonly compareJob: AiJob } {
  return {
    compileJob: enqueueJob('compile', input.compileOk, { pirHash: 'pir:1' }),
    validateJob: enqueueJob('validate', input.validateOk, { issueCount: input.validateOk ? 0 : 1 }),
    compareJob: enqueueJob('compare', input.compareOk ?? true, { changedIds: ['Y:1'] }),
  };
}

/**
 * Scripted agent: propose param on AI branch, hit recoverable validate failure, repair within bound.
 */
export function runScriptedAgentFixture(): AgentFixtureResult {
  const catalog = {
    objects: [
      { id: 'Y:1', kind: 'Y' },
      { id: 'pattern:geodesic', kind: 'Pattern' },
    ],
    patterns: ['geodesic'],
    operators: ['y-network.v1'],
    schemaTypes: ['Y', 'Pattern'],
  };
  const summary = executeReadTool({ tool: 'summary' }, catalog);
  const sourceBranchId = 'branch:main';
  const agentBranchId = 'branch:ai-agent';
  let head = 'head:1';

  const proposed: ChangeSet = {
    changeSetId: 'cs:agent:1',
    branchId: agentBranchId,
    expectedHeadHash: head,
    transactionId: 'txn:agent:1',
    commands: [{ op: 'update', targetId: 'Y:1', payload: { lengthMm: 12 } }],
    actor: 'ai',
    disposition: 'proposed',
  };

  const applied = applyChangeSet({
    changeSet: proposed,
    currentHeadHash: head,
    agentBranchId,
    sourceBranchId,
  });
  head = 'head:2';

  // First compile ok, validate fails (recoverable).
  let jobs = runCompileValidateCompare({ compileOk: true, validateOk: false });
  let repair = createRepairSession('repair:agent:1', 3);
  repair = runRepairAttempt({
    session: repair,
    changeSet: {
      ...proposed,
      changeSetId: 'cs:agent:repair:1',
      expectedHeadHash: head,
      commands: [{ op: 'update', targetId: 'Y:1', payload: { lengthMm: 10 } }],
      disposition: 'proposed',
    },
    currentHeadHash: head,
    agentBranchId,
    sourceBranchId,
    feedback: buildFeedbackPacket({
      attempt: 1,
      failures: [
        {
          code: 'DOMAIN_VIOLATION',
          summary: 'lengthMm out of fabrication domain',
          lineage: ['Y:1', 'pattern:geodesic'],
        },
      ],
      constraintResults: [{ id: 'c:length', ok: false }],
    }),
  });

  // Second attempt succeeds.
  jobs = runCompileValidateCompare({ compileOk: true, validateOk: true });
  repair = runRepairAttempt({
    session: repair,
    changeSet: {
      ...proposed,
      changeSetId: 'cs:agent:repair:2',
      expectedHeadHash: head,
      commands: [{ op: 'update', targetId: 'Y:1', payload: { lengthMm: 8 } }],
      disposition: 'proposed',
    },
    currentHeadHash: head,
    agentBranchId,
    sourceBranchId,
    feedback: buildFeedbackPacket({
      attempt: 2,
      measurements: { lengthMm: 8 },
      constraintResults: [{ id: 'c:length', ok: true }],
      failures: [],
    }),
  });

  const why = whyTool('Y:1', ['pattern:geodesic', 'compose', 'y-network']);
  const audit = recordAiAudit({
    auditId: 'audit:agent:1',
    intent: 'Add length parameter within domain',
    toolCalls: ['summary', 'applyChangeSet', 'compile', 'validate', 'repair'],
    changeSetIds: repair.attempts.map((a) => a.changeSet.changeSetId),
    repairAttempts: repair.attempts.length,
    disposition: repair.status === 'succeeded' ? 'applied' : 'rejected',
  });

  return {
    readSummary: summary.data as { objectCount: number },
    applied,
    compileJob: jobs.compileJob,
    validateJob: jobs.validateJob,
    compareJob: jobs.compareJob,
    repair,
    audit,
    why,
    changesView: buildAiChangesView([applied, ...repair.attempts.map((a) => a.changeSet)]),
  };
}
