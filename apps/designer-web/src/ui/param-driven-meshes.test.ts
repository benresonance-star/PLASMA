import { describe, expect, it } from 'vitest';
import { g8ApplyLiveMeshes, g8PreviewLength, createG8Session } from '../g8-session.js';
import type { DisplayMeshInput } from '../mesh-bridge.js';
import { scaleArmMeshes } from './mesh-length.js';

function stubArm(id: string, length: number): DisplayMeshInput {
  return {
    representationId: `r:${id}`,
    semanticOwner: id,
    vertices: [
      [0, 0, 0],
      [length, 0, 0],
      [length, 10, 0],
      [0, 10, 0],
    ],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

describe('parameter-driven meshes wiring', () => {
  it('reference + service layers both lengthen when preview factor applied', () => {
    let g8 = createG8Session(0);
    const reference = [stubArm('component:y:0000', 2300)];
    const service = [stubArm('component:y:0000', 2300)];
    g8 = g8ApplyLiveMeshes(g8, reference, 2300, 1);
    g8 = g8PreviewLength(g8, 2100);
    const servicePreview = scaleArmMeshes(service, 2100 / 2300);
    expect(g8.meshes[0]!.vertices[1]![0]).toBeCloseTo(2100, 0);
    expect(servicePreview[0]!.vertices[1]![0]).toBeCloseTo(2100, 0);
  });
});
