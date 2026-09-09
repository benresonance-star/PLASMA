/**
 * Product UX evidence flags — package gates vs live designer bindings.
 */
export interface ProductUxFlags {
  readonly explorerFromApi: boolean;
  readonly pipelineFromRun: boolean;
  readonly historyFromStore: boolean;
  readonly scriptedAiWithoutKey: boolean;
  readonly chromeBoundToPublication: boolean;
  /** Secondary tabs replace the right pane; viewport stays mounted with geom highlight. */
  readonly hybridPanelsWired: boolean;
  /** Dual-engine overlay compares reference vs geometry-service tessellation paths. */
  readonly dualEngineViewportCompare: boolean;
}

export function assertProductUxReady(flags: ProductUxFlags): void {
  const missing = (Object.entries(flags) as [keyof ProductUxFlags, boolean][])
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Product UX incomplete: ${missing.join(', ')}`);
  }
}

export const PRODUCT_UX_TARGET: ProductUxFlags = {
  explorerFromApi: true,
  pipelineFromRun: true,
  historyFromStore: true,
  scriptedAiWithoutKey: true,
  chromeBoundToPublication: true,
  hybridPanelsWired: true,
  dualEngineViewportCompare: true,
};
