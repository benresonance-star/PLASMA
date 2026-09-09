import type { GeometryCompileOp } from '@spds/geometry-contracts';
import type { PreviewLowerer } from '@spds/preview-compiler';

type Vec3 = readonly [number, number, number];

export const FACE_DRAFT_PREVIEW_CAPABILITY = 'preview.face-draft';

export interface FaceDraftPreviewPart {
  readonly id: string;
  readonly sourceOperationId: string;
  readonly selectedFacePaths: readonly string[];
  readonly pullDirection: Vec3;
  readonly neutralPlaneOrigin: Vec3;
  readonly neutralPlaneNormal: Vec3;
  readonly angleDeg: number;
  readonly reverse?: boolean;
  readonly featurePath?: string;
  readonly visibility?: 'display' | 'construction';
}

export interface FaceDraftPreviewOutput {
  readonly parts: readonly FaceDraftPreviewPart[];
}

export function createFaceDraftPreviewLowerer(): PreviewLowerer {
  return {
    capability: FACE_DRAFT_PREVIEW_CAPABILITY,
    lower: ({ operation, output }): readonly GeometryCompileOp[] => {
      const parts = (output as Partial<FaceDraftPreviewOutput> | undefined)
        ?.parts;
      if (!Array.isArray(parts)) {
        throw new Error(`${operation.id} did not produce face draft data`);
      }
      return (parts as readonly FaceDraftPreviewPart[]).map((part) => ({
        op: 'geometry.face-draft@1.0.0',
        semanticOwner: part.id,
        pirOperationId: `${operation.id}:${part.id}`,
        sourceOperationId: part.sourceOperationId,
        selectedFacePaths: [...part.selectedFacePaths],
        pullDirection: [...part.pullDirection],
        neutralPlaneOrigin: [...part.neutralPlaneOrigin],
        neutralPlaneNormal: [...part.neutralPlaneNormal],
        angleDeg: part.angleDeg,
        reverse: part.reverse ?? false,
        ...(part.featurePath !== undefined
          ? { featurePath: part.featurePath }
          : {}),
        ...(part.visibility !== undefined
          ? { visibility: part.visibility }
          : {}),
      }));
    },
  };
}
