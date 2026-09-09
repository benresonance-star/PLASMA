/**
 * Lower AI ChangeSets to semantic envelopes for accept.
 * Supports: geometry updates, allowlisted create, create_group / connect,
 * and apply_pattern (Goldberg composition override).
 */

import {
  CURRENT_SCHEMA_VERSION,
  parseSemanticObject,
  type SemanticObject,
} from '@spds/semantic-core';
import type { ChangeSet, ChangeSetCommand } from './tools.js';
import { validateChangeSet } from './tools.js';
import {
  COMPOSITION_D01_ID,
  DEMO_Y_SEMANTIC_ID,
  D01_PATTERN_INSTANCE_ID,
  GOLDBERG_PATTERN_PUBLISHED_ID,
  PARAM_D01_ARM_WIDTH_ID,
  PARAM_D01_LENGTH_ID,
  PARAM_D01_STRUCTURAL_DEPTH_ID,
  resolveGeometryParamTarget,
  type D01GeometryParamPath,
} from './id-map.js';

/** Mutate kindsAllowlist entries (semanticType for folders; kind for Parameter). */
export const CREATE_KINDS_ALLOWLIST = ['ui.folder', 'Parameter'] as const;

export const LENGTH_MM_MIN = 500;
export const LENGTH_MM_MAX = 4000;
export const ARM_WIDTH_MM_MIN = 20;
export const ARM_WIDTH_MM_MAX = 400;
export const STRUCTURAL_DEPTH_MM_MIN = 40;
export const STRUCTURAL_DEPTH_MM_MAX = 600;

export type ChangeSetAcceptMode = 'geometry' | 'organise' | 'create' | 'pattern' | 'mixed';

export interface GeometryParamOverrides {
  readonly lengthMm?: number;
  readonly armWidthMm?: number;
  readonly structuralDepthMm?: number;
}

export interface ChangeSetAcceptEnvelope {
  readonly commandId: string;
  readonly command: 'UPDATE' | 'CREATE' | 'CONNECT' | 'APPLY';
  readonly modelId: string;
  readonly branchId: string;
  readonly expectedHeadHash: string;
  readonly actorId: string;
  readonly actorType: 'ai';
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
}

/** Structured organisation ops applied to model query context on accept. */
export type OrganiseAcceptOp =
  | {
      readonly kind: 'create_group';
      readonly parentId: string;
      readonly label?: string;
      readonly groupId?: string;
    }
  | {
      readonly kind: 'connect';
      readonly nodeId: string;
      readonly newParentId: string;
      readonly relationType: 'part-of';
    };

export interface CreatedParameterStub {
  readonly id: string;
  readonly path?: string;
  readonly value?: number;
}

export interface ChangeSetLowerResult {
  readonly ok: boolean;
  readonly envelopes: readonly ChangeSetAcceptEnvelope[];
  readonly organiseOps: readonly OrganiseAcceptOp[];
  readonly mode: ChangeSetAcceptMode;
  /** When true, accept must run compile + mesh regen (not organise/create-only). */
  readonly geometryRegen: boolean;
  /** @deprecated Prefer geometryParams.lengthMm */
  readonly lengthMmOverride?: number;
  readonly geometryParams?: GeometryParamOverrides;
  readonly createdParameters?: readonly CreatedParameterStub[];
  readonly patternInstanceId?: string;
  readonly appliedPatternId?: string;
  readonly failureCode?: string;
  readonly reason?: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function domainFor(path: D01GeometryParamPath): { readonly min: number; readonly max: number } {
  switch (path) {
    case 'lengthMm':
      return { min: LENGTH_MM_MIN, max: LENGTH_MM_MAX };
    case 'armWidthMm':
      return { min: ARM_WIDTH_MM_MIN, max: ARM_WIDTH_MM_MAX };
    case 'structuralDepthMm':
      return { min: STRUCTURAL_DEPTH_MM_MIN, max: STRUCTURAL_DEPTH_MM_MAX };
    default: {
      const _exhaustive: never = path;
      return _exhaustive;
    }
  }
}

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  return payload as Record<string, unknown>;
}

