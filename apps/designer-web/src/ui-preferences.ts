/**
 * Hosted UI preferences — sync theme / viewport / measure library / workspace chrome
 * to the API (Postgres-backed when DATABASE_URL is set). localStorage remains the offline cache.
 */
import { fetchUiPreferences, saveUiPreferences } from './api-client.js';
import {
  MEASURE_LIBRARY_KEY,
  createMeasureLibraryState,
  loadMeasureLibrary,
  parseMeasureLibrary,
  persistMeasureLibrary,
  serializeMeasureLibrary,
  type MeasureLibraryState,
} from './measure-library.js';
import type { MeasureSnapKind, MeasureToolMode } from './measure-tool.js';
import {
  DEFAULT_PANEL_WIDTHS,
  normalizePanelWidths,
  panelWidthsDifferFromDefault,
  type PanelWidthPrefs,
} from './panel-layout.js';
import type { PanelId } from './shell.js';
import {
  VIEWPORT_PREFS_KEY,
  createDefaultViewportPrefs,
  loadViewportPrefs,
  parseViewportPrefs,
  persistViewportPrefs,
  type ViewportPrefs,
} from './viewport-prefs.js';

export type { PanelWidthPrefs };

export const UI_USER_ID_KEY = 'spds-ui-user-id';
export const THEME_KEY = 'spds-theme';
export const WORKSPACE_PREFS_KEY = 'spds-workspace-prefs';

export interface HudPositionPrefs {
  readonly x: number;
  readonly y: number;
}

export interface HudLayoutPrefs {
  readonly measureOpen: boolean;
  readonly engineOpen: boolean;
  readonly measurePosition: HudPositionPrefs | null;
  readonly enginePosition: HudPositionPrefs | null;
}

export interface ShellUiPrefs {
  readonly activePanel: PanelId;
  readonly modelKind: 'd01' | 'f01' | 'a01';
  readonly publicationStatus: 'candidate' | 'published' | 'offline';
  readonly selectedSemanticId: string | null;
  readonly explorerExpandedIds: readonly string[];
  readonly panelWidths: PanelWidthPrefs;
}

export type MeasureUiMode = Exclude<MeasureToolMode, 'idle'>;

export interface MeasureToolUiPrefs {
  /** Last non-idle measure mode (restored when the Measure HUD opens). */
  readonly lastMode: MeasureUiMode;
  readonly snap: MeasureSnapKind;
}

/** Center canvas mode — Geometry viewport vs Schema ontology canvas (plan S01). */
export type CenterWorkspace = 'geometry' | 'schema';

export interface WorkspaceUiPrefs {
  readonly huds: HudLayoutPrefs;
  readonly shell: ShellUiPrefs;
  readonly measureTool: MeasureToolUiPrefs;
  readonly centerWorkspace: CenterWorkspace;
}

export interface UiPreferencesPayload {
  readonly theme?: 'dark' | 'light';
  readonly viewport?: ViewportPrefs;
  readonly measureLibrary?: MeasureLibraryState;
  readonly workspace?: WorkspaceUiPrefs;
}

const PANEL_IDS: readonly PanelId[] = [
  'explorer',
  'inspector',
  'viewport',
  'pipeline',
  'validation',
  'history',
  'ai',
  'analysis-mesh',
  'schema',
];

const DEFAULT_WORKSPACE: WorkspaceUiPrefs = {
  huds: {
    measureOpen: false,
    engineOpen: false,
    measurePosition: null,
    enginePosition: null,
  },
  shell: {
    activePanel: 'viewport',
    modelKind: 'd01',
    publicationStatus: 'candidate',
    selectedSemanticId: null,
    explorerExpandedIds: [],
    panelWidths: { ...DEFAULT_PANEL_WIDTHS },
  },
  measureTool: {
    lastMode: 'distance',
    snap: 'vertex',
  },
  centerWorkspace: 'geometry',
};

