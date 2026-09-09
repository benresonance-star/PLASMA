import type { GeometryCompileOp } from '@spds/geometry-contracts';
import type { PreviewLowerer } from '@spds/preview-compiler';

export const EDGE_MODIFIER_PREVIEW_CAPABILITY = 'preview.edge-modifier';

interface EdgeModifierPreviewPartBase {
  readonly id: string;
  readonly sourceOperationId: string;
  readonly edgePaths: readonly string[];
  readonly featurePath?: string;
  readonly visibility?: 'display' | 'construction';
}

export interface EdgeFilletPreviewPart extends EdgeModifierPreviewPartBase {
  readonly modifier: 'fillet';
  readonly radiusMm: number;
}

export interface EdgeChamferPreviewPart extends EdgeModifierPreviewPartBase {
  readonly modifier: 'chamfer';
  readonly distanceMm: number;
}

export type EdgeModifierPreviewPart =
  | EdgeFilletPreviewPart
  | EdgeChamferPreviewPart;

export interface EdgeModifierPreviewOutput {
  readonly parts: readonly EdgeModifierPreviewPart[];
}

export function createEdgeModifierPreviewLowerer(): PreviewLowerer {
  return {
    capability: EDGE_MODIFIER_PREVIEW_CAPABILITY,
    lower: ({ operation, output }): readonly GeometryCompileOp[] => {
      const parts = (output as Partial<EdgeModifierPreviewOutput> | undefined)
        ?.parts;
      if (!Array.isArray(parts)) {
        throw new Error(`${operation.id} did not produce edge modifier data`);
      }
      return (parts as readonly EdgeModifierPreviewPart[]).map((part) => {
        const base = {
          semanticOwner: part.id,
          pirOperationId: `${operation.id}:${part.id}`,
          sourceOperationId: part.sourceOperationId,
          edgePaths: [...part.edgePaths],
          ...(part.featurePath !== undefined
            ? { featurePath: part.featurePath }
            : {}),
          ...(part.visibility !== undefined
            ? { visibility: part.visibility }
            : {}),
        };
        switch (part.modifier) {
          case 'fillet':
            return {
              ...base,
              op: 'geometry.edge-fillet@1.0.0',
              radiusMm: part.radiusMm,
            };
          case 'chamfer':
            return {
              ...base,
              op: 'geometry.edge-chamfer@1.0.0',
              distanceMm: part.distanceMm,
            };
          default: {
            const exhaustive: never = part;
            return exhaustive;
          }
        }
      });
    },
  };
}
