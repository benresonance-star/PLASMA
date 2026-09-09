/**
 * In-memory organisation mutations on ModelQueryContext (folders + part-of).
 * Durability: persist via model-organisation-persist → VersionStore main branch.
 */

import { IndexedSemanticGraph, type QueryableObject } from '@spds/semantic-query';
import type { ModelQueryContext } from './model-query-context.js';

export const FOLDER_SEMANTIC_TYPE = 'ui.folder';

export function isFolderObject(obj: QueryableObject): boolean {
  return (
    obj.semanticType === FOLDER_SEMANTIC_TYPE ||
    (obj.tags?.includes('ui.folder') ?? false) ||
    obj.attributes?.explorerKind === 'folder'
  );
}

function partOfTarget(obj: QueryableObject): string | undefined {
  return obj.edges?.find((e) => e.type === 'part-of')?.to;
}

function withPartOf(obj: QueryableObject, parentId: string): QueryableObject {
  const rest = (obj.edges ?? []).filter((e) => e.type !== 'part-of');
  return {
    ...obj,
    edges: [...rest, { type: 'part-of', to: parentId }],
  };
}

function wouldCreateCycle(
  graph: IndexedSemanticGraph,
  nodeId: string,
  newParentId: string,
  modelId: string,
): boolean {
  if (newParentId === nodeId) return true;
  let cursor: string | undefined = newParentId;
  const guard = new Set<string>();
  while (cursor && cursor !== modelId) {
    if (cursor === nodeId) return true;
    if (guard.has(cursor)) return true;
    guard.add(cursor);
    const obj = graph.get(cursor);
    cursor = obj ? partOfTarget(obj) : undefined;
  }
  return false;
}

let groupSeq = 0;

export type CreateGroupResult =
  | { readonly ok: true; readonly ctx: ModelQueryContext; readonly groupId: string }
  | { readonly ok: false; readonly error: 'parent_not_found' | 'cycle' | 'already_exists' };

export function createModelGroup(
  ctx: ModelQueryContext,
  input: { readonly label?: string; readonly parentId?: string; readonly groupId?: string },
): CreateGroupResult {
  const parentId = input.parentId ?? ctx.modelId;
  if (parentId !== ctx.modelId) {
    const parent = ctx.graph.get(parentId);
    if (!parent || !isFolderObject(parent)) {
      return { ok: false, error: 'parent_not_found' };
    }
  }

  groupSeq += 1;
  const groupId =
    typeof input.groupId === 'string' && input.groupId.trim()
      ? input.groupId.trim()
      : `folder:${ctx.modelId}:${Date.now().toString(36)}:${groupSeq}`;
  if (ctx.graph.get(groupId)) {
    return { ok: false, error: 'already_exists' };
  }
  const folder: QueryableObject = {
    id: groupId,
    semanticType: FOLDER_SEMANTIC_TYPE,
    tags: ['ui.folder', 'organisation'],
    attributes: {
      label: input.label?.trim() || `Folder ${groupSeq}`,
      explorerKind: 'folder',
    },
    edges: [{ type: 'part-of', to: parentId }],
  };

  if (wouldCreateCycle(ctx.graph, groupId, parentId, ctx.modelId)) {
    return { ok: false, error: 'cycle' };
  }

  const objects = [...ctx.graph.all().map((o) => ({ ...o, edges: o.edges ?? [] })), folder];
  const dependencyEdges = [
    ...ctx.dependencyEdges,
    { from: groupId, to: parentId, relationType: 'part-of' },
  ];

  return {
    ok: true,
    groupId,
    ctx: {
      ...ctx,
      graph: new IndexedSemanticGraph(objects),
      dependencyEdges,
    },
  };
}

export type ReparentResult =
  | { readonly ok: true; readonly ctx: ModelQueryContext }
  | {
      readonly ok: false;
      readonly error: 'node_not_found' | 'parent_not_found' | 'cycle' | 'cannot_reparent_model';
    };