function browserStorage(): Storage | null {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

function asPos(value: unknown): HudPositionPrefs | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as { x?: unknown; y?: unknown };
  const x = Number(o.x);
  const y = Number(o.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function asPanelId(value: unknown): PanelId {
  return typeof value === 'string' && (PANEL_IDS as readonly string[]).includes(value)
    ? (value as PanelId)
    : DEFAULT_WORKSPACE.shell.activePanel;
}

function asMeasureMode(value: unknown): MeasureUiMode {
  switch (value) {
    case 'distance':
    case 'edgeLength':
    case 'faceArea':
    case 'angle':
      return value;
    default:
      return 'distance';
  }
}

function asSnap(value: unknown): MeasureSnapKind {
  switch (value) {
    case 'vertex':
    case 'edge':
    case 'face':
      return value;
    default:
      return 'vertex';
  }
}

function asCenterWorkspace(value: unknown): CenterWorkspace {
  return value === 'schema' ? 'schema' : 'geometry';
}

export function createDefaultWorkspacePrefs(
  partial?: {
    readonly huds?: Partial<HudLayoutPrefs>;
    readonly shell?: Partial<Omit<ShellUiPrefs, 'explorerExpandedIds' | 'panelWidths'>> & {
      readonly explorerExpandedIds?: readonly string[];
      readonly panelWidths?: Partial<PanelWidthPrefs>;
    };
    readonly measureTool?: Partial<MeasureToolUiPrefs>;
    readonly centerWorkspace?: CenterWorkspace;
  },
): WorkspaceUiPrefs {
  return {
    huds: { ...DEFAULT_WORKSPACE.huds, ...(partial?.huds ?? {}) },
    shell: {
      ...DEFAULT_WORKSPACE.shell,
      ...(partial?.shell ?? {}),
      explorerExpandedIds: partial?.shell?.explorerExpandedIds
        ? [...partial.shell.explorerExpandedIds]
        : [...DEFAULT_WORKSPACE.shell.explorerExpandedIds],
      panelWidths: normalizePanelWidths(partial?.shell?.panelWidths),
    },
    measureTool: { ...DEFAULT_WORKSPACE.measureTool, ...(partial?.measureTool ?? {}) },
    centerWorkspace: asCenterWorkspace(
      partial?.centerWorkspace ?? DEFAULT_WORKSPACE.centerWorkspace,
    ),
  };
}

export function parseWorkspacePrefs(raw: string): WorkspaceUiPrefs | null {
  try {
    const data = JSON.parse(raw) as Partial<WorkspaceUiPrefs> & {
      centerWorkspace?: unknown;
    };
    return createDefaultWorkspacePrefs({
      huds: {
        measureOpen: Boolean(data.huds?.measureOpen),
        engineOpen: Boolean(data.huds?.engineOpen),
        measurePosition: asPos(data.huds?.measurePosition),
        enginePosition: asPos(data.huds?.enginePosition),
      },
      shell: {
        activePanel: asPanelId(data.shell?.activePanel),
        modelKind:
          data.shell?.modelKind === 'f01' || data.shell?.modelKind === 'a01'
            ? data.shell.modelKind
            : 'd01',
        publicationStatus:
          data.shell?.publicationStatus === 'published' ||
          data.shell?.publicationStatus === 'offline'
            ? data.shell.publicationStatus
            : 'candidate',
        selectedSemanticId:
          typeof data.shell?.selectedSemanticId === 'string'
            ? data.shell.selectedSemanticId
            : null,
        explorerExpandedIds: Array.isArray(data.shell?.explorerExpandedIds)
          ? data.shell!.explorerExpandedIds.filter((id): id is string => typeof id === 'string')
          : [],
        panelWidths: normalizePanelWidths(
          data.shell &&
            typeof data.shell === 'object' &&
            'panelWidths' in data.shell &&
            data.shell.panelWidths &&
            typeof data.shell.panelWidths === 'object'
            ? (data.shell.panelWidths as Partial<PanelWidthPrefs>)
            : undefined,
        ),
      },
      measureTool: {
        lastMode: asMeasureMode(data.measureTool?.lastMode),
        snap: asSnap(data.measureTool?.snap),
      },
      centerWorkspace: asCenterWorkspace(data.centerWorkspace),
    });
  } catch {
    return null;
  }
}

export function loadWorkspacePrefs(): WorkspaceUiPrefs {
  const raw = browserStorage()?.getItem(WORKSPACE_PREFS_KEY);
  if (!raw) return createDefaultWorkspacePrefs();
  return parseWorkspacePrefs(raw) ?? createDefaultWorkspacePrefs();
}

export function persistWorkspacePrefs(prefs: WorkspaceUiPrefs): void {
  browserStorage()?.setItem(WORKSPACE_PREFS_KEY, JSON.stringify(prefs));
}

export function getOrCreateUiUserId(): string {
  const storage = browserStorage();
  const existing = storage?.getItem(UI_USER_ID_KEY);
  if (existing && existing.trim()) return existing.trim();
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `anon:${crypto.randomUUID()}`
      : `anon:${Date.now().toString(36)}`;
  storage?.setItem(UI_USER_ID_KEY, id);
  return id;
}

export function collectLocalUiPreferences(input?: {
  readonly theme?: 'dark' | 'light';
  readonly measureLibrary?: MeasureLibraryState;
  readonly workspace?: WorkspaceUiPrefs;
}): UiPreferencesPayload {
  const storage = browserStorage();
  const theme =
    input?.theme ?? (storage?.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
  return {
    theme,
    viewport: loadViewportPrefs(),
    measureLibrary: input?.measureLibrary ?? loadMeasureLibrary(),
    workspace: input?.workspace ?? loadWorkspacePrefs(),
  };
}

export function applyLocalUiPreferences(payload: UiPreferencesPayload): {
  readonly theme: 'dark' | 'light';
  readonly measureLibrary: MeasureLibraryState;
  readonly viewport: ViewportPrefs;
  readonly workspace: WorkspaceUiPrefs;
} {
  const theme = payload.theme === 'light' ? 'light' : 'dark';
  browserStorage()?.setItem(THEME_KEY, theme);

  const viewport = payload.viewport
    ? (parseViewportPrefs(JSON.stringify(payload.viewport)) ??
      createDefaultViewportPrefs(payload.viewport))
    : loadViewportPrefs();
  persistViewportPrefs(viewport);

  const measureLibrary = payload.measureLibrary
    ? (parseMeasureLibrary(serializeMeasureLibrary(payload.measureLibrary)) ??
      createMeasureLibraryState(payload.measureLibrary))
    : loadMeasureLibrary();
  persistMeasureLibrary(measureLibrary);

  const workspace = payload.workspace
    ? createDefaultWorkspacePrefs(payload.workspace)
    : loadWorkspacePrefs();
  persistWorkspacePrefs(workspace);

  return { theme, measureLibrary, viewport, workspace };
}

function payloadHasContent(payload: UiPreferencesPayload): boolean {
  if (payload.theme) return true;
  if (payload.viewport?.camera) return true;
  if (
    payload.viewport?.engines &&
    (payload.viewport.engines.reference.opacity !== 1 ||
      payload.viewport.engines.geometryService.opacity !== 0.35)
  ) {
    return true;
  }
  if (payload.measureLibrary && payload.measureLibrary.items.length > 0) return true;
  if (payload.workspace) {
    const w = payload.workspace;
    if (w.huds.measureOpen || w.huds.engineOpen) return true;
    if (w.huds.measurePosition || w.huds.enginePosition) return true;
    if (w.shell.selectedSemanticId) return true;
    if (w.shell.explorerExpandedIds.length > 0) return true;
    if (w.shell.activePanel !== 'viewport') return true;
    if (w.shell.modelKind !== 'd01') return true;
    if (panelWidthsDifferFromDefault(w.shell.panelWidths)) return true;
    if (w.measureTool.lastMode !== 'distance') return true;
  }
  return false;
}

function coercePayload(raw: unknown): UiPreferencesPayload {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const theme = o.theme === 'light' || o.theme === 'dark' ? o.theme : undefined;
  const viewport =
    o.viewport && typeof o.viewport === 'object'
      ? (parseViewportPrefs(JSON.stringify(o.viewport)) ?? undefined)
      : undefined;
  let measureLibrary: MeasureLibraryState | undefined;
  if (o.measureLibrary && typeof o.measureLibrary === 'object') {
    measureLibrary = parseMeasureLibrary(JSON.stringify(o.measureLibrary)) ?? undefined;
  }
  let workspace: WorkspaceUiPrefs | undefined;
  if (o.workspace && typeof o.workspace === 'object') {
    workspace = parseWorkspacePrefs(JSON.stringify(o.workspace)) ?? undefined;
  }
  return {
    ...(theme ? { theme } : {}),
    ...(viewport ? { viewport } : {}),
    ...(measureLibrary ? { measureLibrary } : {}),
    ...(workspace ? { workspace } : {}),
  };
}

/**
 * Pull server prefs (if any); otherwise push the local cache once.
 * Always keeps localStorage as a working cache.
 */
export async function hydrateUiPreferencesFromServer(input?: {
  readonly theme?: 'dark' | 'light';
  readonly measureLibrary?: MeasureLibraryState;
  readonly workspace?: WorkspaceUiPrefs;
}): Promise<{
  readonly theme: 'dark' | 'light';
  readonly measureLibrary: MeasureLibraryState;
  readonly viewport: ViewportPrefs;
  readonly workspace: WorkspaceUiPrefs;
  readonly source: 'server' | 'local';
}> {
  const userId = getOrCreateUiUserId();
  const local = collectLocalUiPreferences(input);
  try {
    const remote = await fetchUiPreferences(userId);
    const remotePayload = coercePayload(remote.payload);
    if (payloadHasContent(remotePayload)) {
      const applied = applyLocalUiPreferences(remotePayload);
      return { ...applied, source: 'server' };
    }
    if (payloadHasContent(local)) {
      await saveUiPreferences({ userId, payload: local });
    }
  } catch {
    /* API offline — keep local cache */
  }
  const applied = applyLocalUiPreferences(local);
  return { ...applied, source: 'local' };
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced push of the current local UI prefs to the hosted database. */
export function scheduleUiPreferencesPush(input?: {
  readonly theme?: 'dark' | 'light';
  readonly measureLibrary?: MeasureLibraryState;
  readonly workspace?: WorkspaceUiPrefs;
}): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const userId = getOrCreateUiUserId();
    const payload = collectLocalUiPreferences(input);
    if (input?.theme) browserStorage()?.setItem(THEME_KEY, input.theme);
    if (input?.measureLibrary) persistMeasureLibrary(input.measureLibrary);
    if (input?.workspace) persistWorkspacePrefs(input.workspace);
    void saveUiPreferences({ userId, payload }).catch(() => {
      /* offline */
    });
  }, 400);
}

/** Keys touched by UI preference sync (for tests / docs). */
export const UI_PREFERENCE_STORAGE_KEYS = [
  UI_USER_ID_KEY,
  THEME_KEY,
  VIEWPORT_PREFS_KEY,
  MEASURE_LIBRARY_KEY,
  WORKSPACE_PREFS_KEY,
] as const;
