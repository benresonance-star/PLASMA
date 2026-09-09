/**
 * Multi-hop upstream / downstream over typed dependency edges (SDI §14 / §48).
 */

export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly relationType?: string;
}

export function walkNeighbourhood(
  edges: readonly DependencyEdge[],
  startId: string,
  direction: 'upstream' | 'downstream',
  options?: {
    readonly radius?: number;
    readonly relationTypes?: readonly string[];
  },
): {
  readonly ids: readonly string[];
  readonly edges: readonly DependencyEdge[];
} {
  const radius = options?.radius ?? 1;
  const allow = options?.relationTypes ? new Set(options.relationTypes) : null;
  if (radius === 0) return { ids: [], edges: [] };

  const adj = new Map<string, DependencyEdge[]>();
  for (const e of edges) {
    if (allow && e.relationType && !allow.has(e.relationType)) continue;
    const key = direction === 'downstream' ? e.from : e.to;
    const list = adj.get(key) ?? [];
    list.push(e);
    adj.set(key, list);
  }

  const ids = new Set<string>();
  const used: DependencyEdge[] = [];
  const seenEdge = new Set<string>();
  let frontier = [startId];
  let depth = 0;
  const infinite = !Number.isFinite(radius) || radius < 0;

  while (frontier.length > 0 && (infinite || depth < radius)) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of adj.get(id) ?? []) {
        const neighbour = direction === 'downstream' ? e.to : e.from;
        const edgeKey = `${e.from}|${e.to}|${e.relationType ?? ''}`;
        if (!seenEdge.has(edgeKey)) {
          seenEdge.add(edgeKey);
          used.push(e);
        }
        if (neighbour === startId || ids.has(neighbour)) continue;
        ids.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
    depth += 1;
  }

  return { ids: [...ids].sort(), edges: used };
}

export function upstream(
  edges: readonly DependencyEdge[],
  id: string,
  radius = 1,
  relationTypes?: readonly string[],
): readonly string[] {
  return walkNeighbourhood(edges, id, 'upstream', {
    radius,
    ...(relationTypes ? { relationTypes } : {}),
  }).ids;
}

export function downstream(
  edges: readonly DependencyEdge[],
  id: string,
  radius = 1,
  relationTypes?: readonly string[],
): readonly string[] {
  return walkNeighbourhood(edges, id, 'downstream', {
    radius,
    ...(relationTypes ? { relationTypes } : {}),
  }).ids;
}
