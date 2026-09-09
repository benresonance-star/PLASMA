import { describe, expect, it } from 'vitest';
import {
  D01_SEED_ARM_WIDTH_MM,
  D01_SEED_DIAMETER_MM,
  D01_SEED_FREQUENCY,
  D01_SEED_LENGTH_MM,
  D01_SEED_RISE_RATIO,
  COMPOSITION_D01_ID,
  PARAM_D01_ARM_WIDTH_ID,
  PARAM_D01_LENGTH_ID,
  PARAM_D01_STRUCTURAL_DEPTH_ID,
} from './ai-branch-seed.js';
import { extractD01GeometryParams } from './d01-candidate-params.js';

describe('extractD01GeometryParams', () => {
  it('reads value fields and falls back to seeds', () => {
    const defaults = extractD01GeometryParams({});
    expect(defaults.lengthMm).toBe(D01_SEED_LENGTH_MM);
    expect(defaults.armWidthMm).toBe(D01_SEED_ARM_WIDTH_MM);

    const custom = extractD01GeometryParams({
      [PARAM_D01_LENGTH_ID]: { id: PARAM_D01_LENGTH_ID, value: 2000 },
      [PARAM_D01_ARM_WIDTH_ID]: { id: PARAM_D01_ARM_WIDTH_ID, value: 90 },
      [PARAM_D01_STRUCTURAL_DEPTH_ID]: {
        id: PARAM_D01_STRUCTURAL_DEPTH_ID,
        quantity: { value: 150, unit: 'mm' },
      },
    });
    expect(custom).toEqual({
      lengthMm: 2000,
      armWidthMm: 90,
      structuralDepthMm: 150,
      frequency: D01_SEED_FREQUENCY,
      diameterMm: D01_SEED_DIAMETER_MM,
      riseRatio: D01_SEED_RISE_RATIO,
    });
  });

  it('prefers authoritative composition topology parameters', () => {
    const params = extractD01GeometryParams({
      [COMPOSITION_D01_ID]: {
        id: COMPOSITION_D01_ID,
        objects: {
          params: {
            frequency: 3,
            diameterMm: 17750,
            riseRatio: 0.6,
          },
        },
      },
    });
    expect(params).toMatchObject({
      frequency: 3,
      diameterMm: 17750,
      riseRatio: 0.6,
    });
  });
});
