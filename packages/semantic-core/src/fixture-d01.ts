import { CURRENT_SCHEMA_VERSION } from './envelope.js';
import { parseParameter } from './parameters.js';
import { parseRelationship } from './relationships.js';
import { parseConstraint } from './constraints.js';
import { parseRule } from './rules.js';
import { parseAffector } from './affectors.js';
import { createSemanticGraph, type SemanticGraph } from './graph.js';
import { parseSemanticObject } from './envelope.js';

const now = '2026-08-08T00:00:00.000Z';

function base(id: string, kind: string, semanticType: string, name: string) {
  return {
    id,
    kind,
    semanticType,
    name,
    createdAt: now,
    updatedAt: now,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/** Semantic-only D01-like fixture — no geometry required. */
export function buildD01SemanticFixture(): SemanticGraph {
  const model = parseSemanticObject({
    ...base('model:dome-d01', 'Model', 'structure.geodesic-dome', 'D01 Dome'),
  });

  const diameter = parseParameter({
    ...base('param:d01.diameter', 'Parameter', 'geometry.length', 'Dome diameter'),
    quantity: { value: 20000, unit: 'mm' },
    domain: { min: 5000, max: 50000 },
    role: 'design-variable',
    affects: ['geometry', 'mass', 'cost'],
    editableBy: ['user', 'agent'],
  });

  const rise = parseParameter({
    ...base('param:d01.rise', 'Parameter', 'geometry.length', 'Dome rise'),
    quantity: { value: 6500, unit: 'mm' },
    domain: { min: 1000, max: 20000 },
    role: 'design-variable',
    affects: ['geometry'],
    editableBy: ['user', 'agent'],
  });

  const aperture = parseParameter({
    ...base('param:d01.aperture-ratio', 'Parameter', 'geometry.ratio', 'Base aperture ratio'),
    quantity: { value: 0.25, unit: '1' },
    domain: { min: 0.05, max: 0.6 },
    role: 'design-variable',
    affects: ['geometry', 'fabrication'],
    editableBy: ['user', 'agent'],
  });

  const maxMember = parseConstraint({
    ...base(
      'constraint:d01.max-member-length',
      'Constraint',
      'fabrication.maximum-length',
      'Max member length',
    ),
    category: 'fabrication',
    operator: 'less-than-or-equal',
    property: 'fabrication.memberLength',
    limit: { value: 2400, unit: 'mm' },
    severity: 'hard',
    reason: 'Transport and fabrication constraint',
  });

  const clearOpening = parseConstraint({
    ...base(
      'constraint:d01.min-clear-opening',
      'Constraint',
      'validation.clear-opening',
      'Minimum clear opening',
    ),
    category: 'validation',
    operator: 'greater-than-or-equal',
    property: 'fabrication.clearOpening',
    limit: { value: 650, unit: 'mm' },
    severity: 'hard',
    reason: 'Access / egress constraint',
  });

  const perimeterRule = parseRule({
    ...base(
      'rule:d01.perimeter-forming-plate',
      'Rule',
      'fabrication.connection-rule',
      'Perimeter forming plate',
    ),
    when: {
      all: [
        { property: 'entity.semanticType', equals: 'structural.y-component' },
        { property: 'entity.locationClass', equals: 'perimeter' },
      ],
    },
    then: [{ action: 'apply-pattern', pattern: 'pattern:forming-plate' }],
  });

  const worldCut = parseAffector({
    ...base('affector:d01.world-cut-01', 'Affector', 'geometry.plane-cut', 'World cut'),
    coordinateSpace: 'world',
    operation: 'subtract',
    target: 'assembly:dome-primary',
    preserveSemanticIdentity: true,
    parameters: { plane: 'z=0' },
  });

  const assembly = parseSemanticObject({
    ...base('assembly:dome-primary', 'Assembly', 'structure.assembly', 'Primary dome assembly'),
  });

  const rels = [
    parseRelationship({
      ...base('rel:d01.model-has-diameter', 'Relationship', 'relation.part-of', 'model owns diameter'),
      relationType: 'part-of',
      from: diameter.id,
      to: model.id,
    }),
    parseRelationship({
      ...base('rel:d01.model-has-rise', 'Relationship', 'relation.part-of', 'model owns rise'),
      relationType: 'part-of',
      from: rise.id,
      to: model.id,
    }),
    parseRelationship({
      ...base('rel:d01.cut-affects-assembly', 'Relationship', 'relation.affected-by', 'cut affects assembly'),
      relationType: 'affected-by',
      from: assembly.id,
      to: worldCut.id,
    }),
    parseRelationship({
      ...base('rel:d01.assembly-part-of-model', 'Relationship', 'relation.part-of', 'assembly part of model'),
      relationType: 'part-of',
      from: assembly.id,
      to: model.id,
    }),
  ];

  return createSemanticGraph(
    [model, diameter, rise, aperture, maxMember, clearOpening, perimeterRule, worldCut, assembly],
    rels,
  );
}
