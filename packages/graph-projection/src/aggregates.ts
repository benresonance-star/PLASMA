import type { GraphProjection, GraphViewEdge, GraphViewNode } from './types.js';

function entityKey(n: GraphViewNode): string {
  const t = n.semanticType;
  if (t.includes('y-component') || n.semanticId.includes(':y:')) return 'Y Components';
  return n.semanticType || 'Entities';
}

/**
 * Collapse dense instance families into aggregate nodes (SD4.3).
 * Never leave more than `threshold` entity instances expanded per family key.
 */
export function aggregateByFamily(
  projection: GraphProjection,
  options?: { readonly threshold?: number },
): GraphProjection {
  const threshold = options?.threshold ?? 8;
  const entities = projection.nodes.filter((n) => n.family === 'Entity' || n.family === 'Output');
  const byKey = new Map<string, GraphViewNode[]>();
  for (const n of entities) {
    const key = entityKey(n);
    const list = byKey.get(key) ?? [];
    list.push(n);
    byKey.set(key, list);
  }

  const removeIds = new Set<string>();
  const aggregates: GraphViewNode[] = [];
  for (const [key, members] of byKey) {
    if (members.length <= threshold) continue;
    for (const m of members) removeIds.add(m.semanticId);
    const aggId = `aggregate:${key.replace(/\s+/g, '-').toLowerCase()}`;
    aggregates.push({
      viewId: `view:node:${aggId}`,
      semanticId: aggId,
      semanticType: 'aggregate.instances',
      projectionRole: 'aggregate',
      label: `${key} · ${members.length} instances`,
      family: 'Entity',
      detailLevel: 'A',
      summary: `aggregate:${members.length}`,
      aggregateMemberIds: members.map((m) => m.semanticId),
      positionHint: members[0]?.positionHint ?? { x: 560, y: 0 },
    });
  }

  if (aggregates.length === 0) return projection;

  const memberToAgg = new Map<string, string>();
  for (const agg of aggregates) {
    for (const id of agg.aggregateMemberIds ?? []) memberToAgg.set(id, agg.semanticId);
  }

  const nodes = [
    ...projection.nodes.filter((n) => !removeIds.has(n.semanticId)),
    ...aggregates,
  ];
  const edgeKeys = new Set<string>();
  const edges: GraphViewEdge[] = [];
  for (const e of projection.edges) {
    const from = memberToAgg.get(e.fromSemanticId) ?? e.fromSemanticId;
    const to = memberToAgg.get(e.toSemanticId) ?? e.toSemanticId;
    if (from === to) continue;
    const key = `${from}|${to}|${e.relationType}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({
      ...e,
      viewId: `view:edge:rel:${from}:${e.relationType}:${to}`,
      relationshipId: `rel:${from}:${e.relationType}:${to}`,
      fromSemanticId: from,
      toSemanticId: to,
    });
  }

  return {
    ...projection,
    projectionId: `${projection.projectionId}:agg`,
    nodes,
    edges,
  };
}

export function expandAggregate(
  projection: GraphProjection,
  aggregateSemanticId: string,
  restoredMembers: readonly GraphViewNode[],
): GraphProjection {
  const agg = projection.nodes.find((n) => n.semanticId === aggregateSemanticId);
  if (!agg || agg.projectionRole !== 'aggregate') return projection;
  const nodes = [
    ...projection.nodes.filter((n) => n.semanticId !== aggregateSemanticId),
    ...restoredMembers,
  ];
  return {
    ...projection,
    projectionId: `${projection.projectionId}:expand:${aggregateSemanticId}`,
    nodes,
    edges: projection.edges.filter(
      (e) =>
        e.fromSemanticId !== aggregateSemanticId && e.toSemanticId !== aggregateSemanticId,
    ),
  };
}
