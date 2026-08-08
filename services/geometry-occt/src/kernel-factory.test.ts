import { describe, expect, it } from 'vitest';
import { createGeometryKernel } from './kernel-factory.js';
import { OcctWasmKernel } from './occt-wasm-kernel.js';

describe('E11/S1 geometry kernel factory', () => {
  it('defaults to exact-adapter and constructs occt-wasm kernel', () => {
    const exact = createGeometryKernel('exact-adapter');
    expect(exact.kernelId).toBe('exact-adapter');
    const wasm = createGeometryKernel('occt-wasm');
    expect(wasm).toBeInstanceOf(OcctWasmKernel);
    expect(wasm.kernelId).toBe('occt-wasm');
  });
});