function paramIdFor(path: D01GeometryParamPath): string {
  switch (path) {
    case 'lengthMm':
      return PARAM_D01_LENGTH_ID;
    case 'armWidthMm':
      return PARAM_D01_ARM_WIDTH_ID;
    case 'structuralDepthMm':
      return PARAM_D01_STRUCTURAL_DEPTH_ID;
    default: {
      const _exhaustive: never = path;
      return _exhaustive;
    }
  }
}

function makeUpdateEnvelope(
  cs: ChangeSet,
  modelId: string,
  index: number,
  path: D01GeometryParamPath,
  value: number,
): ChangeSetAcceptEnvelope {
  const paramId = paramIdFor(path);
  return {
    commandId: `${cs.changeSetId}:cmd:${index}:${path}`,
    command: 'UPDATE',
    modelId,
    branchId: cs.branchId,
    expectedHeadHash: cs.expectedHeadHash,
    actorId: 'agent:spds',
    actorType: 'ai',
    payload: {
      id: paramId,
      targetIds: [paramId, DEMO_Y_SEMANTIC_ID],
      path,
      value,
    },
    idempotencyKey: `${cs.changeSetId}:${index}:${path}:${value}`,
  };
}

function lowerUpdateGeometry(
  cmd: ChangeSetCommand,
  cs: ChangeSet,
  modelId: string,
  index: number,
):
  | {
      readonly ok: true;
      readonly envelopes: readonly ChangeSetAcceptEnvelope[];
      readonly params: GeometryParamOverrides;
    }
  | { readonly ok: false; readonly failureCode: string; readonly reason: string } {
  if (!cmd.targetId) {
    return { ok: false, failureCode: 'MISSING_TARGET', reason: 'update requires targetId' };
  }
  const payload = asRecord(cmd.payload);
  if (!payload) {
    return {
      ok: false,
      failureCode: 'MISSING_PARAM',
      reason: 'update requires geometry payload',
    };
  }

  const resolved = resolveGeometryParamTarget(cmd.targetId);
  if (!resolved.ok) {
    return {
      ok: false,
      failureCode: 'UNKNOWN_TARGET',
      reason: resolved.reason,
    };
  }

  const envelopes: ChangeSetAcceptEnvelope[] = [];
  const params: {
    lengthMm?: number;
    armWidthMm?: number;
    structuralDepthMm?: number;
  } = {};

  const tryPath = (path: D01GeometryParamPath, raw: unknown): boolean => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return false;
    const { min, max } = domainFor(path);
    const value = clamp(raw, min, max);
    envelopes.push(makeUpdateEnvelope(cs, modelId, index, path, value));
    params[path] = value;
    return true;
  };

  let found = false;
  found = tryPath('lengthMm', payload.lengthMm) || found;
  found = tryPath('armWidthMm', payload.armWidthMm) || found;
  found = tryPath('structuralDepthMm', payload.structuralDepthMm) || found;

  if (!found && typeof payload.value === 'number' && Number.isFinite(payload.value)) {
    found = tryPath(resolved.path, payload.value);
  }

  if (!found) {
    return {
      ok: false,
      failureCode: 'MISSING_PARAM',
      reason: `update requires ${resolved.path} or value`,
    };
  }

  return { ok: true, envelopes, params };
}

function lowerCreateGroup(
  cmd: ChangeSetCommand,
  cs: ChangeSet,
  modelId: string,
  index: number,
):
  | { readonly ok: true; readonly envelope: ChangeSetAcceptEnvelope; readonly op: OrganiseAcceptOp }
  | { readonly ok: false; readonly failureCode: string; readonly reason: string } {
  const payload = asRecord(cmd.payload) ?? {};
  const parentId =
    typeof payload.parentId === 'string' && payload.parentId.length > 0
      ? payload.parentId
      : modelId;
  const label = typeof payload.label === 'string' ? payload.label : undefined;
  const groupId =
    typeof cmd.targetId === 'string' && cmd.targetId.length > 0
      ? cmd.targetId
      : typeof payload.groupId === 'string'
        ? payload.groupId
        : undefined;
  const op: OrganiseAcceptOp = {
    kind: 'create_group',
    parentId,
    ...(label !== undefined ? { label } : {}),
    ...(groupId !== undefined ? { groupId } : {}),
  };
  return {
    ok: true,
    op,
    envelope: {
      commandId: `${cs.changeSetId}:cmd:${index}`,
      command: 'CREATE',
      modelId,
      branchId: cs.branchId,
      expectedHeadHash: cs.expectedHeadHash,
      actorId: 'agent:spds',
      actorType: 'ai',
      payload: {
        id: groupId ?? `folder:ai:${index}`,
        object: {
          id: groupId ?? `folder:ai:${index}`,
          kind: 'Entity',
          semanticType: 'ui.folder',
          tags: ['ui.folder'],
          attributes: { explorerKind: 'folder', ...(label ? { label } : {}) },
        },
      },
      idempotencyKey: `${cs.changeSetId}:create_group:${index}:${parentId}`,
    },
  };
}

