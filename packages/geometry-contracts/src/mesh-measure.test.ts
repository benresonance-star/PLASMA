import { describe, expect, it } from 'vitest';
import {
  compareDualMeshExtents,
  meshAabb,
  validateLengthMmInDomain,
  validateProposalDualMeasure,
} from './mesh-measure.js';
import type { GeometryCompileMesh } from './compile.js';

function boxMesh(
  owner: string,
  size: number,
  kernel: GeometryCompileMesh['kernel'] = 'exact-adapter',
): GeometryCompileMesh {
  return {
    representationId: `repr:${owner}`,
    semanticOwner: owner,
    pirOperationId: `pir:${owner}`,
    kernel,
    vertices: [
      [0, 0, 0],
      [size, 0, 0],
      [size, size, 0],
      [0, size, 0],
    ],
    indices: [0, 1, 2, 0, 2, 3],
    triangleCount: 2,
    maxDeviationMm: 0,
  };
}

describe('mesh-measure', () => {
  it('computes AABB extents', () => {
    const aabb = meshAabb(boxMesh('y:1', 1000));
    expect(aabb.extentsMm[0]).toBe(1000);
    expect(aabb.extentsMm[1]).toBe(1000);
  });

  it('dual extents agree within tolerance', () => {
    const exact = [boxMesh('component:y:0000', 1000)];
    const occt = [boxMesh('component:y:0000', 1001, 'occt-wasm')];
    const r = compareDualMeshExtents(exact, occt, 3);
    expect(r.ok).toBe(true);
    expect(r.ownersMatch).toBe(true);
  });

  it('fails on owner mismatch and OOR length', () => {
    const exact = [boxMesh('a', 10)];
    const occt = [boxMesh('b', 10, 'occt-wasm')];
    expect(compareDualMeshExtents(exact, occt).reason).toBe('OWNER_MISMATCH');
    expect(validateLengthMmInDomain(100, 500, 4000).ok).toBe(false);
    expect(validateLengthMmInDomain(2000, 500, 4000).ok).toBe(true);
  });

  it('K4.2 proposal dual measure gates OOR and dual agreement', () => {
    expect(
      validateProposalDualMeasure({
        lengthMm: 100,
        minMm: 500,
        maxMm: 4000,
        exactMeshes: [boxMesh('y:1', 100)],
      }).ok,
    ).toBe(false);
    expect(
      validateProposalDualMeasure({
        lengthMm: 2000,
        minMm: 500,
        maxMm: 4000,
        exactMeshes: [boxMesh('y:1', 2000)],
        occtMeshes: [boxMesh('y:1', 2001, 'occt-wasm')],
        extentToleranceMm: 3,
      }).ok,
    ).toBe(true);
  });
});
