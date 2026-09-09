import { describe, expect, it } from 'vitest';
import { IndexedSemanticGraph } from '@spds/semantic-query';
import { GraphProjectionSchema, parseGraphProjection } from './types.js';
import {
  layoutCausalColumns,
  projectCausalNeighbourhood,
  resolveCausalAnchorId,
} from './project.js';

describe('projectCausalNeighbourhood', () => {
  const graph = new IndexedSemanticGraph([
    { id: 'param:a', semanticType: 'parameter.number' },
    { id: 'pattern:p', semanticType: 'pattern.y-network' },
    { id: 'component:y:1', semanticType: 'structural.y-component' },
  ]);
  const edges = [
    { from: 'param:a', to: 'pattern:p', relationType: 'pattern.drives' },
    { from: 'pattern:p', to: 'component:y:1', relationType: 'produces' },
  ];

  it('requires semanticId on every node and keeps disposable view ids distinct', () => {
    const proj = projectCausalNeighbourhood({
      graph,
      dependencyEdges: edges,
      focusObjectIds: ['component:y:1'],
      radius: 2,
    });
    const parsed = parseGraphProjection(proj);
    expect(parsed.nodes.length).toBeGreaterThan(0);
    for (const n of parsed.nodes) {
      expect(n.semanticId.length).toBeGreaterThan(0);
      expect(n.viewId.startsWith('view:node:')).toBe(true);
      expect(n.viewId).not.toBe(n.semanticId);
      expect(n.projectionRole).toBeTruthy();
    }
    expect(parsed.nodes.some((n) => n.projectionRole === 'focus')).toBe(true);
    expect(parsed.edges.every((e) => e.relationshipId.length > 0)).toBe(true);
  });

  it('expands a selected component into the full pattern system (params → pattern → siblings)', () => {
    const owners = ['component:y:0000', 'component:y:0001', 'component:y:0002'] as const;
    const d01Graph = new IndexedSemanticGraph([
      { id: 'param:d01:armWidthMm', semanticType: 'parameter.number' },
      { id: 'param:d01:lengthMm', semanticType: 'parameter.number' },
      { id: 'param:d01:structuralDepthMm', semanticType: 'parameter.number' },
      { id: 'pattern:d01:y-network', semanticType: 'pattern.y-network' },
      ...owners.map((id) => ({ id, semanticType: 'structural.y-component' })),
    ]);
    const d01Edges = [
      {
        from: 'param:d01:armWidthMm',
        to: 'pattern:d01:y-network',
        relationType: 'pattern.drives',
      },
      {
        from: 'param:d01:lengthMm',
        to: 'pattern:d01:y-network',
        relationType: 'pattern.drives',
      },
      {
        from: 'param:d01:structuralDepthMm',
        to: 'pattern:d01:y-network',
        relationType: 'pattern.drives',
      },
      ...owners.map((id) => ({
        from: 'pattern:d01:y-network',
        to: id,
        relationType: 'produces',
      })),
      // Redundant shortcuts that previously starred into the focus entity.
      ...owners.flatMap((id) =>
        ['param:d01:armWidthMm', 'param:d01:lengthMm', 'param:d01:structuralDepthMm'].map(
          (from) => ({ from, to: id, relationType: 'depends-on' }),
        ),
      ),
    ];

    const proj = projectCausalNeighbourhood({
      graph: d01Graph,
      dependencyEdges: d01Edges,
      focusObjectIds: ['component:y:0000'],
      radius: 1,
    });

    const ids = new Set(proj.nodes.map((n) => n.semanticId));
    expect(ids.has('pattern:d01:y-network')).toBe(true);
    expect(ids.has('param:d01:lengthMm')).toBe(true);
    expect(ids.has('component:y:0000')).toBe(true);
    expect(ids.has('component:y:0001')).toBe(true);
    expect(ids.has('component:y:0002')).toBe(true);

    expect(proj.edges.some((e) => e.relationType === 'depends-on')).toBe(false);
    expect(
      proj.edges.some(
        (e) =>
          e.fromSemanticId.startsWith('param:') &&
          e.toSemanticId === 'pattern:d01:y-network',
      ),
    ).toBe(true);
    expect(
      proj.edges.filter((e) => e.fromSemanticId === 'pattern:d01:y-network').length,
    ).toBe(3);

    const byId = new Map(proj.nodes.map((n) => [n.semanticId, n]));
    const paramX = byId.get('param:d01:lengthMm')!.positionHint!.x;
    const patternX = byId.get('pattern:d01:y-network')!.positionHint!.x;
    const entityX = byId.get('component:y:0000')!.positionHint!.x;
    expect(paramX).toBeLessThan(patternX);
    expect(patternX).toBeLessThan(entityX);
    expect(byId.get('component:y:0000')!.projectionRole).toBe('focus');
  });

  it('lays out families in Parameter | Pattern | Entity columns with stable id order', () => {
    const positions = layoutCausalColumns([
      {
        semanticId: 'component:y:1',
        family: 'Entity',
        projectionRole: 'focus',
      },
      {
        semanticId: 'param:a',
        family: 'Parameter',
        projectionRole: 'upstream',
      },
      {
        semanticId: 'pattern:p',
        family: 'Pattern',
        projectionRole: 'upstream',
      },
      {
        semanticId: 'component:y:2',
        family: 'Entity',
        projectionRole: 'downstream',
      },
    ]);
    expect(positions.get('param:a')!.x).toBe(0);
    expect(positions.get('pattern:p')!.x).toBe(280);
    expect(positions.get('component:y:1')!.x).toBe(560);
    expect(positions.get('component:y:2')!.x).toBe(560);
    // Stable lexicographic order — selection must not reshuffle rows.
    expect(positions.get('component:y:1')!.y).toBeLessThan(positions.get('component:y:2')!.y);
  });

  it('keeps a stable pattern anchor when selecting parameters', () => {
    const edges = [
      { from: 'param:d01:lengthMm', to: 'pattern:d01:y-network', relationType: 'pattern.drives' },
      { from: 'pattern:d01:y-network', to: 'component:y:0000', relationType: 'produces' },
      { from: 'param:d01:lengthMm', to: 'model:x', relationType: 'part-of' },
    ];
    expect(resolveCausalAnchorId('param:d01:lengthMm', edges)).toBe('pattern:d01:y-network');
    expect(resolveCausalAnchorId('component:y:0000', edges)).toBe('pattern:d01:y-network');
    expect(resolveCausalAnchorId('pattern:d01:y-network', edges)).toBe('pattern:d01:y-network');
  });

  it('does not pull model containers into the lens via part-of', () => {
    const g = new IndexedSemanticGraph([
      { id: 'param:d01:lengthMm', semanticType: 'parameter.number' },
      { id: 'pattern:d01:y-network', semanticType: 'pattern.y-network' },
      { id: 'component:y:0000', semanticType: 'structural.y-component' },
      { id: 'model:x', semanticType: 'model.root' },
    ]);
    const edges = [
      { from: 'param:d01:lengthMm', to: 'pattern:d01:y-network', relationType: 'pattern.drives' },
      { from: 'pattern:d01:y-network', to: 'component:y:0000', relationType: 'produces' },
      { from: 'param:d01:lengthMm', to: 'model:x', relationType: 'part-of' },
    ];
    const proj = projectCausalNeighbourhood({
      graph: g,
      dependencyEdges: edges,
      focusObjectIds: ['pattern:d01:y-network'],
      highlightObjectIds: ['param:d01:lengthMm'],
      radius: 1,
    });
    expect(proj.nodes.map((n) => n.semanticId)).not.toContain('model:x');
    expect(proj.nodes.find((n) => n.semanticId === 'param:d01:lengthMm')?.projectionRole).toBe(
      'focus',
    );
  });

  it('rejects projections missing semanticId', () => {
    expect(() =>
      GraphProjectionSchema.parse({
        projectionId: 'x',
        focusObjectIds: [],
        depth: 'system',
        relationshipTypes: [],
        causalRadius: 1,
        nodes: [
          {
            viewId: 'v1',
            semanticType: 'x',
            projectionRole: 'focus',
            label: 'x',
          },
        ],
        edges: [],
        layoutHints: { mode: 'causal' },
      }),
    ).toThrow();
  });
});
