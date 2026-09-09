export { IndexedSemanticGraph, type QueryableObject } from './graph.js';
export { QueryAstSchema, executeQuery, type QueryAst, type QueryResult } from './query.js';
export { traceLineage, explainObject, type TraceStep, type ExplainPacket } from './explain.js';
export { buildG3bFixture } from './fixture.js';
export {
  walkNeighbourhood,
  upstream,
  downstream,
  type DependencyEdge,
} from './neighbourhood.js';
export { controllingParameters } from './controlling-parameters.js';
export {
  buildValueProvenance,
  type ValueProvenanceKind,
  type ValueProvenanceStep,
} from './value-provenance.js';
