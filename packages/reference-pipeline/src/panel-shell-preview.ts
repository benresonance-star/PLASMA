import type { GeometryCompileOp } from '@spds/geometry-contracts';
import type { PreviewLowerer } from '@spds/preview-compiler';
import type { Vec3 } from '@spds/topology-operators';

export const PANEL_SHELL_PREVIEW_CAPABILITY = 'preview.panel-shell';

export interface PanelShellPreviewPanel {
  readonly id: string;
  readonly path: readonly Vec3[];
  readonly profileWidthMm: number;
  readonly profileDepthMm: number;
  readonly wallThicknessMm: number;
}

export interface PanelShellPreviewOutput {
  readonly panels: readonly PanelShellPreviewPanel[];
}

function isPanelShellPreviewOutput(value: unknown): value is PanelShellPreviewOutput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Array.isArray((value as Partial<PanelShellPreviewOutput>).panels);
}

export function createPanelShellPreviewLowerer(): PreviewLowerer {
  return {
    capability: PANEL_SHELL_PREVIEW_CAPABILITY,
    lower: ({ operation, output }): readonly GeometryCompileOp[] => {
      if (!isPanelShellPreviewOutput(output)) {
        throw new Error(`${operation.id} did not produce panel shell preview data`);
      }
      return output.panels.map((panel) => ({
        op: 'geometry.sweep@1.0.0',
        semanticOwner: panel.id,
        pirOperationId: `${operation.id}:${panel.id}`,
        path: panel.path.map((point): [number, number, number] => [point[0], point[1], point[2]]),
        profileWidthMm: panel.profileWidthMm,
        profileDepthMm: panel.profileDepthMm,
        wallThicknessMm: panel.wallThicknessMm,
        featurePath: 'panel:shell',
        profileUp: [0, 0, 1],
      }));
    },
  };
}
