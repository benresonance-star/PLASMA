/**
 * Schema View view-model — consumes GET /models/:id/schema or GET /schema payload.
 * Widened for Schema canvas + detail rail (plan S04).
 */

import {
  CREATE_KINDS_ALLOWLIST,
  DEFAULT_ACCEPT_OPS,
  DEFAULT_UNSUPPORTED_OPS,
  GOLDBERG_PATTERN_PUBLISHED_ID,
  LENGTH_MM_MAX,
  LENGTH_MM_MIN,
  PARAM_D01_ARM_WIDTH_ID,
  PARAM_D01_LENGTH_ID,
  PARAM_D01_STRUCTURAL_DEPTH_ID,
} from '@spds/ai-interface';

export interface SchemaViewLiveType {
  readonly semanticType: string;
  readonly count: number;
  readonly sampleIds: readonly string[];
}

export interface SchemaViewParameter {
  readonly id: string;
  readonly path: string;
  readonly domain: { readonly min: number; readonly max: number };
  readonly quantity?: { readonly value: number; readonly unit: string };
  readonly role?: string;
}

export interface SchemaViewMutateSlice {
  readonly acceptOps: readonly string[];
  readonly unsupportedOps: readonly string[];
  readonly kindsAllowlist: readonly string[];
  readonly parameters: readonly SchemaViewParameter[];
  readonly examples: readonly unknown[];
  readonly worldNotes: string;
}

export interface SchemaViewModel {
  readonly modelId: string;
  readonly live: boolean;
  readonly contextMissing: boolean;
  readonly kinds: readonly string[];
  readonly relationships: {
    readonly core: readonly string[];
    readonly sdi: readonly string[];
  };
  readonly sdiToStorage: readonly { readonly sdi: string; readonly storage: string }[];
  readonly liveTypes: readonly SchemaViewLiveType[];
  readonly organisation: {
    readonly folderCount: number;
    readonly folderIds: readonly string[];
  };
  readonly patterns: readonly string[];
  readonly operators: readonly string[];
  readonly mutate: SchemaViewMutateSlice | null;
}

const DEFAULT_WORLD_NOTES =
  'Three.js camera is Y-up for display only; mutate WORLD (+Z) quantities in mm.';

/** Default mutate slice when agentContext is not yet bound (D01-capable). */
export function defaultSchemaMutateSlice(input?: {
  readonly lengthMm?: number;
  readonly armWidthMm?: number;
  readonly structuralDepthMm?: number;
}): SchemaViewMutateSlice {
  const lengthMm = input?.lengthMm ?? 2300;
  const armWidthMm = input?.armWidthMm ?? 80;
  const structuralDepthMm = input?.structuralDepthMm ?? 40;
  return {
    acceptOps: [...DEFAULT_ACCEPT_OPS],
    unsupportedOps: [...DEFAULT_UNSUPPORTED_OPS],
    kindsAllowlist: [...CREATE_KINDS_ALLOWLIST],
    parameters: [
      {
        id: PARAM_D01_LENGTH_ID,
        path: 'lengthMm',
        domain: { min: LENGTH_MM_MIN, max: LENGTH_MM_MAX },
        quantity: { value: lengthMm, unit: 'mm' },
        role: 'design-variable',
      },
      {
        id: PARAM_D01_ARM_WIDTH_ID,
        path: 'armWidthMm',
        domain: { min: 10, max: 500 },
        quantity: { value: armWidthMm, unit: 'mm' },
        role: 'design-variable',
      },
      {
        id: PARAM_D01_STRUCTURAL_DEPTH_ID,
        path: 'structuralDepthMm',
        domain: { min: 10, max: 500 },
        quantity: { value: structuralDepthMm, unit: 'mm' },
        role: 'design-variable',
      },
    ],
    examples: [],
    worldNotes: DEFAULT_WORLD_NOTES,
  };
}

