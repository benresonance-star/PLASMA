import { runA01ReferencePipeline } from './a01-pipeline.js';
import { runD01ReferencePipeline } from './d01-pipeline.js';
import { runF01ReferencePipeline } from './f01-pipeline.js';

export interface LiveReferenceCompletenessRecord {
  readonly modelId: 'D01' | 'A01' | 'F01';
  readonly layers: readonly string[];
  readonly bypassDetected: boolean;
  readonly evidence: string;
}

/** Live completeness: D01/A01/F01 each compile through shared architectural layers. */
export async function buildLiveReferenceCompletenessSuite(): Promise<
  readonly LiveReferenceCompletenessRecord[]
> {
  const d01 = await runD01ReferencePipeline({ yLimit: 5 });
  const a01 = await runA01ReferencePipeline();
  const f01 = await runF01ReferencePipeline();

  return [
    {
      modelId: 'D01',
      layers: d01.layers,
      bypassDetected: d01.bypassDetected,
      evidence: `pipelineHash=${d01.pipelineHash.slice(0, 16)};release=${d01.release.status}`,
    },
    {
      modelId: 'A01',
      layers: a01.layers,
      bypassDetected: a01.bypassDetected,
      evidence: `instances=${a01.instanceCount};mates=${a01.mateCount};release=${a01.release.status}`,
    },
    {
      modelId: 'F01',
      layers: f01.layers,
      bypassDetected: f01.bypassDetected || f01.usesDomeImports,
      evidence: `panels=${f01.panelCount};release=${f01.release.status}`,
    },
  ];
}