function lowerConnect(
  cmd: ChangeSetCommand,
  cs: ChangeSet,
  modelId: string,
  index: number,
):
  | { readonly ok: true; readonly envelope: ChangeSetAcceptEnvelope; readonly op: OrganiseAcceptOp }
  | { readonly ok: false; readonly failureCode: string; readonly reason: string } {
  if (!cmd.targetId) {
    return { ok: false, failureCode: 'MISSING_TARGET', reason: 'connect requires targetId' };
  }
  const payload = asRecord(cmd.payload);
  const newParentId =
    typeof payload?.parentId === 'string'
      ? payload.parentId
      : typeof payload?.newParentId === 'string'
        ? payload.newParentId
        : undefined;
  if (!newParentId) {
    return {
      ok: false,
      failureCode: 'MISSING_PARENT',
      reason: 'connect requires parentId',
    };
  }
  const relationType = payload?.relationType;
  if (relationType !== undefined && relationType !== 'part-of') {
    return {
      ok: false,
      failureCode: 'UNSUPPORTED_RELATION',
      reason: 'connect MVP supports relationType part-of only',
    };
  }
  const op: OrganiseAcceptOp = {
    kind: 'connect',
    nodeId: cmd.targetId,
    newParentId,
    relationType: 'part-of',
  };
  return {
    ok: true,
    op,
    envelope: {
      commandId: `${cs.changeSetId}:cmd:${index}`,
      command: 'CONNECT',
      modelId,
      branchId: cs.branchId,
      expectedHeadHash: cs.expectedHeadHash,
      actorId: 'agent:spds',
      actorType: 'ai',
      payload: {
        from: cmd.targetId,
        to: newParentId,
        relationType: 'part-of',
      },
      idempotencyKey: `${cs.changeSetId}:connect:${index}:${cmd.targetId}:${newParentId}`,
    },
  };
}

function resolveCreateAllowlistKey(
  kind: unknown,
  semanticType: unknown,
  tags: unknown,
): (typeof CREATE_KINDS_ALLOWLIST)[number] | null {
  if (kind === 'Parameter') return 'Parameter';
  if (semanticType === 'ui.folder') return 'ui.folder';
  if (Array.isArray(tags) && tags.includes('ui.folder')) return 'ui.folder';
  return null;
}

function buildSemanticObjectDraft(
  id: string,
  raw: Record<string, unknown>,
  allowKey: (typeof CREATE_KINDS_ALLOWLIST)[number],
): Record<string, unknown> {
  const now = new Date().toISOString();
  const name =
    typeof raw.name === 'string' && raw.name.length > 0
      ? raw.name
      : typeof raw.label === 'string' && raw.label.length > 0
        ? raw.label
        : id;
  if (allowKey === 'Parameter') {
    return {
      id,
      kind: 'Parameter',
      semanticType:
        typeof raw.semanticType === 'string' && raw.semanticType.length > 0
          ? raw.semanticType
          : 'parameter.number',
      name,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
      schemaVersion:
        typeof raw.schemaVersion === 'string' ? raw.schemaVersion : CURRENT_SCHEMA_VERSION,
      ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
      ...(Array.isArray(raw.tags) ? { tags: raw.tags } : {}),
      ...(raw.metadata && typeof raw.metadata === 'object' ? { metadata: raw.metadata } : {}),
    };
  }
  return {
    id,
    kind: 'Entity',
    semanticType: 'ui.folder',
    name,
    tags: Array.isArray(raw.tags)
      ? [...new Set([...(raw.tags as string[]), 'ui.folder', 'organisation'])]
      : ['ui.folder', 'organisation'],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    schemaVersion:
      typeof raw.schemaVersion === 'string' ? raw.schemaVersion : CURRENT_SCHEMA_VERSION,
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
  };
}