function parseMutateSlice(input: unknown): SchemaViewMutateSlice | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.parameters)) return null;
  const parameters: SchemaViewParameter[] = [];
  for (const item of raw.parameters) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const parameter = item as Record<string, unknown>;
    const domain = parameter.domain as Record<string, unknown> | undefined;
    const quantity = parameter.quantity as Record<string, unknown> | undefined;
    if (
      typeof parameter.id !== 'string' ||
      typeof parameter.path !== 'string' ||
      !domain ||
      typeof domain.min !== 'number' ||
      typeof domain.max !== 'number'
    ) {
      continue;
    }
    parameters.push({
      id: parameter.id,
      path: parameter.path,
      domain: { min: domain.min, max: domain.max },
      ...(quantity && typeof quantity.value === 'number' && typeof quantity.unit === 'string'
        ? { quantity: { value: quantity.value, unit: quantity.unit } }
        : {}),
      ...(typeof parameter.role === 'string' ? { role: parameter.role } : {}),
    });
  }
  return {
    acceptOps: Array.isArray(raw.acceptOps) ? raw.acceptOps.map(String) : [],
    unsupportedOps: Array.isArray(raw.unsupportedOps) ? raw.unsupportedOps.map(String) : [],
    kindsAllowlist: Array.isArray(raw.kindsAllowlist) ? raw.kindsAllowlist.map(String) : [],
    parameters,
    examples: Array.isArray(raw.examples) ? raw.examples : [],
    worldNotes: typeof raw.worldNotes === 'string' ? raw.worldNotes : DEFAULT_WORLD_NOTES,
  };
}

export function parseSchemaViewPayload(body: unknown): SchemaViewModel | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (!Array.isArray(o.kinds) || !Array.isArray(o.liveTypes)) return null;
  const relationships = o.relationships as Record<string, unknown> | undefined;
  const organisation = o.organisation as Record<string, unknown> | undefined;
  if (!relationships || !organisation) return null;
  const modelId = typeof o.modelId === 'string' && o.modelId.length > 0 ? o.modelId : 'catalog';
  const sdiToStorageRaw = Array.isArray(relationships.sdiToStorage)
    ? relationships.sdiToStorage
    : [];
  const patternsFromOrg =
    Array.isArray(o.patterns) && o.patterns.every((p) => typeof p === 'string')
      ? (o.patterns as string[])
      : [];
  const operatorsFromBody =
    Array.isArray(o.operators) && o.operators.every((p) => typeof p === 'string')
      ? (o.operators as string[])
      : ['y-network.v1'];
  const liveTypes = (o.liveTypes as unknown[]).map((t) => {
    const row = t as Record<string, unknown>;
    return {
      semanticType: String(row.semanticType ?? ''),
      count: Number(row.count ?? 0),
      sampleIds: Array.isArray(row.sampleIds) ? row.sampleIds.map(String) : [],
    };
  });
  const patternIds = new Set<string>(patternsFromOrg);
  for (const t of liveTypes) {
    if (t.semanticType.startsWith('pattern.')) {
      for (const id of t.sampleIds) patternIds.add(id);
    }
  }
  if (patternIds.size === 0) patternIds.add(GOLDBERG_PATTERN_PUBLISHED_ID);

  return {
    modelId,
    live: o.live === true,
    contextMissing: o.contextMissing === true,
    kinds: o.kinds.map(String),
    relationships: {
      core: Array.isArray(relationships.core) ? relationships.core.map(String) : [],
      sdi: Array.isArray(relationships.sdi) ? relationships.sdi.map(String) : [],
    },
    sdiToStorage: sdiToStorageRaw.map((row) => {
      const r = row as Record<string, unknown>;
      return { sdi: String(r.sdi ?? ''), storage: String(r.storage ?? '') };
    }),
    liveTypes,
    organisation: {
      folderCount: Number(organisation.folderCount ?? 0),
      folderIds: Array.isArray(organisation.folderIds) ? organisation.folderIds.map(String) : [],
    },
    patterns: [...patternIds].sort((a, b) => a.localeCompare(b)),
    operators: operatorsFromBody,
    mutate: parseMutateSlice(o.mutate),
  };
}

export function attachSchemaMutateSlice(
  vm: SchemaViewModel,
  mutate: SchemaViewMutateSlice | null,
): SchemaViewModel {
  return { ...vm, mutate };
}

/** Prefer a mappable geometry owner from a live type's samples. */
export function schemaSampleSelectableId(sampleIds: readonly string[]): string | null {
  for (const id of sampleIds) {
    if (id.startsWith('component:') || id.startsWith('y:') || id.startsWith('panel:')) {
      return id;
    }
  }
  return sampleIds[0] ?? null;
}
