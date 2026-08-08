/** G8.3 Semantic synchronization — viewport ↔ explorer ↔ inspector. */

export interface SelectionStore {
  readonly selectedSemanticId: string | null;
  readonly highlightedIds: readonly string[];
  readonly lastSyncAtMs: number;
  readonly sources: Readonly<{
    viewport: string | null;
    explorer: string | null;
    inspector: string | null;
  }>;
}

export type SelectionSource = 'viewport' | 'explorer' | 'inspector';

export function createSelectionStore(): SelectionStore {
  return {
    selectedSemanticId: null,
    highlightedIds: [],
    lastSyncAtMs: 0,
    sources: { viewport: null, explorer: null, inspector: null },
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
): SelectionStore {
  // Propagate to all surfaces so sync is atomic from the caller's perspective.
  void _source;
  return {
    selectedSemanticId: semanticId,
    highlightedIds: semanticId ? [semanticId] : [],
    lastSyncAtMs: nowMs,
    sources: {
      viewport: semanticId,
      explorer: semanticId,
      inspector: semanticId,
    },
  };
}

export function selectionInSync(store: SelectionStore): boolean {
  const { viewport, explorer, inspector } = store.sources;
  return viewport === explorer && explorer === inspector && viewport === store.selectedSemanticId;
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
