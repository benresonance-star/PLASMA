/**
 * Integrated designer session — G8–G15 view surfaces on a shared selection model.
 * Browser-safe fixtures only (no geometry-contracts / node:crypto).
 */

import { buildValidationReport } from '@spds/validation-core';
import {
  createG8Session,
  g8ApplyLiveMeshes,
  g8CommitExactLength,
  g8ExplorerIds,
  g8PreviewLength,
  g8PrimarySemanticId,
  g8FocusGeometry,
  g8Select,
  g8SelectionSynced,
  g8SetChrome,
  g8SetPanel,
  type G8Session,
} from './g8-session.js';
import type { DisplayMeshInput } from './mesh-bridge.js';
import { buildPipelineView, type PipelineViewModel } from './pipeline-view.js';
import { buildPatternInspector, type PatternInspectorView } from './pattern-inspector.js';
import { buildDependencyExplorer, type DependencyExplorerView } from './dependency-explorer.js';
import {
  buildValidationNavigator,
  navigateToIssue,
  type ValidationNavigatorView,
} from './validation-navigator.js';
import {
  buildCompareView,
  buildTimelineView,
  forkAction,
  restoreAction,
  type CompareViewModel,
  type HistoryTimelineView,
  type RestoreForkAction,
} from './history-view.js';
import {
  analysisLabelIsIndicative,
  buildAnalysisMeshView,
  type AnalysisMeshViewModel,
} from './analysis-mesh-view.js';
import type { PanelId } from './shell.js';
import type { SelectionSource } from './selection-sync.js';
import type { PublicationChrome } from './viewport.js';
import { DEMO_Y_SEMANTIC_ID, demoDisplayMeshes, type DemoMemberParams } from './ui/demo-meshes.js';
import {
  buildExplorerTreeFromGraph,
  type ExplorerGraphObject,
} from './explorer-from-graph.js';
import {
  EXPLORER_ROOT_ID,
  explorerCreate,
  explorerDelete,
  explorerFind,
  explorerRename,
  explorerReorder,
  explorerReparent,
  flattenExplorerSemanticIds,
  seedExplorerTree,
  type ExplorerNode,
  type ExplorerNodeKind,
} from './explorer-tree.js';

export type { ExplorerGraphObject };

export const F01_PANEL_SEMANTIC_ID = 'panel:f01:01';

export interface AiChangesPanelItem {
  readonly changeSetId: string;
  readonly disposition: 'proposed' | 'applied' | 'rejected' | 'conflict';
  readonly commandCount: number;
  readonly attribution: 'ai';
}

export interface PendingAiChangeSet {
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
}

export interface AppSession {
  readonly g8: G8Session;
  readonly modelKind: 'd01' | 'f01' | 'a01';
  readonly modelId: string | null;
  readonly branchId: string | null;
  readonly headHash: string | null;
  readonly explorerIds: readonly string[];
  /** Fusion-style browser tree (branching + CRUD + reorder). */
  readonly explorerTree: readonly ExplorerNode[];
  /** Live substrate objects (with edges) used to project explorerTree. */
  readonly explorerGraphObjects: readonly ExplorerGraphObject[];
  readonly params: {
    readonly lengthMm: number;
    readonly armWidthMm: number;
    readonly structuralDepthMm: number;
  };
  readonly pipelineRun: {
    readonly pipelineHash: string;
    readonly pirHash?: string;
    readonly dagHash?: string;
    readonly status: string;
    readonly parameters?: Record<string, number>;
  } | null;
  readonly timeline: readonly {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
    readonly atMs: number;
  }[];
  /** Variant forks — never appended to history timeline (D4b). */
  readonly variants: readonly {
    readonly id: string;
    readonly kind: 'variant';
    readonly label: string;
    readonly atMs: number;
  }[];
  readonly activeVariantId: string | null;
  readonly liveBinding: {
    readonly explorerFromApi: boolean;
    readonly pipelineFromRun: boolean;
    readonly historyFromStore: boolean;
    readonly depsFromGraph: boolean;
    readonly validationFromCompile: boolean;
  };
  readonly lastTransactionId: string | null;
  readonly publicationStatus: 'candidate' | 'published' | 'offline';
  readonly aiBranchId: string | null;
  readonly pipeline: PipelineViewModel;
  readonly pattern: PatternInspectorView;
  readonly deps: DependencyExplorerView;
  readonly validation: ValidationNavigatorView;
  readonly history: HistoryTimelineView;
  readonly compare: CompareViewModel;
  readonly restore: RestoreForkAction;
  readonly fork: RestoreForkAction;
  readonly analysis: AnalysisMeshViewModel;
  readonly aiChanges: readonly AiChangesPanelItem[];
  readonly pendingChangeSet: PendingAiChangeSet | null;
  /** Cold-start AgentContextPackage from last /ai/agent/run (S19). */
  readonly agentContext: {
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
      readonly examples: readonly unknown[];
    };
    readonly worldNotes: string;
  } | null;
  readonly whyLine: string;
  readonly fabArtifacts: readonly {
    readonly contentHash: string;
    readonly verified: boolean;
    readonly artifactId?: string;
  }[];
  readonly explainPacket: unknown | null;
}

