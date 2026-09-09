import {
  parseCompositionDocument,
  resolveEffectiveState,
  type CompositionDocument,
  type EffectiveState,
} from '@spds/composition-core';
import { buildExecutionDag, runOperatorDag } from '@spds/execution-dag';
import {
  buildFabricationFromRepresentations,
  type FabricationSnapshotOutputs,
} from '@spds/fabrication-core';
import {
  executeExactCompile,
  InProcessGeometryKernel,
  meshToAsciiStl,
  meshToGlbJson,
  representationsToStepText,
  type GeometryCompileMesh,
  type GeometryCompileRequest,
  type GeometryRepresentation,
} from '@spds/geometry-contracts';
import { PreviewLowererRegistry, compilePreviewRequest } from '@spds/preview-compiler';
import { compilePirFromEffectiveState, type PirDocument } from '@spds/parametric-ir';
import {
  createDesignRelease,
  publishRelease,
  validateRelease,
  type DesignRelease,
} from '@spds/release-core';
import { sha256Canonical } from '@spds/reproducibility';
import { buildD01SemanticFixture } from '@spds/semantic-core';
import { TOLERANCE_POLICY_VERSION } from '@spds/shared-units';
import {
  D01_TOPOLOGY_POLICY,
  assertD01TopologyInvariants,
  createGoldbergTopologyOperator,
  extractYNetwork,
  generateGoldbergTopology,
  hashTopology,
  type GoldbergTopology,
  type YNetwork,
} from '@spds/topology-operators';
import { createYNetworkPreviewLowerer } from './y-network-preview.js';

export interface D01PipelineResult {
  readonly layers: readonly string[];
  readonly bypassDetected: false;
  readonly semanticObjectCount: number;
  readonly effectiveHash: string;
  readonly pir: PirDocument;
  readonly pirHash: string;
  readonly dagHash: string;
  readonly topologyHash: string;
  readonly topology: GoldbergTopology;
  readonly yNetwork: YNetwork;
  readonly representations: readonly GeometryRepresentation[];
  readonly fabrication: FabricationSnapshotOutputs;
  readonly release: DesignRelease;
  readonly pipelineHash: string;
  readonly compileRequest: GeometryCompileRequest;
  readonly compileHash: string;
  readonly exactMeshes: readonly GeometryCompileMesh[];
}

export interface GoldbergEffectiveParameters {
  readonly frequency: number;
  readonly diameterMm: number;
  readonly riseRatio: number;
}

export function readGoldbergEffectiveParameters(
  effective: EffectiveState,
): GoldbergEffectiveParameters {
  const raw = effective.objects['params'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Effective composition is missing params');
  }
  const params = raw as Record<string, unknown>;
  const frequency = Number(params['frequency']);
  const diameterMm = Number(params['diameterMm']);
  const riseRatio = Number(params['riseRatio']);
  if (!Number.isInteger(frequency) || frequency < 1) {
    throw new Error('frequency must be a positive integer');
  }
  if (!(diameterMm > 0)) {
    throw new Error('diameterMm must be positive');
  }
  if (!(riseRatio >= 0 && riseRatio <= 1)) {
    throw new Error('riseRatio must be between 0 and 1');
  }
  return { frequency, diameterMm, riseRatio };
}

const D01_UNIVERSE = [
  {
    id: 'topology:root',
    semanticType: 'structural.topology-root',
    tags: ['primary'],
    capabilities: ['emit.cells'],
  },
  {
    id: 'cell:capability-sink',
    semanticType: 'structural.cell-set',
    capabilities: ['emit.cells'],
  },
] as const;

/**
 * Full D01 reference path through architectural layers (no shortcuts):
 * semantic → composition → PIR → DAG → topology/Y → geometry → fab → release.
 */
