import { describe, expect, it } from 'vitest';
import {
  applyWallOperation,
  createWallFixture,
  deriveWall,
  validateWall,
  wallSourceHash,
} from './index.js';

describe('Wall stage 1 — analytic feature evidence, not exact acceptance', () => {
  it('creates a two-layer wall with an exact system pin and named dimensions', () => {
    const wall = applyWallOperation(
      undefined,
      { type: 'CreateWall', wall: createWallFixture() },
      'head:base',
    );
    expect(wall.createdRevision).toBe('head:base');
    expect(wall.systemRef.version).toBe('0.1.0');
    const out = deriveWall(wall);
    expect(out.plan[0]!.points).toEqual([
      [0, -80],
      [4000, -80],
      [4000, 60],
      [0, 60],
    ]);
    expect(out.quantities.map((q) => q.netVolumeM3)).toEqual([1.512, 0.216]);
    expect(out.issueReady).toBe(false);
    expect(out.fidelity).toBe('analytical-preview');
  });
  it('edits named layers, height, base, offset and terminal length without changing identities', () => {
    const base = createWallFixture();
    const wall = applyWallOperation(
      base,
      {
        type: 'SetWallParameters',
        wallId: base.id,
        parameters: {
          terminalLengthMm: 5000,
          heightMm: 3000,
          baseElevationMm: 200,
          lateralOffsetMm: 100,
          layers: [{ id: base.layers[0]!.id, thicknessMm: 180 }],
        },
      },
      'head:1',
    );
    expect(wall.layers.map((l) => l.id)).toEqual(base.layers.map((l) => l.id));
    expect(wall.layers[0]!.topMm).toBe(3000);
    const out = deriveWall(wall);
    expect(out.parts[0]!.bottomMm).toBe(200);
    expect(out.parts[0]!.topMm).toBe(3200);
    expect(out.plan[0]!.points).toEqual([
      [0, 0],
      [5000, 0],
      [5000, 180],
      [0, 180],
    ]);
    expect(out.quantities[0]!.netVolumeM3).toBe(2.7);
    expect(base.heightMm).toBe(2700);
  });
  it('rejects total-thickness writes, duplicate layer writers and non-finite dimensions', () => {
    const wall = createWallFixture();
    expect(() =>
      applyWallOperation(
        wall,
        { type: 'SetWallParameters', wallId: wall.id, parameters: { totalThicknessMm: 500 } },
        'h',
      ),
    ).toThrow();
    expect(() =>
      applyWallOperation(
        wall,
        {
          type: 'SetWallParameters',
          wallId: wall.id,
          parameters: {
            layers: [
              { id: wall.layers[0]!.id, thicknessMm: 150 },
              { id: wall.layers[0]!.id, thicknessMm: 160 },
            ],
          },
        },
        'h',
      ),
    ).toThrow(/one active/);
    expect(() => validateWall({ ...wall, heightMm: NaN })).toThrow();
    expect(() => validateWall({ ...wall, heightMm: 0 })).toThrow();
  });
  it('represents connected polylines but leaves junction quantities explicitly unresolved', () => {
    const wall = createWallFixture();
    wall.segments.push({ id: 's:2', start: [4000, 0], end: [4000, 2000] });
    const out = deriveWall(wall);
    expect(out.plan).toHaveLength(4);
    expect(out.quantities[0]!.netVolumeM3).toBeCloseTo(2.268);
    expect(out.unresolved.join(' ')).toContain('junction allocation unresolved');
    expect(() =>
      validateWall({
        ...wall,
        segments: [wall.segments[0], { id: 'gap', start: [5000, 0], end: [5000, 2000] }],
      }),
    ).toThrow(/connected/);
  });
  it('preserves the physical layer faces, identities and fixed-jamb intent when reversing paths', () => {
    let wall = createWallFixture();
    wall.lateralOffsetMm = 75;
    wall.referenceLine = 'layer-end';
    wall = applyWallOperation(
      wall,
      {
        type: 'HostOpening',
        wallId: wall.id,
        opening: {
          id: 'o:1',
          hostId: wall.id,
          segmentId: wall.segments[0]!.id,
          widthMm: 1000,
          heightMm: 1200,
          sillMm: 900,
          placement: { kind: 'fixed-jamb', anchor: 'start', distanceMm: 600 },
        },
      },
      'h',
    );
    const before = deriveWall(wall),
      reversed = applyWallOperation(wall, { type: 'ReverseWall', wallId: wall.id }, 'h');
    const after = deriveWall(reversed);
    const sortPoints = (xs: number[][]) => xs.map((p) => p.join(',')).sort();
    expect(sortPoints(after.plan[0]!.points)).toEqual(sortPoints(before.plan[0]!.points));
    expect(after.elevation[0]!.opening!.leftMm).toBe(2400);
    expect(reversed.openings[0]!.id).toBe('o:1');
    expect(reversed.openings[0]!.placement).toEqual({
      kind: 'fixed-jamb',
      anchor: 'end',
      distanceMm: 600,
    });
    expect(after.quantities).toEqual(before.quantities);
  });
  it('deducts a centred opening independently from both layers and generated pieces', () => {
    const fixture = createWallFixture(),
      wall = applyWallOperation(
        fixture,
        {
          type: 'HostOpening',
          wallId: fixture.id,
          opening: {
            id: 'o:1',
            hostId: fixture.id,
            segmentId: fixture.segments[0]!.id,
            widthMm: 1200,
            heightMm: 1200,
            sillMm: 900,
            placement: { kind: 'centred' },
          },
        },
        'h',
      );
    const out = deriveWall(wall);
    // Independent expectation: (4 × 2.7 - 1.2 × 1.2) × thickness in metres.
    expect(out.quantities[0]!.netVolumeM3).toBeCloseTo((4 * 2.7 - 1.2 * 1.2) * 0.14);
    expect(out.quantities[1]!.netVolumeM3).toBeCloseTo((4 * 2.7 - 1.2 * 1.2) * 0.02);
    for (const q of out.quantities)
      expect(
        out.parts.filter((p) => p.layerId === q.layerId).reduce((s, p) => s + p.volumeMm3, 0) / 1e9,
      ).toBeCloseTo(q.netVolumeM3);
    expect(out.elevation[0]!.opening!.leftMm).toBe(1400);
    const longer = applyWallOperation(
      wall,
      { type: 'SetWallParameters', wallId: wall.id, parameters: { terminalLengthMm: 5000 } },
      'h',
    );
    expect(deriveWall(longer).elevation[0]!.opening!.leftMm).toBe(1900);
  });
  it('deducts only the opening intersection with each layer extent', () => {
    const wall = createWallFixture();
    wall.layers[1]!.topMm = 1200;
    wall.openings = [
      {
        id: 'o',
        hostId: wall.id,
        segmentId: wall.segments[0]!.id,
        widthMm: 1200,
        heightMm: 1200,
        sillMm: 900,
        placement: { kind: 'centred' },
      },
    ];
    expect(deriveWall(wall).quantities[1]!.openingDeductionM3).toBeCloseTo(1.2 * 0.3 * 0.02);
  });
  it('keeps fixed-jamb placement when stretching and moves its host without detachment', () => {
    const wall = createWallFixture();
    wall.openings = [
      {
        id: 'o',
        hostId: wall.id,
        segmentId: wall.segments[0]!.id,
        widthMm: 1000,
        heightMm: 1200,
        sillMm: 900,
        placement: { kind: 'fixed-jamb', anchor: 'start', distanceMm: 600 },
      },
    ];
    const stretched = applyWallOperation(
      wall,
      {
        type: 'StretchWall',
        wallId: wall.id,
        segmentId: wall.segments[0]!.id,
        end: 'end',
        point: [5000, 0],
      },
      'h',
    );
    expect(deriveWall(stretched).elevation[0]!.opening!.leftMm).toBe(600);
    const moved = applyWallOperation(
      stretched,
      { type: 'MoveWall', wallId: wall.id, delta: [500, 300] },
      'h',
    );
    expect(moved.openings).toEqual(stretched.openings);
    expect(moved.segments[0]!.start).toEqual([500, 300]);
  });
  it('rejects orphaned, oversized, negative-sill and second hosted openings', () => {
    const wall = createWallFixture();
    const opening = {
      id: 'o',
      hostId: wall.id,
      segmentId: wall.segments[0]!.id,
      widthMm: 1200,
      heightMm: 1200,
      sillMm: 900,
      placement: { kind: 'centred' as const },
    };
    for (const patch of [
      { hostId: 'other' },
      { segmentId: 'missing' },
      { widthMm: 5000 },
      { sillMm: -10 },
      { heightMm: 5000 },
    ]) {
      expect(() =>
        applyWallOperation(
          wall,
          { type: 'HostOpening', wallId: wall.id, opening: { ...opening, ...patch } },
          'h',
        ),
      ).toThrow();
    }
    const hosted = applyWallOperation(wall, { type: 'HostOpening', wallId: wall.id, opening }, 'h');
    expect(() =>
      applyWallOperation(
        hosted,
        { type: 'HostOpening', wallId: wall.id, opening: { ...opening, id: 'second' } },
        'h',
      ),
    ).toThrow(/one opening/);
    expect(
      applyWallOperation(
        hosted,
        { type: 'RemoveOpening', wallId: wall.id, openingId: opening.id },
        'h',
      ).openings,
    ).toEqual([]);
  });
  it('blocks degenerate geometry, self intersections, unpinned systems and inverted layers', () => {
    const wall = createWallFixture();
    expect(() =>
      validateWall({ ...wall, systemRef: { ...wall.systemRef, version: '0.2.0' } }),
    ).toThrow(/migration/);
    expect(() =>
      validateWall({ ...wall, segments: [{ ...wall.segments[0], end: [0, 0] }] }),
    ).toThrow(/Zero-length/);
    expect(() =>
      validateWall({ ...wall, layers: [{ ...wall.layers[0], bottomMm: 3000 }] }),
    ).toThrow(/extents/);
    expect(() =>
      validateWall({
        ...wall,
        segments: [
          { id: 'a', start: [0, 0], end: [100, 100] },
          { id: 'b', start: [100, 100], end: [0, 100] },
          { id: 'c', start: [0, 100], end: [100, 0] },
        ],
      }),
    ).toThrow(/Self-intersecting/);
  });
  it('reconstructs deterministic outputs and changes the source fingerprint after an edit', () => {
    const wall = createWallFixture(),
      reopened = validateWall(JSON.parse(JSON.stringify(wall)));
    expect(deriveWall(reopened)).toEqual(deriveWall(wall));
    const edit = applyWallOperation(
      wall,
      { type: 'SetWallParameters', wallId: wall.id, parameters: { heightMm: 3000 } },
      'h',
    );
    expect(deriveWall(edit).sourceHash).not.toBe(wallSourceHash(wall));
    expect(deriveWall(edit).sourceHash).toBe(wallSourceHash(edit));
  });
});
