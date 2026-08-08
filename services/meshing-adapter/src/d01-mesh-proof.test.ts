import { describe, expect, it } from 'vitest';
import { runD01ReferencePipeline } from '@spds/reference-pipeline';
import { runMeshJob } from './index.js';

describe('E5 D01 geometry → analysis mesh proof', () => {
  it('meshes D01 representations with semantic physical groups', async () => {
    const pipeline = await runD01ReferencePipeline({ yLimit: 3 });
    expect(pipeline.representations.length).toBe(3);

    const groups = pipeline.representations.map((r) => ({
      name: `group:${r.semanticOwner}`,
      semanticIds: [r.semanticOwner],
      role: 'material' as const,
    }));

    const job = runMeshJob({
      requestId: 'mesh:d01-proof',
      geometryArtifactHash: pipeline.pipelineHash,
      settings: {
        elementSizeMm: 25,
        algorithm: 'frontal',
        determinismClass: 'D1',
      },
      physicalGroups: groups,
      timeoutMs: 30_000,
      resourceBudgetMb: 512,
    });

    expect(job.status).toBe('succeeded');
    expect(job.artifact?.labelPolicy).toBe('computational-indicative');
    expect(job.artifact?.elementCount).toBeGreaterThan(0);
    expect(Object.keys(job.artifact?.groupMapping ?? {})).toHaveLength(3);
    expect(job.artifact?.determinismClass).toBe('D1');

    const again = runMeshJob({
      requestId: 'mesh:d01-proof-2',
      geometryArtifactHash: pipeline.pipelineHash,
      settings: {
        elementSizeMm: 25,
        algorithm: 'frontal',
        determinismClass: 'D1',
      },
      physicalGroups: groups,
      timeoutMs: 30_000,
      resourceBudgetMb: 512,
    });
    expect(again.artifact?.artifactHash).toBe(job.artifact?.artifactHash);

    if (process.env.SPDS_REQUIRE_LIVE_GMSH === '1') {
      expect(job.artifact?.artifactHash).toMatch(/^[a-f0-9]{64}$/i);
      // Live mode must leave deterministic-fallback (enforced in gmsh-live.test).
    }
  });
});
