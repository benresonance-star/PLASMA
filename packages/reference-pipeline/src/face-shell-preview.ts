import type { GeometryCompileOp } from '@spds/geometry-contracts';
import type { PreviewLowerer } from '@spds/preview-compiler';

export const FACE_SHELL_PREVIEW_CAPABILITY = 'preview.face-shell';

export interface FaceShellPreviewPart {
  readonly id: string;
  readonly sourceOperationId: string;
  readonly removedFacePaths: readonly string[];
  readonly thicknessMm: number;
  readonly inward?: boolean;
  readonly featurePath?: string;
  readonly visibility?: 'display' | 'construction';
}

export interface FaceShellPreviewOutput {
  readonly parts: readonly FaceShellPreviewPart[];
}

export function createFaceShellPreviewLowerer(): PreviewLowerer {
  return {
    capability: FACE_SHELL_PREVIEW_CAPABILITY,
    lower: ({ operation, output }): readonly GeometryCompileOp[] => {
      const parts = (output as Partial<FaceShellPreviewOutput> | undefined)
        ?.parts;
      if (!Array.isArray(parts)) {
        throw new Error(`${operation.id} did not produce face shell data`);
      }
      return (parts as readonly FaceShellPreviewPart[]).map((part) => ({
        op: 'geometry.face-shell@1.0.0',
        semanticOwner: part.id,
        pirOperationId: `${operation.id}:${part.id}`,
        sourceOperationId: part.sourceOperationId,
        removedFacePaths: [...part.removedFacePaths],
        thicknessMm: part.thicknessMm,
        inward: part.inward ?? true,
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
