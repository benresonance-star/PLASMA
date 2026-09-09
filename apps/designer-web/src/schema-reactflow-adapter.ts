/**
 * Schema catalog → React Flow adapter (plan S07).
 */

import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { formatRelationHover } from './sdi/reactflow-adapter.js';
import {
  formatSchemaNodeHover,
  lookupSchemaRelationDoc,
} from './schema-item-docs.js';
import type {
  SchemaProjection,
  SchemaProjectionNode,
  SchemaProjectionRole,
} from './schema-projection.js';

export type SchemaRfNodeRole = SchemaProjectionRole | 'param-group';

export type SchemaRfNodeData = {
  readonly semanticId: string;
  readonly role: SchemaRfNodeRole;
  readonly label: string;
  readonly mutable: boolean;
  readonly summary?: string;
  readonly provisional?: boolean;
  readonly expandable?: boolean;
  readonly expanded?: boolean;
  readonly memberIds?: readonly string[];
  readonly parentSetId?: string;
  /** Detailed hover copy (HelpTooltip). */
  readonly hoverTitle: string;
  readonly hoverPurpose: string;
  readonly hoverHowToUse: string;
};

export type SchemaRfEdgeData = {
  readonly relationType: string;
  readonly fromSemanticId: string;
  readonly toSemanticId: string;
  /** Short relation line — same formatter as Causal wires. */
  readonly hoverLabel: string;
  /** Longer purpose line for the floating edge tooltip. */
  readonly hoverDetail: string;
  /** Param→pattern “drives” edges — green flow stroke like causal intoGeometry. */
  readonly drivesGeometry: boolean;
};

const MARKER_NEUTRAL = '#8b939c';
const MARKER_DRIVES = '#2ecc71';

export function schemaMarkerColorForRelation(relationType: string): string {
  return relationType === 'drives' ? MARKER_DRIVES : MARKER_NEUTRAL;
}

export function schemaRfClassForNode(
  n: SchemaProjectionNode,
  provisionalIds: ReadonlySet<string>,
): string {
  const parts = [`schema-rf-node`, `schema-rf-node--${n.role}`];
  if (n.mutable) parts.push('schema-rf-node--mutable');
  if (n.expandable) parts.push('schema-rf-node--set');
  if (n.expanded) parts.push('schema-rf-node--expanded');
  if (provisionalIds.has(n.semanticId)) parts.push('schema-rf-node--provisional');
  return parts.join(' ');
}

export function schemaProjectionToReactFlow(
  projection: SchemaProjection,
  options?: {
    readonly provisionalSemanticIds?: ReadonlySet<string>;
    readonly selectedSemanticId?: string | null;
  },
): {
  readonly nodes: Node<SchemaRfNodeData>[];
  readonly edges: Edge<SchemaRfEdgeData>[];
} {
  const provisional = options?.provisionalSemanticIds ?? new Set<string>();
  const selected = options?.selectedSemanticId ?? null;
  const nodes: Node<SchemaRfNodeData>[] = projection.nodes.map((n) => {
    const hover = formatSchemaNodeHover({
      semanticId: n.parentSetId ?? n.semanticId,
      role: n.role,
      label: n.label,
      mutable: n.mutable,
      ...(n.summary !== undefined ? { summary: n.summary } : {}),
      ...(n.expandable
        ? {
            summary: n.expanded
              ? 'component set · double-click to hide instances'
              : 'component set · double-click to show instances',
          }
        : {}),
    });
    const howToUse = n.expandable
      ? n.expanded
        ? 'Double-click to collapse member components back into this set.'
        : 'Double-click to reveal individual component nodes from this set.'
      : hover.howToUse;
    return {
      id: n.viewId,
      position: { x: n.position.x, y: n.position.y },
      className: schemaRfClassForNode(n, provisional),
      data: {
        semanticId: n.semanticId,
        role: n.role,
        label: n.label,
        mutable: n.mutable,
        ...(n.summary !== undefined ? { summary: n.summary } : {}),
        ...(provisional.has(n.semanticId) ? { provisional: true } : {}),
        ...(n.expandable ? { expandable: true } : {}),
        ...(n.expanded !== undefined ? { expanded: n.expanded } : {}),
        ...(n.memberIds !== undefined ? { memberIds: n.memberIds } : {}),
        ...(n.parentSetId !== undefined ? { parentSetId: n.parentSetId } : {}),
        hoverTitle: hover.title,
        hoverPurpose: hover.purpose,
        hoverHowToUse: howToUse,
      },
      selected: selected !== null && n.semanticId === selected,
      draggable: true,
      type: 'schemaNode',
    };
  });

  const viewBySemantic = new Map(projection.nodes.map((n) => [n.semanticId, n.viewId]));
  const edgeIds = new Set<string>();
  const edges: Edge<SchemaRfEdgeData>[] = [];
  for (const e of projection.edges) {
    const source = viewBySemantic.get(e.fromSemanticId);
    const target = viewBySemantic.get(e.toSemanticId);
    if (!source || !target) continue;
    if (edgeIds.has(e.viewId)) continue;
    edgeIds.add(e.viewId);
    const drivesGeometry = e.relationType === 'drives';
    const markerColor = schemaMarkerColorForRelation(e.relationType);
    const relDoc = lookupSchemaRelationDoc(e.label || e.relationType);
    edges.push({
      id: e.viewId,
      source,
      target,
      type: 'schemaRelation',
      label: e.label,
      className: `schema-rf-edge schema-rf-edge--${e.relationType}`,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: markerColor,
      },
      data: {
        relationType: e.relationType,
        fromSemanticId: e.fromSemanticId,
        toSemanticId: e.toSemanticId,
        hoverLabel: formatRelationHover({
          label: e.label,
          fromSemanticId: e.fromSemanticId,
          toSemanticId: e.toSemanticId,
        }),
        hoverDetail: relDoc.purpose,
        drivesGeometry,
      },
    });
  }

  return { nodes, edges };
}

export function semanticIdsFromSchemaRfSelection(
  nodes: readonly Node<SchemaRfNodeData>[],
  selectedRfIds?: readonly string[],
): string[] {
  const pick = (n: Node<SchemaRfNodeData>): string | null => {
    if (n.data.role === 'param-group') return null;
    return n.data.semanticId;
  };
  if (selectedRfIds !== undefined) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const out: string[] = [];
    for (const id of selectedRfIds) {
      const n = byId.get(id);
      if (!n) continue;
      const semanticId = pick(n);
      if (semanticId) out.push(semanticId);
    }
    return out;
  }
  return nodes
    .filter((n) => n.selected)
    .map(pick)
    .filter((id): id is string => id !== null);
}

/**
 * Schema canvas selection contract (mirrors causal lens): empty RF selection
 * must not clear the app selection while syncing from props or on spurious clears.
 */
export function nextSchemaSemanticFromRfSelection(
  nodes: readonly Node<SchemaRfNodeData>[],
  selectedRfIds: readonly string[],
  syncingFromProps: boolean,
): string | undefined {
  if (syncingFromProps) return undefined;
  const ids = semanticIdsFromSchemaRfSelection(nodes, selectedRfIds);
  return ids[0];
}
