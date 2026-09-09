import { describe, expect, it } from 'vitest';
import { impactFromChangeSet, impactFromParameter } from './impact.js';
import { projectChangeSetDelta } from './changeset-delta.js';
import type { GraphProjection } from './types.js';

describe('impactFromChangeSet (T7b)', () => {
  const edges = [
    { from: 'param:d01:length', to: 'component:y:0000', relationType: 'drives' },
    { from: 'component:y:0000', to: 'mesh:y:0000', relationType: 'generates' },
  ];

  it('lists direct + downstream ids for D01 param update', () => {
    const t0 = performance.now();
    const impact = impactFromChangeSet({
      changeSet: {
        commands: [{ op: 'update', targetId: 'param:d01:length', payload: { lengthMm: 2100 } }],
      },
      dependencyEdges: edges,
    });
    expect(performance.now() - t0).toBeLessThan(20);
    expect(impact.directIds).toEqual(['param:d01:length']);
    expect(impact.downstreamIds).toEqual(
      expect.arrayContaining(['component:y:0000', 'mesh:y:0000']),
    );
    expect(impact.invalidatesOn).toEqual(
      expect.arrayContaining(['param:d01:length', 'component:y:0000', 'mesh:y:0000']),
    );
    expect(
      impactFromParameter({ parameterId: 'param:d01:length', dependencyEdges: edges })
        .downstreamIds,
    ).toHaveLength(2);
  });

  it('projectChangeSetDelta annotates update/create/apply_pattern', () => {
    const base: GraphProjection = {
      projectionId: 'proj:test',
      depth: 'logic',
      focusObjectIds: ['param:d01:length'],
      relationshipTypes: ['drives'],
      causalRadius: 1,
      nodes: [
        {
          viewId: 'view:node:param:d01:length',
          semanticId: 'param:d01:length',
          semanticType: 'parameter.length',
          projectionRole: 'focus',
          label: 'length',
          family: 'Parameter',
          detailLevel: 'A',
        },
      ],
      edges: [],
      layoutHints: { mode: 'causal' },
    };
    const t0 = performance.now();
    const projected = projectChangeSetDelta({
      base,
      changeSet: {
        commands: [
          { op: 'update', targetId: 'param:d01:length', payload: { lengthMm: 2100 } },
          { op: 'create', targetId: 'folder:ai:1', payload: { semanticType: 'ui.folder' } },
          {
            op: 'apply_pattern',
            targetId: 'pattern:goldberg-cellular-topology@1.0.0',
            payload: { frequency: 2 },
          },
        ],
      },
    });
    expect(performance.now() - t0).toBeLessThan(50);
    expect(projected.nodes.find((n) => n.semanticId === 'param:d01:length')?.summary).toBe(
      'update',
    );
    expect(projected.nodes.find((n) => n.semanticId === 'folder:ai:1')?.summary).toBe('create');
    expect(
      projected.nodes.find((n) => n.semanticId === 'pattern:goldberg-cellular-topology@1.0.0')
        ?.summary,
    ).toBe('apply_pattern');
  });
});
