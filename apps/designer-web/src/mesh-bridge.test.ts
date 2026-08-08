import { describe, expect, it } from 'vitest';
import { applyDisplayMeshesToViewport, displayMeshesToViewportRefs } from './mesh-bridge.js';
import { createViewportState, publicationChromeLabel } from './viewport.js';

describe('E5 viewport mesh bridge', () => {
  it('maps display buffers to semantic picks without B-rep identity', () => {
    const refs = displayMeshesToViewportRefs([
      {
        representationId: 'repr:1',
        semanticOwner: 'y:01',
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        indices: [0, 1, 2],
      },
    ]);
    expect(refs[0]?.semanticId).toBe('y:01');
    expect(refs[0]?.triangleCount).toBe(1);
    expect(refs[0]?.bufferHash.length).toBeGreaterThan(0);

    const state = applyDisplayMeshesToViewport(createViewportState(), [
      {
        representationId: 'repr:1',
        semanticOwner: 'y:01',
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        indices: [0, 1, 2],
      },
    ]);
    expect(publicationChromeLabel(state.chrome)).toBe('Candidate revision');
    expect(state.meshes).toHaveLength(1);
  });
});
