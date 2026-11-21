import type { DisplayMeshInput } from '../mesh-bridge.js';

/** Loft/OCC geometry has Z as its vertical axis. The current Three.js
 * viewport uses Y-up. Rotate the *display buffers only* by +90° about X:
 * (x, y, z) CAD -> (x, z, -y) viewport. This is a proper rotation
 * (determinant +1), so triangle winding is preserved.
 *
 * Never change source geometry, provenance, engineering evidence or native
 * B-rep coordinates to compensate for a viewer convention.
 */
export function cadZUpMeshesToViewportYUp(
  meshes: readonly DisplayMeshInput[],
): DisplayMeshInput[] {
  return meshes.map((mesh) => ({
    ...mesh,
    vertices: mesh.vertices.map(([x, y, z]) => [x, z, -y] as const),
  }));
}
