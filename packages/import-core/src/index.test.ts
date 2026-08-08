import { describe, expect, it } from 'vitest';
import {
  addAssertion,
  countStepSolids,
  createImportedAsset,
  detectStepUnits,
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

  it('parses solid counts and conversion-based millimetre units from STEP text', () => {
    const step = `
ISO-10303-21;
HEADER;FILE_DESCRIPTION(('x'),'2;1');ENDSEC;
DATA;
#10=MANIFOLD_SOLID_BREP('A',#11);
#20=MANIFOLD_SOLID_BREP('B',#21);
#30=CONVERSION_BASED_UNIT('MILLIMETRE',#31);
ENDSEC;END-ISO-10303-21;
`;
    expect(countStepSolids(step)).toBe(2);
    expect(detectStepUnits("#30=CONVERSION_BASED_UNIT('MILLIMETRE',#31);")).toBe('mm');
    const asset = createImportedAsset({
      sourceBytes: step,
      headerText: "#30=CONVERSION_BASED_UNIT('MILLIMETRE',#31);",
    });
    expect(asset.solidCount).toBe(2);
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
