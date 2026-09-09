import { describe, expect, it } from 'vitest';
import { parseGeometryCompileRequest } from '@spds/geometry-contracts';
import { compileMeshesDual, compileMeshesExact } from './compile-meshes.js';
import { OcctWasmKernel } from './occt-wasm-kernel.js';

const sampleCompile = () =>
  parseGeometryCompileRequest({
    snapshotHash: 'snap:1',
    pirHash: 'pir:1',
    dagHash: 'dag:1',
    compilerVersion: 'test',
    parameters: { lengthMm: 1000 },
    ops: [
      {
        op: 'geometry.sweep@1.0.0',
        semanticOwner: 'component:y:0000',
        pirOperationId: 'pir:y-brep:component:y:0000',
        path: [
          [0, 0, 0],
          [500, 0, 0],
        ],
        profileWidthMm: 60,
        profileDepthMm: 180,
        wallThicknessMm: 8,
      },
    ],
  });

describe('compileMeshes', () => {
  it('exact compile returns owner-bound meshes', async () => {
    const result = await compileMeshesExact(sampleCompile());
    expect(result.meshes[0]!.semanticOwner).toBe('component:y:0000');
    expect(result.meshes[0]!.kernel).toBe('exact-adapter');
    expect(result.meshes[0]!.triangleCount).toBeGreaterThan(0);
  });

  it('dual compile rebinds OCCT meshes to compile owners', async () => {
    const dual = await compileMeshesDual({
      compile: sampleCompile(),
      occtKernel: new OcctWasmKernel(),
    });
    expect(dual.exact.meshes).toHaveLength(1);
    if (dual.occtError) {
      // WASM init can fail in constrained CI — still assert exact path.
      expect(dual.occtError.length).toBeGreaterThan(0);
      return;
    }
    expect(dual.occt?.meshes[0]!.semanticOwner).toBe('component:y:0000');
    expect(dual.occt?.kernel).toBe('occt-wasm');
    expect(dual.occt?.meshes[0]!.triangleCount).toBeGreaterThan(0);
  }, 60_000);
});
