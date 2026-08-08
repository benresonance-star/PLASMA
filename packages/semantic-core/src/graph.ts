import type { Relationship } from './relationships.js';
import type { SemanticObject } from './envelope.js';

export interface SemanticGraph {
  readonly objects: ReadonlyMap<string, SemanticObject>;
  readonly relationships: readonly Relationship[];
}

export function createSemanticGraph(
  objects: readonly SemanticObject[],
  relationships: readonly Relationship[] = [],
): SemanticGraph {
  const map = new Map<string, SemanticObject>();
  for (const obj of objects) {
    if (map.has(obj.id)) {
      throw new Error(`Duplicate semantic ID: ${obj.id}`);
    }
    map.set(obj.id, obj);
  }
  for (const rel of relationships) {
    if (!map.has(rel.from) || !map.has(rel.to)) {
      throw new Error(`Relationship ${rel.id} references missing endpoint`);
    }
  }
  return { objects: map, relationships };
}

export function upstream(graph: SemanticGraph, id: string, relationTypes?: readonly string[]): string[] {
  return graph.relationships
    .filter((r) => r.to === id && (!relationTypes || relationTypes.includes(r.relationType)))
    .map((r) => r.from);
}

export function downstream(graph: SemanticGraph, id: string, relationTypes?: readonly string[]): string[] {
  return graph.relationships
    .filter((r) => r.from === id && (!relationTypes || relationTypes.includes(r.relationType)))
    .map((r) => r.to);
}

/** Detect directed cycles among depends-on / generated-from edges. */
export function hasDirectedCycle(
  graph: SemanticGraph,
  relationTypes: readonly string[] = ['depends-on', 'generated-from'],
): boolean {
  const adj = new Map<string, string[]>();
  for (const id of graph.objects.keys()) adj.set(id, []);
  for (const rel of graph.relationships) {
    if (!relationTypes.includes(rel.relationType)) continue;
    adj.get(rel.from)?.push(rel.to);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adj.get(node) ?? []) {
      if (dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const id of graph.objects.keys()) {
    if (dfs(id)) return true;
  }
  return false;
}
