import { describe, expect, it } from 'vitest';
import { runAnalysisJob } from '@spds/analysis-worker';
import { runD01ReferencePipeline } from '@spds/reference-pipeline';
import { deriveYComponentArmSegments } from '@spds/topology-operators';
import { analysisLabelIsIndicative, buildAnalysisMeshView } from './analysis-mesh-view.js';
import { setActivePanel, createShellState } from './shell.js';

describe('E8 D01 → analysis → Analysis Mesh View', () => {
  it('bridges indicative analysis into designer analysis-mesh panel', async () => {
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
    const analysis = runAnalysisJob({
      requestId: 'ui:analysis',
      yMembers,
      mesh: {
        requestId: 'ui:mesh',
        geometryArtifactHash: pipeline.pipelineHash,
        settings: { elementSizeMm: 20, algorithm: 'mock', determinismClass: 'D1' },
        physicalGroups: [
          { name: 'material', semanticIds: yMembers.map((y) => y.id), role: 'material' },
        ],
        timeoutMs: 10_000,
        resourceBudgetMb: 128,
      },
    });
    expect(analysis.status).toBe('succeeded');
    expect(analysis.model?.beams).toHaveLength(6);
    const view = buildAnalysisMeshView({
      meshArtifactHash: analysis.meshArtifact!.artifactHash,
      elementCount: analysis.meshArtifact!.elementCount,
      groupMapping: analysis.meshArtifact!.groupMapping,
      groupRoles: { material: 'material' },
      labels: analysis.results!.viewportLabels,
    });
    expect(analysisLabelIsIndicative(view)).toBe(true);

    const shell = setActivePanel(
      createShellState({
        projectId: 'p1',
        modelId: 'model:D01',
        branchId: 'branch:main',
        branchName: 'main',
      }),
      'analysis-mesh',
    );
    expect(shell.activePanel).toBe('analysis-mesh');
  });
});
