import { describe, expect, it } from 'vitest';
import { selectGeometryServiceLayer } from './display-meshes-compare.js';

const mesh = {
  representationId: 'r1',
  semanticOwner: 'component:y:0000',
  vertices: [[0, 0, 0]] as [number, number, number][],
  indices: [0],
  triangleCount: 0,
};

describe('selectGeometryServiceLayer', () => {
  it('prefers occt-native when meshes present', () => {
    const layer = selectGeometryServiceLayer(
      {
        occtNative: { meshes: [mesh], kernel: 'occt-native' },
        occt: { meshes: [mesh], kernel: 'occt-wasm' },
      },
      'occt-wasm',
    );
    expect('error' in layer).toBe(false);
    if ('error' in layer) return;
    expect(layer.kernel).toBe('occt-native');
    expect(layer.label).toMatch(/native/i);
  });

  it('falls back to WASM with honest label', () => {
    const layer = selectGeometryServiceLayer(
      {
        occtNativeError: 'not linked',
        occt: { meshes: [mesh], kernel: 'occt-wasm', label: 'OCCT WASM (STEP-tessellated)' },
      },
      'occt-wasm',
    );
    expect('error' in layer).toBe(false);
    if ('error' in layer) return;
    expect(layer.kernel).toBe('occt-wasm');
    expect(layer.label).toBe('OCCT WASM (STEP-tessellated)');
  });

  it('never invents OCCT from empty response', () => {
    const layer = selectGeometryServiceLayer({ occtNativeError: 'stub' }, 'exact-adapter');
    expect('error' in layer).toBe(true);
  });
});
