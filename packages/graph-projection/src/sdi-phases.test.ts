import { describe, expect, it } from 'vitest';
import { IndexedSemanticGraph } from '@spds/semantic-query';
import { aggregateByFamily } from './aggregates.js';
import { projectChangeSetDelta } from './changeset-delta.js';
import { executionGraph } from './execution-graph.js';
import { applyLenses } from './filters.js';
import { assertProjectionBudget, generateSyntheticGraph } from './generators.js';
import { projectHistoryDelta } from './history-delta.js';
import { impactFromParameter } from './impact.js';
import { buildPatternCard, showOperatorsAt } from './pattern-card.js';
import { patternGraph } from './pattern-graph.js';
import { buildPatternInspector } from './pattern-types.js';
import { createProjectionCache } from './projection-cache.js';
import { projectCausalNeighbourhood } from './project.js';
import { projectSketchComposition } from './sketch.js';
import { buildWhatIfSessionStub } from './what-if.js';

function d01Fixture(yCount: number) {
  const owners = Array.from({ length: yCount }, (_, i) => `component:y:${String(i).padStart(4, '0')}`);
  const graph = new IndexedSemanticGraph([
    { id: 'param:d01:lengthMm', semanticType: 'parameter.number' },
    { id: 'pattern:d01:y-network', semanticType: 'pattern.y-network' },
    ...owners.map((id) => ({ id, semanticType: 'structural.y-component' })),
  ]);
  const edges = [
    { from: 'param:d01:lengthMm', to: 'pattern:d01:y-network', relationType: 'pattern.drives' },
    ...owners.map((id) => ({
      from: 'pattern:d01:y-network',
      to: id,
      relationType: 'produces',
    })),
  ];
  return { graph, edges, owners };
}

