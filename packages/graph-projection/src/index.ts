export {
  SemanticDepthSchema,
  ProjectionRoleSchema,
  GraphViewNodeSchema,
  GraphViewEdgeSchema,
  LayoutHintsSchema,
  GraphProjectionSchema,
  parseGraphProjection,
  type SemanticDepth,
  type ProjectionRole,
  type GraphViewNode,
  type GraphViewEdge,
  type LayoutHints,
  type GraphProjection,
} from './types.js';
export {
  layoutCausalColumns,
  projectCausalNeighbourhood,
  resolveCausalAnchorId,
  type ProjectCausalNeighbourhoodInput,
} from './project.js';
export {
  buildPatternCard,
  detailLevelForDepth,
  showOperatorsAt,
  type DetailLevel,
  type PatternCardPayload,
} from './pattern-card.js';
export {
  buildPatternInspector,
  type PatternInspectorView,
  type PatternNodeView,
} from './pattern-types.js';
export { patternGraph } from './pattern-graph.js';
export { applyLenses, type LensId } from './filters.js';
export { aggregateByFamily, expandAggregate } from './aggregates.js';
export { impactFromChangeSet, impactFromParameter } from './impact.js';
export {
  pendingChangeSetTargetIds,
  projectChangeSetDelta,
  type DeltaChangeSet,
  type DeltaChangeSetOp,
} from './changeset-delta.js';
export { executionGraph } from './execution-graph.js';
export { projectSketchComposition } from './sketch.js';
export { projectHistoryDelta, type HistoryOrVariant } from './history-delta.js';
export { generateSyntheticGraph, assertProjectionBudget } from './generators.js';
export { createProjectionCache, type ProjectionCacheKey } from './projection-cache.js';
export {
  SD12_BUDGETS,
  assertScaleBudgets,
  assertSyntheticConnectivity,
  buildScaleGraph,
  measureCacheHitMs,
  projectScaleNeighbourhood,
  regressionExceeded,
  runScaleBench,
  type ScaleBenchTimings,
  type ScaleSize,
} from './sd12-scale-bench.js';

export {
  buildWhatIfSessionStub,
  type WhatIfPreview,
  type WhatIfRequest,
} from './what-if.js';
export {
  FIELD_GRID_SIZE,
  projectFieldInfluence,
  type FieldInfluenceOverlay,
  type FieldInfluenceProjection,
} from './fields.js';
export {
  allConstraintTintTokens,
  buildConstraintTintPass,
  constraintTintToken,
  resolveConstraintOwners,
  type ConstraintEvalStatus,
  type ConstraintOwnerResolution,
  type ConstraintTintToken,
} from './constraint-influence.js';
