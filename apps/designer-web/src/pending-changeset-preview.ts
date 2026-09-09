/**
 * D3b — pending ChangeSet drives geometry highlight ids and provisional Causal RF together.
 */

import {
  pendingChangeSetTargetIds,
  projectChangeSetDelta,
  type DeltaChangeSet,
  type DeltaChangeSetOp,
  type GraphProjection,
} from '@spds/graph-projection';
import type { PendingAiChangeSet } from './app-session.js';

const DELTA_OPS = new Set<string>([
  'create',
  'update',
  'delete',
  'apply_pattern',
  'create_group',
  'connect',
]);

export function pendingToDeltaChangeSet(pending: PendingAiChangeSet): DeltaChangeSet {
  const commands: Array<{
    op: DeltaChangeSetOp;
    targetId?: string;
    payload?: unknown;
  }> = [];
  for (const cmd of pending.commands) {
    if (!DELTA_OPS.has(cmd.op)) continue;
    commands.push({
      op: cmd.op as DeltaChangeSetOp,
      ...(cmd.targetId !== undefined ? { targetId: cmd.targetId } : {}),
      ...(cmd.payload !== undefined ? { payload: cmd.payload } : {}),
    });
  }
  return { commands };
}

/** Geometry highlight + provisional projection share the same target id set. */
export function buildPendingChangeSetPreview(input: {
  readonly base: GraphProjection;
  readonly pending: PendingAiChangeSet | null;
}): {
  readonly projection: GraphProjection;
  readonly geometryTargetIds: readonly string[];
} {
  if (!input.pending || input.pending.commands.length === 0) {
    return { projection: input.base, geometryTargetIds: [] };
  }
  const changeSet = pendingToDeltaChangeSet(input.pending);
  const geometryTargetIds = pendingChangeSetTargetIds(changeSet);
  return {
    projection: projectChangeSetDelta({ base: input.base, changeSet }),
    geometryTargetIds,
  };
}
