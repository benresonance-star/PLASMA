import { describe, expect, it } from 'vitest';
import {
  applyFamilyRationalisation,
  buildD01FabricationOutputs,
  clusterPartFamilies,
  compileBom,
  createDimension,
  exportArtifact,
  measurePart,
} from './index.js';

describe('G10 fabrication-core', () => {
  it('stores positive measurements with consistent mass', () => {
    const m = measurePart({
      partId: 'p1',
      lengthMm: 10,
      angleDeg: 0,
      boundingBoxMm: [10, 1, 1],
      volumeMm3: 1000,
      densityKgPerMm3: 0.001,
    });
    expect(m.massKg).toBe(1);
    expect(() =>
      measurePart({
        partId: 'bad',
        lengthMm: 0,
        angleDeg: 0,
        boundingBoxMm: [0, 0, 0],
        volumeMm3: 1,
        densityKgPerMm3: 1,
      }),
    ).toThrow(/positive/);
  });

  it('exports STEP/STL/GLB with provenance and path restrictions', () => {
    const a = exportArtifact({
      format: 'STEP',
      snapshotId: 'snap:1',
      modelId: 'm',
      branchId: 'b',
      payload: 'solid',
      relativePath: 'artifacts/out.step',
    });
    expect(a.contentHash).toHaveLength(64);
    expect(a.provenance.modelId).toBe('m');
    expect(a.payloadEncoding).toBe('utf8-placeholder');
    expect(() =>
      exportArtifact({
        format: 'STL',
        snapshotId: 's',
        modelId: 'm',
        branchId: 'b',
        payload: 'x',
        relativePath: '../escape.stl',
      }),
    ).toThrow(/Path restriction/);
  });

  it('accepts adapter-supplied binary CAD payloads', async () => {
    const { exportBinaryArtifact } = await import('./index.js');
    const bin = exportBinaryArtifact({
      format: 'STL',
      snapshotId: 'snap:1',
      modelId: 'm',
      branchId: 'b',
      bytes: new Uint8Array([115, 111, 108, 105, 100]),
      relativePath: 'artifacts/out.stl',
    });
    expect(bin.payloadEncoding).toBe('binary');
  });

  it('compiles BOM with semantic ids and quantities', () => {
    const bom = compileBom([
      { semanticId: 'a', description: 'A' },
      { semanticId: 'a', description: 'A' },
      { semanticId: 'b', description: 'B' },
    ]);
    expect(bom.find((l) => l.semanticId === 'a')?.quantity).toBe(2);
  });

  it('dimensions bind semantic paths; unresolved is visible', () => {
    const known = new Set(['semantic:a']);
    const dim = createDimension({
      id: 'd1',
      kind: 'linear',
      quantity: 1,
      unit: 'mm',
      anchorPathA: 'semantic:a',
      anchorPathB: 'semantic:missing',
      knownPaths: known,
    });
    expect(dim.resolved).toBe(false);
    expect(() =>
      createDimension({
        id: 'd2',
        kind: 'linear',
        quantity: 1,
        unit: 'mm',
        anchorPathA: 'Face:1',
        anchorPathB: 'semantic:a',
        knownPaths: known,
      }),
    ).toThrow(/semantic:/);
  });

  it('clusters report-only and refuses silent rationalisation', () => {
    const ms = [
      measurePart({
        partId: '1',
        lengthMm: 100,
        angleDeg: 0,
        boundingBoxMm: [1, 1, 1],
        volumeMm3: 10,
        densityKgPerMm3: 1,
      }),
      measurePart({
        partId: '2',
        lengthMm: 100.05,
        angleDeg: 0,
        boundingBoxMm: [1, 1, 1],
        volumeMm3: 10,
        densityKgPerMm3: 1,
      }),
    ];
    const families = clusterPartFamilies(ms, 0.1);
    expect(families[0]?.reportOnly).toBe(true);
    expect(applyFamilyRationalisation({ viaChangeSet: false, branchApply: false }).applied).toBe(
      false,
    );
    expect(applyFamilyRationalisation({ viaChangeSet: true, branchApply: true }).applied).toBe(true);
  });

  it('D01 snapshot produces traceable fabrication artifacts', () => {
    const out = buildD01FabricationOutputs('snap:D01');
    expect(out.artifacts.map((a) => a.format).sort()).toEqual(['GLB', 'STEP', 'STL']);
    expect(out.bom.length).toBeGreaterThan(0);
    expect(out.cutList.length).toBeGreaterThan(0);
    expect(out.dimensions[0]?.resolved).toBe(true);
    expect(out.families.length).toBeGreaterThan(0);
  });
});
