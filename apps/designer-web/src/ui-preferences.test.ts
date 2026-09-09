import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  THEME_KEY,
  UI_USER_ID_KEY,
  WORKSPACE_PREFS_KEY,
  applyLocalUiPreferences,
  collectLocalUiPreferences,
  createDefaultWorkspacePrefs,
  getOrCreateUiUserId,
  loadWorkspacePrefs,
  parseWorkspacePrefs,
} from './ui-preferences.js';
import { loadMeasureLibrary } from './measure-library.js';
import { clearViewportPrefs, loadViewportPrefs } from './viewport-prefs.js';

describe('ui preferences client helpers', () => {
  beforeEach(() => {
    clearViewportPrefs();
    // Vitest node env — stub localStorage for theme/user id.
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    });
    mem.clear();
  });

  it('creates a stable anon user id', () => {
    const a = getOrCreateUiUserId();
    const b = getOrCreateUiUserId();
    expect(a.startsWith('anon:')).toBe(true);
    expect(b).toBe(a);
    expect(localStorage.getItem(UI_USER_ID_KEY)).toBe(a);
  });

  it('applies payload into local cache', () => {
    applyLocalUiPreferences({
      theme: 'light',
      viewport: {
        engines: {
          reference: { visible: true, opacity: 0.27 },
          geometryService: { visible: true, opacity: 0.15 },
        },
        camera: { position: [1, 2, 3], target: [0, 0, 0] },
      },
      measureLibrary: {
        items: [],
        selectedId: null,
        overlaysVisible: true,
        listCollapsed: false,
      },
      workspace: createDefaultWorkspacePrefs({
        huds: {
          measureOpen: true,
          engineOpen: true,
          measurePosition: { x: 12, y: 34 },
          enginePosition: { x: 56, y: 78 },
        },
        shell: {
          activePanel: 'inspector',
          modelKind: 'f01',
          publicationStatus: 'published',
          selectedSemanticId: 'face:1',
          explorerExpandedIds: ['root', 'body'],
          panelWidths: { explorerPx: 300, inspectorPx: 320, causalPx: 400 },
        },
        measureTool: { lastMode: 'angle', snap: 'edge' },
      }),
    });
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(loadViewportPrefs().engines.geometryService.opacity).toBeCloseTo(0.15);
    expect(loadMeasureLibrary().overlaysVisible).toBe(true);
    const ws = loadWorkspacePrefs();
    expect(ws.huds.measureOpen).toBe(true);
    expect(ws.huds.measurePosition).toEqual({ x: 12, y: 34 });
    expect(ws.shell.activePanel).toBe('inspector');
    expect(ws.shell.modelKind).toBe('f01');
    expect(ws.shell.panelWidths).toEqual({
      explorerPx: 300,
      inspectorPx: 320,
      causalPx: 400,
    });
    expect(ws.measureTool.lastMode).toBe('angle');
    expect(localStorage.getItem(WORKSPACE_PREFS_KEY)).toBeTruthy();
    const collected = collectLocalUiPreferences({ theme: 'light' });
    expect(collected.theme).toBe('light');
    expect(collected.viewport?.engines.geometryService.opacity).toBeCloseTo(0.15);
    expect(collected.workspace?.shell.selectedSemanticId).toBe('face:1');
  });

  it('parses workspace prefs with defaults for bad values', () => {
    const t0 = performance.now();
    const parsed = parseWorkspacePrefs(
      JSON.stringify({
        huds: { measureOpen: 1, measurePosition: { x: 'nope', y: 2 } },
        shell: { activePanel: 'not-a-panel', modelKind: 'z99', explorerExpandedIds: 'x' },
        measureTool: { lastMode: 'teleport', snap: 'magic' },
        centerWorkspace: 'not-a-mode',
      }),
    );
    expect(performance.now() - t0).toBeLessThan(1);
    expect(parsed).not.toBeNull();
    expect(parsed!.huds.measureOpen).toBe(true);
    expect(parsed!.huds.measurePosition).toBeNull();
    expect(parsed!.shell.activePanel).toBe('viewport');
    expect(parsed!.shell.modelKind).toBe('d01');
    expect(parsed!.shell.explorerExpandedIds).toEqual([]);
    expect(parsed!.shell.panelWidths).toEqual({
      explorerPx: 272,
      inspectorPx: 288,
      causalPx: 352,
    });
    expect(parsed!.measureTool.lastMode).toBe('distance');
    expect(parsed!.measureTool.snap).toBe('vertex');
    expect(parsed!.centerWorkspace).toBe('geometry');
  });

  it('round-trips centerWorkspace schema', () => {
    const ws = createDefaultWorkspacePrefs({ centerWorkspace: 'schema' });
    expect(ws.centerWorkspace).toBe('schema');
    const again = parseWorkspacePrefs(JSON.stringify(ws));
    expect(again?.centerWorkspace).toBe('schema');
  });
});
