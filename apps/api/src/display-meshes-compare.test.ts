import { describe, expect, it } from 'vitest';
import { buildD01DisplayMeshesMaybeCompare } from './display-meshes-compare.js';

describe('display-meshes compare engines', () => {
  it('keeps baseline shape when compareEngines is off', async () => {
    const result = await buildD01DisplayMeshesMaybeCompare({ yLimit: 2 });
    expect(result.source).toBe('d01-reference-pipeline');
    expect(result.meshes.length).toBe(6);
    expect(result.compileHash).toHaveLength(64);
    expect(result.geometryService).toBeUndefined();
    expect(result.geometryServiceError).toBeUndefined();
  });

  it('returns structured error when geometry service is unreachable', async () => {
    const result = await buildD01DisplayMeshesMaybeCompare({
      yLimit: 2,
      compareEngines: true,
      geometryBaseUrl: 'http://127.0.0.1:1',
      fetchImpl: async () => {
        throw new Error('connection refused');
      },
    });
    expect(result.meshes.length).toBe(6);
    expect(result.geometryService).toBeUndefined();
    expect(result.geometryServiceError).toMatch(/connection refused|unavailable/i);
  });

  it('returns OCCT layer when compile/meshes responds', async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({ status: 'ok', kernel: 'occt-wasm', version: 'test' }),
          {
            status: 200,
          },
        );
      }
      if (url.endsWith('/v1/compile/meshes')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          compile: { ops: { semanticOwner: string }[] };
        };
        const owner = body.compile.ops[0]?.semanticOwner ?? 'y:1';
        return new Response(
          JSON.stringify({
            exact: { meshes: [] },
            occt: {
              kernel: 'occt-wasm',
              meshes: [
                {
                  representationId: 'repr:occt:1',
                  semanticOwner: owner,
                  vertices: [
                    [0, 0, 0],
                    [1, 0, 0],
                    [0, 1, 0],
                  ],
                  indices: [0, 1, 2],
                  triangleCount: 1,
                },
              ],
            },
          }),
          { status: 201 },
        );
      }
      return new Response('not found', { status: 404 });
    };

    const result = await buildD01DisplayMeshesMaybeCompare({
      yLimit: 1,
      lengthMm: 2300,
      compareEngines: true,
      geometryBaseUrl: 'http://geometry.test',
      fetchImpl,
    });
    expect(result.geometryServiceError).toBeUndefined();
    expect(result.geometryService?.kernel).toBe('occt-wasm');
    expect(result.geometryService?.label).toMatch(/OCCT WASM/i);
    expect(result.geometryService?.meshes[0]!.semanticOwner).toBe(result.meshes[0]!.semanticOwner);
  });
});
