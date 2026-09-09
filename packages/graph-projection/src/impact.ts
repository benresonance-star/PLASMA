import { walkNeighbourhood, type DependencyEdge } from '@spds/semantic-query';
import { pendingChangeSetTargetIds, type DeltaChangeSet } from './changeset-delta.js';

/** Minimum downstream set for a parameter focus (SD4.4). */
export function impactFromParameter(input: {
  readonly parameterId: string;
  readonly dependencyEdges: readonly DependencyEdge[];
}): {
  readonly downstreamIds: readonly string[];
  readonly invalidatesOn: readonly string[];
} {
  const walked = walkNeighbourhood(input.dependencyEdges, input.parameterId, 'downstream', {
    radius: 8,
  });
  const downstreamIds = [...walked.ids].sort();
  return { downstreamIds, invalidatesOn: downstreamIds };
}

/** Structural impact for a pending ChangeSet (T7b) — direct targets + downstream. */
export function impactFromChangeSet(input: {
  readonly changeSet: DeltaChangeSet;
  readonly dependencyEdges: readonly DependencyEdge[];
}): {
  readonly directIds: readonly string[];
  readonly downstreamIds: readonly string[];
  readonly invalidatesOn: readonly string[];
} {
  const directIds = [...pendingChangeSetTargetIds(input.changeSet)].sort();
  const downstream = new Set<string>();
  for (const id of directIds) {
    const walked = walkNeighbourhood(input.dependencyEdges, id, 'downstream', { radius: 8 });
    for (const d of walked.ids) {
      if (!directIds.includes(d)) downstream.add(d);
    }
  }
  const downstreamIds = [...downstream].sort();
  const invalidatesOn = [...new Set([...directIds, ...downstreamIds])].sort();
  return { directIds, downstreamIds, invalidatesOn };
}
