/**
 * Persist Schema canvas user layout across browser refresh (localStorage).
 * Keyed by modelId so D01/F01 placements do not collide.
 */

import type { SchemaLensMode } from './schema-projection.js';

export const SCHEMA_LAYOUT_PREFS_KEY = 'spds-schema-layout-prefs';

export interface SchemaNodePosition {
  readonly x: number;
  readonly y: number;
}

export interface SchemaModelLayoutPrefs {
  readonly positions: Readonly<Record<string, SchemaNodePosition>>;
  readonly expandedSetIds: readonly string[];
  readonly lens: SchemaLensMode;
  /** When true (default), parameters sit in a movable bounding container. */
  readonly parameterContainer: boolean;
}

export interface SchemaLayoutPrefsStore {
  readonly byModel: Readonly<Record<string, SchemaModelLayoutPrefs>>;
}

const DEFAULT_MODEL: SchemaModelLayoutPrefs = {
  positions: {},
  expandedSetIds: [],
  lens: 'mutable',
  parameterContainer: true,
};

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

/** Test helper — clear persisted schema layouts. */
export function clearSchemaLayoutPrefs(): void {
  removeStore(SCHEMA_LAYOUT_PREFS_KEY);
}

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parsePosition(value: unknown): SchemaNodePosition | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  const x = asFiniteNumber(o.x);
  const y = asFiniteNumber(o.y);
  if (x === null || y === null) return null;
  return { x, y };
}

function parseModelPrefs(value: unknown): SchemaModelLayoutPrefs {
  if (!value || typeof value !== 'object') return { ...DEFAULT_MODEL, positions: {} };
  const o = value as Record<string, unknown>;
  const positions: Record<string, SchemaNodePosition> = {};
  if (o.positions && typeof o.positions === 'object') {
    for (const [id, pos] of Object.entries(o.positions as Record<string, unknown>)) {
      const parsed = parsePosition(pos);
      if (parsed) positions[id] = parsed;
    }
  }
  const expandedSetIds = Array.isArray(o.expandedSetIds)
    ? o.expandedSetIds.map(String).filter(Boolean)
    : [];
  const lens: SchemaLensMode = o.lens === 'full' ? 'full' : 'mutable';
  const parameterContainer = o.parameterContainer !== false;
  return { positions, expandedSetIds, lens, parameterContainer };
}

export function parseSchemaLayoutPrefsStore(raw: unknown): SchemaLayoutPrefsStore {
  if (!raw || typeof raw !== 'object') return { byModel: {} };
  const o = raw as Record<string, unknown>;
  const byModelRaw =
    o.byModel && typeof o.byModel === 'object'
      ? (o.byModel as Record<string, unknown>)
      : (o as Record<string, unknown>);
  const byModel: Record<string, SchemaModelLayoutPrefs> = {};
  for (const [modelId, prefs] of Object.entries(byModelRaw)) {
    if (modelId === 'byModel') continue;
    if (!modelId || typeof prefs !== 'object') continue;
    byModel[modelId] = parseModelPrefs(prefs);
  }
  return { byModel };
}

export function loadSchemaLayoutPrefsStore(): SchemaLayoutPrefsStore {
  const raw = readStore(SCHEMA_LAYOUT_PREFS_KEY);
  if (!raw) return { byModel: {} };
  try {
    return parseSchemaLayoutPrefsStore(JSON.parse(raw) as unknown);
  } catch {
    return { byModel: {} };
  }
}

export function loadSchemaModelLayoutPrefs(modelId: string): SchemaModelLayoutPrefs {
  const id = modelId.trim() || 'catalog';
  return (
    loadSchemaLayoutPrefsStore().byModel[id] ?? {
      ...DEFAULT_MODEL,
      positions: {},
      expandedSetIds: [],
    }
  );
}

export function persistSchemaModelLayoutPrefs(
  modelId: string,
  prefs: SchemaModelLayoutPrefs,
): void {
  const id = modelId.trim() || 'catalog';
  const store = loadSchemaLayoutPrefsStore();
  const next: SchemaLayoutPrefsStore = {
    byModel: {
      ...store.byModel,
      [id]: {
        positions: { ...prefs.positions },
        expandedSetIds: [...prefs.expandedSetIds],
        lens: prefs.lens === 'full' ? 'full' : 'mutable',
        parameterContainer: prefs.parameterContainer !== false,
      },
    },
  };
  writeStore(SCHEMA_LAYOUT_PREFS_KEY, JSON.stringify(next));
}

export function positionsMapFromPrefs(
  prefs: SchemaModelLayoutPrefs,
): Map<string, SchemaNodePosition> {
  return new Map(Object.entries(prefs.positions));
}

export function positionsRecordFromMap(
  map: ReadonlyMap<string, SchemaNodePosition>,
): Record<string, SchemaNodePosition> {
  const out: Record<string, SchemaNodePosition> = {};
  for (const [id, pos] of map) {
    out[id] = { x: pos.x, y: pos.y };
  }
  return out;
}
