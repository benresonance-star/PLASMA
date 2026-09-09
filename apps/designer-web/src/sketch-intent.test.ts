import { describe, expect, it } from 'vitest';
import { IndexedSemanticGraph } from '@spds/semantic-query';
import { projectCausalNeighbourhood, projectSketchComposition } from '@spds/graph-projection';
import { projectionToReactFlow } from './sdi/reactflow-adapter.js';
import {
  assertSketchProvenance,
  beginSketchIntent,
  cancelSketchIntent,
  cellsFromGrid,
  createEmptySketchDraft,
  hitTestSketchCells,
  mergeSketchIntoProjection,
} from './sketch-intent.js';

describe('E3 sketch intent', () => {
  it('E3a: begin yields valid intent; cancel clears', () => {
    const draft = beginSketchIntent({
      sketchId: 'sketch:1',
      fieldId: 'field:distance:1',
      patternId: 'pattern:d01:y-network',
      cells: cellsFromGrid(100),
      nowMs: 1,
    });
    expect(draft.cells).toHaveLength(100);
    assertSketchProvenance(draft);
    expect(cancelSketchIntent(draft)).toBeNull();
    expect(createEmptySketchDraft()).toBeNull();

    const t0 = performance.now();
    beginSketchIntent({
      sketchId: 'sketch:bench',
      fieldId: 'field:x',
      patternId: 'pattern:p',
      cells: cellsFromGrid(100),
      nowMs: 2,
    });
    expect(performance.now() - t0).toBeLessThan(10);
  });

  it('E3b: wires sketch→field→pattern into provisional RF', () => {
    const graph = new IndexedSemanticGraph([
      { id: 'pattern:d01:y-network', semanticType: 'pattern.y-network' },
      { id: 'component:y:1', semanticType: 'structural.y-component' },
    ]);
    const base = projectCausalNeighbourhood({
      graph,
      dependencyEdges: [
        { from: 'pattern:d01:y-network', to: 'component:y:1', relationType: 'produces' },
      ],
      focusObjectIds: ['pattern:d01:y-network'],
      radius: 1,
    });
    const draft = beginSketchIntent({
      sketchId: 'sketch:1',
      fieldId: 'field:distance:1',
      patternId: 'pattern:d01:y-network',
      cells: cellsFromGrid(4),
      nowMs: 1,
    });
    const t0 = performance.now();
    const merged = mergeSketchIntoProjection(base, draft);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(merged.edges.some((e) => e.fromSemanticId === 'sketch:1')).toBe(true);
    expect(merged.edges.some((e) => e.fromSemanticId === 'field:distance:1')).toBe(true);
    const { nodes } = projectionToReactFlow(merged);
    expect(nodes.some((n) => n.data.family === 'SketchIntent')).toBe(true);
    expect(nodes.some((n) => n.className?.includes('provisional'))).toBe(true);
    expect(draft.provenance.source).toBe('viewport-sketch');
  });

  it('E3c: provenance gate + hit 1k ≤20ms; compose ≤50ms', () => {
    const cells = cellsFromGrid(1000);
    const draft = beginSketchIntent({
      sketchId: 'sketch:hit',
      fieldId: 'field:distance:1',
      patternId: 'pattern:p',
      cells,
      nowMs: 9,
    });
    assertSketchProvenance(draft);
    expect(draft.provenance.cellCount).toBe(1000);

    const tHit = performance.now();
    const hit = hitTestSketchCells(cells, { u: cells[500]!.u, v: cells[500]!.v });
    expect(performance.now() - tHit).toBeLessThan(20);
    expect(hit).toBe(cells[500]!.cellId);

    const tCompose = performance.now();
    const composed = projectSketchComposition({
      sketchId: draft.sketchId,
      fieldId: draft.fieldId,
      patternId: draft.patternId,
      affectedCellIds: draft.cells.map((c) => c.cellId),
    });
    expect(performance.now() - tCompose).toBeLessThan(50);
    expect(composed.focusObjectIds).toContain('sketch:hit');
  });
});
