/**
 * Designer What-if fork / ghost / reject (F1a–F1c).
 */

import type { DisplayMeshInput } from './mesh-bridge.js';

export type WhatIfMode = 'regenerated-preview';

export interface WhatIfForkState {
  readonly active: boolean;
  readonly baselineHash: string;
  readonly baselineMeshes: readonly DisplayMeshInput[];
  readonly draft:
    | { readonly parameterId: string; readonly value: number }
    | { readonly changeSetId: string }
    | null;
  readonly previewHash: string | null;
  readonly ghostMeshes: readonly DisplayMeshInput[];
  readonly mode: WhatIfMode | null;
  readonly regenMs: number | null;
  readonly error: string | null;
}

export function createIdleWhatIf(baselineHash = 'hash:none'): WhatIfForkState {
  return {
    active: false,
    baselineHash,
    baselineMeshes: [],
    draft: null,
    previewHash: null,
    ghostMeshes: [],
    mode: null,
    regenMs: null,
    error: null,
  };
}

/** Fork transient state — baseline hash unchanged; draft only after apply. */
export function forkWhatIf(
  state: WhatIfForkState,
  input: {
    readonly baselineHash: string;
    readonly baselineMeshes: readonly DisplayMeshInput[];
  },
): WhatIfForkState {
  return {
    active: true,
    baselineHash: input.baselineHash,
    baselineMeshes: input.baselineMeshes,
    draft: null,
    previewHash: null,
    ghostMeshes: [],
    mode: null,
    regenMs: null,
    error: null,
  };
}

export function applyWhatIfDraft(
  state: WhatIfForkState,
  draft:
    | { readonly parameterId: string; readonly value: number }
    | { readonly changeSetId: string },
): WhatIfForkState {
  if (!state.active) {
    return { ...state, error: 'WHATIF_NOT_FORKED' };
  }
  return {
    ...state,
    draft,
    error: null,
  };
}

export function bindWhatIfPreview(
  state: WhatIfForkState,
  preview: {
    readonly previewHash: string;
    readonly mode: WhatIfMode;
    readonly ghostMeshes: readonly DisplayMeshInput[];
    readonly regenMs: number;
  },
): WhatIfForkState {
  if (!state.active || !state.draft) {
    return { ...state, error: 'WHATIF_DRAFT_REQUIRED' };
  }
  if (preview.mode !== 'regenerated-preview') {
    return { ...state, error: 'WHATIF_CLONE_FORBIDDEN', ghostMeshes: [] };
  }
  if (preview.previewHash === state.baselineHash) {
    return { ...state, error: 'WHATIF_BASELINE_MUTATED' };
  }
  return {
    ...state,
    previewHash: preview.previewHash,
    mode: preview.mode,
    ghostMeshes: preview.ghostMeshes,
    regenMs: preview.regenMs,
    error: null,
  };
}

/** Reject clears ghosts and restores baseline hash identity. */
export function rejectWhatIf(state: WhatIfForkState): WhatIfForkState {
  return {
    active: false,
    baselineHash: state.baselineHash,
    baselineMeshes: state.baselineMeshes,
    draft: null,
    previewHash: null,
    ghostMeshes: [],
    mode: null,
    regenMs: null,
    error: null,
  };
}

export function whatIfBaselineUnchanged(
  before: WhatIfForkState,
  after: WhatIfForkState,
): boolean {
  return before.baselineHash === after.baselineHash;
}
