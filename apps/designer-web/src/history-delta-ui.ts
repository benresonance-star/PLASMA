/**
 * History vs variant chrome helpers (D4) — distinct copy / kinds.
 */

import {
  projectHistoryDelta,
  type GraphProjection,
  type HistoryOrVariant,
} from '@spds/graph-projection';

export function historyEventLabel(input: {
  readonly kind: 'history' | 'variant';
  readonly label: string;
}): string {
  switch (input.kind) {
    case 'history':
      return `History · ${input.label}`;
    case 'variant':
      return `Variant · ${input.label}`;
    default: {
      const _exhaustive: never = input.kind;
      return _exhaustive;
    }
  }
}

export function describeHistoryOrVariantDelta(
  prev: GraphProjection,
  next: GraphProjection,
  meta: HistoryOrVariant,
): {
  readonly kind: 'history' | 'variant';
  readonly uiLabel: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
} {
  const delta = projectHistoryDelta(prev, next, meta);
  return {
    kind: delta.kind,
    uiLabel: historyEventLabel({ kind: delta.kind, label: delta.label }),
    added: delta.added,
    removed: delta.removed,
    changed: delta.changed,
  };
}
