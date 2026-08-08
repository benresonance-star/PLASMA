import { describe, expect, it } from 'vitest';
import {
  buildD01SemanticFixture,
  createSemanticGraph,
  downstream,
  hasDirectedCycle,
  parseAffector,
  parseConstraint,
  parseParameter,
  parseRelationship,
  parseRule,
  upstream,
  CURRENT_SCHEMA_VERSION,
} from './index.js';

const now = '2026-08-08T00:00:00.000Z';

describe('G1.2 parameters', () => {
  it('requires units on quantities', () => {
    expect(() =>
      parseParameter({
        id: 'param:demo:1',
        kind: 'Parameter',
        semanticType: 'geometry.length',
        name: 'Length',
        quantity: { value: 10 },
        role: 'design-variable',
        createdAt: now,
        updatedAt: now,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      }),
    ).toThrow();
  });

  it('enforces domain bounds', () => {
    expect(() =>
      parseParameter({
        id: 'param:demo:2',
        kind: 'Parameter',
        semanticType: 'geometry.length',
        name: 'Length',
        quantity: { value: 100, unit: 'mm' },
        domain: { min: 4, max: 20 },
        role: 'design-variable',
        createdAt: now,
        updatedAt: now,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      }),
    ).toThrow(/domain/);
  });
});

describe('G1.3 relationships and graph', () => {
  it('traverses upstream and downstream', () => {
    const a = {
      id: 'entity:a:1',
      kind: 'Entity' as const,
      semanticType: 'demo',
      name: 'A',
      createdAt: now,
      updatedAt: now,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
    const b = { ...a, id: 'entity:b:1', name: 'B' };
    const rel = parseRelationship({
      id: 'rel:a-depends-b',
      kind: 'Relationship',
      semanticType: 'relation.depends-on',
      name: 'a depends b',
      relationType: 'depends-on',
      from: a.id,
      to: b.id,
      createdAt: now,
      updatedAt: now,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    const graph = createSemanticGraph([a, b], [rel]);
    expect(downstream(graph, a.id)).toEqual([b.id]);
    expect(upstream(graph, b.id)).toEqual([a.id]);
    expect(hasDirectedCycle(graph)).toBe(false);
  });

  it('detects cycles', () => {
    const a = {
      id: 'entity:a:2',
      kind: 'Entity' as const,
      semanticType: 'demo',
      name: 'A',
      createdAt: now,
      updatedAt: now,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
    const b = { ...a, id: 'entity:b:2', name: 'B' };
    const graph = createSemanticGraph(
      [a, b],
      [
        parseRelationship({
          id: 'rel:a-b',
          kind: 'Relationship',
          semanticType: 'relation.depends-on',
          name: 'a->b',
          relationType: 'depends-on',
          from: a.id,
          to: b.id,
          createdAt: now,
          updatedAt: now,
          schemaVersion: CURRENT_SCHEMA_VERSION,
        }),
        parseRelationship({
          id: 'rel:b-a',
          kind: 'Relationship',
          semanticType: 'relation.depends-on',
          name: 'b->a',
          relationType: 'depends-on',
          from: b.id,
          to: a.id,
          createdAt: now,
          updatedAt: now,
          schemaVersion: CURRENT_SCHEMA_VERSION,
        }),
      ],
    );
    expect(hasDirectedCycle(graph)).toBe(true);
  });
});

describe('G1.4 constraints rules affectors', () => {
  it('rejects arbitrary JS in rules', () => {
    expect(() =>
      parseRule({
        id: 'rule:bad:1',
        kind: 'Rule',
        semanticType: 'logic.rule',
        name: 'Bad',
        when: { all: [{ property: 'x', equals: 1 }] },
        then: [{ action: 'tag', tag: 'x' }],
        javascript: 'return true',
        createdAt: now,
        updatedAt: now,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      }),
    ).toThrow(/arbitrary code/);
  });

  it('parses constraint taxonomy and affectors', () => {
    const c = parseConstraint({
      id: 'constraint:demo:1',
      kind: 'Constraint',
      semanticType: 'fabrication.maximum-length',
      name: 'Max length',
      category: 'fabrication',
      operator: 'less-than-or-equal',
      property: 'fabrication.memberLength',
      limit: { value: 2400, unit: 'mm' },
      severity: 'hard',
      reason: 'Transport',
      createdAt: now,
      updatedAt: now,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    expect(c.category).toBe('fabrication');

    const a = parseAffector({
      id: 'affector:demo:1',
      kind: 'Affector',
      semanticType: 'geometry.plane-cut',
      name: 'Cut',
      coordinateSpace: 'world',
      operation: 'subtract',
      target: 'assembly:demo:1',
      preserveSemanticIdentity: true,
      createdAt: now,
      updatedAt: now,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    expect(a.coordinateSpace).toBe('world');
  });
});

describe('G1 gate fixture', () => {
  it('represents and validates D01 semantic fixture without geometry', () => {
    const graph = buildD01SemanticFixture();
    expect(graph.objects.size).toBeGreaterThanOrEqual(8);
    expect(graph.relationships.length).toBeGreaterThanOrEqual(3);
    expect(hasDirectedCycle(graph)).toBe(false);
    expect(graph.objects.get('param:d01.diameter')?.kind).toBe('Parameter');
    expect(graph.objects.get('affector:d01.world-cut-01')?.kind).toBe('Affector');
  });
});
