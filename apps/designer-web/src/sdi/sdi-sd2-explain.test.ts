/**
 * SD2 gate (lite): Explain Selection projects the relevant pattern system for a generated part
 * without dumping unrelated model nodes.
 */

import { describe, expect, it } from 'vitest';
import { buildD01DisplayMeshes } from '@spds/reference-pipeline';
import { IndexedSemanticGraph } from '@spds/semantic-query';
import {
  projectCausalNeighbourhood,
  resolveCausalAnchorId,
} from '@spds/graph-projection';

describe('SDI SD2 Explain Selection (live substrate)', () => {
  it('projects the full relevant pattern system, not unrelated model nodes', async () => {
    const live = await buildD01DisplayMeshes({ yLimit: 5 });
    const owners = [...new Set(live.meshes.map((mesh) => mesh.semanticOwner))];
    const objects = [
      { id: 'param:d01:lengthMm', semanticType: 'parameter.number' },
      { id: 'pattern:d01:y-network', semanticType: 'pattern.y-network' },
      { id: 'pattern:other', semanticType: 'pattern.other' },
      { id: 'component:unrelated', semanticType: 'structural.other' },
      ...owners.map((id) => ({ id, semanticType: 'structural.y-component' })),
    ];
    const graph = new IndexedSemanticGraph(objects);
    const dependencyEdges = [
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
      {
        from: 'pattern:other',
        to: 'component:unrelated',
        relationType: 'produces',
      },
    ];

    const focus = owners[0]!;
    const anchorId = resolveCausalAnchorId(focus, dependencyEdges);
    const projection = projectCausalNeighbourhood({
      graph,
      dependencyEdges,
      focusObjectIds: [anchorId],
      highlightObjectIds: [focus],
      radius: 1,
      projectionId: `proj:causal:${anchorId}:r1`,
    });

    expect(projection.nodes.some((n) => n.semanticId === focus)).toBe(true);
    expect(projection.nodes.some((n) => n.semanticId === 'pattern:d01:y-network')).toBe(true);
    const projectedYs = projection.nodes.filter((n) =>
      n.semanticId.startsWith('component:y:'),
    );
    // Same-pattern siblings are part of the meaningful causal neighbourhood.
    expect(projectedYs.length).toBe(owners.length);
    expect(projection.nodes.some((n) => n.semanticId === 'component:unrelated')).toBe(false);
    expect(projection.nodes.some((n) => n.semanticId === 'pattern:other')).toBe(false);
    expect(projection.nodes.length).toBeLessThan(objects.length);
  });
});
