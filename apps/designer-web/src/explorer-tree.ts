/**
 * Fusion-style browser tree — branching, CRUD, sibling reorder (client session).
 */

export type ExplorerNodeKind = 'assembly' | 'component' | 'body' | 'folder' | 'import';

export interface ExplorerNode {
  readonly id: string;
  readonly label: string;
  readonly kind: ExplorerNodeKind;
  readonly parentId: string | null;
  readonly order: number;
  /** Semantic id used for viewport selection / mesh highlight. */
  readonly semanticId: string;
}

export const EXPLORER_ROOT_ID = 'assy:root';

function shortLabel(id: string): string {
  const parts = id.split(':');
  return parts.length > 1 ? parts.slice(-2).join(':') : id;
}

function kindForId(id: string): ExplorerNodeKind {
  if (id.startsWith('import:') || id.includes('step')) return 'import';
  if (id.startsWith('assy:') || id.startsWith('a01')) return 'assembly';
  if (id.startsWith('panel:') || id.startsWith('body:')) return 'body';
  return 'component';
}

/** Seed a Fusion-like tree: Model → components (optional Body under each). */
export function seedExplorerTree(
  ids: readonly string[],
  modelLabel = 'Model',
): readonly ExplorerNode[] {
  const unique = [...new Set(ids.filter(Boolean))];
  const root: ExplorerNode = {
    id: EXPLORER_ROOT_ID,
    label: modelLabel,
    kind: 'assembly',
    parentId: null,
    order: 0,
    semanticId: EXPLORER_ROOT_ID,
  };
  const nodes: ExplorerNode[] = [root];
  unique.forEach((id, i) => {
    const componentId = id;
    nodes.push({
      id: componentId,
      label: shortLabel(id),
      kind: kindForId(id),
      parentId: root.id,
      order: i,
      semanticId: id,
    });
    nodes.push({
      id: `body:${id}`,
      label: 'Body',
      kind: 'body',
      parentId: componentId,
      order: 0,
      semanticId: id,
    });
  });
  return nodes;
}

export function explorerChildren(
  nodes: readonly ExplorerNode[],
  parentId: string | null,
): readonly ExplorerNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .slice()
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function explorerDescendantIds(
  nodes: readonly ExplorerNode[],
  id: string,
): readonly string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const c of explorerChildren(nodes, pid)) {
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

/** Flatten selectable semantic ids (components / imports), stable order. */
export function flattenExplorerSemanticIds(nodes: readonly ExplorerNode[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const walk = (parentId: string | null) => {
    for (const n of explorerChildren(nodes, parentId)) {
      if (n.kind === 'component' || n.kind === 'import' || n.kind === 'body') {
        if (n.semanticId !== EXPLORER_ROOT_ID && !seen.has(n.semanticId)) {
          seen.add(n.semanticId);
          out.push(n.semanticId);
        }
      }
      walk(n.id);
    }
  };
  walk(null);
  return out;
}

export function explorerFind(
  nodes: readonly ExplorerNode[],
  id: string,
): ExplorerNode | undefined {
  return nodes.find((n) => n.id === id);
}

let createSeq = 0;

export function explorerCreate(
  nodes: readonly ExplorerNode[],
  input: {
    readonly parentId: string | null;
    readonly label?: string;
    readonly kind?: ExplorerNodeKind;
    readonly asSiblingOf?: string;
  },
): { readonly nodes: readonly ExplorerNode[]; readonly createdId: string } {
  let parentId = input.parentId;
  if (input.asSiblingOf) {
    const sib = explorerFind(nodes, input.asSiblingOf);
    parentId = sib?.parentId ?? parentId;
  }
  if (parentId !== null && !explorerFind(nodes, parentId)) {
    parentId = EXPLORER_ROOT_ID;
  }
  const siblings = explorerChildren(nodes, parentId);
  createSeq += 1;
  const kind = input.kind ?? 'component';
  const id =
    kind === 'folder'
      ? `folder:local:${Date.now().toString(36)}:${createSeq}`
      : `component:new:${Date.now().toString(36)}:${createSeq}`;
  const created: ExplorerNode = {
    id,
    label:
      input.label ??
      (kind === 'folder' ? `Folder ${siblings.length + 1}` : `Component ${siblings.length + 1}`),
    kind,
    parentId,
    order: siblings.length,
    semanticId: id,
  };
  if (kind === 'folder') {
    return { nodes: [...nodes, created], createdId: id };
  }
  const body: ExplorerNode = {
    id: `body:${id}`,
    label: 'Body',
    kind: 'body',
    parentId: id,
    order: 0,
    semanticId: id,
  };
  return { nodes: [...nodes, created, body], createdId: id };
}

export function explorerRename(
  nodes: readonly ExplorerNode[],
  id: string,
  label: string,
): readonly ExplorerNode[] {
  const next = label.trim();
  if (!next) return nodes;
  return nodes.map((n) => (n.id === id ? { ...n, label: next } : n));
}

export function explorerDelete(
  nodes: readonly ExplorerNode[],
  id: string,
): readonly ExplorerNode[] {
  if (id === EXPLORER_ROOT_ID) return nodes;
  const remove = new Set([id, ...explorerDescendantIds(nodes, id)]);
  const remaining = nodes.filter((n) => !remove.has(n.id));
  return normalizeSiblingOrders(remaining);
}

/** Move node among siblings by delta (−1 up / +1 down). */
export function explorerReorder(
  nodes: readonly ExplorerNode[],
  id: string,
  delta: -1 | 1,
): readonly ExplorerNode[] {
  const node = explorerFind(nodes, id);
  if (!node || node.id === EXPLORER_ROOT_ID) return nodes;
  const siblings = explorerChildren(nodes, node.parentId);
  const idx = siblings.findIndex((s) => s.id === id);
  const swap = idx + delta;
  if (idx < 0 || swap < 0 || swap >= siblings.length) return nodes;
  const a = siblings[idx]!;
  const b = siblings[swap]!;
  return nodes.map((n) => {
    if (n.id === a.id) return { ...n, order: b.order };
    if (n.id === b.id) return { ...n, order: a.order };
    return n;
  });
}

/** Nest under new parent (branch) or promote to parent's parent (outdent). */
export function explorerReparent(
  nodes: readonly ExplorerNode[],
  id: string,
  newParentId: string | null,
): readonly ExplorerNode[] {
  const node = explorerFind(nodes, id);
  if (!node || node.id === EXPLORER_ROOT_ID) return nodes;
  if (newParentId === id) return nodes;
  if (newParentId !== null) {
    if (!explorerFind(nodes, newParentId)) return nodes;
    if (explorerDescendantIds(nodes, id).includes(newParentId)) return nodes;
  }
  const siblings = explorerChildren(nodes, newParentId).filter((s) => s.id !== id);
  const updated = nodes.map((n) =>
    n.id === id ? { ...n, parentId: newParentId, order: siblings.length } : n,
  );
  return normalizeSiblingOrders(updated);
}

function normalizeSiblingOrders(nodes: readonly ExplorerNode[]): readonly ExplorerNode[] {
  const byParent = new Map<string | null, ExplorerNode[]>();
  for (const n of nodes) {
    const key = n.parentId;
    const list = byParent.get(key) ?? [];
    list.push(n);
    byParent.set(key, list);
  }
  const orderMap = new Map<string, number>();
  for (const list of byParent.values()) {
    list
      .slice()
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
      .forEach((n, i) => orderMap.set(n.id, i));
  }
  return nodes.map((n) => ({ ...n, order: orderMap.get(n.id) ?? n.order }));
}
