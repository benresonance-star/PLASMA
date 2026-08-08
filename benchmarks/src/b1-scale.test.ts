import { describe, expect, it } from 'vitest';
import { scaleTierPolicy } from '@spds/package-core';
import { runD01ReferencePipeline } from '@spds/reference-pipeline';
import { IndexedSemanticGraph, executeQuery } from '@spds/semantic-query';
import { generateGoldbergTopology } from '@spds/topology-operators';
import { recordBenchmark } from './index.js';

describe('E2 benchmarks B1 / B2 / B18 precursors', () => {
  it('records B1-S scale query against synthetic index and D01 pipeline timing', async () => {
    const policy = scaleTierPolicy('B1-S');
    expect(policy.maxEagerObjects).toBe(30_000);

    const objects = Array.from({ length: 10_000 }, (_, i) => ({
      id: `obj:${i}`,
      semanticType: i % 5 === 0 ? 'structural.y-component' : 'topology.cell',
      tags: i % 7 === 0 ? ['pentagon'] : ['hexagon'],
      attributes: { lengthMm: 1000 + (i % 50) },
    }));
    const graph = new IndexedSemanticGraph(objects);
    const t0 = performance.now();
    const filtered = executeQuery(graph, {
      op: 'FILTER',
      where: { semanticType: 'structural.y-component', attribute: 'lengthMm', gt: 1020 },
    });
    const queryMs = performance.now() - t0;
    expect(filtered.ids.length).toBeGreaterThan(0);
    expect(objects.length).toBeLessThanOrEqual(policy.maxEagerObjects);

    const topoStart = performance.now();
    const topo = generateGoldbergTopology({ frequency: 2, riseRatio: 0.5 });
    const topoMs = performance.now() - topoStart;
    expect(topo.counts.cells).toBe(42);

    const pipeStart = performance.now();
    const pipeline = await runD01ReferencePipeline({ yLimit: 5 });
    const pipeMs = performance.now() - pipeStart;
    expect(pipeline.release.status).toBe('published');

    const records = [
      recordBenchmark({
        id: 'B1-S.query',
        tier: 'B1-S',
        durationMs: queryMs,
        objectCount: objects.length,
        determinismClass: 'D0',
      }),
      recordBenchmark({
        id: 'B2.topology',
        durationMs: topoMs,
        objectCount: topo.counts.cells,
        determinismClass: 'D1',
      }),
      recordBenchmark({
        id: 'B18.d01-pipeline',
        durationMs: pipeMs,
        objectCount: pipeline.representations.length,
        determinismClass: 'D1',
      }),
    ];
    expect(records.every((r) => r.durationMs >= 0)).toBe(true);
    expect(scaleTierPolicy('B1-M').requiresLazyUi).toBe(true);
    expect(scaleTierPolicy('B1-L').requiresPagination).toBe(true);
  });
});
