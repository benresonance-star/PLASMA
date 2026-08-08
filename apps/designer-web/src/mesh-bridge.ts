import type { ViewportMeshRef, ViewportState } from './viewport.js';
import { loadMeshes, setViewportChrome } from './viewport.js';

/** Display-buffer mesh — never a B-rep identity claim. */
export interface DisplayMeshInput {
  readonly representationId: string;
  readonly semanticOwner: string;
  readonly vertices: readonly (readonly [number, number, number])[];
  readonly indices: readonly number[];
}

export function displayMeshesToViewportRefs(
  meshes: readonly DisplayMeshInput[],
): readonly ViewportMeshRef[] {
  return meshes.map((m) => ({
    meshId: `mesh:${m.representationId}`,
    semanticId: m.semanticOwner,
    bufferHash: hashBuffer(m.vertices, m.indices),
    triangleCount: Math.floor(m.indices.length / 3),
  }));
}

/** Bridge tessellated geometry into viewport chrome (candidate until published). */
export function applyDisplayMeshesToViewport(
  state: ViewportState,
  meshes: readonly DisplayMeshInput[],
  chrome: 'candidate' | 'published' = 'candidate',
): ViewportState {
  const withChrome = setViewportChrome(state, chrome);
  return loadMeshes(withChrome, displayMeshesToViewportRefs(meshes));
}

function hashBuffer(
  vertices: readonly (readonly [number, number, number])[],
  indices: readonly number[],
): string {
  let h = 2166136261;
  for (const v of vertices) {
    for (const n of v) h = Math.imul(h ^ Math.trunc(n * 1000), 16777619);
  }
  for (const i of indices) h = Math.imul(h ^ i, 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}
