import type { GraphProjection, GraphViewEdge, GraphViewNode, SemanticDepth } from './types.js';

/** Execution DAG projection (SD10.1) — operators only at EXECUTION depth. */
export function executionGraph(input: {
  readonly objectId: string;
  readonly pirOperationId?: string;
  readonly kernelResultId?: string;
  readonly depth: SemanticDepth;
}): GraphProjection {
  const includeOps = input.depth === 'execution';
  const pir = input.pirOperationId ?? `pir:op:${input.objectId}`;
  const kernel = input.kernelResultId ?? `kernel:exact:${input.objectId}`;

  const nodes: GraphViewNode[] = [
    {
      viewId: `view:node:${input.objectId}`,
      semanticId: input.objectId,
      semanticType: 'structural.component',
      projectionRole: 'focus',
      label: input.objectId,
      family: 'Entity',
      detailLevel: includeOps ? 'E' : 'C',
      positionHint: { x: 0, y: 0 },
    },
  ];

  if (includeOps) {
    nodes.push(
      {
        viewId: `view:node:${pir}`,
        semanticId: pir,
        semanticType: 'execution.operator',
        projectionRole: 'downstream',
        label: pir,
        family: 'Operator',
        detailLevel: 'E',
        summary: 'operator',
        positionHint: { x: 280, y: 0 },
      },
      {
        viewId: `view:node:${kernel}`,
        semanticId: kernel,
        semanticType: 'execution.kernel',
        projectionRole: 'downstream',
        label: kernel,
        family: 'Operator',
        detailLevel: 'E',
        summary: 'occt',
        positionHint: { x: 560, y: 0 },
      },
    );
  }

  const edges: GraphViewEdge[] = includeOps
    ? [
        {
          viewId: `view:edge:${input.objectId}->${pir}`,
          relationshipId: `rel:${input.objectId}:executes-as:${pir}`,
          fromSemanticId: input.objectId,
          toSemanticId: pir,
          relationType: 'executes-as',
          presentationType: 'EXECUTES_AS',
          label: 'executes as',
        },
        {
          viewId: `view:edge:${pir}->${kernel}`,
          relationshipId: `rel:${pir}:represents:${kernel}`,
          fromSemanticId: pir,
          toSemanticId: kernel,
          relationType: 'represents',
          presentationType: 'REPRESENTS',
          label: 'represents',
        },
      ]
    : [];

  return {
    projectionId: `proj:execution:${input.objectId}:${input.depth}`,
    focusObjectIds: [input.objectId],
    depth: input.depth,
    relationshipTypes: [],
    causalRadius: 1,
    nodes,
    edges,
    layoutHints: { mode: 'execution', anchorSemanticId: input.objectId },
  };
}
