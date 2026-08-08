import { describe, expect, it } from 'vitest';
import {
  assertWorldAffectorFrame,
  composeTransforms,
  parseCoordinateFrame,
  resolveImportUnits,
  translation,
} from './frames.js';

describe('G3D.1–2 coordinate frames', () => {
  it('creates frames with required roles and rejects invalid roles', () => {
    const world = parseCoordinateFrame({
      id: 'frame:world',
      role: 'WORLD',
      parentId: null,
      provenance: { source: 'system' },
    });
    expect(world.role).toBe('WORLD');
    expect(() =>
      parseCoordinateFrame({
        id: 'frame:bad',
        role: 'VIEWPORT',
        parentId: null,
        provenance: { source: 'x' },
      }),
    ).toThrow();
    assertWorldAffectorFrame(world);
  });

  it('composes nested transforms in mm and requires import unit confirmation when ambiguous', () => {
    const t = composeTransforms([
      {
        id: 't1',
        sourceFrameId: 'a',
        targetFrameId: 'b',
        matrix: translation(1000, 0, 0),
        units: 'mm',
        handedness: 'right',
        upAxis: '+Z',
        provenance: { source: 'test' },
      },
      {
        id: 't2',
        sourceFrameId: 'b',
        targetFrameId: 'c',
        matrix: translation(0, 500, 0),
        units: 'mm',
        handedness: 'right',
        upAxis: '+Z',
        provenance: { source: 'test' },
      },
    ]);
    expect(t[3]).toBe(1000);
    expect(t[7]).toBe(500);
    expect(() => resolveImportUnits({})).toThrow(/ambiguous/i);
    expect(resolveImportUnits({ detected: 'mm', confirmed: 'mm' })).toBe('mm');
  });
});
