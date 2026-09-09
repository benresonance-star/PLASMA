import { describe, expect, it } from 'vitest';
import { explainObject } from '@spds/semantic-query';
import {
  ModelQueryContextRegistry,
  buildLiveD01QueryContext,
} from './model-query-context.js';

describe('live D01 model query context (Wave 0 substrate)', () => {
  it('aligns every display mesh semanticOwner with the model graph', async () => {
    const ctx = await buildLiveD01QueryContext('model:live-d01-test', { yLimit: 3 });
    expect(ctx.source).toBe('live-d01');
    expect(ctx.displayMeshes.length).toBe(9);
    for (const mesh of ctx.displayMeshes) {
      expect(ctx.graph.get(mesh.semanticOwner)).toBeDefined();
      expect(ctx.graph.get(mesh.semanticOwner)?.semanticType).toBe('structural.y-component');
    }
    const owner = ctx.displayMeshes[0]!.semanticOwner;
    const packet = explainObject({
      targetId: owner,
      graph: ctx.graph,
      provenance: ctx.provenance,
      dependencyEdges: ctx.dependencyEdges,
    });
    expect(packet.whyExists.length).toBeGreaterThan(0);
    expect(packet.whyExists.some((s) => s.causes.includes('pattern:d01:y-network'))).toBe(true);
  });

  it('keeps unit G3b opt-in via registry (not a silent global default)', () => {
    const registry = new ModelQueryContextRegistry();
    expect(registry.get('model:fixture')).toBeNull();
    registry.seedUnitG3b('model:fixture');
    expect(registry.get('model:fixture')?.source).toBe('unit-g3b');
  });
});
