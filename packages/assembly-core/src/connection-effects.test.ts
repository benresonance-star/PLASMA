import { describe, expect, it } from 'vitest';
import {
  applyConnectionChange,
  emptyConnectionEffectState,
  removeConnection,
} from './connection-effects.js';

describe('G11 connection → holes/BOM/geometry dirty gate', () => {
  it('updates holes and BOM when connection changes, and clears on remove', () => {
    let state = emptyConnectionEffectState();
    state = applyConnectionChange({
      state,
      connectionId: 'conn:1',
      plateInstanceIds: ['plate:a', 'plate:b'],
      fastenerId: 'fast:M12x40',
      holeCountPerPlate: 2,
    });
    expect(state.holes).toHaveLength(4);
    expect(state.bom.some((b) => b.kind === 'fastener' && b.quantity === 4)).toBe(true);
    expect(state.bom.some((b) => b.kind === 'hole-operation')).toBe(true);
    expect(state.geometryDirtyIds).toEqual(
      expect.arrayContaining(['plate:a', 'plate:b', 'hole:conn:1:plate:a:0']),
    );

    state = applyConnectionChange({
      state,
      connectionId: 'conn:1',
      plateInstanceIds: ['plate:a', 'plate:b'],
      fastenerId: 'fast:M16x50',
      holeCountPerPlate: 1,
    });
    expect(state.holes).toHaveLength(2);
    expect(state.bom.find((b) => b.kind === 'fastener')?.itemId).toBe('fast:M16x50');
    expect(state.bom.find((b) => b.kind === 'fastener')?.quantity).toBe(2);

    state = removeConnection({
      state,
      connectionId: 'conn:1',
      plateInstanceIds: ['plate:a', 'plate:b'],
    });
    expect(state.holes).toHaveLength(0);
    expect(state.bom).toHaveLength(0);
    expect(state.geometryDirtyIds).toEqual(['plate:a', 'plate:b']);
  });
});
