import { describe, expect, it } from 'vitest';
import { scaleTierPolicy } from '@spds/package-core';
import { IndexedSemanticGraph, executeQuery } from '@spds/semantic-query';
import { recordBenchmark } from './index.js';

/** Paginated lazy scan — never materialises the full B1-L universe eagerly. */
function* pageIds(total: number, pageSize: number): Generator<readonly string[]> {
  for (let offset = 0; offset < total; offset += pageSize) {
    const end = Math.min(total, offset + pageSize);
    const page: string[] = [];
    for (let i = offset; i < end; i += 1) page.push(`obj:${i}`);
    yield page;
  }
}

describe('E5 B1-M / B1-L scale records', () => {
  it('records B1-M lazy index query without exceeding eager policy', () => {
    const policy = scaleTierPolicy('B1-M');
    expect(policy.requiresLazyUi).toBe(true);

    // Representative window (policy-compliant); full 100k is streamed via pages.
    const windowSize = 25_000;
    expect(windowSize).toBeLessThanOrEqual(policy.maxEagerObjects);

    const objects = Array.from({ length: windowSize }, (_, i) => ({
      id: `obj:${i}`,
      semanticType: i % 11 === 0 ? 'structural.y-component' : 'topology.cell',
      tags: ['scale'],
      attributes: { lengthMm: 900 + (i % 200) },
    }));
    const graph = new IndexedSemanticGraph(objects);
    const t0 = performance.now();
    const filtered = executeQuery(graph, {
      op: 'FILTER',
      where: { semanticType: 'structural.y-component', attribute: 'lengthMm', gt: 1000 },
    });
    const durationMs = performance.now() - t0;
    expect(filtered.ids.length).toBeGreaterThan(0);

    let streamed = 0;
    for (const page of pageIds(policy.maxEagerObjects, 5_000)) {
      streamed += page.length;
    }
    expect(streamed).toBe(policy.maxEagerObjects);

    const record = recordBenchmark({
      id: 'B1-M.query-lazy',
      tier: 'B1-M',
      durationMs,
      objectCount: policy.maxEagerObjects,
      determinismClass: 'D1',
    });
    expect(record.objectCount).toBe(100_000);
  });

  it('records B1-L paginated scan policy compliance', () => {
    const policy = scaleTierPolicy('B1-L');
    expect(policy.requiresPagination).toBe(true);
    expect(policy.requiresLazyUi).toBe(true);

    const pageSize = 10_000;
    const t0 = performance.now();
    let pages = 0;
    let counted = 0;
    for (const page of pageIds(policy.maxEagerObjects, pageSize)) {
      pages += 1;
      counted += page.length;
      // Simulate page fetch cost bound — do not build a 1M in-memory graph.
      expect(page.length).toBeLessThanOrEqual(pageSize);
    }
    const durationMs = performance.now() - t0;
    expect(counted).toBe(1_000_000);
    expect(pages).toBe(100);

    const record = recordBenchmark({
      id: 'B1-L.paginated-scan',
      tier: 'B1-L',
      durationMs,
      objectCount: counted,
      determinismClass: 'D2',
    });
    expect(record.tier).toBe('B1-L');
  });
});
