/**
 * Build Explorer tree as a projection of semantic graph containment (`part-of`)
 * plus mesh semantic owners. Shared by bootstrap merge and live mesh refresh.
 */

import {
  EXPLORER_ROOT_ID,
  type ExplorerNode,
  type ExplorerNodeKind,
} from './explorer-tree.js';

export interface ExplorerGraphObject {
  readonly id: string;
  readonly semanticType: string;
  readonly tags?: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly edges?: ReadonlyArray<{ readonly type: string; readonly to: string }>;
}

export type BuildExplorerTreeError = 'cycle';

export interface BuildExplorerTreeResult {
  readonly nodes: readonly ExplorerNode[];
  readonly error?: BuildExplorerTreeError;
}

export function isExplorerFolderObject(obj: ExplorerGraphObject): boolean {
  if (obj.semanticType === 'ui.folder') return true;
  if (obj.tags?.includes('ui.folder')) return true;
  if (obj.attributes?.explorerKind === 'folder') return true;
  return false;
}

function shortLabel(id: string): string {
  const parts = id.split(':');
  return parts.length > 1 ? parts.slice(-2).join(':') : id;
}

function kindForMeshOwner(id: string): ExplorerNodeKind {
  if (id.startsWith('import:') || id.includes('step')) return 'import';
  if (id.startsWith('assy:') || id.startsWith('a01')) return 'assembly';
  if (id.startsWith('panel:') || id.startsWith('body:')) return 'body';
  return 'component';
}

function partOfParent(
  obj: ExplorerGraphObject | undefined,
): string | undefined {
  const edge = obj?.edges?.find((e) => e.type === 'part-of');
  return edge?.to;
}

/** Map explorer parent node id → semantic parent id for API reparent. */
export function explorerParentToSemanticParent(
  parentId: string | null,
  modelId: string,
): string {
  if (parentId === null || parentId === EXPLORER_ROOT_ID) return modelId;
  return parentId;
}

/**
 * Pure projection: folders (organisation) + mesh owners under `part-of` parents.
 * Root UI id is always `EXPLORER_ROOT_ID`; its semanticId is `modelId`.
 */
export function buildExplorerTreeFromGraph(input: {
  readonly modelId: string;
  readonly modelLabel?: string;
  readonly objects: readonly ExplorerGraphObject[];
  readonly meshOwners: readonly string[];
}): BuildExplorerTreeResult {
  const byId = new Map(input.objects.map((o) => [o.id, o]));
  const meshOwners = [...new Set(input.meshOwners.filter(Boolean))];
  const folders = input.objects.filter(isExplorerFolderObject);

  // Detect cycles among folders (and any containment chain that loops).
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycleFrom = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const parent = partOfParent(byId.get(id));
    if (parent && parent !== input.modelId && byId.has(parent)) {
      if (hasCycleFrom(parent)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const f of folders) {
    if (hasCycleFrom(f.id)) {
      return { nodes: [], error: 'cycle' };
    }
  }
  for (const owner of meshOwners) {
    visiting.clear();
    visited.clear();
    if (hasCycleFrom(owner)) {
      return { nodes: [], error: 'cycle' };
    }
  }

  const root: ExplorerNode = {
    id: EXPLORER_ROOT_ID,
    label: input.modelLabel ?? 'Model',
    kind: 'assembly',
    parentId: null,
    order: 0,
    semanticId: input.modelId,
  };

  const nodes: ExplorerNode[] = [root];
  const folderIds = new Set(folders.map((f) => f.id));

  const resolveExplorerParent = (semanticParent: string | undefined): string => {
    if (!semanticParent || semanticParent === input.modelId) return EXPLORER_ROOT_ID;
    if (folderIds.has(semanticParent)) return semanticParent;
    // Unknown / non-folder parent → root (orphan attach)
    return EXPLORER_ROOT_ID;
  };

  // Stable order: folders first (by id), then mesh owners as listed.
  const childOrder = new Map<string, number>();
  const nextOrder = (parentId: string): number => {
    const n = childOrder.get(parentId) ?? 0;
    childOrder.set(parentId, n + 1);
    return n;
  };

  const sortedFolders = folders.slice().sort((a, b) => a.id.localeCompare(b.id));
  for (const f of sortedFolders) {
    const parentId = resolveExplorerParent(partOfParent(f));
    const labelAttr = f.attributes?.label;
    nodes.push({
      id: f.id,
      label: typeof labelAttr === 'string' && labelAttr.trim() ? labelAttr : shortLabel(f.id),
      kind: 'folder',
      parentId,
      order: nextOrder(parentId),
      semanticId: f.id,
    });
  }

  for (const owner of meshOwners) {
    const obj = byId.get(owner);
    const parentId = resolveExplorerParent(partOfParent(obj));
    nodes.push({
      id: owner,
      label: shortLabel(owner),
      kind: kindForMeshOwner(owner),
      parentId,
      order: nextOrder(parentId),
      semanticId: owner,
    });
    nodes.push({
      id: `body:${owner}`,
      label: 'Body',
      kind: 'body',
      parentId: owner,
      order: 0,
      semanticId: owner,
    });
  }

  return { nodes };
}
