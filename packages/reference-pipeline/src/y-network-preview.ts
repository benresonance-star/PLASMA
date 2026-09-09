import type { GeometryCompileOp } from '@spds/geometry-contracts';
import type { PreviewLowerer } from '@spds/preview-compiler';
import { deriveYComponentArmSegments, type YNetwork } from '@spds/topology-operators';

export const Y_NETWORK_PREVIEW_CAPABILITY = 'preview.y-network-members';

function isYNetwork(value: unknown): value is YNetwork {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const network = value as Partial<YNetwork>;
  return Array.isArray(network.components) && Boolean(network.profile);
}

export function createYNetworkPreviewLowerer(options?: {
  readonly componentLimit?: number;
}): PreviewLowerer {
  return {
    capability: Y_NETWORK_PREVIEW_CAPABILITY,
    lower: ({ operation, output, parameters }): readonly GeometryCompileOp[] => {
      if (!isYNetwork(output)) {
        throw new Error(`${operation.id} did not produce a YNetwork`);
      }
      const retained = output.components
        .filter((component) => component.trim === 'retained')
        .slice(0, options?.componentLimit ?? 10);
      const width = parameters.armWidthMm ?? output.profile.armWidthMm;
      const depth = parameters.structuralDepthMm ?? output.profile.structuralDepthMm;
      const lengthOverride = parameters.lengthMm;

      return retained.flatMap((component) =>
        deriveYComponentArmSegments(component, lengthOverride).map((segment) => {
          return {
            op: 'geometry.sweep@1.0.0',
            semanticOwner: component.id,
            pirOperationId: `${operation.id}:${segment.id}`,
            path: [
              [segment.a[0], segment.a[1], segment.a[2]],
              [segment.b[0], segment.b[1], segment.b[2]],
            ],
            profileWidthMm: width,
            profileDepthMm: depth,
            wallThicknessMm: output.profile.wallThicknessMm,
            featurePath: segment.featurePath,
            profileUp: [
              component.frame.normal[0],
              component.frame.normal[1],
              component.frame.normal[2],
            ],
          };
        }),
      );
    },
  };
}