function buildDeps(selectedId: string): DependencyExplorerView {
  return buildDependencyExplorer(selectedId, [
    { from: 'pattern:geodesic', to: DEMO_Y_SEMANTIC_ID },
    { from: DEMO_Y_SEMANTIC_ID, to: 'part:demo:y01' },
    { from: DEMO_Y_SEMANTIC_ID, to: 'mesh:demo:y01' },
    { from: 'pattern:FreeformPanelSet', to: F01_PANEL_SEMANTIC_ID },
    { from: F01_PANEL_SEMANTIC_ID, to: 'part:f01:01' },
  ]);
}

function buildPipeline(
  selectedId: string,
  lengthMm: number,
  run?: AppSession['pipelineRun'],
): PipelineViewModel {
  if (run) {
    return buildPipelineView({
      dagId: `dag:${run.pipelineHash.slice(0, 12)}`,
      nodes: [
        {
          id: 'n:compose',
          operator: 'compose.v1',
          semanticOwner: 'pattern:geodesic',
          status: 'succeeded',
          timingMs: 4,
          dependsOn: [],
        },
        {
          id: 'n:y',
          operator: 'y-network.v1',
          semanticOwner: selectedId,
          status: 'succeeded',
          timingMs: 12,
          dependsOn: ['n:compose'],
        },
        {
          id: 'n:measure',
          operator: 'measure.v1',
          semanticOwner: selectedId,
          status: run.status === 'published' || run.status === 'ok' ? 'succeeded' : 'warning',
          timingMs: 2,
          diagnostics: [`pipelineHash=${run.pipelineHash}`],
          dependsOn: ['n:y'],
        },
      ],
    });
  }
  return buildPipelineView({
    dagId: 'dag:offline',
    nodes: [
      {
        id: 'n:compose',
        operator: 'compose.v1',
        semanticOwner: 'pattern:geodesic',
        status: 'succeeded',
        timingMs: 4,
        dependsOn: [],
      },
      {
        id: 'n:y',
        operator: 'y-network.v1',
        semanticOwner: selectedId.startsWith('panel:') ? F01_PANEL_SEMANTIC_ID : DEMO_Y_SEMANTIC_ID,
        status: 'succeeded',
        timingMs: 12,
        dependsOn: ['n:compose'],
      },
      {
        id: 'n:measure',
        operator: 'measure.v1',
        semanticOwner: selectedId,
        status: lengthMm > 3500 ? 'warning' : 'succeeded',
        timingMs: 2,
        diagnostics: lengthMm > 3500 ? ['warn:length-near-domain-max'] : [],
        dependsOn: ['n:y'],
      },
    ],
  });
}

function buildValidation(selectedId: string): ValidationNavigatorView {
  return buildValidationNavigator(
    buildValidationReport({
      modelId: 'model:demo',
      branchId: 'branch:main',
      issues: [
        {
          id: 'iss:demo:edge',
          code: 'EDGE_DISTANCE',
          severity: 'warn',
          summary: 'Edge distance near limit',
          affectedSemanticIds: [selectedId],
        },
      ],
    }),
  );
}

function buildHistory(regenGeneration = 0): HistoryTimelineView {
  return buildTimelineView({
    branchId: 'branch:main',
    events: [
      {
        eventId: 'evt:1',
        modelId: 'model:demo',
        branchId: 'branch:main',
        command: 'SetParameter',
        timestamp: '2026-01-01T00:00:00.000Z',
        actor: { type: 'user', id: 'u:1' },
        reason: 'length preview',
        targetIds: [DEMO_Y_SEMANTIC_ID],
        beforeHash: 'hash:0',
        afterHash: 'hash:1',
        correlationId: 'corr:1',
        invalidationSet: [DEMO_Y_SEMANTIC_ID],
        payload: { lengthMm: 2300 },
      },
      {
        eventId: `evt:regen:${regenGeneration}`,
        modelId: 'model:demo',
        branchId: 'branch:main',
        command: 'ExactRegen',
        timestamp: '2026-01-01T00:01:00.000Z',
        actor: { type: 'user', id: 'u:1' },
        targetIds: [DEMO_Y_SEMANTIC_ID],
        beforeHash: 'hash:1',
        afterHash: `hash:${regenGeneration}`,
        correlationId: 'corr:2',
        invalidationSet: [DEMO_Y_SEMANTIC_ID],
        payload: { regenGeneration },
      },
    ],
    snapshots: [
      {
        snapshotId: 'snap:1',
        modelId: 'model:demo',
        branchId: 'branch:main',
        createdAt: '2026-01-01T00:02:00.000Z',
        stateHash: `hash:${regenGeneration}`,
        name: 'baseline',
        state: { regenGeneration },
        schemaVersion: '1',
      },
    ],
  });
}

