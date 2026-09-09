import { ExactKernelAdapter } from './exact-kernel.js';
import { OcctNativeKernel } from './occt-native-kernel.js';
import { OcctWasmKernel } from './occt-wasm-kernel.js';

export type GeometryKernelBinding = 'exact-adapter' | 'occt-wasm' | 'occt-native';

export type GeometryKernel = ExactKernelAdapter | OcctWasmKernel | OcctNativeKernel;

/**
 * Kernel selector (ADR-004).
 * - exact-adapter: deterministic in-process kernel (CI default)
 * - occt-wasm: occt-import-js WASM for STEP; constructive ops delegated
 * - occt-native: OpenCascade.js constructive B-rep (Node WASM; Docker-first on Windows)
 */
export function createGeometryKernel(
  binding: GeometryKernelBinding = (process.env.GEOMETRY_KERNEL as GeometryKernelBinding) ||
    'exact-adapter',
): GeometryKernel {
  if (binding === 'occt-wasm') {
    return new OcctWasmKernel();
  }
  if (binding === 'occt-native') {
    return new OcctNativeKernel();
  }
  return new ExactKernelAdapter();
}
