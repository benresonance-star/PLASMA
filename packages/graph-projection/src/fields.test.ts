import { describe, expect, it } from 'vitest';
import { FIELD_GRID_SIZE, projectFieldInfluence } from './fields.js';

describe('E1a projectFieldInfluence', () => {
  it('emits finite 64² values with stable field id', () => {
    const a = projectFieldInfluence('field:d01:distance', ['component:y:0000', 'component:y:0001']);
    const b = projectFieldInfluence('field:d01:distance', ['component:y:0001', 'component:y:0000']);
    expect(a.primaryId).toBe('field:d01:distance');
    expect(a.overlay.fieldId).toBe('field:d01:distance');
    expect(a.overlay.width).toBe(FIELD_GRID_SIZE);
    expect(a.overlay.height).toBe(FIELD_GRID_SIZE);
    expect(a.overlay.sampleGridSize).toBe(64);
    expect(a.overlay.values).toHaveLength(64 * 64);
    expect(a.overlay.values.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    expect(a.overlay.values).toEqual(b.overlay.values);
    expect(a.secondaryIds).toEqual(['component:y:0000', 'component:y:0001']);
    expect(a.overlay.influenceIds).toEqual(a.secondaryIds);

    const t0 = performance.now();
    for (let i = 0; i < 20; i += 1) {
      projectFieldInfluence(`field:bench:${i % 3}`, ['component:y:0000']);
    }
    expect((performance.now() - t0) / 20).toBeLessThan(5);
  });
});
