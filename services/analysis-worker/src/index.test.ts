import { describe, expect, it } from 'vitest';
import { runD01ReferencePipeline } from '@spds/reference-pipeline';
import { deriveYComponentArmSegments } from '@spds/topology-operators';
import { runAnalysisJob } from './index.js';

describe('E7 analysis-worker mesh→analysis', () => {
  it('runs D01 → mesh → indicative analysis export/import', async () => {
    const pipeline = await runD01ReferencePipeline({ yLimit: 2 });
    const yMembers = pipeline.yNetwork.components
      .filter((c) => c.trim === 'retained')
      .slice(0, 2)
      .flatMap((component) =>
        deriveYComponentArmSegments(component).map((segment) => ({
          id: segment.id,
          a: segment.a,
          b: segment.b,
        })),
      );

    const job = runAnalysisJob({
      requestId: 'analysis:d01-e7',
      currentHeadHash: 'head:1',
      yMembers,
      mesh: {
        requestId: 'mesh:d01-e7',
        geometryArtifactHash: pipeline.pipelineHash,
        settings: {
          elementSizeMm: 30,
          algorithm: 'mock',
          determinismClass: 'D1',
        },
        physicalGroups: [
          {
            name: 'material',
            semanticIds: yMembers.map((y) => y.id),
            role: 'material',
          },
          { name: 'support', semanticIds: [yMembers[0]!.id], role: 'support' },
          {
            name: 'load',
            semanticIds: [yMembers[yMembers.length - 1]!.id],
            role: 'load',
          },
        ],
        timeoutMs: 10_000,
        resourceBudgetMb: 256,
        expectedHeadHash: 'head:1',
      },
    });

    expect(job.status).toBe('succeeded');
    expect(job.meshArtifact?.labelPolicy).toBe('computational-indicative');
    expect(job.exportFixture?.labelPolicy).toBe('computational-indicative');
    expect(job.model?.solids[0]?.meshArtifactHash).toBe(job.meshArtifact?.artifactHash);
    expect(job.model?.beams).toHaveLength(6);
    expect(job.results?.viewportLabels.every((l) => l.indicative)).toBe(true);
  });

  it('rejects cancel, stale, and resource limits', () => {
    const baseMesh = {
      requestId: 'mesh:x',
      geometryArtifactHash: 'g',
      settings: {
        elementSizeMm: 10,
        algorithm: 'mock' as const,
        determinismClass: 'D1' as const,
      },
      physicalGroups: [],
      timeoutMs: 1000,
      resourceBudgetMb: 64,
    };
    expect(
      runAnalysisJob({
        requestId: 'a1',
        yMembers: [],
        mesh: { ...baseMesh, cancelToken: { cancelled: true } },
      }).status,
    ).toBe('cancelled');
    expect(
      runAnalysisJob({
        requestId: 'a2',
        currentHeadHash: 'new',
        yMembers: [],
        mesh: { ...baseMesh, expectedHeadHash: 'old' },
      }).status,
    ).toBe('stale');
    expect(
      runAnalysisJob({
        requestId: 'a3',
        yMembers: [],
        mesh: { ...baseMesh, timeoutMs: 0 },
      }).failureCode,
    ).toBe('RESOURCE_LIMIT');
  });
});