function refreshDerived(session: AppSession): AppSession {
  const selected = session.g8.selection.selectedSemanticId ?? g8PrimarySemanticId();
  const lengthMm = session.params.lengthMm;
  const pipeline = session.liveBinding.pipelineFromRun
    ? buildPipeline(selected, lengthMm, session.pipelineRun)
    : buildPipeline(selected, lengthMm);
  return {
    ...session,
    pipeline,
    deps: buildDeps(selected),
    validation: session.liveBinding.validationFromCompile
      ? session.validation
      : buildValidation(selected),
    analysis: buildAnalysisMeshView({
      meshArtifactHash: `mesh:${lengthMm}`,
      elementCount: Math.max(8, Math.floor(lengthMm / 10)),
      groupMapping: {
        material_steel: [selected],
        support_base: [selected],
      },
      groupRoles: { material_steel: 'material', support_base: 'support' },
      labels: [
        {
          entityId: selected,
          text: `σ indic. @ L=${lengthMm}mm`,
          indicative: true,
        },
      ],
    }),
    whyLine:
      session.whyLine ||
      `${selected} ← pattern → compose → measure (regen ${session.g8.regenGeneration})`,
  };
}

function withExplorerTree(
  session: AppSession,
  tree: readonly ExplorerNode[],
): AppSession {
  return {
    ...session,
    explorerTree: tree,
    explorerIds: flattenExplorerSemanticIds(tree),
  };
}

function projectExplorerTree(
  session: AppSession,
  meshOwners: readonly string[],
  modelLabel: string,
  graphObjects?: readonly ExplorerGraphObject[],
): { readonly tree: readonly ExplorerNode[]; readonly objects: readonly ExplorerGraphObject[] } {
  const objects = graphObjects ?? session.explorerGraphObjects;
  const modelId = session.modelId ?? 'model:local';
  const built = buildExplorerTreeFromGraph({
    modelId,
    modelLabel,
    objects,
    meshOwners,
  });
  if (built.error === 'cycle' || built.nodes.length === 0) {
    // Fall back to flat mesh projection (no organisation) rather than wipe UX.
    const flat = buildExplorerTreeFromGraph({
      modelId,
      modelLabel,
      objects: [],
      meshOwners,
    });
    return { tree: flat.nodes, objects: [] };
  }
  return { tree: built.nodes, objects };
}

/** Replace organisation graph objects and rebuild explorer tree for current mesh owners. */
export function appSetExplorerGraphObjects(
  session: AppSession,
  objects: readonly ExplorerGraphObject[],
  modelLabel = 'D01 Model',
): AppSession {
  const owners =
    session.explorerIds.length > 0
      ? session.explorerIds
      : flattenExplorerSemanticIds(session.explorerTree);
  const { tree, objects: nextObjects } = projectExplorerTree(
    session,
    owners,
    modelLabel,
    objects,
  );
  return {
    ...withExplorerTree(session, tree),
    explorerGraphObjects: nextObjects,
  };
}

export function createAppSession(): AppSession {
  const g8 = createG8Session();
  const lengthMm = g8.lengthEdit.spec.value;
  const demoIds = [...g8ExplorerIds()];
  const base: AppSession = {
    g8,
    modelKind: 'd01',
    modelId: null,
    branchId: null,
    headHash: null,
    explorerIds: demoIds,
    explorerTree: seedExplorerTree(demoIds, 'D01 Model'),
    explorerGraphObjects: [],
    params: { lengthMm, armWidthMm: 40, structuralDepthMm: 40 },
    pipelineRun: null,
    timeline: [],
    variants: [],
    activeVariantId: null,
    liveBinding: {
      explorerFromApi: false,
      pipelineFromRun: false,
      historyFromStore: false,
      depsFromGraph: false,
      validationFromCompile: false,
    },
    lastTransactionId: null,
    publicationStatus: 'offline',
    aiBranchId: null,
    pipeline: buildPipeline(DEMO_Y_SEMANTIC_ID, lengthMm),
    pattern: buildPatternInspector({
      patternId: 'pattern:geodesic',
      name: 'geodesic',
      parameters: { frequency: 2, lengthMm, armWidthMm: 40, structuralDepthMm: 40 },
      subpatternIds: ['pattern:y-member'],
      operatorBindings: { 'op:y': 'y-network.v1' },
    }),
    deps: buildDeps(DEMO_Y_SEMANTIC_ID),
    validation: buildValidation(DEMO_Y_SEMANTIC_ID),
    history: buildHistory(0),
    compare: buildCompareView(
      {
        fromHash: 'hash:0',
        toHash: 'hash:1',
        addedIds: [],
        removedIds: [],
        changedIds: [DEMO_Y_SEMANTIC_ID],
      },
      { lengthMm: 0 },
      'exact',
    ),
    restore: restoreAction('snap:1'),
    fork: forkAction('feature/ai-repair'),
    analysis: buildAnalysisMeshView({
      meshArtifactHash: 'mesh:200',
      elementCount: 20,
      groupMapping: { material_steel: [DEMO_Y_SEMANTIC_ID] },
    }),
    aiChanges: [
      {
        changeSetId: 'cs:demo:1',
        disposition: 'proposed',
        commandCount: 1,
        attribution: 'ai',
      },
    ],
    pendingChangeSet: null,
    agentContext: null,
    whyLine: '',
    fabArtifacts: [],
    explainPacket: null,
  };
  return refreshDerived(base);
}

