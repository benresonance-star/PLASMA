/**
 * Viewport sketch → SketchIntent draft (E3a); composition + hit helpers (E3b/E3c).
 */

import {
  projectSketchComposition,
  type GraphProjection,
} from '@spds/graph-projection';

export interface SketchCell {
  readonly cellId: string;
  readonly u: number;
  readonly v: number;
}

export interface SketchIntentDraft {
  readonly sketchId: string;
  readonly fieldId: string;
  readonly patternId: string;
  readonly cells: readonly SketchCell[];
  readonly provenance: {
    readonly source: 'viewport-sketch';
    readonly createdAtMs: number;
    readonly cellCount: number;
  };
}

export function createEmptySketchDraft(): SketchIntentDraft | null {
  return null;
}

export function beginSketchIntent(input: {
  readonly sketchId: string;
  readonly fieldId: string;
  readonly patternId: string;
  readonly cells: readonly SketchCell[];
  readonly nowMs: number;
}): SketchIntentDraft {
  return {
    sketchId: input.sketchId,
    fieldId: input.fieldId,
    patternId: input.patternId,
    cells: [...input.cells],
    provenance: {
      source: 'viewport-sketch',
      createdAtMs: input.nowMs,
      cellCount: input.cells.length,
    },
  };
}

export function cancelSketchIntent(_draft: SketchIntentDraft | null): SketchIntentDraft | null {
  return null;
}

export function assertSketchProvenance(draft: SketchIntentDraft): void {
  if (!draft.sketchId || !draft.fieldId || !draft.patternId) {
    throw new Error('SKETCH_PROVENANCE_INCOMPLETE');
  }
  if (draft.provenance.source !== 'viewport-sketch') {
    throw new Error('SKETCH_PROVENANCE_SOURCE');
  }
  if (draft.provenance.cellCount !== draft.cells.length) {
    throw new Error('SKETCH_PROVENANCE_CELL_MISMATCH');
  }
  if (draft.cells.some((c) => !c.cellId)) {
    throw new Error('SKETCH_CELL_ID_EMPTY');
  }
}

/** Merge sketch provisional composition into an existing Causal projection. */
export function mergeSketchIntoProjection(
  base: GraphProjection,
  draft: SketchIntentDraft | null,
): GraphProjection {
  if (!draft) return base;
  assertSketchProvenance(draft);
  const sketch = projectSketchComposition({
    sketchId: draft.sketchId,
    fieldId: draft.fieldId,
    patternId: draft.patternId,
    affectedCellIds: draft.cells.map((c) => c.cellId),
  });
  const nodeIds = new Set(base.nodes.map((n) => n.semanticId));
  const edgeIds = new Set(base.edges.map((e) => e.viewId));
  return {
    ...base,
    projectionId: `${base.projectionId}:sketch`,
    nodes: [
      ...base.nodes,
      ...sketch.nodes.filter((n) => !nodeIds.has(n.semanticId)),
    ],
    edges: [
      ...base.edges,
      ...sketch.edges.filter((e) => !edgeIds.has(e.viewId)),
    ],
  };
}

/** Hit-test grid cells (u,v in [0,1]) against draft cells — O(n) for budget tests. */
export function hitTestSketchCells(
  cells: readonly SketchCell[],
  uv: { readonly u: number; readonly v: number },
  radius = 0.02,
): string | null {
  let best: string | null = null;
  let bestDist = radius;
  for (const c of cells) {
    const d = Math.hypot(c.u - uv.u, c.v - uv.v);
    if (d <= bestDist) {
      bestDist = d;
      best = c.cellId;
    }
  }
  return best;
}

export function cellsFromGrid(count: number): readonly SketchCell[] {
  const side = Math.ceil(Math.sqrt(count));
  const cells: SketchCell[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = i % side;
    const y = Math.floor(i / side);
    cells.push({
      cellId: `cell:${i}`,
      u: side <= 1 ? 0.5 : x / (side - 1),
      v: side <= 1 ? 0.5 : y / (side - 1),
    });
  }
  return cells;
}