describe('SDI SD3–SD12 phase cores', () => {
  it('SD3: pattern cards omit operators at SYSTEM depth', () => {
    const inspector = buildPatternInspector({
      patternId: 'pattern:d01:y-network',
      name: 'y-network',
      parameters: { lengthMm: 2300 },
      operatorBindings: { 'op:1': 'occt.extrude' },
    });
    const card = buildPatternCard({ inspector, depth: 'system' });
    expect(card.parameters.length).toBeGreaterThan(0);
    expect(card.operators).toEqual([]);
    expect(showOperatorsAt('C', 'system')).toBe(false);
    expect(showOperatorsAt('E', 'execution')).toBe(true);

    const { graph, edges } = d01Fixture(3);
    const entered = patternGraph({
      patternId: 'pattern:d01:y-network',
      graph,
      dependencyEdges: edges,
      depth: 'system',
      parameters: { lengthMm: 2300 },
      operatorBindings: { 'op:1': 'occt.extrude' },
    });
    expect(entered.nodes.every((n) => n.family !== 'Operator')).toBe(true);
    const patternNode = entered.nodes.find((n) => n.family === 'Pattern');
    expect(patternNode?.card?.title).toBeTruthy();
    expect(patternNode?.card?.operators ?? []).toEqual([]);
  });

  it('SD4: lenses, aggregates, and parameter impact', () => {
    const { graph, edges, owners } = d01Fixture(12);
    const proj = projectCausalNeighbourhood({
      graph,
      dependencyEdges: edges,
      focusObjectIds: ['pattern:d01:y-network'],
      radius: 1,
    });
    const empty = applyLenses(proj, []);
    expect(empty.nodes).toEqual([]);
    const paramsOnly = applyLenses(proj, ['parameters']);
    expect(paramsOnly.nodes.every((n) => n.family === 'Parameter')).toBe(true);

    const aggregated = aggregateByFamily(proj, { threshold: 8 });
    expect(aggregated.nodes.some((n) => n.projectionRole === 'aggregate')).toBe(true);
    expect(aggregated.nodes.filter((n) => n.family === 'Entity' && n.projectionRole !== 'aggregate').length).toBe(0);

    const impact = impactFromParameter({
      parameterId: 'param:d01:lengthMm',
      dependencyEdges: edges,
    });
    expect(impact.downstreamIds).toContain('pattern:d01:y-network');
    expect(owners.every((id) => impact.downstreamIds.includes(id))).toBe(true);
  });

  it('SD8–SD11: delta, sketch, history/variant, what-if mode', () => {
    const { graph, edges } = d01Fixture(2);
    const base = projectCausalNeighbourhood({
      graph,
      dependencyEdges: edges,
      focusObjectIds: ['pattern:d01:y-network'],
      radius: 1,
    });
    const delta = projectChangeSetDelta({
      base,
      changeSet: {
        commands: [
          { op: 'update', targetId: 'param:d01:lengthMm' },
          { op: 'create', targetId: 'component:y:new' },
          { op: 'delete', targetId: 'component:y:0000' },
          { op: 'create_group', targetId: 'folder:bay:a' },
          {
            op: 'connect',
            targetId: 'component:y:0001',
            payload: { parentId: 'folder:bay:a' },
          },
        ],
      },
    });
    expect(delta.nodes.some((n) => n.projectionRole === 'provisional')).toBe(true);
    expect(delta.nodes.find((n) => n.semanticId === 'component:y:0000')?.summary).toBe('removed');
    expect(delta.nodes.find((n) => n.semanticId === 'folder:bay:a')?.projectionRole).toBe(
      'provisional',
    );
    expect(delta.nodes.find((n) => n.semanticId === 'folder:bay:a')?.family).toBe('Assembly');

    const sketch = projectSketchComposition({
      sketchId: 'sketch:1',
      fieldId: 'field:distance:1',
      patternId: 'pattern:d01:y-network',
      affectedCellIds: ['cell:1', 'cell:2'],
    });
    expect(sketch.edges.some((e) => e.fromSemanticId === 'sketch:1')).toBe(true);

    const hist = projectHistoryDelta(base, delta, {
      kind: 'history',
      eventId: 'evt:1',
      label: 'AI edit',
    });
    const variant = projectHistoryDelta(base, delta, {
      kind: 'variant',
      variantId: 'var:1',
      label: 'Option B',
    });
    expect(hist.kind).toBe('history');
    expect(variant.kind).toBe('variant');
    expect(hist.kind).not.toBe(variant.kind);

    const whatIf = buildWhatIfSessionStub({
      request: {
        modelId: 'm1',
        branchId: 'b1',
        draft: { parameterId: 'param:d01:lengthMm', value: 2400 },
      },
      baselineHash: 'hash:base',
      owners: ['component:y:0000'],
    });
    expect(whatIf.mode).toBe('regenerated-preview');
    expect(whatIf.previewHash).not.toBe(whatIf.baselineHash);
  });

  it('SD10: execution depth includes operators; system omits them', () => {
    const sys = executionGraph({ objectId: 'component:y:0000', depth: 'system' });
    const exe = executionGraph({ objectId: 'component:y:0000', depth: 'execution' });
    expect(sys.nodes.every((n) => n.family !== 'Operator')).toBe(true);
    expect(exe.nodes.some((n) => n.family === 'Operator')).toBe(true);
    expect(exe.nodes.some((n) => String(n.summary).includes('occt') || n.semanticId.includes('kernel'))).toBe(
      true,
    );
  });

  it('SD12: generators, budget, and projection cache', () => {
    const g1k = generateSyntheticGraph(1000);
    expect(g1k.objects.length).toBe(1000);
    expect(() => assertProjectionBudget(501)).toThrow(/budget/i);
    expect(() => assertProjectionBudget(200)).not.toThrow();

    const cache = createProjectionCache();
    const { graph, edges } = d01Fixture(3);
    const key = {
      modelVersion: 'v1',
      focusIds: ['pattern:d01:y-network'],
      radius: 1,
      depth: 'system',
      lenses: [] as string[],
    };
    const proj = projectCausalNeighbourhood({
      graph,
      dependencyEdges: edges,
      focusObjectIds: ['pattern:d01:y-network'],
      radius: 1,
    });
    expect(cache.get(key)).toBeUndefined();
    cache.set(key, proj);
    expect(cache.get(key)?.projectionId).toBe(proj.projectionId);
    expect(cache.stats().hits).toBe(1);
    cache.invalidate('v1');
    expect(cache.get(key)).toBeUndefined();
  });
});
