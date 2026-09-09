import { describe, expect, it } from 'vitest';
import { IndexedSemanticGraph } from '@spds/semantic-query';
import { projectCausalNeighbourhood } from '@spds/graph-projection';
import { projectionToReactFlow as toRf } from './sdi/reactflow-adapter.js';
import {
  appForkVariant,
  appRejectPendingChangeSet,
  createAppSession,
  type PendingAiChangeSet,
} from './app-session.js';
import { buildPendingChangeSetPreview } from './pending-changeset-preview.js';
import { describeHistoryOrVariantDelta, historyEventLabel } from './history-delta-ui.js';

const pendingFixture = (): PendingAiChangeSet => ({
  changeSetId: 'cs:organise:1',
  branchId: 'br:ai',
  expectedHeadHash: 'hash:1',
  transactionId: 'tx:1',
  actor: 'ai',
  disposition: 'proposed',
  commands: [
    { op: 'create_group', targetId: 'folder:assy:1', payload: { name: 'Bay A' } },
    {
      op: 'connect',
      targetId: 'component:y:1',
      payload: { parentId: 'folder:assy:1' },
    },
    { op: 'update', targetId: 'param:d01:lengthMm', payload: { lengthMm: 2100 } },
  ],
});

describe('D3 pending ChangeSet preview', () => {
  it('D3b: geometry targets and provisional RF agree on ids', () => {
    const graph = new IndexedSemanticGraph([
      { id: 'component:y:1', semanticType: 'structural.y-component' },
      { id: 'param:d01:lengthMm', semanticType: 'parameter.length' },
    ]);
    const base = projectCausalNeighbourhood({
      graph,
      dependencyEdges: [
        { from: 'param:d01:lengthMm', to: 'component:y:1', relationType: 'drives' },
      ],
      focusObjectIds: ['param:d01:lengthMm'],
      radius: 1,
    });
    const preview = buildPendingChangeSetPreview({
      base,
      pending: pendingFixture(),
    });
    expect(preview.geometryTargetIds).toEqual(
      expect.arrayContaining(['folder:assy:1', 'component:y:1', 'param:d01:lengthMm']),
    );
    const { nodes } = toRf(preview.projection);
    const provisionalIds = nodes
      .filter((n) => n.className?.includes('sdi-rf-node--provisional'))
      .map((n) => n.data.semanticId)
      .sort();
    for (const id of preview.geometryTargetIds) {
      expect(provisionalIds).toContain(id);
    }

    const t0 = performance.now();
    const big = {
      ...pendingFixture(),
      commands: Array.from({ length: 100 }, (_, i) => ({
        op: 'update' as const,
        targetId: i % 2 === 0 ? 'param:d01:lengthMm' : 'component:y:1',
      })),
    };
    for (let i = 0; i < 20; i += 1) {
      buildPendingChangeSetPreview({ base, pending: big });
    }
    expect(performance.now() - t0).toBeLessThan(40 * 20);
  });

  it('D3c: reject clears provisional classes', () => {
    let session = createAppSession();
    session = {
      ...session,
      pendingChangeSet: pendingFixture(),
      aiChanges: [
        {
          changeSetId: 'cs:organise:1',
          disposition: 'proposed',
          commandCount: 3,
          attribution: 'ai',
        },
      ],
    };
    const cleared = appRejectPendingChangeSet(session);
    expect(cleared.pendingChangeSet).toBeNull();
    expect(cleared.aiChanges[0]?.disposition).toBe('rejected');

    const graph = new IndexedSemanticGraph([
      { id: 'component:y:1', semanticType: 'structural.y-component' },
      { id: 'param:d01:lengthMm', semanticType: 'parameter.length' },
    ]);
    const base = projectCausalNeighbourhood({
      graph,
      dependencyEdges: [
        { from: 'param:d01:lengthMm', to: 'component:y:1', relationType: 'drives' },
      ],
      focusObjectIds: ['param:d01:lengthMm'],
      radius: 1,
    });
    const after = buildPendingChangeSetPreview({
      base,
      pending: cleared.pendingChangeSet,
    });
    const { nodes } = toRf(after.projection);
    expect(nodes.every((n) => !n.className?.includes('sdi-rf-node--provisional'))).toBe(true);
    expect(after.geometryTargetIds).toEqual([]);

    const t0 = performance.now();
    const ops = {
      ...pendingFixture(),
      commands: Array.from({ length: 100 }, (_, i) => ({
        op: 'update' as const,
        targetId: `component:y:${i % 3}`,
      })),
    };
    buildPendingChangeSetPreview({
      base: {
        ...base,
        nodes: Array.from({ length: 100 }, (_, i) => ({
          viewId: `view:n:${i}`,
          semanticId: `component:y:${i % 3}`,
          semanticType: 'structural.y-component',
          projectionRole: 'context' as const,
          label: `y:${i}`,
          family: 'Entity' as const,
          detailLevel: 'A' as const,
        })),
      },
      pending: ops,
    });
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe('D4 history vs variant', () => {
  it('D4a: distinct history / variant copy', () => {
    expect(historyEventLabel({ kind: 'history', label: 'ExactRegen' })).toBe(
      'History · ExactRegen',
    );
    expect(historyEventLabel({ kind: 'variant', label: 'Option B' })).toBe(
      'Variant · Option B',
    );
    const t0 = performance.now();
    for (let i = 0; i < 100; i += 1) {
      historyEventLabel({ kind: i % 2 === 0 ? 'history' : 'variant', label: `e${i}` });
    }
    expect(performance.now() - t0).toBeLessThan(1);
  });

  it('D4b: fork does not append history timeline', () => {
    const session = createAppSession();
    const beforeLen = session.timeline.length;
    const forked = appForkVariant(session, 1_700_000_000_000);
    expect(forked.timeline.length).toBe(beforeLen);
    expect(forked.variants).toHaveLength(1);
    expect(forked.variants[0]?.kind).toBe('variant');
    expect(forked.activeVariantId).toBe(forked.variants[0]?.id);
  });

  it('D4c: adjacent history delta ≤50ms', () => {
    const graph = new IndexedSemanticGraph([
      { id: 'component:y:1', semanticType: 'structural.y-component' },
      { id: 'param:d01:lengthMm', semanticType: 'parameter.length' },
    ]);
    const prev = projectCausalNeighbourhood({
      graph,
      dependencyEdges: [
        { from: 'param:d01:lengthMm', to: 'component:y:1', relationType: 'drives' },
      ],
      focusObjectIds: ['param:d01:lengthMm'],
      radius: 1,
    });
    const next = {
      ...prev,
      projectionId: `${prev.projectionId}:next`,
      nodes: prev.nodes.map((n) =>
        n.semanticId === 'param:d01:lengthMm'
          ? { ...n, summary: 'changed', projectionRole: 'provisional' as const }
          : n,
      ),
    };
    const t0 = performance.now();
    const delta = describeHistoryOrVariantDelta(prev, next, {
      kind: 'history',
      eventId: 'evt:adjacent',
      label: 'param tweak',
    });
    expect(performance.now() - t0).toBeLessThan(50);
    expect(delta.kind).toBe('history');
    expect(delta.uiLabel.startsWith('History ·')).toBe(true);
    expect(delta.changed).toContain('param:d01:lengthMm');
  });
});