export function appExplorerIds(session: AppSession): readonly string[] {
  const fromTree = flattenExplorerSemanticIds(session.explorerTree);
  if (fromTree.length > 0) return fromTree;
  if (session.liveBinding.explorerFromApi && session.explorerIds.length > 0) {
    return session.explorerIds;
  }
  if (session.modelKind === 'f01') return [F01_PANEL_SEMANTIC_ID];
  if (session.modelKind === 'a01') return session.explorerIds.length ? session.explorerIds : ['assy:a01'];
  return [...g8ExplorerIds()];
}

export function appExplorerSelect(
  session: AppSession,
  nodeId: string,
  nowMs: number,
): AppSession {
  const node = explorerFind(session.explorerTree, nodeId);
  const semanticId = node?.semanticId ?? nodeId;
  if (semanticId === EXPLORER_ROOT_ID) {
    return appSelect(session, null, 'explorer', nowMs);
  }
  return appSelect(session, semanticId, 'explorer', nowMs);
}

export function appExplorerCreate(
  session: AppSession,
  input: {
    readonly parentId?: string | null;
    readonly asSiblingOf?: string;
    readonly label?: string;
    readonly kind?: ExplorerNodeKind;
  },
  nowMs: number,
): AppSession {
  const selectedNode =
    session.g8.selection.selectedSemanticId != null
      ? session.explorerTree.find(
          (n) =>
            n.semanticId === session.g8.selection.selectedSemanticId && n.kind !== 'body',
        )
      : undefined;
  const { nodes, createdId } = explorerCreate(session.explorerTree, {
    parentId: input.parentId ?? selectedNode?.id ?? EXPLORER_ROOT_ID,
    ...(input.asSiblingOf !== undefined ? { asSiblingOf: input.asSiblingOf } : {}),
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
  });
  return appExplorerSelect(withExplorerTree(session, nodes), createdId, nowMs);
}

export function appExplorerRename(
  session: AppSession,
  nodeId: string,
  label: string,
): AppSession {
  return withExplorerTree(session, explorerRename(session.explorerTree, nodeId, label));
}

export function appExplorerDelete(session: AppSession, nodeId: string, nowMs: number): AppSession {
  const node = explorerFind(session.explorerTree, nodeId);
  const next = withExplorerTree(session, explorerDelete(session.explorerTree, nodeId));
  if (node && session.g8.selection.selectedSemanticId === node.semanticId) {
    return appSelect(next, null, 'explorer', nowMs);
  }
  return next;
}

export function appExplorerReorder(
  session: AppSession,
  nodeId: string,
  delta: -1 | 1,
): AppSession {
  return withExplorerTree(session, explorerReorder(session.explorerTree, nodeId, delta));
}

export function appExplorerReparent(
  session: AppSession,
  nodeId: string,
  newParentId: string | null,
): AppSession {
  return withExplorerTree(session, explorerReparent(session.explorerTree, nodeId, newParentId));
}

export function appExplorerAddImport(
  session: AppSession,
  importId: string,
  label: string,
): AppSession {
  const siblings = session.explorerTree.filter((n) => n.parentId === EXPLORER_ROOT_ID);
  const node: ExplorerNode = {
    id: importId,
    label,
    kind: 'import',
    parentId: EXPLORER_ROOT_ID,
    order: siblings.length,
    semanticId: importId,
  };
  return withExplorerTree(session, [...session.explorerTree, node]);
}

