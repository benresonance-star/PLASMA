import type { GraphProjection } from './types.js';

/** Sketch → field → pattern provisional composition (SD9). */
export function projectSketchComposition(input: {
  readonly sketchId: string;
  readonly fieldId: string;
  readonly patternId: string;
  readonly affectedCellIds: readonly string[];
}): GraphProjection {
  return {
    projectionId: `proj:sketch:${input.sketchId}`,
    focusObjectIds: [input.sketchId],
    depth: 'system',
    relationshipTypes: [],
    causalRadius: 1,
    nodes: [
      {
        viewId: `view:node:${input.sketchId}`,
        semanticId: input.sketchId,
        semanticType: 'sketch.intent',
        projectionRole: 'provisional',
        label: input.sketchId,
        family: 'SketchIntent',
        detailLevel: 'B',
        summary: `cells:${input.affectedCellIds.length}`,
        positionHint: { x: 0, y: 0 },
      },
      {
        viewId: `view:node:${input.fieldId}`,
        semanticId: input.fieldId,
        semanticType: 'field.distance',
        projectionRole: 'provisional',
        label: input.fieldId,
        family: 'Field',
        detailLevel: 'B',
        positionHint: { x: 280, y: 0 },
      },
      {
        viewId: `view:node:${input.patternId}`,
        semanticId: input.patternId,
        semanticType: 'pattern.compose',
        projectionRole: 'context',
        label: input.patternId,
        family: 'Pattern',
        detailLevel: 'B',
        positionHint: { x: 560, y: 0 },
      },
    ],
    edges: [
      {
        viewId: `view:edge:${input.sketchId}->${input.fieldId}`,
        relationshipId: `rel:${input.sketchId}:derives-from:${input.fieldId}`,
        fromSemanticId: input.sketchId,
        toSemanticId: input.fieldId,
        relationType: 'derives-from',
        presentationType: 'DERIVES_FROM',
        label: 'derives',
      },
      {
        viewId: `view:edge:${input.fieldId}->${input.patternId}`,
        relationshipId: `rel:${input.fieldId}:applies-to:${input.patternId}`,
        fromSemanticId: input.fieldId,
        toSemanticId: input.patternId,
        relationType: 'applies-to',
        presentationType: 'APPLIES_TO',
        label: 'applies to',
      },
    ],
    layoutHints: { mode: 'pattern', anchorSemanticId: input.patternId },
  };
}
