import { describe, expect, it } from 'vitest';
import { buildSceneFromDisplayMeshes, pickSemanticFromIntersection } from './three-scene.js';

describe('S3 Three.js viewport scene', () => {
  it('attaches semantic ids to mesh userData (not triangle indices)', () => {
    const { root } = buildSceneFromDisplayMeshes(
      [
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
      ],
      'candidate',
    );
    const mesh = root.children[0]!;
    expect(mesh.userData.semanticId).toBe('y:01');
    expect(mesh.userData.meshId).toBe('mesh:repr:1');
    expect(pickSemanticFromIntersection(mesh.userData)?.semanticId).toBe('y:01');
  });
});
