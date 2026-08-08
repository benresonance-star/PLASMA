export { createIcosahedron } from './icosahedron.js';
export { subdivideGeodesic, expectedGeodesicCounts } from './subdivide.js';
export {
  buildGoldbergFromGeodesic,
  adjacencySymmetric,
  type GoldbergTopology,
  type TopologyCell,
  type TopologyEdge,
  type TopologyVertex,
  type TrimClass,
} from './goldberg.js';
export {
  D01_TOPOLOGY_POLICY,
  generateGoldbergTopology,
  generateD01Topology,
  assertD01TopologyInvariants,
  hashTopology,
} from './d01.js';
export {
  createGoldbergTopologyOperator,
  type GoldbergOperatorInput,
} from './operator.js';
export type { Vec3 } from './vec3.js';
