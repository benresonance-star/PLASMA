import type { GraphProjection, GraphViewNode } from './types.js';

export type LensId =
  | 'patterns'
  | 'dependencies'
  | 'constraints'
  | 'fields'
  | 'fabrication'
  | 'parameters'
  | 'entities';

const LENS_FAMILIES: Record<LensId, ReadonlySet<GraphViewNode['family']>> = {
  patterns: new Set(['Pattern']),
  dependencies: new Set(['Entity', 'Pattern', 'Parameter', 'Output', 'Assembly']),
  constraints: new Set(['Constraint', 'Rule']),
  fields: new Set(['Field']),
  fabrication: new Set(['Material', 'Measurement', 'Output']),
  parameters: new Set(['Parameter']),
  entities: new Set(['Entity', 'Output', 'Assembly']),
};

function familyAllowed(
  family: GraphViewNode['family'],
  lenses: readonly LensId[],
): boolean {
  return lenses.some((lens) => LENS_FAMILIES[lens].has(family));
}

/**
 * Client-side filter lenses (SD4.2). Empty lens list → empty projection (not full model).
 * Focus ids are kept when their family matches any active lens.
 */
export function applyLenses(
  projection: GraphProjection,
  lenses: readonly LensId[],
): GraphProjection {
  if (lenses.length === 0) {
    return {
      ...projection,
      projectionId: `${projection.projectionId}:lenses:none`,
      nodes: [],
      edges: [],
    };
  }
  const keep = new Set(
    projection.nodes
      .filter((n) => familyAllowed(n.family, lenses))
      .map((n) => n.semanticId),
  );
  const nodes = projection.nodes.filter((n) => keep.has(n.semanticId));
  const edges = projection.edges.filter(
    (e) => keep.has(e.fromSemanticId) && keep.has(e.toSemanticId),
  );
  return {
    ...projection,
    projectionId: `${projection.projectionId}:lenses:${[...lenses].sort().join('+')}`,
    nodes,
    edges,
  };
}
