/**
 * Agent run orchestration — scripted (default/CI) or OpenAI-compatible LLM.
 * Keys optional: mode=auto uses scripted when SPDS_AI_API_KEY is absent.
 */

import {
  runScriptedAgentWithLiveCompile,
  type LiveCompileFn,
  type LiveCompileResult,
} from './live-compile.js';
import { enqueueJob, type AgentFixtureResult } from './agent-fixture.js';
import { chatWithTools, type LlmChatMessage, type LlmFetch } from './llm-client.js';
import { loadLlmConfig, type LlmConfig } from './llm-config.js';
import { buildAiToolDefinitions, routeAiTool, type ToolRouterContext } from './tool-router.js';
import {
  buildFeedbackPacket,
  createRepairSession,
  recordAiAudit,
  runRepairAttempt,
  whyTool,
  type RepairSession,
} from './repair.js';
import { buildAiChangesView, type ChangeSet } from './tools.js';
import {
  buildAgentContextPackage,
  renderAgentSystemPrompt,
  type AgentContextPackage,
  type AgentContextParameter,
} from './agent-context.js';

export type AgentRunMode = 'auto' | 'scripted' | 'llm';
export type ResolvedAgentMode = 'scripted' | 'llm';

export type AgentCatalog = ToolRouterContext['catalog'];

/** T0b — live branch/head/txn binding (never hardcode head:1 for model-scoped runs). */
export interface AgentBranchBinding {
  readonly modelId: string;
  readonly branchId: string;
  readonly sourceBranchId: string;
  readonly expectedHeadHash: string;
  readonly transactionId: string;
}

export interface AgentRunInput {
  readonly intent?: string;
  readonly mode?: AgentRunMode;
  /** Smoke compile — must receive proposed lengthMm when available (same mapper as accept). */
  readonly compile: LiveCompileFn;
  readonly config?: LlmConfig;
  readonly fetchImpl?: LlmFetch;
  readonly maxLlmRounds?: number;
  /** Live model catalog — when omitted, falls back to DEFAULT_CATALOG (demo-only). */
  readonly catalog?: AgentCatalog;
  /** Live head/branch — required for accept-ready proposals. */
  readonly branchBinding?: AgentBranchBinding;
  /** Prebuilt context; when omitted and branchBinding present, built automatically. */
  readonly agentContext?: AgentContextPackage;
  readonly folderIds?: readonly string[];
  /** Mutable parameters discovered from installed pattern packages. */
  readonly parameters?: readonly AgentContextParameter[];
}

export interface AgentRunResult extends AgentFixtureResult {
  readonly mode: ResolvedAgentMode;
  readonly requestedMode: AgentRunMode;
  readonly llmConfigured: boolean;
  readonly liveCompile: LiveCompileResult;
  /** Truth-gated overall status — never claims success if live compile failed. */
  readonly status: 'succeeded' | 'failed';
  readonly error?: string;
  readonly llmRounds?: number;
  readonly note: string;
  readonly agentContext?: AgentContextPackage;
  readonly systemPromptHash?: string;
}

const DEFAULT_CATALOG = {
  objects: [
    { id: 'y:demo:01', kind: 'Y' },
    { id: 'pattern:geodesic', kind: 'Pattern' },
  ],
  patterns: ['geodesic'],
  operators: ['y-network.v1'],
  schemaTypes: ['Y', 'Pattern'],
} as const;

export function resolveAgentMode(
  requested: AgentRunMode,
  configured: boolean,
): { readonly mode: ResolvedAgentMode; readonly error?: string } {
  if (requested === 'scripted') return { mode: 'scripted' };
  if (requested === 'llm') {
    if (!configured) {
      return { mode: 'llm', error: 'SPDS_AI_API_KEY not configured (llm mode requires a key)' };
    }
    return { mode: 'llm' };
  }
  return { mode: configured ? 'llm' : 'scripted' };
}

