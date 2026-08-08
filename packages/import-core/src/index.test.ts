import { describe, expect, it } from 'vitest';
import {
  addAssertion,
  createImportedAsset,
  openSemanticisationSession,
  placeImportedInAssembly,
  shapesFromAsset,
} from './index.js';

describe('G10B import-core', () => {
  it('imports STEP with units and reference-only claim', () => {
    const asset = createImportedAsset({
      sourceBytes: 'ISO-10303-21;...',
      headerText: 'LENGTH_UNIT() SI_UNIT(.MILLI.,.METRE.)',
      solidCount: 2,
    });
    expect(asset.units).toBe('mm');
    expect(asset.parametricClaim).toBe('reference-only');
    expect(shapesFromAsset(asset)).toHaveLength(2);
  });

  it('throws IMPORT_UNIT_AMBIGUOUS when units unclear', () => {
    expect(() =>
      createImportedAsset({
        sourceBytes: 'x',
        headerText: 'no units here',
        solidCount: 1,
      }),
    ).toThrow(/IMPORT_UNIT_AMBIGUOUS|ambiguous/i);
  });

  it('records assertions and assembly placement without inventing history', () => {
    const asset = createImportedAsset({
      sourceBytes: 'step',
      headerText: 'SI_UNIT(.MILLI.,.METRE.)',
      solidCount: 1,
    });
    let session = openSemanticisationSession(asset.assetId);
    session = addAssertion(session, {
      shapeId: `${asset.assetId}/solid:0`,
      assertedType: 'Plate',
      material: 'S355',
      role: 'flange',
      actor: 'user',
    });
    expect(session.assertions).toHaveLength(1);
    const placed = placeImportedInAssembly({
      asset,
      instanceId: 'inst:imp1',
      frameId: 'frame:world',
    });
    expect(placed.parametricClaim).toBe('reference-only');
  });
});