export function reparentModelNode(
  ctx: ModelQueryContext,
  input: { readonly nodeId: string; readonly newParentId: string },
): ReparentResult {
  const { nodeId, newParentId } = input;
  if (nodeId === ctx.modelId) return { ok: false, error: 'cannot_reparent_model' };
  const node = ctx.graph.get(nodeId);
  if (!node) return { ok: false, error: 'node_not_found' };
  if (newParentId !== ctx.modelId && !ctx.graph.get(newParentId)) {
    return { ok: false, error: 'parent_not_found' };
  }
  if (newParentId !== ctx.modelId) {
    const parent = ctx.graph.get(newParentId)!;
    if (!isFolderObject(parent)) {
      // Components may only nest under folders or model for organisation.
      return { ok: false, error: 'parent_not_found' };
    }
  }
  if (wouldCreateCycle(ctx.graph, nodeId, newParentId, ctx.modelId)) {
    return { ok: false, error: 'cycle' };
  }

  const updated = withPartOf(node, newParentId);
  const objects = ctx.graph.all().map((o) => (o.id === nodeId ? updated : o));
  const kept = ctx.dependencyEdges.filter(
    (e) => !(e.from === nodeId && e.relationType === 'part-of'),
  );
  kept.push({ from: nodeId, to: newParentId, relationType: 'part-of' });

  return {
    ok: true,
    ctx: {
      ...ctx,
      graph: new IndexedSemanticGraph(objects),
      dependencyEdges: kept,
    },
  };
}

/** Preserve folder objects + folder containment when D01 substrate is rebuilt. */
export function mergeOrganisationIntoContext(
  next: ModelQueryContext,
  previous: ModelQueryContext | null,
): ModelQueryContext {
  if (!previous) return next;
  const folders = previous.graph.all().filter(isFolderObject);
  if (folders.length === 0) return next;

  const nextObjects = next.graph.all().map((o) => ({ ...o }));
  const byId = new Map(nextObjects.map((o) => [o.id, o]));

  for (const folder of folders) {
    byId.set(folder.id, {
      ...folder,
      edges: folder.edges ?? [{ type: 'part-of', to: next.modelId }],
    });
  }

  // Restore component → folder part-of when owner still exists.
  for (const obj of previous.graph.all()) {
    if (isFolderObject(obj)) continue;
    const parent = partOfTarget(obj);
    if (!parent || !folders.some((f) => f.id === parent)) continue;
    const live = byId.get(obj.id);
    if (!live) continue;
    byId.set(obj.id, withPartOf(live, parent));
  }

  const objects = [...byId.values()];
  const folderEdges = folders.map((f) => ({
    from: f.id,
    to: partOfTarget(f) ?? next.modelId,
    relationType: 'part-of' as const,
  }));
  const ownerFolderEdges = objects
    .filter((o) => {
      const p = partOfTarget(o);
      return p !== undefined && folders.some((f) => f.id === p);
    })
    .map((o) => ({
      from: o.id,
      to: partOfTarget(o)!,
      relationType: 'part-of' as const,
    }));

  // Drop next's component→model part-of dependency rows when overridden by folder.
  const overridden = new Set(ownerFolderEdges.map((e) => e.from));
  const baseDeps = next.dependencyEdges.filter(
    (e) => !(e.relationType === 'part-of' && overridden.has(e.from)),
  );

  return {
    ...next,
    graph: new IndexedSemanticGraph(objects),
    dependencyEdges: [...baseDeps, ...folderEdges, ...ownerFolderEdges],
  };
}

/** Serialise graph objects with edges for explorer / schema clients. */
export function serializeGraphObjects(ctx: ModelQueryContext): ReadonlyArray<{
  readonly id: string;
  readonly semanticType: string;
  readonly tags: readonly string[];
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly edges: ReadonlyArray<{ readonly type: string; readonly to: string }>;
}> {
  return ctx.graph.all().map((o) => ({
    id: o.id,
    semanticType: o.semanticType,
    tags: o.tags ?? [],
    attributes: o.attributes ?? {},
    edges: o.edges ?? [],
  }));
}
