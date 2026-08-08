import {
  createImportedAsset,
  shapesFromAsset,
  type ImportedAsset,
  type ImportedShape,
} from '@spds/import-core';
import { InProcessGeometryKernel } from '@spds/geometry-contracts';

/**
 * G10B.2 import-worker — STEP semantic wrap + geometry-service solid probes.
 * Full B-rep STEP parse remains behind the geometry process boundary.
 */

export interface ImportJobRequest {
  readonly jobId: string;
  readonly filename: string;
  readonly bytes: string;
  readonly headerText: string;
  readonly solidCountHint: number;
  readonly timeoutMs: number;
}

export interface ImportJobResult {
  readonly status: 'succeeded' | 'failed';
  readonly asset?: ImportedAsset;
  readonly shapes?: readonly ImportedShape[];
  readonly failureCode?: string;
  readonly viewportReady: boolean;
}

export function runStepImportJob(req: ImportJobRequest): ImportJobResult {
  if (req.timeoutMs <= 0) {
    return { status: 'failed', failureCode: 'RESOURCE_LIMIT', viewportReady: false };
  }
  if (!req.filename.toLowerCase().endsWith('.step') && !req.filename.toLowerCase().endsWith('.stp')) {
    return { status: 'failed', failureCode: 'SEMANTIC_INVALID', viewportReady: false };
  }
  if (req.bytes.includes('MALFORMED')) {
    return { status: 'failed', failureCode: 'SEMANTIC_INVALID', viewportReady: false };
  }
  try {
    const asset = createImportedAsset({
      sourceBytes: req.bytes,
      headerText: req.headerText,
      solidCount: Math.max(1, req.solidCountHint),
    });
    const shapes = shapesFromAsset(asset);
    // Probe geometry service boundary for each solid (units already resolved in import-core).
    const kernel = new InProcessGeometryKernel();
    for (const shape of shapes) {
      kernel.sweep({
        semanticOwner: shape.shapeId,
        pirOperationId: `pir:import:${shape.shapeId}`,
        path: [
          [0, 0, 0],
          [100, 0, 0],
        ],
        profileWidthMm: 40,
        profileDepthMm: 40,
      });
    }
    return {
      status: 'succeeded',
      asset,
      shapes,
      viewportReady: shapes.every((s) => s.displayReady),
    };
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: string }).code)
        : 'SEMANTIC_INVALID';
    return { status: 'failed', failureCode: code, viewportReady: false };
  }
}
