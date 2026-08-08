export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
}

/** Coarse invalidation: return downstream closure of changed nodes. */
export function computeInvalidationSet(
  edges: readonly DependencyEdge[],
  changedIds: readonly string[],
): string[] {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adj.get(edge.from) ?? [];
    list.push(edge.to);
    adj.set(edge.from, list);
  }
  const result = new Set<string>();
  const stack = [...changedIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const next of adj.get(id) ?? []) stack.push(next);
  }
  return [...result].sort();
}

export interface JobPlan {
  readonly operatorKeys: readonly string[];
  readonly staleRepresentationIds: readonly string[];
}

export function planRecompilation(
  invalidatedIds: readonly string[],
  bindings: ReadonlyMap<string, string>,
): JobPlan {
  const operatorKeys = new Set<string>();
  for (const id of invalidatedIds) {
    const op = bindings.get(id);
    if (op) operatorKeys.add(op);
  }
  return {
    operatorKeys: [...operatorKeys].sort(),
    staleRepresentationIds: invalidatedIds.map((id) => `repr:${id}`),
  };
}