export function appBootstrapSuccess(
  session: AppSession,
  payload: {
    readonly modelId: string;
    readonly branchId: string;
    readonly headHash: string;
    readonly explorerIds: readonly string[];
    readonly pipelineHash?: string;
    readonly pirHash?: string;
    readonly meshes?: readonly DisplayMeshInput[];
    readonly lengthMm?: number;
    readonly explorerGraphObjects?: readonly ExplorerGraphObject[];
  },
  nowMs: number,
): AppSession {
  const lengthMm = payload.lengthMm ?? session.params.lengthMm;
  // Live meshes are authoritative for explorer identity — never keep demo y:01 when meshes exist.
  const explorerIds =
    payload.meshes && payload.meshes.length > 0
      ? [...new Set(payload.meshes.map((m) => m.semanticOwner))]
      : payload.explorerIds;
  const graphObjects = payload.explorerGraphObjects ?? session.explorerGraphObjects;
  const projected = projectExplorerTree(
    { ...session, modelId: payload.modelId, explorerGraphObjects: graphObjects },
    explorerIds,
    'D01 Model',
    graphObjects,
  );
  let next: AppSession = {
    ...session,
    modelId: payload.modelId,
    branchId: payload.branchId,
    headHash: payload.headHash,
    explorerIds,
    explorerTree: projected.tree,
    explorerGraphObjects: projected.objects,
    params: { ...session.params, lengthMm },
    publicationStatus: 'candidate',
    liveBinding: {
      ...session.liveBinding,
      explorerFromApi: true,
      pipelineFromRun: Boolean(payload.pipelineHash),
    },
    pipelineRun: payload.pipelineHash
      ? {
          pipelineHash: payload.pipelineHash,
          status: 'ok',
          parameters: { lengthMm },
          ...(payload.pirHash !== undefined ? { pirHash: payload.pirHash } : {}),
        }
      : session.pipelineRun,
    timeline: [
      ...session.timeline,
      { id: `boot:${nowMs}`, kind: 'bootstrap', label: 'Bootstrap', atMs: nowMs },
    ],
  };
  if (payload.meshes && payload.meshes.length > 0) {
    next = appApplyLiveDisplayMeshes(next, payload.meshes, nowMs, lengthMm);
  }
  return refreshDerived(next);
}

export function appBootstrapFailure(session: AppSession): AppSession {
  return {
    ...session,
    publicationStatus: 'offline',
    liveBinding: {
      explorerFromApi: false,
      pipelineFromRun: false,
      historyFromStore: false,
      depsFromGraph: false,
      validationFromCompile: false,
    },
    whyLine: 'API unreachable — offline demo meshes',
  };
}

export function appBindPipelineRun(
  session: AppSession,
  run: {
    readonly pipelineHash: string;
    readonly pirHash?: string;
    readonly parameters?: Record<string, number>;
  },
): AppSession {
  return refreshDerived({
    ...session,
    pipelineRun: {
      pipelineHash: run.pipelineHash,
      status: 'ok',
      ...(run.pirHash !== undefined ? { pirHash: run.pirHash } : {}),
      ...(run.parameters !== undefined ? { parameters: run.parameters } : {}),
    },
    liveBinding: { ...session.liveBinding, pipelineFromRun: true },
    params: {
      lengthMm: run.parameters?.lengthMm ?? session.params.lengthMm,
      armWidthMm: run.parameters?.armWidthMm ?? session.params.armWidthMm,
      structuralDepthMm: run.parameters?.structuralDepthMm ?? session.params.structuralDepthMm,
    },
  });
}

export function appSetParams(
  session: AppSession,
  patch: Partial<AppSession['params']>,
): AppSession {
  return {
    ...session,
    params: { ...session.params, ...patch },
  };
}

export function appSetHead(session: AppSession, headHash: string): AppSession {
  return { ...session, headHash };
}

export function appRecordTransaction(session: AppSession, txnId: string): AppSession {
  return { ...session, lastTransactionId: txnId };
}

export function appSetPublicationStatus(
  session: AppSession,
  status: AppSession['publicationStatus'],
): AppSession {
  const chrome = status === 'published' ? 'published' : 'candidate';
  return {
    ...session,
    publicationStatus: status,
    g8: g8SetChrome(session.g8, chrome),
  };
}

export function appSelect(
  session: AppSession,
  semanticId: string | null,
  source: SelectionSource,
  nowMs: number,
): AppSession {
  return refreshDerived({ ...session, g8: g8Select(session.g8, semanticId, source, nowMs) });
}

export function appFocusGeometry(
  session: AppSession,
  semanticIds: readonly string[],
  source: SelectionSource,
  nowMs: number,
): AppSession {
  return refreshDerived({
    ...session,
    g8: g8FocusGeometry(session.g8, semanticIds, source, nowMs),
  });
}

export function appSetPanel(session: AppSession, panel: PanelId): AppSession {
  return { ...session, g8: g8SetPanel(session.g8, panel) };
}

export function appSetChrome(session: AppSession, chrome: PublicationChrome): AppSession {
  return { ...session, g8: g8SetChrome(session.g8, chrome) };
}

