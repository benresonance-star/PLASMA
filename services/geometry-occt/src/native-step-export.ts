import { createHash } from 'node:crypto';
import { createSpdsError } from '@spds/failure-taxonomy';
import type { OcjsModule, OcjsShape } from './occt-js.js';

/**
 * N1.7 — export a constructive OCCT solid to STEP via STEPControl_Writer.
 * fabricationReady remains false until release validation gates; AP242 PMI not claimed.
 */
export function exportShapeToStep(
  oc: OcjsModule,
  shape: OcjsShape,
  fileTag: string,
): { readonly stepText: string; readonly contentHash: string } {
  const writer = new oc.STEPControl_Writer_1();
  const mode = oc.STEPControl_StepModelType.STEPControl_AsIs;
  writer.Transfer(shape, mode, true, new oc.Message_ProgressRange_1());
  const safe = fileTag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const path = `/tmp/spds-native-${safe}-${Date.now()}.stp`;
  writer.Write(path);
  let stepText: string;
  try {
    stepText = oc.FS.readFile(path, { encoding: 'utf8' }) as string;
  } catch (err) {
    throw createSpdsError({
      code: 'GEOMETRY_INVALID',
      summary: `STEP write failed to read ${path}: ${err instanceof Error ? err.message : 'unknown'}`,
      affectedSemanticIds: [],
      recoverable: true,
    });
  } finally {
    try {
      oc.FS.unlink(path);
    } catch {
      // ignore
    }
  }
  if (!stepText.includes('ISO-10303-21') || !/MANIFOLD_SOLID_BREP|CLOSED_SHELL|ADVANCED_FACE/i.test(stepText)) {
    throw createSpdsError({
      code: 'GEOMETRY_INVALID',
      summary: 'Native STEP export produced empty or non-solid STEP',
      affectedSemanticIds: [],
      recoverable: true,
    });
  }
  // OCCT stamps FILE_NAME with wall-clock time — strip for content-addressed hashes.
  const contentHash = createHash('sha256').update(canonicalizeStepForHash(stepText)).digest('hex');
  return {
    stepText,
    contentHash,
  };
}

/** Drop volatile header fields so identical solids hash identically. */
export function canonicalizeStepForHash(stepText: string): string {
  return stepText
    .replace(/'\d{4}-\d{2}-\d{2}T[^']*'/g, "'TIMESTAMP'")
    .replace(/Open CASCADE STEP translator [\d.]+ \d+/g, 'Open CASCADE STEP translator VERSION SEQ');
}
