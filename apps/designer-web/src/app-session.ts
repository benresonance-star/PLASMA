/**
 * Integrated designer session — G8–G15 view surfaces on a shared selection model.
 * Browser-safe fixtures only (no geometry-contracts / node:crypto).
 */

import { buildValidationReport } from '@spds/validation-core';
import {
  createG8Session,
  g8CommitExactLength,
  g8ExplorerIds,
  g8PreviewLength,
  g8PrimarySemanticId,
  g8Select,
  g8SelectionSynced,
  g8SetChrome,
  g8SetPanel,
  type G8Session,
} from './g8-session.js';
import { preserveSelectionAfterRegen } from './selection-sync.js';
import { commitExact, markValidated } from './parameter-editing.js';
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

export const F01_PANEL_SEMANTIC_ID = 'panel:f01:01';

export interface AiChangesPanelItem {
  readonly changeSetId: string;
  readonly disposition: 'proposed' | 'applied' | 'rejected' | 'conflict';
  readonly commandCount: number;
  readonly attribution: 'ai';
}

export interface AppSession {
  readonly g8: G8Session;
  readonly modelKind: 'd01' | 'f01';
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
  readonly whyLine: string;
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

function buildPipeline(selectedId: string, lengthMm: number): PipelineViewModel {
  return buildPipelineView({
    dagId: 'dag:demo',
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
        status: lengthMm > 450 ? 'warning' : 'succeeded',
        timingMs: 2,
        diagnostics: lengthMm > 450 ? ['warn:length-near-domain-max'] : [],
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
        payload: { lengthMm: 200 },
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
  const lengthMm = session.g8.lengthEdit.spec.value;
  return {
    ...session,
    pipeline: buildPipeline(selected, lengthMm),
    deps: buildDeps(selected),
    validation: buildValidation(selected),
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
    whyLine: `${selected} ← pattern → compose → measure (regen ${session.g8.regenGeneration})`,
  };
}

export function createAppSession(): AppSession {
  const g8 = createG8Session();
  const base: AppSession = {
    g8,
    modelKind: 'd01',
    pipeline: buildPipeline(DEMO_Y_SEMANTIC_ID, 200),
    pattern: buildPatternInspector({
      patternId: 'pattern:geodesic',
      name: 'geodesic',
      parameters: { frequency: 2, lengthMm: 200 },
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
    whyLine: '',
  };
  return refreshDerived(base);
}

export function appExplorerIds(session: AppSession): readonly string[] {
  if (session.modelKind === 'f01') return [F01_PANEL_SEMANTIC_ID];
  return [...g8ExplorerIds(), F01_PANEL_SEMANTIC_ID];
}

export function appSelect(
  session: AppSession,
  semanticId: string | null,
  source: SelectionSource,
  nowMs: number,
): AppSession {
  return refreshDerived({ ...session, g8: g8Select(session.g8, semanticId, source, nowMs) });
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
  return refreshDerived({
    ...session,
    g8,
    pattern: buildPatternInspector({
      patternId: session.pattern.patternId,
      name: session.pattern.name,
      parameters: { ...session.pattern.parameters, lengthMm: g8.lengthEdit.spec.value },
      subpatternIds: session.pattern.nodes.filter((n) => n.kind === 'subpattern').map((n) => n.id),
      operatorBindings: session.pattern.operatorBindings,
    }),
    compare: buildCompareView(
      {
        fromHash: 'hash:0',
        toHash: `hash:${g8.regenGeneration}`,
        addedIds: [],
        removedIds: [],
        changedIds: [DEMO_Y_SEMANTIC_ID],
      },
      { lengthMm: g8.lengthEdit.spec.value - 200 },
      'exact',
    ),
    history: buildHistory(g8.regenGeneration),
  });
}

/** RC-01 — replace demo meshes with live D01 tessellation (API). Selection preserved when ids survive. */
export function appApplyLiveDisplayMeshes(
  session: AppSession,
  meshes: readonly DisplayMeshInput[],
  nowMs: number,
): AppSession {
  const surviving = new Set(meshes.map((m) => m.semanticOwner));
  const selection = preserveSelectionAfterRegen(session.g8.selection, surviving, nowMs);
  const g8 = {
    ...session.g8,
    meshes,
    selection,
    regenGeneration: session.g8.regenGeneration + 1,
    lengthEdit: markValidated(commitExact(session.g8.lengthEdit)),
  };
  return refreshDerived({ ...session, g8, modelKind: 'd01' });
}

export function appNavigateIssue(session: AppSession, issueId: string, nowMs: number): AppSession {
  const issue = session.validation.issues.find((i) => i.id === issueId);
  const focused = issue?.affectedSemanticIds[0] ?? null;
  const withSelection = focused
    ? { ...session, g8: g8Select(session.g8, focused, 'inspector', nowMs) }
    : session;
  const refreshed = refreshDerived(withSelection);
  return { ...refreshed, validation: navigateToIssue(refreshed.validation, issueId) };
}

/** G14.4 — switch to F01 freeform fixture without dome-specific UI code paths. */
export function appSwitchModelKind(session: AppSession, kind: 'd01' | 'f01', nowMs: number): AppSession {
  const semanticId = kind === 'f01' ? F01_PANEL_SEMANTIC_ID : DEMO_Y_SEMANTIC_ID;
  const params: DemoMemberParams = {
    lengthMm: kind === 'f01' ? 120 : session.g8.lengthEdit.spec.value,
    widthMm: kind === 'f01' ? 80 : 40,
    depthMm: kind === 'f01' ? 8 : 40,
  };
  const meshes = demoDisplayMeshes({
    ...params,
    semanticOwner: semanticId,
    representationId: kind === 'f01' ? 'repr:f01:01' : 'repr:demo:y01',
  });
  const nextG8: G8Session = g8Select(
    { ...session.g8, meshes },
    semanticId,
    'explorer',
    nowMs,
  );
  return refreshDerived({
    ...session,
    modelKind: kind,
    g8: nextG8,
    pattern: buildPatternInspector({
      patternId: kind === 'f01' ? 'pattern:FreeformPanelSet' : 'pattern:geodesic',
      name: kind === 'f01' ? 'FreeformPanelSet' : 'geodesic',
      parameters:
        kind === 'f01'
          ? { panelWidthMm: 80, panelThicknessMm: 8 }
          : { frequency: 2, lengthMm: params.lengthMm },
      operatorBindings:
        kind === 'f01'
          ? { 'op:panel': 'extrude.v1' }
          : { 'op:y': 'y-network.v1' },
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
      'Accepted in UI only — local disposition updated; geometry unchanged until /commands/accept.',
  };
}

/** Bind a live /ai/agent/run response into the AI panel (honest lineage; no geometry mutation). */
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
  },
): AppSession {
  const pipe = run.liveCompile.pipelineHash
    ? ` · pipe ${run.liveCompile.pipelineHash.slice(0, 8)}`
    : '';
  const err = run.error ? ` · error: ${run.error}` : '';
  const dispositions = new Set(['proposed', 'applied', 'rejected', 'conflict']);
  return {
    ...session,
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

export function appSelectionSynced(session: AppSession): boolean {
  return g8SelectionSynced(session.g8);
}

export function appAnalysisIndicative(session: AppSession): boolean {
  return analysisLabelIsIndicative(session.analysis);
}

export function appPrimarySemanticId(): string {
  return g8PrimarySemanticId();
}
