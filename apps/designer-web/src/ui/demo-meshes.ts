import type { DisplayMeshInput } from '../mesh-bridge.js';

/** Browser-safe demo solid (no node:crypto / geometry-contracts kernel). */
export function demoDisplayMeshes(): DisplayMeshInput[] {
  const w = 40;
  const d = 40;
  const len = 200;
  const vertices: Array<[number, number, number]> = [
    [0, -w / 2, -d / 2],
    [len, -w / 2, -d / 2],
    [len, w / 2, -d / 2],
    [0, w / 2, -d / 2],
    [0, -w / 2, d / 2],
    [len, -w / 2, d / 2],
    [len, w / 2, d / 2],
    [0, w / 2, d / 2],
  ];
  const indices = [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4,
    3, 4, 0,
  ];
  return [
    {
      representationId: 'repr:demo:y01',
      semanticOwner: 'y:demo:01',
      vertices,
      indices,
    },
  ];
}
