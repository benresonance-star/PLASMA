import type { DependencyEdge, IndexedSemanticGraph } from '@spds/semantic-query';
import { buildPatternCard, detailLevelForDepth } from './pattern-card.js';
import { buildPatternInspector } from './pattern-types.js';
import { projectCausalNeighbourhood } from './project.js';
import type { GraphProjection, SemanticDepth } from './types.js';

/**
 * Enter a pattern as a semantic space (SD3.3) — projection rooted on the pattern.
 */
export function patternGraph(input: {
  readonly patternId: string;
  readonly graph: IndexedSemanticGraph;
  readonly dependencyEdges: readonly DependencyEdge[];
  readonly depth?: SemanticDepth;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly operatorBindings?: Readonly<Record<string, string>>;
}): GraphProjection {
  const depth = input.depth ?? 'system';
  const base = projectCausalNeighbourhood({
    graph: input.graph,
    dependencyEdges: input.dependencyEdges,
    focusObjectIds: [input.patternId],
    highlightObjectIds: [input.patternId],
    radius: 1,
    depth,
    expandPatternContext: true,
    projectionId: `proj:pattern:${input.patternId}:${depth}`,
  });

  const inspector = buildPatternInspector({
    patternId: input.patternId,
    name: input.patternId.includes(':')
      ? input.patternId.slice(input.patternId.lastIndexOf(':') + 1)
      : input.patternId,
    parameters: input.parameters ?? {},
    operatorBindings: input.operatorBindings ?? { 'op:extrude': 'occt.extrude' },
  });
  const detail = detailLevelForDepth(depth);
  const card = buildPatternCard({ inspector, depth, detailLevel: detail });

  const nodes = base.nodes.map((n) => {
    if (n.semanticId !== input.patternId) {
      return { ...n, detailLevel: detail };
    }
    return {
      ...n,
      detailLevel: detail,
      card: {
        ...card,
        parameters: card.parameters.map((p) => ({ key: p.key, value: p.value })),
        inputs: [...card.inputs],
        rules: [...card.rules],
        affectors: [...card.affectors],
        operators: [...card.operators],
      },
      summary: card.intent,
    };
  });

  // At SYSTEM and below, strip any Operator family nodes that slipped in.
  const filtered =
    depth === 'execution' || detail === 'E'
      ? nodes
      : nodes.filter((n) => n.family !== 'Operator');

  return {
    ...base,
    depth,
    nodes: filtered,
    layoutHints: { mode: 'pattern', anchorSemanticId: input.patternId },
  };
}
