/**
 * Persist D01 geometry compile params on the model main branch (T9).
 * Mirrors organisation persist so substrate cold-start can rebuild without memory.
 */

import { asPromise, type Actor, type VersionStore } from '@spds/version-core';
import {
  D01_SEED_ARM_WIDTH_MM,
  D01_SEED_DIAMETER_MM,
  D01_SEED_FREQUENCY,
  D01_SEED_LENGTH_MM,
  D01_SEED_RISE_RATIO,
  D01_SEED_STRUCTURAL_DEPTH_MM,
  PARAM_D01_ARM_WIDTH_ID,
  PARAM_D01_DIAMETER_ID,
  PARAM_D01_FREQUENCY_ID,
  PARAM_D01_LENGTH_ID,
  PARAM_D01_RISE_RATIO_ID,
  PARAM_D01_STRUCTURAL_DEPTH_ID,
} from './ai-branch-seed.js';
import type { D01GeometryParams } from './d01-candidate-params.js';

const DEFAULT_ACTOR: Actor = { type: 'system', id: 'api-geometry-persist' };

function paramRecord(
  id: string,
  path: string,
  value: number,
  unit = 'mm',
  layer: 'geometry' | 'topology' = 'geometry',
): Record<string, unknown> & { id: string } {
  return {
    id,
    kind: 'Parameter',
    semanticType: 'parameter.number',
    path,
    value,
    ...(path === 'lengthMm' ? { lengthMm: value } : {}),
    quantity: { value, unit },
    role: 'design-variable',
    editableBy: ['user', 'agent'],
    unit,
    _spdsLayer: layer,
  };
}

function valueFromStored(obj: unknown): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const r = obj as Record<string, unknown>;
  if (typeof r.value === 'number' && Number.isFinite(r.value)) return r.value;
  if (typeof r.lengthMm === 'number' && Number.isFinite(r.lengthMm)) return r.lengthMm;
  return undefined;
}

/** Read compile params from main-branch snapshot (seed defaults when absent). */
export async function loadGeometryFromStore(
  store: VersionStore,
  modelId: string,
): Promise<D01GeometryParams> {
  const branchId = store.getMainBranchId(modelId);
  try {
    const objects = await asPromise(store.listObjects(branchId));
    const byId = new Map(objects.map((o) => [String((o as { id?: string }).id), o]));
    return {
      lengthMm: valueFromStored(byId.get(PARAM_D01_LENGTH_ID)) ?? D01_SEED_LENGTH_MM,
      armWidthMm: valueFromStored(byId.get(PARAM_D01_ARM_WIDTH_ID)) ?? D01_SEED_ARM_WIDTH_MM,
      structuralDepthMm:
        valueFromStored(byId.get(PARAM_D01_STRUCTURAL_DEPTH_ID)) ?? D01_SEED_STRUCTURAL_DEPTH_MM,
      frequency: valueFromStored(byId.get(PARAM_D01_FREQUENCY_ID)) ?? D01_SEED_FREQUENCY,
      diameterMm: valueFromStored(byId.get(PARAM_D01_DIAMETER_ID)) ?? D01_SEED_DIAMETER_MM,
      riseRatio: valueFromStored(byId.get(PARAM_D01_RISE_RATIO_ID)) ?? D01_SEED_RISE_RATIO,
    };
  } catch {
    return {
      lengthMm: D01_SEED_LENGTH_MM,
      armWidthMm: D01_SEED_ARM_WIDTH_MM,
      structuralDepthMm: D01_SEED_STRUCTURAL_DEPTH_MM,
      frequency: D01_SEED_FREQUENCY,
      diameterMm: D01_SEED_DIAMETER_MM,
      riseRatio: D01_SEED_RISE_RATIO,
    };
  }
}

/** Upsert D01 geometry params onto the model's main branch. */
export async function persistGeometrySnapshot(
  store: VersionStore,
  modelId: string,
  params: D01GeometryParams,
  actor: Actor = DEFAULT_ACTOR,
): Promise<void> {
  const branchId = store.getMainBranchId(modelId);
  let head = (await asPromise(store.getBranchHead(branchId))).headHash;
  const records = [
    paramRecord(PARAM_D01_LENGTH_ID, 'lengthMm', params.lengthMm),
    paramRecord(PARAM_D01_ARM_WIDTH_ID, 'armWidthMm', params.armWidthMm),
    paramRecord(PARAM_D01_STRUCTURAL_DEPTH_ID, 'structuralDepthMm', params.structuralDepthMm),
    paramRecord(PARAM_D01_FREQUENCY_ID, 'frequency', params.frequency, '1', 'topology'),
    paramRecord(PARAM_D01_DIAMETER_ID, 'diameterMm', params.diameterMm, 'mm', 'topology'),
    paramRecord(PARAM_D01_RISE_RATIO_ID, 'riseRatio', params.riseRatio, '1', 'topology'),
  ];
  for (const object of records) {
    try {
      const event = await asPromise(store.upsertObject(branchId, actor, head, object));
      head = event.afterHash;
    } catch {
      head = (await asPromise(store.getBranchHead(branchId))).headHash;
      const event = await asPromise(store.upsertObject(branchId, actor, head, object));
      head = event.afterHash;
    }
  }
}
