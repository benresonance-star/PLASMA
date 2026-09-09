/**
 * What-if session stub (SD8.4) — regenerated preview mode only.
 * Forbidden: claiming cloned Three.js buffers as What-if.
 */

/** Minimal ChangeSet draft shape for what-if (T7) — full validation in regen path. */
export interface WhatIfChangeSetDraft {
  readonly changeSetId: string;
  readonly commands: readonly {
    readonly op: string;
    readonly targetId?: string;
    readonly payload?: unknown;
  }[];
  readonly transactionId?: string;
  readonly expectedHeadHash?: string;
  readonly branchId?: string;
}

export interface WhatIfRequest {
  readonly modelId: string;
  readonly branchId: string;
  readonly draft:
    | { readonly parameterId: string; readonly value: unknown }
    | { readonly changeSetId: string }
    | { readonly changeSet: WhatIfChangeSetDraft };
}

export interface WhatIfPreview {
  readonly baselineHash: string;
  readonly previewHash: string;
  readonly previewMeshOwners: readonly string[];
  readonly impactIds: readonly string[];
  readonly validation: { readonly ok: boolean; readonly issues: readonly string[] };
  /** Must remain regenerated-preview — never 'cloned-buffers'. */
  readonly mode: 'regenerated-preview';
}

export function buildWhatIfSessionStub(input: {
  readonly request: WhatIfRequest;
  readonly baselineHash: string;
  readonly owners: readonly string[];
}): WhatIfPreview {
  const draft = input.request.draft;
  const draftKey =
    'parameterId' in draft
      ? `${draft.parameterId}:${String(draft.value)}`
      : 'changeSet' in draft
        ? `cs:${draft.changeSet.changeSetId}:${draft.changeSet.commands.length}`
        : draft.changeSetId;
  return {
    baselineHash: input.baselineHash,
    previewHash: `preview:${input.baselineHash}:${draftKey}`,
    previewMeshOwners: [...input.owners],
    impactIds: [...input.owners],
    validation: { ok: true, issues: [] },
    mode: 'regenerated-preview',
  };
}
