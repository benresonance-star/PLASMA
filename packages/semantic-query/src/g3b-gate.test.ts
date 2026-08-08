import { describe, expect, it } from 'vitest';
import { parseSelector, resolveSelector } from '@spds/selectors';
import { surviveRegeneration } from '@spds/topology-provenance';
import { explainObject, traceLineage } from './explain.js';
import { buildG3bFixture } from './fixture.js';
import { executeQuery } from './query.js';

describe('G3B gate', () => {
  it('queries Y adjacent to pentagon and parts length > 2400', () => {
    const { graph } = buildG3bFixture();
    const yAdj = executeQuery(graph, {
      op: 'FILTER',
      where: { semanticType: 'structural.y-component', adjacentToType: 'topology.cell' },
    });
    expect(yAdj.ids).toContain('component:y:0042');

    const longParts = executeQuery(graph, {
      op: 'FILTER',
      where: { semanticType: 'product.part', attribute: 'lengthMm', gt: 2400 },
    });
    expect(longParts.ids).toEqual(['part:panel:0042']);
  });

  it('survives approved edits, surfaces ambiguity, and EXPLAIN traces causes', () => {
    const fixture = buildG3bFixture();
    const survival = surviveRegeneration({
      path: fixture.persistentPath,
      before: [
        {
          id: 'component:y:0042',
          semanticType: 'structural.y-component',
          subElements: { 'arm:A/mounting-face': 'face:old' },
        },
      ],
      after: [
        {
          id: 'component:y:0042',
          semanticType: 'structural.y-component',
          subElements: { 'arm:A/mounting-face': 'face:new' },
        },
      ],
      remap: { 'face:old': 'face:new' },
    });
    expect(survival.status).toBe('resolved');

    const ambiguous = resolveSelector(
      parseSelector({
        id: 'selector:all-y',
        kind: 'Selector',
        semanticType: 'selection.semantic-query',
        where: { semanticType: 'structural.y-component' },
      }),
      [
        { id: 'component:y:0042', semanticType: 'structural.y-component' },
        { id: 'component:y:0043', semanticType: 'structural.y-component' },
      ],
    );
    expect(ambiguous.status).toBe('ambiguous');

    const steps = traceLineage(fixture.provenance, 'part:panel:0042');
    expect(steps.some((s) => s.pirOperationId === 'pir:panel.derive')).toBe(true);

    const packet = explainObject({
      targetId: 'part:panel:0042',
      graph: fixture.graph,
      provenance: fixture.provenance,
      dependencyEdges: fixture.dependencyEdges,
      changedParameters: ['param:frequency'],
    });
    expect(packet.deterministic).toBe(true);
    expect(packet.whyExists.map((s) => s.semanticAnchor)).toContain('part:panel:0042');
    expect(packet.invalidatesOn).toContain('part:panel:0042');
    expect(packet.invalidatesOn).toContain('component:y:0042');
  });
});
