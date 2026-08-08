import { describe, expect, it } from 'vitest';
import { meshToAsciiStl, meshToGlbJson, representationsToStepText } from './export-buffers.js';

describe('RC-02 export buffers', () => {
  it('emits non-empty STL/GLB/STEP bytes', () => {
    const vertices = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ] as const;
    const indices = [0, 1, 2];
    const stl = meshToAsciiStl({ name: 't', vertices, indices });
    const glb = meshToGlbJson({ name: 't', vertices, indices });
    const step = representationsToStepText(['y:1']);
    expect(stl.byteLength).toBeGreaterThan(20);
    expect(glb.byteLength).toBeGreaterThan(20);
    expect(new TextDecoder().decode(step)).toContain('MANIFOLD_SOLID_BREP');
  });
});
