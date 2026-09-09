import { describe, expect, it } from 'vitest';
import {
  EXPLORER_ROOT_ID,
  explorerChildren,
  explorerCreate,
  explorerDelete,
  explorerRename,
  explorerReorder,
  explorerReparent,
  flattenExplorerSemanticIds,
  seedExplorerTree,
} from './explorer-tree.js';

describe('explorer-tree', () => {
  it('seeds a branched Model → component → Body tree', () => {
    const tree = seedExplorerTree(['component:y:0000', 'component:y:0001'], 'D01 Model');
    const roots = explorerChildren(tree, null);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.id).toBe(EXPLORER_ROOT_ID);
    const comps = explorerChildren(tree, EXPLORER_ROOT_ID);
    expect(comps.map((c) => c.semanticId)).toEqual(['component:y:0000', 'component:y:0001']);
    expect(explorerChildren(tree, comps[0]!.id)[0]?.kind).toBe('body');
    expect(flattenExplorerSemanticIds(tree)).toEqual([
      'component:y:0000',
      'component:y:0001',
    ]);
  });

  it('supports CRUD and sibling reorder', () => {
    let tree = seedExplorerTree(['a', 'b'], 'Model');
    const created = explorerCreate(tree, { parentId: EXPLORER_ROOT_ID, label: 'New' });
    tree = created.nodes;
    expect(flattenExplorerSemanticIds(tree)).toContain(created.createdId);
    tree = explorerRename(tree, created.createdId, 'Renamed');
    expect(tree.find((n) => n.id === created.createdId)?.label).toBe('Renamed');
    tree = explorerReorder(tree, 'b', -1);
    expect(explorerChildren(tree, EXPLORER_ROOT_ID).map((n) => n.id).slice(0, 2)).toEqual([
      'b',
      'a',
    ]);
    tree = explorerDelete(tree, 'a');
    expect(flattenExplorerSemanticIds(tree)).not.toContain('a');
  });

  it('supports indent/outdent reparenting without cycles', () => {
    let tree = seedExplorerTree(['a', 'b'], 'Model');
    tree = explorerReparent(tree, 'b', 'a');
    expect(explorerChildren(tree, 'a').some((n) => n.id === 'b')).toBe(true);
    // Refuse nesting under own descendant.
    const blocked = explorerReparent(tree, 'a', 'b');
    expect(blocked).toBe(tree);
  });
});
