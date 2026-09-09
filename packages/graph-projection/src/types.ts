import { z } from 'zod';

export const SemanticDepthSchema = z.enum([
  'form',
  'intent',
  'system',
  'logic',
  'execution',
]);
export type SemanticDepth = z.infer<typeof SemanticDepthSchema>;

export const ProjectionRoleSchema = z.enum([
  'focus',
  'upstream',
  'downstream',
  'context',
  'aggregate',
  'provisional',
]);
export type ProjectionRole = z.infer<typeof ProjectionRoleSchema>;

export const GraphViewNodeSchema = z.object({
  /** Disposable view id — never treat as semantic identity alone. */
  viewId: z.string().min(1),
  semanticId: z.string().min(1),
  semanticType: z.string().min(1),
  projectionRole: ProjectionRoleSchema,
  label: z.string().min(1),
  family: z
    .enum([
      'Entity',
      'Pattern',
      'Parameter',
      'Field',
      'Rule',
      'Constraint',
      'Affector',
      'Assembly',
      'Connection',
      'Material',
      'Measurement',
      'Representation',
      'Output',
      'Operator',
      'AIChange',
      'SketchIntent',
    ])
    .default('Entity'),
  detailLevel: z.enum(['A', 'B', 'C', 'D', 'E']).default('A'),
  summary: z.string().optional(),
  /** Intent-first pattern card payload (SD3). */
  card: z
    .object({
      title: z.string(),
      intent: z.string(),
      parameters: z.array(z.object({ key: z.string(), value: z.string() })),
      inputs: z.array(z.string()),
      rules: z.array(z.string()),
      affectors: z.array(z.string()),
      operators: z.array(z.string()),
    })
    .optional(),
  /** Member semantic ids when projectionRole is aggregate (SD4.3). */
  aggregateMemberIds: z.array(z.string()).optional(),
  positionHint: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});
export type GraphViewNode = z.infer<typeof GraphViewNodeSchema>;

export const GraphViewEdgeSchema = z.object({
  viewId: z.string().min(1),
  /** Stable semantic relationship id when available. */
  relationshipId: z.string().min(1),
  fromSemanticId: z.string().min(1),
  toSemanticId: z.string().min(1),
  relationType: z.string().min(1),
  presentationType: z.string().min(1),
  label: z.string().min(1),
});
export type GraphViewEdge = z.infer<typeof GraphViewEdgeSchema>;

export const LayoutHintsSchema = z.object({
  mode: z.enum(['causal', 'dependency', 'pattern', 'execution']).default('causal'),
  anchorSemanticId: z.string().optional(),
});
export type LayoutHints = z.infer<typeof LayoutHintsSchema>;

export const GraphProjectionSchema = z.object({
  projectionId: z.string().min(1),
  focusObjectIds: z.array(z.string().min(1)),
  depth: SemanticDepthSchema,
  relationshipTypes: z.array(z.string()),
  causalRadius: z.number().int(),
  nodes: z.array(GraphViewNodeSchema),
  edges: z.array(GraphViewEdgeSchema),
  layoutHints: LayoutHintsSchema,
});
export type GraphProjection = z.infer<typeof GraphProjectionSchema>;

export function parseGraphProjection(input: unknown): GraphProjection {
  return GraphProjectionSchema.parse(input);
}
