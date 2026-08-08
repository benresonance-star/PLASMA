export const SEMANTIC_KINDS = [
  'Model',
  'Entity',
  'Parameter',
  'Relationship',
  'Primitive',
  'Feature',
  'Pattern',
  'Constraint',
  'Rule',
  'Affector',
  'Assembly',
  'Material',
  'Connection',
  'Fastener',
  'Representation',
  'Analysis',
  'Objective',
  'Measurement',
  'Dimension',
  'Output',
  'OperatorReference',
  'Selector',
  'Variant',
  'VariantSet',
  'Datum',
  'Tolerance',
  'GeometricTolerance',
  'ManufacturingFeature',
  'InspectionRequirement',
  'PMIAnnotation',
  'PackageReference',
] as const;

export type SemanticKind = (typeof SEMANTIC_KINDS)[number];

export function isSemanticKind(value: string): value is SemanticKind {
  return (SEMANTIC_KINDS as readonly string[]).includes(value);
}
