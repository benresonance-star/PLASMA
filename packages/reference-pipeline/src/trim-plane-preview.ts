import type { GeometryCompileOp } from '@spds/geometry-contracts';
import type { PreviewLowerer } from '@spds/preview-compiler';
import type { Vec3 } from '@spds/topology-operators';

export const TRIM_PLANE_PREVIEW_CAPABILITY = 'preview.trim-plane';

export interface TrimPlanePreviewPart {
  readonly id: string;
  readonly sourceOperationId: string;
  readonly planeOrigin: Vec3;
  readonly planeNormal: Vec3;
  readonly keep: 'positive' | 'negative';
  readonly featurePath?: string;
  readonly visibility?: 'display' | 'construction';
}

export interface TrimPlanePreviewOutput {
  readonly parts: readonly TrimPlanePreviewPart[];
}

export function createTrimPlanePreviewLowerer(): PreviewLowerer {
  return {
    capability: TRIM_PLANE_PREVIEW_CAPABILITY,
    lower: ({ operation, output }): readonly GeometryCompileOp[] => {
      const parts = (output as Partial<TrimPlanePreviewOutput> | undefined)
        ?.parts;
      if (!Array.isArray(parts)) {
        throw new Error(`${operation.id} did not produce plane trim data`);
      }
      const typedParts = parts as readonly TrimPlanePreviewPart[];
      return typedParts.map((part) => ({
        op: 'geometry.trim-plane@1.0.0',
        semanticOwner: part.id,
        pirOperationId: `${operation.id}:${part.id}`,
        sourceOperationId: part.sourceOperationId,
        planeOrigin: [
          part.planeOrigin[0],
          part.planeOrigin[1],
          part.planeOrigin[2],
        ],
        planeNormal: [
          part.planeNormal[0],
          part.planeNormal[1],
          part.planeNormal[2],
        ],
        keep: part.keep,
        featurePath: part.featurePath ?? 'trim:plane',
        ...(part.visibility !== undefined
          ? { visibility: part.visibility }
          : {}),
      }));
    },
  };
}
