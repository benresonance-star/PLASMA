import { describe, expect, it } from 'vitest';
import {
  clearMeasure,
  commitMeasurePick,
  createMeasureToolState,
  formatCompareRow,
  formatMeasureQuantity,
  setMeasureMode,
  setMeasureSnap,
  type MeasurePick,
} from './measure-tool.js';

const edgePick = (id: string, path: string): MeasurePick => ({
  featurePath: path,
  semanticOwner: 'component:y:1',
  engineLayer: 'reference',
  kernel: 'exact-adapter',
  worldPoint: [0, 0, 0],
  snap: 'edge',
  direction: id === 'a' ? [1, 0, 0] : [0, 1, 0],
});

const facePick = (path: string): MeasurePick => ({
  featurePath: path,
  semanticOwner: 'component:y:1',
  engineLayer: 'geometry-service',
  kernel: 'occt-native',
  worldPoint: [0, 0, 0],
  snap: 'face',
  direction: [1, 0, 0],
});

const vertexPick = (path: string): MeasurePick => ({
  featurePath: path,
  semanticOwner: 'component:y:1',
  engineLayer: 'reference',
  kernel: 'exact-adapter',
  worldPoint: [0, 0, 0],
  snap: 'vertex',
});

describe('M12 measure tool state (incl. angle)', () => {
  it('distance needs two vertex picks', () => {
    let s = setMeasureMode(createMeasureToolState(), 'distance');
    const a = commitMeasurePick(s, vertexPick('semantic:component:y:1/box/vertex:0'));
    expect(a.type).toBe('pending');
    s = a.state;
    const b = commitMeasurePick(s, vertexPick('semantic:component:y:1/box/vertex:1'));
    expect(b.type).toBe('complete');
    if (b.type === 'complete') expect(b.features).toHaveLength(2);
  });

  it('clears prior active readout when starting a new distance pick', () => {
    let s = setMeasureMode(createMeasureToolState(), 'distance');
    s = {
      ...s,
      active: {
        kind: 'distance',
        quantity: 784.23,
        unit: 'mm',
        provenance: 'brep',
        engine: { layer: 'reference', kernel: 'exact-adapter', label: 'Exact' },
        features: ['a', 'b'],
      },
      picks: [vertexPick('semantic:component:y:1/box/vertex:0'), vertexPick('semantic:component:y:1/box/vertex:1')],
    };
    const next = commitMeasurePick(s, vertexPick('semantic:component:y:1/box/vertex:2'));
    expect(next.type).toBe('pending');
    expect(next.state.active).toBeNull();
    expect(next.state.compare).toBeNull();
    expect(next.state.picks).toHaveLength(1);
  });

  it('angle needs two edges or two faces; rejects mixed', () => {
    let s = setMeasureMode(createMeasureToolState(), 'angle');
    s = setMeasureSnap(s, 'edge');
    const a = commitMeasurePick(s, edgePick('a', 'semantic:component:y:1/box/edge:0'));
    expect(a.type).toBe('pending');
    s = a.state;
    const mixed = commitMeasurePick(s, facePick('semantic:component:y:1/box/face:+x'));
    expect(mixed.type).toBe('reject');

    s = setMeasureSnap(setMeasureMode(createMeasureToolState(), 'angle'), 'edge');
    const p1 = commitMeasurePick(s, edgePick('a', 'semantic:component:y:1/box/edge:0'));
    const p2 = commitMeasurePick(
      p1.state,
      edgePick('b', 'semantic:component:y:1/box/edge:1'),
    );
    expect(p2.type).toBe('complete');
  });

  it('edge/face complete on one pick; clear resets pending', () => {
    let s = setMeasureMode(createMeasureToolState(), 'edgeLength');
    const done = commitMeasurePick(s, edgePick('a', 'semantic:component:y:1/box/edge:0'));
    expect(done.type).toBe('complete');
    s = setMeasureMode(createMeasureToolState(), 'angle');
    s = commitMeasurePick(s, edgePick('a', 'semantic:component:y:1/box/edge:0')).state;
    expect(s.pending).not.toBeNull();
    s = clearMeasure(s);
    expect(s.pending).toBeNull();
  });

  it('formats angle degrees in compare row', () => {
    const text = formatCompareRow({
      kind: 'angle',
      features: ['a', 'b'],
      exact: {
        kind: 'angle',
        quantity: 90,
        unit: 'deg',
        provenance: 'brep',
        engine: { layer: 'reference', kernel: 'exact-adapter', label: 'Exact' },
        features: ['a', 'b'],
      },
      occt: {
        kind: 'angle',
        quantity: 90.1,
        unit: 'deg',
        provenance: 'brep',
        engine: { layer: 'geometry-service', kernel: 'occt-native', label: 'OCCT' },
        features: ['a', 'b'],
      },
      delta: 0.1,
      tolerance: 0.25,
      toleranceUnit: 'deg',
      withinTolerance: true,
    });
    expect(text).toContain('90.00 deg');
    expect(text).toContain('Δ 0.10 deg');
    expect(formatMeasureQuantity({
      kind: 'angle',
      quantity: 45.5,
      unit: 'deg',
      provenance: 'brep',
      engine: { layer: 'reference', kernel: 'exact-adapter', label: 'Exact' },
      features: [],
    })).toBe('45.50 deg');
  });
});
