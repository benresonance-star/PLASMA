/** G8.3 / SDI §50 — central semantic selection across all surfaces. */

export interface SemanticSelection {
  readonly primaryId: string | null;
  readonly secondaryIds: readonly string[];
  readonly source: SelectionSource;
  readonly intent?: SelectionIntent;
}

export type SelectionIntent =
  | 'inspect'
  | 'explain'
  | 'impact'
  | 'navigate'
  | 'edit';

export interface SelectionStore {
  readonly selectedSemanticId: string | null;
  readonly highlightedIds: readonly string[];
  readonly lastSyncAtMs: number;
  readonly intent?: SelectionIntent;
  readonly sources: Readonly<{
    viewport: string | null;
    explorer: string | null;
    inspector: string | null;
    graph: string | null;
    search: string | null;
    ai: string | null;
    history: string | null;
    sketch: string | null;
  }>;
}

export type SelectionSource =
  | 'viewport'
  | 'explorer'
  | 'inspector'
  | 'graph'
  | 'search'
  | 'ai'
  | 'history'
  | 'sketch';

function blankSources(): SelectionStore['sources'] {
  return {
    viewport: null,
    explorer: null,
    inspector: null,
    graph: null,
    search: null,
    ai: null,
    history: null,
    sketch: null,
  };
}

function propagateAll(semanticId: string | null): SelectionStore['sources'] {
  return {
    viewport: semanticId,
    explorer: semanticId,
    inspector: semanticId,
    graph: semanticId,
    search: semanticId,
    ai: semanticId,
    history: semanticId,
    sketch: semanticId,
  };
}

export function createSelectionStore(): SelectionStore {
  return {
    selectedSemanticId: null,
    highlightedIds: [],
    lastSyncAtMs: 0,
    sources: blankSources(),
  };
}

/**
 * Selection sync must feel ≤100 ms. We record sync time and propagate to all surfaces.
 */
export function selectSemantic(
  store: SelectionStore,
  semanticId: string | null,
  _source: SelectionSource,
  nowMs: number,
  intent?: SelectionIntent,
): SelectionStore {
  void _source;
  return {
    selectedSemanticId: semanticId,
    highlightedIds: semanticId ? [semanticId] : [],
    lastSyncAtMs: nowMs,
    sources: propagateAll(semanticId),
    ...(intent !== undefined ? { intent } : {}),
  };
}

/**
 * Focus one or more geometry owners. First id is primary selection (strong tint);
 * all ids appear in highlightedIds (secondary tint for the rest).
 */
export function focusGeometry(
  store: SelectionStore,
  semanticIds: readonly string[],
  _source: SelectionSource,
  nowMs: number,
  intent?: SelectionIntent,
): SelectionStore {
  void _source;
  const unique = [...new Set(semanticIds.filter(Boolean))];
  const primary = unique[0] ?? null;
  return {
    selectedSemanticId: primary,
    highlightedIds: unique,
    lastSyncAtMs: nowMs,
    sources: propagateAll(primary),
    ...(intent !== undefined ? { intent } : {}),
  };
}

export function toSemanticSelection(store: SelectionStore): SemanticSelection {
  const secondary = store.highlightedIds.filter((id) => id !== store.selectedSemanticId);
  return {
    primaryId: store.selectedSemanticId,
    secondaryIds: secondary,
    source: inferSource(store),
    ...(store.intent !== undefined ? { intent: store.intent } : {}),
  };
}

function inferSource(store: SelectionStore): SelectionSource {
  const order: SelectionSource[] = [
    'viewport',
    'explorer',
    'inspector',
    'graph',
    'search',
    'ai',
    'history',
    'sketch',
  ];
  for (const s of order) {
    if (store.sources[s] === store.selectedSemanticId) return s;
  }
  return 'viewport';
}

export function selectionInSync(store: SelectionStore): boolean {
  const id = store.selectedSemanticId;
  return (
    store.sources.viewport === id &&
    store.sources.explorer === id &&
    store.sources.inspector === id &&
    store.sources.graph === id &&
    store.sources.search === id &&
    store.sources.ai === id &&
    store.sources.history === id &&
    store.sources.sketch === id
  );
}

/** When an object survives exact regen, keep selection if id still present. */
export function preserveSelectionAfterRegen(
  store: SelectionStore,
  survivingIds: ReadonlySet<string>,
  nowMs: number,
): SelectionStore {
  if (!store.selectedSemanticId || survivingIds.has(store.selectedSemanticId)) {
    return { ...store, lastSyncAtMs: nowMs };
  }
  return selectSemantic(store, null, 'viewport', nowMs);
}
