import { describe, expect, it } from 'vitest';
import { createGeometryKernel } from './kernel-factory.js';

describe('E11 geometry kernel factory', () => {
  it('defaults to exact-adapter and fails closed for occt-wasm', () => {
    const kernel = createGeometryKernel('exact-adapter');
    expect(kernel.kernelId).toBe('exact-adapter');
    expect(() => createGeometryKernel('occt-wasm')).toThrow(/not available/);
  });
});
