import type { DisplayMeshInput } from './mesh-bridge.js';
import type { AnalysisMeshViewModel } from './analysis-mesh-view.js';
import { buildAnalysisMeshView } from './analysis-mesh-view.js';

export function apiBaseUrl(): string {
  return (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? '/api';
}

export async function fetchD01DisplayMeshes(yLimit = 5): Promise<{
  readonly pipelineHash: string;
  readonly meshes: readonly DisplayMeshInput[];
  readonly source: string;
}> {
  const res = await fetch(`${apiBaseUrl()}/references/d01/display-meshes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ yLimit }),
  });
  if (!res.ok) throw new Error(`display-meshes ${res.status}`);
  const body = (await res.json()) as {
    pipelineHash: string;
    source: string;
    meshes: DisplayMeshInput[];
  };
  return body;
}

export async function fetchD01Analyze(yLimit = 3): Promise<AnalysisMeshViewModel> {
  const res = await fetch(`${apiBaseUrl()}/references/d01/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ yLimit }),
  });
  if (!res.ok) throw new Error(`analyze ${res.status}`);
  const body = (await res.json()) as {
    meshArtifactHash?: string;
    elementCount?: number;
    groupMapping?: Record<string, string[]>;
    viewportLabels?: Array<{ entityId: string; text: string; indicative: true }>;
  };
  return buildAnalysisMeshView({
    meshArtifactHash: body.meshArtifactHash ?? 'mesh:missing',
    elementCount: body.elementCount ?? 0,
    groupMapping: body.groupMapping ?? {},
    labels: body.viewportLabels ?? [],
  });
}

export type AgentRunMode = 'auto' | 'scripted' | 'llm';

export interface AgentRunResponse {
  readonly mode: 'scripted' | 'llm';
  readonly status: 'succeeded' | 'failed';
  readonly llmConfigured: boolean;
  readonly note: string;
  readonly error?: string;
  readonly liveCompile: { readonly ok: boolean; readonly pipelineHash?: string };
  readonly audit: {
    readonly intent: string;
    readonly toolCalls: readonly string[];
    readonly changeSetIds: readonly string[];
    readonly repairAttempts: number;
    readonly disposition: string;
  };
  readonly repair: { readonly status: string };
  readonly changesView: readonly {
    readonly changeSetId: string;
    readonly disposition: string;
    readonly commandCount: number;
    readonly attribution: 'ai';
  }[];
  readonly why: { readonly explanation: string };
  readonly applied: {
    readonly changeSetId: string;
    readonly branchId: string;
    readonly expectedHeadHash: string;
    readonly transactionId: string;
    readonly commands: readonly {
      readonly op: string;
      readonly targetId?: string;
      readonly payload?: unknown;
    }[];
    readonly actor: 'ai';
    readonly disposition: string;
  };
}

export async function runAiAgent(input: {
  readonly intent: string;
  readonly mode?: AgentRunMode;
}): Promise<AgentRunResponse> {
  const res = await fetch(`${apiBaseUrl()}/ai/agent/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      intent: input.intent,
      mode: input.mode ?? 'auto',
    }),
  });
  const body = (await res.json()) as AgentRunResponse;
  if (!res.ok && res.status !== 503) {
    throw new Error(body.error ?? `ai/agent/run ${res.status}`);
  }
  return body;
}

export interface AcceptChangeSetResponse {
  readonly status: 'applied' | 'rejected';
  readonly disposition: 'applied' | 'rejected';
  readonly failureCode?: string;
  readonly reason?: string;
  readonly lengthMmOverride?: number;
  readonly pipelineHash?: string;
  readonly pirHash?: string;
  readonly meshes?: DisplayMeshInput[];
  readonly mainHeadHash?: string;
  readonly acceptedCommands?: number;
}

export async function acceptAiChangeSet(changeSet: AgentRunResponse['applied']): Promise<AcceptChangeSetResponse> {
  const res = await fetch(`${apiBaseUrl()}/ai/changeset/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ changeSet, yLimit: 2 }),
  });
  const body = (await res.json()) as AcceptChangeSetResponse;
  if (!res.ok && res.status !== 422) {
    throw new Error(body.reason ?? `ai/changeset/accept ${res.status}`);
  }
  return body;
}
