import { describe, expect, it } from 'vitest';
import {
  buildExplorerTreeFromGraph,
  explorerParentToSemanticParent,
} from './explorer-from-graph.js';
import { EXPLORER_ROOT_ID, explorerChildren } from './explorer-tree.js';

describe('buildExplorerTreeFromGraph', () => {
  it('returns empty nodes for empty graph and no owners', () => {
    const t0 = performance.now();
    const result = buildExplorerTreeFromGraph({
      modelId: 'model:x',
      objects: [],
      meshOwners: [],
    });
    const elapsed = performance.now() - t0;
    expect(result.error).toBeUndefined();
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.id).toBe(EXPLORER_ROOT_ID);
    expect(elapsed).toBeLessThan(5);
  });

  it('attaches orphan mesh owners under root with body children', () => {
    const result = buildExplorerTreeFromGraph({
      modelId: 'model:d01',
      modelLabel: 'D01 Model',
      objects: [],
      meshOwners: ['component:y:0000', 'component:y:0001', 'component:y:0002'],
    });
    expect(result.error).toBeUndefined();
    const comps = explorerChildren(result.nodes, EXPLORER_ROOT_ID);
    expect(comps.map((c) => c.semanticId)).toEqual([
      'component:y:0000',
      'component:y:0001',
      'component:y:0002',
    ]);
    expect(explorerChildren(result.nodes, comps[0]!.id)[0]?.kind).toBe('body');
  });

  it('nests components under folders via part-of', () => {
    const result = buildExplorerTreeFromGraph({
      modelId: 'model:d01',
      objects: [
        {
          id: 'folder:group-a',
          semanticType: 'ui.folder',
          tags: ['ui.folder'],
          attributes: { label: 'Group A' },
          edges: [{ type: 'part-of', to: 'model:d01' }],
        },
        {
          id: 'component:y:0000',
          semanticType: 'structural.y-component',
          edges: [{ type: 'part-of', to: 'folder:group-a' }],
        },
        {
          id: 'component:y:0001',
          semanticType: 'structural.y-component',
          edges: [{ type: 'part-of', to: 'folder:group-a' }],
        },
        {
          id: 'component:y:0002',
          semanticType: 'structural.y-component',
          edges: [{ type: 'part-of', to: 'model:d01' }],
        },
      ],
      meshOwners: ['component:y:0000', 'component:y:0001', 'component:y:0002'],
    });
    expect(result.error).toBeUndefined();
    const underRoot = explorerChildren(result.nodes, EXPLORER_ROOT_ID);
    expect(underRoot.map((n) => n.id)).toEqual(['folder:group-a', 'component:y:0002']);
    const underFolder = explorerChildren(result.nodes, 'folder:group-a');
    expect(underFolder.map((n) => n.id)).toEqual(['component:y:0000', 'component:y:0001']);
    expect(underRoot.find((n) => n.id === 'folder:group-a')?.kind).toBe('folder');
    expect(underRoot.find((n) => n.id === 'folder:group-a')?.label).toBe('Group A');
  });

  it('rejects cyclic part-of among folders', () => {
    const result = buildExplorerTreeFromGraph({
      modelId: 'model:d01',
      objects: [
        {
          id: 'folder:a',
          semanticType: 'ui.folder',
          edges: [{ type: 'part-of', to: 'folder:b' }],
        },
        {
          id: 'folder:b',
          semanticType: 'ui.folder',
          edges: [{ type: 'part-of', to: 'folder:a' }],
        },
      ],
      meshOwners: [],
    });
    expect(result.error).toBe('cycle');
    expect(result.nodes).toEqual([]);
  });

  it('builds 1k nodes under 10ms', () => {
    const owners = Array.from({ length: 1000 }, (_, i) => `component:y:${String(i).padStart(4, '0')}`);
    const t0 = performance.now();
    const result = buildExplorerTreeFromGraph({
      modelId: 'model:bench',
      objects: [],
      meshOwners: owners,
    });
    const elapsed = performance.now() - t0;
    expect(result.error).toBeUndefined();
    expect(result.nodes.length).toBe(1 + 1000 * 2);
    expect(elapsed).toBeLessThan(10);
  });

  it('maps explorer root parent to modelId for API', () => {
    expect(explorerParentToSemanticParent(EXPLORER_ROOT_ID, 'model:d01')).toBe('model:d01');
    expect(explorerParentToSemanticParent(null, 'model:d01')).toBe('model:d01');
    expect(explorerParentToSemanticParent('folder:a', 'model:d01')).toBe('folder:a');
  });
});
