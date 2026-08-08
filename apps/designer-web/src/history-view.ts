/** G12 History UX view-models bound to version-core. */

import type { ChangeEvent, SemanticDiff, Snapshot } from '@spds/version-core';

export interface TimelineEntry {
  readonly kind: 'event' | 'snapshot';
  readonly id: string;
  readonly label: string;
  readonly timestamp: string;
  readonly actor?: string;
  readonly notes?: string;
}

export interface HistoryTimelineView {
  readonly branchId: string;
  readonly entries: readonly TimelineEntry[];
}

export function buildTimelineView(input: {
  readonly branchId: string;
  readonly events: readonly ChangeEvent[];
  readonly snapshots: readonly Snapshot[];
}): HistoryTimelineView {
  const entries: TimelineEntry[] = [
    ...input.events.map((e) => ({
      kind: 'event' as const,
      id: e.eventId,
      label: e.command,
      timestamp: e.timestamp,
      actor: `${e.actor.type}:${e.actor.id}`,
      ...(e.reason !== undefined ? { notes: e.reason } : {}),
    })),
    ...input.snapshots.map((s) => ({
      kind: 'snapshot' as const,
      id: s.snapshotId,
      label: s.name ?? s.snapshotId,
      timestamp: s.createdAt,
      ...(s.name !== undefined ? { notes: s.name } : {}),
    })),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { branchId: input.branchId, entries };
}

export function nameSnapshotNotes(
  snapshot: Snapshot,
  name: string,
  notes?: string,
): Snapshot & { readonly notes?: string } {
  return {
    ...snapshot,
    name,
    ...(notes !== undefined ? { notes } : {}),
  };
}

export interface CompareViewModel {
  readonly fromHash: string;
  readonly toHash: string;
  readonly addedIds: readonly string[];
  readonly removedIds: readonly string[];
  readonly changedIds: readonly string[];
  readonly metricDeltas: Readonly<Record<string, number>>;
  readonly previewVsExact: 'exact' | 'preview';
}

export function buildCompareView(
  diff: SemanticDiff,
  metricDeltas: Readonly<Record<string, number>> = {},
  previewVsExact: 'exact' | 'preview' = 'exact',
): CompareViewModel {
  return {
    fromHash: diff.fromHash,
    toHash: diff.toHash,
    addedIds: diff.addedIds,
    removedIds: diff.removedIds,
    changedIds: diff.changedIds,
    metricDeltas,
    previewVsExact,
  };
}

export interface RestoreForkAction {
  readonly kind: 'restore' | 'fork';
  readonly createsNewHead: true;
  readonly destroysLaterHistory: false;
  readonly confirmRequired: true;
  readonly label: string;
}

export function restoreAction(snapshotId: string): RestoreForkAction {
  return {
    kind: 'restore',
    createsNewHead: true,
    destroysLaterHistory: false,
    confirmRequired: true,
    label: `Restore to ${snapshotId} (new head)`,
  };
}

export function forkAction(branchName: string): RestoreForkAction {
  return {
    kind: 'fork',
    createsNewHead: true,
    destroysLaterHistory: false,
    confirmRequired: true,
    label: `Fork branch ${branchName}`,
  };
}
