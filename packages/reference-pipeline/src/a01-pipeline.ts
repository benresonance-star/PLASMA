import {
  applyConnectionChange,
  buildA01AssemblyFixture,
  emptyConnectionEffectState,
} from '@spds/assembly-core';
import {
  parseCompositionDocument,
  resolveEffectiveState,
} from '@spds/composition-core';
import { buildExecutionDag, runOperatorDag } from '@spds/execution-dag';
import { buildFabricationFromRepresentations } from '@spds/fabrication-core';
import {
  InProcessGeometryKernel,
  type GeometryRepresentation,
} from '@spds/geometry-contracts';
import { parsePirDocument } from '@spds/parametric-ir';
import {
  createDesignRelease,
  publishRelease,
  validateRelease,
  type DesignRelease,
} from '@spds/release-core';
import { sha256Canonical } from '@spds/reproducibility';
import { TOLERANCE_POLICY_VERSION } from '@spds/shared-units';

export interface A01PipelineResult {
  readonly layers: readonly string[];
  readonly bypassDetected: false;
  readonly instanceCount: number;
  readonly mateCount: number;
  readonly effectiveHash: string;
  readonly pirHash: string;
  readonly dagHash: string;
  readonly representations: readonly GeometryRepresentation[];
  readonly release: DesignRelease;
  readonly pipelineHash: string;
  readonly connectionHoleCount: number;
  readonly bomLineCount: number;
  readonly geometryDirtyIds: readonly string[];
}

/**
 * A01 assembly path through the same architectural layers as D01 (no dome shortcut).
 */
export async function runA01ReferencePipeline(options?: {
  readonly kernel?: InProcessGeometryKernel;
}): Promise<A01PipelineResult> {
  const layers = [
    'semantic',
    'composition',
    'pir',
    'dag',
    'assembly',
    'geometry',
    'fabrication',
    'release',
  ] as const;

  const fixture = buildA01AssemblyFixture();
  const composition = parseCompositionDocument({
    id: 'composition:a01-reference',
    publishedBaseId: 'pattern:parametric-assembly@1.0.0',
    publishedBaseImmutable: true,
    layers: [
      {
        layer: 'base',
        overrides: [
          { path: 'params.plateThicknessMm', value: 12 },
          { path: 'params.pinDiaMm', value: 16 },
        ],
      },
    ],
    objects: {
      params: {
        plateThicknessMm: 10,
        pinDiaMm: 12,
      },
    },
  });
  const effective = resolveEffectiveState(composition);
  const params = effective.objects['params'] as {
    plateThicknessMm: number;
    pinDiaMm: number;
  };

  const pir = parsePirDocument({
    schemaVersion: 'pir/1',
    id: `pir:${composition.id}`,
    operations: [
      {
        id: 'pir:assembly.resolve',
        op: 'resolve-assembly',
        operator: 'assembly.resolve@1.0.0',
        semanticOwner: 'model:A01',
        inputs: {
          plateThicknessMm: { value: params.plateThicknessMm },
          pinDiaMm: { value: params.pinDiaMm },
        },
        produces: { role: 'assembly:graph' },
        provenance: {
          patternInstance: 'pattern-instance:a01-reference',
          compositionHash: effective.effectiveHash,
        },
        dependsOn: [],
      },
      {
        id: 'pir:mates.bind',
        op: 'bind-mates',
        operator: 'assembly.mates@1.0.0',
        semanticOwner: 'model:A01',
        inputs: {
          assembly: { pirRef: 'pir:assembly.resolve' },
        },
        produces: { role: 'assembly:mates' },
        provenance: {
          patternInstance: 'pattern-instance:a01-reference',
          compositionHash: effective.effectiveHash,
        },
        dependsOn: ['pir:assembly.resolve'],
      },
    ],
  });
  const pirHash = sha256Canonical(pir);
  const dag = buildExecutionDag(pir, pirHash);

  let instanceCount = 0;
  let mateCount = 0;
  const { dag: executed } = await runOperatorDag(dag, new Map(), async (node) => {
    if (node.operator.startsWith('assembly.resolve@')) {
      instanceCount = fixture.registry.listInstances().length;
      return { instances: instanceCount, frames: fixture.frames.length };
    }
    if (node.operator.startsWith('assembly.mates@')) {
      mateCount = fixture.registry.inspector().mates.length;
      return { mates: mateCount };
    }
    throw new Error(`OPERATOR_UNAVAILABLE: ${node.operator}`);
  });

  const kernel = options?.kernel ?? new InProcessGeometryKernel();
  const plateIds = fixture.registry.listInstances().slice(0, 2).map((i) => i.id);
  const connectionEffects = applyConnectionChange({
    state: emptyConnectionEffectState(),
    connectionId: 'conn:a01:bolted',
    plateInstanceIds: plateIds,
    fastenerId: 'fast:M12x40',
    holeCountPerPlate: 2,
  });
  const representations: GeometryRepresentation[] = [];
  for (const inst of fixture.registry.listInstances().slice(0, 2)) {
    let rep = kernel.sweep({
      semanticOwner: inst.id,
      pirOperationId: `pir:a01-brep:${inst.id}`,
      path: [
        [0, 0, 0],
        [params.plateThicknessMm * 10, 0, 0],
      ],
      profileWidthMm: params.plateThicknessMm * 8,
      profileDepthMm: params.pinDiaMm * 4,
    });
    const holes = connectionEffects.holes.filter((h) => h.plateInstanceId === inst.id);
    if (holes.length > 0) {
      rep = kernel.applyHoleCuts({
        representationId: rep.id,
        holeIds: holes.map((h) => h.holeId),
        diameterMm: holes[0]!.diameterMm,
      });
    }
    representations.push(rep);
  }

  const snapshotId = `snapshot:a01:${pirHash.slice(0, 12)}`;
  const fabrication = buildFabricationFromRepresentations({
    snapshotId,
    modelId: 'model:A01',
    branchId: 'branch:main',
    representations,
  });
  const manifest = {
    compilerVersion: 'reference-pipeline@0.0.0',
    operatorVersions: {
      'assembly.resolve': '1.0.0',
      'assembly.mates': '1.0.0',
      'geometry.exact-adapter': kernel.version,
    },
    tolerancePolicyVersion: TOLERANCE_POLICY_VERSION,
    determinismClass: 'D1' as const,
    artifactHashes: fabrication.artifacts.map((a) => a.contentHash),
  };
  const release = publishRelease(
    validateRelease(createDesignRelease({ snapshotId, manifest, fabricationProtected: true })),
  );

  const pipelineHash = sha256Canonical({
    effectiveHash: effective.effectiveHash,
    pirHash,
    dagHash: executed.dagHash,
    instanceCount,
    mateCount,
    representationIds: representations.map((r) => r.id),
    releaseId: release.releaseId,
  });

  return {
    layers,
    bypassDetected: false,
    instanceCount,
    mateCount,
    effectiveHash: effective.effectiveHash,
    pirHash,
    dagHash: executed.dagHash,
    representations,
    release,
    pipelineHash,
    connectionHoleCount: connectionEffects.holes.length,
    bomLineCount: connectionEffects.bom.length,
    geometryDirtyIds: connectionEffects.geometryDirtyIds,
  };
}
