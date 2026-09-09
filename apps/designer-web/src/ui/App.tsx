import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Boxes, ChevronDown, Network, PanelLeft, PanelRight, Ruler } from 'lucide-react';
import type { CenterWorkspace } from '../ui-preferences.js';
import { IndexedSemanticGraph } from '@spds/semantic-query';
import {
  aggregateByFamily,
  applyLenses,
  buildConstraintTintPass,
  impactFromParameter,
  patternGraph,
  projectCausalNeighbourhood,
  projectFieldInfluence,
  resolveCausalAnchorId,
  resolveConstraintOwners,
  type FieldInfluenceOverlay,
  type GraphProjection,
  type LensId,
  type SemanticDepth,
} from '@spds/graph-projection';
import { buildSchemaPayload } from '@spds/semantic-core';
import { buildPendingChangeSetPreview } from '../pending-changeset-preview.js';
import {
  beginSketchIntent,
  cancelSketchIntent,
  cellsFromGrid,
  mergeSketchIntoProjection,
  type SketchIntentDraft,
} from '../sketch-intent.js';
import type { ConstraintMeshTint } from './three-scene.js';
import {
  isReadOnlyFocusCommand,
  parseGraphFocusCommand,
  type GraphFocusCommand,
} from '@spds/ai-interface';
import { applyGraphFocusCommand } from '../sdi/apply-graph-focus.js';
import {
  acceptAiChangeSet,
  createModel,
  createModelGroup,
  createSnapshot,
  fetchD01Analyze,
  fetchD01DisplayMeshes,
  fetchHealth,
  fetchModelSchema,
  fetchStaticSchema,
  fetchModelSubstrate,
  explainObjectApi,
  importStep,
  listObjects,
  measureCompare,
  publishD01,
  reparentModelGroup,
  fetchUndoStack,
  postBranchRedo,
  postBranchUndo,
  runAiAgent,
  runWhatIfPreview,
  seedD01Substrate,
  type AgentRunMode,
  type SubstrateGraphObject,
} from '../api-client.js';
import { buildTransactionStatusView } from '../transaction-status.js';
import {
  applyWhatIfDraft,
  bindWhatIfPreview,
  createIdleWhatIf,
  forkWhatIf,
  rejectWhatIf,
  type WhatIfForkState,
} from '../what-if-session.js';
import { explorerParentToSemanticParent } from '../explorer-from-graph.js';
import { biaStripFromPending, impactViewFromPending } from '../pending-impact.js';
import { draftUpdateParam, pendingSchemaAnnotationIds } from '../schema-draft.js';
import {
  attachSchemaMutateSlice,
  defaultSchemaMutateSlice,
  parseSchemaViewPayload,
  type SchemaViewModel,
} from '../schema-view.js';
import { CausalGraphPane } from '../sdi/CausalGraphPane.js';
import { SchemaWorkspace } from './SchemaWorkspace.js';
import {
  clearMeasure,
  commitMeasurePick,
  createMeasureToolState,
  formatCompareRow,
  formatMeasureQuantity,
  setMeasureMode,
  setMeasureSnap,
  type MeasureToolState,
} from '../measure-tool.js';
import {
  addMeasurement,
  clearMeasurements,
  deleteMeasurement,
  loadMeasureLibrary,
  persistMeasureLibrary,
  renameMeasurement,
  selectMeasurement,
  setListCollapsed,
  setOverlaysVisible,
  updateMeasurementResult,
  type MeasureLibraryState,
} from '../measure-library.js';
import {
  THEME_KEY,
  createDefaultWorkspacePrefs,
  hydrateUiPreferencesFromServer,
  loadWorkspacePrefs,
  persistWorkspacePrefs,
  scheduleUiPreferencesPush,
  type MeasureUiMode,
  type WorkspaceUiPrefs,
} from '../ui-preferences.js';
import { buildDraftMeasureOverlay, buildSavedMeasureOverlay } from '../measure-overlay-build.js';
import {
  measureBoxFeatures,
  type MeasureCompareResult,
  type MeasureResult,
} from '@spds/geometry-contracts/measure';
import {
  appAnalysisIndicative,
  appApplyLiveDisplayMeshes,
  appBindAcceptFailure,
  appBindAcceptSuccess,
  appBindAgentRun,
  appBindPendingDraft,
  appBindPipelineRun,
  appSetHead,
  appBootstrapFailure,
  appBootstrapSuccess,
  appCommitExactLength,
  appForkVariant,
  appRejectPendingChangeSet,
  appExplorerAddImport,
  appExplorerCreate,
  appExplorerDelete,
  appExplorerRename,
  appExplorerReorder,
  appExplorerReparent,
  appExplorerSelect,
  appFocusGeometry,
  appNavigateIssue,
  appPreviewLength,
  appPrimarySemanticId,
  appSelect,
  appSetExplorerGraphObjects,
  appSetPanel,
  appSetParams,
  appSetPublicationStatus,
  appSwitchModelKind,
  createAppSession,
  type AppSession,
} from '../app-session.js';
import type { DisplayMeshInput } from '../mesh-bridge.js';
import { scaleArmMeshes } from './mesh-length.js';
import { PANEL_WIDTH_LIMITS, type PanelWidthKey, type PanelWidthPrefs } from '../panel-layout.js';
import {
  RIGHT_PANE_KINDS,
  rightPaneForPanel,
  rightPaneLabel,
  shouldMountViewport,
  type RightPaneKind,
} from '../right-pane.js';
import { Button } from '../components/ui/button.js';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover.js';
import { loadViewportPrefs, persistViewportBackground } from '../viewport-prefs.js';
import { ExplorerPanel } from './ExplorerPanel.js';
import { HelpTooltip, HelpTooltipScope } from './HelpTooltip.js';
import { MeasureHud } from './MeasureHud.js';
import { ModelMenu } from './ModelMenu.js';
import { PanelResizeHandle } from './PanelResizeHandle.js';
import { PlasmaBrand } from './PlasmaBrand.js';
import { RightPane } from './RightPane.js';
import { SettingsMenu } from './SettingsMenu.js';
import { viewportBackgroundCssHex } from './three-scene.js';
import { ViewportCanvas } from './ViewportCanvas.js';

const HEADER_TOOLTIPS = {
  explorerCollapse: 'Collapse the left explorer browser to give the viewport more width.',
  explorerExpand:
    'Expand the left explorer browser to navigate the model tree, folders, and components.',
  rightCollapse: 'Collapse the right inspector/tools pane to give the viewport more width.',
  rightExpand:
    'Expand the right pane for inspector parameters, pipeline, validation, history, AI, and analysis.',
  geometry:
    'Show the 3D geometry viewport as the center workspace — select, measure, and preview live tessellation.',
  schema:
    'Show the schema canvas in the center workspace and open the Schema right pane for catalog/object structure.',
  measure:
    'Toggle the measure HUD for Distance, Angle, and Area picks. Saved measurements highlight in the viewport.',
  engines:
    'Toggle the geometry engines HUD to compare tessellation backends (for example OCCT vs preview engines).',
  causal:
    'Toggle the Causal lens beside the viewport to explore depth, lenses, and relationships for the selection.',
  explain:
    'Explain the current selection: load provenance and causal context from the live substrate into the lens.',
  undo: 'Undo the last committed change on the AI/working branch by applying compensating commands. History is not rewritten — the branch head moves and geometry refreshes. Disabled while a pending changeset is open or nothing is left to undo.',
  redo: 'Redo the last undone change on the AI/working branch, advancing the head again and refreshing geometry. Disabled while a pending changeset is open or nothing is left to redo.',
  rightPane:
    'Choose which tool fills the right pane — Inspector, Pipeline, Validation, History, AI, Analysis, or Schema.',
} as const;

const RIGHT_PANE_TOOLTIPS: Record<RightPaneKind, string> = {
  inspector:
    'Inspector — edit parameters, run exact regen, snapshot/import, and inspect dependencies for the selection.',
  pipeline: 'Pipeline — inspect the latest compile/run hash, stages, and produced artifacts.',
  validation: 'Validation — review constraint and rule issues for the current model revision.',
  history:
    'History — browse snapshots, restore points, and forks/variants without confusing intentional variants.',
  ai: 'AI — run agents, review proposed changesets, and accept or reject semantic edits.',
  'analysis-mesh': 'Analysis mesh — review derived analysis display meshes for the current model.',
  schema: 'Schema — browse catalog/object schema structure for the active model.',
};

function readInitialDark(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === 'light') return false;
  if (stored === 'dark') return true;
  return true;
}

function toExplorerGraphObjects(
  objects: readonly SubstrateGraphObject[],
): Parameters<typeof appSetExplorerGraphObjects>[1] {
  return objects.map((o) => ({
    id: o.id,
    semanticType: o.semanticType,
    tags: o.tags,
    ...(o.attributes !== undefined ? { attributes: o.attributes } : {}),
    ...(o.edges !== undefined ? { edges: o.edges } : {}),
  }));
}

function substrateToIndexedGraph(objects: readonly SubstrateGraphObject[]): IndexedSemanticGraph {
  return new IndexedSemanticGraph(
    objects.map((o) => ({
      id: o.id,
      semanticType: o.semanticType,
      tags: o.tags,
      ...(o.attributes !== undefined ? { attributes: o.attributes } : {}),
      ...(o.edges !== undefined ? { edges: o.edges } : {}),
    })),
  );
}

