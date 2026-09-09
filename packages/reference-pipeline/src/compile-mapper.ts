import { parseGeometryCompileRequest, type GeometryCompileRequest } from '@spds/geometry-contracts';
import { sha256Canonical } from '@spds/reproducibility';
import { deriveYComponentArmSegments, type YNetwork } from '@spds/topology-operators';

/**
 * Map D01 Y-network + schema parameters → GeometryCompileRequest.
 * Length comes from parameters.lengthMm (schema), not a post-PIR side-channel.
 */
export function mapYNetworkToCompileRequest(input: {
  readonly yNetwork: YNetwork;
  readonly pirHash: string;
  readonly dagHash: string;
  readonly yLimit?: number;
  readonly lengthMm?: number;
  readonly armWidthMm?: number;
  readonly structuralDepthMm?: number;
  readonly topologyParameters?: {
    readonly frequency: number;
    readonly diameterMm: number;
    readonly riseRatio: number;
  };
  readonly compilerVersion?: string;
}): GeometryCompileRequest {
  const limit = input.yLimit ?? 10;
  const retained = input.yNetwork.components.filter((c) => c.trim === 'retained').slice(0, limit);

  const lengthMm = input.lengthMm;
  const armWidthMm = input.armWidthMm ?? input.yNetwork.profile.armWidthMm;
  const structuralDepthMm = input.structuralDepthMm ?? input.yNetwork.profile.structuralDepthMm;
  const wallThicknessMm = input.yNetwork.profile.wallThicknessMm;

  const ops = retained.flatMap((component) => {
    return deriveYComponentArmSegments(component, lengthMm).map((segment) => {
      return {
        op: 'geometry.sweep@1.0.0' as const,
        semanticOwner: component.id,
        pirOperationId: `pir:y-brep:${segment.id}`,
        path: [
          [segment.a[0], segment.a[1], segment.a[2]],
          [segment.b[0], segment.b[1], segment.b[2]],
        ],
        profileWidthMm: armWidthMm,
        profileDepthMm: structuralDepthMm,
        wallThicknessMm,
        featurePath: segment.featurePath,
        profileUp: [
          component.frame.normal[0],
          component.frame.normal[1],
          component.frame.normal[2],
        ],
      };
    });
  });

  const parameters: Record<string, number> = {};
  if (lengthMm !== undefined) parameters.lengthMm = lengthMm;
  parameters.armWidthMm = armWidthMm;
  parameters.structuralDepthMm = structuralDepthMm;
  if (input.topologyParameters) {
    parameters.frequency = input.topologyParameters.frequency;
    parameters.diameterMm = input.topologyParameters.diameterMm;
    parameters.riseRatio = input.topologyParameters.riseRatio;
  }

  const snapshotHash = `snapshot:d01:${sha256Canonical({
    pir: input.pirHash,
    params: parameters,
  }).slice(0, 12)}`;

  return parseGeometryCompileRequest({
    snapshotHash,
    pirHash: input.pirHash,
    dagHash: input.dagHash,
    compilerVersion: input.compilerVersion ?? 'reference-pipeline@0.0.0',
    parameters,
    ops,
  });
}
