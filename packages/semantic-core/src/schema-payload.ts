/**
 * Shared static + live schema payload for Schema View and AI schema_catalog.
 */

import { SEMANTIC_KINDS } from './kinds.js';
import { CORE_RELATIONSHIP_TYPES } from './relationships.js';
import { allSdiStoragePairs, SDI_RELATIONSHIP_TYPES } from './relationship-aliases.js';

export interface SchemaLiveType {
  readonly semanticType: string;
  readonly count: number;
  readonly sampleIds: readonly string[];
}

export interface SchemaOrganisationSummary {
  readonly folderCount: number;
  readonly folderIds: readonly string[];
}

export interface SchemaPayload {
  readonly kinds: readonly string[];
  readonly relationships: {
    readonly core: readonly string[];
    readonly sdi: readonly string[];
    readonly sdiToStorage: ReadonlyArray<{ readonly sdi: string; readonly storage: string }>;
  };
  readonly liveTypes: readonly SchemaLiveType[];
  readonly organisation: SchemaOrganisationSummary;
}

export interface SchemaLiveObject {
  readonly id: string;
  readonly semanticType: string;
  readonly tags?: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

function isFolder(obj: SchemaLiveObject): boolean {
  return (
    obj.semanticType === 'ui.folder' ||
    (obj.tags?.includes('ui.folder') ?? false) ||
    obj.attributes?.explorerKind === 'folder'
  );
}

export function buildStaticSchema(): Pick<SchemaPayload, 'kinds' | 'relationships'> {
  return {
    kinds: [...SEMANTIC_KINDS],
    relationships: {
      core: [...CORE_RELATIONSHIP_TYPES],
      sdi: [...SDI_RELATIONSHIP_TYPES],
      sdiToStorage: allSdiStoragePairs().map((p) => ({ sdi: p.sdi, storage: p.storage })),
    },
  };
}

export function buildLiveSchemaSlice(objects: readonly SchemaLiveObject[]): {
  readonly liveTypes: readonly SchemaLiveType[];
  readonly organisation: SchemaOrganisationSummary;
} {
  const byType = new Map<string, string[]>();
  const folderIds: string[] = [];
  for (const obj of objects) {
    const list = byType.get(obj.semanticType) ?? [];
    list.push(obj.id);
    byType.set(obj.semanticType, list);
    if (isFolder(obj)) folderIds.push(obj.id);
  }
  const liveTypes = [...byType.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semanticType, ids]) => ({
      semanticType,
      count: ids.length,
      sampleIds: ids.slice(0, 8),
    }));
  return {
    liveTypes,
    organisation: {
      folderCount: folderIds.length,
      folderIds: folderIds.slice().sort((a, b) => a.localeCompare(b)),
    },
  };
}

/** Assemble full schema payload (static kinds/relations + optional live model slice). */
export function buildSchemaPayload(
  liveObjects: readonly SchemaLiveObject[] = [],
): SchemaPayload {
  const staticPart = buildStaticSchema();
  const live = buildLiveSchemaSlice(liveObjects);
  return {
    ...staticPart,
    liveTypes: live.liveTypes,
    organisation: live.organisation,
  };
}

/** Map schema payload + objects into AI tool catalog shape. */
export function schemaPayloadToAiCatalog(
  payload: SchemaPayload,
  objects: readonly SchemaLiveObject[],
): {
  readonly objects: readonly { readonly id: string; readonly kind: string }[];
  readonly patterns: readonly string[];
  readonly operators: readonly string[];
  readonly schemaTypes: readonly string[];
} {
  const schemaTypes = [
    ...new Set([...payload.kinds, ...payload.liveTypes.map((t) => t.semanticType)]),
  ].sort((a, b) => a.localeCompare(b));
  const patterns = objects
    .filter((o) => o.semanticType.startsWith('pattern.'))
    .map((o) => o.id);
  return {
    objects: objects.map((o) => ({ id: o.id, kind: o.semanticType })),
    patterns: patterns.length > 0 ? patterns : ['geodesic'],
    operators: ['y-network.v1'],
    schemaTypes,
  };
}
