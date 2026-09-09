/**
 * G8 integrated session — shell + selection + parameter edit → exact regen.
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
  focusGeometry,
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
import { scaleArmMeshes } from './ui/mesh-length.js';

export interface G8Session {
  readonly shell: ShellState;
  readonly selection: SelectionStore;
  readonly lengthEdit: ParameterEditState;
  readonly chrome: PublicationChrome;
  readonly meshes: readonly DisplayMeshInput[];
  /** When live, preview scales baseline meshes instead of swapping to demo box. */
  readonly meshSource: 'demo' | 'live';
  readonly liveBaselineMeshes: readonly DisplayMeshInput[] | null;
  readonly liveBaselineLengthMm: number | null;
  readonly measurement: MeasurementResult | null;
  readonly overlay: MeasurementOverlay | null;
  readonly regenGeneration: number;
}

function measurementForLength(lengthMm: number): {
  readonly measurement: MeasurementResult;
  readonly overlay: MeasurementOverlay;
} {
  const anchors = demoLengthAnchors(lengthMm);
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
  return { measurement, overlay };
}

export function createG8Session(_nowMs = 0): G8Session {
  const lengthEdit = createParameterEditState({
    id: 'p:d01:length',
    name: 'Y length',
    value: 2300,
    unit: 'mm',
    min: 500,
    max: 4000,
  });
  const meshes = demoDisplayMeshes({ lengthMm: lengthEdit.spec.value });
  const { measurement, overlay } = measurementForLength(lengthEdit.spec.value);

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
    meshSource: 'demo',
    liveBaselineMeshes: null,
    liveBaselineLengthMm: null,
    measurement,
    overlay,
    regenGeneration: 0,
  };
}

export function g8Select(session: G8Session, semanticId: string | null, source: SelectionSource, nowMs: number): G8Session {
  return { ...session, selection: selectSemantic(session.selection, semanticId, source, nowMs) };
}

export function g8FocusGeometry(
  session: G8Session,
  semanticIds: readonly string[],
  source: SelectionSource,
  nowMs: number,
): G8Session {
  return { ...session, selection: focusGeometry(session.selection, semanticIds, source, nowMs) };
}

export function g8SetPanel(session: G8Session, panel: PanelId): G8Session {
  return { ...session, shell: setActivePanel(session.shell, panel) };
}

export function g8SetChrome(session: G8Session, chrome: PublicationChrome): G8Session {
  return { ...session, chrome };
}

/** Preview drag — live meshes scale from baseline; demo uses single solid. */
export function g8PreviewLength(session: G8Session, draftMm: number): G8Session {
  const lengthEdit = beginPreview(session.lengthEdit, draftMm);
  if (lengthEdit.mode === 'domain-error') {
    return { ...session, lengthEdit };
  }
  const { measurement, overlay } = measurementForLength(lengthEdit.draftValue);
  if (
    session.meshSource === 'live' &&
    session.liveBaselineMeshes &&
    session.liveBaselineLengthMm &&
    session.liveBaselineLengthMm > 0
  ) {
    const factor = lengthEdit.draftValue / session.liveBaselineLengthMm;
    return {
      ...session,
      lengthEdit,
      meshes: scaleArmMeshes(session.liveBaselineMeshes, factor),
      measurement,
      overlay,
    };
  }
  return {
    ...session,
    lengthEdit,
    meshes: demoDisplayMeshes({ lengthMm: lengthEdit.draftValue }),
    meshSource: 'demo',
    liveBaselineMeshes: null,
    liveBaselineLengthMm: null,
    measurement,
    overlay,
  };
}

/**
 * Exact regen commits length. Keeps live meshes when already live (API refresh follows).
 */
export function g8CommitExactLength(session: G8Session, nowMs: number): G8Session {
  let lengthEdit = commitExact(session.lengthEdit);
  if (lengthEdit.mode === 'domain-error') {
    return { ...session, lengthEdit };
  }
  lengthEdit = markValidated(lengthEdit);
  const { measurement, overlay } = measurementForLength(lengthEdit.spec.value);

  if (session.meshSource === 'live' && session.liveBaselineMeshes && session.liveBaselineLengthMm) {
    const factor = lengthEdit.spec.value / session.liveBaselineLengthMm;
    const meshes = scaleArmMeshes(session.liveBaselineMeshes, factor);
    const surviving = new Set(meshes.map((m) => m.semanticOwner));
    return {
      ...session,
      lengthEdit,
      meshes,
      selection: preserveSelectionAfterRegen(session.selection, surviving, nowMs),
      measurement,
      overlay,
      regenGeneration: session.regenGeneration + 1,
    };
  }

  const meshes = demoDisplayMeshes({ lengthMm: lengthEdit.spec.value });
  const surviving = new Set(meshes.map((m) => m.semanticOwner));
  return {
    ...session,
    lengthEdit,
    meshes,
    meshSource: 'demo',
    liveBaselineMeshes: null,
    liveBaselineLengthMm: null,
    selection: preserveSelectionAfterRegen(session.selection, surviving, nowMs),
    measurement,
    overlay,
    regenGeneration: session.regenGeneration + 1,
  };
}

/** Bind live D01 tessellation as the authoritative display for length preview/regen. */
export function g8ApplyLiveMeshes(
  session: G8Session,
  meshes: readonly DisplayMeshInput[],
  lengthMm: number,
  nowMs: number,
): G8Session {
  const clamped = Math.min(Math.max(lengthMm, session.lengthEdit.spec.min), session.lengthEdit.spec.max);
  let lengthEdit = beginPreview(session.lengthEdit, clamped);
  lengthEdit = markValidated(commitExact(lengthEdit));
  const surviving = new Set(meshes.map((m) => m.semanticOwner));
  const { measurement, overlay } = measurementForLength(clamped);
  let selection = preserveSelectionAfterRegen(session.selection, surviving, nowMs);
  // Demo ids never survive live D01 owners — focus the first generated component.
  if (!selection.selectedSemanticId && meshes[0]) {
    selection = selectSemantic(selection, meshes[0].semanticOwner, 'viewport', nowMs);
  }
  return {
    ...session,
    meshes,
    meshSource: 'live',
    liveBaselineMeshes: meshes,
    liveBaselineLengthMm: clamped,
    selection,
    lengthEdit,
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