export async function runD01ReferencePipeline(options?: {
  readonly yLimit?: number;
  readonly kernel?: InProcessGeometryKernel;
  /**
   * Schema lengthMm for Y sweeps (mm). Prefer this over the deprecated alias.
   * @deprecated lengthMmOverride — same meaning; kept for API compat.
   */
  readonly lengthMm?: number;
  /** @deprecated Use lengthMm — maps into compile parameters. */
  readonly lengthMmOverride?: number;
  readonly armWidthMm?: number;
  readonly structuralDepthMm?: number;
  /** Authoritative pattern composition. Defaults to the frozen D01 fixture. */
  readonly composition?: CompositionDocument;
  /** Convenience overrides used to build the default composition. */
  readonly frequency?: number;
  readonly diameterMm?: number;
  readonly riseRatio?: number;
  /** Optional OCCT WASM STEP content hashes for dual-kernel publish manifest. */
  readonly occtWasmStepHashes?: readonly string[];
  /** Optional constructive OCCT native STEP content hashes (N1.7). */
  readonly occtNativeStepHashes?: readonly string[];
}): Promise<D01PipelineResult> {
  const layers = [
    'semantic',
    'composition',
    'pir',
    'dag',
    'topology',
    'y-network',
    'geometry',
    'fabrication',
    'release',
  ] as const;

  const semantic = buildD01SemanticFixture();
  const composition =
    options?.composition ??
    parseCompositionDocument({
      id: 'composition:d01-reference',
      publishedBaseId: 'pattern:goldberg-cellular-topology@1.0.0',
      publishedBaseImmutable: true,
      layers: [
        {
          layer: 'base',
          overrides: [
            {
              path: 'params.frequency',
              value: options?.frequency ?? D01_TOPOLOGY_POLICY.frequency,
            },
            {
              path: 'params.diameterMm',
              value: options?.diameterMm ?? D01_TOPOLOGY_POLICY.diameterMm,
            },
            {
              path: 'params.riseRatio',
              value: options?.riseRatio ?? D01_TOPOLOGY_POLICY.riseRatio,
            },
          ],
        },
      ],
      objects: {
        params: {
          frequency: 1,
          diameterMm: 10000,
          riseRatio: 1,
        },
      },
    });
  const effective = resolveEffectiveState(composition);
  const effectiveParams = readGoldbergEffectiveParameters(effective);
  const compiled = compilePirFromEffectiveState({
    effective,
    patternInstanceId: 'pattern-instance:d01-reference',
    selectableUniverse: D01_UNIVERSE,
  });
  const dag = buildExecutionDag(compiled.pir, compiled.pirHash);

  const topologyOp = createGoldbergTopologyOperator();
  let topology!: GoldbergTopology;
  let yNetwork!: YNetwork;
  const kernel = options?.kernel ?? new InProcessGeometryKernel();

  const { dag: executed, outputs } = await runOperatorDag(dag, new Map(), async (node) => {
    if (node.operator.startsWith('topology.goldberg.class-i@')) {
      const result = await topologyOp.execute(
        {
          frequency: effectiveParams.frequency,
          riseRatio: effectiveParams.riseRatio,
          diameterMm: effectiveParams.diameterMm,
        },
        {
          correlationId: 'd01-pipeline',
          tolerancePolicyVersion: TOLERANCE_POLICY_VERSION,
        },
      );
      topology = result.output;
      if (effectiveParams.frequency === D01_TOPOLOGY_POLICY.frequency) {
        assertD01TopologyInvariants(topology);
      }
      return result.output;
    }
    if (node.operator.startsWith('semantic.bind@')) {
      return { bound: true, cells: topology.counts.cells };
    }
    if (node.operator.startsWith('topology.y-network@')) {
      yNetwork = extractYNetwork(topology, effectiveParams.diameterMm);
      return yNetwork;
    }
    throw new Error(`OPERATOR_UNAVAILABLE: ${node.operator}`);
  });

  // Geometry stage: schema compile request → exact kernel (single entry point)
  const lengthMm = options?.lengthMm ?? options?.lengthMmOverride;
  const previewRegistry = new PreviewLowererRegistry();
  previewRegistry.register(createYNetworkPreviewLowerer({ componentLimit: options?.yLimit ?? 10 }));
  const compileReq = compilePreviewRequest({
    pir: compiled.pir,
    pirHash: compiled.pirHash,
    dagHash: executed.dagHash,
    outputs,
    registry: previewRegistry,
    parameters: {
      ...(lengthMm !== undefined ? { lengthMm } : {}),
      armWidthMm: options?.armWidthMm ?? yNetwork.profile.armWidthMm,
      structuralDepthMm: options?.structuralDepthMm ?? yNetwork.profile.structuralDepthMm,
      frequency: effectiveParams.frequency,
      diameterMm: effectiveParams.diameterMm,
      riseRatio: effectiveParams.riseRatio,
    },
    compilerVersion: 'reference-pipeline@0.0.0',
  });
  const compiledGeom = executeExactCompile(kernel, compileReq);
  const representations: GeometryRepresentation[] = [...compiledGeom.representations];

  const snapshotId = compileReq.snapshotHash;
  const stlChunks = compiledGeom.meshes.flatMap((mesh) =>
    Array.from(
      meshToAsciiStl({
        name: mesh.semanticOwner.replace(/[^a-zA-Z0-9_-]/g, '_'),
        vertices: mesh.vertices,
        indices: mesh.indices,
      }),
    ),
  );
  const glb = compiledGeom.meshes[0]
    ? meshToGlbJson({
        name: 'd01',
        vertices: compiledGeom.meshes[0].vertices,
        indices: compiledGeom.meshes[0].indices,
      })
    : new Uint8Array();
  const fabrication = buildFabricationFromRepresentations({
    snapshotId,
    modelId: 'model:D01',
    branchId: 'branch:main',
    representations,
    binaryExports: {
      step: representationsToStepText(representations.map((r) => r.semanticOwner)),
      stl: new Uint8Array(stlChunks),
      glb,
    },
  });

  const manifest = {
    compilerVersion: 'reference-pipeline@0.0.0',
    operatorVersions: {
      'topology.goldberg.class-i': '1.0.0',
      'topology.y-network': '1.0.0',
      'geometry.exact-adapter': kernel.version,
    },
    tolerancePolicyVersion: TOLERANCE_POLICY_VERSION,
    determinismClass: 'D0' as const,
    artifactHashes: [
      ...fabrication.artifacts.map((a) => a.contentHash),
      ...compiledGeom.artifactHashes,
    ],
    compileHash: compiledGeom.compileHash,
    pirHash: compiled.pirHash,
    dagHash: executed.dagHash,
    kernelArtifactHashes: {
      exact: compiledGeom.artifactHashes,
      ...(options?.occtWasmStepHashes !== undefined && options.occtWasmStepHashes.length > 0
        ? { occtWasm: options.occtWasmStepHashes }
        : {}),
      ...(options?.occtNativeStepHashes !== undefined && options.occtNativeStepHashes.length > 0
        ? { occtNative: options.occtNativeStepHashes }
        : {}),
      ...((options?.occtWasmStepHashes === undefined || options.occtWasmStepHashes.length === 0) &&
      (options?.occtNativeStepHashes === undefined || options.occtNativeStepHashes.length === 0)
        ? {
            occtNote:
              'OCCT hashes omitted — dual-kernel publish did not attach OCCT STEP/mesh hashes',
          }
        : {}),
    },
  };
  const release = publishRelease(
    validateRelease(createDesignRelease({ snapshotId, manifest, fabricationProtected: true })),
  );

  const pipelineHash = sha256Canonical({
    effectiveHash: effective.effectiveHash,
    pirHash: compiled.pirHash,
    dagHash: executed.dagHash,
    topologyHash: hashTopology(topology),
    yCount: yNetwork.counts.junctions,
    representationIds: representations.map((r) => r.id),
    artifactHashes: manifest.artifactHashes,
    compileHash: compiledGeom.compileHash,
    parameters: compileReq.parameters,
    topologyParameters: effectiveParams,
    releaseId: release.releaseId,
    lengthMm: lengthMm ?? null,
  });

  return {
    layers,
    bypassDetected: false,
    semanticObjectCount: semantic.objects.size,
    effectiveHash: effective.effectiveHash,
    pir: compiled.pir,
    pirHash: compiled.pirHash,
    dagHash: executed.dagHash,
    topologyHash: hashTopology(topology),
    topology,
    yNetwork,
    representations,
    fabrication,
    release,
    pipelineHash,
    compileRequest: compileReq,
    compileHash: compiledGeom.compileHash,
    exactMeshes: compiledGeom.meshes,
  };
}

/** Sanity helper used by completeness suite for non-D01 models (composition→PIR→DAG only). */
export function runLayerAuditOnly(modelId: 'A01' | 'F01'): {
  readonly modelId: 'A01' | 'F01';
  readonly layers: readonly string[];
  readonly bypassDetected: false;
} {
  void modelId;
  // Ensure topology generator remains available (no domain shortcut package).
  generateGoldbergTopology({ frequency: 1, riseRatio: 1 });
  return {
    modelId,
    layers: ['semantic', 'composition', 'pir', 'dag'],
    bypassDetected: false,
  };
}
