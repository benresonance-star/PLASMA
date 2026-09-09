import { describe, expect, it } from 'vitest';
import { IndexedSemanticGraph } from '@spds/semantic-query';
import {
  buildPatternCard,
  patternGraph,
  showOperatorsAt,
} from '@spds/graph-projection';
import { projectionToReactFlow } from './reactflow-adapter.js';

describe('SDI SD3 pattern inspector gate', () => {
  it('shows pattern cards without operators at SYSTEM depth', () => {
    const owners = ['component:y:0000', 'component:y:0001', 'component:y:0002'];
    const graph = new IndexedSemanticGraph([
      { id: 'param:d01:lengthMm', semanticType: 'parameter.number' },
      { id: 'pattern:d01:y-network', semanticType: 'pattern.y-network' },
      ...owners.map((id) => ({ id, semanticType: 'structural.y-component' })),
    ]);
    const edges = [
      {
        from: 'param:d01:lengthMm',
        to: 'pattern:d01:y-network',
        relationType: 'pattern.drives',
      },
      ...owners.map((id) => ({
        from: 'pattern:d01:y-network',
        to: id,
        relationType: 'produces',
      })),
    ];

    expect(showOperatorsAt('C', 'system')).toBe(false);
    const projection = patternGraph({
      patternId: 'pattern:d01:y-network',
      graph,
      dependencyEdges: edges,
      depth: 'system',
      parameters: { lengthMm: 2300, armWidthMm: 40 },
      operatorBindings: { 'op:extrude': 'occt.extrude' },
    });
    const pattern = projection.nodes.find((n) => n.semanticId === 'pattern:d01:y-network');
    expect(pattern?.card).toBeDefined();
    expect(pattern?.card?.operators ?? []).toEqual([]);
    expect(projection.nodes.every((n) => n.family !== 'Operator')).toBe(true);

    const { nodes } = projectionToReactFlow(projection);
    expect(nodes.some((n) => n.type === 'sdiPattern')).toBe(true);
    expect(nodes.find((n) => n.type === 'sdiPattern')?.data.card?.title).toBeTruthy();

    const execCard = buildPatternCard({
      inspector: {
        patternId: 'pattern:d01:y-network',
        name: 'y-network',
        draftOnly: true,
        parameters: { lengthMm: 2300 },
        nodes: [],
        operatorBindings: { 'op:extrude': 'occt.extrude' },
      },
      depth: 'execution',
    });
    expect(execCard.operators.length).toBeGreaterThan(0);
  });
});
