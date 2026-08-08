import { describe, expect, it } from 'vitest';
import { KernelHistoryNamingAdapter } from './persistent-naming.js';
import { runNamingTortureSuite } from './torture-b12.js';

describe('G6A topological naming hardening', () => {
  it('never persists FaceN / EdgeN as design references', () => {
    const adapter = new KernelHistoryNamingAdapter();
    expect(() => adapter.bind('component:y:1/arm:A/start', 'Face17')).toThrow(/Transient/);
    adapter.mapKernelResult([
      { kernelTransientId: 'Face17', semanticPath: 'component:y:1/arm:A/start' },
    ]);
    const out = adapter.resolveAfterMutation({
      path: 'component:y:1/arm:A/start',
      remap: { 'stable:component:y:1/arm:A/start': 'stable:component:y:1/arm:A/start:v2' },
    });
    expect(out.result).toBe('survived');
    expect(out.targetId).not.toMatch(/^Face\d+$/i);
  });

  it('B12: 500 sequences with zero silent wrong references', () => {
    const report = runNamingTortureSuite(500);
    expect(report.results).toHaveLength(500);
    expect(report.silentWrong).toBe(0);
    expect(report.survived).toBeGreaterThan(0);
    expect(report.unresolved).toBeGreaterThan(0);
    expect(report.intentionalDelete).toBeGreaterThan(0);
  });
});
