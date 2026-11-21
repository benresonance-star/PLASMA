import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';
import { composeFirstFusion } from '@spds/import-core';
import { previewSupportedLoftSolid } from './fusion-geometry.js';

const at = '2026-11-21T00:00:00.000Z';
const buildProject = { app: 'Build', schemaVersion: 2, savedAt: at, authoritativeGraph: {
  entities: [{ id: 'entity:build:window', kind: 'Entity',
    name: 'Window', semanticType: 'architecture.window',
    createdAt: at, updatedAt: at, schemaVersion: '1.0.0' }],
  parameters: [], relationships: [],
}};
function loft() {
  return { id: 'LoftWindow', schemaVersion: 2, units: 'mm',
    parts: [{ id: 'WindowFrame', parameters: { W: 100, D: 40 }, features: [
      { id: 'Sketch', type: 'sketch', plane: { type: 'datum', name: 'XY' },
        profile: { kind: 'rectangle', width: 'W', height: 80 } },
      { id: 'Extrude', type: 'extrude', sketch: 'Sketch', depth: 'D' },
    ] }],
    rootAssembly: 'Main', assemblies: [{ id: 'Main', instances: [{
      id: 'Frame1', partId: 'WindowFrame', placement: { translation: [300,200,50] },
    }] }],
  };
}
const bindings = [{ buildEntityId: 'entity:build:window',
  loftAssemblyId: 'Main', loftInstanceId: 'Frame1' }];
function input(loftProject: unknown = loft()) {
  const f = composeFirstFusion({ buildProject, loftProject, bindings });
  return { buildProject, loftProject, bindings,
    expectedSourceHashes: {
      build: f.sources[0]!.sourceHash, loft: f.sources[1]!.sourceHash,
    },
    loftOccurrenceId: f.bindings[0]!.loftOccurrenceId,
  };
}
describe('FUSION-03a source-bound geometric bridge', () => {
  it('compiles centred Loft rectangle/extrude as an exact-adapter mesh with stable semantic owner', () => {
    const result = previewSupportedLoftSolid(input());
    expect(result.status).toBe('preview-only');
    expect(result.nativeBrep).toBe(false);
    expect(result.publicationReady).toBe(false);
    expect(result.meshes[0]?.semanticOwner).toBe(result.semanticOwner);
    expect(result.meshes[0]?.kernel).toBe('exact-adapter');
    expect(result.meshes[0]?.triangleCount).toBeGreaterThanOrEqual(12);
    const vertices = result.meshes[0]!.vertices;
    expect(Math.min(...vertices.map((v) => v[0]))).toBeCloseTo(250);
    expect(Math.max(...vertices.map((v) => v[0]))).toBeCloseTo(350);
    expect(Math.min(...vertices.map((v) => v[2]))).toBeCloseTo(50);
    expect(Math.max(...vertices.map((v) => v[2]))).toBeCloseTo(90);
  });
  it('does not invent support for Loft fillets, moved sketch planes, or unbound occurrences', () => {
    const source = loft();
    source.parts[0]!.features.push({ id: 'Extra', type: 'extrude', sketch: 'Sketch', depth: 'D' } as typeof source.parts[0]['features'][number]);
    expect(() => previewSupportedLoftSolid(input(source))).toThrow(/FEATURE_UNSUPPORTED/);
    const normal = input();
    expect(() => previewSupportedLoftSolid({ ...normal, bindings: [] })).toThrow(/UNBOUND/);
  });
  it('accepts a versioned HTTP preview without changing model head', async () => {
    const { app } = buildServer();
    const created = await app.inject({ method: 'POST', url: '/models', payload: { name: 'F03' } });
    const { model, branchId, headHash } = created.json() as {
      model: { modelId: string }; branchId: string; headHash: string;
    };
    const payload = { ...input(), modelId: model.modelId, branchId, expectedHeadHash: headHash };
    const ok = await app.inject({
      method: 'POST', url: '/imports/fusion/geometry-preview', payload,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: 'preview-only', kernel: 'exact-adapter', nativeBrep: false });
    const stale = await app.inject({
      method: 'POST', url: '/imports/fusion/geometry-preview',
      payload: { ...payload, expectedHeadHash: 'invalid' },
    });
    expect(stale.statusCode).toBe(409);
    const head = await app.inject({
      method: 'GET', url: '/models/' + model.modelId + '/branches/' + branchId + '/head',
    });
    expect(head.json().branch.headHash).toBe(headHash);
    await app.close();
  });
});
