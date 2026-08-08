import { ExactKernelAdapter } from './exact-kernel.js';
import { OcctWasmKernel } from './occt-wasm-kernel.js';

export type GeometryKernelBinding = 'exact-adapter' | 'occt-wasm';

export type GeometryKernel = ExactKernelAdapter | OcctWasmKernel;

/**
 * Kernel selector (ADR-004).
 * - exact-adapter: deterministic in-process kernel (CI default)
 * - occt-wasm: occt-import-js WASM for STEP; constructive ops delegated
 */
export function createGeometryKernel(
  binding: GeometryKernelBinding = (process.env.GEOMETRY_KERNEL as GeometryKernelBinding) ||
    'exact-adapter',
): GeometryKernel {
  if (binding === 'occt-wasm') {
    return new OcctWasmKernel();
  }
  return new ExactKernelAdapter();
}