export function appPreviewLength(session: AppSession, draftMm: number): AppSession {
  return refreshDerived({ ...session, g8: g8PreviewLength(session.g8, draftMm) });
}

export function appCommitExactLength(session: AppSession, nowMs: number): AppSession {
  const g8 = g8CommitExactLength(session.g8, nowMs);
  const lengthMm = g8.lengthEdit.spec.value;
  return refreshDerived({
    ...session,
    g8,
    params: { ...session.params, lengthMm },
    pattern: buildPatternInspector({
      patternId: session.pattern.patternId,
      name: session.pattern.name,
      parameters: {
        ...session.pattern.parameters,
        lengthMm,
        armWidthMm: session.params.armWidthMm,
        structuralDepthMm: session.params.structuralDepthMm,
      },
      subpatternIds: session.pattern.nodes.filter((n) => n.kind === 'subpattern').map((n) => n.id),
      operatorBindings: session.pattern.operatorBindings,
    }),
    compare: buildCompareView(
      {
        fromHash: session.headHash ?? 'hash:0',
        toHash: `hash:${g8.regenGeneration}`,
        addedIds: [],
        removedIds: [],
        changedIds: [DEMO_Y_SEMANTIC_ID],
      },
      { lengthMm: lengthMm - 2300 },
      'exact',
    ),
    history: session.liveBinding.historyFromStore
      ? session.history
      : buildHistory(g8.regenGeneration),
    timeline: [
      ...session.timeline,
      { id: `exact:${nowMs}`, kind: 'exact', label: 'ExactRegen', atMs: nowMs },
    ],
  });
}

/** RC-01 — replace demo meshes with live D01 tessellation (API). Selection preserved when ids survive. */
export function appApplyLiveDisplayMeshes(
  session: AppSession,
  meshes: readonly DisplayMeshInput[],
  nowMs: number,
  lengthMm?: number,
): AppSession {
  const length = lengthMm ?? session.g8.lengthEdit.spec.value;
  const g8 = g8ApplyLiveMeshes(session.g8, meshes, length, nowMs);
  const explorerIds = [...new Set(meshes.map((m) => m.semanticOwner))];
  const projected = projectExplorerTree(session, explorerIds, 'D01 Model');
  return refreshDerived({
    ...session,
    g8,
    modelKind: 'd01',
    explorerIds,
    explorerTree: projected.tree,
    explorerGraphObjects: projected.objects,
    liveBinding: {
      ...session.liveBinding,
      explorerFromApi: true,
      pipelineFromRun: true,
    },
    pattern: buildPatternInspector({
      patternId: session.pattern.patternId,
      name: session.pattern.name,
      parameters: { ...session.pattern.parameters, lengthMm: g8.lengthEdit.spec.value },
      subpatternIds: session.pattern.nodes.filter((n) => n.kind === 'subpattern').map((n) => n.id),
      operatorBindings: session.pattern.operatorBindings,
    }),
  });
}

export function appNavigateIssue(session: AppSession, issueId: string, nowMs: number): AppSession {
  const issue = session.validation.issues.find((i) => i.id === issueId);
  const affected = issue?.affectedSemanticIds ?? [];
  const withSelection =
    affected.length > 0
      ? { ...session, g8: g8FocusGeometry(session.g8, affected, 'inspector', nowMs) }
      : session;
  const refreshed = refreshDerived(withSelection);
  return { ...refreshed, validation: navigateToIssue(refreshed.validation, issueId) };
}

