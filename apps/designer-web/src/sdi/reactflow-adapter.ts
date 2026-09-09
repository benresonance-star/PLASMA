/**
 * Disposable React Flow view model from GraphProjection.
 * RF node/edge ids are view ids — semantic identity lives on data.semanticId.
 */

import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type {
  GraphProjection,
  GraphViewNode,
  PatternCardPayload,
} from '@spds/graph-projection';

export type SdiRfNodeData = {
  readonly semanticId: string;
  readonly semanticType: string;
  readonly projectionRole: GraphViewNode['projectionRole'];
  readonly family: GraphViewNode['family'];
  readonly label: string;
  readonly summary?: string;
  readonly detailLevel?: GraphViewNode['detailLevel'];
  readonly card?: PatternCardPayload;
};

export type SdiRfEdgeData = {
  readonly relationshipId: string;
  readonly relationType: string;
  readonly presentationType: string;
  readonly fromSemanticId: string;
  readonly toSemanticId: string;
  /** Human hover text, e.g. "drives: lengthMm → y:0002". */
  readonly hoverLabel: string;
  /** True when the edge feeds a geometry / entity node (animate flow). */
  readonly intoGeometry: boolean;
};

function shortSemanticLeaf(id: string): string {
  if (id.startsWith('param:')) {
    const leaf = id.slice(id.lastIndexOf(':') + 1);
    return leaf || id;
  }
  const parts = id.split(':');
  if (parts.length >= 2) return parts.slice(-2).join(':');
  return id;
}

/** Hover / tooltip copy for a typed relationship edge. */
export function formatRelationHover(input: {
  readonly label: string;
  readonly fromSemanticId: string;
  readonly toSemanticId: string;
}): string {
  const rel = input.label.trim() || 'relates';
  return `${rel}: ${shortSemanticLeaf(input.fromSemanticId)} → ${shortSemanticLeaf(input.toSemanticId)}`;
}

/** RF class tokens for provisional ChangeSet / removed styling (D3a). */
export function rfClassForProjectionNode(n: GraphViewNode): string {
  const parts = [`sdi-rf-node--${n.projectionRole}`, `sdi-rf-node--family-${n.family}`];
  if (n.projectionRole === 'provisional') parts.push('sdi-rf-node--provisional');
  if (n.summary === 'removed') parts.push('sdi-rf-node--removed');
  if (n.summary === 'added') parts.push('sdi-rf-node--added');
  if (n.summary === 'changed') parts.push('sdi-rf-node--changed');
  return parts.join(' ');
}

export function projectionToReactFlow(projection: GraphProjection): {
  readonly nodes: Node<SdiRfNodeData>[];
  readonly edges: Edge<SdiRfEdgeData>[];
} {
  const nodes: Node<SdiRfNodeData>[] = projection.nodes.map((n) => ({
    id: n.viewId,
    position: n.positionHint ?? { x: 0, y: 0 },
    className: rfClassForProjectionNode(n),
    data: {
      semanticId: n.semanticId,
      semanticType: n.semanticType,
      projectionRole: n.projectionRole,
      family: n.family,
      label: shortSemanticLeaf(n.label),
      detailLevel: n.detailLevel,
      ...(n.summary !== undefined ? { summary: n.summary } : {}),
      ...(n.card !== undefined ? { card: n.card } : {}),
    },
    selected: n.projectionRole === 'focus',
    draggable: true,
    type: n.family === 'Pattern' ? 'sdiPattern' : 'sdiEntity',
  }));

  const viewBySemantic = new Map(projection.nodes.map((n) => [n.semanticId, n.viewId]));
  const familyBySemantic = new Map(projection.nodes.map((n) => [n.semanticId, n.family]));
  const edges: Edge<SdiRfEdgeData>[] = [];
  for (const e of projection.edges) {
    const source = viewBySemantic.get(e.fromSemanticId);
    const target = viewBySemantic.get(e.toSemanticId);
    if (!source || !target) continue;
    const hoverLabel = formatRelationHover({
      label: e.label,
      fromSemanticId: e.fromSemanticId,
      toSemanticId: e.toSemanticId,
    });
    const targetFamily = familyBySemantic.get(e.toSemanticId);
    const intoGeometry = targetFamily === 'Entity' || targetFamily === 'Output';
    edges.push({
      id: e.viewId,
      source,
      target,
      type: 'sdiRelation',
      label: e.label,
      className: intoGeometry ? 'sdi-rf-edge--into-geometry' : 'sdi-rf-edge',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: intoGeometry ? '#2ecc71' : '#8b939c',
      },
      data: {
        relationshipId: e.relationshipId,
        relationType: e.relationType,
        presentationType: e.presentationType,
        fromSemanticId: e.fromSemanticId,
        toSemanticId: e.toSemanticId,
        hoverLabel,
        intoGeometry,
      },
    });
  }

  return { nodes, edges };
}

/** Resolve RF selection → semantic ids (never trust RF id as semantic identity). */
export function semanticIdsFromRfSelection(
  nodes: readonly Node<SdiRfNodeData>[],
  selectedRfIds: readonly string[],
): readonly string[] {
  const selected = new Set(selectedRfIds);
  return nodes.filter((n) => selected.has(n.id)).map((n) => n.data.semanticId);
}
