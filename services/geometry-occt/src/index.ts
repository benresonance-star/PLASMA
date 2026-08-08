export { ExactKernelAdapter } from './exact-kernel.js';
export { createGeometryKernel, type GeometryKernelBinding } from './kernel-factory.js';
export { buildGeometryServer } from './server.js';
export { generateYBrep, generateD01YFixtureSet } from './y-brep.js';
export {
  applyPlaneCut,
  applyVolumeExclusion,
  applyScalarRadial,
  assertWorldFrame,
  defaultWorldFrame,
  type GeometryAffector,
  type PlaneCutAffector,
  type VolumeExclusionAffector,
  type ScalarAffector,
} from './affectors.js';
export { validateGeometryRepresentation, healSoft, type GeometryValidationReport } from './validation.js';
