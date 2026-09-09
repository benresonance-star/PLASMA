import { describe, expect, it } from 'vitest';
import { createGeometryKernel } from './kernel-factory.js';
import { OcctNativeKernel } from './occt-native-kernel.js';
import { OcctWasmKernel } from './occt-wasm-kernel.js';

describe('E11/S1 geometry kernel factory', () => {
  it('defaults to exact-adapter and constructs occt-wasm kernel', () => {
    const exact = createGeometryKernel('exact-adapter');
    expect(exact.kernelId).toBe('exact-adapter');
    const wasm = createGeometryKernel('occt-wasm');
    expect(wasm).toBeInstanceOf(OcctWasmKernel);
    expect(wasm.kernelId).toBe('occt-wasm');
  });

  it('constructs occt-native kernel (constructive after ensureReady)', async () => {
    const native = createGeometryKernel('occt-native');
    expect(native).toBeInstanceOf(OcctNativeKernel);
    expect(native.kernelId).toBe('occt-native');
    await (native as OcctNativeKernel).ensureReady();
    const rep = native.sweep({
      semanticOwner: 'y:1',
      pirOperationId: 'pir:1',
      path: [
        [0, 0, 0],
        [100, 0, 0],
      ],
      profileWidthMm: 10,
      profileDepthMm: 10,
    });
    expect(rep.kernel).toBe('occt-native');
    expect(rep.mass.volumeMm3).toBeGreaterThan(0);
  }, 60_000);
});