/** G14.4 — switch model kind without dome-specific UI code paths. */
export function appSwitchModelKind(
  session: AppSession,
  kind: 'd01' | 'f01' | 'a01',
  nowMs: number,
): AppSession {
  if (kind === 'a01') {
    const ids = session.liveBinding.explorerFromApi
      ? session.explorerIds
      : ['assy:a01:root', 'part:a01:plate'];
    return refreshDerived({
      ...session,
      modelKind: 'a01',
      explorerIds: ids,
      explorerTree: seedExplorerTree(ids, 'A01 Assembly'),
      explorerGraphObjects: [],
      pattern: buildPatternInspector({
        patternId: 'pattern:a01-assembly',
        name: 'A01Assembly',
        parameters: { mateCount: 2 },
        operatorBindings: { 'op:mate': 'mate.v1' },
      }),
    });
  }
  // Keep live D01 tessellation when staying on D01 — never clobber with demo box.
  if (kind === 'd01' && session.g8.meshSource === 'live') {
    return refreshDerived({
      ...session,
      modelKind: 'd01',
    });
  }

  const semanticId = kind === 'f01' ? F01_PANEL_SEMANTIC_ID : DEMO_Y_SEMANTIC_ID;
  const params: DemoMemberParams = {
    lengthMm: kind === 'f01' ? 120 : session.params.lengthMm,
    widthMm: kind === 'f01' ? 80 : session.params.armWidthMm,
    depthMm: kind === 'f01' ? 8 : session.params.structuralDepthMm,
  };
  const meshes = demoDisplayMeshes({
    ...params,
    semanticOwner: semanticId,
    representationId: kind === 'f01' ? 'repr:f01:01' : 'repr:demo:y01',
  });
  const nextG8: G8Session = g8Select({ ...session.g8, meshes }, semanticId, 'explorer', nowMs);
  const explorerIds = kind === 'f01' ? [F01_PANEL_SEMANTIC_ID] : [DEMO_Y_SEMANTIC_ID];
  return refreshDerived({
    ...session,
    modelKind: kind,
    g8: {
      ...nextG8,
      meshSource: 'demo',
      liveBaselineMeshes: null,
      liveBaselineLengthMm: null,
    },
    explorerIds,
    explorerTree: seedExplorerTree(
      explorerIds,
      kind === 'f01' ? 'F01 Panel' : 'D01 Model',
    ),
    explorerGraphObjects: [],
    liveBinding: {
      ...session.liveBinding,
      explorerFromApi: false,
      pipelineFromRun: false,
    },
    pattern: buildPatternInspector({
      patternId: kind === 'f01' ? 'pattern:FreeformPanelSet' : 'pattern:geodesic',
      name: kind === 'f01' ? 'FreeformPanelSet' : 'geodesic',
      parameters:
        kind === 'f01'
          ? { panelWidthMm: 80, panelThicknessMm: 8 }
          : {
              frequency: 2,
              lengthMm: params.lengthMm,
              armWidthMm: session.params.armWidthMm,
              structuralDepthMm: session.params.structuralDepthMm,
            },
      operatorBindings:
        kind === 'f01' ? { 'op:panel': 'extrude.v1' } : { 'op:y': 'y-network.v1' },
    }),
  });
}

export function appApplyAiChange(session: AppSession): AppSession {
  return {
    ...session,
    aiChanges: session.aiChanges.map((c) =>
      c.disposition === 'proposed' ? { ...c, disposition: 'applied' as const } : c,
    ),
    whyLine:
      'Local disposition only — use Accept & rebuild to compile and refresh meshes.',
  };
}

/** Bind a human Schema Draft into pending ChangeSet — no mesh mutation. */
export function appBindPendingDraft(
  session: AppSession,
  pending: PendingAiChangeSet,
): AppSession {
  return {
    ...session,
    pendingChangeSet: { ...pending, disposition: 'proposed' },
    aiChanges: [
      {
        changeSetId: pending.changeSetId,
        disposition: 'proposed',
        commandCount: pending.commands.length,
        attribution: 'ai',
      },
      ...session.aiChanges.filter((c) => c.changeSetId !== pending.changeSetId),
    ],
    whyLine: `Draft pending ${pending.changeSetId} (${pending.commands.length} cmd) — Preview or Accept; meshes unchanged.`,
  };
}

/** Bind a live /ai/agent/run response into the AI panel (proposal only — no geometry). */
export function appBindAgentRun(
  session: AppSession,
  run: {
    readonly status: string;
    readonly mode: string;
    readonly note: string;
    readonly error?: string;
    readonly liveCompile: { readonly ok: boolean; readonly pipelineHash?: string };
    readonly changesView: readonly {
      readonly changeSetId: string;
      readonly disposition: string;
      readonly commandCount: number;
      readonly attribution: 'ai';
    }[];
    readonly why: { readonly explanation: string };
    readonly audit: { readonly intent: string; readonly toolCalls: readonly string[] };
    readonly applied?: PendingAiChangeSet;
    readonly agentContext?: {
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
      readonly world?: { readonly viewportNote?: string };
      readonly examples?: readonly unknown[];
    };
  },
): AppSession {
  const pipe = run.liveCompile.pipelineHash
    ? ` · pipe ${run.liveCompile.pipelineHash.slice(0, 8)}`
    : '';
  const err = run.error ? ` · error: ${run.error}` : '';
  const dispositions = new Set(['proposed', 'applied', 'rejected', 'conflict']);
  const pending =
    run.applied && run.applied.commands.length > 0
      ? {
          ...run.applied,
          disposition: 'proposed',
        }
      : session.pendingChangeSet;
  const agentContext = run.agentContext
    ? {
        mutate: {
          acceptOps: [...run.agentContext.mutate.acceptOps],
          unsupportedOps: [...run.agentContext.mutate.unsupportedOps],
          kindsAllowlist: [...run.agentContext.mutate.kindsAllowlist],
          parameters: [...run.agentContext.mutate.parameters],
          examples: [...(run.agentContext.mutate.examples ?? run.agentContext.examples ?? [])],
        },
        worldNotes:
          run.agentContext.world?.viewportNote ??
          'Mutate WORLD (+Z) quantities in mm; viewport Y-up is display-only.',
      }
    : session.agentContext;
  return {
    ...session,
    pendingChangeSet: pending,
    agentContext,
    aiChanges:
      run.changesView.length > 0
        ? run.changesView.map((c) => ({
            changeSetId: c.changeSetId,
            disposition: (dispositions.has(c.disposition)
              ? c.disposition
              : 'proposed') as AiChangesPanelItem['disposition'],
            commandCount: c.commandCount,
            attribution: 'ai' as const,
          }))
        : session.aiChanges,
    whyLine: `[${run.mode}/${run.status}] liveCompile=${run.liveCompile.ok ? 'ok' : 'fail'}${pipe}${err} — ${run.note} · ${run.why.explanation} · tools: ${run.audit.toolCalls.join(', ') || 'none'}`,
  };
}

