import { describe, expect, it } from 'vitest';
import { loftEdgeTopology, loftFaceTopology } from './loft-topology.js';

const profiles = [
  [
    [-5, -5, 0],
    [5, -5, 0],
    [5, 5, 0],
    [-5, 5, 0],
  ],
  [
    [-10, -10, 100],
    [10, -10, 100],
    [10, 10, 100],
    [-10, 10, 100],
  ],
] as const;

describe('stable ruled-loft topology', () => {
  it('names profile and rail edges from source indices', () => {
    const edges = loftEdgeTopology({
      semanticOwner: 'part:loft',
      featurePath: 'profile:loft',
      profiles,
    });
    expect(edges).toHaveLength(12);
    expect(edges[0]?.path).toBe(
      'part:loft/profile:loft/edge:profile:0000:0000',
    );
    expect(edges[8]?.path).toBe(
      'part:loft/profile:loft/edge:rail:0000:0000',
    );
  });

  it('names caps and ruled side faces from source intervals', () => {
    const faces = loftFaceTopology({
      semanticOwner: 'part:loft',
      featurePath: 'profile:loft',
      profiles,
    });
    expect(faces).toHaveLength(6);
    expect(faces.map((face) => face.path)).toContain(
      'part:loft/profile:loft/face:side:0000:0003',
    );
  });
});
