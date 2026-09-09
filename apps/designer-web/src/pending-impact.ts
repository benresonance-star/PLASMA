/**
 * Impact + Before/Intervention/After helpers for pending ChangeSets (S14–S15).
 */

import {
  impactFromChangeSet,
  projectChangeSetDelta,
  type GraphProjection,
} from '@spds/graph-projection';
import type { DependencyEdge } from '@spds/semantic-query';
import type { PendingAiChangeSet } from './app-session.js';
import { pendingToDeltaChangeSet } from './pending-changeset-preview.js';

export interface PendingImpactView {
  readonly directIds: readonly string[];
  readonly downstreamIds: readonly string[];
  readonly invalidatesOn: readonly string[];
}

export interface PendingBiaStrip {
  readonly before: readonly string[];
  readonly intervention: readonly string[];
  readonly after: readonly string[];
}

export function impactViewFromPending(
  pending: PendingAiChangeSet | null,
  dependencyEdges: readonly DependencyEdge[],
): PendingImpactView | null {
  if (!pending || pending.commands.length === 0) return null;
  return impactFromChangeSet({
    changeSet: pendingToDeltaChangeSet(pending),
    dependencyEdges,
  });
}

/** Partition provisional summaries into SD8.1 Before / Intervention / After. */
export function biaStripFromPending(
  pending: PendingAiChangeSet | null,
  baseProjection: GraphProjection | null,
): PendingBiaStrip {
  const empty: PendingBiaStrip = { before: [], intervention: [], after: [] };
  if (!pending || !baseProjection) return empty;
  const delta = projectChangeSetDelta({
    base: baseProjection,
    changeSet: pendingToDeltaChangeSet(pending),
  });
  const before: string[] = [];
  const intervention: string[] = [];
  const after: string[] = [];
  for (const n of delta.nodes) {
    if (n.summary === 'removed') {
      after.push(`${n.semanticId} (removed)`);
      continue;
    }
    if (n.projectionRole !== 'provisional' && n.summary !== 'added') continue;
    const label = `${n.semanticId}${n.summary ? ` (${n.summary})` : ''}`;
    if (n.summary === 'added' || n.summary === 'create' || n.summary === 'create_group') {
      intervention.push(label);
    } else if (n.summary === 'changed' || n.summary === 'update' || n.summary === 'apply_pattern') {
      intervention.push(label);
    } else if (n.summary === 'connect') {
      before.push(label);
    } else {
      intervention.push(label);
    }
  }
  // Direct ops without graph nodes still appear under Intervention.
  if (intervention.length === 0) {
    for (const c of pending.commands) {
      const id = c.targetId ?? c.op;
      if (c.op === 'delete') after.push(`${id} (removed)`);
      else intervention.push(`${id} (${c.op})`);
    }
  }
  return { before, intervention, after };
}