/** Apply successful /ai/changeset/accept — meshes + disposition. */
export function appBindAcceptSuccess(
  session: AppSession,
  result: {
    readonly pipelineHash: string;
    readonly lengthMmOverride: number;
    readonly armWidthMm?: number;
    readonly structuralDepthMm?: number;
    readonly patternInstanceId?: string;
    readonly meshes: readonly DisplayMeshInput[];
    readonly audit?: { readonly changeSetId: string };
    readonly whyExplain?: string;
  },
  nowMs: number,
): AppSession {
  const withMeshes = appApplyLiveDisplayMeshes(
    session,
    result.meshes,
    nowMs,
    result.lengthMmOverride,
  );
  const armWidthMm = result.armWidthMm ?? withMeshes.params.armWidthMm;
  const structuralDepthMm = result.structuralDepthMm ?? withMeshes.params.structuralDepthMm;
  const paramBits = [
    `lengthMm=${result.lengthMmOverride}`,
    `armWidthMm=${armWidthMm}`,
    `structuralDepthMm=${structuralDepthMm}`,
  ];
  if (result.patternInstanceId) paramBits.push(`patternInstanceId=${result.patternInstanceId}`);
  const explain =
    result.whyExplain && result.whyExplain.trim().length > 0
      ? ` · Why: ${result.whyExplain}`
      : '';
  return {
    ...withMeshes,
    params: {
      lengthMm: result.lengthMmOverride,
      armWidthMm,
      structuralDepthMm,
    },
    pendingChangeSet: null,
    aiChanges: session.aiChanges.map((c) => ({
      ...c,
      disposition: 'applied' as const,
    })),
    whyLine: `Accepted on AI branch — geometry rebuilt (${paramBits.join(', ')}, pipe ${result.pipelineHash.slice(0, 8)}). Main branch untouched.${explain}`,
  };
}

export function appBindAcceptFailure(
  session: AppSession,
  failure: { readonly failureCode?: string; readonly reason?: string },
): AppSession {
  return {
    ...session,
    whyLine: `Accept failed: ${failure.failureCode ?? 'ERROR'} — ${failure.reason ?? 'unknown'} (meshes unchanged)`,
  };
}

/** Reject pending ChangeSet — clears provisional preview (D3c). */
export function appRejectPendingChangeSet(session: AppSession): AppSession {
  if (!session.pendingChangeSet) {
    return {
      ...session,
      whyLine: 'No pending ChangeSet to reject',
    };
  }
  return {
    ...session,
    pendingChangeSet: null,
    aiChanges: session.aiChanges.map((c) =>
      c.changeSetId === session.pendingChangeSet!.changeSetId
        ? { ...c, disposition: 'rejected' as const }
        : c,
    ),
    whyLine: `Rejected ChangeSet ${session.pendingChangeSet.changeSetId} — provisional preview cleared.`,
  };
}

/**
 * Fork as a variant switch — does not append history timeline (D4b).
 */
export function appForkVariant(session: AppSession, nowMs: number): AppSession {
  const id = `variant:${nowMs}`;
  const label = session.liveBinding.historyFromStore
    ? session.fork.label
    : `${session.fork.label} (local/demo only)`;
  return {
    ...session,
    variants: [...session.variants, { id, kind: 'variant' as const, label, atMs: nowMs }],
    activeVariantId: id,
    whyLine: session.liveBinding.historyFromStore
      ? `Variant · ${label}`
      : `Variant · ${label} — remote branch unchanged`,
  };
}

export function appSelectionSynced(session: AppSession): boolean {
  return g8SelectionSynced(session.g8);
}

export function appAnalysisIndicative(session: AppSession): boolean {
  return analysisLabelIsIndicative(session.analysis);
}

export function appPrimarySemanticId(): string {
  return g8PrimarySemanticId();
}
