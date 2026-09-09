/**
 * Live What-if regenerate (F1 / T7) — always buildD01DisplayMeshes; never clone buffers.
 * Accepts parameter drafts or ChangeSet drafts (geometry regen only).
 */

import {
  changeSetToSemanticCommands,
  type ChangeSet,
} from '@spds/ai-interface';
import { buildD01DisplayMeshes } from '@spds/reference-pipeline';
import {
  buildWhatIfSessionStub,
  type WhatIfPreview,
  type WhatIfRequest,
} from '@spds/graph-projection';

export type WhatIfMesh = {
  readonly representationId: string;
  readonly semanticOwner: string;
  readonly vertices: ReadonlyArray<readonly [number, number, number]>;
  readonly indices: readonly number[];
  readonly triangleCount: number;
};

export class WhatIfCloneRejectedError extends Error {
  readonly code = 'WHATIF_CLONE_FORBIDDEN' as const;
  constructor(message = 'What-if must regenerate geometry; cloned buffers are forbidden') {
    super(message);
    this.name = 'WhatIfCloneRejectedError';
  }
}

export class WhatIfDraftRejectedError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'WhatIfDraftRejectedError';
    this.code = code;
  }
}

/** Fail closed if a caller attempts to treat cloned buffers as a What-if preview. */
export function assertWhatIfNotCloned(input: {
  readonly mode?: string;
  readonly baselineMeshes?: readonly WhatIfMesh[];
  readonly previewMeshes?: readonly WhatIfMesh[];
}): void {
  if (input.mode === 'cloned-buffers' || input.mode === 'clone') {
    throw new WhatIfCloneRejectedError();
  }
  if (!input.baselineMeshes || !input.previewMeshes) return;
  if (input.baselineMeshes.length === 0 || input.previewMeshes.length === 0) return;
  // Same object identity ⇒ clone path.
  if (input.baselineMeshes === input.previewMeshes) {
    throw new WhatIfCloneRejectedError('Preview meshes alias baseline (clone)');
  }
  const sameBuffers = input.baselineMeshes.every((b, i) => {
    const p = input.previewMeshes![i];
    return p && b.vertices === p.vertices && b.indices === p.indices;
  });
  if (sameBuffers && input.baselineMeshes.length === input.previewMeshes.length) {
    throw new WhatIfCloneRejectedError('Preview shares vertex/index buffers with baseline');
  }
}

export function meshByteFingerprint(meshes: readonly WhatIfMesh[]): string {
  let n = 0;
  let sum = 0;
  for (const m of meshes) {
    n += m.vertices.length * 3 + m.indices.length;
    for (const v of m.vertices) {
      sum += Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]);
    }
  }
  return `${meshes.length}:${n}:${sum.toFixed(3)}`;
}

