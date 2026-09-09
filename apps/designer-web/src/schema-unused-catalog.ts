/**
 * Unused Schema catalog — full inventory minus nodes already on the mutable canvas.
 */

import { projectSchemaCatalog } from './schema-projection.js';
import { lookupSchemaItemDoc } from './schema-item-docs.js';
import type { SchemaViewModel } from './schema-view.js';

export type UnusedCatalogKind =
  | 'Kinds'
  | 'Patterns'
  | 'Live types'
  | 'Operators'
  | 'Relationships';

export interface UnusedCatalogItem {
  readonly id: string;
  readonly label: string;
  readonly kind: UnusedCatalogKind;
  readonly summary?: string;
  readonly purpose: string;
  readonly howToUse: string;
}

export interface UnusedCatalogGroup {
  readonly kind: UnusedCatalogKind;
  readonly items: readonly UnusedCatalogItem[];
}

const KIND_ORDER: readonly UnusedCatalogKind[] = [
  'Kinds',
  'Patterns',
  'Live types',
  'Operators',
  'Relationships',
];

function itemFromId(
  id: string,
  kind: UnusedCatalogKind,
  label?: string,
  summary?: string,
): UnusedCatalogItem {
  const doc = lookupSchemaItemDoc(id);
  return {
    id,
    label: label ?? id,
    kind,
    ...(summary !== undefined ? { summary } : {}),
    purpose: doc.purpose,
    howToUse: doc.howToUse,
  };
}

/** Semantic ids currently shown on the mutable Schema canvas. */
export function usedSchemaCanvasIds(schema: SchemaViewModel): ReadonlySet<string> {
  const projection = projectSchemaCatalog({ schema, lens: 'mutable' });
  return new Set(projection.nodes.map((n) => n.semanticId));
}

/**
 * Full catalog entries that are not represented as nodes in the mutable lens.
 * Grouped by catalog kind for the Schema side panel.
 */
export function listUnusedSchemaCatalog(schema: SchemaViewModel): UnusedCatalogGroup[] {
  const used = usedSchemaCanvasIds(schema);
  const byKind = new Map<UnusedCatalogKind, UnusedCatalogItem[]>();

  const push = (item: UnusedCatalogItem) => {
    if (used.has(item.id)) return;
    const list = byKind.get(item.kind) ?? [];
    if (list.some((x) => x.id === item.id)) return;
    list.push(item);
    byKind.set(item.kind, list);
  };

  for (const k of schema.kinds) {
    push(itemFromId(k, 'Kinds'));
  }
  for (const p of schema.patterns) {
    push(itemFromId(p, 'Patterns'));
  }
  for (const t of schema.liveTypes) {
    push(
      itemFromId(
        t.semanticType,
        'Live types',
        `${t.semanticType} ×${t.count}`,
        t.sampleIds[0],
      ),
    );
  }
  for (const op of schema.operators) {
    push(itemFromId(op, 'Operators'));
  }
  for (const rel of schema.relationships.core) {
    push(itemFromId(rel, 'Relationships', rel, 'core'));
  }
  for (const rel of schema.relationships.sdi) {
    push(itemFromId(rel, 'Relationships', rel, 'sdi'));
  }

  return KIND_ORDER.map((kind) => {
    const items = (byKind.get(kind) ?? []).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    return { kind, items };
  }).filter((g) => g.items.length > 0);
}

export function filterUnusedCatalogGroups(
  groups: readonly UnusedCatalogGroup[],
  query: string,
): UnusedCatalogGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...groups];
  return groups
    .map((g) => ({
      kind: g.kind,
      items: g.items.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          item.kind.toLowerCase().includes(q) ||
          (item.summary?.toLowerCase().includes(q) ?? false) ||
          item.purpose.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.items.length > 0);
}

export function countUnusedCatalogItems(groups: readonly UnusedCatalogGroup[]): number {
  return groups.reduce((n, g) => n + g.items.length, 0);
}
