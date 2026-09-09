export {
  GeometryErrorSchema,
  Vec3Schema,
  SweepRequestSchema,
  ExtrudeRequestSchema,
  RevolveRequestSchema,
  LoftRequestSchema,
  BooleanRequestSchema,
  TrimPlaneRequestSchema,
  EdgeFilletRequestSchema,
  EdgeChamferRequestSchema,
  FaceShellRequestSchema,
  FaceDraftRequestSchema,
  TessellateRequestSchema,
  ShellRequestSchema,
  MassPropsSchema,
  MeshSchema,
  GeometryTopologyElementSchema,
  GeometryRepresentationSchema,
  type GeometryError,
  type SweepRequest,
  type ExtrudeRequest,
  type RevolveRequest,
  type LoftRequest,
  type BooleanRequest,
  type TrimPlaneRequest,
  type EdgeFilletRequest,
  type EdgeChamferRequest,
  type FaceShellRequest,
  type FaceDraftRequest,
  type TessellateRequest,
  type ShellRequest,
  type GeometryRepresentation,
  type GeometryTopologyElement,
  type Mesh,
} from './dto.js';
export { InProcessGeometryKernel } from './kernel.js';
export {
  meshToAsciiStl,
  meshToGlbJson,
  representationsToStepText,
} from './export-buffers.js';
export {
  GeometryCompileOpSchema,
  GeometryCompileRequestSchema,
  GeometryCompileResultSchema,
  GeometryCompileMeshSchema,
  parseGeometryCompileRequest,
  compileRequestDigest,
  type GeometryCompileOp,
  type GeometryCompileRequest,
  type GeometryCompileResult,
  type GeometryCompileMesh,
} from './compile.js';
export { executeExactCompile, hashCompileMesh } from './compile-exact.js';
export {
  buildOrientedSweepMesh,
  type OrientedSweepMesh,
  type OrientedSweepSection,
  type SweepVec3,
} from './sweep-mesh.js';
export {
  buildExtrusionMesh,
  type ExtrusionMesh,
  type ExtrusionVec3,
  triangulatePlanarProfile,
  type TriangulatedPlanarProfile,
} from './extrusion-mesh.js';
export {
  extrusionEdgeTopology,
  extrusionFaceTopology,
} from './extrusion-topology.js';
export { loftEdgeTopology, loftFaceTopology } from './loft-topology.js';
export {
  buildLoftMesh,
  buildRevolveMesh,
  type FormMesh,
} from './form-mesh.js';
export {
  measureClosedTriangleMesh,
  type ClosedMeshProperties,
  type PropertyVec3,
} from './mesh-properties.js';
export {
  booleanTriangleMeshes,
  type BooleanOperation,
} from './mesh-boolean.js';
export {
  buildPlaneTrimPrism,
  trimTriangleMeshByPlane,
  type PlaneTrimSide,
} from './trim-plane.js';
export {
  meshAabb,
  compareDualMeshExtents,
  validateLengthMmInDomain,
  validateProposalDualMeasure,
  type MeshAabb,
  type DualMeshCompareResult,
  type DualMeasureValidation,
} from './mesh-measure.js';
export {
  MeasureKindSchema,
  MeasureUnitSchema,
  MeasureProvenanceSchema,
  MeasureEngineSchema,
  MeasureRequestSchema,
  MeasureResultSchema,
  MeasureCompareResultSchema,
  boxFeaturePath,
  boxVertices,
  boxEdges,
  boxFaces,
  resolveBoxFeature,
  parseBoxFeaturePath,
  measureBoxFeatures,
  distanceMm,
  angleBetweenEdgesDeg,
  angleBetweenFacesDeg,
  angleBetweenDirectionsDeg,
  compareMeasureResults,
  defaultCompareTolerance,
  midpoint,
  type MeasureKind,
  type MeasureUnit,
  type MeasureProvenance,
  type MeasureEngine,
  type MeasureRequest,
  type MeasureResult,
  type MeasureCompareResult,
  type BoxExtents,
  type BoxVertex,
  type BoxEdge,
  type BoxFace,
  type Vec3,
} from './measure.js';
export {
  triangleArea,
  faceAreaFromTriangleIndex,
  snapNearestVertex,
  snapNearestEdge,
  snapNearestFace,
  assertSemanticFeaturePath,
} from './measure-mesh.js';
