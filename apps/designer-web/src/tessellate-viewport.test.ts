import { describe, expect, it } from 'vitest';
import { InProcessGeometryKernel } from '@spds/geometry-contracts';
import { applyDisplayMeshesToViewport } from './mesh-bridge.js';
import {
  createViewportState,
  pickMesh,
  publicationChromeLabel,
} from './viewport.js';

describe('E7 tessellate → viewport end-to-end', () => {
  it('bridges kernel tessellation into candidate viewport with semantic pick', () => {
    const kernel = new InProcessGeometryKernel();
    const rep = kernel.sweep({
      semanticOwner: 'y:viewport:01',
      pirOperationId: 'pir:viewport:01',
      path: [
        [0, 0, 0],
        [120, 0, 0],
      ],
      profileWidthMm: 40,
      profileDepthMm: 40,
    });
    const mesh = kernel.tessellate({
      representationId: rep.id,
      chordDeviationMm: 1,
      angleDeviationDeg: 20,
    });

    const state = applyDisplayMeshesToViewport(createViewportState(), [
      {
        representationId: rep.id,
        semanticOwner: rep.semanticOwner,
        vertices: mesh.vertices,
        indices: mesh.indices,
      },
    ]);

    expect(publicationChromeLabel(state.chrome)).toBe('Candidate revision');
    expect(state.meshes[0]?.triangleCount).toBeGreaterThan(0);
    const picked = pickMesh(state, `mesh:${rep.id}`);
    expect(picked.pickedSemanticId).toBe('y:viewport:01');
  });
});
