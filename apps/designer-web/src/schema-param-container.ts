/**
 * Parameter container — React Flow parent group that moves with / refits around
 * Schema parameter nodes.
 */

import type { Node } from '@xyflow/react';
import type { SchemaRfNodeData } from './schema-reactflow-adapter.js';

export const SCHEMA_PARAM_GROUP_VIEW_ID = 'schema:group:parameters';
export const SCHEMA_PARAM_GROUP_SEMANTIC_ID = 'schema:parameters';

/** Approximate Schema node chrome size for bounds (matches .schema-rf-node-chrome). */
export const SCHEMA_PARAM_NODE_SIZE = { width: 160, height: 78 } as const;
const PAD_X = 18;
const PAD_Y_TOP = 32;
const PAD_Y_BOTTOM = 16;

export type SchemaCanvasNode = Node<SchemaRfNodeData>;

export function isSchemaParamGroupNode(n: SchemaCanvasNode): boolean {
  return n.id === SCHEMA_PARAM_GROUP_VIEW_ID || n.data.role === 'param-group';
}

export function isSchemaParameterNode(n: SchemaCanvasNode): boolean {
  return n.data.role === 'parameter';
}

function nodeSize(n: SchemaCanvasNode): { width: number; height: number } {
  const w = typeof n.style?.width === 'number' ? n.style.width : SCHEMA_PARAM_NODE_SIZE.width;
  const h = typeof n.style?.height === 'number' ? n.style.height : SCHEMA_PARAM_NODE_SIZE.height;
  return { width: w, height: h };
}

/** Absolute canvas position for a node (resolves parent offset). */
export function absoluteNodePosition(
  node: SchemaCanvasNode,
  all: readonly SchemaCanvasNode[],
): { x: number; y: number } {
  if (!node.parentId) return { x: node.position.x, y: node.position.y };
  const parent = all.find((n) => n.id === node.parentId);
  if (!parent) return { x: node.position.x, y: node.position.y };
  const parentAbs = absoluteNodePosition(parent, all);
  return { x: parentAbs.x + node.position.x, y: parentAbs.y + node.position.y };
}

/** Flatten any param-group parenting back to absolute positions. */
export function dissolveParameterContainer(
  nodes: readonly SchemaCanvasNode[],
): SchemaCanvasNode[] {
  const group = nodes.find((n) => n.id === SCHEMA_PARAM_GROUP_VIEW_ID);
  if (!group) {
    return nodes.map((n) => {
      if (!n.parentId) return n;
      const { parentId: _p, ...rest } = n;
      return rest as SchemaCanvasNode;
    });
  }
  const out: SchemaCanvasNode[] = [];
  for (const n of nodes) {
    if (n.id === SCHEMA_PARAM_GROUP_VIEW_ID) continue;
    if (n.parentId === SCHEMA_PARAM_GROUP_VIEW_ID) {
      const { parentId: _p, ...rest } = n;
      out.push({
        ...(rest as SchemaCanvasNode),
        position: {
          x: group.position.x + n.position.x,
          y: group.position.y + n.position.y,
        },
      });
      continue;
    }
    out.push(n);
  }
  return out;
}

/**
 * Wrap parameter nodes in a parent group. Input nodes must use absolute positions
 * (no existing param-group parent).
 */
export function applyParameterContainer(
  nodes: readonly SchemaCanvasNode[],
): SchemaCanvasNode[] {
  const flat = dissolveParameterContainer(nodes);
  const params = flat.filter(isSchemaParameterNode);
  const others = flat.filter((n) => !isSchemaParameterNode(n));
  if (params.length === 0) return flat;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of params) {
    const { width, height } = nodeSize(p);
    minX = Math.min(minX, p.position.x);
    minY = Math.min(minY, p.position.y);
    maxX = Math.max(maxX, p.position.x + width);
    maxY = Math.max(maxY, p.position.y + height);
  }

  const groupX = minX - PAD_X;
  const groupY = minY - PAD_Y_TOP;
  const groupW = Math.max(120, maxX - minX + PAD_X * 2);
  const groupH = Math.max(80, maxY - minY + PAD_Y_TOP + PAD_Y_BOTTOM);

  const group: SchemaCanvasNode = {
    id: SCHEMA_PARAM_GROUP_VIEW_ID,
    type: 'schemaParamGroup',
    position: { x: groupX, y: groupY },
    style: { width: groupW, height: groupH },
    className: 'schema-rf-param-group-node',
    data: {
      semanticId: SCHEMA_PARAM_GROUP_SEMANTIC_ID,
      role: 'param-group',
      label: 'Parameters',
      mutable: false,
      hoverTitle: 'Parameters',
      hoverPurpose: 'Container for schema parameter nodes. Drag to move the whole set.',
      hoverHowToUse:
        'Drag the frame to move all parameters. Drag a parameter freely — the frame refits.',
    },
    draggable: true,
    selectable: true,
    connectable: false,
  };

  const children: SchemaCanvasNode[] = params.map((p) => ({
    ...p,
    parentId: SCHEMA_PARAM_GROUP_VIEW_ID,
    position: {
      x: p.position.x - groupX,
      y: p.position.y - groupY,
    },
  }));

  // Parent before children (React Flow requirement).
  return [group, ...children, ...others];
}

/**
 * After a child (or group) drag, resize/reposition the group so it bounds all
 * parameter children. Child positions stay free (no extent lock).
 */
export function refitParameterContainer(
  nodes: readonly SchemaCanvasNode[],
): SchemaCanvasNode[] {
  const group = nodes.find((n) => n.id === SCHEMA_PARAM_GROUP_VIEW_ID);
  if (!group) return [...nodes];
  const children = nodes.filter((n) => n.parentId === SCHEMA_PARAM_GROUP_VIEW_ID);
  if (children.length === 0) {
    return nodes.filter((n) => n.id !== SCHEMA_PARAM_GROUP_VIEW_ID);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of children) {
    const { width, height } = nodeSize(c);
    minX = Math.min(minX, c.position.x);
    minY = Math.min(minY, c.position.y);
    maxX = Math.max(maxX, c.position.x + width);
    maxY = Math.max(maxY, c.position.y + height);
  }

  const newOriginX = minX - PAD_X;
  const newOriginY = minY - PAD_Y_TOP;
  const groupW = Math.max(120, maxX - minX + PAD_X * 2);
  const groupH = Math.max(80, maxY - minY + PAD_Y_TOP + PAD_Y_BOTTOM);

  const nextGroup: SchemaCanvasNode = {
    ...group,
    position: {
      x: group.position.x + newOriginX,
      y: group.position.y + newOriginY,
    },
    style: { ...group.style, width: groupW, height: groupH },
  };

  const nextChildren = children.map((c) => ({
    ...c,
    position: {
      x: c.position.x - newOriginX,
      y: c.position.y - newOriginY,
    },
  }));

  const childIds = new Set(children.map((c) => c.id));
  const rest = nodes.filter(
    (n) => n.id !== SCHEMA_PARAM_GROUP_VIEW_ID && !childIds.has(n.id),
  );
  return [nextGroup, ...nextChildren, ...rest];
}

/** Persist absolute semantic positions from the current RF graph. */
export function collectAbsolutePositions(
  nodes: readonly SchemaCanvasNode[],
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    if (isSchemaParamGroupNode(n)) {
      map.set(SCHEMA_PARAM_GROUP_SEMANTIC_ID, {
        x: n.position.x,
        y: n.position.y,
      });
      continue;
    }
    if (!n.data.semanticId) continue;
    map.set(n.data.semanticId, absoluteNodePosition(n, nodes));
  }
  return map;
}
