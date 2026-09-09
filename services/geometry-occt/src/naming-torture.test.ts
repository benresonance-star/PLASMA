import { describe, expect, it } from 'vitest';
import { parseGeometryCompileRequest } from '@spds/geometry-contracts';
import { compileMeshesExact } from './compile-meshes.js';

function compileAtLength(lengthMm: number) {
  return parseGeometryCompileRequest({
    snapshotHash: `snap:torture:${lengthMm}`,
    pirHash: 'pir:torture',
    dagHash: 'dag:torture',
    compilerVersion: 'torture',
    parameters: { lengthMm },
    ops: [
      {
        op: 'geometry.sweep@1.0.0',
        semanticOwner: 'component:y:0000',
        pirOperationId: 'pir:y-brep:component:y:0000',
        path: [
          [0, 0, 0],
          [lengthMm / 2, 0, 0],
        ],
        profileWidthMm: 60,
        profileDepthMm: 180,
        wallThicknessMm: 8,
      },
      {
        op: 'geometry.sweep@1.0.0',
        semanticOwner: 'component:y:0001',
        pirOperationId: 'pir:y-brep:component:y:0001',
        path: [
          [0, 0, 0],
          [0, lengthMm / 2, 0],
        ],
        profileWidthMm: 60,
        profileDepthMm: 180,
        wallThicknessMm: 8,
      },
    ],
  });
}

describe('K6.1 naming torture', () => {
  it('regen and length-edit keep semantic owners (no Face17 persistence)', async () => {
    const a = await compileMeshesExact(compileAtLength(1000));
    const b = await compileMeshesExact(compileAtLength(1000));
    const c = await compileMeshesExact(compileAtLength(2500));

    const ownersA = a.meshes.map((m) => m.semanticOwner).sort();
    const ownersB = b.meshes.map((m) => m.semanticOwner).sort();
    const ownersC = c.meshes.map((m) => m.semanticOwner).sort();
    expect(ownersA).toEqual(ownersB);
    expect(ownersA).toEqual(ownersC);
    expect(ownersA).toEqual(['component:y:0000', 'component:y:0001']);

    const blob = JSON.stringify([...a.meshes, ...c.meshes]);
    expect(blob).not.toMatch(/Face\d+/i);
    expect(a.compileHash).not.toBe(c.compileHash);
  });
});