function truthGate(live: LiveCompileResult, repair: RepairSession): 'succeeded' | 'failed' {
  if (!live.ok) return 'failed';
  if (repair.status !== 'succeeded') return 'failed';
  return 'succeeded';
}

function lengthMmFromChangeSet(cs: ChangeSet): number | undefined {
  for (const cmd of cs.commands) {
    const payload = cmd.payload;
    if (payload && typeof payload === 'object' && 'lengthMm' in payload) {
      const n = (payload as { lengthMm?: unknown }).lengthMm;
      if (typeof n === 'number' && Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function resolveContext(input: AgentRunInput): AgentContextPackage | undefined {
  if (input.agentContext) return input.agentContext;
  const b = input.branchBinding;
  if (!b) return undefined;
  return buildAgentContextPackage({
    modelId: b.modelId,
    branchId: b.branchId,
    expectedHeadHash: b.expectedHeadHash,
    transactionId: b.transactionId,
    ...(input.catalog ? { catalog: input.catalog } : {}),
    ...(input.folderIds ? { folderIds: input.folderIds } : {}),
    ...(input.parameters ? { parameters: input.parameters } : {}),
  });
}

function stampBranchBinding(cs: ChangeSet, binding: AgentBranchBinding): ChangeSet {
  return {
    ...cs,
    branchId: binding.branchId,
    expectedHeadHash: binding.expectedHeadHash,
    transactionId: binding.transactionId,
  };
}

async function runScriptedPath(input: AgentRunInput, config: LlmConfig): Promise<AgentRunResult> {
  const intent = input.intent?.trim() || 'Scripted agent: propose length within domain';
  const agentContext = resolveContext(input);
  const base = await runScriptedAgentWithLiveCompile(input.compile);
  const applied = input.branchBinding
    ? stampBranchBinding(base.applied, input.branchBinding)
    : base.applied;
  const audit = recordAiAudit({
    ...base.audit,
    intent,
    disposition: base.liveCompile.ok && base.repair.status === 'succeeded' ? 'applied' : 'rejected',
  });
  const status = truthGate(base.liveCompile, base.repair);
  return {
    ...base,
    applied,
    audit,
    mode: 'scripted',
    requestedMode: input.mode ?? 'auto',
    llmConfigured: config.configured,
    status,
    ...(agentContext ? { agentContext, systemPromptHash: agentContext.promptHash } : {}),
    note:
      status === 'succeeded'
        ? 'Scripted proposal + live D01 smoke compile. Geometry changes only after Accept & rebuild (/ai/changeset/accept).'
        : 'Scripted path completed but live compile or repair failed — status truth-gated.',
    ...(status === 'failed'
      ? {
          error: base.liveCompile.ok
            ? `repair:${base.repair.status}`
            : (base.liveCompile.failureCode ?? 'LIVE_COMPILE_FAILED'),
        }
      : {}),
  };
}

async function runLlmPath(input: AgentRunInput, config: LlmConfig): Promise<AgentRunResult> {
  const intent = input.intent?.trim() || 'Propose a safe lengthMm update for y:demo:01';
  const maxRounds = input.maxLlmRounds ?? 6;
  const binding = input.branchBinding;
  const sourceBranchId = binding?.sourceBranchId ?? 'branch:main';
  const agentBranchId = binding?.branchId ?? 'branch:ai-agent';
  const head = binding?.expectedHeadHash ?? 'head:1';
  const txn = binding?.transactionId ?? `txn:llm:${Date.now()}`;
  const agentContext =
    resolveContext(input) ??
    buildAgentContextPackage({
      modelId: binding?.modelId ?? 'model:unbound',
      branchId: agentBranchId,
      expectedHeadHash: head,
      transactionId: txn,
      ...(input.catalog ? { catalog: input.catalog } : {}),
      ...(input.folderIds ? { folderIds: input.folderIds } : {}),
      ...(input.parameters ? { parameters: input.parameters } : {}),
    });
  const catalog = input.catalog ?? DEFAULT_CATALOG;
  const ctx: ToolRouterContext = {
    catalog,
    agentBranchId,
    sourceBranchId,
    currentHeadHash: head,
    transactionId: txn,
    agentContext,
    acceptOps: agentContext.mutate.acceptOps,
  };
  const tools = buildAiToolDefinitions(agentContext.mutate.acceptOps);
  const systemPrompt = renderAgentSystemPrompt(agentContext);

  const messages: LlmChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: intent },
  ];

  const toolCallsLog: string[] = [];
  let proposed: ChangeSet | undefined;
  let rounds = 0;
  let lastError: string | undefined;

  for (let i = 0; i < maxRounds; i++) {
    rounds = i + 1;
    const chat = await chatWithTools({
      config,
      messages,
      tools,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    });
    messages.push(chat.message);

    const calls = chat.message.tool_calls ?? [];
    if (calls.length === 0) {
      lastError = 'LLM returned no tool calls';
      break;
    }

    for (const call of calls) {
      toolCallsLog.push(call.function.name);
      const routed = routeAiTool(call.function.name, call.function.arguments, ctx);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(
          routed.ok ? { ok: true, data: routed.data } : { ok: false, error: routed.error },
        ),
      });
      if (!routed.ok) {
        lastError = routed.error ?? `tool ${call.function.name} failed`;
      }
      if (routed.changeSet) {
        proposed = routed.changeSet;
      }
    }
    if (proposed) break;
  }

  if (!proposed) {
    const live = await input.compile();
    const emptyRepair = createRepairSession('repair:llm:none', 3);
    return {
      readSummary: { objectCount: catalog.objects.length },
      applied: {
        changeSetId: 'cs:llm:none',
        branchId: agentBranchId,
        expectedHeadHash: head,
        transactionId: txn,
        commands: [{ op: 'update', targetId: 'y:demo:01', payload: {} }],
        actor: 'ai',
        disposition: 'rejected',
      },
      compileJob: enqueueJob('compile', live.ok, {
        pirHash: live.pirHash,
        pipelineHash: live.pipelineHash,
      }),
      validateJob: enqueueJob('validate', live.ok, { issueCount: live.ok ? 0 : 1 }),
      compareJob: enqueueJob('compare', false, { changedIds: [] }),
      repair: { ...emptyRepair, status: 'blocked' },
      audit: recordAiAudit({
        auditId: `audit:llm:${Date.now()}`,
        intent,
        toolCalls: toolCallsLog,
        changeSetIds: [],
        repairAttempts: 0,
        disposition: 'rejected',
      }),
      why: whyTool('y:demo:01', ['pattern:geodesic', 'compose', 'y-network']),
      changesView: buildAiChangesView([]),
      mode: 'llm',
      requestedMode: input.mode ?? 'auto',
      llmConfigured: true,
      liveCompile: live,
      status: 'failed',
      error: lastError ?? 'LLM did not propose a ChangeSet',
      llmRounds: rounds,
      note: 'LLM path failed before a valid ChangeSet was proposed.',
      agentContext,
      ...(agentContext.promptHash !== undefined
        ? { systemPromptHash: agentContext.promptHash }
        : {}),
    };
  }

  const proposedLength = lengthMmFromChangeSet(proposed);
  const live = await input.compile(
    proposedLength !== undefined ? { lengthMm: proposedLength } : undefined,
  );
  let repair = createRepairSession(`repair:llm:${proposed.changeSetId}`, 3);
  repair = runRepairAttempt({
    session: repair,
    changeSet: proposed,
    currentHeadHash: head,
    agentBranchId,
    sourceBranchId,
    feedback: buildFeedbackPacket({
      attempt: 1,
      measurements: {},
      constraintResults: [{ id: 'c:live-compile', ok: live.ok }],
      failures: live.ok
        ? []
        : [
            {
              code: live.failureCode ?? 'LIVE_COMPILE_FAILED',
              summary: 'Live compile/validate failed',
              lineage: ['y:demo:01'],
            },
          ],
    }),
  });

  const status = truthGate(live, repair);
  const targetIds = proposed.commands
    .map((c) => c.targetId)
    .filter((id): id is string => Boolean(id));

  return {
    readSummary: { objectCount: catalog.objects.length },
    applied: proposed,
    compileJob: enqueueJob('compile', live.ok, {
      pirHash: live.pirHash,
      pipelineHash: live.pipelineHash,
      failureCode: live.failureCode,
    }),
    validateJob: enqueueJob('validate', live.ok, { issueCount: live.ok ? 0 : 1 }),
    compareJob: enqueueJob('compare', true, {
      changedIds: targetIds.length > 0 ? targetIds : ['y:demo:01'],
    }),
    repair,
    audit: recordAiAudit({
      auditId: `audit:llm:${Date.now()}`,
      intent,
      toolCalls: [...toolCallsLog, 'compile', 'validate'],
      changeSetIds: [proposed.changeSetId],
      repairAttempts: repair.attempts.length,
      disposition: status === 'succeeded' ? 'applied' : 'rejected',
    }),
    why: whyTool(targetIds[0] ?? 'y:demo:01', ['pattern:geodesic', 'compose', 'y-network']),
    changesView: buildAiChangesView([proposed]),
    mode: 'llm',
    requestedMode: input.mode ?? 'auto',
    llmConfigured: true,
    liveCompile: live,
    status,
    llmRounds: rounds,
    agentContext,
    ...(agentContext.promptHash !== undefined ? { systemPromptHash: agentContext.promptHash } : {}),
    note:
      status === 'succeeded'
        ? 'LLM proposed a validated ChangeSet; smoke compile ok. Accept & rebuild to commit on AI branch and refresh display meshes.'
        : 'LLM ChangeSet proposed but live compile/repair failed — status truth-gated.',
    ...(status === 'failed'
      ? { error: live.ok ? `repair:${repair.status}` : (live.failureCode ?? 'LIVE_COMPILE_FAILED') }
      : {}),
  };
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const config = input.config ?? loadLlmConfig();
  const requested = input.mode ?? 'auto';
  const resolved = resolveAgentMode(requested, config.configured);

  if (resolved.error) {
    const live: LiveCompileResult = { ok: false, failureCode: 'LLM_NOT_CONFIGURED' };
    const repair = createRepairSession('repair:unconfigured', 0);
    return {
      readSummary: { objectCount: 0 },
      applied: {
        changeSetId: 'cs:none',
        branchId: input.branchBinding?.branchId ?? 'branch:ai-agent',
        expectedHeadHash: input.branchBinding?.expectedHeadHash ?? 'head:0',
        transactionId: input.branchBinding?.transactionId ?? 'txn:none',
        commands: [{ op: 'update', targetId: 'y:demo:01', payload: {} }],
        actor: 'ai',
        disposition: 'rejected',
      },
      compileJob: enqueueJob('compile', false, { failureCode: 'LLM_NOT_CONFIGURED' }),
      validateJob: enqueueJob('validate', false, { issueCount: 1 }),
      compareJob: enqueueJob('compare', false, { changedIds: [] }),
      repair: { ...repair, status: 'blocked' },
      audit: recordAiAudit({
        auditId: 'audit:unconfigured',
        intent: input.intent?.trim() || '',
        toolCalls: [],
        changeSetIds: [],
        repairAttempts: 0,
        disposition: 'rejected',
      }),
      why: whyTool('y:demo:01', []),
      changesView: buildAiChangesView([]),
      mode: 'llm',
      requestedMode: requested,
      llmConfigured: false,
      liveCompile: live,
      status: 'failed',
      error: resolved.error,
      note: 'Set SPDS_AI_API_KEY (and optional SPDS_AI_BASE_URL / SPDS_AI_MODEL) to enable LLM mode, or use mode=auto/scripted.',
    };
  }

  if (resolved.mode === 'scripted') {
    return runScriptedPath(input, config);
  }
  return runLlmPath(input, config);
}
