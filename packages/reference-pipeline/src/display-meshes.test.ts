import { describe, expect, it } from 'vitest';
import { buildD01DisplayMeshes } from './display-meshes.js';

describe('RC-01 D01 display meshes', () => {
  it('tessellates live D01 representations with semantic owners', async () => {
    const result = await buildD01DisplayMeshes({ yLimit: 3 });
    expect(result.source).toBe('d01-reference-pipeline');
    expect(result.meshes).toHaveLength(9);
    expect(result.meshes.every((m) => m.triangleCount > 0)).toBe(true);
    expect(result.meshes.every((m) => m.semanticOwner.length > 0)).toBe(true);
    expect(result.pipelineHash).toHaveLength(64);
  });
});
