import { ExactKernelAdapter } from './exact-kernel.js';

export type GeometryKernelBinding = 'exact-adapter' | 'occt-wasm';

/**
 * Kernel selector prep — defaults to exact-adapter (ADR-004).
 * `occt-wasm` is reserved; selecting it fails closed until WASM lands.
 */
export function createGeometryKernel(
  binding: GeometryKernelBinding = (process.env.GEOMETRY_KERNEL as GeometryKernelBinding) ||
    'exact-adapter',
): ExactKernelAdapter {
  if (binding === 'occt-wasm') {
    throw new Error('GEOMETRY_KERNEL=occt-wasm is not available in this build candidate');
  }
  return new ExactKernelAdapter();
}
