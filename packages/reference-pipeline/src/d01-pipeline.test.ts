import { describe, expect, it } from 'vitest';
import { assessReproducibility } from '@spds/release-core';
import { TOLERANCE_POLICY_VERSION } from '@spds/shared-units';
import { buildLiveReferenceCompletenessSuite } from './completeness.js';
import { runD01ReferencePipeline } from './d01-pipeline.js';

describe('E0 D01 reference pipeline', () => {
  it('runs semantic→composition→PIR→DAG→Y→geometry→fab→release without bypass', async () => {
    const a = await runD01ReferencePipeline({ yLimit: 8 });
    const b = await runD01ReferencePipeline({ yLimit: 8 });

    expect(a.bypassDetected).toBe(false);
    expect(a.layers).toEqual([
      'semantic',
      'composition',
      'pir',
      'dag',
      'topology',
      'y-network',
      'geometry',
      'fabrication',
      'release',
    ]);
    expect(a.semanticObjectCount).toBeGreaterThan(0);
    expect(a.topology.counts.cells).toBe(42);
    expect(a.yNetwork.counts.junctions).toBeGreaterThan(0);
    expect(a.representations).toHaveLength(8);
    expect(a.representations.every((r) => r.mass.volumeMm3 > 0)).toBe(true);
    expect(a.fabrication.artifacts).toHaveLength(3);
    expect(a.release.status).toBe('published');
    expect(a.pipelineHash).toBe(b.pipelineHash);
    expect(a.pirHash).toBe(b.pirHash);
    expect(a.dagHash).toBe(b.dagHash);

    expect(
      assessReproducibility(a.release.manifest, {
        compilerVersion: 'reference-pipeline@0.0.0',
        operatorVersions: a.release.manifest.operatorVersions,
        tolerancePolicyVersion: TOLERANCE_POLICY_VERSION,
        determinismClass: 'D0',
        artifactHashes: a.release.manifest.artifactHashes,
      }),
    ).toBe('exact');
  });

  it('proves D01/A01/F01 share architectural layers', async () => {
    const suite = await buildLiveReferenceCompletenessSuite();
    expect(suite).toHaveLength(3);
    expect(suite.every((r) => !r.bypassDetected)).toBe(true);
    expect(suite.find((r) => r.modelId === 'D01')?.layers).toContain('pir');
    expect(suite.find((r) => r.modelId === 'D01')?.layers).toContain('release');
  });
});
