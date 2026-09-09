import { describe, expect, it } from 'vitest';
import {
  extrusionEdgeTopology,
  extrusionFaceTopology,
} from './extrusion-topology.js';

const profile = [
  [0, 0, 0],
  [10, 0, 0],
  [10, 10, 0],
  [0, 10, 0],
] as const;

describe('stable extrusion edge topology', () => {
  it('derives source-profile edge paths independent of dimensions', () => {
    const short = extrusionEdgeTopology({
      semanticOwner: 'part:panel',
      featurePath: 'profile:extrude',
      profile,
      vector: [0, 0, 5],
    });
    const tall = extrusionEdgeTopology({
      semanticOwner: 'part:panel',
      featurePath: 'profile:extrude',
      profile,
      vector: [0, 0, 20],
    });
    expect(short).toHaveLength(12);
    expect(new Set(short.map((element) => element.path)).size).toBe(12);
    expect(short.map((element) => element.path)).toEqual(
      tall.map((element) => element.path),
    );
    expect(short[0]?.path).toBe(
      'part:panel/profile:extrude/edge:profile-start:0000',
    );
  });

  it('derives stable cap and source-segment side faces', () => {
    const faces = extrusionFaceTopology({
      semanticOwner: 'part:panel',
      featurePath: 'profile:extrude',
      profile,
      vector: [0, 0, 5],
    });
    expect(faces).toHaveLength(6);
    expect(faces.map((face) => face.path)).toEqual([
      'part:panel/profile:extrude/face:profile-start',
      'part:panel/profile:extrude/face:profile-end',
      'part:panel/profile:extrude/face:side:0000',
      'part:panel/profile:extrude/face:side:0001',
      'part:panel/profile:extrude/face:side:0002',
      'part:panel/profile:extrude/face:side:0003',
    ]);
  });
});
