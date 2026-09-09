import { describe, expect, it } from 'vitest';
import { buildLiveD01QueryContext } from './model-query-context.js';
import {
  createModelGroup,
  mergeOrganisationIntoContext,
  reparentModelNode,
} from './model-groups.js';

describe('model-groups', () => {
  it('creates a folder under the model', async () => {
    const base = await buildLiveD01QueryContext('model:groups-a', { yLimit: 3 });
    const t0 = performance.now();
    const created = createModelGroup(base, { label: 'Bay A' });
    expect(performance.now() - t0).toBeLessThan(2);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const folder = created.ctx.graph.get(created.groupId);
    expect(folder?.semanticType).toBe('ui.folder');
    expect(folder?.attributes?.label).toBe('Bay A');
    expect(folder?.edges?.some((e) => e.type === 'part-of' && e.to === 'model:groups-a')).toBe(
      true,
    );
  });

  it('reparents a component under a folder and rejects cycles', async () => {
    const base = await buildLiveD01QueryContext('model:groups-b', { yLimit: 3 });
    const created = createModelGroup(base, { label: 'G' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const owner = base.displayMeshes[0]!.semanticOwner;
    const t0 = performance.now();
    const moved = reparentModelNode(created.ctx, {
      nodeId: owner,
      newParentId: created.groupId,
    });
    expect(performance.now() - t0).toBeLessThan(2);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(
      moved.ctx.graph.get(owner)?.edges?.some((e) => e.type === 'part-of' && e.to === created.groupId),
    ).toBe(true);

    const nested = createModelGroup(moved.ctx, {
      label: 'Child',
      parentId: created.groupId,
    });
    expect(nested.ok).toBe(true);
    if (!nested.ok) return;
    const cycle = reparentModelNode(nested.ctx, {
      nodeId: created.groupId,
      newParentId: nested.groupId,
    });
    expect(cycle.ok).toBe(false);
    if (cycle.ok) return;
    expect(cycle.error).toBe('cycle');
  });

  it('returns errors for unknown model nodes', async () => {
    const base = await buildLiveD01QueryContext('model:groups-c', { yLimit: 2 });
    const missingParent = createModelGroup(base, { parentId: 'folder:missing' });
    expect(missingParent.ok).toBe(false);
    const missingNode = reparentModelNode(base, {
      nodeId: 'component:missing',
      newParentId: base.modelId,
    });
    expect(missingNode.ok).toBe(false);
  });

  it('preserves folders across D01 rebuild merge', async () => {
    const first = await buildLiveD01QueryContext('model:groups-d', { yLimit: 3 });
    const created = createModelGroup(first, { label: 'Keep' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const owner = first.displayMeshes[0]!.semanticOwner;
    const nested = reparentModelNode(created.ctx, {
      nodeId: owner,
      newParentId: created.groupId,
    });
    expect(nested.ok).toBe(true);
    if (!nested.ok) return;

    const rebuilt = await buildLiveD01QueryContext('model:groups-d', { yLimit: 3 });
    const merged = mergeOrganisationIntoContext(rebuilt, nested.ctx);
    expect(merged.graph.get(created.groupId)).toBeDefined();
    expect(
      merged.graph.get(owner)?.edges?.some((e) => e.type === 'part-of' && e.to === created.groupId),
    ).toBe(true);
  });

  it('reparents on 1k synthetic edges under 5ms', async () => {
    const base = await buildLiveD01QueryContext('model:groups-bench', { yLimit: 5 });
    let ctx = base;
    for (let i = 0; i < 20; i += 1) {
      const g = createModelGroup(ctx, { label: `F${i}` });
      expect(g.ok).toBe(true);
      if (!g.ok) return;
      ctx = g.ctx;
    }
    // Inflate dependency edge list
    const fat = {
      ...ctx,
      dependencyEdges: [
        ...ctx.dependencyEdges,
        ...Array.from({ length: 1000 }, (_, i) => ({
          from: `synth:${i}`,
          to: ctx.modelId,
          relationType: 'depends-on' as const,
        })),
      ],
    };
    const folder = fat.graph.all().find((o) => o.semanticType === 'ui.folder')!;
    const owner = fat.displayMeshes[0]!.semanticOwner;
    const t0 = performance.now();
    const moved = reparentModelNode(fat, { nodeId: owner, newParentId: folder.id });
    expect(performance.now() - t0).toBeLessThan(5);
    expect(moved.ok).toBe(true);
  });
});