function lowerCreate(
  cmd: ChangeSetCommand,
  cs: ChangeSet,
  modelId: string,
  index: number,
):
  | {
      readonly ok: true;
      readonly envelope: ChangeSetAcceptEnvelope;
      readonly organiseOp?: OrganiseAcceptOp;
      readonly createdParameter?: CreatedParameterStub;
    }
  | { readonly ok: false; readonly failureCode: string; readonly reason: string } {
  const payload = asRecord(cmd.payload);
  if (!payload) {
    return {
      ok: false,
      failureCode: 'KIND_NOT_ALLOWLISTED',
      reason: 'create requires object payload',
    };
  }
  const nested = asRecord(payload.object);
  const raw = nested ?? payload;
  const allowKey = resolveCreateAllowlistKey(raw.kind, raw.semanticType, raw.tags);
  if (!allowKey) {
    return {
      ok: false,
      failureCode: 'KIND_NOT_ALLOWLISTED',
      reason: `create allowlist is ${CREATE_KINDS_ALLOWLIST.join('|')} (got kind=${String(raw.kind)} semanticType=${String(raw.semanticType)})`,
    };
  }

  const id =
    (typeof cmd.targetId === 'string' && cmd.targetId.length > 0 ? cmd.targetId : undefined) ??
    (typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : undefined) ??
    (allowKey === 'ui.folder' ? `folder:ai:${index}` : `param:ai:${index}`);

  let parsed: SemanticObject;
  try {
    parsed = parseSemanticObject(buildSemanticObjectDraft(id, raw, allowKey));
  } catch (err) {
    return {
      ok: false,
      failureCode: 'SEMANTIC_INVALID',
      reason: err instanceof Error ? err.message : 'parseSemanticObject failed',
    };
  }

  if (allowKey === 'ui.folder') {
    const parentId =
      typeof payload.parentId === 'string' && payload.parentId.length > 0
        ? payload.parentId
        : typeof raw.parentId === 'string' && raw.parentId.length > 0
          ? raw.parentId
          : modelId;
    const label = parsed.name;
    const organiseOp: OrganiseAcceptOp = {
      kind: 'create_group',
      parentId,
      label,
      groupId: parsed.id,
    };
    return {
      ok: true,
      organiseOp,
      envelope: {
        commandId: `${cs.changeSetId}:cmd:${index}`,
        command: 'CREATE',
        modelId,
        branchId: cs.branchId,
        expectedHeadHash: cs.expectedHeadHash,
        actorId: 'agent:spds',
        actorType: 'ai',
        payload: {
          id: parsed.id,
          object: {
            ...parsed,
            attributes: { explorerKind: 'folder', label },
          },
        },
        idempotencyKey: `${cs.changeSetId}:create:folder:${index}:${parsed.id}`,
      },
    };
  }

  const path = typeof raw.path === 'string' ? raw.path : undefined;
  const value =
    typeof raw.value === 'number' && Number.isFinite(raw.value)
      ? raw.value
      : typeof raw.lengthMm === 'number' && Number.isFinite(raw.lengthMm)
        ? raw.lengthMm
        : undefined;
  const objectRecord: Record<string, unknown> = {
    ...parsed,
    ...(path !== undefined ? { path } : {}),
    ...(value !== undefined ? { value } : {}),
    unit: 'mm',
    role: 'design-variable',
    editableBy: ['user', 'agent'],
  };
  return {
    ok: true,
    createdParameter: {
      id: parsed.id,
      ...(path !== undefined ? { path } : {}),
      ...(value !== undefined ? { value } : {}),
    },
    envelope: {
      commandId: `${cs.changeSetId}:cmd:${index}`,
      command: 'CREATE',
      modelId,
      branchId: cs.branchId,
      expectedHeadHash: cs.expectedHeadHash,
      actorId: 'agent:spds',
      actorType: 'ai',
      payload: {
        id: parsed.id,
        object: objectRecord,
      },
      idempotencyKey: `${cs.changeSetId}:create:param:${index}:${parsed.id}`,
    },
  };
}

