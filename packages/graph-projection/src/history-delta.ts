import type { GraphProjection } from './types.js';

export type HistoryOrVariant =
  | { readonly kind: 'history'; readonly eventId: string; readonly label: string }
  | { readonly kind: 'variant'; readonly variantId: string; readonly label: string };

/** Graph delta for history scrub vs variant switch (SD11) — kinds must stay distinct. */
export function projectHistoryDelta(
  prev: GraphProjection,
  next: GraphProjection,
  meta: HistoryOrVariant,
): {
  readonly kind: 'history' | 'variant';
  readonly id: string;
  readonly label: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
} {
  const prevIds = new Set(prev.nodes.map((n) => n.semanticId));
  const nextIds = new Set(next.nodes.map((n) => n.semanticId));
  const added = [...nextIds].filter((id) => !prevIds.has(id)).sort();
  const removed = [...prevIds].filter((id) => !nextIds.has(id)).sort();
  const changed = [...nextIds]
    .filter((id) => prevIds.has(id))
    .filter((id) => {
      const a = prev.nodes.find((n) => n.semanticId === id);
      const b = next.nodes.find((n) => n.semanticId === id);
      return a?.summary !== b?.summary || a?.projectionRole !== b?.projectionRole;
    })
    .sort();

  switch (meta.kind) {
    case 'history':
      return {
        kind: 'history',
        id: meta.eventId,
        label: meta.label,
        added,
        removed,
        changed,
      };
    case 'variant':
      return {
        kind: 'variant',
        id: meta.variantId,
        label: meta.label,
        added,
        removed,
        changed,
      };
    default: {
      const _exhaustive: never = meta;
      return _exhaustive;
    }
  }
}
