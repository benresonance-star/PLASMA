import { describe, expect, it } from 'vitest';
import { IndexedSemanticGraph } from '@spds/semantic-query';
import { projectCausalNeighbourhood, projectChangeSetDelta } from '@spds/graph-projection';
import {
  formatRelationHover,
  projectionToReactFlow,
  rfClassForProjectionNode,
  semanticIdsFromRfSelection,
} from './reactflow-adapter.js';

describe('React Flow adapter (SD1)', () => {
  it('round-trips semanticId and does not treat RF id as semantic identity', () => {
    const graph = new IndexedSemanticGraph([
      { id: 'component:y:1', semanticType: 'structural.y-component' },
      { id: 'pattern:p', semanticType: 'pattern.y-network' },
    ]);
    const projection = projectCausalNeighbourhood({
      graph,
      dependencyEdges: [
        { from: 'pattern:p', to: 'component:y:1', relationType: 'produces' },
      ],
      focusObjectIds: ['component:y:1'],
      radius: 1,
    });
    const { nodes, edges } = projectionToReactFlow(projection);
    expect(nodes.every((n) => n.id !== n.data.semanticId)).toBe(true);
    expect(nodes.some((n) => n.data.semanticId === 'component:y:1')).toBe(true);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.every((e) => e.type === 'sdiRelation')).toBe(true);
    expect(edges.every((e) => e.markerEnd != null)).toBe(true);
    expect(edges.every((e) => typeof e.data?.hoverLabel === 'string')).toBe(true);
    expect(edges.some((e) => e.data?.intoGeometry === true && e.data.toSemanticId === 'component:y:1')).toBe(
      true,
    );

    const focus = nodes.find((n) => n.data.semanticId === 'component:y:1')!;
    expect(focus.selected).toBe(true);
    expect(focus.data.family).toBe('Entity');
    expect(semanticIdsFromRfSelection(nodes, [focus.id])).toEqual(['component:y:1']);
  });

  it('formats relationship hover labels', () => {
    expect(
      formatRelationHover({
        label: 'drives',
        fromSemanticId: 'param:d01:lengthMm',
        toSemanticId: 'component:y:0002',
      }),
    ).toBe('drives: lengthMm → y:0002');
  });

  it('D3a: maps provisional / added / changed / removed to distinct RF classes', () => {
    const graph = new IndexedSemanticGraph([
      { id: 'component:y:1', semanticType: 'structural.y-component' },
      { id: 'component:y:2', semanticType: 'structural.y-component' },
      { id: 'param:d01:lengthMm', semanticType: 'parameter.length' },
    ]);
    const base = projectCausalNeighbourhood({
      graph,
      dependencyEdges: [
        { from: 'param:d01:lengthMm', to: 'component:y:1', relationType: 'drives' },
        { from: 'param:d01:lengthMm', to: 'component:y:2', relationType: 'drives' },
      ],
      focusObjectIds: ['param:d01:lengthMm'],
      radius: 1,
    });
    const delta = projectChangeSetDelta({
      base,
      changeSet: {
        commands: [
          { op: 'update', targetId: 'param:d01:lengthMm' },
          { op: 'create', targetId: 'component:y:new' },
          { op: 'delete', targetId: 'component:y:2' },
          { op: 'create_group', targetId: 'folder:preview' },
          { op: 'apply_pattern', targetId: 'pattern:preview' },
          { op: 'connect', targetId: 'component:y:1', payload: { parentId: 'folder:preview' } },
        ],
      },
    });
    const { nodes } = projectionToReactFlow(delta);
    const changed = nodes.find((n) => n.data.semanticId === 'param:d01:lengthMm')!;
    const added = nodes.find((n) => n.data.semanticId === 'component:y:new')!;
    const removed = nodes.find((n) => n.data.semanticId === 'component:y:2')!;
    expect(changed.className).toContain('sdi-rf-node--provisional');
    expect(changed.className).toContain('sdi-rf-node--changed');
    expect(added.className).toContain('sdi-rf-node--provisional');
    expect(added.className).toContain('sdi-rf-node--added');
    expect(removed.className).toContain('sdi-rf-node--removed');
    const removedNode = delta.nodes.find((n) => n.semanticId === 'component:y:2')!;
    expect(rfClassForProjectionNode(removedNode)).toContain('sdi-rf-node--removed');
    for (const id of ['folder:preview', 'pattern:preview']) {
      expect(nodes.find((n) => n.data.semanticId === id)?.className).toContain('sdi-rf-node--added');
    }
    expect(nodes.find((n) => n.data.semanticId === 'component:y:1')?.className).toContain(
      'sdi-rf-node--changed',
    );

    const t0 = performance.now();
    for (let i = 0; i < 100; i += 1) projectionToReactFlow(delta);
    expect(performance.now() - t0).toBeLessThan(10);
  });
});
