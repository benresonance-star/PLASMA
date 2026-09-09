/**
 * Persist Explorer organisation (folders + folder part-of overlays) via VersionStore.
 * Survives API restart when DATABASE_URL → Postgres; InMemoryVersionStore for local process.
 */

import {
  asPromise,
  type Actor,
  type VersionStore,
} from '@spds/version-core';
import { IndexedSemanticGraph, type QueryableObject } from '@spds/semantic-query';
import {
  FOLDER_SEMANTIC_TYPE,
  isFolderObject,
  mergeOrganisationIntoContext,
} from './model-groups.js';
import type { ModelQueryContext } from './model-query-context.js';

export const ORG_LAYER_ATTR = '_spdsLayer';
export const ORG_LAYER_VALUE = 'organisation';

const DEFAULT_ACTOR: Actor = { type: 'user', id: 'api-organisation' };

function partOfTarget(obj: QueryableObject): string | undefined {
  return obj.edges?.find((e) => e.type === 'part-of')?.to;
}

export function isOrganisationStoreObject(o: Record<string, unknown>): boolean {
  if (typeof o.id !== 'string' || o.id.length === 0) return false;
  const attrs = o.attributes as Record<string, unknown> | undefined;
  if (attrs?.[ORG_LAYER_ATTR] === ORG_LAYER_VALUE) return true;
  if (o.semanticType === FOLDER_SEMANTIC_TYPE) return true;
  const tags = Array.isArray(o.tags) ? o.tags.map(String) : [];
  return tags.includes('ui.folder') || tags.includes('organisation');
}

export function extractOrganisationObjects(ctx: ModelQueryContext): QueryableObject[] {
  const folders = ctx.graph.all().filter(isFolderObject);
  const folderIds = new Set(folders.map((f) => f.id));
  const out: QueryableObject[] = folders.map((f) => ({
    ...f,
    tags: [...new Set([...(f.tags ?? []), 'ui.folder', 'organisation'])],
    attributes: {
      ...(f.attributes ?? {}),
      explorerKind: 'folder',
      [ORG_LAYER_ATTR]: ORG_LAYER_VALUE,
    },
    edges: f.edges ?? [{ type: 'part-of', to: ctx.modelId }],
  }));

  for (const obj of ctx.graph.all()) {
    if (isFolderObject(obj)) continue;
    const parent = partOfTarget(obj);
    if (!parent || !folderIds.has(parent)) continue;
    out.push({
      id: obj.id,
      semanticType: obj.semanticType,
      tags: [...(obj.tags ?? []), 'organisation-overlay'],
      attributes: {
        ...(obj.attributes ?? {}),
        [ORG_LAYER_ATTR]: ORG_LAYER_VALUE,
      },
      edges: obj.edges ?? [{ type: 'part-of', to: parent }],
    });
  }
  return out;
}

export function organisationObjectsFromBranch(
  objects: readonly Record<string, unknown>[],
): QueryableObject[] {
  const out: QueryableObject[] = [];
  for (const raw of objects) {
    if (!isOrganisationStoreObject(raw)) continue;
    const id = String(raw.id);
    const edgesRaw = Array.isArray(raw.edges) ? raw.edges : [];
    const edges = edgesRaw
      .map((e) => {
        const row = e as Record<string, unknown>;
        if (typeof row.type !== 'string' || typeof row.to !== 'string') return null;
        return { type: row.type, to: row.to };
      })
      .filter((e): e is { type: string; to: string } => e !== null);
    out.push({
      id,
      semanticType: typeof raw.semanticType === 'string' ? raw.semanticType : 'unknown',
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      attributes:
        raw.attributes && typeof raw.attributes === 'object'
          ? (raw.attributes as Record<string, unknown>)
          : {},
      edges,
    });
  }
  return out;
}

function toStoreRecord(obj: QueryableObject): Record<string, unknown> & { id: string } {
  return {
    id: obj.id,
    semanticType: obj.semanticType,
    tags: obj.tags ?? [],
    attributes: {
      ...(obj.attributes ?? {}),
      [ORG_LAYER_ATTR]: ORG_LAYER_VALUE,
    },
    edges: obj.edges ?? [],
  };
}

/** Load organisation layer from the model's main branch. */
export async function loadOrganisationFromStore(
  store: VersionStore,
  modelId: string,
): Promise<QueryableObject[]> {
  const branchId = store.getMainBranchId(modelId);
  try {
    const objects = await asPromise(store.listObjects(branchId));
    return organisationObjectsFromBranch(objects);
  } catch {
    return [];
  }
}

/**
 * Snapshot current organisation onto the main branch (upsert + delete stale).
 */
export async function persistOrganisationSnapshot(
  store: VersionStore,
  modelId: string,
  ctx: ModelQueryContext,
  actor: Actor = DEFAULT_ACTOR,
): Promise<void> {
  const branchId = store.getMainBranchId(modelId);
  const desired = extractOrganisationObjects(ctx);
  const desiredIds = new Set(desired.map((o) => o.id));

  let head = (await asPromise(store.getBranchHead(branchId))).headHash;
  const existing = organisationObjectsFromBranch(await asPromise(store.listObjects(branchId)));

  for (const old of existing) {
    if (desiredIds.has(old.id)) continue;
    try {
      await asPromise(store.deleteObject(branchId, actor, head, old.id));
      head = (await asPromise(store.getBranchHead(branchId))).headHash;
    } catch {
      head = (await asPromise(store.getBranchHead(branchId))).headHash;
    }
  }

  for (const obj of desired) {
    try {
      await asPromise(store.upsertObject(branchId, actor, head, toStoreRecord(obj)));
      head = (await asPromise(store.getBranchHead(branchId))).headHash;
    } catch {
      // HEAD_CONFLICT — refresh and retry once
      head = (await asPromise(store.getBranchHead(branchId))).headHash;
      await asPromise(store.upsertObject(branchId, actor, head, toStoreRecord(obj)));
      head = (await asPromise(store.getBranchHead(branchId))).headHash;
    }
  }
}

/** Merge in-memory previous + stored org objects into a freshly built D01 context. */
export function mergeOrganisationFromSources(
  next: ModelQueryContext,
  previous: ModelQueryContext | null,
  stored: readonly QueryableObject[],
): ModelQueryContext {
  const merged = mergeOrganisationIntoContext(next, previous);
  if (stored.length === 0) return merged;
  const storedCtx: ModelQueryContext = {
    ...merged,
    graph: new IndexedSemanticGraph(stored.map((o) => ({ ...o, edges: o.edges ?? [] }))),
    dependencyEdges: [],
  };
  return mergeOrganisationIntoContext(merged, storedCtx);
}
