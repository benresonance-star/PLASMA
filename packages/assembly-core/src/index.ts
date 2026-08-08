export {
  ComponentDefinitionSchema,
  ComponentInstanceSchema,
  MateTypeSchema,
  MateSchema,
  JointSchema,
  InterfaceSchema,
  ConnectionIntentSchema,
  type ComponentDefinition,
  type ComponentInstance,
  type Mate,
  type Joint,
  type Interface,
  type ConnectionIntent,
} from './types.js';
export { AssemblyRegistry } from './registry.js';
export { buildA01AssemblyFixture, type A01Fixture } from './fixture-a01.js';
export {
  ConnectionSchema,
  assertNotMate,
  connectsToRelations,
  type Connection,
  type ConnectsToRelation,
} from './connections.js';
export {
  DEMO_FASTENER_LIBRARY,
  applyBoltedPlatePattern,
  syncHolesForConnection,
  type BoltedPlatePatternResult,
  type FastenerSpec,
  type HoleRequirement,
} from './fasteners.js';
export {
  fabricationReadyBlocked,
  validateConnection,
  type ConnectionValidationInput,
  type ConnectionValidationIssue,
  type ConnectionValidationSeverity,
} from './connection-validation.js';
