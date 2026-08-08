/**
 * G8 integrated session — shell + selection + parameter edit → exact regen.
 * Browser-safe: uses demo meshes, not geometry-contracts kernel.
 */

import {
  beginPreview,
  commitExact,
  createParameterEditState,
  markValidated,
  type ParameterEditState,
} from './parameter-editing.js';
import {
  createSelectionStore,
  preserveSelectionAfterRegen,
  selectSemantic,
  selectionInSync,
  type SelectionSource,
  type SelectionStore,
} from './selection-sync.js';
import {
  createShellState,
  setActivePanel,
  type PanelId,
  type ShellState,
} from './shell.js';
import {
  assertSemanticAnchors,
  measureDistance,
  overlayFromSemanticDimension,
  type MeasurementOverlay,
  type MeasurementResult,
} from './measurement-overlays.js';
import type { DisplayMeshInput } from './mesh-bridge.js';
import type { PublicationChrome } from './viewport.js';
import {
  DEMO_Y_SEMANTIC_ID,
  demoDisplayMeshes,
  demoExplorerIds,
  demoLengthAnchors,
} from './ui/demo-meshes.js';

export interface G8Session {
  readonly shell: ShellState;
  readonly selection: SelectionStore;
  readonly lengthEdit: ParameterEditState;
  readonly chrome: PublicationChrome;
  readonly meshes: readonly DisplayMeshInput[];
  readonly measurement: MeasurementResult | null;
  readonly overlay: MeasurementOverlay | null;
  readonly regenGeneration: number;
}

export function createG8Session(_nowMs = 0): G8Session {
  const lengthEdit = createParameterEditState({
    id: 'p:d01:length',
    name: 'Y length',
    value: 200,
    unit: 'mm',
    min: 50,
    max: 500,
  });
  const meshes = demoDisplayMeshes({ lengthMm: lengthEdit.spec.value });
  const anchors = demoLengthAnchors(lengthEdit.spec.value);
  const measurement = measureDistance(anchors.a, anchors.b);
  const overlay = overlayFromSemanticDimension({
    id: 'dim:demo:length',
    quantity: measurement.quantity,
    unit: measurement.unit,
    kind: measurement.kind,
    anchorPathA: anchors.a.path,
    anchorPathB: anchors.b.path,
  });
  assertSemanticAnchors(overlay);

  return {
    shell: createShellState({
      projectId: 'proj:d01',
      modelId: 'model:d01',
      branchId: 'branch:main',
      branchName: 'main',
    }),
    selection: createSelectionStore(),
    lengthEdit,
    chrome: 'candidate',
    meshes,
    measurement,
    overlay,
    regenGeneration: 0,
  };
}

export function g8Select(session: G8Session, semanticId: string | null, source: SelectionSource, nowMs: number): G8Session {
  return { ...session, selection: selectSemantic(session.selection, semanticId, source, nowMs) };
}

export function g8SetPanel(session: G8Session, panel: PanelId): G8Session {
  return { ...session, shell: setActivePanel(session.shell, panel) };
}

export function g8SetChrome(session: G8Session, chrome: PublicationChrome): G8Session {
  return { ...session, chrome };
}

/** Preview drag — approximate mesh from draft value; selection unchanged. */
export function g8PreviewLength(session: G8Session, draftMm: number): G8Session {
  const lengthEdit = beginPreview(session.lengthEdit, draftMm);
  if (lengthEdit.mode === 'domain-error') {
    return { ...session, lengthEdit };
  }
  const meshes = demoDisplayMeshes({ lengthMm: lengthEdit.draftValue });
  return { ...session, lengthEdit, meshes };
}

/**
 * Exact regen replaces preview meshes. Surviving semantic ids keep selection (G8 gate).
 */
export function g8CommitExactLength(session: G8Session, nowMs: number): G8Session {
  let lengthEdit = commitExact(session.lengthEdit);
  if (lengthEdit.mode === 'domain-error') {
    return { ...session, lengthEdit };
  }
  lengthEdit = markValidated(lengthEdit);
  const meshes = demoDisplayMeshes({ lengthMm: lengthEdit.spec.value });
  const surviving = new Set(meshes.map((m) => m.semanticOwner));
  const selection = preserveSelectionAfterRegen(session.selection, surviving, nowMs);
  const anchors = demoLengthAnchors(lengthEdit.spec.value);
  const measurement = measureDistance(anchors.a, anchors.b);
  const overlay = overlayFromSemanticDimension({
    id: 'dim:demo:length',
    quantity: measurement.quantity,
    unit: measurement.unit,
    kind: measurement.kind,
    anchorPathA: anchors.a.path,
    anchorPathB: anchors.b.path,
  });
  return {
    ...session,
    lengthEdit,
    meshes,
    selection,
    measurement,
    overlay,
    regenGeneration: session.regenGeneration + 1,
  };
}

export function g8ExplorerIds(): readonly string[] {
  return demoExplorerIds();
}

export function g8PrimarySemanticId(): string {
  return DEMO_Y_SEMANTIC_ID;
}

export function g8SelectionSynced(session: G8Session): boolean {
  return selectionInSync(session.selection);
}
