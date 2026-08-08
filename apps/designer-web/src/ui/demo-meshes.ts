import type { DisplayMeshInput } from '../mesh-bridge.js';

export interface DemoMemberParams {
  readonly lengthMm: number;
  readonly widthMm: number;
  readonly depthMm: number;
}

export const DEMO_Y_SEMANTIC_ID = 'y:demo:01';

const DEFAULT_PARAMS: DemoMemberParams = {
  lengthMm: 200,
  widthMm: 40,
  depthMm: 40,
};

/** Browser-safe demo solid (no node:crypto / geometry-contracts kernel). */
export function demoDisplayMeshes(params: Partial<DemoMemberParams> = {}): DisplayMeshInput[] {
  const lengthMm = params.lengthMm ?? DEFAULT_PARAMS.lengthMm;
  const widthMm = params.widthMm ?? DEFAULT_PARAMS.widthMm;
  const depthMm = params.depthMm ?? DEFAULT_PARAMS.depthMm;
  const w = widthMm;
  const d = depthMm;
  const len = lengthMm;
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
      semanticOwner: DEMO_Y_SEMANTIC_ID,
      vertices,
      indices,
    },
  ];
}

export function demoExplorerIds(): readonly string[] {
  return [DEMO_Y_SEMANTIC_ID];
}

export function demoLengthAnchors(lengthMm: number): {
  readonly a: { path: string; semanticId: string; position: readonly [number, number, number] };
  readonly b: { path: string; semanticId: string; position: readonly [number, number, number] };
} {
  return {
    a: {
      path: 'semantic:vertex/start',
      semanticId: 'v:demo:start',
      position: [0, 0, 0],
    },
    b: {
      path: 'semantic:vertex/end',
      semanticId: 'v:demo:end',
      position: [lengthMm, 0, 0],
    },
  };
}
