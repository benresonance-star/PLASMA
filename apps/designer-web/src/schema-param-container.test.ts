import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import {
  SCHEMA_PARAM_GROUP_VIEW_ID,
  applyParameterContainer,
  collectAbsolutePositions,
  dissolveParameterContainer,
  refitParameterContainer,
} from './schema-param-container.js';
import type { SchemaRfNodeData } from './schema-reactflow-adapter.js';

function paramNode(
  id: string,
  x: number,
  y: number,
): Node<SchemaRfNodeData> {
  return {
    id: `schema:param:${id}`,
    position: { x, y },
    type: 'schemaNode',
    data: {
      semanticId: id,
      role: 'parameter',
      label: id,
      mutable: true,
      hoverTitle: id,
      hoverPurpose: 'p',
      hoverHowToUse: 'h',
    },
  };
}

describe('schema-param-container', () => {
  it('wraps parameters in a group and keeps relative child coords', () => {
    const wrapped = applyParameterContainer([
      paramNode('param:a', 280, 0),
      paramNode('param:b', 280, 96),
      {
        id: 'schema:kind:Parameter',
        position: { x: 0, y: 0 },
        type: 'schemaNode',
        data: {
          semanticId: 'Parameter',
          role: 'kind',
          label: 'Parameter',
          mutable: true,
          hoverTitle: 'Parameter',
          hoverPurpose: 'p',
          hoverHowToUse: 'h',
        },
      },
    ]);
    const group = wrapped.find((n) => n.id === SCHEMA_PARAM_GROUP_VIEW_ID);
    expect(group).toBeTruthy();
    const children = wrapped.filter((n) => n.parentId === SCHEMA_PARAM_GROUP_VIEW_ID);
    expect(children).toHaveLength(2);
    expect(children.every((c) => c.position.x >= 0 && c.position.y >= 0)).toBe(true);
    expect(wrapped.some((n) => n.data.semanticId === 'Parameter' && !n.parentId)).toBe(true);
  });

  it('refits the group when a child moves past the pad', () => {
    const wrapped = applyParameterContainer([
      paramNode('param:a', 100, 100),
      paramNode('param:b', 100, 200),
    ]);
    const moved = wrapped.map((n) =>
      n.data.semanticId === 'param:b'
        ? { ...n, position: { x: n.position.x + 80, y: n.position.y + 40 } }
        : n,
    );
    const fitted = refitParameterContainer(moved);
    const group = fitted.find((n) => n.id === SCHEMA_PARAM_GROUP_VIEW_ID)!;
    const style = group.style as { width: number; height: number };
    expect(style.width).toBeGreaterThan(160);
    expect(style.height).toBeGreaterThan(100);
    const abs = collectAbsolutePositions(fitted);
    expect(abs.get('param:a')).toBeTruthy();
    expect(abs.get('param:b')).toBeTruthy();
  });

  it('dissolves back to absolute positions', () => {
    const wrapped = applyParameterContainer([paramNode('param:a', 280, 40)]);
    const flat = dissolveParameterContainer(wrapped);
    expect(flat.some((n) => n.id === SCHEMA_PARAM_GROUP_VIEW_ID)).toBe(false);
    expect(flat.find((n) => n.data.semanticId === 'param:a')?.position).toEqual({
      x: 280,
      y: 40,
    });
  });
});
