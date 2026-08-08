/** G9.3 Dependency explorer — upstream/downstream for selection. */

export interface DependencyEdgeView {
  readonly from: string;
  readonly to: string;
}

export interface DependencyExplorerView {
  readonly selectedId: string;
  readonly upstream: readonly string[];
  readonly downstream: readonly string[];
  readonly edges: readonly DependencyEdgeView[];
}

function closure(
  edges: readonly DependencyEdgeView[],
  start: string,
  direction: 'up' | 'down',
): string[] {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (direction === 'down') {
      const list = adj.get(e.from) ?? [];
      list.push(e.to);
      adj.set(e.from, list);
    } else {
      const list = adj.get(e.to) ?? [];
      list.push(e.from);
      adj.set(e.to, list);
    }
  }
  const result = new Set<string>();
  const stack = [...(adj.get(start) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const next of adj.get(id) ?? []) stack.push(next);
  }
  return [...result].sort();
}

export function buildDependencyExplorer(
  selectedId: string,
  edges: readonly DependencyEdgeView[],
): DependencyExplorerView {
  return {
    selectedId,
    upstream: closure(edges, selectedId, 'up'),
    downstream: closure(edges, selectedId, 'down'),
    edges,
  };
}
