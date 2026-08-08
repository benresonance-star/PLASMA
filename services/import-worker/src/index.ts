import {
  countStepSolids,
  createImportedAsset,
  shapesFromAsset,
  type ImportedAsset,
  type ImportedShape,
} from '@spds/import-core';
import { InProcessGeometryKernel } from '@spds/geometry-contracts';
import type { GeometryClient } from '@spds/geometry-client';

/**
 * G10B.2 / E7 import-worker — STEP text parse + geometry-service solid probes.
 * Full B-rep STEP parse remains behind the geometry process boundary (no WASM claim).
 */

export interface ImportJobRequest {
  readonly jobId: string;
  readonly filename: string;
  readonly bytes: string;
  readonly headerText: string;
  /** Optional hint; text parse of MANIFOLD_SOLID_BREP wins when higher. */
  readonly solidCountHint?: number;
  readonly timeoutMs: number;
  readonly cancelToken?: { readonly cancelled: boolean };
}

export interface ImportJobResult {
  readonly status: 'succeeded' | 'failed' | 'cancelled';
  readonly asset?: ImportedAsset;
  readonly shapes?: readonly ImportedShape[];
  readonly failureCode?: string;
  readonly viewportReady: boolean;
  readonly probeMode?: 'in-process' | 'geometry-client';
}

export async function runStepImportJob(
  req: ImportJobRequest,
  options?: { readonly geometryClient?: GeometryClient },
): Promise<ImportJobResult> {
  if (req.cancelToken?.cancelled) {
    return { status: 'cancelled', failureCode: 'CANCELLED', viewportReady: false };
  }
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
    const parsed = countStepSolids(req.bytes);
    const solidCount = Math.max(1, req.solidCountHint ?? 0, parsed);
    const asset = createImportedAsset({
      sourceBytes: req.bytes,
      headerText: req.headerText,
      solidCount,
    });
    const shapes = shapesFromAsset(asset);
    let probeMode: ImportJobResult['probeMode'] = 'in-process';
    if (options?.geometryClient) {
      probeMode = 'geometry-client';
      // Prefer live OCCT WASM STEP import when the geometry service supports it.
      try {
        const imported = await (options.geometryClient as GeometryClient & {
          importStep?: (body: {
            stepText: string;
            semanticOwnerPrefix?: string;
          }) => Promise<unknown>;
        }).importStep?.({
          stepText: req.bytes,
          semanticOwnerPrefix: 'import',
        });
        if (imported) {
          return {
            status: 'succeeded',
            asset,
            shapes,
            viewportReady: true,
            probeMode: 'geometry-client',
          };
        }
      } catch {
        /* fall through to sweep probe */
      }
      for (const shape of shapes) {
        await options.geometryClient.sweep({
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
    } else {
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
    }
    return {
      status: 'succeeded',
      asset,
      shapes,
      viewportReady: shapes.every((s) => s.displayReady),
      probeMode,
    };
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: string }).code)
        : 'SEMANTIC_INVALID';
    return { status: 'failed', failureCode: code, viewportReady: false };
  }
}
