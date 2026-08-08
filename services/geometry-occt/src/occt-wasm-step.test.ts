import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OcctWasmKernel } from './occt-wasm-kernel.js';
import { buildGeometryServer } from './server.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

describe('S1 OCCT WASM STEP import', () => {
  it('imports cube.stp via occt-import-js and returns occt-wasm meshes', async () => {
    const kernel = new OcctWasmKernel();
    const step = readFileSync(join(fixtureDir, 'cube.stp'));
    const imported = await kernel.importStep({
      bytes: step,
      semanticOwnerPrefix: 'import:cube',
    });
    expect(imported.success).toBe(true);
    expect(imported.kernel).toBe('occt-wasm');
    expect(imported.parametricClaim).toBe('reference-only');
    expect(imported.solidCount).toBeGreaterThan(0);
    expect(imported.solids[0]!.mesh.vertices.length).toBeGreaterThan(0);
    expect(imported.solids[0]!.mesh.indices.length).toBeGreaterThan(0);
    expect(imported.solids[0]!.representation.kernel).toBe('occt-wasm');
    expect(imported.solids[0]!.representation.fabricationReady).toBe(false);
  }, 60_000);

  it('exposes /v1/import/step when kernel is occt-wasm', async () => {
    const kernel = new OcctWasmKernel();
    const { app } = buildGeometryServer(kernel);
    const step = readFileSync(join(fixtureDir, 'cube.stp'), 'utf8');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/import/step',
      payload: { stepText: step, semanticOwnerPrefix: 'import:api' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { solidCount: number; kernel: string };
    expect(body.kernel).toBe('occt-wasm');
    expect(body.solidCount).toBeGreaterThan(0);
  }, 60_000);
});