function isAllowedPatternId(id: string): boolean {
  return (
    id === GOLDBERG_PATTERN_PUBLISHED_ID ||
    id === 'pattern:goldberg-cellular-topology' ||
    id.startsWith('pattern:goldberg-cellular-topology@')
  );
}

function lowerApplyPattern(
  cmd: ChangeSetCommand,
  cs: ChangeSet,
  modelId: string,
  index: number,
):
  | {
      readonly ok: true;
      readonly envelopes: readonly ChangeSetAcceptEnvelope[];
      readonly params: GeometryParamOverrides;
      readonly patternId: string;
      readonly patternInstanceId: string;
    }
  | { readonly ok: false; readonly failureCode: string; readonly reason: string } {
  const payload = asRecord(cmd.payload) ?? {};
  const patternId =
    (typeof cmd.targetId === 'string' && cmd.targetId.length > 0 ? cmd.targetId : undefined) ??
    (typeof payload.patternId === 'string' ? payload.patternId : undefined) ??
    (typeof payload.publishedBaseId === 'string' ? payload.publishedBaseId : undefined);
  if (!patternId) {
    return {
      ok: false,
      failureCode: 'UNKNOWN_PATTERN',
      reason: 'apply_pattern requires targetId or payload.patternId',
    };
  }
  if (!isAllowedPatternId(patternId)) {
    return {
      ok: false,
      failureCode: 'UNKNOWN_PATTERN',
      reason: `apply_pattern allowlist is ${GOLDBERG_PATTERN_PUBLISHED_ID} (got ${patternId})`,
    };
  }

  const publishedBaseId = GOLDBERG_PATTERN_PUBLISHED_ID;
  const overrides: Array<{ path: string; value: unknown }> = [];
  if (Array.isArray(payload.overrides)) {
    for (const item of payload.overrides) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      if (typeof o.path === 'string' && o.path.length > 0 && 'value' in o) {
        overrides.push({ path: o.path, value: o.value });
      }
    }
  }
  // Pattern param/rule shorthand used by G13 gate.
  if (typeof payload.frequency === 'number' && Number.isFinite(payload.frequency)) {
    overrides.push({ path: 'params.frequency', value: payload.frequency });
  }
  if (typeof payload.diameterMm === 'number' && Number.isFinite(payload.diameterMm)) {
    overrides.push({ path: 'params.diameterMm', value: payload.diameterMm });
  }
  if (typeof payload.riseRatio === 'number' && Number.isFinite(payload.riseRatio)) {
    overrides.push({ path: 'params.riseRatio', value: payload.riseRatio });
  }
  if (overrides.length === 0) {
    // Binding-only apply still records pattern on composition experiment layer.
    overrides.push({ path: 'params.frequency', value: 2 });
  }

  const compositionPatch = {
    id: COMPOSITION_D01_ID,
    kind: 'Composition',
    semanticType: 'composition.document',
    publishedBaseId,
    publishedBaseImmutable: true,
    layers: [
      {
        layer: 'base',
        overrides: [
          { path: 'params.frequency', value: 2 },
          { path: 'params.diameterMm', value: 20000 },
          { path: 'params.riseRatio', value: 0.5 },
        ],
      },
      {
        layer: 'experiment',
        overrides,
      },
    ],
    objects: {
      params: {
        frequency: 2,
        diameterMm: 20000,
        riseRatio: 0.5,
        ...Object.fromEntries(
          overrides
            .filter((o) => o.path.startsWith('params.'))
            .map((o) => [o.path.slice('params.'.length), o.value]),
        ),
      },
    },
    patternInstanceId: D01_PATTERN_INSTANCE_ID,
    appliedBy: 'ai:apply_pattern',
  };

  const envelopes: ChangeSetAcceptEnvelope[] = [
    {
      commandId: `${cs.changeSetId}:cmd:${index}:apply`,
      command: 'APPLY',
      modelId,
      branchId: cs.branchId,
      expectedHeadHash: cs.expectedHeadHash,
      actorId: 'agent:spds',
      actorType: 'ai',
      payload: {
        patternId: publishedBaseId,
        publishedBaseId,
        patternInstanceId: D01_PATTERN_INSTANCE_ID,
        objects: {
          [COMPOSITION_D01_ID]: compositionPatch,
        },
      },
      idempotencyKey: `${cs.changeSetId}:apply_pattern:${index}:${publishedBaseId}`,
    },
  ];

  const params: {
    lengthMm?: number;
    armWidthMm?: number;
    structuralDepthMm?: number;
  } = {};
  const tryGeom = (path: D01GeometryParamPath, raw: unknown): void => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return;
    const { min, max } = domainFor(path);
    const value = clamp(raw, min, max);
    envelopes.push(makeUpdateEnvelope(cs, modelId, index, path, value));
    params[path] = value;
  };
  tryGeom('lengthMm', payload.lengthMm);
  tryGeom('armWidthMm', payload.armWidthMm);
  tryGeom('structuralDepthMm', payload.structuralDepthMm);

  return {
    ok: true,
    envelopes,
    params,
    patternId: publishedBaseId,
    patternInstanceId: D01_PATTERN_INSTANCE_ID,
  };
}

