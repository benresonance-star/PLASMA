/**
 * SD1 gate: selecting a generated Y highlights it in the semantic projection and vice versa.
 * Uses pipeline-generated D01 meshes — not demo-meshes.
 */

import { describe, expect, it } from 'vitest';
import { buildD01DisplayMeshes } from '@spds/reference-pipeline';
import { IndexedSemanticGraph } from '@spds/semantic-query';
import { projectCausalNeighbourhood } from '@spds/graph-projection';
import {
  createSelectionStore,
  focusGeometry,
  selectSemantic,
  selectionInSync,
} from '../selection-sync.js';
import {
  projectionToReactFlow,
  semanticIdsFromRfSelection,
} from './reactflow-adapter.js';

describe('SDI SD1 gate (live substrate)', () => {
  it('syncs viewport pick of generated Y with graph projection selection', async () => {
    const live = await buildD01DisplayMeshes({ yLimit: 3 });
    expect(live.meshes.length).toBe(9);
    const owners = live.meshes.map((m) => m.semanticOwner);
    const y = owners[0]!;
    expect(y.startsWith('component:y:')).toBe(true);

    const graph = new IndexedSemanticGraph([
      { id: 'pattern:d01:y-network', semanticType: 'pattern.y-network' },
      ...owners.map((id) => ({
        id,
        semanticType: 'structural.y-component',
      })),
    ]);
    const dependencyEdges = owners.map((id) => ({
      from: 'pattern:d01:y-network',
      to: id,
      relationType: 'produces',
    }));

    // Viewport pick → selection store (graph source surface included).
    let store = createSelectionStore();
    const t0 = 10;
    store = selectSemantic(store, y, 'viewport', t0);
    expect(selectionInSync(store)).toBe(true);
    expect(store.sources.graph).toBe(y);
    expect(store.lastSyncAtMs - t0).toBeLessThanOrEqual(100);

    const projection = projectCausalNeighbourhood({
      graph,
      dependencyEdges,
      focusObjectIds: [store.selectedSemanticId!],
      radius: 1,
    });
    const { nodes } = projectionToReactFlow(projection);
    const focusNode = nodes.find((n) => n.data.semanticId === y);
    expect(focusNode).toBeDefined();
    expect(focusNode!.selected).toBe(true);

    // Graph select → geometry highlight set.
    const fromGraph = semanticIdsFromRfSelection(nodes, [focusNode!.id]);
    store = focusGeometry(store, fromGraph, 'graph', 20);
    expect(store.selectedSemanticId).toBe(y);
    expect(store.highlightedIds).toContain(y);
    expect(store.sources.viewport).toBe(y);
  });
});
