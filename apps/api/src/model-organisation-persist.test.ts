import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from '@spds/version-core';
import { createModelGroup, reparentModelNode } from './model-groups.js';
import {
  ModelQueryContextRegistry,
  buildLiveD01QueryContext,
} from './model-query-context.js';
import {
  extractOrganisationObjects,
  loadOrganisationFromStore,
  mergeOrganisationFromSources,
  persistOrganisationSnapshot,
} from './model-organisation-persist.js';
import { buildServer } from './server.js';

describe('organisation persistence (durable groups)', () => {
  it('round-trips folders through VersionStore across registry restart', async () => {
    const store = new InMemoryVersionStore();
    const model = store.createModel('Org Persist');
    const modelId = model.modelId;

    let ctx = await buildLiveD01QueryContext(modelId, { yLimit: 2 });
    const created = createModelGroup(ctx, { label: 'Bay A' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    ctx = created.ctx;
    const owner = ctx.displayMeshes[0]!.semanticOwner;
    const reparented = reparentModelNode(ctx, {
      nodeId: owner,
      newParentId: created.groupId,
    });
    expect(reparented.ok).toBe(true);
    if (!reparented.ok) return;
    ctx = reparented.ctx;

    await persistOrganisationSnapshot(store, modelId, ctx);
    const extracted = extractOrganisationObjects(ctx);
    expect(extracted.some((o) => o.id === created.groupId)).toBe(true);

    // Simulate API restart: fresh registry, load from store.
    const freshRegistry = new ModelQueryContextRegistry();
    const rebuilt = await buildLiveD01QueryContext(modelId, { yLimit: 2 });
    const stored = await loadOrganisationFromStore(store, modelId);
    expect(stored.length).toBeGreaterThanOrEqual(1);
    const restored = mergeOrganisationFromSources(rebuilt, null, stored);
    freshRegistry.set(restored);

    expect(restored.graph.get(created.groupId)?.semanticType).toBe('ui.folder');
    const liveOwner = restored.graph.get(owner);
    expect(liveOwner?.edges?.some((e) => e.type === 'part-of' && e.to === created.groupId)).toBe(
      true,
    );
  });

  it('GET substrate after clearing registry reloads durable org', async () => {
    const store = new InMemoryVersionStore();
    const registry = new ModelQueryContextRegistry();
    const { app } = buildServer(store, { queryContexts: registry });

    const created = await app.inject({
      method: 'POST',
      url: '/models',
      payload: { name: 'Durable Org API' },
    });
    const modelId = created.json().model.modelId as string;

    await app.inject({
      method: 'POST',
      url: `/models/${modelId}/substrate/d01`,
      payload: { yLimit: 2 },
    });
    const group = await app.inject({
      method: 'POST',
      url: `/models/${modelId}/groups`,
      payload: { label: 'Persisted Bay' },
    });
    expect(group.statusCode).toBe(201);
    const groupId = group.json().groupId as string;

    // Drop process-local context (API "restart").
    const empty = new ModelQueryContextRegistry();
    const { app: app2 } = buildServer(store, { queryContexts: empty });

    const substrate = await app2.inject({
      method: 'GET',
      url: `/models/${modelId}/substrate`,
    });
    expect(substrate.statusCode).toBe(200);
    const objects = substrate.json().objects as Array<{ id: string; semanticType: string }>;
    expect(objects.some((o) => o.id === groupId && o.semanticType === 'ui.folder')).toBe(true);
  });

  it('live substrate includes field + constraint objects', async () => {
    const ctx = await buildLiveD01QueryContext('model:fields', { yLimit: 2 });
    expect(ctx.graph.get('field:d01:distance')?.semanticType).toBe('field.distance');
    expect(ctx.graph.get('constraint:d01.max-member-length')?.semanticType).toContain(
      'constraint',
    );
    expect(
      ctx.dependencyEdges.some(
        (e) => e.from === 'field:d01:distance' && e.relationType === 'influences',
      ),
    ).toBe(true);
    expect(
      ctx.dependencyEdges.some(
        (e) =>
          e.from === 'constraint:d01.max-member-length' && e.relationType === 'limits',
      ),
    ).toBe(true);
  });
});
