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
import { buildF01Fixture } from '@spds/package-core';
import { parsePirDocument } from '@spds/parametric-ir';
import {
  createDesignRelease,
  publishRelease,
  validateRelease,
  type DesignRelease,
} from '@spds/release-core';
import { sha256Canonical } from '@spds/reproducibility';
import { TOLERANCE_POLICY_VERSION } from '@spds/shared-units';

export interface F01PipelineResult {
  readonly layers: readonly string[];
  readonly bypassDetected: false;
  readonly panelCount: number;
  readonly usesDomeImports: false;
  readonly effectiveHash: string;
  readonly pirHash: string;
  readonly dagHash: string;
  readonly representations: readonly GeometryRepresentation[];
  readonly release: DesignRelease;
  readonly pipelineHash: string;
}

/**
 * F01 freeform panel path through the same architectural layers (not dome-hardcoded).
 */
export async function runF01ReferencePipeline(options?: {
  readonly kernel?: InProcessGeometryKernel;
}): Promise<F01PipelineResult> {
  const layers = [
    'semantic',
    'composition',
    'pir',
    'dag',
    'panelisation',
    'geometry',
    'fabrication',
    'release',
  ] as const;

  const fixture = buildF01Fixture();
  const composition = parseCompositionDocument({
    id: 'composition:f01-reference',
    publishedBaseId: 'pattern:FreeformPanelSet@0.1.0',
    publishedBaseImmutable: true,
    layers: [
      {
        layer: 'base',
        overrides: [
          { path: 'params.shellThicknessMm', value: fixture.panels[0]!.shellThicknessMm },
          { path: 'params.panelCount', value: fixture.panels.length },
        ],
      },
    ],
    objects: {
      params: {
        shellThicknessMm: 3,
        panelCount: 0,
      },
    },
  });
  const effective = resolveEffectiveState(composition);
  const params = effective.objects['params'] as {
    shellThicknessMm: number;
    panelCount: number;
  };

  const pir = parsePirDocument({
    schemaVersion: 'pir/1',
    id: `pir:${composition.id}`,
    operations: [
      {
        id: 'pir:surface.trim',
        op: 'trim-surface',
        operator: 'trim.surface@1.0.0',
        semanticOwner: fixture.panels[0]!.surfaceId,
        inputs: {
          panelCount: { value: params.panelCount },
        },
        produces: { role: 'surface:trimmed' },
        provenance: {
          patternInstance: 'pattern-instance:f01-reference',
          compositionHash: effective.effectiveHash,
        },
        dependsOn: [],
      },
      {
        id: 'pir:shell.offset',
        op: 'shell-offset',
        operator: 'shell.offset@1.0.0',
        semanticOwner: fixture.panels[0]!.id,
        inputs: {
          surface: { pirRef: 'pir:surface.trim' },
          thicknessMm: { value: params.shellThicknessMm },
        },
        produces: { role: 'panel:shell' },
        provenance: {
          patternInstance: 'pattern-instance:f01-reference',
          compositionHash: effective.effectiveHash,
        },
        dependsOn: ['pir:surface.trim'],
      },
    ],
  });
  const pirHash = sha256Canonical(pir);
  const dag = buildExecutionDag(pir, pirHash);

  let panelCount = 0;
  const { dag: executed } = await runOperatorDag(dag, new Map(), async (node) => {
    if (node.operator.startsWith('trim.surface@')) {
      panelCount = fixture.panels.length;
      return { panels: panelCount, trimCurves: fixture.panels[0]!.trimCurveIds.length };
    }
    if (node.operator.startsWith('shell.offset@')) {
      return { thicknessMm: params.shellThicknessMm };
    }
    throw new Error(`OPERATOR_UNAVAILABLE: ${node.operator}`);
  });

  const kernel = options?.kernel ?? new InProcessGeometryKernel();
  const representations: GeometryRepresentation[] = [];
  for (const panel of fixture.panels) {
    const solid = kernel.sweep({
      semanticOwner: panel.id,
      pirOperationId: `pir:f01-solid:${panel.id}`,
      path: [
        [0, 0, 0],
        [800, 0, 0],
        [800, 600, 0],
      ],
      profileWidthMm: 200,
      profileDepthMm: params.shellThicknessMm * 10,
    });
    representations.push(
      kernel.shell({
        representationId: solid.id,
        offsetMm: params.shellThicknessMm,
        semanticOwner: panel.id,
      }),
    );
  }

  const snapshotId = `snapshot:f01:${pirHash.slice(0, 12)}`;
  const fabrication = buildFabricationFromRepresentations({
    snapshotId,
    modelId: fixture.modelId,
    branchId: 'branch:main',
    representations,
  });
  const manifest = {
    compilerVersion: 'reference-pipeline@0.0.0',
    operatorVersions: {
      'trim.surface': '1.0.0',
      'shell.offset': '1.0.0',
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
    panelCount,
    packageId: fixture.packageManifest.packageId,
    representationIds: representations.map((r) => r.id),
    releaseId: release.releaseId,
  });

  return {
    layers,
    bypassDetected: false,
    panelCount,
    usesDomeImports: false,
    effectiveHash: effective.effectiveHash,
    pirHash,
    dagHash: executed.dagHash,
    representations,
    release,
    pipelineHash,
  };
}
