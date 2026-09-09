/**
 * Extract D01 geometry compile knobs from a txn candidate object map (T2a).
 */

import {
  D01_SEED_ARM_WIDTH_MM,
  D01_SEED_DIAMETER_MM,
  D01_SEED_FREQUENCY,
  D01_SEED_LENGTH_MM,
  D01_SEED_RISE_RATIO,
  D01_SEED_STRUCTURAL_DEPTH_MM,
  COMPOSITION_D01_ID,
  PARAM_D01_ARM_WIDTH_ID,
  PARAM_D01_DIAMETER_ID,
  PARAM_D01_FREQUENCY_ID,
  PARAM_D01_LENGTH_ID,
  PARAM_D01_RISE_RATIO_ID,
  PARAM_D01_STRUCTURAL_DEPTH_ID,
} from './ai-branch-seed.js';

export interface D01GeometryParams {
  readonly lengthMm: number;
  readonly armWidthMm: number;
  readonly structuralDepthMm: number;
  readonly frequency: number;
  readonly diameterMm: number;
  readonly riseRatio: number;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function valueFromObject(obj: unknown): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const record = obj as Record<string, unknown>;
  const direct = finiteNumber(record.value);
  if (direct !== undefined) return direct;
  const lengthMm = finiteNumber(record.lengthMm);
  if (lengthMm !== undefined) return lengthMm;
  const quantity = record.quantity;
  if (quantity && typeof quantity === 'object') {
    return finiteNumber((quantity as { value?: unknown }).value);
  }
  return undefined;
}

function compositionParams(obj: unknown): Readonly<Record<string, unknown>> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const composition = obj as Record<string, unknown>;
  const objects = composition.objects;
  if (!objects || typeof objects !== 'object' || Array.isArray(objects)) return {};
  const params = (objects as Record<string, unknown>).params;
  if (!params || typeof params !== 'object' || Array.isArray(params)) return {};
  return params as Record<string, unknown>;
}

/** Read compile params from candidate.objects (seed defaults when absent). */
export function extractD01GeometryParams(
  objects: Readonly<Record<string, unknown>>,
): D01GeometryParams {
  const topology = compositionParams(objects[COMPOSITION_D01_ID]);
  const frequency =
    finiteNumber(topology.frequency) ?? valueFromObject(objects[PARAM_D01_FREQUENCY_ID]);
  return {
    lengthMm: valueFromObject(objects[PARAM_D01_LENGTH_ID]) ?? D01_SEED_LENGTH_MM,
    armWidthMm: valueFromObject(objects[PARAM_D01_ARM_WIDTH_ID]) ?? D01_SEED_ARM_WIDTH_MM,
    structuralDepthMm:
      valueFromObject(objects[PARAM_D01_STRUCTURAL_DEPTH_ID]) ?? D01_SEED_STRUCTURAL_DEPTH_MM,
    frequency:
      frequency !== undefined && Number.isInteger(frequency) && frequency > 0
        ? frequency
        : D01_SEED_FREQUENCY,
    diameterMm:
      finiteNumber(topology.diameterMm) ??
      valueFromObject(objects[PARAM_D01_DIAMETER_ID]) ??
      D01_SEED_DIAMETER_MM,
    riseRatio:
      finiteNumber(topology.riseRatio) ??
      valueFromObject(objects[PARAM_D01_RISE_RATIO_ID]) ??
      D01_SEED_RISE_RATIO,
  };
}
