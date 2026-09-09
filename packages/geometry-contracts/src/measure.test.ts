import { describe, expect, it } from 'vitest';
import {
  MeasureRequestSchema,
  angleBetweenEdgesDeg,
  angleBetweenFacesDeg,
  boxEdges,
  boxFaces,
  boxFeaturePath,
  boxVertices,
  compareMeasureResults,
  measureBoxFeatures,
  resolveBoxFeature,
} from './measure.js';
import {
  assertSemanticFeaturePath,
  faceAreaFromTriangleIndex,
  snapFaceByHitPoint,
  snapNearestFace,
  snapNearestVertex,
  triangleArea,
} from './measure-mesh.js';

const EXTENTS = { min: [0, -30, -90] as const, max: [1000, 30, 90] as const };
const OWNER = 'component:y:0001';

describe('M1 measure DTOs', () => {
  it('parses angle request with two features', () => {
    const parsed = MeasureRequestSchema.parse({
      kind: 'angle',
      semanticOwner: OWNER,
      features: [
        boxFeaturePath(OWNER, 'edge', 0),
        boxFeaturePath(OWNER, 'edge', 1),
      ],
    });
    expect(parsed.kind).toBe('angle');
    expect(parsed.features).toHaveLength(2);
  });

  it('rejects distance with one feature', () => {
    expect(() =>
      MeasureRequestSchema.parse({
        kind: 'distance',
        semanticOwner: OWNER,
        features: [boxFeaturePath(OWNER, 'vertex', 0)],
      }),
    ).toThrow();
  });
});

describe('M2 box features + angles', () => {
  it('resolves edge lengths and face areas for 1000×60×180 box', () => {
    const edges = boxEdges(OWNER, EXTENTS);
    const lengths = new Set(edges.map((e) => Math.round(e.lengthMm)));
    expect(lengths.has(1000)).toBe(true);
    expect(lengths.has(60)).toBe(true);
    expect(lengths.has(180)).toBe(true);

    const faces = boxFaces(OWNER, EXTENTS);
    const areas = new Set(faces.map((f) => Math.round(f.areaMm2)));
    expect(areas.has(60 * 180)).toBe(true);
    expect(areas.has(1000 * 60)).toBe(true);
    expect(areas.has(1000 * 180)).toBe(true);
  });

  it('adjacent faces are 90°; parallel faces are 0°', () => {
    const faces = boxFaces(OWNER, EXTENTS);
    const px = faces.find((f) => f.key === '+x')!;
    const py = faces.find((f) => f.key === '+y')!;
    const mx = faces.find((f) => f.key === '-x')!;
    expect(angleBetweenFacesDeg(px.normal, py.normal)).toBeCloseTo(90, 6);
    expect(angleBetweenFacesDeg(px.normal, mx.normal)).toBeCloseTo(0, 6);
  });

  it('orthogonal edges are 90°', () => {
    const edges = boxEdges(OWNER, EXTENTS);
    const alongX = edges.find((e) => Math.abs(e.direction[0]) > 0 && e.direction[1] === 0 && e.direction[2] === 0)!;
    const alongY = edges.find((e) => Math.abs(e.direction[1]) > 0 && e.direction[0] === 0 && e.direction[2] === 0)!;
    expect(angleBetweenEdgesDeg(alongX.direction, alongY.direction)).toBeCloseTo(90, 6);
  });

  it('measureBoxFeatures angle face-face', () => {
    const r = measureBoxFeatures(
      'angle',
      [boxFeaturePath(OWNER, 'face', '+x'), boxFeaturePath(OWNER, 'face', '+y')],
      EXTENTS,
    );
    expect(r.unit).toBe('deg');
    expect(r.quantity).toBeCloseTo(90, 6);
  });

  it('resolves 10k features under 25ms budget', () => {
    const path = boxFeaturePath(OWNER, 'edge', 3);
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) resolveBoxFeature(path, EXTENTS);
    expect(performance.now() - t0).toBeLessThan(25);
  });
});

describe('M3 mesh snap', () => {
  it('snaps near corner to vertex path', () => {
    const hit: [number, number, number] = [2, -28, -88];
    const snap = snapNearestVertex(OWNER, EXTENTS, hit);
    expect(snap.path).toBe(boxVertices(OWNER, EXTENTS)[0]!.path);
    assertSemanticFeaturePath(snap.path);
  });

  it('triangle area unit right triangle is 0.5', () => {
    expect(triangleArea([0, 0, 0], [1, 0, 0], [0, 1, 0])).toBeCloseTo(0.5, 9);
    expect(
      faceAreaFromTriangleIndex(
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        [0, 1, 2],
        0,
      ),
    ).toBeCloseTo(0.5, 9);
  });

  it('rejects triangle-index paths', () => {
    expect(() => assertSemanticFeaturePath('tri:12')).toThrow();
  });

  it('face snap uses hit plane (not opposite face via inverted normal)', () => {
    const onPlusX: [number, number, number] = [1000, 0, 0];
    const face = snapFaceByHitPoint(OWNER, EXTENTS, onPlusX);
    expect(face.key).toBe('+x');
    // Inward normal would previously match -x; hit-plane must still win.
    const withInward = snapNearestFace(OWNER, EXTENTS, onPlusX, [-1, 0, 0]);
    expect(withInward.key).toBe('+x');
  });
});

describe('compare tolerances include angle', () => {
  it('marks angle within 0.25°', () => {
    const base = {
      kind: 'angle' as const,
      quantity: 90,
      unit: 'deg' as const,
      provenance: 'brep' as const,
      engine: { layer: 'reference' as const, kernel: 'exact-adapter', label: 'Exact' },
      features: ['a', 'b'],
    };
    const cmp = compareMeasureResults('angle', ['a', 'b'], base, { ...base, quantity: 90.1 });
    expect(cmp.withinTolerance).toBe(true);
    expect(cmp.toleranceUnit).toBe('deg');
  });
});