export function meshExtents(meshes: readonly WhatIfMesh[]): {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
} {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const m of meshes) {
    for (const v of m.vertices) {
      minX = Math.min(minX, v[0]);
      minY = Math.min(minY, v[1]);
      minZ = Math.min(minZ, v[2]);
      maxX = Math.max(maxX, v[0]);
      maxY = Math.max(maxY, v[1]);
      maxZ = Math.max(maxZ, v[2]);
    }
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

function lengthMmFromParameterDraft(draft: WhatIfRequest['draft']): number | undefined {
  if (!('parameterId' in draft)) return undefined;
  if (
    draft.parameterId === 'param:d01:lengthMm' ||
    draft.parameterId === 'param:d01:length' ||
    draft.parameterId.endsWith(':lengthMm')
  ) {
    const v = draft.value;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

function geometryFromChangeSetDraft(
  draft: Extract<WhatIfRequest['draft'], { changeSet: unknown }>,
  modelId: string,
): {
  readonly lengthMm?: number;
  readonly armWidthMm?: number;
  readonly structuralDepthMm?: number;
} {
  const raw = draft.changeSet;
  const cs: ChangeSet = {
    changeSetId: raw.changeSetId,
    branchId: raw.branchId ?? 'branch:what-if',
    expectedHeadHash: raw.expectedHeadHash ?? 'head:what-if',
    transactionId: raw.transactionId ?? 'txn:what-if',
    commands: raw.commands.map((c) => ({
      op: c.op as ChangeSet['commands'][number]['op'],
      ...(c.targetId !== undefined ? { targetId: c.targetId } : {}),
      ...(c.payload !== undefined ? { payload: c.payload } : {}),
    })),
    actor: 'ai',
    disposition: 'proposed',
  };
  const lowered = changeSetToSemanticCommands(cs, { modelId });
  if (!lowered.ok) {
    throw new WhatIfDraftRejectedError(
      lowered.failureCode ?? 'CHANGESET_INVALID',
      lowered.reason ?? 'ChangeSet draft rejected',
    );
  }
  if (!lowered.geometryRegen) {
    throw new WhatIfDraftRejectedError(
      'WHATIF_NO_GEOMETRY',
      'What-if ChangeSet draft requires geometry-regen ops',
    );
  }
  return {
    ...(lowered.geometryParams?.lengthMm !== undefined
      ? { lengthMm: lowered.geometryParams.lengthMm }
      : {}),
    ...(lowered.geometryParams?.armWidthMm !== undefined
      ? { armWidthMm: lowered.geometryParams.armWidthMm }
      : {}),
    ...(lowered.geometryParams?.structuralDepthMm !== undefined
      ? { structuralDepthMm: lowered.geometryParams.structuralDepthMm }
      : {}),
  };
}

export async function regenerateWhatIfPreview(input: {
  readonly request: WhatIfRequest;
  readonly baselineHash: string;
  readonly baselineMeshes?: readonly WhatIfMesh[];
  readonly yLimit?: number;
  readonly armWidthMm?: number;
  readonly structuralDepthMm?: number;
  /** Test-only: attempt forbidden clone mode (must 400). */
  readonly modeAttempt?: string;
}): Promise<{
  readonly whatIf: WhatIfPreview;
  readonly meshes: readonly WhatIfMesh[];
  readonly pipelineHash: string;
  readonly regenMs: number;
  readonly extents: ReturnType<typeof meshExtents>;
  readonly byteFingerprint: string;
}> {
  assertWhatIfNotCloned(
    input.modeAttempt !== undefined ? { mode: input.modeAttempt } : {},
  );

  let lengthMm = lengthMmFromParameterDraft(input.request.draft);
  let armWidthMm = input.armWidthMm;
  let structuralDepthMm = input.structuralDepthMm;

  if ('changeSet' in input.request.draft) {
    const geom = geometryFromChangeSetDraft(input.request.draft, input.request.modelId);
    lengthMm = geom.lengthMm ?? lengthMm;
    armWidthMm = geom.armWidthMm ?? armWidthMm;
    structuralDepthMm = geom.structuralDepthMm ?? structuralDepthMm;
  }

  const t0 = performance.now();
  const built = await buildD01DisplayMeshes({
    yLimit: input.yLimit ?? 3,
    ...(lengthMm !== undefined ? { lengthMm } : {}),
    ...(armWidthMm !== undefined ? { armWidthMm } : {}),
    ...(structuralDepthMm !== undefined ? { structuralDepthMm } : {}),
  });
  const regenMs = performance.now() - t0;
  const meshes = built.meshes.map((m) => ({
    representationId: m.representationId,
    semanticOwner: m.semanticOwner,
    vertices: m.vertices,
    indices: m.indices,
    triangleCount: m.triangleCount,
  }));

  assertWhatIfNotCloned({
    ...(input.baselineMeshes !== undefined ? { baselineMeshes: input.baselineMeshes } : {}),
    previewMeshes: meshes,
  });

  const owners = meshes.map((m) => m.semanticOwner);
  const whatIf = buildWhatIfSessionStub({
    request: input.request,
    baselineHash: input.baselineHash,
    owners: owners.length > 0 ? owners : ['component:y:0000'],
  });

  if (whatIf.mode !== 'regenerated-preview') {
    throw new WhatIfCloneRejectedError(`Invalid what-if mode ${whatIf.mode}`);
  }
  if (whatIf.previewHash === whatIf.baselineHash) {
    throw new Error('WHATIF_HASH_COLLISION');
  }

  return {
    whatIf,
    meshes,
    pipelineHash: built.pipelineHash,
    regenMs,
    extents: meshExtents(meshes),
    byteFingerprint: meshByteFingerprint(meshes),
  };
}
