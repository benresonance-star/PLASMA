import { describe, expect, it } from 'vitest';
import { semanticIdsFromRfSelection, type SdiRfNodeData } from './reactflow-adapter.js';
import type { Node } from '@xyflow/react';

/**
 * Documents the causal-lens selection contract: empty RF selection events must not
 * clear the viewport/explorer selection (RF fires these on mount / prop sync).
 */
function nextSemanticFromRfSelection(
  nodes: Node<SdiRfNodeData>[],
  selectedRfIds: readonly string[],
  syncingFromProps: boolean,
): string | undefined {
  if (syncingFromProps) return undefined;
  const ids = semanticIdsFromRfSelection(nodes, selectedRfIds);
  return ids[0];
}

describe('causal lens selection guard', () => {
  const nodes = [
    {
      id: 'view:node:component:y:0001',
      position: { x: 0, y: 0 },
      data: {
        semanticId: 'component:y:0001',
        semanticType: 'structural.y-component',
        projectionRole: 'focus' as const,
        family: 'Entity' as const,
        label: 'component:y:0001',
      },
    },
  ] as Node<SdiRfNodeData>[];

  it('ignores empty selection while syncing from props', () => {
    expect(nextSemanticFromRfSelection(nodes, [], true)).toBeUndefined();
  });

  it('ignores empty selection from RF (does not clear)', () => {
    expect(nextSemanticFromRfSelection(nodes, [], false)).toBeUndefined();
  });

  it('accepts a real node pick', () => {
    expect(
      nextSemanticFromRfSelection(nodes, ['view:node:component:y:0001'], false),
    ).toBe('component:y:0001');
  });
});