export function App() {
  const [session, setSession] = useState(() => createAppSession());
  const [liveStatus, setLiveStatus] = useState<string>('bootstrapping');
  const [aiIntent, setAiIntent] = useState(
    'Propose a safe lengthMm update for y:demo:01 (500–4000 mm)',
  );
  const [agentMode, setAgentMode] = useState<AgentRunMode>('scripted');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dark, setDark] = useState(readInitialDark);
  const [viewportBackgroundDark, setViewportBackgroundDark] = useState<string | null>(
    () => loadViewportPrefs().backgroundHexDark,
  );
  const [viewportBackgroundLight, setViewportBackgroundLight] = useState<string | null>(
    () => loadViewportPrefs().backgroundHexLight,
  );
  const viewportBackgroundHex = dark ? viewportBackgroundDark : viewportBackgroundLight;
  const [serviceMeshes, setServiceMeshes] = useState<readonly DisplayMeshInput[]>([]);
  const [serviceLabel, setServiceLabel] = useState('Geometry service');
  const [serviceError, setServiceError] = useState<string | undefined>(undefined);
  const [referenceLabel, setReferenceLabel] = useState('Reference pipeline');
  const [retryGeometryBusy, setRetryGeometryBusy] = useState(false);
  /** Baseline for OCCT/service layer so length preview scales both engines together. */
  const serviceBaselineRef = useRef<{
    readonly meshes: readonly DisplayMeshInput[];
    readonly lengthMm: number;
  } | null>(null);

  const bindServiceMeshes = (
    meshes: readonly DisplayMeshInput[],
    lengthMm: number,
    label?: string,
  ) => {
    serviceBaselineRef.current = { meshes, lengthMm };
    setServiceMeshes(meshes);
    if (label !== undefined) setServiceLabel(label);
    setServiceError(undefined);
  };

  const clearServiceMeshes = (error?: string) => {
    serviceBaselineRef.current = null;
    setServiceMeshes([]);
    if (error !== undefined) setServiceError(error);
  };

  const previewLengthDriven = (mm: number) => {
    update((s) => appPreviewLength(s, mm));
    const base = serviceBaselineRef.current;
    if (base && base.lengthMm > 0 && base.meshes.length > 0) {
      setServiceMeshes(scaleArmMeshes(base.meshes, mm / base.lengthMm));
    }
  };
  const [measureTool, setMeasureTool] = useState<MeasureToolState>(() => {
    const ws = loadWorkspacePrefs();
    return setMeasureSnap(
      setMeasureMode(createMeasureToolState(), ws.measureTool.lastMode),
      ws.measureTool.snap,
    );
  });
  const [measureLibrary, setMeasureLibrary] = useState<MeasureLibraryState>(() =>
    loadMeasureLibrary(),
  );
  const [workspacePrefs, setWorkspacePrefs] = useState<WorkspaceUiPrefs>(() =>
    loadWorkspacePrefs(),
  );
  const [measureHudOpen, setMeasureHudOpen] = useState(() => loadWorkspacePrefs().huds.measureOpen);
  const [engineHudOpen, setEngineHudOpen] = useState(() => loadWorkspacePrefs().huds.engineOpen);
  const [graphPaneOpen, setGraphPaneOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [rightPaneOpen, setRightPaneOpen] = useState(true);
  const [rightPaneMenuOpen, setRightPaneMenuOpen] = useState(false);
  const [causalRadius, setCausalRadius] = useState<1 | 2>(1);
  const [semanticDepth, setSemanticDepth] = useState<SemanticDepth>('system');
  const [graphLenses, setGraphLenses] = useState<readonly LensId[]>([
    'patterns',
    'parameters',
    'entities',
    'dependencies',
    'fields',
    'constraints',
  ]);
  const [aggregateEntities, setAggregateEntities] = useState(false);
  const [enteredPatternId, setEnteredPatternId] = useState<string | null>(null);
  const [sketchDraft, setSketchDraft] = useState<SketchIntentDraft | null>(null);
  const [whatIf, setWhatIf] = useState<WhatIfForkState>(() => createIdleWhatIf());
  const [whatIfBusy, setWhatIfBusy] = useState(false);
  const [substrateGraph, setSubstrateGraph] = useState<IndexedSemanticGraph | null>(null);
  const [substrateEdges, setSubstrateEdges] = useState<
    ReadonlyArray<{ readonly from: string; readonly to: string; readonly relationType?: string }>
  >([]);
  const [, setExplainStatus] = useState<string | null>(null);
  const [schemaView, setSchemaView] = useState<SchemaViewModel | null>(null);
  const [schemaStatus, setSchemaStatus] = useState('Schema not loaded');
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);
  const measureToolRef = useRef(measureTool);
  measureToolRef.current = measureTool;
  const lastMeasureModeRef = useRef<MeasureUiMode>(workspacePrefs.measureTool.lastMode);

  const buildWorkspaceSnapshot = (
    overrides?: Partial<{
      measureOpen: boolean;
      engineOpen: boolean;
      measurePosition: WorkspaceUiPrefs['huds']['measurePosition'];
      enginePosition: WorkspaceUiPrefs['huds']['enginePosition'];
      explorerExpandedIds: readonly string[];
      panelWidths: PanelWidthPrefs;
      session: AppSession;
      tool: MeasureToolState;
      centerWorkspace: CenterWorkspace;
    }>,
  ): WorkspaceUiPrefs => {
    const s = overrides?.session ?? session;
    const tool = overrides?.tool ?? measureToolRef.current;
    const lastMode: MeasureUiMode = tool.mode !== 'idle' ? tool.mode : lastMeasureModeRef.current;
    if (tool.mode !== 'idle') lastMeasureModeRef.current = tool.mode;
    return createDefaultWorkspacePrefs({
      huds: {
        measureOpen: overrides?.measureOpen ?? measureHudOpen,
        engineOpen: overrides?.engineOpen ?? engineHudOpen,
        measurePosition:
          overrides?.measurePosition !== undefined
            ? overrides.measurePosition
            : workspacePrefs.huds.measurePosition,
        enginePosition:
          overrides?.enginePosition !== undefined
            ? overrides.enginePosition
            : workspacePrefs.huds.enginePosition,
      },
      shell: {
        activePanel: s.g8.shell.activePanel,
        modelKind: s.modelKind,
        publicationStatus: s.publicationStatus,
        selectedSemanticId: s.g8.selection.selectedSemanticId,
        explorerExpandedIds:
          overrides?.explorerExpandedIds ?? workspacePrefs.shell.explorerExpandedIds,
        panelWidths: overrides?.panelWidths ?? workspacePrefs.shell.panelWidths,
      },
      measureTool: {
        lastMode,
        snap: tool.snap,
      },
      centerWorkspace: overrides?.centerWorkspace ?? workspacePrefs.centerWorkspace,
    });
  };

  const centerWorkspace = workspacePrefs.centerWorkspace;
  const schemaMode = centerWorkspace === 'schema';

  const setCenterWorkspace = (mode: CenterWorkspace) => {
    if (mode === 'schema') setGraphPaneOpen(false);
    pushWorkspace(buildWorkspaceSnapshot({ centerWorkspace: mode }));
  };

  const enrichSchemaVm = (vm: SchemaViewModel | null): SchemaViewModel | null => {
    if (!vm) return null;
    const fromAgent = session.agentContext;
    const mutate = fromAgent
      ? {
          acceptOps: fromAgent.mutate.acceptOps,
          unsupportedOps: fromAgent.mutate.unsupportedOps,
          kindsAllowlist: fromAgent.mutate.kindsAllowlist,
          parameters: fromAgent.mutate.parameters,
          examples: fromAgent.mutate.examples,
          worldNotes: fromAgent.worldNotes,
        }
      : (vm.mutate ??
        defaultSchemaMutateSlice({
          lengthMm: session.params.lengthMm,
          armWidthMm: session.params.armWidthMm,
          structuralDepthMm: session.params.structuralDepthMm,
        }));
    return attachSchemaMutateSlice(vm, mutate);
  };

  const pushWorkspace = (next: WorkspaceUiPrefs) => {
    setWorkspacePrefs(next);
    persistWorkspacePrefs(next);
    scheduleUiPreferencesPush({
      theme: dark ? 'dark' : 'light',
      measureLibrary,
      workspace: next,
    });
  };

  const setPanelWidth = (key: PanelWidthKey, widthPx: number) => {
    const nextWidths = { ...workspacePrefs.shell.panelWidths, [key]: widthPx };
    pushWorkspace(buildWorkspaceSnapshot({ panelWidths: nextWidths }));
  };

  const panelWidths = workspacePrefs.shell.panelWidths;

  const setMeasureHudVisible = (open: boolean) => {
    setMeasureHudOpen(open);
    if (open) {
      setMeasureTool((s) => setMeasureMode(s, lastMeasureModeRef.current));
    } else {
      setMeasureTool((s) => {
        if (s.mode !== 'idle') lastMeasureModeRef.current = s.mode;
        return setMeasureMode(s, 'idle');
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    void hydrateUiPreferencesFromServer({
      theme: dark ? 'dark' : 'light',
      measureLibrary,
      workspace: workspacePrefs,
    }).then((hydrated) => {
      if (cancelled) return;
      setDark(hydrated.theme === 'dark');
      setMeasureLibrary(hydrated.measureLibrary);
      const ws = hydrated.workspace;
      setWorkspacePrefs(ws);
      setMeasureHudOpen(ws.huds.measureOpen);
      setEngineHudOpen(ws.huds.engineOpen);
      lastMeasureModeRef.current = ws.measureTool.lastMode;
      setMeasureTool(
        setMeasureSnap(
          setMeasureMode(
            createMeasureToolState(),
            ws.huds.measureOpen ? ws.measureTool.lastMode : 'idle',
          ),
          ws.measureTool.snap,
        ),
      );
      setSession((s) => {
        // Prefer live bootstrap geometry. Switching kinds replaces meshes with demos —
        // only do that when the hydrated kind differs and we are not already on live D01.
        let next = s;
        if (ws.shell.modelKind !== s.modelKind) {
          next = appSwitchModelKind(s, ws.shell.modelKind, Date.now());
        }
        next = appSetPublicationStatus(next, ws.shell.publicationStatus);
        next = appSetPanel(next, ws.shell.activePanel);
        const owners = new Set(next.g8.meshes.map((m) => m.semanticOwner));
        if (ws.shell.selectedSemanticId && owners.has(ws.shell.selectedSemanticId)) {
          next = appSelect(next, ws.shell.selectedSemanticId, 'explorer', Date.now());
        }
        return next;
      });
      {
        const vp = loadViewportPrefs();
        setViewportBackgroundDark(vp.backgroundHexDark);
        setViewportBackgroundLight(vp.backgroundHexLight);
      }
      setPrefsReady(true);
    });
    return () => {
      cancelled = true;
    };
    // Hydrate once on mount from local cache + hosted UI database.
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    persistMeasureLibrary(measureLibrary);
    const next = buildWorkspaceSnapshot();
    setWorkspacePrefs(next);
    persistWorkspacePrefs(next);
    scheduleUiPreferencesPush({
      theme: dark ? 'dark' : 'light',
      measureLibrary,
      workspace: next,
    });
  }, [
    measureLibrary,
    dark,
    prefsReady,
    measureHudOpen,
    engineHudOpen,
    session.g8.shell.activePanel,
    session.modelKind,
    session.publicationStatus,
    session.g8.selection.selectedSemanticId,
    measureTool.mode,
    measureTool.snap,
  ]);

  const update = (fn: (s: AppSession) => AppSession) => setSession((s) => fn(s));
  const selected = session.g8.selection.selectedSemanticId;
  const highlightedIds = session.g8.selection.highlightedIds;
  const active = session.g8.shell.activePanel;
  const rightPaneKind = rightPaneForPanel(active);

  const selectRightPane = (kind: RightPaneKind) => {
    setRightPaneOpen(true);
    setRightPaneMenuOpen(false);
    update((s) => appSetPanel(s, kind));
    if (kind === 'schema') {
      setCenterWorkspace('schema');
    }
  };

  const provisionalSchemaIds = useMemo(
    () => pendingSchemaAnnotationIds(session.pendingChangeSet),
    [session.pendingChangeSet],
  );

  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pendingPreview = useMemo(() => {
    if (!substrateGraph || !selected) {
      return {
        projection: null as GraphProjection | null,
        geometryTargetIds: [] as readonly string[],
      };
    }
    const anchorId = resolveCausalAnchorId(selected, substrateEdges);
    const base = enteredPatternId
      ? patternGraph({
          patternId: enteredPatternId,
          graph: substrateGraph,
          dependencyEdges: substrateEdges,
          depth: semanticDepth,
          parameters: {
            lengthMm: session.params.lengthMm,
            armWidthMm: session.params.armWidthMm,
            structuralDepthMm: session.params.structuralDepthMm,
          },
        })
      : projectCausalNeighbourhood({
          graph: substrateGraph,
          dependencyEdges: substrateEdges,
          focusObjectIds: [anchorId],
          highlightObjectIds: [selected],
          radius: causalRadius,
          depth: semanticDepth,
          projectionId: `proj:causal:${anchorId}:r${causalRadius}:${semanticDepth}`,
        });
    const lensed = applyLenses(base, graphLenses);
    const aggregated = aggregateEntities ? aggregateByFamily(lensed, { threshold: 8 }) : lensed;
    const withPending = buildPendingChangeSetPreview({
      base: aggregated,
      pending: session.pendingChangeSet,
    });
    return {
      projection: mergeSketchIntoProjection(withPending.projection, sketchDraft),
      geometryTargetIds: withPending.geometryTargetIds,
    };
  }, [
    substrateGraph,
    substrateEdges,
    selected,
    causalRadius,
    semanticDepth,
    graphLenses,
    aggregateEntities,
    enteredPatternId,
    session.params.lengthMm,
    session.params.armWidthMm,
    session.params.structuralDepthMm,
    session.pendingChangeSet,
    sketchDraft,
  ]);

  const causalProjection = pendingPreview.projection;

  const pendingImpact = useMemo(
    () => impactViewFromPending(session.pendingChangeSet, substrateEdges),
    [session.pendingChangeSet, substrateEdges],
  );

  const pendingBia = useMemo(
    () => biaStripFromPending(session.pendingChangeSet, causalProjection),
    [session.pendingChangeSet, causalProjection],
  );

  /** E1 — field select → influence overlay from live substrate edges only. */
  const fieldInfluence = useMemo(() => {
    const fieldId = selected?.startsWith('field:') ? selected : (sketchDraft?.fieldId ?? null);
    if (!fieldId) return null;
    const owners = [
      ...new Set(
        substrateEdges
          .filter((e) => e.from === fieldId || e.to === fieldId)
          .flatMap((e) => [e.from, e.to])
          .filter((id) => id !== fieldId && !id.startsWith('field:')),
      ),
    ];
    if (owners.length === 0) return null;
    return projectFieldInfluence(fieldId, owners.slice(0, 32));
  }, [selected, sketchDraft, substrateEdges]);

  /** Overlay when a field is selected, or while a sketch draft is active. */
  const activeFieldOverlay: FieldInfluenceOverlay | null =
    selected?.startsWith('field:') || sketchDraft ? (fieldInfluence?.overlay ?? null) : null;

  /** E2 — constraint select → owner tints from graph edges only. */
  const constraintTints: readonly ConstraintMeshTint[] = useMemo(() => {
    if (!selected?.startsWith('constraint:')) return [];
    const resolution = resolveConstraintOwners({
      constraintId: selected,
      dependencyEdges: substrateEdges,
    });
    if (resolution.ownerIds.length === 0) return [];
    return buildConstraintTintPass(resolution);
  }, [selected, substrateEdges]);

  /** SD4.4 — parameter focus previews minimum downstream geometry set. */
  const impactHighlights = useMemo(() => {
    if (!selected?.startsWith('param:') || substrateEdges.length === 0) return null;
    return impactFromParameter({
      parameterId: selected,
      dependencyEdges: substrateEdges,
    }).downstreamIds;
  }, [selected, substrateEdges]);

  const viewportHighlights =
    pendingPreview.geometryTargetIds.length > 0
      ? pendingPreview.geometryTargetIds
      : fieldInfluence && (selected?.startsWith('field:') || sketchDraft)
        ? fieldInfluence.secondaryIds
        : constraintTints.length > 0
          ? constraintTints.map((t) => t.semanticId)
          : (impactHighlights ?? highlightedIds);

  const seedLiveSubstrate = async () => {
    try {
      let modelId = session.modelId;
      if (!modelId) {
        const created = await createModel('D01');
        modelId = created.model.modelId;
        update((s) => ({
          ...s,
          modelId: created.model.modelId,
          branchId: created.branchId,
          headHash: created.headHash,
        }));
      }
      await seedD01Substrate(modelId, { yLimit: 3, lengthMm: session.params.lengthMm });
      const substrate = await fetchModelSubstrate(modelId);
      setSubstrateGraph(substrateToIndexedGraph(substrate.objects));
      setSubstrateEdges(substrate.dependencyEdges);
      update((s) => appSetExplorerGraphObjects(s, toExplorerGraphObjects(substrate.objects)));
      const firstOwner = substrate.meshes[0]?.semanticOwner;
      if (firstOwner) {
        update((s) => appSelect(s, firstOwner, 'graph', Date.now()));
      }
      setExplainStatus(`Substrate ready · ${substrate.meshes.length} generated Y(s)`);
      setGraphPaneOpen(true);
    } catch {
      setExplainStatus('Substrate seed failed — is the API running the latest build?');
    }
  };

  const causalEmptyMessage = !substrateGraph
    ? liveStatus === 'offline-demo'
      ? 'API is offline (demo geometry). Start the API, then seed a live D01 substrate.'
      : 'No live substrate yet. Seed D01 to project causal neighbourhoods for generated components.'
    : !selected
      ? 'Select a generated component (component:y:…) in the viewport or explorer.'
      : selected.startsWith('y:demo:')
        ? 'Demo selection has no causal graph. Seed live D01 and select component:y:…'
        : 'No projection for this selection.';

  const explainSelection = async () => {
    if (!session.modelId || !selected || !substrateGraph) {
      setExplainStatus('Select a generated component first');
      return;
    }
    try {
      const res = await explainObjectApi(session.modelId, { targetId: selected });
      const why = (res.explain as { whyExists?: unknown[] }).whyExists ?? [];
      const anchorId = resolveCausalAnchorId(selected, substrateEdges);
      const nextProjection = projectCausalNeighbourhood({
        graph: substrateGraph,
        dependencyEdges: substrateEdges,
        focusObjectIds: [anchorId],
        highlightObjectIds: [selected],
        radius: 2,
        depth: 'system',
        projectionId: `proj:causal:${anchorId}:r2`,
      });
      setCausalRadius(2);
      setGraphPaneOpen(true);
      update((s) =>
        appFocusGeometry(
          s,
          nextProjection.nodes.map((n) => n.semanticId),
          'graph',
          Date.now(),
        ),
      );
      setExplainStatus(`Explain · ${why.length} provenance step(s) · context radius 2`);
    } catch {
      setExplainStatus('Explain failed — seed live substrate / check API');
    }
  };

  const onMeasurePick = (
    pick: Parameters<typeof commitMeasurePick>[1],
    extents: {
      readonly min: readonly [number, number, number];
      readonly max: readonly [number, number, number];
    },
  ) => {
    const prev = measureToolRef.current;
    const commit = commitMeasurePick(prev, pick);
    setMeasureTool(commit.state);
    measureToolRef.current = commit.state;
    if (commit.type !== 'complete' || prev.mode === 'idle') return;
    const kind = prev.mode;
    const features = commit.features;
    const picks = commit.state.picks;
    // Local quantity for immediate HUD label (works even if API /measure/compare is down).
    let localActive: MeasureResult | null = null;
    try {
      const local = measureBoxFeatures(kind, features, extents);
      localActive = {
        kind,
        quantity: local.quantity,
        unit: local.unit,
        provenance: 'brep',
        engine: {
          layer: pick.engineLayer,
          kernel: pick.kernel,
          label: pick.kernel,
        },
        features: [...features],
      };
    } catch {
      /* feature resolve failed — still try API */
    }
    if (!localActive) {
      setMeasureTool((s) => {
        const next = { ...s, status: 'Measure failed to resolve features' };
        measureToolRef.current = next;
        return next;
      });
      return;
    }

    const savedId = `meas:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    setMeasureLibrary((lib) =>
      addMeasurement(lib, {
        id: savedId,
        kind,
        snap: prev.snap,
        result: localActive!,
        compare: null,
        picks,
      }),
    );
    setMeasureTool((s) => {
      const next = {
        ...clearMeasure(s),
        active: localActive,
        status: `Saved · ${formatMeasureQuantity(localActive!)}`,
      };
      measureToolRef.current = next;
      return next;
    });

    void (async () => {
      try {
        const cmp = await measureCompare({
          kind,
          semanticOwner: pick.semanticOwner,
          features,
          extentsMm: extents,
        });
        const activeResult = (cmp.exact ?? cmp.occt ?? localActive) as MeasureResult | undefined;
        const result: MeasureResult | null = activeResult
          ? {
              kind,
              quantity: activeResult.quantity,
              unit: activeResult.unit as MeasureResult['unit'],
              provenance: 'brep',
              engine: {
                layer: 'reference',
                kernel: 'exact-adapter',
                label: activeResult.engine?.label ?? 'Exact',
              },
              features: [...features],
            }
          : localActive;
        if (result) {
          setMeasureLibrary((lib) =>
            updateMeasurementResult(lib, savedId, {
              result,
              compare: cmp as MeasureCompareResult,
            }),
          );
        }
        setMeasureTool((s) => {
          const next = {
            ...s,
            active: result,
            compare: cmp as MeasureCompareResult,
            status: formatCompareRow(cmp as MeasureCompareResult),
          };
          measureToolRef.current = next;
          return next;
        });
      } catch {
        setMeasureTool((s) => {
          const next = {
            ...s,
            status: localActive
              ? `${formatMeasureQuantity(localActive)} · compare unavailable`
              : 'Measure compare unavailable',
          };
          measureToolRef.current = next;
          return next;
        });
      }
    })();
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    window.localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await fetchHealth();
        const created = await createModel('D01');
        const objects = await listObjects(created.model.modelId, created.branchId);
        const lengthMm = 2300;
        const live = await fetchD01DisplayMeshes(3, lengthMm, undefined, { compareEngines: true });
        if (cancelled) return;
        // Substrate is required for the causal lens; failure must not force demo meshes.
        try {
          await seedD01Substrate(created.model.modelId, { yLimit: 3, lengthMm });
          const substrate = await fetchModelSubstrate(created.model.modelId);
          if (!cancelled) {
            setSubstrateGraph(substrateToIndexedGraph(substrate.objects));
            setSubstrateEdges(substrate.dependencyEdges);
          }
          const meshOwners = live.meshes.map((m) => m.semanticOwner);
          const explorerIds =
            meshOwners.length > 0
              ? meshOwners
              : objects.objects.length > 0
                ? objects.objects.map((o) => String(o['id'] ?? '')).filter(Boolean)
                : [appPrimarySemanticId()];
          if (!cancelled) {
            update((s) =>
              appBootstrapSuccess(
                s,
                {
                  modelId: created.model.modelId,
                  branchId: created.branchId,
                  headHash: created.headHash,
                  explorerIds,
                  pipelineHash: live.pipelineHash,
                  meshes: live.meshes,
                  lengthMm,
                  explorerGraphObjects: toExplorerGraphObjects(substrate.objects),
                  ...(live.pirHash !== undefined ? { pirHash: live.pirHash } : {}),
                },
                Date.now(),
              ),
            );
          }
        } catch {
          if (!cancelled) {
            setSubstrateGraph(null);
            setSubstrateEdges([]);
            setExplainStatus('Causal lens: substrate seed failed — use Seed in the lens pane');
          }
          const meshOwners = live.meshes.map((m) => m.semanticOwner);
          const explorerIds =
            meshOwners.length > 0
              ? meshOwners
              : objects.objects.length > 0
                ? objects.objects.map((o) => String(o['id'] ?? '')).filter(Boolean)
                : [appPrimarySemanticId()];
          if (!cancelled) {
            update((s) =>
              appBootstrapSuccess(
                s,
                {
                  modelId: created.model.modelId,
                  branchId: created.branchId,
                  headHash: created.headHash,
                  explorerIds,
                  pipelineHash: live.pipelineHash,
                  meshes: live.meshes,
                  lengthMm,
                  ...(live.pirHash !== undefined ? { pirHash: live.pirHash } : {}),
                },
                Date.now(),
              ),
            );
          }
        }
        setReferenceLabel(live.source);
        if (live.geometryService?.meshes?.length) {
          bindServiceMeshes(
            live.geometryService.meshes,
            lengthMm,
            live.geometryService.label ??
              `OCCT WASM (STEP-tessellated) · ${live.geometryService.kernel ?? 'occt-wasm'}`,
          );
        } else {
          clearServiceMeshes(live.geometryServiceError ?? 'Geometry service unavailable');
        }
        setLiveStatus(`live:${live.source}:${live.pipelineHash.slice(0, 8)}`);
        // Prefetch Schema View so the schema tab is never empty after bootstrap.
        void (async () => {
          try {
            const body = await fetchModelSchema(created.model.modelId);
            const vm = enrichSchemaVm(parseSchemaViewPayload(body));
            if (!cancelled && vm) {
              setSchemaView(vm);
              setSchemaStatus(
                `${vm.kinds.length} kinds · ${vm.liveTypes.length} live types · ${vm.organisation.folderCount} folder(s)`,
              );
            }
          } catch {
            /* panel open will retry via refreshSchema */
          }
        })();
      } catch {
        if (cancelled) return;
        update((s) => appBootstrapFailure(s));
        setLiveStatus('offline-demo');
        setServiceError('Offline — geometry service not compared');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyFocusCommand = (raw: GraphFocusCommand | unknown) => {
    let cmd: GraphFocusCommand;
    try {
      cmd = parseGraphFocusCommand(raw);
    } catch {
      return;
    }
    if (!isReadOnlyFocusCommand(cmd)) return;
    const nav = applyGraphFocusCommand(cmd);
    if (nav.openLens) setGraphPaneOpen(true);
    setSemanticDepth(nav.depth);
    if (nav.enterPatternId) setEnteredPatternId(nav.enterPatternId);
    update((s) => {
      let next = s;
      if (nav.selectedSemanticId) {
        next = appSelect(next, nav.selectedSemanticId, 'ai', Date.now());
      }
      if (nav.highlightedIds.length > 0) {
        next = appFocusGeometry(next, nav.highlightedIds, 'ai', Date.now());
      }
      return next;
    });
  };

  const refreshSchema = async () => {
    try {
      const body = session.modelId
        ? await fetchModelSchema(session.modelId)
        : await fetchStaticSchema();
      const vm = enrichSchemaVm(parseSchemaViewPayload(body));
      setSchemaView(vm);
      if (!vm) {
        setSchemaStatus('Schema payload invalid');
        return;
      }
      const liveNote = vm.live
        ? `${vm.liveTypes.length} live types`
        : session.modelId
          ? 'static catalog (re-seed substrate for live types)'
          : 'static catalog';
      setSchemaStatus(
        `${vm.kinds.length} kinds · ${liveNote} · ${vm.organisation.folderCount} folder(s)`,
      );
    } catch {
      // Offline / API down — still show static kinds from semantic-core.
      const payload = buildSchemaPayload(
        session.explorerGraphObjects.map((o) => ({
          id: o.id,
          semanticType: o.semanticType,
          ...(o.tags !== undefined ? { tags: o.tags } : {}),
        })),
      );
      const vm = enrichSchemaVm(
        parseSchemaViewPayload({
          modelId: session.modelId ?? 'local',
          live: session.explorerGraphObjects.length > 0,
          ...payload,
        }),
      );
      setSchemaView(vm);
      setSchemaStatus(
        vm
          ? `${vm.kinds.length} kinds · local fallback · ${vm.liveTypes.length} types`
          : 'Schema fetch failed — is API on :3001?',
      );
    }
  };

  // Schema View: auto-load when schema center/panel opens (static catalog if no model yet).
  useEffect(() => {
    if (active === 'schema' || schemaMode) {
      void refreshSchema();
    }
  }, [active, schemaMode, session.modelId]);

  const doWhatIfFork = () => {
    const baselineHash = session.pipelineRun?.pipelineHash ?? session.headHash ?? 'hash:local';
    setWhatIf(
      forkWhatIf(whatIf, {
        baselineHash,
        baselineMeshes: session.g8.meshes,
      }),
    );
  };

  const doWhatIfRun = async () => {
    if (whatIfBusy || !session.modelId || !session.branchId) return;
    let next = whatIf.active
      ? whatIf
      : forkWhatIf(whatIf, {
          baselineHash: session.pipelineRun?.pipelineHash ?? session.headHash ?? 'hash:local',
          baselineMeshes: session.g8.meshes,
        });
    next = applyWhatIfDraft(next, {
      parameterId: 'param:d01:lengthMm',
      value: session.g8.lengthEdit.draftValue,
    });
    setWhatIf(next);
    setWhatIfBusy(true);
    try {
      const result = await runWhatIfPreview({
        modelId: session.modelId,
        branchId: session.branchId,
        baselineHash: next.baselineHash,
        draft: {
          parameterId: 'param:d01:lengthMm',
          value: session.g8.lengthEdit.draftValue,
        },
        yLimit: 3,
      });
      setWhatIf(
        bindWhatIfPreview(next, {
          previewHash: result.whatIf.previewHash,
          mode: result.whatIf.mode,
          ghostMeshes: result.meshes,
          regenMs: result.regenMs,
        }),
      );
      bindServiceMeshes(
        result.meshes,
        session.g8.lengthEdit.draftValue,
        `What-if ghost · ${result.regenMs.toFixed(0)}ms`,
      );
      setLiveStatus(
        `what-if:${result.whatIf.previewHash.slice(0, 18)}·${result.regenMs.toFixed(0)}ms`,
      );
    } catch (err) {
      setWhatIf({
        ...next,
        error: err instanceof Error ? err.message : 'What-if failed',
        ghostMeshes: [],
      });
    } finally {
      setWhatIfBusy(false);
    }
  };

  const previewPendingChangeSet = async (opts?: { readonly switchToGeometry?: boolean }) => {
    const pending = session.pendingChangeSet;
    if (!pending || !session.modelId) {
      setPreviewStatus('Preview needs modelId + pending ChangeSet');
      return;
    }
    const branchId = pending.branchId || session.aiBranchId || session.branchId;
    if (!branchId) {
      setPreviewStatus('Preview needs branchId');
      return;
    }
    setWhatIfBusy(true);
    setPreviewStatus('Regenerating preview…');
    try {
      let next = forkWhatIf(whatIf, {
        baselineHash: session.pipelineRun?.pipelineHash ?? session.headHash ?? 'hash:local',
        baselineMeshes: session.g8.meshes,
      });
      next = applyWhatIfDraft(next, { changeSetId: pending.changeSetId });
      setWhatIf(next);
      const result = await runWhatIfPreview({
        modelId: session.modelId,
        branchId,
        baselineHash: next.baselineHash,
        draft: {
          changeSet: {
            changeSetId: pending.changeSetId,
            branchId: pending.branchId,
            expectedHeadHash: pending.expectedHeadHash,
            transactionId: pending.transactionId,
            commands: pending.commands,
          },
        },
        yLimit: 3,
      });
      setWhatIf(
        bindWhatIfPreview(next, {
          previewHash: result.whatIf.previewHash,
          mode: result.whatIf.mode,
          ghostMeshes: result.meshes,
          regenMs: result.regenMs,
        }),
      );
      // Ghost preview replaces service layer; baseline follows draft length when present.
      const ghostLength =
        typeof (pending.commands[0]?.payload as { lengthMm?: number } | undefined)?.lengthMm ===
        'number'
          ? (pending.commands[0]!.payload as { lengthMm: number }).lengthMm
          : session.params.lengthMm;
      bindServiceMeshes(
        result.meshes,
        ghostLength,
        `What-if ghost · ${result.regenMs.toFixed(0)}ms`,
      );
      const status = `Preview ready · ghost ${result.whatIf.previewHash.slice(0, 18)} · ${result.regenMs.toFixed(0)}ms`;
      setPreviewStatus(status);
      setLiveStatus(`what-if:${result.whatIf.previewHash.slice(0, 18)}`);
      if (opts?.switchToGeometry) {
        setCenterWorkspace('geometry');
      } else if (schemaMode) {
        setPreviewStatus(`${status} · stay on Schema (use Preview & View to open Geometry)`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Preview failed';
      setPreviewStatus(message);
      setWhatIf((s) => ({ ...s, error: message }));
    } finally {
      setWhatIfBusy(false);
    }
  };

  const doWhatIfReject = () => {
    setPreviewStatus(null);
    const cleared = rejectWhatIf(whatIf);
    setWhatIf(cleared);
    clearServiceMeshes();
    setLiveStatus(`what-if:rejected·baseline ${cleared.baselineHash.slice(0, 12)}`);
  };

  const runAgent = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await runAiAgent({
        intent: aiIntent,
        mode: agentMode,
        ...(session.modelId ? { modelId: session.modelId } : {}),
      });
      update((s) => appBindAgentRun(s, result));
      if (result.status === 'failed') {
        setAiError(result.error ?? 'Agent run failed');
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Agent unreachable (is API on :3001?)');
    } finally {
      setAiBusy(false);
    }
  };

  const acceptRebuild = async () => {
    if (aiBusy) return;
    const pending = session.pendingChangeSet;
    if (!pending) {
      setAiError('No pending ChangeSet — Run agent first');
      return;
    }
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await acceptAiChangeSet(pending, {
        ...(session.modelId ? { modelId: session.modelId } : {}),
      });
      if (result.status !== 'applied') {
        update((s) =>
          appBindAcceptFailure(s, {
            ...(result.failureCode !== undefined ? { failureCode: result.failureCode } : {}),
            ...(result.reason !== undefined ? { reason: result.reason } : {}),
          }),
        );
        setAiError(result.failureCode ?? result.reason ?? 'Accept rejected');
        return;
      }
      // Organise-only: no mesh regen — refresh explorer from substrate graph.
      if (result.mode === 'organise' || (result.organisationApplied && !result.meshes)) {
        if (session.modelId) {
          try {
            const substrate = await fetchModelSubstrate(session.modelId);
            setSubstrateGraph(substrateToIndexedGraph(substrate.objects));
            setSubstrateEdges(substrate.dependencyEdges);
            update((s) => ({
              ...appSetExplorerGraphObjects(s, toExplorerGraphObjects(substrate.objects)),
              pendingChangeSet: null,
              whyLine: `Accepted organisation ChangeSet (${result.acceptedCommands ?? 0} op(s)) — hierarchy updated, geometry unchanged.`,
            }));
          } catch {
            update((s) => ({
              ...s,
              pendingChangeSet: null,
              whyLine: 'Accepted organisation ChangeSet — refresh explorer manually if tree stale.',
            }));
          }
        }
        setLiveStatus('accepted:organise');
        return;
      }
      if (!result.meshes || result.lengthMmOverride === undefined) {
        update((s) =>
          appBindAcceptFailure(s, {
            failureCode: 'MISSING_MESHES',
            reason: 'Geometry accept returned no meshes',
          }),
        );
        setAiError('Accept rejected — missing meshes');
        return;
      }
      let whyExplain: string | undefined;
      if (session.modelId) {
        try {
          const substrate = await fetchModelSubstrate(session.modelId);
          setSubstrateGraph(substrateToIndexedGraph(substrate.objects));
          setSubstrateEdges(substrate.dependencyEdges);
          update((s) => appSetExplorerGraphObjects(s, toExplorerGraphObjects(substrate.objects)));
          await refreshSchema();
          const targetId =
            pending.commands.find((c) => typeof c.targetId === 'string')?.targetId ??
            session.g8.selection.selectedSemanticId;
          if (targetId) {
            const explained = await explainObjectApi(session.modelId, {
              targetId,
              changedParameters: pending.commands
                .map((c) => c.targetId)
                .filter((id): id is string => typeof id === 'string'),
            });
            const packet = explained.explain as { explanation?: string; lineage?: string[] };
            whyExplain =
              typeof packet?.explanation === 'string'
                ? packet.explanation
                : Array.isArray(packet?.lineage)
                  ? packet.lineage.slice(0, 6).join(' → ')
                  : JSON.stringify(explained.explain).slice(0, 160);
          }
        } catch {
          whyExplain = undefined;
        }
      }
      const lengthMm = result.lengthMmOverride!;
      update((s) => ({
        ...appBindAcceptSuccess(
          s,
          {
            pipelineHash: result.pipelineHash ?? 'pipe:unknown',
            lengthMmOverride: lengthMm,
            ...(result.armWidthMm !== undefined ? { armWidthMm: result.armWidthMm } : {}),
            ...(result.structuralDepthMm !== undefined
              ? { structuralDepthMm: result.structuralDepthMm }
              : {}),
            ...(result.patternInstanceId !== undefined
              ? { patternInstanceId: result.patternInstanceId }
              : {}),
            meshes: result.meshes!,
            ...(whyExplain !== undefined ? { whyExplain } : {}),
          },
          Date.now(),
        ),
        ...(result.branchId !== undefined ? { aiBranchId: result.branchId } : {}),
        ...(result.newHeadHash !== undefined ? { headHash: result.newHeadHash } : {}),
      }));
      // Reference meshes come from accept; refresh OCCT layer to the same length (clear if offline).
      try {
        const live = await fetchD01DisplayMeshes(
          3,
          lengthMm,
          {
            armWidthMm: result.armWidthMm ?? session.params.armWidthMm,
            structuralDepthMm: result.structuralDepthMm ?? session.params.structuralDepthMm,
          },
          { compareEngines: true },
        );
        if (live.geometryService?.meshes?.length) {
          bindServiceMeshes(
            live.geometryService.meshes,
            lengthMm,
            live.geometryService.label ?? serviceLabel,
          );
        } else {
          clearServiceMeshes(live.geometryServiceError);
        }
      } catch {
        clearServiceMeshes();
      }
      setPreviewStatus(null);
      setWhatIf(createIdleWhatIf());
      setLiveStatus(`accepted:${(result.pipelineHash ?? '').slice(0, 8)}·L=${lengthMm}`);
      const branchForUndo = result.branchId ?? session.aiBranchId;
      if (branchForUndo) {
        try {
          const stack = await fetchUndoStack(branchForUndo);
          setCanUndo(stack.canUndo);
          setCanRedo(stack.canRedo);
        } catch {
          setCanUndo(false);
          setCanRedo(false);
        }
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Accept unreachable');
    } finally {
      setAiBusy(false);
    }
  };

  const refreshMeshesAfterHeadMove = async (lengthMm: number) => {
    if (!session.modelId) return;
    try {
      const live = await fetchD01DisplayMeshes(2, lengthMm);
      update((s) => appApplyLiveDisplayMeshes(s, live.meshes, Date.now(), lengthMm));
      const substrate = await fetchModelSubstrate(session.modelId);
      setSubstrateGraph(substrateToIndexedGraph(substrate.objects));
      setSubstrateEdges(substrate.dependencyEdges);
      await refreshSchema();
    } catch {
      /* best-effort */
    }
  };

  const runUndo = async () => {
    const branchId = session.aiBranchId ?? session.branchId;
    const expected = session.headHash;
    if (!branchId || !expected || session.pendingChangeSet) return;
    setAiBusy(true);
    try {
      const result = await postBranchUndo({ branchId, expectedHeadHash: expected });
      update((s) => appSetHead(s, result.newHeadHash));
      setCanUndo(result.canUndo);
      setCanRedo(result.canRedo);
      await refreshMeshesAfterHeadMove(session.params.lengthMm);
      update((s) => ({
        ...s,
        whyLine: `Undo applied — head ${result.newHeadHash.slice(0, 10)} (compensating cmds; history not rewritten).`,
      }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Undo failed');
    } finally {
      setAiBusy(false);
    }
  };

  const runRedo = async () => {
    const branchId = session.aiBranchId ?? session.branchId;
    const expected = session.headHash;
    if (!branchId || !expected || session.pendingChangeSet) return;
    setAiBusy(true);
    try {
      const result = await postBranchRedo({ branchId, expectedHeadHash: expected });
      update((s) => appSetHead(s, result.newHeadHash));
      setCanUndo(result.canUndo);
      setCanRedo(result.canRedo);
      await refreshMeshesAfterHeadMove(session.params.lengthMm);
      update((s) => ({
        ...s,
        whyLine: `Redo applied — head ${result.newHeadHash.slice(0, 10)}.`,
      }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Redo failed');
    } finally {
      setAiBusy(false);
    }
  };

  const statusChrome = buildTransactionStatusView({
    canUndo,
    canRedo,
    pendingChangeSet: Boolean(session.pendingChangeSet),
    fabricationRelease: session.publicationStatus === 'published',
  });

  const applyDisplayCompare = (
    live: Awaited<ReturnType<typeof fetchD01DisplayMeshes>>,
    lengthMm: number,
    armWidthMm: number,
    structuralDepthMm: number,
    commitExact: boolean,
  ) => {
    if (commitExact) {
      update((s) => appCommitExactLength(s, Date.now()));
    }
    update((s) =>
      appBindPipelineRun(appApplyLiveDisplayMeshes(s, live.meshes, Date.now(), lengthMm), {
        pipelineHash: live.pipelineHash,
        parameters: { lengthMm, armWidthMm, structuralDepthMm },
        ...(live.pirHash !== undefined ? { pirHash: live.pirHash } : {}),
      }),
    );
    setReferenceLabel(live.source);
    if (live.geometryService?.meshes?.length) {
      bindServiceMeshes(
        live.geometryService.meshes,
        lengthMm,
        live.geometryService.label ??
          `OCCT WASM (STEP-tessellated) · ${live.geometryService.kernel ?? 'occt-wasm'}`,
      );
    } else {
      clearServiceMeshes(
        live.geometryServiceError ??
          'Geometry service unavailable — start pnpm --filter @spds/geometry-occt start',
      );
    }
    setLiveStatus(`live:${live.source}:${live.pipelineHash.slice(0, 8)}·L=${lengthMm}`);
  };

  const exactRegen = async () => {
    const lengthMm = session.g8.lengthEdit.draftValue;
    const armWidthMm = session.params.armWidthMm;
    const structuralDepthMm = session.params.structuralDepthMm;
    // Best-effort: record undo via Accept, but never block parameter→mesh regen on txn failure.
    if (session.modelId && session.headHash) {
      const draft = draftUpdateParam(
        {
          modelId: session.modelId,
          branchId: session.aiBranchId ?? session.branchId,
          headHash: session.headHash,
          transactionId: session.lastTransactionId,
        },
        { paramId: 'param:d01:length', path: 'lengthMm', value: lengthMm },
      );
      if (draft.ok) {
        try {
          const result = await acceptAiChangeSet(draft.pending, {
            modelId: session.modelId,
          });
          if (
            result.status === 'applied' &&
            result.meshes &&
            result.lengthMmOverride !== undefined
          ) {
            update((s) => ({
              ...appBindAcceptSuccess(
                s,
                {
                  pipelineHash: result.pipelineHash ?? 'pipe:unknown',
                  lengthMmOverride: result.lengthMmOverride!,
                  ...(result.armWidthMm !== undefined ? { armWidthMm: result.armWidthMm } : {}),
                  ...(result.structuralDepthMm !== undefined
                    ? { structuralDepthMm: result.structuralDepthMm }
                    : {}),
                  meshes: result.meshes!,
                },
                Date.now(),
              ),
              ...(result.branchId !== undefined ? { aiBranchId: result.branchId } : {}),
              ...(result.newHeadHash !== undefined ? { headHash: result.newHeadHash } : {}),
            }));
            const branchForUndo = result.branchId ?? session.aiBranchId;
            if (branchForUndo) {
              try {
                const stack = await fetchUndoStack(branchForUndo);
                setCanUndo(stack.canUndo);
                setCanRedo(stack.canRedo);
              } catch {
                /* ignore */
              }
            }
          } else if (result.status !== 'applied') {
            setAiError(
              result.failureCode ?? result.reason ?? 'Accept skipped — regenerating meshes',
            );
          }
        } catch {
          /* fall through to display-mesh regen */
        }
      }
    }
    try {
      const live = await fetchD01DisplayMeshes(
        3,
        lengthMm,
        { armWidthMm, structuralDepthMm },
        { compareEngines: true },
      );
      applyDisplayCompare(live, lengthMm, armWidthMm, structuralDepthMm, true);
      try {
        const analysis = await fetchD01Analyze(2);
        update((s) => ({ ...s, analysis }));
      } catch {
        /* optional */
      }
    } catch {
      // Offline: still drive demo/reference meshes from the length slider commit.
      update((s) => appCommitExactLength(s, Date.now()));
      clearServiceMeshes();
      setLiveStatus('offline-demo');
    }
  };

  const retryGeometryService = async () => {
    if (retryGeometryBusy) return;
    setRetryGeometryBusy(true);
    const lengthMm = session.g8.lengthEdit.draftValue;
    const armWidthMm = session.params.armWidthMm;
    const structuralDepthMm = session.params.structuralDepthMm;
    try {
      const live = await fetchD01DisplayMeshes(
        3,
        lengthMm,
        { armWidthMm, structuralDepthMm },
        { compareEngines: true },
      );
      applyDisplayCompare(live, lengthMm, armWidthMm, structuralDepthMm, false);
    } catch {
      setServiceError('Retry failed — is geometry-occt on :7080 and API on :3001?');
    } finally {
      setRetryGeometryBusy(false);
    }
  };

  const doPublish = async () => {
    try {
      const pub = await publishD01(3);
      update((s) => ({
        ...appSetPublicationStatus(s, 'published'),
        fabArtifacts: pub.stored.map((a) => ({
          contentHash: a.contentHash,
          verified: a.verified,
        })),
      }));
      setLiveStatus(`published:${pub.pipelineHash.slice(0, 8)}`);
    } catch {
      setAiError('Publish failed');
    }
  };

  const doSnapshot = async () => {
    if (!session.modelId || !session.branchId) return;
    try {
      const snap = await createSnapshot(session.modelId, session.branchId, `snap-${Date.now()}`);
      update((s) => ({
        ...s,
        timeline: [
          ...s.timeline,
          {
            id: snap.snapshot.snapshotId,
            kind: 'snapshot',
            label: snap.snapshot.snapshotId,
            atMs: Date.now(),
          },
        ],
        liveBinding: { ...s.liveBinding, historyFromStore: true },
      }));
    } catch {
      setAiError('Snapshot failed');
    }
  };

  const doImport = async () => {
    try {
      const result = await importStep({
        filename: 'demo.step',
        headerText: 'ISO-10303-21;',
        bytes: 'DATA;',
      });
      const id = result.asset?.id ?? `import:${Date.now()}`;
      update((s) => ({
        ...appExplorerAddImport(s, id, `STEP ${id.slice(0, 12)}`),
        whyLine: `Imported STEP as reference-only (${result.asset?.sourceHash ?? 'hash'})`,
      }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const doRestore = () => {
    update((s) => ({
      ...s,
      timeline: [
        ...s.timeline,
        {
          id: `restore:${Date.now()}`,
          kind: 'restore',
          label: s.liveBinding.historyFromStore
            ? s.restore.label
            : `${s.restore.label} (local/demo only)`,
          atMs: Date.now(),
        },
      ],
      whyLine: s.liveBinding.historyFromStore
        ? s.restore.label
        : 'Restore labeled local/demo — remote head unchanged',
    }));
  };

  const doFork = () => {
    update((s) => appForkVariant(s, Date.now()));
  };

  const rejectPending = () => {
    update((s) => appRejectPendingChangeSet(s));
    setPreviewStatus(null);
    setWhatIf(
      createIdleWhatIf(session.pipelineRun?.pipelineHash ?? session.headHash ?? 'hash:none'),
    );
    setAiError(null);
  };

  const refreshAnalysis = async () => {
    try {
      const analysis = await fetchD01Analyze(2);
      update((s) => ({ ...s, analysis }));
    } catch {
      setAiError('Analysis refresh failed');
    }
  };

  return (
    <main className="spds-app" data-model={session.modelKind}>
      <header className="spds-header">
        <HelpTooltipScope>
          <div className="spds-brand">
            <h1 className="spds-brand-mark">
              <span className="sr-only">PLASMA</span>
              <PlasmaBrand />
            </h1>
          </div>

          <nav className="spds-tabs" aria-label="Panels">
            <div className="spds-panel-chrome" role="group" aria-label="Side panels">
              <HelpTooltip
                content={
                  explorerOpen ? HEADER_TOOLTIPS.explorerCollapse : HEADER_TOOLTIPS.explorerExpand
                }
              >
                <Button
                  type="button"
                  size="icon-sm"
                  variant={explorerOpen ? 'default' : 'outline'}
                  aria-pressed={explorerOpen}
                  aria-label={explorerOpen ? 'Collapse left panel' : 'Expand left panel'}
                  onClick={() => setExplorerOpen((open) => !open)}
                >
                  <PanelLeft />
                </Button>
              </HelpTooltip>
              <HelpTooltip
                content={
                  rightPaneOpen ? HEADER_TOOLTIPS.rightCollapse : HEADER_TOOLTIPS.rightExpand
                }
              >
                <Button
                  type="button"
                  size="icon-sm"
                  variant={rightPaneOpen ? 'default' : 'outline'}
                  aria-pressed={rightPaneOpen}
                  aria-label={rightPaneOpen ? 'Collapse right panel' : 'Expand right panel'}
                  onClick={() => setRightPaneOpen((open) => !open)}
                >
                  <PanelRight />
                </Button>
              </HelpTooltip>
              <ModelMenu
                modelKind={session.modelKind}
                publicationStatus={session.publicationStatus}
                onModelKindChange={(kind) => update((s) => appSwitchModelKind(s, kind, Date.now()))}
                onSelectCandidate={() => update((s) => appSetPublicationStatus(s, 'candidate'))}
                onSelectPublished={() => {
                  if (session.publicationStatus === 'published') return;
                  void doPublish();
                }}
              />
            </div>
          </nav>

          <div className="spds-header-actions">
            <div className="spds-center-mode" role="group" aria-label="Center workspace">
              <HelpTooltip content={HEADER_TOOLTIPS.geometry}>
                <Button
                  type="button"
                  size="sm"
                  variant={centerWorkspace === 'geometry' ? 'default' : 'outline'}
                  aria-pressed={centerWorkspace === 'geometry'}
                  onClick={() => setCenterWorkspace('geometry')}
                >
                  Geometry
                </Button>
              </HelpTooltip>
              <HelpTooltip content={HEADER_TOOLTIPS.schema}>
                <Button
                  type="button"
                  size="sm"
                  variant={centerWorkspace === 'schema' ? 'default' : 'outline'}
                  aria-pressed={centerWorkspace === 'schema'}
                  onClick={() => {
                    setCenterWorkspace('schema');
                    setRightPaneOpen(true);
                    update((s) => appSetPanel(s, 'schema'));
                  }}
                >
                  Schema
                </Button>
              </HelpTooltip>
            </div>
            <div className="spds-hud-toggles" role="toolbar" aria-label="Viewport HUDs">
              <HelpTooltip content={HEADER_TOOLTIPS.measure}>
                <Button
                  type="button"
                  size="icon-sm"
                  variant={measureHudOpen ? 'default' : 'outline'}
                  aria-pressed={measureHudOpen}
                  aria-label={measureHudOpen ? 'Hide measure tools' : 'Show measure tools'}
                  onClick={() => setMeasureHudVisible(!measureHudOpen)}
                >
                  <Ruler />
                </Button>
              </HelpTooltip>
              <HelpTooltip content={HEADER_TOOLTIPS.engines}>
                <Button
                  type="button"
                  size="icon-sm"
                  variant={engineHudOpen ? 'default' : 'outline'}
                  aria-pressed={engineHudOpen}
                  aria-label={engineHudOpen ? 'Hide geometry engines' : 'Show geometry engines'}
                  onClick={() => setEngineHudOpen((open) => !open)}
                >
                  <Boxes />
                </Button>
              </HelpTooltip>
              <HelpTooltip content={HEADER_TOOLTIPS.causal} disabled={schemaMode}>
                <span className={schemaMode ? 'inline-flex opacity-50' : 'inline-flex'}>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={graphPaneOpen && !schemaMode ? 'default' : 'outline'}
                    aria-pressed={graphPaneOpen && !schemaMode}
                    aria-label={graphPaneOpen ? 'Hide causal lens' : 'Show causal lens'}
                    disabled={schemaMode}
                    onClick={() => {
                      if (schemaMode) return;
                      setGraphPaneOpen((open) => !open);
                    }}
                  >
                    <Network />
                  </Button>
                </span>
              </HelpTooltip>
              <HelpTooltip
                content={HEADER_TOOLTIPS.explain}
                disabled={!selected || !session.modelId}
              >
                <span
                  className={
                    !selected || !session.modelId ? 'inline-flex opacity-50' : 'inline-flex'
                  }
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!selected || !session.modelId}
                    onClick={() => void explainSelection()}
                  >
                    Explain
                  </Button>
                </span>
              </HelpTooltip>
              <HelpTooltip content={HEADER_TOOLTIPS.undo}>
                <span
                  className={
                    !canUndo ||
                    Boolean(session.pendingChangeSet) ||
                    aiBusy ||
                    !(session.aiBranchId ?? session.branchId) ||
                    !session.headHash
                      ? 'inline-flex opacity-50'
                      : 'inline-flex'
                  }
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label="Undo last committed change"
                    disabled={
                      !canUndo ||
                      Boolean(session.pendingChangeSet) ||
                      aiBusy ||
                      !(session.aiBranchId ?? session.branchId) ||
                      !session.headHash
                    }
                    onClick={() => void runUndo()}
                  >
                    Undo
                  </Button>
                </span>
              </HelpTooltip>
              <HelpTooltip content={HEADER_TOOLTIPS.redo}>
                <span
                  className={
                    !canRedo ||
                    Boolean(session.pendingChangeSet) ||
                    aiBusy ||
                    !(session.aiBranchId ?? session.branchId) ||
                    !session.headHash
                      ? 'inline-flex opacity-50'
                      : 'inline-flex'
                  }
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label="Redo last undone change"
                    disabled={
                      !canRedo ||
                      Boolean(session.pendingChangeSet) ||
                      aiBusy ||
                      !(session.aiBranchId ?? session.branchId) ||
                      !session.headHash
                    }
                    onClick={() => void runRedo()}
                  >
                    Redo
                  </Button>
                </span>
              </HelpTooltip>
            </div>
            <Popover open={rightPaneMenuOpen} onOpenChange={setRightPaneMenuOpen}>
              <HelpTooltip content={HEADER_TOOLTIPS.rightPane} disabled={rightPaneMenuOpen}>
                <span className="inline-flex min-w-0">
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="spds-right-pane-select"
                      aria-label={`Right panel view: ${rightPaneLabel(rightPaneKind)}`}
                    >
                      <span>{rightPaneLabel(rightPaneKind)}</span>
                      <ChevronDown className="size-3.5 opacity-70" />
                    </Button>
                  </PopoverTrigger>
                </span>
              </HelpTooltip>
              <PopoverContent align="end" className="w-56 p-1.5">
                <HelpTooltipScope>
                  <div
                    className="flex flex-col gap-0.5"
                    role="listbox"
                    aria-label="Right panel views"
                  >
                    {RIGHT_PANE_KINDS.map((kind) => (
                      <HelpTooltip key={kind} content={RIGHT_PANE_TOOLTIPS[kind]} side="left">
                        <Button
                          type="button"
                          size="sm"
                          variant={rightPaneKind === kind ? 'default' : 'ghost'}
                          className="justify-start"
                          role="option"
                          aria-selected={rightPaneKind === kind}
                          onClick={() => selectRightPane(kind)}
                        >
                          {rightPaneLabel(kind)}
                        </Button>
                      </HelpTooltip>
                    ))}
                  </div>
                </HelpTooltipScope>
              </PopoverContent>
            </Popover>
            <SettingsMenu
              dark={dark}
              onDarkChange={setDark}
              viewportBackgroundHex={
                viewportBackgroundHex ?? viewportBackgroundCssHex(session.g8.chrome, dark)
              }
              viewportBackgroundCustom={viewportBackgroundHex !== null}
              onViewportBackgroundChange={(hex) => {
                const mode = dark ? 'dark' : 'light';
                if (mode === 'dark') setViewportBackgroundDark(hex);
                else setViewportBackgroundLight(hex);
                persistViewportBackground(mode, hex);
                scheduleUiPreferencesPush({
                  theme: mode,
                  measureLibrary,
                  workspace: buildWorkspaceSnapshot(),
                });
              }}
              onViewportBackgroundReset={() => {
                const mode = dark ? 'dark' : 'light';
                if (mode === 'dark') setViewportBackgroundDark(null);
                else setViewportBackgroundLight(null);
                persistViewportBackground(mode, null);
                scheduleUiPreferencesPush({
                  theme: mode,
                  measureLibrary,
                  workspace: buildWorkspaceSnapshot(),
                });
              }}
            />
          </div>
        </HelpTooltipScope>
      </header>

      <div
        className={[
          'spds-shell',
          explorerOpen ? '' : 'is-explorer-collapsed',
          rightPaneOpen ? '' : 'is-inspector-collapsed',
        ]
          .filter(Boolean)
          .join(' ')}
        style={
          {
            '--spds-explorer-w': `${panelWidths.explorerPx}px`,
            '--spds-inspector-w': `${panelWidths.inspectorPx}px`,
          } as CSSProperties
        }
      >
        {explorerOpen ? (
          <div className="spds-shell-side spds-shell-side--explorer">
            <ExplorerPanel
              nodes={session.explorerTree}
              selectedSemanticId={selected}
              expandedIds={
                workspacePrefs.shell.explorerExpandedIds.length > 0
                  ? workspacePrefs.shell.explorerExpandedIds
                  : session.explorerTree.map((n) => n.id)
              }
              onExpandedIdsChange={(ids) => {
                const next = buildWorkspaceSnapshot({ explorerExpandedIds: ids });
                pushWorkspace(next);
              }}
              onSelect={(nodeId) => update((s) => appExplorerSelect(s, nodeId, Date.now()))}
              onCreate={(parentId) => update((s) => appExplorerCreate(s, { parentId }, Date.now()))}
              onCreateFolder={(parentId) => {
                const modelId = session.modelId;
                if (!modelId) {
                  update((s) =>
                    appExplorerCreate(s, { parentId, kind: 'folder', label: 'Folder' }, Date.now()),
                  );
                  return;
                }
                void (async () => {
                  try {
                    const semanticParent = explorerParentToSemanticParent(parentId, modelId);
                    const res = await createModelGroup(modelId, {
                      label: 'Folder',
                      parentId: semanticParent,
                    });
                    setSubstrateGraph(substrateToIndexedGraph(res.objects));
                    update((s) =>
                      appSetExplorerGraphObjects(s, toExplorerGraphObjects(res.objects)),
                    );
                  } catch {
                    update((s) =>
                      appExplorerCreate(
                        s,
                        { parentId, kind: 'folder', label: 'Folder' },
                        Date.now(),
                      ),
                    );
                  }
                })();
              }}
              onRename={(nodeId, label) => update((s) => appExplorerRename(s, nodeId, label))}
              onDelete={(nodeId) => update((s) => appExplorerDelete(s, nodeId, Date.now()))}
              onReorder={(nodeId, delta) => update((s) => appExplorerReorder(s, nodeId, delta))}
              onReparent={(nodeId, parentId) => {
                const modelId = session.modelId;
                if (!modelId) {
                  update((s) => appExplorerReparent(s, nodeId, parentId));
                  return;
                }
                void (async () => {
                  try {
                    const res = await reparentModelGroup(modelId, {
                      nodeId,
                      newParentId: explorerParentToSemanticParent(parentId, modelId),
                    });
                    setSubstrateGraph(substrateToIndexedGraph(res.objects));
                    update((s) =>
                      appSetExplorerGraphObjects(s, toExplorerGraphObjects(res.objects)),
                    );
                  } catch {
                    update((s) => appExplorerReparent(s, nodeId, parentId));
                  }
                })();
              }}
            />
            <PanelResizeHandle
              edge="end"
              widthPx={panelWidths.explorerPx}
              minPx={PANEL_WIDTH_LIMITS.explorerPx.min}
              maxPx={PANEL_WIDTH_LIMITS.explorerPx.max}
              ariaLabel="Resize explorer panel"
              onWidthChange={(px) => setPanelWidth('explorerPx', px)}
            />
          </div>
        ) : null}

        <div
          className={[
            'spds-center-stack',
            graphPaneOpen && !schemaMode ? 'is-graph-open' : '',
            schemaMode ? 'is-schema-mode' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={
            graphPaneOpen && !schemaMode
              ? ({ '--spds-causal-w': `${panelWidths.causalPx}px` } as CSSProperties)
              : undefined
          }
        >
          <section
            className={['spds-viewport-panel', schemaMode ? 'is-center-hidden' : '']
              .filter(Boolean)
              .join(' ')}
            aria-hidden={schemaMode}
          >
            <MeasureHud
              open={measureHudOpen && !schemaMode}
              onOpenChange={setMeasureHudVisible}
              position={workspacePrefs.huds.measurePosition}
              onPositionChange={(position) => {
                pushWorkspace(buildWorkspaceSnapshot({ measurePosition: position }));
              }}
              tool={measureTool}
              onToolChange={setMeasureTool}
              library={measureLibrary}
              onSelect={(id) => setMeasureLibrary((lib) => selectMeasurement(lib, id))}
              onRename={(id, name) => setMeasureLibrary((lib) => renameMeasurement(lib, id, name))}
              onDelete={(id) => setMeasureLibrary((lib) => deleteMeasurement(lib, id))}
              onClearAll={() => setMeasureLibrary((lib) => clearMeasurements(lib))}
              onToggleOverlays={(visible) =>
                setMeasureLibrary((lib) => setOverlaysVisible(lib, visible))
              }
              onToggleListCollapsed={(collapsed) =>
                setMeasureLibrary((lib) => setListCollapsed(lib, collapsed))
              }
            />
            {prefsReady && shouldMountViewport(active) ? (
              <ViewportCanvas
                meshes={session.g8.meshes}
                geometryServiceMeshes={serviceMeshes}
                referenceSourceLabel={referenceLabel}
                geometryServiceLabel={serviceLabel}
                {...(serviceError !== undefined ? { geometryServiceError: serviceError } : {})}
                chrome={session.g8.chrome}
                backgroundHex={viewportBackgroundHex}
                selectedSemanticId={selected}
                highlightedIds={viewportHighlights}
                onPickSemantic={(id) => update((s) => appSelect(s, id, 'viewport', Date.now()))}
                onRetryGeometryService={() => void retryGeometryService()}
                retryGeometryBusy={retryGeometryBusy}
                engineHudOpen={engineHudOpen && !schemaMode}
                onEngineHudOpenChange={setEngineHudOpen}
                engineHudPosition={workspacePrefs.huds.enginePosition}
                onEngineHudPositionChange={(position) => {
                  pushWorkspace(buildWorkspaceSnapshot({ enginePosition: position }));
                }}
                onViewportPrefsChanged={() =>
                  scheduleUiPreferencesPush({
                    theme: dark ? 'dark' : 'light',
                    measureLibrary,
                    workspace: buildWorkspaceSnapshot(),
                  })
                }
                measureMode={measureTool.mode}
                measureSnap={measureTool.snap}
                onMeasurePick={(pick, extents) => void onMeasurePick(pick, extents)}
                fieldOverlay={activeFieldOverlay}
                constraintTints={constraintTints}
                measureOverlays={(() => {
                  const overlays = [];
                  const draft = buildDraftMeasureOverlay(measureTool);
                  if (draft) overlays.push(draft);
                  if (measureLibrary.overlaysVisible) {
                    for (const item of measureLibrary.items) {
                      const overlay = buildSavedMeasureOverlay(
                        item,
                        measureLibrary.selectedId === item.id,
                      );
                      if (overlay) overlays.push(overlay);
                    }
                  }
                  return overlays;
                })()}
              />
            ) : null}
          </section>
          {schemaMode ? (
            <SchemaWorkspace
              schema={schemaView}
              selectedSemanticId={selectedSchemaId}
              provisionalSemanticIds={provisionalSchemaIds}
              statusLine={schemaStatus}
              onSelectSchemaNode={(id) => {
                setSelectedSchemaId(id);
                if (id) {
                  setRightPaneOpen(true);
                  update((s) => appSetPanel(s, 'schema'));
                }
              }}
            />
          ) : null}
          {graphPaneOpen && !schemaMode ? (
            <div className="spds-shell-side spds-shell-side--causal">
              <PanelResizeHandle
                edge="start"
                widthPx={panelWidths.causalPx}
                minPx={PANEL_WIDTH_LIMITS.causalPx.min}
                maxPx={PANEL_WIDTH_LIMITS.causalPx.max}
                ariaLabel="Resize causal lens panel"
                onWidthChange={(px) => setPanelWidth('causalPx', px)}
              />
              <CausalGraphPane
                open
                projection={causalProjection}
                selectedSemanticId={selected}
                onSelectSemantic={(id) => update((s) => appSelect(s, id, 'graph', Date.now()))}
                emptyMessage={causalEmptyMessage}
                depth={semanticDepth}
                onDepthChange={setSemanticDepth}
                lenses={graphLenses}
                onToggleLens={(lens) => {
                  setGraphLenses((prev) =>
                    prev.includes(lens) ? prev.filter((l) => l !== lens) : [...prev, lens],
                  );
                }}
                aggregateEnabled={aggregateEntities}
                onAggregateChange={setAggregateEntities}
                enteredPatternId={enteredPatternId}
                onEnterPattern={
                  selected?.startsWith('pattern:') ? () => setEnteredPatternId(selected) : undefined
                }
                onExitPattern={() => setEnteredPatternId(null)}
                sketchDraftActive={Boolean(sketchDraft)}
                onBeginSketch={() => {
                  const patternId =
                    enteredPatternId ??
                    (selected?.startsWith('pattern:') ? selected : 'pattern:d01:y-network');
                  const draft = beginSketchIntent({
                    sketchId: `sketch:draft:${Date.now()}`,
                    fieldId: 'field:d01:distance',
                    patternId,
                    cells: cellsFromGrid(16),
                    nowMs: Date.now(),
                  });
                  setSketchDraft(draft);
                  update((s) => appSelect(s, draft.fieldId, 'sketch', Date.now()));
                }}
                onCancelSketch={() => {
                  setSketchDraft(cancelSketchIntent(sketchDraft));
                }}
                onRetrySeed={
                  !substrateGraph || selected?.startsWith('y:demo:')
                    ? () => void seedLiveSubstrate()
                    : undefined
                }
              />
            </div>
          ) : null}
        </div>

        {rightPaneOpen ? (
          <div className="spds-shell-side spds-shell-side--inspector">
            <PanelResizeHandle
              edge="start"
              widthPx={panelWidths.inspectorPx}
              minPx={PANEL_WIDTH_LIMITS.inspectorPx.min}
              maxPx={PANEL_WIDTH_LIMITS.inspectorPx.max}
              ariaLabel="Resize inspector panel"
              onWidthChange={(px) => setPanelWidth('inspectorPx', px)}
            />
            <RightPane
              activePanel={active}
              session={session}
              liveStatus={`${statusChrome.label} · ${liveStatus}`}
              aiIntent={aiIntent}
              onAiIntentChange={setAiIntent}
              agentMode={agentMode}
              onAgentModeChange={setAgentMode}
              aiBusy={aiBusy}
              aiError={aiError}
              onPreviewLength={previewLengthDriven}
              onSetArmWidth={(mm) => update((s) => appSetParams(s, { armWidthMm: mm }))}
              onSetStructuralDepth={(mm) =>
                update((s) => appSetParams(s, { structuralDepthMm: mm }))
              }
              onExactRegen={() => void exactRegen()}
              onSelectPrimary={() =>
                update((s) => appSelect(s, appPrimarySemanticId(), 'inspector', Date.now()))
              }
              onSelectParameter={(semanticId) =>
                update((s) => appSelect(s, semanticId, 'inspector', Date.now()))
              }
              onSnapshot={() => void doSnapshot()}
              onImport={() => void doImport()}
              onOpenPanel={(panel) => {
                setRightPaneOpen(true);
                update((s) => appSetPanel(s, panel));
              }}
              onFocusGeometry={(ids) =>
                update((s) => appFocusGeometry(s, ids, 'inspector', Date.now()))
              }
              onNavigateIssue={(issueId) => update((s) => appNavigateIssue(s, issueId, Date.now()))}
              onRestore={doRestore}
              onFork={doFork}
              onRunAgent={() => void runAgent()}
              onAcceptRebuild={() => void acceptRebuild()}
              onRejectPending={rejectPending}
              onPreviewPending={() => void previewPendingChangeSet()}
              onPreviewPendingAndView={() =>
                void previewPendingChangeSet({ switchToGeometry: true })
              }
              pendingImpact={pendingImpact}
              pendingBia={pendingBia}
              previewStatus={previewStatus}
              onRefreshAnalysis={() => void refreshAnalysis()}
              whatIfActive={whatIf.active}
              {...(whatIfBusy
                ? { whatIfStatus: 'Regenerating preview…' }
                : whatIf.error
                  ? { whatIfStatus: whatIf.error }
                  : whatIf.previewHash
                    ? {
                        whatIfStatus: `Ghost · ${whatIf.previewHash.slice(0, 22)} · baseline ${whatIf.baselineHash.slice(0, 10)}`,
                      }
                    : whatIf.active
                      ? { whatIfStatus: 'Forked — adjust length, then Run preview' }
                      : {})}
              onWhatIfFork={doWhatIfFork}
              onWhatIfRun={() => void doWhatIfRun()}
              onWhatIfReject={doWhatIfReject}
              schemaView={schemaView}
              schemaStatus={schemaStatus}
              selectedSchemaId={selectedSchemaId}
              schemaDraftContext={{
                modelId: session.modelId,
                branchId: session.aiBranchId ?? session.branchId,
                headHash: session.headHash,
                transactionId: session.lastTransactionId,
              }}
              onRefreshSchema={() => void refreshSchema()}
              onSelectSchemaId={(semanticId) => {
                setSelectedSchemaId(semanticId);
                update((s) => appSelect(s, semanticId, 'inspector', Date.now()));
              }}
              onClearSchemaSelection={() => setSelectedSchemaId(null)}
              onSchemaDraftPending={(result) => {
                if (!result.ok) {
                  update((s) => ({
                    ...s,
                    whyLine: `Draft failed: ${result.code} — ${result.reason}`,
                  }));
                  return;
                }
                update((s) => appBindPendingDraft(s, result.pending));
              }}
              onGraphFocusCommand={(cmd) => applyFocusCommand(cmd)}
              measureTool={measureTool}
              measureActiveLabel={
                measureTool.active ? formatMeasureQuantity(measureTool.active) : null
              }
              measureCompareLabel={
                measureTool.compare ? formatCompareRow(measureTool.compare) : null
              }
            />
          </div>
        ) : null}
      </div>
      {/* Keep indicative analysis helper referenced for product UX smoke. */}
      <span className="sr-only">{appAnalysisIndicative(session) ? 'indicative' : ''}</span>
    </main>
  );
}
