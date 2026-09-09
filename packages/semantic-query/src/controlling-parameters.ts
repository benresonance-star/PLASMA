import type { IndexedSemanticGraph } from './graph.js';
import { walkNeighbourhood, type DependencyEdge } from './neighbourhood.js';

export function controllingParameters(input: {
  readonly objectId: string;
  readonly dependencyEdges: readonly DependencyEdge[];
  readonly graph: IndexedSemanticGraph;
  readonly radius?: number;
}): {
  readonly drivers: readonly string[];
  readonly limiters: readonly string[];
} {
  const up = walkNeighbourhood(input.dependencyEdges, input.objectId, 'upstream', {
    radius: input.radius ?? 4,
  });
  const drivers: string[] = [];
  const limiters: string[] = [];
  for (const id of up.ids) {
    const obj = input.graph.get(id);
    if (!obj) continue;
    if (obj.semanticType.startsWith('parameter.')) drivers.push(id);
    if (obj.semanticType.startsWith('constraint.') || obj.semanticType.includes('constraint')) {
      limiters.push(id);
    }
  }
  return { drivers: drivers.sort(), limiters: limiters.sort() };
}
