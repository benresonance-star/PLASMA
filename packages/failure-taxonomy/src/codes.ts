/** Standardized failure codes (spec section 5B.17). */

export const FAILURE_CODES = [
  'SEMANTIC_INVALID',
  'SCHEMA_INCOMPATIBLE',
  'HEAD_CONFLICT',
  'SELECTOR_UNRESOLVED',
  'SELECTOR_AMBIGUOUS',
  'COMPOSITION_CONFLICT',
  'DEPENDENCY_CYCLE',
  'OPERATOR_UNAVAILABLE',
  'OPERATOR_FAILED',
  'GEOMETRY_INVALID',
  'GEOMETRY_TOLERANCE_EXCEEDED',
  'BOOLEAN_FAILED',
  'HEALING_FAILED',
  'MESH_FAILED',
  'FABRICATION_INVALID',
  'CONSTRAINT_FAILED',
  'IMPORT_UNIT_AMBIGUOUS',
  'RESOURCE_LIMIT',
  'CANCELLED',
  'STALE_RESULT',
  'PUBLICATION_BLOCKED',
  'ARTIFACT_INTEGRITY_FAILED',
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

export function isFailureCode(value: string): value is FailureCode {
  return (FAILURE_CODES as readonly string[]).includes(value);
}
