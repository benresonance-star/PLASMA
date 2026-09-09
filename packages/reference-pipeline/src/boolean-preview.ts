import type { GeometryCompileOp } from '@spds/geometry-contracts';
import type { PreviewLowerer } from '@spds/preview-compiler';

export const BOOLEAN_SOLID_PREVIEW_CAPABILITY = 'preview.boolean-solid';

export interface BooleanSolidPreviewPart {
  readonly id: string;
  readonly operation: 'union' | 'cut' | 'intersect';
  readonly leftOperationId: string;
  readonly rightOperationId: string;
  readonly featurePath?: string;
  readonly visibility?: 'display' | 'construction';
}

export interface BooleanSolidPreviewOutput {
  readonly parts: readonly BooleanSolidPreviewPart[];
}

export function createBooleanSolidPreviewLowerer(): PreviewLowerer {
  return {
    capability: BOOLEAN_SOLID_PREVIEW_CAPABILITY,
    lower: ({ operation, output }): readonly GeometryCompileOp[] => {
      const parts = (output as Partial<BooleanSolidPreviewOutput> | undefined)
        ?.parts;
      if (!Array.isArray(parts)) {
        throw new Error(`${operation.id} did not produce Boolean solid data`);
      }
      const typedParts = parts as readonly BooleanSolidPreviewPart[];
      return typedParts.map((part) => ({
        op: 'geometry.boolean@1.0.0',
        semanticOwner: part.id,
        pirOperationId: `${operation.id}:${part.id}`,
        operation: part.operation,
        leftOperationId: part.leftOperationId,
        rightOperationId: part.rightOperationId,
        featurePath: part.featurePath ?? `boolean:${part.operation}`,
        ...(part.visibility !== undefined
          ? { visibility: part.visibility }
          : {}),
      }));
    },
  };
}
