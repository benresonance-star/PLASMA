import type { EngineLayerState } from './ui/ViewportEngineCompare.js';

export const VIEWPORT_PREFS_KEY = 'spds-viewport-prefs';

export interface PersistedViewportCamera {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export interface ViewportPrefs {
  readonly engines: {
    readonly reference: EngineLayerState;
    readonly geometryService: EngineLayerState;
  };
  readonly camera: PersistedViewportCamera | null;
  /** Custom dark-mode viewport clear colour (`#rrggbb`); null keeps theme/chrome defaults. */
  readonly backgroundHexDark: string | null;
  /** Custom light-mode viewport clear colour (`#rrggbb`); null keeps theme/chrome defaults. */
  readonly backgroundHexLight: string | null;
}

const DEFAULT_ENGINES: ViewportPrefs['engines'] = {
  reference: { visible: true, opacity: 1 },
  geometryService: { visible: true, opacity: 0.35 },
};

function asBackgroundHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return null;
  return withHash.toLowerCase();
}

export function createDefaultViewportPrefs(
  partial?: Partial<ViewportPrefs>,
): ViewportPrefs {
  return {
    camera: partial?.camera ?? null,
    backgroundHexDark: asBackgroundHex(partial?.backgroundHexDark),
    backgroundHexLight: asBackgroundHex(partial?.backgroundHexLight),
    engines: {
      reference: {
        ...DEFAULT_ENGINES.reference,
        ...(partial?.engines?.reference ?? {}),
      },
      geometryService: {
        ...DEFAULT_ENGINES.geometryService,
        ...(partial?.engines?.geometryService ?? {}),
      },
    },
  };
}

/** In-memory fallback for unit tests / non-browser. */
const memoryStore = new Map<string, string>();

function readStore(key: string): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(key);
  }
  return memoryStore.get(key) ?? null;
}

function writeStore(key: string, value: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, value);
    return;
  }
  memoryStore.set(key, value);
}

function removeStore(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(key);
    return;
  }
  memoryStore.delete(key);
}

/** Test helper — clear persisted prefs (browser or memory). */
export function clearViewportPrefs(): void {
  removeStore(VIEWPORT_PREFS_KEY);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

function asVec3(value: unknown): readonly [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);
  if (![x, y, z].every(Number.isFinite)) return null;
  return [x, y, z];
}

function asEngineLayer(value: unknown, fallback: EngineLayerState): EngineLayerState {
  if (!value || typeof value !== 'object') return fallback;
  const v = value as Partial<EngineLayerState>;
  return {
    visible: v.visible !== false,
    opacity: clamp01(typeof v.opacity === 'number' ? v.opacity : fallback.opacity),
  };
}

export function parseViewportPrefs(raw: string): ViewportPrefs | null {
  try {
    const data = JSON.parse(raw) as Partial<ViewportPrefs> & {
      readonly backgroundHex?: unknown;
    };
    const cameraRaw = data.camera;
    let camera: PersistedViewportCamera | null = null;
    if (cameraRaw && typeof cameraRaw === 'object') {
      const position = asVec3((cameraRaw as PersistedViewportCamera).position);
      const target = asVec3((cameraRaw as PersistedViewportCamera).target);
      if (position && target) camera = { position, target };
    }
    // Migrate legacy single backgroundHex into both theme slots when present.
    const legacy = asBackgroundHex(data.backgroundHex);
    return createDefaultViewportPrefs({
      engines: {
        reference: asEngineLayer(data.engines?.reference, DEFAULT_ENGINES.reference),
        geometryService: asEngineLayer(
          data.engines?.geometryService,
          DEFAULT_ENGINES.geometryService,
        ),
      },
      camera,
      backgroundHexDark: asBackgroundHex(data.backgroundHexDark) ?? legacy,
      backgroundHexLight: asBackgroundHex(data.backgroundHexLight) ?? legacy,
    });
  } catch {
    return null;
  }
}

export function loadViewportPrefs(): ViewportPrefs {
  const raw = readStore(VIEWPORT_PREFS_KEY);
  if (!raw) return createDefaultViewportPrefs();
  return parseViewportPrefs(raw) ?? createDefaultViewportPrefs();
}

export function persistViewportPrefs(prefs: ViewportPrefs): void {
  writeStore(VIEWPORT_PREFS_KEY, JSON.stringify(prefs));
}

export function persistEngineLayers(
  engines: ViewportPrefs['engines'],
): ViewportPrefs {
  const next = {
    ...loadViewportPrefs(),
    engines,
  };
  persistViewportPrefs(next);
  return next;
}

export function persistViewportCamera(
  camera: PersistedViewportCamera,
): ViewportPrefs {
  const next = {
    ...loadViewportPrefs(),
    camera,
  };
  persistViewportPrefs(next);
  return next;
}

export function persistViewportBackground(
  mode: 'dark' | 'light',
  backgroundHex: string | null,
): ViewportPrefs {
  const current = loadViewportPrefs();
  const hex = asBackgroundHex(backgroundHex);
  const next =
    mode === 'dark'
      ? { ...current, backgroundHexDark: hex }
      : { ...current, backgroundHexLight: hex };
  persistViewportPrefs(next);
  return next;
}
