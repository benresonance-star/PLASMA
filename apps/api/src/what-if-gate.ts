/**
 * F1d — product gate for live What-if OCCT / regen budget.
 */

export const WHAT_IF_D01_REGEN_BUDGET_MS = 5000;

export type WhatIfGateResult =
  | { readonly ok: true; readonly regenMs: number }
  | { readonly ok: false; readonly reason: 'occt_unavailable' | 'budget_exceeded' | 'demo_mesh_forbidden'; readonly detail?: string };

/** Never substitute demo meshes for What-if; skip when OCCT/kernel unavailable. */
export function gateWhatIfRegen(input: {
  readonly regenMs: number;
  readonly source: string;
  readonly occtAvailable?: boolean;
  readonly usedDemoMeshes?: boolean;
}): WhatIfGateResult {
  if (input.usedDemoMeshes) {
    return { ok: false, reason: 'demo_mesh_forbidden', detail: 'demo meshes cannot satisfy What-if' };
  }
  if (input.occtAvailable === false) {
    return { ok: false, reason: 'occt_unavailable', detail: 'skipIf OCCT down' };
  }
  if (input.regenMs > WHAT_IF_D01_REGEN_BUDGET_MS) {
    return {
      ok: false,
      reason: 'budget_exceeded',
      detail: `${input.regenMs.toFixed(0)}ms > ${WHAT_IF_D01_REGEN_BUDGET_MS}ms`,
    };
  }
  return { ok: true, regenMs: input.regenMs };
}
