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
    expect(a.connectionHoleCount).toBeGreaterThan(0);
    expect(a.bomLineCount).toBeGreaterThan(0);
    expect(a.geometryDirtyIds.length).toBeGreaterThan(0);
    expect(
      a.representations.every((r) => r.subElementPaths.some((p) => p.includes('/hole:'))),
    ).toBe(true);
  });

  it('runs F01 freeform through shared layers without dome imports', async () => {
    const f01 = await runF01ReferencePipeline();
    expect(f01.usesDomeImports).toBe(false);
    expect(f01.bypassDetected).toBe(false);
    expect(f01.layers).toContain('panelisation');
    expect(f01.panelCount).toBe(1);
    expect(f01.representations.length).toBe(1);
    expect(f01.compileRequest.snapshotHash).toMatch(/^snapshot:preview:/);
    expect(f01.exactMeshes).toHaveLength(1);
    const compileOp = f01.compileRequest.ops[0]!;
    expect(compileOp.op).toBe('geometry.extrude@1.0.0');
    if (compileOp.op !== 'geometry.extrude@1.0.0') {
      throw new Error('F01 must lower to planar extrusion');
    }
    expect(compileOp.profile).toHaveLength(4);
    expect(compileOp.vector).toEqual([0, 0, 4]);
    expect(f01.representations[0]?.mass.volumeMm3).toBe(800 * 600 * 4);
    expect(f01.release.status).toBe('published');
    expect(f01.pir.operations.map((operation) => operation.produces?.form?.kind)).toEqual([
      'geometry',
      'geometry',
    ]);
  });

  it('proves live D01/A01/F01 completeness and adversarial structured fails', async () => {
    const suite = await buildLiveReferenceCompletenessSuite();
    expect(suite.map((r) => r.modelId).sort()).toEqual(['A01', 'D01', 'F01']);
    expect(suite.every((r) => !r.bypassDetected)).toBe(true);
    expect(suite.every((r) => r.layers.includes('pir') && r.layers.includes('release'))).toBe(true);

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
