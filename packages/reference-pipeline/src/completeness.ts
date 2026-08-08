import { buildA01AssemblyFixture } from '@spds/assembly-core';
import { buildF01Fixture } from '@spds/package-core';
import { runD01ReferencePipeline, runLayerAuditOnly } from './d01-pipeline.js';

export interface LiveReferenceCompletenessRecord {
  readonly modelId: 'D01' | 'A01' | 'F01';
  readonly layers: readonly string[];
  readonly bypassDetected: boolean;
  readonly evidence: string;
}

/** Live completeness: actually exercise D01 pipeline + A01/F01 layer presence. */
export async function buildLiveReferenceCompletenessSuite(): Promise<
  readonly LiveReferenceCompletenessRecord[]
> {
  const d01 = await runD01ReferencePipeline({ yLimit: 5 });
  const a01 = buildA01AssemblyFixture();
  const f01 = buildF01Fixture();
  const a01Audit = runLayerAuditOnly('A01');
  const f01Audit = runLayerAuditOnly('F01');

  return [
    {
      modelId: 'D01',
      layers: d01.layers,
      bypassDetected: d01.bypassDetected,
      evidence: `pipelineHash=${d01.pipelineHash.slice(0, 16)};release=${d01.release.status}`,
    },
    {
      modelId: 'A01',
      layers: a01Audit.layers,
      bypassDetected: a01Audit.bypassDetected || a01.frames.length === 0,
      evidence: `instances=${a01.registry.listInstances().length};bom=${Object.keys(a01.registry.bomCounts()).length}`,
    },
    {
      modelId: 'F01',
      layers: f01.pipeline,
      bypassDetected: f01Audit.bypassDetected || f01.usesDomeImports,
      evidence: `panels=${f01.panels.length};package=${f01.packageManifest.packageId}`,
    },
  ];
}
