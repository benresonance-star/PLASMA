import type { GraphProjection, GraphViewNode } from './types.js';

export type DeltaChangeSetOp =
  | 'create'
  | 'update'
  | 'delete'
  | 'apply_pattern'
  | 'create_group'
  | 'connect';

export interface DeltaChangeSet {
  readonly commands: readonly {
    readonly op: DeltaChangeSetOp;
    readonly targetId?: string;
    readonly payload?: unknown;
  }[];
}

function parentFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as Record<string, unknown>;
  if (typeof p.parentId === 'string') return p.parentId;
  if (typeof p.newParentId === 'string') return p.newParentId;
  return undefined;
}

/** Provisional ChangeSet projection (SD8.1) — dashed/provisional roles, no RF persistence. */
export function projectChangeSetDelta(input: {
  readonly base: GraphProjection;
  readonly changeSet: DeltaChangeSet;
}): GraphProjection {
  const created = new Set<string>();
  const updated = new Set<string>();
  const deleted = new Set<string>();
  for (const cmd of input.changeSet.commands) {
    const id = cmd.targetId;
    switch (cmd.op) {
      case 'create':
      case 'apply_pattern':
      case 'create_group':
        if (id) created.add(id);
        break;
      case 'update':
        if (id) updated.add(id);
        break;
      case 'connect': {
        if (id) updated.add(id);
        const parent = parentFromPayload(cmd.payload);
        if (parent) updated.add(parent);
        break;
      }
      case 'delete':
        if (id) deleted.add(id);
        break;
      default: {
        const _exhaustive: never = cmd.op;
        void _exhaustive;
      }
    }
  }

  const annotationFor = (id: string): string => {
    const cmd = input.changeSet.commands.find((c) => c.targetId === id);
    if (!cmd) return created.has(id) ? 'added' : 'changed';
    switch (cmd.op) {
      case 'create':
        return 'create';
      case 'create_group':
        return 'create_group';
      case 'apply_pattern':
        return 'apply_pattern';
      case 'connect':
        return 'connect';
      case 'update':
        return 'update';
      case 'delete':
        return 'removed';
      default: {
        const _exhaustive: never = cmd.op;
        return String(_exhaustive);
      }
    }
  };

  const nodes: GraphViewNode[] = input.base.nodes.map((n) => {
    if (deleted.has(n.semanticId)) {
      return { ...n, projectionRole: 'context', summary: 'removed' };
    }
    if (updated.has(n.semanticId) || created.has(n.semanticId)) {
      return {
        ...n,
        projectionRole: 'provisional',
        summary: annotationFor(n.semanticId),
      };
    }
    return n;
  });

  for (const id of created) {
    if (nodes.some((n) => n.semanticId === id)) continue;
    nodes.push({
      viewId: `view:node:${id}`,
      semanticId: id,
      semanticType: id.startsWith('folder:')
        ? 'ui.folder'
        : id.startsWith('pattern:')
          ? 'pattern.apply'
          : 'provisional.node',
      projectionRole: 'provisional',
      label: id,
      family: id.startsWith('folder:') ? 'Assembly' : 'AIChange',
      detailLevel: 'A',
      summary: annotationFor(id),
      positionHint: { x: 280, y: nodes.length * 96 },
    });
  }

  return {
    ...input.base,
    projectionId: `${input.base.projectionId}:delta`,
    nodes,
    layoutHints: { ...input.base.layoutHints, mode: 'causal' },
  };
}

/** Target ids for geometry highlight + provisional RF (D3b unify). */
export function pendingChangeSetTargetIds(changeSet: DeltaChangeSet): readonly string[] {
  const ids = new Set<string>();
  for (const cmd of changeSet.commands) {
    if (cmd.targetId) ids.add(cmd.targetId);
    if (cmd.op === 'connect') {
      const parent = parentFromPayload(cmd.payload);
      if (parent) ids.add(parent);
    }
  }
  return [...ids];
}
