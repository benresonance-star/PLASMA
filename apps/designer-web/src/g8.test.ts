import { describe, expect, it } from 'vitest';
import {
  createShellState,
  resizeShell,
  setActivePanel,
  switchBranch,
  switchModel,
} from './shell.js';
import {
  createViewportState,
  loadMeshes,
  pickMesh,
  publicationChromeLabel,
  setViewportChrome,
} from './viewport.js';
import {
  createSelectionStore,
  preserveSelectionAfterRegen,
  selectSemantic,
  selectionInSync,
} from './selection-sync.js';
import {
  beginPreview,
  commitExact,
  createParameterEditState,
  markValidated,
} from './parameter-editing.js';
import {
  assertSemanticAnchors,
  measureDistance,
  overlayFromSemanticDimension,
} from './measurement-overlays.js';

describe('G8.1 shell', () => {
  it('creates context and switches model/branch; collapses on mobile', () => {
    let shell = createShellState({
      projectId: 'proj:1',
      modelId: 'model:1',
      branchId: 'branch:main',
      branchName: 'main',
    });
    expect(shell.layoutMode).toBe('desktop');
    expect(shell.openPanels).toContain('viewport');

    shell = switchBranch(shell, 'branch:feature', 'feature');
    expect(shell.context.branchName).toBe('feature');

    shell = switchModel(shell, 'model:2', 'branch:model2:main', 'main');
    expect(shell.context.modelId).toBe('model:2');

    shell = resizeShell(shell, 400);
    expect(shell.layoutMode).toBe('mobile-tabs');
    expect(shell.openPanels).toEqual([shell.activePanel]);

    shell = setActivePanel(shell, 'inspector');
    expect(shell.openPanels).toEqual(['inspector']);
  });
});

describe('G8.2 viewport chrome', () => {
  it('exposes published vs candidate chrome and picks semantic ids', () => {
    let vp = createViewportState();
    expect(publicationChromeLabel(vp.chrome)).toBe('Published');
    vp = setViewportChrome(vp, 'candidate');
    expect(publicationChromeLabel(vp.chrome)).toContain('Candidate');

    vp = loadMeshes(vp, [
      { meshId: 'mesh:a', semanticId: 'Y:1', bufferHash: 'h1', triangleCount: 12 },
    ]);
    vp = pickMesh(vp, 'mesh:a');
    expect(vp.pickedSemanticId).toBe('Y:1');
  });
});

describe('G8.3 selection sync', () => {
  it('keeps viewport/explorer/inspector in sync and preserves surviving selection', () => {
    let store = createSelectionStore();
    store = selectSemantic(store, 'Y:1', 'viewport', 10);
    expect(selectionInSync(store)).toBe(true);

    store = selectSemantic(store, 'Y:2', 'explorer', 20);
    expect(store.selectedSemanticId).toBe('Y:2');
    expect(selectionInSync(store)).toBe(true);

    store = preserveSelectionAfterRegen(store, new Set(['Y:2', 'Y:3']), 30);
    expect(store.selectedSemanticId).toBe('Y:2');

    store = preserveSelectionAfterRegen(store, new Set(['Y:3']), 40);
    expect(store.selectedSemanticId).toBeNull();
  });
});

describe('G8.4 parameter editing', () => {
  it('preview then exact/validated; rejects out-of-domain', () => {
    let state = createParameterEditState({
      id: 'p:diameter',
      name: 'diameter',
      value: 10,
      unit: 'm',
      min: 1,
      max: 50,
    });
    state = beginPreview(state, 12);
    expect(state.mode).toBe('preview');
    state = commitExact(state);
    expect(state.mode).toBe('exact');
    expect(state.spec.value).toBe(12);
    state = markValidated(state);
    expect(state.mode).toBe('validated');

    state = beginPreview(state, 99);
    expect(state.mode).toBe('domain-error');
    state = commitExact(state);
    expect(state.mode).toBe('domain-error');
  });
});

describe('G8.5 measurement overlays', () => {
  it('measures between semantic anchors and rejects triangle-index paths', () => {
    const a = {
      path: 'semantic:vertex/A',
      semanticId: 'V:A',
      position: [0, 0, 0] as const,
    };
    const b = {
      path: 'semantic:vertex/B',
      semanticId: 'V:B',
      position: [3, 4, 0] as const,
    };
    const result = measureDistance(a, b);
    expect(result.quantity).toBe(5);
    expect(result.unit).toBe('mm');

    const overlay = overlayFromSemanticDimension({
      id: 'dim:1',
      quantity: 5,
      unit: 'mm',
      kind: 'distance',
      anchorPathA: 'semantic:vertex/A',
      anchorPathB: 'semantic:vertex/B',
    });
    expect(() => assertSemanticAnchors(overlay)).not.toThrow();

    const bad = overlayFromSemanticDimension({
      id: 'dim:bad',
      quantity: 1,
      unit: 'mm',
      kind: 'distance',
      anchorPathA: 'tri:12',
      anchorPathB: 'semantic:vertex/B',
    });
    expect(() => assertSemanticAnchors(bad)).toThrow(/semantic:/);
  });
});
