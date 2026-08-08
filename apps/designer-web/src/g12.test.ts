import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from '@spds/version-core';
import {
  buildCompareView,
  buildTimelineView,
  forkAction,
  nameSnapshotNotes,
  restoreAction,
} from './history-view.js';

describe('G12 history UX', () => {
  it('builds timeline, named snapshots, compare, and non-destructive restore/fork', () => {
    const store = new InMemoryVersionStore();
    const model = store.createModel('hist');
    const branchId = store.getMainBranchId(model.modelId);
    const actor = { type: 'user' as const, id: 'u1' };

    let head = store.getBranchHead(branchId).headHash;
    store.upsertObject(branchId, actor, head, { id: 'obj:1', kind: 'Y', v: 1 });
    head = store.getBranchHead(branchId).headHash;
    const snapA = store.snapshot(branchId, 'before');
    store.upsertObject(branchId, actor, head, { id: 'obj:2', kind: 'Y', v: 1 });
    head = store.getBranchHead(branchId).headHash;
    const snapB = store.snapshot(branchId, 'after');

    const named = nameSnapshotNotes(snapA, 'Checkpoint A', 'pre-change');
    expect(named.name).toBe('Checkpoint A');
    expect(named.notes).toBe('pre-change');

    const timeline = buildTimelineView({
      branchId,
      events: store.listEvents(branchId),
      snapshots: [snapA, snapB],
    });
    expect(timeline.entries.some((e) => e.kind === 'event')).toBe(true);
    expect(timeline.entries.some((e) => e.label === 'before')).toBe(true);

    const diff = store.compareSnapshots(snapA.snapshotId, snapB.snapshotId, branchId);
    const compare = buildCompareView(diff, { partCount: 1 }, 'exact');
    expect(compare.addedIds).toContain('obj:2');
    expect(compare.previewVsExact).toBe('exact');

    const restore = restoreAction(snapA.snapshotId);
    expect(restore.createsNewHead).toBe(true);
    expect(restore.destroysLaterHistory).toBe(false);

    const laterEventsBefore = store.listEvents(branchId).length;
    store.restoreToNewHead(branchId, snapA.snapshotId, actor);
    expect(store.listEvents(branchId).length).toBeGreaterThan(laterEventsBefore);
    expect(forkAction('experiment').kind).toBe('fork');
  });
});
