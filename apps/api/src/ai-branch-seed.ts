/**
 * Seed D01 composition + compile-facing params onto a version-store branch (T0).
 * AI branch must inherit a non-empty candidate, not an empty object map.
 */

import { asPromise, type Actor, type VersionStore } from '@spds/version-core';
import { buildD01SemanticFixture } from '@spds/semantic-core';

export const PARAM_D01_LENGTH_ID = 'param:d01:length';
export const PARAM_D01_ARM_WIDTH_ID = 'param:d01:armWidth';
export const PARAM_D01_STRUCTURAL_DEPTH_ID = 'param:d01:structuralDepth';
export const PARAM_D01_FREQUENCY_ID = 'param:d01:frequency';
export const PARAM_D01_DIAMETER_ID = 'param:d01:diameter';
export const PARAM_D01_RISE_RATIO_ID = 'param:d01:riseRatio';
export const COMPOSITION_D01_ID = 'composition:d01-reference';

export const D01_SEED_LENGTH_MM = 2300;
export const D01_SEED_ARM_WIDTH_MM = 80;
export const D01_SEED_STRUCTURAL_DEPTH_MM = 120;
export const D01_SEED_FREQUENCY = 2;
export const D01_SEED_DIAMETER_MM = 20000;
export const D01_SEED_RISE_RATIO = 0.5;

const SEED_ACTOR: Actor = { type: 'system', id: 'system:d01-seed' };

function paramRecord(
  id: string,
  value: number,
  path: string,
  domain: { readonly min: number; readonly max: number },
  unit = 'mm',
): Record<string, unknown> & { id: string } {
  return {
    id,
    kind: 'Parameter',
    semanticType: 'parameter.number',
    path,
    value,
    lengthMm: path === 'lengthMm' ? value : undefined,
    quantity: { value, unit },
    domain,
    role: 'design-variable',
    editableBy: ['user', 'agent'],
    unit,
  };
}

/** Objects written before AI branch fork so createBranch clones a real substrate. */
export function buildD01SeedObjects(): readonly (Record<string, unknown> & { id: string })[] {
  const composition: Record<string, unknown> & { id: string } = {
    id: COMPOSITION_D01_ID,
    kind: 'Composition',
    semanticType: 'composition.document',
    publishedBaseId: 'pattern:goldberg-cellular-topology@1.0.0',
    publishedBaseImmutable: true,
    layers: [
      {
        layer: 'base',
        overrides: [
          { path: 'params.frequency', value: D01_SEED_FREQUENCY },
          { path: 'params.diameterMm', value: D01_SEED_DIAMETER_MM },
          { path: 'params.riseRatio', value: D01_SEED_RISE_RATIO },
        ],
      },
    ],
    objects: {
      params: {
        frequency: D01_SEED_FREQUENCY,
        diameterMm: D01_SEED_DIAMETER_MM,
        riseRatio: D01_SEED_RISE_RATIO,
      },
    },
  };

  const compileParams = [
    paramRecord(PARAM_D01_LENGTH_ID, D01_SEED_LENGTH_MM, 'lengthMm', {
      min: 500,
      max: 4000,
    }),
    paramRecord(PARAM_D01_ARM_WIDTH_ID, D01_SEED_ARM_WIDTH_MM, 'armWidthMm', {
      min: 20,
      max: 400,
    }),
    paramRecord(PARAM_D01_STRUCTURAL_DEPTH_ID, D01_SEED_STRUCTURAL_DEPTH_MM, 'structuralDepthMm', {
      min: 40,
      max: 600,
    }),
    paramRecord(PARAM_D01_FREQUENCY_ID, D01_SEED_FREQUENCY, 'frequency', { min: 1, max: 8 }, '1'),
    paramRecord(
      PARAM_D01_DIAMETER_ID,
      D01_SEED_DIAMETER_MM,
      'diameterMm',
      { min: 1, max: 100000 },
      'mm',
    ),
    paramRecord(PARAM_D01_RISE_RATIO_ID, D01_SEED_RISE_RATIO, 'riseRatio', { min: 0, max: 1 }, '1'),
  ];

  const semantic = buildD01SemanticFixture();
  const fixtureObjects = [...semantic.objects.values()].map(
    (o) => ({ ...o }) as Record<string, unknown> & { id: string },
  );

  return [composition, ...compileParams, ...fixtureObjects];
}

export async function seedD01BranchObjects(
  store: VersionStore,
  branchId: string,
): Promise<{ readonly objectCount: number; readonly headHash: string }> {
  let head = (await asPromise(store.getBranchHead(branchId))).headHash;
  const objects = buildD01SeedObjects();
  for (const object of objects) {
    const existing = await asPromise(store.getObject(branchId, object.id));
    if (existing) continue;
    const event = await asPromise(store.upsertObject(branchId, SEED_ACTOR, head, object));
    head = event.afterHash;
  }
  return { objectCount: objects.length, headHash: head };
}
