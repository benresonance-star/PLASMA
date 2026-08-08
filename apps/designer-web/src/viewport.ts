/** G8.2 Viewport chrome — published vs candidate without requiring Three.js. */

export type PublicationChrome = 'published' | 'candidate' | 'stale' | 'preview';

export interface ViewportMeshRef {
  readonly meshId: string;
  readonly semanticId: string;
  /** Display buffer identity — not a B-rep claim. */
  readonly bufferHash: string;
  readonly triangleCount: number;
}

export interface ViewportCamera {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly zoom: number;
}

export interface ViewportState {
  readonly chrome: PublicationChrome;
  readonly meshes: readonly ViewportMeshRef[];
  readonly camera: ViewportCamera;
  readonly pickedSemanticId: string | null;
  readonly lodLevel: 0 | 1 | 2;
  readonly interactive: boolean;
}

export function createViewportState(input?: {
  readonly chrome?: PublicationChrome;
  readonly meshes?: readonly ViewportMeshRef[];
}): ViewportState {
  return {
    chrome: input?.chrome ?? 'published',
    meshes: input?.meshes ?? [],
    camera: { position: [0, 0, 10], target: [0, 0, 0], zoom: 1 },
    pickedSemanticId: null,
    lodLevel: 1,
    interactive: true,
  };
}

/** User must identify published vs candidate in ≤2s — chrome label is the contract. */
export function publicationChromeLabel(chrome: PublicationChrome): string {
  switch (chrome) {
    case 'published':
      return 'Published';
    case 'candidate':
      return 'Candidate revision';
    case 'stale':
      return 'Stale — recompile required';
    case 'preview':
      return 'Preview (approximate)';
  }
}

export function setViewportChrome(state: ViewportState, chrome: PublicationChrome): ViewportState {
  return { ...state, chrome };
}

export function loadMeshes(state: ViewportState, meshes: readonly ViewportMeshRef[]): ViewportState {
  return { ...state, meshes, interactive: true };
}

/** Pick by mesh buffer → semantic id mapping (no triangle-index identity). */
export function pickMesh(state: ViewportState, meshId: string): ViewportState {
  const mesh = state.meshes.find((m) => m.meshId === meshId);
  return { ...state, pickedSemanticId: mesh?.semanticId ?? null };
}

export function setLod(state: ViewportState, lodLevel: 0 | 1 | 2): ViewportState {
  return { ...state, lodLevel };
}

export function orbitCamera(
  state: ViewportState,
  deltaYaw: number,
  deltaPitch: number,
): ViewportState {
  const [x, y, z] = state.camera.position;
  const yaw = Math.atan2(x, z) + deltaYaw;
  const radius = Math.hypot(x, z);
  const ny = y + deltaPitch;
  return {
    ...state,
    camera: {
      ...state.camera,
      position: [Math.sin(yaw) * radius, ny, Math.cos(yaw) * radius],
    },
  };
}
