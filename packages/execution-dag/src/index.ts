export {
  buildCacheKey,
  buildExecutionDag,
  planIncrementalInvalidation,
  runMockDag,
  type CacheStatus,
  type CompilerConfig,
  type DagNode,
  type ExecutionDag,
  type NodeStatus,
} from './dag.js';
export {
  buildG3aCompositionFixture,
  G3A_SELECTABLE_UNIVERSE,
  resolveG3aFixture,
  runG3aFixtureTwice,
  type G3aFixtureResult,
} from './pipeline.js';
