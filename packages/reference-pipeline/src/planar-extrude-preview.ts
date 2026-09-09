import type { GeometryCompileOp } from '@spds/geometry-contracts';
import type { PreviewLowerer } from '@spds/preview-compiler';
import type { Vec3 } from '@spds/topology-operators';

export const PLANAR_PROFILE_EXTRUDE_PREVIEW_CAPABILITY =
  'preview.planar-profile-extrude';

export interface PlanarProfileExtrudePreviewPart {
  readonly id: string;
  readonly profile: readonly Vec3[];
  readonly vector: Vec3;
  readonly featurePath?: string;
  readonly visibility?: 'display' | 'construction';
}

export interface PlanarProfileExtrudePreviewOutput {
  readonly parts: readonly PlanarProfileExtrudePreviewPart[];
}

function isPlanarProfileExtrudePreviewOutput(
  value: unknown,
): value is PlanarProfileExtrudePreviewOutput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Array.isArray(
    (value as Partial<PlanarProfileExtrudePreviewOutput>).parts,
  );
}

export function createPlanarProfileExtrudePreviewLowerer(): PreviewLowerer {
  return {
    capability: PLANAR_PROFILE_EXTRUDE_PREVIEW_CAPABILITY,
    lower: ({ operation, output }): readonly GeometryCompileOp[] => {
      if (!isPlanarProfileExtrudePreviewOutput(output)) {
        throw new Error(
          `${operation.id} did not produce planar profile extrusion data`,
        );
      }
      return output.parts.map((part) => ({
        op: 'geometry.extrude@1.0.0',
        semanticOwner: part.id,
        pirOperationId: `${operation.id}:${part.id}`,
        profile: part.profile.map(
          (point): [number, number, number] => [
            point[0],
            point[1],
            point[2],
          ],
        ),
        vector: [part.vector[0], part.vector[1], part.vector[2]],
        featurePath: part.featurePath ?? 'profile:extrude',
        ...(part.visibility !== undefined
          ? { visibility: part.visibility }
          : {}),
      }));
    },
  };
}
