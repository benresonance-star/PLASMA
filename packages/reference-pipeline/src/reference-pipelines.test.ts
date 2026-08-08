import { describe, expect, it } from 'vitest';
import { runLiveAdversarialSuite } from './adversarial.js';
import { runA01ReferencePipeline } from './a01-pipeline.js';
import { buildLiveReferenceCompletenessSuite } from './completeness.js';
import { runF01ReferencePipeline } from './f01-pipeline.js';

describe('E4 A01/F01 pipelines + live adversarial', () => {
  it('runs A01 through shared layers to published release', async () => {
    const a = await runA01ReferencePipeline();
    const b = await runA01ReferencePipeline();
    expect(a.bypassDetected).toBe(false);
    expect(a.layers).toContain('assembly');
    expect(a.layers).toContain('release');
    expect(a.instanceCount).toBeGreaterThan(0);
    expect(a.mateCount).toBeGreaterThan(0);
    expect(a.release.status).toBe('published');
    expect(a.pipelineHash).toBe(b.pipelineHash);
  });

  it('runs F01 freeform through shared layers without dome imports', async () => {
    const f01 = await runF01ReferencePipeline();
    expect(f01.usesDomeImports).toBe(false);
    expect(f01.bypassDetected).toBe(false);
    expect(f01.layers).toContain('panelisation');
    expect(f01.panelCount).toBe(1);
    expect(f01.representations.length).toBe(1);
    expect(f01.release.status).toBe('published');
  });

  it('proves live D01/A01/F01 completeness and adversarial structured fails', async () => {
    const suite = await buildLiveReferenceCompletenessSuite();
    expect(suite.map((r) => r.modelId).sort()).toEqual(['A01', 'D01', 'F01']);
    expect(suite.every((r) => !r.bypassDetected)).toBe(true);
    expect(suite.every((r) => r.layers.includes('pir') && r.layers.includes('release'))).toBe(
      true,
    );

    const adv = await runLiveAdversarialSuite();
    expect(adv).toHaveLength(5);
    expect(adv.every((r) => r.status === 'structured-fail' && !r.timedOut)).toBe(true);
    expect(adv.map((r) => r.failureCode).sort()).toEqual(
      [
        'COMPOSITION_CONFLICT',
        'DEPENDENCY_CYCLE',
        'HEAD_CONFLICT',
        'OPERATOR_UNAVAILABLE',
        'SELECTOR_AMBIGUOUS',
      ].sort(),
    );
  });
});