function resolveMode(input: {
  readonly hasGeometry: boolean;
  readonly hasOrganise: boolean;
  readonly hasCreate: boolean;
  readonly hasPattern: boolean;
}): ChangeSetAcceptMode {
  // Folder create lowers to organiseOps; keep mode 'create' when no geometry/pattern.
  if (input.hasCreate && !input.hasGeometry && !input.hasPattern) return 'create';
  if (input.hasPattern && !input.hasGeometry && !input.hasOrganise && !input.hasCreate) {
    return 'pattern';
  }
  if (input.hasOrganise && !input.hasGeometry && !input.hasPattern && !input.hasCreate) {
    return 'organise';
  }
  if (input.hasGeometry && !input.hasOrganise && !input.hasCreate && !input.hasPattern) {
    return 'geometry';
  }
  if (input.hasPattern && !input.hasOrganise && !input.hasCreate) return 'pattern';
  const nonGeom = [input.hasOrganise, input.hasCreate, input.hasPattern].filter(Boolean).length;
  if (input.hasGeometry && nonGeom > 0) return 'mixed';
  if (nonGeom > 1) return 'mixed';
  return 'geometry';
}

export function changeSetToSemanticCommands(
  cs: ChangeSet,
  options?: { readonly modelId?: string },
): ChangeSetLowerResult {
  const v = validateChangeSet(cs);
  if (!v.ok) {
    return {
      ok: false,
      envelopes: [],
      organiseOps: [],
      mode: 'geometry',
      geometryRegen: false,
      failureCode: 'CHANGESET_INVALID',
      reason: v.reason ?? 'invalid ChangeSet',
    };
  }

  const modelId = options?.modelId ?? 'model:D01';
  const envelopes: ChangeSetAcceptEnvelope[] = [];
  const organiseOps: OrganiseAcceptOp[] = [];
  const createdParameters: CreatedParameterStub[] = [];
  const geometryParams: {
    lengthMm?: number;
    armWidthMm?: number;
    structuralDepthMm?: number;
  } = {};
  let hasGeometry = false;
  let hasOrganise = false;
  let hasCreate = false;
  let hasPattern = false;
  let patternInstanceId: string | undefined;
  let appliedPatternId: string | undefined;

  for (let i = 0; i < cs.commands.length; i++) {
    const cmd = cs.commands[i]!;
    switch (cmd.op) {
      case 'update': {
        const lowered = lowerUpdateGeometry(cmd, cs, modelId, i);
        if (!lowered.ok) {
          return {
            ok: false,
            envelopes: [],
            organiseOps: [],
            mode: 'geometry',
            geometryRegen: false,
            failureCode: lowered.failureCode,
            reason: lowered.reason,
          };
        }
        envelopes.push(...lowered.envelopes);
        Object.assign(geometryParams, lowered.params);
        hasGeometry = true;
        break;
      }
      case 'create': {
        const lowered = lowerCreate(cmd, cs, modelId, i);
        if (!lowered.ok) {
          return {
            ok: false,
            envelopes: [],
            organiseOps: [],
            mode: 'create',
            geometryRegen: false,
            failureCode: lowered.failureCode,
            reason: lowered.reason,
          };
        }
        envelopes.push(lowered.envelope);
        if (lowered.organiseOp) {
          organiseOps.push(lowered.organiseOp);
          hasOrganise = true;
        }
        if (lowered.createdParameter) {
          createdParameters.push(lowered.createdParameter);
        }
        hasCreate = true;
        break;
      }
      case 'create_group': {
        const lowered = lowerCreateGroup(cmd, cs, modelId, i);
        if (!lowered.ok) {
          return {
            ok: false,
            envelopes: [],
            organiseOps: [],
            mode: 'organise',
            geometryRegen: false,
            failureCode: lowered.failureCode,
            reason: lowered.reason,
          };
        }
        envelopes.push(lowered.envelope);
        organiseOps.push(lowered.op);
        hasOrganise = true;
        break;
      }
      case 'connect': {
        const lowered = lowerConnect(cmd, cs, modelId, i);
        if (!lowered.ok) {
          return {
            ok: false,
            envelopes: [],
            organiseOps: [],
            mode: 'organise',
            geometryRegen: false,
            failureCode: lowered.failureCode,
            reason: lowered.reason,
          };
        }
        envelopes.push(lowered.envelope);
        organiseOps.push(lowered.op);
        hasOrganise = true;
        break;
      }
      case 'apply_pattern': {
        const lowered = lowerApplyPattern(cmd, cs, modelId, i);
        if (!lowered.ok) {
          return {
            ok: false,
            envelopes: [],
            organiseOps: [],
            mode: 'pattern',
            geometryRegen: false,
            failureCode: lowered.failureCode,
            reason: lowered.reason,
          };
        }
        envelopes.push(...lowered.envelopes);
        Object.assign(geometryParams, lowered.params);
        hasPattern = true;
        if (Object.keys(lowered.params).length > 0) hasGeometry = true;
        patternInstanceId = lowered.patternInstanceId;
        appliedPatternId = lowered.patternId;
        break;
      }
      case 'delete':
        return {
          ok: false,
          envelopes: [],
          organiseOps: [],
          mode: 'geometry',
          geometryRegen: false,
          failureCode: 'UNSUPPORTED_OP',
          reason: `MVP accept does not support ${cmd.op}`,
        };
      default: {
        const _exhaustive: never = cmd.op;
        return {
          ok: false,
          envelopes: [],
          organiseOps: [],
          mode: 'geometry',
          geometryRegen: false,
          failureCode: 'UNSUPPORTED_OP',
          reason: `Unknown op ${String(_exhaustive)}`,
        };
      }
    }
  }

  if (envelopes.length === 0) {
    return {
      ok: false,
      envelopes: [],
      organiseOps: [],
      mode: 'geometry',
      geometryRegen: false,
      failureCode: 'EMPTY',
      reason: 'No commands to accept',
    };
  }

  const mode = resolveMode({ hasGeometry, hasOrganise, hasCreate, hasPattern });
  const geometryRegen = hasGeometry || hasPattern;

  if (
    mode === 'geometry' &&
    !hasPattern &&
    geometryParams.lengthMm === undefined &&
    geometryParams.armWidthMm === undefined &&
    geometryParams.structuralDepthMm === undefined
  ) {
    return {
      ok: false,
      envelopes: [],
      organiseOps: [],
      mode,
      geometryRegen: false,
      failureCode: 'EMPTY',
      reason: 'No geometry parameter updates to accept',
    };
  }

  return {
    ok: true,
    envelopes,
    organiseOps,
    mode,
    geometryRegen,
    geometryParams,
    ...(createdParameters.length > 0 ? { createdParameters } : {}),
    ...(patternInstanceId !== undefined ? { patternInstanceId } : {}),
    ...(appliedPatternId !== undefined ? { appliedPatternId } : {}),
    ...(geometryParams.lengthMm !== undefined ? { lengthMmOverride: geometryParams.lengthMm } : {}),
  };
}

/** True when ChangeSet only organises hierarchy / creates stubs (no geometry regen). */
export function isOrganiseOnlyLowerResult(result: ChangeSetLowerResult): boolean {
  return result.ok && !result.geometryRegen;
}

/** True when ChangeSet includes a pattern param/rule op (G13 gate). */
export function changeSetHasPatternParamRule(cs: ChangeSet): boolean {
  return cs.commands.some((c) => c.op === 'apply_pattern' || c.op === 'create');
}
