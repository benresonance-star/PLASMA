import { describe, expect, it } from 'vitest';
import { ProvenanceStore } from '@spds/topology-provenance';
import { controllingParameters } from './controlling-parameters.js';
import { IndexedSemanticGraph } from './graph.js';
import { buildValueProvenance } from './value-provenance.js';

describe('SDI SD5 Why / controlling parameters', () => {
  it('returns parameter drivers and explicit incomplete provenance', () => {
    const graph = new IndexedSemanticGraph([
      { id: 'param:d01:lengthMm', semanticType: 'parameter.number' },
      { id: 'constraint:max-span', semanticType: 'constraint.span' },
      { id: 'pattern:d01:y-network', semanticType: 'pattern.y-network' },
      { id: 'component:y:0000', semanticType: 'structural.y-component' },
    ]);
    const edges = [
      { from: 'param:d01:lengthMm', to: 'pattern:d01:y-network', relationType: 'pattern.drives' },
      { from: 'constraint:max-span', to: 'pattern:d01:y-network', relationType: 'constrains' },
      { from: 'pattern:d01:y-network', to: 'component:y:0000', relationType: 'produces' },
    ];
    const ctrl = controllingParameters({
      objectId: 'component:y:0000',
      dependencyEdges: edges,
      graph,
      radius: 3,
    });
    expect(ctrl.drivers).toContain('param:d01:lengthMm');
    expect(ctrl.limiters).toContain('constraint:max-span');

    const empty = buildValueProvenance({
      targetId: 'component:missing',
      provenance: new ProvenanceStore(),
    });
    expect(empty.complete).toBe(false);
    expect(empty.steps.some((s) => s.kind === 'incomplete')).toBe(true);

    const store = new ProvenanceStore();
    store.write({
      id: 'prov:1',
      semanticAnchor: 'component:y:0000',
      relation: 'generated-from',
      pirOperationId: 'pir:1',
      kernelResultId: 'kernel:1',
      subElementIds: [],
      causes: ['pattern:d01:y-network', 'param:d01:lengthMm'],
    });
    const complete = buildValueProvenance({
      targetId: 'component:y:0000',
      provenance: store,
      valueLabel: 'length 2300 mm',
    });
    expect(complete.complete).toBe(true);
    expect(complete.steps.some((s) => s.kind === 'actual')).toBe(true);
  });
});
