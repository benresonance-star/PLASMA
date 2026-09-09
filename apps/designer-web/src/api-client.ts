import type { DisplayMeshInput } from './mesh-bridge.js';
import type { AnalysisMeshViewModel } from './analysis-mesh-view.js';
import { buildAnalysisMeshView } from './analysis-mesh-view.js';

export function apiBaseUrl(): string {
  return (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? '/api';
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

export async function fetchHealth(): Promise<{ status: string; service: string }> {
  const { status, body } = await apiJson<{ status: string; service: string }>('/health');
  if (status >= 400) throw new Error(`health ${status}`);
  return body;
}

export async function createModel(name: string): Promise<{
  readonly model: { readonly modelId: string; readonly name: string };
  readonly branchId: string;
  readonly headHash: string;
}> {
  const { status, body } = await apiJson<{
    model: { modelId: string; name: string };
    branchId: string;
    headHash: string;
  }>('/models', { method: 'POST', body: JSON.stringify({ name }) });
  if (status >= 400) throw new Error(`createModel ${status}`);
  return body;
}

export async function listObjects(
  modelId: string,
  branchId: string,
): Promise<{ readonly objects: readonly Record<string, unknown>[] }> {
  const { status, body } = await apiJson<{ objects: Record<string, unknown>[] }>(
    `/models/${encodeURIComponent(modelId)}/branches/${encodeURIComponent(branchId)}/objects`,
  );
  if (status >= 400) throw new Error(`listObjects ${status}`);
  return body;
}

export async function upsertObject(
  modelId: string,
  branchId: string,
  input: {
    readonly expectedHeadHash: string;
    readonly object: unknown;
    readonly actorId?: string;
  },
): Promise<{ readonly headHash: string; readonly object: unknown }> {
  const { status, body } = await apiJson<{ headHash: string; object: unknown }>(
    `/models/${encodeURIComponent(modelId)}/branches/${encodeURIComponent(branchId)}/objects`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  if (status >= 400) throw new Error(`upsertObject ${status}`);
  return body;
}

export async function createSnapshot(
  modelId: string,
  branchId: string,
  name?: string,
): Promise<{ readonly snapshot: { readonly snapshotId: string; readonly stateHash: string } }> {
  const { status, body } = await apiJson<{
    snapshot: { snapshotId: string; stateHash: string };
  }>(`/models/${encodeURIComponent(modelId)}/branches/${encodeURIComponent(branchId)}/snapshots`, {
    method: 'POST',
    body: JSON.stringify(name !== undefined ? { name } : {}),
  });
  if (status >= 400) throw new Error(`createSnapshot ${status}`);
  return body;
}

export async function createBranch(
  modelId: string,
  input: { readonly name: string; readonly fromBranchId: string },
): Promise<{ readonly branch: { readonly branchId: string; readonly headHash: string } }> {
  const { status, body } = await apiJson<{
    branch: { branchId: string; headHash: string };
  }>(`/models/${encodeURIComponent(modelId)}/branches`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (status >= 400) throw new Error(`createBranch ${status}`);
  return body;
}

export async function restoreBranch(
  modelId: string,
  branchId: string,
  input: { readonly snapshotId: string; readonly actorId?: string },
): Promise<{ readonly headHash: string }> {
  const { status, body } = await apiJson<{ headHash: string }>(
    `/models/${encodeURIComponent(modelId)}/branches/${encodeURIComponent(branchId)}/restore`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  if (status >= 400) throw new Error(`restoreBranch ${status}`);
  return body;
}

export async function fetchHead(
  modelId: string,
  branchId: string,
): Promise<{ readonly branch: { readonly headHash: string; readonly branchId: string } }> {
  const { status, body } = await apiJson<{
    branch: { headHash: string; branchId: string };
  }>(`/models/${encodeURIComponent(modelId)}/branches/${encodeURIComponent(branchId)}/head`);
  if (status >= 400) throw new Error(`fetchHead ${status}`);
  return body;
}

export async function seedD01Substrate(
  modelId: string,
  input?: { readonly yLimit?: number; readonly lengthMm?: number },
): Promise<{
  readonly modelId: string;
  readonly source: string;
  readonly meshCount: number;
  readonly semanticOwners: readonly string[];
  readonly pipelineHash?: string;
}> {
  const { status, body } = await apiJson<{
    modelId: string;
    source: string;
    meshCount: number;
    semanticOwners: string[];
    pipelineHash?: string;
  }>(`/models/${encodeURIComponent(modelId)}/substrate/d01`, {
    method: 'POST',
    body: JSON.stringify(input ?? { yLimit: 5 }),
  });
  if (status >= 400) throw new Error(`seedD01Substrate ${status}`);
  return body;
}

export interface SubstrateGraphObject {
  readonly id: string;
  readonly semanticType: string;
  readonly tags: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly edges?: ReadonlyArray<{ readonly type: string; readonly to: string }>;
}

export async function fetchModelSubstrate(modelId: string): Promise<{
  readonly modelId: string;
  readonly source: string;
  readonly meshes: ReadonlyArray<{
    readonly representationId: string;
    readonly semanticOwner: string;
    readonly triangleCount: number;
  }>;
  readonly objects: readonly SubstrateGraphObject[];
  readonly dependencyEdges: ReadonlyArray<{
    readonly from: string;
    readonly to: string;
    readonly relationType?: string;
  }>;
}> {
  const { status, body } = await apiJson<{
    modelId: string;
    source: string;
    meshes: Array<{
      representationId: string;
      semanticOwner: string;
      triangleCount: number;
    }>;
    objects: SubstrateGraphObject[];
    dependencyEdges: Array<{ from: string; to: string; relationType?: string }>;
  }>(`/models/${encodeURIComponent(modelId)}/substrate`);
  if (status >= 400) throw new Error(`fetchModelSubstrate ${status}`);
  return body;
}

export async function createModelGroup(
  modelId: string,
  input?: { readonly label?: string; readonly parentId?: string },
): Promise<{
  readonly groupId: string;
  readonly objects: readonly SubstrateGraphObject[];
}> {
  const { status, body } = await apiJson<{
    groupId: string;
    objects: SubstrateGraphObject[];
  }>(`/models/${encodeURIComponent(modelId)}/groups`, {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
  });
  if (status >= 400) throw new Error(`createModelGroup ${status}`);
  return body;
}

export async function reparentModelGroup(
  modelId: string,
  input: { readonly nodeId: string; readonly newParentId: string },
): Promise<{
  readonly objects: readonly SubstrateGraphObject[];
}> {
  const { status, body } = await apiJson<{
    objects: SubstrateGraphObject[];
  }>(`/models/${encodeURIComponent(modelId)}/groups/reparent`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (status >= 400) throw new Error(`reparentModelGroup ${status}`);
  return body;
}

export async function fetchModelSchema(modelId: string): Promise<unknown> {
  const { status, body } = await apiJson<unknown>(
    `/models/${encodeURIComponent(modelId)}/schema`,
  );
  if (status >= 400) throw new Error(`fetchModelSchema ${status}`);
  return body;
}

/** Static kinds/relations catalog (no model / substrate required). */
export async function fetchStaticSchema(): Promise<unknown> {
  const { status, body } = await apiJson<unknown>('/schema');
  if (status >= 400) throw new Error(`fetchStaticSchema ${status}`);
  return body;
}

export type WhatIfDraftBody =
  | { readonly parameterId: string; readonly value: unknown }
  | { readonly changeSetId: string }
  | {
      readonly changeSet: {
        readonly changeSetId: string;
        readonly branchId?: string;
        readonly expectedHeadHash?: string;
        readonly transactionId?: string;
        readonly commands: readonly {
          readonly op: string;
          readonly targetId?: string;
          readonly payload?: unknown;
        }[];
      };
    };

export async function runWhatIfPreview(input: {
  readonly modelId: string;
  readonly branchId: string;
  readonly baselineHash: string;
  readonly draft: WhatIfDraftBody;
  readonly yLimit?: number;
}): Promise<{
  readonly whatIf: {
    readonly baselineHash: string;
    readonly previewHash: string;
    readonly mode: 'regenerated-preview';
    readonly previewMeshOwners: readonly string[];
  };
  readonly meshes: readonly DisplayMeshInput[];
  readonly pipelineHash: string;
  readonly regenMs: number;
  readonly failureCode?: string;
  readonly reason?: string;
}> {
  const { status, body } = await apiJson<{
    whatIf: {
      baselineHash: string;
      previewHash: string;
      mode: 'regenerated-preview';
      previewMeshOwners: string[];
    };
    meshes: DisplayMeshInput[];
    pipelineHash: string;
    regenMs: number;
    failureCode?: string;
    reason?: string;
  }>(`/models/${encodeURIComponent(input.modelId)}/what-if`, {
    method: 'POST',
    body: JSON.stringify({
      branchId: input.branchId,
      baselineHash: input.baselineHash,
      draft: input.draft,
      ...(input.yLimit !== undefined ? { yLimit: input.yLimit } : {}),
    }),
  });
  if (status >= 400) {
    const err = new Error(
      body.reason ?? body.failureCode ?? `what-if ${status}`,
    ) as Error & { failureCode?: string };
    if (body.failureCode) err.failureCode = body.failureCode;
    throw err;
  }
  return body;
}

export async function explainObjectApi(
  modelId: string,
  input: { readonly targetId: string; readonly changedParameters?: string[] },
): Promise<{ readonly explain: unknown }> {
  const { status, body } = await apiJson<{ explain: unknown }>(
    `/models/${encodeURIComponent(modelId)}/explain`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  if (status >= 400) throw new Error(`explain ${status}`);
  return body;
}

export async function fetchUpstream(
  modelId: string,
  input: {
    readonly objectId: string;
    readonly radius?: number;
    readonly relationTypes?: readonly string[];
  },
): Promise<{ readonly ids: readonly string[] }> {
  const { status, body } = await apiJson<{ ids: string[] }>(
    `/models/${encodeURIComponent(modelId)}/upstream`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  if (status >= 400) throw new Error(`upstream ${status}`);
  return body;
}

export async function fetchDownstream(
  modelId: string,
  input: {
    readonly objectId: string;
    readonly radius?: number;
    readonly relationTypes?: readonly string[];
  },
): Promise<{ readonly ids: readonly string[] }> {
  const { status, body } = await apiJson<{ ids: string[] }>(
    `/models/${encodeURIComponent(modelId)}/downstream`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  if (status >= 400) throw new Error(`downstream ${status}`);
  return body;
}

export async function traceLineageApi(
  modelId: string,
  input: { readonly semanticAnchor: string },
): Promise<{ readonly trace: unknown }> {
  const { status, body } = await apiJson<{ trace: unknown }>(
    `/models/${encodeURIComponent(modelId)}/trace`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  if (status >= 400) throw new Error(`trace ${status}`);
  return body;
}

export async function beginTransaction(
  modelId: string,
  input: {
    readonly branchId: string;
    readonly actorId: string;
    readonly actorType: 'user' | 'ai' | 'system';
    readonly expectedHeadHash: string;
    readonly idempotencyKey: string;
  },
): Promise<{ readonly transaction: { readonly id: string; readonly status: string } }> {
  const { status, body } = await apiJson<{ transaction: { id: string; status: string } }>(
    `/models/${encodeURIComponent(modelId)}/transactions`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  if (status >= 400) throw new Error(`beginTransaction ${status}`);
  return body;
}

export async function appendTransactionCommand(
  modelId: string,
  txnId: string,
  command: unknown,
): Promise<{ readonly transaction: { readonly id: string } }> {
  const { status, body } = await apiJson<{ transaction: { id: string } }>(
    `/models/${encodeURIComponent(modelId)}/transactions/${encodeURIComponent(txnId)}/commands`,
    { method: 'POST', body: JSON.stringify(command) },
  );
  if (status >= 400) throw new Error(`appendCommand ${status}`);
  return body;
}

export async function abortTransaction(
  modelId: string,
  txnId: string,
): Promise<{ readonly transaction: { readonly status: string } }> {
  const { status, body } = await apiJson<{ transaction: { status: string } }>(
    `/models/${encodeURIComponent(modelId)}/transactions/${encodeURIComponent(txnId)}/abort`,
    { method: 'POST', body: '{}' },
  );
  if (status >= 400) throw new Error(`abortTransaction ${status}`);
  return body;
}

export async function validateTransaction(
  modelId: string,
  txnId: string,
): Promise<{ readonly candidate: unknown; readonly transaction: unknown }> {
  const { status, body } = await apiJson<{ candidate: unknown; transaction: unknown }>(
    `/models/${encodeURIComponent(modelId)}/transactions/${encodeURIComponent(txnId)}/validate`,
    { method: 'POST', body: '{}' },
  );
  if (status >= 400) throw new Error(`validateTransaction ${status}`);
  return body;
}

export async function publishD01(yLimit = 5): Promise<{
  readonly pipelineHash: string;
  readonly allVerified: boolean;
  readonly stored: readonly { readonly contentHash: string; readonly verified: boolean }[];
}> {
  const { status, body } = await apiJson<{
    pipelineHash: string;
    allVerified: boolean;
    stored: { contentHash: string; verified: boolean }[];
  }>('/references/d01/publish', {
    method: 'POST',
    body: JSON.stringify({ yLimit }),
  });
  if (status >= 400) throw new Error(`publishD01 ${status}`);
  return body;
}

export async function publishA01(): Promise<{
  readonly pipelineHash: string;
  readonly allVerified: boolean;
}> {
  const { status, body } = await apiJson<{ pipelineHash: string; allVerified: boolean }>(
    '/references/a01/publish',
    { method: 'POST', body: '{}' },
  );
  if (status >= 400) throw new Error(`publishA01 ${status}`);
  return body;
}

export async function publishF01(): Promise<{
  readonly pipelineHash: string;
  readonly allVerified: boolean;
}> {
  const { status, body } = await apiJson<{ pipelineHash: string; allVerified: boolean }>(
    '/references/f01/publish',
    { method: 'POST', body: '{}' },
  );
  if (status >= 400) throw new Error(`publishF01 ${status}`);
  return body;
}

export interface GeometryServiceMeshes {
  readonly meshes: readonly DisplayMeshInput[];
  readonly source: string;
  readonly kernel?: string;
  readonly label?: string;
}

export async function fetchD01DisplayMeshes(
  yLimit = 5,
  lengthMmOverride?: number,
  profile?: { readonly armWidthMm?: number; readonly structuralDepthMm?: number },
  options?: { readonly compareEngines?: boolean },
): Promise<{
  readonly pipelineHash: string;
  readonly pirHash?: string;
  readonly meshes: readonly DisplayMeshInput[];
  readonly source: string;
  readonly parameters?: {
    readonly lengthMm?: number;
    readonly armWidthMm?: number;
    readonly structuralDepthMm?: number;
  };
  readonly geometryService?: GeometryServiceMeshes;
  readonly geometryServiceError?: string;
  readonly compileHash?: string;
}> {
  const res = await fetch(`${apiBaseUrl()}/references/d01/display-meshes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      yLimit,
      ...(lengthMmOverride !== undefined ? { lengthMmOverride } : {}),
      ...(profile?.armWidthMm !== undefined ? { armWidthMm: profile.armWidthMm } : {}),
      ...(profile?.structuralDepthMm !== undefined
        ? { structuralDepthMm: profile.structuralDepthMm }
        : {}),
      ...(options?.compareEngines ? { compareEngines: true } : {}),
    }),
  });
  if (!res.ok) throw new Error(`display-meshes ${res.status}`);
  return (await res.json()) as {
    pipelineHash: string;
    pirHash?: string;
    source: string;
    meshes: DisplayMeshInput[];
    parameters?: {
      lengthMm?: number;
      armWidthMm?: number;
      structuralDepthMm?: number;
    };
    geometryService?: GeometryServiceMeshes;
    geometryServiceError?: string;
    compileHash?: string;
  };
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
  readonly agentContext?: {
    readonly schemaVersion: string;
    readonly modelId: string;
    readonly branchId: string;
    readonly expectedHeadHash: string;
    readonly mutate: {
      readonly acceptOps: readonly string[];
      readonly unsupportedOps: readonly string[];
      readonly kindsAllowlist: readonly string[];
      readonly parameters: readonly {
        readonly id: string;
        readonly path: string;
        readonly domain: { readonly min: number; readonly max: number };
        readonly quantity?: { readonly value: number; readonly unit: string };
      }[];
      readonly examples?: readonly unknown[];
    };
    readonly world?: {
      readonly viewportNote?: string;
    };
    readonly examples?: readonly unknown[];
  };
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
  readonly modelId?: string;
}): Promise<AgentRunResponse> {
  const res = await fetch(`${apiBaseUrl()}/ai/agent/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      intent: input.intent,
      mode: input.mode ?? 'auto',
      ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
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
  readonly armWidthMm?: number;
  readonly structuralDepthMm?: number;
  readonly patternInstanceId?: string;
  readonly pipelineHash?: string;
  readonly pirHash?: string;
  readonly meshes?: DisplayMeshInput[];
  readonly branchId?: string;
  readonly newHeadHash?: string;
  readonly mainHeadHash?: string;
  readonly acceptedCommands?: number;
  readonly organisationApplied?: boolean;
  readonly mode?: 'geometry' | 'organise' | 'mixed';
  readonly audit?: {
    readonly changeSetId?: string;
    readonly lengthMm?: number;
    readonly armWidthMm?: number;
    readonly structuralDepthMm?: number;
  };
}

export async function acceptAiChangeSet(
  changeSet: AgentRunResponse['applied'],
  options?: { readonly modelId?: string; readonly yLimit?: number },
): Promise<AcceptChangeSetResponse> {
  const res = await fetch(`${apiBaseUrl()}/ai/changeset/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      changeSet,
      yLimit: options?.yLimit ?? 2,
      ...(options?.modelId !== undefined ? { modelId: options.modelId } : {}),
    }),
  });
  const body = (await res.json()) as AcceptChangeSetResponse;
  if (!res.ok && res.status !== 422) {
    throw new Error(body.reason ?? `ai/changeset/accept ${res.status}`);
  }
  return body;
}

export async function fetchUndoStack(branchId: string): Promise<{
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}> {
  const { status, body } = await apiJson<{ canUndo: boolean; canRedo: boolean }>(
    `/branches/${encodeURIComponent(branchId)}/undo-stack`,
  );
  if (status >= 400) throw new Error(`undo-stack ${status}`);
  return body;
}

export async function postBranchUndo(input: {
  readonly branchId: string;
  readonly expectedHeadHash: string;
  readonly actorId?: string;
}): Promise<{
  readonly status: string;
  readonly newHeadHash: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly failureCode?: string;
  readonly reason?: string;
}> {
  const { status, body } = await apiJson<{
    status: string;
    newHeadHash: string;
    canUndo: boolean;
    canRedo: boolean;
    failureCode?: string;
    reason?: string;
  }>(`/branches/${encodeURIComponent(input.branchId)}/undo`, {
    method: 'POST',
    body: JSON.stringify({
      expectedHeadHash: input.expectedHeadHash,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
    }),
  });
  if (status >= 400) {
    throw new Error(body.reason ?? body.failureCode ?? `undo ${status}`);
  }
  return body;
}

export async function postBranchRedo(input: {
  readonly branchId: string;
  readonly expectedHeadHash: string;
  readonly actorId?: string;
}): Promise<{
  readonly status: string;
  readonly newHeadHash: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly failureCode?: string;
  readonly reason?: string;
}> {
  const { status, body } = await apiJson<{
    status: string;
    newHeadHash: string;
    canUndo: boolean;
    canRedo: boolean;
    failureCode?: string;
    reason?: string;
  }>(`/branches/${encodeURIComponent(input.branchId)}/redo`, {
    method: 'POST',
    body: JSON.stringify({
      expectedHeadHash: input.expectedHeadHash,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
    }),
  });
  if (status >= 400) {
    throw new Error(body.reason ?? body.failureCode ?? `redo ${status}`);
  }
  return body;
}

export async function importStep(input: {
  readonly filename?: string;
  readonly bytes?: string;
  readonly headerText?: string;
}): Promise<{
  readonly status: string;
  readonly asset?: { readonly id?: string; readonly sourceHash?: string };
  readonly viewportReady?: boolean;
}> {
  const { status, body } = await apiJson<{
    status: string;
    asset?: { id?: string; sourceHash?: string };
    viewportReady?: boolean;
  }>('/imports/step', { method: 'POST', body: JSON.stringify(input) });
  if (status >= 400 && status !== 422) throw new Error(`importStep ${status}`);
  return body;
}

export async function measureFeature(input: {
  readonly kind: 'distance' | 'edgeLength' | 'faceArea' | 'angle';
  readonly semanticOwner?: string;
  readonly features: readonly string[];
  readonly extentsMm: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}): Promise<{
  readonly exact: {
    readonly kind: string;
    readonly quantity: number;
    readonly unit: string;
    readonly provenance: string;
    readonly engine: { readonly kernel: string; readonly label: string };
    readonly features: readonly string[];
  };
  readonly occt?: {
    readonly kind: string;
    readonly quantity: number;
    readonly unit: string;
    readonly provenance: string;
    readonly engine: { readonly kernel: string; readonly label: string };
    readonly features: readonly string[];
  };
}> {
  const { status, body } = await apiJson<{
    exact: {
      kind: string;
      quantity: number;
      unit: string;
      provenance: string;
      engine: { kernel: string; label: string };
      features: string[];
    };
    occt?: {
      kind: string;
      quantity: number;
      unit: string;
      provenance: string;
      engine: { kernel: string; label: string };
      features: string[];
    };
  }>('/measure', { method: 'POST', body: JSON.stringify(input) });
  if (status >= 400) throw new Error(`measureFeature ${status}`);
  return body;
}

export async function measureCompare(input: {
  readonly kind: 'distance' | 'edgeLength' | 'faceArea' | 'angle';
  readonly semanticOwner?: string;
  readonly features: readonly string[];
  readonly extentsMm: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}): Promise<{
  readonly kind: string;
  readonly exact?: { readonly quantity: number; readonly unit: string; readonly engine: { readonly label: string } };
  readonly occt?: { readonly quantity: number; readonly unit: string; readonly engine: { readonly label: string } };
  readonly delta?: number;
  readonly tolerance: number;
  readonly toleranceUnit: string;
  readonly withinTolerance: boolean;
}> {
  const { status, body } = await apiJson<{
    kind: string;
    exact?: { quantity: number; unit: string; engine: { label: string } };
    occt?: { quantity: number; unit: string; engine: { label: string } };
    delta?: number;
    tolerance: number;
    toleranceUnit: string;
    withinTolerance: boolean;
  }>('/measure/compare', { method: 'POST', body: JSON.stringify(input) });
  if (status >= 400) throw new Error(`measureCompare ${status}`);
  return body;
}

export interface UiPreferencesResponse {
  readonly userId: string;
  readonly payload: {
    readonly theme?: 'dark' | 'light';
    readonly viewport?: unknown;
    readonly measureLibrary?: unknown;
  };
  readonly schemaVersion: string;
  readonly updatedAt: string | null;
}

export async function fetchUiPreferences(userId: string): Promise<UiPreferencesResponse> {
  const { status, body } = await apiJson<UiPreferencesResponse>(
    `/ui-preferences?userId=${encodeURIComponent(userId)}`,
  );
  if (status >= 400) throw new Error(`fetchUiPreferences ${status}`);
  return body;
}

export async function saveUiPreferences(input: {
  readonly userId: string;
  readonly payload: unknown;
  readonly schemaVersion?: string;
}): Promise<UiPreferencesResponse> {
  const { status, body } = await apiJson<UiPreferencesResponse>('/ui-preferences', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  if (status >= 400) throw new Error(`saveUiPreferences ${status}`);
  return body;
}
